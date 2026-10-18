import { createContext, Dispatch, ReactNode, SetStateAction, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { List, Note, Task } from "./types";

export const TASK_COLS = "id,title,done,done_at,created_at,due_at,priority,list_id,tags,recurrence";
export const NOTE_COLS = "id,title,body,color,tags,pinned,archived,created_at,updated_at";
export const LIST_COLS = "id,name,color";

type Data = {
  tasks: Task[];
  setTasks: Dispatch<SetStateAction<Task[]>>;
  lists: List[];
  setLists: Dispatch<SetStateAction<List[]>>;
  notes: Note[];
  setNotes: Dispatch<SetStateAction<Note[]>>;
  loading: boolean;
  loadError: string | null;
  reload: () => Promise<void>;
  hide: (id: string) => void; // esconde um item enquanto a exclusão espera o "Desfazer"
  unhide: (id: string) => void;
};

const Ctx = createContext<Data | null>(null);
export function useData() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useData fora do DataProvider");
  return v;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [rawTasks, setTasks] = useState<Task[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [rawNotes, setNotes] = useState<Note[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const last = useRef(0);

  const reload = useCallback(async () => {
    last.current = Date.now();
    const [t, l, n] = await Promise.all([
      supabase.from("tasks").select(TASK_COLS).order("created_at", { ascending: false }),
      supabase.from("lists").select(LIST_COLS).order("created_at"),
      supabase.from("notes").select(NOTE_COLS).order("updated_at", { ascending: false }),
    ]);
    const err = t.error ?? l.error ?? n.error;
    if (err) setLoadError(err.message);
    else {
      setLoadError(null);
      setTasks(t.data as Task[]);
      setLists(l.data as List[]);
      setNotes(n.data as Note[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Atualiza ao voltar para o app, ao reconectar e a cada 45 s com a tela aberta
  useEffect(() => {
    const maybe = () => {
      if (document.visibilityState === "visible" && Date.now() - last.current > 3000) reload();
    };
    const id = window.setInterval(maybe, 45000);
    document.addEventListener("visibilitychange", maybe);
    window.addEventListener("focus", maybe);
    window.addEventListener("online", maybe);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", maybe);
      window.removeEventListener("focus", maybe);
      window.removeEventListener("online", maybe);
    };
  }, [reload]);

  const hide = useCallback((id: string) => setHidden((s) => new Set(s).add(id)), []);
  const unhide = useCallback(
    (id: string) =>
      setHidden((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      }),
    []
  );

  const tasks = useMemo(() => rawTasks.filter((t) => !hidden.has(t.id)), [rawTasks, hidden]);
  const notes = useMemo(() => rawNotes.filter((n) => !hidden.has(n.id)), [rawNotes, hidden]);

  return (
    <Ctx.Provider value={{ tasks, setTasks, lists, setLists, notes, setNotes, loading, loadError, reload, hide, unhide }}>
      {children}
    </Ctx.Provider>
  );
}
