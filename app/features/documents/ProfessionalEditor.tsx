import { Stethoscope } from "@/app/components/Icons";
import type { DocumentWorkspace } from "./use-document-workspace";

type Props = Pick<DocumentWorkspace, "signer" | "updateSigner"> & {
  variant: "sidebar" | "mobile";
};

export function ProfessionalEditor({ signer, updateSigner, variant }: Props) {
  const prefix = variant === "mobile" ? "mobile-professional" : "professional";
  const headingId = `${prefix}-editor-title`;
  return (
    <section className={`professional-editor professional-editor-${variant}${variant === "mobile" ? " editor-section" : ""}`} aria-labelledby={headingId}>
      <header>
        <span aria-hidden="true"><Stethoscope size={14} /></span>
        <div>
          <strong id={headingId}>Profesional</strong>
          <small>Nombre, RUT y especialidad</small>
        </div>
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
