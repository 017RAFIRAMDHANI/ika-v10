import type Human from "@vladmandic/human";
import type { GraphModel } from "@vladmandic/human";
import { ARCFACE_DESCRIPTOR_LENGTH, ARCFACE_MODEL_NAME } from "@/lib/face-types";

type Point = [number, number];

// Ukuran frame yang diproses Human pada profil canonical (filter 480x480).
const PROCESS_SIZE = 480;
const ARCFACE_SIZE = 112;
// Wajah diluruskan ke 224px lalu dirata-rata 2x2 menjadi 112px untuk mengurangi aliasing.
const SUPERSAMPLE = 2;
// Posisi baku ArcFace 112x112: mata kiri-gambar, mata kanan-gambar, ujung hidung, sudut bibir kiri, kanan.
const ARCFACE_REFERENCE: Point[] = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041]
];

// Indeks face mesh MediaPipe: tengah mata dari kedua sudutnya, ujung hidung, sudut bibir.
export function faceLandmarks5(mesh: Point[]): Point[] {
  const middle = (first: number, second: number): Point => [
    (mesh[first][0] + mesh[second][0]) / 2,
    (mesh[first][1] + mesh[second][1]) / 2
  ];
  return [middle(33, 133), middle(263, 362), mesh[1], mesh[61], mesh[291]];
}

// Transformasi similarity (rotasi, skala seragam, translasi) least-squares dari source ke target.
export function similarityTransform(source: Point[], target: Point[]) {
  const count = source.length;
  const mean = (points: Point[], axis: 0 | 1) => points.reduce((sum, point) => sum + point[axis], 0) / count;
  const sourceX = mean(source, 0);
  const sourceY = mean(source, 1);
  const targetX = mean(target, 0);
  const targetY = mean(target, 1);
  let dot = 0;
  let cross = 0;
  let norm = 0;
  for (let index = 0; index < count; index += 1) {
    const sx = source[index][0] - sourceX;
    const sy = source[index][1] - sourceY;
    const tx = target[index][0] - targetX;
    const ty = target[index][1] - targetY;
    dot += sx * tx + sy * ty;
    cross += sx * ty - sy * tx;
    norm += sx * sx + sy * sy;
  }
  const a = dot / norm;
  const b = cross / norm;
  return { a, b, tx: targetX - (a * sourceX - b * sourceY), ty: targetY - (b * sourceX + a * sourceY) };
}

// Parameter tf.image.transform memetakan titik output ke titik input, jadi dipakai transformasi balik.
export function inverseTransformParams({ a, b, tx, ty }: ReturnType<typeof similarityTransform>) {
  const determinant = a * a + b * b;
  return [a / determinant, b / determinant, -(a * tx + b * ty) / determinant, -b / determinant, a / determinant, (b * tx - a * ty) / determinant, 0, 0];
}

export function normalizeVector(vector: number[]) {
  const norm = Math.hypot(...vector);
  return norm > 0 ? vector.map((value) => value / norm) : vector;
}

// Rata-rata embedding beberapa frame, dinormalisasi, lalu ditempatkan di slot descriptor 1024.
export function averageArcFaceEmbedding(samples: number[][], minimumSamples: number) {
  if (samples.length < minimumSamples) return null;
  const sum = new Array<number>(ARCFACE_DESCRIPTOR_LENGTH).fill(0);
  for (const sample of samples) {
    for (let index = 0; index < ARCFACE_DESCRIPTOR_LENGTH; index += 1) sum[index] += sample[index];
  }
  const average = normalizeVector(sum);
  return [...average, ...new Array<number>(1024 - ARCFACE_DESCRIPTOR_LENGTH).fill(0)];
}

export async function loadArcFaceModel(human: Human): Promise<GraphModel> {
  const tf = human.tf;
  const cacheUrl = `indexeddb://ika-${ARCFACE_MODEL_NAME}`;
  try {
    return await tf.loadGraphModel(cacheUrl);
  } catch {
    // Belum tersimpan di cache browser; unduh dari server.
  }
  const model = await tf.loadGraphModel(`/models/human/${ARCFACE_MODEL_NAME}.json`);
  model.save(cacheUrl).catch(() => undefined);
  return model;
}

export async function arcFaceEmbedding(human: Human, model: GraphModel, frame: HTMLCanvasElement, meshRaw: Array<[number, number, number?]>) {
  const tf = human.tf;
  const mesh = meshRaw.map(([x, y]) => [x * PROCESS_SIZE, y * PROCESS_SIZE] as Point);
  const { a, b, tx, ty } = similarityTransform(faceLandmarks5(mesh), ARCFACE_REFERENCE);
  const params = inverseTransformParams({ a: a * SUPERSAMPLE, b: b * SUPERSAMPLE, tx: tx * SUPERSAMPLE, ty: ty * SUPERSAMPLE });

  const image = tf.tidy(() => tf.image.resizeBilinear(tf.cast(tf.browser.fromPixels(frame), "float32"), [PROCESS_SIZE, PROCESS_SIZE], false, true));
  const maxTensor = tf.max(image);
  const maxValue = (await maxTensor.data())[0] as number;
  tf.dispose(maxTensor);
  const output = tf.tidy(() => {
    // Equalization identik dengan filter Human: geser minimum tiap kanal lalu regangkan ke 255.
    const factor = 255 / maxValue;
    const equalized = factor > 1
      ? tf.concat(tf.split(image, 3, 2).map((channel: unknown) => tf.mul(tf.sub(channel, tf.min(channel)), factor)), 2)
      : image;
    const size = ARCFACE_SIZE * SUPERSAMPLE;
    const warped = tf.image.transform(tf.expandDims(equalized, 0), tf.tensor2d([params]), "bilinear", "constant", 0, [size, size]);
    // Input model dinormalisasi ke [-1, 1] (hasil uji lebih baik daripada [0, 1]).
    const crop = tf.sub(tf.div(tf.avgPool(warped, SUPERSAMPLE, SUPERSAMPLE, "valid"), 127.5), 1);
    return model.execute(crop);
  });
  const data = Array.from((await output.data()) as Float32Array);
  tf.dispose([image, output]);
  return normalizeVector(data);
}
