type DocxSection = { key?: string; title: string; text: string };
type DocxPatient = { firstNames?: string; lastNames?: string; rut?: string };
type DocxSigner = { name?: string; rut?: string; specialty?: string };

export function createHospitalSalvadorDocxBytes(
  templateBytes: Uint8Array,
  sections: DocxSection[],
  patient: DocxPatient,
  signer: DocxSigner,
  issueDate?: Date,
): Uint8Array;
