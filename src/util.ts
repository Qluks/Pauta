import type { Task } from "./types";

export function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const today = () => isoDate(new Date());
export function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return isoDate(d);
}
export function fmt(date: string) {
  const [, m, d] = date.split("-");
  return `${d}/${m}`;
}
export const describeDate = (d: string) => (d === today() ? "hoje" : d === tomorrow() ? "amanhã" : fmt(d));

export const normTag = (s: string) => s.trim().replace(/^#+/, "").toLowerCase().replace(/\s+/g, "-").slice(0, 24);
export const sameTags = (a: string[], b: string[]) => a.length === b.length && a.every((t, i) => t === b[i]);

// Tarefa recorrente já concluída que ainda "dorme" até chegar perto do próximo prazo
export const isDormant = (t: Task) => !t.done && !!t.snoozed_until && t.snoozed_until > today();

// Aceita "exemplo.com/pagina" ou "https://..."; só permite http e https
export function normalizeUrl(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

// O horário do lembrete (09:00 quando a tarefa não tem horário) já passou?
export function reminderPassed(due: string | null, time: string | null) {
  if (!due) return false;
  return new Date(`${due}T${(time ?? "09:00").slice(0, 5)}:00`).getTime() <= Date.now();
}
