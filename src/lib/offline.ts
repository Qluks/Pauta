import { supabase } from "./supabase";
import type { Attachment, List, Note, Task } from "./types";

export type SyncTable = "tasks" | "notes" | "lists" | "attachments";
export type SyncRow = Task | Note | List | Attachment;
export type SyncSnapshot = {
  tasks: Task[];
  notes: Note[];
  lists: List[];
  attachments: Attachment[];
};
export type OfflineMutation = {
  key: string;
  ownerId: string;
  table: SyncTable;
  recordId: string;
  operation: "upsert" | "update" | "delete";
  payload: Record<string, unknown>;
  base: Record<string, unknown> | null;
  createdAt: string;
  conflict?: Record<string, unknown>;
  error?: string;
};

const DB_NAME = "pauta-local";
const DB_VERSION = 1;
const SNAPSHOTS = "snapshots";
const MUTATIONS = "mutations";

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS, { keyPath: "ownerId" });
      if (!db.objectStoreNames.contains(MUTATIONS)) {
        const store = db.createObjectStore(MUTATIONS, { keyPath: "key" });
        store.createIndex("ownerId", "ownerId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o armazenamento local."));
  });
}

async function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha no armazenamento local."));
  });
}

export async function readSnapshot(ownerId: string): Promise<SyncSnapshot | null> {
  const db = await database();
  const value = await requestResult<{ ownerId: string; snapshot: SyncSnapshot } | undefined>(db.transaction(SNAPSHOTS).objectStore(SNAPSHOTS).get(ownerId));
  db.close();
  return value?.snapshot ?? null;
}

export async function writeSnapshot(ownerId: string, snapshot: SyncSnapshot): Promise<void> {
  const db = await database();
  const tx = db.transaction(SNAPSHOTS, "readwrite");
  tx.objectStore(SNAPSHOTS).put({ ownerId, snapshot });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Não foi possível salvar os dados neste aparelho."));
    tx.onabort = () => reject(tx.error ?? new Error("O salvamento local foi cancelado."));
  });
  db.close();
}

export async function listMutations(ownerId: string): Promise<OfflineMutation[]> {
  const db = await database();
  const values = await requestResult<OfflineMutation[]>(db.transaction(MUTATIONS).objectStore(MUTATIONS).index("ownerId").getAll(ownerId));
  db.close();
  const dependencyOrder: Record<SyncTable, number> = { lists: 0, tasks: 1, notes: 2, attachments: 3 };
  return values.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || dependencyOrder[a.table] - dependencyOrder[b.table]);
}

async function putMutation(mutation: OfflineMutation): Promise<void> {
  const db = await database();
  const tx = db.transaction(MUTATIONS, "readwrite");
  tx.objectStore(MUTATIONS).put(mutation);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Não foi possível enfileirar a alteração offline."));
    tx.onabort = () => reject(tx.error ?? new Error("A alteração offline não foi salva."));
  });
  db.close();
}

export async function enqueueMutation(input: Omit<OfflineMutation, "key" | "createdAt">): Promise<void> {
  const key = `${input.ownerId}:${input.table}:${input.recordId}`;
  const db = await database();
  const tx = db.transaction(MUTATIONS, "readwrite");
  const store = tx.objectStore(MUTATIONS);
  const get = store.get(key) as IDBRequest<OfflineMutation | undefined>;
  let enqueueError: string | null = null;
  await new Promise<void>((resolve, reject) => {
    get.onsuccess = () => {
      const previous = get.result;
      if (previous?.conflict) {
        enqueueError = "Esta alteração tem um conflito que precisa ser resolvido antes de novas mudanças.";
        resolve();
        return;
      }
      if (previous?.operation === "upsert" && input.operation === "delete") {
        store.delete(key);
      } else if (previous?.operation === "upsert" && input.operation === "update") {
        store.put({ ...previous, payload: { ...previous.payload, ...input.payload } });
      } else if (previous?.operation === "update" && input.operation === "update") {
        store.put({ ...previous, payload: { ...previous.payload, ...input.payload } });
      } else {
        store.put({
          ...input,
          key,
          createdAt: previous?.createdAt ?? new Date().toISOString(),
          base: previous?.base ?? input.base,
        });
      }
      resolve();
    };
    get.onerror = () => reject(get.error ?? new Error("Não foi possível atualizar a fila offline."));
  });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Não foi possível atualizar a fila offline."));
    tx.onabort = () => reject(tx.error ?? new Error("A fila offline foi cancelada."));
  });
  db.close();
  if (enqueueError) throw new Error(enqueueError);
}

export async function removeMutation(mutation: OfflineMutation): Promise<void> {
  const db = await database();
  const tx = db.transaction(MUTATIONS, "readwrite");
  tx.objectStore(MUTATIONS).delete(mutation.key);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Não foi possível atualizar a fila offline."));
    tx.onabort = () => reject(tx.error ?? new Error("A fila offline foi cancelada."));
  });
  db.close();
}

export async function resolveMutation(mutation: OfflineMutation, choice: "local" | "remote"): Promise<void> {
  if (!mutation.conflict) return;
  if (choice === "remote") {
    await removeMutation(mutation);
    return;
  }
  if (mutation.conflict.__missing_remote === true && mutation.base) {
    await putMutation({
      ...mutation,
      operation: "upsert",
      payload: { ...mutation.base, ...mutation.payload },
      base: null,
      conflict: undefined,
      error: undefined,
    });
    return;
  }
  await putMutation({ ...mutation, base: mutation.conflict, conflict: undefined, error: undefined });
}

function changedFields(payload: Record<string, unknown>, base: Record<string, unknown>, remote: Record<string, unknown>) {
  return Object.keys(payload).some((key) => JSON.stringify(base[key]) !== JSON.stringify(remote[key]));
}

async function findRemote(mutation: OfflineMutation): Promise<Record<string, unknown> | null> {
  const result = mutation.table === "tasks"
    ? await supabase.from("tasks").select("*").eq("id", mutation.recordId).maybeSingle()
    : mutation.table === "notes"
    ? await supabase.from("notes").select("*").eq("id", mutation.recordId).maybeSingle()
    : mutation.table === "lists"
    ? await supabase.from("lists").select("*").eq("id", mutation.recordId).maybeSingle()
    : await supabase.from("attachments").select("*").eq("id", mutation.recordId).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data as Record<string, unknown> | null;
}

async function applyMutation(mutation: OfflineMutation) {
  if (mutation.operation === "upsert") {
    const row = { ...mutation.payload, id: mutation.recordId };
    if (mutation.table === "tasks") return supabase.from("tasks").upsert(row as Task);
    if (mutation.table === "notes") return supabase.from("notes").upsert(row as Note);
    if (mutation.table === "lists") return supabase.from("lists").upsert(row as List);
    return supabase.from("attachments").upsert(row as Attachment);
  }
  if (mutation.operation === "delete") {
    if (mutation.table === "tasks") return supabase.from("tasks").delete().eq("id", mutation.recordId);
    if (mutation.table === "notes") return supabase.from("notes").delete().eq("id", mutation.recordId);
    if (mutation.table === "lists") return supabase.from("lists").delete().eq("id", mutation.recordId);
    return supabase.from("attachments").delete().eq("id", mutation.recordId);
  }
  if (mutation.table === "tasks") return supabase.from("tasks").update(mutation.payload).eq("id", mutation.recordId);
  if (mutation.table === "notes") return supabase.from("notes").update(mutation.payload).eq("id", mutation.recordId);
  if (mutation.table === "lists") return supabase.from("lists").update(mutation.payload).eq("id", mutation.recordId);
  return supabase.from("attachments").update(mutation.payload).eq("id", mutation.recordId);
}

export async function flushMutations(ownerId: string): Promise<void> {
  const queue = await listMutations(ownerId);
  for (const mutation of queue) {
    if (mutation.conflict) continue;
    try {
      const remote = await findRemote(mutation);
      if (mutation.operation === "update" && mutation.base) {
        if (!remote) {
          await putMutation({ ...mutation, conflict: { __missing_remote: true } });
          continue;
        }
        if (changedFields(mutation.payload, mutation.base, remote)) {
          await putMutation({ ...mutation, conflict: remote });
          continue;
        }
      }
      if (mutation.operation === "delete" && mutation.base && remote && changedFields(remote, mutation.base, remote)) {
        await putMutation({ ...mutation, conflict: remote });
        continue;
      }
      const result = await applyMutation(mutation);
      if (result.error) {
        await putMutation({ ...mutation, error: result.error.message });
        break;
      }
      if (mutation.operation === "delete" && mutation.table === "attachments" && mutation.base?.kind === "file" && typeof mutation.base.path === "string") {
        const removed = await supabase.storage.from("attachments").remove([mutation.base.path]);
        if (removed.error) {
          await putMutation({ ...mutation, error: removed.error.message });
          break;
        }
      }
      await removeMutation(mutation);
    } catch (error) {
      await putMutation({ ...mutation, error: error instanceof Error ? error.message : String(error) });
      break;
    }
  }
}

export async function submitMutation(
  ownerId: string,
  table: SyncTable,
  recordId: string,
  operation: OfflineMutation["operation"],
  payload: Record<string, unknown>,
  base: Record<string, unknown> | null = null
): Promise<{ queued: boolean; error: string | null }> {
  if (!navigator.onLine) {
    await enqueueMutation({ ownerId, table, recordId, operation, payload, base });
    return { queued: true, error: null };
  }
  const mutation: OfflineMutation = {
    key: `${ownerId}:${table}:${recordId}`,
    ownerId,
    table,
    recordId,
    operation,
    payload,
    base,
    createdAt: new Date().toISOString(),
  };
  try {
    const result = await applyMutation(mutation);
    if (!result.error) return { queued: false, error: null };
    if (/fetch|network|connection|offline/i.test(result.error.message)) {
      await enqueueMutation(mutation);
      return { queued: true, error: null };
    }
    return { queued: false, error: result.error.message };
  } catch (error) {
    if (error instanceof TypeError || !navigator.onLine) {
      await enqueueMutation(mutation);
      return { queued: true, error: null };
    }
    return { queued: false, error: error instanceof Error ? error.message : String(error) };
  }
}
