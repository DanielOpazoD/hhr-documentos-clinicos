"use client";

import { useEffect, useRef, useState } from "react";
import { Save, Sparkles, X } from "@/app/components/Icons";
import type { AiPromptInput, AiPromptProposal } from "@/app/features/ai/prompt-types";
import { aiTargets } from "@/app/features/ai/targets";
import type { AiTargetId } from "@/app/features/ai/types";

type Props = {
  proposal: AiPromptProposal;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (input: AiPromptInput) => void;
};

export function PromptProposalDialog({ proposal, busy, error, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<AiPromptInput>({
    name: proposal.name,
    target: proposal.target,
    instructions: proposal.instructions,
    makeDefault: false,
  });
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  const close = () => {
    if (!busy) onClose();
  };

  return (
    <div className="modal-backdrop prompt-proposal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section
        ref={dialogRef}
        className="prompt-proposal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-proposal-title"
        tabIndex={-1}
        onKeyDown={(event) => { if (event.key === "Escape") close(); }}
      >
        <header>
          <div><span><Sparkles size={17} /></span><div><h2 id="prompt-proposal-title">Revisar plantilla propuesta</h2><small>Nada se guarda hasta que usted confirme.</small></div></div>
          <button className="icon-button" type="button" disabled={busy} onClick={close} aria-label="Cerrar propuesta"><X size={17} /></button>
        </header>
        <form onSubmit={(event) => { event.preventDefault(); onSave(draft); }}>
          <p className="prompt-proposal-summary">{proposal.summary}</p>
          <div className="prompt-proposal-fields">
            <label>Nombre<input value={draft.name} maxLength={80} disabled={busy} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label>
            <label>Tipo<select value={draft.target} disabled={busy} onChange={(event) => setDraft((current) => ({ ...current, target: event.target.value as AiTargetId }))}>{aiTargets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select></label>
          </div>
          <label className="prompt-proposal-instructions">Instrucciones<textarea value={draft.instructions} maxLength={16_000} rows={12} disabled={busy} onChange={(event) => setDraft((current) => ({ ...current, instructions: event.target.value }))} /><small>{draft.instructions.length.toLocaleString("es-CL")} / 16.000</small></label>
          <p className="prompt-proposal-privacy">OpenAI recibió sólo la estructura anonimizada, nunca el texto clínico. Revise que la propuesta sea genérica antes de guardarla.</p>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <footer><button className="button secondary" type="button" disabled={busy} onClick={close}>Cancelar</button><button className="button primary" disabled={busy || draft.name.trim().length < 3 || draft.instructions.trim().length < 20}><Save size={15} /> {busy ? "Guardando…" : "Guardar en Mis plantillas"}</button></footer>
        </form>
      </section>
    </div>
  );
}
