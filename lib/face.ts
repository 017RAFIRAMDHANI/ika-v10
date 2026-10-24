import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual
} from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import {
  ARCFACE_DESCRIPTOR_LENGTH,
  FACE_ARCFACE_MODEL_VERSION,
  FACE_CHALLENGE_STEPS,
  FACE_MODEL_VERSIONS,
  expectedEngineForRole,
  isSupportedFaceProfile,
  type FaceChallengeMode,
  type FaceDescriptorEngine,
  type FaceDeviceClass,
  type FaceChallengeStep,
  type FaceEvidence,
  type FaceModelVersion,
  type FaceTemplateRole
} from "@/lib/face-types";

const FACE_DESCRIPTOR_LENGTH = 1024;
const CHALLENGE_AGE_MS = 2 * 60 * 1000;
const MIN_LIVENESS_SCORE = 0.5;
const configuredMatchThreshold = Number(process.env.FACE_MATCH_THRESHOLD);
export const FACE_MATCH_THRESHOLD = Number.isFinite(configuredMatchThreshold)
  && configuredMatchThreshold >= 0.65
  && configuredMatchThreshold <= 0.9
  ? configuredMatchThreshold
  : 0.68;
// Ambang cosine ArcFace hasil kalibrasi lintas perangkat (lihat VERIFIKASI-WAJAH.md).
const configuredArcFaceThreshold = Number(process.env.FACE_ARCFACE_MATCH_THRESHOLD);
export const FACE_ARCFACE_MATCH_THRESHOLD = Number.isFinite(configuredArcFaceThreshold)
  && configuredArcFaceThreshold >= 0.4
  && configuredArcFaceThreshold <= 0.9
  ? configuredArcFaceThreshold
  : 0.42;

type ChallengePayload = {
  mode: FaceChallengeMode;
  userId: number | null;
  templateRole: FaceTemplateRole;
  descriptorEngine: FaceDescriptorEngine;
  modelVersion: FaceModelVersion;
  sourceDeviceClass: FaceDeviceClass;
  steps: FaceChallengeStep[];
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

function dataSecret() {
  const value = process.env.FACE_DATA_SECRET;
  if (!value || value.length < 32) {
    throw new Error("FACE_DATA_SECRET minimal 32 karakter dan wajib dikonfigurasi.");
  }
  return value;
}

function encryptionKey() {
  return createHash("sha256").update(dataSecret()).digest();
}

function signChallenge(encodedPayload: string) {
  return createHmac("sha256", encryptionKey()).update(encodedPayload).digest("base64url");
}

function shuffledChallengeSteps(): FaceChallengeStep[] {
  const activeSteps: FaceChallengeStep[] = ["blink", "turn-left", "turn-right"];
  for (let index = activeSteps.length - 1; index > 0; index -= 1) {
    const swapWith = randomInt(index + 1);
    [activeSteps[index], activeSteps[swapWith]] = [activeSteps[swapWith], activeSteps[index]];
  }
  return [...activeSteps, "center"];
}

export function createFaceChallenge(input: {
  mode: FaceChallengeMode;
  userId: number | null;
  templateRole: FaceTemplateRole;
  descriptorEngine: FaceDescriptorEngine;
  modelVersion: FaceModelVersion;
  sourceDeviceClass: FaceDeviceClass;
}) {
  if (expectedEngineForRole(input.templateRole) !== input.descriptorEngine) {
    throw new Error("Peran template dan engine descriptor tidak sesuai.");
  }
  const issuedAt = Date.now();
  const payload: ChallengePayload = {
    ...input,
    steps: shuffledChallengeSteps(),
    issuedAt,
    expiresAt: issuedAt + CHALLENGE_AGE_MS,
    nonce: randomBytes(18).toString("base64url")
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    token: `${encoded}.${signChallenge(encoded)}`,
    steps: payload.steps,
    expiresAt: payload.expiresAt
  };
}

function decodeChallenge(token: string): ChallengePayload | null {
  const [encoded, suppliedSignature] = token.split(".");
  if (!encoded || !suppliedSignature) return null;
  const expected = Buffer.from(signChallenge(encoded));
  const supplied = Buffer.from(suppliedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ChallengePayload;
    const validSteps = Array.isArray(payload.steps)
      && payload.steps.length === FACE_CHALLENGE_STEPS.length
      && payload.steps.every((step) => FACE_CHALLENGE_STEPS.includes(step));
    const validProfile = expectedEngineForRole(payload.templateRole) === payload.descriptorEngine
      && FACE_MODEL_VERSIONS.includes(payload.modelVersion)
      && isSupportedFaceProfile(payload.templateRole, payload.modelVersion)
      && ["desktop", "mobile"].includes(payload.sourceDeviceClass);
    if (!validSteps || !validProfile || typeof payload.expiresAt !== "number" || typeof payload.issuedAt !== "number") return null;
    return payload;
  } catch {
    return null;
  }
}

export function validateFaceEvidence(input: {
  token: string;
  evidence: FaceEvidence;
  mode: FaceChallengeMode;
  userId: number | null;
  templateRole: FaceTemplateRole;
  descriptorEngine: FaceDescriptorEngine;
  modelVersion: FaceModelVersion;
  sourceDeviceClass: FaceDeviceClass;
}) {
  const challenge = decodeChallenge(input.token);
  if (!challenge || challenge.expiresAt < Date.now()) {
    return { valid: false, message: "Sesi verifikasi wajah kedaluwarsa. Ulangi pemindaian." } as const;
  }
  if (
    challenge.mode !== input.mode
    || challenge.userId !== input.userId
    || challenge.templateRole !== input.templateRole
    || challenge.descriptorEngine !== input.descriptorEngine
    || challenge.modelVersion !== input.modelVersion
    || challenge.sourceDeviceClass !== input.sourceDeviceClass
  ) {
    return { valid: false, message: "Sesi verifikasi wajah tidak sesuai." } as const;
  }

  const evidence = input.evidence;
  const duration = evidence.completedAt - evidence.startedAt;
  const sameSteps = Array.isArray(evidence.completedSteps)
    && evidence.completedSteps.join("|") === challenge.steps.join("|");
  const validTimeline = evidence.startedAt >= challenge.issuedAt - 5000
    && evidence.completedAt <= challenge.expiresAt + 5000
    && duration >= 1000
    && duration <= CHALLENGE_AGE_MS;
  const validScores = Number.isFinite(evidence.averageReal)
    && Number.isFinite(evidence.averageLive)
    && evidence.averageReal >= MIN_LIVENESS_SCORE
    && evidence.averageLive >= MIN_LIVENESS_SCORE;
  const validSamples = Number.isInteger(evidence.sampleCount)
    && evidence.sampleCount >= FACE_CHALLENGE_STEPS.length
    && evidence.sampleCount <= 2000;

  if (!sameSteps || !validTimeline || !validScores || !validSamples) {
    return { valid: false, message: "Bukti liveness wajah tidak memenuhi persyaratan. Ulangi pemindaian." } as const;
  }
  return { valid: true, challenge } as const;
}

export function normalizeFaceDescriptor(value: unknown, modelVersion?: FaceModelVersion) {
  if (!Array.isArray(value) || value.length !== FACE_DESCRIPTOR_LENGTH) return null;
  const descriptor = value.map(Number);
  if (descriptor.some((item) => !Number.isFinite(item) || Math.abs(item) > 10)) return null;
  if (modelVersion === FACE_ARCFACE_MODEL_VERSION) {
    // Embedding ArcFace dinormalisasi L2 dan disimpan di slot 1024 (sisa nol),
    // sehingga kolom descriptor_length=1024 tetap valid tanpa migrasi database.
    const tail = descriptor.slice(ARCFACE_DESCRIPTOR_LENGTH);
    const norm = Math.hypot(...descriptor.slice(0, ARCFACE_DESCRIPTOR_LENGTH));
    if (tail.some((item) => item !== 0) || norm < 0.98 || norm > 1.02) return null;
  }
  return descriptor.map((item) => Math.round(item * 1_000_000) / 1_000_000);
}

export function encryptFaceDescriptor(descriptor: number[]) {
  const normalized = normalizeFaceDescriptor(descriptor);
  if (!normalized) throw new Error("Descriptor wajah tidak valid.");
  const floatData = new Float32Array(normalized);
  const compressed = deflateRawSync(Buffer.from(floatData.buffer));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(compressed),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return `v2.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptFaceDescriptor(value: string) {
  const [version, ivValue, tagValue, encryptedValue] = value.split(".");
  if (!(["v1", "v2"].includes(version)) || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Format data wajah terenkripsi tidak dikenali.");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final()
    ]);
    const rawDescriptor = version === "v2"
      ? (() => {
        const inflated = inflateRawSync(decrypted);
        if (inflated.byteLength !== FACE_DESCRIPTOR_LENGTH * Float32Array.BYTES_PER_ELEMENT) {
          throw new Error("Descriptor wajah tidak valid.");
        }
        return Array.from(new Float32Array(
          inflated.buffer.slice(inflated.byteOffset, inflated.byteOffset + inflated.byteLength)
        ));
      })()
      : JSON.parse(decrypted.toString("utf8"));
    const descriptor = normalizeFaceDescriptor(rawDescriptor);
    if (!descriptor) throw new Error("Descriptor wajah tidak valid.");
    return descriptor;
  } catch (error) {
    if (error instanceof Error && error.message === "Descriptor wajah tidak valid.") throw error;
    throw new Error("Data wajah tidak dapat dibuka. Pastikan FACE_DATA_SECRET sama dengan sistem asal.");
  }
}

export function faceMatchThreshold(modelVersion: FaceModelVersion) {
  return modelVersion === FACE_ARCFACE_MODEL_VERSION ? FACE_ARCFACE_MATCH_THRESHOLD : FACE_MATCH_THRESHOLD;
}

export function faceSimilarity(first: number[], second: number[], modelVersion: FaceModelVersion) {
  if (first.length !== second.length || first.length !== FACE_DESCRIPTOR_LENGTH) return 0;
  if (modelVersion === FACE_ARCFACE_MODEL_VERSION) {
    let dot = 0;
    let firstNorm = 0;
    let secondNorm = 0;
    for (let index = 0; index < ARCFACE_DESCRIPTOR_LENGTH; index += 1) {
      dot += first[index] * second[index];
      firstNorm += first[index] * first[index];
      secondNorm += second[index] * second[index];
    }
    if (!firstNorm || !secondNorm) return 0;
    return Math.round(1000 * dot / Math.sqrt(firstNorm * secondNorm)) / 1000;
  }
  let sum = 0;
  for (let index = 0; index < first.length; index += 1) {
    const difference = first[index] - second[index];
    sum += difference * difference;
  }
  const distance = Math.round(100 * 25 * sum) / 100;
  if (distance === 0) return 1;
  const normalized = (1 - Math.sqrt(distance) / 100 - 0.2) / 0.6;
  return Math.round(100 * Math.max(Math.min(normalized, 1), 0)) / 100;
}
