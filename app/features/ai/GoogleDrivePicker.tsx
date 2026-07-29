"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderOpen, Loader2 } from "@/app/components/Icons";
import { fetchGoogleDriveConfig, selectGoogleDriveFiles, type GoogleDriveConfig } from "@/app/features/integrations/google-drive";

export function GoogleDrivePicker({
  disabled,
  fileCount,
  onFiles,
}: {
  disabled: boolean;
  fileCount: number;
  onFiles(files: File[]): void;
}) {
  const [config, setConfig] = useState<GoogleDriveConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchGoogleDriveConfig()
      .then((value) => { if (active) setConfig(value); })
      .catch(() => { if (active) setConfig({ configured: false, scope: "" }); });
    return () => { active = false; };
  }, []);

  async function openPicker() {
    if (!config?.configured) return;
    setBusy(true);
    setError(null);
    try {
      const files = await selectGoogleDriveFiles(config, 8 - fileCount);
      if (files.length) onFiles(files);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo abrir Google Drive.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="drive-picker-control">
      <button type="button" className="button secondary" disabled={disabled || busy || !config?.configured || fileCount >= 8} onClick={() => void openPicker()}>
        {busy ? <Loader2 size={15} className="spin" /> : <FolderOpen size={15} />}
        {busy ? "Importando…" : "Google Drive"}
      </button>
      {config && !config.configured ? <small>Requiere <Link href="/configuracion?tab=conexiones">configuración</Link></small> : <small>Acceso puntual; no se guarda la sesión</small>}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </div>
  );
}
