import { KeyboardEvent, useState } from "react";
import type { ChecklistItem } from "../lib/types";

const noSubmit = (e: KeyboardEvent) => {
  if (e.key === "Enter") e.preventDefault();
};

export function ChecklistEditor({ items, onChange }: { items: ChecklistItem[]; onChange: (i: ChecklistItem[]) => void }) {
  const [open, setOpen] = useState(items.length > 0);
  const [text, setText] = useState("");
  if (!open) {
    return (
      <button type="button" className="ghost cl-add" onClick={() => setOpen(true)}>
        + Lista de itens
      </button>
    );
  }
  const addItem = () => {
    const t = text.trim();
    if (t) onChange([...items, { id: crypto.randomUUID(), text: t, done: false }]);
    setText("");
  };
  const set = (id: string, changes: Partial<ChecklistItem>) => onChange(items.map((i) => (i.id === id ? { ...i, ...changes } : i)));

  return (
    <div className="checklist">
      {items.map((it) => (
        <div key={it.id} className="clrow">
          <input type="checkbox" checked={it.done} onChange={() => set(it.id, { done: !it.done })} aria-label={`Marcar ${it.text}`} />
          <input className="cltext" value={it.text} onChange={(e) => set(it.id, { text: e.target.value })} onKeyDown={noSubmit} aria-label="Texto do item" />
          <button type="button" className="ghost" onClick={() => onChange(items.filter((i) => i.id !== it.id))} aria-label={`Remover item ${it.text}`}>
            ×
          </button>
        </div>
      ))}
      <div className="clrow">
        <span className="clplus" aria-hidden="true">+</span>
        <input
          className="cltext"
          value={text}
          placeholder="Adicionar item"
          aria-label="Novo item"
          enterKeyHint="done"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
          onBlur={addItem}
        />
      </div>
    </div>
  );
}

export function ChecklistView({ items, onToggle }: { items: ChecklistItem[]; onToggle: (id: string) => void }) {
  if (items.length === 0) return null;
  const done = items.filter((i) => i.done).length;
  return (
    <div className="checklist">
      {items.map((it) => (
        <label key={it.id} className={`clitem${it.done ? " done" : ""}`}>
          <input type="checkbox" checked={it.done} onChange={() => onToggle(it.id)} />
          <span>{it.text}</span>
        </label>
      ))}
      <span className="clprog">{done}/{items.length} concluídos</span>
    </div>
  );
}
