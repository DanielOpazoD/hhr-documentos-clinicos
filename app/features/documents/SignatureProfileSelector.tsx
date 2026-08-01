import NextImage from "next/image";
import { useState } from "react";
import { Check, MoreHorizontal, Pencil, Plus, Star, Trash2, X } from "@/app/components/Icons";
import { SIGNING_IMAGE_WIDTH_MAX_PERCENT, SIGNING_IMAGE_WIDTH_MIN_PERCENT } from "@/app/lib/document-layout";
import type { SignatureAssetKind, SignatureRecord } from "./types";
import type { DocumentWorkspace } from "./use-document-workspace";

export function SignatureProfileSelector({
  kind,
  onAdd,
  workspace,
}: {
  kind: SignatureAssetKind;
  onAdd: () => void;
  workspace: DocumentWorkspace;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const label = kind === "stamp" ? "Timbre" : "Firma";
  const assets = workspace.signatures.filter((asset) => asset.kind === kind);
  const placed = kind === "stamp" ? workspace.placedStamp : workspace.placedSignature;
  const activeName = assets.find((asset) => asset.id === placed?.id)?.name ?? placed?.name;

  function selectAsset(asset: SignatureRecord) {
    if (kind === "signature") workspace.loadSignerProfile({
      name: asset.professionalName,
      rut: asset.professionalRut,
      specialty: asset.specialty,
    });
    workspace.attachSignature(asset);
  }

  return (
    <section className="signature-asset-group" aria-labelledby={`${kind}-asset-title`}>
      <header>
        <div><strong id={`${kind}-asset-title`}>{label}</strong><small>{activeName ?? "Sin imagen"}</small></div>
        {assets.length ? <button className="text-button" onClick={onAdd}><Plus size={13} /> Agregar</button> : null}
      </header>
      {assets.length ? <div className="signature-asset-list">
        {assets.map((asset) => {
          const selected = placed?.id === asset.id;
          return <article className={selected ? "selected" : ""} key={asset.id}>
            <button className="signature-asset-select" aria-pressed={selected} onClick={() => selectAsset(asset)}>
              <span className="signature-thumbnail"><NextImage src={asset.imageUrl} alt="" width={72} height={36} unoptimized /></span>
              <span><strong>{asset.name}</strong><small>{asset.professionalName}{asset.specialty ? ` · ${asset.specialty}` : ""}</small></span>
              {selected ? <span className="signature-selected-state"><Check size={13} /> En uso</span> : asset.isDefault ? <Star size={13} aria-label="Predeterminada" /> : null}
            </button>
            <details className="section-actions-menu signature-asset-menu">
              <summary aria-label={`Opciones de ${asset.name}`}><MoreHorizontal size={16} /></summary>
              <div>
                <button onClick={(event) => {
                  setRenamingId(asset.id);
                  setName(asset.name);
                  event.currentTarget.closest("details")?.removeAttribute("open");
                }}><Pencil size={13} /> Renombrar</button>
                {!asset.isDefault ? <button disabled={workspace.signatureBusy} onClick={(event) => {
                  void workspace.makeDefaultSignature(asset.id);
                  event.currentTarget.closest("details")?.removeAttribute("open");
                }}><Star size={13} /> Predeterminar</button> : null}
                <button className="section-delete" disabled={workspace.signatureBusy} onClick={(event) => {
                  workspace.setSignatureDeleteId(asset.id);
                  event.currentTarget.closest("details")?.removeAttribute("open");
                }}><Trash2 size={13} /> Eliminar</button>
              </div>
            </details>
            {renamingId === asset.id ? <form className="signature-rename" onSubmit={(event) => {
              event.preventDefault();
              void workspace.renameSignatureProfile(asset.id, name).then((saved) => saved && setRenamingId(null));
            }}>
              <input autoFocus aria-label={`Nuevo nombre de ${asset.name}`} maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
              <button aria-label="Guardar nombre" disabled={!name.trim() || workspace.signatureBusy}><Check size={14} /></button>
              <button type="button" aria-label="Cancelar cambio de nombre" onClick={() => setRenamingId(null)}><X size={14} /></button>
            </form> : null}
            {workspace.signatureDeleteId === asset.id ? <div className="inline-confirm signature-delete-confirm" role="alertdialog" aria-label={`Eliminar ${asset.name}`}>
              <span>¿Eliminar esta imagen?</span>
              <button onClick={() => workspace.setSignatureDeleteId(null)}>Cancelar</button>
              <button className="danger" autoFocus disabled={workspace.signatureBusy} onClick={() => void workspace.removeSignatureProfile(asset.id)}>Eliminar</button>
            </div> : null}
          </article>;
        })}
      </div> : <button className="signature-empty-action" onClick={onAdd}><Plus size={14} /> Agregar {label.toLowerCase()}</button>}
      {placed ? <div className="signature-size-control">
        <label htmlFor={`${kind}-size`}>Tamaño <output>{placed.width}%</output></label>
        <input id={`${kind}-size`} aria-label={`Tamaño de ${label.toLowerCase()}`} type="range" min={SIGNING_IMAGE_WIDTH_MIN_PERCENT} max={SIGNING_IMAGE_WIDTH_MAX_PERCENT} step="2" value={placed.width} onChange={(event) => workspace.updatePlacedImage(kind, { width: Number(event.target.value) })} />
        <button className="text-button danger" onClick={() => workspace.removePlacedImage(kind)}>Quitar del documento</button>
      </div> : null}
    </section>
  );
}
