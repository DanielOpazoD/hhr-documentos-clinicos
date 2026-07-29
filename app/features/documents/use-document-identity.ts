"use client";

import { useCallback, useState } from "react";
import { todayInRapaNui } from "./formatters";
import { patientFromStored } from "./identity";
import type { PatientData, SignerData, StoredContent } from "./types";

const emptyPatient: PatientData = { firstNames: "", lastNames: "", rut: "", birthDate: "" };
const emptySigner: SignerData = { name: "", rut: "", specialty: "" };

export function useDocumentIdentity(markDirty: () => void) {
  const [patient, setPatient] = useState<PatientData>({ ...emptyPatient });
  const [signer, setSigner] = useState<SignerData>({ ...emptySigner });
  const [issueDate, setIssueDate] = useState(todayInRapaNui());
  const [legacyInsurance, setLegacyInsurance] = useState("");

  const updatePatient = useCallback((field: keyof PatientData, value: string) => {
    setPatient((current) => ({ ...current, [field]: value }));
    markDirty();
  }, [markDirty]);

  const updatePatientName = useCallback((value: string) => {
    setPatient((current) => ({ ...current, firstNames: value, lastNames: "" }));
    markDirty();
  }, [markDirty]);

  const updateSigner = useCallback((field: keyof SignerData, value: string) => {
    setSigner((current) => ({ ...current, [field]: value }));
    markDirty();
  }, [markDirty]);

  const loadSignerProfile = useCallback((profile: SignerData) => {
    setSigner({ ...profile });
  }, []);

  const updateIssueDate = useCallback((value: string) => {
    setIssueDate(value);
    markDirty();
  }, [markDirty]);

  const resetIdentity = useCallback(() => {
    setPatient({ ...emptyPatient });
    setSigner({ ...emptySigner });
    setIssueDate(todayInRapaNui());
    setLegacyInsurance("");
  }, []);

  const loadIdentity = useCallback((
    content: StoredContent | undefined,
    fallbackName: string,
    fallbackRut: string,
  ) => {
    setPatient(patientFromStored(content?.patient, fallbackName, fallbackRut));
    setLegacyInsurance(content?.patient?.insurance ?? "");
    setSigner({
      name: content?.signature?.professionalName ?? content?.signer?.name ?? "",
      rut: content?.signature?.professionalRut ?? content?.signer?.rut ?? "",
      specialty: content?.signature?.specialty ?? content?.signer?.specialty ?? "",
    });
    setIssueDate(content?.issueDate ?? todayInRapaNui());
  }, []);

  return {
    patient,
    legacyInsurance,
    signer,
    issueDate,
    updatePatient,
    updatePatientName,
    updateSigner,
    loadSignerProfile,
    updateIssueDate,
    resetIdentity,
    loadIdentity,
  };
}
