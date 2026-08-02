import assert from "node:assert/strict";
import test from "node:test";
import { summarizeAiSourcesForAudit } from "../../app/features/ai/server/operational-metadata.ts";

test("summarizes AI sources without retaining filenames or clinical context", () => {
  const sources = [
    {
      file: { size: 1_024 },
      mimeType: "application/pdf",
      sourceName: "Paciente 11.111.111-1 laboratorio.pdf",
      prompt: "Diagnóstico privado",
    },
    {
      file: { size: 512 },
      mimeType: "image/png",
      sourceName: "interconsulta secreta.png",
    },
    {
      file: { size: 256 },
      mimeType: "application/pdf",
      sourceName: "epicrisis.pdf",
    },
  ];

  const metadata = summarizeAiSourcesForAudit(sources);

  assert.deepEqual(metadata, {
    sourceCount: 3,
    totalSize: 1_792,
    sourceTypeCounts: {
      "application/pdf": 2,
      "image/png": 1,
    },
  });
  assert.doesNotMatch(JSON.stringify(metadata), /Paciente|11\.111\.111-1|laboratorio|Diagnóstico|interconsulta|epicrisis/);
});

test("returns an explicit empty operational summary", () => {
  assert.deepEqual(summarizeAiSourcesForAudit([]), {
    sourceCount: 0,
    totalSize: 0,
    sourceTypeCounts: {},
  });
});
