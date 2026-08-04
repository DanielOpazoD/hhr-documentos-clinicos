"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { DocumentStatus } from "@/app/lib/catalog";
import type { DocumentSection, PatientData, PlacedSignature, SignerData, StoredAiMetadata, StoredDocument } from "./types";
import { patientFullName } from "./identity";
import { saveDocument } from "./api";
import { formatSavedTime } from "./formatters";
import { isApiConflict } from "@/app/lib/client/http";
import {
  operationFailure,
  toOperationFailure,
  type OperationFailure,
} from "@/app/lib/client/operation-feedback";

type MutableValue<T> = { current: T };

export type DocumentSaveFailure = OperationFailure & {
  recovery: "reload" | "retry";
};

export type DocumentPersistenceSnapshot = {
  aiMetadata: StoredAiMetadata | null;
  documentId: string | null;
  documentUpdatedAt: string | null;
  issueDate: string;
  legacyInsurance: string;
  patient: PatientData;
  placedSignature: PlacedSignature | null;
  placedStamp: PlacedSignature | null;
  sections: DocumentSection[];
  signer: SignerData;
  status: DocumentStatus;
  templateId: string;
  visibleTitle: string;
};

export function useDocumentPersistence(options: {
  dirty: boolean;
  snapshot: DocumentPersistenceSnapshot;
  dirtyRef: MutableValue<boolean>;
  editRevision: MutableValue<number>;
  workspaceEpoch: MutableValue<number>;
  refreshDocuments: () => Promise<void>;
  setDirty: Dispatch<SetStateAction<boolean>>;
  setDocumentId: Dispatch<SetStateAction<string | null>>;
  setDocumentUpdatedAt: (value: string | null) => void;
  setSavedAt: Dispatch<SetStateAction<string | null>>;
  setStatus: Dispatch<SetStateAction<DocumentStatus>>;
  setVersion: Dispatch<SetStateAction<number>>;
  setSaveError: Dispatch<SetStateAction<DocumentSaveFailure | null>>;
}) {
  const [saving, setSaving] = useState(false);
  const [saveEpoch, setSaveEpoch] = useState(0);
  const optionsRef = useRef(options);
  const savePromise = useRef<Promise<boolean> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { optionsRef.current = options; }, [options]);

  const persist = useCallback((requestedStatus?: DocumentStatus): Promise<boolean> => {
    if (savePromise.current) return savePromise.current;
    const current = optionsRef.current;
    const snapshot = current.snapshot;
    const nextStatus = requestedStatus ?? snapshot.status;
    if (nextStatus !== "Borrador" && !patientFullName(snapshot.patient)) {
      current.setSaveError({
        ...operationFailure("Ingrese el nombre del paciente para guardar."),
        recovery: "retry",
      });
      return Promise.resolve(false);
    }
    const signature = storedPlacement(snapshot.placedSignature);
    const stamp = storedPlacement(snapshot.placedStamp);
    const revision = current.editRevision.current;
    const requestWorkspaceEpoch = current.workspaceEpoch.current;
    current.setSaveError(null);
    setSaving(true);
    const operation = (async () => {
      try {
        const saved = await saveDocument({
          id: snapshot.documentId ?? undefined,
          expectedUpdatedAt: snapshot.documentUpdatedAt ?? undefined,
          templateId: snapshot.templateId,
          title: snapshot.visibleTitle,
          patientName: patientFullName(snapshot.patient),
          patientRutMasked: snapshot.patient.rut.trim(),
          status: nextStatus,
          content: {
            sections: snapshot.sections,
            patient: { ...snapshot.patient, ...(snapshot.legacyInsurance ? { insurance: snapshot.legacyInsurance } : {}) },
            signer: snapshot.signer,
            issueDate: snapshot.issueDate,
            signature,
            stamp,
            ...(snapshot.aiMetadata ? { ai: snapshot.aiMetadata } : {}),
          },
        });
        if (current.workspaceEpoch.current !== requestWorkspaceEpoch) return true;
        applySavedDocument(saved, nextStatus, revision, current, setSaveEpoch);
        return true;
      } catch (error) {
        if (current.workspaceEpoch.current === requestWorkspaceEpoch) {
          current.setSaveError({
            ...toOperationFailure(error, "No se pudo guardar el documento."),
            recovery: isApiConflict(error) ? "reload" : "retry",
          });
        }
        return false;
      } finally {
        savePromise.current = null;
        setSaving(false);
      }
    })();
    savePromise.current = operation;
    return operation;
  }, []);

  const flushPendingSave = useCallback(async () => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (savePromise.current && !(await savePromise.current)) return false;
    if (!optionsRef.current.dirtyRef.current) return true;
    return persist("Borrador");
  }, [persist]);

  useEffect(() => {
    if (!options.dirty) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persist("Borrador"), 1200);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [options.dirty, persist, saveEpoch]);

  return { flushPendingSave, persist, saving };
}

function storedPlacement(asset: PlacedSignature | null) {
  return asset ? {
    id: asset.id,
    kind: asset.kind,
    name: asset.name,
    professionalName: asset.professionalName,
    professionalRut: asset.professionalRut,
    specialty: asset.specialty,
    x: asset.x,
    y: asset.y,
    width: asset.width,
  } : undefined;
}

function applySavedDocument(
  saved: StoredDocument,
  nextStatus: DocumentStatus,
  revision: number,
  options: Parameters<typeof useDocumentPersistence>[0],
  setSaveEpoch: Dispatch<SetStateAction<number>>,
) {
  options.setDocumentId(saved.id);
  options.setDocumentUpdatedAt(saved.updatedAt);
  options.setVersion(saved.version);
  options.setSavedAt(formatSavedTime());
  const revisionIsCurrent = options.editRevision.current === revision;
  options.setStatus(revisionIsCurrent ? nextStatus : "Borrador");
  if (revisionIsCurrent) {
    options.dirtyRef.current = false;
    options.setDirty(false);
  } else {
    options.dirtyRef.current = true;
    setSaveEpoch((current) => current + 1);
  }
  options.setSaveError(null);
  window.history.replaceState({}, "", `/documentos?document=${encodeURIComponent(saved.id)}`);
  void options.refreshDocuments();
}
