import { useRef } from "react";
import { FileImage, Pencil, UploadCloud, X } from "@/app/components/Icons";
import { SignatureImageEditor } from "./SignatureImageEditor";
import { SignatureProfileSelector } from "./SignatureProfileSelector";
import { DEFAULT_SIGNATURE_IMAGE_SETTINGS } from "./prepare-signature";
import type { DocumentWorkspace } from "./use-document-workspace";

export function SignatureEditor({ onClose, workspace }: { onClose: () => void; workspace: DocumentWorkspace }) {
  const {
    openSignatureForm, saveSignature, setSignatureForm, setSignatureFormOpen,
    setSignatureImageSettings, signatureBusy, signatureError, signatureForm,
    signatureFormKind, signatureFormOpen, signatureImageSettings, signer,
  } = workspace;
  const inputRef = useRef<HTMLInputElement>(null);
  const formLabel = signatureFormKind === "stamp" ? "timbre" : "firma";

  return (
    <div className="editor-section signature-editor">
      <div className="editor-section-title signature-heading">
        <div><h2>Firma y timbre</h2><small>Seleccione una imagen o agregue una nueva.</small></div>
        <button className="text-button signature-panel-close" onClick={onClose}><X size={14} /> Cerrar</button>
      </div>

      <div className="signature-asset-groups">
        <SignatureProfileSelector kind="signature" workspace={workspace} onAdd={() => openSignatureForm("signature", signer)} />
        <SignatureProfileSelector kind="stamp" workspace={workspace} onAdd={() => openSignatureForm("stamp", signer)} />
      </div>

      {signatureFormOpen ? (
        <div className="signature-form compact-signature-form">
          <header>
            {signatureFormKind === "stamp" ? <FileImage size={16} /> : <Pencil size={16} />}
            <strong>Nueva imagen de {formLabel}</strong>
          </header>
          <label>Nombre<input maxLength={80} value={signatureForm.name} placeholder={`${formLabel === "firma" ? "Firma" : "Timbre"} principal`} onChange={(event) => setSignatureForm((current) => ({ ...current, name: event.target.value }))} /></label>
          <input
            ref={inputRef}
            hidden
            type="file"
            accept="image/png,image/jpeg"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              event.currentTarget.value = "";
              setSignatureForm((current) => ({ ...current, file }));
              setSignatureImageSettings({ ...DEFAULT_SIGNATURE_IMAGE_SETTINGS });
            }}
          />
          <button className="signature-file-button" onClick={() => inputRef.current?.click()}>
            <UploadCloud size={16} />
            {signatureForm.file ? signatureForm.file.name : `Elegir imagen de ${formLabel}`}
          </button>
          {signatureForm.file ? (
            <details className="signature-image-options">
              <summary>Ajustar recorte e imagen</summary>
              <SignatureImageEditor file={signatureForm.file} label={formLabel} settings={signatureImageSettings} onChange={setSignatureImageSettings} />
            </details>
          ) : null}
          <footer>
            <button className="button secondary" disabled={signatureBusy} onClick={() => setSignatureFormOpen(false)}>Cancelar</button>
            <button className="button primary" disabled={signatureBusy || !signatureForm.name.trim() || !signer.name.trim() || !signatureForm.file} onClick={() => void saveSignature(signer)}>
              {signatureBusy ? "Guardando…" : "Guardar y usar"}
            </button>
          </footer>
        </div>
      ) : null}

      {signatureError ? <p className="form-error">{signatureError}</p> : null}
      {(workspace.placedSignature || workspace.placedStamp) ? (
        <p className="signature-placement-help">Arrastre cada imagen desde su tirador en el documento. Se mueven por separado.</p>
      ) : null}
    </div>
  );
}
