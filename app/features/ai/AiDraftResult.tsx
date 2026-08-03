"use client";

import { useState } from "react";
import { Download, FileSearch, FileText, Sparkles, Trash2 } from "@/app/components/Icons";
import { OperationFeedback } from "@/app/components/OperationFeedback";
import {
  operationFailure,
  toOperationFailure,
  type OperationFailure,
} from "@/app/lib/client/operation-feedback";
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
  onOpenDocument: (id: string) => boolean | void | Promise<boolean | void>;
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<OperationFailure | null>(null);
  const [openError, setOpenError] = useState<OperationFailure | null>(null);

  async function downloadOfficialWord() {
    if (!controller.identityConfirmed) {
      setDownloadError(operationFailure("Revise y confirme los datos de identidad antes de descargar."));
      return;
    }
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadHospitalSalvadorDocx(controller.result.sections, controller.result.patient, controller.result.signer);
    } catch (cause) {
      setDownloadError(toOperationFailure(cause, "No se pudo generar el Word oficial."));
    } finally {
      setDownloading(false);
    }
  }

  async function openSavedDraft(documentId: string) {
    setOpenError(null);
    try {
      if (await onOpenDocument(documentId) === false) {
        setOpenError(operationFailure("El borrador quedó guardado, pero no se pudo abrir. Puede volver a intentarlo.", { retryable: true }));
      }
    } catch {
      setOpenError(operationFailure("El borrador quedó guardado, pero no se pudo abrir. Puede volver a intentarlo.", { retryable: true }));
    }
  }

  async function saveAndContinue() {
    const documentId = await controller.createDraft();
    if (documentId) await openSavedDraft(documentId);
  }

  const visibleFailure = downloadError ?? openError ?? controller.error;
  const feedbackTitle = downloadError
    ? "No se pudo preparar el documento"
    : openError
      ? "El borrador se guardó, pero no se pudo abrir"
      : "No se pudo guardar el borrador";

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
            <button className="button primary" onClick={() => void openSavedDraft(controller.createdId!)}><FileSearch size={16} /> Continuar en el editor</button>
          ) : (
            <button className="button primary" disabled={controller.saving || !controller.identityConfirmed} onClick={() => void saveAndContinue()}>
              <FileSearch size={16} /> {controller.saving ? "Guardando…" : controller.createdId ? "Actualizar borrador" : "Guardar y abrir en el editor"}
            </button>
          )}
        </div>
        {visibleFailure ? (
          <OperationFeedback
            compact
            tone="error"
            title={feedbackTitle}
            message={visibleFailure.message}
            supportId={visibleFailure.supportId}
            code={visibleFailure.code}
            actions={openError && controller.createdId ? (
              <button type="button" className="text-button" onClick={() => void openSavedDraft(controller.createdId!)}>Reintentar apertura</button>
            ) : null}
            onDismiss={() => {
              if (downloadError) setDownloadError(null);
              else if (openError) setOpenError(null);
              else controller.clearError();
            }}
          />
        ) : null}
        {controller.createdId && !visibleFailure ? (
          <OperationFeedback compact tone="success" title="Guardado en Documentos" />
        ) : null}
      </section>
    </div>
  );
}
