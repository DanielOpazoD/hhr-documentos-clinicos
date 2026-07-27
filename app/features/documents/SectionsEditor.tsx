import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from "@/app/components/Icons";
import type { DocumentWorkspace } from "./use-document-workspace";

type Props = Pick<DocumentWorkspace, "addSection" | "removeSection" | "sections" | "moveSection" | "templateId" | "updateSection">;

export function SectionsEditor({ addSection, removeSection, sections, moveSection, templateId, updateSection }: Props) {
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
            onChange={(event) => updateSection(prescription.id, { body: event.target.value })}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="editor-section content-editor">
      <div className="editor-section-title">
        <h2>Contenido</h2>
        <button className="text-button" onClick={addSection}><Plus size={14} /> Agregar sección</button>
      </div>
      {!sections.length ? <button className="empty-sections" onClick={addSection}><Plus size={16} /> Agregar primera sección</button> : null}
      {sections.map((section, index) => (
        <div className="section-editor" key={section.id}>
          <div>
            <GripVertical size={16} />
            <input
              className="section-title-input"
              aria-label={`Título de la sección ${index + 1}`}
              value={section.title}
              onChange={(event) => updateSection(section.id, { title: event.target.value })}
            />
            <span className="reorder-buttons">
              <button onClick={() => moveSection(index, -1)} disabled={index === 0} aria-label={`Subir ${section.title}`}><ArrowUp size={14} /></button>
              <button onClick={() => moveSection(index, 1)} disabled={index === sections.length - 1} aria-label={`Bajar ${section.title}`}><ArrowDown size={14} /></button>
              <button className="section-delete" onClick={() => removeSection(section.id)} aria-label={`Eliminar ${section.title || `sección ${index + 1}`}`}><Trash2 size={14} /></button>
            </span>
          </div>
          <textarea
            id={`section-${section.id}`}
            aria-label={`Contenido de ${section.title || `sección ${index + 1}`}`}
            value={section.body}
            onChange={(event) => updateSection(section.id, { body: event.target.value })}
          />
        </div>
      ))}
    </div>
  );
}
