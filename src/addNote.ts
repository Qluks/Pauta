import { supabase } from "./supabase";
import { NOTE_COLS, useData } from "./data";
import type { Note } from "./types";

export function useAddNote() {
  const { setNotes } = useData();
  return function addNote(title: string) {
    const t = title.trim();
    if (!t) return null;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const fields = { title: t, body: "", color: null, tags: [] as string[], checklist: [] };
    setNotes((p) => [{ id, pinned: false, archived: false, created_at: now, updated_at: now, ...fields }, ...p]);
    const done = (async (): Promise<string | null> => {
      const { data, error } = await supabase.from("notes").insert({ id, ...fields }).select(NOTE_COLS).single();
      if (error) {
        setNotes((p) => p.filter((x) => x.id !== id));
        return error.message;
      }
      const row = data as unknown as Note;
      setNotes((p) => (p.some((x) => x.id === row.id) ? p.map((x) => (x.id === row.id ? row : x)) : [row, ...p]));
      return null;
    })();
    return { id, done };
  };
}
