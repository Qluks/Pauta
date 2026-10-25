import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type MenuItem = { label: string; hint?: string; onSelect: () => void };

export default function Menu({ anchor, items, label, onClose }: { anchor: DOMRect; items: MenuItem[]; label: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [active, setActive] = useState(0);

  // Abre abaixo do botão (ou acima, se faltar espaço) e sem sair da tela
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const m = 8;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.min(Math.max(m, anchor.right - w), window.innerWidth - w - m);
    let top = anchor.bottom + 6;
    if (top + h > window.innerHeight - m) top = Math.max(m, anchor.top - h - 6);
    setPos({ top, left });
  }, [anchor]);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => (a + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => (a - 1 + items.length) % items.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        items[active]?.onSelect();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [active, items, onClose]);

  return createPortal(
    <div className="menu-backdrop" onClick={onClose}>
      <div
        ref={ref}
        className="menu"
        role="menu"
        aria-label={label}
        tabIndex={-1}
        style={pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        {items.map((it, i) => (
          <button
            key={it.label}
            role="menuitem"
            className={i === active ? "on" : undefined}
            onMouseEnter={() => setActive(i)}
            onClick={() => {
              it.onSelect();
              onClose();
            }}
          >
            <span>{it.label}</span>
            {it.hint && <span className="hint">{it.hint}</span>}
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
}
