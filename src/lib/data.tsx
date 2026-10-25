import { createContext, Dispatch, MutableRefObject, ReactNode, SetStateAction, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { Attachment, List, Note, Task } from "./types";
import { flushMutations, listMutations, readSnapshot, resolveMutation, submitMutation, writeSnapshot, type OfflineMutation, type SyncRow, type SyncTable } from "./offline";

export const TASK_COLS = "id,title,done,done_at,created_at,due_at,due_time,priority,list_id,tags,recurrence,snoozed_until,notified_at,checklist";
export const NOTE_COLS = "id,title,body,color,tags,checklist,pinned,archived,created_at,updated_at,position";
export const ATT_COLS = "id,task_id,note_id,kind,title,url,path,mime,size,created_at";
export const LIST_COLS = "id,name,color,position";

type Data = {
  tasks: Task[];
  setTasks: Dispatch<SetStateAction<Task[]>>;
  lists: List[];
  setLists: Dispatch<SetStateAction<List[]>>;
  notes: Note[];
  setNotes: Dispatch<SetStateAction<Note[]>>;
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  purgeFiles: (owner: { taskId?: string; noteId?: string }) => Promise<string | null>;
  loading: boolean;
  loadError: string | null;
  ownerId: string | null;
  online: boolean;
  pendingMutations: OfflineMutation[];
  saveMutation: (table: SyncTable, recordId: string, operation: OfflineMutation["operation"], payload: Record<string, unknown>, base?: SyncRow | null) => Promise<{ queued: boolean; error: string | null }>;
  resolveConflict: (mutation: OfflineMutation, choice: "local" | "remote") => Promise<void>;
  retrySync: () => Promise<void>;
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
function applyChange<T extends { id: string }>(
  set: Dispatch<SetStateAction<T[]>>,
  columns: string,
  append = false,
  sort?: (a: T, b: T) => number,
  pendingIds?: MutableRefObject<Set<string>>
) {
  return (p: Payload) => {
    if (p.eventType === "DELETE") {
      const id = (p.old as { id?: string }).id;
      if (id && pendingIds?.current.has(id)) return;
      if (id) set((prev) => prev.filter((x) => x.id !== id));
      return;
    }
    const src = p.new as Record<string, unknown>;
    if (typeof src.id === "string" && pendingIds?.current.has(src.id)) return;
    const row = {} as Record<string, unknown>;
    for (const c of columns.split(",")) row[c] = src[c];
    const item = row as unknown as T;
    set((prev) => {
      const next = prev.some((x) => x.id === item.id)
        ? prev.map((x) => (x.id === item.id ? item : x))
        : append
        ? [...prev, item]
        : [item, ...prev];
      return sort ? next.sort(sort) : next;
    });
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
  const hasLocalSnapshot = useRef(false);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [pendingMutations, setPendingMutations] = useState<OfflineMutation[]>([]);
  const pendingIds = useRef(new Set<string>());
  pendingIds.current = new Set(pendingMutations.map((mutation) => mutation.recordId));
  const [hydratedOwnerId, setHydratedOwnerId] = useState<string | null>(null);
  const ownerIdRef = useRef<string | null>(null);
  const last = useRef(0);

  const reload = useCallback(async () => {
    if (!ownerId) return;
    last.current = Date.now();
    try {
      const [t, l, n, a] = await Promise.all([
        supabase.from("tasks").select(TASK_COLS).order("created_at", { ascending: false }),
        supabase.from("lists").select(LIST_COLS).order("position").order("created_at"),
        supabase.from("notes").select(NOTE_COLS).order("position").order("updated_at", { ascending: false }),
        supabase.from("attachments").select(ATT_COLS).order("created_at"),
      ]);
      const errors: string[] = [];
      if (t.error) errors.push(`Tarefas: ${t.error.message}`);
      if (l.error) errors.push(`Listas: ${l.error.message}`);
      if (n.error) errors.push(`Notas: ${n.error.message}`);
      if (a.error) errors.push(`Anexos: ${a.error.message}`);
      const queue = await listMutations(ownerId);
      if (!t.error) setTasks(overlay((t.data ?? []) as Task[], queue, "tasks"));
      if (!l.error) setLists(overlay((l.data ?? []) as List[], queue, "lists"));
      if (!n.error) setNotes(overlay((n.data ?? []) as Note[], queue, "notes"));
      if (!a.error) setAttachments(overlay((a.data ?? []) as Attachment[], queue, "attachments"));
      setPendingMutations(queue);
      if (!errors.length) {
        hasLocalSnapshot.current = true;
        setLoadError(null);
      } else if (!hasLocalSnapshot.current || (online && !queue.length)) setLoadError(errors.join(" · "));
    } catch (error) {
      if (online) setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      last.current = Date.now();
      setLoading(false);
    }
  }, [ownerId, online]);

  useEffect(() => {
    let active = true;
    let hydrationRequest = 0;
    const hydrate = async (id: string | null) => {
      const request = ++hydrationRequest;
      if (!id) {
        setHydratedOwnerId(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const snapshot = await readSnapshot(id);
        const queue = await listMutations(id);
        if (!active || request !== hydrationRequest) return;
        if (snapshot) {
          hasLocalSnapshot.current = true;
          setTasks(overlay(snapshot.tasks, queue, "tasks"));
          setLists(overlay(snapshot.lists, queue, "lists"));
          setNotes(overlay(snapshot.notes, queue, "notes"));
          setAttachments(overlay(snapshot.attachments, queue, "attachments"));
        } else {
          hasLocalSnapshot.current = false;
          if (!navigator.onLine) setLoadError("Sem conexão e sem dados armazenados neste aparelho. Conecte-se para carregar o Pauta.");
        }
        setPendingMutations(queue);
      } catch (error) {
        if (active && request === hydrationRequest) {
          setLoadError(`Não foi possível ler o cache local: ${error instanceof Error ? error.message : String(error)}`);
        }
      } finally {
        if (active && request === hydrationRequest) {
          setHydratedOwnerId(id);
          setLoading(false);
        }
      }
    };
    const init = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setLoadError(error.message);
        setLoading(false);
        return;
      }
      if (!active) return;
      const id = data.session?.user.id ?? null;
      ownerIdRef.current = id;
      setOwnerId(id);
      await hydrate(id);
    };
    void init();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      const nextOwnerId = session?.user.id ?? null;
      if (nextOwnerId === ownerIdRef.current) return;
      ownerIdRef.current = nextOwnerId;
      setHydratedOwnerId(null);
      setOwnerId(nextOwnerId);
      setTasks([]);
      setLists([]);
      setNotes([]);
      setAttachments([]);
      setPendingMutations([]);
      hasLocalSnapshot.current = false;
      setLoadError(null);
      void hydrate(nextOwnerId);
    });
    return () => {
      active = false;
      hydrationRequest += 1;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!ownerId || hydratedOwnerId !== ownerId) return;
    void writeSnapshot(ownerId, { tasks: rawTasks, lists, notes: rawNotes, attachments: rawAttachments }).catch((error) => {
      setLoadError(`Não foi possível salvar o cache local: ${error instanceof Error ? error.message : String(error)}`);
    });
  }, [ownerId, hydratedOwnerId, rawTasks, lists, rawNotes, rawAttachments]);

  const refreshSync = useCallback(async () => {
    if (ownerId) setPendingMutations(await listMutations(ownerId));
  }, [ownerId]);

  const saveMutation = useCallback(async (
    table: SyncTable,
    recordId: string,
    operation: OfflineMutation["operation"],
    payload: Record<string, unknown>,
    base: SyncRow | null = null
  ) => {
    if (!ownerId) return { queued: false, error: "Sessão expirada. Entre novamente para sincronizar." };
    try {
      const result = await submitMutation(ownerId, table, recordId, operation, payload, base as Record<string, unknown> | null);
      await refreshSync();
      return result;
    } catch (error) {
      return { queued: false, error: error instanceof Error ? error.message : String(error) };
    }
  }, [ownerId, refreshSync]);

  const retrySync = useCallback(async () => {
    if (!ownerId || !navigator.onLine) return;
    await flushMutations(ownerId);
    await refreshSync();
    await reload();
  }, [ownerId, refreshSync, reload]);

  useEffect(() => {
    if (!ownerId || hydratedOwnerId !== ownerId) return;
    void retrySync();
  }, [ownerId, hydratedOwnerId, retrySync]);

  const resolveConflict = useCallback(async (mutation: OfflineMutation, choice: "local" | "remote") => {
    await resolveMutation(mutation, choice);
    await refreshSync();
    if (choice === "remote" && mutation.conflict) {
      const missing = mutation.conflict.__missing_remote === true;
      if (mutation.table === "tasks") {
        const row = mutation.conflict as unknown as Task;
        setTasks((current) => missing ? current.filter((item) => item.id !== mutation.recordId) : current.some((item) => item.id === row.id) ? current.map((item) => item.id === row.id ? row : item) : [row, ...current]);
      } else if (mutation.table === "notes") {
        const row = mutation.conflict as unknown as Note;
        setNotes((current) => missing ? current.filter((item) => item.id !== mutation.recordId) : current.some((item) => item.id === row.id) ? current.map((item) => item.id === row.id ? row : item) : [row, ...current]);
      } else if (mutation.table === "lists") {
        const row = mutation.conflict as unknown as List;
        setLists((current) => missing ? current.filter((item) => item.id !== mutation.recordId) : current.some((item) => item.id === row.id) ? current.map((item) => item.id === row.id ? row : item) : [...current, row].sort((a, b) => a.position - b.position));
      } else {
        const row = mutation.conflict as unknown as Attachment;
        setAttachments((current) => missing ? current.filter((item) => item.id !== mutation.recordId) : current.some((item) => item.id === row.id) ? current.map((item) => item.id === row.id ? row : item) : [...current, row]);
      }
      if (navigator.onLine) await reload();
    } else {
      await retrySync();
    }
  }, [refreshSync, reload, retrySync]);

  // Atualiza ao voltar para o app, ao reconectar e a cada 45 s com a tela aberta
  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void retrySync();
    };
    const onOffline = () => setOnline(false);
    const maybe = () => {
      if (document.visibilityState === "visible" && Date.now() - last.current > 3000) reload();
    };
    const id = window.setInterval(maybe, 45000);
    document.addEventListener("visibilitychange", maybe);
    window.addEventListener("focus", maybe);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", maybe);
      window.removeEventListener("focus", maybe);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [reload, retrySync]);

  // Tempo real: o que muda em outro aparelho aparece aqui na hora (precisa do realtime.sql)
  useEffect(() => {
    let first = true;
    const channel = supabase
      .channel("pauta-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, applyChange<Task>(setTasks, TASK_COLS, false, undefined, pendingIds))
      .on("postgres_changes", { event: "*", schema: "public", table: "lists" }, applyChange<List>(setLists, LIST_COLS, true, (a, b) => a.position - b.position, pendingIds))
      .on("postgres_changes", { event: "*", schema: "public", table: "notes" }, applyChange<Note>(setNotes, NOTE_COLS, false, undefined, pendingIds))
      .on("postgres_changes", { event: "*", schema: "public", table: "attachments" }, applyChange<Attachment>(setAttachments, ATT_COLS, true, undefined, pendingIds))
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
      .filter((a): a is Attachment & { path: string } => a.kind === "file" && typeof a.path === "string" && (owner.taskId ? a.task_id === owner.taskId : a.note_id === owner.noteId))
      .map((a) => a.path);
    if (!paths.length) return null;
    const { error } = await supabase.storage.from("attachments").remove(paths);
    return error?.message ?? null;
  }, []);

  return (
    <Ctx.Provider value={{ tasks, setTasks, lists, setLists, notes, setNotes, attachments, setAttachments, purgeFiles, loading, loadError, ownerId, online, pendingMutations, saveMutation, resolveConflict, retrySync, reload, hide, unhide }}>
      {children}
    </Ctx.Provider>
  );
}

function overlay<T extends { id: string }>(rows: T[], queue: OfflineMutation[], table: SyncTable): T[] {
  let result = [...rows];
  for (const mutation of queue.filter((item) => item.table === table)) {
    if (mutation.operation === "delete") {
      result = result.filter((row) => row.id !== mutation.recordId);
    } else if (mutation.operation === "upsert") {
      const row = mutation.payload as T;
      result = result.some((item) => item.id === row.id)
        ? result.map((item) => item.id === row.id ? row : item)
        : [row, ...result];
    } else {
      result = result.map((row) => row.id === mutation.recordId ? { ...row, ...mutation.payload } : row);
    }
  }
  return result;
}
