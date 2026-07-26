"use client";

import { useCallback, useEffect, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createSignature, listSignatures, setDefaultSignature } from "./api";
import { prepareSignatureUpload } from "./prepare-signature";
import type { PlacedSignature, SignatureForm, SignatureRecord, SignerData } from "./types";
import { clampSignatureY, SIGNATURE_Y_DEFAULT_PERCENT } from "@/app/lib/document-layout";

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
  const [signatureBusy, setSignatureBusy] = useState(false);
  const [signatureError, setSignatureError] = useState<string | null>(null);

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
    const paper = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!paper) return;
    setPlacedSignature((current) => {
      if (!current) return current;
      const half = current.width / 2;
      return {
        ...current,
        x: Math.min(100 - half, Math.max(half, ((event.clientX - paper.left) / paper.width) * 100)),
        y: clampSignatureY(((event.clientY - paper.top) / paper.height) * 100),
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
      const preparedFile = await prepareSignatureUpload(signatureForm.file);
      const created = await createSignature({
        file: preparedFile,
        professionalName: signer.name.trim(),
        professionalRut: signer.rut.trim(),
        specialty: signer.specialty.trim(),
      });
      setSignatures((current) => [created, ...current]);
      attachSignature(created);
      setSignatureForm({ ...emptySignatureForm });
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
    signatureBusy,
    signatureError,
    attachSignature,
    moveSignature,
    saveSignature,
    makeDefaultSignature,
  };
}
