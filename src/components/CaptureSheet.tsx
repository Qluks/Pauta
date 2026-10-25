import { FormEvent, useMemo, useState } from "react";
import Sheet from "./Sheet";
import { useData } from "../lib/data";
import { useAddTask, type TaskDraft } from "../features/tasks/addTask";
import { useAddNote, type NoteDraft } from "../features/notes/addNote";
import { useToast } from "./Toast";
import TagInput from "./Tags";
import Swatches from "./Swatches";
import { ChecklistEditor } from "./Checklist";
import { PRIORITY, today } from "../lib/util";
import { recurrenceLabel } from "../lib/parse";
import type { ChecklistItem } from "../lib/types";

const RECURRENCE_PRESETS = ["daily", "weekdays", "weekly", "weekly:2", "monthly", "monthly:3", "monthly:12"];

type Props = {
  view: string;
  mode: "task" | "note";
  onClose: () => void;
  onCreated?: (id: string) => void;
  initialTag?: string | null;
  initialDueAt?: string;
};

export default function CaptureSheet({ view, mode, onClose, onCreated, initialTag, initialDueAt }: Props) {
  const { lists, tasks, notes } = useData();
  const addTask = useAddTask();
  const addNote = useAddNote();
  const toast = useToast();
  const currentList = lists.find((list) => `list:${list.id}` === view);
  const taskTags = useMemo(() => [...new Set(tasks.flatMap((task) => task.tags ?? []))].sort(), [tasks]);
  const noteTags = useMemo(() => [...new Set(notes.flatMap((note) => note.tags ?? []))].sort(), [notes]);
  const [task, setTask] = useState<TaskDraft>(() => ({
    title: "",
    due_at: initialDueAt ?? (view === "today" ? today() : null),
    due_time: null,
    priority: 0,
    list_id: currentList?.id ?? null,
    tags: initialTag ? [initialTag] : [],
    recurrence: null,
    checklist: [],
  }));
  const [note, setNote] = useState<NoteDraft>(() => ({
    title: "",
    body: "",
    color: null,
    tags: initialTag ? [initialTag] : [],
    checklist: [],
    pinned: false,
  }));
  const isTask = mode === "task";
  const taskReady = !!task.title.trim();
  const noteReady = !!note.title.trim() || !!note.body.trim() || note.checklist.some((item) => item.text.trim());

  function submit(event: FormEvent) {
    event.preventDefault();
    if (isTask) {
      const result = addTask(task, { view });
      if (!result) return;
      onCreated?.(result.id);
      onClose();
      toast(`“${result.title}” adicionada`);
      result.done.then((message) => message && toast(`Não foi possível salvar: ${message}`));
      return;
    }
    const result = addNote(note);
    if (!result) return;
    onCreated?.(result.id);
    onClose();
    toast(`Nota “${result.title}” criada`);
    result.done.then((message) => message && toast(`Não foi possível salvar: ${message}`));
  }

  return (
    <Sheet title={isTask ? "Nova tarefa" : "Nova nota"} onClose={onClose}>
      <form className={`create-form create-form-${mode}`} onSubmit={submit}>
        {isTask ? (
          <>
            <label>
              Tarefa
              <input
                autoFocus
                required
                value={task.title}
                onChange={(event) => setTask({ ...task, title: event.target.value })}
                placeholder="Ex.: Marcar consulta"
                aria-label="Título da tarefa"
              />
            </label>
            <label>
              Prazo
              <input type="date" value={task.due_at ?? ""} onChange={(event) => setTask({ ...task, due_at: event.target.value || null, ...(!event.target.value ? { due_time: null } : {}) })} />
            </label>
            <label>
              Horário do lembrete
              <input type="time" value={task.due_time ?? ""} onChange={(event) => setTask({ ...task, due_time: event.target.value || null, ...(!task.due_at && event.target.value ? { due_at: today() } : {}) })} />
            </label>
            <label>
              Prioridade
              <select value={task.priority} onChange={(event) => setTask({ ...task, priority: Number(event.target.value) })}>
                {PRIORITY.map((priority, index) => <option key={priority} value={index}>{priority}</option>)}
              </select>
            </label>
            <label>
              Lista
              <select value={task.list_id ?? ""} onChange={(event) => setTask({ ...task, list_id: event.target.value || null })}>
                <option value="">Sem lista</option>
                {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
              </select>
            </label>
            <label>
              Repetição
              <select
                value={task.recurrence ?? ""}
                onChange={(event) => {
                  const recurrence = event.target.value || null;
                  setTask({ ...task, recurrence, ...(recurrence && !task.due_at ? { due_at: today() } : {}) });
                }}
              >
                <option value="">Não repete</option>
                {RECURRENCE_PRESETS.map((value) => <option key={value} value={value}>{recurrenceLabel(value)}</option>)}
              </select>
            </label>
            <div className="create-field">
              <span className="lbl">Etiquetas</span>
              <TagInput tags={task.tags} onChange={(tags) => setTask({ ...task, tags })} suggestions={taskTags} listId="create-task-tags" />
            </div>
            <div className="create-field">
              <span className="lbl">Checklist</span>
              <ChecklistEditor items={task.checklist} onChange={(checklist: ChecklistItem[]) => setTask({ ...task, checklist })} />
            </div>
          </>
        ) : (
          <>
            <label>
              Título
              <input autoFocus value={note.title} onChange={(event) => setNote({ ...note, title: event.target.value })} placeholder="Título da nota" aria-label="Título da nota" />
            </label>
            <label>
              Texto
              <textarea rows={7} value={note.body} onChange={(event) => setNote({ ...note, body: event.target.value })} placeholder="Escreva sua nota…" aria-label="Texto da nota" />
            </label>
            <div className="create-field">
              <span className="lbl">Checklist</span>
              <ChecklistEditor items={note.checklist} onChange={(checklist) => setNote({ ...note, checklist })} />
            </div>
            <div className="create-field">
              <span className="lbl">Etiquetas</span>
              <TagInput tags={note.tags} onChange={(tags) => setNote({ ...note, tags })} suggestions={noteTags} listId="create-note-tags" />
            </div>
            <div className="create-field">
              <span className="lbl">Cor</span>
              <Swatches value={note.color} onPick={(color) => setNote({ ...note, color })} />
            </div>
            <label className="check">
              <input type="checkbox" checked={note.pinned} onChange={(event) => setNote({ ...note, pinned: event.target.checked })} />
              Fixar nota
            </label>
          </>
        )}
        <div className="create-actions">
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary" disabled={isTask ? !taskReady : !noteReady}>
            {isTask ? "Criar tarefa" : "Criar nota"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
