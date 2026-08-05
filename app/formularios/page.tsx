import type { Metadata } from "next";
import { AppFrame } from "@/app/components/AppFrame";
import { FormsStudio } from "@/app/components/FormsStudio";
import { formCatalog } from "@/app/lib/server/form-catalog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Formularios" };
export default function Page() { return <AppFrame active="Formularios"><FormsStudio catalog={formCatalog} /></AppFrame>; }
