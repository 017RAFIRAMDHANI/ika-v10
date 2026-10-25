import type { ElectionPhase } from "@/lib/election";

// Keterangan di halaman admin bila tindakan sedang dikunci oleh tahap pemilu (T1).
export default function ElectionLockNotice({
  phase,
  lockedPhases,
  subject
}: {
  phase: ElectionPhase;
  lockedPhases: ElectionPhase[];
  subject: string;
}) {
  if (!lockedPhases.includes(phase)) return null;
  return (
    <div className="alert alert-warning" role="status">
      <i className="bx bx-lock-alt" /> {subject} dikunci {phase === "pemungutan" ? "selama pemungutan suara berlangsung" : "karena pemungutan suara telah ditutup"}.
    </div>
  );
}
