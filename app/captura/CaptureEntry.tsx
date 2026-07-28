"use client";

import { useEffect, useState } from "react";
import { MobileCapture } from "@/app/components/MobileCapture";
import { isCaptureToken, MOBILE_CAPTURE_STORAGE_KEY } from "@/app/features/files/mobile-session-client";
import { Loader2 } from "@/app/components/Icons";

type CaptureEntryState =
  | { kind: "loading" }
  | { kind: "ready"; token: string }
  | { kind: "invalid" };

export function CaptureEntry() {
  const [entry, setEntry] = useState<CaptureEntryState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    let revision = 0;

    const consumeLocation = () => {
      const hash = window.location.hash;
      const hashToken = hash.slice(1).trim();
      const hasHash = hash.length > 0;
      let nextEntry: CaptureEntryState;

      if (hasHash) {
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
      }

      if (hasHash) {
        if (!isCaptureToken(hashToken)) {
          try { window.sessionStorage.removeItem(MOBILE_CAPTURE_STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
          nextEntry = { kind: "invalid" };
        } else {
          try { window.sessionStorage.setItem(MOBILE_CAPTURE_STORAGE_KEY, hashToken); } catch { /* The current in-memory session remains usable. */ }
          nextEntry = { kind: "ready", token: hashToken };
        }
      } else {
        let storedToken = "";
        try { storedToken = window.sessionStorage.getItem(MOBILE_CAPTURE_STORAGE_KEY) ?? ""; } catch { /* Storage may be unavailable. */ }
        nextEntry = isCaptureToken(storedToken) ? { kind: "ready", token: storedToken } : { kind: "invalid" };
      }

      const locationRevision = ++revision;
      queueMicrotask(() => {
        if (!cancelled && locationRevision === revision) setEntry(nextEntry);
      });
    };

    window.addEventListener("hashchange", consumeLocation);
    consumeLocation();
    return () => {
      cancelled = true;
      window.removeEventListener("hashchange", consumeLocation);
    };
  }, []);

  if (entry.kind === "loading") {
    return <main className="capture-shell"><div className="capture-status"><Loader2 className="spin" /><p>Abriendo escáner…</p></div></main>;
  }
  if (entry.kind === "invalid") {
    return <main className="capture-shell"><div className="capture-status error"><h1>Enlace no disponible</h1><p>Escanee un código QR vigente desde HHR-documentos.</p></div></main>;
  }
  return <MobileCapture key={entry.token} token={entry.token} />;
}
