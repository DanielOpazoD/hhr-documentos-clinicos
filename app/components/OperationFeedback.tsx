import type { ReactNode } from "react";
import { X } from "@/app/components/Icons";

export type OperationFeedbackTone = "error" | "warning" | "success";

type Props = {
  tone: OperationFeedbackTone;
  title: string;
  message?: string;
  supportId?: string;
  actions?: ReactNode;
  onDismiss?: () => void;
  compact?: boolean;
  className?: string;
};

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function OperationFeedback({
  tone,
  title,
  message,
  supportId,
  actions,
  onDismiss,
  compact = false,
  className,
}: Props) {
  const isAlert = tone === "error";
  return (
    <div
      className={classes("operation-feedback", `operation-feedback-${tone}`, compact && "compact", className)}
      role={isAlert ? "alert" : "status"}
      aria-live={isAlert ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <div className="operation-feedback-copy">
        <strong>{title}</strong>
        {message ? <p>{message}</p> : null}
        {supportId ? (
          <details className="operation-feedback-support">
            <summary>Detalles para soporte</summary>
            <code>{supportId}</code>
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
