import { ChevronDown, Pencil, Stethoscope } from "@/app/components/Icons";
import { formatStoredDate } from "./formatters";
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
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onToggleProfessionalPanel: (trigger: HTMLButtonElement) => void;
  professionalPanelOpen: boolean;
};

export function ClinicalContextBar({
  expanded,
  issueDate,
  onExpandedChange,
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
  const patientName = (patient.fullName ?? patientFullName(patient)).trim() || "Paciente sin identificar";
  const patientDetails = [patient.rut.trim(), formatStoredDate(patient.birthDate)].filter(Boolean).join(" · ")
    || "RUT y fecha de nacimiento";

  return (
    <section id="document-clinical-context" className="document-clinical-context print-hide" aria-label="Contexto clínico del documento">
      <header className="clinical-context-summary">
        <button
          type="button"
          className="clinical-context-toggle"
          aria-controls="patient-editor-fields"
          aria-expanded={expanded}
          onClick={() => onExpandedChange(!expanded)}
        >
          <span><strong>{patientName}</strong><small>{patientDetails}</small></span>
          <ChevronDown size={15} aria-hidden="true" />
        </button>
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
      </header>
      <section id="patient-editor-fields" className="patient-editor" aria-labelledby="patient-editor-title" hidden={!expanded}>
        <h2 id="patient-editor-title">Paciente</h2>
        <div className="patient-manual-grid">
          <label className="patient-name-field">Nombre completo<input id="patient-first-names" value={patient.fullName ?? patientFullName(patient)} onChange={(event) => updatePatientName(event.target.value)} autoComplete="name" /></label>
          <label>RUT<input id="patient-rut" value={patient.rut} onChange={(event) => updatePatient("rut", event.target.value)} autoComplete="off" /></label>
          <label>Fecha de nacimiento<input id="patient-birth-date" type="date" value={patient.birthDate} onChange={(event) => updatePatient("birthDate", event.target.value)} /></label>
          <label>Fecha del documento<input id="document-issue-date" type="date" value={issueDate} onChange={(event) => updateIssueDate(event.target.value)} /></label>
        </div>
      </section>
    </section>
  );
}
