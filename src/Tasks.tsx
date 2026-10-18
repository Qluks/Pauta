import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { List, Task } from "./types";
import { cv, lineVar } from "./colors";

const COLS = "id,title,done,done_at,created_at,due_at,priority,list_id";
const PRIORITY = ["Sem prioridade", "Baixa", "Média", "Alta"];
const TITLES: Record<string, string> = {
  today: "Hoje",
  upcoming: "Próximas",
  all: "Todas",
  done: "Concluídas",
};

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmt(date: string) {
  const [, m, d] = date.split("-");
  return `${d}/${m}`;
}

export default function Tasks({ view, lists }: { view: string; lists: List[] }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("tasks").select(COLS).order("created_at", { ascending: false });
      if (error) setError(error.message);
      else setTasks(data as Task[]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === "n" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setTitle("");
    const listId = view.startsWith("list:") ? view.slice(5) : null;
    const fields = { title: t, list_id: listId, due_at: view === "today" ? today() : null };
    const tempId = crypto.randomUUID();
    const temp: Task = { id: tempId, done: false, done_at: null, created_at: new Date().toISOString(), priority: 0, ...fields };
    setTasks((p) => [temp, ...p]);
    const { data, error } = await supabase.from("tasks").insert(fields).select(COLS).single();
    if (error) {
      setTasks((p) => p.filter((x) => x.id !== tempId));
      setError(error.message);
    } else {
      setTasks((p) => p.map((x) => (x.id === tempId ? (data as Task) : x)));
    }
  }

  async function patch(task: Task, changes: Partial<Task>) {
    setTasks((p) => p.map((x) => (x.id === task.id ? { ...x, ...changes } : x)));
    const { error } = await supabase.from("tasks").update(changes).eq("id", task.id);
    if (error) {
      setTasks((p) => p.map((x) => (x.id === task.id ? task : x)));
      setError(error.message);
    }
  }

  const toggle = (t: Task) => patch(t, { done: !t.done, done_at: t.done ? null : new Date().toISOString() });

  async function remove(task: Task) {
    setTasks((p) => p.filter((x) => x.id !== task.id));
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) {
      setTasks((p) => [task, ...p]);
      setError(error.message);
    }
  }

  function saveEdit(task: Task) {
    const t = editText.trim();
    setEditingId(null);
    if (t && t !== task.title) patch(task, { title: t });
  }
  function onEditKey(e: KeyboardEvent<HTMLInputElement>, task: Task) {
    if (e.key === "Enter") saveEdit(task);
    if (e.key === "Escape") setEditingId(null);
  }

  // Filtro por visão + busca
  const t0 = today();
  const q = query.trim().toLowerCase();
  let items = tasks.filter((t) => t.title.toLowerCase().includes(q));
  if (view === "done") {
    items = items.filter((t) => t.done).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
  } else {
    items = items.filter((t) => !t.done);
    if (view === "today") items = items.filter((t) => t.due_at && t.due_at <= t0);
    else if (view === "upcoming") items = items.filter((t) => t.due_at && t.due_at > t0);
    else if (view.startsWith("list:")) items = items.filter((t) => t.list_id === view.slice(5));
    items.sort(
      (a, b) =>
        (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999") ||
        b.priority - a.priority ||
        b.created_at.localeCompare(a.created_at)
    );
  }

  const heading = TITLES[view] ?? lists.find((l) => `list:${l.id}` === view)?.name ?? "Tarefas";
  const listName = (id: string | null) => lists.find((l) => l.id === id)?.name;
  const listColor = (id: string | null) => {
    const i = lists.findIndex((l) => l.id === id);
    return i >= 0 ? lineVar(i) : "var(--muted)";
  };
  const hi = lists.findIndex((l) => `list:${l.id}` === view);
  const headColor = hi >= 0 ? lineVar(hi) : "var(--ink)";

  return (
    <section>
      <h2 className="heading" style={cv(headColor)}>{heading}</h2>

      <form className="quick" onSubmit={add}>
        <input ref={inputRef} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nova tarefa (atalho: n)" aria-label="Nova tarefa" />
        <button className="primary">Adicionar</button>
      </form>

      <input className="search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tarefas" aria-label="Buscar tarefas" />

      {error && (
        <p className="error" role="alert">
          {error} <button className="ghost" onClick={() => setError(null)}>Fechar</button>
        </p>
      )}

      {loading ? (
        <p className="empty">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="empty">
          {q ? "Nenhuma tarefa encontrada." : view === "today" ? "Nada para hoje. Defina um prazo nas tarefas ou adicione uma aqui." : "Nenhuma tarefa aqui."}
        </p>
      ) : (
        <ul className="list">
          {items.map((t) => {
            const overdue = !t.done && t.due_at !== null && t.due_at < t0;
            const ln = listName(t.list_id);
            return (
              <li key={t.id} className={t.done ? "done" : ""} style={cv(listColor(t.list_id))}>
                <div className="row">
                  <input type="checkbox" checked={t.done} onChange={() => toggle(t)} aria-label={`Concluir ${t.title}`} />
                  {editingId === t.id ? (
                    <input className="edit" autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => onEditKey(e, t)} onBlur={() => saveEdit(t)} />
                  ) : (
                    <span className="title" onDoubleClick={() => { setEditingId(t.id); setEditText(t.title); }} title="Clique duas vezes para editar">
                      {t.title}
                    </span>
                  )}
                  <span className="badges">
                    {t.priority > 0 && <span className={`badge p${t.priority}`}>{PRIORITY[t.priority]}</span>}
                    {t.due_at && <span className={`badge${overdue ? " late" : ""}`}>{overdue ? "Atrasada " : ""}{fmt(t.due_at)}</span>}
                    {ln && view !== `list:${t.list_id}` && <span className="badge list">{ln}</span>}
                  </span>
                  <button className="ghost" aria-expanded={openId === t.id} onClick={() => setOpenId(openId === t.id ? null : t.id)}>
                    Detalhes
                  </button>
                </div>
                {openId === t.id && (
                  <div className="details">
                    <label>
                      Prazo
                      <input type="date" value={t.due_at ?? ""} onChange={(e) => patch(t, { due_at: e.target.value || null })} />
                    </label>
                    <label>
                      Prioridade
                      <select value={t.priority} onChange={(e) => patch(t, { priority: Number(e.target.value) })}>
                        {PRIORITY.map((p, i) => (
                          <option key={i} value={i}>{p}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Lista
                      <select value={ln ? t.list_id ?? "" : ""} onChange={(e) => patch(t, { list_id: e.target.value || null })}>
                        <option value="">Sem lista</option>
                        {lists.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                    </label>
                    <button className="ghost danger" onClick={() => remove(t)}>Excluir tarefa</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
