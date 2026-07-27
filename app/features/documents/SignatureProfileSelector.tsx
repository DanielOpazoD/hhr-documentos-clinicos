import { Check, Trash2 } from "@/app/components/Icons";
import type { DocumentWorkspace } from "./use-document-workspace";

type Props = Pick<
  DocumentWorkspace,
  | "attachSignature"
  | "makeDefaultSignature"
  | "removeSignatureProfile"
  | "placedSignature"
  | "signatureBusy"
  | "signatureDeleteId"
  | "signatures"
  | "setSignatureDeleteId"
  | "updateSigner"
>;

export function SignatureProfileSelector({
  attachSignature,
  makeDefaultSignature,
  removeSignatureProfile,
  placedSignature,
  signatureBusy,
  signatureDeleteId,
  signatures,
  setSignatureDeleteId,
  updateSigner,
}: Props) {
  if (!signatures.length) return null;

  const selected = signatures.find((signature) => signature.id === placedSignature?.id) ?? null;

  return (
    <div className="signature-profile-control">
      <label>
        Perfil profesional
        <select
          value={selected?.id ?? ""}
          onChange={(event) => {
            const signature = signatures.find((item) => item.id === event.target.value);
            if (!signature) return;
            updateSigner("name", signature.professionalName);
            updateSigner("rut", signature.professionalRut);
            updateSigner("specialty", signature.specialty);
            attachSignature(signature);
          }}
        >
          <option value="">Seleccionar perfil…</option>
          {signatures.map((signature) => (
            <option value={signature.id} key={signature.id}>
              {signature.professionalName}{signature.specialty ? ` · ${signature.specialty}` : ""}{signature.isDefault ? " · Predeterminado" : ""}
            </option>
          ))}
        </select>
      </label>
      {selected ? <div className="signature-profile-actions">
        {selected.isDefault ? <span className="default-profile-state"><Check size={13} /> Predeterminado</span> : <button className="text-button" disabled={signatureBusy} onClick={() => void makeDefaultSignature(selected.id)}>Usar por defecto</button>}
        <button className="text-button danger" disabled={signatureBusy} onClick={() => setSignatureDeleteId(selected.id)}><Trash2 size={13} /> Eliminar perfil</button>
      </div> : null}
      {selected && signatureDeleteId === selected.id ? (
        <div className="signature-delete-confirm" role="alertdialog" aria-label={`Eliminar perfil de ${selected.professionalName}`}>
          <span>¿Eliminar este perfil?</span>
          <button onClick={() => setSignatureDeleteId(null)}>Cancelar</button>
          <button className="danger" autoFocus disabled={signatureBusy} onClick={() => void removeSignatureProfile(selected.id)} aria-keyshortcuts="Enter">Eliminar</button>
        </div>
      ) : null}
    </div>
  );
}
