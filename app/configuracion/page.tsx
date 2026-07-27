import type { Metadata } from "next";
import Link from "next/link";
import { AppFrame } from "@/app/components/AppFrame";
import { Connections } from "@/app/components/Connections";
import { PromptManager } from "@/app/features/ai/PromptManager";
import { AiUsageDashboard } from "@/app/features/ai/AiUsageDashboard";
import { SystemSettings } from "@/app/features/settings/SystemSettings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Configuración" };

const tabs = [
  { id: "ia", label: "IA" },
  { id: "conexiones", label: "Conexiones" },
  { id: "uso", label: "Uso" },
  { id: "sistema", label: "Sistema" },
] as const;

type TabId = typeof tabs[number]["id"];
const tabIds = new Set<TabId>(tabs.map((tab) => tab.id));

export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const requestedTab = (await searchParams).tab as TabId | undefined;
  const activeTab: TabId = requestedTab && tabIds.has(requestedTab) ? requestedTab : "ia";

  return (
    <AppFrame active="Configuración">
      <div className="page-wrap settings-page">
        <header className="page-header compact-page-header">
          <div><h1>Configuración</h1></div>
        </header>

        <nav className="settings-tabs" aria-label="Secciones de configuración">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              href={`/configuracion?tab=${tab.id}`}
              className={activeTab === tab.id ? "active" : ""}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <div className="settings-content">
          {activeTab === "ia" ? <PromptManager /> : null}
          {activeTab === "conexiones" ? <Connections /> : null}
          {activeTab === "uso" ? <AiUsageDashboard /> : null}
          {activeTab === "sistema" ? <SystemSettings /> : null}
        </div>
      </div>
    </AppFrame>
  );
}
