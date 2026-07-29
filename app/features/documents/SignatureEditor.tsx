import { useRef } from "react";
import { FileImage, Minus, Pencil, Plus, UploadCloud, X } from "@/app/components/Icons";
import {
  SIGNING_IMAGE_WIDTH_MAX_PERCENT,
  SIGNING_IMAGE_WIDTH_MIN_PERCENT,
  SIGNING_IMAGE_WIDTH_STEP_PERCENT,
} from "@/app/lib/document-layout";
import { SignatureImageEditor } from "./SignatureImageEditor";
import { SignatureProfileSelector } from "./SignatureProfileSelector";
import { DEFAULT_SIGNATURE_IMAGE_SETTINGS } from "./prepare-signature";
import type { PlacedSignature, SignatureAssetKind } from "./types";
import type { DocumentWorkspace } from "./use-document-workspace";

export function SignatureEditor(workspace: DocumentWorkspace) {
  const {
    makeDefaultSignature, openSignatureForm, placedSignature, placedStamp,
    removeSignatureProfile, saveSignature, setSignatureDeleteId,
    setSignatureForm, setSignatureFormOpen, setSignatureImageSettings,
    signatureBusy, signatureDeleteId, signatureError, signatureForm,
    signatureFormKind, signatureFormOpen, signatureImageSettings, signatures,
    signer,
  } = workspace;
  const inputRef = useRef<HTMLInputElement>(null);
  const formLabel = signatureFormKind === "stamp" ? "timbre" : "firma";

  return (
    <div className="editor-section signature-editor">
      <div className="editor-section-title signature-heading">
        <div><h2>Firma y timbre</h2><small>Las imágenes se administran y posicionan por separado.</small></div>
        {signatureFormOpen ? <button className="text-button" onClick={() => setSignatureFormOpen(false)}><X size={14} /> Cerrar</button> : null}
      </div>

      <div className="signing-assets">
        <AssetControl kind="signature" placed={placedSignature} workspace={workspace} />
        <AssetControl kind="stamp" placed={placedStamp} workspace={workspace} />
      </div>

      {!signatureFormOpen ? (
        <div className="signature-add-actions">
          <button onClick={() => openSignatureForm("signature")}><Pencil size={15} /> Agregar firma</button>
          <button onClick={() => openSignatureForm("stamp")}><FileImage size={15} /> Agregar timbre</button>
        </div>
      ) : (
        <div className="signature-form">
          <strong>Nueva imagen de {formLabel}</strong>
          <input
            ref={inputRef}
            hidden
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              event.currentTarget.value = "";
              setSignatureForm((current) => ({ ...current, file }));
              setSignatureImageSettings({ ...DEFAULT_SIGNATURE_IMAGE_SETTINGS });
            }}
          />
          <button className="signature-file-button" onClick={() => inputRef.current?.click()}>
            <UploadCloud size={17} />
            {signatureForm.file ? "Cambiar imagen" : `Elegir imagen de ${formLabel}`}
          </button>
          {signatureForm.file ? (
            <SignatureImageEditor
              file={signatureForm.file}
              label={formLabel}
              settings={signatureImageSettings}
              onChange={setSignatureImageSettings}
            />
          ) : null}
          <button className="button primary" disabled={signatureBusy || !signer.name.trim() || !signatureForm.file} onClick={() => void saveSignature(signer)}>
            {signatureBusy ? "Guardando…" : `Guardar y usar ${formLabel}`}
          </button>
        </div>
      )}

      {signatureError ? <p className="form-error">{signatureError}</p> : null}

      {(placedSignature || placedStamp) ? (
        <p className="signature-placement-help">En la vista previa, arrastre cada imagen desde su tirador cuadrado. Ambas se mueven de forma independiente.</p>
      ) : null}

      <SignatureProfileSelector
        makeDefaultSignature={makeDefaultSignature}
        removeSignatureProfile={removeSignatureProfile}
        signatureBusy={signatureBusy}
        signatureDeleteId={signatureDeleteId}
        signatures={signatures}
        setSignatureDeleteId={setSignatureDeleteId}
      />
    </div>
  );
}

function AssetControl({ kind, placed, workspace }: { kind: SignatureAssetKind; placed: PlacedSignature | null; workspace: DocumentWorkspace }) {
  const label = kind === "stamp" ? "Timbre" : "Firma";
  const assetLabel = label.toLowerCase();
  const assets = workspace.signatures.filter((asset) => asset.kind === kind);
  return (
    <section className="signing-asset-control">
      <div><strong>{label}</strong><span>{placed ? "Incluido" : "Sin imagen"}</span></div>
      <select
        aria-label={`Imagen de ${label.toLowerCase()}`}
        value={placed?.id ?? ""}
        onChange={(event) => {
          const asset = assets.find((item) => item.id === event.target.value);
          if (!asset) {
            workspace.removePlacedImage(kind);
            return;
          }
          if (kind === "signature") workspace.loadSignerProfile({
            name: asset.professionalName,
            rut: asset.professionalRut,
            specialty: asset.specialty,
          });
          workspace.attachSignature(asset);
        }}
      >
        <option value="">Sin {label.toLowerCase()}</option>
        {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.professionalName}{asset.isDefault ? " · Predeterminado" : ""}</option>)}
      </select>
      {placed ? (
        <div className="signature-size-control">
          <div className="signature-size-heading"><span>Tamaño</span><output>{placed.width}%</output></div>
          <div className="signature-size-adjuster">
            <button
              type="button"
              aria-label={`Reducir tamaño de ${assetLabel}`}
              disabled={placed.width <= SIGNING_IMAGE_WIDTH_MIN_PERCENT}
              onClick={() => workspace.updatePlacedImage(kind, { width: placed.width - SIGNING_IMAGE_WIDTH_STEP_PERCENT })}
            ><Minus size={14} /></button>
            <input
              aria-label={`Tamaño de ${assetLabel}`}
              type="range"
              min={SIGNING_IMAGE_WIDTH_MIN_PERCENT}
              max={SIGNING_IMAGE_WIDTH_MAX_PERCENT}
              step="2"
              value={placed.width}
              onChange={(event) => workspace.updatePlacedImage(kind, { width: Number(event.target.value) })}
            />
            <button
              type="button"
              aria-label={`Aumentar tamaño de ${assetLabel}`}
              disabled={placed.width >= SIGNING_IMAGE_WIDTH_MAX_PERCENT}
              onClick={() => workspace.updatePlacedImage(kind, { width: placed.width + SIGNING_IMAGE_WIDTH_STEP_PERCENT })}
            ><Plus size={14} /></button>
          </div>
          <button className="text-button danger" onClick={() => workspace.removePlacedImage(kind)}>Quitar</button>
        </div>
      ) : null}
    </section>
  );
}
