import NextImage from "next/image";
import type { CSSProperties } from "react";
import { GripVertical } from "@/app/components/Icons";
import { formatStoredDate } from "./formatters";
import { patientFullName } from "./identity";
import type { PlacedSignature, SignatureAssetKind } from "./types";
import type { DocumentWorkspace } from "./use-document-workspace";

type Props = Pick<
  DocumentWorkspace,
  | "documentFontSize"
  | "issueDate"
  | "mobileView"
  | "moveSignature"
  | "patient"
  | "placedSignature"
  | "placedStamp"
  | "sections"
  | "signer"
  | "status"
  | "startSignatureMove"
  | "templateId"
  | "version"
  | "visibleTitle"
> & { onEditRequest: (fieldId: string) => void };

export function DocumentPreview({
  documentFontSize,
  issueDate,
  mobileView,
  moveSignature,
  patient,
  placedSignature,
  placedStamp,
  sections,
  signer,
  status,
  startSignatureMove,
  templateId,
  version,
  visibleTitle,
  onEditRequest,
}: Props) {
  const paperStyle = { "--document-font-size": `${documentFontSize}px` } as CSSProperties;
  return (
    <section id="document-preview" className={`paper-panel ${mobileView === "preview" ? "mobile-visible" : "mobile-hidden"}`}>
      <div className="paper-toolbar print-hide">
        <span><span className={`status-pill ${status.toLowerCase()}`}>{status}</span> v{version}</span>
        <span className="paper-edit-hint">Seleccione un campo para editar · {documentFontSize} px</span>
      </div>
      <article style={paperStyle} className={`clinical-paper document-paper ${templateId === "receta_externa" ? "prescription-paper" : ""}`}>
        <div className="paper-brand">
          <div><span>Servicio de Salud Metropolitano Oriente</span><strong>Hospital Hanga Roa</strong></div>
          <NextImage src="/hhr-logo.svg" alt="Hospital Hanga Roa" width={54} height={54} />
        </div>
        <h2><button type="button" className="preview-edit-target paper-title-edit" onClick={() => onEditRequest("document-title")}>{visibleTitle.toUpperCase()}</button></h2>
        <div className="paper-rule" />
        <section>
          <div className="paper-patient-lines">
            <p><b>Nombre:</b> <button type="button" className="preview-edit-target" onClick={() => onEditRequest("patient-first-names")}>{patientFullName(patient) || "—"}</button></p>
            <p><b>RUT:</b> <button type="button" className="preview-edit-target" onClick={() => onEditRequest("patient-rut")}>{patient.rut || "—"}</button></p>
            <p><b>Fecha de nacimiento:</b> <button type="button" className="preview-edit-target" onClick={() => onEditRequest("patient-birth-date")}>{formatStoredDate(patient.birthDate) || "—"}</button></p>
          </div>
        </section>
        {sections.map((section) => (
          <section className={section.id === "prescripcion" ? "paper-prescription" : undefined} key={section.id}>
            {/* "Rp." is fixed by the prescription template, so its heading opens the editable body. */}
            <h3><button type="button" className="preview-edit-target" onClick={() => onEditRequest(section.id === "prescripcion" ? `section-${section.id}` : `section-title-${section.id}`)}>{section.title}</button></h3>
            <button type="button" className={`preview-edit-target paper-section-edit ${!section.body ? "paper-empty" : ""}`} onClick={() => onEditRequest(`section-${section.id}`)}>
              {section.body
                ? section.body.split("\n").map((line, index) => <span key={index}>{line || " "}</span>)
                : <span className={section.id === "prescripcion" ? "prescription-empty" : undefined}>{section.id === "prescripcion" ? " " : "—"}</span>}
            </button>
          </section>
        ))}
        <div className="signature-placement-zone">
          <div className="signing-assets-canvas">
            {placedSignature ? <PlacedImage asset={placedSignature} kind="signature" moveSignature={moveSignature} startSignatureMove={startSignatureMove} /> : null}
            {placedStamp ? <PlacedImage asset={placedStamp} kind="stamp" moveSignature={moveSignature} startSignatureMove={startSignatureMove} /> : null}
          </div>
          <div className="document-signoff">
            {signer.name ? (
              <button type="button" className="document-signer preview-edit-target" onClick={() => onEditRequest("professional-name")}>
                <strong>{signer.name}</strong>
                {signer.specialty ? <span>{signer.specialty}</span> : null}
                {signer.rut ? <span>RUT: {signer.rut}</span> : null}
              </button>
            ) : null}
            <button type="button" className="paper-date preview-edit-target" onClick={() => onEditRequest("document-issue-date")}>Fecha: {formatStoredDate(issueDate)}</button>
          </div>
        </div>
        {templateId === "receta_externa" ? <div className="prescription-warning">RECETA MÉDICA EXTERNA</div> : null}
      </article>
    </section>
  );
}

function PlacedImage({
  asset,
  kind,
  moveSignature,
  startSignatureMove,
}: {
  asset: PlacedSignature;
  kind: SignatureAssetKind;
  moveSignature: DocumentWorkspace["moveSignature"];
  startSignatureMove: DocumentWorkspace["startSignatureMove"];
}) {
  const label = kind === "stamp" ? "timbre" : "firma";
  return (
    <div
      className={`placed-signature placed-asset-${kind}`}
      style={{ left: `${asset.x}%`, top: `${asset.y}%`, width: `${asset.width}%` }}
    >
      <button
        type="button"
        className="signature-drag-handle print-hide"
        aria-label={`Mover ${label}`}
        title={`Arrastrar ${label}`}
        onPointerDown={(event) => startSignatureMove(kind, event)}
        onPointerMove={(event) => moveSignature(kind, event)}
      >
        <GripVertical size={14} />
      </button>
      <NextImage
        src={asset.imageUrl}
        alt={`${kind === "stamp" ? "Timbre" : "Firma"} de ${asset.professionalName}`}
        width={220}
        height={90}
        draggable={false}
        unoptimized
      />
    </div>
  );
}
