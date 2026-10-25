import { FormEvent, useMemo, useState } from "react";
import Sheet from "../../components/Sheet";
import Swatches from "../../components/Swatches";
import { cv, lineVar } from "../../lib/colors";
import { LIST_COLS, useData } from "../../lib/data";
import { supabase } from "../../lib/supabase";
import type { List } from "../../lib/types";

export default function ListCreateSheet({ onClose }: { onClose: () => void }) {
  const { lists, setLists } = useData();
  const [name, setName] = useState("");
  const used = useMemo(() => new Set(lists.map((list, index) => list.color ?? index)), [lists]);
  const defaultColor = [0, 1, 2, 3, 4, 5].find((color) => !used.has(color)) ?? lists.length % 6;
  const [color, setColor] = useState(String(defaultColor));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName || saving) return;
    setSaving(true);
    setError(null);
    const position = lists.length ? Math.max(...lists.map((list) => list.position)) + 1 : 0;
    try {
      const { data, error: insertError } = await supabase.from("lists")
        .insert({ name: cleanName, color: Number(color), position })
        .select(LIST_COLS)
        .single();
      if (insertError) {
        setError(insertError.message);
        return;
      }
      const row = data as unknown as List;
      setLists((current) => current.some((list) => list.id === row.id) ? current : [...current, row]);
      onClose();
    } catch (insertError) {
      setError(`Não foi possível criar a lista: ${insertError instanceof Error ? insertError.message : String(insertError)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title="Criar lista" onClose={onClose}>
      <form className="create-form list-create-form" onSubmit={submit}>
        <label>
          Nome da lista
          <input autoFocus required maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Projetos pessoais" />
        </label>
        <fieldset>
          <legend>Cor</legend>
          <Swatches value={color} onPick={(next) => next !== null && setColor(next)} allowNone={false} />
          <span className="list-create-preview" style={cv(lineVar(Number(color)))} aria-hidden="true" />
        </fieldset>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="create-actions">
          <button type="button" className="ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary" disabled={!name.trim() || saving}>{saving ? "Criando…" : "Criar lista"}</button>
        </div>
      </form>
    </Sheet>
  );
}
