import { useEffect } from "react";
import { createPortal } from "react-dom";

const ROWS: [string[], string][] = [
  [["Ctrl", "K"], "Buscar tarefas, notas e telas, e executar comandos"],
  [["N"], "Nova tarefa (ou nova nota, na tela Notas)"],
  [["/"], "Ir para a busca da tela"],
  [["1", "…", "6"], "Hoje, Próximas, Todas, Concluídas, Notas, Arquivo"],
  [["Ctrl", "Enter"], "Salvar a nota, ou criar tarefa na paleta"],
  [["?"], "Abrir esta ajuda"],
  [["Esc"], "Fechar painéis e janelas"],
];

export default function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="kb-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="kb-title">Atalhos de teclado</h2>
        <dl className="kbd-list">
          {ROWS.map(([keys, text]) => (
            <div key={text} className="kbd-row">
              <dt>{keys.map((k, i) => (k === "…" ? <span key={i}> a </span> : <kbd key={i}>{k}</kbd>))}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
        <button className="ghost" autoFocus onClick={onClose}>Fechar</button>
      </div>
    </div>,
    document.body
  );
}
