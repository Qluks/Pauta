import { CSSProperties, FormEvent, KeyboardEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { Task } from "./types";
import { cv, listColor } from "./colors";
import { useData } from "./data";
import { useToast } from "./Toast";
import { dayHint, describeDate, doneToday, fmt, isDormant, nextMondayIso, periodOf, PERIODS, PRIORITY, reminderPassed, today, tomorrow } from "./util";
import { nextDue, parseQuick, RECURRENCE_LABEL, snoozeUntil } from "./parse";
import ListEditor from "./ListEditor";
import TaskSheet from "./TaskSheet";
import { useAddTask } from "./addTask";
import DayLine, { type Stop } from "./DayLine";
import { ListSkeleton } from "./Skeleton";
import EmptyState from "./EmptyState";
import Menu, { type MenuItem } from "./Menu";
import { readAppearance } from "./appearance";

const TITLES: Record<string, string> = { today: "Hoje", upcoming: "Próximas", all: "Todas", done: "Concluídas" };

export default function Tasks({ view, openRequest, onHandled }: { view: string; openRequest?: { id: string; n: number } | null; onHandled?: () => void }) {
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
  const [leaving, setLeaving] = useState<Map<string, Task>>(new Map()); // tarefas que estão saindo da tela com animação
  const [fresh, setFresh] = useState<string | null>(null); // tarefa recém-criada (destaque)
  const [menu, setMenu] = useState<{ rect: DOMRect; items: MenuItem[]; label: string } | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const prevAllDone = useRef<boolean | null>(null);
  const celeTimer = useRef<number | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const addTask = useAddTask();

  const t0 = today();
  const parsed = useMemo(() => parseQuick(title, lists), [title, lists]);
  const attCount = new Map<string, number>();
  for (const a of attachments) if (a.task_id) attCount.set(a.task_id, (attCount.get(a.task_id) ?? 0) + 1);
  const listIdx = view.startsWith("list:") ? lists.findIndex((l) => `list:${l.id}` === view) : -1;
  const currentList = listIdx >= 0 ? lists[listIdx] : undefined;
  const openTask = openId ? tasks.find((t) => t.id === openId) : undefined;
  useEffect(() => {
    if (openId && !tasks.some((t) => t.id === openId)) setOpenId(null); // a tarefa foi excluída
  }, [openId, tasks]);
  // Pedido da paleta de comandos: abrir os detalhes de uma tarefa
  useEffect(() => {
    if (openRequest) {
      setOpenId(openRequest.id);
      onHandled?.();
    }
  }, [openRequest]);

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
  const base = tasks.filter((t) => inView(t) || leaving.has(t.id));
  const orig = (t: Task) => leaving.get(t.id) ?? t; // enquanto sai, mantém a posição e o grupo de antes
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
    .sort((x, y) => {
      const a = orig(x);
      const b = orig(y);
      return view === "done"
        ? (b.done_at ?? "").localeCompare(a.done_at ?? "")
        : (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999") || (a.due_time ?? "99:99").localeCompare(b.due_time ?? "99:99") || b.priority - a.priority || b.created_at.localeCompare(a.created_at);
    });

  function add(e: FormEvent) {
    e.preventDefault();
    const r = addTask(title, { view, listId: currentList?.id ?? null, tag: activeTag });
    if (!r) return;
    setTitle("");
    setFresh(r.id);
    window.setTimeout(() => setFresh(null), 1600);
    r.done.then((msg) => msg && setError(msg));
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

  // Mantém a tarefa na tela enquanto ela "sai" com animação
  function leave(t: Task) {
    setLeaving((m) => new Map(m).set(t.id, t));
    if (openId === t.id) setOpenId(null);
    window.setTimeout(
      () =>
        setLeaving((m) => {
          const n = new Map(m);
          n.delete(t.id);
          return n;
        }),
      850
    );
  }

  function toggle(t: Task) {
    // Tarefa recorrente que está "dormindo": traz de volta agora
    if (isDormant(t)) {
      if (!inView({ ...t, snoozed_until: null })) leave(t);
      patch(t, { snoozed_until: null, done_at: null });
      return;
    }
    // Tarefa recorrente: vai para a próxima data e some da lista até chegar perto dela
    if (!t.done && t.recurrence && t.due_at) {
      const next = nextDue(t.due_at, t.recurrence);
      const until = snoozeUntil(next, t.recurrence);
      if (!inView({ ...t, due_at: next, snoozed_until: until })) leave(t);
      patch(t, { due_at: next, snoozed_until: until, ...(until ? { done_at: new Date().toISOString() } : {}) });
      toast(until ? `Concluída. Volta ${until === tomorrow() ? "amanhã" : "em " + fmt(until)}` : `Próxima em ${fmt(next)}`, {
        onUndo: () => patch(t, { due_at: t.due_at, snoozed_until: t.snoozed_until, done_at: t.done_at }),
      });
      return;
    }
    if (!inView({ ...t, done: !t.done })) leave(t);
    patch(t, { done: !t.done, done_at: t.done ? null : new Date().toISOString() });
  }

  // ---- Adiar ----
  function snoozeTo(t: Task, changes: Partial<Task>, label: string) {
    const prev = { due_at: t.due_at, due_time: t.due_time };
    if (!inView({ ...t, ...changes })) leave(t);
    patch(t, changes);
    toast(`Adiada: ${label}`, { onUndo: () => patch(t, prev) });
  }
  function snoozeItems(t: Task): MenuItem[] {
    const items: MenuItem[] = [];
    const mon = nextMondayIso();
    if (new Date().getHours() < 19 && !(t.due_at === today() && t.due_time?.slice(0, 5) === "20:00"))
      items.push({ label: "Hoje à noite", hint: "20:00", onSelect: () => snoozeTo(t, { due_at: today(), due_time: "20:00" }, "hoje à noite") });
    if (t.due_at !== tomorrow()) items.push({ label: "Amanhã", hint: dayHint(tomorrow()), onSelect: () => snoozeTo(t, { due_at: tomorrow() }, "amanhã") });
    if (t.due_at !== mon) items.push({ label: "Próxima semana", hint: dayHint(mon), onSelect: () => snoozeTo(t, { due_at: mon }, `segunda, ${fmt(mon)}`) });
    items.push({ label: "Escolher data…", onSelect: () => setOpenId(t.id) });
    return items;
  }
  function openSnooze(e: MouseEvent<HTMLButtonElement>, t: Task) {
    setMenu({ rect: e.currentTarget.getBoundingClientRect(), label: `Adiar ${t.title}`, items: snoozeItems(t) });
  }
  function rescheduleLate(e: MouseEvent<HTMLButtonElement>, list: Task[]) {
    const to = (due: string, label: string) => () => {
      const prev = list.map((t) => ({ t, due_at: t.due_at }));
      list.forEach((t) => {
        if (!inView({ ...t, due_at: due })) leave(t);
        patch(t, { due_at: due });
      });
      toast(`${list.length} ${list.length === 1 ? "tarefa reagendada" : "tarefas reagendadas"} para ${label}`, {
        onUndo: () => prev.forEach((p) => patch(p.t, { due_at: p.due_at })),
      });
    };
    const mon = nextMondayIso();
    setMenu({
      rect: e.currentTarget.getBoundingClientRect(),
      label: "Reagendar atrasadas",
      items: [
        { label: "Para hoje", hint: dayHint(today()), onSelect: to(today(), "hoje") },
        { label: "Para amanhã", hint: dayHint(tomorrow()), onSelect: to(tomorrow(), "amanhã") },
        { label: "Para a próxima semana", hint: dayHint(mon), onSelect: to(mon, `segunda, ${fmt(mon)}`) },
      ],
    });
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

  function renderTask(t: Task, index = 0) {
    const isLeaving = leaving.has(t.id);
    const overdue = !t.done && t.due_at !== null && t.due_at < t0;
    const dormant = isDormant(t);
    const li = lists.findIndex((l) => l.id === t.list_id);
    const color = li >= 0 ? listColor(lists[li], li) : "var(--muted)";
    const ln = li >= 0 ? lists[li].name : undefined;
    return (
      <li
        key={t.id}
        className={[t.done || dormant ? "done" : "", isLeaving ? "leaving" : "", fresh === t.id ? "fresh" : ""].filter(Boolean).join(" ")}
        style={{ ...cv(color), "--i": Math.min(index, 10) } as CSSProperties}
      >
        <div className="row">
          <input type="checkbox" checked={t.done || dormant} onChange={() => toggle(t)} aria-label={`Concluir ${t.title}`} />
          {editingId === t.id ? (
            <input className="edit" autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => onEditKey(e, t)} onBlur={() => saveEdit(t)} />
          ) : (
            <span className="title" onDoubleClick={() => { setEditingId(t.id); setEditText(t.title); }} title="Clique duas vezes para editar">
              <span className="ttext">{t.title}</span>
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
          {!t.done && !dormant && (
            <button className="ghost" aria-haspopup="menu" onClick={(e) => openSnooze(e, t)}>Adiar</button>
          )}
          <button className="ghost" aria-expanded={openId === t.id} onClick={() => setOpenId(openId === t.id ? null : t.id)}>
            Detalhes
          </button>
        </div>
      </li>
    );
  }

  const heading = TITLES[view] ?? currentList?.name ?? "Tarefas";
  const headColor = currentList ? listColor(currentList, listIdx) : "var(--ink)";
  const hasPreview = title.trim() && (parsed.due_at || parsed.priority || parsed.listId || parsed.tags.length || parsed.recurrence);
  const late = view === "today" ? items.filter((t) => (orig(t).due_at ?? "") < t0) : [];
  const rest = view === "today" ? items.filter((t) => (orig(t).due_at ?? "") >= t0) : items;

  // Linha do dia (tela Hoje): concluídas hoje primeiro, depois as pendentes
  const dayStops: Stop[] = [];
  if (view === "today") {
    const stopOf = (t: Task, done: boolean): Stop => {
      const i = lists.findIndex((l) => l.id === t.list_id);
      return { id: t.id, done, late: !done && !!t.due_at && t.due_at < t0, color: i >= 0 ? listColor(lists[i], i) : "var(--ink)", title: t.title };
    };
    const finished = tasks.filter((t) => (t.done || isDormant(t)) && doneToday(t)).sort((a, b) => (a.done_at ?? "").localeCompare(b.done_at ?? ""));
    const open = tasks
      .filter((t) => !t.done && !isDormant(t) && !!t.due_at && t.due_at <= t0)
      .sort((a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? "") || (a.due_time ?? "99:99").localeCompare(b.due_time ?? "99:99") || b.priority - a.priority);
    dayStops.push(...finished.map((t) => stopOf(t, true)), ...open.map((t) => stopOf(t, false)));
  }

  // Dia concluído: quando a última parada acende, a linha do dia comemora (pode ser desligado em Ajustes)
  const dayDoneAll = dayStops.length > 0 && dayStops.every((s) => s.done);
  useEffect(() => {
    if (view !== "today" || loading) {
      prevAllDone.current = null;
      return;
    }
    if (prevAllDone.current === false && dayDoneAll && readAppearance().cheer) {
      setCelebrate(true);
      window.clearTimeout(celeTimer.current);
      celeTimer.current = window.setTimeout(() => setCelebrate(false), 2200);
    }
    prevAllDone.current = dayDoneAll;
  }, [dayDoneAll, view, loading]);

  const emptyCopy =
    q || activeTag
      ? { title: "Nenhuma tarefa encontrada.", hint: "Tente outra palavra ou limpe o filtro de etiqueta." }
      : view === "today"
      ? { title: "Nada para hoje.", hint: "Adicione uma tarefa acima ou defina um prazo. Ex.: Pagar luz hoje #casa" }
      : view === "done"
      ? { title: "Nada concluído ainda.", hint: "As tarefas que você concluir aparecem aqui." }
      : view === "upcoming"
      ? { title: "Nenhuma tarefa futura.", hint: "Dê um prazo a uma tarefa. Ex.: Reunião sexta às 15h" }
      : { title: "Nenhuma tarefa aqui.", hint: "Digite no campo acima. Ex.: Pagar luz amanhã #casa !alta" };

  return (
    <section>
      <div className="headrow">
        <h2 className="heading" style={cv(headColor)}>{heading}</h2>
        {currentList && (
          <button className="ghost" aria-expanded={editingList} onClick={() => setEditingList((v) => !v)}>Editar lista</button>
        )}
      </div>
      {editingList && currentList && <ListEditor key={currentList.id} list={currentList} index={listIdx} onClose={() => setEditingList(false)} />}
      {view === "today" && !loading && <DayLine stops={dayStops} celebrate={celebrate} />}

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
        <ListSkeleton />
      ) : items.length === 0 ? (
        <EmptyState {...emptyCopy} />
      ) : (
        <>
          {late.length > 0 && (
            <>
              <div className="grouphead">
                <h3 className="group-label late">Atrasadas ({late.length})</h3>
                <button className="ghost" aria-haspopup="menu" onClick={(e) => rescheduleLate(e, late.filter((t) => !leaving.has(t.id)))}>Reagendar</button>
              </div>
              <ul className="list">{late.map(renderTask)}</ul>
              {rest.length > 0 && <h3 className="group-label">Hoje</h3>}
            </>
          )}
          {view === "upcoming"
            ? PERIODS.map((p) => {
                const group = rest.filter((t) => periodOf(orig(t).due_at ?? "") === p.id);
                return group.length > 0 ? (
                  <div key={p.id}>
                    <h3 className="group-plate"><span className="gp-dot" aria-hidden="true" />{p.label}</h3>
                    <ul className="list">{group.map(renderTask)}</ul>
                  </div>
                ) : null;
              })
            : rest.length > 0 && <ul className="list">{rest.map(renderTask)}</ul>}
        </>
      )}
      {menu && <Menu anchor={menu.rect} label={menu.label} items={menu.items} onClose={() => setMenu(null)} />}
      {openTask && (
        <TaskSheet key={openTask.id} task={openTask} lists={lists} allTags={allTags} patch={patch} remove={remove} onClose={() => setOpenId(null)} />
      )}
    </section>
  );
}
