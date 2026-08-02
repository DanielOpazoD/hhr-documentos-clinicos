"use client";

import { useEffect, useRef } from "react";
import { Sparkles } from "@/app/components/Icons";
import { AiDraftResult } from "@/app/features/ai/AiDraftResult";
import { AiImportForm } from "@/app/features/ai/AiImportForm";
import { useAiStudio } from "@/app/features/ai/use-ai-studio";
import { aiTargetForDocumentTemplate } from "@/app/features/ai/targets";
import type { AiTargetId } from "@/app/features/ai/types";
import type { DocumentTemplateSectionSetting } from "@/app/features/documents/types";

type Props = {
  active: boolean;
  onOpenDocument: (id: string) => boolean | void | Promise<boolean | void>;
  initialTarget?: AiTargetId;
  initialTemplateId?: string;
  initialTemplateTitle?: string;
  initialTemplateSections?: DocumentTemplateSectionSetting[];
  initialPromptId?: string | null;
};

export function AiStudio({ active, initialPromptId, initialTarget, initialTemplateId, initialTemplateSections, initialTemplateTitle, onOpenDocument }: Props) {
  const resolvedInitialTarget = initialTarget
    ?? (initialTemplateId ? aiTargetForDocumentTemplate(initialTemplateId) ?? undefined : undefined);
  const controller = useAiStudio({
    initialPromptId,
    initialTarget: resolvedInitialTarget,
    initialTemplateId,
    initialTemplateSections,
    initialTemplateTitle,
  });
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (active) headingRef.current?.focus({ preventScroll: true });
  }, [active]);

  const content = controller.result.sections.length
    ? <AiDraftResult controller={controller} onOpenDocument={onOpenDocument} />
    : <AiImportForm controller={controller} />;

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
