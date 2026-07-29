"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Printer, Sparkles, X } from "@/app/components/Icons";
import { AiStudio } from "@/app/components/AiStudio";
import { DocumentCommandActions, DocumentSaveError } from "@/app/features/documents/DocumentCommandBar";
import { AiProvenance } from "@/app/features/documents/AiProvenance";
import { DocumentLibrary } from "@/app/features/documents/DocumentLibrary";
import { PatientEditor } from "@/app/features/documents/PatientEditor";
import { ProfessionalEditor } from "@/app/features/documents/ProfessionalEditor";
import { SignatureEditor } from "@/app/features/documents/SignatureEditor";
import { DocumentPreview } from "@/app/features/documents/DocumentPreview";
import { DocumentHistoryDialog } from "@/app/features/documents/DocumentHistoryDialog";
import { useDocumentWorkspace } from "@/app/features/documents/use-document-workspace";
import { useDocumentKeyboard } from "@/app/features/documents/use-document-keyboard";

export function DocumentStudio() {
  const workspace = useDocumentWorkspace();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantActivated, setAssistantActivated] = useState(false);
  const [signaturePanelOpen, setSignaturePanelOpen] = useState(false);
  const [professionalSlot, setProfessionalSlot] = useState<HTMLElement | null>(null);
  const signaturePanelRef = useRef<HTMLElement>(null);
  const signatureTriggerRef = useRef<HTMLButtonElement | null>(null);
  const { closeDocumentHistory, openDocument, persist, setNewMenuOpen, setSignatureDeleteId, setSignatureFormOpen } = workspace;
  const saveFromKeyboard = useCallback(() => void persist(), [persist]);
  const openNewDocumentMenu = useCallback(() => setNewMenuOpen(true), [setNewMenuOpen]);
  const closeSignaturePanel = useCallback((restoreFocus = true) => {
    const trigger = signatureTriggerRef.current;
    signatureTriggerRef.current = null;
    setSignaturePanelOpen(false);
    setSignatureDeleteId(null);
    setSignatureFormOpen(false);
    if (restoreFocus && trigger) window.requestAnimationFrame(() => trigger.focus());
  }, [setSignatureDeleteId, setSignatureFormOpen]);
  const toggleSignaturePanel = useCallback((trigger: HTMLButtonElement) => {
    if (signaturePanelOpen) {
      closeSignaturePanel();
      return;
    }
    signatureTriggerRef.current = trigger;
    setSignaturePanelOpen(true);
  }, [closeSignaturePanel, signaturePanelOpen]);
  const closeTransientControls = useCallback(() => {
    setNewMenuOpen(false);
    closeDocumentHistory();
    closeSignaturePanel();
  }, [closeDocumentHistory, closeSignaturePanel, setNewMenuOpen]);
  useDocumentKeyboard({
    saving: workspace.saving,
    onSave: saveFromKeyboard,
    onNewDocument: openNewDocumentMenu,
    onEscape: closeTransientControls,
  });

  const setAssistantVisibility = useCallback((open: boolean, updateUrl = true) => {
    if (open) setAssistantActivated(true);
    if (open) closeSignaturePanel(false);
    setAssistantOpen(open);
    if (!updateUrl) return;
    const url = new URL(window.location.href);
    if (open) url.searchParams.set("assistant", "1");
    else url.searchParams.delete("assistant");
    window.history.pushState({}, "", `${url.pathname}${url.search}`);
  }, [closeSignaturePanel]);

  const openGeneratedDocument = useCallback(async (id: string) => {
    if (!(await openDocument(id))) return;
    setAssistantVisibility(false, false);
    const url = new URL(window.location.href);
    url.searchParams.set("document", id);
    url.searchParams.delete("assistant");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [openDocument, setAssistantVisibility]);

  const editFromPreview = useCallback((fieldId: string) => {
    const compactViewport = window.matchMedia("(max-width: 820px)").matches;
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const resolvedFieldId = compactViewport && fieldId.startsWith("professional-")
        ? `mobile-${fieldId}`
        : fieldId;
      const field = document.getElementById(resolvedFieldId);
      if (!(field instanceof HTMLElement)) return;
      field.focus();
      field.scrollIntoView({ block: "center", behavior: "smooth" });
    }));
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setProfessionalSlot(document.getElementById("document-professional-slot"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useLayoutEffect(() => {
    if (!signaturePanelOpen) return;
    signaturePanelRef.current?.focus();
  }, [signaturePanelOpen]);

  useEffect(() => {
    const syncAssistantFromUrl = () => {
      const open = new URLSearchParams(window.location.search).get("assistant") === "1";
      if (open) setAssistantActivated(true);
      if (open) closeSignaturePanel(false);
      setAssistantOpen(open);
    };
    syncAssistantFromUrl();
    window.addEventListener("popstate", syncAssistantFromUrl);
    return () => window.removeEventListener("popstate", syncAssistantFromUrl);
  }, [closeSignaturePanel]);

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
        <aside ref={signaturePanelRef} tabIndex={-1} id="signature-settings-panel" className="signature-settings-panel print-hide" aria-label="Configurar firma y timbre">
          <SignatureEditor workspace={workspace} onClose={closeSignaturePanel} />
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
            {!assistantOpen ? <>
              <button aria-label="Imprimir documento" className="button primary studio-print-button" onClick={() => window.print()}><Printer size={16} /><span>Imprimir</span></button>
              <DocumentCommandActions {...workspace} />
            </> : null}
          </div>
        </header>

        {workspace.loadError ? <p className="form-error standalone">{workspace.loadError}</p> : null}
        <DocumentSaveError saveError={workspace.saveError} reloadDocument={workspace.reloadDocument} />

        {assistantActivated ? (
          <div hidden={!assistantOpen}>
            <AiStudio active={assistantOpen} embedded onOpenDocument={openGeneratedDocument} />
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
              <DocumentPreview {...workspace} onEditRequest={editFromPreview} />
            </main>
          </div>
        </div>
        {workspace.historyOpen ? <DocumentHistoryDialog {...workspace} /> : null}
      </div>
    </>
  );
}
