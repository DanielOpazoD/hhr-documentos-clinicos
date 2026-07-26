import type { DocumentSection, StoredAiMetadata } from "./types";
import type { AiEvidence } from "@/app/features/ai/types";

function normalizeEvidence(items: AiEvidence[] | undefined): AiEvidence[] {
  return (items ?? []).map((item) => ({ ...item, sourceIndex: Number.isInteger(item.sourceIndex) ? item.sourceIndex : 0 }));
}

export function normalizeAiMetadata(
  metadata: StoredAiMetadata | undefined,
  sections: DocumentSection[],
): StoredAiMetadata | null {
  if (!metadata) return null;
  const evidence = metadata.evidence;
  if (!Array.isArray(evidence)) {
    return {
      ...metadata,
      evidence: Object.fromEntries(Object.entries(evidence ?? {}).map(([id, items]) => [id, normalizeEvidence(items)])),
    };
  }
  return {
    ...metadata,
    evidence: Object.fromEntries(sections.map((section, index) => [section.id, normalizeEvidence(evidence[index])])),
  };
}
