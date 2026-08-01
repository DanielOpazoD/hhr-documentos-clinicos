"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createSignature, deleteSignature, listSignatures, renameSignature, setDefaultSignature } from "./api";
import {
  DEFAULT_SIGNATURE_IMAGE_SETTINGS,
  prepareSignatureUpload,
  type SignatureImageSettings,
} from "./prepare-signature";
import type { PlacedSignature, SignatureAssetKind, SignatureForm, SignatureRecord, SignerData } from "./types";
import { clampSignatureY, clampSigningImageWidth, defaultImagePlacement } from "@/app/lib/document-layout";

const emptySignatureForm: SignatureForm = {
  file: null,
  name: "",
  professionalName: "",
  professionalRut: "",
  specialty: "",
};

export function useSignatureWorkspace(markDirty: () => void) {
  const [signatures, setSignatures] = useState<SignatureRecord[]>([]);
  const [placedSignature, setPlacedSignature] = useState<PlacedSignature | null>(null);
  const [placedStamp, setPlacedStamp] = useState<PlacedSignature | null>(null);
  const [signatureFormOpen, setSignatureFormOpen] = useState(false);
  const [signatureFormKind, setSignatureFormKind] = useState<SignatureAssetKind>("signature");
  const [signatureForm, setSignatureForm] = useState<SignatureForm>({ ...emptySignatureForm });
  const [signatureImageSettings, setSignatureImageSettings] = useState<SignatureImageSettings>({ ...DEFAULT_SIGNATURE_IMAGE_SETTINGS });
  const [signatureBusy, setSignatureBusy] = useState(false);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [signatureDeleteId, setSignatureDeleteId] = useState<string | null>(null);
  const dragOffsets = useRef<Record<SignatureAssetKind, { x: number; y: number }>>({
    signature: { x: 0, y: 0 },
    stamp: { x: 0, y: 0 },
  });

  const refreshSignatures = useCallback(async (signal?: AbortSignal) => {
    try {
      setSignatures(await listSignatures(signal));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setSignatureError(error instanceof Error ? error.message : "No se pudieron cargar las imágenes de firma.");
      }
    }
  }, []);

  const attachSignature = useCallback((asset: SignatureRecord) => {
    const placed = { ...asset, ...defaultImagePlacement(asset.kind) };
    if (asset.kind === "stamp") setPlacedStamp(placed);
    else setPlacedSignature(placed);
    markDirty();
  }, [markDirty]);

  const updatePlacedImage = useCallback((kind: SignatureAssetKind, patch: Partial<Pick<PlacedSignature, "x" | "y" | "width">>) => {
    const setter = kind === "stamp" ? setPlacedStamp : setPlacedSignature;
    setter((current) => {
      if (!current) return current;
      const width = clampSigningImageWidth(patch.width ?? current.width);
      const half = width / 2;
      return {
        ...current,
        ...patch,
        width,
        x: Math.min(100 - half, Math.max(half, patch.x ?? current.x)),
        y: clampSignatureY(patch.y ?? current.y),
      };
    });
    markDirty();
  }, [markDirty]);

  const removePlacedImage = useCallback((kind: SignatureAssetKind) => {
    (kind === "stamp" ? setPlacedStamp : setPlacedSignature)(null);
    markDirty();
  }, [markDirty]);

  const startSignatureMove = useCallback((kind: SignatureAssetKind, event: ReactPointerEvent<HTMLButtonElement>) => {
    const image = event.currentTarget.closest(".placed-signature")?.getBoundingClientRect();
    if (!image) return;
    dragOffsets.current[kind] = {
      x: event.clientX - (image.left + image.width / 2),
      y: event.clientY - (image.top + image.height / 2),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, []);

  const moveSignature = useCallback((kind: SignatureAssetKind, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const placementZone = event.currentTarget.closest(".signing-assets-canvas")?.getBoundingClientRect();
    if (!placementZone) return;
    const setter = kind === "stamp" ? setPlacedStamp : setPlacedSignature;
    const offset = dragOffsets.current[kind];
    setter((current) => {
      if (!current) return current;
      const half = current.width / 2;
      return {
        ...current,
        x: Math.min(100 - half, Math.max(half, ((event.clientX - offset.x - placementZone.left) / placementZone.width) * 100)),
        y: clampSignatureY(((event.clientY - offset.y - placementZone.top) / placementZone.height) * 100),
      };
    });
    markDirty();
  }, [markDirty]);

  const openSignatureForm = useCallback((kind: SignatureAssetKind, signer?: SignerData) => {
    setSignatureFormKind(kind);
    setSignatureForm({
      ...emptySignatureForm,
      name: signer?.name.trim() ? `${kind === "stamp" ? "Timbre" : "Firma"} de ${signer.name.trim()}` : "",
    });
    setSignatureImageSettings({ ...DEFAULT_SIGNATURE_IMAGE_SETTINGS });
    setSignatureError(null);
    setSignatureFormOpen(true);
  }, []);

  const saveSignature = useCallback(async (signer: SignerData) => {
    const assetLabel = signatureFormKind === "stamp" ? "timbre" : "firma";
    if (!signatureForm.file || !signer.name.trim()) {
      setSignatureError(`Agregue la imagen de ${assetLabel} y el nombre del profesional.`);
      return;
    }
    setSignatureBusy(true);
    setSignatureError(null);
    try {
      const preparedFile = await prepareSignatureUpload(signatureForm.file, signatureImageSettings);
      const created = await createSignature({
        file: preparedFile,
        name: signatureForm.name.trim(),
        professionalName: signer.name.trim(),
        professionalRut: signer.rut.trim(),
        specialty: signer.specialty.trim(),
      }, signatureFormKind);
      setSignatures((current) => [created, ...current]);
      attachSignature(created);
      setSignatureForm({ ...emptySignatureForm });
      setSignatureImageSettings({ ...DEFAULT_SIGNATURE_IMAGE_SETTINGS });
      setSignatureFormOpen(false);
    } catch (error) {
      setSignatureError(error instanceof Error ? error.message : `No se pudo guardar el ${assetLabel}.`);
    } finally {
      setSignatureBusy(false);
    }
  }, [attachSignature, signatureForm, signatureFormKind, signatureImageSettings]);

  const makeDefaultSignature = useCallback(async (id: string) => {
    setSignatureBusy(true);
    setSignatureError(null);
    try {
      await setDefaultSignature(id);
      setSignatures((current) => {
        const selectedKind = current.find((asset) => asset.id === id)?.kind;
        return current.map((asset) => ({
          ...asset,
          isDefault: asset.kind === selectedKind ? asset.id === id : asset.isDefault,
        }));
      });
    } catch (error) {
      setSignatureError(error instanceof Error ? error.message : "No se pudo definir la imagen predeterminada.");
    } finally {
      setSignatureBusy(false);
    }
  }, []);

  const renameSignatureProfile = useCallback(async (id: string, name: string) => {
    const normalizedName = name.trim();
    if (!normalizedName) return false;
    setSignatureBusy(true);
    setSignatureError(null);
    try {
      await renameSignature(id, normalizedName);
      setSignatures((current) => current.map((asset) => asset.id === id ? { ...asset, name: normalizedName } : asset));
      setPlacedSignature((current) => current?.id === id ? { ...current, name: normalizedName } : current);
      setPlacedStamp((current) => current?.id === id ? { ...current, name: normalizedName } : current);
      return true;
    } catch (error) {
      setSignatureError(error instanceof Error ? error.message : "No se pudo cambiar el nombre de la imagen.");
      return false;
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
        const removed = current.find((asset) => asset.id === id);
        const remaining = current.filter((asset) => asset.id !== id);
        if (!removed?.isDefault) return remaining;
        const replacement = remaining.find((asset) => asset.kind === removed.kind);
        return remaining.map((asset) => asset.kind === removed.kind
          ? { ...asset, isDefault: asset.id === replacement?.id }
          : asset);
      });
      setPlacedSignature((current) => current?.id === id ? null : current);
      setPlacedStamp((current) => current?.id === id ? null : current);
      setSignatureDeleteId(null);
      markDirty();
      try { setSignatures(await listSignatures()); } catch { /* DELETE already succeeded. */ }
    } catch (error) {
      setSignatureError(error instanceof Error ? error.message : "No se pudo eliminar la imagen.");
    } finally {
      setSignatureBusy(false);
    }
  }, [markDirty]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void refreshSignatures(controller.signal), 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [refreshSignatures]);

  return {
    signatures,
    placedSignature,
    setPlacedSignature,
    placedStamp,
    setPlacedStamp,
    signatureFormOpen,
    setSignatureFormOpen,
    signatureFormKind,
    signatureForm,
    setSignatureForm,
    signatureImageSettings,
    setSignatureImageSettings,
    signatureBusy,
    signatureError,
    signatureDeleteId,
    setSignatureDeleteId,
    attachSignature,
    updatePlacedImage,
    removePlacedImage,
    startSignatureMove,
    moveSignature,
    openSignatureForm,
    saveSignature,
    makeDefaultSignature,
    renameSignatureProfile,
    removeSignatureProfile,
  };
}
