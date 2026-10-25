import "server-only";

import { getElectionSettings } from "@/lib/db";
import { electionPhase, type ElectionPhase } from "@/lib/election";

export async function getElectionState() {
  const { settings, now } = await getElectionSettings();
  return { settings, now, phase: electionPhase(settings, now) };
}

// Pesan penolakan bila tindakan admin dikunci pada tahap pemilu saat ini; null bila diizinkan.
export async function electionLockMessage(lockedPhases: ElectionPhase[]) {
  const { phase } = await getElectionState();
  if (!lockedPhases.includes(phase)) return null;
  return phase === "pemungutan"
    ? "Dikunci selama pemungutan suara berlangsung."
    : "Dikunci karena pemungutan suara telah ditutup.";
}
