import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";

type Opts = { onUndo?: () => void; onCommit?: () => void };
type ToastData = { message: string } & Opts;

const Ctx = createContext<(message: string, o?: Opts) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastData | null>(null);
  const pending = useRef<ToastData | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const commit = useCallback(() => {
    window.clearTimeout(timer.current);
    const p = pending.current;
    pending.current = null;
    p?.onCommit?.();
    setToast(null);
  }, []);

  const show = useCallback(
    (message: string, o: Opts = {}) => {
      pending.current?.onCommit?.(); // um aviso novo confirma o anterior
      const t = { message, ...o };
      pending.current = t;
      setToast(t);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(commit, 6000);
    },
    [commit]
  );

  function undo() {
    window.clearTimeout(timer.current);
    const p = pending.current;
    pending.current = null;
    p?.onUndo?.();
    setToast(null);
  }

  useEffect(() => {
    const flush = () => {
      const p = pending.current;
      pending.current = null;
      p?.onCommit?.();
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.onUndo && <button onClick={undo}>Desfazer</button>}
        </div>
      )}
    </Ctx.Provider>
  );
}
