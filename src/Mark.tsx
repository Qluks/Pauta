export default function Mark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" style={{ fill: "var(--ink)" }} />
      <path d="M11 8v16" strokeWidth="3" strokeLinecap="round" style={{ stroke: "var(--paper)" }} />
      <path d="M18 8h6M18 16h6M18 24h6" strokeWidth="2.4" strokeLinecap="round" opacity=".6" style={{ stroke: "var(--paper)" }} />
      <circle cx="11" cy="8" r="3.4" style={{ fill: "var(--l0)" }} />
      <circle cx="11" cy="16" r="3.4" style={{ fill: "var(--l1)" }} />
      <circle cx="11" cy="24" r="3.4" style={{ fill: "var(--l2)" }} />
    </svg>
  );
}
