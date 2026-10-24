"use client";

import { useEffect, useRef, useState } from "react";
import type Human from "@vladmandic/human";
import type { Config, GraphModel } from "@vladmandic/human";
import LoadingButton from "@/components/LoadingButton";
import { arcFaceEmbedding, averageArcFaceEmbedding, loadArcFaceModel } from "@/lib/face-arcface";
import {
  FACE_MODEL_VERSION,
  expectedEngineForRole,
  type FaceCapturePayload,
  type FaceChallengeMode,
  type FaceChallengeResponse,
  type FaceChallengeStep,
  type FaceDeviceClass,
  type FaceModelVersion,
  type FaceTemplateRole
} from "@/lib/face-types";

const MIN_QUALITY_SCORE = 0.5;
const MAX_CENTER_DESCRIPTOR_SAMPLES = 15;
// Challenge diminta bersamaan dengan kamera/model; diminta ulang bila persiapan terlalu lama.
const CHALLENGE_REFRESH_AFTER_MS = 30_000;

function medianDescriptor(samples: number[][], minimumSamples: number) {
  if (samples.length < minimumSamples) return null;
  return Array.from({ length: 1024 }, (_, index) => {
    const values = samples.map((sample) => sample[index]).sort((first, second) => first - second);
    const middle = Math.floor(values.length / 2);
    return values.length % 2 === 0
      ? (values[middle - 1] + values[middle]) / 2
      : values[middle];
  });
}

// Potong tengah persegi (sama dengan pratinjau) sebelum di-resize 480x480 oleh Human,
// agar wajah tidak gepeng pada kamera non-persegi. Kamera persegi menghasilkan frame identik.
function centerSquareFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const { videoWidth: width, videoHeight: height } = video;
  const size = Math.min(width, height);
  if (canvas.width !== size || canvas.height !== size) {
    canvas.width = size;
    canvas.height = size;
  }
  canvas.getContext("2d")?.drawImage(
    video,
    Math.floor((width - size) / 2),
    Math.floor((height - size) / 2),
    size,
    size,
    0,
    0,
    size,
    size
  );
  return canvas;
}

const stepLabels: Record<FaceChallengeStep, string> = {
  blink: "Kedipkan kedua mata satu kali",
  "turn-left": "Tengokkan wajah ke kiri",
  "turn-right": "Tengokkan wajah ke kanan",
  center: "Kembali menghadap lurus ke kamera"
};

function buildModelConfig(templateRole: FaceTemplateRole, deviceClass: FaceDeviceClass, legacyDescriptor: boolean): Partial<Config> {
  const mobile = deviceClass === "mobile";
  const wasmProfile = templateRole !== "desktop-primary";
  return {
    backend: templateRole === "desktop-primary" ? "webgl" : "wasm",
    modelBasePath: "/models/human/",
    wasmPath: "/wasm/",
    cacheModels: true,
    validateModels: false,
    async: false,
    warmup: "none",
    cacheSensitivity: 0,
    filter: {
      enabled: true,
      equalization: true,
      flip: false,
      // Semua profil WASM memakai preprocessing identik 480x480.
      // Canonical karena itu dapat dibandingkan lintas perangkat.
      width: wasmProfile ? 480 : 0,
      height: wasmProfile ? 480 : 0
    },
    face: {
      enabled: true,
      detector: {
        rotation: true,
        maxDetected: 2,
        minConfidence: mobile ? 0.45 : 0.5,
        minSize: mobile ? 90 : 120,
        skipFrames: 0,
        skipTime: 0
      },
      mesh: { enabled: true },
      iris: { enabled: true },
      // faceres hanya dimuat untuk template lama; template baru memakai ArcFace.
      description: { enabled: legacyDescriptor, skipFrames: 0, skipTime: 0 },
      emotion: { enabled: false },
      antispoof: { enabled: true, skipFrames: 0, skipTime: 0 },
      liveness: { enabled: true, skipFrames: 0, skipTime: 0 }
    },
    body: { enabled: false },
    hand: { enabled: false },
    object: { enabled: false },
    gesture: { enabled: true }
  };
}

type FaceModels = { human: Human; arcface: GraphModel | null };

let humanCache: { key: string; promise: Promise<FaceModels> } | null = null;
let pendingDetection: Promise<unknown> = Promise.resolve();

// Satu instance Human per profil dipakai ulang, sehingga pindai ulang tidak memuat model lagi.
function loadHuman(templateRole: FaceTemplateRole, deviceClass: FaceDeviceClass, modelVersion: FaceModelVersion) {
  const key = `${templateRole}:${deviceClass}:${modelVersion}`;
  if (humanCache?.key === key) return humanCache.promise;

  const legacyDescriptor = modelVersion === FACE_MODEL_VERSION;
  const promise = (async () => {
    const humanModule = await import("@vladmandic/human");
    const human = new humanModule.default(buildModelConfig(templateRole, deviceClass, legacyDescriptor));
    await human.init();
    const [arcface] = await Promise.all([
      legacyDescriptor ? null : loadArcFaceModel(human),
      human.load()
    ]);

    const requiredModels = ["blazeface", "facemesh", "iris", "antispoof", "liveness", ...(legacyDescriptor ? ["faceres"] : [])];
    const unavailableModels = requiredModels.filter((name) => {
      const model = human.models.models[name];
      try {
        return !model?.inputs?.length;
      } catch {
        return true;
      }
    });
    if (unavailableModels.length > 0) {
      throw new Error("Model verifikasi wajah belum termuat lengkap. Muat ulang halaman lalu coba kembali.");
    }
    return { human, arcface };
  })();
  humanCache = { key, promise };
  promise.catch(() => {
    if (humanCache?.promise === promise) humanCache = null;
  });
  return promise;
}

export function preloadFaceModels(templateRole: FaceTemplateRole, deviceClass: FaceDeviceClass, modelVersion: FaceModelVersion) {
  loadHuman(templateRole, deviceClass, modelVersion).catch(() => undefined);
}

type Phase = "idle" | "loading" | "scanning" | "processing" | "complete" | "error";

export default function FaceCapture({
  mode,
  templateRole,
  modelVersion,
  deviceClass,
  onComplete,
  onReset,
  compact = false
}: {
  mode: FaceChallengeMode;
  templateRole: FaceTemplateRole;
  modelVersion: FaceModelVersion;
  deviceClass: FaceDeviceClass;
  onComplete: (payload: FaceCapturePayload) => void | Promise<void>;
  onReset?: () => void;
  compact?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runIdRef = useRef(0);
  const stepIndexRef = useRef(0);
  const holdStartRef = useRef(0);
  const blinkClosedRef = useRef(false);
  const completedStepsRef = useRef<FaceChallengeStep[]>([]);
  const scoresRef = useRef({ real: 0, live: 0, count: 0 });
  const centerDescriptorsRef = useRef<number[][]>([]);

  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("Kamera hanya aktif saat proses verifikasi berlangsung.");
  const [error, setError] = useState("");
  const [steps, setSteps] = useState<FaceChallengeStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);

  const descriptorEngine = expectedEngineForRole(templateRole);
  const legacyDescriptor = modelVersion === FACE_MODEL_VERSION;
  const mobile = deviceClass === "mobile";
  const holdDurationMs = mobile ? 850 : 650;
  const minimumDescriptorSamples = templateRole === "desktop-primary" ? 3 : 5;
  const minimumFaceSize = mobile ? 90 : 120;

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  function resetRun() {
    runIdRef.current += 1;
    stopCamera();
    stepIndexRef.current = 0;
    holdStartRef.current = 0;
    blinkClosedRef.current = false;
    completedStepsRef.current = [];
    scoresRef.current = { real: 0, live: 0, count: 0 };
    centerDescriptorsRef.current = [];
    setCurrentStep(0);
  }

  useEffect(() => () => {
    runIdRef.current += 1;
    stopCamera();
  }, []);

  useEffect(() => {
    preloadFaceModels(templateRole, deviceClass, modelVersion);
  }, [templateRole, deviceClass, modelVersion]);

  async function start() {
    onReset?.();
    resetRun();
    const runId = runIdRef.current;
    setPhase("loading");
    setError("");
    setMessage(mobile ? "Menyiapkan kamera HP dan model biometrik…" : "Menyiapkan model biometrik dan kamera…");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Browser ini tidak mendukung akses kamera. Gunakan Chrome, Edge, atau Safari versi terbaru.");
      }

      const cameraRequest = navigator.mediaDevices.getUserMedia({
        video: mobile
          ? {
              facingMode: { ideal: "user" },
              width: { ideal: 480 },
              height: { ideal: 480 },
              frameRate: { ideal: 15, max: 24 }
            }
          : {
              facingMode: "user",
              width: { ideal: 720 },
              height: { ideal: 720 },
              frameRate: { ideal: 24, max: 30 }
            },
        audio: false
      }).then((stream) => {
        if (runId === runIdRef.current) streamRef.current = stream;
        else stream.getTracks().forEach((track) => track.stop());
        return stream;
      });

      const query = new URLSearchParams({
        mode,
        templateRole,
        descriptorEngine,
        modelVersion,
        sourceDeviceClass: deviceClass
      });
      const requestChallenge = () => fetch(`/api/face/challenge?${query.toString()}`, {
        credentials: "same-origin",
        cache: "no-store"
      }).then(async (response) => {
        const data = await response.json() as FaceChallengeResponse & { message?: string };
        if (!response.ok) throw new Error(data.message || "Sesi verifikasi wajah tidak dapat dibuat.");
        return data;
      });

      const challengeRequestedAt = Date.now();
      const [stream, { human, arcface }, firstChallenge] = await Promise.all([
        cameraRequest,
        loadHuman(templateRole, deviceClass, modelVersion),
        requestChallenge()
      ]);
      const challenge = Date.now() - challengeRequestedAt > CHALLENGE_REFRESH_AFTER_MS
        ? await requestChallenge()
        : firstChallenge;
      if (runId !== runIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const video = videoRef.current;
      if (!video) throw new Error("Elemen kamera tidak tersedia.");
      video.srcObject = stream;
      await video.play();

      setSteps(challenge.steps);
      setPhase("scanning");
      setMessage(stepLabels[challenge.steps[0]]);
      const startedAt = Date.now();

      const squareCanvas = templateRole === "canonical-cross-device" ? document.createElement("canvas") : null;
      await pendingDetection.catch(() => undefined);
      while (runId === runIdRef.current && stepIndexRef.current < challenge.steps.length) {
        if (!video.videoWidth || !video.videoHeight) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          continue;
        }
        const step = challenge.steps[stepIndexRef.current];
        const input = squareCanvas ? centerSquareFrame(video, squareCanvas) : video;
        // Descriptor (faceres) hanya dibutuhkan saat menghadap lurus; langkah lain dilewati agar frame lebih cepat.
        const detection = human.detect(input, { face: { description: { enabled: legacyDescriptor && step === "center" } } });
        pendingDetection = detection;
        const result = await detection;
        if (runId !== runIdRef.current) return;

        if (result.face.length !== 1) {
          holdStartRef.current = 0;
          setMessage(result.face.length > 1 ? "Pastikan hanya satu wajah terlihat." : "Posisikan wajah di dalam bingkai kamera.");
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          continue;
        }

        const face = result.face[0];
        const confidence = face.faceScore || face.boxScore || 0;
        const real = face.real ?? 0;
        const live = face.live ?? 0;
        const faceSize = Math.min(face.box[2], face.box[3]);
        if (confidence < MIN_QUALITY_SCORE || real < MIN_QUALITY_SCORE || live < MIN_QUALITY_SCORE || faceSize < minimumFaceSize) {
          holdStartRef.current = 0;
          setMessage("Dekatkan wajah, gunakan cahaya cukup, dan jangan gunakan foto atau rekaman.");
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          continue;
        }

        scoresRef.current.real += real;
        scoresRef.current.live += live;
        scoresRef.current.count += 1;

        const gestures = result.gesture
          .filter((item) => "face" in item)
          .map((item) => item.gesture);
        let completed = false;
        let waitingForStableSamples = false;

        if (step === "blink") {
          const eyesClosed = gestures.includes("blink left eye") || gestures.includes("blink right eye");
          if (eyesClosed) blinkClosedRef.current = true;
          completed = blinkClosedRef.current && !eyesClosed;
        } else {
          const yaw = face.rotation?.angle.yaw ?? 0;
          const condition = step === "turn-left"
            ? gestures.includes("facing left") || yaw > 0.25
            : step === "turn-right"
              ? gestures.includes("facing right") || yaw < -0.25
              : gestures.includes("facing center") || Math.abs(yaw) < (mobile ? 0.18 : 0.16);
          if (condition) {
            const sample = step !== "center"
              ? null
              : arcface && squareCanvas
                ? await arcFaceEmbedding(human, arcface, squareCanvas, face.meshRaw)
                : face.embedding?.length === 1024 ? [...face.embedding] : null;
            if (runId !== runIdRef.current) return;
            if (sample) {
              centerDescriptorsRef.current.push(sample);
              if (centerDescriptorsRef.current.length > MAX_CENTER_DESCRIPTOR_SAMPLES) {
                centerDescriptorsRef.current.shift();
              }
            }
            if (!holdStartRef.current) holdStartRef.current = Date.now();
            const holdComplete = Date.now() - holdStartRef.current >= holdDurationMs;
            waitingForStableSamples = step === "center"
              && centerDescriptorsRef.current.length < minimumDescriptorSamples;
            completed = holdComplete && !waitingForStableSamples;
          } else {
            holdStartRef.current = 0;
            if (step === "center") centerDescriptorsRef.current = [];
          }
        }

        if (completed) {
          completedStepsRef.current.push(step);
          stepIndexRef.current += 1;
          holdStartRef.current = 0;
          blinkClosedRef.current = false;
          setCurrentStep(stepIndexRef.current);
          if (stepIndexRef.current < challenge.steps.length) {
            setMessage(stepLabels[challenge.steps[stepIndexRef.current]]);
          }
        } else {
          setMessage(waitingForStableSamples
            ? `Tetap tatap lurus dan diam sebentar (${centerDescriptorsRef.current.length}/${minimumDescriptorSamples} sampel stabil).`
            : stepLabels[step]);
        }
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }

      const embedding = legacyDescriptor
        ? medianDescriptor(centerDescriptorsRef.current, minimumDescriptorSamples)
        : averageArcFaceEmbedding(centerDescriptorsRef.current, minimumDescriptorSamples);
      const score = scoresRef.current;
      if (!embedding || score.count < challenge.steps.length) {
        throw new Error("Descriptor wajah belum stabil. Tatap kamera tanpa bergerak sesaat, lalu ulangi pemindaian.");
      }

      stopCamera();
      setPhase("processing");
      setMessage("Memvalidasi hasil pemindaian…");
      await onComplete({
        templateRole,
        descriptorEngine,
        modelVersion,
        sourceDeviceClass: deviceClass,
        embedding,
        challengeToken: challenge.token,
        evidence: {
          startedAt,
          completedAt: Date.now(),
          completedSteps: completedStepsRef.current,
          sampleCount: score.count,
          averageReal: score.real / score.count,
          averageLive: score.live / score.count
        }
      });
      if (runId === runIdRef.current) {
        setPhase("complete");
        setMessage(mode === "register" ? "Data wajah siap disertakan dalam pendaftaran." : "Verifikasi wajah berhasil.");
      }
    } catch (caught) {
      if (runId !== runIdRef.current) return;
      // Kamera yang baru tersedia setelah kegagalan langsung dimatikan.
      runIdRef.current += 1;
      stopCamera();
      setPhase("error");
      const cameraError = caught instanceof DOMException && (caught.name === "NotAllowedError" || caught.name === "PermissionDeniedError");
      setError(cameraError
        ? "Izin kamera ditolak. Izinkan akses kamera pada pengaturan browser lalu coba lagi."
        : caught instanceof Error ? caught.message : "Pemindaian wajah gagal.");
    }
  }

  const active = phase === "loading" || phase === "scanning" || phase === "processing";

  return (
    <section className={`face-capture ${compact ? "face-capture-compact" : ""}`}>
      <div className="face-camera">
        <video ref={videoRef} muted playsInline aria-label="Pratinjau kamera verifikasi wajah" />
        <div className="face-oval" aria-hidden="true" />
        {phase !== "scanning" && (
          <div className="face-camera-placeholder">
            <i className={`bx ${phase === "complete" ? "bx-check-shield" : "bx-scan"}`} />
          </div>
        )}
      </div>

      <div className="face-capture-info">
        <div className="face-progress" aria-label="Kemajuan pemeriksaan liveness">
          {(steps.length ? steps : ["blink", "turn-left", "turn-right", "center"]).map((step, index) => (
            <span key={`${step}-${index}`} className={index < currentStep || phase === "complete" ? "done" : index === currentStep && phase === "scanning" ? "active" : ""}>
              {index < currentStep || phase === "complete" ? <i className="bx bx-check" /> : index + 1}
            </span>
          ))}
        </div>
        <strong>{phase === "idle" ? "Verifikasi liveness dan kecocokan wajah" : message}</strong>
        <p>Pastikan hanya satu wajah terlihat, lepaskan masker atau kacamata gelap, dan gunakan pencahayaan dari arah depan.</p>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}
        {phase === "complete" && <div className="alert alert-success" role="status">{message}</div>}
        <div className="face-actions">
          <LoadingButton busy={active} type="button" className="app-btn app-btn-primary" onClick={start}>
            <i className="bx bx-camera" /> {phase === "idle" ? "Mulai Pemindaian" : phase === "complete" ? "Pindai Ulang" : "Coba Lagi"}
          </LoadingButton>
          {active && phase !== "processing" && (
            <button type="button" className="app-btn app-btn-soft" onClick={() => { onReset?.(); resetRun(); setPhase("idle"); setMessage("Kamera hanya aktif saat proses verifikasi berlangsung."); }}>
              Batal
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
