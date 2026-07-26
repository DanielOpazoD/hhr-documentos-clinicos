import { Check } from "@/app/components/Icons";
import type { DocumentWorkspace } from "./use-document-workspace";

type Props = Pick<
  DocumentWorkspace,
  | "attachSignature"
  | "makeDefaultSignature"
  | "placedSignature"
  | "signatureBusy"
  | "signatures"
  | "updateSigner"
>;

export function SignatureProfileSelector({
  attachSignature,
  makeDefaultSignature,
  placedSignature,
  signatureBusy,
  signatures,
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
      {selected?.isDefault ? (
        <span className="default-profile-state"><Check size={13} /> Perfil predeterminado</span>
      ) : selected ? (
        <button className="text-button" disabled={signatureBusy} onClick={() => void makeDefaultSignature(selected.id)}>
          Usar por defecto
        </button>
      ) : null}
    </div>
  );
}
