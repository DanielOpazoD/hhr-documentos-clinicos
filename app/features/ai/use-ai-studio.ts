"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchAiProviders, importWithAi, saveAiDraft } from "./client";
import { fetchPromptProfiles } from "./prompt-client";
import { defaultClinicalSigner, FREEFORM_SCHEMA_TARGET, getTargetName } from "./targets";
import type { AiImportResult, AiPatient, AiProgress, AiPromptMode, AiProviderId, AiProviderInfo, AiSection, AiSigner, AiTargetId } from "./types";
import type { AiPromptProfile } from "./prompt-types";
import { AI_WORKFLOW_MEMORY_KEY, parseAiWorkflowMemory, serializeAiWorkflowMemory } from "./workflow-memory";

const AI_SELECTION_STORAGE_KEY = "hhr.ai-selection.v1";
type StoredAiSelection = { provider?: AiProviderId; model?: string };

const emptyResult: AiImportResult = {
  documentKind: "",
  sources: [],
  providerId: "openai",
  providerName: "",
  model: "",
  promptVersion: "",
  promptTrace: {
    mode: "profile",
    profileId: "",
    profileName: "",
    profileRevision: null,
    version: "",
    userInstructions: "",
    effectiveInstructions: "",
    generatedAt: "",
  },
  originalOutput: {
    documentKind: "",
    patient: { firstNames: "", lastNames: "", rut: "", birthDate: "" },
    signer: { name: "", rut: "", specialty: "" },
    sections: [],
    processingSummary: "",
    missingInformation: [],
    safetyNotice: "",
  },
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
  const [model, setModel] = useState("gpt-5-mini");
  const [providers, setProviders] = useState<AiProviderInfo[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [promptProfiles, setPromptProfiles] = useState<AiPromptProfile[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(true);
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [promptMode, setPromptMode] = useState<AiPromptMode>("profile");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [freePrompt, setFreePrompt] = useState("");
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
  const [draftContext, setDraftContext] = useState<{ target: AiTargetId; promptMode: AiPromptMode } | null>(null);
  const [workflowMemoryReady, setWorkflowMemoryReady] = useState(false);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      let saved: ReturnType<typeof parseAiWorkflowMemory> = null;
      try {
        saved = parseAiWorkflowMemory(window.localStorage.getItem(AI_WORKFLOW_MEMORY_KEY));
      } catch {
        // Algunos navegadores bloquean el almacenamiento local; el flujo sigue con valores seguros.
      }
      if (saved) {
        setTarget(saved.target);
        setPromptMode(saved.promptMode);
        setSelectedPromptId(saved.selectedPromptId);
      }
      setWorkflowMemoryReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void fetchAiProviders()
      .then((availableProviders) => {
        if (!active) return;
        setProviders(availableProviders);
        let saved: StoredAiSelection | null = null;
        try {
          saved = JSON.parse(window.localStorage.getItem(AI_SELECTION_STORAGE_KEY) ?? "null") as StoredAiSelection | null;
        } catch {
          saved = null;
        }
        const selected = availableProviders.find((item) => item.id === saved?.provider && item.available)
          ?? availableProviders.find((item) => item.id === "openai" && item.available)
          ?? availableProviders.find((item) => item.available);
        if (selected) {
          setProvider(selected.id);
          const savedModel = saved?.model;
          setModel(savedModel && selected.models.some((item) => item.id === savedModel) ? savedModel : selected.model);
        }
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
    const refreshPrompts = () => void fetchPromptProfiles()
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
    refreshPrompts();
    window.addEventListener("hhr:ai-prompts-changed", refreshPrompts);
    return () => {
      active = false;
      window.removeEventListener("hhr:ai-prompts-changed", refreshPrompts);
    };
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
    if (providersLoading || !selectedProvider?.models.some((item) => item.id === model)) return;
    try {
      window.localStorage.setItem(AI_SELECTION_STORAGE_KEY, JSON.stringify({ provider, model }));
    } catch {
      // Device preferences are optional; the server-side default remains available.
    }
  }, [model, provider, providersLoading, selectedProvider]);

  useEffect(() => {
    if (!workflowMemoryReady) return;
    try {
      window.localStorage.setItem(AI_WORKFLOW_MEMORY_KEY, serializeAiWorkflowMemory({
        promptMode,
        target,
        selectedPromptId: resolvedPromptId,
      }));
    } catch {
      // La memoria del flujo es opcional y nunca contiene archivos, prompts ni datos clínicos.
    }
  }, [promptMode, resolvedPromptId, target, workflowMemoryReady]);

  useEffect(() => {
    if (!processing) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [processing]);

  async function analyze() {
    if (!files.length || !processingAuthorized) return;
    const generationTarget: AiTargetId = promptMode === "free" ? FREEFORM_SCHEMA_TARGET : target;
    const userInstructions = promptMode === "free" ? freePrompt : additionalInstructions;
    setElapsedSeconds(0);
    setProcessing(true);
    setProgress({ stage: "preparing", label: "Preparando archivos", detail: "Validando formatos y tamaños" });
    setError(null);
    setCreatedId(null);
    try {
      const nextResult = await importWithAi({
        files,
        target: generationTarget,
        provider,
        model,
        promptId: promptMode === "free" ? "" : resolvedPromptId,
        promptMode,
        userInstructions,
        processingAuthorized,
      }, setProgress);
      setResult({
        ...nextResult,
        signer: generationTarget === "traslado_salvador" ? defaultClinicalSigner : {
          name: nextResult.signer.name || defaultClinicalSigner.name,
          rut: nextResult.signer.rut || defaultClinicalSigner.rut,
          specialty: nextResult.signer.specialty || defaultClinicalSigner.specialty,
        },
      });
      setDraftContext({ target: generationTarget, promptMode });
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
      const savedTarget = draftContext?.target ?? target;
      const savedPromptMode = draftContext?.promptMode ?? promptMode;
      const title = savedPromptMode === "free"
        ? result.documentKind.trim() || "Documento con IA"
        : getTargetName(savedTarget);
      setCreatedId(await saveAiDraft(result, savedTarget, title, savedPromptMode, createdId ?? undefined));
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
        itemIndex === index ? { ...section, title, evidenceStale: true } : section,
      ),
    }));
    setDraftHasChanges(true);
  }

  function updatePatient(field: keyof AiPatient, value: string) {
    setResult((current) => {
      const patient = { ...current.patient, [field]: value };
      const fullName = [patient.firstNames, patient.lastNames].filter(Boolean).join(" ").trim();
      return {
        ...current,
        patient,
        sections: draftContext?.target === "traslado_salvador" ? current.sections.map((section) => {
          if (section.key === "full_name") return { ...section, text: fullName || "No consignado", evidenceStale: true };
          if (section.key === "rut") return { ...section, text: patient.rut.trim() || "No consignado", evidenceStale: true };
          return section;
        }) : current.sections,
      };
    });
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
    setDraftContext(null);
    setError(null);
    setProgress(null);
    setIdentityConfirmed(false);
  }

  function selectProvider(nextProvider: AiProviderId) {
    setProvider(nextProvider);
    const providerInfo = providers.find((item) => item.id === nextProvider);
    if (providerInfo) setModel(providerInfo.model);
  }

  return {
    files,
    addFiles,
    removeFile,
    target,
    setTarget,
    provider,
    setProvider: selectProvider,
    model,
    setModel,
    providers,
    providersLoading,
    promptProfiles,
    promptsLoading,
    selectedPromptId: resolvedPromptId,
    setSelectedPromptId,
    promptMode,
    setPromptMode,
    additionalInstructions,
    setAdditionalInstructions,
    freePrompt,
    setFreePrompt,
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
    draftTarget: draftContext?.target ?? target,
    draftPromptMode: draftContext?.promptMode ?? promptMode,
    draftTitle: draftContext?.promptMode === "free"
      ? result.documentKind.trim() || "Documento con IA"
      : getTargetName(draftContext?.target ?? target),
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
