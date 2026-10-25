import { FormEvent, useEffect, useId, useMemo, useState } from "react";
import Sheet from "./Sheet";
import { useData } from "../lib/data";
import { useAddTask, type TaskDraft } from "../features/tasks/addTask";
import { useAddNote, type NoteDraft } from "../features/notes/addNote";
import { useToast } from "./Toast";
import TagInput from "./Tags";
import Swatches from "./Swatches";
import { ChecklistEditor } from "./Checklist";
import MarkdownEditor from "./MarkdownEditor";
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
  const { lists, tasks, notes, ownerId } = useData();
  const addTask = useAddTask();
  const addNote = useAddNote();
  const toast = useToast();
  const currentList = lists.find((list) => `list:${list.id}` === view);
  const formId = useId();
  const taskTags = useMemo(() => [...new Set(tasks.flatMap((task) => task.tags ?? []))].sort(), [tasks]);
  const noteTags = useMemo(() => [...new Set(notes.flatMap((note) => note.tags ?? []))].sort(), [notes]);
  const taskKey = ownerId ? `pauta-draft:${ownerId}:task` : null;
  const noteKey = ownerId ? `pauta-draft:${ownerId}:note` : null;
  const defaultTask: TaskDraft = {
    title: "",
    due_at: initialDueAt ?? (view === "today" ? today() : null),
    due_time: null,
    priority: 0,
    list_id: currentList?.id ?? null,
    tags: initialTag ? [initialTag] : [],
    recurrence: null,
    checklist: [],
  };
  const defaultNote: NoteDraft = {
    title: "",
    body: "",
    color: null,
    tags: initialTag ? [initialTag] : [],
    checklist: [],
    pinned: false,
  };
  const restoredTask = taskKey ? readDraft<TaskDraft>(taskKey, isTaskDraft) : { draft: null, error: null };
  const restoredNote = noteKey ? readDraft<NoteDraft>(noteKey, isNoteDraft) : { draft: null, error: null };
  const [task, setTask] = useState<TaskDraft>(() => restoredTask.draft ?? defaultTask);
  const [note, setNote] = useState<NoteDraft>(() => restoredNote.draft ?? defaultNote);
  const [draftMessage, setDraftMessage] = useState(
    (mode === "task" && restoredTask.draft) || (mode === "note" && restoredNote.draft)
      ? "Rascunho recuperado neste aparelho."
      : restoredTask.error ?? restoredNote.error ?? ""
  );
  const isTask = mode === "task";
  const taskReady = !!task.title.trim();
  const noteReady = !!note.title.trim() || !!note.body.trim() || note.checklist.some((item) => item.text.trim());

  useEffect(() => {
    const key = isTask ? taskKey : noteKey;
    if (!key) return;
    const value = isTask ? task : note;
    const empty = isTask ? !task.title.trim() && task.checklist.length === 0 : !note.title.trim() && !note.body.trim() && note.checklist.length === 0;
    try {
      if (empty) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
      if (!empty) setDraftMessage("Rascunho salvo automaticamente neste aparelho.");
    } catch (error) {
      setDraftMessage(`Não foi possível salvar o rascunho: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [isTask, task, note, taskKey, noteKey]);

  function discardDraft() {
    const key = isTask ? taskKey : noteKey;
    const removalError = key ? removeDraft(key) : null;
    if (isTask) setTask(defaultTask);
    else setNote(defaultNote);
    setDraftMessage(removalError ?? "");
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (isTask) {
      const result = addTask(task, { view });
      if (!result) return;
      const removalError = taskKey ? removeDraft(taskKey) : null;
      if (removalError) setDraftMessage(removalError);
      onCreated?.(result.id);
      onClose();
      toast(`“${result.title}” adicionada`);
      result.done.then((message) => message && toast(`Não foi possível salvar: ${message}`));
      return;
    }
    const result = addNote(note);
    if (!result) return;
    const removalError = noteKey ? removeDraft(noteKey) : null;
    if (removalError) setDraftMessage(removalError);
    onCreated?.(result.id);
    onClose();
    toast(`Nota “${result.title}” criada`);
    result.done.then((message) => message && toast(`Não foi possível salvar: ${message}`));
  }

  return (
    <Sheet
      title={isTask ? "Nova tarefa" : "Nova nota"}
      onClose={onClose}
      footer={
        <div className="create-actions">
          {(isTask ? taskReady : noteReady) && <button type="button" className="ghost" onClick={discardDraft}>Descartar rascunho</button>}
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" form={formId} className="primary" disabled={isTask ? !taskReady : !noteReady}>
            {isTask ? "Criar tarefa" : "Criar nota"}
          </button>
        </div>
      }
    >
      <form id={formId} className={`create-form create-form-${mode}`} onSubmit={submit}>
        {draftMessage && <p className="draft-status" role="status">{draftMessage}</p>}
        {isTask ? (
          <>
            <label className="create-title-field">
              Tarefa
              <input
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
            <label className="create-title-field">
              Título
              <input value={note.title} onChange={(event) => setNote({ ...note, title: event.target.value })} placeholder="Título da nota" aria-label="Título da nota" />
            </label>
            <div className="create-field note-body-field">
              <span className="lbl">Texto</span>
              <MarkdownEditor value={note.body} onChange={(body) => setNote((current) => ({ ...current, body }))} rows={7} placeholder="Escreva sua nota…" />
            </div>
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
      </form>
    </Sheet>
  );
}

function readDraft<T>(key: string, validate: (value: unknown) => value is T): { draft: T | null; error: string | null } {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { draft: null, error: null };
    const value: unknown = JSON.parse(raw);
    return validate(value) ? { draft: value, error: null } : { draft: null, error: "O rascunho local estava inválido e foi ignorado." };
  } catch (error) {
    return { draft: null, error: `Não foi possível ler o rascunho: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function removeDraft(key: string): string | null {
  try {
    localStorage.removeItem(key);
    return null;
  } catch (error) {
    return `Não foi possível remover o rascunho: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function isChecklistDraft(value: unknown): value is ChecklistItem[] {
  return Array.isArray(value) && value.every((item) => !!item && typeof item.id === "string" && typeof item.text === "string" && typeof item.done === "boolean");
}

function isTaskDraft(value: unknown): value is TaskDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<TaskDraft>;
  return typeof draft.title === "string" && (draft.due_at === null || typeof draft.due_at === "string") &&
    (draft.due_time === null || typeof draft.due_time === "string") && typeof draft.priority === "number" &&
    (draft.list_id === null || typeof draft.list_id === "string") && Array.isArray(draft.tags) &&
    draft.tags.every((tag) => typeof tag === "string") && (draft.recurrence === null || typeof draft.recurrence === "string") &&
    isChecklistDraft(draft.checklist);
}

function isNoteDraft(value: unknown): value is NoteDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<NoteDraft>;
  return typeof draft.title === "string" && typeof draft.body === "string" &&
    (draft.color === null || typeof draft.color === "string") && typeof draft.pinned === "boolean" &&
    Array.isArray(draft.tags) && draft.tags.every((tag) => typeof tag === "string") && isChecklistDraft(draft.checklist);
}
