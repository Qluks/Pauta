import { useState } from "react";
import { supabase } from "./supabase";
import { useData } from "./data";
import type { List } from "./types";
import Swatches from "./Swatches";

export default function ListEditor({ list, index, onClose }: { list: List; index: number; onClose: () => void }) {
  const { setLists } = useData();
  const [name, setName] = useState(list.name);
  const [error, setError] = useState<string | null>(null);

  async function save(changes: Partial<List>) {
    const prev = list;
    setLists((p) => p.map((l) => (l.id === list.id ? { ...l, ...changes } : l)));
    const { error } = await supabase.from("lists").update(changes).eq("id", list.id);
    if (error) {
      setLists((p) => p.map((l) => (l.id === list.id ? prev : l)));
      setError(error.message);
    }
  }
  function saveName() {
    const n = name.trim();
    if (n && n !== list.name) save({ name: n });
    else setName(list.name);
  }

  return (
    <div className="listeditor">
      <label>
        Nome da lista
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} />
      </label>
      <div>
        <span className="lbl">Cor da linha</span>
        <Swatches value={String(list.color ?? index)} allowNone={false} label="Cor da lista" onPick={(c) => c !== null && save({ color: Number(c) })} />
      </div>
      {error && <p className="error">{error}</p>}
      <button className="ghost" onClick={onClose}>Fechar</button>
    </div>
  );
}
