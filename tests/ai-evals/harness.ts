import { createHash } from "node:crypto";
import {
  CLINICAL_DRAFT_WORKFLOW,
  createClinicalDraftWorkflowTrace,
  runClinicalDraftWorkflow,
  type ClinicalDraftVerification,
  type ClinicalDraftWorkflowEvent,
} from "../../app/features/ai/server/clinical-draft-workflow.ts";
import { isRedundantIdentitySection } from "../../app/features/ai/server/document-hygiene.ts";
import { generateClinicalDraft, type OpenAiOutput } from "../../app/features/ai/server/openai-responses.ts";
import { systemPrompt } from "../../app/features/ai/server/prompt.ts";
import { composePromptInstructions } from "../../app/features/ai/server/prompt-composition.ts";
import { builtInPrompt } from "../../app/features/ai/prompt-catalog.ts";
import type { AiSourceInput } from "../../app/features/ai/types.ts";
import {
  mergeAiSectionsWithTemplate,
  type PreparedAiDocumentSection,
} from "../../app/features/documents/template-ai-sections.ts";
import type { ClinicalEvalFixture } from "./fixtures.ts";
import { strToU8, zipSync } from "fflate";

const offlineProvider = {
  id: "openai" as const,
  name: "Proveedor clínico simulado",
  model: "offline-deterministic",
};

type CapturedProviderRequest = {
  url: string;
  method: string;
  model: string;
  storesResponse: boolean;
  systemInstructions: string;
  userText: string;
  sourceFiles: Array<{ name: string; hasData: boolean; dataHash: string }>;
  schemaName: string;
};

export type ClinicalEvalResult = {
  effectiveInstructions: string;
  systemInstructions: string;
  capturedRequest: CapturedProviderRequest;
  output: OpenAiOutput;
  verification: ClinicalDraftVerification;
  preparedSections: PreparedAiDocumentSection[];
  providerCalls: number;
  trace: ClinicalDraftWorkflowEvent[];
};

export class ClinicalEvalAssertionError extends Error {
  constructor(fixtureId: string, rule: string, expected: unknown, observed: unknown) {
    super(
      `[${fixtureId}] regla «${rule}»: esperado ${compactValue(expected)}; observado ${compactValue(observed)}`,
    );
    this.name = "ClinicalEvalAssertionError";
  }
}

function compactValue(value: unknown): string {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  if (!serialized) return String(value);
  return serialized.length > 240 ? `${serialized.slice(0, 237)}...` : serialized;
}

function normalized(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("es-CL").replace(/\s+/g, " ").trim();
}

function outputText(result: ClinicalEvalResult): string {
  return [
    result.output.documentKind,
    result.output.processingSummary,
    ...result.output.sections.flatMap((section) => [section.title, section.text]),
    ...result.output.missingInformation,
  ].join("\n");
}

function invariant(
  fixture: ClinicalEvalFixture,
  rule: string,
  expected: unknown,
  observed: unknown,
  satisfied: boolean,
): void {
  if (!satisfied) throw new ClinicalEvalAssertionError(fixture.id, rule, expected, observed);
}

function escapedXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function syntheticSourceFile(text: string, index: number): AiSourceInput {
  const paragraphs = text.split("\n").map((line) =>
    `<w:p><w:r><w:t xml:space="preserve">${escapedXml(line)}</w:t></w:r></w:p>`,
  ).join("");
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr/></w:body></w:document>`;
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const relationshipsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  // fflate writes local DOS date fields; fixed local components keep the bytes equal across TZ values.
  const bytes = zipSync({
    "[Content_Types].xml": strToU8(contentTypesXml),
    "_rels/.rels": strToU8(relationshipsXml),
    "word/document.xml": strToU8(documentXml),
  }, { mtime: new Date(2000, 0, 1) });
  const sourceName = `fuente-sintetica-${index + 1}.docx`;
  return {
    file: new File([bytes], sourceName, {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    sourceName,
  };
}

function captureRequest(url: string | URL | Request, init: RequestInit | undefined): CapturedProviderRequest {
  const payload = JSON.parse(String(init?.body ?? "{}")) as {
    model?: unknown;
    store?: unknown;
    input?: Array<{
      role?: unknown;
      content?: unknown;
    }>;
    text?: { format?: { name?: unknown } };
  };
  const systemMessage = payload.input?.find((message) => message.role === "system");
  const userMessage = payload.input?.find((message) => message.role === "user");
  const userContent = Array.isArray(userMessage?.content)
    ? userMessage.content as Array<Record<string, unknown>>
    : [];
  return {
    url: String(url),
    method: String(init?.method ?? "GET"),
    model: String(payload.model ?? ""),
    storesResponse: payload.store === true,
    systemInstructions: typeof systemMessage?.content === "string" ? systemMessage.content : "",
    userText: userContent
      .filter((item) => item.type === "input_text" && typeof item.text === "string")
      .map((item) => String(item.text))
      .join("\n"),
    sourceFiles: userContent
      .filter((item) => item.type === "input_file")
      .map((item) => ({
        name: String(item.filename ?? ""),
        hasData: typeof item.file_data === "string" && item.file_data.startsWith("data:"),
        dataHash: typeof item.file_data === "string"
          ? createHash("sha256").update(item.file_data).digest("hex")
          : "",
      })),
    schemaName: String(payload.text?.format?.name ?? ""),
  };
}

export async function runClinicalEval(fixture: ClinicalEvalFixture): Promise<ClinicalEvalResult> {
  const profile = builtInPrompt(fixture.target);
  const effectiveInstructions = composePromptInstructions({
    mode: fixture.mode,
    baseInstructions: profile.instructions,
    userInstructions: fixture.userInstructions,
  });
  const systemInstructions = systemPrompt(fixture.target, effectiveInstructions, fixture.mode);

  let tick = 0;
  let providerCalls = 0;
  let capturedRequest: CapturedProviderRequest | null = null;
  const sources = fixture.sources.map((source, index) => syntheticSourceFile(source.text, index));
  const simulatedFetcher: typeof fetch = async (url, init) => {
    providerCalls += 1;
    capturedRequest = captureRequest(url, init);
    return new Response(JSON.stringify({
      output: [{
        content: [{ type: "output_text", text: JSON.stringify(fixture.rawDraft) }],
      }],
      usage: {
        input_tokens: 11,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 7,
        total_tokens: 18,
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const trace = createClinicalDraftWorkflowTrace(() => tick++);
  trace.record("resolve_prompt", "completed");
  trace.record("validate_sources", "completed");
  trace.record("reserve_execution", "completed");

  const generated = await runClinicalDraftWorkflow({
    trace,
    execute: async (action) => action(new AbortController().signal),
    generate: async (signal) => {
      if (signal.aborted) throw signal.reason;
      const generated = await generateClinicalDraft({
        apiKey: "",
        model: "gpt-5-mini",
        sources,
        target: fixture.target,
        promptMode: fixture.mode,
        promptInstructions: effectiveInstructions,
        professionalInstructions: fixture.userInstructions,
        signal,
        fetcher: simulatedFetcher,
      });
      return {
        ...generated,
        provider: offlineProvider,
      };
    },
  });

  if (!capturedRequest) throw new Error(`[${fixture.id}] el proveedor simulado no recibió ninguna solicitud.`);

  trace.record("record_usage", "completed");
  trace.record("audit", "completed");
  trace.record("deliver", "completed");

  const preparedSections = mergeAiSectionsWithTemplate(
    generated.output.sections,
    fixture.expected.templateSections,
    fixture.expected.defaultTemplateSections,
  );

  return {
    effectiveInstructions,
    systemInstructions,
    capturedRequest,
    output: generated.output,
    verification: generated.verification,
    preparedSections,
    providerCalls,
    trace: trace.snapshot(),
  };
}

function assertNoRedundantIdentity(fixture: ClinicalEvalFixture, result: ClinicalEvalResult): void {
  const redundant = result.output.sections
    .filter((section) => isRedundantIdentitySection(section, result.output.patient))
    .map((section) => section.title);
  invariant(fixture, "identidad estructurada sin sección redundante", [], redundant, redundant.length === 0);
}

export function assertClinicalEval(fixture: ClinicalEvalFixture, result: ClinicalEvalResult): void {
  invariant(
    fixture,
    "resultado de verificación clínica",
    fixture.expected.outcome,
    result.verification,
    result.verification.outcome === fixture.expected.outcome,
  );

  const modelNodes = CLINICAL_DRAFT_WORKFLOW.nodes.filter((node) => node.kind === "model").map((node) => node.id);
  const generatedEvents = result.trace.filter((event) => event.node === "generate");
  invariant(fixture, "único nodo de modelo", ["generate"], modelNodes, modelNodes.length === 1 && modelNodes[0] === "generate");
  invariant(fixture, "una ejecución del proveedor", 1, result.providerCalls, result.providerCalls === 1);
  invariant(fixture, "una ejecución del nodo generate", 1, generatedEvents, generatedEvents.length === 1);

  invariant(
    fixture,
    "endpoint real capturado por el transporte simulado",
    "https://api.openai.com/v1/responses",
    result.capturedRequest.url,
    result.capturedRequest.url === "https://api.openai.com/v1/responses",
  );
  invariant(fixture, "método del proveedor", "POST", result.capturedRequest.method, result.capturedRequest.method === "POST");
  invariant(fixture, "respuesta remota no persistida", false, result.capturedRequest.storesResponse, !result.capturedRequest.storesResponse);
  invariant(
    fixture,
    "schema estructurado enviado al proveedor",
    "clinical_document_draft",
    result.capturedRequest.schemaName,
    result.capturedRequest.schemaName === "clinical_document_draft",
  );
  invariant(
    fixture,
    "contrato de sistema enviado al proveedor",
    result.systemInstructions,
    result.capturedRequest.systemInstructions,
    result.capturedRequest.systemInstructions === result.systemInstructions,
  );
  const expectedSourceFiles = fixture.sources.map((_, index) => `fuente-sintetica-${index + 1}.docx`);
  invariant(
    fixture,
    "fuentes enviadas al proveedor",
    expectedSourceFiles,
    result.capturedRequest.sourceFiles,
    result.capturedRequest.sourceFiles.length === expectedSourceFiles.length
      && result.capturedRequest.sourceFiles.every((source, index) =>
        source.name === expectedSourceFiles[index]
        && source.hasData
        && /^[a-f0-9]{64}$/.test(source.dataHash),
      ),
  );
  fixture.sources.forEach((_, index) => {
    const descriptor = `FUENTE ${index + 1} · source_index ${index}`;
    invariant(
      fixture,
      `descriptor de fuente ${index + 1}`,
      descriptor,
      result.capturedRequest.userText,
      result.capturedRequest.userText.includes(descriptor),
    );
  });
  for (const term of fixture.expected.requiredPromptTerms ?? []) {
    invariant(
      fixture,
      "restricción independiente presente en el prompt",
      term,
      result.capturedRequest.systemInstructions,
      normalized(result.capturedRequest.systemInstructions).includes(normalized(term)),
    );
  }
  if (fixture.userInstructions) {
    invariant(
      fixture,
      "instrucción profesional enviada como fuente",
      fixture.userInstructions,
      result.capturedRequest.userText,
      result.capturedRequest.userText.includes(fixture.userInstructions),
    );
  }

  const unverifiedEvidence = result.output.sections.flatMap((section) =>
    section.evidence
      .filter((evidence) => evidence.verification !== "verified")
      .map((evidence) => ({ section: section.title, sourceIndex: evidence.sourceIndex, page: evidence.page })),
  );
  invariant(fixture, "evidencia local verificable", [], unverifiedEvidence, unverifiedEvidence.length === 0);
  assertNoRedundantIdentity(fixture, result);

  if (fixture.expected.sectionTitles) {
    const observed = result.output.sections.map((section) => section.title);
    invariant(
      fixture,
      "secciones esperadas en orden",
      fixture.expected.sectionTitles,
      observed,
      JSON.stringify(observed) === JSON.stringify(fixture.expected.sectionTitles),
    );
  }
  if (fixture.expected.sectionKeys) {
    const observed = result.output.sections.map((section) => section.key ?? "");
    invariant(
      fixture,
      "claves de secciones esperadas en orden",
      fixture.expected.sectionKeys,
      observed,
      JSON.stringify(observed) === JSON.stringify(fixture.expected.sectionKeys),
    );
  }

  const observedTitles = result.output.sections.map((section) => normalized(section.title));
  for (const title of fixture.expected.forbiddenSectionTitles ?? []) {
    invariant(
      fixture,
      "sección no solicitada ausente",
      `sin «${title}»`,
      result.output.sections.map((section) => section.title),
      !observedTitles.includes(normalized(title)),
    );
  }

  const deliveredText = normalized(outputText(result));
  for (const term of fixture.expected.requiredOutputTerms ?? []) {
    invariant(
      fixture,
      "contenido solicitado presente",
      term,
      outputText(result),
      deliveredText.includes(normalized(term)),
    );
  }
  for (const term of fixture.expected.forbiddenOutputTerms ?? []) {
    invariant(
      fixture,
      "contenido excluido ausente",
      `sin «${term}»`,
      outputText(result),
      !deliveredText.includes(normalized(term)),
    );
  }

  for (const missing of fixture.expected.missingIncludes ?? []) {
    invariant(
      fixture,
      "dato no encontrado explícito",
      missing,
      result.output.missingInformation,
      result.output.missingInformation.includes(missing),
    );
  }

  for (const [key, expected] of Object.entries(fixture.expected.patient ?? {})) {
    const observed = result.output.patient[key as keyof typeof result.output.patient];
    invariant(fixture, `identidad del paciente: ${key}`, expected, observed, observed === expected);
  }

  if (fixture.expected.preparedSections) {
    const observed = result.preparedSections.map((section) => ({
      id: section.id,
      title: section.title,
      body: section.body,
    }));
    invariant(
      fixture,
      "cantidad de secciones ensambladas",
      fixture.expected.preparedSections.length,
      observed,
      observed.length === fixture.expected.preparedSections.length,
    );
    fixture.expected.preparedSections.forEach((expected, index) => {
      const section = observed[index];
      const matches = section?.id === expected.id
        && section.title === expected.title
        && (!expected.bodyIncludes || normalized(section.body).includes(normalized(expected.bodyIncludes)));
      invariant(fixture, `sección ensamblada ${index + 1}`, expected, section, Boolean(matches));
    });
  }
}
