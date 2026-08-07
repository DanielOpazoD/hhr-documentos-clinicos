// @ts-check

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { hospitalSalvadorFields, hospitalSalvadorMissingValue } from "../hospital-salvador-fields.js";

const immutableParts = [
  "word/header1.xml",
  "word/footer1.xml",
  "word/media/image1.png",
  "word/media/image2.png",
];
const MAX_PACKAGE_ENTRIES = 64;
const MAX_PACKAGE_ENTRY_BYTES = 1_000_000;
const MAX_PACKAGE_BYTES = 4_000_000;
const MAX_GENERATED_PARAGRAPHS = 512;
const MAX_GENERATED_XML_CHARACTERS = 2_000_000;

const xmlEntities = Object.freeze({
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
});

/** @param {string} value */
function decodeXml(value) {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) => xmlEntities[entity]);
}

/** @param {string} value */
function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** @param {string} value */
function normalizeLabel(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\d+\.\s*/, "")
    .replace(/^fundamento de solicitud/i, "fundamento de solicitud")
    .replace(/:\s*$/, "")
    .toLocaleLowerCase("es");
}

/** @param {string} paragraph */
function paragraphText(paragraph) {
  return [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((match) => decodeXml(match[1]))
    .join("");
}

/** @param {string} value @param {boolean} [leadingSpace] */
function valueRun(value, leadingSpace = false) {
  const safeValue = value.trim() || hospitalSalvadorMissingValue;
  const content = `${leadingSpace ? " " : ""}${safeValue}`
    .split(/\r?\n/)
    .map(escapeXml)
    .join('</w:t><w:br/><w:t xml:space="preserve">');
  return `<w:r><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">${content}</w:t></w:r>`;
}

/** @param {string} value */
function clinicalValueParagraphs(value) {
  const lines = (value.trim() || hospitalSalvadorMissingValue).split(/\r?\n+/).map((line) => line.trim()).filter(Boolean);
  return lines.map((line) => `<w:p><w:pPr><w:spacing w:before="0" w:after="100"/><w:ind w:left="360"/></w:pPr>${valueRun(line)}</w:p>`).join("");
}

/** @param {Array<{text: string}>} sections */
function assertGenerationComplexity(sections) {
  let paragraphs = 0;
  for (const section of sections) {
    let lineHasText = false;
    for (const character of section.text) {
      if (character === "\n" || character === "\r") {
        if (lineHasText) paragraphs += 1;
        lineHasText = false;
      } else if (!/\s/u.test(character)) {
        lineHasText = true;
      }
      if (paragraphs > MAX_GENERATED_PARAGRAPHS) {
        throw new Error("El documento contiene demasiados párrafos para generar el DOCX.");
      }
    }
    if (lineHasText) paragraphs += 1;
    if (paragraphs > MAX_GENERATED_PARAGRAPHS) {
      throw new Error("El documento contiene demasiados párrafos para generar el DOCX.");
    }
  }
}

/** @param {Record<string, Uint8Array>} packageParts */
function assertOfficialTemplate(packageParts) {
  if (!packageParts["word/document.xml"]) throw new Error("La plantilla no contiene el documento principal.");
  for (const part of immutableParts) {
    if (!packageParts[part]) throw new Error(`La plantilla oficial está incompleta: ${part}.`);
  }
  const header = strFromU8(packageParts["word/header1.xml"]);
  const headerText = paragraphText(header).replace(/\s+/g, " ").trim();
  if (!headerText.includes("DEPARTAMENTO GESTION DE CAMAS 2026")) {
    throw new Error("El encabezado institucional de la plantilla no coincide con el esperado.");
  }
}

/**
 * @param {string} documentXml
 * @param {Map<string, string>} valuesByKey
 */
function fillOfficialFields(documentXml, valuesByKey) {
  const matched = new Set();
  const fieldsByLabel = new Map(hospitalSalvadorFields.map((field) => [normalizeLabel(field.label), field]));
  const nextXml = documentXml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraph) => {
    const normalizedText = normalizeLabel(paragraphText(paragraph));
    const field = fieldsByLabel.get(normalizedText);
    if (!field) return paragraph;
    if (matched.has(field.key)) throw new Error(`El campo ${field.label} está repetido en la plantilla.`);
    matched.add(field.key);
    const value = valuesByKey.get(field.key) ?? hospitalSalvadorMissingValue;
    return field.compact
      ? paragraph.replace("</w:p>", `${valueRun(value, true)}</w:p>`)
      : `${paragraph}${clinicalValueParagraphs(value)}`;
  });

  const missing = hospitalSalvadorFields.filter((field) => !matched.has(field.key));
  if (missing.length) throw new Error(`La plantilla no contiene: ${missing.map((field) => field.label).join(", ")}.`);
  return nextXml;
}

/** @param {Date} date */
function formatDate(date) {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Pacific/Easter",
  }).format(date).replaceAll("/", "-");
}

/** @param {{name?: string, rut?: string, specialty?: string}} signer @param {Date} issueDate */
function signerXml(signer, issueDate) {
  const lines = [
    signer.name?.trim() || "Dr. Daniel Opazo",
    `RUT: ${signer.rut?.trim() || "17.752.753-K"}`,
    signer.specialty?.trim() || "Medicina Interna",
    `Fecha: ${formatDate(issueDate)}`,
  ];
  return `<w:p><w:pPr><w:spacing w:before="120" w:after="0"/><w:jc w:val="center"/></w:pPr>${lines.map((line, index) => `${index ? "<w:r><w:br/></w:r>" : ""}${valueRun(line)}`).join("")}</w:p>`;
}

/**
 * Crea un DOCX nuevo sin modificar la plantilla base. Todas las partes del
 * paquete, excepto word/document.xml, conservan sus bytes descomprimidos.
 *
 * @param {Uint8Array} templateBytes
 * @param {Array<{key?: string, title: string, text: string}>} sections
 * @param {{firstNames?: string, lastNames?: string, rut?: string}} patient
 * @param {{name?: string, rut?: string, specialty?: string}} signer
 * @param {Date} [issueDate]
 */
export function createHospitalSalvadorDocxBytes(templateBytes, sections, patient, signer, issueDate = new Date()) {
  assertGenerationComplexity(sections);
  let entryCount = 0;
  let totalUncompressedBytes = 0;
  const packageParts = unzipSync(templateBytes, {
    filter(entry) {
      entryCount += 1;
      totalUncompressedBytes += entry.originalSize;
      if (
        entryCount > MAX_PACKAGE_ENTRIES
        || entry.originalSize > MAX_PACKAGE_ENTRY_BYTES
        || totalUncompressedBytes > MAX_PACKAGE_BYTES
      ) {
        throw new Error("La plantilla DOCX es demasiado grande o compleja.");
      }
      return true;
    },
  });
  assertOfficialTemplate(packageParts);

  const valuesByKey = new Map(sections.map((section) => [section.key ?? "", section.text]));
  const patientName = [patient.firstNames, patient.lastNames].map((value) => value?.trim()).filter(Boolean).join(" ");
  valuesByKey.set("full_name", patientName || hospitalSalvadorMissingValue);
  valuesByKey.set("rut", patient.rut?.trim() || hospitalSalvadorMissingValue);

  const originalXml = strFromU8(packageParts["word/document.xml"]);
  const filledXml = fillOfficialFields(originalXml, valuesByKey);
  if (filledXml.length > MAX_GENERATED_XML_CHARACTERS) {
    throw new Error("El documento generado excede la complejidad permitida.");
  }
  if (!filledXml.includes("<w:sectPr")) throw new Error("La plantilla no contiene una sección Word válida.");
  packageParts["word/document.xml"] = strToU8(filledXml.replace("<w:sectPr", `${signerXml(signer, issueDate)}<w:sectPr`));

  return zipSync(packageParts, { level: 6 });
}
