"use client";

import { ArrowRight, Check, FileSearch, FileUp, Sparkles, Trash2 } from "@/app/components/Icons";
import Link from "next/link";
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
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function analyze() {
    if (!file) return;
    setError(null);
    setCreatedId(null);
    setPhase(1);
    const form = new FormData();
    form.set("file", file);
    form.set("target", target);
    form.set("syntheticConfirmed", "true");
    setPhase(2);
    try {
      const response = await fetch("/api/ai/import", { method: "POST", body: form });
      const data = await response.json().catch(() => ({ error: response.status === 413 ? "El archivo es demasiado grande para procesarlo. Pruebe una versión más liviana." : "No se pudo leer la respuesta del servidor." }));
      if (!response.ok) { setError(data.error ?? "No se pudo analizar."); setPhase(0); return; }
      setPhase(3);
      setSections(data.sections);
      setSource(data.source);
      setModel(data.model);
      setPromptVersion(data.promptVersion);
      setMissingInformation(data.missingInformation ?? []);
      setSafetyNotice(data.safetyNotice ?? "");
    } catch {
      setError("No se pudo conectar con el servicio de IA.");
      setPhase(0);
    }
  }

  async function createDraft() {
    setSaving(true);
    setError(null);
    const result = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: "documento_libre",
        title: targets.find(item => item.id === target)?.name,
        patientName: "Paciente ficticio por confirmar",
        patientRutMasked: "••.•••.•••-•",
        status: "Borrador",
        content: {
          sections: sections.map((section, index) => ({ id: `ia-${index + 1}`, title: section.title, body: section.text })),
          ai: { source, evidence: sections.map(section => section.evidence), model, promptVersion, missingInformation, safetyNotice },
        },
      }),
    });
    const data = await result.json();
    if (!result.ok) setError(data.error ?? "No se pudo guardar el borrador.");
    else setCreatedId(data.document.id);
    setSaving(false);
  }

  function reset() {
    setSections([]);
    setPhase(0);
    setCreatedId(null);
    setError(null);
  }

  return <div className="page-wrap"><header className="page-header"><div><span className="eyebrow">Asistente documental</span><h1>Importar con IA</h1><p>Suba un archivo de prueba, revise el resultado y guárdelo como documento editable.</p></div><span className="simulation-badge live"><Sparkles size={15} /> IA real</span></header>
    {!sections.length ? <div className="ai-layout"><section className="panel ai-upload"><div className="panel-header"><div><span className="eyebrow">1 · Origen</span><h2>Seleccione un archivo</h2></div></div><input ref={inputRef} type="file" hidden accept=".pdf,.docx,.jpg,.jpeg,.png" onChange={event => setFile(event.target.files?.[0] ?? null)} /><button className={file ? "drop-zone has-file" : "drop-zone"} onClick={() => inputRef.current?.click()}><span><FileUp size={28} /></span>{file ? <><strong>{file.name}</strong><small>{Math.round(file.size / 1024)} KB · Listo para procesar</small></> : <><strong>PDF, DOCX o imagen</strong><small>Máximo 15 MB · entorno con datos ficticios</small></>}</button>{file ? <button className="text-button danger" onClick={() => setFile(null)}><Trash2 size={14} /> Quitar archivo</button> : null}</section><section className="panel ai-target"><div className="panel-header"><div><span className="eyebrow">2 · Resultado</span><h2>¿Qué desea crear?</h2></div></div><div className="target-options">{targets.map(item => <label className={target === item.id ? "selected" : ""} key={item.id}><input type="radio" name="target" checked={target === item.id} onChange={() => setTarget(item.id)} /><span><strong>{item.name}</strong><small>{item.text}</small></span><Check size={16} /></label>)}</div><button className="button primary full" disabled={!file || phase > 0} onClick={() => void analyze()}><Sparkles size={16} /> {phase ? "Procesando…" : "Generar borrador"}<ArrowRight size={16} /></button>{error ? <p className="form-error">{error}</p> : null}</section></div> : <div className="ai-result-layout"><section className="panel ai-result"><div className="panel-header"><div><span className="eyebrow">Resultado editable</span><h2>{targets.find(item => item.id === target)?.name}</h2></div><span className="status-pill borrador">Borrador</span></div><div className="ai-sections">{sections.map((section, index) => <label key={`${section.title}-${index}`}><span>{section.title}</span><textarea value={section.text} onChange={event => setSections(value => value.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item))} /></label>)}</div>{missingInformation.length ? <p className="ai-missing"><strong>Por completar:</strong> {missingInformation.join(" · ")}</p> : null}<div className="result-actions"><button className="button secondary" onClick={reset}><Trash2 size={15} /> Descartar</button>{createdId ? <Link className="button primary" href={`/documentos?document=${encodeURIComponent(createdId)}`}><FileSearch size={16} /> Abrir en Documentos</Link> : <button className="button primary" disabled={saving} onClick={() => void createDraft()}><FileSearch size={16} /> {saving ? "Guardando…" : "Guardar borrador"}</button>}</div>{error ? <p className="form-error">{error}</p> : null}{createdId ? <p className="ai-saved"><Check size={15} /> Guardado en Documentos</p> : null}</section><aside className="source-panel compact"><span className="eyebrow">Origen</span><h3>{source}</h3><p>{model}</p><details><summary>Ver trazabilidad</summary><div className="trace-list">{sections.flatMap(section => section.evidence.map((item, index) => <p key={`${section.title}-${index}`}><strong>{section.title}</strong><span>{item.page ? `Página ${item.page}` : "Sin página"} · {item.excerpt}</span></p>))}</div><small>Instrucciones {promptVersion}</small></details></aside></div>}
  </div>;
}
