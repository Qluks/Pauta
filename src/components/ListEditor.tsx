import { useState } from "react";
import { useData } from "../lib/data";
import type { List } from "../lib/types";
import Swatches from "./Swatches";

export default function ListEditor({ list, index, onClose }: { list: List; index: number; onClose: () => void }) {
  const { setLists, saveMutation } = useData();
  const [name, setName] = useState(list.name);
  const [error, setError] = useState<string | null>(null);

  async function save(changes: Partial<List>) {
    const prev = list;
    setLists((p) => p.map((l) => (l.id === list.id ? { ...l, ...changes } : l)));
    const result = await saveMutation("lists", list.id, "update", changes, list);
    if (result.error) {
      setLists((p) => p.map((l) => (l.id === list.id ? prev : l)));
      setError(result.error);
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
