export const documentTemplates = [
  { id: "certificado_general", name: "Certificado médico general", description: "Certificación breve con motivo y vigencia." },
  { id: "certificado_antecedentes", name: "Antecedentes y tratamiento", description: "Antecedentes mórbidos y fármacos en una hoja." },
  { id: "informe_medico", name: "Informe médico por secciones", description: "Historia, examen, diagnóstico y plan." },
  { id: "epicrisis", name: "Epicrisis", description: "Resumen de atención para revisión profesional." },
  { id: "receta_externa", name: "Receta externa", description: "Documento para completar y firmar por el profesional." },
  { id: "documento_libre", name: "Documento libre", description: "Estructura clínica simple y configurable." },
] as const;

export type DocumentStatus = "Borrador" | "Revisado" | "Finalizado";
