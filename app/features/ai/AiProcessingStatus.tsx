import { Check, Loader2 } from "@/app/components/Icons";
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
      <header>
        <span className="ai-processing-icon"><Loader2 className="spin" size={20} /></span>
        <div>
          <strong>{controller.progress?.label ?? "Procesando documentos"}</strong>
          <span>{controller.progress?.detail ?? "Preparando el análisis"}</span>
        </div>
        <time>{controller.elapsedSeconds}s</time>
      </header>
      <ol>
        {stages.map((stage, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li className={done ? "done" : active ? "active" : ""} key={stage.id}>
              <span>{done ? <Check size={12} /> : index + 1}</span>
              {stage.label}
            </li>
          );
        })}
      </ol>
      <p>La aplicación muestra las etapas y un resumen verificable del análisis; el razonamiento interno del modelo no se expone.</p>
    </section>
  );
}
