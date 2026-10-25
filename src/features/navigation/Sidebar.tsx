import { PointerEvent, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { List } from "../../lib/types";
import Mark from "../../components/Mark";
import { cv, listColor } from "../../lib/colors";
import { LIST_COLS, useData } from "../../lib/data";
import { isDormant, today } from "../../lib/util";
import { removeTaskFilter, useSavedTaskFilters } from "../tasks/savedFilters";
import ListCreateSheet from "./ListCreateSheet";

type Props = { view: string; setView: (v: string) => void; onSignOut: () => void; onSearch?: () => void; onSettings?: () => void; variant?: "side" | "sheet" };

const VIEWS: { id: string; label: string; gap?: boolean }[] = [
  { id: "today", label: "Hoje" },
  { id: "upcoming", label: "Próximas" },
  { id: "week", label: "Semana" },
  { id: "all", label: "Todas" },
  { id: "done", label: "Concluídas" },
  { id: "notes", label: "Notas", gap: true },
  { id: "archive", label: "Arquivo" },
];

export default function Sidebar({ view, setView, onSignOut, onSearch, onSettings, variant = "side" }: Props) {
  const { tasks, notes, lists, attachments, setLists, reload } = useData();
  const savedFilters = useSavedTaskFilters();
  const [error, setError] = useState<string | null>(null);
  const [creatingList, setCreatingList] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [draggingList, setDraggingList] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; pointerId: number } | null>(null);

  const t0 = today();
  const pending = tasks.filter((t) => !t.done && !isDormant(t));
  const counts: Record<string, number> = {
    today: pending.filter((t) => t.due_at && t.due_at <= t0).length,
    upcoming: pending.filter((t) => t.due_at && t.due_at > t0).length,
    all: pending.length,
    notes: notes.filter((n) => !n.archived).length,
  };

  async function removeList(l: List) {
    const count = tasks.filter((task) => task.list_id === l.id).length;
    const message = count
      ? `Excluir a lista "${l.name}"? ${count} ${count === 1 ? "tarefa ficará" : "tarefas ficarão"} sem lista.`
      : `Excluir a lista "${l.name}"?`;
    if (!window.confirm(message)) return;
    setError(null);
    const { error } = await supabase.from("lists").delete().eq("id", l.id);
    if (error) return setError(error.message);
    setLists((p) => p.filter((x) => x.id !== l.id));
    if (view === `list:${l.id}`) setView("all");
  }

  async function reorderList(sourceId: string, targetId: string) {
    if (reordering) return;
    const from = lists.findIndex((item) => item.id === sourceId);
    const to = lists.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const next = [...lists];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const positioned = next.map((item, position) => ({ ...item, position }));
    setLists(positioned);
    setReordering(true);
    setError(null);
    try {
      const results = await Promise.all(
        positioned.map((item) => supabase.from("lists").update({ position: item.position }).eq("id", item.id))
      );
      const failed = results.find((result) => result.error);
      if (failed?.error) {
        setError(`Não foi possível reordenar as listas: ${failed.error.message}`);
        await reload();
      }
    } catch (error) {
      setError(`Não foi possível reordenar as listas: ${error instanceof Error ? error.message : String(error)}`);
      await reload();
    } finally {
      setReordering(false);
    }
  }

  function startListDrag(event: PointerEvent<HTMLButtonElement>, listId: string) {
    if (reordering || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { id: listId, pointerId: event.pointerId };
    setDraggingList(listId);
    setDropTarget(null);
  }

  function moveListDrag(event: PointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-list-id]");
    const targetId = row?.dataset.listId ?? null;
    setDropTarget(targetId && targetId !== dragRef.current.id ? targetId : null);
  }

  function finishListDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-list-id]");
    const targetId = row?.dataset.listId;
    dragRef.current = null;
    setDraggingList(null);
    setDropTarget(null);
    if (targetId && targetId !== drag.id) void reorderList(drag.id, targetId);
  }

  function cancelListDrag(event: PointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDraggingList(null);
    setDropTarget(null);
  }

  function exportData() {
    const json = JSON.stringify({ exportado_em: new Date().toISOString(), listas: lists, tarefas: tasks, notas: notes, anexos: attachments }, null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `pauta-${t0}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const count = (n: number | undefined) => (n ? <span className="count">{n}</span> : null);

  return (
    <nav className={`side${variant === "sheet" ? " side--sheet" : ""}`} aria-label="Navegação">
      <div className="side-head">
        <h1 className="brand"><Mark /> Pauta</h1>
        <div className="side-actions">
          <button className="ghost" onClick={onSettings}>Ajustes</button>
          <button className="ghost" onClick={exportData} title="Baixar uma cópia dos seus dados (JSON)">Exportar</button>
          <button className="ghost" onClick={onSignOut}>Sair</button>
        </div>
      </div>

      {onSearch && (
        <button className="searchbtn" onClick={onSearch}>
          <span>Buscar</span>
          <kbd>Ctrl K</kbd>
        </button>
      )}

      <ul className="nav">
        {VIEWS.map((v) => (
          <li key={v.id} className={v.gap ? "gap" : undefined}>
            <button aria-current={view === v.id ? "page" : undefined} onClick={() => setView(v.id)}>
              {v.label}
              {count(counts[v.id])}
            </button>
          </li>
        ))}
      </ul>

      {savedFilters.length > 0 && (
        <>
          <h2>Filtros salvos</h2>
          <ul className="nav saved-filter-list">
            {savedFilters.map((filter) => (
              <li key={filter.id} className="with-x">
                <button aria-current={view === `saved:${filter.id}` ? "page" : undefined} onClick={() => setView(`saved:${filter.id}`)}>
                  <span className="saved-filter-mark" aria-hidden="true">
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                      <path d="M3 5h14M3 10h9M3 15h14" />
                      <circle cx="15" cy="10" r="1.5" fill="currentColor" stroke="none" />
                    </svg>
                  </span>
                  <span className="saved-filter-name">{filter.name}</span>
                </button>
                <span className="list-actions">
                  <button
                    type="button"
                    className="ghost danger"
                    aria-label={`Excluir filtro salvo ${filter.name}`}
                    title="Excluir filtro salvo"
                    onClick={() => {
                      try {
                        removeTaskFilter(filter.id);
                        if (view === `saved:${filter.id}`) setView("all");
                      } catch (removeError) {
                        setError(`Não foi possível excluir o filtro: ${removeError instanceof Error ? removeError.message : String(removeError)}`);
                      }
                    }}
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Listas</h2>
      <div className="lists">
        <ul className="nav">
          {lists.map((l, i) => (
            <li
              key={l.id}
              data-list-id={l.id}
              className={`with-x${draggingList === l.id ? " dragging" : ""}${dropTarget === l.id ? " drop-target" : ""}`}
              style={cv(listColor(l, i))}
            >
              <button aria-current={view === `list:${l.id}` ? "page" : undefined} onClick={() => setView(`list:${l.id}`)}>
                <span className="lbadge" style={cv(listColor(l, i))}>{l.name.charAt(0).toUpperCase()}</span>
                {l.name}
                {count(pending.filter((t) => t.list_id === l.id).length)}
              </button>
              <span className="list-actions">
                <button
                  type="button"
                  className="list-drag"
                  disabled={reordering}
                  aria-label={`Arrastar para reordenar a lista ${l.name}`}
                  title="Arraste para reordenar"
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                    event.preventDefault();
                    const target = lists[i + (event.key === "ArrowUp" ? -1 : 1)];
                    if (target) void reorderList(l.id, target.id);
                  }}
                  onPointerDown={(event) => startListDrag(event, l.id)}
                  onPointerMove={moveListDrag}
                  onPointerUp={finishListDrag}
                  onPointerCancel={cancelListDrag}
                  onLostPointerCapture={cancelListDrag}
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
                    <circle cx="5" cy="3" r="1.25" /><circle cx="11" cy="3" r="1.25" />
                    <circle cx="5" cy="8" r="1.25" /><circle cx="11" cy="8" r="1.25" />
                    <circle cx="5" cy="13" r="1.25" /><circle cx="11" cy="13" r="1.25" />
                  </svg>
                </button>
                <button type="button" className="ghost danger" onClick={() => void removeList(l)} aria-label={`Excluir lista ${l.name}`} title="Excluir lista">×</button>
              </span>
            </li>
          ))}
        </ul>
        <button type="button" className="list-create-button" onClick={() => setCreatingList(true)}>+ Criar lista</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {creatingList && <ListCreateSheet onClose={() => setCreatingList(false)} />}
    </nav>
  );
}
