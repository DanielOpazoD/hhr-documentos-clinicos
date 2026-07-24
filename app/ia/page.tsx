import type { Metadata } from "next";
import { AppFrame } from "@/app/components/AppFrame";
import { AiStudio } from "@/app/components/AiStudio";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Asistente IA" };
export default function Page() { return <AppFrame active="Asistente IA"><AiStudio /></AppFrame>; }
