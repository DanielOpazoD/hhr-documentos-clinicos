import { audit, ensureDatabase, jsonError, requestOwner, safeFileName } from "@/app/lib/server";

export async function POST(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  const form = await request.formData();
  const file = form.get("file");
  const target = String(form.get("target") ?? "resumen");
  if (!(file instanceof File)) return jsonError("Selecciona un archivo.");
  if (file.size > 15 * 1024 * 1024) return jsonError("El archivo supera 15 MB.");
  const allowedTargets = new Set(["resumen", "informe", "certificado", "antecedentes"]);
  if (!allowedTargets.has(target)) return jsonError("Tipo de borrador no permitido.");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const db = await ensureDatabase();
  await db.prepare(`INSERT INTO ai_import_runs (id, owner_email, source_name, target_type, status, created_at) VALUES (?, ?, ?, ?, 'simulado', ?)`).bind(id, owner, safeFileName(file.name), target, now).run();
  await audit(owner, "simulated", "ai_import", id, { sourceName: safeFileName(file.name), target });
  return Response.json({
    runId: id,
    simulated: true,
    source: safeFileName(file.name),
    sections: [
      { title: "Información identificada", text: "Paciente de demostración. El archivo fue recibido, pero este prototipo no utiliza datos clínicos reales." },
      { title: "Resumen propuesto", text: `Borrador de ${target} generado en modo simulación. Verifique cada dato antes de crear el documento.` },
      { title: "Información incierta", text: "Diagnósticos, dosis, fechas y profesional: no encontrados o no verificables en la simulación." },
    ],
  });
}
