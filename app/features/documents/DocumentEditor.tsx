import { PatientEditor } from "./PatientEditor";
import { AiProvenance } from "./AiProvenance";
import { SectionsEditor } from "./SectionsEditor";
import { SignatureEditor } from "./SignatureEditor";
import type { DocumentWorkspace } from "./use-document-workspace";

export function DocumentEditor({ workspace }: { workspace: DocumentWorkspace }) {
  return (
    <section
      id="document-editor"
      className={`editor-panel print-hide ${workspace.mobileView === "edit" ? "mobile-visible" : "mobile-hidden"}`}
    >
      <AiProvenance {...workspace} />
      <PatientEditor {...workspace} />
      <SectionsEditor {...workspace} />
      <SignatureEditor {...workspace} />
    </section>
  );
}
