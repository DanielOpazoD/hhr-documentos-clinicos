import type { AiPromptMode, AiTargetId } from "../../app/features/ai/types.ts";
import type { DocumentTemplateSectionSetting } from "../../app/features/documents/types.ts";

export type SyntheticSource = {
  mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  text: string;
};

export type RawEvalEvidence = {
  source_index: number;
  page: number | null;
  excerpt: string;
  status: "explicito" | "ambiguo";
};

export type RawEvalSection = {
  key?: string;
  title: string;
  text: string;
  evidence: RawEvalEvidence[];
};

export type RawEvalDraft = {
  document_kind: string;
  patient: {
    first_names: string | null;
    last_names: string | null;
    rut: string | null;
    birth_date: string | null;
  };
  signer: {
    name: string | null;
    rut: string | null;
    specialty: string | null;
  };
  processing_summary: string;
  sections: RawEvalSection[];
  missing_information: string[];
  safety_notice: string;
};

export type EvalExpectedState = {
  outcome: "pass" | "warning";
  sectionTitles?: string[];
  sectionKeys?: string[];
  forbiddenSectionTitles?: string[];
  requiredPromptTerms?: string[];
  requiredOutputTerms?: string[];
  forbiddenOutputTerms?: string[];
  missingIncludes?: string[];
  patient?: Partial<{
    firstNames: string;
    lastNames: string;
    rut: string;
    birthDate: string;
  }>;
  templateSections?: DocumentTemplateSectionSetting[];
  defaultTemplateSections?: DocumentTemplateSectionSetting[];
  preparedSections?: Array<{
    id: string;
    title: string;
    bodyIncludes?: string;
  }>;
};

export type ClinicalEvalFixture = {
  id: string;
  rule: string;
  target: AiTargetId;
  mode: AiPromptMode;
  userInstructions?: string;
  sources: SyntheticSource[];
  rawDraft: RawEvalDraft;
  expected: EvalExpectedState;
};

const syntheticPatient = {
  first_names: "Paciente",
  last_names: "Sintético",
  rut: "00.000.000-0",
  birth_date: "2000-01-01",
} as const;

const syntheticSigner = {
  name: "Dra. Profesional Sintética",
  rut: "99.999.999-9",
  specialty: "Medicina de prueba",
} as const;

const patientExpectation = {
  firstNames: "Paciente",
  lastNames: "Sintético",
  rut: "00.000.000-0",
  birthDate: "2000-01-01",
} as const;

const safetyNotice = "Borrador sintético para revisión profesional.";

function documentSource(lines: string[]): SyntheticSource {
  return {
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    text: lines.join("\n"),
  };
}

function sourceEvidence(excerpt: string): RawEvalEvidence {
  return { source_index: 0, page: null, excerpt, status: "explicito" };
}

function instructionEvidence(excerpt: string): RawEvalEvidence {
  return { source_index: 1, page: null, excerpt, status: "explicito" };
}

function rawDraft(input: {
  documentKind: string;
  sections: RawEvalSection[];
  missingInformation?: string[];
  processingSummary?: string;
}): RawEvalDraft {
  return {
    document_kind: input.documentKind,
    patient: { ...syntheticPatient },
    signer: { ...syntheticSigner },
    processing_summary: input.processingSummary ?? "Se procesaron únicamente datos sintéticos.",
    sections: input.sections,
    missing_information: input.missingInformation ?? [],
    safety_notice: safetyNotice,
  };
}

const identityLine = "Paciente Sintético. RUT 00.000.000-0. Fecha de nacimiento 2000-01-01.";

export const expectedHospitalSalvadorFields = [
  { key: "full_name", label: "Nombre Completo" },
  { key: "rut", label: "RUT" },
  { key: "age", label: "Edad" },
  { key: "request_date", label: "Fecha de solicitud de traslado" },
  { key: "fonasa", label: "Tipo FONASA" },
  { key: "address", label: "Domicilio" },
  { key: "occupation", label: "Ocupación" },
  { key: "auge", label: "AUGE (caso inscrito)" },
  { key: "support_network", label: "Red de apoyo (teléfono familiar o persona responsable)" },
  { key: "current_history", label: "Historia clínica actual del paciente (precisar sintomatología del paciente, motivo de consulta)" },
  { key: "physical_exam", label: "Examen físico completo" },
  { key: "remote_history", label: "Anamnesis remota (historial de hospitalizaciones)" },
  { key: "diagnostic_plan", label: "Diseño de estudio diagnóstico" },
  { key: "test_results", label: "Resultados de exámenes (adjuntarlos)" },
  { key: "treatment_evolution", label: "Tratamiento actual y evolución del paciente" },
  { key: "diagnosis", label: "Diagnóstico" },
  { key: "diagnostic_basis", label: "Fundamento diagnóstico" },
  { key: "transfer_basis", label: "FUNDAMENTO DE SOLICITUD DE TRASLADO (indicar especialidad)" },
] as const;

const epicrisis: ClinicalEvalFixture = {
  id: "epicrisis-estados-de-evidencia",
  rule: "diferencia contenido confirmado, ausencia declarada y dato no encontrado",
  target: "epicrisis",
  mode: "profile",
  sources: [documentSource([
    identityLine,
    "Ingreso confirmado el 01-01-2026 por dolor abdominal.",
  ])],
  rawDraft: rawDraft({
    documentKind: "Epicrisis médica",
    sections: [
      {
        key: "episodio",
        title: "Episodio confirmado",
        text: "Ingreso confirmado el 01-01-2026 por dolor abdominal.",
        evidence: [sourceEvidence("Ingreso confirmado el 01-01-2026 por dolor abdominal.")],
      },
      {
        key: "alta",
        title: "Fecha de alta",
        text: "No consta",
        evidence: [],
      },
    ],
    missingInformation: [
      "Fecha de alta no consta en la fuente.",
      "No encontrado: resultado de imagen.",
    ],
  }),
  expected: {
    outcome: "warning",
    requiredPromptTerms: ["Registro: telegráfico clínico, no prosa explicativa"],
    sectionTitles: ["Episodio confirmado", "Fecha de alta"],
    requiredOutputTerms: ["Ingreso confirmado", "No consta"],
    missingIncludes: ["No encontrado: resultado de imagen."],
    patient: patientExpectation,
  },
};

const acuteTransfer: ClinicalEvalFixture = {
  id: "traslado-conserva-mencion-clinica-del-paciente",
  rule: "conserva contenido clínico válido aunque mencione al paciente",
  target: "traslado_agudo",
  mode: "profile",
  sources: [documentSource([
    identityLine,
    "Paciente Sintético permanece estable durante el traslado.",
  ])],
  rawDraft: rawDraft({
    documentKind: "Informe médico de traslado",
    sections: [{
      key: "estado_actual",
      title: "Estado actual",
      text: "Paciente Sintético permanece estable durante el traslado.",
      evidence: [sourceEvidence("Paciente Sintético permanece estable durante el traslado.")],
    }],
  }),
  expected: {
    outcome: "pass",
    requiredPromptTerms: ["El paciente no se va de alta: se traslada"],
    sectionTitles: ["Estado actual"],
    requiredOutputTerms: ["Paciente Sintético permanece estable durante el traslado"],
    patient: patientExpectation,
  },
};

const medicalReport: ClinicalEvalFixture = {
  id: "informe-respeta-configuracion-de-plantilla",
  rule: "respeta secciones, títulos y orden configurados",
  target: "informe_medico",
  mode: "profile",
  sources: [documentSource([
    identityLine,
    "Antecedente confirmado: hipertensión arterial.",
    "Plan documentado: control en 30 días.",
  ])],
  rawDraft: rawDraft({
    documentKind: "Informe médico",
    sections: [
      {
        key: "antecedentes",
        title: "Antecedentes",
        text: "Antecedente confirmado: hipertensión arterial.",
        evidence: [sourceEvidence("Antecedente confirmado: hipertensión arterial.")],
      },
      {
        key: "plan",
        title: "Plan",
        text: "Plan documentado: control en 30 días.",
        evidence: [sourceEvidence("Plan documentado: control en 30 días.")],
      },
    ],
  }),
  expected: {
    outcome: "pass",
    requiredPromptTerms: ["Solo información respaldada por los documentos adjuntos"],
    patient: patientExpectation,
    templateSections: [
      { id: "plan", title: "Seguimiento acordado" },
      { id: "antecedentes", title: "Antecedentes relevantes" },
    ],
    defaultTemplateSections: [
      { id: "antecedentes", title: "Antecedentes" },
      { id: "plan", title: "Plan" },
    ],
    preparedSections: [
      { id: "plan", title: "Seguimiento acordado", bodyIncludes: "control en 30 días" },
      { id: "antecedentes", title: "Antecedentes relevantes", bodyIncludes: "hipertensión arterial" },
    ],
  },
};

const certificateInstruction = "Se certifica que la persona puede asistir a su jornada habitual.";

const certificate: ClinicalEvalFixture = {
  id: "certificado-incluye-discurso-y-excluye-laboratorio",
  rule: "incluye el texto solicitado y omite resultados expresamente excluidos",
  target: "certificado",
  mode: "profile",
  userInstructions: `Incluye literalmente: "${certificateInstruction}" Ignora todos los resultados de laboratorio.`,
  sources: [documentSource([
    identityLine,
    "Resultado de laboratorio: hemoglobina 11,2 g/dL.",
  ])],
  rawDraft: rawDraft({
    documentKind: "Certificado médico",
    sections: [{
      key: "certificado",
      title: "Certificado",
      text: certificateInstruction,
      evidence: [instructionEvidence(certificateInstruction)],
    }],
  }),
  expected: {
    outcome: "pass",
    requiredPromptTerms: ["Principio rector: mínima divulgación"],
    sectionTitles: ["Certificado"],
    requiredOutputTerms: [certificateInstruction],
    forbiddenOutputTerms: ["hemoglobina", "11,2 g/dL", "resultados de laboratorio"],
    patient: patientExpectation,
  },
};

const teleGastro: ClinicalEvalFixture = {
  id: "telegastro-no-inventa-contenido",
  rule: "no inventa diagnósticos, tratamientos ni seguimiento",
  target: "tele_gastro",
  mode: "profile",
  sources: [documentSource([
    identityLine,
    "Motivo documentado: dolor abdominal intermitente.",
  ])],
  rawDraft: rawDraft({
    documentKind: "Resumen para telegastroenterología",
    sections: [{
      key: "motivo",
      title: "Motivo de consulta",
      text: "Motivo documentado: dolor abdominal intermitente.",
      evidence: [sourceEvidence("Motivo documentado: dolor abdominal intermitente.")],
    }],
  }),
  expected: {
    outcome: "pass",
    requiredPromptTerms: ["TELEGASTROENTEROLOGÍA"],
    sectionTitles: ["Motivo de consulta"],
    forbiddenSectionTitles: ["Diagnósticos", "Tratamiento", "Seguimiento"],
    forbiddenOutputTerms: ["diagnóstico confirmado", "tratamiento indicado", "control futuro"],
    patient: patientExpectation,
  },
};

const teleNephro: ClinicalEvalFixture = {
  id: "telenefro-exclusion-prevalece-sobre-fuente",
  rule: "hace prevalecer una exclusión explícita sobre la fuente",
  target: "tele_nefro",
  mode: "profile",
  userInstructions: "Incluye solo creatinina. Excluye por completo potasio, incluso si aparece en la fuente.",
  sources: [documentSource([
    identityLine,
    "Creatinina 1,4 mg/dL. Potasio 4,8 mEq/L.",
  ])],
  rawDraft: rawDraft({
    documentKind: "Resumen para telenefrología",
    sections: [{
      key: "funcion_renal",
      title: "Función renal",
      text: "Creatinina 1,4 mg/dL.",
      evidence: [sourceEvidence("Creatinina 1,4 mg/dL.")],
    }],
  }),
  expected: {
    outcome: "pass",
    requiredPromptTerms: ["TELENEFROLOGÍA"],
    sectionTitles: ["Función renal"],
    requiredOutputTerms: ["Creatinina 1,4 mg/dL"],
    forbiddenOutputTerms: ["Potasio", "4,8 mEq/L"],
    patient: patientExpectation,
  },
};

const teleRheumatology: ClinicalEvalFixture = {
  id: "telereumato-no-agrega-secciones",
  rule: "no inventa secciones ni conclusiones no solicitadas",
  target: "tele_reumato",
  mode: "profile",
  sources: [documentSource([
    identityLine,
    "Rigidez matinal documentada de 20 minutos.",
  ])],
  rawDraft: rawDraft({
    documentKind: "Resumen para telereumatología",
    sections: [{
      key: "sintomas",
      title: "Síntomas documentados",
      text: "Artritis reumatoide confirmada.",
      evidence: [],
    }],
  }),
  expected: {
    outcome: "warning",
    requiredPromptTerms: ["TELEREUMATOLOGÍA"],
    sectionTitles: ["Síntomas documentados"],
    requiredOutputTerms: ["No consignado"],
    forbiddenSectionTitles: ["Diagnóstico", "Tratamiento", "Seguimiento"],
    forbiddenOutputTerms: ["Artritis reumatoide confirmada", "iniciar tratamiento", "control en"],
    patient: patientExpectation,
  },
};

function hospitalSalvadorDraft(): RawEvalDraft {
  const sections = expectedHospitalSalvadorFields.map<RawEvalSection>((field) => {
    if (field.key === "full_name") {
      return {
        key: field.key,
        title: field.label,
        text: "Paciente Sintético",
        evidence: [sourceEvidence("Paciente Sintético")],
      };
    }
    if (field.key === "rut") {
      return {
        key: field.key,
        title: field.label,
        text: "00.000.000-0",
        evidence: [sourceEvidence("00.000.000-0")],
      };
    }
    if (field.key === "current_history") {
      return {
        key: field.key,
        title: field.label,
        text: "Historia clínica actual: dolor articular de una semana.",
        evidence: [sourceEvidence("Historia clínica actual: dolor articular de una semana.")],
      };
    }
    return { key: field.key, title: field.label, text: "No consignado", evidence: [] };
  });
  const missingInformation = expectedHospitalSalvadorFields
    .filter((field) => !["full_name", "rut", "current_history"].includes(field.key))
    .map((field) => `${field.label}: no consignado.`);
  return rawDraft({
    documentKind: "Informe de traslado al Hospital del Salvador",
    sections,
    missingInformation,
  });
}

const hospitalSalvador: ClinicalEvalFixture = {
  id: "traslado-salvador-respeta-contrato",
  rule: "devuelve los 18 campos únicos en el orden canónico",
  target: "traslado_salvador",
  mode: "profile",
  sources: [documentSource([
    identityLine,
    "Historia clínica actual: dolor articular de una semana.",
  ])],
  rawDraft: hospitalSalvadorDraft(),
  expected: {
    outcome: "warning",
    requiredPromptTerms: ["Devuelve exactamente los 18 campos de la plantilla oficial"],
    sectionTitles: expectedHospitalSalvadorFields.map((field) => field.label),
    sectionKeys: expectedHospitalSalvadorFields.map((field) => field.key),
    requiredOutputTerms: ["Historia clínica actual: dolor articular de una semana"],
    patient: patientExpectation,
  },
};

const identityOnly: ClinicalEvalFixture = {
  id: "modo-libre-extrae-solo-identidad",
  rule: "extrae exclusivamente la identificación cuando así se solicita",
  target: "informe_medico",
  mode: "free",
  userInstructions: "Extrae exclusivamente la identificación estructurada del paciente. No incluyas resultados ni contenido clínico.",
  sources: [documentSource([
    identityLine,
    "Resultado de laboratorio: hemoglobina 11,2 g/dL.",
  ])],
  rawDraft: rawDraft({
    documentKind: "Ficha de identificación",
    sections: [{
      key: "contenido",
      title: "Contenido",
      text: "No consignado",
      evidence: [],
    }],
    missingInformation: ["Contenido: no consignado fuera del alcance solicitado."],
  }),
  expected: {
    outcome: "warning",
    requiredPromptTerms: ["La solicitud define de forma exhaustiva el alcance"],
    sectionTitles: ["Contenido"],
    forbiddenOutputTerms: ["hemoglobina", "11,2 g/dL", "resultado de laboratorio"],
    patient: patientExpectation,
  },
};

const freeCertificateText = "La persona requiere adecuación temporal de jornada por indicación profesional.";

const freeCertificate: ClinicalEvalFixture = {
  id: "modo-libre-elimina-identidad-repetida",
  rule: "evita repetir la identidad y conserva el discurso solicitado",
  target: "informe_medico",
  mode: "free",
  userInstructions: `Crea un certificado breve. Incluye literalmente: "${freeCertificateText}" Excluye todos los resultados de laboratorio.`,
  sources: [documentSource([
    identityLine,
    "Resultado de laboratorio: glicemia 105 mg/dL.",
  ])],
  rawDraft: rawDraft({
    documentKind: "certificado_escolar",
    sections: [
      {
        key: "identidad",
        title: "Identificación del paciente",
        text: "Nombre: Paciente Sintético. RUT: 00.000.000-0. Fecha de nacimiento: 2000-01-01.",
        evidence: [sourceEvidence(identityLine)],
      },
      {
        key: "certificado",
        title: "Certificado",
        text: freeCertificateText,
        evidence: [instructionEvidence(freeCertificateText)],
      },
    ],
  }),
  expected: {
    outcome: "pass",
    requiredPromptTerms: ["La solicitud define de forma exhaustiva el alcance"],
    sectionTitles: ["Certificado"],
    forbiddenSectionTitles: ["Identificación del paciente"],
    requiredOutputTerms: [freeCertificateText],
    forbiddenOutputTerms: ["glicemia", "105 mg/dL", "resultado de laboratorio"],
    patient: patientExpectation,
  },
};

export const clinicalEvalFixtures: ClinicalEvalFixture[] = [
  epicrisis,
  acuteTransfer,
  medicalReport,
  certificate,
  teleGastro,
  teleNephro,
  teleRheumatology,
  hospitalSalvador,
  identityOnly,
  freeCertificate,
];
