import { z } from "zod";
import { registrationClosedMessage, registrationOpen } from "@/lib/election";
import { getElectionState } from "@/lib/election-guard";
import { networkBlockedMessage, recordNetworkFailure } from "@/lib/login-throttle";
import {
  createRegistrationAccessToken,
  verifyRegistrationPrimaryCode
} from "@/lib/registration-access";
import { isSameOrigin, jsonError } from "@/lib/security";

const schema = z.object({
  code: z.string().trim().min(1, "Kode Primary DPT wajib diisi.").max(128)
});

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return jsonError("Permintaan tidak valid.", 403);
    const election = await getElectionState();
    if (!registrationOpen(election.phase)) return jsonError(registrationClosedMessage(election.phase), 409);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Kode Primary DPT tidak valid.");
    const blocked = await networkBlockedMessage(request, "pendaftaran");
    if (blocked) return jsonError(blocked, 429);
    if (!verifyRegistrationPrimaryCode(parsed.data.code)) {
      await recordNetworkFailure(request, "pendaftaran");
      return jsonError("Kode Primary DPT tidak sesuai. Hubungi administrator.", 401);
    }

    const access = createRegistrationAccessToken();
    return Response.json(
      { ok: true, accessToken: access.token, expiresAt: access.expiresAt },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Registration access failed:", error);
    return jsonError("Kode pendaftaran belum dikonfigurasi atau tidak dapat diperiksa.", 500);
  }
}
