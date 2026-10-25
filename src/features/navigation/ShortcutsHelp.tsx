import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "../../lib/useDialogFocus";

const ROWS: [string[], string][] = [
  [["Ctrl", "K"], "Buscar tarefas, notas e telas, e executar comandos"],
  [["N"], "Nova tarefa (ou nova nota, na tela Notas)"],
  [["/"], "Ir para a busca da tela"],
  [["1", "…", "7"], "Hoje, Próximas, Semana, Todas, Concluídas, Notas, Arquivo"],
  [["Ctrl", "Enter"], "Salvar a nota, ou criar tarefa na paleta"],
  [["?"], "Abrir esta ajuda"],
  [["Esc"], "Fechar painéis e janelas"],
];

// Exemplos do que dá para escrever no campo de nova tarefa / nota
const TIPS: [string, string][] = [
  ["pagar luz amanhã às 15h", "prazo e horário"],
  ["reunião sexta de manhã #ey prioridade alta", "período do dia, etiqueta e prioridade"],
  ["dentista dia 5 de novembro na lista Saúde", "data por extenso e lista pelo nome (ou @saude)"],
  ["ligar para o contador em 2 horas", "horário relativo (também: daqui a 30 minutos)"],
  ["academia toda segunda", "repete toda semana (também: dias úteis, todo mês)"],
  ["regar plantas de 3 em 3 dias", "intervalos: a cada 2 semanas, quinzenal, trimestral, anual"],
  ["pagar internet todo dia 10", "todo mês, no dia 10"],
  ["entregar relatório no fim do mês", "também: semana que vem, mês que vem, fim de semana"],
  ["ler https://exemplo.com/artigo", "o link vira anexo da tarefa"],
  ["Compras itens: leite, pão #casa cor verde fixar", "nota com checklist, etiqueta, cor e fixada"],
];

export default function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div ref={dialogRef} className="modal wide" role="dialog" aria-modal="true" aria-labelledby="kb-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <h2 id="kb-title">Atalhos e dicas</h2>
        <dl className="kbd-list">
          {ROWS.map(([keys, text]) => (
            <div key={text} className="kbd-row">
              <dt>{keys.map((k, i) => (k === "…" ? <span key={i}> a </span> : <kbd key={i}>{k}</kbd>))}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
        <hr />
        <h3 className="modal-sub">Escreva do seu jeito</h3>
        <p className="tips-intro">Ao criar uma tarefa, o app entende o texto e mostra abaixo o que reconheceu antes de salvar.</p>
        <ul className="tips">
          {TIPS.map(([example, what]) => (
            <li key={example}>
              <code>{example}</code>
              <span>{what}</span>
            </li>
          ))}
        </ul>
        <button className="ghost" autoFocus onClick={onClose}>Fechar</button>
      </div>
    </div>,
    document.body
  );
}
