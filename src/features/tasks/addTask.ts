import { supabase } from "../../lib/supabase";
import { TASK_COLS, useData } from "../../lib/data";
import { parseQuick } from "../../lib/parse";
import { buildLinkAttachments, saveAttachments } from "../../lib/links";
import { reminderPassed, today } from "../../lib/util";
import type { Task } from "../../lib/types";

export type TaskDraft = {
  title: string;
  due_at: string | null;
  due_time: string | null;
  priority: number;
  list_id: string | null;
  tags: string[];
  recurrence: string | null;
  checklist: Task["checklist"];
};

// Cria uma tarefa a partir do texto digitado (prazo, horário, lista, etiquetas, prioridade, repetição e links). A tela atualiza na hora.
export function useAddTask() {
  const { setTasks, lists, setAttachments } = useData();
  return function addTask(input: string | TaskDraft, o: { view?: string; listId?: string | null; tag?: string | null; defaultDueAt?: string | null } = {}) {
    const p = typeof input === "string" ? parseQuick(input, lists) : null;
    const title = typeof input === "string" ? p?.title ?? "" : input.title.trim();
    if (!title) return null;
    const dueAt = typeof input === "string"
      ? p?.due_at ?? o.defaultDueAt ?? (o.view === "today" || o.view === "week" ? today() : null)
      : input.due_at;
    const dueTime = typeof input === "string" ? p?.due_time ?? null : input.due_time;
    const fields = typeof input === "string"
      ? {
          title,
          list_id: p?.listId ?? o.listId ?? null,
          due_at: dueAt,
          due_time: dueAt ? dueTime : null,
          notified_at: reminderPassed(dueAt, dueTime) ? new Date().toISOString() : null,
          priority: p?.priority ?? 0,
          tags: o.tag && !p?.tags.includes(o.tag) ? [...(p?.tags ?? []), o.tag] : p?.tags ?? [],
          recurrence: p?.recurrence ?? null,
          checklist: [],
        }
      : {
          title,
          list_id: input.list_id,
          due_at: dueAt,
          due_time: dueAt ? dueTime : null,
          notified_at: reminderPassed(dueAt, dueTime) ? new Date().toISOString() : null,
          priority: input.priority,
          tags: input.tags,
          recurrence: input.recurrence,
          checklist: input.checklist,
        };
    const id = crypto.randomUUID();
    const temp: Task = { id, done: false, done_at: null, snoozed_until: null, created_at: new Date().toISOString(), ...fields };
    const atts = buildLinkAttachments({ taskId: id }, p?.links ?? []);
    setTasks((prev) => [temp, ...prev]);
    if (atts.length) setAttachments((prev) => [...prev, ...atts]);
    const dropAtts = () => setAttachments((prev) => prev.filter((a) => !atts.some((x) => x.id === a.id)));
    // done: resolve com null (salvou) ou com a mensagem de erro
    const done = (async (): Promise<string | null> => {
      const { data, error } = await supabase.from("tasks").insert({ id, ...fields }).select(TASK_COLS).single();
      if (error) {
        setTasks((prev) => prev.filter((x) => x.id !== id));
        dropAtts();
        return error.message;
      }
      const row = data as unknown as Task;
      setTasks((prev) => (prev.some((x) => x.id === row.id) ? prev.map((x) => (x.id === row.id ? row : x)) : [row, ...prev]));
      const err = await saveAttachments(atts);
      if (err) {
        dropAtts();
        return `a tarefa foi salva, mas os links não: ${err}`;
      }
      return null;
    })();
    return { id, done, title };
  };
}
