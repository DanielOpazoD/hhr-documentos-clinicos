import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { unstable_dev } from "wrangler";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const workerEntrypoint = join(repositoryRoot, "dist", "server", "index.js");
const wranglerConfig = join(repositoryRoot, "dist", "server", "wrangler.json");
const externalOrigin = "https://hhr.integration.test";

export async function startLocalApp() {
  const worker = await unstable_dev(workerEntrypoint, {
    config: wranglerConfig,
    local: true,
    persist: false,
    logLevel: "error",
    vars: {
      OPENAI_API_KEY: "",
      LOCAL_AI_BASE_URL: "",
      LOCAL_AI_API_KEY: "",
    },
    experimental: {
      disableExperimentalWarning: true,
      disableDevRegistry: true,
      showInteractiveDevSession: false,
      watch: false,
    },
  });
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
    // The non-local origin keeps the authentication boundary active while
    // Wrangler owns the ephemeral port and routes each request to this Worker.
    fetch: fetchExternal,
    fetchPreview(path, init) {
      return fetch(new URL(path, localOrigin), init);
    },
    async close() {
      await worker.stop();
    },
  };
}
