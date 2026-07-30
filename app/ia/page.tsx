import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Documentos" };
export default function Page() { redirect("/documentos?assistant=1"); }
