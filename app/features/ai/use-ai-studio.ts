"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchAiProviders, importWithAi, saveAiDraft } from "./client";
import { fetchPromptProfiles } from "./prompt-client";
import { defaultClinicalSigner, getTargetName } from "./targets";
import type { AiImportResult, AiPatient, AiProgress, AiProviderId, AiProviderInfo, AiSection, AiSigner, AiTargetId } from "./types";
import type { AiPromptProfile } from "./prompt-types";

const emptyResult: AiImportResult = {
  sources: [],
  providerId: "openai",
  providerName: "",
  model: "",
  promptVersion: "",
  sections: [],
  patient: { firstNames: "", lastNames: "", rut: "", birthDate: "" },
  signer: { name: "", rut: "", specialty: "" },
  processingSummary: "",
  missingInformation: [],
  safetyNotice: "",
};

export function useAiStudio() {
  const [files, setFiles] = useState<File[]>([]);
  const [target, setTarget] = useState<AiTargetId>("epicrisis");
  const [provider, setProvider] = useState<AiProviderId>("openai");
  const [providers, setProviders] = useState<AiProviderInfo[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [promptProfiles, setPromptProfiles] = useState<AiPromptProfile[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(true);
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [processingAuthorized, setProcessingAuthorized] = useState(false);
  const [result, setResult] = useState<AiImportResult>(emptyResult);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<AiProgress | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [draftHasChanges, setDraftHasChanges] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchAiProviders()
      .then((availableProviders) => {
        if (!active) return;
        setProviders(availableProviders);
        setProvider((currentProvider) => {
          const current = availableProviders.find((item) => item.id === currentProvider);
          return current?.available
            ? currentProvider
            : availableProviders.find((item) => item.available)?.id ?? currentProvider;
        });
      })
      .catch(() => {
        if (active) setError("No se pudo consultar la disponibilidad de los modelos.");
      })
      .finally(() => {
        if (active) setProvidersLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void fetchPromptProfiles()
      .then((profiles) => {
        if (!active) return;
        setPromptProfiles(profiles);
      })
      .catch(() => {
        if (active) setError("No se pudieron consultar los prompts de documentos.");
      })
      .finally(() => {
        if (active) setPromptsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const resolvedPromptId = useMemo(() => {
    const current = promptProfiles.find((item) => item.id === selectedPromptId && item.target === target);
    if (current) return current.id;
    return promptProfiles.find((item) => item.target === target && item.isDefault)?.id
      ?? promptProfiles.find((item) => item.target === target)?.id
      ?? "";
  }, [promptProfiles, selectedPromptId, target]);

  const selectedProvider = useMemo(
    () => providers.find((item) => item.id === provider),
    [provider, providers],
  );

  useEffect(() => {
    if (!processing) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [processing]);

  async function analyze() {
    if (!files.length || !processingAuthorized) return;
    setElapsedSeconds(0);
    setProcessing(true);
    setProgress({ stage: "preparing", label: "Preparando archivos", detail: "Validando formatos y tamaños" });
    setError(null);
    setCreatedId(null);
    try {
      const nextResult = await importWithAi(files, target, provider, resolvedPromptId, processingAuthorized, setProgress);
      setResult({
        ...nextResult,
        signer: target === "traslado_salvador" ? defaultClinicalSigner : {
          name: nextResult.signer.name || defaultClinicalSigner.name,
          rut: nextResult.signer.rut || defaultClinicalSigner.rut,
          specialty: nextResult.signer.specialty || defaultClinicalSigner.specialty,
        },
      });
      setIdentityConfirmed(false);
      setDraftHasChanges(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo conectar con el servicio de IA.");
    } finally {
      setProcessing(false);
    }
  }

  async function createDraft() {
    if (!identityConfirmed) {
      setError("Revise y confirme los datos de identidad antes de guardar.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      setCreatedId(await saveAiDraft(result, target, getTargetName(target), createdId ?? undefined));
      setDraftHasChanges(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el borrador.");
    } finally {
      setSaving(false);
    }
  }

  function updateSection(index: number, text: string) {
    setResult((current) => ({
      ...current,
      sections: current.sections.map((section, itemIndex) =>
        itemIndex === index ? { ...section, text, evidenceStale: true } : section,
      ),
    }));
    setDraftHasChanges(true);
  }

  function updateSectionTitle(index: number, title: string) {
    setResult((current) => ({
      ...current,
      sections: current.sections.map((section, itemIndex) =>
        itemIndex === index ? { ...section, title } : section,
      ),
    }));
    setDraftHasChanges(true);
  }

  function updatePatient(field: keyof AiPatient, value: string) {
    setResult((current) => ({ ...current, patient: { ...current.patient, [field]: value } }));
    setIdentityConfirmed(false);
    setDraftHasChanges(true);
  }

  function updateSigner(field: keyof AiSigner, value: string) {
    setResult((current) => ({ ...current, signer: { ...current.signer, [field]: value } }));
    setIdentityConfirmed(false);
    setDraftHasChanges(true);
  }

  function addFiles(nextFiles: File[]) {
    const merged = [...files, ...nextFiles];
    if (merged.length > 8) {
      setError("Puede analizar hasta 8 archivos por vez. Quite uno antes de agregar más.");
      return;
    }
    setFiles(merged);
    setProcessingAuthorized(false);
    setIdentityConfirmed(false);
    setError(null);
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setProcessingAuthorized(false);
    setIdentityConfirmed(false);
    setError(null);
  }

  function reset() {
    setResult(emptyResult);
    setCreatedId(null);
    setDraftHasChanges(false);
    setError(null);
    setProgress(null);
    setIdentityConfirmed(false);
  }

  return {
    files,
    addFiles,
    removeFile,
    target,
    setTarget,
    provider,
    setProvider,
    providers,
    providersLoading,
    promptProfiles,
    promptsLoading,
    selectedPromptId: resolvedPromptId,
    setSelectedPromptId,
    selectedProvider,
    processingAuthorized,
    setProcessingAuthorized,
    result,
    processing,
    progress,
    elapsedSeconds,
    saving,
    identityConfirmed,
    setIdentityConfirmed,
    error,
    createdId,
    draftHasChanges,
    analyze,
    createDraft,
    updateSection,
    updateSectionTitle,
    updatePatient,
    updateSigner,
    reset,
  };
}

export type AiStudioController = ReturnType<typeof useAiStudio>;
export type { AiSection };
