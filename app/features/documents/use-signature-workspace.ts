"use client";

import { useCallback, useEffect, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createSignature, deleteSignature, listSignatures, setDefaultSignature } from "./api";
import {
  DEFAULT_SIGNATURE_IMAGE_SETTINGS,
  prepareSignatureUpload,
  type SignatureImageSettings,
} from "./prepare-signature";
import type { PlacedSignature, SignatureForm, SignatureRecord, SignerData } from "./types";
import { SIGNATURE_Y_DEFAULT_PERCENT } from "@/app/lib/document-layout";

const emptySignatureForm: SignatureForm = {
  file: null,
  professionalName: "",
  professionalRut: "",
  specialty: "",
};

export function useSignatureWorkspace(markDirty: () => void) {
  const [signatures, setSignatures] = useState<SignatureRecord[]>([]);
  const [placedSignature, setPlacedSignature] = useState<PlacedSignature | null>(null);
  const [signatureFormOpen, setSignatureFormOpen] = useState(false);
  const [signatureForm, setSignatureForm] = useState<SignatureForm>({ ...emptySignatureForm });
  const [signatureImageSettings, setSignatureImageSettings] = useState<SignatureImageSettings>({ ...DEFAULT_SIGNATURE_IMAGE_SETTINGS });
  const [signatureBusy, setSignatureBusy] = useState(false);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [signatureDeleteId, setSignatureDeleteId] = useState<string | null>(null);

  const refreshSignatures = useCallback(async (signal?: AbortSignal) => {
    try {
      setSignatures(await listSignatures(signal));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setSignatureError(error instanceof Error ? error.message : "No se pudieron cargar las firmas.");
      }
    }
  }, [setSignatureError, setSignatures]);

  const attachSignature = useCallback((signature: SignatureRecord) => {
    setPlacedSignature({ ...signature, x: 50, y: SIGNATURE_Y_DEFAULT_PERCENT, width: 28 });
    markDirty();
  }, [markDirty, setPlacedSignature]);

  const moveSignature = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const placementZone = event.currentTarget.closest(".signature-placement-zone")?.getBoundingClientRect();
    if (!placementZone) return;
    setPlacedSignature((current) => {
      if (!current) return current;
      const half = current.width / 2;
      return {
        ...current,
        x: Math.min(100 - half, Math.max(half, ((event.clientX - placementZone.left) / placementZone.width) * 100)),
      };
    });
    markDirty();
  }, [markDirty, setPlacedSignature]);

  const saveSignature = useCallback(async (signer: SignerData) => {
    if (!signatureForm.file || !signer.name.trim()) {
      setSignatureError("Agregue la imagen y el nombre del profesional.");
      return;
    }
    setSignatureBusy(true);
    setSignatureError(null);
    try {
      const preparedFile = await prepareSignatureUpload(signatureForm.file, signatureImageSettings);
      const created = await createSignature({
        file: preparedFile,
        professionalName: signer.name.trim(),
        professionalRut: signer.rut.trim(),
        specialty: signer.specialty.trim(),
      });
      setSignatures((current) => [created, ...current]);
      attachSignature(created);
      setSignatureForm({ ...emptySignatureForm });
      setSignatureImageSettings({ ...DEFAULT_SIGNATURE_IMAGE_SETTINGS });
      setSignatureFormOpen(false);
    } catch (error) {
      setSignatureError(error instanceof Error ? error.message : "No se pudo guardar la firma.");
    } finally {
      setSignatureBusy(false);
    }
  }, [
    attachSignature,
    setSignatureBusy,
    setSignatureError,
    setSignatureForm,
    setSignatureFormOpen,
    setSignatures,
    signatureForm,
    signatureImageSettings,
  ]);

  const makeDefaultSignature = useCallback(async (id: string) => {
    setSignatureBusy(true);
    setSignatureError(null);
    try {
      await setDefaultSignature(id);
      setSignatures((current) => current
        .map((signature) => ({ ...signature, isDefault: signature.id === id }))
        .sort((left, right) => Number(right.isDefault) - Number(left.isDefault)));
    } catch (error) {
      setSignatureError(error instanceof Error ? error.message : "No se pudo definir el perfil predeterminado.");
    } finally {
      setSignatureBusy(false);
    }
  }, []);

  const removeSignatureProfile = useCallback(async (id: string) => {
    setSignatureBusy(true);
    setSignatureError(null);
    try {
      await deleteSignature(id);
      setSignatures((current) => {
        const removedWasDefault = current.find((signature) => signature.id === id)?.isDefault;
        const remaining = current.filter((signature) => signature.id !== id);
        return removedWasDefault && remaining.length
          ? remaining.map((signature, index) => ({ ...signature, isDefault: index === 0 }))
          : remaining;
      });
      setPlacedSignature((current) => current?.id === id ? null : current);
      setSignatureDeleteId(null);
      markDirty();
      try {
        setSignatures(await listSignatures());
      } catch {
        // The DELETE already succeeded; keep the locally committed profile list.
      }
    } catch (error) {
      setSignatureError(error instanceof Error ? error.message : "No se pudo eliminar el perfil.");
    } finally {
      setSignatureBusy(false);
    }
  }, [markDirty]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void refreshSignatures(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [refreshSignatures]);

  return {
    signatures,
    placedSignature,
    setPlacedSignature,
    signatureFormOpen,
    setSignatureFormOpen,
    signatureForm,
    setSignatureForm,
    signatureImageSettings,
    setSignatureImageSettings,
    signatureBusy,
    signatureError,
    signatureDeleteId,
    setSignatureDeleteId,
    attachSignature,
    moveSignature,
    saveSignature,
    makeDefaultSignature,
    removeSignatureProfile,
  };
}
