import { CSSProperties, MouseEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ChecklistItem, Note } from "../../lib/types";
import { cv, lineVar } from "../../lib/colors";
import { useData } from "../../lib/data";
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
import Menu, { type MenuItem } from "../../components/Menu";
import MarkdownEditor from "../../components/MarkdownEditor";
import MarkdownContent from "../../components/MarkdownContent";

const colorOf = (c: string | null) => (c === null ? "var(--rule)" : lineVar(Number(c)));
const clean = (items: ChecklistItem[]) => items.filter((i) => i.text.trim());
function isNoteEditDraft(value: unknown): value is { title: string; body: string; tags: string[]; checklist: ChecklistItem[]; color: string | null } {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<{ title: string; body: string; tags: string[]; checklist: ChecklistItem[]; color: string | null }>;
  return typeof draft.title === "string" && typeof draft.body === "string" &&
    Array.isArray(draft.tags) && draft.tags.every((tag) => typeof tag === "string") &&
    Array.isArray(draft.checklist) && draft.checklist.every((item) => !!item && typeof item.id === "string" && typeof item.text === "string" && typeof item.done === "boolean") &&
    (draft.color === null || typeof draft.color === "string");
}

export default function Notes({ view, request, onHandled }: { view: string; request?: { id: string; n: number } | null; onHandled?: () => void }) {
  const archive = view === "archive";
  const { notes, setNotes, attachments, setAttachments, purgeFiles, loading, loadError, reload, hide, unhide, saveMutation, online, ownerId } = useData();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [tagFiltersOpen, setTagFiltersOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ title: "", body: "", tags: [] as string[], checklist: [] as ChecklistItem[], color: null as string | null });
  const [attOpen, setAttOpen] = useState<string | null>(null);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [draggingNote, setDraggingNote] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [reorderingNotes, setReorderingNotes] = useState(false);
  const [noteMenu, setNoteMenu] = useState<{ anchor: DOMRect; label: string; items: MenuItem[] } | null>(null);
  const noteDragRef = useRef<{ id: string; group: "pinned" | "other" | "archive"; pointerId: number } | null>(null);
  const draftKey = ownerId && editingId ? `pauta-draft:${ownerId}:note-edit:${editingId}` : null;

  useEffect(() => {
    if (!draftKey) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(edit));
    } catch (storageError) {
      setError(`Não foi possível salvar o rascunho da nota: ${storageError instanceof Error ? storageError.message : String(storageError)}`);
    }
  }, [draftKey, edit]);

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
    const result = await saveMutation("notes", note.id, "update", full, note);
    if (result.error) {
      setNotes((p) => p.map((x) => (x.id === note.id ? note : x)));
      setError(result.error);
    }
  }

  function remove(note: Note) {
    hide(note.id);
    toast("Nota excluída", {
      onUndo: () => unhide(note.id),
      onCommit: async () => {
        if (online) {
          const cleanupError = await purgeFiles({ noteId: note.id });
          if (cleanupError) {
            setError(cleanupError);
            unhide(note.id);
            return;
          }
        }
        else {
          const removals = await Promise.all(attachments.filter((attachment) => attachment.note_id === note.id).map((attachment) =>
            saveMutation("attachments", attachment.id, "delete", {}, attachment)
          ));
          const failedRemoval = removals.find((result) => result.error);
          if (failedRemoval?.error) {
            setError(`Não foi possível enfileirar a remoção dos anexos: ${failedRemoval.error}`);
            unhide(note.id);
            return;
          }
        }
        const result = await saveMutation("notes", note.id, "delete", {}, note);
        if (result.error) setError(result.error);
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
    const initial = { title: n.title ?? "", body: n.body ?? "", tags: n.tags ?? [], checklist: n.checklist ?? [], color: n.color };
    try {
      const raw = ownerId ? localStorage.getItem(`pauta-draft:${ownerId}:note-edit:${n.id}`) : null;
      const saved: unknown = raw ? JSON.parse(raw) : null;
      setEdit(isNoteEditDraft(saved) ? saved : initial);
    } catch (storageError) {
      setError(`Não foi possível recuperar o rascunho da nota: ${storageError instanceof Error ? storageError.message : String(storageError)}`);
      setEdit(initial);
    }
  }
  function saveEdit(n: Note) {
    setEditingId(null);
    if (ownerId) {
      try {
        localStorage.removeItem(`pauta-draft:${ownerId}:note-edit:${n.id}`);
      } catch (storageError) {
        setError(`A nota foi salva, mas o rascunho local não foi removido: ${storageError instanceof Error ? storageError.message : String(storageError)}`);
      }
    }
    const title = edit.title.trim();
    const body = edit.body.trim();
    const checklist = clean(edit.checklist);
    const changed =
      title !== (n.title ?? "") ||
      body !== (n.body ?? "") ||
      !sameTags(edit.tags, n.tags ?? []) ||
      JSON.stringify(checklist) !== JSON.stringify(n.checklist ?? []) ||
      edit.color !== n.color;
    if (changed) patch(n, { title, body, tags: edit.tags, checklist, color: edit.color });
  }
  function openNoteMenu(event: MouseEvent<HTMLButtonElement>, note: Note, count: number) {
    const items: MenuItem[] = [
      { label: "Editar nota", onSelect: () => startEdit(note) },
      { label: attOpen === note.id ? "Fechar anexos" : count ? `Ver anexos (${count})` : "Anexar arquivo ou link", onSelect: () => setAttOpen(attOpen === note.id ? null : note.id) },
    ];
    if (!archive) items.push({ label: note.pinned ? "Desafixar nota" : "Fixar nota", onSelect: () => patch(note, { pinned: !note.pinned }) });
    items.push({ label: note.archived ? "Desarquivar nota" : "Arquivar nota", onSelect: () => archiveToggle(note) });
    items.push({ label: "Excluir nota", onSelect: () => remove(note) });
    setNoteMenu({ anchor: event.currentTarget.getBoundingClientRect(), label: `Ações da nota ${note.title || "sem título"}`, items });
  }
  function toggleItem(n: Note, id: string) {
    patch(n, { checklist: (n.checklist ?? []).map((i) => (i.id === id ? { ...i, done: !i.done } : i)) }, false);
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
      const results = await Promise.all(positioned.map((note) => saveMutation("notes", note.id, "update", { position: note.position }, groupNotes.find((old) => old.id === note.id) ?? note)));
      const failed = results.find((result) => result.error);
      if (failed?.error) {
        setError(`Não foi possível reordenar as notas: ${failed.error}`);
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
            <MarkdownEditor className="note-body-editor" rows={7} value={edit.body} onChange={(body) => setEdit((current) => ({ ...current, body }))} placeholder="Escreva sua nota…" />
            <ChecklistEditor items={edit.checklist} onChange={(checklist) => setEdit({ ...edit, checklist })} />
            <TagInput tags={edit.tags} onChange={(tags) => setEdit({ ...edit, tags })} suggestions={allTagNames} listId="tags-edit" />
            <div className="note-edit-color">
              <span className="lbl">Cor</span>
              <Swatches value={edit.color} onPick={(color) => setEdit({ ...edit, color })} />
            </div>
            <div className="nactions">
              <button className="primary small" onClick={() => saveEdit(n)}>Salvar</button>
              <button className="ghost" onClick={() => setEditingId(null)}>Cancelar</button>
            </div>
          </>
        ) : (
          <>
            {expanded ? (
              n.body && <MarkdownContent value={n.body} />
            ) : (
              <div
                role="button"
                tabIndex={0}
                className="note-summary"
                onClick={() => setExpandedNoteId(n.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setExpandedNoteId(n.id);
                  }
                }}
                aria-label={`Abrir nota: ${summary.replace(/\s+/g, " ").slice(0, 100)}`}
              >
                {n.title && <h3>{n.title}</h3>}
                {n.body && <MarkdownContent value={n.body} />}
                {!n.title && !n.body && <span>{summary}</span>}
                {!expanded && (checklist.length > 0 || count > 0) && (
                  <span className="note-preview-meta">
                    {checklist.length > 0 && <span>{checklistDone}/{checklist.length} itens</span>}
                    {count > 0 && <span>{count} {count === 1 ? "anexo" : "anexos"}</span>}
                  </span>
                )}
              </div>
            )}
            {expanded && <ChecklistView items={checklist} onToggle={(id) => toggleItem(n, id)} />}
            {(expanded && count > 0 || attOpen === n.id) && <Attachments noteId={n.id} editable={attOpen === n.id} />}
            <div className="note-footer">
              {(n.tags ?? []).length > 0 && (
                <div className="ntags">
                  {(n.tags ?? []).map((t) => (
                    <button key={t} className="chip tag" onClick={() => setTagFilter(t)} aria-label={`Filtrar pela etiqueta ${t}`}>
                      #{t}
                    </button>
                  ))}
                  {(n.tags ?? []).length > 2 && <span className="mobile-tag-count">+{n.tags.length - 2}</span>}
                </div>
              )}
              <div className="nactions">
                <button type="button" className="ghost mobile-note-more" aria-label={`Mais ações para a nota ${n.title || "sem título"}`} aria-haspopup="menu" onClick={(event) => openNoteMenu(event, n, count)}>
                  <span aria-hidden="true">•••</span>
                  <span>Mais</span>
                </button>
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
        {!archive && <div className="head-actions"><button type="button" className="primary create-button" onClick={() => setCreating(true)}>Nova nota</button></div>}
      </div>

      <input className="search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar notas" aria-label="Buscar notas" />

      {tagCounts.length > 0 && (
        <div className="note-tag-filters">
          <button type="button" className="mobile-filter-toggle" aria-expanded={tagFiltersOpen} onClick={() => setTagFiltersOpen((open) => !open)}>
            <span>Etiquetas</span>
            {activeTag && <span className="active-filter">{activeTag}</span>}
            <span className="filter-chevron" aria-hidden="true">{tagFiltersOpen ? "−" : "+"}</span>
          </button>
          <div className={`tagbar${tagFiltersOpen ? " is-open" : ""}`} role="group" aria-label="Filtrar por etiqueta">
          <button className="tagchip" aria-pressed={activeTag === null} onClick={() => setTagFilter(null)}>Todas</button>
          {tagCounts.map(([t, c]) => (
            <button key={t} className="tagchip" aria-pressed={activeTag === t} onClick={() => setTagFilter(activeTag === t ? null : t)}>
              #{t} <span>{c}</span>
            </button>
          ))}
          </div>
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
      {noteMenu && <Menu anchor={noteMenu.anchor} label={noteMenu.label} items={noteMenu.items} onClose={() => setNoteMenu(null)} />}
      {creating && !archive && <CaptureSheet view={view} mode="note" initialTag={activeTag} onClose={() => setCreating(false)} />}
    </section>
  );
}
