import Glyph from "./Glyph";

// Shared by Planning surfaces and by course rooms (a shared exam date). The
// Calendar stamp persists in a narrow month cell; the full label stays
// available to assistive tech.
export default function PlanningExamMark({ label, count = 1, compact = false }) {
  return <span className={`bt-plan-exam-mark${compact ? " bt-plan-exam-mark--compact" : ""}`}>
    <Glyph size={16}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M8 2v4M16 2v4M3 10h18M8 14h8M8 18h5" />
    </Glyph>
    <span className="bt-plan-exam-mark-label">{label}</span>
    {count > 1 && <span className="bt-plan-exam-count">{count}</span>}
  </span>;
}
