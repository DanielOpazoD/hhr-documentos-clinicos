/* eslint-disable @typescript-eslint/no-explicit-any */

type JsPdfNamespace = { jsPDF: any };

let jsPdfPromise: Promise<JsPdfNamespace> | null = null;

export function loadJsPdf() {
  if (typeof window === "undefined") {
    throw new Error("La exportación PDF solo está disponible en el navegador.");
  }
  const current = (window as typeof window & { jspdf?: JsPdfNamespace }).jspdf;
  if (current?.jsPDF) return Promise.resolve(current);
  if (jsPdfPromise) return jsPdfPromise;

  jsPdfPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/jspdf.umd.min.js";
    script.async = true;
    const fail = (message: string) => {
      jsPdfPromise = null;
      reject(new Error(message));
    };
    script.onload = () => {
      const loaded = (window as typeof window & { jspdf?: JsPdfNamespace }).jspdf;
      if (loaded?.jsPDF) resolve(loaded);
      else fail("No se pudo iniciar el generador PDF.");
    };
    script.onerror = () => fail("No se pudo cargar el generador PDF.");
    document.head.appendChild(script);
  });

  return jsPdfPromise;
}
