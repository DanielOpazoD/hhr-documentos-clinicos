import type { Metadata } from "next";
import { AppFrame } from "@/app/components/AppFrame";
import { FilesLibrary } from "@/app/components/FilesLibrary";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Archivos" };
export default function Page() { return <AppFrame active="Archivos"><FilesLibrary /></AppFrame>; }
