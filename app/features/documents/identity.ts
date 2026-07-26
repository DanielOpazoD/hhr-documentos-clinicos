import type { PatientData } from "./types";

export function patientFullName(patient: Pick<PatientData, "firstNames" | "lastNames">): string {
  return [patient.firstNames.trim(), patient.lastNames.trim()].filter(Boolean).join(" ");
}

export function patientFromStored(
  patient: ({ firstNames?: string; lastNames?: string; name?: string; rut?: string; birthDate?: string } | undefined),
  fallbackName: string,
  fallbackRut: string,
): PatientData {
  const legacyName = patient?.name?.trim() || fallbackName.trim();
  const hasSplitNameFields = Boolean(patient && ("firstNames" in patient || "lastNames" in patient));
  return {
    firstNames: hasSplitNameFields ? patient?.firstNames?.trim() ?? "" : legacyName,
    lastNames: patient?.lastNames?.trim() || "",
    rut: patient?.rut ?? fallbackRut,
    birthDate: patient?.birthDate ?? "",
  };
}
