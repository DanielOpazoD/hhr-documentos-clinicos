"use client";

import { Activity, ArrowRight, Check, DatabaseZap, FileHeart, FlaskConical, LockKeyhole, RadioTower } from "@/app/components/Icons";
import { useState } from "react";

const connections = [
  { name: "Ficha clínica", icon: FileHeart, status: "Planificada", text: "Identidad del paciente y resumen clínico", detail: "Lectura explícita iniciada por el usuario" },
  { name: "Laboratorio", icon: FlaskConical, status: "Modo demostración", text: "Resultados estructurados y fecha de toma", detail: "Contrato versionado · sólo lectura" },
  { name: "Radiología", icon: RadioTower, status: "Planificada", text: "Hallazgos e impresión del informe", detail: "Rechazo seguro de respuestas parciales" },
];

export function Connections() {
  const [sample, setSample] = useState(false);
  const [saved, setSaved] = useState(false);
  async function createSample() { const response = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId: "integracion_demo", title: "Borrador desde laboratorio", patientName: "Paciente ficticio por confirmar", patientRutMasked: "••.•••.•••-•", status: "Borrador", content: { source: "laboratorio-demo-v1", results: ["Hemoglobina: 13,2 g/dL", "Creatinina: 0,9 mg/dL"], verified: false } }) }); setSaved(response.ok); }
  return <div className="page-wrap"><header className="page-header"><div><span className="eyebrow">Arquitectura futura</span><h1>Conexiones clínicas</h1><p>Contratos preparados para una extensión Chrome de sólo lectura y activación explícita.</p></div><span className="simulation-badge neutral"><LockKeyhole size={15} /> Sin conexiones reales</span></header>
    <div className="connection-grid">{connections.map(connection => { const Icon = connection.icon; return <article className="connection-card" key={connection.name}><div className="connection-icon"><Icon size={23} /></div><span className={connection.status === "Modo demostración" ? "connection-status demo" : "connection-status"}><span />{connection.status}</span><h2>{connection.name}</h2><p>{connection.text}</p><footer><Activity size={14} /> {connection.detail}</footer></article>; })}</div>
    <section className="panel contract-panel"><div className="contract-copy"><span className="eyebrow">Contrato neutral v1</span><h2>Así llegará un resultado al centro documental</h2><p>La extensión futura entregará un mensaje validado. El sitio rechazará datos parciales y sólo permitirá insertarlos en un borrador.</p><button className="button secondary" onClick={() => setSample(value => !value)}>{sample ? "Ocultar ejemplo" : "Ver ejemplo ficticio"}<ArrowRight size={15} /></button></div><div className="contract-code" aria-label="Contrato de ejemplo"><div><span /><span /><span /></div><pre>{`{
  "version": "1.0",
  "source": "laboratorio",
  "mode": "read_only",
  "patient": { "verified": false },
  "payload": { "status": "complete" }
}`}</pre></div></section>
    {sample && <section className="sample-result"><div><DatabaseZap size={20} /><div><span className="eyebrow">Dato ficticio recibido</span><h3>Laboratorio · 24 julio 2026</h3></div></div><div className="sample-values"><p><span>Hemoglobina</span><strong>13,2 g/dL</strong></p><p><span>Creatinina</span><strong>0,9 mg/dL</strong></p><p><span>Estado</span><strong>Completo</strong></p></div><button className="button primary" onClick={() => void createSample()}><FileHeart size={16} /> Insertar en borrador</button>{saved && <span className="inline-success"><Check size={15} /> Borrador creado</span>}</section>}
    <div className="security-strip"><LockKeyhole size={19} /><div><strong>Diseño de mínima exposición</strong><p>Mensajes versionados, dominios autorizados, tokens efímeros, health check sin datos clínicos y ninguna escritura de regreso.</p></div></div>
  </div>;
}
