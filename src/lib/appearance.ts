import { useState } from "react";

export type Theme = "auto" | "light" | "dark";
export type Paper = "grid" | "ruled" | "plain";
export type Palette = "classic" | "ocean" | "forest" | "lavender" | "sunset";
export type Appearance = { theme: Theme; paper: Paper; palette: Palette; cheer: boolean };

const K = { theme: "pauta.theme", paper: "pauta.paper", palette: "pauta.palette", cheer: "pauta.cheer" };
export const PALETTES: { id: Palette; label: string; accent: string; surface: string; darkSurface: string }[] = [
  { id: "classic", label: "Clássico", accent: "#315f9c", surface: "#eaf0f6", darkSurface: "#0f1623" },
  { id: "ocean", label: "Oceano", accent: "#1769aa", surface: "#edf4fa", darkSurface: "#0c1722" },
  { id: "forest", label: "Floresta", accent: "#27734d", surface: "#eff5ef", darkSurface: "#101c16" },
  { id: "lavender", label: "Lavanda", accent: "#7251a3", surface: "#f4f1fa", darkSurface: "#171321" },
  { id: "sunset", label: "Pôr do sol", accent: "#b65c35", surface: "#fff6ee", darkSurface: "#1d1513" },
];
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
  const palette = PALETTES.find((item) => item.id === read(K.palette))?.id ?? "classic";
  return {
    theme: t === "light" || t === "dark" ? t : "auto",
    paper: p === "ruled" || p === "plain" ? p : "grid",
    palette,
    cheer: read(K.cheer) !== "off",
  };
}

export function applyAppearance(a: Appearance) {
  const root = document.documentElement;
  if (a.theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = a.theme;
  root.dataset.paper = a.paper;
  root.dataset.palette = a.palette;
  // Cor da barra do navegador/sistema
  const palette = PALETTES.find((item) => item.id === a.palette) ?? PALETTES[0];
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const dark = a.theme === "auto" ? (m.media || "").includes("dark") : a.theme === "dark";
    m.content = dark ? palette.darkSurface : palette.surface;
  });
}

export function saveAppearance(a: Appearance) {
  write(K.theme, a.theme);
  write(K.paper, a.paper);
  write(K.palette, a.palette);
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
