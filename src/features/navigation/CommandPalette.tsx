import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useData } from "../../lib/data";
import { useAddTask } from "../tasks/addTask";
import { useAddNote } from "../notes/addNote";
import { useToast } from "../../components/Toast";
import { fmt, today } from "../../lib/util";
import { readAppearance, saveAppearance } from "../../lib/appearance";
import { useSavedTaskFilters } from "../tasks/savedFilters";
import { useDialogFocus } from "../../lib/useDialogFocus";

type Item = { id: string; group: string; label: string; hint?: string; run: () => void };
type SearchScope = "all" | "tasks" | "notes";
type Props = {
  view: string;
  setView: (v: string) => void;
  onClose: () => void;
  onOpenTask: (id: string) => void;
  onOpenNote: (id: string, archived: boolean) => void;
  onSettings: () => void;
  onHelp: () => void;
};

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const SCREENS: [string, string][] = [["today", "Hoje"], ["upcoming", "Próximas"], ["week", "Semana"], ["all", "Todas"], ["done", "Concluídas"], ["notes", "Notas"], ["archive", "Arquivo"]];

export default function CommandPalette({ view, setView, onClose, onOpenTask, onOpenNote, onSettings, onHelp }: Props) {
  const { tasks, notes, lists } = useData();
  const savedFilters = useSavedTaskFilters();
  const addTask = useAddTask();
  const addNote = useAddNote();
  const toast = useToast();
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);
  const [scope, setScope] = useState<SearchScope>("all");
  const listRef = useRef<HTMLUListElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef);

  const items = useMemo<Item[]>(() => {
    const q = text.trim();
    const tokens = norm(q).split(/\s+/).filter(Boolean);
    const ok = (s: string) => tokens.every((t) => norm(s).includes(t));
    const actions: Item[] = [
      { id: "a-task", group: "Ações", label: "Nova tarefa", run: () => { if (view === "notes" || view === "archive") setView("today"); setTimeout(() => window.dispatchEvent(new Event("pauta:new-task")), 90); } },
      { id: "a-note", group: "Ações", label: "Nova nota", run: () => { setView("notes"); setTimeout(() => window.dispatchEvent(new Event("pauta:new-note")), 90); } },
      {
        id: "a-theme", group: "Ações", label: "Alternar tema claro/escuro",
        run: () => {
          const a = readAppearance();
          const dark = a.theme === "dark" || (a.theme === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
          saveAppearance({ ...a, theme: dark ? "light" : "dark" });
        },
      },
      { id: "a-set", group: "Ações", label: "Ajustes (aparência e lembretes)", run: onSettings },
      { id: "a-help", group: "Ações", label: "Atalhos e dicas de escrita", hint: "?", run: onHelp },
    ];
    const screens: Item[] = [
      ...SCREENS.map(([v, l]) => ({ id: `s-${v}`, group: "Telas", label: l, run: () => setView(v) })),
      ...lists.map((l) => ({ id: `s-${l.id}`, group: "Telas", label: `Lista: ${l.name}`, run: () => setView(`list:${l.id}`) })),
      ...savedFilters.map((filter) => ({ id: `saved-${filter.id}`, group: "Filtros salvos", label: filter.name, run: () => setView(`saved:${filter.id}`) })),
    ];
    if (!q) return [...actions, ...screens];

    const listName = (id: string | null) => lists.find((l) => l.id === id)?.name;
    const found: Item[] = (scope === "notes" ? [] : tasks
      .filter((t) => ok(`${t.title} ${(t.tags ?? []).join(" ")}`))
      .sort((a, b) => Number(a.done) - Number(b.done) || (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"))
      .slice(0, 8)
      .map((t) => ({ id: `t-${t.id}`, group: "Tarefas", label: t.title, hint: [t.done ? "Concluída" : "", t.due_at ? fmt(t.due_at) : "", listName(t.list_id) ?? "", ...(t.tags ?? []).map((tag) => `#${tag}`)].filter(Boolean).join(" · "), run: () => onOpenTask(t.id) })));
    const foundNotes: Item[] = (scope === "tasks" ? [] : notes
      .filter((n) => ok(`${n.title ?? ""} ${n.body ?? ""} ${(n.tags ?? []).join(" ")} ${(n.checklist ?? []).map((i) => i.text).join(" ")}`))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, 8)
      .map((n) => {
        const checks = n.checklist ?? [];
        const done = checks.filter((item) => item.done).length;
        return {
          id: `n-${n.id}`,
          group: "Notas",
          label: n.title || (n.body ?? "").slice(0, 60) || "Nota",
          hint: [n.archived ? "Arquivo" : "Nota", checks.length ? `${done}/${checks.length} itens` : "", ...(n.tags ?? []).map((tag) => `#${tag}`)].filter(Boolean).join(" · "),
          run: () => onOpenNote(n.id, n.archived),
        };
      }));
    const create: Item[] = [
      { id: "c-task", group: "Criar", label: `Criar tarefa: ${q}`, hint: "Ctrl Enter", run: () => createTask(q) },
      { id: "c-note", group: "Criar", label: `Criar nota: ${q}`, run: () => createNote(q) },
    ];
    return [...found, ...foundNotes, ...screens.filter((s) => ok(s.label)), ...actions.filter((a) => ok(a.label)), ...create];
  }, [text, tasks, notes, lists, savedFilters, view, scope]);

  function createTask(q: string) {
    const r = addTask(q, { view, defaultDueAt: view === "week" ? today() : undefined });
    if (!r) return;
    toast(`“${r.title}” adicionada`);
    r.done.then((m) => m && toast(`Não foi possível salvar: ${m}`));
  }
  function createNote(q: string) {
    const r = addNote(q);
    if (!r) return;
    toast("Nota criada");
    r.done.then((m) => m && toast(`Não foi possível salvar: ${m}`));
  }

  useEffect(() => setActive(0), [text, scope]);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, items]);

  const run = (it?: Item) => {
    if (!it) return;
    onClose();
    it.run();
  };
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if ((e.ctrlKey || e.metaKey) && text.trim()) {
        onClose();
        createTask(text.trim());
      } else run(items[active]);
    }
  }

  let lastGroup = "";
  return createPortal(
    <div className="sheet-backdrop v-palette" onClick={onClose}>
      <div ref={dialogRef} className="palette" role="dialog" aria-modal="true" aria-label="Buscar e executar comandos" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Buscar tarefas, notas e telas, ou digite para criar…"
          role="combobox"
          aria-expanded="true"
          aria-controls="pal-list"
          aria-activedescendant={items[active] ? `pal-${items[active].id}` : undefined}
          aria-label="Buscar"
          autoComplete="off"
        />
        {text.trim() && (
          <div className="pal-filters" role="group" aria-label="Filtrar resultados">
            {([
              ["all", "Tudo"],
              ["tasks", "Tarefas"],
              ["notes", "Notas"],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" className="tagchip" aria-pressed={scope === value} onClick={() => setScope(value)}>
                {label}
              </button>
            ))}
          </div>
        )}
        <ul id="pal-list" ref={listRef} className="pal-list" role="listbox">
          {items.map((it, i) => {
            const head = it.group !== lastGroup ? <li key={`g-${it.group}`} className="pal-group" role="presentation">{it.group}</li> : null;
            lastGroup = it.group;
            return [
              head,
              <li key={it.id} id={`pal-${it.id}`} role="option" aria-selected={i === active} className="pal-item" onMouseMove={() => setActive(i)} onClick={() => run(it)}>
                <span className="pl">{it.label}</span>
                {it.hint && <span className="hint">{it.hint}</span>}
              </li>,
            ];
          })}
        </ul>
        <div className="pal-foot">
          <span><kbd>↑</kbd> <kbd>↓</kbd> navegar</span>
          <span><kbd>Enter</kbd> abrir</span>
          <span><kbd>Ctrl</kbd> <kbd>Enter</kbd> criar tarefa</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
