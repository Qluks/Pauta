import type { Attachment } from "./types";
import type { ParsedLink } from "./parse";

export function buildLinkAttachments(owner: { taskId?: string; noteId?: string }, links: ParsedLink[]): Attachment[] {
  const created_at = new Date().toISOString();
  return links.map((l) => ({
    id: crypto.randomUUID(),
    task_id: owner.taskId ?? null,
    note_id: owner.noteId ?? null,
    kind: "link" as const,
    title: l.title,
    url: l.url,
    path: null,
    mime: null,
    size: null,
    created_at,
  }));
}
