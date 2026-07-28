import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { parseArgs, promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const wranglerCli = resolve(
  projectRoot,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);
const execFileAsync = promisify(execFile);

const addDefaultColumnSql =
  "ALTER TABLE signatures ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0";
const ensureDefaultIndexSql =
  "CREATE UNIQUE INDEX IF NOT EXISTS signatures_owner_default_idx "
  + "ON signatures(owner_email) WHERE is_default = 1";

export function prepareLegacySignatureSchema(db) {
  const columns = db.prepare("PRAGMA table_info(signatures)").all();
  if (!columns.length) throw new Error("La tabla signatures aún no existe; aplique primero 0001.");
  const columnAdded = !columns.some((column) => column.name === "is_default");
  if (columnAdded) db.exec(addDefaultColumnSql);
  db.exec(ensureDefaultIndexSql);
  return { columnAdded };
}

function schemaRows(output) {
  const start = output.indexOf("[");
  if (start < 0) throw new Error("Wrangler no devolvió una respuesta JSON.");
  const response = JSON.parse(output.slice(start));
  return response.flatMap((entry) => entry.results ?? entry.result?.results ?? []);
}

async function main() {
  const { values } = parseArgs({
    options: {
      database: { type: "string" },
      config: { type: "string" },
      local: { type: "boolean", default: false },
      "persist-to": { type: "string" },
    },
  });
  if (!values.database || !values.config) {
    throw new Error(
      "Uso: npm run db:prepare -- --database <database> --config <operator-config> "
      + "[--local --persist-to <directorio>]",
    );
  }
  if (!values.local && values["persist-to"]) {
    throw new Error("--persist-to solo puede utilizarse junto con --local.");
  }

  const target = values.local ? "--local" : "--remote";
  const common = [
    "d1",
    "execute",
    values.database,
    target,
    "--config",
    resolve(values.config),
    ...(values["persist-to"] ? ["--persist-to", resolve(values["persist-to"])] : []),
  ];
  const environment = { ...process.env, CI: "1" };
  const query = await execFileAsync(process.execPath, [wranglerCli,
    ...common,
    "--command",
    "PRAGMA table_info(signatures)",
    "--json",
  ], { cwd: projectRoot, env: environment });
  const columns = schemaRows(query.stdout);
  if (!columns.length) throw new Error("La tabla signatures aún no existe; aplique primero 0001.");
  const columnAdded = !columns.some((column) => column.name === "is_default");

  if (columnAdded) {
    await execFileAsync(process.execPath, [wranglerCli,
      ...common,
      "--command",
      addDefaultColumnSql,
    ], { cwd: projectRoot, env: environment });
  }
  await execFileAsync(process.execPath, [wranglerCli,
    ...common,
    "--command",
    ensureDefaultIndexSql,
  ], { cwd: projectRoot, env: environment });

  console.log(
    columnAdded
      ? "Compatibilidad histórica preparada: columna e índice de firma disponibles."
      : "Compatibilidad histórica ya preparada; índice de firma verificado.",
  );
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
