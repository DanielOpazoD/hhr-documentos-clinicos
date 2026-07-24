import type { Metadata } from "next";
import { MobileCapture } from "@/app/components/MobileCapture";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Captura móvil" };
export default async function Page({ params }: { params: Promise<{ token: string }> }) { const { token } = await params; return <MobileCapture token={token} />; }
