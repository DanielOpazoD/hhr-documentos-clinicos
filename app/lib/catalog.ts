export const demoPatients = [
  { id: "pac-001", name: "Isidora Mahina Paoa", rut: "••.•••.482-•", birthDate: "1988-05-17", age: 38, sex: "Femenino", insurance: "FONASA B", diagnosis: "Hipertensión arterial en control" },
  { id: "pac-002", name: "Matías Tuki Tepano", rut: "••.•••.731-•", birthDate: "1972-10-03", age: 53, sex: "Masculino", insurance: "FONASA C", diagnosis: "Diabetes mellitus tipo 2" },
  { id: "pac-003", name: "Ana María Pakomio", rut: "••.•••.164-•", birthDate: "1996-02-21", age: 30, sex: "Femenino", insurance: "FONASA A", diagnosis: "Evaluación clínica ambulatoria" },
];

export const formCatalog = [
  { id: "laboratorio", title: "Solicitud de laboratorio", eyebrow: "Policlínico", description: "Bioquímica, hematología, coagulación y más", template: "/templates/laboratorio.pdf", accent: "cyan" },
  { id: "imagenologia", title: "Solicitud de imagenología", eyebrow: "Radiología", description: "Radiología simple, TAC, ecografía y mamografía", template: "/templates/imagenologia.pdf", accent: "navy" },
  { id: "encuesta", title: "Encuesta de contraste", eyebrow: "Seguridad", description: "Antecedentes, alergias, creatinina y ayuno", template: "/templates/encuesta-imagenologia.pdf", accent: "amber" },
  { id: "consentimiento", title: "Consentimiento informado", eyebrow: "General", description: "Procedimiento, aceptación, representante y firmas", template: "/templates/consentimiento.pdf", accent: "green" },
] as const;

export const documentTemplates = [
  { id: "certificado_general", name: "Certificado médico general", description: "Certificación breve con motivo y vigencia." },
  { id: "certificado_antecedentes", name: "Antecedentes y tratamiento", description: "Antecedentes mórbidos y fármacos en una hoja." },
  { id: "informe_medico", name: "Informe médico por secciones", description: "Historia, examen, diagnóstico y plan." },
  { id: "epicrisis_demo", name: "Epicrisis demostrativa", description: "Borrador de resumen de atención para revisión." },
  { id: "receta_externa", name: "Receta externa", description: "Sólo medicamentos no controlados; no válida." },
  { id: "documento_libre", name: "Documento libre", description: "Estructura clínica simple y configurable." },
] as const;

export const examGroups: Record<string, string[]> = {
  Bioquímica: ["Glicemia", "Creatinina", "Uremia", "Perfil hepático", "Electrolitos plasmáticos", "Proteína C reactiva", "Lactato"],
  Hematología: ["Hemograma", "VHS", "Recuento de plaquetas", "Hematocrito", "Hemoglobina glicosilada"],
  Coagulación: ["Protrombina / INR", "TTPK", "Fibrinógeno", "Dímero D"],
  Microbiología: ["Urocultivo", "Hemocultivo", "Coprocultivo", "Cultivo de secreciones"],
  Hormonas: ["TSH", "T4 libre", "Troponina", "PSA"],
  Otros: ["Orina completa", "Sedimento urinario", "Test de embarazo", "RPR", "Serología"],
};

export const imagingGroups: Record<string, string[]> = {
  "Radiología simple": ["Tórax simple", "Abdomen simple", "Pelvis AP", "Columna cervical", "Columna lumbar", "Rodilla AP-LAT"],
  "Scanner / TAC": ["Cerebro", "Cuello", "Tórax", "Abdomen", "Pelvis", "AngioTAC"],
  Ecografía: ["Abdominal", "Mamaria", "Obstétrica", "Renal", "Doppler", "Partes blandas"],
  Mamografía: ["Bilateral", "Unilateral", "Tomosíntesis", "Biopsia"],
};

export type DocumentStatus = "Borrador" | "Revisado" | "Finalizado";
