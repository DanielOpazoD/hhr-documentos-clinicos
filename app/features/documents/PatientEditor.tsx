import type { DocumentWorkspace } from "./use-document-workspace";

type Props = Pick<
  DocumentWorkspace,
  "issueDate" | "patient" | "updateIssueDate" | "updatePatient"
>;

export function PatientEditor({
  issueDate,
  patient,
  updateIssueDate,
  updatePatient,
}: Props) {
  return (
    <div className="editor-section patient-editor">
      <div className="patient-manual-grid">
        <label>Nombres<input value={patient.firstNames} onChange={(event) => updatePatient("firstNames", event.target.value)} autoComplete="off" /></label>
        <label>Apellidos<input value={patient.lastNames} onChange={(event) => updatePatient("lastNames", event.target.value)} autoComplete="off" /></label>
        <label>RUT<input value={patient.rut} onChange={(event) => updatePatient("rut", event.target.value)} autoComplete="off" /></label>
        <label>Fecha de nacimiento<input type="date" value={patient.birthDate} onChange={(event) => updatePatient("birthDate", event.target.value)} /></label>
        <label>
          Fecha del documento
          <input
            type="date"
            value={issueDate}
            onChange={(event) => updateIssueDate(event.target.value)}
          />
        </label>
      </div>
    </div>
  );
}
