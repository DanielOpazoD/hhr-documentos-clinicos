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
  const workflowFindingCount = aiMetadata.workflow?.findings.reduce(
    (total, finding) => total + finding.count,
    0,
  ) ?? 0;

  return (
    <aside id="ai-document-origin" tabIndex={-1} className="ai-document-origin print-hide">
      <details className="ai-provenance-disclosure">
        <summary>
          <Sparkles size={14} />
          <span>
            <strong>{aiMetadata.providerName ?? "IA documental"}</strong>
            <small>{aiMetadata.sources?.length ?? (aiMetadata.source ? 1 : 0)} fuente{(aiMetadata.sources?.length ?? (aiMetadata.source ? 1 : 0)) === 1 ? "" : "s"} · Trazabilidad</small>
          </span>
          <em>{aiMetadata.model}</em>
        </summary>
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
          {aiMetadata.promptTrace ? (
            <details className="ai-prompt-audit">
              <summary>Revisar solicitud y salida original</summary>
              <div>
                <section>
                  <strong>Entrada utilizada</strong>
                  <p><small>{aiMetadata.promptTrace.mode === "free" ? "Prompt libre" : aiMetadata.promptTrace.profileName}{aiMetadata.promptTrace.profileRevision ? ` · versión ${aiMetadata.promptTrace.profileRevision}` : ""}</small></p>
                  <pre>{aiMetadata.promptTrace.userInstructions || aiMetadata.promptTrace.effectiveInstructions}</pre>
                </section>
                <section>
                  <strong>Salida original de la IA</strong>
                  {aiMetadata.originalOutput ? <>
                    <p><b>Paciente</b><span>{[aiMetadata.originalOutput.patient.firstNames, aiMetadata.originalOutput.patient.lastNames].filter(Boolean).join(" ") || "No consignado"}{aiMetadata.originalOutput.patient.rut ? ` · ${aiMetadata.originalOutput.patient.rut}` : ""}{aiMetadata.originalOutput.patient.birthDate ? ` · ${aiMetadata.originalOutput.patient.birthDate}` : ""}</span></p>
                    <p><b>Firmante</b><span>{aiMetadata.originalOutput.signer.name || "No consignado"}{aiMetadata.originalOutput.signer.specialty ? ` · ${aiMetadata.originalOutput.signer.specialty}` : ""}</span></p>
                  </> : null}
                  {aiMetadata.originalOutput?.sections.map((section, index) => (
                    <p key={`${section.key ?? section.title}-${index}`}><b>{section.title}</b><span>{section.text}</span></p>
                  )) ?? <p><span>La salida original no está disponible para este documento anterior.</span></p>}
                </section>
              </div>
            </details>
          ) : null}
          {aiMetadata.workflow ? (
            <small>
              Flujo {aiMetadata.workflow.version} · Verificación {aiMetadata.workflow.outcome === "pass" ? "completa" : `${workflowFindingCount} advertencia${workflowFindingCount === 1 ? "" : "s"}`}
            </small>
          ) : null}
          {aiMetadata.promptVersion ? <small>Prompt {aiMetadata.promptVersion}</small> : null}
        </div>
      </details>
    </aside>
  );
}
