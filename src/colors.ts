import type { CSSProperties } from "react";

// Cada lista é uma "linha" com cor própria (definidas em styles.css como --l0..--l5)
export const lineVar = (i: number) => `var(--l${i % 6})`;

// Passa a cor para o CSS como variável --c
export const cv = (c: string) => ({ "--c": c }) as CSSProperties;
