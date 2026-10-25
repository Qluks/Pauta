import { useData } from "../../lib/data";
import { parseQuick } from "../../lib/parse";
import { buildLinkAttachments } from "../../lib/links";
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
  const { setTasks, lists, setAttachments, saveMutation } = useData();
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
      const saved = await saveMutation("tasks", id, "upsert", { id, ...fields });
      if (saved.error) {
        setTasks((prev) => prev.filter((x) => x.id !== id));
        dropAtts();
        return saved.error;
      }
      for (let index = 0; index < atts.length; index += 1) {
        const attachment = atts[index];
        const attachmentResult = await saveMutation("attachments", attachment.id, "upsert", attachment);
        if (attachmentResult.error) {
          const unsavedIds = new Set(atts.slice(index).map((item) => item.id));
          setAttachments((prev) => prev.filter((item) => !unsavedIds.has(item.id)));
          return `a tarefa foi salva, mas os links não: ${attachmentResult.error}`;
        }
      }
      return null;
    })();
    return { id, done, title };
  };
}
