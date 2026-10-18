import { FormEvent, useState } from "react";
import { supabase } from "./supabase";
import type { List } from "./types";
import Mark from "./Mark";
import { cv, listColor } from "./colors";
import { LIST_COLS, useData } from "./data";
import { isDormant, today } from "./util";

type Props = { view: string; setView: (v: string) => void; onSignOut: () => void };

const VIEWS: { id: string; label: string; gap?: boolean }[] = [
  { id: "today", label: "Hoje" },
  { id: "upcoming", label: "Próximas" },
  { id: "all", label: "Todas" },
  { id: "done", label: "Concluídas" },
  { id: "notes", label: "Notas", gap: true },
  { id: "archive", label: "Arquivo" },
];

export default function Sidebar({ view, setView, onSignOut }: Props) {
  const { tasks, notes, lists, setLists } = useData();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const t0 = today();
  const pending = tasks.filter((t) => !t.done && !isDormant(t));
  const counts: Record<string, number> = {
    today: pending.filter((t) => t.due_at && t.due_at <= t0).length,
    upcoming: pending.filter((t) => t.due_at && t.due_at > t0).length,
    all: pending.length,
    notes: notes.filter((n) => !n.archived).length,
  };

  async function addList(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setName("");
    // Escolhe a primeira cor ainda não usada
    const used = new Set(lists.map((l, i) => l.color ?? i));
    const color = [0, 1, 2, 3, 4, 5].find((c) => !used.has(c)) ?? lists.length % 6;
    const { data, error } = await supabase.from("lists").insert({ name: n, color }).select(LIST_COLS).single();
    if (error) setError(error.message);
    else {
      const row = data as unknown as List;
      setLists((p) => (p.some((l) => l.id === row.id) ? p : [...p, row]));
    }
  }

  async function removeList(l: List) {
    if (!window.confirm(`Excluir a lista "${l.name}"? As tarefas dela ficam sem lista.`)) return;
    const { error } = await supabase.from("lists").delete().eq("id", l.id);
    if (error) return setError(error.message);
    setLists((p) => p.filter((x) => x.id !== l.id));
    if (view === `list:${l.id}`) setView("all");
  }

  function exportData() {
    const json = JSON.stringify({ exportado_em: new Date().toISOString(), listas: lists, tarefas: tasks, notas: notes }, null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `pauta-${t0}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const count = (n: number | undefined) => (n ? <span className="count">{n}</span> : null);

  return (
    <nav className="side" aria-label="Navegação">
      <div className="side-head">
        <h1 className="brand"><Mark /> Pauta</h1>
        <div className="side-actions">
          <button className="ghost" onClick={exportData} title="Baixar uma cópia dos seus dados (JSON)">Exportar</button>
          <button className="ghost" onClick={onSignOut}>Sair</button>
        </div>
      </div>

      <ul className="nav">
        {VIEWS.map((v) => (
          <li key={v.id} className={v.gap ? "gap" : undefined}>
            <button aria-current={view === v.id} onClick={() => setView(v.id)}>
              {v.label}
              {count(counts[v.id])}
            </button>
          </li>
        ))}
      </ul>

      <h2>Listas</h2>
      <div className="lists">
        <ul className="nav">
          {lists.map((l, i) => (
            <li key={l.id} className="with-x">
              <button aria-current={view === `list:${l.id}`} onClick={() => setView(`list:${l.id}`)}>
                <span className="lbadge" style={cv(listColor(l, i))}>{l.name.charAt(0).toUpperCase()}</span>
                {l.name}
                {count(pending.filter((t) => t.list_id === l.id).length)}
              </button>
              <button className="ghost" onClick={() => removeList(l)} aria-label={`Excluir lista ${l.name}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={addList} className="addlist">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova lista" aria-label="Nova lista" enterKeyHint="done" />
          <button className="primary small" aria-label="Criar lista" disabled={!name.trim()}>Criar</button>
        </form>
      </div>
      {error && <p className="error">{error}</p>}
    </nav>
  );
}
