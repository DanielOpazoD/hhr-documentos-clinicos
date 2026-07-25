"use client";

import { Download, Eye, Printer } from "@/app/components/Icons";
import { useState } from "react";
import { formCatalog } from "@/app/lib/catalog";

type FormId = typeof formCatalog[number]["id"];

export function FormsStudio() {
  const [formId, setFormId] = useState<FormId>("laboratorio");
  const current = formCatalog.find(item => item.id === formId)!;
  const viewerUrl = `${current.template}#page=1&view=FitH&toolbar=1&navpanes=0`;

  return <div className="page-wrap official-forms-page">
    <header className="page-header compact-page-header">
      <div><h1>Formularios</h1></div>
      <div className="header-actions">
        <a className="button secondary" href={viewerUrl} target="_blank" rel="noreferrer"><Printer size={16} /> Abrir e imprimir</a>
        <a className="button primary" href={current.template} download={current.sourceFile}><Download size={16} /> Descargar</a>
      </div>
    </header>

    <div className="forms-workspace">
      <nav className="forms-navigation" aria-label="Formularios disponibles">
        <strong>Formularios</strong>
        {formCatalog.map(item => <button aria-current={formId === item.id ? "page" : undefined} key={item.id} onClick={() => setFormId(item.id)}>
          <span className={`catalog-dot ${item.accent}`} />
          <span><strong>{item.title}</strong><small>{item.eyebrow}</small></span>
        </button>)}
      </nav>

      <section className="panel official-pdf-panel">
        <div className="paper-toolbar"><span><Eye size={15} /> {current.title}</span><span>{current.pageSize}</span></div>
        <iframe key={current.template} className="official-pdf-frame" src={viewerUrl} title={`Vista del formulario: ${current.title}`} />
        <div className="official-pdf-fallback"><a className="button secondary" href={viewerUrl} target="_blank" rel="noreferrer">Abrir PDF</a></div>
      </section>
    </div>
  </div>;
}
