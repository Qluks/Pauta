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
