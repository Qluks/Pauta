import { cv, lineVar } from "../lib/colors";

export const NAMES = ["Azul", "Verde", "Laranja", "Magenta", "Roxo", "Verde-azulado"];

export default function Swatches({
  value,
  onPick,
  allowNone = true,
  label = "Cor",
}: {
  value: string | null;
  onPick: (c: string | null) => void;
  allowNone?: boolean;
  label?: string;
}) {
  return (
    <div className="swatches" role="group" aria-label={label}>
      {allowNone && (
        <button type="button" className="sw none" aria-pressed={value === null} aria-label="Sem cor" onClick={() => onPick(null)} />
      )}
      {NAMES.map((n, i) => (
        <button type="button" key={i} className="sw" style={cv(lineVar(i))} aria-pressed={value === String(i)} aria-label={n} onClick={() => onPick(String(i))} />
      ))}
    </div>
  );
}
