"use client";

import Link from "next/link";
import { ArrowRight, Clock3, FileCheck2, FilePlus2, FolderOpen, ScanLine, Sparkles, Stethoscope } from "@/app/components/Icons";
import { useEffect, useState } from "react";
import { formatBytes } from "@/app/lib/client-pdf";

type RecentDocument = { id: string; title: string; patientName: string; patientRutMasked: string; status: string; version: number; updatedAt: string };
type RecentFile = { id: string; name: string; mimeType: string; size: number; origin: string; createdAt: string };

const actions = [
  { href: "/formularios", icon: FilePlus2, eyebrow: "Imprimir", title: "Nuevo formulario", text: "Laboratorio, imágenes y consentimientos", tone: "blue" },
  { href: "/documentos", icon: Stethoscope, eyebrow: "Redactar", title: "Nuevo documento", text: "Certificados, informes y receta externa", tone: "navy" },
  { href: "/ia", icon: Sparkles, eyebrow: "Asistir", title: "Analizar con IA", text: "Importa un archivo y revisa el borrador", tone: "yellow" },
  { href: "/escaner", icon: ScanLine, eyebrow: "Capturar", title: "Escanear desde celular", text: "Crea un QR temporal y recibe páginas", tone: "green" },
];

export function Dashboard() {
  const [documents, setDocuments] = useState<RecentDocument[]>([]);
  const [files, setFiles] = useState<RecentFile[]>([]);
  useEffect(() => {
    void Promise.all([
      fetch("/api/documents").then(r => r.json()),
      fetch("/api/files").then(r => r.json()),
    ]).then(([docs, saved]) => { setDocuments(docs.documents ?? []); setFiles(saved.files ?? []); });
  }, []);

  return <div className="page-wrap dashboard-page">
    <section className="hero-row">
      <div><span className="eyebrow">Centro documental clínico</span><h1>Buenos días, doctora.</h1><p>Cree, revise, imprima y respalde documentos desde un solo lugar.</p></div>
    </section>

    <section aria-labelledby="quick-title">
      <div className="section-heading"><div><span className="eyebrow">Comenzar</span><h2 id="quick-title">¿Qué necesita hacer?</h2></div></div>
      <div className="action-grid">{actions.map(action => { const Icon = action.icon; return <Link href={action.href} key={action.href} className={`action-card ${action.tone}`}><span className="action-icon"><Icon size={22} /></span><span className="eyebrow">{action.eyebrow}</span><h3>{action.title}</h3><p>{action.text}</p><span className="card-link">Abrir <ArrowRight size={15} /></span></Link>; })}</div>
    </section>

    <div className="dashboard-columns">
      <section className="panel" aria-labelledby="recent-documents"><div className="panel-header"><div><span className="eyebrow">Actividad</span><h2 id="recent-documents">Documentos recientes</h2></div><Link href="/documentos">Ver todos</Link></div>
        <div className="document-list">{documents.slice(0, 4).map(doc => <Link href="/documentos" className="document-row" key={doc.id}><span className="file-glyph"><FileCheck2 size={18} /></span><span className="document-main"><strong>{doc.title}</strong><small>{doc.patientName} · {doc.patientRutMasked}</small></span><span className={`status-pill ${doc.status.toLowerCase()}`}>{doc.status}</span><span className="document-time">v{doc.version}<small><Clock3 size={12} /> {new Date(doc.updatedAt).toLocaleDateString("es-CL")}</small></span></Link>)}</div>
      </section>
      <section className="panel" aria-labelledby="recent-files"><div className="panel-header"><div><span className="eyebrow">Respaldo</span><h2 id="recent-files">Recibidos desde celular</h2></div><Link href="/archivos">Biblioteca</Link></div>
        {files.length ? <div className="file-mini-list">{files.filter(file => file.origin === "QR móvil").slice(0, 4).map(file => <a href={`/api/files/${file.id}`} target="_blank" key={file.id}><span><FolderOpen size={17} /></span><div><strong>{file.name}</strong><small>{formatBytes(file.size)} · {new Date(file.createdAt).toLocaleDateString("es-CL")}</small></div></a>)}</div> : <div className="empty-state compact"><ScanLine size={28} /><strong>Aún no hay capturas</strong><p>Cree un QR temporal para recibir documentos.</p><Link href="/escaner">Iniciar escáner</Link></div>}
      </section>
    </div>
  </div>;
}
