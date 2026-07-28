"use client";

import { useEffect, useRef, useState } from "react";
import { Check, RotateCcw } from "@/app/components/Icons";
import {
  DEFAULT_SIGNATURE_IMAGE_SETTINGS,
  renderSignatureImage,
  type SignatureImageSettings,
} from "./prepare-signature";

const presets: Array<{ id: SignatureImageSettings["filter"]; label: string }> = [
  { id: "auto", label: "Documento" },
  { id: "color", label: "Color" },
  { id: "gray", label: "Grises" },
  { id: "bw", label: "B/N" },
];

type Props = {
  file: File;
  label: string;
  settings: SignatureImageSettings;
  onChange: (settings: SignatureImageSettings) => void;
};

export function SignatureImageEditor({ file, label, settings, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const rendered = await renderSignatureImage(file, settings, 620);
        if (!active || !canvasRef.current) return;
        const preview = canvasRef.current;
        preview.width = rendered.width;
        preview.height = rendered.height;
        preview.getContext("2d")?.drawImage(rendered, 0, 0);
        setPreviewError(null);
      } catch (error) {
        if (active) setPreviewError(error instanceof Error ? error.message : `No se pudo mostrar el ${label}.`);
      }
    }, 70);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [file, label, settings]);

  const update = (patch: Partial<SignatureImageSettings>) => onChange({ ...settings, ...patch });

  return (
    <section className="signature-image-editor" aria-label={`Edición de imagen de ${label}`}>
      <header>
        <span><strong>Acabado de la imagen</strong><small>Fondo blanco automático</small></span>
        <button type="button" className="text-button" onClick={() => onChange({ ...DEFAULT_SIGNATURE_IMAGE_SETTINGS })}><RotateCcw size={13} /> Restablecer</button>
      </header>
      <div className="signature-image-preview"><canvas ref={canvasRef} /></div>
      {previewError ? <p className="form-error">{previewError}</p> : null}
      <div className="signature-image-presets" role="group" aria-label={`Estilo de ${label}`}>
        {presets.map((preset) => (
          <button type="button" key={preset.id} className={settings.filter === preset.id ? "active" : ""} onClick={() => update({ filter: preset.id })}>
            {settings.filter === preset.id ? <Check size={12} /> : null}{preset.label}
          </button>
        ))}
      </div>
      <div className="signature-image-adjustments">
        <Adjustment label="Fondo" value={settings.whiten} min={0} max={100} onChange={(whiten) => update({ whiten })} />
        <Adjustment label="Brillo" value={settings.brightness} min={-35} max={35} onChange={(brightness) => update({ brightness })} />
        <Adjustment label="Contraste" value={settings.contrast} min={0} max={100} onChange={(contrast) => update({ contrast })} />
        <Adjustment label="Color" value={settings.saturation} min={0} max={140} onChange={(saturation) => update({ saturation })} />
      </div>
    </section>
  );
}

function Adjustment({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <label>
      <span>{label}<b>{value}</b></span>
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
