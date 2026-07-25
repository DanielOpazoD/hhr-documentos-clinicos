"use client";

import { Check, ChevronDown, Download, FileText, GripVertical, Printer, RotateCcw, Save, ShieldCheck } from "@/app/components/Icons";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { demoPatients, documentTemplates, type DocumentStatus } from "@/app/lib/catalog";
import { downloadClinicalPdf } from "@/app/lib/client-pdf";

type Section = { id: string; title: string; body: string };
type StoredDocument = { id: string; templateId: string; title: string; patientName: string; patientRutMasked: string; status: DocumentStatus; version: number; updatedAt: string; demo?: boolean };
type PatientSnapshot = { name: string; rut: string; birthDate: string; age: number | null; insurance: string };

function formatStoredDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}-${month}-${year}`;
}

const initialSections: Record<string, Section[]> = {
  certificado_general: [{ id: "motivo", title: "Certificación", body: "Se certifica que la persona individualizada se encuentra bajo control médico." }, { id: "vigencia", title: "Observaciones", body: "Se extiende el presente certificado a solicitud de la persona interesada." }],
  certificado_antecedentes: [{ id: "antecedentes", title: "Antecedentes mórbidos", body: "Hipertensión arterial en control." }, { id: "tratamiento", title: "Tratamiento farmacológico", body: "Tratamiento habitual según indicación y control médico." }],
  informe_medico: [{ id: "historia", title: "Historia clínica", body: "Antecedentes relevantes y motivo de evaluación." }, { id: "examen", title: "Examen y resultados", body: "Hallazgos clínicos de demostración." }, { id: "diagnostico", title: "Diagnóstico", body: "Diagnóstico sujeto a revisión profesional." }, { id: "plan", title: "Plan", body: "Indicaciones y seguimiento propuesto." }],
  epicrisis_demo: [{ id: "ingreso", title: "Motivo de ingreso", body: "Resumen de demostración." }, { id: "evolucion", title: "Evolución", body: "Información pendiente de verificación." }, { id: "alta", title: "Plan de egreso", body: "Control e indicaciones." }],
  receta_externa: [{ id: "medicamento", title: "Medicamento no controlado", body: "Nombre genérico · Forma farmacéutica · Concentración" }, { id: "indicacion", title: "Indicación", body: "Dosis, vía, frecuencia, duración y cantidad." }],
  documento_libre: [{ id: "contenido", title: "Contenido", body: "Escriba el contenido del documento." }],
};

export function DocumentStudio() {
  const [templateId, setTemplateId] = useState("certificado_antecedentes");
  const [patientId, setPatientId] = useState(demoPatients[0].id);
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [sections, setSections] = useState<Section[]>(initialSections.certificado_antecedentes);
  const [status, setStatus] = useState<DocumentStatus>("Borrador");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [version, setVersion] = useState(1);
  const [storedDocuments, setStoredDocuments] = useState<StoredDocument[]>([]);
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const [patientSnapshot, setPatientSnapshot] = useState<PatientSnapshot | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const patient = demoPatients.find(item => item.id === patientId)!;
  const template = documentTemplates.find(item => item.id === templateId)!;
  const displayedPatient = patientSnapshot ?? patient;
  const title = customTitle?.toUpperCase() ?? (templateId === "receta_externa" ? "RECETA MÉDICA EXTERNA" : templateId.startsWith("certificado") ? "CERTIFICADO MÉDICO" : template.name.toUpperCase());
  const canFinalize = status === "Revisado";
  const issueDate = new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric", timeZone: "Pacific/Easter" });

  async function persist(nextStatus: DocumentStatus = status) {
    const response = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: documentId ?? undefined, templateId, title: customTitle ?? template.name, patientName: displayedPatient.name, patientRutMasked: displayedPatient.rut, status: nextStatus, content: { sections, professional: "Dra. Valentina Rojas" } }) });
    if (!response.ok) return;
    const data = await response.json();
    setDocumentId(data.document.id); setVersion(data.document.version); setSavedAt(new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })); setStatus(nextStatus); setDirty(false);
    void refreshDocuments();
  }

  async function refreshDocuments() {
    const response = await fetch("/api/documents");
    if (!response.ok) return;
    const data = await response.json();
    setStoredDocuments((data.documents ?? []).filter((item: StoredDocument) => !item.demo));
  }

  async function openDocument(id: string) {
    setLoadError(null);
    const response = await fetch(`/api/documents?id=${encodeURIComponent(id)}`);
    const data = await response.json();
    if (!response.ok) { setLoadError(data.error ?? "No se pudo abrir el documento."); return; }
    const stored = data.document as StoredDocument & { content?: { sections?: Array<{ id?: string; title?: string; body?: string; text?: string }> } };
    const nextTemplate = documentTemplates.some(item => item.id === stored.templateId) ? stored.templateId : "documento_libre";
    const nextSections = (stored.content?.sections ?? []).map((section, index) => ({ id: section.id ?? `section-${index + 1}`, title: section.title ?? `Sección ${index + 1}`, body: section.body ?? section.text ?? "" }));
    setTemplateId(nextTemplate);
    setSections(nextSections.length ? nextSections : initialSections[nextTemplate].map(section => ({ ...section })));
    setCustomTitle(stored.title);
    setPatientSnapshot({ name: stored.patientName, rut: stored.patientRutMasked, birthDate: "", age: null, insurance: "Por confirmar" });
    setStatus(stored.status);
    setDocumentId(stored.id);
    setVersion(stored.version);
    setSavedAt(new Date(stored.updatedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }));
    setDirty(false);
    window.history.replaceState({}, "", `/documentos?document=${encodeURIComponent(stored.id)}`);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshDocuments();
      const requested = new URLSearchParams(window.location.search).get("document");
      if (requested) void openDocument(requested);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persist("Borrador"), 1200);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, sections, templateId, patientId]);

  function changeTemplate(id: string) { setTemplateId(id); setSections(initialSections[id].map(section => ({ ...section }))); setStatus("Borrador"); setDocumentId(null); setCustomTitle(null); setPatientSnapshot(null); setVersion(1); setDirty(true); window.history.replaceState({}, "", "/documentos"); }
  function changePatient(id: string) { setPatientId(id); setPatientSnapshot(null); setDirty(true); }
  function updateSection(id: string, body: string) { setSections(value => value.map(section => section.id === id ? { ...section, body } : section)); setDirty(true); if (status !== "Borrador") setStatus("Borrador"); }
  function move(index: number, direction: -1 | 1) { const next = [...sections]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; setSections(next); setDirty(true); }
  async function downloadPdf() { await downloadClinicalPdf({ fileName: `${templateId}-demostracion.pdf`, title, subtitle: "Hospital Hanga Roa · Documento clínico demostrativo", sections: [{ title: "Antecedentes del paciente", body: `${displayedPatient.name}\nRUT: ${displayedPatient.rut}\nFecha de nacimiento: ${displayedPatient.birthDate ? formatStoredDate(displayedPatient.birthDate) : "Por confirmar"}\nEdad: ${displayedPatient.age ?? "Por confirmar"}${displayedPatient.age ? " años" : ""}\nPrevisión: ${displayedPatient.insurance}` }, ...sections.map(section => ({ title: section.title, body: section.body }))], footer: templateId === "receta_externa" ? "PROTOTIPO · NO VÁLIDO PARA DISPENSACIÓN" : "Firma de ejemplo · Prototipo de evaluación" }); }

  return <div className="page-wrap studio-page"><header className="page-header"><div><span className="eyebrow">Editor por plantillas</span><h1>Documentos médicos</h1><p>El contenido se guarda como borrador y nunca se emite sin revisión humana.</p></div><div className="header-actions"><button className="button secondary" onClick={() => window.print()}><Printer size={16} /> Imprimir</button><button className="button primary" onClick={() => void downloadPdf()}><Download size={16} /> Descargar PDF</button></div></header>
    <section className="saved-documents print-hide"><div><span className="eyebrow">Guardados</span><strong>{storedDocuments.length ? "Documentos recientes" : "Aún no hay documentos guardados"}</strong></div>{storedDocuments.length ? <div className="saved-document-list">{storedDocuments.slice(0, 5).map(item => <button className={item.id === documentId ? "active" : ""} key={item.id} onClick={() => void openDocument(item.id)}><FileText size={16} /><span><strong>{item.title}</strong><small>{item.patientName} · v{item.version}</small></span><em>{item.status}</em></button>)}</div> : <small>Los borradores creados aquí o con IA aparecerán en esta lista.</small>}</section>{loadError ? <p className="form-error standalone">{loadError}</p> : null}
    <div className="document-topbar print-hide"><label>Plantilla<div className="select-wrap"><select value={templateId} onChange={event => changeTemplate(event.target.value)}>{documentTemplates.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select><ChevronDown size={15} /></div></label><label>Paciente ficticio<div className="select-wrap"><select value={patientSnapshot ? "stored" : patientId} onChange={event => changePatient(event.target.value)}>{patientSnapshot ? <option value="stored">{patientSnapshot.name}</option> : null}{demoPatients.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select><ChevronDown size={15} /></div></label><div className="autosave"><span className="status-dot" /><div><strong>{dirty ? "Guardando…" : documentId ? "Borrador guardado" : "Nuevo documento"}</strong><small>{savedAt ? `Último guardado ${savedAt}` : "Se guarda al editar"}</small></div></div></div>
    <div className="studio-view-switch print-hide" role="tablist" aria-label="Vista del documento"><button role="tab" aria-selected={mobileView === "edit"} aria-controls="document-editor" onClick={() => setMobileView("edit")}>Editar</button><button role="tab" aria-selected={mobileView === "preview"} aria-controls="document-preview" onClick={() => setMobileView("preview")}>Vista previa</button></div>
    <div className="editor-layout document-editor-layout"><section id="document-editor" className={`editor-panel print-hide ${mobileView === "edit" ? "mobile-visible" : "mobile-hidden"}`}><div className="editor-section"><span className="step-label">Contenido editable</span><p className="helper-copy">Ordene las secciones y revise cada frase antes de finalizar.</p>{sections.map((section, index) => <div className="section-editor" key={section.id}><div><GripVertical size={16} /><label htmlFor={`section-${section.id}`}>{section.title}</label><span className="reorder-buttons"><button onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Subir ${section.title}`}>↑</button><button onClick={() => move(index, 1)} disabled={index === sections.length - 1} aria-label={`Bajar ${section.title}`}>↓</button></span></div><textarea id={`section-${section.id}`} value={section.body} onChange={event => updateSection(section.id, event.target.value)} /></div>)}</div><div className="workflow-panel"><div><span className={`workflow-step ${status === "Borrador" ? "active" : "done"}`}>1</span><p><strong>Borrador</strong><small>Editable y no emitido</small></p></div><div><span className={`workflow-step ${status === "Revisado" ? "active" : status === "Finalizado" ? "done" : ""}`}>2</span><p><strong>Revisado</strong><small>Control profesional</small></p></div><div><span className={`workflow-step ${status === "Finalizado" ? "active" : ""}`}>3</span><p><strong>Finalizado</strong><small>Versión cerrada</small></p></div><div className="workflow-actions">{status === "Borrador" && <button className="button primary" onClick={() => void persist("Revisado")}><ShieldCheck size={16} /> Marcar revisado</button>}{status === "Revisado" && <button className="button primary" onClick={() => void persist("Finalizado")} disabled={!canFinalize}><Check size={16} /> Finalizar</button>}{status !== "Borrador" && <button className="button secondary" onClick={() => void persist("Borrador")}><RotateCcw size={15} /> Volver a borrador</button>}<button className="icon-button" onClick={() => void persist()} aria-label="Guardar ahora"><Save size={17} /></button></div></div></section>
      <section id="document-preview" className={`paper-panel ${mobileView === "preview" ? "mobile-visible" : "mobile-hidden"}`}><div className="paper-toolbar print-hide"><span><span className={`status-pill ${status.toLowerCase()}`}>{status}</span> Versión {version}</span><span>Carta · 1 página</span></div><article className="clinical-paper document-paper"><div className="paper-brand"><div><span>Servicio de Salud</span><strong>Hospital Hanga Roa</strong></div><Image src="/hhr-logo.svg" alt="Hospital Hanga Roa" width={54} height={54} /></div><h2>{title}</h2><div className="paper-rule" /><p className="certificate-intro">El profesional que suscribe deja constancia de la información clínica indicada a continuación:</p><section><h3>Antecedentes del paciente</h3><div className="paper-patient-lines"><p><b>Nombre:</b> {displayedPatient.name}</p><p><b>RUT:</b> {displayedPatient.rut}</p><p><b>Fecha de nacimiento:</b> {displayedPatient.birthDate ? formatStoredDate(displayedPatient.birthDate) : "Por confirmar"}</p><p><b>Edad:</b> {displayedPatient.age ? `${displayedPatient.age} años` : "Por confirmar"}</p><p><b>Previsión:</b> {displayedPatient.insurance}</p></div></section>{sections.map(section => <section key={section.id}><h3>{section.title}</h3>{section.body.split("\n").map((line, index) => <p key={index}>{line || " "}</p>)}</section>)}<p className="certificate-close">Se extiende el presente documento a solicitud de la persona interesada, para los fines que estime convenientes.</p><p className="paper-date">Fecha: {issueDate}</p><div className="signature-block"><div className="signature-stroke">Firma de ejemplo</div><strong>Dra. Valentina Rojas</strong><span>Medicina interna</span><span>RUT: ••.•••.•••-•</span><em>Prototipo</em></div>{templateId === "receta_externa" && <div className="prescription-warning">PROTOTIPO · NO VÁLIDO PARA DISPENSACIÓN</div>}</article></section>
    </div></div>;
}
