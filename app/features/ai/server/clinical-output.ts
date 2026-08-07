import type { OpenAiOutput } from "./openai-responses";
import {
  hospitalSalvadorFields,
  hospitalSalvadorMissingValue,
  isHospitalSalvadorFieldKey,
} from "../hospital-salvador-fields";
import type { AiPromptMode, AiTargetId } from "../types";
import { isDeclaredClinicalAbsence, protectUnsupportedSection, sanitizeEvidenceCandidates } from "./clinical-evidence";
import { normalizedDocumentKind, withoutRedundantIdentitySections } from "./document-hygiene";

type RawClinicalOutput = {
  document_kind?: unknown;
  patient?: { first_names?: unknown; last_names?: unknown; rut?: unknown; birth_date?: unknown };
  signer?: { name?: unknown; rut?: unknown; specialty?: unknown };
  processing_summary?: unknown;
  sections?: Array<{
    key?: unknown;
    title?: unknown;
    text?: unknown;
    evidence?: Array<{ source_index?: unknown; page?: unknown; excerpt?: unknown; status?: unknown }>;
  }>;
  missing_information?: unknown;
  safety_notice?: unknown;
};

function normalizedEvidenceText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("es-CL").replace(/\s+/g, " ").trim();
}

function normalizedPageSources(sourceText: string | null | undefined): Map<number, string> {
  const pages = new Map<number, string>();
  if (!sourceText) return pages;
  const markers = [...sourceText.matchAll(/\u001eHHR_PAGE_(\d+)\u001f/g)];
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const start = (marker.index ?? 0) + marker[0].length;
    const end = markers[index + 1]?.index ?? sourceText.length;
    pages.set(Number(marker[1]), normalizedEvidenceText(sourceText.slice(start, end)));
  }
  return pages;
}

function nullableText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isoDate(value: unknown): string {
  const text = nullableText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? "" : text;
}

export function parseClinicalOutput(
  raw: string,
  options: {
    target?: AiTargetId;
    promptMode?: AiPromptMode;
    sourceTexts?: Array<string | null>;
    sourceMimeTypes?: string[];
    sourcePageCounts?: Array<number | null>;
  } = {},
): OpenAiOutput {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch {
    throw new Error("El modelo no devolvió un borrador estructurado.");
  }
  if (!value || typeof value !== "object") throw new Error("El borrador recibido no es válido.");
  const candidate = value as RawClinicalOutput;
  const sectionLimit = options.target === "traslado_salvador" ? 24 : 12;
  const missingValue = options.target === "traslado_salvador" ? hospitalSalvadorMissingValue : "No consignado";
  if (!Array.isArray(candidate.sections) || candidate.sections.length === 0 || candidate.sections.length > sectionLimit) {
    throw new Error("El borrador no contiene secciones revisables.");
  }
  const sourceTexts = options.sourceTexts ?? [];
  const pageSources = sourceTexts.map((sourceText) => normalizedPageSources(sourceText));
  const unsupportedSections: string[] = [];
  const structuredPatientIdentity = {
    firstNames: candidate.patient?.first_names,
    lastNames: candidate.patient?.last_names,
    rut: candidate.patient?.rut,
    birthDate: candidate.patient?.birth_date,
  };
  const candidateSections = options.target === "traslado_salvador"
    ? candidate.sections
    : withoutRedundantIdentitySections(candidate.sections, structuredPatientIdentity);
  for (const section of candidateSections) {
    if (!section || typeof section.title !== "string" || !section.title.trim() || typeof section.text !== "string" || !section.text.trim()) {
      throw new Error("El modelo devolvió una sección incompleta.");
    }
    if (options.target === "traslado_salvador" && (typeof section.key !== "string" || !isHospitalSalvadorFieldKey(section.key))) {
      throw new Error("El modelo no respetó los campos del formulario de traslado.");
    }
    section.evidence = sanitizeEvidenceCandidates(section.evidence, sourceTexts.map((_, index) => ({
      mimeType: options.sourceMimeTypes?.[index],
      extractedPages: pageSources[index],
      pageCount: options.sourcePageCounts?.[index],
    })));
    const protectedSection = protectUnsupportedSection({
      title: section.title,
      text: section.text,
      evidence: section.evidence,
      declaresAbsence: isDeclaredClinicalAbsence(
        section.text,
        options.target === "traslado_salvador" ? missingValue : undefined,
      ),
      ...(options.target === "traslado_salvador" ? { missingValue } : {}),
    });
    if (protectedSection.unsupportedTitle) unsupportedSections.push(protectedSection.unsupportedTitle);
    section.text = protectedSection.text;
    section.evidence = protectedSection.evidence;
  }
  if (options.target === "traslado_salvador") {
    const keys = candidateSections.map((section) => section.key);
    if (
      candidateSections.length !== hospitalSalvadorFields.length ||
      new Set(keys).size !== hospitalSalvadorFields.length ||
      hospitalSalvadorFields.some((field) => !keys.includes(field.key))
    ) {
      throw new Error("El modelo no devolvió los 18 campos únicos del formulario de traslado.");
    }
  }
  if (!Array.isArray(candidate.missing_information) || !candidate.missing_information.every((item) => typeof item === "string")) {
    throw new Error("El modelo devolvió asuntos pendientes con un formato inválido.");
  }
  if (
    typeof candidate.document_kind !== "string" ||
    typeof candidate.safety_notice !== "string" ||
    typeof candidate.processing_summary !== "string" ||
    !candidate.patient ||
    !candidate.signer
  ) {
    throw new Error("El modelo devolvió metadatos incompletos.");
  }
  const normalizedSources = sourceTexts.map((sourceText) => sourceText ? normalizedEvidenceText(sourceText) : null);
  const sourceSections = options.target === "traslado_salvador"
    ? hospitalSalvadorFields.map((field) => candidateSections.find((section) => section.key === field.key) ?? {
        key: field.key,
        title: field.label,
        text: missingValue,
        evidence: [],
      })
    : candidateSections;
  const missingInformation = [...candidate.missing_information];
  for (const title of unsupportedSections) {
    const notice = `Sin evidencia verificable para la sección: ${title}.`;
    if (!missingInformation.includes(notice)) missingInformation.push(notice);
  }
  const processingSummary = unsupportedSections.length
    ? `${candidate.processing_summary.trim()} ${unsupportedSections.length === 1 ? `Una sección sin evidencia se dejó como «${missingValue}» para revisión.` : `${unsupportedSections.length} secciones sin evidencia se dejaron como «${missingValue}» para revisión.`}`.trim()
    : candidate.processing_summary.trim();
  return {
    documentKind: normalizedDocumentKind(candidate.document_kind, options.promptMode),
    patient: {
      firstNames: nullableText(candidate.patient.first_names),
      lastNames: nullableText(candidate.patient.last_names),
      rut: nullableText(candidate.patient.rut),
      birthDate: isoDate(candidate.patient.birth_date),
    },
    signer: {
      name: nullableText(candidate.signer.name),
      rut: nullableText(candidate.signer.rut),
      specialty: nullableText(candidate.signer.specialty),
    },
    processingSummary,
    sections: sourceSections.map((section) => ({
      ...(typeof section.key === "string" ? { key: section.key } : {}),
      title: String(section.title),
      text: String(section.text),
      evidence: (section.evidence ?? []).map((evidence) => {
        const sourceIndex = Number(evidence.source_index);
        const excerptText = String(evidence.excerpt ?? "");
        const excerpt = normalizedEvidenceText(excerptText);
        const sourcePages = pageSources[sourceIndex];
        const verificationSource = evidence.page === null
          ? (sourcePages?.size ? null : normalizedSources[sourceIndex])
          : sourcePages?.get(Number(evidence.page));
        const verified = Boolean(verificationSource && excerpt && verificationSource.includes(excerpt));
        return {
          sourceIndex,
          page: evidence.page === null ? null : Number(evidence.page),
          excerpt: excerptText,
          status: evidence.status as "explicito" | "ambiguo",
          verification: verified ? "verified" as const : "unverified" as const,
        };
      }),
    })),
    missingInformation,
    safetyNotice: candidate.safety_notice,
  };
}
