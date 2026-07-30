import type { AiPromptMode } from "../types";

type DraftSectionLike = { title?: unknown; text?: unknown };
type StructuredPatientIdentity = {
  firstNames?: unknown;
  lastNames?: unknown;
  rut?: unknown;
  birthDate?: unknown;
};

const redundantIdentityTitles = new Set([
  "identificacion",
  "identificacion del paciente",
  "datos de identificacion",
  "datos del paciente",
  "datos personales",
  "paciente",
  "paciente identificado",
]);

function normalizedSectionTitle(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CL")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedComparableText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CL")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function identityValueVariants(patient: StructuredPatientIdentity): string[] {
  const values = [patient.firstNames, patient.lastNames, patient.rut]
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map(normalizedComparableText);
  if (typeof patient.birthDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(patient.birthDate)) {
    const [year, month, day] = patient.birthDate.split("-");
    values.push(normalizedComparableText(patient.birthDate), `${day} ${month} ${year}`);
  }
  return [...new Set(values)].sort((left, right) => right.length - left.length);
}

function isFullyRepresentedIdentitySection(section: DraftSectionLike, patient: StructuredPatientIdentity): boolean {
  if (
    typeof section.title !== "string"
    || !redundantIdentityTitles.has(normalizedSectionTitle(section.title))
    || typeof section.text !== "string"
  ) return false;
  const variants = identityValueVariants(patient);
  if (!variants.length) return false;
  let remaining = normalizedComparableText(section.text);
  let matchedValue = false;
  for (const value of variants) {
    if (!value || !remaining.includes(value)) continue;
    remaining = remaining.replaceAll(value, " ");
    matchedValue = true;
  }
  remaining = remaining
    .replace(/\b(?:fecha de nacimiento|nombre completo|datos de identificacion|identificacion del paciente)\b/g, " ")
    .replace(/\b(?:nombre|rut|nacimiento|paciente|identificacion)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return matchedValue && !remaining;
}

export function withoutRedundantIdentitySections<T extends DraftSectionLike>(
  sections: T[],
  patient: StructuredPatientIdentity,
): T[] {
  const filtered = sections.filter((section) => !isFullyRepresentedIdentitySection(section, patient));
  return filtered.length ? filtered : sections;
}

export function normalizedDocumentKind(
  value: string,
  mode: AiPromptMode | undefined,
): string {
  const humanized = value.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (mode !== "free") return humanized;
  const genericKind = /^(?:informe medico|documento libre|documento clinico|no determinado)$/i.test(humanized);
  const selected = genericKind ? "Documento clínico" : humanized;
  return selected ? `${selected.charAt(0).toLocaleUpperCase("es-CL")}${selected.slice(1)}` : "Documento clínico";
}
