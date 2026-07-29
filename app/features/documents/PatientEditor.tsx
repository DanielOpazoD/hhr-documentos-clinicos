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
    <section className="patient-editor print-hide" aria-labelledby="patient-editor-title">
      <h2 id="patient-editor-title">Paciente</h2>
      <div className="patient-manual-grid">
        <label>Nombres<input id="patient-first-names" value={patient.firstNames} onChange={(event) => updatePatient("firstNames", event.target.value)} autoComplete="off" /></label>
        <label>Apellidos<input id="patient-last-names" value={patient.lastNames} onChange={(event) => updatePatient("lastNames", event.target.value)} autoComplete="off" /></label>
        <label>RUT<input id="patient-rut" value={patient.rut} onChange={(event) => updatePatient("rut", event.target.value)} autoComplete="off" /></label>
        <label>Fecha de nacimiento<input id="patient-birth-date" type="date" value={patient.birthDate} onChange={(event) => updatePatient("birthDate", event.target.value)} /></label>
        <label>
          Fecha del documento
          <input
            id="document-issue-date"
            type="date"
            value={issueDate}
            onChange={(event) => updateIssueDate(event.target.value)}
          />
        </label>
      </div>
    </section>
  );
}
