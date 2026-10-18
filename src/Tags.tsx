import { useState } from "react";
import { normTag } from "./util";

export default function TagInput({ tags, onChange, suggestions, listId }: { tags: string[]; onChange: (t: string[]) => void; suggestions: string[]; listId: string }) {
  const [text, setText] = useState("");

  function commit(raw: string) {
    const t = normTag(raw);
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setText("");
  }

  return (
    <div className="taginput">
      {tags.map((t) => (
        <span key={t} className="chip">
          #{t}
          <button type="button" aria-label={`Remover etiqueta ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
            ×
          </button>
        </span>
      ))}
      <input
        value={text}
        list={listId}
        placeholder={tags.length ? "" : "Etiquetas (Enter adiciona)"}
        aria-label="Adicionar etiqueta"
        enterKeyHint="done"
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",")) commit(v.slice(0, -1));
          else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            commit(text);
          } else if (e.key === "Backspace" && !text && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => text.trim() && commit(text)}
      />
      <datalist id={listId}>
        {suggestions.filter((s) => !tags.includes(s)).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
