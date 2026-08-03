"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Plus, Save, Sparkles, Star, Trash2 } from "@/app/components/Icons";
import { aiTargets } from "./targets";
import { createPromptProfile, deletePromptProfile, fetchPromptProfiles, improvePromptProfile, updatePromptProfile } from "./prompt-client";
import type { AiPromptInput, AiPromptProfile } from "./prompt-types";
import type { AiTargetId } from "./types";

const emptyDraft = (target: AiTargetId): AiPromptInput => ({ name: "", target, instructions: "", makeDefault: false });
const preferredProfile = (profiles: AiPromptProfile[], target: AiTargetId) => profiles.find((item) => item.target === target && item.isDefault) ?? profiles.find((item) => item.target === target);
const notifyPromptChanges = () => window.dispatchEvent(new CustomEvent("hhr:ai-prompts-changed"));

type Props = {
  initialTarget?: AiTargetId;
};

export function PromptManager({ initialTarget = "epicrisis" }: Props) {
  const [profiles, setProfiles] = useState<AiPromptProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<AiTargetId>(initialTarget);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AiPromptInput>(() => emptyDraft(initialTarget));
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [improving, setImproving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [improvementSummary, setImprovementSummary] = useState<string | null>(null);

  const visible = useMemo(() => profiles.filter((profile) => profile.target === target), [profiles, target]);
  const selected = profiles.find((profile) => profile.id === selectedId) ?? null;

  useEffect(() => {
    let active = true;
    void fetchPromptProfiles().then((items) => {
      if (!active) return;
      setProfiles(items);
      const initial = preferredProfile(items, initialTarget);
      if (initial) selectProfile(initial);
    }).catch((cause) => active && setError(cause instanceof Error ? cause.message : "No se pudieron cargar las plantillas."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [initialTarget]);

  function selectProfile(profile: AiPromptProfile) {
    setSelectedId(profile.id);
    setTarget(profile.target);
    setDraft({ name: profile.name, target: profile.target, instructions: profile.instructions, makeDefault: profile.isDefault });
    setCreating(false);
    setConfirmDelete(false);
    setStatus(null);
    setError(null);
    setImprovementSummary(null);
  }

  function changeTarget(nextTarget: AiTargetId) {
    setTarget(nextTarget);
    const initial = preferredProfile(profiles, nextTarget);
    if (initial) selectProfile(initial);
    else { setSelectedId(null); setDraft(emptyDraft(nextTarget)); }
  }

  function startNew(source?: AiPromptProfile) {
    setCreating(true);
    setSelectedId(null);
    setConfirmDelete(false);
    setStatus(null);
    setError(null);
    setImprovementSummary(null);
    setDraft(source ? {
      name: `${source.name} personalizado`.slice(0, 80),
      target: source.target,
      instructions: source.instructions,
      makeDefault: false,
    } : emptyDraft(target));
  }

  async function saveDraft() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const response = creating
        ? await createPromptProfile(draft)
        : await updatePromptProfile(selectedId!, draft);
      setProfiles(response.prompts);
      if (response.prompt) selectProfile(response.prompt);
      notifyPromptChanges();
      setStatus(creating ? "Plantilla creada" : "Cambios guardados");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar.");
    } finally { setBusy(false); }
  }

  async function removeSelected() {
    if (!selected || selected.builtIn) return;
    setBusy(true);
    setError(null);
    try {
      const response = await deletePromptProfile(selected.id);
      setProfiles(response.prompts);
      const replacement = preferredProfile(response.prompts, target);
      if (replacement) selectProfile(replacement);
      notifyPromptChanges();
      setStatus("Plantilla eliminada");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar.");
    } finally { setBusy(false); setConfirmDelete(false); }
  }

  async function improveDraft() {
    if (draft.instructions.trim().length < 20 || draft.name.trim().length < 3) return;
    setImproving(true);
    setError(null);
    setStatus(null);
    setImprovementSummary(null);
    try {
      const improvement = await improvePromptProfile(draft);
      const improvingBuiltIn = Boolean(selected?.builtIn);
      if (improvingBuiltIn) {
        setCreating(true);
        setSelectedId(null);
      }
      setDraft((current) => ({
        ...current,
        name: improvingBuiltIn ? improvement.name : current.name,
        instructions: improvement.instructions,
        makeDefault: improvingBuiltIn ? false : current.makeDefault,
      }));
      setImprovementSummary(improvement.summary);
      setStatus("Propuesta lista para revisar");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo mejorar.");
    } finally {
      setImproving(false);
    }
  }

  return <section className="panel prompt-manager">
    <div className="prompt-manager-heading"><div><span className="eyebrow">Documentos clínicos</span><h2>Plantillas IA</h2><p>Cree, edite y elija la plantilla predeterminada de cada documento. Las reglas clínicas permanecen protegidas.</p></div><button className="button primary" onClick={() => startNew()}><Plus size={16} /> Nueva</button></div>
    {loading ? <p className="settings-loading prompt-manager-loading">Cargando plantillas…</p> : <div className="prompt-manager-layout">
      <aside className="prompt-list"><label>Tipo de documento<select value={target} onChange={(event) => changeTarget(event.target.value as AiTargetId)}>{aiTargets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div>{visible.map((profile) => <button key={profile.id} className={selectedId === profile.id ? "active" : ""} onClick={() => selectProfile(profile)}><span><strong>{profile.name}</strong><small>{profile.builtIn ? "Base HHR" : `Versión ${profile.revision}`}</small></span>{profile.isDefault ? <Star size={14} aria-label="Predeterminado" /> : null}</button>)}</div></aside>
      <form className="prompt-editor" onSubmit={(event) => { event.preventDefault(); void saveDraft(); }}>
        <header><div><span className="eyebrow">{creating ? "Nueva plantilla" : selected?.builtIn ? "Solo lectura" : "Plantilla editable"}</span><h3>{creating ? "Nueva plantilla" : selected?.name ?? "Seleccione una plantilla"}</h3></div><div className="prompt-editor-actions"><button type="button" className="button secondary" disabled={busy || improving || draft.instructions.trim().length < 20} onClick={() => void improveDraft()}><Sparkles size={15} /> {improving ? "Mejorando…" : "Mejorar con IA"}</button>{selected?.builtIn ? <button type="button" className="button secondary" disabled={improving} onClick={() => startNew(selected)}><Copy size={15} /> Duplicar</button> : null}</div></header>
        <div className="prompt-fields"><label>Nombre<input value={draft.name} maxLength={80} disabled={selected?.builtIn || busy} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label></div>
        <label className="prompt-instructions">Instrucciones<textarea value={draft.instructions} maxLength={16000} rows={14} readOnly={Boolean(selected?.builtIn)} disabled={busy} onChange={(event) => setDraft((current) => ({ ...current, instructions: event.target.value }))} /><small>{draft.instructions.length.toLocaleString("es-CL")} / 16.000</small></label>
        {!selected?.builtIn ? <label className="prompt-default"><input type="checkbox" checked={Boolean(draft.makeDefault)} disabled={busy} onChange={(event) => setDraft((current) => ({ ...current, makeDefault: event.target.checked }))} /><span><strong>Usar por defecto</strong><small>Se seleccionará al crear este tipo de documento.</small></span></label> : null}
        {improvementSummary ? <div className="prompt-ai-note"><Sparkles size={15} /><span><strong>Cambios propuestos</strong><small>{improvementSummary}</small></span></div> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}{status ? <p className="form-success"><Check size={15} /> {status}</p> : null}
        {!selected?.builtIn ? <footer><div>{!creating && !confirmDelete ? <button type="button" className="text-button danger" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Eliminar</button> : null}{confirmDelete ? <span className="inline-confirm"><small>¿Eliminar esta plantilla?</small><button type="button" onClick={() => void removeSelected()}>Sí</button><button type="button" onClick={() => setConfirmDelete(false)}>No</button></span> : null}</div><button className="button primary" disabled={busy || !draft.name.trim() || draft.instructions.trim().length < 20}><Save size={15} /> {busy ? "Guardando…" : "Guardar"}</button></footer> : null}
      </form>
    </div>}
  </section>;
}
