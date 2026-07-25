"use client";

import { Check, Download, FilePlus2, FileText, GripVertical, Pencil, Printer, RotateCcw, Save, Search, UploadCloud, X } from "@/app/components/Icons";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import NextImage from "next/image";
import { documentTemplates, type DocumentStatus } from "@/app/lib/catalog";
import { downloadClinicalPdf } from "@/app/lib/client-pdf";

type Section = { id: string; title: string; body: string };
type PatientData = { name: string; rut: string; birthDate: string; insurance: string };
type StoredDocument = { id: string; templateId: string; title: string; patientName: string; patientRutMasked: string; status: DocumentStatus; version: number; updatedAt: string };
type SignatureRecord = { id: string; professionalName: string; professionalRut: string; specialty: string; imageUrl: string; createdAt?: string };
type PlacedSignature = SignatureRecord & { x: number; y: number; width: number };
type StoredContent = {
  sections?: Array<{ id?: string; title?: string; body?: string; text?: string }>;
  patient?: Partial<PatientData>;
  issueDate?: string;
  signature?: Omit<PlacedSignature, "imageUrl"> & { imageUrl?: string };
};

const emptyPatient: PatientData = { name: "", rut: "", birthDate: "", insurance: "" };
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Easter" });

async function prepareSignatureUpload(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar la firma.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("No se pudo preparar la firma.")), "image/jpeg", .84));
    return new File([blob], "firma.jpg", { type: "image/jpeg" });
  } finally { bitmap.close(); }
}

function formatStoredDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}-${month}-${year}` : value;
}

function formatUpdated(value: string) {
  return new Date(value).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric", timeZone: "Pacific/Easter" });
}

const initialSections: Record<string, Section[]> = {
  certificado_general: [{ id: "motivo", title: "Certificación", body: "Se certifica que la persona individualizada se encuentra bajo control médico." }, { id: "vigencia", title: "Observaciones", body: "" }],
  certificado_antecedentes: [{ id: "antecedentes", title: "Antecedentes mórbidos", body: "" }, { id: "tratamiento", title: "Tratamiento farmacológico", body: "" }],
  informe_medico: [{ id: "historia", title: "Historia clínica", body: "" }, { id: "examen", title: "Examen y resultados", body: "" }, { id: "diagnostico", title: "Diagnóstico", body: "" }, { id: "plan", title: "Plan", body: "" }],
  epicrisis_demo: [{ id: "ingreso", title: "Motivo de ingreso", body: "" }, { id: "evolucion", title: "Evolución", body: "" }, { id: "alta", title: "Plan de egreso", body: "" }],
  receta_externa: [{ id: "medicamento", title: "Medicamento", body: "" }, { id: "indicacion", title: "Indicación", body: "" }],
  documento_libre: [{ id: "contenido", title: "Contenido", body: "" }],
};

export function DocumentStudio() {
  const defaultTemplate = documentTemplates.find(item => item.id === "certificado_antecedentes")!;
  const [templateId, setTemplateId] = useState(defaultTemplate.id);
  const [documentTitle, setDocumentTitle] = useState(defaultTemplate.name);
  const [patient, setPatient] = useState<PatientData>({ ...emptyPatient });
  const [issueDate, setIssueDate] = useState(today());
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [sections, setSections] = useState<Section[]>(initialSections[defaultTemplate.id].map(section => ({ ...section })));
  const [status, setStatus] = useState<DocumentStatus>("Borrador");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [version, setVersion] = useState(1);
  const [storedDocuments, setStoredDocuments] = useState<StoredDocument[]>([]);
  const [recentQuery, setRecentQuery] = useState("");
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [signatures, setSignatures] = useState<SignatureRecord[]>([]);
  const [placedSignature, setPlacedSignature] = useState<PlacedSignature | null>(null);
  const [signatureFormOpen, setSignatureFormOpen] = useState(false);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signatureName, setSignatureName] = useState("");
  const [signatureRut, setSignatureRut] = useState("");
  const [signatureSpecialty, setSignatureSpecialty] = useState("");
  const [signatureBusy, setSignatureBusy] = useState(false);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const template = documentTemplates.find(item => item.id === templateId) ?? defaultTemplate;
  const visibleTitle = documentTitle.trim() || template.name;

  const filteredDocuments = useMemo(() => {
    const query = recentQuery.trim().toLocaleLowerCase("es-CL");
    return query ? storedDocuments.filter(item => `${item.title} ${item.patientName}`.toLocaleLowerCase("es-CL").includes(query)) : storedDocuments;
  }, [recentQuery, storedDocuments]);

  function markDirty() {
    setDirty(true);
    setSaveError(null);
    if (status !== "Borrador") setStatus("Borrador");
  }

  async function refreshDocuments() {
    const response = await fetch("/api/documents");
    if (!response.ok) return;
    const data = await response.json();
    setStoredDocuments(data.documents ?? []);
  }

  async function refreshSignatures() {
    const response = await fetch("/api/signatures");
    if (!response.ok) return;
    const data = await response.json();
    setSignatures(data.signatures ?? []);
  }

  async function persist(nextStatus: DocumentStatus = status) {
    if (!patient.name.trim()) { setSaveError("Ingrese el nombre del paciente para guardar."); return false; }
    const signature = placedSignature ? { id: placedSignature.id, professionalName: placedSignature.professionalName, professionalRut: placedSignature.professionalRut, specialty: placedSignature.specialty, x: placedSignature.x, y: placedSignature.y, width: placedSignature.width } : null;
    const response = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: documentId ?? undefined, templateId, title: visibleTitle, patientName: patient.name.trim(), patientRutMasked: patient.rut.trim(), status: nextStatus, content: { sections, patient, issueDate, signature } }) });
    const data = await response.json();
    if (!response.ok) { setSaveError(data.error ?? "No se pudo guardar."); return false; }
    setDocumentId(data.document.id);
    setVersion(data.document.version);
    setSavedAt(new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }));
    setStatus(nextStatus);
    setDirty(false);
    setSaveError(null);
    window.history.replaceState({}, "", `/documentos?document=${encodeURIComponent(data.document.id)}`);
    void refreshDocuments();
    return true;
  }

  async function openDocument(id: string) {
    setLoadError(null);
    const response = await fetch(`/api/documents?id=${encodeURIComponent(id)}`);
    const data = await response.json();
    if (!response.ok) { setLoadError(data.error ?? "No se pudo abrir el documento."); return; }
    const stored = data.document as StoredDocument & { content?: StoredContent };
    const nextTemplate = documentTemplates.some(item => item.id === stored.templateId) ? stored.templateId : "documento_libre";
    const nextSections = (stored.content?.sections ?? []).map((section, index) => ({ id: section.id ?? `section-${index + 1}`, title: section.title ?? `Sección ${index + 1}`, body: section.body ?? section.text ?? "" }));
    const storedSignature = stored.content?.signature;
    setTemplateId(nextTemplate);
    setDocumentTitle(stored.title);
    setSections(nextSections.length ? nextSections : initialSections[nextTemplate].map(section => ({ ...section })));
    setPatient({ name: stored.content?.patient?.name ?? stored.patientName, rut: stored.content?.patient?.rut ?? stored.patientRutMasked, birthDate: stored.content?.patient?.birthDate ?? "", insurance: stored.content?.patient?.insurance ?? "" });
    setIssueDate(stored.content?.issueDate ?? today());
    setPlacedSignature(storedSignature ? { ...storedSignature, imageUrl: `/api/signatures/${storedSignature.id}` } : null);
    setStatus(stored.status);
    setDocumentId(stored.id);
    setVersion(stored.version);
    setSavedAt(new Date(stored.updatedAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }));
    setDirty(false);
    setNewMenuOpen(false);
    window.history.replaceState({}, "", `/documentos?document=${encodeURIComponent(stored.id)}`);
  }

  function createDocument(id: string) {
    const nextTemplate = documentTemplates.find(item => item.id === id) ?? defaultTemplate;
    setTemplateId(nextTemplate.id);
    setDocumentTitle(nextTemplate.name);
    setSections(initialSections[nextTemplate.id].map(section => ({ ...section })));
    setPatient({ ...emptyPatient });
    setIssueDate(today());
    setPlacedSignature(null);
    setStatus("Borrador");
    setDocumentId(null);
    setVersion(1);
    setSavedAt(null);
    setSaveError(null);
    setDirty(false);
    setNewMenuOpen(false);
    window.history.replaceState({}, "", "/documentos");
  }

  function updatePatient(field: keyof PatientData, value: string) {
    setPatient(current => ({ ...current, [field]: value }));
    markDirty();
  }

  function updateSection(id: string, body: string) {
    setSections(value => value.map(section => section.id === id ? { ...section, body } : section));
    markDirty();
  }

  function moveSection(index: number, direction: -1 | 1) {
    const next = [...sections];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSections(next);
    markDirty();
  }

  function attachSignature(signature: SignatureRecord) {
    setPlacedSignature({ ...signature, x: 50, y: 76, width: 28 });
    markDirty();
  }

  function moveSignature(event: ReactPointerEvent<HTMLDivElement>) {
    if (!placedSignature || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const paper = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!paper) return;
    const half = placedSignature.width / 2;
    const x = Math.min(100 - half, Math.max(half, ((event.clientX - paper.left) / paper.width) * 100));
    const y = Math.min(91, Math.max(52, ((event.clientY - paper.top) / paper.height) * 100));
    setPlacedSignature(current => current ? { ...current, x, y } : current);
    markDirty();
  }

  async function saveSignature() {
    if (!signatureFile || !signatureName.trim()) { setSignatureError("Agregue la imagen y el nombre del profesional."); return; }
    setSignatureBusy(true);
    setSignatureError(null);
    try {
      const form = new FormData();
      const preparedFile = await prepareSignatureUpload(signatureFile);
      form.set("file", preparedFile);
      form.set("professionalName", signatureName);
      form.set("professionalRut", signatureRut);
      form.set("specialty", signatureSpecialty);
      const response = await fetch("/api/signatures", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) { setSignatureError(data.error ?? "No se pudo guardar la firma."); return; }
      const created = data.signature as SignatureRecord;
      setSignatures(value => [created, ...value]);
      attachSignature(created);
      setSignatureFile(null); setSignatureName(""); setSignatureRut(""); setSignatureSpecialty(""); setSignatureFormOpen(false);
    } catch { setSignatureError("No se pudo preparar la imagen. Use PNG o JPG."); }
    finally { setSignatureBusy(false); }
  }

  async function downloadPdf() {
    await downloadClinicalPdf({
      fileName: `${templateId}.pdf`,
      title: visibleTitle,
      subtitle: "Hospital Hanga Roa",
      sections: [{ title: "Paciente", body: `${patient.name || "—"}\nRUT: ${patient.rut || "—"}\nFecha de nacimiento: ${formatStoredDate(patient.birthDate) || "—"}\nPrevisión: ${patient.insurance || "—"}\nFecha: ${formatStoredDate(issueDate)}` }, ...sections.map(section => ({ title: section.title, body: section.body }))],
      signature: placedSignature ?? undefined,
      footer: templateId === "receta_externa" ? "RECETA MÉDICA EXTERNA" : "Hospital Hanga Roa",
    });
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshDocuments();
      void refreshSignatures();
      const requested = new URLSearchParams(window.location.search).get("document");
      if (requested) void openDocument(requested);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!dirty || !patient.name.trim()) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persist("Borrador"), 1200);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, sections, templateId, patient, issueDate, placedSignature, documentTitle]);

  return <div className="page-wrap studio-page simplified-studio">
    <header className="page-header compact-page-header"><div><h1>Documentos</h1></div><div className="header-actions"><button className="button secondary" onClick={() => window.print()}><Printer size={16} /> Imprimir</button><button className="button primary" onClick={() => void downloadPdf()}><Download size={16} /> Descargar PDF</button></div></header>
    {loadError ? <p className="form-error standalone">{loadError}</p> : null}

    <div className="document-workspace-shell">
      <aside className="document-library print-hide">
        <button className="button primary full" onClick={() => setNewMenuOpen(value => !value)}><FilePlus2 size={17} /> Nuevo documento</button>
        {newMenuOpen ? <div className="template-menu" aria-label="Tipo de documento">{documentTemplates.map(item => <button key={item.id} onClick={() => createDocument(item.id)}><FileText size={16} /><span><strong>{item.name}</strong><small>{item.description}</small></span></button>)}</div> : null}
        <div className="recent-heading"><strong>Recientes</strong><span>{storedDocuments.length}</span></div>
        {storedDocuments.length ? <><label className="recent-search"><Search size={14} /><input aria-label="Buscar documentos recientes" value={recentQuery} onChange={event => setRecentQuery(event.target.value)} placeholder="Buscar…" /></label><div className="recent-document-list">{filteredDocuments.map(item => <button className={item.id === documentId ? "active" : ""} key={item.id} onClick={() => void openDocument(item.id)}><span><strong>{item.title}</strong><small>{item.patientName || "Sin paciente"}</small></span><span><em>{item.status}</em><small>{formatUpdated(item.updatedAt)}</small></span></button>)}</div></> : <p className="empty-recent">Los documentos guardados aparecerán aquí.</p>}
      </aside>

      <main className="document-main">
        <div className="document-command-bar print-hide">
          <label className="document-title-field"><span>Título</span><input value={documentTitle} onChange={event => { setDocumentTitle(event.target.value); markDirty(); }} /></label>
          <div className="save-state"><span className={dirty ? "status-dot pending" : "status-dot"} /><span><strong>{dirty ? patient.name ? "Guardando…" : "Sin guardar" : documentId ? "Guardado" : "Nuevo"}</strong>{savedAt ? <small>{savedAt}</small> : null}</span></div>
          <div className="document-status-actions">
            {status === "Borrador" ? <button className="button secondary" disabled={!patient.name.trim()} onClick={() => void persist("Revisado")}><Check size={15} /> Revisar</button> : status === "Revisado" ? <button className="button secondary" onClick={() => void persist("Finalizado")}><Check size={15} /> Finalizar</button> : <button className="button secondary" onClick={() => void persist("Borrador")}><RotateCcw size={15} /> Editar</button>}
            <button className="icon-button" disabled={!patient.name.trim()} onClick={() => void persist()} aria-label="Guardar ahora"><Save size={17} /></button>
          </div>
        </div>
        {saveError ? <p className="form-error document-save-error">{saveError}</p> : null}

        <div className="studio-view-switch print-hide" role="tablist" aria-label="Vista del documento"><button role="tab" aria-selected={mobileView === "edit"} aria-controls="document-editor" onClick={() => setMobileView("edit")}>Editar</button><button role="tab" aria-selected={mobileView === "preview"} aria-controls="document-preview" onClick={() => setMobileView("preview")}>Vista previa</button></div>

        <div className="editor-layout document-editor-layout">
          <section id="document-editor" className={`editor-panel print-hide ${mobileView === "edit" ? "mobile-visible" : "mobile-hidden"}`}>
            <div className="editor-section patient-editor"><div className="editor-section-title"><h2>Paciente</h2></div><div className="patient-manual-grid"><label>Nombre<input value={patient.name} onChange={event => updatePatient("name", event.target.value)} placeholder="Nombre completo" /></label><label>RUT<input value={patient.rut} onChange={event => updatePatient("rut", event.target.value)} placeholder="12.345.678-9" /></label><label>Fecha de nacimiento<input type="date" value={patient.birthDate} onChange={event => updatePatient("birthDate", event.target.value)} /></label><label>Previsión<input value={patient.insurance} onChange={event => updatePatient("insurance", event.target.value)} placeholder="FONASA, ISAPRE…" /></label><label>Fecha del documento<input type="date" value={issueDate} onChange={event => { setIssueDate(event.target.value); markDirty(); }} /></label></div></div>

            <div className="editor-section content-editor"><div className="editor-section-title"><h2>Contenido</h2></div>{sections.map((section, index) => <div className="section-editor" key={section.id}><div><GripVertical size={16} /><label htmlFor={`section-${section.id}`}>{section.title}</label><span className="reorder-buttons"><button onClick={() => moveSection(index, -1)} disabled={index === 0} aria-label={`Subir ${section.title}`}>↑</button><button onClick={() => moveSection(index, 1)} disabled={index === sections.length - 1} aria-label={`Bajar ${section.title}`}>↓</button></span></div><textarea id={`section-${section.id}`} value={section.body} onChange={event => updateSection(section.id, event.target.value)} placeholder={`Escriba ${section.title.toLocaleLowerCase("es-CL")}`} /></div>)}</div>

            <div className="editor-section signature-editor"><div className="editor-section-title"><h2>Firma</h2><button className="text-button" onClick={() => setSignatureFormOpen(value => !value)}>{signatureFormOpen ? <X size={14} /> : <FilePlus2 size={14} />}{signatureFormOpen ? "Cerrar" : "Guardar firma"}</button></div>
              {signatures.length ? <div className="signature-library">{signatures.map(signature => <div className={placedSignature?.id === signature.id ? "signature-choice selected" : "signature-choice"} key={signature.id}><button onClick={() => attachSignature(signature)}><img src={signature.imageUrl} alt={`Firma de ${signature.professionalName}`} /><span><strong>{signature.professionalName}</strong><small>{signature.specialty || "Profesional"}</small></span></button></div>)}</div> : signatureFormOpen ? null : <button className="empty-signature" onClick={() => setSignatureFormOpen(true)}><Pencil size={18} /> Guardar la primera firma</button>}
              {signatureFormOpen ? <div className="signature-form"><input ref={signatureInputRef} hidden type="file" accept="image/png,image/jpeg" onChange={event => setSignatureFile(event.target.files?.[0] ?? null)} /><button className="signature-file-button" onClick={() => signatureInputRef.current?.click()}><UploadCloud size={17} />{signatureFile ? signatureFile.name : "Elegir PNG o JPG"}</button><label>Nombre profesional<input value={signatureName} onChange={event => setSignatureName(event.target.value)} /></label><div><label>RUT<input value={signatureRut} onChange={event => setSignatureRut(event.target.value)} /></label><label>Especialidad<input value={signatureSpecialty} onChange={event => setSignatureSpecialty(event.target.value)} /></label></div><button className="button primary" disabled={signatureBusy} onClick={() => void saveSignature()}>{signatureBusy ? "Guardando…" : "Guardar y usar"}</button>{signatureError ? <p className="form-error">{signatureError}</p> : null}</div> : null}
              {placedSignature ? <div className="signature-position-controls"><span>Arrastre la firma en la hoja</span><div><button onClick={() => { setPlacedSignature(value => value ? { ...value, x: 24 } : value); markDirty(); }}>Izquierda</button><button onClick={() => { setPlacedSignature(value => value ? { ...value, x: 50 } : value); markDirty(); }}>Centro</button><button onClick={() => { setPlacedSignature(value => value ? { ...value, x: 76 } : value); markDirty(); }}>Derecha</button><button onClick={() => { setPlacedSignature(null); markDirty(); }}>Quitar</button></div><label>Tamaño<input type="range" min="18" max="42" value={placedSignature.width} onChange={event => { const width = Number(event.target.value); setPlacedSignature(value => value ? { ...value, width } : value); markDirty(); }} /></label></div> : null}
            </div>
          </section>

          <section id="document-preview" className={`paper-panel ${mobileView === "preview" ? "mobile-visible" : "mobile-hidden"}`}>
            <div className="paper-toolbar print-hide"><span><span className={`status-pill ${status.toLowerCase()}`}>{status}</span> v{version}</span><span>{formatStoredDate(issueDate)}</span></div>
            <article className="clinical-paper document-paper"><div className="paper-brand"><div><span>Servicio de Salud</span><strong>Hospital Hanga Roa</strong></div><NextImage src="/hhr-logo.svg" alt="Hospital Hanga Roa" width={54} height={54} /></div><h2>{visibleTitle.toUpperCase()}</h2><div className="paper-rule" /><section><h3>Paciente</h3><div className="paper-patient-lines"><p><b>Nombre:</b> {patient.name || "—"}</p><p><b>RUT:</b> {patient.rut || "—"}</p><p><b>Fecha de nacimiento:</b> {formatStoredDate(patient.birthDate) || "—"}</p><p><b>Previsión:</b> {patient.insurance || "—"}</p></div></section>{sections.map(section => <section key={section.id}><h3>{section.title}</h3>{section.body ? section.body.split("\n").map((line, index) => <p key={index}>{line || " "}</p>) : <p className="paper-empty">—</p>}</section>)}<p className="paper-date">Fecha: {formatStoredDate(issueDate)}</p>{placedSignature ? <div className="placed-signature" style={{ left: `${placedSignature.x}%`, top: `${placedSignature.y}%`, width: `${placedSignature.width}%` }} onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); }} onPointerMove={moveSignature}><span className="signature-drag-handle print-hide">Mover</span><img src={placedSignature.imageUrl} alt={`Firma de ${placedSignature.professionalName}`} draggable={false} /><strong>{placedSignature.professionalName}</strong>{placedSignature.specialty ? <span>{placedSignature.specialty}</span> : null}{placedSignature.professionalRut ? <span>RUT: {placedSignature.professionalRut}</span> : null}</div> : null}{templateId === "receta_externa" ? <div className="prescription-warning">RECETA MÉDICA EXTERNA</div> : null}</article>
          </section>
        </div>
      </main>
    </div>
  </div>;
}
