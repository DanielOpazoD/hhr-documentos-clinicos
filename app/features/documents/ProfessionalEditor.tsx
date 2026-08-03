import { ChevronLeft, ChevronRight, Stethoscope } from "@/app/components/Icons";
import type { DocumentWorkspace } from "./use-document-workspace";

type Props = Pick<DocumentWorkspace, "signer" | "updateSigner"> & {
  onToggleSignature?: (trigger: HTMLButtonElement) => void;
  signatureOpen?: boolean;
  variant: "panel" | "sidebar";
};

export function ProfessionalEditor({ onToggleSignature, signatureOpen, signer, updateSigner, variant }: Props) {
  const prefix = variant === "panel" ? "panel-professional" : "professional";
  const headingId = `${prefix}-editor-title`;
  return (
    <section className={`professional-editor professional-editor-${variant}`} aria-labelledby={headingId}>
      <header>
        <span aria-hidden="true"><Stethoscope size={14} /></span>
        <div>
          <strong id={headingId}>Profesional</strong>
          <small>Nombre, RUT y especialidad</small>
        </div>
        {variant === "sidebar" && onToggleSignature ? (
          <button
            type="button"
            className="signature-panel-trigger"
            aria-controls="signature-settings-panel"
            aria-expanded={signatureOpen}
            aria-label="Configurar profesional, firma y timbre"
            onClick={(event) => onToggleSignature(event.currentTarget)}
          >
            {signatureOpen ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : null}
      </header>
      <div className="professional-fields">
        <label htmlFor={`${prefix}-name`}>Nombre médico</label>
        <input id={`${prefix}-name`} value={signer.name} onChange={(event) => updateSigner("name", event.target.value)} />
        <label htmlFor={`${prefix}-rut`}>RUT</label>
        <input id={`${prefix}-rut`} value={signer.rut} onChange={(event) => updateSigner("rut", event.target.value)} />
        <label htmlFor={`${prefix}-specialty`}>Especialidad</label>
        <input id={`${prefix}-specialty`} value={signer.specialty} onChange={(event) => updateSigner("specialty", event.target.value)} />
      </div>
    </section>
  );
}
