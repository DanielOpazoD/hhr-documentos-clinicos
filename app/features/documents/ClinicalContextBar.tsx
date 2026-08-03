import { Pencil, Stethoscope } from "@/app/components/Icons";
import { patientFullName } from "./identity";
import type { DocumentWorkspace } from "./use-document-workspace";

type Props = Pick<
  DocumentWorkspace,
  | "issueDate"
  | "patient"
  | "signer"
  | "updateIssueDate"
  | "updatePatient"
  | "updatePatientName"
> & {
  onToggleProfessionalPanel: (trigger: HTMLButtonElement) => void;
  professionalPanelOpen: boolean;
};

export function ClinicalContextBar({
  issueDate,
  onToggleProfessionalPanel,
  patient,
  professionalPanelOpen,
  signer,
  updateIssueDate,
  updatePatient,
  updatePatientName,
}: Props) {
  const professionalName = signer.name.trim() || "Profesional sin configurar";
  const professionalDetails = [signer.rut.trim(), signer.specialty.trim()].filter(Boolean).join(" · ")
    || "Nombre, RUT y especialidad";

  return (
    <section className="document-clinical-context print-hide" aria-label="Contexto clínico del documento">
      <section className="patient-editor" aria-labelledby="patient-editor-title">
        <h2 id="patient-editor-title">Paciente</h2>
        <div className="patient-manual-grid">
          <label className="patient-name-field">Nombre completo<input id="patient-first-names" value={patient.fullName ?? patientFullName(patient)} onChange={(event) => updatePatientName(event.target.value)} autoComplete="name" /></label>
          <label>RUT<input id="patient-rut" value={patient.rut} onChange={(event) => updatePatient("rut", event.target.value)} autoComplete="off" /></label>
          <label>Fecha de nacimiento<input id="patient-birth-date" type="date" value={patient.birthDate} onChange={(event) => updatePatient("birthDate", event.target.value)} /></label>
          <label>Fecha del documento<input id="document-issue-date" type="date" value={issueDate} onChange={(event) => updateIssueDate(event.target.value)} /></label>
        </div>
      </section>
      <div className="professional-summary">
        <span className="professional-summary-mark" aria-hidden="true"><Stethoscope size={15} /></span>
        <span className="professional-summary-copy">
          <strong>{professionalName}</strong>
          <small>{professionalDetails}</small>
        </span>
        <button
          type="button"
          className="signature-panel-trigger professional-summary-trigger"
          aria-controls="signature-settings-panel"
          aria-expanded={professionalPanelOpen}
          aria-label="Editar profesional, firma y timbre"
          onClick={(event) => onToggleProfessionalPanel(event.currentTarget)}
        >
          <Pencil size={13} />
          <span>Editar</span>
        </button>
      </div>
    </section>
  );
}
