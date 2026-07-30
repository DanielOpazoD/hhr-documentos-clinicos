import { Loader2 } from "@/app/components/Icons";
import type { AiProgressStage } from "./types";
import type { AiStudioController } from "./use-ai-studio";

const stages: Array<{ id: AiProgressStage; label: string }> = [
  { id: "preparing", label: "Preparar" },
  { id: "reading", label: "Leer" },
  { id: "analyzing", label: "Identificar" },
  { id: "drafting", label: "Redactar" },
  { id: "verifying", label: "Verificar" },
];

export function AiProcessingStatus({ controller }: { controller: AiStudioController }) {
  const currentIndex = Math.max(0, stages.findIndex((stage) => stage.id === controller.progress?.stage));
  return (
    <section className="ai-processing" aria-live="polite" aria-busy="true">
      <Loader2 className="spin" size={18} />
      <div>
        <strong>{controller.progress?.label ?? "Procesando documentos"}</strong>
        <span>{controller.progress?.detail ?? "Preparando el análisis"}</span>
      </div>
      <progress aria-label={`Progreso: ${stages[currentIndex]?.label ?? "Preparar"}`} max={stages.length} value={currentIndex + 1} />
      <time>{controller.elapsedSeconds}s</time>
    </section>
  );
}
