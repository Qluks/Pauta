import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import type { ChecklistItem, Note } from "./types";
import { cv, lineVar } from "./colors";
import { NOTE_COLS, useData } from "./data";
import { useToast } from "./Toast";
import Swatches from "./Swatches";
import TagInput from "./Tags";
import Attachments from "./Attachments";
import { ChecklistEditor, ChecklistView } from "./Checklist";
import { sameTags } from "./util";

const colorOf = (c: string | null) => (c === null ? "var(--rule)" : lineVar(Number(c)));
const EMPTY = { title: "", body: "", color: null as string | null, tags: [] as string[], checklist: [] as ChecklistItem[] };
const clean = (items: ChecklistItem[]) => items.filter((i) => i.text.trim());

export default function Notes({ view }: { view: string }) {
  const archive = view === "archive";
  const { notes, setNotes, attachments, setAttachments, purgeFiles, loading, hide, unhide } = useData();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ title: "", body: "", tags: [] as string[], checklist: [] as ChecklistItem[] });
  const [attOpen, setAttOpen] = useState<string | null>(null);

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

  function openCompose() {
    setDraft({ ...EMPTY, tags: activeTag ? [activeTag] : [] });
    setComposing(true);
  }

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (e.key === "n" && !e.ctrlKey && !e.metaKey && !archive && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        e.preventDefault();
        openCompose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [archive, activeTag]);

  async function add(e?: FormEvent) {
    e?.preventDefault();
    const title = draft.title.trim();
    const body = draft.body.trim();
    const checklist = clean(draft.checklist);
    if (!title && !body && checklist.length === 0) return;
    const fields = { title, body, color: draft.color, tags: draft.tags, checklist };
    setDraft(EMPTY);
    setComposing(false);
    const tempId = crypto.randomUUID();
    const now = new Date().toISOString();
    const temp: Note = { id: tempId, pinned: false, archived: false, created_at: now, updated_at: now, ...fields };
    setNotes((p) => [temp, ...p]);
    const { data, error } = await supabase.from("notes").insert({ id: tempId, ...fields }).select(NOTE_COLS).single();
    if (error) {
      setNotes((p) => p.filter((x) => x.id !== tempId));
      setError(error.message);
    } else {
      const row = data as unknown as Note;
      setNotes((p) => (p.some((x) => x.id === row.id) ? p.map((x) => (x.id === row.id ? row : x)) : [row, ...p]));
    }
  }

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

  const q = query.trim().toLowerCase();
  const shown = notes
    .filter((n) => n.archived === archive)
    .filter((n) => !activeTag || (n.tags ?? []).includes(activeTag))
    .filter((n) => `${n.title ?? ""} ${n.body ?? ""} ${(n.tags ?? []).join(" ")} ${(n.checklist ?? []).map((i) => i.text).join(" ")}`.toLowerCase().includes(q))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const pinned = archive ? [] : shown.filter((n) => n.pinned);
  const others = archive ? shown : shown.filter((n) => !n.pinned);

  const card = (n: Note) => {
    const count = attCount.get(n.id) ?? 0;
    return (
      <article key={n.id} className="note" style={cv(colorOf(n.color))} data-tinted={n.color !== null}>
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
            {n.title && <h3>{n.title}</h3>}
            {n.body && <p>{n.body}</p>}
            <ChecklistView items={n.checklist ?? []} onToggle={(id) => toggleItem(n, id)} />
            {(count > 0 || attOpen === n.id) && <Attachments noteId={n.id} editable={attOpen === n.id} />}
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
      <h2 className="heading">{archive ? "Arquivo" : "Notas"}</h2>

      {!archive &&
        (composing ? (
          <form className="compose" onSubmit={add}>
            <input className="ntitle" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Título" aria-label="Título" />
            <textarea className="nbody" autoFocus rows={4} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} onKeyDown={(e) => ctrlEnter(e, () => add())} placeholder="Escreva sua nota (Ctrl + Enter salva)" aria-label="Texto da nota" />
            <ChecklistEditor items={draft.checklist} onChange={(checklist) => setDraft({ ...draft, checklist })} />
            <TagInput tags={draft.tags} onChange={(tags) => setDraft({ ...draft, tags })} suggestions={allTagNames} listId="tags-compose" />
            <Swatches value={draft.color} onPick={(c) => setDraft({ ...draft, color: c })} />
            <div className="nactions">
              <button className="primary small">Salvar</button>
              <button type="button" className="ghost" onClick={() => { setComposing(false); setDraft(EMPTY); }}>Cancelar</button>
            </div>
          </form>
        ) : (
          <div className="quick">
            <input readOnly onFocus={openCompose} onClick={openCompose} placeholder="Escreva uma nota…" aria-label="Nova nota" />
            <button className="primary" onClick={openCompose}>Nova nota</button>
          </div>
        ))}

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

      {error && (
        <p className="error" role="alert">
          {error} <button className="ghost" onClick={() => setError(null)}>Fechar</button>
        </p>
      )}

      {loading ? (
        <p className="empty">Carregando…</p>
      ) : shown.length === 0 ? (
        <p className="empty">{q || activeTag ? "Nenhuma nota encontrada." : archive ? "Nada arquivado." : "Nenhuma nota ainda. Escreva a primeira acima."}</p>
      ) : (
        <>
          {pinned.length > 0 && (
            <>
              <h3 className="group-label">Fixadas</h3>
              <div className="notes">{pinned.map(card)}</div>
              {others.length > 0 && <h3 className="group-label">Outras</h3>}
            </>
          )}
          {others.length > 0 && <div className="notes">{others.map(card)}</div>}
        </>
      )}
    </section>
  );
}
