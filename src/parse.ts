import type { List } from "./types";
import { isoDate, normTag } from "./util";

export const RECURRENCE_LABEL: Record<string, string> = {
  daily: "Todo dia",
  weekdays: "Dias úteis",
  weekly: "Toda semana",
  monthly: "Todo mês",
};

// Repetição: "daily" | "weekdays" | "weekly" | "monthly", com intervalo opcional ("weekly:2" = a cada 2 semanas)
export function splitRecurrence(rec: string): { kind: string; every: number } {
  const [kind, n] = rec.split(":");
  return { kind, every: Math.max(1, Number(n) || 1) };
}
export function recurrenceLabel(rec: string): string {
  const { kind, every } = splitRecurrence(rec);
  if (every === 1) return RECURRENCE_LABEL[kind] ?? rec;
  if (kind === "daily") return `A cada ${every} dias`;
  if (kind === "weekly") return `A cada ${every} semanas`;
  if (kind === "monthly") return every === 12 ? "Todo ano" : `A cada ${every} meses`;
  return rec;
}

export type ParsedLink = { url: string; title: string };
export type Parsed = {
  title: string;
  due_at: string | null;
  due_time: string | null; // "HH:MM"
  priority: number;
  listId: string | null;
  tags: string[];
  recurrence: string | null;
  links: ParsedLink[];
};

const strip = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const WEEKDAYS: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
const WD = "segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo";
const MONTHS = "janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez";
const MONTH_INDEX: Record<string, number> = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 };
const PRE = "(?:(?:para|pra|at[eé]|em|no|na|pr[óo]xim[ao])\\s+)?";
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

function nextWeekday(from: Date, dow: number, inclusive: boolean) {
  const d = new Date(from);
  let diff = (dow - d.getDay() + 7) % 7;
  if (diff === 0 && !inclusive) diff = 7;
  d.setDate(d.getDate() + diff);
  return d;
}
function nextBusinessDay(from: Date, inclusive: boolean) {
  const d = new Date(from);
  if (!inclusive) d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
function addMonths(d: Date, n: number) {
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), daysIn(first.getFullYear(), first.getMonth())));
}
// Próxima vez que cai o dia N do mês (hoje conta); em meses curtos usa o último dia
function nextDayOfMonth(base: Date, day: number) {
  const y = base.getFullYear();
  const m = base.getMonth();
  const d = new Date(y, m, Math.min(day, daysIn(y, m)));
  if (d >= base) return d;
  const n = new Date(y, m + 1, 1);
  return new Date(n.getFullYear(), n.getMonth(), Math.min(day, daysIn(n.getFullYear(), n.getMonth())));
}

// Procura o padrão (precedido de início ou espaço) e o remove do texto
function take(text: string, pattern: string) {
  const re = new RegExp(`(^|\\s)(?:${pattern})(?=\\s|$|[.,;!?])`, "iu");
  const m = re.exec(text);
  if (!m) return { text, m: null as RegExpExecArray | null };
  return { text: text.slice(0, m.index) + m[1] + text.slice(m.index + m[0].length), m };
}

// Nome de lista como expressão regular que aceita com ou sem acento
function accentPattern(name: string) {
  const cls: Record<string, string> = { a: "[aàáâãä]", e: "[eéèêë]", i: "[iíìîï]", o: "[oóòôõö]", u: "[uúùûü]", c: "[cç]" };
  return [...name.trim()]
    .map((ch) => (/\s/.test(ch) ? "\\s+" : cls[strip(ch)] ?? ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
}

// Links (http, https ou www.) viram anexos e saem do texto
function extractLinks(text: string, links: ParsedLink[]) {
  return text.replace(/(^|[\s(\[])((?:https?:\/\/|www\.)[^\s<>"']+)/giu, (m0, sp: string, raw: string) => {
    const url = raw.replace(/[.,;:!?)\]]+$/, "");
    const tail = raw.slice(url.length);
    try {
      const u = new URL(/^https?:\/\//i.test(url) ? url : "https://" + url);
      if (!links.some((l) => l.url === u.toString())) links.push({ url: u.toString(), title: u.hostname.replace(/^www\./, "") });
      return sp + tail;
    } catch {
      return m0;
    }
  });
}

const prio = (p: string) => {
  const k = strip(p);
  return k === "alta" || k === "maxima" || k === "3" ? 3 : k === "media" || k === "2" ? 2 : 1;
};

export function parseQuick(input: string, lists: List[], now = new Date()): Parsed {
  const out: Parsed = { title: "", due_at: null, due_time: null, priority: 0, listId: null, tags: [], recurrence: null, links: [] };
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const addDays = (n: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return d;
  };
  let text = extractLinks(input, out.links);

  // #etiqueta
  text = text.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, (_m, sp: string, tag: string) => {
    const t = normTag(tag);
    if (t && !out.tags.includes(t)) out.tags.push(t);
    return sp;
  });

  // @lista (só quando existe uma lista com esse nome)
  text = text.replace(/(^|\s)@([\p{L}\p{N}_-]+)/gu, (m0: string, sp: string, name: string) => {
    if (out.listId) return m0;
    const k = strip(name);
    const key = (l: List) => strip(l.name).replace(/\s+/g, "");
    const l = lists.find((x) => key(x) === k) ?? lists.find((x) => key(x).startsWith(k));
    if (!l) return m0;
    out.listId = l.id;
    return sp;
  });

  // "na lista Casa", "lista: Trabalho EY"
  if (!out.listId) {
    for (const l of [...lists].sort((a, b) => b.name.length - a.name.length)) {
      const r = take(text, `(?:(?:na|da|para\\s+a|pra|em)\\s+)?lista:?\\s+${accentPattern(l.name)}`);
      if (r.m) {
        out.listId = l.id;
        text = r.text;
        break;
      }
    }
  }

  // Prioridade: !alta, !2, "prioridade alta", "baixa prioridade"
  text = text.replace(/(^|\s)!(alta|m[eé]dia|baixa|m[aá]xima|[1-3])(?=\s|$|[.,;])/giu, (_m, sp: string, p: string) => {
    out.priority = prio(p);
    return sp;
  });
  text = text.replace(/(^|\s)(?:prioridade\s+(alta|m[aá]xima|m[eé]dia|baixa)|(alta|m[eé]dia|baixa)\s+prioridade)(?=\s|$|[.,;!?])/giu, (_m, sp: string, a?: string, b?: string) => {
    out.priority = prio((a ?? b) as string);
    return sp;
  });

  // ---- Repetição ----
  const UNIT = (u: string): [string, number] => {
    const k = strip(u);
    return k.startsWith("dia") ? ["daily", 1] : k.startsWith("semana") ? ["weekly", 1] : k.startsWith("mes") ? ["monthly", 1] : ["monthly", 12];
  };
  const rec = (kind: string, n: number) => (n > 1 ? `${kind}:${n}` : kind);
  const setRec = (value: string, due?: Date) => {
    out.recurrence = value;
    if (due && !out.due_at) out.due_at = isoDate(due);
  };
  let r = take(text, "tod[oa]s?\\s+(?:os\\s+)?dias?\\s+(\\d{1,2})"); // "todo dia 10" = todo mês, no dia 10
  if (r.m && Number(r.m[2]) >= 1 && Number(r.m[2]) <= 31) {
    setRec("monthly", nextDayOfMonth(base, Number(r.m[2])));
    text = r.text;
  }
  const rules: [string, (m: RegExpExecArray) => string][] = [
    ["dias\\s+[uú]teis|de\\s+segunda\\s+a\\s+sexta", () => "weekdays"],
    ["a\\s+cada\\s+(\\d{1,2})\\s+(dias?|semanas?|mes(?:es)?|m[eê]s(?:es)?|anos?)", (m) => { const [k, mult] = UNIT(m[3]); return rec(k, Number(m[2]) * mult); }],
    ["de\\s+(\\d{1,2})\\s+em\\s+\\2\\s+(dias|semanas|meses)", (m) => { const [k, mult] = UNIT(m[3]); return rec(k, Number(m[2]) * mult); }],
    ["a\\s+cada\\s+(dia|semana|m[eê]s|ano)", (m) => { const [k, mult] = UNIT(m[2]); return rec(k, mult); }],
    ["quinzenal(?:mente)?", () => "weekly:2"],
    ["bimestral(?:mente)?", () => "monthly:2"],
    ["trimestral(?:mente)?", () => "monthly:3"],
    ["semestral(?:mente)?", () => "monthly:6"],
    ["anual(?:mente)?|tod[oa]s?\\s+(?:os\\s+)?anos?", () => "monthly:12"],
    ["diariamente|tod[oa]s?\\s+(?:os\\s+)?dias?", () => "daily"],
    ["semanalmente|tod[oa]s?\\s+(?:as\\s+)?semanas?", () => "weekly"],
    ["mensalmente|tod[oa]s?\\s+(?:os\\s+)?m[eê]s(?:es)?", () => "monthly"],
  ];
  for (const [pattern, fn] of rules) {
    if (out.recurrence) break;
    r = take(text, pattern);
    if (r.m) {
      out.recurrence = fn(r.m);
      text = r.text;
    }
  }
  if (!out.recurrence) {
    r = take(text, `tod[oa]s?\\s+(?:as\\s+|os\\s+)?(${WD})s?(?:-feiras?)?`); // "toda segunda"
    if (r.m) {
      setRec("weekly", nextWeekday(base, WEEKDAYS[strip(r.m[2])], true));
      text = r.text;
    }
  }

  // ---- Datas ----
  const tryDate = (pattern: string, fn: (m: RegExpExecArray) => Date | null) => {
    if (out.due_at) return;
    const t = take(text, pattern);
    if (!t.m) return;
    const d = fn(t.m);
    if (d) {
      out.due_at = isoDate(d);
      text = t.text;
    }
  };
  tryDate(PRE + "depois\\s+de\\s+amanh[ãa]", () => addDays(2));
  tryDate(PRE + "amanh[ãa]", () => addDays(1));
  tryDate(PRE + "hoje", () => addDays(0));
  tryDate("(?:em|daqui\\s+a)\\s+(\\d{1,3})\\s+(dias?|semanas?|mes(?:es)?|m[eê]s(?:es)?)", (m) => {
    const n = Number(m[2]);
    const u = strip(m[3]);
    return u.startsWith("dia") ? addDays(n) : u.startsWith("semana") ? addDays(7 * n) : addMonths(base, n);
  });
  tryDate("(?:na\\s+)?(?:semana\\s+que\\s+vem|pr[óo]xima\\s+semana)", () => nextWeekday(base, 1, false));
  tryDate("(?:no\\s+)?(?:m[eê]s\\s+que\\s+vem|pr[óo]ximo\\s+m[eê]s)", () => addMonths(base, 1));
  tryDate("(?:no\\s+)?(?:fim|final)\\s+do\\s+m[eê]s", () => new Date(base.getFullYear(), base.getMonth() + 1, 0));
  tryDate("(?:no\\s+)?(?:fim|final)\\s+de\\s+semana", () => nextWeekday(base, 6, true));
  tryDate(PRE + `(?:dia\\s+)?(\\d{1,2})\\s+de\\s+(${MONTHS})(?:\\s+de\\s+(\\d{4}))?`, (m) => {
    const day = Number(m[2]);
    const mon = MONTH_INDEX[strip(m[3]).slice(0, 3)];
    const year = m[4] ? Number(m[4]) : base.getFullYear();
    let d = new Date(year, mon, day);
    if (d.getMonth() !== mon) return null;
    if (!m[4] && d < base) d = new Date(year + 1, mon, day);
    return d;
  });
  tryDate(PRE + "(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?", (m) => {
    const day = Number(m[2]);
    const mon = Number(m[3]) - 1;
    let year = m[4] ? Number(m[4]) : base.getFullYear();
    if (year < 100) year += 2000;
    let d = new Date(year, mon, day);
    if (d.getMonth() !== mon || d.getDate() !== day) return null;
    if (!m[4] && d < base) d = new Date(year + 1, mon, day);
    return d;
  });
  tryDate(PRE + `(${WD})(?:-feira)?`, (m) => nextWeekday(base, WEEKDAYS[strip(m[2])], false));
  tryDate(PRE + "dia\\s+(\\d{1,2})", (m) => {
    const day = Number(m[2]);
    let d = new Date(base.getFullYear(), base.getMonth(), day);
    if (day < 1 || d.getDate() !== day) return null;
    if (d < base) {
      d = new Date(base.getFullYear(), base.getMonth() + 1, day);
      if (d.getDate() !== day) return null;
    }
    return d;
  });

  // ---- Horário ----
  const setTime = (h: number, min: number) => {
    if (h > 23 || min > 59) return false;
    out.due_time = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
    return true;
  };
  const tryTime = (pattern: string, fn: (m: RegExpExecArray) => boolean) => {
    if (out.due_time) return;
    const t = take(text, pattern);
    if (t.m && fn(t.m)) text = t.text;
  };
  // "em 2 horas", "daqui a 30 minutos": só quando ainda não há data nem horário
  if (!out.due_at && !out.due_time) {
    const t = take(text, "(?:em|daqui\\s+a)\\s+(\\d{1,3})\\s*(horas?|hrs?|h|minutos?|mins?|min)");
    if (t.m) {
      const target = new Date(now.getTime() + Number(t.m[2]) * (strip(t.m[3]).startsWith("h") ? 60 : 1) * 60000);
      out.due_at = isoDate(target);
      out.due_time = hhmm(target);
      text = t.text;
    }
  }
  tryTime("(?:[àa]s\\s+)?(\\d{1,2})[:h](\\d{2})", (m) => setTime(Number(m[2]), Number(m[3])));
  tryTime("(?:[àa]s\\s+)?(\\d{1,2})h", (m) => setTime(Number(m[2]), 0));
  tryTime("às\\s+(\\d{1,2})", (m) => setTime(Number(m[2]), 0));
  tryTime("meio[- ]dia", () => setTime(12, 0));
  tryTime("meia[- ]noite", () => setTime(0, 0));
  tryTime("(?:de|pela|na)\\s+manh[ãa]", () => setTime(9, 0));
  tryTime("(?:à|de|pela|na)\\s+tarde", () => setTime(15, 0));
  tryTime("(?:à|de|pela|na)\\s+noite", () => setTime(20, 0));
  // Só horário, sem data: hoje se ainda não passou, senão amanhã
  if (out.due_time && !out.due_at) out.due_at = isoDate(out.due_time > hhmm(now) ? base : addDays(1));

  if (out.recurrence && !out.due_at) {
    out.due_at = isoDate(splitRecurrence(out.recurrence).kind === "weekdays" ? nextBusinessDay(base, true) : base);
  }

  out.title = text.replace(/\s+/g, " ").trim().replace(/[\s,;]+$/, "");
  if (!out.title && out.links.length) out.title = out.links[0].title; // só colou um link
  return out;
}

// ---- Notas ----
export type ParsedNote = {
  title: string;
  body: string;
  color: string | null; // índice da cor ("0" a "5")
  tags: string[];
  checklist: { id: string; text: string; done: boolean }[];
  pinned: boolean;
  links: ParsedLink[];
};
const NOTE_COLORS: Record<string, string> = { azul: "0", verde: "1", laranja: "2", magenta: "3", rosa: "3", roxo: "4", turquesa: "5", ciano: "5", "verde-azulado": "5" };

// Primeira linha = título · "- item", "[ ] item" ou "itens: a, b, c" = checklist · #etiquetas · "cor verde" · "fixar" · links
export function parseNote(input: string): ParsedNote {
  const out: ParsedNote = { title: "", body: "", color: null, tags: [], checklist: [], pinned: false, links: [] };
  let text = extractLinks(input, out.links);
  text = text.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, (_m, sp: string, tag: string) => {
    const t = normTag(tag);
    if (t && !out.tags.includes(t)) out.tags.push(t);
    return sp;
  });
  let r = take(text, "cor\\s+(verde-azulado|azul|verde|laranja|magenta|rosa|roxo|turquesa|ciano)");
  if (r.m) {
    out.color = NOTE_COLORS[strip(r.m[2])] ?? null;
    text = r.text;
  }
  r = take(text, "fixar|fixada");
  if (r.m) {
    out.pinned = true;
    text = r.text;
  }

  const item = (t: string, done = false) => {
    const v = t.trim();
    if (v) out.checklist.push({ id: crypto.randomUUID(), text: v, done });
  };
  const plain: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = /^(?:([-*•])\s+)?(?:(\[[xX]\])|(\[\s?\]))?\s*(.*)$/.exec(line);
    if (bullet && (bullet[1] || bullet[2] || bullet[3])) {
      item(bullet[4], !!bullet[2]);
      continue;
    }
    const inline = /^(.*?)\s*\b(?:itens|checklist):\s*(.+)$/iu.exec(line);
    if (inline) {
      inline[2].split(/[,;]/).forEach((t) => item(t));
      if (inline[1].trim()) plain.push(inline[1].trim());
      continue;
    }
    plain.push(line.replace(/\s+/g, " "));
  }
  out.title = plain[0] ?? "";
  out.body = plain.slice(1).join("\n");
  if (!out.title && !out.body && out.checklist.length === 0 && out.links.length) out.title = out.links[0].title;
  return out;
}

// Próxima data de uma tarefa recorrente (sempre depois de hoje)
export function nextDue(due: string, recurrence: string, now = new Date()): string {
  const todayIso = isoDate(now);
  const { kind, every } = splitRecurrence(recurrence);
  const [y, m, d] = due.split("-").map(Number);
  let cur = new Date(y, m - 1, d);
  const step = (c: Date) => {
    if (kind === "monthly") {
      const first = new Date(c.getFullYear(), c.getMonth() + every, 1);
      return new Date(first.getFullYear(), first.getMonth(), Math.min(d, daysIn(first.getFullYear(), first.getMonth())));
    }
    const n = new Date(c);
    if (kind === "weekly") n.setDate(n.getDate() + 7 * every);
    else if (kind === "weekdays") {
      do n.setDate(n.getDate() + 1);
      while (n.getDay() === 0 || n.getDay() === 6);
    } else n.setDate(n.getDate() + every);
    return n;
  };
  do cur = step(cur);
  while (isoDate(cur) <= todayIso);
  return isoDate(cur);
}

// Quantos dias antes do prazo a tarefa concluída volta para a lista
export const RECURRENCE_LEAD: Record<string, number> = { daily: 0, weekdays: 0, weekly: 2, monthly: 5 };

// Data em que a tarefa volta a aparecer (ou null, se o prazo já está perto o bastante)
export function snoozeUntil(next: string, recurrence: string, now = new Date()): string | null {
  const [y, m, d] = next.split("-").map(Number);
  const iso = isoDate(new Date(y, m - 1, d - (RECURRENCE_LEAD[splitRecurrence(recurrence).kind] ?? 0)));
  return iso > isoDate(now) ? iso : null;
}
