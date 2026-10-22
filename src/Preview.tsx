import type { Parsed, ParsedNote } from "./parse";
import { recurrenceLabel } from "./parse";
import type { List } from "./types";
import { describeDate, PRIORITY } from "./util";
import { NAMES } from "./Swatches";

export const hasTaskPreview = (p: Parsed) => !!(p.due_at || p.priority || p.listId || p.tags.length || p.recurrence || p.links.length);
export const hasNotePreview = (p: ParsedNote) => !!(p.color !== null || p.pinned || p.tags.length || p.checklist.length || p.links.length);

// O que o app entendeu do texto digitado (tarefa)
export function TaskPreview({ parsed, lists }: { parsed: Parsed; lists: List[] }) {
  return (
    <div className="preview" aria-live="polite">
      {parsed.due_at && <span className="chip static">Prazo: {describeDate(parsed.due_at)}{parsed.due_time ? ` às ${parsed.due_time}` : ""}</span>}
      {parsed.recurrence && <span className="chip static">{recurrenceLabel(parsed.recurrence)}</span>}
      {parsed.priority > 0 && <span className="chip static">Prioridade: {PRIORITY[parsed.priority]}</span>}
      {parsed.listId && <span className="chip static">Lista: {lists.find((l) => l.id === parsed.listId)?.name}</span>}
      {parsed.tags.map((g) => (
        <span key={g} className="chip static">#{g}</span>
      ))}
      {parsed.links.map((l) => (
        <span key={l.url} className="chip static">Link: {l.title}</span>
      ))}
    </div>
  );
}

// O que o app entendeu do texto digitado (nota)
export function NotePreview({ parsed }: { parsed: ParsedNote }) {
  return (
    <div className="preview" aria-live="polite">
      {parsed.color !== null && <span className="chip static">Cor: {NAMES[Number(parsed.color)]}</span>}
      {parsed.pinned && <span className="chip static">Fixada</span>}
      {parsed.checklist.length > 0 && <span className="chip static">{parsed.checklist.length} {parsed.checklist.length === 1 ? "item" : "itens"}</span>}
      {parsed.tags.map((g) => (
        <span key={g} className="chip static">#{g}</span>
      ))}
      {parsed.links.map((l) => (
        <span key={l.url} className="chip static">Link: {l.title}</span>
      ))}
    </div>
  );
}
