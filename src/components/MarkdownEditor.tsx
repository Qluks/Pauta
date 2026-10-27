import { FormEvent, KeyboardEvent, PointerEvent, useEffect, useRef, useState } from "react";
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
  shortcut?: string;
  shortcutKey?: string;
};

type FormatChange = {
  before: string;
  after: string;
  beforeSelection: { start: number; end: number };
  afterSelection: { start: number; end: number };
};

type LinkDraft = {
  start: number;
  end: number;
  text: string;
  url: string;
};

const FORMATS: FormatAction[] = [
  { label: "B", title: "Negrito", before: "**", after: "**", shortcut: "Ctrl/⌘ + B", shortcutKey: "b" },
  { label: "I", title: "Itálico", before: "*", after: "*", shortcut: "Ctrl/⌘ + I", shortcutKey: "i" },
  { label: "S", title: "Tachado", before: "~~", after: "~~" },
  { label: "H", title: "Título", before: "## ", after: "", line: true },
  { label: "•", title: "Lista com marcadores", before: "- ", after: "", line: true },
  { label: "1.", title: "Lista numerada", before: "1. ", after: "", line: true },
  { label: "❝", title: "Citação", before: "> ", after: "", line: true },
  { label: "</>", title: "Código", before: "`", after: "`" },
  { label: "↗", title: "Link", before: "[", after: "](https://)", shortcut: "Ctrl/⌘ + K", shortcutKey: "k" },
];

export default function MarkdownEditor({ value, onChange, label = "Texto da nota", rows = 7, placeholder, className = "" }: Props) {
  const input = useRef<HTMLTextAreaElement>(null);
  const selection = useRef({ start: 0, end: 0 });
  const undoFormats = useRef<FormatChange[]>([]);
  const redoFormats = useRef<FormatChange[]>([]);
  const linkUrlInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(false);
  const [linkDraft, setLinkDraft] = useState<LinkDraft | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const wordCount = value.trim() ? value.trim().split(/\s+/u).length : 0;

  useEffect(() => {
    if (!linkDraft) return;
    linkUrlInput.current?.focus();
  }, [linkDraft]);

  function rememberSelection() {
    const element = input.current;
    if (element) selection.current = { start: element.selectionStart, end: element.selectionEnd };
  }

  function applyFormat(action: FormatAction) {
    const element = input.current;
    if (!element) return;
    const beforeSelection = { ...selection.current };
    const { start, end } = beforeSelection;
    const selected = value.slice(start, end);
    let nextValue: string;
    let nextStart: number;
    let nextEnd: number;

    if (action.line) {
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      const lineEndAt = value.indexOf("\n", end);
      const lineEnd = lineEndAt < 0 ? value.length : lineEndAt;
      const lines = value.slice(lineStart, lineEnd).split("\n");
      const removePrefix = lines.every((line) => line.startsWith(action.before));
      const formatted = lines.map((line) => removePrefix ? line.slice(action.before.length) : `${action.before}${line}`).join("\n");
      nextValue = `${value.slice(0, lineStart)}${formatted}${value.slice(lineEnd)}`;
      nextStart = lineStart;
      nextEnd = lineStart + formatted.length;
    } else {
      const prefixStart = start - action.before.length;
      const suffixEnd = end + action.after.length;
      const isWrapped = !!selected && prefixStart >= 0 && value.slice(prefixStart, start) === action.before && value.slice(end, suffixEnd) === action.after;
      if (isWrapped) {
        nextValue = `${value.slice(0, prefixStart)}${selected}${value.slice(suffixEnd)}`;
        nextStart = prefixStart;
        nextEnd = prefixStart + selected.length;
      } else {
        const replacement = `${action.before}${selected || "texto"}${action.after}`;
        nextValue = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
        nextStart = start + action.before.length;
        nextEnd = nextStart + (selected ? selected.length : "texto".length);
      }
    }

    if (nextValue === value) return;
    const afterSelection = { start: nextStart, end: nextEnd };
    undoFormats.current.push({ before: value, after: nextValue, beforeSelection, afterSelection });
    redoFormats.current = [];
    onChange(nextValue);
    requestAnimationFrame(() => {
      element.focus({ preventScroll: true });
      element.setSelectionRange(nextStart, nextEnd);
      selection.current = { start: nextStart, end: nextEnd };
    });
  }

  function openLinkEditor() {
    rememberSelection();
    const { start, end } = selection.current;
    setLinkDraft({ start, end, text: value.slice(start, end).trim() || "texto do link", url: "" });
    setLinkError(null);
  }

  function saveLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!linkDraft) return;
    const enteredUrl = linkDraft.url.trim();
    const candidateUrl = /^[a-z][a-z\d+.-]*:/i.test(enteredUrl) ? enteredUrl : `https://${enteredUrl}`;
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(candidateUrl);
    } catch {
      setLinkError("Informe um endereço válido, como exemplo.com.");
      return;
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      setLinkError("Use um endereço iniciado por http:// ou https://.");
      return;
    }

    const label = linkDraft.text.replace(/\s+/g, " ").trim() || "link";
    const replacement = `[${label}](${parsedUrl.toString()})`;
    const nextValue = `${value.slice(0, linkDraft.start)}${replacement}${value.slice(linkDraft.end)}`;
    if (nextValue !== value) {
      const beforeSelection = { start: linkDraft.start, end: linkDraft.end };
      const afterSelection = { start: linkDraft.start + 1, end: linkDraft.start + 1 + label.length };
      undoFormats.current.push({ before: value, after: nextValue, beforeSelection, afterSelection });
      redoFormats.current = [];
      onChange(nextValue);
      restoreSelection(afterSelection);
    }
    setLinkDraft(null);
    setLinkError(null);
  }

  function undoFormat() {
    const change = undoFormats.current[undoFormats.current.length - 1];
    if (!change || value !== change.after) return false;
    undoFormats.current.pop();
    redoFormats.current.push(change);
    onChange(change.before);
    restoreSelection(change.beforeSelection);
    return true;
  }

  function redoFormat() {
    const change = redoFormats.current[redoFormats.current.length - 1];
    if (!change || value !== change.before) return false;
    redoFormats.current.pop();
    undoFormats.current.push(change);
    onChange(change.after);
    restoreSelection(change.afterSelection);
    return true;
  }

  function restoreSelection(range: { start: number; end: number }) {
    const element = input.current;
    if (!element) return;
    requestAnimationFrame(() => {
      element.focus({ preventScroll: true });
      element.setSelectionRange(range.start, range.end);
      selection.current = range;
    });
  }

  function keepToolbarFocus(_event: PointerEvent<HTMLButtonElement>) {
    rememberSelection();
  }

  function handleShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "z") {
      const handled = event.shiftKey ? redoFormat() : undoFormat();
      if (handled) event.preventDefault();
      return;
    }
    if (key === "y" && !event.shiftKey) {
      if (redoFormat()) event.preventDefault();
      return;
    }
    if (key === "k") {
      event.preventDefault();
      openLinkEditor();
      return;
    }
    const action = FORMATS.find((format) => format.shortcutKey === key);
    if (!action) return;
    event.preventDefault();
    rememberSelection();
    applyFormat(action);
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
            title={action.shortcut ? `${action.title} (${action.shortcut})` : action.title}
            onPointerDown={keepToolbarFocus}
            onClick={() => action.shortcutKey === "k" ? openLinkEditor() : applyFormat(action)}
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
      {linkDraft && (
        <form className="markdown-link-form" onSubmit={saveLink}>
          <label>
            <span>Texto do link</span>
            <input value={linkDraft.text} onChange={(event) => setLinkDraft({ ...linkDraft, text: event.target.value })} aria-label="Texto do link" />
          </label>
          <label>
            <span>Endereço</span>
            <input
              ref={linkUrlInput}
              value={linkDraft.url}
              onChange={(event) => setLinkDraft({ ...linkDraft, url: event.target.value })}
              placeholder="exemplo.com"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              aria-label="Endereço do link"
            />
          </label>
          {linkError && <p className="markdown-link-error" role="alert">{linkError}</p>}
          <div className="markdown-link-actions">
            <button type="button" className="ghost" onClick={() => { setLinkDraft(null); setLinkError(null); }}>Cancelar</button>
            <button type="submit" className="primary small" disabled={!linkDraft.url.trim()}>Inserir link</button>
          </div>
        </form>
      )}
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
            redoFormats.current = [];
            onChange(event.target.value);
            rememberSelection();
          }}
          onSelect={rememberSelection}
          onKeyUp={rememberSelection}
          onClick={rememberSelection}
          onKeyDown={handleShortcut}
          placeholder={placeholder}
          aria-label={label}
          autoCapitalize="sentences"
          spellCheck
        />
      )}
      {!preview && <div className="markdown-editor-footer"><span>Markdown · Ctrl/Cmd + B, I e K</span><span>{wordCount} {wordCount === 1 ? "palavra" : "palavras"}</span></div>}
    </div>
  );
}
