import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { Task } from "./types";
import { cv, listColor } from "./colors";
import { TASK_COLS, useData } from "./data";
import { useToast } from "./Toast";
import { describeDate, fmt, isDormant, reminderPassed, today, tomorrow } from "./util";
import { nextDue, parseQuick, RECURRENCE_LABEL, snoozeUntil } from "./parse";
import TagInput from "./Tags";
import ListEditor from "./ListEditor";
import Attachments from "./Attachments";

const PRIORITY = ["Sem prioridade", "Baixa", "Média", "Alta"];
const TITLES: Record<string, string> = { today: "Hoje", upcoming: "Próximas", all: "Todas", done: "Concluídas" };

export default function Tasks({ view }: { view: string }) {
  const { tasks, setTasks, lists, attachments, setAttachments, purgeFiles, loading, loadError, hide, unhide } = useData();
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editingList, setEditingList] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const t0 = today();
  const parsed = useMemo(() => parseQuick(title, lists), [title, lists]);
  const attCount = new Map<string, number>();
  for (const a of attachments) if (a.task_id) attCount.set(a.task_id, (attCount.get(a.task_id) ?? 0) + 1);
  const listIdx = view.startsWith("list:") ? lists.findIndex((l) => `list:${l.id}` === view) : -1;
  const currentList = listIdx >= 0 ? lists[listIdx] : undefined;

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === "n" && !e.ctrlKey && !e.metaKey && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Tarefas da tela atual
  const inView = (t: Task) => {
    if (view === "done") return t.done || isDormant(t);
    if (t.done || isDormant(t)) return false;
    if (view === "today") return !!t.due_at && t.due_at <= t0;
    if (view === "upcoming") return !!t.due_at && t.due_at > t0;
    if (view.startsWith("list:")) return t.list_id === view.slice(5);
    return true;
  };
  const base = tasks.filter(inView);
  const tagCounts = (() => {
    const m = new Map<string, number>();
    for (const t of base) for (const g of t.tags ?? []) m.set(g, (m.get(g) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  })();
  const allTags = [...new Set(tasks.flatMap((t) => t.tags ?? []))].sort();
  const activeTag = tagFilter && tagCounts.some(([g]) => g === tagFilter) ? tagFilter : null;
  const q = query.trim().toLowerCase();
  const items = base
    .filter((t) => !activeTag || (t.tags ?? []).includes(activeTag))
    .filter((t) => `${t.title} ${(t.tags ?? []).join(" ")}`.toLowerCase().includes(q))
    .sort((a, b) =>
      view === "done"
        ? (b.done_at ?? "").localeCompare(a.done_at ?? "")
        : (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999") || (a.due_time ?? "99:99").localeCompare(b.due_time ?? "99:99") || b.priority - a.priority || b.created_at.localeCompare(a.created_at)
    );

  async function add(e: FormEvent) {
    e.preventDefault();
    const p = parseQuick(title, lists);
    if (!p.title) return;
    setTitle("");
    const dueAt = p.due_at ?? (view === "today" ? t0 : null);
    const fields = {
      title: p.title,
      list_id: p.listId ?? currentList?.id ?? null,
      due_at: dueAt,
      due_time: dueAt ? p.due_time : null,
      notified_at: reminderPassed(dueAt, p.due_time) ? new Date().toISOString() : null,
      priority: p.priority,
      tags: activeTag && !p.tags.includes(activeTag) ? [...p.tags, activeTag] : p.tags,
      recurrence: p.recurrence,
    };
    const tempId = crypto.randomUUID();
    const temp: Task = { id: tempId, done: false, done_at: null, snoozed_until: null, created_at: new Date().toISOString(), ...fields };
    setTasks((prev) => [temp, ...prev]);
    const { data, error } = await supabase.from("tasks").insert({ id: tempId, ...fields }).select(TASK_COLS).single();
    if (error) {
      setTasks((prev) => prev.filter((x) => x.id !== tempId));
      setError(error.message);
    } else {
      const row = data as unknown as Task;
      setTasks((prev) => (prev.some((x) => x.id === row.id) ? prev.map((x) => (x.id === row.id ? row : x)) : [row, ...prev]));
    }
  }

  async function patch(task: Task, changes: Partial<Task>) {
    // Mudou prazo ou horário: o lembrete vale de novo (a menos que o horário já tenha passado)
    if ("due_at" in changes || "due_time" in changes) {
      const due = "due_at" in changes ? changes.due_at ?? null : task.due_at;
      const time = "due_time" in changes ? changes.due_time ?? null : task.due_time;
      changes = { ...changes, notified_at: reminderPassed(due, time) ? new Date().toISOString() : null };
    }
    setTasks((prev) => prev.map((x) => (x.id === task.id ? { ...x, ...changes } : x)));
    const { error } = await supabase.from("tasks").update(changes).eq("id", task.id);
    if (error) {
      setTasks((prev) => prev.map((x) => (x.id === task.id ? task : x)));
      setError(error.message);
    }
  }

  function toggle(t: Task) {
    // Tarefa recorrente que está "dormindo": traz de volta agora
    if (isDormant(t)) {
      patch(t, { snoozed_until: null, done_at: null });
      return;
    }
    // Tarefa recorrente: vai para a próxima data e some da lista até chegar perto dela
    if (!t.done && t.recurrence && t.due_at) {
      const next = nextDue(t.due_at, t.recurrence);
      const until = snoozeUntil(next, t.recurrence);
      patch(t, { due_at: next, snoozed_until: until, ...(until ? { done_at: new Date().toISOString() } : {}) });
      toast(until ? `Concluída. Volta ${until === tomorrow() ? "amanhã" : "em " + fmt(until)}` : `Próxima em ${fmt(next)}`, {
        onUndo: () => patch(t, { due_at: t.due_at, snoozed_until: t.snoozed_until, done_at: t.done_at }),
      });
      return;
    }
    patch(t, { done: !t.done, done_at: t.done ? null : new Date().toISOString() });
  }

  function remove(task: Task) {
    hide(task.id);
    toast("Tarefa excluída", {
      onUndo: () => unhide(task.id),
      onCommit: async () => {
        await purgeFiles({ taskId: task.id });
        const { error } = await supabase.from("tasks").delete().eq("id", task.id);
        if (error) setError(error.message);
        else {
          setTasks((prev) => prev.filter((x) => x.id !== task.id));
          setAttachments((prev) => prev.filter((a) => a.task_id !== task.id));
        }
        unhide(task.id);
      },
    });
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

  function renderTask(t: Task) {
    const overdue = !t.done && t.due_at !== null && t.due_at < t0;
    const dormant = isDormant(t);
    const li = lists.findIndex((l) => l.id === t.list_id);
    const color = li >= 0 ? listColor(lists[li], li) : "var(--muted)";
    const ln = li >= 0 ? lists[li].name : undefined;
    return (
      <li key={t.id} className={t.done || dormant ? "done" : ""} style={cv(color)}>
        <div className="row">
          <input type="checkbox" checked={t.done || dormant} onChange={() => toggle(t)} aria-label={`Concluir ${t.title}`} />
          {editingId === t.id ? (
            <input className="edit" autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => onEditKey(e, t)} onBlur={() => saveEdit(t)} />
          ) : (
            <span className="title" onDoubleClick={() => { setEditingId(t.id); setEditText(t.title); }} title="Clique duas vezes para editar">
              {t.title}
            </span>
          )}
          <span className="badges">
            {t.priority > 0 && <span className={`badge p${t.priority}`}>{PRIORITY[t.priority]}</span>}
            {dormant && t.snoozed_until && <span className="badge">Volta {t.snoozed_until === tomorrow() ? "amanhã" : "em " + fmt(t.snoozed_until)}</span>}
            {t.due_at && <span className={`badge${overdue ? " late" : ""}`}>{overdue ? "Atrasada " : ""}{fmt(t.due_at)}{t.due_time ? ` ${t.due_time.slice(0, 5)}` : ""}</span>}
            {t.recurrence && <span className="badge">{RECURRENCE_LABEL[t.recurrence] ?? t.recurrence}</span>}
            {ln && !currentList && <span className="badge list">{ln}</span>}
            {(attCount.get(t.id) ?? 0) > 0 && (
              <button type="button" className="badge btn" onClick={() => setOpenId(t.id)}>
                {attCount.get(t.id)} {attCount.get(t.id) === 1 ? "anexo" : "anexos"}
              </button>
            )}
            {(t.tags ?? []).map((g) => (
              <span key={g} className="badge">#{g}</span>
            ))}
          </span>
          <button className="ghost" aria-expanded={openId === t.id} onClick={() => setOpenId(openId === t.id ? null : t.id)}>
            Detalhes
          </button>
        </div>
        {openId === t.id && (
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
                {Object.entries(RECURRENCE_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
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
            <div className="tagsfield">
              <span className="lbl">Etiquetas</span>
              <TagInput tags={t.tags ?? []} onChange={(tags) => patch(t, { tags })} suggestions={allTags} listId={`tags-task-${t.id}`} />
            </div>
            <div className="tagsfield">
              <span className="lbl">Anexos</span>
              <Attachments taskId={t.id} />
            </div>
            <button className="ghost danger" onClick={() => remove(t)}>Excluir tarefa</button>
          </div>
        )}
      </li>
    );
  }

  const heading = TITLES[view] ?? currentList?.name ?? "Tarefas";
  const headColor = currentList ? listColor(currentList, listIdx) : "var(--ink)";
  const hasPreview = title.trim() && (parsed.due_at || parsed.priority || parsed.listId || parsed.tags.length || parsed.recurrence);
  const late = view === "today" ? items.filter((t) => (t.due_at ?? "") < t0) : [];
  const rest = view === "today" ? items.filter((t) => (t.due_at ?? "") >= t0) : items;

  return (
    <section>
      <div className="headrow">
        <h2 className="heading" style={cv(headColor)}>{heading}</h2>
        {currentList && (
          <button className="ghost" aria-expanded={editingList} onClick={() => setEditingList((v) => !v)}>Editar lista</button>
        )}
      </div>
      {editingList && currentList && <ListEditor key={currentList.id} list={currentList} index={listIdx} onClose={() => setEditingList(false)} />}

      <form className="quick" onSubmit={add}>
        <input ref={inputRef} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nova tarefa (ex.: pagar luz amanhã #casa !alta)" aria-label="Nova tarefa" enterKeyHint="done" />
        <button className="primary">Adicionar</button>
      </form>
      {hasPreview && (
        <div className="preview" aria-live="polite">
          {parsed.due_at && <span className="chip static">Prazo: {describeDate(parsed.due_at)}{parsed.due_time ? ` às ${parsed.due_time}` : ""}</span>}
          {parsed.recurrence && <span className="chip static">{RECURRENCE_LABEL[parsed.recurrence]}</span>}
          {parsed.priority > 0 && <span className="chip static">Prioridade: {PRIORITY[parsed.priority]}</span>}
          {parsed.listId && <span className="chip static">Lista: {lists.find((l) => l.id === parsed.listId)?.name}</span>}
          {parsed.tags.map((g) => (
            <span key={g} className="chip static">#{g}</span>
          ))}
        </div>
      )}

      <input className="search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tarefas" aria-label="Buscar tarefas" />

      {tagCounts.length > 0 && (
        <div className="tagbar" role="group" aria-label="Filtrar por etiqueta">
          <button className="tagchip" aria-pressed={activeTag === null} onClick={() => setTagFilter(null)}>Todas</button>
          {tagCounts.map(([g, c]) => (
            <button key={g} className="tagchip" aria-pressed={activeTag === g} onClick={() => setTagFilter(activeTag === g ? null : g)}>
              #{g} <span>{c}</span>
            </button>
          ))}
        </div>
      )}

      {(error || loadError) && (
        <p className="error" role="alert">
          {error ?? loadError} <button className="ghost" onClick={() => setError(null)}>Fechar</button>
        </p>
      )}

      {loading ? (
        <p className="empty">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="empty">
          {q || activeTag ? "Nenhuma tarefa encontrada." : view === "today" ? "Nada para hoje. Defina um prazo nas tarefas ou adicione uma aqui." : "Nenhuma tarefa aqui."}
        </p>
      ) : (
        <>
          {late.length > 0 && (
            <>
              <h3 className="group-label late">Atrasadas ({late.length})</h3>
              <ul className="list">{late.map(renderTask)}</ul>
              {rest.length > 0 && <h3 className="group-label">Hoje</h3>}
            </>
          )}
          {rest.length > 0 && <ul className="list">{rest.map(renderTask)}</ul>}
        </>
      )}
    </section>
  );
}
