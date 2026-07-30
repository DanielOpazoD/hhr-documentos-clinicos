import { Minus, Pencil, Plus, Type } from "@/app/components/Icons";

export function TypographyControl({
  canDecrease,
  canIncrease,
  kind,
  label,
  onDecrease,
  onIncrease,
  value,
}: {
  canDecrease: boolean;
  canIncrease: boolean;
  kind: "body" | "signoff";
  label: string;
  onDecrease: () => void;
  onIncrease: () => void;
  value: number;
}) {
  const accessibleLabel = label.toLocaleLowerCase("es-CL");
  return (
    <div className="document-type-control" role="group" aria-label={label} title={`${label}: ${value} px`}>
      <span className="typography-control-icon" aria-hidden="true">
        {kind === "body" ? <Type size={12} /> : <Pencil size={12} />}
      </span>
      <button type="button" aria-label={`Disminuir ${accessibleLabel}`} disabled={!canDecrease} onClick={onDecrease}><Minus size={11} /></button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label={`Aumentar ${accessibleLabel}`} disabled={!canIncrease} onClick={onIncrease}><Plus size={11} /></button>
    </div>
  );
}
