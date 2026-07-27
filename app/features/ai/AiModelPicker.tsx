"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, Sparkles } from "@/app/components/Icons";
import type { AiModelOption } from "./types";

type Props = {
  disabled: boolean;
  models: AiModelOption[];
  value: string;
  onChange: (model: string) => void;
};

export function AiModelPicker({ disabled, models, value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = models.find((model) => model.id === value) ?? models[0];
  const groups = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    const visible = normalized
      ? models.filter((model) => `${model.name} ${model.id} ${model.detail}`.toLocaleLowerCase("es").includes(normalized))
      : models;
    return visible.reduce<Array<{ name: string; models: AiModelOption[] }>>((result, model) => {
      const group = result.find((item) => item.name === model.group);
      if (group) group.models.push(model);
      else result.push({ name: model.group, models: [model] });
      return result;
    }, []);
  }, [models, query]);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [open]);

  function choose(model: AiModelOption) {
    onChange(model.id);
    setOpen(false);
    setQuery("");
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <div className="ai-model-field" ref={containerRef}>
      <span className="ai-model-label">Modelo</span>
      <button
        ref={triggerRef}
        type="button"
        className="ai-model-trigger"
        aria-expanded={open}
        disabled={disabled || !selected}
        onClick={() => setOpen((current) => !current)}
      >
        <Sparkles size={16} />
        <span><strong>{selected?.name ?? "Sin modelos"}</strong><small>{selected?.detail ?? "No disponible"}</small></span>
        <ChevronDown size={16} />
      </button>
      {open ? (
        <div className="ai-model-menu" aria-label="Modelos OpenAI">
          <header>
            <div className="ai-model-search"><Search size={15} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar modelo" aria-label="Buscar modelo" /></div>
            <small>{models.length} disponibles</small>
          </header>
          <div className="ai-model-groups" aria-label="Seleccione un modelo">
            {groups.length ? groups.map((group) => (
              <section key={group.name} aria-label={group.name}>
                <h4>{group.name}</h4>
                {group.models.map((model) => (
                  <button
                    type="button"
                    aria-pressed={model.id === value}
                    key={model.id}
                    onClick={() => choose(model)}
                  >
                    <span><strong>{model.name}</strong><small>{model.detail}{model.name !== model.id ? ` · ${model.id}` : ""}</small></span>
                    {model.recommended ? <em>Predeterminado</em> : null}
                    {model.id === value ? <Check size={16} /> : null}
                  </button>
                ))}
              </section>
            )) : <p>No hay coincidencias.</p>}
          </div>
        </div>
      ) : null}
    </div>
  );
}
