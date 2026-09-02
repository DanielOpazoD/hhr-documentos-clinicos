"use client";

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Printer, Sparkles, X } from "@/app/components/Icons";
import { PageHeader } from "@/app/components/VisualPrimitives";
import { OperationFeedback } from "@/app/components/OperationFeedback";
import { DocumentCommandActions, DocumentSaveError } from "@/app/features/documents/DocumentCommandBar";
import { AiProvenance } from "@/app/features/documents/AiProvenance";
import { DocumentLibrary } from "@/app/features/documents/DocumentLibrary";
import { ClinicalContextBar } from "@/app/features/documents/ClinicalContextBar";
import { DocumentWorkspaceShell } from "@/app/features/documents/DocumentWorkspaceShell";
import { SignatureEditor } from "@/app/features/documents/SignatureEditor";
import { DocumentPreview } from "@/app/features/documents/DocumentPreview";
import { DocumentHistoryDialog } from "@/app/features/documents/DocumentHistoryDialog";
import { DocumentPreflight } from "@/app/features/documents/DocumentPreflight";
import { evaluateDocumentReadiness } from "@/app/features/documents/document-readiness";
import { useDocumentWorkspace } from "@/app/features/documents/use-document-workspace";
import { useDocumentKeyboard } from "@/app/features/documents/use-document-keyboard";
import "@/app/features/documents/documents.css";

const LazyTemplateSettingsEditor = lazy(async () => {
  const loaded = await import("@/app/features/documents/TemplateSettingsEditor");
  return { default: loaded.TemplateSettingsEditor };
});

const LazyAiStudio = lazy(async () => {
  const loaded = await import("@/app/components/AiStudio");
  return { default: loaded.AiStudio };
});

function AiStudioFallback() {
  return (
    <section
      id="document-ai-assistant"
      className="panel"
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      Preparando asistente…
    </section>
  );
}

export function DocumentStudio() {
  const workspace = useDocumentWorkspace();
  const clinicalContextReady = Boolean(
    (workspace.patient.fullName ?? workspace.patient.firstNames).trim()
      && workspace.patient.rut.trim()
      && workspace.patient.birthDate
      && workspace.issueDate
      && workspace.signer.name.trim()
      && workspace.signer.rut.trim()
      && workspace.signer.specialty.trim(),
  );
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantActivated, setAssistantActivated] = useState(false);
  const [sidePanel, setSidePanel] = useState<"signature" | "template" | null>(null);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [clinicalContextPreference, setClinicalContextPreference] = useState<{ documentId: string | null; expanded: boolean } | null>(null);
  const sidePanelRef = useRef<HTMLElement>(null);
  const sidePanelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const printTriggerRef = useRef<HTMLButtonElement | null>(null);
  const clinicalContextExpanded = clinicalContextPreference?.documentId === workspace.documentId
    ? clinicalContextPreference.expanded
    : !workspace.documentId || !clinicalContextReady;
  const setClinicalContextExpanded = useCallback((expanded: boolean) => {
    setClinicalContextPreference({ documentId: workspace.documentId, expanded });
  }, [workspace.documentId]);
  const signaturePanelOpen = sidePanel === "signature";
  const {
    closeDocumentHistory,
    hasUnsavedChanges,
    openDocument,
    persist,
    saving,
    setNewMenuOpen,
    setSignatureDeleteId,
    setSignatureFormOpen,
  } = workspace;
  const saveFromKeyboard = useCallback(() => void persist(), [persist]);
  const openNewDocumentMenu = useCallback(() => setNewMenuOpen(true), [setNewMenuOpen]);
  const closeSidePanel = useCallback((restoreFocus = true) => {
    const trigger = sidePanelTriggerRef.current;
    sidePanelTriggerRef.current = null;
    setSidePanel(null);
    setSignatureDeleteId(null);
    setSignatureFormOpen(false);
    if (restoreFocus && trigger) window.requestAnimationFrame(() => trigger.focus());
  }, [setSignatureDeleteId, setSignatureFormOpen]);
  const toggleSignaturePanel = useCallback((trigger: HTMLButtonElement) => {
    if (signaturePanelOpen) {
      closeSidePanel();
      return;
    }
    sidePanelTriggerRef.current = trigger;
    setSidePanel("signature");
  }, [closeSidePanel, signaturePanelOpen]);
  const openTemplatePanel = useCallback((trigger: HTMLButtonElement) => {
    setSignatureDeleteId(null);
    setSignatureFormOpen(false);
    sidePanelTriggerRef.current = trigger;
    setSidePanel("template");
  }, [setSignatureDeleteId, setSignatureFormOpen]);
  const closePreflight = useCallback((restoreFocus = true) => {
    setPreflightOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => printTriggerRef.current?.focus());
  }, []);
  const closeTransientControls = useCallback(() => {
    setNewMenuOpen(false);
    closeDocumentHistory();
    closeSidePanel();
    if (preflightOpen) closePreflight();
  }, [closeDocumentHistory, closePreflight, closeSidePanel, preflightOpen, setNewMenuOpen]);
  useDocumentKeyboard({
    saving: workspace.saving,
    onSave: saveFromKeyboard,
    onNewDocument: openNewDocumentMenu,
    onEscape: closeTransientControls,
  });

  const setAssistantVisibility = useCallback((open: boolean, updateUrl = true) => {
    if (open) setAssistantActivated(true);
    if (open) {
      closeSidePanel(false);
      closePreflight(false);
    }
    setAssistantOpen(open);
    if (!updateUrl) return;
    const url = new URL(window.location.href);
    if (open) url.searchParams.set("assistant", "1");
    else url.searchParams.delete("assistant");
    window.history.pushState({}, "", `${url.pathname}${url.search}`);
  }, [closePreflight, closeSidePanel]);

  const openGeneratedDocument = useCallback(async (id: string) => {
    if (!(await openDocument(id))) return false;
    setAssistantVisibility(false, false);
    const url = new URL(window.location.href);
    url.searchParams.set("document", id);
    url.searchParams.delete("assistant");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    return true;
  }, [openDocument, setAssistantVisibility]);

  const editFromPreview = useCallback((fieldId: string) => {
    if (fieldId === "signature-settings-trigger") {
      const trigger = document.querySelector<HTMLButtonElement>(".professional-summary-trigger");
      if (!signaturePanelOpen && trigger) toggleSignaturePanel(trigger);
      else sidePanelRef.current?.focus();
      return;
    }
    if (fieldId.startsWith("patient-") || fieldId === "document-issue-date") {
      setClinicalContextExpanded(true);
    }
    if (fieldId.startsWith("professional-")) {
      const trigger = document.querySelector<HTMLButtonElement>(".professional-summary-trigger");
      if (!signaturePanelOpen && trigger) toggleSignaturePanel(trigger);
    }
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const resolvedFieldId = fieldId.startsWith("professional-")
        ? `panel-${fieldId}`
        : fieldId;
      const field = document.getElementById(resolvedFieldId);
      if (!(field instanceof HTMLElement)) return;
      if (fieldId === "ai-document-origin") {
        field.querySelector("details")?.setAttribute("open", "");
      }
      field.focus();
      field.scrollIntoView({ block: "center", behavior: "smooth" });
    }));
  }, [setClinicalContextExpanded, signaturePanelOpen, toggleSignaturePanel]);

  const readiness = evaluateDocumentReadiness({
    aiMetadata: workspace.aiMetadata,
    issueDate: workspace.issueDate,
    patient: workspace.patient,
    placedSignature: workspace.placedSignature,
    sections: workspace.sections,
    signer: workspace.signer,
  });
  const loadRetryLabel = workspace.loadRetryKind === "delete" ? "Reintentar eliminación" : "Reintentar";
  const readinessRef = useRef(readiness);
  useLayoutEffect(() => {
    readinessRef.current = readiness;
  }, [readiness]);

  const printWhenReady = useCallback(async (acceptWarnings = false) => {
    if (saving) return;
    if (hasUnsavedChanges() && !(await persist("Borrador"))) return;
    const currentReadiness = readinessRef.current;
    if (
      hasUnsavedChanges()
      || currentReadiness.blockers.length
      || (!acceptWarnings && currentReadiness.issues.length)
    ) {
      setPreflightOpen(true);
      return;
    }
    closePreflight(false);
    window.requestAnimationFrame(() => window.print());
  }, [closePreflight, hasUnsavedChanges, persist, saving]);

  useLayoutEffect(() => {
    if (sidePanel) sidePanelRef.current?.focus();
  }, [sidePanel]);

  useEffect(() => {
    const syncAssistantFromUrl = () => {
      const open = new URLSearchParams(window.location.search).get("assistant") === "1";
      if (open) setAssistantActivated(true);
      if (open) closeSidePanel(false);
      setAssistantOpen(open);
    };
    syncAssistantFromUrl();
    window.addEventListener("popstate", syncAssistantFromUrl);
    return () => window.removeEventListener("popstate", syncAssistantFromUrl);
  }, [closeSidePanel]);

  return (
    <>
      {signaturePanelOpen && !assistantOpen ? (
        <aside ref={sidePanelRef} tabIndex={-1} id="signature-settings-panel" className="signature-settings-panel print-hide" aria-label="Configurar profesional, firma y timbre">
          <SignatureEditor workspace={workspace} onClose={closeSidePanel} />
        </aside>
      ) : null}
      {sidePanel === "template" && !assistantOpen ? (
        <aside ref={sidePanelRef} tabIndex={-1} className="signature-settings-panel template-settings-panel print-hide" aria-label="Configurar plantilla del documento">
          <Suspense fallback={<div className="tpl-editor" role="status" aria-busy="true" aria-live="polite">Preparando plantilla…</div>}>
            <LazyTemplateSettingsEditor key={workspace.activeTemplateSetting.templateId} workspace={workspace} onClose={closeSidePanel} />
          </Suspense>
        </aside>
      ) : null}
      <div className="page-wrap studio-page simplified-studio">
        <PageHeader
          className="document-studio-header compact-page-header"
          title="Documentos"
          description="Redacte manualmente o genere un borrador con IA."
          actions={<>
            {!assistantOpen ? <DocumentCommandActions {...workspace} /> : null}
            <button
              type="button"
              className={assistantOpen ? "button secondary document-assistant-toggle active" : "button secondary document-assistant-toggle"}
              aria-label={assistantOpen ? "Volver al editor" : "Usar IA"}
              aria-expanded={assistantOpen}
              aria-controls="document-ai-assistant"
              onClick={() => setAssistantVisibility(!assistantOpen)}
            >
              {assistantOpen ? <X size={16} /> : <Sparkles size={16} />}
              <span>{assistantOpen ? "Volver al editor" : "Usar IA"}</span>
            </button>
            {!assistantOpen ? (
              <button
                ref={printTriggerRef}
                aria-label="Imprimir documento"
                aria-controls="document-print-preflight"
                aria-expanded={preflightOpen}
                className={workspace.dirty ? "button secondary studio-print-button" : "button primary studio-print-button"}
                disabled={saving}
                onClick={() => void printWhenReady()}
              >
                <Printer size={16} /><span>Imprimir</span>
              </button>
            ) : null}
          </>}
        >
          {!assistantOpen ? <DocumentLibrary {...workspace} /> : null}
        </PageHeader>

        {workspace.loadError ? (
          <OperationFeedback
            tone="error"
            title="No se pudo completar la operación"
            message={workspace.loadError.message}
            supportId={workspace.loadError.supportId}
            onDismiss={workspace.dismissLoadError}
            actions={workspace.loadError.retryable ? (
              <button type="button" className="text-button" onClick={() => void workspace.retryLoad()}>{loadRetryLabel}</button>
            ) : null}
          />
        ) : null}
        <DocumentSaveError {...workspace} />
        {preflightOpen && !assistantOpen ? (
          <DocumentPreflight
            readiness={readiness}
            onClose={() => closePreflight()}
            onNavigate={editFromPreview}
            onPrint={() => printWhenReady(true)}
            printingDisabled={saving}
          />
        ) : null}

        <DocumentWorkspaceShell
          assistantOpen={assistantOpen}
          assistant={assistantActivated ? (
            <Suspense fallback={<AiStudioFallback />}>
              <LazyAiStudio
                active={assistantOpen}
                initialTemplateId={workspace.templateId}
                initialTemplateTitle={workspace.activeTemplateSetting.title}
                initialTemplateSections={workspace.activeTemplateSetting.sections}
                initialPromptId={workspace.activeTemplateSetting.promptId}
                onOpenDocument={openGeneratedDocument}
              />
            </Suspense>
          ) : null}
        >
          <main className="document-main">
            <ClinicalContextBar
              {...workspace}
              expanded={clinicalContextExpanded}
              onExpandedChange={setClinicalContextExpanded}
              onToggleProfessionalPanel={toggleSignaturePanel}
              professionalPanelOpen={signaturePanelOpen}
            />
            <AiProvenance {...workspace} />
            <DocumentPreview {...workspace} onConfigureTemplate={openTemplatePanel} onEditRequest={editFromPreview} />
          </main>
        </DocumentWorkspaceShell>
        {workspace.historyOpen ? <DocumentHistoryDialog {...workspace} /> : null}
      </div>
    </>
  );
}
