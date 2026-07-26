"use client";

import { Sparkles } from "@/app/components/Icons";
import { AiDraftResult } from "@/app/features/ai/AiDraftResult";
import { AiImportForm } from "@/app/features/ai/AiImportForm";
import { useAiStudio } from "@/app/features/ai/use-ai-studio";

export function AiStudio() {
  const controller = useAiStudio();
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
      {controller.result.sections.length
        ? <AiDraftResult controller={controller} />
        : <AiImportForm controller={controller} />}
    </div>
  );
}
