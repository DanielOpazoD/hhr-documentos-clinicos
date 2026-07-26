import type { Dispatch, SetStateAction } from "react";
import { SIGNATURE_Y_DEFAULT_PERCENT } from "@/app/lib/document-layout";
import type { PlacedSignature, SignatureRecord, SignerData } from "./types";

export function applySignatureProfile(
  profile: SignatureRecord,
  loadSignerProfile: (signer: SignerData) => void,
  setPlacedSignature: Dispatch<SetStateAction<PlacedSignature | null>>,
) {
  loadSignerProfile({
    name: profile.professionalName,
    rut: profile.professionalRut,
    specialty: profile.specialty,
  });
  setPlacedSignature({ ...profile, x: 50, y: SIGNATURE_Y_DEFAULT_PERCENT, width: 28 });
}
