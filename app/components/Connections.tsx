import {
  Activity,
  FileHeart,
  FlaskConical,
  LockKeyhole,
  RadioTower,
} from "@/app/components/Icons";

const connections = [
  {
    name: "Ficha clínica",
    icon: FileHeart,
    status: "No configurada",
    scope: "Identidad del paciente y resumen clínico",
    contract: "Lectura iniciada por el usuario",
  },
  {
    name: "Laboratorio",
    icon: FlaskConical,
    status: "No configurada",
    scope: "Resultados estructurados y fecha de toma",
    contract: "Lectura y validación de respuesta completa",
  },
  {
    name: "Radiología",
    icon: RadioTower,
    status: "No configurada",
    scope: "Hallazgos e impresión del informe",
    contract: "Lectura y rechazo de respuestas parciales",
  },
] as const;

export function Connections() {
  return (
    <div className="page-wrap">
      <header className="page-header">
        <div>
          <span className="eyebrow">Integraciones</span>
          <h1>Conexiones clínicas</h1>
          <p>Estado real de las fuentes externas disponibles para el centro documental.</p>
        </div>
      </header>

      <div className="connection-grid">
        {connections.map((connection) => {
          const Icon = connection.icon;
          return (
            <article className="connection-card" key={connection.name}>
              <div className="connection-icon"><Icon size={23} /></div>
              <span className="connection-status"><span />{connection.status}</span>
              <h2>{connection.name}</h2>
              <p>{connection.scope}</p>
              <footer><Activity size={14} /> {connection.contract}</footer>
            </article>
          );
        })}
      </div>

      <div className="security-strip">
        <LockKeyhole size={19} />
        <div>
          <strong>Integraciones de mínima exposición</strong>
          <p>Las conexiones futuras serán de solo lectura, con activación explícita, sesiones acotadas y registro de operaciones.</p>
        </div>
      </div>
    </div>
  );
}
