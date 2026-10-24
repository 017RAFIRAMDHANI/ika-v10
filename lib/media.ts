export function mediaUrl(value: string) {
  if (value.startsWith("data:") || value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  return value.startsWith("/") ? value : `/storage/${value}`;
}

export async function imageFileToDataUrl(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("File gambar tidak valid.");
  if (file.size > 2 * 1024 * 1024) throw new Error("Ukuran gambar maksimal 2 MB.");
  const allowed = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
  if (!allowed.has(file.type)) throw new Error("Format gambar harus JPG, PNG, GIF, atau WebP.");
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buffer.toString("base64")}`;
}
