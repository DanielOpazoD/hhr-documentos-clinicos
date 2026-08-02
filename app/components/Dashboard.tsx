"use client";

import Link from "next/link";
import { ArrowRight, Clock3, FileCheck2, FilePlus2, FolderOpen, ScanLine, Sparkles, Stethoscope } from "@/app/components/Icons";
import { EmptyState, PageHeader, SectionHeader } from "@/app/components/VisualPrimitives";
import { useEffect, useState } from "react";
import { formatBytes } from "@/app/lib/client/format-bytes";
import { readApiResponse } from "@/app/lib/client/http";

type RecentDocument = { id: string; title: string; patientName: string; patientRutMasked: string; status: string; version: number; updatedAt: string };
type RecentFile = { id: string; name: string; mimeType: string; size: number; origin: string; createdAt: string };

const actions = [
  { href: "/formularios", icon: FilePlus2, eyebrow: "Imprimir", title: "Nuevo formulario", text: "Laboratorio, serología, imágenes y consentimientos", tone: "blue" },
  { href: "/documentos", icon: Stethoscope, eyebrow: "Redactar", title: "Nuevo documento", text: "Certificados, informes y receta externa", tone: "navy" },
  { href: "/documentos?assistant=1", icon: Sparkles, eyebrow: "Asistir", title: "Crear con IA", text: "Importe fuentes y continúe en el mismo editor", tone: "yellow" },
  { href: "/escaner", icon: ScanLine, eyebrow: "Capturar", title: "Escanear desde celular", text: "Crea un QR temporal y recibe páginas", tone: "green" },
];

export function Dashboard() {
  const [documents, setDocuments] = useState<RecentDocument[]>([]);
  const [files, setFiles] = useState<RecentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.allSettled([
      fetch("/api/documents", { signal: controller.signal }).then((response) => readApiResponse<{ documents?: RecentDocument[] }>(response)),
      fetch("/api/files", { signal: controller.signal }).then((response) => readApiResponse<{ files?: RecentFile[] }>(response)),
    ]).then(([documentsResult, filesResult]) => {
      if (controller.signal.aborted) return;
      if (documentsResult.status === "fulfilled") setDocuments(documentsResult.value.documents ?? []);
      if (filesResult.status === "fulfilled") setFiles(filesResult.value.files ?? []);
      const failure = documentsResult.status === "rejected"
        ? documentsResult.reason
        : filesResult.status === "rejected"
          ? filesResult.reason
          : null;
      setLoadError(failure instanceof Error
        ? failure.message
        : failure
          ? "No se pudo cargar toda la actividad reciente."
          : null);
      setLoading(false);
    });
    return () => controller.abort();
  }, []);
  const recentCaptures = files.filter((file) => file.origin === "QR móvil").slice(0, 4);

  return <div className="page-wrap dashboard-page">
    <PageHeader
      className="hero-row"
      eyebrow="Centro documental clínico"
      title="¿Qué necesita hacer?"
      description="Cree, revise, imprima y respalde documentos desde un solo lugar."
    />

    {loadError ? <p className="form-error standalone" role="status">{loadError}</p> : null}

    <section aria-labelledby="quick-title">
      <SectionHeader eyebrow="Comenzar" title="Acciones principales" id="quick-title" />
      <div className="action-grid">{actions.map(action => { const Icon = action.icon; return <Link href={action.href} key={action.href} className={`action-card ${action.tone}`}><span className="action-icon"><Icon size={22} /></span><span className="eyebrow">{action.eyebrow}</span><h3>{action.title}</h3><p>{action.text}</p><span className="card-link"><span className="card-link-label">Abrir</span><ArrowRight size={15} /></span></Link>; })}</div>
    </section>

    <div className="dashboard-columns">
      <section className="panel" aria-labelledby="recent-documents"><SectionHeader className="panel-header" eyebrow="Actividad" title="Documentos recientes" id="recent-documents" actions={<Link href="/documentos">Ver todos</Link>} />
        {loading ? <EmptyState compact title="Cargando actividad…" /> : documents.length ? <div className="document-list">{documents.slice(0, 4).map(doc => <Link href={`/documentos?document=${encodeURIComponent(doc.id)}`} className="document-row" key={doc.id}><span className="file-glyph"><FileCheck2 size={18} /></span><span className="document-main"><strong>{doc.title}</strong>{doc.patientName ? <small>{[doc.patientName, doc.patientRutMasked].filter(Boolean).join(" · ")}</small> : null}</span><span className={`status-pill ${doc.status.toLowerCase()}`}>{doc.status}</span><span className="document-time">v{doc.version}<small><Clock3 size={12} /> {new Date(doc.updatedAt).toLocaleDateString("es-CL")}</small></span></Link>)}</div> : <EmptyState compact icon={<FileCheck2 size={28} />} title="Aún no hay documentos" description="Cree su primer documento clínico para verlo aquí." action={<Link href="/documentos">Crear documento</Link>} />}
      </section>
      <section className="panel" aria-labelledby="recent-files"><SectionHeader className="panel-header" eyebrow="Respaldo" title="Recibidos desde celular" id="recent-files" actions={<Link href="/archivos">Biblioteca</Link>} />
        {loading ? <EmptyState compact title="Cargando respaldos…" /> : recentCaptures.length ? <div className="file-mini-list">{recentCaptures.map(file => <a href={`/api/files/${file.id}`} target="_blank" key={file.id}><span><FolderOpen size={17} /></span><div><strong>{file.name}</strong><small>{formatBytes(file.size)} · {new Date(file.createdAt).toLocaleDateString("es-CL")}</small></div></a>)}</div> : <EmptyState compact icon={<ScanLine size={28} />} title="Aún no hay capturas" description="Cree un QR temporal para recibir documentos." action={<Link href="/escaner">Iniciar escáner</Link>} />}
      </section>
    </div>
  </div>;
}
