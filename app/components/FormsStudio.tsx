"use client";

import { Download, Printer } from "@/app/components/Icons";
import { PageHeader } from "@/app/components/VisualPrimitives";
import { useState } from "react";
import type { FormCatalogItem } from "@/app/lib/server/form-catalog";

type FormId = FormCatalogItem["id"];

export function FormsStudio({ catalog }: { catalog: readonly FormCatalogItem[] }) {
  const [formId, setFormId] = useState<FormId>("laboratorio");
  const current = catalog.find(item => item.id === formId) ?? catalog[0];
  if (!current) return null;
  const isPdf = current.template.endsWith(".pdf");
  const viewerUrl = `${current.template}#page=1&view=FitH&toolbar=1&navpanes=0`;

  return <div className="page-wrap official-forms-page">
    <PageHeader
      className="compact-page-header"
      title="Formularios"
      description="Seleccione y descargue formularios institucionales en su formato original."
      actions={isPdf ? <>
        <a className="button primary" href={viewerUrl} target="_blank" rel="noreferrer"><Printer size={16} /> Abrir e imprimir</a>
        <a className="button secondary" href={current.template} download={current.sourceFile}><Download size={16} /> Descargar</a>
      </> : <a className="button primary" href={current.template} download={current.sourceFile}><Download size={16} /> Descargar Word</a>}
    />

    <div className="forms-workspace">
      <nav className="forms-navigation" aria-label="Formularios disponibles">
        <strong>Formularios</strong>
        {catalog.map(item => <button aria-current={formId === item.id ? "page" : undefined} key={item.id} onClick={() => setFormId(item.id)}>
          <span className={`catalog-dot ${item.accent}`} />
          <span><strong>{item.title}</strong><small>{item.eyebrow}</small></span>
        </button>)}
      </nav>

      <section className="panel official-pdf-panel">
        <div className="paper-toolbar"><span>{current.title}</span><span>{current.pageSize}</span></div>
        {isPdf ? <>
          <iframe key={current.template} className="official-pdf-frame" src={viewerUrl} title={`Vista del formulario: ${current.title}`} />
          <div className="official-pdf-fallback"><a className="button secondary" href={viewerUrl} target="_blank" rel="noreferrer">Abrir PDF</a></div>
        </> : <div className="empty-state" role="status"><strong>Documento Word oficial listo para descargar</strong></div>}
      </section>
    </div>
  </div>;
}
