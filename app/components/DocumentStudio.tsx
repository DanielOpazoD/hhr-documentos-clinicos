"use client";

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, Sparkles, X } from "@/app/components/Icons";
import { DocumentCommandActions, DocumentSaveError } from "@/app/features/documents/DocumentCommandBar";
import { AiProvenance } from "@/app/features/documents/AiProvenance";
import { DocumentLibrary } from "@/app/features/documents/DocumentLibrary";
import { PatientEditor } from "@/app/features/documents/PatientEditor";
import { ProfessionalEditor } from "@/app/features/documents/ProfessionalEditor";
import { SignatureEditor } from "@/app/features/documents/SignatureEditor";
import { DocumentPreview } from "@/app/features/documents/DocumentPreview";
import { DocumentHistoryDialog } from "@/app/features/documents/DocumentHistoryDialog";
import { DocumentPreflight } from "@/app/features/documents/DocumentPreflight";
import { evaluateDocumentReadiness } from "@/app/features/documents/document-readiness";
import { useDocumentWorkspace } from "@/app/features/documents/use-document-workspace";
import { useDocumentKeyboard } from "@/app/features/documents/use-document-keyboard";
import { TemplateSettingsEditor } from "@/app/features/documents/TemplateSettingsEditor";

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
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantActivated, setAssistantActivated] = useState(false);
  const [sidePanel, setSidePanel] = useState<"signature" | "template" | null>(null);
  const [preflightOpen, setPreflightOpen] = useState(false);
  const [professionalSlot, setProfessionalSlot] = useState<HTMLElement | null>(null);
  const sidePanelRef = useRef<HTMLElement>(null);
  const sidePanelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const printTriggerRef = useRef<HTMLButtonElement | null>(null);
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
    const compactViewport = window.matchMedia("(max-width: 820px)").matches;
    if (fieldId === "signature-settings-trigger") {
      const trigger = document.querySelector<HTMLButtonElement>(
        compactViewport
          ? ".professional-editor-mobile .signature-panel-trigger"
          : "#document-professional-slot .signature-panel-trigger",
      );
      if (!signaturePanelOpen && trigger) toggleSignaturePanel(trigger);
      else sidePanelRef.current?.focus();
      return;
    }
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const resolvedFieldId = compactViewport && fieldId.startsWith("professional-")
        ? `mobile-${fieldId}`
        : fieldId;
      const field = document.getElementById(resolvedFieldId);
      if (!(field instanceof HTMLElement)) return;
      if (fieldId === "ai-document-origin") {
        field.querySelector("details")?.setAttribute("open", "");
      }
      field.focus();
      field.scrollIntoView({ block: "center", behavior: "smooth" });
    }));
  }, [signaturePanelOpen, toggleSignaturePanel]);

  const readiness = evaluateDocumentReadiness({
    aiMetadata: workspace.aiMetadata,
    issueDate: workspace.issueDate,
    patient: workspace.patient,
    placedSignature: workspace.placedSignature,
    sections: workspace.sections,
    signer: workspace.signer,
  });
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

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setProfessionalSlot(document.getElementById("document-professional-slot"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

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
      {professionalSlot && !assistantOpen ? createPortal(
        <ProfessionalEditor
          signer={workspace.signer}
          updateSigner={workspace.updateSigner}
          variant="sidebar"
          onToggleSignature={toggleSignaturePanel}
          signatureOpen={signaturePanelOpen}
        />,
        professionalSlot,
      ) : null}
      {signaturePanelOpen && !assistantOpen ? (
        <aside ref={sidePanelRef} tabIndex={-1} id="signature-settings-panel" className="signature-settings-panel print-hide" aria-label="Configurar firma y timbre">
          <SignatureEditor workspace={workspace} onClose={closeSidePanel} />
        </aside>
      ) : null}
      {sidePanel === "template" && !assistantOpen ? (
        <aside ref={sidePanelRef} tabIndex={-1} className="signature-settings-panel template-settings-panel print-hide" aria-label="Configurar plantilla del documento">
          <TemplateSettingsEditor key={workspace.activeTemplateSetting.templateId} workspace={workspace} onClose={closeSidePanel} />
        </aside>
      ) : null}
      <div className="page-wrap studio-page simplified-studio">
        <header className="page-header compact-page-header document-studio-header">
          <div className="document-header-context">
            <div className="document-page-title">
              <h1>Documentos</h1>
              <p>Redacte manualmente o genere un borrador con IA.</p>
            </div>
            {!assistantOpen ? <DocumentLibrary {...workspace} /> : null}
          </div>
          <div className="header-actions">
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
                className="button primary studio-print-button"
                disabled={saving}
                onClick={() => void printWhenReady()}
              >
                <Printer size={16} /><span>Imprimir</span>
              </button>
            ) : null}
          </div>
        </header>

        {workspace.loadError ? <p className="form-error standalone">{workspace.loadError}</p> : null}
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

        {assistantActivated ? (
          <div hidden={!assistantOpen}>
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
          </div>
        ) : null}
        <div hidden={assistantOpen}>
          <div className="document-workspace-shell">
            <main className="document-main">
              <PatientEditor {...workspace} />
              <ProfessionalEditor
                signer={workspace.signer}
                updateSigner={workspace.updateSigner}
                variant="mobile"
                onToggleSignature={toggleSignaturePanel}
                signatureOpen={signaturePanelOpen}
              />
              <AiProvenance {...workspace} />
              <DocumentPreview {...workspace} onConfigureTemplate={openTemplatePanel} onEditRequest={editFromPreview} />
            </main>
          </div>
        </div>
        {workspace.historyOpen ? <DocumentHistoryDialog {...workspace} /> : null}
      </div>
    </>
  );
}
