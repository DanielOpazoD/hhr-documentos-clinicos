import { hospitalSalvadorFields } from "./hospital-salvador-fields.js";
import { AiSectionEvidence } from "./AiSectionEvidence";
import type { AiStudioController } from "./use-ai-studio";

export function HospitalSalvadorEditor({ controller }: { controller: AiStudioController }) {
  const indexedSections = new Map(controller.result.sections.map((section, index) => [section.key, { section, index }]));
  const personal = hospitalSalvadorFields.filter((field) => field.group === "personal");
  const clinical = hospitalSalvadorFields.filter((field) => field.group === "clinical");

  return (
    <div className="hospital-transfer-editor">
      <section>
        <header><h3>Antecedentes personales</h3><small>9 campos del formulario</small></header>
        <div className="hospital-personal-fields">
          {personal.map((field) => {
            const item = indexedSections.get(field.key);
            if (!item) return null;
            return (
              <label className={field.key === "support_network" ? "wide" : ""} key={field.key}>
                <span>{field.label}</span>
                <input value={item.section.text} onChange={(event) => controller.updateSection(item.index, event.target.value)} />
                <AiSectionEvidence section={item.section} sources={controller.result.sources} />
              </label>
            );
          })}
        </div>
      </section>
      <section>
        <header><h3>Antecedentes clínicos</h3><small>9 campos del formulario</small></header>
        <div className="hospital-clinical-fields">
          {clinical.map((field) => {
            const item = indexedSections.get(field.key);
            if (!item) return null;
            return (
              <label key={field.key}>
                <span>{field.label}</span>
                <textarea value={item.section.text} onChange={(event) => controller.updateSection(item.index, event.target.value)} />
                <AiSectionEvidence section={item.section} sources={controller.result.sources} />
              </label>
            );
          })}
        </div>
      </section>
    </div>
  );
}
