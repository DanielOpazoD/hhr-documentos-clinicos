import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, FileText, FileUp, Settings, Sparkles, Trash2 } from "@/app/components/Icons";
import { AiProcessingStatus } from "./AiProcessingStatus";
import { AiModelPicker } from "./AiModelPicker";
import { GoogleDrivePicker } from "./GoogleDrivePicker";
import { aiTargetGroups, aiTargets, getTargetDefinition } from "./targets";
import type { AiTargetId } from "./types";
import type { AiStudioController } from "./use-ai-studio";

type Props = {
  controller: AiStudioController;
};

export function AiImportForm({ controller }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedTarget = getTargetDefinition(controller.target);
  const targetProfiles = controller.promptProfiles.filter((item) => item.target === controller.target);
  const customProfiles = targetProfiles.filter((item) => !item.builtIn);
  const baseProfiles = targetProfiles.filter((item) => item.builtIn);
  const instruction = controller.promptMode === "free" ? controller.freePrompt : controller.additionalInstructions;
  const instructionsReady = controller.promptMode === "free"
    ? Boolean(controller.freePrompt.trim())
    : Boolean(controller.selectedPromptId);

  function setInstruction(value: string) {
    if (controller.promptMode === "free") controller.setFreePrompt(value);
    else controller.setAdditionalInstructions(value);
  }

  function selectDocumentType(value: string) {
    if (value === "free") {
      controller.setPromptMode("free");
      return;
    }
    controller.setPromptMode("profile");
    controller.setTarget(value as AiTargetId);
  }

  return (
    <div className="ai-composer-shell">
      <section className="panel ai-composer-panel">
        <input
          ref={inputRef}
          type="file"
          hidden
          multiple
          accept=".pdf,.docx,.jpg,.jpeg,.png"
          onChange={(event) => {
            controller.addFiles(Array.from(event.target.files ?? []));
            event.currentTarget.value = "";
          }}
        />

        <div className="ai-composer-context" aria-label="Contexto de generación">
          <label>
            <span>Documento</span>
            <select
              aria-label="Tipo de documento"
              value={controller.promptMode === "free" ? "free" : controller.target}
              disabled={controller.processing}
              onChange={(event) => selectDocumentType(event.target.value)}
            >
              <option value="free">Documento libre</option>
              {aiTargetGroups.map((group) => (
                <optgroup key={group} label={group}>
                  {aiTargets.filter((item) => item.group === group).map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          {controller.promptMode === "profile" ? (
            <label>
              <span>Plantilla</span>
              <select
                aria-label={`Prompt de ${selectedTarget.name}`}
                value={controller.selectedPromptId}
                disabled={controller.processing || controller.promptsLoading}
                onChange={(event) => controller.setSelectedPromptId(event.target.value)}
              >
                {customProfiles.length ? (
                  <optgroup label="Mis plantillas">
                    {customProfiles.map((item) => <option key={item.id} value={item.id}>{item.name} · v{item.revision}</option>)}
                  </optgroup>
                ) : null}
                <optgroup label="Plantillas HHR">
                  {baseProfiles.map((item) => <option key={item.id} value={item.id}>{item.name} · base</option>)}
                </optgroup>
              </select>
            </label>
          ) : null}

          <details className="ai-generation-settings">
            <summary>
              <Settings size={15} />
              <span><small>IA</small><strong>{controller.selectedProvider?.name ?? "Comprobando"} · {controller.model}</strong></span>
            </summary>
            <div>
              <fieldset className="provider-options" aria-label="Proveedor de inteligencia artificial">
                {controller.providersLoading ? <p>Comprobando modelos…</p> : controller.providers.map((item) => (
                  <label className={controller.provider === item.id ? "selected" : ""} key={item.id} aria-disabled={!item.available}>
                    <input
                      type="radio"
                      name="provider"
                      checked={controller.provider === item.id}
                      disabled={!item.available || controller.processing}
                      onChange={() => controller.setProvider(item.id)}
                    />
                    <span><strong>{item.name}</strong><small>{item.location} · {item.detail}</small></span>
                    <i className={item.available ? "available" : ""} aria-label={item.available ? "Disponible" : "No disponible"} />
                  </label>
                ))}
              </fieldset>
              {controller.selectedProvider ? (
                <AiModelPicker
                  models={controller.selectedProvider.models}
                  value={controller.model}
                  disabled={controller.processing || !controller.selectedProvider.available}
                  onChange={controller.setModel}
                />
              ) : null}
              <p>Recuerda tipo, plantilla y modelo; nunca pacientes ni archivos.</p>
              <Link href="/configuracion?tab=ia">Administrar plantillas</Link>
            </div>
          </details>
        </div>

        <div
          className="ai-composer"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (!controller.processing) controller.addFiles(Array.from(event.dataTransfer.files));
          }}
        >
          <label htmlFor="ai-document-instructions">
            <strong>{controller.promptMode === "free" ? "¿Qué documento necesita?" : "Indicaciones para este documento"}</strong>
            <small>{controller.promptMode === "free" ? "Describa el resultado y qué información debe usar o excluir." : "Opcional · complementan la plantilla y mandan sobre alcance, exclusiones y estilo."}</small>
          </label>
          <textarea
            id="ai-document-instructions"
            value={instruction}
            maxLength={controller.promptMode === "free" ? 6_000 : 4_000}
            disabled={controller.processing}
            placeholder={controller.promptMode === "free"
              ? "Ej.: usa solo la identificación del paciente, ignora los resultados y redacta el siguiente certificado…"
              : "Añada solamente lo que quiera cambiar, excluir o enfatizar…"}
            onChange={(event) => setInstruction(event.target.value)}
          />

          {controller.files.length ? (
            <div className="ai-composer-files" aria-label="Fuentes adjuntas">
              {controller.files.map((file, index) => (
                <span key={`${file.name}-${file.size}-${file.lastModified}`}>
                  <FileText size={14} />
                  <strong title={file.name}>{file.name}</strong>
                  <button type="button" disabled={controller.processing} aria-label={`Quitar ${file.name}`} onClick={() => controller.removeFile(index)}><Trash2 size={13} /></button>
                </span>
              ))}
              <small>{controller.files.length}/8 fuentes</small>
            </div>
          ) : <p className="ai-composer-empty">Arrastre aquí PDF, DOCX o imágenes, o use una fuente desde los controles inferiores.</p>}

          {controller.files.length ? (
            <label className="authorization-check compact">
              <input
                type="checkbox"
                checked={controller.processingAuthorized}
                disabled={controller.processing}
                onChange={(event) => controller.setProcessingAuthorized(event.target.checked)}
              />
              <span>Autorizo el procesamiento de estas fuentes.</span>
            </label>
          ) : null}

          <footer>
            <div className="ai-composer-sources">
              <button type="button" className="button secondary" disabled={controller.processing || controller.files.length >= 8} onClick={() => inputRef.current?.click()}>
                <FileUp size={15} /> Adjuntar
              </button>
              <GoogleDrivePicker compact disabled={controller.processing} fileCount={controller.files.length} onFiles={controller.addFiles} />
            </div>
            <button
              className="button primary ai-generate-action"
              disabled={!controller.files.length || !controller.processingAuthorized || !controller.selectedProvider?.available || !instructionsReady || controller.processing}
              onClick={() => void controller.analyze()}
            >
              <Sparkles size={16} /> {controller.processing ? "Generando…" : "Generar"}<ArrowRight size={16} />
            </button>
          </footer>
        </div>

        {controller.target === "traslado_salvador" && controller.promptMode === "profile" ? (
          <p className="ai-official-template-note"><FileText size={14} /> La IA completará los 18 campos del Word institucional.</p>
        ) : null}
        {controller.processing ? <AiProcessingStatus controller={controller} /> : null}
        {controller.error ? <p className="form-error" role="alert">{controller.error}</p> : null}
      </section>
    </div>
  );
}
