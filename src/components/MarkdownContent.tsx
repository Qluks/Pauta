import { Fragment, ReactNode } from "react";

function renderInline(text: string): ReactNode[] {
  const token = /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|`[^`]+`|\*[^*\n]+\*|_[^_\n]+_|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;
  const output: ReactNode[] = [];
  let cursor = 0;
  let index = 0;

  for (const match of text.matchAll(token)) {
    const value = match[0];
    const start = match.index ?? 0;
    if (start > cursor) output.push(text.slice(cursor, start));
    let node: ReactNode = value;

    if (value.startsWith("**") || value.startsWith("__")) node = <strong>{value.slice(2, -2)}</strong>;
    else if (value.startsWith("~~")) node = <del>{value.slice(2, -2)}</del>;
    else if (value.startsWith("`")) node = <code>{value.slice(1, -1)}</code>;
    else if (value.startsWith("*") || value.startsWith("_")) node = <em>{value.slice(1, -1)}</em>;
    else {
      const link = value.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      if (link) node = <a href={link[2]} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{link[1]}</a>;
    }

    output.push(<Fragment key={`inline-${index++}`}>{node}</Fragment>);
    cursor = start + value.length;
  }
  if (cursor < text.length) output.push(text.slice(cursor));
  return output;
}

export default function MarkdownContent({ value }: { value: string }) {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(<p key={`p-${blocks.length}`}>{paragraph.map((line, index) => <Fragment key={index}>{index > 0 && <br />}{renderInline(line)}</Fragment>)}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    const List = list.ordered ? "ol" : "ul";
    blocks.push(<List key={`list-${blocks.length}`}>{list.items.map((item, index) => <li key={index}>{renderInline(item)}</li>)}</List>);
    list = null;
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    const quote = trimmed.match(/^>\s?(.*)$/);
    const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (heading || quote || bullet || ordered || /^([-*_])(?:\s*\1){2,}$/.test(trimmed)) {
      flushParagraph();
      if (heading || quote || /^([-*_])(?:\s*\1){2,}$/.test(trimmed)) flushList();
      if (heading) {
        const text = renderInline(heading[2]);
        if (heading[1].length === 1) blocks.push(<h2 key={`h-${blocks.length}`}>{text}</h2>);
        else if (heading[1].length === 2) blocks.push(<h3 key={`h-${blocks.length}`}>{text}</h3>);
        else blocks.push(<h4 key={`h-${blocks.length}`}>{text}</h4>);
      } else if (quote) blocks.push(<blockquote key={`q-${blocks.length}`}>{renderInline(quote[1])}</blockquote>);
      else if (/^([-*_])(?:\s*\1){2,}$/.test(trimmed)) blocks.push(<hr key={`hr-${blocks.length}`} />);
      else {
        const isOrdered = !!ordered;
        if (!list || list.ordered !== isOrdered) {
          flushList();
          list = { ordered: isOrdered, items: [] };
        }
        list.items.push((bullet ?? ordered)![1]);
      }
      return;
    }
    flushList();
    paragraph.push(line);
  });
  flushParagraph();
  flushList();

  return <div className="markdown-content">{blocks}</div>;
}
