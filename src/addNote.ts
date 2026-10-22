import { supabase } from "./supabase";
import { NOTE_COLS, useData } from "./data";
import { parseNote } from "./parse";
import { buildLinkAttachments, saveAttachments } from "./links";
import type { Note } from "./types";

// Cria uma nota a partir do texto (título, itens, etiquetas, cor, fixar e links)
export function useAddNote() {
  const { setNotes, setAttachments } = useData();
  return function addNote(text: string) {
    const p = parseNote(text);
    if (!p.title && !p.body && p.checklist.length === 0) return null;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const fields = { title: p.title, body: p.body, color: p.color, tags: p.tags, checklist: p.checklist, pinned: p.pinned };
    const atts = buildLinkAttachments({ noteId: id }, p.links);
    setNotes((prev) => [{ id, archived: false, created_at: now, updated_at: now, ...fields }, ...prev]);
    if (atts.length) setAttachments((prev) => [...prev, ...atts]);
    const dropAtts = () => setAttachments((prev) => prev.filter((a) => !atts.some((x) => x.id === a.id)));
    const done = (async (): Promise<string | null> => {
      const { data, error } = await supabase.from("notes").insert({ id, ...fields }).select(NOTE_COLS).single();
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
