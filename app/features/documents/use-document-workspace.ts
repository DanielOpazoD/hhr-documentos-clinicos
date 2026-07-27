"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DocumentStatus } from "@/app/lib/catalog";
import { getDocument, listDocuments, removeStoredDocument } from "./api";
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
import { downloadDocumentPdf } from "./document-pdf";
import { applySignatureProfile } from "./signature-profile";
import { clampSignatureY } from "@/app/lib/document-layout";
import { useDocumentPersistence } from "./use-document-persistence";

export function useDocumentWorkspace() {
  const defaultTemplate = getTemplate(DEFAULT_TEMPLATE_ID);
  const [templateId, setTemplateId] = useState<string>(defaultTemplate.id);
  const [documentTitle, setDocumentTitle] = useState<string>(defaultTemplate.name);
  const [sections, setSections] = useState<DocumentSection[]>(createSections(defaultTemplate.id));
  const [status, setStatus] = useState<DocumentStatus>("Borrador");
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [version, setVersion] = useState(1);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [storedDocuments, setStoredDocuments] = useState<StoredDocument[]>([]);
  const [recentQuery, setRecentQuery] = useState("");
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [aiMetadata, setAiMetadata] = useState<StoredAiMetadata | null>(null);
  const editRevision = useRef(0);
  const dirtyRef = useRef(false);
  const workspaceEpoch = useRef(0);
  const defaultProfileApplied = useRef(false);

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
  const markSignatureDirty = useCallback(() => {
    defaultProfileApplied.current = true;
    markDirty();
  }, [markDirty]);

  const identityWorkspace = useDocumentIdentity(markDirty);
  const { issueDate, legacyInsurance, loadIdentity, loadSignerProfile, patient, resetIdentity, signer, updateSigner: updateIdentitySigner } = identityWorkspace;
  const signatureWorkspace = useSignatureWorkspace(markSignatureDirty);
  const { placedSignature, setPlacedSignature, signatures } = signatureWorkspace;
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
        setLoadError(error instanceof Error ? error.message : "No se pudieron cargar los documentos.");
      }
    }
  }, [setLoadError, setStoredDocuments]);

  const persistenceSnapshot = useMemo(() => ({
    aiMetadata,
    documentId,
    issueDate,
    legacyInsurance,
    patient,
    placedSignature,
    sections,
    signer,
    status,
    templateId,
    visibleTitle,
  }), [aiMetadata, documentId, issueDate, legacyInsurance, patient, placedSignature, sections, signer, status, templateId, visibleTitle]);
  const { flushPendingSave, persist, saving } = useDocumentPersistence({
    dirty,
    snapshot: persistenceSnapshot,
    dirtyRef,
    editRevision,
    workspaceEpoch,
    refreshDocuments,
    setDirty,
    setDocumentId,
    setSavedAt,
    setSaveError,
    setStatus,
    setVersion,
  });

  const openDocument = useCallback(async (id: string) => {
    if (!(await flushPendingSave())) return;
    const requestEpoch = workspaceEpoch.current + 1;
    workspaceEpoch.current = requestEpoch;
    defaultProfileApplied.current = true;
    setLoadError(null);
    try {
      const stored = await getDocument(id);
      if (workspaceEpoch.current !== requestEpoch) return;
      const nextTemplateId = normalizeTemplateId(stored.templateId);
      const storedSections = (stored.content?.sections ?? []).map((section, index) => ({
        id: section.id ?? `section-${index + 1}`,
        title: section.title ?? `Sección ${index + 1}`,
        body: section.body ?? section.text ?? "",
      }));
      const nextSections = normalizeSections(nextTemplateId, storedSections);
      const storedSignature = stored.content?.signature;
      setTemplateId(nextTemplateId);
      setDocumentTitle(stored.title);
      setSections(nextSections.length ? nextSections : createSections(nextTemplateId));
      loadIdentity(stored.content, stored.patientName, stored.patientRutMasked);
      setAiMetadata(normalizeAiMetadata(stored.content?.ai, nextSections));
      setPlacedSignature(storedSignature
        ? { ...storedSignature, y: clampSignatureY(storedSignature.y), isDefault: false, imageUrl: `/api/signatures/${storedSignature.id}` }
        : null);
      setStatus(stored.status);
      setDocumentId(stored.id);
      setVersion(stored.version);
      setSavedAt(formatSavedTime(new Date(stored.updatedAt)));
      dirtyRef.current = false;
      setDirty(false);
      setNewMenuOpen(false);
      window.history.replaceState({}, "", `/documentos?document=${encodeURIComponent(stored.id)}`);
    } catch (error) {
      if (workspaceEpoch.current === requestEpoch) {
        setLoadError(error instanceof Error ? error.message : "No se pudo abrir el documento.");
      }
    }
  }, [
    flushPendingSave,
    setDirty,
    setDocumentId,
    setDocumentTitle,
    loadIdentity,
    setAiMetadata,
    setLoadError,
    setNewMenuOpen,
    setPlacedSignature,
    setSavedAt,
    setSections,
    setStatus,
    setTemplateId,
    setVersion,
  ]);

  const createDocument = useCallback(async (nextTemplateId: string) => {
    if (!(await flushPendingSave())) return;
    workspaceEpoch.current += 1;
    const nextTemplate = getTemplate(nextTemplateId);
    setTemplateId(nextTemplate.id);
    setDocumentTitle(nextTemplate.name);
    setSections(createSections(nextTemplate.id));
    resetIdentity();
    setAiMetadata(null);
    defaultProfileApplied.current = false;
    const defaultProfile = signatures.find((signature) => signature.isDefault);
    if (defaultProfile) {
      applySignatureProfile(defaultProfile, loadSignerProfile, setPlacedSignature);
      defaultProfileApplied.current = true;
    } else {
      setPlacedSignature(null);
    }
    setStatus("Borrador");
    setDocumentId(null);
    setVersion(1);
    setSavedAt(null);
    setSaveError(null);
    dirtyRef.current = false;
    setDirty(false);
    setNewMenuOpen(false);
    window.history.replaceState({}, "", "/documentos");
  }, [
    flushPendingSave,
    setDirty,
    setDocumentId,
    setDocumentTitle,
    setAiMetadata,
    loadSignerProfile,
    setNewMenuOpen,
    resetIdentity,
    setPlacedSignature,
    setSavedAt,
    setSaveError,
    setSections,
    setStatus,
    setTemplateId,
    setVersion,
    signatures,
  ]);

  const deleteDocument = useCallback(async (id: string) => {
    if (!(await flushPendingSave())) return;
    setDeletingDocumentId(id);
    setLoadError(null);
    try {
      await removeStoredDocument(id);
      if (documentId === id) await createDocument(DEFAULT_TEMPLATE_ID);
      await refreshDocuments();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "No se pudo eliminar el documento.");
    } finally {
      setDeletingDocumentId(null);
    }
  }, [createDocument, documentId, flushPendingSave, refreshDocuments]);

  const updateSection = useCallback((id: string, body: string) => {
    setSections((current) => current.map((section) =>
      section.id === id ? { ...section, body } : section,
    ));
    setAiMetadata((current) => current ? {
      ...current,
      editedSectionIds: [...new Set([...(current.editedSectionIds ?? []), id])],
    } : current);
    markDirty();
  }, [markDirty, setAiMetadata, setSections]);

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

  const downloadPdf = useCallback(async () => {
    await downloadDocumentPdf({ issueDate, patient, placedSignature, sections, signer, templateId, visibleTitle });
  }, [issueDate, patient, placedSignature, sections, signer, templateId, visibleTitle]);

  useEffect(() => {
    if (defaultProfileApplied.current || documentId || placedSignature) return;
    if (new URLSearchParams(window.location.search).has("document")) return;
    const profile = signatures.find((signature) => signature.isDefault);
    if (!profile) return;
    defaultProfileApplied.current = true;
    if (dirty) editRevision.current += 1;
    applySignatureProfile(profile, loadSignerProfile, setPlacedSignature);
  }, [dirty, documentId, loadSignerProfile, placedSignature, setPlacedSignature, signatures]);

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
    template,
    templateId,
    documentTitle,
    setDocumentTitle,
    visibleTitle,
    aiMetadata,
    ...identityWorkspace,
    updateSigner,
    sections,
    status,
    documentId,
    version,
    savedAt,
    saving,
    dirty,
    storedDocuments,
    filteredDocuments,
    recentQuery,
    setRecentQuery,
    newMenuOpen,
    setNewMenuOpen,
    mobileView,
    setMobileView,
    loadError,
    saveError,
    deletingDocumentId,
    ...signatureWorkspace,
    markDirty,
    markSignatureDirty,
    persist,
    openDocument,
    createDocument,
    deleteDocument,
    updateSection,
    moveSection,
    downloadPdf,
  };
}

export type DocumentWorkspace = ReturnType<typeof useDocumentWorkspace>;
