import { useEffect, useState } from "react";

export type SavedTaskFilter = {
  id: string;
  name: string;
  query: string;
  listId: string;
  tag: string;
  priority: string;
  due: "any" | "today" | "overdue" | "week" | "unscheduled";
};

const STORAGE_KEY = "pauta:saved-task-filters";
const CHANGE_EVENT = "pauta:saved-task-filters-changed";

function readSavedFilters(): SavedTaskFilter[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedTaskFilter =>
      !!item &&
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      (typeof item.query === "string" || item.query === undefined) &&
      typeof item.listId === "string" &&
      typeof item.tag === "string" &&
      typeof item.priority === "string" &&
      ["any", "today", "overdue", "week", "unscheduled"].includes(item.due)
    ).map((item) => ({ ...item, query: item.query ?? "" }));
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error("Os filtros salvos estão em um formato inválido.", error);
      return [];
    }
    throw error;
  }
}

function writeSavedFilters(filters: SavedTaskFilter[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function saveTaskFilter(filter: Omit<SavedTaskFilter, "id">) {
  const next = [...readSavedFilters(), { ...filter, id: crypto.randomUUID() }];
  writeSavedFilters(next);
  return next;
}

export function removeTaskFilter(id: string) {
  writeSavedFilters(readSavedFilters().filter((filter) => filter.id !== id));
}

export function useSavedTaskFilters() {
  const [filters, setFilters] = useState(readSavedFilters);
  useEffect(() => {
    const refresh = () => setFilters(readSavedFilters());
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return filters;
}
