export type HospitalSalvadorFieldKey =
  | "full_name"
  | "rut"
  | "age"
  | "request_date"
  | "fonasa"
  | "address"
  | "occupation"
  | "auge"
  | "support_network"
  | "current_history"
  | "physical_exam"
  | "remote_history"
  | "diagnostic_plan"
  | "test_results"
  | "treatment_evolution"
  | "diagnosis"
  | "diagnostic_basis"
  | "transfer_basis";

export type HospitalSalvadorField = {
  readonly key: HospitalSalvadorFieldKey;
  readonly label: string;
  readonly group: "personal" | "clinical";
  readonly compact: boolean;
};

export const hospitalSalvadorTemplateUrl: string;
export const hospitalSalvadorMissingValue: "-";
export const hospitalSalvadorFields: readonly HospitalSalvadorField[];
export const hospitalSalvadorFieldKeys: readonly HospitalSalvadorFieldKey[];
export function isHospitalSalvadorFieldKey(value: string): value is HospitalSalvadorFieldKey;
