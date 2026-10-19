export default function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty-state">
      <svg width="104" height="30" viewBox="0 0 104 30" aria-hidden="true">
        <path d="M10 15h84" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 8" style={{ stroke: "var(--muted)", fill: "none" }} />
        <circle cx="12" cy="15" r="7" strokeWidth="3.5" style={{ stroke: "var(--l0)", fill: "var(--surface)" }} />
        <circle cx="52" cy="15" r="7" strokeWidth="3.5" style={{ stroke: "var(--l1)", fill: "var(--surface)" }} />
        <circle cx="92" cy="15" r="7" strokeWidth="3.5" style={{ stroke: "var(--l2)", fill: "var(--surface)" }} />
      </svg>
      <p className="es-title">{title}</p>
      {hint && <p className="es-hint">{hint}</p>}
    </div>
  );
}
