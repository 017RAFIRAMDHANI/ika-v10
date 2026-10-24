export const FACE_CHALLENGE_STEPS = ["blink", "turn-left", "turn-right", "center"] as const;

export const FACE_TEMPLATE_ROLES = ["desktop-primary", "mobile-primary", "canonical-cross-device"] as const;
export const FACE_DESCRIPTOR_ENGINES = ["human-webgl-v1", "human-wasm-v1"] as const;
export const FACE_DEVICE_CLASSES = ["desktop", "mobile"] as const;
// Versi lama (faceres): tetap dipakai untuk memverifikasi template yang sudah terdaftar.
export const FACE_MODEL_VERSION = "human-3.3.6-faceres-1024-v1" as const;
// Versi baru: ArcFace pada wajah yang diluruskan 5 titik. Semua template baru memakai versi ini.
export const ARCFACE_MODEL_NAME = "insightface-efficientnet-b0";
export const ARCFACE_DESCRIPTOR_LENGTH = 512;
export const FACE_ARCFACE_MODEL_VERSION = "human-3.3.6-insightface-efficientnet-b0-aligned-v2" as const;
export const FACE_MODEL_VERSIONS = [FACE_MODEL_VERSION, FACE_ARCFACE_MODEL_VERSION] as const;

export type FaceModelVersion = (typeof FACE_MODEL_VERSIONS)[number];

export type FaceChallengeStep = (typeof FACE_CHALLENGE_STEPS)[number];

export type FaceChallengeMode = "register" | "enroll" | "verify";

export type FaceTemplateRole = (typeof FACE_TEMPLATE_ROLES)[number];

export type FaceDescriptorEngine = (typeof FACE_DESCRIPTOR_ENGINES)[number];

export type FaceDeviceClass = (typeof FACE_DEVICE_CLASSES)[number];

export type FaceEvidence = {
  startedAt: number;
  completedAt: number;
  completedSteps: FaceChallengeStep[];
  sampleCount: number;
  averageReal: number;
  averageLive: number;
};

export type FaceCapturePayload = {
  templateRole: FaceTemplateRole;
  descriptorEngine: FaceDescriptorEngine;
  modelVersion: FaceModelVersion;
  sourceDeviceClass: FaceDeviceClass;
  embedding: number[];
  challengeToken: string;
  evidence: FaceEvidence;
};

export type FaceChallengeResponse = {
  ok: true;
  token: string;
  steps: FaceChallengeStep[];
  expiresAt: number;
};

export function expectedEngineForRole(role: FaceTemplateRole): FaceDescriptorEngine {
  return role === "desktop-primary" ? "human-webgl-v1" : "human-wasm-v1";
}

// ArcFace hanya untuk template lintas perangkat; template primary lama tetap faceres.
export function isSupportedFaceProfile(role: FaceTemplateRole, modelVersion: FaceModelVersion) {
  return modelVersion === FACE_MODEL_VERSION || role === "canonical-cross-device";
}
