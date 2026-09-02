import { test, expect } from "./fixtures.mjs";
import {
  activate,
  assertNoSeriousAxe,
  mockAi,
  syntheticPng,
  typeWithKeyboard,
  viewports,
} from "./helpers.mjs";

async function openApp(page, app, path) {
  await page.goto(new URL(path, app.origin).href);
  await page.waitForLoadState("networkidle");
  await expect(page.locator("body")).toBeVisible();
}

async function assertNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
}

async function openNewDocument(page, templateName) {
  await activate(page.getByRole("button", { name: "Nuevo documento" }));
  const template = page.locator(".template-menu").getByRole("button", { name: new RegExp(templateName, "i") });
  await expect(template).toBeVisible();
  await activate(template);
}

async function openProfessionalPanel(page) {
  const trigger = page.locator([
    'button[aria-label="Configurar profesional, firma y timbre"]:visible',
    'button[aria-label="Editar profesional, firma y timbre"]:visible',
  ].join(", "));
  await expect(trigger).toHaveCount(1);
  await activate(trigger);
  const panel = page.getByRole("complementary", { name: "Configurar profesional, firma y timbre" });
  await expect(panel).toBeVisible();
  await expect(panel).toBeFocused();
  return { panel, trigger };
}

async function togglePrescriptionFrame(page, actionName) {
  await activate(page.getByLabel("Más herramientas del documento"));
  await activate(page.getByRole("button", { name: actionName }));
}

for (const viewport of viewports) {
  test.describe(`flujos críticos en ${viewport.label}`, () => {
    test.use({
      viewport: viewport.size,
      hasTouch: viewport.id === "mobile",
      isMobile: viewport.id === "mobile",
    });

    test("crea, edita, guarda y reabre un documento manual", async ({ page, app }) => {
      await openApp(page, app, "/documentos");
      await openNewDocument(page, "Documento libre");

      const title = `Documento manual E2E ${viewport.label}`;
      await typeWithKeyboard(page.getByLabel("Nombre completo"), `Paciente Manual ${viewport.label}`);
      await typeWithKeyboard(page.locator("#patient-rut"), "11.111.111-1");
      await page.getByLabel("Fecha de nacimiento").fill("1990-01-02");
      await activate(page.locator(".paper-title-edit"));
      await typeWithKeyboard(page.getByLabel("Título del documento"), title);
      await page.getByLabel("Título del documento").press("Enter");
      await typeWithKeyboard(page.locator("#section-contenido"), `Contenido manual persistido ${viewport.label}`);

      await page.keyboard.press("Control+s");
      await expect(page).toHaveURL(/document=/);
      await expect(page.getByText(/Guardado/, { exact: false }).first()).toBeVisible();
      const savedUrl = page.url();

      await openNewDocument(page, "Certificado médico general");
      await activate(page.getByRole("button", { name: /^Recientes/ }));
      const recent = page.locator(".recent-document-open").filter({ hasText: title });
      await expect(recent).toBeVisible();
      await activate(recent);

      await expect(page).toHaveURL(savedUrl);
      const contextToggle = page.locator(".clinical-context-toggle");
      if (await contextToggle.getAttribute("aria-expanded") === "true") await activate(contextToggle);
      await expect(contextToggle).toHaveAttribute("aria-expanded", "false");
      await expect(page.locator("#patient-editor-fields")).toBeHidden();
      await activate(contextToggle);
      await expect(page.getByLabel("Nombre completo")).toBeVisible();
      await expect(page.getByLabel("Nombre completo")).toHaveValue(`Paciente Manual ${viewport.label}`);
      await expect(page.locator("#section-contenido")).toHaveValue(`Contenido manual persistido ${viewport.label}`);
      await assertNoHorizontalOverflow(page);
      await assertNoSeriousAxe(page, `editor manual ${viewport.label}`);
    });

    test("bloquea la impresión, lleva al campo incorrecto y restaura el foco", async ({ page, app }) => {
      await openApp(page, app, "/documentos");
      const print = page.getByRole("button", { name: "Imprimir documento" });
      await activate(print);

      const heading = page.getByRole("heading", { name: "Revisar antes de imprimir" });
      await expect(heading).toBeFocused();
      await expect(page.getByRole("button", { name: "Imprimir", exact: true })).toHaveCount(0);
      await assertNoSeriousAxe(page, `preflight ${viewport.label}`);

      const issue = page.getByRole("button", { name: /Complete el nombre del paciente/ });
      await activate(issue);
      await expect(page.getByLabel("Nombre completo")).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.locator("#document-print-preflight")).toHaveCount(0);
      await expect(print).toBeFocused();
    });

    test("oculta y restaura el encuadre de receta externa", async ({ page, app }) => {
      await openApp(page, app, "/documentos");
      await openNewDocument(page, "Receta externa");

      const frame = page.getByText("RECETA MÉDICA EXTERNA", { exact: true });
      await expect(frame).toBeVisible();
      await togglePrescriptionFrame(page, "Ocultar encuadre");
      await expect(frame).toHaveCount(0);

      await page.keyboard.press("Control+s");
      await expect(page).toHaveURL(/document=/);
      await expect(page.getByText(/Guardado/, { exact: false }).first()).toBeVisible();
      await page.reload();
      await expect(frame).toHaveCount(0);

      await togglePrescriptionFrame(page, "Mostrar encuadre");
      await expect(frame).toBeVisible();
      await expect(page.locator(".studio-print-button")).toHaveCSS("color", "rgb(32, 33, 35)");
      await assertNoSeriousAxe(page, `encuadre de receta ${viewport.label}`);
    });

    test("restaura una versión y permite recuperar la versión que estaba vigente", async ({ page, app }) => {
      const documentId = `e2e-history-${viewport.id}`;
      const currentBody = `Contenido actual preservado ${viewport.label}`;
      const historicBody = `Contenido histórico restaurado ${viewport.label}`;
      await openApp(page, app, `/documentos?document=${documentId}`);
      await expect(page.locator("#section-contenido")).toHaveValue(currentBody);

      const history = page.getByRole("button", { name: "Ver historial del documento" });
      await activate(history);
      const dialog = page.getByRole("dialog", { name: "Historial del documento" });
      await expect(dialog.getByRole("button", { name: "Cerrar historial" })).toBeFocused();
      await assertNoSeriousAxe(page, `historial ${viewport.label}`);

      const versionOne = dialog.locator("article").filter({ hasText: "v1" });
      await activate(versionOne.getByRole("button", { name: /Recuperar copia|Restaurar/ }));
      await activate(versionOne.getByRole("button", { name: "Confirmar" }));
      await expect(dialog).toHaveCount(0);
      await expect(history).toBeFocused();
      await expect(page.locator("#section-contenido")).toHaveValue(historicBody);

      await activate(history);
      const restoredDialog = page.getByRole("dialog", { name: "Historial del documento" });
      const archivedCurrent = restoredDialog.locator("article").filter({ hasText: "v2" });
      await expect(archivedCurrent).toContainText("Borrador");
      await activate(archivedCurrent.getByRole("button", { name: "Restaurar" }));
      await activate(archivedCurrent.getByRole("button", { name: "Confirmar" }));
      await expect(restoredDialog).toHaveCount(0);
      await expect(history).toBeFocused();
      await expect(page.locator("#section-contenido")).toHaveValue(currentBody);
    });

    test("genera y guarda un borrador de IA con respuesta simulada", async ({ page, app }) => {
      await mockAi(page);
      await openApp(page, app, "/documentos");
      await activate(page.getByRole("button", { name: "Usar IA" }));
      await expect(page.getByRole("heading", { name: "Asistente IA" })).toBeFocused();

      await page.getByLabel("Tipo de documento", { exact: true }).selectOption("free");
      await typeWithKeyboard(page.getByLabel("¿Qué documento necesita?"), "Crear un certificado sintético para la prueba E2E.");
      await page.locator('input[type="file"]').setInputFiles({
        name: "fuente-e2e.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify({ patient: { name: "Paciente Sintético IA" } })),
      });
      await expect(page.locator(".ai-source-tray")).toContainText("Equipo");
      await expect(page.locator(".ai-composer > footer")).toContainText("1 fuente");
      const generate = page.getByRole("button", { name: /^Generar/ });
      await expect(generate).toBeDisabled();
      const authorization = page.getByRole("checkbox", { name: "Autorizo el procesamiento de estas fuentes." });
      await activate(authorization, "Space");
      await expect(generate).toBeEnabled();
      await assertNoHorizontalOverflow(page);
      await activate(generate);

      await expect(page.getByRole("heading", { name: "Certificado E2E" })).toBeVisible();
      await assertNoSeriousAxe(page, `borrador IA ${viewport.label}`);
      await activate(page.getByRole("checkbox", { name: "Datos de identidad revisados" }), "Space");
      await activate(page.getByRole("button", { name: "Guardar y abrir en el editor" }));

      await expect(page).toHaveURL(/\/documentos\?document=/);
      await expect(page.getByLabel("Contenido de Certificación")).toHaveValue("Documento sintético generado para validar el flujo E2E.");
      await expect(page.getByLabel("Nombre completo")).toHaveValue("Paciente Sintético IA");
    });

    test("sube una imagen, ajusta el escaneo y prepara su exportación", async ({ page, app }) => {
      await openApp(page, app, "/escaner");
      const input = page.getByLabel("Imágenes para convertir");
      await input.focus();
      await input.setInputFiles({
        name: `escaneo-${viewport.id}.png`,
        mimeType: "image/png",
        buffer: syntheticPng(),
      });

      const dialog = page.getByRole("dialog", { name: "Ajustar escaneo" });
      await expect(dialog).toBeVisible();
      const closeEditor = dialog.getByRole("button", { name: "Cerrar" });
      const applyScan = dialog.getByRole("button", { name: "Aplicar escaneo" });
      await expect(closeEditor).toBeFocused();
      await closeEditor.press("Shift+Tab");
      await expect(applyScan).toBeFocused();
      await applyScan.press("Tab");
      await expect(closeEditor).toBeFocused();

      const firstCorner = dialog.getByRole("button", { name: "Esquina 1" });
      await firstCorner.focus();
      const initialCornerLeft = await firstCorner.evaluate((element) => element.style.left);
      await firstCorner.press("ArrowRight");
      await expect.poll(() => firstCorner.evaluate((element) => element.style.left)).not.toBe(initialCornerLeft);

      const bottomRight = dialog.getByRole("button", { name: "Esquina 3" });
      const initialBottomRight = Number.parseFloat(await bottomRight.evaluate((element) => element.style.left));
      await bottomRight.press("ArrowLeft");
      const movedBottomRight = Number.parseFloat(await bottomRight.evaluate((element) => element.style.left));
      expect(initialBottomRight - movedBottomRight).toBeCloseTo(1, 3);
      for (let step = 0; step < 10; step += 1) await bottomRight.press("ArrowRight");
      expect(Number.parseFloat(await bottomRight.evaluate((element) => element.style.left))).toBeLessThanOrEqual(99.5);

      await assertNoSeriousAxe(page, `editor de escáner ${viewport.label}`);
      await activate(dialog.getByRole("button", { name: /Original/ }));
      await activate(dialog.getByText("Ajustes manuales"));
      const brightness = dialog.getByRole("slider", { name: /Brillo/ });
      await brightness.focus();
      const initialBrightness = await brightness.inputValue();
      await brightness.press("ArrowRight");
      await expect(brightness).not.toHaveValue(initialBrightness);
      await activate(applyScan);

      await expect(dialog).toHaveCount(0);
      const editPreview = page.getByRole("button", { name: "Editar bordes y calidad de la página 1" }).first();
      await expect(editPreview).toBeVisible();
      const downloadButton = page.getByRole("button", { name: "Descargar PDF" });
      await expect(downloadButton).toBeEnabled();
      const downloadPromise = page.waitForEvent("download");
      await activate(downloadButton);
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/escaneo-.+\.pdf$/i);

      await activate(editPreview);
      const reopened = page.getByRole("dialog", { name: "Ajustar escaneo" });
      await expect(reopened).toBeVisible();
      await expect(reopened.getByRole("button", { name: "Cerrar" })).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(reopened).toHaveCount(0);
      await expect(editPreview).toBeFocused();
    });

    test("abre un formulario clínico y conserva una navegación accesible", async ({ page, app }) => {
      await openApp(page, app, "/formularios");
      const form = page.getByRole("button", { name: /Hepatitis B, C y Chagas/ });
      await activate(form);
      await expect(form).toHaveAttribute("aria-current", "page");
      await expect(page.getByTitle("Vista del formulario: Hepatitis B, C y Chagas")).toHaveAttribute("src", /serologia-hepatitis-chagas\.pdf/);
      await expect(page.locator(".official-form-toolbar").getByRole("link", { name: "Abrir e imprimir" })).toBeVisible();
      await assertNoHorizontalOverflow(page);
      await assertNoSeriousAxe(page, `formularios ${viewport.label}`);

      const tuberculosis = page.getByRole("button", { name: /Investigación de tuberculosis/ });
      await activate(tuberculosis);
      await expect(tuberculosis).toHaveAttribute("aria-current", "page");
      await expect(page.getByTitle("Vista del formulario: Investigación de tuberculosis")).toHaveAttribute("src", /solicitud-laboratorio-tuberculosis-norma-2022\.pdf/);
      await expect(page.getByRole("link", { name: "Descargar" })).toHaveAttribute("download", "SOLICITUD-LABORATORIO-TUBERCULOSIS NORMA 2022.pdf");

      const open = page.getByRole("link", { name: "Abrir e imprimir" });
      await expect(open).toHaveAttribute("href", /solicitud-laboratorio-tuberculosis-norma-2022\.pdf/);
      const popupPromise = page.waitForEvent("popup");
      await activate(open);
      const popup = await popupPromise;
      await popup.close();

      const medif = page.getByRole("button", { name: /MEDIF para viaje aéreo/ });
      await activate(medif);
      await expect(page.getByTitle("Vista del formulario: MEDIF para viaje aéreo")).toHaveAttribute("src", /medif-latam\.pdf/);

      const transfer = page.getByRole("button", { name: /Traslado al Hospital del Salvador/ });
      await activate(transfer);
      await expect(page.getByText("Documento Word oficial")).toBeVisible();
      const downloadWord = page.getByRole("link", { name: "Descargar Word" });
      await expect(downloadWord).toHaveAttribute("href", /formato-informe-traslado-hospital-salvador\.docx/);
      await expect(downloadWord).toHaveAttribute("download", "Formato informe traslado Hospital del Salvador.docx");
    });

    test("gestiona firma y timbre mediante teclado y devuelve el foco al disparador", async ({ page, app }) => {
      await openApp(page, app, "/documentos");
      let { panel, trigger } = await openProfessionalPanel(page);
      await typeWithKeyboard(panel.getByLabel("Nombre médico"), `Profesional E2E ${viewport.label}`);
      await typeWithKeyboard(panel.getByLabel("RUT"), "22.222.222-2");
      await typeWithKeyboard(panel.getByLabel("Especialidad"), "Medicina Interna");

      const signatureGroup = panel.locator('[aria-labelledby="signature-asset-title"]');
      const stampGroup = panel.locator('[aria-labelledby="stamp-asset-title"]');
      await activate(signatureGroup.getByRole("button", { name: /^Agregar(?: firma)?$/ }));
      await panel.locator('input[type="file"]').setInputFiles({
        name: "firma-e2e.png",
        mimeType: "image/png",
        buffer: syntheticPng({ width: 240, height: 100 }),
      });
      await activate(panel.getByRole("button", { name: "Guardar y usar" }));
      await expect(signatureGroup.getByText("En uso")).toBeVisible();
      await expect(panel.getByRole("button", { name: "Guardar y usar" })).toHaveCount(0);

      await activate(stampGroup.getByRole("button", { name: /^Agregar(?: timbre)?$/ }));
      await panel.locator('input[type="file"]').setInputFiles({
        name: "timbre-e2e.png",
        mimeType: "image/png",
        buffer: syntheticPng({ width: 180, height: 180 }),
      });
      await activate(panel.getByRole("button", { name: "Guardar y usar" }));
      await expect(stampGroup.getByText("En uso")).toBeVisible();
      await expect(panel.getByRole("button", { name: "Guardar y usar" })).toHaveCount(0);
      await expect(panel.getByRole("heading", { name: "Profesional · Firma y timbre" })).toBeVisible();
      await assertNoSeriousAxe(page, `firma y timbre ${viewport.label}`);

      await activate(panel.getByRole("button", { name: "Cerrar" }));
      await expect(trigger).toBeFocused();
      const moveSignature = page.getByRole("button", { name: /Mover firma/ });
      await moveSignature.focus();
      const previousLeft = await moveSignature.locator("..").evaluate((element) => element.style.left);
      await moveSignature.press("ArrowRight");
      const nextLeft = await moveSignature.locator("..").evaluate((element) => element.style.left);
      expect(nextLeft).not.toBe(previousLeft);

      await activate(page.getByRole("button", { name: "Ocultar firma" }));
      await activate(page.getByRole("button", { name: "Ocultar timbre" }));
      await expect(page.locator(".asset-signature img")).toBeHidden();
      await expect(page.locator(".asset-stamp img")).toBeHidden();

      await page.keyboard.press("Control+s");
      await expect(page).toHaveURL(/document=/);
      await expect(page.getByText(/Guardado/, { exact: false }).first()).toBeVisible();
      await page.reload();
      await expect(page.getByRole("button", { name: "Mostrar firma" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Mostrar timbre" })).toBeVisible();
      await activate(page.getByRole("button", { name: "Mostrar firma" }));
      await activate(page.getByRole("button", { name: "Mostrar timbre" }));
      await expect(page.locator(".asset-signature img")).toBeVisible();
      await expect(page.locator(".asset-stamp img")).toBeVisible();

      ({ panel, trigger } = await openProfessionalPanel(page));
      const signatureAssetName = `Firma de Profesional E2E ${viewport.label}`;
      const stampAssetName = `Timbre de Profesional E2E ${viewport.label}`;
      const signatureOptions = signatureGroup.locator(`summary[aria-label="Opciones de ${signatureAssetName}"]`);
      await expect(signatureOptions).toHaveCount(1);
      await expect(stampGroup.locator(`summary[aria-label="Opciones de ${stampAssetName}"]`)).toHaveCount(1);
      await activate(signatureOptions);
      await activate(signatureOptions.locator("..").getByRole("button", { name: "Renombrar" }));
      const rename = panel.getByLabel(`Nuevo nombre de ${signatureAssetName}`);
      await typeWithKeyboard(rename, `Firma principal ${viewport.label}`);
      await rename.press("Enter");
      await expect(panel.getByRole("button", { name: new RegExp(`Firma principal ${viewport.label}`) })).toBeVisible();
      await activate(panel.getByRole("button", { name: "Cerrar" }));
      await expect(trigger).toBeFocused();
    });

    test("muestra un error recuperable con código de soporte y reintento", async ({ page, app }) => {
      let failed = false;
      await page.route("**/api/documents", async (route) => {
        if (route.request().method() === "POST" && !failed) {
          failed = true;
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              error: "El guardado temporal no estuvo disponible.",
              code: "TEMPORARY_UNAVAILABLE",
              requestId: `e2e-support-${viewport.id}`,
            }),
          });
          return;
        }
        await route.continue();
      });
      await openApp(page, app, "/documentos");
      await typeWithKeyboard(page.getByLabel("Nombre completo"), `Paciente Error ${viewport.label}`);
      await page.keyboard.press("Control+s");

      const feedback = page.getByRole("alert").filter({ hasText: "No se pudo guardar el documento" });
      await expect(feedback).toBeVisible();
      await assertNoSeriousAxe(page, `error recuperable ${viewport.label}`);
      await activate(feedback.getByText("Detalles para soporte"));
      await expect(feedback.locator("code")).toHaveText(`e2e-support-${viewport.id}`);
      await activate(feedback.getByRole("button", { name: "Reintentar guardado" }));
      await expect(feedback).toHaveCount(0);
      await expect(page).toHaveURL(/document=/);
    });
  });
}
