"use client";

/* eslint-disable @next/next/no-img-element -- The QR image is generated as an ephemeral data URL and should not be optimized remotely. */

import { Check, Clipboard, Clock3, FileImage, QrCode, RefreshCw, ScanLine, Smartphone, XCircle } from "@/app/components/Icons";
import { PageHeader } from "@/app/components/VisualPrimitives";
import { DesktopImageScanner } from "@/app/features/scanner/DesktopImageScanner";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatBytes } from "@/app/lib/client/format-bytes";
import {
  createMobileSession,
  getMobileSession,
  revokeMobileSession,
  type CreatedMobileSession,
} from "@/app/features/files/mobile-session-client";
import type { SavedFile } from "@/app/features/files/types";

type ScannerSession = CreatedMobileSession;
type PollMode = "active" | "terminal";
type ScannerSourceMode = "computer" | "mobile";

const ACTIVE_POLL_INTERVAL_MS = 4000;
const TERMINAL_RETRY_DELAYS_MS = [1000, 2500] as const;

function remainingSeconds(expiresAt: string): number {
  return Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1000));
}

export function ScannerDesk() {
  const [sourceMode, setSourceMode] = useState<ScannerSourceMode>("computer");
  const [session, setSession] = useState<ScannerSession | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [copied, setCopied] = useState(false);
  const [received, setReceived] = useState<SavedFile[]>([]);
  const [pendingAction, setPendingAction] = useState<"create" | "revoke" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const requestedInitialSession = useRef(false);
  const currentSessionIdRef = useRef<string | null>(null);
  const sessionLifecycleRef = useRef(0);
  const terminalSnapshotCompletedRef = useRef<string | null>(null);

  const createSession = useCallback(async () => {
    setPendingAction("create");
    setActionError(null);
    setCopied(false);
    try {
      const created = await createMobileSession();
      sessionLifecycleRef.current += 1;
      currentSessionIdRef.current = created.id;
      terminalSnapshotCompletedRef.current = null;
      setSession(created);
      setSeconds(remainingSeconds(created.expiresAt));
      setReceived([]);
      setPollError(null);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "No se pudo crear una sesión móvil.");
    } finally {
      setPendingAction(null);
    }
  }, []);

  useEffect(() => {
    if (sourceMode !== "mobile" || requestedInitialSession.current) return;
    requestedInitialSession.current = true;
    void createSession();
  }, [createSession, sourceMode]);

  const sessionExpiresAt = session?.expiresAt;

  useEffect(() => {
    if (!sessionExpiresAt) return;
    const tick = () => setSeconds(remainingSeconds(sessionExpiresAt));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [sessionExpiresAt]);

  const active = session?.status === "activa";
  const sessionId = session?.id;

  useEffect(() => {
    currentSessionIdRef.current = sessionId ?? null;
  }, [sessionId]);

  useEffect(() => {
    if (sourceMode !== "mobile" || !sessionId) return;
    const controller = new AbortController();
    const lifecycle = sessionLifecycleRef.current;
    let timer: number | undefined;

    const isCurrentSession = () => (
      currentSessionIdRef.current === sessionId
      && sessionLifecycleRef.current === lifecycle
    );
    const poll = async (mode: PollMode, terminalFailureCount = 0) => {
      try {
        const data = await getMobileSession(sessionId, controller.signal);
        if (controller.signal.aborted || !isCurrentSession() || data.session.id !== sessionId) return;
        setSession(current => current?.id === sessionId ? { ...current, ...data.session } : current);
        setReceived(data.files);
        setPollError(null);
        if (data.session.status === "activa") {
          timer = window.setTimeout(() => void poll("active"), ACTIVE_POLL_INTERVAL_MS);
        } else {
          terminalSnapshotCompletedRef.current = sessionId;
        }
      } catch (cause) {
        if (controller.signal.aborted || !isCurrentSession()) return;
        setPollError(cause instanceof Error ? cause.message : "No se pudieron consultar los archivos recibidos.");
        const retryDelay = mode === "active"
          ? ACTIVE_POLL_INTERVAL_MS
          : TERMINAL_RETRY_DELAYS_MS[terminalFailureCount];
        if (retryDelay !== undefined) {
          timer = window.setTimeout(
            () => void poll(mode, terminalFailureCount + 1),
            retryDelay,
          );
        }
      }
    };

    if (active) {
      void poll("active");
    } else if (terminalSnapshotCompletedRef.current !== sessionId) {
      void poll("terminal");
    }
    return () => {
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [active, sessionId, sourceMode]);

  async function revoke() {
    if (!session) return;
    const sessionId = session.id;
    setPendingAction("revoke");
    setActionError(null);
    try {
      const revoked = await revokeMobileSession(sessionId);
      sessionLifecycleRef.current += 1;
      terminalSnapshotCompletedRef.current = null;
      setSession(current => current?.id === sessionId ? { ...current, ...revoked } : current);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "No se pudo revocar la sesión.");
    } finally {
      setPendingAction(null);
    }
  }

  async function copy() {
    if (!session) return;
    setActionError(null);
    try {
      await navigator.clipboard.writeText(session.captureUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setActionError("No se pudo copiar el enlace. Intente nuevamente.");
    }
  }

  const visibleError = actionError ?? pollError;
  const creating = pendingAction === "create";
  const revoking = pendingAction === "revoke";

  return <div className="page-wrap scanner-page"><PageHeader eyebrow="Escáner" title="Escáner de documentos" description="Convierta imágenes existentes o capture nuevas desde el celular. El procesamiento mantiene sus originales en este dispositivo." />
    <div className="segmented scanner-source-switch" role="group" aria-label="Origen del documento">
      <button type="button" className={sourceMode === "computer" ? "active" : ""} aria-pressed={sourceMode === "computer"} onClick={() => setSourceMode("computer")}><FileImage size={17} /> Desde este equipo</button>
      <button type="button" className={sourceMode === "mobile" ? "active" : ""} aria-pressed={sourceMode === "mobile"} onClick={() => setSourceMode("mobile")}><Smartphone size={17} /> Desde el celular</button>
    </div>
    <div className="scanner-source-panel" hidden={sourceMode !== "computer"}>
      <DesktopImageScanner />
    </div>
    <div className="scanner-source-panel" hidden={sourceMode !== "mobile"}>
      <div className="scanner-layout"><section className="panel qr-panel"><div className="panel-header"><div><span className="eyebrow">Paso 1</span><h2>Escanee el código QR</h2></div>{session ? <span className={active ? "session-state active" : "session-state"}><span />{active ? "Sesión activa" : session.status === "revocada" ? "Revocada" : "Expirada"}</span> : null}</div>{session ? <><div className={active ? "qr-wrap" : "qr-wrap expired"}><img src={session.qrDataUrl} alt="Código QR temporal para abrir el escáner móvil" />{!active ? <div><XCircle size={32} /><strong>Sesión cerrada</strong></div> : null}</div><div className="timer"><Clock3 size={16} /><span>Válido por <strong>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</strong></span></div><div className="qr-actions"><button className="button secondary" onClick={() => void copy()} disabled={!active || pendingAction !== null}>{copied ? <Check size={16} /> : <Clipboard size={16} />}{copied ? "Copiado" : "Copiar enlace"}</button><button className="button secondary danger" onClick={() => void revoke()} disabled={!active || pendingAction !== null}><XCircle size={16} /> {revoking ? "Revocando…" : "Revocar QR"}</button></div></> : <div className="loading-card"><QrCode size={38} /><p>{creating ? "Creando sesión segura…" : "No hay una sesión activa."}</p></div>}{visibleError ? <p className="form-error" role="alert">{visibleError}</p> : null}<button className="text-button centered" onClick={() => void createSession()} disabled={pendingAction !== null}><RefreshCw size={14} className={creating ? "spin" : ""} /> {creating ? "Generando…" : "Generar un QR nuevo"}</button></section>
        <section className="panel scanner-guide"><div className="panel-header"><div><span className="eyebrow">Paso 2</span><h2>Capture y envíe</h2></div></div><ol className="step-list"><li><span><Smartphone size={19} /></span><div><strong>Abra el enlace en el celular</strong><p>No incluye nombre, RUT ni datos clínicos.</p></div></li><li><span><ScanLine size={19} /></span><div><strong>Tome una o varias fotos</strong><p>Puede rotar y ordenar las páginas antes de subir.</p></div></li><li><span><FileImage size={19} /></span><div><strong>Elija imágenes o PDF</strong><p>Máximo 15 MB por archivo y 10 minutos de sesión.</p></div></li></ol><div className="received-box"><div><strong>Archivos recibidos en esta sesión</strong><span>{received.length}</span></div>{received.length ? received.map(file => <a href={`/api/files/${file.id}`} target="_blank" rel="noreferrer" key={file.id}><FileImage size={17} /><p><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></p><Check size={16} /></a>) : <p className="waiting-copy"><span className="pulse-dot" />{active ? "Esperando documentos desde el celular…" : "Genere una sesión para recibir documentos."}</p>}</div></section>
      </div>
    </div>
  </div>;
}
