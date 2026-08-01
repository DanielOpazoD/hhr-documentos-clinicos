"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

const SAFE_REFERENCE = /^[a-zA-Z0-9-]{4,80}$/;

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const reference = error.digest && SAFE_REFERENCE.test(error.digest) ? error.digest : null;

  useEffect(() => {
    headingRef.current?.focus();
  }, [reference]);

  return (
    <main className="unexpected-error-page">
      <section className="unexpected-error-card panel" aria-labelledby="unexpected-error-title">
        <div role="alert">
          <span className="eyebrow">HHR-documentos</span>
          <h1 id="unexpected-error-title" ref={headingRef} tabIndex={-1}>No pudimos completar esta vista</h1>
          <p>Sus datos permanecen protegidos. Puede reintentar la operación o volver al inicio.</p>
          {reference ? <small>Código de soporte: {reference}</small> : null}
        </div>
        <div className="unexpected-error-actions">
          <button type="button" className="button primary" onClick={reset}>Reintentar</button>
          <Link className="button secondary" href="/">Volver al inicio</Link>
        </div>
      </section>
    </main>
  );
}
