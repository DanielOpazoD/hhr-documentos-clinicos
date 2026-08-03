"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FolderOpen, Loader2 } from "@/app/components/Icons";
import { OperationFeedback } from "@/app/components/OperationFeedback";
import { toOperationFailure, type OperationFailure } from "@/app/lib/client/operation-feedback";
import { fetchGoogleDriveConfig, selectGoogleDriveFiles, type GoogleDriveConfig } from "@/app/features/integrations/google-drive";

export function GoogleDrivePicker({
  compact = false,
  disabled,
  fileCount,
  onFiles,
}: {
  compact?: boolean;
  disabled: boolean;
  fileCount: number;
  onFiles(files: File[]): void;
}) {
  const [config, setConfig] = useState<GoogleDriveConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<OperationFailure | null>(null);

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
      setError(toOperationFailure(cause, "No se pudo abrir Google Drive."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "drive-picker-control compact" : "drive-picker-control"}>
      <button
        type="button"
        className="button secondary"
        aria-label={compact ? "Google Drive. Acceso puntual; no se guarda la sesión" : undefined}
        title={compact ? "Acceso puntual; no se guarda la sesión" : undefined}
        disabled={disabled || busy || !config?.configured || fileCount >= 8}
        onClick={() => void openPicker()}
      >
        {busy ? <Loader2 size={15} className="spin" /> : <FolderOpen size={15} />}
        {busy ? "Importando…" : compact ? "Drive" : "Google Drive"}
      </button>
      {!compact ? (config && !config.configured ? <small>Requiere <Link href="/configuracion?tab=conexiones">configuración</Link></small> : <small>Acceso puntual; no se guarda la sesión</small>) : null}
      {compact && config && !config.configured ? <small><Link href="/configuracion?tab=conexiones">Configurar Drive</Link></small> : null}
      {error ? (
        <OperationFeedback
          compact
          tone="error"
          title="No se pudo abrir Google Drive"
          message={error.message}
          supportId={error.supportId}
          code={error.code}
          onDismiss={() => setError(null)}
          className="drive-picker-feedback"
        />
      ) : null}
    </div>
  );
}
