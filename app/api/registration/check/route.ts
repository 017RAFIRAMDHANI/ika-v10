import { registrationClosedMessage, registrationOpen } from "@/lib/election";
import { getElectionState } from "@/lib/election-guard";
import { validateRegistrationAccessToken } from "@/lib/registration-access";
import { biodataSchema, checkRegistrationBiodata } from "@/lib/registration-biodata";
import { isSameOrigin, jsonError } from "@/lib/security";
import { z } from "zod";

const schema = biodataSchema.extend({
  accessToken: z.string().min(20).max(4096)
});

// Langkah 2 -> 3: biodata, DPT, NIM, dan kode login diperiksa sebelum pendaftar memindai wajah.
export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Permintaan tidak valid.", 403);
    const election = await getElectionState();
    if (!registrationOpen(election.settings, election.phase)) return jsonError(registrationClosedMessage(election.phase), 409);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Data pendaftaran tidak valid.");
    if (!validateRegistrationAccessToken(parsed.data.accessToken)) {
      return jsonError("Akses pendaftaran kedaluwarsa atau tidak valid. Masukkan kembali Kode Primary DPT.", 403);
    }

    const result = await checkRegistrationBiodata(parsed.data);
    if (!result.ok) return jsonError(result.message, result.status);
    return Response.json(
      { ok: true, loginCode: result.loginCode },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Registration biodata check failed:", error);
    return jsonError("Data pendaftaran tidak dapat diperiksa oleh server. Silakan coba lagi.", 500);
  }
}
