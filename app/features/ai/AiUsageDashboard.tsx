"use client";

import { useEffect, useState } from "react";
import type { AiUsageSummary } from "./usage-types";
import { readApiResponse } from "@/app/lib/client/http";

const periods = [7, 30, 90] as const;
const integer = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

function money(value: number) {
  if (value > 0 && value < .01) return "< US$0,01";
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "USD" }).format(value);
}

export function AiUsageDashboard() {
  const [days, setDays] = useState<(typeof periods)[number]>(30);
  const [summary, setSummary] = useState<AiUsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/ai/usage?days=${days}`, { cache: "no-store", signal: controller.signal })
      .then((response) => readApiResponse<AiUsageSummary>(response, {
        fallbackMessage: "No se pudo consultar el uso.",
      }))
      .then(setSummary)
      .catch((cause) => {
        if (!controller.signal.aborted && !(cause instanceof DOMException && cause.name === "AbortError")) {
          setError(cause instanceof Error ? cause.message : "No se pudo consultar el uso.");
        }
      });
    return () => controller.abort();
  }, [days]);

  return (
    <section className="settings-section usage-section">
      <header className="usage-heading">
        <div><h2>Consumo de IA</h2><small>Solicitudes completadas en esta aplicación</small></div>
        <div className="usage-period" aria-label="Período">
          {periods.map((period) => <button key={period} className={days === period ? "active" : ""} onClick={() => { setError(null); setDays(period); }}>{period} días</button>)}
        </div>
      </header>

      {error ? <p className="settings-inline-error">{error}</p> : null}
      <div className="usage-metrics">
        <div><span>Costo estimado</span><strong>{summary ? money(summary.totals.estimatedCostUsd) : "—"}</strong></div>
        <div><span>Tokens</span><strong>{summary ? integer.format(summary.totals.totalTokens) : "—"}</strong></div>
        <div><span>Solicitudes</span><strong>{summary ? integer.format(summary.totals.requests) : "—"}</strong></div>
        <div><span>OpenAI · últimas 24 h</span><strong>{summary ? `${summary.availability.cloud.remaining} / ${summary.availability.cloud.limit}` : "—"}</strong></div>
      </div>

      <div className="usage-table" role="table" aria-label="Consumo por modelo">
        <div className="usage-table-head" role="row">
          <span>Modelo</span><span>Entrada</span><span>Salida</span><span>Total</span><span>Estimado</span>
        </div>
        {summary?.models.length ? summary.models.map((row) => (
          <div className="usage-table-row" role="row" key={`${row.providerId}-${row.model}`}>
            <span><strong>{row.model}</strong><small>{row.providerId === "openai" ? "OpenAI" : "Local"} · {row.requests} solicitud{row.requests === 1 ? "" : "es"}</small></span>
            <span data-label="Entrada">{integer.format(row.inputTokens)}</span>
            <span data-label="Salida">{integer.format(row.outputTokens)}</span>
            <span data-label="Total">{integer.format(row.totalTokens)}</span>
            <span data-label="Estimado">{row.unpricedRequests === row.requests ? "—" : money(row.estimatedCostUsd)}</span>
          </div>
        )) : <div className="usage-empty">Aún no hay consumo registrado.</div>}
      </div>
      <p className="usage-note">Estimación según tarifas estándar del modelo. No reemplaza la facturación del proveedor.</p>
    </section>
  );
}
