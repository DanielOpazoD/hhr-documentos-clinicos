import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { relative } from "node:path";
import test from "node:test";

const apiRoot = new URL("../../app/api/", import.meta.url);
const HTTP_METHOD = /export const (GET|POST|PUT|PATCH|DELETE)\s*=/g;

async function routeFiles(directory: URL): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const url = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, directory);
    if (entry.isDirectory()) return routeFiles(url);
    return entry.isFile() && entry.name === "route.ts" ? [url] : [];
  }));
  return nested.flat().toSorted((left, right) => left.pathname.localeCompare(right.pathname));
}

test("routes every exported API method through the shared operational contract", async () => {
  const files = await routeFiles(apiRoot);
  const logicalRoutes = new Set<string>();
  let handlerCount = 0;

  assert.equal(files.length, 18);
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const methods = [...source.matchAll(HTTP_METHOD)].map((match) => match[1]);
    const displayPath = relative(apiRoot.pathname, file.pathname);
    assert.ok(methods.length > 0, `${displayPath} no exporta un método HTTP`);
    assert.match(source, /import \{[^}]*observeApi[^}]*\} from "@\/app\/lib\/server\/http";/);

    for (const method of methods) {
      const wrapped = source.match(new RegExp(
        `export const ${method}\\s*=\\s*observeApi\\("([a-z0-9.-]+\\.${method})",`,
      ));
      assert.ok(wrapped, `${displayPath} exporta ${method} fuera de observeApi`);
      assert.equal(logicalRoutes.has(wrapped[1]), false, `ruta lógica duplicada: ${wrapped[1]}`);
      logicalRoutes.add(wrapped[1]);
      handlerCount += 1;
    }
  }

  assert.equal(handlerCount, 34);
});
