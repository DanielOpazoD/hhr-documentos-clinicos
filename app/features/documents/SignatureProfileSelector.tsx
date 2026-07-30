import { Check, Trash2 } from "@/app/components/Icons";
import type { DocumentWorkspace } from "./use-document-workspace";

type Props = Pick<
  DocumentWorkspace,
  | "makeDefaultSignature"
  | "removeSignatureProfile"
  | "signatureBusy"
  | "signatureDeleteId"
  | "signatures"
  | "setSignatureDeleteId"
>;

export function SignatureProfileSelector({
  makeDefaultSignature,
  removeSignatureProfile,
  signatureBusy,
  signatureDeleteId,
  signatures,
  setSignatureDeleteId,
}: Props) {
  if (!signatures.length) return null;
  return (
    <details className="signature-library">
      <summary>Administrar imágenes guardadas ({signatures.length})</summary>
      <div>
        {signatures.map((asset) => (
          <article key={asset.id}>
            <span><strong>{asset.kind === "stamp" ? "Timbre" : "Firma"} · {asset.professionalName}</strong><small>{asset.specialty || "Sin cargo o especialidad"}</small></span>
            {asset.isDefault
              ? <span className="default-profile-state"><Check size={13} /> Predeterminada</span>
              : <button className="text-button" disabled={signatureBusy} onClick={() => void makeDefaultSignature(asset.id)}>Predeterminar</button>}
            <button className="icon-button danger" aria-label={`Eliminar ${asset.kind === "stamp" ? "timbre" : "firma"}`} disabled={signatureBusy} onClick={() => setSignatureDeleteId(asset.id)}><Trash2 size={14} /></button>
            {signatureDeleteId === asset.id ? (
              <div className="signature-delete-confirm" role="alertdialog" aria-label={`Eliminar imagen de ${asset.professionalName}`}>
                <span>¿Eliminar esta imagen?</span>
                <button onClick={() => setSignatureDeleteId(null)}>Cancelar</button>
                <button className="danger" autoFocus disabled={signatureBusy} onClick={() => void removeSignatureProfile(asset.id)}>Eliminar</button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </details>
  );
}
