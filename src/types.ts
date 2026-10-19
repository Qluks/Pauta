export type Task = {
  id: string;
  title: string;
  done: boolean;
  done_at: string | null;
  created_at: string;
  due_at: string | null; // "YYYY-MM-DD"
  priority: number; // 0 nenhuma, 1 baixa, 2 média, 3 alta
  list_id: string | null;
  tags: string[];
  recurrence: string | null; // daily | weekdays | weekly | monthly
  snoozed_until: string | null; // tarefa recorrente concluída: só volta para a lista nesta data
};

export type List = { id: string; name: string; color: number | null };

export type Note = {
  id: string;
  title: string;
  body: string;
  color: string | null; // índice da cor da linha ("0" a "5") ou null
  tags: string[];
  checklist: ChecklistItem[];
  pinned: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

export type ChecklistItem = { id: string; text: string; done: boolean };

export type Attachment = {
  id: string;
  task_id: string | null;
  note_id: string | null;
  kind: "link" | "file";
  title: string;
  url: string | null; // links
  path: string | null; // arquivos: caminho no Storage
  mime: string | null;
  size: number | null;
  created_at: string;
};
