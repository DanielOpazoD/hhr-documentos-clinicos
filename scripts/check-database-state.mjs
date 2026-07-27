import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const migrationsRoot = join(projectRoot, "drizzle");
const schemaPath = join(projectRoot, "db/schema.ts");
const drizzleBinary = join(
  projectRoot,
  "node_modules/.bin",
  process.platform === "win32" ? "drizzle-kit.cmd" : "drizzle-kit",
);

async function directorySnapshot(root) {
  const snapshot = new Map();

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return visit(path);
      const digest = createHash("sha256").update(await readFile(path)).digest("hex");
      snapshot.set(relative(root, path), digest);
    }));
  }

  await visit(root);
  return snapshot;
}

function snapshotChanges(expected, generated) {
  const paths = new Set([...expected.keys(), ...generated.keys()]);
  return [...paths]
    .filter((path) => expected.get(path) !== generated.get(path))
    .toSorted();
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "hhr-drizzle-check-"));
const generatedRoot = join(temporaryRoot, basename(migrationsRoot));

try {
  await cp(migrationsRoot, generatedRoot, { recursive: true });
  const generated = spawnSync(drizzleBinary, [
    "generate",
    "--schema", schemaPath,
    "--out", basename(generatedRoot),
    "--dialect", "sqlite",
  ], {
    cwd: temporaryRoot,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (generated.stdout) process.stdout.write(generated.stdout);
  if (generated.stderr) process.stderr.write(generated.stderr);
  if (generated.status !== 0 || /(?:^|\n)(?:Error:|\s*✘)/m.test(generated.stderr ?? "")) {
    throw new Error(`No se pudo verificar el estado de Drizzle (salida ${generated.status ?? "desconocida"}).`);
  }

  const [expectedSnapshot, generatedSnapshot] = await Promise.all([
    directorySnapshot(migrationsRoot),
    directorySnapshot(generatedRoot),
  ]);
  const changes = snapshotChanges(expectedSnapshot, generatedSnapshot);
  if (changes.length) {
    throw new Error(
      `Las migraciones versionadas no representan el esquema actual: ${changes.slice(0, 8).join(", ")}. ` +
      "Ejecute npm run db:generate y revise los archivos generados.",
    );
  }

  console.log("Drizzle schema and migrations are in sync.");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
