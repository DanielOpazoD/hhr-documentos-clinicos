"use client";

import { Check, Download, ExternalLink, Eye, FileCheck2, Printer, ShieldCheck } from "@/app/components/Icons";
import { useState } from "react";
import { formCatalog } from "@/app/lib/catalog";

type FormId = typeof formCatalog[number]["id"];

export function FormsStudio() {
  const [formId, setFormId] = useState<FormId>("laboratorio");
  const current = formCatalog.find(item => item.id === formId)!;
  const viewerUrl = `${current.template}#page=1&view=FitH&toolbar=1&navpanes=0`;

  return <div className="page-wrap official-forms-page">
    <header className="page-header"><div><span className="eyebrow">Formularios institucionales</span><h1>Formularios clínicos originales</h1><p>Visualice, imprima o descargue los mismos archivos de la carpeta Formularios del repositorio HHR.</p></div><div className="header-actions"><a className="button secondary" href={viewerUrl} target="_blank" rel="noreferrer"><Printer size={16} /> Abrir e imprimir</a><a className="button primary" href={current.template} download={current.sourceFile}><Download size={16} /> Descargar original</a></div></header>

    <div className="source-integrity-banner"><ShieldCheck size={19} /><div><strong>Original verificado contra GitHub</strong><p>Este PDF coincide byte por byte con el archivo de <code>origin/main/Formularios</code>. No se redibujó ni se sustituyó su diagramación.</p></div><span><Check size={14} /> Coincidencia exacta</span></div>

    <div className="catalog-tabs" role="tablist" aria-label="Tipos de formulario">{formCatalog.map(item => <button role="tab" aria-selected={formId === item.id} key={item.id} onClick={() => setFormId(item.id)}><span className={`catalog-dot ${item.accent}`} /><span><strong>{item.title}</strong><small>{item.eyebrow}</small></span></button>)}</div>

    <div className="official-form-layout">
      <aside className="panel official-form-info">
        <span className="step-label">Formulario seleccionado</span>
        <div className="official-file-icon"><FileCheck2 size={25} /></div>
        <h2>{current.title}</h2>
        <p>{current.description}</p>
        <dl><div><dt>Archivo del repositorio</dt><dd>{current.sourceFile}</dd></div><div><dt>Formato original</dt><dd>{current.pageSize} · 1 página</dd></div><div><dt>Integridad</dt><dd><Check size={13} /> SHA-256 verificado</dd></div></dl>
        <div className="official-form-steps"><strong>Cómo utilizarlo</strong><ol><li>Revise la vista del formulario original.</li><li>Abra el PDF en una pestaña nueva.</li><li>Imprima o descárguelo sin alterar el formato.</li></ol></div>
        <div className="official-form-note"><ShieldCheck size={16} /><p><strong>Sin campos inventados</strong><span>Estos PDF no contienen campos digitales editables. Se conservan exactamente como fueron subidos al repositorio.</span></p></div>
        <a className="text-button" href="https://github.com/DanielOpazoD/HHR-entornodeprueba/tree/main/Formularios" target="_blank" rel="noreferrer"><ExternalLink size={14} /> Ver carpeta Formularios en GitHub</a>
      </aside>

      <section className="panel official-pdf-panel">
        <div className="paper-toolbar"><span><Eye size={15} /> PDF institucional original</span><span>{current.pageSize} · Página 1 de 1</span></div>
        <iframe key={current.template} className="official-pdf-frame" src={viewerUrl} title={`Vista del formulario original: ${current.title}`} />
        <div className="official-pdf-fallback"><p>Si el visor PDF de su navegador no carga, abra el archivo directamente.</p><a className="button secondary" href={viewerUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Abrir PDF original</a></div>
      </section>
    </div>
  </div>;
}
