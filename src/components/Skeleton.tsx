const WIDTHS = ["72%", "54%", "84%", "62%", "47%"];

// Linhas pautadas pulsando enquanto os dados chegam
export function ListSkeleton() {
  return (
    <div className="skel" aria-busy="true" aria-label="Carregando">
      {WIDTHS.map((w, i) => (
        <div key={i} className="skel-row">
          <span className="skel-dot" />
          <span className="skel-bar" style={{ width: w }} />
        </div>
      ))}
    </div>
  );
}

export function NotesSkeleton() {
  return (
    <div className="skel-notes" aria-busy="true" aria-label="Carregando">
      {[110, 150, 96, 128, 104, 140].map((h, i) => (
        <div key={i} className="skel-note" style={{ height: h }}>
          <span className="skel-bar" style={{ width: "60%" }} />
          <span className="skel-bar" style={{ width: "88%" }} />
        </div>
      ))}
    </div>
  );
}
