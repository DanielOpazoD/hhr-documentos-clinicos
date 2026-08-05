import { runOperationalSmoke } from "./lib/operational-smoke.mjs";

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

const origin = option("--url") ?? process.env.HHR_SMOKE_URL;
if (!origin) throw new Error("Indique el origen publicado mediante --url o HHR_SMOKE_URL.");

const result = await runOperationalSmoke({
  origin,
  authorization: process.env.HHR_SMOKE_AUTHORIZATION,
});
console.log(JSON.stringify(result, null, 2));
