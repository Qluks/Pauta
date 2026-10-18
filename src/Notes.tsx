import { FormEvent, KeyboardEvent, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Note } from "./types";
import { cv, lineVar } from "./colors";

const COLS = "id,title,body,color,pinned,archived,created_at,updated_at";
const NAMES = ["Azul", "Verde", "Laranja", "Magenta", "Roxo", "Verde-azulado"];
const colorOf = (c: string | null) => (c === null ? "var(--rule)" : lineVar(Number(c)));
const EMPTY = { title: "", body: "", color: null as string | null };

function Swatches({ value, onPick }: { value: string | null; onPick: (c: string | null) => void }) {
  return (
    <div className="swatches" role="group" aria-label="Cor da nota">
      <button type="button" className="sw none" aria-pressed={value === null} aria-label="Sem cor" onClick={() => onPick(null)} />
      {NAMES.map((n, i) => (
        <button type="button" key={i} className="sw" style={cv(lineVar(i))} aria-pressed={value === String(i)} aria-label={n} onClick={() => onPick(String(i))} />
      ))}
    </div>
  );
}

export default function Notes({ view }: { view: string }) {
  const archive = view === "archive";
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ title: "", body: "" });

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("notes").select(COLS).order("updated_at", { ascending: false });
      if (error) setError(error.message);
      else setNotes(data as Note[]);
      setLoading(false);
    })();
  }, []);

  async function add(e?: FormEvent) {
    e?.preventDefault();
    const title = draft.title.trim();
    const body = draft.body.trim();
    if (!title && !body) return;
    const fields = { title, body, color: draft.color };
    setDraft(EMPTY);
    setComposing(false);
    const tempId = crypto.randomUUID();
    const now = new Date().toISOString();
    const temp: Note = { id: tempId, pinned: false, archived: false, created_at: now, updated_at: now, ...fields };
    setNotes((p) => [temp, ...p]);
    const { data, error } = await supabase.from("notes").insert(fields).select(COLS).single();
    if (error) {
      setNotes((p) => p.filter((x) => x.id !== tempId));
      setError(error.message);
    } else {
      setNotes((p) => p.map((x) => (x.id === tempId ? (data as Note) : x)));
    }
  }

  async function patch(note: Note, changes: Partial<Note>) {
    const full = { ...changes, updated_at: new Date().toISOString() };
    setNotes((p) => p.map((x) => (x.id === note.id ? { ...x, ...full } : x)));
    const { error } = await supabase.from("notes").update(full).eq("id", note.id);
    if (error) {
      setNotes((p) => p.map((x) => (x.id === note.id ? note : x)));
      setError(error.message);
    }
  }

  async function remove(note: Note) {
    if (!window.confirm("Excluir esta nota?")) return;
    setNotes((p) => p.filter((x) => x.id !== note.id));
    const { error } = await supabase.from("notes").delete().eq("id", note.id);
    if (error) {
      setNotes((p) => [note, ...p]);
      setError(error.message);
    }
  }

  function startEdit(n: Note) {
    setEditingId(n.id);
    setEdit({ title: n.title ?? "", body: n.body ?? "" });
  }
  function saveEdit(n: Note) {
    setEditingId(null);
    const title = edit.title.trim();
    const body = edit.body.trim();
    if (title !== (n.title ?? "") || body !== (n.body ?? "")) patch(n, { title, body });
  }
  function ctrlEnter(e: KeyboardEvent, fn: () => void) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") fn();
  }

  const q = query.trim().toLowerCase();
  const shown = notes
    .filter((n) => n.archived === archive)
    .filter((n) => `${n.title ?? ""} ${n.body ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const pinned = archive ? [] : shown.filter((n) => n.pinned);
  const others = archive ? shown : shown.filter((n) => !n.pinned);

  const card = (n: Note) => (
    <article key={n.id} className="note" style={cv(colorOf(n.color))} data-tinted={n.color !== null}>
      {editingId === n.id ? (
        <>
          <input className="ntitle" autoFocus value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="Título" aria-label="Título" />
          <textarea className="nbody" rows={5} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} onKeyDown={(e) => ctrlEnter(e, () => saveEdit(n))} placeholder="Nota" aria-label="Texto da nota" />
          <div className="nactions">
            <button className="primary small" onClick={() => saveEdit(n)}>Salvar</button>
            <button className="ghost" onClick={() => setEditingId(null)}>Cancelar</button>
          </div>
        </>
      ) : (
        <>
          {n.title && <h3>{n.title}</h3>}
          {n.body && <p>{n.body}</p>}
          <div className="nactions">
            <button className="ghost" onClick={() => startEdit(n)}>Editar</button>
            {!archive && (
              <button className="ghost" onClick={() => patch(n, { pinned: !n.pinned })}>{n.pinned ? "Desafixar" : "Fixar"}</button>
            )}
            <button className="ghost" onClick={() => patch(n, { archived: !n.archived, pinned: false })}>
              {n.archived ? "Desarquivar" : "Arquivar"}
            </button>
            <button className="ghost danger" onClick={() => remove(n)}>Excluir</button>
          </div>
          <Swatches value={n.color} onPick={(c) => patch(n, { color: c })} />
        </>
      )}
    </article>
  );

  return (
    <section>
      <h2 className="heading">{archive ? "Arquivo" : "Notas"}</h2>

      {!archive &&
        (composing ? (
          <form className="compose" onSubmit={add}>
            <input className="ntitle" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Título" aria-label="Título" />
            <textarea className="nbody" autoFocus rows={4} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} onKeyDown={(e) => ctrlEnter(e, () => add())} placeholder="Escreva sua nota (Ctrl + Enter salva)" aria-label="Texto da nota" />
            <Swatches value={draft.color} onPick={(c) => setDraft({ ...draft, color: c })} />
            <div className="nactions">
              <button className="primary small">Salvar</button>
              <button type="button" className="ghost" onClick={() => { setComposing(false); setDraft(EMPTY); }}>Cancelar</button>
            </div>
          </form>
        ) : (
          <input className="search compose-closed" readOnly onFocus={() => setComposing(true)} onClick={() => setComposing(true)} placeholder="Escreva uma nota…" aria-label="Nova nota" />
        ))}

      <input className="search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar notas" aria-label="Buscar notas" />

      {error && (
        <p className="error" role="alert">
          {error} <button className="ghost" onClick={() => setError(null)}>Fechar</button>
        </p>
      )}

      {loading ? (
        <p className="empty">Carregando…</p>
      ) : shown.length === 0 ? (
        <p className="empty">{q ? "Nenhuma nota encontrada." : archive ? "Nada arquivado." : "Nenhuma nota ainda. Escreva a primeira acima."}</p>
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
