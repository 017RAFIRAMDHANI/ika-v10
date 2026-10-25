import { z } from "zod";
import { deleteCandidate, updateCandidate } from "@/lib/db";
import { electionLockMessage } from "@/lib/election-guard";
import { imageFileToDataUrl } from "@/lib/media";
import { auditActor, getSessionUser, isAdmin } from "@/lib/session";
import { isSameOrigin, jsonError } from "@/lib/security";

const fieldsSchema = z.object({
  name: z.string().trim().min(2).max(255),
  vision: z.string().trim().min(2),
  mission: z.string().trim().min(2),
  featuredProgram: z.string().trim().min(1),
  occupation: z.string().trim().min(2).max(255),
  cohort: z.string().regex(/^\d{4}$/)
});

function idFrom(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return jsonError("Permintaan tidak valid.", 403);
  const user = await getSessionUser();
  if (!user || !isAdmin(user)) return jsonError("Akses ditolak.", 403);
  const locked = await electionLockMessage(["pemungutan", "ditutup"]);
  if (locked) return jsonError(locked, 409);
  const id = idFrom((await params).id);
  if (!id) return jsonError("ID kandidat tidak valid.");
  const formData = await request.formData();
  const parsed = fieldsSchema.safeParse({
    name: formData.get("name"), vision: formData.get("vision"), mission: formData.get("mission"),
    featuredProgram: formData.get("featuredProgram"), occupation: formData.get("occupation"),
    cohort: formData.get("cohort")
  });
  if (!parsed.success) return jsonError("Data calon belum lengkap.");
  const file = formData.get("image");

  try {
    const image = file instanceof File && file.size > 0 ? await imageFileToDataUrl(file) : null;
    const updated = await updateCandidate(id, { ...parsed.data, image }, auditActor(user));
    if (!updated) return jsonError("Kandidat tidak ditemukan.", 404);
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Gagal memperbarui kandidat.");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return jsonError("Permintaan tidak valid.", 403);
  const user = await getSessionUser();
  if (!user || !isAdmin(user)) return jsonError("Akses ditolak.", 403);
  const locked = await electionLockMessage(["pemungutan", "ditutup"]);
  if (locked) return jsonError(locked, 409);
  const id = idFrom((await params).id);
  if (!id) return jsonError("ID kandidat tidak valid.");
  const deleted = await deleteCandidate(id, auditActor(user));
  if (!deleted) return jsonError("Kandidat memiliki suara/pemilih dan belum dapat dihapus.", 409);
  return Response.json({ ok: true });
}
