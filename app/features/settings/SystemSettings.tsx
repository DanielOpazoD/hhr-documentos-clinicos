import { CheckCircle2, Database, HardDrive, LockKeyhole, Sparkles } from "@/app/components/Icons";

const services = [
  { name: "Datos", detail: "D1", icon: Database },
  { name: "Archivos", detail: "R2", icon: HardDrive },
  { name: "Acceso", detail: "Privado", icon: LockKeyhole },
  { name: "IA", detail: "Servidor", icon: Sparkles },
] as const;

export function SystemSettings() {
  return (
    <section className="settings-section">
      <header><h2>Servicios</h2></header>
      <div className="connection-list">
        {services.map((service) => {
          const Icon = service.icon;
          return (
            <article key={service.name}>
              <span className="settings-row-icon"><Icon size={17} /></span>
              <div><strong>{service.name}</strong><small>{service.detail}</small></div>
              <CheckCircle2 className="settings-check" size={17} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
