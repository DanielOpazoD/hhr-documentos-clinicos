import type { OpenAiOutput } from "./openai-responses";
import { hospitalSalvadorFields, isHospitalSalvadorFieldKey } from "../hospital-salvador-fields";
import type { AiTargetId } from "../types";

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

function isEvidenceStatus(value: unknown): value is "explicito" | "ambiguo" | "no_encontrado" {
  return value === "explicito" || value === "ambiguo" || value === "no_encontrado";
}

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

function declaredAbsence(value: string): boolean {
  return /^(no consignad[oa]|no se dispone|no disponible|sin información|no aparece|no consta)/i.test(value.trim());
}

export function parseClinicalOutput(
  raw: string,
  options: {
    target?: AiTargetId;
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
  if (!Array.isArray(candidate.sections) || candidate.sections.length === 0 || candidate.sections.length > sectionLimit) {
    throw new Error("El borrador no contiene secciones revisables.");
  }
  const sourceTexts = options.sourceTexts ?? [];
  const sourceCount = sourceTexts.length;
  const pageSources = sourceTexts.map((sourceText) => normalizedPageSources(sourceText));
  for (const section of candidate.sections) {
    if (!section || typeof section.title !== "string" || !section.title.trim() || typeof section.text !== "string" || !section.text.trim()) {
      throw new Error("El modelo devolvió una sección incompleta.");
    }
    if (options.target === "traslado_salvador" && (typeof section.key !== "string" || !isHospitalSalvadorFieldKey(section.key))) {
      throw new Error("El modelo no respetó los campos del formulario de traslado.");
    }
    if (
      !Array.isArray(section.evidence) ||
      (!section.evidence.some((item) => typeof item?.excerpt === "string" && item.excerpt.trim())
        && !declaredAbsence(section.text))
    ) throw new Error("El modelo no respaldó una sección con evidencia de la fuente.");
    for (const evidence of section.evidence) {
      const sourceIndex = Number(evidence?.source_index);
      const pageNumber = evidence?.page === null ? null : Number(evidence?.page);
      const sourceMimeType = options.sourceMimeTypes?.[sourceIndex];
      const extractedPages = pageSources[sourceIndex];
      const pageCount = options.sourcePageCounts?.[sourceIndex];
      const invalidPage = sourceMimeType === "application/pdf"
        ? pageNumber === null || (extractedPages?.size
          ? !extractedPages.has(pageNumber)
          : !(pageCount && pageNumber <= pageCount))
        : pageNumber !== null;
      if (
        !evidence ||
        !Number.isInteger(evidence.source_index) || sourceIndex < 0 || sourceIndex >= sourceCount ||
        (evidence.page !== null && (!Number.isInteger(evidence.page) || Number(evidence.page) < 1)) ||
        invalidPage ||
        typeof evidence.excerpt !== "string" ||
        !isEvidenceStatus(evidence.status)
      ) {
        throw new Error("El modelo devolvió evidencia con un formato inválido.");
      }
    }
  }
  if (options.target === "traslado_salvador") {
    const keys = candidate.sections.map((section) => section.key);
    if (
      candidate.sections.length !== hospitalSalvadorFields.length ||
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
    ? hospitalSalvadorFields.map((field) => candidate.sections!.find((section) => section.key === field.key) ?? {
        key: field.key,
        title: field.label,
        text: "No consignado",
        evidence: [],
      })
    : candidate.sections;
  return {
    documentKind: candidate.document_kind,
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
    processingSummary: candidate.processing_summary.trim(),
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
          status: evidence.status as "explicito" | "ambiguo" | "no_encontrado",
          verification: verified ? "verified" as const : "unverified" as const,
        };
      }),
    })),
    missingInformation: candidate.missing_information,
    safetyNotice: candidate.safety_notice,
  };
}
