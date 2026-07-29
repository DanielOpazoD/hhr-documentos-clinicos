type EvidenceCandidate = { excerpt?: unknown };

export function protectUnsupportedSection(input: {
  title: string;
  text: string;
  evidence: EvidenceCandidate[];
  declaresAbsence: boolean;
}): { text: string; evidence: EvidenceCandidate[]; unsupportedTitle: string | null } {
  const hasExcerpt = input.evidence.some((item) => typeof item?.excerpt === "string" && item.excerpt.trim());
  if (hasExcerpt || input.declaresAbsence) {
    return { text: input.text, evidence: input.evidence, unsupportedTitle: null };
  }
  return { text: "No consignado", evidence: [], unsupportedTitle: input.title.trim() };
}
