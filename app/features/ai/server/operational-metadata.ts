type OperationalSource = {
  file: { size: number };
  mimeType: string;
};

export type AiOperationalSourceMetadata = {
  sourceCount: number;
  totalSize: number;
  sourceTypeCounts: Record<string, number>;
};

export function summarizeAiSourcesForAudit(
  sources: readonly OperationalSource[],
): AiOperationalSourceMetadata {
  const typeCounts = new Map<string, number>();
  let totalSize = 0;
  for (const source of sources) {
    totalSize += source.file.size;
    typeCounts.set(source.mimeType, (typeCounts.get(source.mimeType) ?? 0) + 1);
  }
  return {
    sourceCount: sources.length,
    totalSize,
    sourceTypeCounts: Object.fromEntries([...typeCounts].sort(([left], [right]) => left.localeCompare(right))),
  };
}
