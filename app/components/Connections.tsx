"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileHeart, FlaskConical, FolderOpen, RadioTower, Sparkles } from "@/app/components/Icons";
import { fetchAiProviders } from "@/app/features/ai/client";
import type { AiProviderInfo } from "@/app/features/ai/types";
import { fetchGoogleDriveConfig } from "@/app/features/integrations/google-drive";

const clinicalConnections = [
  { name: "Ficha clínica", icon: FileHeart },
  { name: "Laboratorio", icon: FlaskConical },
  { name: "Radiología", icon: RadioTower },
] as const;

export function Connections() {
  const [providers, setProviders] = useState<AiProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [driveConfigured, setDriveConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void fetchAiProviders()
      .then((items) => { if (active) setProviders(items); })
      .catch(() => { if (active) setProviders([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void fetchGoogleDriveConfig()
      .then((config) => { if (active) setDriveConfigured(config.configured); })
      .catch(() => { if (active) setDriveConfigured(false); });
    return () => { active = false; };
  }, []);

  return (
    <div className="settings-stack">
      <section className="settings-section">
        <header><h2>Modelos</h2></header>
        <div className="connection-list">
          {loading ? <div className="settings-loading">Consultando…</div> : providers.map((provider) => (
            <article key={provider.id}>
              <span className="settings-row-icon"><Sparkles size={17} /></span>
              <div><strong>{provider.name}</strong><small>{provider.model}</small></div>
              <span className={provider.available ? "connection-state connected" : "connection-state"}>
                {provider.available ? "Activo" : "No configurado"}
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <header><h2>Archivos externos</h2></header>
        <div className="connection-list">
          <article>
            <span className="settings-row-icon"><FolderOpen size={17} /></span>
            <div><strong>Google Drive</strong><small>Selector oficial · acceso solo a archivos elegidos</small></div>
            {driveConfigured ? <Link className="connection-action" href="/documentos?assistant=1">Usar en IA</Link> : <span className="connection-state">{driveConfigured === null ? "Consultando…" : "No configurado"}</span>}
          </article>
        </div>
      </section>

      <section className="settings-section">
        <header><h2>Sistemas clínicos</h2></header>
        <div className="connection-list">
          {clinicalConnections.map((connection) => {
            const Icon = connection.icon;
            return (
              <article key={connection.name}>
                <span className="settings-row-icon"><Icon size={17} /></span>
                <div><strong>{connection.name}</strong></div>
                <span className="connection-state">No configurado</span>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
