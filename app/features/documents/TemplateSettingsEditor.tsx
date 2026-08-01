"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, MoreHorizontal, Plus, Save, Sparkles, Trash2, X } from "@/app/components/Icons";
import { createPromptProfile, fetchPromptProfiles, updatePromptProfile } from "@/app/features/ai/prompt-client";
import type { AiPromptProfile } from "@/app/features/ai/prompt-types";
import { aiTargetForDocumentTemplate, getTargetName } from "@/app/features/ai/targets";
import type { DocumentTemplateSectionSetting } from "./types";
import type { DocumentWorkspace } from "./use-document-workspace";

export function TemplateSettingsEditor({ onClose, workspace }: { onClose: () => void; workspace: DocumentWorkspace }) {
  const initial = workspace.activeTemplateSetting;
  const target = aiTargetForDocumentTemplate(initial.templateId);
  const [title, setTitle] = useState(initial.title);
  const [sections, setSections] = useState<DocumentTemplateSectionSetting[]>(initial.sections);
  const [profiles, setProfiles] = useState<AiPromptProfile[]>([]);
  const [promptId, setPromptId] = useState(initial.promptId ?? "");
  const [instructions, setInstructions] = useState("");
  const [promptTouched, setPromptTouched] = useState(false);
  const [loadingPrompts, setLoadingPrompts] = useState(Boolean(target));
  const [promptError, setPromptError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const fixedPrescription = initial.templateId === "receta_externa";
  const targetProfiles = useMemo(() => profiles.filter((profile) => profile.target === target), [profiles, target]);
  const selectedPrompt = targetProfiles.find((profile) => profile.id === promptId)
    ?? targetProfiles.find((profile) => profile.isDefault)
    ?? targetProfiles[0];

  useEffect(() => {
    if (!target) return;
    let active = true;
    void fetchPromptProfiles().then((items) => {
      if (!active) return;
      setProfiles(items);
      const candidates = items.filter((profile) => profile.target === target);
      const selected = candidates.find((profile) => profile.id === initial.promptId)
        ?? candidates.find((profile) => profile.isDefault)
        ?? candidates[0];
      if (selected) {
        setPromptId(selected.id);
        setInstructions(selected.instructions);
      }
    }).catch((error) => active && setPromptError(error instanceof Error ? error.message : "No se pudieron cargar los prompts."))
      .finally(() => active && setLoadingPrompts(false));
    return () => { active = false; };
  }, [initial.promptId, target]);

  function moveSection(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sections.length) return;
    setSaved(false);
    setSections((current) => {
      const next = [...current];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setPromptError(null);
    setSaved(false);
    let savedPromptId = target ? selectedPrompt?.id ?? initial.promptId ?? null : null;
    try {
      if (target && selectedPrompt && promptTouched && instructions.trim() !== selectedPrompt.instructions) {
        const input = {
          name: selectedPrompt.builtIn ? `${title.trim()} · personalizado`.slice(0, 80) : selectedPrompt.name,
          target,
          instructions,
          makeDefault: selectedPrompt.isDefault && !selectedPrompt.builtIn,
        };
        const response = selectedPrompt.builtIn
          ? await createPromptProfile(input)
          : await updatePromptProfile(selectedPrompt.id, input);
        savedPromptId = response.prompt?.id ?? null;
        if (!savedPromptId) throw new Error("No se pudo recuperar el prompt guardado.");
        setProfiles(response.prompts);
        setPromptId(savedPromptId);
        setPromptTouched(false);
        window.dispatchEvent(new CustomEvent("hhr:ai-prompts-changed"));
      }
      const result = await workspace.saveTemplateDefinition({
        templateId: initial.templateId,
        title: title.trim(),
        sections: sections.map((section) => ({ ...section, title: section.title.trim() })),
        promptId: savedPromptId,
      });
      if (result) setSaved(true);
    } catch (error) {
      setPromptError(error instanceof Error ? error.message : "No se pudo guardar la plantilla.");
    } finally {
      setSaving(false);
    }
  }

  const valid = Boolean(title.trim()) && sections.length > 0 && sections.every((section) => section.title.trim())
    && (!promptTouched || Boolean(selectedPrompt));
  return <div className="tpl-editor">
    <header><div><h2>Configurar plantilla</h2><small>{workspace.template.name}</small></div><button className="text-button" onClick={onClose}><X size={14} /> Cerrar</button></header>
    <label>Título predeterminado<input maxLength={120} value={title} onChange={(event) => { setTitle(event.target.value); setSaved(false); }} /></label>
    <section className="tpl-sections">
      <header><div><strong>Secciones</strong><small>Orden y títulos para documentos nuevos.</small></div>{!fixedPrescription && sections.length < 12 ? <button className="text-button" onClick={() => { setSaved(false); setSections((current) => [...current, { id: crypto.randomUUID(), title: "Nueva sección" }]); }}><Plus size={13} /> Agregar</button> : null}</header>
      <div>{sections.map((section, index) => <article key={section.id}>
        <input aria-label={`Título predeterminado de la sección ${index + 1}`} maxLength={80} disabled={fixedPrescription} value={section.title} onChange={(event) => { setSaved(false); setSections((current) => current.map((item) => item.id === section.id ? { ...item, title: event.target.value } : item)); }} />
        {!fixedPrescription ? <details className="section-actions-menu"><summary aria-label={`Opciones de ${section.title}`}><MoreHorizontal size={16} /></summary><div>
          <button disabled={index === 0} onClick={(event) => { moveSection(index, -1); event.currentTarget.closest("details")?.removeAttribute("open"); }}><ArrowUp size={13} /> Mover arriba</button>
          <button disabled={index === sections.length - 1} onClick={(event) => { moveSection(index, 1); event.currentTarget.closest("details")?.removeAttribute("open"); }}><ArrowDown size={13} /> Mover abajo</button>
          <button className="section-delete" disabled={sections.length === 1} onClick={() => { setSaved(false); setSections((current) => current.filter((item) => item.id !== section.id)); }}><Trash2 size={13} /> Eliminar</button>
        </div></details> : null}
      </article>)}</div>
    </section>
    {target ? <details className="tpl-prompt">
      <summary><Sparkles size={15} /><span><strong>Generación con IA</strong><small>{selectedPrompt?.name ?? "Cargando prompt…"}</small></span></summary>
      <div>
        <label>Prompt para {getTargetName(target)}<select disabled={loadingPrompts} value={selectedPrompt?.id ?? ""} onChange={(event) => {
          const next = targetProfiles.find((profile) => profile.id === event.target.value);
          if (!next) return;
          setPromptId(next.id); setInstructions(next.instructions); setPromptTouched(false); setSaved(false);
        }}>{targetProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.builtIn ? " · base" : ` · v${profile.revision}`}</option>)}</select></label>
        <label>Instrucciones<textarea rows={9} maxLength={16000} disabled={loadingPrompts || !selectedPrompt} value={instructions} onChange={(event) => { setInstructions(event.target.value); setPromptTouched(true); setSaved(false); }} /></label>
        {selectedPrompt?.builtIn && promptTouched ? <small>Al guardar se creará una copia personal; el prompt base no se altera.</small> : null}
      </div>
    </details> : <p className="tpl-no-ai">Esta plantilla se completa manualmente.</p>}
    {promptError || workspace.templateSettingsError ? <p className="form-error">{promptError ?? workspace.templateSettingsError}</p> : null}
    {saved ? <p className="form-success">Plantilla guardada y aplicada al documento.</p> : null}
    <footer><small>Los cambios se usarán en documentos nuevos y se aplicarán al actual.</small><button className="button primary" disabled={!valid || saving || workspace.templateSettingsBusy || (promptTouched && instructions.trim().length < 20)} onClick={() => void save()}><Save size={14} /> {saving ? "Guardando…" : "Guardar plantilla"}</button></footer>
  </div>;
}
