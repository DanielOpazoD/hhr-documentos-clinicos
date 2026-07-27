import type { AiImportResult, AiSection } from "./types";

export function AiSectionEvidence({ section, sources }: { section: AiSection; sources: AiImportResult["sources"] }) {
  const evidence = section.evidence.filter((item) => item.excerpt.trim() && item.status !== "no_encontrado");
  if (!evidence.length) return null;
  return (
    <details className="section-evidence">
      <summary>{section.evidenceStale ? "Fuente original · texto editado" : "Ver fuente"}</summary>
      {evidence.map((item, index) => (
        <p key={`${item.sourceIndex}-${item.page ?? "source"}-${index}`}>
          <strong>
            {sources[item.sourceIndex] ? `${sources[item.sourceIndex]} · ` : ""}
            {item.page ? `Página ${item.page} · ` : ""}
            {item.status === "ambiguo" ? "Ambigua" : "Explícita"} · {item.verification === "verified" ? "Verificada" : "No verificada"}
          </strong>
          <span>{item.excerpt}</span>
        </p>
      ))}
    </details>
  );
}
