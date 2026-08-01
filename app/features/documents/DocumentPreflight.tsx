import { useEffect, useRef } from "react";
import { Printer, X } from "@/app/components/Icons";
import type { DocumentReadiness } from "./document-readiness";

export function DocumentPreflight({
  onClose,
  onNavigate,
  onPrint,
  printingDisabled,
  readiness,
}: {
  onClose: () => void;
  onNavigate: (targetId: string) => void;
  onPrint: () => Promise<void> | void;
  printingDisabled: boolean;
  readiness: DocumentReadiness;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const ready = !readiness.issues.length;

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section
      id="document-print-preflight"
      className="document-preflight print-hide"
      aria-labelledby="document-preflight-title"
      aria-live="polite"
    >
      <header>
        <div>
          <h2 id="document-preflight-title" ref={headingRef} tabIndex={-1}>
            {ready ? "Documento listo para imprimir" : "Revisar antes de imprimir"}
          </h2>
          <p>
            {ready
              ? "Los datos esenciales y el contenido están completos."
              : readiness.blockers.length
                ? `${readiness.blockers.length} punto${readiness.blockers.length === 1 ? "" : "s"} obligatorio${readiness.blockers.length === 1 ? "" : "s"} · ${readiness.warnings.length} sugerencia${readiness.warnings.length === 1 ? "" : "s"}`
                : `${readiness.warnings.length} sugerencia${readiness.warnings.length === 1 ? "" : "s"} para una salida más completa`}
          </p>
        </div>
        <button type="button" className="icon-button" aria-label="Cerrar revisión de impresión" onClick={onClose}>
          <X size={16} />
        </button>
      </header>

      {readiness.issues.length ? (
        <div className="document-preflight-issues">
          {readiness.issues.map((issue) => (
            <button
              type="button"
              className={`document-preflight-issue ${issue.severity}`}
              key={issue.code}
              onClick={() => onNavigate(issue.targetId)}
            >
              <span>
                <strong>{issue.label}</strong>
                <small>{issue.severity === "blocker" ? "Necesario" : "Sugerencia"}</small>
              </span>
              <span aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      ) : null}

      <footer>
        <p>
          {readiness.blockers.length
            ? "Complete los puntos necesarios; la revisión se actualiza automáticamente."
            : "Los cambios pendientes se guardan antes de imprimir."}
        </p>
        {!readiness.blockers.length ? (
          <button type="button" className="button primary" disabled={printingDisabled} onClick={() => void onPrint()}>
            <Printer size={15} />
            {readiness.warnings.length ? "Imprimir de todos modos" : "Imprimir"}
          </button>
        ) : null}
      </footer>
    </section>
  );
}
