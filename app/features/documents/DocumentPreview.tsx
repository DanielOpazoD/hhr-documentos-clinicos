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
>;

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
}: Props) {
  const paperStyle = { "--document-font-size": `${documentFontSize}px` } as CSSProperties;
  return (
    <section id="document-preview" className={`paper-panel ${mobileView === "preview" ? "mobile-visible" : "mobile-hidden"}`}>
      <div className="paper-toolbar print-hide">
        <span><span className={`status-pill ${status.toLowerCase()}`}>{status}</span> v{version}</span>
        <span>{documentFontSize} px</span>
      </div>
      <article style={paperStyle} className={`clinical-paper document-paper ${templateId === "receta_externa" ? "prescription-paper" : ""}`}>
        <div className="paper-brand">
          <div><span>Servicio de Salud Metropolitano Oriente</span><strong>Hospital Hanga Roa</strong></div>
          <NextImage src="/hhr-logo.svg" alt="Hospital Hanga Roa" width={54} height={54} />
        </div>
        <h2>{visibleTitle.toUpperCase()}</h2>
        <div className="paper-rule" />
        <section>
          <div className="paper-patient-lines">
            <p><b>Nombre:</b> {patientFullName(patient) || "—"}</p>
            <p><b>RUT:</b> {patient.rut || "—"}</p>
            <p><b>Fecha de nacimiento:</b> {formatStoredDate(patient.birthDate) || "—"}</p>
          </div>
        </section>
        {sections.map((section) => (
          <section className={section.id === "prescripcion" ? "paper-prescription" : undefined} key={section.id}>
            <h3>{section.title}</h3>
            {section.body
              ? section.body.split("\n").map((line, index) => <p key={index}>{line || " "}</p>)
              : <p className={`paper-empty ${section.id === "prescripcion" ? "prescription-empty" : ""}`}>{section.id === "prescripcion" ? " " : "—"}</p>}
          </section>
        ))}
        {(placedSignature || placedStamp || signer.name) ? (
          <div className="signature-placement-zone">
            {placedSignature ? <PlacedImage asset={placedSignature} kind="signature" moveSignature={moveSignature} startSignatureMove={startSignatureMove} /> : null}
            {placedStamp ? <PlacedImage asset={placedStamp} kind="stamp" moveSignature={moveSignature} startSignatureMove={startSignatureMove} /> : null}
            {signer.name ? (
              <div className="document-signer">
                <strong>{signer.name}</strong>
                {signer.specialty ? <span>{signer.specialty}</span> : null}
                {signer.rut ? <span>RUT: {signer.rut}</span> : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {templateId === "receta_externa" ? <div className="prescription-warning">RECETA MÉDICA EXTERNA</div> : null}
        <p className="paper-date">Fecha: {formatStoredDate(issueDate)}</p>
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
