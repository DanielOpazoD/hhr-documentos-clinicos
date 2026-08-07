// @ts-check

export const hospitalSalvadorTemplateUrl = "/templates/formato-informe-traslado-hospital-salvador.docx";
export const hospitalSalvadorMissingValue = "-";

export const hospitalSalvadorFields = Object.freeze([
  { key: "full_name", label: "Nombre Completo", group: "personal", compact: true },
  { key: "rut", label: "RUT", group: "personal", compact: true },
  { key: "age", label: "Edad", group: "personal", compact: true },
  { key: "request_date", label: "Fecha de solicitud de traslado", group: "personal", compact: true },
  { key: "fonasa", label: "Tipo FONASA", group: "personal", compact: true },
  { key: "address", label: "Domicilio", group: "personal", compact: true },
  { key: "occupation", label: "Ocupación", group: "personal", compact: true },
  { key: "auge", label: "AUGE (caso inscrito)", group: "personal", compact: true },
  { key: "support_network", label: "Red de apoyo (teléfono familiar o persona responsable)", group: "personal", compact: true },
  { key: "current_history", label: "Historia clínica actual del paciente (precisar sintomatología del paciente, motivo de consulta)", group: "clinical", compact: false },
  { key: "physical_exam", label: "Examen físico completo", group: "clinical", compact: false },
  { key: "remote_history", label: "Anamnesis remota (historial de hospitalizaciones)", group: "clinical", compact: false },
  { key: "diagnostic_plan", label: "Diseño de estudio diagnóstico", group: "clinical", compact: false },
  { key: "test_results", label: "Resultados de exámenes (adjuntarlos)", group: "clinical", compact: false },
  { key: "treatment_evolution", label: "Tratamiento actual y evolución del paciente", group: "clinical", compact: false },
  { key: "diagnosis", label: "Diagnóstico", group: "clinical", compact: false },
  { key: "diagnostic_basis", label: "Fundamento diagnóstico", group: "clinical", compact: false },
  { key: "transfer_basis", label: "FUNDAMENTO DE SOLICITUD DE TRASLADO (indicar especialidad)", group: "clinical", compact: false },
]);

export const hospitalSalvadorFieldKeys = Object.freeze(hospitalSalvadorFields.map((field) => field.key));

/** @param {string} value */
export function isHospitalSalvadorFieldKey(value) {
  return hospitalSalvadorFieldKeys.includes(value);
}
