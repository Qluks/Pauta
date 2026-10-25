import { CSSProperties, KeyboardEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { ChecklistItem, Note } from "../../lib/types";
import { cv, lineVar } from "../../lib/colors";
import { NOTE_COLS, useData } from "../../lib/data";
import { useToast } from "../../components/Toast";
import Swatches from "../../components/Swatches";
import TagInput from "../../components/Tags";
import Attachments from "../../components/Attachments";
import { ChecklistEditor, ChecklistView } from "../../components/Checklist";
import { sameTags } from "../../lib/util";
import { NotesSkeleton } from "../../components/Skeleton";
import EmptyState from "../../components/EmptyState";
import Sheet from "../../components/Sheet";
import CaptureSheet from "../../components/CaptureSheet";

const colorOf = (c: string | null) => (c === null ? "var(--rule)" : lineVar(Number(c)));
const clean = (items: ChecklistItem[]) => items.filter((i) => i.text.trim());

export default function Notes({ view, request, onHandled }: { view: string; request?: { id: string; n: number } | null; onHandled?: () => void }) {
  const archive = view === "archive";
  const { notes, setNotes, attachments, setAttachments, purgeFiles, loading, loadError, reload, hide, unhide } = useData();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ title: "", body: "", tags: [] as string[], checklist: [] as ChecklistItem[] });
  const [attOpen, setAttOpen] = useState<string | null>(null);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [draggingNote, setDraggingNote] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [reorderingNotes, setReorderingNotes] = useState(false);
  const noteDragRef = useRef<{ id: string; group: "pinned" | "other" | "archive"; pointerId: number } | null>(null);

  const attCount = new Map<string, number>();
  for (const a of attachments) if (a.note_id) attCount.set(a.note_id, (attCount.get(a.note_id) ?? 0) + 1);

  // Etiquetas da tela atual (com contagem) e todas as etiquetas, para sugestões
  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes) {
      if (n.archived !== archive) continue;
      for (const t of n.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [notes, archive]);
  const allTagNames = useMemo(() => [...new Set(notes.flatMap((n) => n.tags ?? []))].sort(), [notes]);
  const activeTag = tagFilter && tagCounts.some(([t]) => t === tagFilter) ? tagFilter : null;

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (document.querySelector(".sheet-backdrop, .modal-backdrop, .menu-backdrop")) return;
      if (e.key === "n" && !e.ctrlKey && !e.metaKey && !archive && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        e.preventDefault();
        setCreating(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [archive, activeTag]);

  useEffect(() => {
    const open = () => !archive && setCreating(true);
    window.addEventListener("pauta:new-note", open);
    return () => window.removeEventListener("pauta:new-note", open);
  }, [archive]);

  // Pedido da paleta de comandos: rolar até a nota e destacá-la
  useEffect(() => {
    if (!request || loading) return;
    const id = request.id;
    setTagFilter(null);
    setQuery("");
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-note-id="${id}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.classList.add("spot");
      window.setTimeout(() => el?.classList.remove("spot"), 1800);
    }, 80);
    onHandled?.();
  }, [request, loading]);

  // bump=false: marcar item da lista não leva a nota para o topo
  async function patch(note: Note, changes: Partial<Note>, bump = true) {
    const full = bump ? { ...changes, updated_at: new Date().toISOString() } : changes;
    setNotes((p) => p.map((x) => (x.id === note.id ? { ...x, ...full } : x)));
    const { error } = await supabase.from("notes").update(full).eq("id", note.id);
    if (error) {
      setNotes((p) => p.map((x) => (x.id === note.id ? note : x)));
      setError(error.message);
    }
  }

  function remove(note: Note) {
    hide(note.id);
    toast("Nota excluída", {
      onUndo: () => unhide(note.id),
      onCommit: async () => {
        await purgeFiles({ noteId: note.id });
        const { error } = await supabase.from("notes").delete().eq("id", note.id);
        if (error) setError(error.message);
        else {
          setNotes((p) => p.filter((x) => x.id !== note.id));
          setAttachments((p) => p.filter((a) => a.note_id !== note.id));
        }
        unhide(note.id);
      },
    });
  }

  function archiveToggle(n: Note) {
    const prev = { archived: n.archived, pinned: n.pinned };
    patch(n, { archived: !n.archived, pinned: false });
    toast(n.archived ? "Nota desarquivada" : "Nota arquivada", { onUndo: () => patch(n, prev) });
  }

  function startEdit(n: Note) {
    setEditingId(n.id);
    setEdit({ title: n.title ?? "", body: n.body ?? "", tags: n.tags ?? [], checklist: n.checklist ?? [] });
  }
  function saveEdit(n: Note) {
    setEditingId(null);
    const title = edit.title.trim();
    const body = edit.body.trim();
    const checklist = clean(edit.checklist);
    const changed =
      title !== (n.title ?? "") ||
      body !== (n.body ?? "") ||
      !sameTags(edit.tags, n.tags ?? []) ||
      JSON.stringify(checklist) !== JSON.stringify(n.checklist ?? []);
    if (changed) patch(n, { title, body, tags: edit.tags, checklist });
  }
  function toggleItem(n: Note, id: string) {
    patch(n, { checklist: (n.checklist ?? []).map((i) => (i.id === id ? { ...i, done: !i.done } : i)) }, false);
  }
  function ctrlEnter(e: KeyboardEvent, fn: () => void) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") fn();
  }

  async function reorderNotes(sourceId: string, targetId: string, group: "pinned" | "other" | "archive") {
    if (reorderingNotes || sourceId === targetId) return;
    const groupNotes = notes
      .filter((note) => note.archived === archive && (group === "archive" || note.pinned === (group === "pinned")))
      .sort((a, b) => a.position - b.position);
    const from = groupNotes.findIndex((note) => note.id === sourceId);
    const to = groupNotes.findIndex((note) => note.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...groupNotes];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const positioned = next.map((note, position) => ({ ...note, position }));
    setNotes((current) => current.map((note) => positioned.find((item) => item.id === note.id) ?? note));
    setReorderingNotes(true);
    setError(null);
    try {
      const results = await Promise.all(
        positioned.map((note) => supabase.from("notes").update({ position: note.position }).eq("id", note.id))
      );
      const failed = results.find((result) => result.error);
      if (failed?.error) {
        setError(`Não foi possível reordenar as notas: ${failed.error.message}`);
        await reload();
      }
    } catch (reorderError) {
      setError(`Não foi possível reordenar as notas: ${reorderError instanceof Error ? reorderError.message : String(reorderError)}`);
      await reload();
    } finally {
      setReorderingNotes(false);
    }
  }

  function startNoteDrag(event: PointerEvent<HTMLButtonElement>, id: string, group: "pinned" | "other" | "archive") {
    if (q || activeTag || reorderingNotes) return;
    event.preventDefault();
    noteDragRef.current = { id, group, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingNote(id);
  }

  function moveNoteDrag(event: PointerEvent<HTMLButtonElement>) {
    if (noteDragRef.current?.pointerId !== event.pointerId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-note-id]");
    setDropTarget(target?.dataset.noteGroup === noteDragRef.current.group ? target.dataset.noteId ?? null : null);
  }

  function finishNoteDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = noteDragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-note-id]");
    const targetId = target?.dataset.noteGroup === current.group ? target.dataset.noteId ?? dropTarget : null;
    noteDragRef.current = null;
    setDraggingNote(null);
    setDropTarget(null);
    if (targetId) void reorderNotes(current.id, targetId, current.group);
  }

  function cancelNoteDrag() {
    noteDragRef.current = null;
    setDraggingNote(null);
    setDropTarget(null);
  }

  const q = query.trim().toLowerCase();
  const shown = notes
    .filter((n) => n.archived === archive)
    .filter((n) => !activeTag || (n.tags ?? []).includes(activeTag))
    .filter((n) => `${n.title ?? ""} ${n.body ?? ""} ${(n.tags ?? []).join(" ")} ${(n.checklist ?? []).map((i) => i.text).join(" ")}`.toLowerCase().includes(q))
    .sort((a, b) => a.position - b.position || b.updated_at.localeCompare(a.updated_at));
  const pinned = archive ? [] : shown.filter((n) => n.pinned);
  const others = archive ? shown : shown.filter((n) => !n.pinned);
  const expandedNote = expandedNoteId ? notes.find((n) => n.id === expandedNoteId) : undefined;

  const card = (n: Note, i = 0, expanded = false, group?: "pinned" | "other" | "archive") => {
    const count = attCount.get(n.id) ?? 0;
    const checklist = n.checklist ?? [];
    const checklistDone = checklist.filter((item) => item.done).length;
    const summary = n.title || n.body || (checklist.length > 0
      ? `${checklist.length} itens na lista · ${checklistDone} concluídos`
      : count > 0 ? `${count} anexos` : "Abrir nota");
    return (
      <article key={n.id} data-note-id={expanded ? undefined : n.id} data-note-group={group} className={`note${expanded ? " note-expanded" : ""}${draggingNote === n.id ? " dragging" : ""}${dropTarget === n.id ? " drop-target" : ""}`} style={{ ...cv(colorOf(n.color)), "--i": Math.min(i, 8) } as CSSProperties} data-tinted={n.color !== null}>
        {editingId === n.id ? (
          <>
            <input className="ntitle" autoFocus value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="Título" aria-label="Título" />
            <textarea className="nbody" rows={5} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} onKeyDown={(e) => ctrlEnter(e, () => saveEdit(n))} placeholder="Nota" aria-label="Texto da nota" />
            <ChecklistEditor items={edit.checklist} onChange={(checklist) => setEdit({ ...edit, checklist })} />
            <TagInput tags={edit.tags} onChange={(tags) => setEdit({ ...edit, tags })} suggestions={allTagNames} listId="tags-edit" />
            <div className="nactions">
              <button className="primary small" onClick={() => saveEdit(n)}>Salvar</button>
              <button className="ghost" onClick={() => setEditingId(null)}>Cancelar</button>
            </div>
          </>
        ) : (
          <>
            {expanded ? (
              n.body && <p>{n.body}</p>
            ) : (
              <button
                type="button"
                className="note-summary"
                onClick={() => setExpandedNoteId(n.id)}
                aria-label={`Abrir nota: ${summary.replace(/\s+/g, " ").slice(0, 100)}`}
              >
                {n.title && <h3>{n.title}</h3>}
                {n.body && <p>{n.body}</p>}
                {!n.title && !n.body && <span>{summary}</span>}
                {!expanded && (checklist.length > 0 || count > 0) && (
                  <span className="note-preview-meta">
                    {checklist.length > 0 && <span>{checklistDone}/{checklist.length} itens</span>}
                    {count > 0 && <span>{count} {count === 1 ? "anexo" : "anexos"}</span>}
                  </span>
                )}
              </button>
            )}
            {expanded && <ChecklistView items={checklist} onToggle={(id) => toggleItem(n, id)} />}
            {(expanded && count > 0 || attOpen === n.id) && <Attachments noteId={n.id} editable={attOpen === n.id} />}
            {(n.tags ?? []).length > 0 && (
              <div className="ntags">
                {(n.tags ?? []).map((t) => (
                  <button key={t} className="chip tag" onClick={() => setTagFilter(t)} aria-label={`Filtrar pela etiqueta ${t}`}>
                    #{t}
                  </button>
                ))}
              </div>
            )}
            <div className="nactions">
              {!expanded && group && !q && !activeTag && (
                <button
                  type="button"
                  className="ghost note-drag"
                  disabled={reorderingNotes}
                  aria-label={`Arrastar para reordenar a nota ${n.title || summary}`}
                  title="Arraste para reordenar"
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                    event.preventDefault();
                    const groupNotes = notes
                      .filter((note) => note.archived === archive && (group === "archive" || note.pinned === (group === "pinned")))
                      .sort((a, b) => a.position - b.position);
                    const index = groupNotes.findIndex((note) => note.id === n.id);
                    const target = groupNotes[index + (event.key === "ArrowUp" ? -1 : 1)];
                    if (target) void reorderNotes(n.id, target.id, group);
                  }}
                  onPointerDown={(event) => startNoteDrag(event, n.id, group)}
                  onPointerMove={moveNoteDrag}
                  onPointerUp={finishNoteDrag}
                  onPointerCancel={cancelNoteDrag}
                  onLostPointerCapture={cancelNoteDrag}
                >
                  <svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
                    <circle cx="5" cy="3" r="1.25" /><circle cx="11" cy="3" r="1.25" />
                    <circle cx="5" cy="8" r="1.25" /><circle cx="11" cy="8" r="1.25" />
                    <circle cx="5" cy="13" r="1.25" /><circle cx="11" cy="13" r="1.25" />
                  </svg>
                </button>
              )}
              <button className="ghost" onClick={() => startEdit(n)}>Editar</button>
              <button className="ghost" aria-expanded={attOpen === n.id} onClick={() => setAttOpen(attOpen === n.id ? null : n.id)}>
                {attOpen === n.id ? "Fechar anexos" : count > 0 ? `Anexos (${count})` : "Anexar"}
              </button>
              {!archive && (
                <button className="ghost" onClick={() => patch(n, { pinned: !n.pinned })}>{n.pinned ? "Desafixar" : "Fixar"}</button>
              )}
              <button className="ghost" onClick={() => archiveToggle(n)}>{n.archived ? "Desarquivar" : "Arquivar"}</button>
              <button className="ghost danger" onClick={() => remove(n)}>Excluir</button>
            </div>
            <Swatches value={n.color} onPick={(c) => patch(n, { color: c })} />
          </>
        )}
      </article>
    );
  };

  return (
    <section>
      <div className="headrow">
        <h2 className="heading">{archive ? "Arquivo" : "Notas"}</h2>
        {!archive && <button type="button" className="primary create-button" onClick={() => setCreating(true)}>Nova nota</button>}
      </div>

      <input className="search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar notas" aria-label="Buscar notas" />

      {tagCounts.length > 0 && (
        <div className="tagbar" role="group" aria-label="Filtrar por etiqueta">
          <button className="tagchip" aria-pressed={activeTag === null} onClick={() => setTagFilter(null)}>Todas</button>
          {tagCounts.map(([t, c]) => (
            <button key={t} className="tagchip" aria-pressed={activeTag === t} onClick={() => setTagFilter(activeTag === t ? null : t)}>
              #{t} <span>{c}</span>
            </button>
          ))}
        </div>
      )}

      {(error || loadError) && (
        <p className="error" role="alert">
          {error ?? loadError}
          {loadError && <button className="ghost" onClick={() => void reload()}>Tentar novamente</button>}
          {error && <button className="ghost" onClick={() => setError(null)}>Fechar</button>}
        </p>
      )}

      {loading ? (
        <NotesSkeleton />
      ) : loadError?.includes("Notas:") ? (
        null
      ) : shown.length === 0 ? (
        <EmptyState
          title={q || activeTag ? "Nenhuma nota encontrada." : archive ? "Nada arquivado." : "Nenhuma nota ainda."}
          hint={q || activeTag ? "Tente outra palavra ou limpe o filtro." : archive ? "As notas que você arquivar ficam guardadas aqui." : "Crie uma nota pelo botão Nova nota."}
        />
      ) : (
        <>
          {pinned.length > 0 && (
            <>
              <h3 className="group-label">Fixadas</h3>
              <div className="notes">{pinned.map((n, i) => card(n, i, false, "pinned"))}</div>
              {others.length > 0 && <h3 className="group-label">Outras</h3>}
            </>
          )}
          {others.length > 0 && <div className="notes">{others.map((n, i) => card(n, i, false, archive ? "archive" : "other"))}</div>}
        </>
      )}
      {expandedNote && (
        <Sheet
          title={expandedNote.title || "Nota"}
          color={colorOf(expandedNote.color)}
          onClose={() => {
            setExpandedNoteId(null);
            setEditingId(null);
            setAttOpen(null);
          }}
        >
          {card(expandedNote, 0, true)}
        </Sheet>
      )}
      {creating && !archive && <CaptureSheet view={view} mode="note" initialTag={activeTag} onClose={() => setCreating(false)} />}
    </section>
  );
}
