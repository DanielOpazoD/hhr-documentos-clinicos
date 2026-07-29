import { AiProvenance } from "./AiProvenance";
import { SectionsEditor } from "./SectionsEditor";
import { ProfessionalEditor } from "./ProfessionalEditor";
import type { DocumentWorkspace } from "./use-document-workspace";
import type { CSSProperties } from "react";

export function DocumentEditor({
  onToggleSignature,
  signatureOpen,
  workspace,
}: {
  onToggleSignature: () => void;
  signatureOpen: boolean;
  workspace: DocumentWorkspace;
}) {
  return (
    <section
      id="document-editor"
      style={{ "--document-font-size": `${workspace.documentFontSize}px` } as CSSProperties}
      className={`editor-panel print-hide ${workspace.mobileView === "edit" ? "mobile-visible" : "mobile-hidden"}`}
    >
      <AiProvenance {...workspace} />
      <SectionsEditor {...workspace} />
      <ProfessionalEditor
        signer={workspace.signer}
        updateSigner={workspace.updateSigner}
        variant="mobile"
        onToggleSignature={onToggleSignature}
        signatureOpen={signatureOpen}
      />
    </section>
  );
}
