import type { Metadata } from "next";
import { AppFrame } from "@/app/components/AppFrame";
import { ScannerDesk } from "@/app/components/ScannerDesk";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Escáner móvil" };
export default function Page() { return <AppFrame active="Escáner móvil"><ScannerDesk /></AppFrame>; }
