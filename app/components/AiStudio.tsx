"use client";

import { useEffect, useRef } from "react";
import { Sparkles } from "@/app/components/Icons";
import { AiDraftResult } from "@/app/features/ai/AiDraftResult";
import { AiImportForm } from "@/app/features/ai/AiImportForm";
import { useAiStudio } from "@/app/features/ai/use-ai-studio";

type Props = {
  active?: boolean;
  embedded?: boolean;
  onOpenDocument?: (id: string) => void | Promise<void>;
};

export function AiStudio({ active = true, embedded = false, onOpenDocument }: Props) {
  const controller = useAiStudio();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (embedded && active) headingRef.current?.focus({ preventScroll: true });
  }, [active, embedded]);

  const content = controller.result.sections.length
    ? <AiDraftResult controller={controller} onOpenDocument={onOpenDocument} />
    : <AiImportForm controller={controller} />;

  if (embedded) {
    return (
      <section id="document-ai-assistant" className="document-ai-assistant" aria-labelledby="document-ai-title">
        <header className="document-ai-header">
          <span className="document-ai-mark" aria-hidden="true"><Sparkles size={18} /></span>
          <div>
            <h2 id="document-ai-title" ref={headingRef} tabIndex={-1}>Asistente IA</h2>
            <p>Importe fuentes para crear un borrador. Después podrá revisarlo y editarlo aquí mismo.</p>
          </div>
          <span className="simulation-badge live"><Sparkles size={14} /> {controller.selectedProvider?.name ?? "IA opcional"}</span>
        </header>
        {content}
      </section>
    );
  }

  return (
    <div className="page-wrap">
      <header className="page-header">
        <div>
          <span className="eyebrow">Asistente documental</span>
          <h1>Importar con IA</h1>
          <p>Combine documentos, confirme la identidad y guarde un borrador clínico editable.</p>
        </div>
        <span className="simulation-badge live"><Sparkles size={15} /> {controller.selectedProvider?.name ?? "IA documental"}</span>
      </header>
      {content}
    </div>
  );
}
