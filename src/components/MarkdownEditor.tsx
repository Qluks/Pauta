import { PointerEvent, useRef, useState } from "react";
import MarkdownContent from "./MarkdownContent";

type Props = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  rows?: number;
  placeholder?: string;
  className?: string;
};

type FormatAction = {
  label: string;
  title: string;
  before: string;
  after: string;
  line?: boolean;
};

const FORMATS: FormatAction[] = [
  { label: "B", title: "Negrito", before: "**", after: "**" },
  { label: "I", title: "Itálico", before: "*", after: "*" },
  { label: "S", title: "Tachado", before: "~~", after: "~~" },
  { label: "H", title: "Título", before: "## ", after: "", line: true },
  { label: "•", title: "Lista com marcadores", before: "- ", after: "", line: true },
  { label: "1.", title: "Lista numerada", before: "1. ", after: "", line: true },
  { label: "❝", title: "Citação", before: "> ", after: "", line: true },
  { label: "</>", title: "Código", before: "`", after: "`" },
  { label: "↗", title: "Link", before: "[", after: "](https://)" },
];

export default function MarkdownEditor({ value, onChange, label = "Texto da nota", rows = 7, placeholder, className = "" }: Props) {
  const input = useRef<HTMLTextAreaElement>(null);
  const selection = useRef({ start: 0, end: 0 });
  const [preview, setPreview] = useState(false);

  function rememberSelection() {
    const element = input.current;
    if (element) selection.current = { start: element.selectionStart, end: element.selectionEnd };
  }

  function applyFormat(action: FormatAction) {
    const element = input.current;
    if (!element) return;
    const { start, end } = selection.current;
    const selected = value.slice(start, end);
    let nextValue: string;
    let nextStart: number;
    let nextEnd: number;

    if (action.line) {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const lineEndAt = value.indexOf("\n", end);
      const lineEnd = lineEndAt < 0 ? value.length : lineEndAt;
      const lines = value.slice(lineStart, lineEnd).split("\n");
      const formatted = lines.map((line) => `${action.before}${line}`).join("\n");
      nextValue = `${value.slice(0, lineStart)}${formatted}${value.slice(lineEnd)}`;
      nextStart = lineStart;
      nextEnd = lineStart + formatted.length;
    } else {
      const replacement = `${action.before}${selected || "texto"}${action.after}`;
      nextValue = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
      nextStart = start + action.before.length;
      nextEnd = nextStart + (selected ? selected.length : "texto".length);
    }

    onChange(nextValue);
    requestAnimationFrame(() => {
      element.focus({ preventScroll: true });
      element.setSelectionRange(nextStart, nextEnd);
      selection.current = { start: nextStart, end: nextEnd };
    });
  }

  function keepToolbarFocus(_event: PointerEvent<HTMLButtonElement>) {
    rememberSelection();
  }

  return (
    <div className={`markdown-editor ${className}`}>
      <div className="markdown-toolbar" role="toolbar" aria-label="Formatação do texto">
        {FORMATS.map((action) => (
          <button
            key={action.title}
            type="button"
            className={`markdown-tool format-${action.title.toLowerCase().replace(/ /g, "-")}`}
            aria-label={action.title}
            title={action.title}
            onPointerDown={keepToolbarFocus}
            onClick={() => applyFormat(action)}
          >
            {action.label}
          </button>
        ))}
        <span className="markdown-toolbar-spacer" />
        <button
          type="button"
          className="markdown-preview-toggle"
          aria-pressed={preview}
          onPointerDown={keepToolbarFocus}
          onClick={() => setPreview((current) => !current)}
        >
          {preview ? "Editar" : "Prévia"}
        </button>
      </div>
      {preview ? (
        <div className="markdown-preview" aria-label="Prévia formatada">
          {value.trim() ? <MarkdownContent value={value} /> : <span className="markdown-empty">A prévia aparecerá aqui.</span>}
        </div>
      ) : (
        <textarea
          ref={input}
          rows={rows}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            rememberSelection();
          }}
          onSelect={rememberSelection}
          onKeyUp={rememberSelection}
          onClick={rememberSelection}
          placeholder={placeholder}
          aria-label={label}
          autoCapitalize="sentences"
          spellCheck
        />
      )}
    </div>
  );
}
