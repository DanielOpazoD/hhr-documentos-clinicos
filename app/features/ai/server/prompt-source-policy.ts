export type PromptSourceDocument = {
  templateId: string;
  sectionCount: number;
  sections: Array<{
    order: number;
    length: "vacia" | "breve" | "media" | "extensa";
    paragraphs: number;
  }>;
};

const MAX_SOURCE_CHARACTERS = 60_000;

export function compactDocuments(documents: PromptSourceDocument[]): string {
  const payload = documents.map((document, index) => JSON.stringify({ index: index + 1, ...document })).join("\n");
  if (payload.length > MAX_SOURCE_CHARACTERS) {
    throw new Error("La estructura seleccionada es demasiado extensa para crear una sola plantilla.");
  }
  return payload;
}

export function assertProposalIsGeneric(proposal: { name: string; instructions: string; summary: string }) {
  const output = `${proposal.name}\n${proposal.instructions}\n${proposal.summary}`;
  if (/\b\d{1,2}(?:\.\d{3}){2}-[\dkK]\b|\b\d{7,8}-[\dkK]\b/u.test(output)
    || /\b\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}\b/u.test(output)
    || /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu.test(output)
    || /(?:\+?56\s*)?(?:9\s*)?\d(?:[\s.-]?\d){7,8}/u.test(output)) {
    throw new Error("La propuesta incluyó datos identificables. Intente nuevamente y revise el resultado antes de guardarlo.");
  }
}
