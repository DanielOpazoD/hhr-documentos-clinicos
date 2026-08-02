import type { Metadata } from "next";
import { AppFrame } from "@/app/components/AppFrame";
import { ScannerDesk } from "@/app/components/ScannerDesk";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Escáner de documentos" };
export default function Page() { return <AppFrame active="Escáner"><ScannerDesk /></AppFrame>; }
