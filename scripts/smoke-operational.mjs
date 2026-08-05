import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runOperationalSmoke } from "./lib/operational-smoke.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

const origin = option("--url") ?? process.env.HHR_SMOKE_URL;
if (!origin) throw new Error("Indique el origen publicado mediante --url o HHR_SMOKE_URL.");
const expectedOption = option("--expected-release") ?? process.env.HHR_SMOKE_EXPECTED_RELEASE;
const expectedPath = expectedOption
  ? (isAbsolute(expectedOption) ? expectedOption : resolve(projectRoot, expectedOption))
  : resolve(projectRoot, "dist/client/release.json");
const expectedRelease = JSON.parse(await readFile(expectedPath, "utf8"));

const result = await runOperationalSmoke({
  origin,
  authorization: process.env.HHR_SMOKE_AUTHORIZATION,
  expectedRelease,
});
console.log(JSON.stringify(result, null, 2));
