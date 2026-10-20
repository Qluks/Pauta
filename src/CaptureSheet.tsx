import { useMemo, useState } from "react";
import Sheet from "./Sheet";
import { useData } from "./data";
import { useAddTask } from "./addTask";
import { useToast } from "./Toast";
import { parseQuick, RECURRENCE_LABEL } from "./parse";
import { describeDate, PRIORITY } from "./util";

export default function CaptureSheet({ view, onClose }: { view: string; onClose: () => void }) {
  const { lists } = useData();
  const addTask = useAddTask();
  const toast = useToast();
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseQuick(text, lists), [text, lists]);
  const currentList = lists.find((l) => `list:${l.id}` === view);
  const hasPreview = text.trim() && (parsed.due_at || parsed.priority || parsed.listId || parsed.tags.length || parsed.recurrence);

  return (
    <Sheet variant="bottom" title="Nova tarefa" onClose={onClose}>
      {(close) => (
        <form
          className="capture"
          onSubmit={(e) => {
            e.preventDefault();
            const r = addTask(text, { view, listId: currentList?.id ?? null });
            if (!r) return;
            close();
            toast(`“${r.title}” adicionada`);
            r.done.then((m) => m && toast(`Não foi possível salvar: ${m}`));
          }}
        >
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ex.: pagar luz amanhã #casa !alta"
            enterKeyHint="done"
            autoCapitalize="sentences"
            aria-label="Nova tarefa"
          />
          {hasPreview && (
            <div className="preview" aria-live="polite">
              {parsed.due_at && <span className="chip static">Prazo: {describeDate(parsed.due_at)}{parsed.due_time ? ` às ${parsed.due_time}` : ""}</span>}
              {parsed.recurrence && <span className="chip static">{RECURRENCE_LABEL[parsed.recurrence]}</span>}
              {parsed.priority > 0 && <span className="chip static">Prioridade: {PRIORITY[parsed.priority]}</span>}
              {parsed.listId && <span className="chip static">Lista: {lists.find((l) => l.id === parsed.listId)?.name}</span>}
              {parsed.tags.map((g) => (
                <span key={g} className="chip static">#{g}</span>
              ))}
            </div>
          )}
          <button className="primary" disabled={!parsed.title}>Adicionar</button>
        </form>
      )}
    </Sheet>
  );
}
