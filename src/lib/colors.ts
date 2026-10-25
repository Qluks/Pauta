import type { CSSProperties } from "react";
import type { List } from "./types";

// Cada lista é uma "linha" com cor própria (definidas em styles.css como --l0..--l5)
export const lineVar = (i: number) => `var(--l${i % 6})`;

// Passa a cor para o CSS como variável --c
export const cv = (c: string) => ({ "--c": c }) as CSSProperties;

// Cor da lista: a gravada no banco ou, se não houver, a da posição
export const listColor = (l: List | undefined, i: number) => lineVar(l?.color ?? i);
