"use client";

// The small QR encoder is vendored from the MIT-licensed `qrcode` package so
// mobile capture remains functional in the self-contained Sites bundle.
import QRCode from "@/app/vendor/qrcode/browser";
import { Check, Clipboard, Clock3, FileImage, QrCode, RefreshCw, ScanLine, ShieldCheck, Smartphone, XCircle } from "@/app/components/Icons";
import { useCallback, useEffect, useState } from "react";
import { formatBytes } from "@/app/lib/client-pdf";

type Session = { id: string; token: string; expiresAt: string; status: string; url: string; qr: string };
type SavedFile = { id: string; name: string; size: number; origin: string; createdAt: string };

export function ScannerDesk() {
  const [session, setSession] = useState<Session | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [copied, setCopied] = useState(false);
  const [received, setReceived] = useState<SavedFile[]>([]);
  const [busy, setBusy] = useState(false);

  const createSession = useCallback(async () => {
    setBusy(true);
    const response = await fetch("/api/mobile-sessions", { method: "POST" });
    const data = await response.json();
    if (response.ok) {
      const url = `${window.location.origin}/captura/${data.session.token}`;
      const qr = await QRCode.toDataURL(url, { width: 360, margin: 2, color: { dark: "#123b49", light: "#ffffff" } });
      setSession({ ...data.session, url, qr }); setReceived([]);
    }
    setBusy(false);
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void createSession(), 0); return () => window.clearTimeout(timer); }, [createSession]);
  useEffect(() => { if (!session) return; const tick = () => setSeconds(Math.max(0, Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000))); tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer); }, [session]);
  useEffect(() => { if (!session) return; const poll = async () => { const response = await fetch("/api/files"); const data = await response.json(); setReceived((data.files ?? []).filter((file: SavedFile) => file.origin === "QR móvil" && Date.parse(file.createdAt) >= Date.parse(session.expiresAt) - 10 * 60 * 1000)); }; void poll(); const timer = setInterval(() => void poll(), 4000); return () => clearInterval(timer); }, [session]);
  async function revoke() { if (!session) return; await fetch("/api/mobile-sessions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: session.id }) }); setSession({ ...session, status: "revocada" }); }
  async function copy() { if (!session) return; await navigator.clipboard.writeText(session.url); setCopied(true); setTimeout(() => setCopied(false), 1800); }
  const active = session?.status === "activa" && seconds > 0;

  return <div className="page-wrap"><header className="page-header"><div><span className="eyebrow">Captura segura</span><h1>Escáner desde celular</h1><p>Genere un enlace temporal, capture varias páginas y recíbalas en la biblioteca.</p></div><span className="secure-copy"><ShieldCheck size={16} /> Token sin datos clínicos</span></header>
    <div className="scanner-layout"><section className="panel qr-panel"><div className="panel-header"><div><span className="eyebrow">Paso 1</span><h2>Escanee el código QR</h2></div>{session && <span className={active ? "session-state active" : "session-state"}><span />{active ? "Sesión activa" : session.status === "revocada" ? "Revocada" : "Expirada"}</span>}</div>{session ? <><div className={active ? "qr-wrap" : "qr-wrap expired"}><img src={session.qr} alt="Código QR temporal para abrir el escáner móvil" />{!active && <div><XCircle size={32} /><strong>Sesión cerrada</strong></div>}</div><div className="timer"><Clock3 size={16} /><span>Válido por <strong>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</strong></span></div><div className="qr-actions"><button className="button secondary" onClick={() => void copy()} disabled={!active}>{copied ? <Check size={16} /> : <Clipboard size={16} />}{copied ? "Copiado" : "Copiar enlace"}</button><button className="button secondary danger" onClick={() => void revoke()} disabled={!active}><XCircle size={16} /> Revocar QR</button></div></> : <div className="loading-card"><QrCode size={38} /><p>Creando sesión segura…</p></div>}<button className="text-button centered" onClick={() => void createSession()} disabled={busy}><RefreshCw size={14} /> Generar un QR nuevo</button></section>
      <section className="panel scanner-guide"><div className="panel-header"><div><span className="eyebrow">Paso 2</span><h2>Capture y envíe</h2></div></div><ol className="step-list"><li><span><Smartphone size={19} /></span><div><strong>Abra el enlace en el celular</strong><p>No incluye nombre, RUT ni datos clínicos.</p></div></li><li><span><ScanLine size={19} /></span><div><strong>Tome una o varias fotos</strong><p>Puede rotar y ordenar las páginas antes de subir.</p></div></li><li><span><FileImage size={19} /></span><div><strong>Elija imágenes o PDF</strong><p>Máximo 15 MB por archivo y 10 minutos de sesión.</p></div></li></ol><div className="received-box"><div><strong>Archivos recibidos</strong><span>{received.length}</span></div>{received.length ? received.map(file => <a href={`/api/files/${file.id}`} target="_blank" key={file.id}><FileImage size={17} /><p><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></p><Check size={16} /></a>) : <p className="waiting-copy"><span className="pulse-dot" />Esperando documentos desde el celular…</p>}</div></section>
    </div><div className="security-strip"><ShieldCheck size={19} /><div><strong>La sesión puede revocarse en cualquier momento</strong><p>Los archivos se validan en el servidor, se guardan de forma privada y no usan direcciones públicas permanentes.</p></div></div>
  </div>;
}
