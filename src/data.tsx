import { createContext, Dispatch, ReactNode, SetStateAction, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Attachment, List, Note, Task } from "./types";

export const TASK_COLS = "id,title,done,done_at,created_at,due_at,due_time,priority,list_id,tags,recurrence,snoozed_until";
export const NOTE_COLS = "id,title,body,color,tags,checklist,pinned,archived,created_at,updated_at";
export const ATT_COLS = "id,task_id,note_id,kind,title,url,path,mime,size,created_at";
export const LIST_COLS = "id,name,color";

type Data = {
  tasks: Task[];
  setTasks: Dispatch<SetStateAction<Task[]>>;
  lists: List[];
  setLists: Dispatch<SetStateAction<List[]>>;
  notes: Note[];
  setNotes: Dispatch<SetStateAction<Note[]>>;
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  purgeFiles: (owner: { taskId?: string; noteId?: string }) => Promise<void>; // apaga do Storage os arquivos de uma tarefa/nota
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

type Payload = RealtimePostgresChangesPayload<{ [key: string]: any }>;

// Aplica no estado uma mudança vinda do servidor (inserir, atualizar ou apagar uma linha)
function applyChange<T extends { id: string }>(set: Dispatch<SetStateAction<T[]>>, columns: string, append = false) {
  return (p: Payload) => {
    if (p.eventType === "DELETE") {
      const id = (p.old as { id?: string }).id;
      if (id) set((prev) => prev.filter((x) => x.id !== id));
      return;
    }
    const src = p.new as Record<string, unknown>;
    const row = {} as Record<string, unknown>;
    for (const c of columns.split(",")) row[c] = src[c];
    const item = row as unknown as T;
    set((prev) =>
      prev.some((x) => x.id === item.id) ? prev.map((x) => (x.id === item.id ? item : x)) : append ? [...prev, item] : [item, ...prev]
    );
  };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [rawTasks, setTasks] = useState<Task[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [rawNotes, setNotes] = useState<Note[]>([]);
  const [rawAttachments, setAttachments] = useState<Attachment[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const last = useRef(0);

  const reload = useCallback(async () => {
    last.current = Date.now();
    const [t, l, n, a] = await Promise.all([
      supabase.from("tasks").select(TASK_COLS).order("created_at", { ascending: false }),
      supabase.from("lists").select(LIST_COLS).order("created_at"),
      supabase.from("notes").select(NOTE_COLS).order("updated_at", { ascending: false }),
      supabase.from("attachments").select(ATT_COLS).order("created_at"),
    ]);
    const err = t.error ?? l.error ?? n.error;
    if (err) setLoadError(err.message);
    else {
      setLoadError(null);
      setTasks(t.data as Task[]);
      setLists(l.data as List[]);
      setNotes(n.data as Note[]);
      setAttachments(a.error ? [] : (a.data as Attachment[])); // sem a tabela de anexos o resto continua funcionando
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

  // Tempo real: o que muda em outro aparelho aparece aqui na hora (precisa do realtime.sql)
  useEffect(() => {
    let first = true;
    const channel = supabase
      .channel("pauta-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, applyChange<Task>(setTasks, TASK_COLS))
      .on("postgres_changes", { event: "*", schema: "public", table: "lists" }, applyChange<List>(setLists, LIST_COLS, true))
      .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, applyChange<Note>(setNotes, NOTE_COLS))
      .on("postgres_changes", { event: "*", schema: "public", table: "attachments" }, applyChange<Attachment>(setAttachments, ATT_COLS, true))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (!first) reload(); // reconectou: busca o que passou enquanto estava fora
          first = false;
        }
      });
    return () => {
      supabase.removeChannel(channel);
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
  const attachments = useMemo(() => rawAttachments.filter((a) => !hidden.has(a.id)), [rawAttachments, hidden]);

  const attRef = useRef<Attachment[]>([]);
  attRef.current = rawAttachments;
  const purgeFiles = useCallback(async (owner: { taskId?: string; noteId?: string }) => {
    const paths = attRef.current
      .filter((a) => a.kind === "file" && a.path && (owner.taskId ? a.task_id === owner.taskId : a.note_id === owner.noteId))
      .map((a) => a.path as string);
    if (paths.length) await supabase.storage.from("attachments").remove(paths);
  }, []);

  return (
    <Ctx.Provider value={{ tasks, setTasks, lists, setLists, notes, setNotes, attachments, setAttachments, purgeFiles, loading, loadError, reload, hide, unhide }}>
      {children}
    </Ctx.Provider>
  );
}
