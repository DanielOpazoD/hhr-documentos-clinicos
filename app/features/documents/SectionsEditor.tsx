import { ArrowDown, ArrowUp, GripVertical } from "@/app/components/Icons";
import type { DocumentWorkspace } from "./use-document-workspace";

type Props = Pick<DocumentWorkspace, "sections" | "moveSection" | "templateId" | "updateSection">;

export function SectionsEditor({ sections, moveSection, templateId, updateSection }: Props) {
  if (templateId === "receta_externa") {
    const prescription = sections[0];
    if (!prescription) return null;
    return (
      <div className="editor-section content-editor prescription-content-editor">
        <div className="editor-section-title"><h2>Prescripción</h2></div>
        <div className="prescription-entry">
          <label htmlFor={`section-${prescription.id}`}>Rp.</label>
          <textarea
            id={`section-${prescription.id}`}
            value={prescription.body}
            placeholder="Escriba el o los fármacos e indicaciones"
            onChange={(event) => updateSection(prescription.id, event.target.value)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="editor-section content-editor">
      <div className="editor-section-title"><h2>Contenido</h2></div>
      {sections.map((section, index) => (
        <div className="section-editor" key={section.id}>
          <div>
            <GripVertical size={16} />
            <label htmlFor={`section-${section.id}`}>{section.title}</label>
            <span className="reorder-buttons">
              <button onClick={() => moveSection(index, -1)} disabled={index === 0} aria-label={`Subir ${section.title}`}><ArrowUp size={14} /></button>
              <button onClick={() => moveSection(index, 1)} disabled={index === sections.length - 1} aria-label={`Bajar ${section.title}`}><ArrowDown size={14} /></button>
            </span>
          </div>
          <textarea
            id={`section-${section.id}`}
            value={section.body}
            onChange={(event) => updateSection(section.id, event.target.value)}
          />
        </div>
      ))}
    </div>
  );
}
