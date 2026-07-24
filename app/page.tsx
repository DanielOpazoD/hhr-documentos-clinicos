import type { Metadata } from "next";
import { AppFrame } from "@/app/components/AppFrame";
import { Dashboard } from "@/app/components/Dashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inicio" };

export default function Home() {
  return <AppFrame active="Inicio"><Dashboard /></AppFrame>;
}
