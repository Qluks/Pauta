export type FeedTask = {
  id: string;
  title: string;
  due_at: string;
  due_time: string | null;
  created_at: string;
  updated_at: string;
  list_id: string | null;
  tags: string[];
  priority: number;
};

export type FeedList = { id: string; name: string };

const encoder = new TextEncoder();

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/([,;])/g, "\\$1");
}

function foldLine(line: string): string {
  const parts: string[] = [];
  let part = "";
  for (const character of line) {
    if (encoder.encode(part + character).length > 75) {
      parts.push(part);
      part = ` ${character}`;
    } else {
      part += character;
    }
  }
  parts.push(part);
  return parts.join("\r\n");
}

function utcTimestamp(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return new Date(0).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function eventLines(task: FeedTask, listName: string | undefined): string[] {
  const date = task.due_at.replace(/-/g, "");
  const description = [
    listName ? `Lista: ${listName}` : "",
    task.tags.length ? `Etiquetas: ${task.tags.join(", ")}` : "",
    task.priority ? `Prioridade: ${["", "Baixa", "Média", "Alta"][task.priority] ?? task.priority}` : "",
  ].filter(Boolean).join("\n");
  const lines = [
    "BEGIN:VEVENT",
    `UID:${task.id}@pauta.app`,
    `DTSTAMP:${utcTimestamp(task.updated_at || task.created_at)}`,
    `LAST-MODIFIED:${utcTimestamp(task.updated_at || task.created_at)}`,
    `SUMMARY:${escapeText(task.title)}`,
  ];

  if (task.due_time && /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(task.due_time)) {
    lines.push(
      `DTSTART:${date}T${task.due_time.replace(/:/g, "").padEnd(6, "0")}`,
      "DURATION:PT30M",
    );
  } else {
    lines.push(`DTSTART;VALUE=DATE:${date}`, `DTEND;VALUE=DATE:${nextDate(task.due_at)}`);
  }
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  lines.push("STATUS:CONFIRMED", "END:VEVENT");
  return lines;
}

export function buildCalendar(tasks: FeedTask[], lists: FeedList[]): string {
  const listNames = new Map(lists.map((list) => [list.id, list.name]));
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pauta//Tarefas//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Pauta - Tarefas",
    "X-WR-CALDESC:Tarefas com prazo do Pauta",
  ];
  for (const task of tasks) {
    if (!validDate(task.due_at)) continue;
    lines.push(...eventLines(task, task.list_id ? listNames.get(task.list_id) : undefined));
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}
