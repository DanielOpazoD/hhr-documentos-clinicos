import { createHospitalSalvadorDocxBytes } from "@/app/features/ai/server/hospital-salvador-docx.js";
import { auditBestEffort } from "@/app/lib/server/audit";
import { requestOwner } from "@/app/lib/server/auth";
import { readBoundedFormData, RequestBodyTooLargeError } from "@/app/lib/server/bounded-multipart";
import { jsonError, observeApi } from "@/app/lib/server/http";

const DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_REQUEST_BYTES = 512_000;
const MAX_TEMPLATE_BYTES = 128_000;
const MAX_PAYLOAD_CHARACTERS = 240_000;
const MAX_SECTIONS = 32;
const MAX_SECTION_CHARACTERS = 30_000;
const MAX_TOTAL_SECTION_CHARACTERS = 200_000;
const MAX_GENERATED_PARAGRAPHS = 512;

type DocxPayload = {
  sections: Array<{ key?: string; title: string; text: string }>;
  patient: { firstNames?: string; lastNames?: string; rut?: string };
  signer: { name?: string; rut?: string; specialty?: string };
  issueDate: Date;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function optionalString(input: Record<string, unknown>, key: string, maxLength: number): string | null {
  const value = input[key];
  if (value === undefined || value === null) return "";
  return typeof value === "string" && value.length <= maxLength ? value : null;
}

function generatedParagraphs(value: string): number {
  let paragraphs = 0;
  let lineHasText = false;
  for (const character of value) {
    if (character === "\n" || character === "\r") {
      if (lineHasText) paragraphs += 1;
      lineHasText = false;
    } else if (!/\s/u.test(character)) {
      lineHasText = true;
    }
  }
  return paragraphs + (lineHasText ? 1 : 0);
}

function parsePayload(serialized: string): DocxPayload | null {
  if (!serialized || serialized.length > MAX_PAYLOAD_CHARACTERS) return null;
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    return null;
  }
  const input = record(value);
  const patientInput = record(input?.patient);
  const signerInput = record(input?.signer);
  if (!input || !patientInput || !signerInput || !Array.isArray(input.sections)) return null;
  if (!input.sections.length || input.sections.length > MAX_SECTIONS) return null;

  let totalSectionCharacters = 0;
  let totalGeneratedParagraphs = 0;
  const sections: DocxPayload["sections"] = [];
  for (const candidate of input.sections) {
    const section = record(candidate);
    if (!section) return null;
    const key = optionalString(section, "key", 80);
    const title = optionalString(section, "title", 240);
    const text = optionalString(section, "text", MAX_SECTION_CHARACTERS);
    if (key === null || title === null || text === null) return null;
    totalSectionCharacters += text.length;
    totalGeneratedParagraphs += generatedParagraphs(text);
    if (totalSectionCharacters > MAX_TOTAL_SECTION_CHARACTERS) return null;
    if (totalGeneratedParagraphs > MAX_GENERATED_PARAGRAPHS) return null;
    sections.push({ ...(key ? { key } : {}), title, text });
  }

  const firstNames = optionalString(patientInput, "firstNames", 160);
  const lastNames = optionalString(patientInput, "lastNames", 160);
  const patientRut = optionalString(patientInput, "rut", 32);
  const signerName = optionalString(signerInput, "name", 160);
  const signerRut = optionalString(signerInput, "rut", 32);
  const signerSpecialty = optionalString(signerInput, "specialty", 160);
  if ([firstNames, lastNames, patientRut, signerName, signerRut, signerSpecialty].some((item) => item === null)) return null;
  if (typeof input.issueDate !== "string") return null;
  const issueDate = new Date(input.issueDate);
  if (Number.isNaN(issueDate.getTime())) return null;

  return {
    sections,
    patient: { firstNames: firstNames!, lastNames: lastNames!, rut: patientRut! },
    signer: { name: signerName!, rut: signerRut!, specialty: signerSpecialty! },
    issueDate,
  };
}

async function createOfficialDocx(request: Request) {
  const owner = requestOwner(request);
  if (!owner) return jsonError("Autenticación requerida.", 401);
  let form: FormData;
  try {
    form = await readBoundedFormData(request, MAX_REQUEST_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) return jsonError("La solicitud es demasiado grande.", 413);
    return jsonError("Solicitud no válida.");
  }
  const template = form.get("template");
  const serializedPayload = form.get("payload");
  if (!(template instanceof File) || typeof serializedPayload !== "string") {
    return jsonError("Solicitud no válida.");
  }
  if (!template.size || template.size > MAX_TEMPLATE_BYTES) {
    return jsonError("La plantilla oficial no tiene un tamaño válido.", 413);
  }
  const payload = parsePayload(serializedPayload);
  if (!payload) return jsonError("Los datos del documento no son válidos.");

  let output: Uint8Array;
  try {
    output = createHospitalSalvadorDocxBytes(
      new Uint8Array(await template.arrayBuffer()),
      payload.sections,
      payload.patient,
      payload.signer,
      payload.issueDate,
    );
  } catch {
    return jsonError("La plantilla oficial no es válida.", 422, "INVALID_TEMPLATE");
  }
  await auditBestEffort(owner, "generated", "hospital_salvador_docx", crypto.randomUUID(), {
    sectionCount: payload.sections.length,
    templateBytes: template.size,
    outputBytes: output.byteLength,
  });
  return new Response(Uint8Array.from(output).buffer, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="informe-traslado-hospital-salvador.docx"',
      "Content-Type": DOCX_CONTENT_TYPE,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const POST = observeApi("ai.hospital-salvador-docx.POST", createOfficialDocx);
