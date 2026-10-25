import { ChangeEvent, useState } from "react";
import Sheet from "../../components/Sheet";
import { useData } from "../../lib/data";
import type { Attachment, ChecklistItem, List, Note, Task } from "../../lib/types";
import type { SyncRow, SyncTable } from "../../lib/offline";

type Backup = { lists: List[]; tasks: Task[]; notes: Note[]; links: Attachment[]; skippedFiles: number; skippedAttachments: number };

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isChecklist(value: unknown): value is ChecklistItem[] {
  return Array.isArray(value) && value.every((item) => object(item) &&
    typeof item.id === "string" && typeof item.text === "string" && typeof item.done === "boolean");
}

function isList(value: unknown): value is List {
  return object(value) && typeof value.id === "string" && typeof value.name === "string" &&
    (value.color === null || typeof value.color === "number") && typeof value.position === "number";
}

function isTask(value: unknown): value is Task {
  return object(value) && typeof value.id === "string" && typeof value.title === "string" &&
    typeof value.done === "boolean" && (value.done_at === null || typeof value.done_at === "string") &&
    typeof value.created_at === "string" && (value.due_at === null || typeof value.due_at === "string") &&
    (value.due_time === null || typeof value.due_time === "string") && typeof value.priority === "number" &&
    (value.list_id === null || typeof value.list_id === "string") && Array.isArray(value.tags) &&
    value.tags.every((tag) => typeof tag === "string") &&
    (value.recurrence === null || typeof value.recurrence === "string") &&
    (value.snoozed_until === null || typeof value.snoozed_until === "string") && isChecklist(value.checklist);
}

function isNote(value: unknown): value is Note {
  return object(value) && typeof value.id === "string" && typeof value.title === "string" &&
    typeof value.body === "string" && (value.color === null || typeof value.color === "string") &&
    Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string") &&
    isChecklist(value.checklist) && typeof value.pinned === "boolean" && typeof value.archived === "boolean" &&
    typeof value.created_at === "string" && typeof value.updated_at === "string" && typeof value.position === "number";
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function parseBackup(value: unknown): Backup {
  if (!object(value)) throw new Error("O arquivo não contém um objeto JSON válido.");
  const rawLists = value.listas;
  const rawTasks = value.tarefas;
  const rawNotes = value.notas;
  const rawAttachments = value.anexos ?? [];
  if (!Array.isArray(rawLists) || !rawLists.every(isList)) throw new Error("A lista de listas está ausente ou contém dados inválidos.");
  if (!Array.isArray(rawTasks) || !rawTasks.every(isTask)) throw new Error("A lista de tarefas está ausente ou contém dados inválidos.");
  if (!Array.isArray(rawNotes) || !rawNotes.every(isNote)) throw new Error("A lista de notas está ausente ou contém dados inválidos.");
  if (!Array.isArray(rawAttachments)) throw new Error("A lista de anexos contém dados inválidos.");
  const assertUniqueIds = (rows: { id: string }[], label: string) => {
    if (new Set(rows.map((row) => row.id)).size !== rows.length) throw new Error(`O backup contém IDs duplicados em ${label}.`);
  };
  assertUniqueIds(rawLists, "listas");
  assertUniqueIds(rawTasks, "tarefas");
  assertUniqueIds(rawNotes, "notas");
  const files = rawAttachments.filter((item) => object(item) && item.kind === "file").length;
  const links = rawAttachments.filter((item) => object(item) && item.kind === "link" && isHttpUrl(item.url) &&
    typeof item.id === "string" && typeof item.title === "string" &&
    (item.task_id === null || typeof item.task_id === "string") &&
    (item.note_id === null || typeof item.note_id === "string") &&
    typeof item.created_at === "string").map((item) => ({
      id: item.id as string,
      task_id: item.task_id as string | null,
      note_id: item.note_id as string | null,
      kind: "link" as const,
      title: item.title as string,
      url: item.url as string,
      path: null,
      mime: null,
      size: null,
      created_at: item.created_at as string,
    }));
  assertUniqueIds(links, "anexos");
  return {
    lists: rawLists.map((row) => ({ id: row.id, name: row.name, color: row.color, position: row.position })),
    tasks: rawTasks.map((row) => ({
      id: row.id,
      title: row.title,
      done: row.done,
      done_at: row.done_at,
      created_at: row.created_at,
      due_at: row.due_at,
      due_time: row.due_time,
      ...(typeof row.notified_at === "string" || row.notified_at === null ? { notified_at: row.notified_at } : {}),
      priority: row.priority,
      list_id: row.list_id,
      tags: row.tags,
      recurrence: row.recurrence,
      snoozed_until: row.snoozed_until,
      checklist: row.checklist.map((item) => ({ id: item.id, text: item.text, done: item.done })),
    })),
    notes: rawNotes.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      color: row.color,
      tags: row.tags,
      checklist: row.checklist.map((item) => ({ id: item.id, text: item.text, done: item.done })),
      pinned: row.pinned,
      archived: row.archived,
      created_at: row.created_at,
      updated_at: row.updated_at,
      position: row.position,
    })),
    links,
    skippedFiles: files,
    skippedAttachments: rawAttachments.length - files - links.length,
  };
}

export default function BackupImportSheet({ onClose }: { onClose: () => void }) {
  const { lists: currentLists, tasks: currentTasks, notes: currentNotes, attachments: currentAttachments, setLists, setTasks, setNotes, setAttachments, saveMutation } = useData();
  const [backup, setBackup] = useState<Backup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError("O arquivo excede o limite de 10 MB.");
      return;
    }
    try {
      const parsed = parseBackup(JSON.parse(await file.text()) as unknown);
      const listIds = new Set([...currentLists.map((list) => list.id), ...parsed.lists.map((list) => list.id)]);
      const taskIds = new Set([...currentTasks.map((task) => task.id), ...parsed.tasks.map((task) => task.id)]);
      const noteIds = new Set([...currentNotes.map((note) => note.id), ...parsed.notes.map((note) => note.id)]);
      if (parsed.tasks.some((task) => task.list_id && !listIds.has(task.list_id))) throw new Error("Há tarefas vinculadas a listas ausentes no backup e na conta.");
      if (parsed.links.some((attachment) => (attachment.task_id && !taskIds.has(attachment.task_id)) || (attachment.note_id && !noteIds.has(attachment.note_id)))) {
        throw new Error("Há links vinculados a itens ausentes no backup e na conta.");
      }
      setBackup(parsed);
      setError(null);
    } catch (readError) {
      setBackup(null);
      setError(`Não foi possível validar o backup: ${readError instanceof Error ? readError.message : String(readError)}`);
    }
  }

  async function importBackup() {
    if (!backup || busy) return;
    setBusy(true);
    setError(null);
    let completed = 0;
    const total = backup.lists.length + backup.tasks.length + backup.notes.length + backup.links.length;
    const saveRows = async <T extends SyncRow>(
      table: SyncTable,
      rows: T[],
      findExisting: (id: string) => SyncRow | undefined,
      updateLocal: (row: T) => void
    ) => {
      for (const row of rows) {
        const existing = findExisting(row.id);
        const result = await saveMutation(table, row.id, existing ? "update" : "upsert", row, existing ?? null);
        if (result.error) throw new Error(result.error);
        updateLocal(row);
        completed += 1;
        setProgress(`Importando ${completed} de ${total}…`);
      }
    };
    try {
      await saveRows("lists", backup.lists, (id) => currentLists.find((item) => item.id === id), (row) => setLists((current) => current.some((item) => item.id === row.id) ? current.map((item) => item.id === row.id ? row : item) : [...current, row]));
      await saveRows("tasks", backup.tasks, (id) => currentTasks.find((item) => item.id === id), (row) => setTasks((current) => current.some((item) => item.id === row.id) ? current.map((item) => item.id === row.id ? row : item) : [row, ...current]));
      await saveRows("notes", backup.notes, (id) => currentNotes.find((item) => item.id === id), (row) => setNotes((current) => current.some((item) => item.id === row.id) ? current.map((item) => item.id === row.id ? row : item) : [row, ...current]));
      await saveRows("attachments", backup.links, (id) => currentAttachments.find((item) => item.id === id), (row) => setAttachments((current) => current.some((item) => item.id === row.id) ? current.map((item) => item.id === row.id ? row : item) : [...current, row]));
      setProgress(`Importação concluída: ${completed} itens.`);
      window.setTimeout(onClose, 900);
    } catch (importError) {
      setError(`Importação parcial (${completed} de ${total} itens). ${importError instanceof Error ? importError.message : String(importError)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Importar backup" onClose={onClose}>
      <div className="backup-import">
        <p>Selecione um arquivo JSON exportado pelo Pauta. Os dados são validados e apresentados antes de qualquer gravação.</p>
        <label>
          Arquivo de backup
          <input type="file" accept="application/json,.json" onChange={(event) => void readFile(event)} disabled={busy} />
        </label>
        {backup && (
          <div className="backup-preview" aria-live="polite">
            <strong>Prévia</strong>
            <span>{backup.lists.length} listas, {backup.tasks.length} tarefas, {backup.notes.length} notas e {backup.links.length} links.</span>
            {backup.skippedFiles > 0 && <span>{backup.skippedFiles} anexos de arquivo serão ignorados; os arquivos precisam estar no armazenamento da conta.</span>}
            {backup.skippedAttachments > 0 && <span>{backup.skippedAttachments} anexos inválidos ou não reconhecidos serão ignorados.</span>}
            <span>Itens com o mesmo ID serão atualizados; os demais serão adicionados. A importação não apaga dados atuais.</span>
            <p>O conteúdo pode ser sincronizado depois se você estiver offline.</p>
          </div>
        )}
        {progress && <p role="status">{progress}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="create-actions">
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="button" className="primary" onClick={() => void importBackup()} disabled={!backup || busy}>
            {busy ? "Importando…" : "Importar dados"}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
