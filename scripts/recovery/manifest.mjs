import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const RECOVERY_FORMAT = "hhr-d1-r2-recovery-v1";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function databaseInventory(db) {
  const schemaEntries = db.prepare(`SELECT type, name, tbl_name AS tableName, sql
    FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
    ORDER BY type, name`).all().map((entry) => ({ ...entry }));
  const tables = schemaEntries
    .filter((entry) => entry.type === "table")
    .map((entry) => entry.name)
    .toSorted();
  const tableInventory = tables.map((name) => {
    const rows = db.prepare(`SELECT * FROM ${quoteIdentifier(name)}`).all()
      .map((row) => canonicalJson({ ...row }))
      .toSorted();
    return {
      name,
      rows: rows.length,
      sha256: sha256(`[${rows.join(",")}]`),
    };
  });
  const migrations = tables.includes("d1_migrations")
    ? db.prepare("SELECT name FROM d1_migrations ORDER BY id").all().map((row) => String(row.name))
    : [];
  return {
    schemaSha256: sha256(canonicalJson(schemaEntries)),
    migrations,
    tables: tableInventory,
  };
}

export async function databasePayloadSha256(path) {
  return sha256(await readFile(path));
}

export function ownerSlots(db) {
  const owners = new Set();
  const tables = db.prepare(`SELECT name FROM sqlite_schema
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`).all();
  for (const { name } of tables) {
    const hasOwner = db.prepare(`PRAGMA table_info(${quoteIdentifier(name)})`).all()
      .some((column) => column.name === "owner_email");
    if (!hasOwner) continue;
    for (const row of db.prepare(`SELECT DISTINCT owner_email AS owner FROM ${quoteIdentifier(name)} WHERE owner_email IS NOT NULL`).all()) {
      owners.add(String(row.owner));
    }
  }
  return new Map([...owners].toSorted().map((owner, index) => [owner, `owner-${String(index + 1).padStart(3, "0")}`]));
}

export function ownershipInventory(db, slots = ownerSlots(db)) {
  const ownedTables = db.prepare(`SELECT name FROM sqlite_schema
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
    ORDER BY name`).all().flatMap(({ name }) => {
    const hasOwner = db.prepare(`PRAGMA table_info(${quoteIdentifier(name)})`).all()
      .some((column) => column.name === "owner_email");
    return hasOwner ? [name] : [];
  });
  return [...slots.entries()].map(([owner, slot]) => ({
    slot,
    tables: ownedTables.flatMap((table) => {
      const count = Number(db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)} WHERE owner_email = ?`).get(owner)?.count ?? 0);
      return count ? [{ name: table, rows: count }] : [];
    }),
  }));
}

export function assertRecoveryManifest(manifest) {
  const failures = [];
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) failures.push("manifest.invalid");
  if (manifest?.format !== RECOVERY_FORMAT) failures.push("manifest.format");
  if (!manifest?.database || !SHA256_PATTERN.test(manifest.database.payloadSha256 ?? "")) failures.push("manifest.database_payload");
  if (!SHA256_PATTERN.test(manifest?.database?.schemaSha256 ?? "")) failures.push("manifest.database_schema");
  if (!Array.isArray(manifest?.database?.tables) || manifest.database.tables.some((table) => (
    typeof table?.name !== "string"
    || !Number.isSafeInteger(table?.rows)
    || table.rows < 0
    || !SHA256_PATTERN.test(table?.sha256 ?? "")
  ))) failures.push("manifest.tables");
  if (Array.isArray(manifest?.database?.tables)) {
    const tableNames = manifest.database.tables.map((table) => table.name);
    if (new Set(tableNames).size !== tableNames.length) failures.push("manifest.duplicate_table");
  }
  if (!Array.isArray(manifest?.objects) || manifest.objects.some((object) => (
    !SHA256_PATTERN.test(object?.keySha256 ?? "")
    || !SHA256_PATTERN.test(object?.contentSha256 ?? "")
    || !Number.isSafeInteger(object?.size)
    || object.size < 0
    || typeof object?.ownerSlot !== "string"
    || typeof object?.kind !== "string"
    || typeof object?.contentType !== "string"
  ))) failures.push("manifest.objects");
  if (Array.isArray(manifest?.objects)) {
    const keys = manifest.objects.map((object) => object.keySha256);
    if (new Set(keys).size !== keys.length) failures.push("manifest.duplicate_object");
  }
  if (!Array.isArray(manifest?.ownership) || manifest.ownership.some((owner) => (
    typeof owner?.slot !== "string" || !Array.isArray(owner?.tables)
  ))) failures.push("manifest.ownership");
  if (failures.length) throw new Error(`Manifiesto de recuperación no válido: ${failures.join(", ")}.`);
  return manifest;
}

export function compareDatabaseInventory(expected, actual) {
  const findings = [];
  if (expected.schemaSha256 !== actual.schemaSha256) findings.push({ check: "checksum.schema", count: 1 });
  if (canonicalJson(expected.migrations) !== canonicalJson(actual.migrations)) findings.push({ check: "checksum.migrations", count: 1 });
  const expectedTables = new Map(expected.tables.map((table) => [table.name, table]));
  const actualTables = new Map(actual.tables.map((table) => [table.name, table]));
  for (const name of new Set([...expectedTables.keys(), ...actualTables.keys()])) {
    const left = expectedTables.get(name);
    const right = actualTables.get(name);
    if (!left || !right || left.rows !== right.rows) findings.push({ check: `count.table.${name}`, count: 1 });
    if (!left || !right || left.sha256 !== right.sha256) findings.push({ check: `checksum.table.${name}`, count: 1 });
  }
  return findings;
}
