import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const wranglerEntrypoint = join(repositoryRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const wranglerConfig = join(repositoryRoot, "dist", "server", "wrangler.json");

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No se pudo reservar un puerto local.");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function waitUntilReady(origin, child, output) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`El Worker terminó antes de iniciar.\n${output()}`);
    }
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(1_000) });
      if (response.status < 500) return;
    } catch {
      // Wrangler todavía está iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`El Worker no respondió dentro de 30 segundos.\n${output()}`);
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolve(false);
    }, timeoutMs);
    child.once("exit", onExit);
  });
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  if (await waitForExit(child, 3_000)) return;
  child.kill("SIGKILL");
  await waitForExit(child, 1_000);
}

export async function startLocalApp() {
  const stateDirectory = await mkdtemp(join(tmpdir(), "hhr-integration-"));
  const environmentFile = join(stateDirectory, "test.env");
  const logPath = join(stateDirectory, "wrangler.log");
  await writeFile(environmentFile, [
    "OPENAI_API_KEY=",
    "LOCAL_AI_BASE_URL=",
    "LOCAL_AI_API_KEY=",
  ].join("\n"));

  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [
    wranglerEntrypoint,
    "dev",
    "--config", wranglerConfig,
    "--local",
    "--ip", "127.0.0.1",
    "--port", String(port),
    "--inspector-port", "0",
    "--persist-to", stateDirectory,
    "--env-file", environmentFile,
    "--log-level", "error",
    "--show-interactive-dev-session", "false",
  ], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      CI: "true",
      NO_COLOR: "1",
      WRANGLER_LOG_PATH: logPath,
      WRANGLER_SEND_METRICS: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let processOutput = "";
  const appendOutput = (chunk) => {
    processOutput = `${processOutput}${chunk}`.slice(-12_000);
  };
  child.stdout.on("data", appendOutput);
  child.stderr.on("data", appendOutput);

  try {
    await waitUntilReady(origin, child, () => processOutput);
  } catch (error) {
    await stopChild(child);
    await rm(stateDirectory, { recursive: true, force: true });
    throw error;
  }

  return {
    origin,
    output: () => processOutput,
    async close() {
      await stopChild(child);
      await rm(stateDirectory, { recursive: true, force: true });
    },
  };
}
