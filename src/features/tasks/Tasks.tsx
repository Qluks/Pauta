import { CSSProperties, FormEvent, KeyboardEvent, MouseEvent, useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { Task } from "../../lib/types";
import { cv, listColor } from "../../lib/colors";
import { TASK_COLS, useData } from "../../lib/data";
import { useToast } from "../../components/Toast";
import { dayHint, describeDate, doneToday, fmt, isDormant, isoDate, nextMondayIso, periodOf, PERIODS, PRIORITY, reminderPassed, today, tomorrow } from "../../lib/util";
import { nextDue, recurrenceLabel, snoozeUntil } from "../../lib/parse";
import ListEditor from "../../components/ListEditor";
import TaskSheet from "./TaskSheet";
import DayLine, { type Stop } from "../../components/DayLine";
import { ListSkeleton } from "../../components/Skeleton";
import EmptyState from "../../components/EmptyState";
import Menu, { type MenuItem } from "../../components/Menu";
import { readAppearance } from "../../lib/appearance";
import { saveTaskFilter, useSavedTaskFilters, type SavedTaskFilter } from "./savedFilters";
import CaptureSheet from "../../components/CaptureSheet";

const TITLES: Record<string, string> = { today: "Hoje", upcoming: "Próximas", week: "Semana", all: "Todas", done: "Concluídas" };
const weekStartOf = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(year, month - 1, day);
  value.setDate(value.getDate() - ((value.getDay() + 6) % 7));
  return isoDate(value);
};
const moveDate = (date: string, days: number) => {
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(year, month - 1, day);
  value.setDate(value.getDate() + days);
  return isoDate(value);
};

export default function Tasks({ view, openRequest, onHandled }: { view: string; openRequest?: { id: string; n: number } | null; onHandled?: () => void }) {
  const { tasks, setTasks, lists, attachments, setAttachments, purgeFiles, loading, loadError, reload, hide, unhide } = useData();
  const toast = useToast();
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
  const [weekStart, setWeekStart] = useState(() => weekStartOf(today()));
  const [mobileWeekDate, setMobileWeekDate] = useState(() => today());
  const [listFilter, setListFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [dueFilter, setDueFilter] = useState<SavedTaskFilter["due"]>("any");
  const [filterName, setFilterName] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createDueAt, setCreateDueAt] = useState<string | null>(null);
  const savedFilters = useSavedTaskFilters();
  const prevAllDone = useRef<boolean | null>(null);
  const celeTimer = useRef<number | undefined>(undefined);
  const t0 = today();
  const currentWeekStart = weekStartOf(t0);
  const currentWeekEnd = moveDate(currentWeekStart, 6);
  const attCount = new Map<string, number>();
  for (const a of attachments) if (a.task_id) attCount.set(a.task_id, (attCount.get(a.task_id) ?? 0) + 1);
  const listIdx = view.startsWith("list:") ? lists.findIndex((l) => `list:${l.id}` === view) : -1;
  const currentList = listIdx >= 0 ? lists[listIdx] : undefined;
  const selectedSavedFilter = view.startsWith("saved:") ? savedFilters.find((filter) => `saved:${filter.id}` === view) : undefined;
  const weekDates = Array.from({ length: 7 }, (_, index) => moveDate(weekStart, index));
  const weekEnd = weekDates[6];
  const defaultWeekDueAt = t0 >= weekStart && t0 <= weekEnd ? t0 : weekStart;
  const savedHeading = selectedSavedFilter?.name;
  const openTask = openId ? tasks.find((t) => t.id === openId) : undefined;
  function startCreating(dueAt?: string) {
    setCreateDueAt(dueAt ?? null);
    setCreating(true);
  }
  useEffect(() => {
    setMobileWeekDate(t0 >= weekStart && t0 <= weekEnd ? t0 : weekStart);
  }, [weekStart]);
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
    if (!selectedSavedFilter) return;
    setListFilter(selectedSavedFilter.listId);
    setTagFilter(selectedSavedFilter.tag || null);
    setPriorityFilter(selectedSavedFilter.priority);
    setDueFilter(selectedSavedFilter.due);
    setQuery(selectedSavedFilter.query ?? "");
  }, [selectedSavedFilter?.id]);

  useEffect(() => {
    const onCreate = () => startCreating();
    window.addEventListener("pauta:new-task", onCreate);
    return () => window.removeEventListener("pauta:new-task", onCreate);
  }, []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (document.querySelector(".sheet-backdrop, .modal-backdrop, .menu-backdrop")) return;
      if (e.key === "n" && !e.ctrlKey && !e.metaKey && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        e.preventDefault();
        startCreating();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Tarefas da tela atual
  const inView = (t: Task) => {
    if (view === "done") return t.done || isDormant(t);
    if (view === "week") return !isDormant(t) && !!t.due_at && t.due_at >= weekStart && t.due_at <= weekEnd;
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
  const activeTag = tagFilter;
  const activeFilterCount = Number(!!listFilter) + Number(!!priorityFilter) + Number(dueFilter !== "any") + Number(!!activeTag);
  const q = query.trim().toLowerCase();
  const items = base
    .filter((t) => !activeTag || (t.tags ?? []).includes(activeTag))
    .filter((t) => !listFilter || t.list_id === listFilter)
    .filter((t) => !priorityFilter || t.priority === Number(priorityFilter))
    .filter((t) => {
      if (dueFilter === "today") return t.due_at === t0;
      if (dueFilter === "overdue") return !!t.due_at && t.due_at < t0 && !t.done;
      if (dueFilter === "week") return !!t.due_at && t.due_at >= currentWeekStart && t.due_at <= currentWeekEnd;
      if (dueFilter === "unscheduled") return !t.due_at;
      return true;
    })
    .filter((t) => `${t.title} ${(t.tags ?? []).join(" ")}`.toLowerCase().includes(q))
    .sort((x, y) => {
      const a = orig(x);
      const b = orig(y);
      return view === "done"
        ? (b.done_at ?? "").localeCompare(a.done_at ?? "")
        : (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999") || (a.due_time ?? "99:99").localeCompare(b.due_time ?? "99:99") || b.priority - a.priority || b.created_at.localeCompare(a.created_at);
    });

  function saveCurrentFilter(e: FormEvent) {
    e.preventDefault();
    const name = filterName.trim();
    if (!name) return;
    try {
      saveTaskFilter({ name, query, listId: listFilter, tag: tagFilter ?? "", priority: priorityFilter, due: dueFilter });
      setFilterName("");
      setError(null);
    } catch (saveError) {
      setError(`Não foi possível salvar o filtro: ${saveError instanceof Error ? saveError.message : String(saveError)}`);
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

  async function duplicate(task: Task) {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const copy: Task = {
      ...task,
      id,
      done: false,
      done_at: null,
      created_at: createdAt,
      snoozed_until: null,
      notified_at: null,
      checklist: (task.checklist ?? []).map((item) => ({ ...item, done: false })),
    };
    setTasks((prev) => [copy, ...prev]);
    try {
      const { data, error } = await supabase
        .from("tasks")
        .insert({
          id,
          title: copy.title,
          done: false,
          done_at: null,
          created_at: createdAt,
          due_at: copy.due_at,
          due_time: copy.due_time,
          priority: copy.priority,
          list_id: copy.list_id,
          tags: copy.tags,
          recurrence: copy.recurrence,
          snoozed_until: null,
          notified_at: null,
          checklist: copy.checklist,
        })
        .select(TASK_COLS)
        .single();
      if (error) {
        setTasks((prev) => prev.filter((item) => item.id !== id));
        setError(error.message);
        return;
      }
      setTasks((prev) => prev.map((item) => (item.id === id ? (data as Task) : item)));
      toast((attCount.get(task.id) ?? 0) > 0 ? "Tarefa duplicada. Os anexos não foram copiados." : "Tarefa duplicada");
    } catch (error) {
      setTasks((prev) => prev.filter((item) => item.id !== id));
      setError(error instanceof Error ? error.message : String(error));
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
      const checklist = (t.checklist ?? []).map((item) => ({ ...item, done: false }));
      if (!inView({ ...t, due_at: next, snoozed_until: until })) leave(t);
      patch(t, { due_at: next, snoozed_until: until, checklist, ...(until ? { done_at: new Date().toISOString() } : {}) });
      toast(until ? `Concluída. Volta ${until === tomorrow() ? "amanhã" : "em " + fmt(until)}` : `Próxima em ${fmt(next)}`, {
        onUndo: () => patch(t, { due_at: t.due_at, snoozed_until: t.snoozed_until, done_at: t.done_at, checklist: t.checklist }),
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
  function openTaskActions(e: MouseEvent<HTMLButtonElement>, task: Task) {
    const items: MenuItem[] = [
      ...(!task.done && !isDormant(task) ? snoozeItems(task) : []),
      { label: "Editar tarefa", onSelect: () => { setEditingId(task.id); setEditText(task.title); } },
      { label: openId === task.id ? "Fechar detalhes" : "Ver detalhes", onSelect: () => setOpenId(openId === task.id ? null : task.id) },
    ];
    setMenu({ rect: e.currentTarget.getBoundingClientRect(), label: `Ações da tarefa ${task.title}`, items });
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
          <div className="task-primary">
            <input type="checkbox" checked={t.done || dormant} onChange={() => toggle(t)} aria-label={`Concluir ${t.title}`} />
            {editingId === t.id ? (
              <input className="edit" autoFocus value={editText} onChange={(e) => setEditText(e.target.value)} onKeyDown={(e) => onEditKey(e, t)} onBlur={() => saveEdit(t)} aria-label="Editar título da tarefa" />
            ) : (
              <span className="title" onDoubleClick={() => { setEditingId(t.id); setEditText(t.title); }} title="Clique duas vezes para editar">
                <span className="ttext">{t.title}</span>
              </span>
            )}
            <div className="task-actions">
              <button type="button" className="ghost mobile-task-more" aria-label={`Mais ações para ${t.title}`} aria-haspopup="menu" onClick={(event) => openTaskActions(event, t)}>
                <span aria-hidden="true">•••</span>
                <span>Mais</span>
              </button>
              {!t.done && !dormant && (
                <button className="ghost" aria-haspopup="menu" onClick={(e) => openSnooze(e, t)}>Adiar</button>
              )}
              <button
                className="ghost"
                onClick={() => {
                  setEditingId(t.id);
                  setEditText(t.title);
                }}
                aria-label={`Editar tarefa ${t.title}`}
              >
                Editar
              </button>
              <button className="ghost" aria-expanded={openId === t.id} onClick={() => setOpenId(openId === t.id ? null : t.id)}>
                Detalhes
              </button>
            </div>
          </div>
          <span className="badges">
            {t.priority > 0 && <span className={`badge p${t.priority}`}>{PRIORITY[t.priority]}</span>}
            {dormant && t.snoozed_until && <span className="badge">Volta {t.snoozed_until === tomorrow() ? "amanhã" : "em " + fmt(t.snoozed_until)}</span>}
            {t.due_at && <span className={`badge${overdue ? " late" : ""}`}>{overdue ? "Atrasada " : ""}{fmt(t.due_at)}{t.due_time ? ` ${t.due_time.slice(0, 5)}` : ""}</span>}
            {t.recurrence && <span className="badge">{recurrenceLabel(t.recurrence)}</span>}
            {(t.checklist ?? []).length > 0 && (
              <button type="button" className="badge btn" onClick={() => setOpenId(t.id)} aria-label={`Abrir checklist da tarefa ${t.title}`}>
                {(t.checklist ?? []).filter((item) => item.done).length}/{(t.checklist ?? []).length} itens
              </button>
            )}
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
        </div>
      </li>
    );
  }

  const heading = savedHeading ?? TITLES[view] ?? currentList?.name ?? "Tarefas";
  const headColor = currentList ? listColor(currentList, listIdx) : "var(--ink)";
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
  function calendarEvents(date: string) {
    const group = items.filter((task) => orig(task).due_at === date);
    if (!group.length) return <p className="calendar-empty">Sem tarefas para este dia.</p>;
    return (
      <ul className="calendar-events">
        {group.map((task) => {
          const taskList = lists.find((list) => list.id === task.list_id);
          const listIndex = lists.findIndex((list) => list.id === task.list_id);
          return (
            <li key={task.id} className={`calendar-event${task.done ? " is-done" : ""}`} style={cv(taskList ? listColor(taskList, listIndex) : "var(--ink)")}>
              <input type="checkbox" checked={task.done} onChange={() => toggle(task)} aria-label={`Concluir ${task.title}`} />
              <button type="button" className="calendar-event-title" onClick={() => setOpenId(task.id)} title={task.title}>{task.title}</button>
              {task.due_time && <time>{task.due_time.slice(0, 5)}</time>}
            </li>
          );
        })}
      </ul>
    );
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
      ? { title: "Nada para hoje.", hint: "Use Nova tarefa para adicionar algo ao seu dia." }
      : view === "done"
      ? { title: "Nada concluído ainda.", hint: "As tarefas que você concluir aparecem aqui." }
      : view === "upcoming"
      ? { title: "Nenhuma tarefa futura.", hint: "Dê um prazo a uma tarefa. Ex.: Reunião sexta às 15h" }
      : { title: "Nenhuma tarefa aqui.", hint: "Use Nova tarefa para adicionar uma tarefa." };

  return (
    <section>
      <div className="headrow">
        <h2 className="heading" style={cv(headColor)}>{heading}</h2>
        <div className="head-actions">
          <button type="button" className="primary create-button" onClick={() => startCreating(view === "week" ? defaultWeekDueAt : undefined)}>Nova tarefa</button>
          {currentList && (
          <button className="ghost" aria-expanded={editingList} onClick={() => setEditingList((v) => !v)}>Editar lista</button>
          )}
        </div>
      </div>
      {editingList && currentList && <ListEditor key={currentList.id} list={currentList} index={listIdx} onClose={() => setEditingList(false)} />}
      {view === "today" && !loading && <DayLine stops={dayStops} celebrate={celebrate} />}
      {view === "week" && (
        <div className="week-nav" role="group" aria-label="Navegar entre semanas">
          <button type="button" className="chipbtn" onClick={() => setWeekStart(moveDate(weekStart, -7))} aria-label="Semana anterior">←</button>
          <span>{fmt(weekStart)} – {fmt(weekEnd)}</span>
          <button type="button" className="chipbtn" onClick={() => setWeekStart(weekStartOf(today()))}>Esta semana</button>
          <button type="button" className="chipbtn" onClick={() => setWeekStart(moveDate(weekStart, 7))} aria-label="Próxima semana">→</button>
        </div>
      )}

      <input className="search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tarefas" aria-label="Buscar tarefas" />

      <div className={`task-filters${filtersOpen ? " is-open" : ""}`} role="group" aria-label="Filtros de tarefas">
        <button type="button" className="mobile-filter-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}>
          <span>Filtros</span>
          {activeFilterCount > 0 && <span className="active-filter">{activeFilterCount}</span>}
          <span className="filter-chevron" aria-hidden="true">{filtersOpen ? "−" : "+"}</span>
        </button>
        <label>
          <span className="sr-only">Filtrar por lista</span>
          <select value={listFilter} onChange={(e) => setListFilter(e.target.value)} aria-label="Filtrar por lista">
            <option value="">Todas as listas</option>
            {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Filtrar por prioridade</span>
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} aria-label="Filtrar por prioridade">
            <option value="">Todas as prioridades</option>
            {PRIORITY.slice(1).map((priority, index) => <option key={priority} value={index + 1}>{priority}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Filtrar por prazo</span>
          <select value={dueFilter} onChange={(e) => setDueFilter(e.target.value as SavedTaskFilter["due"])} aria-label="Filtrar por prazo">
            <option value="any">Qualquer prazo</option>
            <option value="today">Prazo hoje</option>
            <option value="overdue">Atrasadas</option>
            <option value="week">Esta semana</option>
            <option value="unscheduled">Sem prazo</option>
          </select>
        </label>
        <form className="save-filter" onSubmit={saveCurrentFilter}>
          <input value={filterName} onChange={(e) => setFilterName(e.target.value)} placeholder="Nome do filtro" aria-label="Nome do filtro salvo" />
          <button type="submit" className="chipbtn" disabled={!filterName.trim()}>Salvar filtro</button>
        </form>
        {tagCounts.length > 0 && (
          <div className="task-filter-tags tagbar" role="group" aria-label="Filtrar por etiqueta">
            <button className="tagchip" aria-pressed={activeTag === null} onClick={() => setTagFilter(null)}>Todas</button>
            {tagCounts.map(([g, c]) => (
              <button key={g} className="tagchip" aria-pressed={activeTag === g} onClick={() => setTagFilter(activeTag === g ? null : g)}>
                #{g} <span>{c}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {(error || loadError) && (
        <p className="error" role="alert">
          {error ?? loadError}
          {loadError && <button className="ghost" onClick={() => void reload()}>Tentar novamente</button>}
          {error && <button className="ghost" onClick={() => setError(null)}>Fechar</button>}
        </p>
      )}

      {loading ? (
        <ListSkeleton />
      ) : loadError?.includes("Tarefas:") || (view.startsWith("list:") && loadError?.includes("Listas:")) ? (
        null
      ) : items.length === 0 && view !== "week" ? (
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
          {view === "week" ? (
            <div className="calendar-week" aria-label={`Semana de ${fmt(weekStart)} a ${fmt(weekEnd)}`}>
              <div className="calendar-mobile-picker" role="group" aria-label="Escolher dia da semana">
                {weekDates.map((date) => {
                  const dayName = new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
                  const dayCount = items.filter((task) => orig(task).due_at === date).length;
                  return (
                    <button
                      key={date}
                      type="button"
                      className="calendar-mobile-date"
                      aria-pressed={mobileWeekDate === date}
                      aria-label={`${dayName}, ${fmt(date)}${date === t0 ? ", hoje" : ""}, ${dayCount} tarefas`}
                      onClick={() => setMobileWeekDate(date)}
                    >
                      <span>{dayName}</span>
                      <strong>{new Date(`${date}T12:00:00`).getDate()}</strong>
                      <i aria-hidden="true" className={dayCount ? "has-events" : ""} />
                    </button>
                  );
                })}
              </div>
              <section className="calendar-mobile-agenda" aria-label={`Tarefas de ${fmt(mobileWeekDate)}`}>
                <header className="calendar-mobile-agenda-head">
                  <h3>{new Date(`${mobileWeekDate}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</h3>
                  <button type="button" className="calendar-add" aria-label={`Criar tarefa em ${fmt(mobileWeekDate)}`} onClick={() => startCreating(mobileWeekDate)}>+</button>
                </header>
                {calendarEvents(mobileWeekDate)}
              </section>
              <div className="calendar-desktop-grid">
                {weekDates.map((date) => {
                  const dayName = new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "short" });
                  const isToday = date === t0;
                  return (
                    <section key={date} className={`calendar-cell${isToday ? " is-today" : ""}`} aria-label={`${dayName}, ${fmt(date)}${isToday ? ", hoje" : ""}`}>
                      <header className="calendar-cell-head">
                        <div><span>{dayName.replace(".", "")}</span><strong>{new Date(`${date}T12:00:00`).getDate()}</strong></div>
                        <button type="button" className="calendar-add" aria-label={`Criar tarefa em ${fmt(date)}`} onClick={() => startCreating(date)}>+</button>
                      </header>
                      {calendarEvents(date)}
                    </section>
                  );
                })}
              </div>
            </div>
          )
            : view === "upcoming"
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
        <TaskSheet key={openTask.id} task={openTask} lists={lists} allTags={allTags} patch={patch} remove={remove} duplicate={duplicate} onClose={() => setOpenId(null)} />
      )}
      {creating && <CaptureSheet view={view} mode="task" initialTag={activeTag} initialDueAt={createDueAt ?? (view === "week" ? defaultWeekDueAt : undefined)} onClose={() => { setCreating(false); setCreateDueAt(null); }} onCreated={(id) => { setFresh(id); window.setTimeout(() => setFresh(null), 1600); }} />}
    </section>
  );
}
