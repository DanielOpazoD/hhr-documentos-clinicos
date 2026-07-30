import { Sparkles } from "@/app/components/Icons";
import type { AiEvidence } from "@/app/features/ai/types";
import type { DocumentWorkspace } from "./use-document-workspace";

type Props = Pick<DocumentWorkspace, "aiMetadata" | "sections">;

export function AiProvenance({ aiMetadata, sections }: Props) {
  if (!aiMetadata) return null;
  const evidence = aiMetadata.evidence;
  const evidenceBySection: Record<string, AiEvidence[]> = Array.isArray(evidence)
    ? Object.fromEntries(sections.map((section, index) => [section.id, evidence[index] ?? []]))
    : evidence ?? {};

  return (
    <aside className="ai-document-origin print-hide">
      <div>
        <Sparkles size={14} />
        <span><strong>{aiMetadata.providerName ?? "IA documental"}</strong><small>{aiMetadata.sources?.join(" · ") ?? aiMetadata.source ?? "Documento importado"}</small></span>
        <em>{aiMetadata.model}</em>
      </div>
      <details>
        <summary>Ver trazabilidad</summary>
        <div className="ai-provenance-details">
          {sections.map((section) => {
            const evidence = evidenceBySection[section.id]?.filter((item) => item.excerpt.trim() && item.status !== "no_encontrado") ?? [];
            const edited = aiMetadata.editedSectionIds?.includes(section.id) ?? false;
            return evidence.length ? (
              <section key={section.id}>
                <strong>{section.title}{edited ? " · fuente del borrador original" : ""}</strong>
                {evidence.map((item, index) => (
                  <p key={`${item.page ?? "source"}-${index}`}>
                    <small>
                      {aiMetadata.sources?.[item.sourceIndex] ? `${aiMetadata.sources[item.sourceIndex]} · ` : ""}
                      {item.page ? `Página ${item.page} · ` : ""}
                      {item.status === "ambiguo" ? "Ambigua" : "Explícita"} · {item.verification === "verified" ? "Verificada" : "No verificada"}
                    </small>
                    <span>{item.excerpt}</span>
                  </p>
                ))}
              </section>
            ) : null;
          })}
          {aiMetadata.missingInformation?.length ? (
            <section><strong>Por completar</strong><p><span>{aiMetadata.missingInformation.join(" · ")}</span></p></section>
          ) : null}
          {aiMetadata.safetyNotice ? (
            <section><strong>Nota de generación</strong><p><span>{aiMetadata.safetyNotice}</span></p></section>
          ) : null}
          {aiMetadata.promptVersion ? <small>Prompt {aiMetadata.promptVersion}</small> : null}
        </div>
      </details>
    </aside>
  );
}
