import assert from "node:assert/strict";
import test from "node:test";
import {
  OpenAiGenerationError,
  classifyOpenAiFailure,
  generateClinicalDraft,
} from "../../app/features/ai/server/openai-responses.ts";

test("classifies OpenAI failures without exposing upstream messages", () => {
  const cases = [
    [401, { error: { code: "invalid_api_key", message: "secret detail" } }, "AI_PROVIDER_AUTH_FAILED"],
    [429, { error: { code: "insufficient_quota", message: "secret detail" } }, "AI_PROVIDER_QUOTA_EXHAUSTED"],
    [429, { error: { code: "credit_balance_exhausted", type: "insufficient_quota", message: "secret detail" } }, "AI_PROVIDER_QUOTA_EXHAUSTED"],
    [429, { error: { code: "rate_limit_exceeded", message: "secret detail" } }, "AI_PROVIDER_RATE_LIMITED"],
    [403, { error: { code: "model_not_found", message: "secret detail" } }, "AI_MODEL_UNAVAILABLE"],
    [503, { error: { code: "server_error", message: "secret detail" } }, "AI_PROVIDER_UNAVAILABLE"],
  ] as const;

  for (const [status, payload, expectedCode] of cases) {
    const failure = classifyOpenAiFailure(status, payload);
    assert.equal(failure.publicCode, expectedCode);
    assert.doesNotMatch(failure.message, /secret detail/);
  }
});

test("reports an incomplete OpenAI response and gives GPT-5.6 enough output budget", async () => {
  let body: { max_output_tokens?: number } = {};
  await assert.rejects(
    generateClinicalDraft({
      apiKey: "fixture",
      model: "gpt-5.6-luna",
      sources: [{
        file: new File(['{"patient":{"name":"Paciente sintético"}}'], "datos.json", { type: "application/json" }),
        sourceName: "datos.json",
        mimeType: "application/json",
      }],
      target: "certificado",
      promptInstructions: "Redacte un certificado breve.",
      fetcher: async (_url, init) => {
        body = JSON.parse(String(init?.body ?? "{}")) as typeof body;
        return new Response(JSON.stringify({
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
          output: [{ content: [{ type: "output_text", text: '{"document_kind":"partial"}' }] }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof OpenAiGenerationError);
      assert.equal(error.publicCode, "AI_RESPONSE_INCOMPLETE");
      return true;
    },
  );
  assert.equal(body.max_output_tokens, 12_000);
});
