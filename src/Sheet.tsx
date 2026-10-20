import { PointerEvent, ReactNode, useEffect, useRef, useState } from "react";
import { cv } from "./colors";

type Props = {
  title: string;
  onClose: () => void;
  variant?: "side" | "bottom"; // side: painel à direita no PC e folha no celular · bottom: só folha (celular)
  color?: string;
  header?: ReactNode;
  hideHead?: boolean;
  children: ReactNode | ((close: () => void) => ReactNode);
};

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Sheet({ title, onClose, variant = "side", color, header, hideHead, children }: Props) {
  const [closing, setClosing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const opener = useRef<Element | null>(document.activeElement);
  const closeRef = useRef<() => void>(() => {});

  const close = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 200); // espera a animação de saída
  };
  closeRef.current = close;

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (ref.current && !ref.current.contains(document.activeElement)) ref.current.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === ref.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);

    // Teclado do celular: sobe a folha para ela não ficar escondida atrás dele
    const vv = window.visualViewport;
    const update = () => {
      if (vv) document.documentElement.style.setProperty("--kb", `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`);
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      document.documentElement.style.removeProperty("--kb");
      if (opener.current instanceof HTMLElement) opener.current.focus({ preventScroll: true });
    };
  }, []);

  // Arrastar a alça para baixo fecha a folha (celular)
  function onDown(e: PointerEvent<HTMLDivElement>) {
    if (window.innerWidth > 700 || !ref.current) return;
    drag.current = { y: e.clientY, dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    ref.current.style.transition = "none";
  }
  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (!drag.current || !ref.current) return;
    const dy = Math.max(0, e.clientY - drag.current.y);
    drag.current.dy = dy;
    ref.current.style.transform = `translateY(${dy}px)`;
  }
  function onUp() {
    if (!drag.current || !ref.current) return;
    const { dy } = drag.current;
    drag.current = null;
    ref.current.style.transition = "";
    if (dy > 110) close();
    else ref.current.style.transform = "";
  }

  return (
    <div className={`sheet-backdrop ${variant}${closing ? " closing" : ""}`} onClick={close}>
      <div
        ref={ref}
        className={`sheet ${variant}${closing ? " closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={color ? cv(color) : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} aria-hidden="true">
          <span />
        </div>
        {!hideHead && (
          <div className="sheet-head">
            {header ?? <h2>{title}</h2>}
            <button className="ghost" onClick={close}>Fechar</button>
          </div>
        )}
        <div className="sheet-body">{typeof children === "function" ? children(close) : children}</div>
      </div>
    </div>
  );
}
