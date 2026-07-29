import { Stethoscope } from "@/app/components/Icons";
import type { DocumentWorkspace } from "./use-document-workspace";

type Props = Pick<DocumentWorkspace, "signer" | "updateSigner">;

export function ProfessionalEditor({ signer, updateSigner }: Props) {
  return (
    <section className="professional-editor" aria-labelledby="professional-editor-title">
      <header>
        <span aria-hidden="true"><Stethoscope size={14} /></span>
        <div>
          <strong id="professional-editor-title">Profesional</strong>
          <small>Datos habituales de firma</small>
        </div>
      </header>
      <div className="professional-fields">
        <label htmlFor="professional-name">Nombre y apellido</label>
        <input id="professional-name" value={signer.name} onChange={(event) => updateSigner("name", event.target.value)} />
        <label htmlFor="professional-rut">RUT</label>
        <input id="professional-rut" value={signer.rut} onChange={(event) => updateSigner("rut", event.target.value)} />
        <label htmlFor="professional-specialty">Cargo o especialidad</label>
        <input id="professional-specialty" value={signer.specialty} onChange={(event) => updateSigner("specialty", event.target.value)} />
      </div>
    </section>
  );
}
