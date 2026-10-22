import { useState } from "react";
import type { List, Task } from "./types";
import { listColor } from "./colors";
import Sheet from "./Sheet";
import TagInput from "./Tags";
import Attachments from "./Attachments";
import { PRIORITY, today, tomorrow } from "./util";
import { recurrenceLabel } from "./parse";

const RECURRENCE_PRESETS = ["daily", "weekdays", "weekly", "weekly:2", "monthly", "monthly:3", "monthly:12"];

type Props = {
  task: Task;
  lists: List[];
  allTags: string[];
  patch: (t: Task, changes: Partial<Task>) => void;
  remove: (t: Task) => void;
  onClose: () => void;
};

export default function TaskSheet({ task: t, lists, allTags, patch, remove, onClose }: Props) {
  const [title, setTitle] = useState(t.title);
  const li = lists.findIndex((l) => l.id === t.list_id);
  const color = li >= 0 ? listColor(lists[li], li) : "var(--ink)";

  function saveTitle() {
    const v = title.trim();
    if (v && v !== t.title) patch(t, { title: v });
    else setTitle(t.title);
  }

  return (
    <Sheet
      title="Detalhes da tarefa"
      color={color}
      onClose={onClose}
      header={
        <input
          className="sheet-title-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          aria-label="Título da tarefa"
        />
      }
    >
      {(close) => (
        <div className="details">
          <div className="datefield">
            <label>
              Prazo
              <input type="date" value={t.due_at ?? ""} onChange={(e) => patch(t, { due_at: e.target.value || null })} />
            </label>
            <label>
              Horário (para o lembrete)
              <input type="time" value={t.due_time?.slice(0, 5) ?? ""} onChange={(e) => patch(t, { due_time: e.target.value || null, ...(e.target.value && !t.due_at ? { due_at: today() } : {}) })} />
            </label>
            <div className="datequick">
              <button type="button" className="chipbtn" onClick={() => patch(t, { due_at: today() })}>Hoje</button>
              <button type="button" className="chipbtn" onClick={() => patch(t, { due_at: tomorrow() })}>Amanhã</button>
              {t.due_at && <button type="button" className="chipbtn clear" onClick={() => patch(t, { due_at: null, due_time: null })}>Remover prazo</button>}
              {t.due_time && <button type="button" className="chipbtn clear" onClick={() => patch(t, { due_time: null })}>Remover horário</button>}
            </div>
          </div>
          <div className="triple">
          <label>
            Prioridade
            <select value={t.priority} onChange={(e) => patch(t, { priority: Number(e.target.value) })}>
              {PRIORITY.map((p, i) => (
                <option key={i} value={i}>{p}</option>
              ))}
            </select>
          </label>
          <label>
            Repetir
            <select
              value={t.recurrence ?? ""}
              onChange={(e) => {
                const v = e.target.value || null;
                patch(t, { recurrence: v, ...(v && !t.due_at ? { due_at: today() } : {}) });
              }}
            >
              <option value="">Não repete</option>
              {[...RECURRENCE_PRESETS, ...(t.recurrence && !RECURRENCE_PRESETS.includes(t.recurrence) ? [t.recurrence] : [])].map((k) => (
                <option key={k} value={k}>{recurrenceLabel(k)}</option>
              ))}
            </select>
          </label>
          <label>
            Lista
            <select value={li >= 0 ? t.list_id ?? "" : ""} onChange={(e) => patch(t, { list_id: e.target.value || null })}>
              <option value="">Sem lista</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </label>
          </div>
          <div className="tagsfield">
            <span className="lbl">Etiquetas</span>
            <TagInput tags={t.tags ?? []} onChange={(tags) => patch(t, { tags })} suggestions={allTags} listId={`tags-task-${t.id}`} />
          </div>
          <div className="tagsfield">
            <span className="lbl">Anexos</span>
            <Attachments taskId={t.id} />
          </div>
          <button
            className="ghost danger"
            onClick={() => {
              remove(t);
              close();
            }}
          >
            Excluir tarefa
          </button>
        </div>
      )}
    </Sheet>
  );
}
