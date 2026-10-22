import { useMemo, useState } from "react";
import Sheet from "./Sheet";
import { useData } from "./data";
import { useAddTask } from "./addTask";
import { useAddNote } from "./addNote";
import { useToast } from "./Toast";
import { parseNote, parseQuick } from "./parse";
import { hasNotePreview, hasTaskPreview, NotePreview, TaskPreview } from "./Preview";

export default function CaptureSheet({ view, onClose }: { view: string; onClose: () => void }) {
  const { lists } = useData();
  const addTask = useAddTask();
  const addNote = useAddNote();
  const toast = useToast();
  const [mode, setMode] = useState<"task" | "note">("task");
  const [text, setText] = useState("");
  const task = useMemo(() => parseQuick(text, lists), [text, lists]);
  const note = useMemo(() => parseNote(text), [text]);
  const currentList = lists.find((l) => `list:${l.id}` === view);
  const empty = mode === "task" ? !task.title : !note.title && !note.body && note.checklist.length === 0;

  function submit(close: () => void) {
    if (mode === "task") {
      const r = addTask(text, { view, listId: currentList?.id ?? null });
      if (!r) return;
      close();
      toast(`“${r.title}” adicionada`);
      r.done.then((m) => m && toast(`Atenção: ${m}`));
    } else {
      const r = addNote(text);
      if (!r) return;
      close();
      toast(`Nota “${r.title}” criada`);
      r.done.then((m) => m && toast(`Atenção: ${m}`));
    }
  }

  return (
    <Sheet variant="bottom" title={mode === "task" ? "Nova tarefa" : "Nova nota"} onClose={onClose}>
      {(close) => (
        <form
          className="capture"
          onSubmit={(e) => {
            e.preventDefault();
            submit(close);
          }}
        >
          <div className="seg-group" role="group" aria-label="O que criar">
            <button type="button" className="seg" aria-pressed={mode === "task"} onClick={() => setMode("task")}>Tarefa</button>
            <button type="button" className="seg" aria-pressed={mode === "note"} onClick={() => setMode("note")}>Nota</button>
          </div>
          {mode === "task" ? (
            <input
              key="task"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ex.: pagar luz amanhã às 15h #casa"
              enterKeyHint="done"
              autoCapitalize="sentences"
              aria-label="Nova tarefa"
            />
          ) : (
            <textarea
              key="note"
              autoFocus
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === "Enter" && submit(close)}
              placeholder={"Título na primeira linha\nCompras itens: leite, pão #casa cor verde"}
              aria-label="Nova nota"
            />
          )}
          {text.trim() && mode === "task" && hasTaskPreview(task) && <TaskPreview parsed={task} lists={lists} />}
          {text.trim() && mode === "note" && hasNotePreview(note) && <NotePreview parsed={note} />}
          <button className="primary" disabled={empty}>Adicionar</button>
        </form>
      )}
    </Sheet>
  );
}
