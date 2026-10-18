import { FormEvent, useState } from "react";
import { supabase } from "./supabase";
import type { List } from "./types";
import Mark from "./Mark";
import { cv, lineVar } from "./colors";

type Props = {
  lists: List[];
  setLists: (fn: (p: List[]) => List[]) => void;
  view: string;
  setView: (v: string) => void;
  onSignOut: () => void;
};

const VIEWS: { id: string; label: string; gap?: boolean }[] = [
  { id: "today", label: "Hoje" },
  { id: "upcoming", label: "Próximas" },
  { id: "all", label: "Todas" },
  { id: "done", label: "Concluídas" },
  { id: "notes", label: "Notas", gap: true },
  { id: "archive", label: "Arquivo" },
];

export default function Sidebar({ lists, setLists, view, setView, onSignOut }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function addList(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setName("");
    const { data, error } = await supabase.from("lists").insert({ name: n }).select("id,name").single();
    if (error) setError(error.message);
    else setLists((p) => [...p, data as List]);
  }

  async function removeList(l: List) {
    if (!window.confirm(`Excluir a lista "${l.name}"? As tarefas dela ficam sem lista.`)) return;
    const { error } = await supabase.from("lists").delete().eq("id", l.id);
    if (error) return setError(error.message);
    setLists((p) => p.filter((x) => x.id !== l.id));
    if (view === `list:${l.id}`) setView("all");
  }

  return (
    <nav className="side" aria-label="Navegação">
      <div className="side-head">
        <h1 className="brand"><Mark /> Pauta</h1>
        <button className="ghost" onClick={onSignOut}>Sair</button>
      </div>

      <ul className="nav">
        {VIEWS.map((v) => (
          <li key={v.id} className={v.gap ? "gap" : undefined}>
            <button aria-current={view === v.id} onClick={() => setView(v.id)}>
              {v.label}
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
                <span className="lbadge" style={cv(lineVar(i))}>{l.name.charAt(0).toUpperCase()}</span>
                {l.name}
              </button>
              <button className="ghost" onClick={() => removeList(l)} aria-label={`Excluir lista ${l.name}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={addList} className="addlist">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova lista" aria-label="Nova lista" />
        </form>
      </div>
      {error && <p className="error">{error}</p>}
    </nav>
  );
}
