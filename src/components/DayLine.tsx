import type { CSSProperties } from "react";
import { cv } from "../lib/colors";

export type Stop = { id: string; done: boolean; late: boolean; color: string; title: string };

// "Linha do dia": uma parada por tarefa de hoje. As concluídas vêm primeiro e o trilho avança até a última delas.
export default function DayLine({ stops, celebrate }: { stops: Stop[]; celebrate?: boolean }) {
  const total = stops.length;
  const done = stops.filter((s) => s.done).length;
  const shown = stops.slice(0, 14);
  const n = shown.length;
  const fill = n <= 1 ? (done > 0 ? 100 : 0) : done === 0 ? 0 : Math.min(100, ((Math.min(done, n) - 1) / (n - 1)) * 100);
  const nextIdx = shown.findIndex((s) => !s.done);
  const raw = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const date = raw.charAt(0).toUpperCase() + raw.slice(1);
  const status = total === 0 ? "Dia livre" : done === total ? `Dia concluído · ${done} de ${total}` : `${done} de ${total} concluídas`;

  return (
    <section className={`dayline${celebrate ? " celebrate" : ""}`} aria-label="Linha do dia">
      <div className="dl-head">
        <span className="dl-date">{date}</span>
        <span className="dl-count" role="status">{status}</span>
      </div>
      {total > 0 && (
        <div className="dl-rail" aria-hidden="true">
          <div className="dl-track" />
          <div className="dl-fill" style={{ "--fill": `${fill}%` } as CSSProperties} />
          {shown.map((s, i) => (
            <span
              key={s.id}
              className={`dl-stop${s.done ? " on" : ""}${s.late ? " late" : ""}${i === nextIdx ? " next" : ""}`}
              style={{ ...cv(s.color), "--p": `${n === 1 ? 0 : (i / (n - 1)) * 100}%`, "--k": i } as CSSProperties}
              title={s.title}
            />
          ))}
        </div>
      )}
      {total > n && <span className="dl-more">+{total - n} paradas</span>}
    </section>
  );
}
