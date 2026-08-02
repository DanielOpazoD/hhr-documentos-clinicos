/* eslint-disable @next/next/no-img-element -- local SVG assets do not need the client image runtime. */
import Link from "next/link";
import { FileText, FolderArchive, House, ScanLine, Settings, Stethoscope } from "@/app/components/Icons";
import { requireSiteUser } from "@/app/lib/page-auth";
import { productIdentity } from "@/app/lib/product";

const nav = [
  { href: "/", label: "Inicio", icon: House },
  { href: "/formularios", label: "Formularios", icon: FileText },
  { href: "/documentos", label: "Documentos", icon: Stethoscope },
  { href: "/archivos", label: "Archivos", icon: FolderArchive },
  { href: "/escaner", label: "Escáner móvil", icon: ScanLine },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

export async function AppFrame({ active, children }: { active: string; children: React.ReactNode }) {
  const user = await requireSiteUser(active === "Inicio" ? "/" : `/${active.toLowerCase()}`);
  return (
    <div className="app-shell">
      <aside className="sidebar print-hide">
        <Link href="/" className="brand" aria-label={`${productIdentity.name}, inicio`}>
          <span className="brand-mark"><img src="/hhr-logo.svg" alt="" width={36} height={36} fetchPriority="high" /></span>
          <span><strong>{productIdentity.name}</strong></span>
        </Link>
        <nav className="main-nav" aria-label="Navegación principal">
          {nav.map(item => {
            const Icon = item.icon;
            const current = item.label === active;
            return <Link key={item.href} href={item.href} className={current ? "nav-link active" : "nav-link"} aria-current={current ? "page" : undefined}><Icon size={18} /><span>{item.label}</span></Link>;
          })}
        </nav>
        {active === "Documentos" ? <div id="document-professional-slot" className="sidebar-professional-slot" /> : null}
        <div className="user-card"><span>{user.displayName.slice(0, 2).toUpperCase()}</span><div><strong>{user.displayName}</strong><small>Sesión privada</small></div></div>
      </aside>
      <main className="main-area">
        <header className="mobile-bar print-hide">
          <Link href="/" className="mobile-brand"><img src="/hhr-logo.svg" alt="" width={30} height={30} /> {productIdentity.name}</Link>
          <Link href="/configuracion" className={active === "Configuración" ? "mobile-settings-link active" : "mobile-settings-link"} aria-label="Configuración"><Settings size={19} /></Link>
        </header>
        {children}
        <nav className="mobile-nav print-hide" aria-label="Navegación móvil">
          {nav.slice(0, 5).map(item => { const Icon = item.icon; return <Link key={item.href} href={item.href} aria-label={item.label} className={item.label === active ? "active" : ""}><Icon size={19} /><small>{item.label}</small></Link>; })}
        </nav>
      </main>
    </div>
  );
}
