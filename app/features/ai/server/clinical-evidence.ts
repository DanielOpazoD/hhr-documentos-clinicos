export type EvidenceCandidate = {
  source_index?: unknown;
  page?: unknown;
  excerpt?: unknown;
  status?: unknown;
};

export function isDeclaredClinicalAbsence(value: string): boolean {
  const normalized = value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /^(?:no consignad[oa]|no se dispone|no disponible|sin informacion|no aparece|no consta)\s*[.!]?$/i.test(normalized);
}

export function sanitizeEvidenceCandidates(
  value: unknown,
  sources: Array<{
    mimeType?: string;
    extractedPages?: { readonly size: number; has(page: number): boolean };
    pageCount?: number | null;
  }>,
): EvidenceCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.filter((evidence): evidence is EvidenceCandidate => {
    if (!evidence || typeof evidence !== "object") return false;
    const candidate = evidence as EvidenceCandidate;
    const sourceIndex = Number(candidate.source_index);
    if (!Number.isInteger(candidate.source_index) || sourceIndex < 0 || sourceIndex >= sources.length) return false;
    const source = sources[sourceIndex];
    const pageNumber = candidate.page === null ? null : Number(candidate.page);
    const pageIsValid = source.mimeType === "application/pdf"
      ? pageNumber !== null
        && Number.isInteger(candidate.page)
        && pageNumber >= 1
        && (source.extractedPages?.size
          ? source.extractedPages.has(pageNumber)
          : Boolean(source.pageCount && pageNumber <= source.pageCount))
      : candidate.page === null;
    return pageIsValid
      && typeof candidate.excerpt === "string"
      && Boolean(candidate.excerpt.trim())
      && (candidate.status === "explicito" || candidate.status === "ambiguo");
  });
}

export function protectUnsupportedSection(input: {
  title: string;
  text: string;
  evidence: EvidenceCandidate[];
  declaresAbsence: boolean;
}): { text: string; evidence: EvidenceCandidate[]; unsupportedTitle: string | null } {
  const hasExcerpt = input.evidence.some((item) =>
    (item?.status === "explicito" || item?.status === "ambiguo")
    && typeof item.excerpt === "string"
    && item.excerpt.trim(),
  );
  if (hasExcerpt || input.declaresAbsence) {
    return { text: input.text, evidence: input.evidence, unsupportedTitle: null };
  }
  return { text: "No consignado", evidence: [], unsupportedTitle: input.title.trim() };
}
