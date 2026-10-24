import { getCandidates } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const candidates = await getCandidates();
    return Response.json({ ok: true, database: "connected", candidates: candidates.length });
  } catch {
    return Response.json({ ok: false, database: "unavailable" }, { status: 503 });
  }
}
