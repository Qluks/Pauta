import type { List } from "./types";
import { isoDate, normTag } from "./util";

export const RECURRENCE_LABEL: Record<string, string> = {
  daily: "Todo dia",
  weekdays: "Dias úteis",
  weekly: "Toda semana",
  monthly: "Todo mês",
};

export type Parsed = {
  title: string;
  due_at: string | null;
  priority: number;
  listId: string | null;
  tags: string[];
  recurrence: string | null;
};

const strip = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const WEEKDAYS: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
const WD = "segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo";
const PRE = "(?:(?:para|pra|at[eé]|em|no|na)\\s+)?";

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

// Procura o padrão (precedido de início ou espaço) e o remove do texto
function take(text: string, pattern: string) {
  const re = new RegExp(`(^|\\s)(?:${pattern})(?=\\s|$|[.,;!?])`, "iu");
  const m = re.exec(text);
  if (!m) return { text, m: null as RegExpExecArray | null };
  return { text: text.slice(0, m.index) + m[1] + text.slice(m.index + m[0].length), m };
}

export function parseQuick(input: string, lists: List[], now = new Date()): Parsed {
  const out: Parsed = { title: "", due_at: null, priority: 0, listId: null, tags: [], recurrence: null };
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const addDays = (n: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return d;
  };
  let text = input;

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

  // !prioridade
  text = text.replace(/(^|\s)!(alta|m[eé]dia|baixa|[1-3])(?=\s|$|[.,;])/giu, (_m, sp: string, p: string) => {
    const k = strip(p);
    out.priority = k === "alta" || k === "3" ? 3 : k === "media" || k === "2" ? 2 : 1;
    return sp;
  });

  // Repetição
  let t = take(text, `tod[oa]\\s+(${WD})(?:-feira)?`);
  if (t.m) {
    out.recurrence = "weekly";
    out.due_at = isoDate(nextWeekday(base, WEEKDAYS[strip(t.m[2])], true));
    text = t.text;
  } else {
    const rules: [string, string][] = [
      ["weekdays", "dias\\s+[uú]teis|de\\s+segunda\\s+a\\s+sexta"],
      ["daily", "todo\\s+dia|todos\\s+os\\s+dias|diariamente"],
      ["weekly", "toda\\s+semana|semanalmente"],
      ["monthly", "todo\\s+m[eê]s|todos\\s+os\\s+meses|mensalmente"],
    ];
    for (const [rec, pat] of rules) {
      t = take(text, pat);
      if (t.m) {
        out.recurrence = rec;
        text = t.text;
        break;
      }
    }
  }

  // Datas
  const tryDate = (pattern: string, fn: (m: RegExpExecArray) => Date | null) => {
    if (out.due_at) return;
    const r = take(text, pattern);
    if (!r.m) return;
    const d = fn(r.m);
    if (d) {
      out.due_at = isoDate(d);
      text = r.text;
    }
  };
  tryDate(PRE + "depois\\s+de\\s+amanh[ãa]", () => addDays(2));
  tryDate(PRE + "amanh[ãa]", () => addDays(1));
  tryDate(PRE + "hoje", () => addDays(0));
  tryDate("em\\s+(\\d{1,3})\\s+(dias?|semanas?)", (m) => addDays(Number(m[2]) * (strip(m[3]).startsWith("semana") ? 7 : 1)));
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
  tryDate("dia\\s+(\\d{1,2})", (m) => {
    const day = Number(m[2]);
    let d = new Date(base.getFullYear(), base.getMonth(), day);
    if (day < 1 || d.getDate() !== day) return null;
    if (d < base) {
      d = new Date(base.getFullYear(), base.getMonth() + 1, day);
      if (d.getDate() !== day) return null;
    }
    return d;
  });

  if (out.recurrence && !out.due_at) {
    out.due_at = isoDate(out.recurrence === "weekdays" ? nextBusinessDay(base, true) : base);
  }

  out.title = text.replace(/\s+/g, " ").trim().replace(/[\s,;]+$/, "");
  return out;
}

// Próxima data de uma tarefa recorrente (sempre depois de hoje)
export function nextDue(due: string, rec: string, now = new Date()): string {
  const todayIso = isoDate(now);
  const [y, m, d] = due.split("-").map(Number);
  let cur = new Date(y, m - 1, d);
  const step = (c: Date) => {
    if (rec === "monthly") {
      const first = new Date(c.getFullYear(), c.getMonth() + 1, 1);
      const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      return new Date(first.getFullYear(), first.getMonth(), Math.min(d, last));
    }
    const n = new Date(c);
    if (rec === "weekly") n.setDate(n.getDate() + 7);
    else if (rec === "weekdays") {
      do n.setDate(n.getDate() + 1);
      while (n.getDay() === 0 || n.getDay() === 6);
    } else n.setDate(n.getDate() + 1);
    return n;
  };
  do cur = step(cur);
  while (isoDate(cur) <= todayIso);
  return isoDate(cur);
}
