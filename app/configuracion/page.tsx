import type { Metadata } from "next";
import { AppFrame } from "@/app/components/AppFrame";
import {
  CheckCircle2,
  Database,
  HardDrive,
  LockKeyhole,
  Sparkles,
} from "@/app/components/Icons";
import { productIdentity, productPrinciples } from "@/app/lib/product";
import { PromptManager } from "@/app/features/ai/PromptManager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Configuración" };

const currentLimits = [
  "Firma electrónica avanzada",
  "Dispensación de recetas",
  "Medicamentos controlados",
  "Conexión activa con sistemas clínicos externos",
  "Escritura automática en sistemas externos",
] as const;

export default function Page() {
  return (
    <AppFrame active="Configuración">
      <div className="page-wrap">
        <header className="page-header">
          <div>
            <span className="eyebrow">Producto y entorno</span>
            <h1>Configuración</h1>
            <p>Principios del producto y capacidades activas del entorno privado.</p>
          </div>
        </header>

        <section className="panel product-purpose">
          <div>
            <span className="eyebrow">Misión</span>
            <h2>{productIdentity.mission}</h2>
          </div>
          <p>{productIdentity.objective}</p>
        </section>

        <PromptManager />

        <div className="settings-grid">
          <section className="panel">
            <span className="eyebrow">Infraestructura</span>
            <h2>Servicios activos</h2>
            <ul className="settings-list">
              <li><Database size={18} /><div><strong>Datos estructurados</strong><small>Documentos, sesiones e historial</small></div><CheckCircle2 size={17} /></li>
              <li><HardDrive size={18} /><div><strong>Archivos privados</strong><small>Imágenes, PDF y DOCX</small></div><CheckCircle2 size={17} /></li>
              <li><LockKeyhole size={18} /><div><strong>Acceso autenticado</strong><small>Operaciones separadas por usuario</small></div><CheckCircle2 size={17} /></li>
              <li><Sparkles size={18} /><div><strong>IA en servidor</strong><small>Borradores editables, sin finalización automática</small></div><CheckCircle2 size={17} /></li>
            </ul>
          </section>

          <section className="panel">
            <span className="eyebrow">Constitución visual</span>
            <h2>Principios del producto</h2>
            <ul className="principle-list">
              {productPrinciples.map((principle) => <li key={principle}>{principle}</li>)}
            </ul>
          </section>
        </div>

        <section className="panel limits-panel">
          <span className="eyebrow">Alcance actual</span>
          <h2>Capacidades aún no habilitadas</h2>
          <div>{currentLimits.map((item) => <span key={item}>{item}</span>)}</div>
        </section>
      </div>
    </AppFrame>
  );
}
