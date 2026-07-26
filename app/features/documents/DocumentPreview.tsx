import NextImage from "next/image";
import { formatStoredDate } from "./formatters";
import { patientFullName } from "./identity";
import type { DocumentWorkspace } from "./use-document-workspace";

type Props = Pick<
  DocumentWorkspace,
  | "issueDate"
  | "mobileView"
  | "moveSignature"
  | "patient"
  | "placedSignature"
  | "sections"
  | "signer"
  | "status"
  | "templateId"
  | "version"
  | "visibleTitle"
>;

export function DocumentPreview({
  issueDate,
  mobileView,
  moveSignature,
  patient,
  placedSignature,
  sections,
  signer,
  status,
  templateId,
  version,
  visibleTitle,
}: Props) {
  return (
    <section id="document-preview" className={`paper-panel ${mobileView === "preview" ? "mobile-visible" : "mobile-hidden"}`}>
      <div className="paper-toolbar print-hide">
        <span><span className={`status-pill ${status.toLowerCase()}`}>{status}</span> v{version}</span>
      </div>
      <article className={`clinical-paper document-paper ${templateId === "receta_externa" ? "prescription-paper" : ""}`}>
        <div className="paper-brand">
          <div><span>Servicio de Salud Metropolitano Oriente</span><strong>Hospital Hanga Roa</strong></div>
          <NextImage src="/hhr-logo.svg" alt="Hospital Hanga Roa" width={54} height={54} />
        </div>
        <h2>{visibleTitle.toUpperCase()}</h2>
        <div className="paper-rule" />
        <section>
          <h3>Paciente</h3>
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
        {placedSignature ? (
          <div
            className="placed-signature"
            style={{ left: `${placedSignature.x}%`, top: `${placedSignature.y}%`, width: `${placedSignature.width}%` }}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              event.preventDefault();
            }}
            onPointerMove={moveSignature}
          >
            <span className="signature-drag-handle print-hide">Mover</span>
            <NextImage
              src={placedSignature.imageUrl}
              alt={`Firma de ${placedSignature.professionalName}`}
              width={220}
              height={90}
              draggable={false}
              unoptimized
            />
            <strong>{placedSignature.professionalName}</strong>
            {placedSignature.specialty ? <span>{placedSignature.specialty}</span> : null}
            {placedSignature.professionalRut ? <span>RUT: {placedSignature.professionalRut}</span> : null}
          </div>
        ) : signer.name ? (
          <div className="document-signer">
            <strong>{signer.name}</strong>
            {signer.specialty ? <span>{signer.specialty}</span> : null}
            {signer.rut ? <span>RUT: {signer.rut}</span> : null}
          </div>
        ) : null}
        {templateId === "receta_externa" ? <div className="prescription-warning">RECETA MÉDICA EXTERNA</div> : null}
        <p className="paper-date">Fecha: {formatStoredDate(issueDate)}</p>
      </article>
    </section>
  );
}
