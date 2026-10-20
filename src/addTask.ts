import { supabase } from "./supabase";
import { TASK_COLS, useData } from "./data";
import { parseQuick } from "./parse";
import { reminderPassed, today } from "./util";
import type { Task } from "./types";

// Cria uma tarefa a partir do texto digitado (com prazo, lista, etiquetas etc.). A tela atualiza na hora.
export function useAddTask() {
  const { setTasks, lists } = useData();
  return function addTask(text: string, o: { view?: string; listId?: string | null; tag?: string | null } = {}) {
    const p = parseQuick(text, lists);
    if (!p.title) return null;
    const dueAt = p.due_at ?? (o.view === "today" ? today() : null);
    const fields = {
      title: p.title,
      list_id: p.listId ?? o.listId ?? null,
      due_at: dueAt,
      due_time: dueAt ? p.due_time : null,
      notified_at: reminderPassed(dueAt, p.due_time) ? new Date().toISOString() : null,
      priority: p.priority,
      tags: o.tag && !p.tags.includes(o.tag) ? [...p.tags, o.tag] : p.tags,
      recurrence: p.recurrence,
    };
    const id = crypto.randomUUID();
    const temp: Task = { id, done: false, done_at: null, snoozed_until: null, created_at: new Date().toISOString(), ...fields };
    setTasks((prev) => [temp, ...prev]);
    // done: resolve com null (salvou) ou com a mensagem de erro (e a tarefa sai da tela)
    const done = (async (): Promise<string | null> => {
      const { data, error } = await supabase.from("tasks").insert({ id, ...fields }).select(TASK_COLS).single();
      if (error) {
        setTasks((prev) => prev.filter((x) => x.id !== id));
        return error.message;
      }
      const row = data as unknown as Task;
      setTasks((prev) => (prev.some((x) => x.id === row.id) ? prev.map((x) => (x.id === row.id ? row : x)) : [row, ...prev]));
      return null;
    })();
    return { id, done, title: p.title };
  };
}
