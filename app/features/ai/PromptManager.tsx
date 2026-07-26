"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Loader2, Plus, Save, Star, Trash2 } from "@/app/components/Icons";
import { aiTargets, getTargetName } from "./targets";
import { createPromptProfile, deletePromptProfile, fetchPromptProfiles, updatePromptProfile } from "./prompt-client";
import type { AiPromptInput, AiPromptProfile } from "./prompt-types";
import type { AiTargetId } from "./types";

const emptyDraft = (target: AiTargetId): AiPromptInput => ({ name: "", target, instructions: "", makeDefault: false });

export function PromptManager() {
  const [profiles, setProfiles] = useState<AiPromptProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<AiTargetId>("resumen");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AiPromptInput>(() => emptyDraft("resumen"));
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => profiles.filter((profile) => profile.target === target), [profiles, target]);
  const selected = profiles.find((profile) => profile.id === selectedId) ?? null;

  useEffect(() => {
    let active = true;
    void fetchPromptProfiles().then((items) => {
      if (!active) return;
      setProfiles(items);
      const initial = items.find((item) => item.target === "resumen" && item.isDefault) ?? items.find((item) => item.target === "resumen");
      if (initial) selectProfile(initial);
    }).catch((cause) => active && setError(cause instanceof Error ? cause.message : "No se pudieron cargar los prompts."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { setConfirmDelete(false); setStatus(null); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!busy && (creating || (selected && !selected.builtIn))) void saveDraft();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function selectProfile(profile: AiPromptProfile) {
    setSelectedId(profile.id);
    setTarget(profile.target);
    setDraft({ name: profile.name, target: profile.target, instructions: profile.instructions, makeDefault: profile.isDefault });
    setCreating(false);
    setConfirmDelete(false);
    setStatus(null);
    setError(null);
  }

  function changeTarget(nextTarget: AiTargetId) {
    setTarget(nextTarget);
    const initial = profiles.find((item) => item.target === nextTarget && item.isDefault) ?? profiles.find((item) => item.target === nextTarget);
    if (initial) selectProfile(initial);
    else { setSelectedId(null); setDraft(emptyDraft(nextTarget)); }
  }

  function startNew(source?: AiPromptProfile) {
    setCreating(true);
    setSelectedId(null);
    setConfirmDelete(false);
    setStatus(null);
    setError(null);
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
      setStatus(creating ? "Prompt creado" : "Cambios guardados");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar el prompt.");
    } finally { setBusy(false); }
  }

  async function removeSelected() {
    if (!selected || selected.builtIn) return;
    setBusy(true);
    setError(null);
    try {
      const response = await deletePromptProfile(selected.id);
      setProfiles(response.prompts);
      const replacement = response.prompts.find((item) => item.target === target && item.isDefault) ?? response.prompts.find((item) => item.target === target);
      if (replacement) selectProfile(replacement);
      setStatus("Prompt eliminado");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar el prompt.");
    } finally { setBusy(false); setConfirmDelete(false); }
  }

  return <section className="panel prompt-manager" id="prompts">
    <div className="prompt-manager-heading"><div><span className="eyebrow">Inteligencia artificial</span><h2>Prompts de documentos</h2><p>Controle la estructura y el énfasis de cada borrador. Las reglas clínicas permanecen protegidas por el sistema.</p></div><button className="button primary" onClick={() => startNew()}><Plus size={16} /> Nuevo prompt</button></div>
    {loading ? <div className="prompt-manager-loading"><Loader2 size={18} className="spin" /><span>Cargando prompts…</span></div> : <div className="prompt-manager-layout">
      <aside className="prompt-list"><label>Tipo de documento<select value={target} onChange={(event) => changeTarget(event.target.value as AiTargetId)}>{aiTargets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div>{visible.map((profile) => <button key={profile.id} className={selectedId === profile.id ? "active" : ""} onClick={() => selectProfile(profile)}><span><strong>{profile.name}</strong><small>{profile.builtIn ? "Base del sistema" : `Versión ${profile.revision}`}</small></span>{profile.isDefault ? <Star size={14} aria-label="Predeterminado" /> : null}</button>)}</div></aside>
      <form className="prompt-editor" onSubmit={(event) => { event.preventDefault(); void saveDraft(); }}>
        <header><div><span className="eyebrow">{creating ? "Nuevo perfil" : selected?.builtIn ? "Solo lectura" : "Perfil editable"}</span><h3>{creating ? `Nuevo · ${getTargetName(draft.target)}` : selected?.name ?? "Seleccione un prompt"}</h3></div>{selected?.builtIn ? <button type="button" className="button secondary" onClick={() => startNew(selected)}><Copy size={15} /> Duplicar para editar</button> : null}</header>
        <div className="prompt-fields"><label>Nombre<input value={draft.name} maxLength={80} disabled={selected?.builtIn || busy} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></label><label>Tipo<select value={draft.target} disabled={selected?.builtIn || busy} onChange={(event) => setDraft((current) => ({ ...current, target: event.target.value as AiTargetId }))}>{aiTargets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
        <label className="prompt-instructions">Instrucciones<textarea value={draft.instructions} maxLength={8000} rows={9} readOnly={Boolean(selected?.builtIn)} disabled={busy} onChange={(event) => setDraft((current) => ({ ...current, instructions: event.target.value }))} /><small>{draft.instructions.length.toLocaleString("es-CL")} / 8.000</small></label>
        {!selected?.builtIn ? <label className="prompt-default"><input type="checkbox" checked={Boolean(draft.makeDefault)} disabled={busy} onChange={(event) => setDraft((current) => ({ ...current, makeDefault: event.target.checked }))} /><span><strong>Usar por defecto</strong><small>Se seleccionará al crear este tipo de documento.</small></span></label> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}{status ? <p className="form-success"><Check size={15} /> {status}</p> : null}
        {!selected?.builtIn ? <footer><div>{!creating && !confirmDelete ? <button type="button" className="text-button danger" disabled={busy} onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Eliminar</button> : null}{confirmDelete ? <span className="inline-confirm"><small>¿Eliminar este prompt?</small><button type="button" onClick={() => void removeSelected()}>Sí</button><button type="button" onClick={() => setConfirmDelete(false)}>No</button></span> : null}</div><button className="button primary" disabled={busy || !draft.name.trim() || draft.instructions.trim().length < 20} aria-keyshortcuts="Control+S Meta+S"><Save size={15} /> {busy ? "Guardando…" : "Guardar"}</button></footer> : null}
      </form>
    </div>}
  </section>;
}
