import axe from "axe-core";
import { PNG } from "pngjs";
import { expect } from "@playwright/test";

export const viewports = [
  { id: "desktop", label: "escritorio", size: { width: 1440, height: 900 } },
  { id: "mobile", label: "móvil", size: { width: 390, height: 844 } },
];

export async function activate(locator, key = "Enter") {
  await locator.focus();
  await expect(locator).toBeFocused();
  await locator.press(key);
}

export async function typeWithKeyboard(locator, value) {
  await locator.focus();
  await locator.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await locator.press("Backspace");
  await locator.pressSequentially(value);
}

export async function assertNoSeriousAxe(page, surface) {
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    const result = await globalThis.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
      },
    });
    return result.violations
      .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes.map((node) => node.target.join(" ")),
      }));
  });
  expect(violations, `${surface}: infracciones críticas o graves de axe`).toEqual([]);
}

export function syntheticPng({ width = 720, height = 960 } = {}) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (width * y + x) << 2;
      const border = x < 28 || x >= width - 28 || y < 28 || y >= height - 28;
      const line = y > 130 && y < height - 100 && y % 72 < 5 && x > 80 && x < width - 80;
      const value = border || line ? 24 : 248;
      png.data[offset] = value;
      png.data[offset + 1] = value;
      png.data[offset + 2] = value;
      png.data[offset + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

export function mockedAiResult() {
  const workflow = {
    version: "clinical-draft-e2e-v1",
    outcome: "pass",
    findings: [],
    nodes: [{ node: "verify", status: "completed", durationMs: 4 }],
  };
  const section = {
    title: "Certificación",
    text: "Documento sintético generado para validar el flujo E2E.",
    evidence: [{ sourceIndex: 0, page: 1, excerpt: "Paciente sintético", status: "explicito", verification: "verified" }],
  };
  const snapshot = {
    documentKind: "Certificado E2E",
    patient: { firstNames: "Paciente", lastNames: "Sintético IA", rut: "11.111.111-1", birthDate: "1990-01-02" },
    signer: { name: "Profesional E2E", rut: "22.222.222-2", specialty: "Medicina Interna" },
    sections: [section],
    processingSummary: "La respuesta simulada produjo un borrador verificable.",
    missingInformation: [],
    safetyNotice: "Revisión profesional requerida.",
  };
  return {
    ...snapshot,
    sources: ["fuente-e2e.png"],
    providerId: "openai",
    providerName: "OpenAI",
    model: "gpt-5-mini-e2e",
    promptVersion: "e2e-v1",
    workflow,
    promptTrace: {
      workflowVersion: workflow.version,
      mode: "free",
      profileId: "",
      profileName: "Prompt libre",
      profileRevision: null,
      version: "e2e-v1",
      userInstructions: "Crear un certificado sintético.",
      effectiveInstructions: "Crear un certificado sintético verificable.",
      generatedAt: "2026-08-05T12:00:00.000Z",
    },
    originalOutput: snapshot,
  };
}

export async function mockAi(page) {
  await page.route("**/api/ai/providers", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ providers: [{
        id: "openai",
        name: "OpenAI",
        model: "gpt-5-mini-e2e",
        models: [{ id: "gpt-5-mini-e2e", name: "Modelo E2E", detail: "Respuesta simulada", group: "Recomendados", recommended: true }],
        location: "Nube",
        available: true,
        detail: "Simulado para pruebas",
      }] }),
    });
  });
  await page.route("**/api/ai/import", async (route) => {
    const result = mockedAiResult();
    const body = [
      JSON.stringify({ type: "status", stage: "analyzing", label: "Analizando", detail: "Respuesta simulada" }),
      JSON.stringify({ type: "result", result }),
      JSON.stringify({ type: "workflow", workflow: result.workflow }),
      "",
    ].join("\n");
    await route.fulfill({ status: 200, contentType: "application/x-ndjson; charset=utf-8", body });
  });
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function historySeedSql() {
  const owner = "preview@hhr.local";
  const createdAt = "2026-08-05T10:00:00.000Z";
  return viewports.flatMap(({ id, label }) => {
    const documentId = `e2e-history-${id}`;
    const title = `Historial E2E ${label}`;
    const patientName = `Paciente Sintético ${label}`;
    const patient = { firstNames: "Paciente", lastNames: `Sintético ${label}`, rut: "11.111.111-1", birthDate: "1990-01-02" };
    const currentContent = {
      patient,
      signer: { name: "Profesional E2E", rut: "22.222.222-2", specialty: "Medicina Interna" },
      issueDate: "2026-08-05",
      sections: [{ id: "contenido", title: "Contenido", body: `Contenido actual preservado ${label}` }],
    };
    const historicContent = {
      ...currentContent,
      sections: [{ id: "contenido", title: "Contenido", body: `Contenido histórico restaurado ${label}` }],
    };
    const snapshot = {
      templateId: "documento_libre",
      title,
      patientName,
      patientRutMasked: patient.rut,
      status: "Borrador",
      content: historicContent,
    };
    return [
      `INSERT INTO documents (id, owner_email, template_id, title, patient_name, patient_rut_masked, status, content_json, version, created_at, updated_at) VALUES (${sqlString(documentId)}, ${sqlString(owner)}, 'documento_libre', ${sqlString(title)}, ${sqlString(patientName)}, ${sqlString(patient.rut)}, 'Borrador', ${sqlString(JSON.stringify(currentContent))}, 1, ${sqlString(createdAt)}, ${sqlString(createdAt)});`,
      `INSERT INTO document_versions (id, document_id, owner_email, version, content_json, snapshot_json, created_at) VALUES (${sqlString(`${documentId}-v1`)}, ${sqlString(documentId)}, ${sqlString(owner)}, 1, ${sqlString(JSON.stringify(historicContent))}, ${sqlString(JSON.stringify(snapshot))}, ${sqlString(createdAt)});`,
    ];
  });
}
