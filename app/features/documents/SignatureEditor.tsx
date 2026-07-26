import { useRef } from "react";
import { FilePlus2, Pencil, UploadCloud, X } from "@/app/components/Icons";
import { SignatureProfileSelector } from "./SignatureProfileSelector";
import type { DocumentWorkspace } from "./use-document-workspace";

type Props = Pick<
  DocumentWorkspace,
  | "attachSignature"
  | "markSignatureDirty"
  | "makeDefaultSignature"
  | "placedSignature"
  | "saveSignature"
  | "setPlacedSignature"
  | "setSignatureForm"
  | "setSignatureFormOpen"
  | "signatureBusy"
  | "signatureError"
  | "signatureForm"
  | "signatureFormOpen"
  | "signatures"
  | "signer"
  | "updateSigner"
>;

export function SignatureEditor({
  attachSignature,
  markSignatureDirty,
  makeDefaultSignature,
  placedSignature,
  saveSignature,
  setPlacedSignature,
  setSignatureForm,
  setSignatureFormOpen,
  signatureBusy,
  signatureError,
  signatureForm,
  signatureFormOpen,
  signatures,
  signer,
  updateSigner,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  function setHorizontalPosition(x: number) {
    setPlacedSignature((current) => current ? { ...current, x } : current);
    markSignatureDirty();
  }

  return (
    <div className="editor-section signature-editor">
      <div className="editor-section-title">
        <h2>Profesional firmante</h2>
        <button className="text-button" onClick={() => setSignatureFormOpen(!signatureFormOpen)}>
          {signatureFormOpen ? <X size={14} /> : <FilePlus2 size={14} />}
          {signatureFormOpen ? "Cerrar" : "Agregar imagen"}
        </button>
      </div>

      <div className="signer-fields">
        <label>Nombre y apellido<input value={signer.name} onChange={(event) => updateSigner("name", event.target.value)} /></label>
        <label>RUT<input value={signer.rut} onChange={(event) => updateSigner("rut", event.target.value)} /></label>
        <label>Especialidad<input value={signer.specialty} onChange={(event) => updateSigner("specialty", event.target.value)} /></label>
      </div>

      {signatures.length ? (
        <SignatureProfileSelector
          attachSignature={attachSignature}
          makeDefaultSignature={makeDefaultSignature}
          placedSignature={placedSignature}
          signatureBusy={signatureBusy}
          signatures={signatures}
          updateSigner={updateSigner}
        />
      ) : signatureFormOpen ? null : (
        <button className="empty-signature" onClick={() => setSignatureFormOpen(true)}>
          <Pencil size={18} /> Adjuntar imagen de firma
        </button>
      )}

      {signatureFormOpen ? (
        <div className="signature-form">
          <input
            ref={inputRef}
            hidden
            type="file"
            accept="image/png,image/jpeg"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              event.currentTarget.value = "";
              setSignatureForm((current) => ({ ...current, file }));
            }}
          />
          <button className="signature-file-button" onClick={() => inputRef.current?.click()}>
            <UploadCloud size={17} />
            {signatureForm.file ? signatureForm.file.name : "Elegir PNG o JPG"}
          </button>
          <button className="button primary" disabled={signatureBusy || !signer.name.trim()} onClick={() => void saveSignature(signer)}>
            {signatureBusy ? "Guardando…" : "Guardar y usar"}
          </button>
          {signatureError ? <p className="form-error">{signatureError}</p> : null}
        </div>
      ) : null}

      {placedSignature ? (
        <div className="signature-position-controls">
          <span>Arrastre la firma en la hoja</span>
          <div>
            <button onClick={() => setHorizontalPosition(24)}>Izquierda</button>
            <button onClick={() => setHorizontalPosition(50)}>Centro</button>
            <button onClick={() => setHorizontalPosition(76)}>Derecha</button>
            <button onClick={() => { setPlacedSignature(null); markSignatureDirty(); }}>Quitar</button>
          </div>
          <label>
            Tamaño
            <input
              type="range"
              min="18"
              max="42"
              value={placedSignature.width}
              onChange={(event) => {
                const width = Number(event.target.value);
                setPlacedSignature((current) => current ? {
                  ...current,
                  width,
                  x: Math.max(width / 2, Math.min(100 - width / 2, current.x)),
                } : current);
                markSignatureDirty();
              }}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
