import type { Metadata } from "next";
import { AppFrame } from "@/app/components/AppFrame";
import { DocumentStudio } from "@/app/components/DocumentStudio";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Documentos" };
export default function Page() { return <AppFrame active="Documentos"><DocumentStudio /></AppFrame>; }
