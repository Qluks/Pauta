import { useState } from "react";

export type Theme = "auto" | "light" | "dark";
export type Paper = "grid" | "ruled" | "plain";
export type Appearance = { theme: Theme; paper: Paper; cheer: boolean };

const K = { theme: "pauta.theme", paper: "pauta.paper", cheer: "pauta.cheer" };
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* sem armazenamento: vale só nesta sessão */
  }
};

export function readAppearance(): Appearance {
  const t = read(K.theme);
  const p = read(K.paper);
  return { theme: t === "light" || t === "dark" ? t : "auto", paper: p === "ruled" || p === "plain" ? p : "grid", cheer: read(K.cheer) !== "off" };
}

export function applyAppearance(a: Appearance) {
  const root = document.documentElement;
  if (a.theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = a.theme;
  root.dataset.paper = a.paper;
  // Cor da barra do navegador/sistema
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const dark = a.theme === "auto" ? (m.media || "").includes("dark") : a.theme === "dark";
    m.content = dark ? "#0f1623" : "#eaf0f6";
  });
}

export function saveAppearance(a: Appearance) {
  write(K.theme, a.theme);
  write(K.paper, a.paper);
  write(K.cheer, a.cheer ? "on" : "off");
  applyAppearance(a);
}

export function useAppearance() {
  const [a, setA] = useState<Appearance>(readAppearance);
  const update = (changes: Partial<Appearance>) => {
    const next = { ...a, ...changes };
    setA(next);
    saveAppearance(next);
  };
  return [a, update] as const;
}
