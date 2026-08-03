"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DocumentStatus } from "@/app/lib/catalog";
import { getDocument, listDocuments, removeStoredDocuments } from "./api";
import { formatSavedTime } from "./formatters";
import {
  createSections,
  DEFAULT_TEMPLATE_ID,
  getTemplate,
  normalizeSections,
  normalizeTemplateId,
} from "./templates";
import type { DocumentSection, StoredAiMetadata, StoredDocument } from "./types";
import { useSignatureWorkspace } from "./use-signature-workspace";
import { useDocumentIdentity } from "./use-document-identity";
import { normalizeAiMetadata } from "./ai-metadata";
import { applySignatureProfile } from "./signature-profile";
import { clampSignatureY, clampSigningImageWidth, defaultImagePlacement, normalizeStoredSignatureY } from "@/app/lib/document-layout";
import { useDocumentPersistence, type DocumentSaveFailure } from "./use-document-persistence";
import { useDocumentHistory } from "./use-document-history";
import { useDocumentTypography } from "./use-document-typography";
import { sectionsFromTemplateSetting, templateSettingFor } from "./template-settings";
import { useTemplateSettings } from "./use-template-settings";
import { toOperationFailure, type OperationFailure } from "@/app/lib/client/operation-feedback";
export function useDocumentWorkspace() {
  const defaultTemplate = getTemplate(DEFAULT_TEMPLATE_ID);
  const [templateId, setTemplateId] = useState<string>(defaultTemplate.id);
  const [documentTitle, setDocumentTitle] = useState<string>(defaultTemplate.name);
  const [sections, setSections] = useState<DocumentSection[]>(createSections(defaultTemplate.id));
  const [status, setStatus] = useState<DocumentStatus>("Borrador");
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [documentUpdatedAt, setDocumentUpdatedAt] = useState<string | null>(null);
  const [version, setVersion] = useState(1);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [storedDocuments, setStoredDocuments] = useState<StoredDocument[]>([]);
  const [recentQuery, setRecentQuery] = useState("");
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [loadError, setLoadError] = useState<OperationFailure | null>(null);
  const [saveError, setSaveError] = useState<DocumentSaveFailure | null>(null);
  const [deletingDocumentIds, setDeletingDocumentIds] = useState<Set<string>>(() => new Set());
  const [aiMetadata, setAiMetadata] = useState<StoredAiMetadata | null>(null);
  const editRevision = useRef(0);
  const dirtyRef = useRef(false);
  const openedDocumentRef = useRef(false);
  const workspaceEpoch = useRef(0);
  const defaultProfileApplied = useRef(false);
  const documentUpdatedAtRef = useRef<string | null>(null);
  const setDocumentRevision = useCallback((value: string | null) => {
    documentUpdatedAtRef.current = value;
    setDocumentUpdatedAt(value);
  }, []);
  const template = getTemplate(templateId);
  const visibleTitle = documentTitle.trim() || template.name;
  const filteredDocuments = useMemo(() => {
    const query = recentQuery.trim().toLocaleLowerCase("es-CL");
    if (!query) return storedDocuments;
    return storedDocuments.filter((item) =>
      `${item.title} ${item.patientName}`.toLocaleLowerCase("es-CL").includes(query),
    );
  }, [recentQuery, storedDocuments]);

  const markDirty = useCallback(() => {
    editRevision.current += 1;
    dirtyRef.current = true;
    setDirty(true);
    setSaveError(null);
    setStatus((current) => current === "Borrador" ? current : "Borrador");
  }, [setDirty, setSaveError, setStatus]);
  const hasUnsavedChanges = useCallback(() => dirtyRef.current, []);
  const markSignatureDirty = useCallback(() => {
    defaultProfileApplied.current = true;
    markDirty();
  }, [markDirty]);
  const templateWorkspace = useTemplateSettings({
    documentId, markDirty, openedDocumentRef, setDocumentTitle, setSections, templateId, workspaceEpoch,
  });
  const { templateSettings } = templateWorkspace;

  const identityWorkspace = useDocumentIdentity(markDirty);
  const { issueDate, legacyInsurance, loadIdentity, loadSignerProfile, patient, resetIdentity, signer, updateSigner: updateIdentitySigner } = identityWorkspace;
  const signatureWorkspace = useSignatureWorkspace(markSignatureDirty);
  const { placedSignature, setPlacedSignature, placedStamp, setPlacedStamp, signatures } = signatureWorkspace;
  const typographyWorkspace = useDocumentTypography();
  const updateSigner = useCallback((field: keyof typeof signer, value: string) => {
    defaultProfileApplied.current = true;
    if (placedSignature) setPlacedSignature(null);
    updateIdentitySigner(field, value);
  }, [placedSignature, setPlacedSignature, updateIdentitySigner]);

  const refreshDocuments = useCallback(async (signal?: AbortSignal) => {
    try {
      setStoredDocuments(await listDocuments(signal));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setLoadError(toOperationFailure(error, "No se pudieron cargar los documentos."));
      }
    }
  }, [setLoadError, setStoredDocuments]);

  const persistenceSnapshot = useMemo(() => ({
    aiMetadata,
    documentId,
    documentUpdatedAt,
    issueDate,
    legacyInsurance,
    patient,
    placedSignature,
    placedStamp,
    sections,
    signer,
    status,
    templateId,
    visibleTitle,
  }), [aiMetadata, documentId, documentUpdatedAt, issueDate, legacyInsurance, patient, placedSignature, placedStamp, sections, signer, status, templateId, visibleTitle]);
  const { flushPendingSave, persist, saving } = useDocumentPersistence({
    dirty,
    snapshot: persistenceSnapshot,
    dirtyRef,
    editRevision,
    workspaceEpoch,
    refreshDocuments,
    setDirty,
    setDocumentId,
    setDocumentUpdatedAt: setDocumentRevision,
    setSavedAt,
    setSaveError,
    setStatus,
    setVersion,
  });

  const openDocument = useCallback(async (id: string) => {
    if (!(await flushPendingSave())) return false;
    const requestEpoch = workspaceEpoch.current + 1;
    workspaceEpoch.current = requestEpoch;
    defaultProfileApplied.current = true;
    setLoadError(null);
    try {
      const stored = await getDocument(id);
      if (workspaceEpoch.current !== requestEpoch) return false;
      const nextTemplateId = normalizeTemplateId(stored.templateId);
      const storedSections = (stored.content?.sections ?? []).map((section, index) => ({
        id: section.id ?? `section-${index + 1}`,
        title: section.title ?? `Sección ${index + 1}`,
        body: section.body ?? section.text ?? "",
      }));
      const nextSections = normalizeSections(nextTemplateId, storedSections);
      const storedSignature = stored.content?.signature;
      const storedStamp = stored.content?.stamp;
      const signatureY = storedSignature
        ? normalizeStoredSignatureY(storedSignature.kind, storedSignature.y)
        : defaultImagePlacement("signature").y;
      openedDocumentRef.current = true;
      setTemplateId(nextTemplateId);
      setDocumentTitle(stored.title);
      setSections(nextSections.length ? nextSections : createSections(nextTemplateId));
      loadIdentity(stored.content, stored.patientName, stored.patientRutMasked);
      setAiMetadata(normalizeAiMetadata(stored.content?.ai, nextSections));
      setPlacedSignature(storedSignature
        ? { ...storedSignature, name: storedSignature.name ?? `Firma de ${storedSignature.professionalName}`, kind: "signature", y: signatureY, width: clampSigningImageWidth(storedSignature.width), isDefault: false, imageUrl: `/api/signatures/${storedSignature.id}` }
        : null);
      setPlacedStamp(storedStamp
        ? { ...storedStamp, name: storedStamp.name ?? `Timbre de ${storedStamp.professionalName}`, kind: "stamp", y: clampSignatureY(storedStamp.y), width: clampSigningImageWidth(storedStamp.width), isDefault: false, imageUrl: `/api/signatures/${storedStamp.id}` }
        : null);
      setStatus(stored.status);
      setDocumentId(stored.id);
      setDocumentRevision(stored.updatedAt);
      setVersion(stored.version);
      setSavedAt(formatSavedTime(new Date(stored.updatedAt)));
      dirtyRef.current = false;
      setDirty(false);
      setNewMenuOpen(false);
      window.history.replaceState({}, "", `/documentos?document=${encodeURIComponent(stored.id)}`);
      return true;
    } catch (error) {
      if (workspaceEpoch.current === requestEpoch) {
        setLoadError(toOperationFailure(error, "No se pudo abrir el documento."));
      }
      return false;
    }
  }, [
    flushPendingSave, loadIdentity, setAiMetadata, setDirty, setDocumentId,
    setDocumentRevision, setDocumentTitle, setLoadError, setNewMenuOpen,
    setPlacedSignature, setPlacedStamp, setSavedAt, setSections, setStatus, setTemplateId, setVersion,
  ]);
  const historyWorkspace = useDocumentHistory({
    documentId,
    documentUpdatedAtRef,
    flushPendingSave,
    openDocument,
  });
  const { setHistoryOpen } = historyWorkspace;

  const reloadDocument = useCallback(async () => {
    if (!documentId) return;
    dirtyRef.current = false;
    setDirty(false);
    setSaveError(null);
    await openDocument(documentId);
  }, [documentId, openDocument]);

  const createDocument = useCallback(async (nextTemplateId: string) => {
    if (!(await flushPendingSave())) return;
    workspaceEpoch.current += 1;
    openedDocumentRef.current = false;
    const nextTemplate = getTemplate(nextTemplateId);
    const nextSetting = templateSettingFor(templateSettings, nextTemplate.id);
    setTemplateId(nextTemplate.id);
    setDocumentTitle(nextSetting.title);
    setSections(sectionsFromTemplateSetting(nextSetting));
    resetIdentity();
    setAiMetadata(null);
    defaultProfileApplied.current = false;
    const defaultProfile = signatures.find((asset) => asset.kind === "signature" && asset.isDefault);
    const defaultStamp = signatures.find((asset) => asset.kind === "stamp" && asset.isDefault);
    if (defaultProfile) {
      applySignatureProfile(defaultProfile, loadSignerProfile, setPlacedSignature);
    } else {
      setPlacedSignature(null);
    }
    setPlacedStamp(defaultStamp ? { ...defaultStamp, ...defaultImagePlacement("stamp") } : null);
    defaultProfileApplied.current = Boolean(defaultProfile || defaultStamp);
    setStatus("Borrador");
    setDocumentId(null);
    setDocumentRevision(null);
    setVersion(1);
    setSavedAt(null);
    setSaveError(null);
    dirtyRef.current = false;
    setDirty(false);
    setNewMenuOpen(false);
    setHistoryOpen(false);
    window.history.replaceState({}, "", "/documentos");
  }, [
    flushPendingSave, loadSignerProfile, resetIdentity, setAiMetadata, setDirty,
    setDocumentId, setDocumentRevision, setDocumentTitle, setHistoryOpen,
    setNewMenuOpen, setPlacedSignature, setPlacedStamp, setSavedAt, setSaveError, setSections,
    setStatus, setTemplateId, setVersion, signatures, templateSettings,
  ]);

  const deleteDocuments = useCallback(async (requestedIds: string[]) => {
    const ids = [...new Set(requestedIds)].filter(Boolean);
    if (!ids.length) return false;
    if (!(await flushPendingSave())) return false;
    setDeletingDocumentIds(new Set(ids));
    setLoadError(null);
    try {
      const deletedIds = await removeStoredDocuments(ids);
      if (documentId && deletedIds.includes(documentId)) await createDocument(DEFAULT_TEMPLATE_ID);
      await refreshDocuments();
      return true;
    } catch (error) {
      setLoadError(toOperationFailure(error, "No se pudieron eliminar los documentos."));
      return false;
    } finally {
      setDeletingDocumentIds(new Set());
    }
  }, [createDocument, documentId, flushPendingSave, refreshDocuments]);

  const deleteDocument = useCallback((id: string) => deleteDocuments([id]), [deleteDocuments]);
  const dismissLoadError = useCallback(() => setLoadError(null), []);
  const retryLoad = useCallback(async () => {
    setLoadError(null);
    const requested = new URLSearchParams(window.location.search).get("document");
    if (requested) return openDocument(requested);
    await refreshDocuments();
    return true;
  }, [openDocument, refreshDocuments]);
  const updateSection = useCallback((id: string, patch: Partial<Pick<DocumentSection, "title" | "body">>) => {
    setSections((current) => current.map((section) =>
      section.id === id ? { ...section, ...patch } : section,
    ));
    setAiMetadata((current) => current ? {
      ...current,
      editedSectionIds: [...new Set([...(current.editedSectionIds ?? []), id])],
    } : current);
    markDirty();
  }, [markDirty, setAiMetadata, setSections]);

  const addSection = useCallback(() => {
    setSections((current) => [...current, {
      id: crypto.randomUUID(),
      title: "Nueva sección",
      body: "",
    }]);
    markDirty();
  }, [markDirty]);

  const removeSection = useCallback((id: string) => {
    setSections((current) => current.filter((section) => section.id !== id));
    setAiMetadata((current) => current ? {
      ...current,
      editedSectionIds: [...new Set([...(current.editedSectionIds ?? []), id])],
    } : current);
    markDirty();
  }, [markDirty]);

  const moveSection = useCallback((index: number, direction: -1 | 1) => {
    setSections((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    markDirty();
  }, [markDirty, setSections]);

  useEffect(() => {
    if (defaultProfileApplied.current || documentId || placedSignature || placedStamp) return;
    if (new URLSearchParams(window.location.search).has("document")) return;
    const profile = signatures.find((asset) => asset.kind === "signature" && asset.isDefault);
    const stamp = signatures.find((asset) => asset.kind === "stamp" && asset.isDefault);
    if (!profile && !stamp) return;
    defaultProfileApplied.current = true;
    if (dirty) editRevision.current += 1;
    if (profile) applySignatureProfile(profile, loadSignerProfile, setPlacedSignature);
    if (stamp) setPlacedStamp({ ...stamp, ...defaultImagePlacement("stamp") });
  }, [dirty, documentId, loadSignerProfile, placedSignature, placedStamp, setPlacedSignature, setPlacedStamp, signatures]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const requested = new URLSearchParams(window.location.search).get("document");
      void refreshDocuments(controller.signal);
      if (requested) void openDocument(requested);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [openDocument, refreshDocuments]);
  return {
    template, templateId, documentTitle, setDocumentTitle, visibleTitle, aiMetadata,
    ...templateWorkspace,
    ...identityWorkspace,
    updateSigner, sections, status, documentId, documentUpdatedAt, version, savedAt,
    saving, dirty, storedDocuments, filteredDocuments, recentQuery, setRecentQuery,
    newMenuOpen, setNewMenuOpen, loadError, saveError, dismissLoadError, retryLoad,
    deletingDocumentIds,
    ...historyWorkspace,
    ...signatureWorkspace,
    ...typographyWorkspace,
    markDirty, markSignatureDirty, hasUnsavedChanges, persist, openDocument, reloadDocument, createDocument, deleteDocument,
    deleteDocuments, addSection, removeSection, updateSection, moveSection,
  };
}

export type DocumentWorkspace = ReturnType<typeof useDocumentWorkspace>;
