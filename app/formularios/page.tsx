import type { Metadata } from "next";
import { AppFrame } from "@/app/components/AppFrame";
import { FormsStudio } from "@/app/components/FormsStudio";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Formularios" };
export default function Page() { return <AppFrame active="Formularios"><FormsStudio /></AppFrame>; }
