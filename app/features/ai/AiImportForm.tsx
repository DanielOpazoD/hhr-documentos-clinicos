import { useRef } from "react";
import Link from "next/link";
import { ArrowRight, Check, FileText, FileUp, Sparkles, Trash2 } from "@/app/components/Icons";
import { AiProcessingStatus } from "./AiProcessingStatus";
import { AiModelPicker } from "./AiModelPicker";
import { GoogleDrivePicker } from "./GoogleDrivePicker";
import { aiTargetGroups, aiTargets, getTargetDefinition } from "./targets";
import type { AiStudioController } from "./use-ai-studio";

export function AiImportForm({ controller }: { controller: AiStudioController }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const totalMegabytes = controller.files.reduce((total, file) => total + file.size, 0) / 1024 / 1024;
  const selectedTarget = getTargetDefinition(controller.target);
  const instructionsReady = controller.promptMode === "free"
    ? Boolean(controller.freePrompt.trim())
    : Boolean(controller.selectedPromptId);
  return (
    <div className="ai-layout">
      <section className="panel ai-upload">
        <div className="panel-header"><div><h2>Archivos</h2></div><small>{controller.files.length}/8</small></div>
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
        <button
          className={controller.files.length ? "drop-zone compact has-file" : "drop-zone compact"}
          disabled={controller.processing}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (controller.processing) return;
            controller.addFiles(Array.from(event.dataTransfer.files));
          }}
        >
          <span><FileUp size={28} /></span>
          <strong>{controller.files.length ? "Agregar más archivos" : "Seleccione o arrastre archivos"}</strong>
          <small>PDF, DOCX, JPG o PNG · hasta 8 archivos</small>
        </button>
        <div className="ai-source-divider"><span>o</span></div>
        <GoogleDrivePicker disabled={controller.processing} fileCount={controller.files.length} onFiles={controller.addFiles} />
        {controller.files.length ? (
          <div className="ai-file-queue">
            {controller.files.map((file, index) => (
              <div key={`${file.name}-${file.size}-${file.lastModified}`}>
                <FileText size={16} />
                <span><strong>{file.name}</strong><small>{Math.max(1, Math.round(file.size / 1024))} KB</small></span>
                <button disabled={controller.processing} aria-label={`Quitar ${file.name}`} onClick={() => controller.removeFile(index)}><Trash2 size={14} /></button>
              </div>
            ))}
            <small>{totalMegabytes.toFixed(1)} MB en total</small>
          </div>
        ) : null}
        <label className="authorization-check">
          <input
            type="checkbox"
            checked={controller.processingAuthorized}
            disabled={controller.processing}
            onChange={(event) => controller.setProcessingAuthorized(event.target.checked)}
          />
          <span>Tengo autorización para procesar este archivo.</span>
        </label>
      </section>

      <section className="panel ai-target">
        <div className="panel-header"><div><h2>Procesamiento</h2></div></div>
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
              <span>
                <strong>{item.name}</strong>
                <small>{item.location} · {item.detail}</small>
              </span>
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
        <div className="ai-subheading"><h3>Instrucciones</h3></div>
        <div className="ai-prompt-mode" role="group" aria-label="Modo de instrucciones">
          <button type="button" aria-pressed={controller.promptMode === "profile"} disabled={controller.processing} onClick={() => controller.setPromptMode("profile")}>Usar plantilla</button>
          <button type="button" aria-pressed={controller.promptMode === "free"} disabled={controller.processing} onClick={() => controller.setPromptMode("free")}>Prompt libre</button>
        </div>
        {controller.promptMode === "profile" ? <>
          <div className="ai-target-catalog" role="listbox" aria-label="Tipo de documento clínico">
            {aiTargetGroups.map((group) => (
              <section key={group} role="group" aria-label={group}>
                <h4>{group}</h4>
                <div>
                  {aiTargets.filter((item) => item.group === group).map((item) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={controller.target === item.id}
                      className={controller.target === item.id ? "selected" : ""}
                      disabled={controller.processing}
                      key={item.id}
                      onClick={() => controller.setTarget(item.id)}
                    >
                      <span><strong>{item.name}</strong><small>{item.text}</small></span>
                      {controller.target === item.id ? <Check size={15} /> : <em>{item.output}</em>}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
          {controller.target === "traslado_salvador" ? <div className="official-template-note"><FileText size={16} /><span><strong>Formulario oficial</strong><small>La IA completa sus 18 campos y descarga una copia del Word original.</small></span></div> : null}
          <div className="prompt-picker">
            <label htmlFor="ai-prompt">Prompt · {selectedTarget.name}</label>
            <div><select id="ai-prompt" value={controller.selectedPromptId} disabled={controller.processing || controller.promptsLoading} onChange={(event) => controller.setSelectedPromptId(event.target.value)}>{controller.promptProfiles.filter((item) => item.target === controller.target).map((item) => <option key={item.id} value={item.id}>{item.name}{item.builtIn ? " · base" : ` · v${item.revision}`}</option>)}</select><Link href="/configuracion?tab=ia">Configurar</Link></div>
          </div>
          <label className="ai-instructions-field" htmlFor="ai-additional-instructions">
            <span><strong>Indicaciones adicionales</strong><small>Opcional · complementan la plantilla sin modificarla.</small></span>
            <textarea id="ai-additional-instructions" value={controller.additionalInstructions} maxLength={4_000} disabled={controller.processing} placeholder="Ej.: prioriza la evolución renal y conserva una conclusión breve." onChange={(event) => controller.setAdditionalInstructions(event.target.value)} />
            <em>{controller.additionalInstructions.length}/4.000</em>
          </label>
        </> : <label className="ai-instructions-field free" htmlFor="ai-free-prompt">
          <span><strong>¿Qué documento necesita?</strong><small>La IA propone la estructura a partir de su solicitud y de los archivos.</small></span>
          <textarea id="ai-free-prompt" value={controller.freePrompt} maxLength={6_000} disabled={controller.processing} placeholder="Ej.: redacta un informe breve que resuma los hallazgos del formulario y deje visibles los datos que faltan." onChange={(event) => controller.setFreePrompt(event.target.value)} />
          <em>{controller.freePrompt.length}/6.000</em>
        </label>}
        <button
          className="button primary full"
          disabled={!controller.files.length || !controller.processingAuthorized || !controller.selectedProvider?.available || !instructionsReady || controller.processing}
          onClick={() => void controller.analyze()}
        >
          <Sparkles size={16} /> {controller.processing ? "Analizando…" : "Generar borrador"}<ArrowRight size={16} />
        </button>
        {controller.error ? <p className="form-error">{controller.error}</p> : null}
      </section>
      {controller.processing ? <AiProcessingStatus controller={controller} /> : null}
    </div>
  );
}
