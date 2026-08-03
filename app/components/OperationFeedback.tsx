import type { ReactNode } from "react";
import { Activity, AlertTriangle, CheckCircle2, Loader2, X } from "@/app/components/Icons";

export type OperationFeedbackTone = "error" | "warning" | "success" | "info" | "loading";

type Props = {
  tone: OperationFeedbackTone;
  title: string;
  message?: string;
  supportId?: string;
  code?: string;
  actions?: ReactNode;
  onDismiss?: () => void;
  compact?: boolean;
  className?: string;
};

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function FeedbackIcon({ tone }: { tone: OperationFeedbackTone }) {
  if (tone === "error" || tone === "warning") return <AlertTriangle size={17} />;
  if (tone === "success") return <CheckCircle2 size={17} />;
  if (tone === "loading") return <Loader2 size={17} className="spin" />;
  return <Activity size={17} />;
}

export function OperationFeedback({
  tone,
  title,
  message,
  supportId,
  code,
  actions,
  onDismiss,
  compact = false,
  className,
}: Props) {
  const isAlert = tone === "error";
  const hasSupportDetails = Boolean(supportId || code);

  return (
    <div
      className={classes("operation-feedback", `operation-feedback-${tone}`, compact && "compact", className)}
      role={isAlert ? "alert" : "status"}
      aria-live={isAlert ? "assertive" : "polite"}
      aria-atomic="true"
      aria-busy={tone === "loading" || undefined}
    >
      <span className="operation-feedback-mark" aria-hidden="true"><FeedbackIcon tone={tone} /></span>
      <div className="operation-feedback-copy">
        <strong>{title}</strong>
        {message ? <p>{message}</p> : null}
        {hasSupportDetails ? (
          <details className="operation-feedback-support">
            <summary>Detalles para soporte</summary>
            {supportId ? <span><b>Referencia</b><code>{supportId}</code></span> : null}
            {code ? <span><b>Código</b><code>{code}</code></span> : null}
          </details>
        ) : null}
      </div>
      {actions || onDismiss ? (
        <div className="operation-feedback-actions">
          {actions}
          {onDismiss ? (
            <button type="button" className="operation-feedback-dismiss" onClick={onDismiss} aria-label="Cerrar aviso">
              <X size={15} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
