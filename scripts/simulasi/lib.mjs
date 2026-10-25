// Fungsi bersama skrip simulasi: panggilan API dan descriptor wajah sintetis (512 dimensi, dinormalisasi).
export const ARC = "human-3.3.6-insightface-efficientnet-b0-aligned-v2";

export const log = (text) =>
  console.log(`[${new Date().toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" })}] ${text}`);

export async function call(base, method, route, { cookie, json } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (json) headers["content-type"] = "application/json";
  const response = await fetch(base + route, { method, headers, body: json ? JSON.stringify(json) : undefined, redirect: "manual" });
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* bukan JSON */ }
  return { status: response.status, text, json: parsed, cookie: (response.headers.get("set-cookie") || "").split(";")[0] };
}

function gaussian() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const normalize = (vector) => {
  const length = Math.hypot(...vector);
  return vector.map((value) => value / length);
};

// Wajah baru (orang berbeda) dan wajah yang sama dipindai ulang (sedikit derau, kemiripan ~0.96).
export const newFace = () => normalize(Array.from({ length: 512 }, gaussian));
export const sameFace = (face) => normalize(face.map((value) => value + gaussian() * 0.012));

// Payload pemindaian seperti yang dikirim FaceCapture setelah instruksi liveness selesai.
export function scanPayload(face, challenge, device) {
  const startedAt = Date.now();
  return {
    templateRole: "canonical-cross-device",
    descriptorEngine: "human-wasm-v1",
    modelVersion: ARC,
    sourceDeviceClass: device,
    embedding: [...face, ...new Array(1024 - face.length).fill(0)],
    challengeToken: challenge?.token,
    evidence: {
      startedAt,
      completedAt: startedAt + 2200,
      completedSteps: challenge?.steps,
      sampleCount: 24,
      averageReal: 0.93,
      averageLive: 0.91
    }
  };
}
