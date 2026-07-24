import type { Metadata } from "next";
import { AppFrame } from "@/app/components/AppFrame";
import { Connections } from "@/app/components/Connections";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Conexiones" };
export default function Page() { return <AppFrame active="Conexiones"><Connections /></AppFrame>; }
