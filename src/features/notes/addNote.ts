import { supabase } from "../../lib/supabase";
import { NOTE_COLS, useData } from "../../lib/data";
import { parseNote } from "../../lib/parse";
import { buildLinkAttachments, saveAttachments } from "../../lib/links";
import type { Note } from "../../lib/types";

export type NoteDraft = {
  title: string;
  body: string;
  color: string | null;
  tags: string[];
  checklist: Note["checklist"];
  pinned: boolean;
};

// Cria uma nota a partir do texto (título, itens, etiquetas, cor, fixar e links)
export function useAddNote() {
  const { notes, setNotes, setAttachments } = useData();
  return function addNote(input: string | NoteDraft) {
    const p = typeof input === "string" ? parseNote(input) : null;
    const fields = typeof input === "string"
      ? { title: p?.title ?? "", body: p?.body ?? "", color: p?.color ?? null, tags: p?.tags ?? [], checklist: p?.checklist ?? [], pinned: p?.pinned ?? false }
      : { ...input, title: input.title.trim(), body: input.body.trim(), checklist: input.checklist.filter((item) => item.text.trim()) };
    if (!fields.title && !fields.body && fields.checklist.length === 0) return null;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const position = notes.length ? Math.min(...notes.map((note) => note.position ?? 0)) - 1 : 0;
    const atts = buildLinkAttachments({ noteId: id }, p?.links ?? []);
    setNotes((prev) => [{ id, archived: false, created_at: now, updated_at: now, position, ...fields }, ...prev]);
    if (atts.length) setAttachments((prev) => [...prev, ...atts]);
    const dropAtts = () => setAttachments((prev) => prev.filter((a) => !atts.some((x) => x.id === a.id)));
    const done = (async (): Promise<string | null> => {
      const { data, error } = await supabase.from("notes").insert({ id, position, ...fields }).select(NOTE_COLS).single();
      if (error) {
        setNotes((prev) => prev.filter((x) => x.id !== id));
        dropAtts();
        return error.message;
      }
      const row = data as unknown as Note;
      setNotes((prev) => (prev.some((x) => x.id === row.id) ? prev.map((x) => (x.id === row.id ? row : x)) : [row, ...prev]));
      const err = await saveAttachments(atts);
      if (err) {
        dropAtts();
        return `a nota foi salva, mas os links não: ${err}`;
      }
      return null;
    })();
    return { id, done, title: fields.title || "Nota" };
  };
}
