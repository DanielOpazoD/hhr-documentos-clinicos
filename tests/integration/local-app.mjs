import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { unstable_dev } from "wrangler";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const workerEntrypoint = join(repositoryRoot, "dist", "server", "index.js");
const wranglerConfig = join(repositoryRoot, "dist", "server", "wrangler.json");
const migrationsDirectory = join(repositoryRoot, "dist", ".openai", "drizzle");
const wranglerCli = join(
  repositoryRoot,
  "node_modules",
  "wrangler",
  "bin",
  "wrangler.js",
);
const externalOrigin = "https://hhr.integration.test";
const execFileAsync = promisify(execFile);

export async function startLocalApp({ seedSql = [], vars = {} } = {}) {
  const integrationRoot = await mkdtemp(join(tmpdir(), "hhr-worker-integration-"));
  const stateRoot = join(integrationRoot, "state");
  const integrationConfig = join(integrationRoot, "wrangler.json");
  const config = JSON.parse(await readFile(wranglerConfig, "utf8"));
  const databaseBinding = config.d1_databases[0]?.binding;
  if (!databaseBinding) throw new Error("La configuración de integración no define un binding D1.");
  config.main = workerEntrypoint;
  config.assets.directory = join(repositoryRoot, "dist", "client");
  config.d1_databases = config.d1_databases.map((database) => ({
    ...database,
    migrations_dir: migrationsDirectory,
  }));
  await writeFile(integrationConfig, JSON.stringify(config));

  let worker;
  try {
    await execFileAsync(process.execPath, [wranglerCli,
      "d1",
      "migrations",
      "apply",
      databaseBinding,
      "--local",
      "--config",
      integrationConfig,
      "--persist-to",
      stateRoot,
    ], {
      cwd: repositoryRoot,
      env: { ...process.env, CI: "1" },
    });
    for (const sql of seedSql) {
      await execFileAsync(process.execPath, [wranglerCli,
        "d1",
        "execute",
        databaseBinding,
        "--local",
        "--config",
        integrationConfig,
        "--persist-to",
        stateRoot,
        "--command",
        sql,
      ], {
        cwd: repositoryRoot,
        env: { ...process.env, CI: "1" },
      });
    }
    worker = await unstable_dev(workerEntrypoint, {
      config: integrationConfig,
      local: true,
      persist: true,
      persistTo: stateRoot,
      logLevel: "error",
      vars: {
        OPENAI_API_KEY: "",
        LOCAL_AI_BASE_URL: "",
        LOCAL_AI_API_KEY: "",
        PUBLIC_APP_ORIGIN: externalOrigin,
        ...vars,
      },
      experimental: {
        disableExperimentalWarning: true,
        disableDevRegistry: true,
        showInteractiveDevSession: false,
        watch: false,
      },
    });
  } catch (error) {
    await rm(integrationRoot, { recursive: true, force: true });
    throw error;
  }
  const localOrigin = `http://${worker.address}:${worker.port}`;

  async function fetchExternal(path, init = {}) {
    const request = new Request(new URL(path, externalOrigin), init);
    const forwardedInit = {
      method: request.method,
      headers: request.headers,
    };
    if (request.body !== null) forwardedInit.body = await request.arrayBuffer();
    return worker.fetch(request.url, forwardedInit);
  }

  return {
    origin: localOrigin,
    // The non-local origin keeps the authentication boundary active while
    // Wrangler owns the ephemeral port and routes each request to this Worker.
    fetch: fetchExternal,
    fetchPreview(path, init) {
      return fetch(new URL(path, localOrigin), init);
    },
    async close() {
      await worker.stop();
      await rm(integrationRoot, { recursive: true, force: true });
    },
  };
}
