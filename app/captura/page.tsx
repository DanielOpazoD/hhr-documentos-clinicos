import type { Metadata } from "next";
import { CaptureEntry } from "./CaptureEntry";

export const metadata: Metadata = {
  title: "Captura móvil",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <CaptureEntry />;
}
