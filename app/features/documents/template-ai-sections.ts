import type { AiEvidence, AiSection } from "@/app/features/ai/types";
import type { DocumentSection, DocumentTemplateSectionSetting } from "./types";

export type PreparedAiDocumentSection = DocumentSection & {
  evidence: AiEvidence[];
  evidenceStale?: boolean;
};

function comparableTitle(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("es-CL").replace(/[^a-záéíóúüñ0-9]+/gi, " ").trim();
}

export function mergeAiSectionsWithTemplate(
  sections: AiSection[],
  templateSections?: DocumentTemplateSectionSetting[],
  defaultSections: DocumentTemplateSectionSetting[] = [],
): PreparedAiDocumentSection[] {
  const sources = sections.map((section, index) => ({ section, index }));
  if (!templateSections?.length) {
    return sources.map(({ section, index }) => ({
      id: section.key ?? `ia-${index + 1}`,
      title: section.title,
      body: section.text,
      evidence: section.evidence,
      ...(section.evidenceStale ? { evidenceStale: true } : {}),
    }));
  }

  const defaultTitles = new Map(defaultSections.map((section) => [section.id, section.title]));
  const consumed = new Set<number>();
  const exactMatches = new Map<number, (typeof sources)[number]>();
  templateSections.forEach((templateSection, templateIndex) => {
    const match = sources.find(({ section, index }) => !consumed.has(index) && section.key === templateSection.id);
    if (match) {
      consumed.add(match.index);
      exactMatches.set(templateIndex, match);
    }
  });
  templateSections.forEach((templateSection, templateIndex) => {
    if (exactMatches.has(templateIndex)) return;
    let match = sources.find(({ section, index }) => !consumed.has(index) && comparableTitle(section.title) === comparableTitle(templateSection.title));
    const defaultTitle = defaultTitles.get(templateSection.id);
    if (!match && defaultTitle) {
      match = sources.find(({ section, index }) => !consumed.has(index) && comparableTitle(section.title) === comparableTitle(defaultTitle));
    }
    if (match) {
      consumed.add(match.index);
      exactMatches.set(templateIndex, match);
    }
  });

  const prepared = templateSections.map((templateSection, templateIndex) => {
    const match = exactMatches.get(templateIndex);
    return {
      id: templateSection.id,
      title: templateSection.title,
      body: match?.section.text ?? "",
      evidence: match?.section.evidence ?? [],
      ...(match?.section.evidenceStale ? { evidenceStale: true } : {}),
    };
  });

  const usedIds = new Set(prepared.map((section) => section.id));
  for (const { section, index } of sources) {
    if (consumed.has(index)) continue;
    const baseId = section.key ?? `ia-${index + 1}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    usedIds.add(id);
    prepared.push({
      id,
      title: section.title,
      body: section.text,
      evidence: section.evidence,
      ...(section.evidenceStale ? { evidenceStale: true } : {}),
    });
  }
  return prepared;
}
