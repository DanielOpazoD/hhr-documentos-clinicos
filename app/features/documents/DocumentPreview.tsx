/* eslint-disable @next/next/no-img-element -- local brand asset bypasses optimization intentionally. */
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUp, Eye, MoreHorizontal, Plus, Settings, Trash2 } from "@/app/components/Icons";
import { TypographyControl } from "./DocumentTypographyControl";
import { formatStoredDate } from "./formatters";
import { patientFullName } from "./identity";
import { PlacedDocumentAsset } from "./PlacedDocumentAsset";
import type { DocumentWorkspace } from "./use-document-workspace";

type Props = Pick<
  DocumentWorkspace,
  | "addSection"
  | "documentFontSize"
  | "signoffFontSize"
  | "documentTitle"
  | "canDecreaseDocumentFontSize"
  | "canIncreaseDocumentFontSize"
  | "canDecreaseSignoffFontSize"
  | "canIncreaseSignoffFontSize"
  | "decreaseDocumentFontSize"
  | "increaseDocumentFontSize"
  | "decreaseSignoffFontSize"
  | "increaseSignoffFontSize"
  | "issueDate"
  | "moveSection"
  | "moveSignature"
  | "patient"
  | "placedSignature"
  | "placedStamp"
  | "removeSection"
  | "sections"
  | "signer"
  | "startSignatureMove"
  | "toggleFrame"
  | "updatePlacedImage"
  | "frameHidden"
  | "templateId" | "templateSettingsError" | "templateSettingsLoaded" | "retryTemplateSettings"
  | "visibleTitle"
  | "markDirty"
  | "setDocumentTitle"
  | "updateSection"
> & { onConfigureTemplate: (trigger: HTMLButtonElement) => void; onEditRequest: (fieldId: string) => void };

export function DocumentPreview({
  addSection,
  documentFontSize,
  signoffFontSize,
  documentTitle,
  canDecreaseDocumentFontSize,
  canIncreaseDocumentFontSize,
  canDecreaseSignoffFontSize,
  canIncreaseSignoffFontSize,
  decreaseDocumentFontSize,
  increaseDocumentFontSize,
  decreaseSignoffFontSize,
  increaseSignoffFontSize,
  issueDate,
  moveSection,
  moveSignature,
  patient,
  placedSignature,
  placedStamp,
  removeSection,
  sections,
  signer,
  startSignatureMove,
  toggleFrame,
  updatePlacedImage,
  frameHidden,
  templateId, templateSettingsError, templateSettingsLoaded, retryTemplateSettings,
  visibleTitle,
  markDirty,
  setDocumentTitle,
  updateSection,
  onConfigureTemplate,
  onEditRequest,
}: Props) {
  const [editingTitle, setEditingTitle] = useState(false);
  const paperStyle = {
    "--document-font-size": `${documentFontSize}px`,
    "--signoff-font-size": `${signoffFontSize}px`,
  } as CSSProperties;
  const isPrescription = templateId === "receta_externa";
  return (
    <section id="document-preview" className="paper-panel">
      <div className="paper-toolbar print-hide">
        <div className="paper-toolbar-actions">
          {templateSettingsError ? (
            <button type="button" className="paper-template-settings error" aria-label="No se pudo cargar la plantilla. Reintentar" onClick={retryTemplateSettings}>
              <Settings size={13} /> <span>No se pudo cargar la plantilla</span> <strong>Reintentar</strong>
            </button>
          ) : (
            <button type="button" className="paper-template-settings" disabled={!templateSettingsLoaded} onClick={(event) => onConfigureTemplate(event.currentTarget)}><Settings size={13} /> Plantilla</button>
          )}
          {!isPrescription ? (
            <button type="button" className="paper-add-section" onClick={addSection}><Plus size={13} /> Agregar sección</button>
          ) : (
            <button
              type="button"
              className="paper-add-section"
              onClick={toggleFrame}
            >
              <Eye size={13} />
              {frameHidden ? "Mostrar encuadre" : "Ocultar encuadre"}
            </button>
          )}
          <div className="typography-tools" aria-label="Tipografía del documento">
            <TypographyControl
              label="Tamaño del contenido"
              value={documentFontSize}
              kind="body"
              canDecrease={canDecreaseDocumentFontSize}
              canIncrease={canIncreaseDocumentFontSize}
              onDecrease={decreaseDocumentFontSize}
              onIncrease={increaseDocumentFontSize}
            />
            <TypographyControl
              label="Tamaño de firma y fecha"
              value={signoffFontSize}
              kind="signoff"
              canDecrease={canDecreaseSignoffFontSize}
              canIncrease={canIncreaseSignoffFontSize}
              onDecrease={decreaseSignoffFontSize}
              onIncrease={increaseSignoffFontSize}
            />
          </div>
        </div>
      </div>
      <article style={paperStyle} className={`clinical-paper document-paper ${isPrescription ? "rx-paper" : ""}`}>
        <div className="paper-brand">
          <div><span>Servicio de Salud Metropolitano Oriente</span><strong>Hospital Hanga Roa</strong></div>
          <img src="/hhr-logo.svg" alt="Hospital Hanga Roa" width={54} height={54} />
        </div>
        <h2>
          {editingTitle ? (
            <input
              id="document-title"
              className="paper-title-input"
              aria-label="Título del documento"
              autoFocus
              value={documentTitle}
              onBlur={() => setEditingTitle(false)}
              onChange={(event) => {
                setDocumentTitle(event.target.value);
                markDirty();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
              }}
            />
          ) : (
            <button type="button" className="preview-edit-target paper-title-edit" onClick={() => setEditingTitle(true)}>{visibleTitle.toUpperCase()}</button>
          )}
        </h2>
        <div className="paper-rule" />
        <section>
          <div className="paper-patient-lines">
            <p><b>Nombre:</b> <button type="button" className="preview-edit-target" onClick={() => onEditRequest("patient-first-names")}>{patientFullName(patient) || "—"}</button></p>
            <p><b>RUT:</b> <button type="button" className="preview-edit-target" onClick={() => onEditRequest("patient-rut")}>{patient.rut || "—"}</button></p>
            <p><b>Fecha de nacimiento:</b> <button type="button" className="preview-edit-target" onClick={() => onEditRequest("patient-birth-date")}>{formatStoredDate(patient.birthDate) || "—"}</button></p>
          </div>
        </section>
        {sections.map((section, index) => (
          <section className={`paper-editable-section${section.id === "prescripcion" ? " rx-body" : ""}`} key={section.id}>
            <div className="paper-section-heading">
              {section.id === "prescripcion" ? (
                <h3>Rp.</h3>
              ) : (
                <AutoGrowingTextarea
                  id={`section-title-${section.id}`}
                  className="paper-section-title-input print-hide"
                  label={`Título de la sección ${index + 1}`}
                  minHeight={26}
                  rows={1}
                  resizeKey={documentFontSize}
                  value={section.title}
                  placeholder="Título de la sección"
                  onChange={(value) => updateSection(section.id, { title: value })}
                />
              )}
              {section.id !== "prescripcion" ? <h3 className="paper-section-title-print print-only">{section.title}</h3> : null}
              {section.id !== "prescripcion" ? (
                <SectionActions
                  canMoveDown={index < sections.length - 1}
                  canMoveUp={index > 0}
                  index={index}
                  label={section.title || `sección ${index + 1}`}
                  onMove={moveSection}
                  onRemove={() => removeSection(section.id)}
                />
              ) : null}
            </div>
            <AutoGrowingTextarea
              id={`section-${section.id}`}
              className={`paper-section-body print-hide${!section.body ? " paper-empty" : ""}`}
              label={section.id === "prescripcion" ? "Prescripción" : `Contenido de ${section.title || `sección ${index + 1}`}`}
              resizeKey={documentFontSize}
              value={section.body}
              placeholder={section.id === "prescripcion" ? "Escriba el o los fármacos e indicaciones" : "Escriba aquí…"}
              onChange={(value) => updateSection(section.id, { body: value })}
            />
            <div className={`paper-section-body-print print-only${!section.body ? " paper-empty" : ""}`}>{section.body || (section.id === "prescripcion" ? " " : "—")}</div>
          </section>
        ))}
        <div className="signoff-zone">
          <div className="asset-canvas">
            {([["signature", placedSignature], ["stamp", placedStamp]] as const).map(([kind, asset]) => asset ? (
              <PlacedDocumentAsset key={kind} asset={asset} kind={kind} moveSignature={moveSignature} startSignatureMove={startSignatureMove} updatePlacedImage={updatePlacedImage} />
            ) : null)}
          </div>
          <div className="signoff">
            {signer.name ? (
              <button type="button" className="signer-lines preview-edit-target" onClick={() => onEditRequest("professional-name")}>
                <strong>{signer.name}</strong>
                {signer.specialty ? <span>{signer.specialty}</span> : null}
                {signer.rut ? <span>RUT: {signer.rut}</span> : null}
              </button>
            ) : null}
            <button type="button" className="paper-date preview-edit-target" onClick={() => onEditRequest("document-issue-date")}>Fecha: {formatStoredDate(issueDate)}</button>
          </div>
        </div>
        {isPrescription && !frameHidden ? <div className="rx-frame">RECETA MÉDICA EXTERNA</div> : null}
      </article>
    </section>
  );
}

function SectionActions({
  canMoveDown,
  canMoveUp,
  index,
  label,
  onMove,
  onRemove,
}: {
  canMoveDown: boolean;
  canMoveUp: boolean;
  index: number;
  label: string;
  onMove: DocumentWorkspace["moveSection"];
  onRemove: () => void;
}) {
  const closeMenu = (target: EventTarget & HTMLButtonElement) => {
    target.closest("details")?.removeAttribute("open");
  };
  return (
    <details className="section-actions-menu paper-section-actions print-hide">
      <summary aria-label={`Opciones de ${label}`}><MoreHorizontal size={16} /></summary>
      <div>
        <button type="button" disabled={!canMoveUp} onClick={(event) => { onMove(index, -1); closeMenu(event.currentTarget); }}><ArrowUp size={14} /> Mover arriba</button>
        <button type="button" disabled={!canMoveDown} onClick={(event) => { onMove(index, 1); closeMenu(event.currentTarget); }}><ArrowDown size={14} /> Mover abajo</button>
        <button type="button" className="section-delete" onClick={(event) => { onRemove(); closeMenu(event.currentTarget); }}><Trash2 size={14} /> Eliminar</button>
      </div>
    </details>
  );
}

function AutoGrowingTextarea({
  className,
  id,
  label,
  minHeight = 76,
  onChange,
  placeholder,
  resizeKey,
  rows,
  value,
}: {
  className: string;
  id: string;
  label: string;
  minHeight?: number;
  onChange: (value: string) => void;
  placeholder: string;
  resizeKey: number;
  rows?: number;
  value: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    const resize = () => {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.max(minHeight, textarea.scrollHeight)}px`;
    };
    resize();
    let lastWidth = textarea.clientWidth;
    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = entry.contentRect.width;
      if (nextWidth === lastWidth) return;
      lastWidth = nextWidth;
      resize();
    });
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [minHeight, resizeKey, value]);
  return (
    <textarea
      ref={ref}
      id={id}
      className={className}
      aria-label={label}
      rows={rows}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
