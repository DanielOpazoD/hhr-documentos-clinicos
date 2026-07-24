import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3001";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const description = "Centro privado para crear, revisar, imprimir y respaldar documentos clínicos de demostración.";
  return {
    metadataBase: base,
    title: { default: "HHR Documentos", template: "%s · HHR Documentos" },
    description,
    icons: { icon: "/hhr-logo.svg", shortcut: "/hhr-logo.svg" },
    openGraph: { title: "HHR Documentos", description, images: [{ url: new URL("/og.png", base).toString(), width: 1536, height: 1024, alt: "HHR Documentos: crear, revisar, imprimir y respaldar" }] },
    twitter: { card: "summary_large_image", title: "HHR Documentos", description, images: [new URL("/og.png", base).toString()] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} antialiased`}>{children}</body>
    </html>
  );
}
