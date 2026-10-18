export type Task = {
  id: string;
  title: string;
  done: boolean;
  done_at: string | null;
  created_at: string;
  due_at: string | null; // "YYYY-MM-DD"
  priority: number; // 0 nenhuma, 1 baixa, 2 média, 3 alta
  list_id: string | null;
};

export type List = { id: string; name: string };

export type Note = {
  id: string;
  title: string;
  body: string;
  color: string | null; // índice da cor da linha ("0" a "5") ou null
  tags: string[];
  pinned: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
};
