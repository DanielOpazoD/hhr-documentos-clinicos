"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Download, FileSearch, FileText, Sparkles, Trash2 } from "@/app/components/Icons";
import { AiIdentityEditor } from "./AiIdentityEditor";
import { AiSectionEvidence } from "./AiSectionEvidence";
import { HospitalSalvadorEditor } from "./HospitalSalvadorEditor";
import { downloadHospitalSalvadorDocx } from "./hospital-salvador-docx.js";
import type { AiStudioController } from "./use-ai-studio";

export function AiDraftResult({
  controller,
  onOpenDocument,
}: {
  controller: AiStudioController;
  onOpenDocument?: (id: string) => void | Promise<void>;
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function downloadOfficialWord() {
    if (!controller.identityConfirmed) {
      setDownloadError("Revise y confirme los datos de identidad antes de descargar.");
      return;
    }
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadHospitalSalvadorDocx(controller.result.sections, controller.result.patient, controller.result.signer);
    } catch (cause) {
      setDownloadError(cause instanceof Error ? cause.message : "No se pudo generar el Word oficial.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="ai-result-layout simplified-ai-result">
      <section className="panel ai-result">
        <div className="panel-header">
          <div><span className="eyebrow">Borrador editable</span><h2>{controller.draftTitle}</h2></div>
          <span className="status-pill borrador">Borrador</span>
        </div>
        <div className="ai-analysis-summary">
          <Sparkles size={16} />
          <div><strong>Resumen del análisis</strong><p>{controller.result.processingSummary}</p></div>
        </div>
        <AiIdentityEditor controller={controller} />
        {controller.draftTarget === "traslado_salvador" ? <HospitalSalvadorEditor controller={controller} /> : <div className="ai-sections">
          {controller.result.sections.map((section, index) => (
            <label key={`${section.title}-${index}`}>
              <input className="ai-section-title" aria-label={`Título de la sección ${index + 1}`} value={section.title} onChange={(event) => controller.updateSectionTitle(index, event.target.value)} />
              <textarea value={section.text} onChange={(event) => controller.updateSection(index, event.target.value)} />
              <AiSectionEvidence section={section} sources={controller.result.sources} />
            </label>
          ))}
        </div>}
        {controller.result.missingInformation.length ? <details className="ai-missing"><summary>Campos no encontrados ({controller.result.missingInformation.length})</summary><p>{controller.result.missingInformation.join(" · ")}</p></details> : null}
        <div className="ai-source-strip">
          <FileText size={15} />
          <span><strong>{controller.result.sources.length} fuente{controller.result.sources.length === 1 ? "" : "s"}</strong><small>{controller.result.sources.join(" · ")}</small></span>
          <em>{controller.result.providerName} · {controller.result.model}</em>
        </div>
        <div className="result-actions">
          <button className="button secondary" onClick={controller.reset}><Trash2 size={15} /> Descartar</button>
          {controller.draftTarget === "traslado_salvador" ? (
            <button className="button secondary" disabled={downloading || !controller.identityConfirmed} onClick={() => void downloadOfficialWord()}>
              <Download size={16} /> {downloading ? "Generando…" : "Descargar Word oficial"}
            </button>
          ) : null}
          {controller.createdId && !controller.draftHasChanges ? (
            onOpenDocument ? (
              <button className="button primary" onClick={() => void onOpenDocument(controller.createdId!)}><FileSearch size={16} /> Continuar en el editor</button>
            ) : (
              <Link className="button primary" href={`/documentos?document=${encodeURIComponent(controller.createdId)}`}><FileSearch size={16} /> Abrir en Documentos</Link>
            )
          ) : (
            <button className="button primary" disabled={controller.saving || !controller.identityConfirmed} onClick={() => void controller.createDraft()}>
              <FileSearch size={16} /> {controller.saving ? "Guardando…" : controller.createdId ? "Actualizar borrador" : "Guardar borrador"}
            </button>
          )}
        </div>
        {downloadError ? <p className="form-error">{downloadError}</p> : null}
        {controller.error ? <p className="form-error">{controller.error}</p> : null}
        {controller.createdId ? <p className="ai-saved"><Check size={15} /> Guardado en Documentos</p> : null}
      </section>
    </div>
  );
}
