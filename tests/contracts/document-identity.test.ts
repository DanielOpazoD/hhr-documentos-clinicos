import assert from "node:assert/strict";
import test from "node:test";
import { patientFromStored, patientFullName, patientWithFullName } from "../../app/features/documents/identity.ts";

test("preserves the existing surname structure when editing a combined patient name", () => {
  const patient = { firstNames: "Ana María", lastNames: "Pérez Soto", rut: "", birthDate: "" };
  const edited = patientWithFullName(patient, "Ana Sofía Pérez Rojas ");

  assert.deepEqual(edited, { ...patient, fullName: "Ana Sofía Pérez Rojas " });
  assert.equal(edited.firstNames, "Ana María");
  assert.equal(edited.lastNames, "Pérez Soto");
  assert.equal(patientFullName(edited), "Ana Sofía Pérez Rojas");
});

test("keeps a new combined name usable when no surname structure exists", () => {
  const patient = { firstNames: "", lastNames: "", rut: "", birthDate: "" };
  const edited = patientWithFullName(patient, "Claudia Tuki Morales");

  assert.deepEqual(edited, { ...patient, fullName: "Claudia Tuki Morales" });
  assert.equal(patientFullName(edited), "Claudia Tuki Morales");
});

test("hydrates one editable full name from legacy split identity fields", () => {
  const patient = patientFromStored(
    { firstNames: "Ana María", lastNames: "Pérez Soto", rut: "11.111.111-1" },
    "",
    "",
  );

  assert.equal(patient.fullName, "Ana María Pérez Soto");
  assert.equal(patient.firstNames, "Ana María");
  assert.equal(patient.lastNames, "Pérez Soto");
});
