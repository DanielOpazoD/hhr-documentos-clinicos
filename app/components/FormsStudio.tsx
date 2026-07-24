"use client";

import { Check, Download, ExternalLink, Eye, Printer, Save } from "@/app/components/Icons";
import { useMemo, useState } from "react";
import { demoPatients, examGroups, formCatalog, imagingGroups } from "@/app/lib/catalog";
import { downloadClinicalPdf } from "@/app/lib/client-pdf";

type FormId = typeof formCatalog[number]["id"];

export function FormsStudio() {
  const [formId, setFormId] = useState<FormId>("laboratorio");
  const [patientId, setPatientId] = useState(demoPatients[0].id);
  const [selectedItems, setSelectedItems] = useState<string[]>(["Hemograma", "Glicemia"]);
  const [diagnosis, setDiagnosis] = useState(demoPatients[0].diagnosis);
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState(false);
  const [consent, setConsent] = useState("si");
  const [contrast, setContrast] = useState("sin contraste");
  const current = formCatalog.find(item => item.id === formId)!;
  const patient = demoPatients.find(item => item.id === patientId)!;
  const groups = formId === "imagenologia" ? imagingGroups : examGroups;
  const isChecklist = formId === "laboratorio" || formId === "imagenologia";
  const summary = useMemo(() => selectedItems.length ? selectedItems.join(", ") : "Sin prestaciones seleccionadas", [selectedItems]);

  function selectPatient(id: string) { const next = demoPatients.find(item => item.id === id)!; setPatientId(id); setDiagnosis(next.diagnosis); }
  function toggleItem(item: string) { setSaved(false); setSelectedItems(value => value.includes(item) ? value.filter(entry => entry !== item) : [...value, item]); }
  async function saveDraft() {
    const response = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId: `formulario_${formId}`, title: current.title, patientName: patient.name, patientRutMasked: patient.rut, status: "Borrador", content: { diagnosis, notes, selectedItems, consent, contrast } }) });
    setSaved(response.ok);
  }
  async function downloadPdf() {
    await downloadClinicalPdf({ fileName: `${formId}-demostracion.pdf`, title: current.title, subtitle: "Hospital Hanga Roa · Prototipo", sections: [
      { title: "Paciente", body: `${patient.name}\nRUT: ${patient.rut} · Edad: ${patient.age} años · ${patient.insurance}` },
      { title: "Diagnóstico", body: diagnosis },
      { title: isChecklist ? "Prestaciones solicitadas" : "Antecedentes del formulario", body: isChecklist ? summary : notes || "Información registrada en el formulario." },
      { title: "Profesional", body: "Dra. Valentina Rojas · Medicina interna\nFirma de ejemplo" },
    ] });
  }

  return <div className="page-wrap studio-page">
    <header className="page-header"><div><span className="eyebrow">Plantillas institucionales</span><h1>Formularios clínicos</h1><p>Complete datos ficticios, revise la hoja e imprima una versión limpia.</p></div><div className="header-actions"><a className="button secondary" href={current.template} target="_blank"><ExternalLink size={16} /> Ver original</a><button className="button secondary" onClick={() => window.print()}><Printer size={16} /> Imprimir</button><button className="button primary" onClick={() => void downloadPdf()}><Download size={16} /> Descargar PDF</button></div></header>
    <div className="catalog-tabs" role="tablist" aria-label="Tipos de formulario">{formCatalog.map(item => <button role="tab" aria-selected={formId === item.id} key={item.id} onClick={() => { setFormId(item.id); setSelectedItems([]); setSaved(false); }}><span className={`catalog-dot ${item.accent}`} /><span><strong>{item.title}</strong><small>{item.eyebrow}</small></span></button>)}</div>
    <div className="editor-layout">
      <section className="editor-panel print-hide"><div className="editor-section"><span className="step-label">01 · Identificación</span><label>Paciente ficticio<select value={patientId} onChange={event => selectPatient(event.target.value)}>{demoPatients.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><div className="field-pair"><label>RUT<input value={patient.rut} disabled /></label><label>Previsión<input value={patient.insurance} disabled /></label></div><label>Diagnóstico<input value={diagnosis} onChange={event => { setDiagnosis(event.target.value); setSaved(false); }} /></label></div>
        {isChecklist ? <div className="editor-section"><span className="step-label">02 · Selección clínica</span>{Object.entries(groups).map(([group, items]) => <fieldset className="check-group" key={group}><legend>{group}</legend><div>{items.map(item => <label className="check-option" key={item}><input type="checkbox" checked={selectedItems.includes(item)} onChange={() => toggleItem(item)} /><span>{item}</span></label>)}</div></fieldset>)}{formId === "imagenologia" && <fieldset className="inline-options"><legend>Medio de contraste</legend>{["sin contraste", "con contraste"].map(value => <label key={value}><input type="radio" name="contrast" checked={contrast === value} onChange={() => setContrast(value)} /> {value}</label>)}</fieldset>}</div> : <div className="editor-section"><span className="step-label">02 · Antecedentes</span>{formId === "encuesta" ? <><label>Creatinina<input placeholder="Ej. 0,9 mg/dL" /></label><label>Alergias<textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Describa o indique no conocidas" /></label><div className="question-stack">{["¿Embarazo actual?", "¿Cirugías previas?", "¿Reacción a contraste?", "¿Premedicación indicada?"].map(question => <div key={question}><span>{question}</span><label><input type="radio" name={question} /> Sí</label><label><input type="radio" name={question} defaultChecked /> No</label></div>)}</div></> : <><label>Procedimiento, sin siglas<input value={notes} onChange={event => setNotes(event.target.value)} placeholder="Nombre completo del procedimiento" /></label><fieldset className="inline-options"><legend>Decisión informada</legend><label><input type="radio" name="consent" checked={consent === "si"} onChange={() => setConsent("si")} /> Sí, doy mi consentimiento</label><label><input type="radio" name="consent" checked={consent === "no"} onChange={() => setConsent("no")} /> No doy mi consentimiento</label></fieldset><label>Representante o apoderado<input placeholder="Opcional" /></label></>}</div>}
        <div className="sticky-actions"><span>{saved ? <><Check size={15} /> Borrador guardado</> : "Cambios pendientes"}</span><button className="button primary" onClick={() => void saveDraft()}><Save size={16} /> Guardar borrador</button></div>
      </section>
      <section className="paper-panel"><div className="paper-toolbar print-hide"><span><Eye size={15} /> Vista previa · {formId === "consentimiento" ? "A4" : "Carta"}</span><span>Página 1 de 1</span></div><article className="clinical-paper"><div className="paper-brand"><div><span>Servicio de Salud</span><strong>Hospital Hanga Roa</strong></div><img src="/hhr-logo.svg" alt="Hospital Hanga Roa" /></div><h2>{current.title}</h2><div className="paper-rule" /><div className="paper-patient-grid"><p><b>Paciente:</b> {patient.name}</p><p><b>RUT:</b> {patient.rut}</p><p><b>Edad:</b> {patient.age} años</p><p><b>Previsión:</b> {patient.insurance}</p></div><p><b>Diagnóstico:</b> {diagnosis}</p>{isChecklist ? <div className="paper-groups">{Object.entries(groups).map(([group, items]) => <section key={group}><h3>{group}</h3>{items.map(item => <p key={item}><span className={selectedItems.includes(item) ? "paper-check checked" : "paper-check"}>{selectedItems.includes(item) ? "✓" : ""}</span>{item}</p>)}</section>)}</div> : <div className="paper-consent"><h3>{formId === "encuesta" ? "Antecedentes de seguridad" : "Declaración"}</h3><p>{formId === "encuesta" ? "La información registrada debe ser revisada por el equipo clínico antes del examen." : "Declaro haber recibido información suficiente sobre el procedimiento, sus objetivos, características y riesgos potenciales."}</p><p><span className="paper-check checked">✓</span>{consent === "si" ? "Acepta el procedimiento descrito" : "No acepta el procedimiento descrito"}</p></div>}<div className="paper-signatures"><div><span>Firma paciente o apoderado</span></div><div><b>Dra. Valentina Rojas</b><span>Firma de ejemplo · Prototipo</span></div></div><small className="paper-warning">Prototipo de evaluación · No válido para uso clínico</small></article></section>
    </div>
  </div>;
}
