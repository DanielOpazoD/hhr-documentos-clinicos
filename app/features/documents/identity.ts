import type { PatientData } from "./types";

export function patientFullName(patient: Pick<PatientData, "firstNames" | "lastNames" | "fullName">): string {
  if (patient.fullName !== undefined) return patient.fullName.trim();
  return [patient.firstNames.trim(), patient.lastNames.trim()].filter(Boolean).join(" ");
}

export function patientWithFullName(patient: PatientData, value: string): PatientData {
  return { ...patient, fullName: value };
}

export function patientFromStored(
  patient: ({ firstNames?: string; lastNames?: string; fullName?: string; name?: string; rut?: string; birthDate?: string } | undefined),
  fallbackName: string,
  fallbackRut: string,
): PatientData {
  const legacyName = patient?.name?.trim() || fallbackName.trim();
  const hasSplitNameFields = Boolean(patient && ("firstNames" in patient || "lastNames" in patient));
  const firstNames = hasSplitNameFields ? patient?.firstNames?.trim() ?? "" : legacyName;
  const lastNames = patient?.lastNames?.trim() || "";
  return {
    firstNames,
    lastNames,
    fullName: patient?.fullName ?? [firstNames, lastNames].filter(Boolean).join(" "),
    rut: patient?.rut ?? fallbackRut,
    birthDate: patient?.birthDate ?? "",
  };
}
