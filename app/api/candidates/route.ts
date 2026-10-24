import { z } from "zod";
import { createCandidate } from "@/lib/db";
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

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError("Permintaan tidak valid.", 403);
  const user = await getSessionUser();
  if (!user || !isAdmin(user)) return jsonError("Akses ditolak.", 403);

  const formData = await request.formData();
  const parsed = fieldsSchema.safeParse({
    name: formData.get("name"),
    vision: formData.get("vision"),
    mission: formData.get("mission"),
    featuredProgram: formData.get("featuredProgram"),
    occupation: formData.get("occupation"),
    cohort: formData.get("cohort")
  });
  if (!parsed.success) return jsonError("Data calon belum lengkap.");

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return jsonError("Gambar calon wajib diisi.");

  try {
    const image = await imageFileToDataUrl(file);
    const candidate = await createCandidate({ ...parsed.data, image }, auditActor(user));
    return Response.json({ ok: true, candidate });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Gagal menyimpan calon.");
  }
}
