"use client";

import { AlertTriangle, ArrowRight, Check, FileSearch, FileUp, Shield, Sparkles, Trash2 } from "@/app/components/Icons";
import { useRef, useState } from "react";

type AiEvidence = { page: number | null; excerpt: string; status: "explicito" | "ambiguo" | "no_encontrado" };
type AiSection = { title: string; text: string; evidence: AiEvidence[] };

const targets = [
  { id: "resumen", name: "Resumen clínico", text: "Síntesis estructurada y verificable" },
  { id: "informe", name: "Informe médico", text: "Historia, hallazgos y plan" },
  { id: "certificado", name: "Certificado", text: "Borrador breve con campos faltantes" },
  { id: "antecedentes", name: "Antecedentes y fármacos", text: "Extracción sin inferir dosis" },
];

export function AiStudio() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState("resumen");
  const [phase, setPhase] = useState(0);
  const [sections, setSections] = useState<AiSection[]>([]);
  const [source, setSource] = useState("");
  const [model, setModel] = useState("");
  const [promptVersion, setPromptVersion] = useState("");
  const [missingInformation, setMissingInformation] = useState<string[]>([]);
  const [safetyNotice, setSafetyNotice] = useState("");
  const [syntheticConfirmed, setSyntheticConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  async function analyze() {
    if (!file) return;
    setError(null); setCreated(false); setPhase(1);
    const form = new FormData(); form.set("file", file); form.set("target", target); form.set("syntheticConfirmed", String(syntheticConfirmed));
    setPhase(2);
    const response = await fetch("/api/ai/import", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok) { setError(data.error ?? "No se pudo analizar."); setPhase(0); return; }
    setPhase(3); setSections(data.sections); setSource(data.source); setModel(data.model); setPromptVersion(data.promptVersion); setMissingInformation(data.missingInformation ?? []); setSafetyNotice(data.safetyNotice ?? "");
  }
  async function createDraft() {
    const result = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId: `ia_${target}`, title: targets.find(item => item.id === target)?.name, patientName: "Paciente ficticio por confirmar", patientRutMasked: "••.•••.•••-•", status: "Borrador", content: { source, sections, simulated: false, model, promptVersion, missingInformation, safetyNotice } }) });
    setCreated(result.ok);
  }

  return <div className="page-wrap"><header className="page-header"><div><span className="eyebrow">Asistencia con trazabilidad</span><h1>Importar con IA</h1><p>Convierta un archivo ficticio en un borrador editable. Ningún resultado se emite automáticamente.</p></div><span className="simulation-badge live"><Sparkles size={15} /> IA real</span></header>
    <div className="ai-guardrail"><Shield size={21} /><div><strong>Revisión profesional obligatoria</strong><p>El sistema no inventa diagnósticos, dosis, fechas ni identidad del profesional. Todo dato no verificable se marca como incierto.</p></div></div>
    {!sections.length ? <div className="ai-layout"><section className="panel ai-upload"><div className="panel-header"><div><span className="eyebrow">Paso 1</span><h2>Archivo de origen</h2></div></div><input ref={inputRef} type="file" hidden accept=".pdf,.docx,.jpg,.jpeg,.png" onChange={event => { setFile(event.target.files?.[0] ?? null); setSyntheticConfirmed(false); }} /><button className={file ? "drop-zone has-file" : "drop-zone"} onClick={() => inputRef.current?.click()}><span><FileUp size={28} /></span>{file ? <><strong>{file.name}</strong><small>{Math.round(file.size / 1024)} KB · Listo para procesar</small></> : <><strong>Seleccione PDF, DOCX o imagen</strong><small>Máximo 15 MB · Sólo datos ficticios o desidentificados</small></>}</button>{file && <button className="text-button danger" onClick={() => { setFile(null); setSyntheticConfirmed(false); }}><Trash2 size={14} /> Quitar archivo</button>}<label className="synthetic-confirm"><input type="checkbox" checked={syntheticConfirmed} onChange={event => setSyntheticConfirmed(event.target.checked)} /><span><strong>Confirmo que no contiene datos clínicos reales</strong><small>El archivo usa información ficticia o fue desidentificado antes de subirlo.</small></span></label></section><section className="panel ai-target"><div className="panel-header"><div><span className="eyebrow">Paso 2</span><h2>Resultado deseado</h2></div></div><div className="target-options">{targets.map(item => <label className={target === item.id ? "selected" : ""} key={item.id}><input type="radio" name="target" checked={target === item.id} onChange={() => setTarget(item.id)} /><span><strong>{item.name}</strong><small>{item.text}</small></span><Check size={16} /></label>)}</div><button className="button primary full" disabled={!file || !syntheticConfirmed || phase > 0} onClick={() => void analyze()}><Sparkles size={16} /> {phase ? "Procesando con IA…" : "Generar borrador con IA"}<ArrowRight size={16} /></button>{error && <p className="form-error">{error}</p>}</section></div> : <div className="ai-result-layout"><section className="panel ai-result"><div className="panel-header"><div><span className="eyebrow">Borrador listo</span><h2>{targets.find(item => item.id === target)?.name}</h2></div><span className="status-pill borrador">No emitido</span></div><div className="progress-track">{["Archivo recibido", "Texto extraído", "Analizado", "Borrador listo"].map((label, index) => <div className={phase >= Math.min(index + 1, 3) ? "done" : ""} key={label}><span>{phase >= Math.min(index + 1, 3) ? <Check size={13} /> : index + 1}</span><small>{label}</small></div>)}</div><div className="ai-sections">{sections.map((section, index) => <label key={`${section.title}-${index}`}><span>{section.title}</span><textarea value={section.text} onChange={event => setSections(value => value.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item))} />{section.evidence.length > 0 && <small className="evidence-line">{section.evidence.map((item, evidenceIndex) => <span key={`${item.page}-${evidenceIndex}`} className={`evidence-${item.status}`}>{item.page ? `Pág. ${item.page}` : "Sin página"} · {item.status}: “{item.excerpt}”</span>)}</small>}</label>)}</div><div className="result-actions"><button className="button secondary" onClick={() => { setSections([]); setPhase(0); setCreated(false); }}><Trash2 size={15} /> Descartar</button><button className="button primary" onClick={() => void createDraft()}><FileSearch size={16} /> Crear borrador</button></div>{created && <div className="notice success"><Check size={16} /> Borrador guardado. Puede revisarlo en Documentos.</div>}</section><aside className="source-panel"><span className="eyebrow">Trazabilidad</span><h3>Origen del borrador</h3><div><FileSearch size={20} /><p><strong>{source}</strong><small>Procesado en esta sesión · {model}</small></p></div>{missingInformation.length > 0 && <div className="uncertain-note"><AlertTriangle size={17} /><p><strong>Información faltante</strong><small>{missingInformation.join(" · ")}</small></p></div>}<p className="simulation-copy">{safetyNotice || "Borrador generado por IA. Revisión profesional obligatoria."}<br />Versión de instrucciones: {promptVersion}</p></aside></div>}
  </div>;
}
