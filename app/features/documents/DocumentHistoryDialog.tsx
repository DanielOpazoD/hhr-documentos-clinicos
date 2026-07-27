"use client";

import { useState } from "react";
import { Clock3, RotateCcw, X } from "@/app/components/Icons";
import { formatUpdated } from "./formatters";
import type { DocumentWorkspace } from "./use-document-workspace";

type Props = Pick<
  DocumentWorkspace,
  | "documentVersions"
  | "closeDocumentHistory"
  | "historyError"
  | "historyLoading"
  | "historyOpen"
  | "restoringVersion"
  | "restoreVersion"
  | "version"
>;

export function DocumentHistoryDialog({
  closeDocumentHistory,
  documentVersions,
  historyError,
  historyLoading,
  historyOpen,
  restoringVersion,
  restoreVersion,
  version,
}: Props) {
  const [confirmVersion, setConfirmVersion] = useState<number | null>(null);
  if (!historyOpen) return null;

  const close = () => {
    if (restoringVersion !== null) return;
    setConfirmVersion(null);
    closeDocumentHistory();
  };

  return (
    <div className="modal-backdrop document-history-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="document-history-dialog" role="dialog" aria-modal="true" aria-labelledby="document-history-title">
        <header>
          <div>
            <span className="history-icon"><Clock3 size={17} /></span>
            <span><h2 id="document-history-title">Historial del documento</h2><small>Versiones clínicas preservadas</small></span>
          </div>
          <button className="icon-button" onClick={close} aria-label="Cerrar historial"><X size={17} /></button>
        </header>
        <div className="document-history-content">
          <p className="history-guidance">Restaurar una versión no elimina el historial: crea un borrador editable desde esa copia.</p>
          {historyError ? <p className="form-error standalone" role="alert">{historyError}</p> : null}
          {historyLoading ? <p className="history-empty" role="status">Cargando versiones…</p> : null}
          {!historyLoading && !documentVersions.length ? <p className="history-empty">Este documento aún no tiene versiones guardadas.</p> : null}
          <div className="document-version-list">
            {documentVersions.map((item) => {
              const confirming = confirmVersion === item.version;
              const restoring = restoringVersion === item.version;
              return (
                <article key={item.version}>
                  <span className="version-marker">v{item.version}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.patientName || "Sin paciente"}</span>
                    <small>{item.status} · {formatUpdated(item.createdAt)}</small>
                  </div>
                  <button
                    className={`button secondary${confirming ? " confirm" : ""}`}
                    disabled={historyLoading || restoringVersion !== null}
                    onClick={() => {
                      if (!confirming) return setConfirmVersion(item.version);
                      void restoreVersion(item.version).then((restored) => {
                        if (restored) setConfirmVersion(null);
                      });
                    }}
                  >
                    <RotateCcw size={14} /> {restoring ? "Restaurando…" : confirming ? "Confirmar" : item.version === version ? "Recuperar copia" : "Restaurar"}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
