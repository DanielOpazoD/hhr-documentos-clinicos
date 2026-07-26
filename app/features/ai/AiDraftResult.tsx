import Link from "next/link";
import { Check, FileSearch, FileText, Sparkles, Trash2 } from "@/app/components/Icons";
import { AiIdentityEditor } from "./AiIdentityEditor";
import { getTargetName } from "./targets";
import type { AiStudioController } from "./use-ai-studio";

export function AiDraftResult({ controller }: { controller: AiStudioController }) {
  return (
    <div className="ai-result-layout simplified-ai-result">
      <section className="panel ai-result">
        <div className="panel-header">
          <div><span className="eyebrow">Borrador editable</span><h2>{getTargetName(controller.target)}</h2></div>
          <span className="status-pill borrador">Borrador</span>
        </div>
        <div className="ai-analysis-summary">
          <Sparkles size={16} />
          <div><strong>Resumen del análisis</strong><p>{controller.result.processingSummary}</p></div>
        </div>
        <AiIdentityEditor controller={controller} />
        <div className="ai-sections">
          {controller.result.sections.map((section, index) => (
            <label key={`${section.title}-${index}`}>
              <span>{section.title}</span>
              <textarea value={section.text} onChange={(event) => controller.updateSection(index, event.target.value)} />
              {section.evidence.some((item) => item.excerpt.trim() && item.status !== "no_encontrado") ? (
                <details className="section-evidence">
                  <summary>{section.evidenceStale ? "Fuente original · texto editado" : "Ver fuente"}</summary>
                  {section.evidence.filter((item) => item.excerpt.trim() && item.status !== "no_encontrado").map((item, evidenceIndex) => (
                    <p key={`${item.page ?? "source"}-${evidenceIndex}`}>
                      <strong>
                        {controller.result.sources[item.sourceIndex] ? `${controller.result.sources[item.sourceIndex]} · ` : ""}
                        {item.page ? `Página ${item.page} · ` : ""}
                        {item.status === "ambiguo" ? "Ambigua" : "Explícita"} · {item.verification === "verified" ? "Verificada" : "No verificada"}
                      </strong>
                      <span>{item.excerpt}</span>
                    </p>
                  ))}
                </details>
              ) : null}
            </label>
          ))}
        </div>
        {controller.result.missingInformation.length ? <details className="ai-missing"><summary>Campos no encontrados ({controller.result.missingInformation.length})</summary><p>{controller.result.missingInformation.join(" · ")}</p></details> : null}
        <div className="ai-source-strip">
          <FileText size={15} />
          <span><strong>{controller.result.sources.length} fuente{controller.result.sources.length === 1 ? "" : "s"}</strong><small>{controller.result.sources.join(" · ")}</small></span>
          <em>{controller.result.providerName} · {controller.result.model}</em>
        </div>
        <div className="result-actions">
          <button className="button secondary" onClick={controller.reset}><Trash2 size={15} /> Descartar</button>
          {controller.createdId && !controller.draftHasChanges ? (
            <Link className="button primary" href={`/documentos?document=${encodeURIComponent(controller.createdId)}`}><FileSearch size={16} /> Abrir en Documentos</Link>
          ) : (
            <button className="button primary" disabled={controller.saving || !controller.identityConfirmed} onClick={() => void controller.createDraft()}>
              <FileSearch size={16} /> {controller.saving ? "Guardando…" : controller.createdId ? "Actualizar borrador" : "Guardar borrador"}
            </button>
          )}
        </div>
        {controller.error ? <p className="form-error">{controller.error}</p> : null}
        {controller.createdId ? <p className="ai-saved"><Check size={15} /> Guardado en Documentos</p> : null}
      </section>
    </div>
  );
}
