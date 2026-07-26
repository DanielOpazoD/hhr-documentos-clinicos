export const formCatalog = [
  { id: "laboratorio", title: "Solicitud de laboratorio", eyebrow: "Policlínico", description: "Formulario original de exámenes de laboratorio del Policlínico HHR.", template: "/templates/laboratorio.pdf", sourceFile: "Solicitud de examen de laboratorio policlinico.pdf", pageSize: "Carta", sha256: "0fabdedcf24914f00af09a99b30b7f4d4f7a66509671996dc771ff1c31219921", accent: "cyan" },
  { id: "imagenologia", title: "Solicitud de imagenología", eyebrow: "Radiología", description: "Formulario original de radiología, scanner, ecografía y mamografía.", template: "/templates/imagenologia.pdf", sourceFile: "Solicit-imagen.pdf", pageSize: "612 × 936 pt", sha256: "8561373bdbf0160dd0afb8e129148976513be83e403907a057ae3ef2a929c0c9", accent: "navy" },
  { id: "encuesta", title: "Encuesta de imagenología", eyebrow: "Seguridad", description: "Encuesta original de antecedentes y seguridad para medios de contraste.", template: "/templates/encuesta-imagenologia.pdf", sourceFile: "Encuestaimagen.pdf", pageSize: "Carta", sha256: "dc59fb93bff9a2e3d9cd460e4767fa9aa07f31bd4c2186c3c5aa925bbe87cc0d", accent: "amber" },
  { id: "consentimiento", title: "Consentimiento informado", eyebrow: "General", description: "Consentimiento informado general original del Hospital Hanga Roa.", template: "/templates/consentimiento.pdf", sourceFile: "consentimiento.pdf", pageSize: "A4", sha256: "aa4f2679a437020e82f10f794ad9b74c812cd76c0e22f5a2ae1c7df875509cb2", accent: "green" },
] as const;

export const documentTemplates = [
  { id: "certificado_general", name: "Certificado médico general", description: "Certificación breve con motivo y vigencia." },
  { id: "certificado_antecedentes", name: "Antecedentes y tratamiento", description: "Antecedentes mórbidos y fármacos en una hoja." },
  { id: "informe_medico", name: "Informe médico por secciones", description: "Historia, examen, diagnóstico y plan." },
  { id: "epicrisis", name: "Epicrisis", description: "Resumen de atención para revisión profesional." },
  { id: "receta_externa", name: "Receta externa", description: "Documento para completar y firmar por el profesional." },
  { id: "documento_libre", name: "Documento libre", description: "Estructura clínica simple y configurable." },
] as const;

export type DocumentStatus = "Borrador" | "Revisado" | "Finalizado";
