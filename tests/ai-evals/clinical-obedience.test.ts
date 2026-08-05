import assert from "node:assert/strict";
import test from "node:test";
import { hospitalSalvadorFields } from "../../app/features/ai/hospital-salvador-fields.js";
import { aiTargets } from "../../app/features/ai/targets.ts";
import {
  assertClinicalEval,
  ClinicalEvalAssertionError,
  runClinicalEval,
} from "./harness.ts";
import {
  clinicalEvalFixtures,
  expectedHospitalSalvadorFields,
  type ClinicalEvalFixture,
} from "./fixtures.ts";

test("covers every clinical target with small synthetic fixtures", () => {
  const expectedTargets = [...aiTargets.map((target) => target.id)].sort();
  const coveredTargets = [...new Set(clinicalEvalFixtures.map((fixture) => fixture.target))].sort();
  assert.deepEqual(coveredTargets, expectedTargets);
  assert.equal(clinicalEvalFixtures.length, 10);

  const serializedFixtures = JSON.stringify(clinicalEvalFixtures);
  assert.match(serializedFixtures, /Paciente Sintético/);
  assert.doesNotMatch(serializedFixtures, /Daniel Opazo|17\.752\.753-K/i);
});

test("pins the 18-field Hospital del Salvador contract independently", () => {
  const expectedKeys = expectedHospitalSalvadorFields.map((field) => field.key);
  assert.equal(expectedKeys.length, 18);
  assert.equal(new Set(expectedKeys).size, 18);
  assert.deepEqual(hospitalSalvadorFields.map((field) => field.key), expectedKeys);
  assert.deepEqual(
    hospitalSalvadorFields.map((field) => field.label),
    expectedHospitalSalvadorFields.map((field) => field.label),
  );
});

for (const fixture of clinicalEvalFixtures) {
  test(`${fixture.id}: ${fixture.rule}`, async () => {
    const result = await runClinicalEval(fixture);
    assertClinicalEval(fixture, result);
  });
}

test("repeats the same evaluation without time, randomness or provider drift", async () => {
  const fixture = clinicalEvalFixtures.find((candidate) => candidate.id === "modo-libre-elimina-identidad-repetida");
  assert.ok(fixture);
  const first = await runClinicalEval(fixture);
  const second = await runClinicalEval(fixture);
  assert.deepEqual(second, first);
});

test("reports fixture, invariant and observed output when an expectation regresses", async () => {
  const original = clinicalEvalFixtures.find((candidate) => candidate.id === "certificado-incluye-discurso-y-excluye-laboratorio");
  assert.ok(original);
  const regression: ClinicalEvalFixture = {
    ...original,
    id: "meta-diagnostico-legible",
    expected: {
      ...original.expected,
      forbiddenOutputTerms: [
        ...(original.expected.forbiddenOutputTerms ?? []),
        "Se certifica que la persona puede asistir",
      ],
    },
  };
  const result = await runClinicalEval(regression);

  assert.throws(
    () => assertClinicalEval(regression, result),
    (error: unknown) => {
      assert.ok(error instanceof ClinicalEvalAssertionError);
      assert.match(error.message, /\[meta-diagnostico-legible\]/);
      assert.match(error.message, /contenido excluido ausente/);
      assert.match(error.message, /observado/);
      return true;
    },
  );
});
