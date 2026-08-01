import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const migrationsRoot = join(projectRoot, "drizzle");
const journalPath = join(migrationsRoot, "meta", "_journal.json");

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function normalizeDefault(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim().replace(/^\((.*)\)$/s, "$1").toLowerCase();
  if (normalized === "false") return "0";
  if (normalized === "true") return "1";
  return normalized;
}

async function databaseHistory() {
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  const migrations = journal.entries.map((entry) => `${entry.tag}.sql`);
  if (!journal.entries.length) throw new Error("No hay migraciones versionadas para verificar.");
  return { entries: journal.entries, migrations };
}

async function snapshotTables(entry) {
  const snapshot = JSON.parse(await readFile(
    join(migrationsRoot, "meta", `${String(entry.idx).padStart(4, "0")}_snapshot.json`),
    "utf8",
  ));
  return snapshot.tables;
}

function queryCount(db, sql) {
  const row = db.prepare(sql).get();
  return Number(row?.count ?? 0);
}

function businessChecks() {
  return [
    {
      check: "orphan.document_versions",
      requires: [["document_versions"], ["documents"]],
      sql: `SELECT COUNT(*) AS count
       FROM document_versions AS version
       LEFT JOIN documents AS document
         ON document.id = version.document_id
        AND document.owner_email = version.owner_email
       WHERE document.id IS NULL`,
    },
    {
      check: "orphan.document_files",
      requires: [["document_files"], ["documents"], ["files"]],
      sql: `SELECT COUNT(*) AS count
       FROM document_files AS link
       LEFT JOIN documents AS document ON document.id = link.document_id
       LEFT JOIN files AS file ON file.id = link.file_id
       WHERE document.id IS NULL OR file.id IS NULL`,
    },
    {
      check: "orphan.mobile_files",
      requires: [["files", "mobile_session_id"], ["mobile_upload_sessions"]],
      sql: `SELECT COUNT(*) AS count
       FROM files AS file
       LEFT JOIN mobile_upload_sessions AS session
         ON session.id = file.mobile_session_id
        AND session.owner_email = file.owner_email
       WHERE file.mobile_session_id IS NOT NULL AND session.id IS NULL`,
    },
    {
      check: "versions.invalid",
      requires: [["document_versions", "version"]],
      sql: `SELECT COUNT(*) AS count
       FROM document_versions
       WHERE version < 1`,
    },
    {
      check: "versions.duplicate",
      requires: [["document_versions", "document_id"], ["document_versions", "version"]],
      sql: `SELECT COUNT(*) AS count FROM (
         SELECT document_id, version
         FROM document_versions
         GROUP BY document_id, version
         HAVING COUNT(*) > 1
       )`,
    },
    {
      check: "versions.current_missing",
      requires: [["documents", "version"], ["document_versions", "version"]],
      sql: `SELECT COUNT(*) AS count
       FROM documents AS document
       WHERE document.version < 1
          OR NOT EXISTS (
            SELECT 1
            FROM document_versions AS version
            WHERE version.document_id = document.id
              AND version.owner_email = document.owner_email
              AND version.version = document.version
          )`,
    },
    {
      check: "versions.future",
      requires: [["documents", "version"], ["document_versions", "version"]],
      sql: `SELECT COUNT(*) AS count
       FROM document_versions AS version
       JOIN documents AS document ON document.id = version.document_id
       WHERE version.version > document.version`,
    },
    {
      check: "signatures.invalid_default",
      requires: [["signatures", "is_default"]],
      sql: `SELECT COUNT(*) AS count
       FROM signatures
       WHERE is_default NOT IN (0, 1)`,
    },
    {
      check: "signatures.default_count",
      requires: [["signatures", "is_default"], ["signatures", "kind"]],
      minimumMigration: "0006_signing_assets.sql",
      sql: `SELECT COUNT(*) AS count FROM (
         SELECT owner_email, kind
         FROM signatures
         GROUP BY owner_email, kind
         HAVING SUM(CASE WHEN is_default = 1 THEN 1 ELSE 0 END) <> 1
       )`,
    },
    {
      check: "ai_operations.invalid_state",
      requires: [["ai_operation_runs", "status"], ["ai_operation_runs", "finished_at"]],
      minimumMigration: "0007_ai_execution_guard.sql",
      sql: `SELECT COUNT(*) AS count
       FROM ai_operation_runs
       WHERE operation NOT IN ('clinical_draft', 'prompt_improvement', 'prompt_from_documents')
          OR provider_id NOT IN ('openai', 'gemma_local')
          OR status NOT IN ('active', 'completed', 'failed', 'timed_out', 'expired')
          OR (status = 'active' AND finished_at IS NOT NULL)
          OR (status <> 'active' AND finished_at IS NULL)`,
    },
  ];
}

function normalizePredicate(value) {
  if (!value) return null;
  return String(value)
    .trim()
    .replace(/^[()]|[()]$/g, "")
    .replace(/["`\[\]]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export async function verifyDatabase(db, { allowPendingMigrations = false } = {}) {
  const history = await databaseHistory();
  const findings = [];
  let checkedIndexes = 0;
  let applied = [];

  const migrationTable = db.prepare(
    "SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table' AND name = 'd1_migrations'",
  ).get();
  if (!migrationTable?.count) {
    findings.push({ check: "schema.migrations_table", count: 1 });
  } else {
    applied = db.prepare("SELECT name FROM d1_migrations ORDER BY id").all().map((row) => row.name);
  }
  const expectedPrefix = history.migrations.slice(0, applied.length);
  const prefixValid = JSON.stringify(applied) === JSON.stringify(expectedPrefix);
  const migrationsValid = allowPendingMigrations
    ? prefixValid && applied.length > 0
    : JSON.stringify(applied) === JSON.stringify(history.migrations);
  if (migrationTable?.count && !migrationsValid) {
    findings.push({ check: "schema.migration_versions", count: 1 });
  }
  const selectedEntry = allowPendingMigrations && prefixValid
    ? history.entries[Math.max(0, applied.length - 1)]
    : history.entries.at(-1);
  const expectedTables = await snapshotTables(selectedEntry);
  const actualColumns = new Map();
  const expectedTableNames = new Set(Object.keys(expectedTables));
  const allowedPendingCompatibilityIndexes = allowPendingMigrations
    && !applied.includes("0005_schema_authority.sql")
    ? new Set([
      "ai_prompts_owner_target_idx",
      "documents_owner_updated_idx",
      "files_owner_created_idx",
      "sessions_token_idx",
      "signatures_owner_updated_idx",
    ])
    : new Set();
  function columnsFor(tableName) {
    if (!actualColumns.has(tableName)) {
      actualColumns.set(
        tableName,
        db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all(),
      );
    }
    return actualColumns.get(tableName);
  }

  for (const [tableName, table] of Object.entries(expectedTables)) {
    const columns = columnsFor(tableName);
    if (!columns.length) {
      findings.push({ check: `schema.table.${tableName}`, count: 1 });
      continue;
    }

    const actualColumnMap = new Map(columns.map((column) => [column.name, column]));
    for (const expectedColumn of Object.values(table.columns)) {
      const actual = actualColumnMap.get(expectedColumn.name);
      const valid = actual
        && String(actual.type).toLowerCase() === String(expectedColumn.type).toLowerCase()
        && Boolean(actual.notnull) === Boolean(expectedColumn.notNull)
        && Boolean(actual.pk) === Boolean(expectedColumn.primaryKey)
        && normalizeDefault(actual.dflt_value) === normalizeDefault(expectedColumn.default);
      if (!valid) findings.push({ check: `schema.column.${tableName}.${expectedColumn.name}`, count: 1 });
    }

    const expectedColumnNames = new Set(
      Object.values(table.columns).map((column) => column.name),
    );
    for (const actualColumn of columns) {
      if (!expectedColumnNames.has(actualColumn.name)) {
        findings.push({ check: `schema.unexpected.column.${tableName}.${actualColumn.name}`, count: 1 });
      }
    }

    const tableIndexes = db.prepare(`PRAGMA index_list(${quoteIdentifier(tableName)})`).all();
    const actualIndexes = new Map(tableIndexes.map((index) => [index.name, index]));
    const expectedIndexNames = new Set(Object.keys(table.indexes));
    for (const expectedIndex of Object.values(table.indexes)) {
      checkedIndexes += 1;
      const actual = actualIndexes.get(expectedIndex.name);
      const expectedColumns = expectedIndex.columns.map((column) => (
        typeof column === "string" ? column : column.expression
      ));
      const actualIndexColumns = actual
        ? db.prepare(`PRAGMA index_xinfo(${quoteIdentifier(expectedIndex.name)})`).all()
          .filter((column) => column.key === 1)
          .map((column) => ({ name: column.name, descending: Boolean(column.desc) }))
        : [];
      const expectedIndexColumns = expectedColumns.map((name) => ({ name, descending: false }));
      const indexSql = actual
        ? db.prepare("SELECT sql FROM sqlite_schema WHERE type = 'index' AND name = ?")
          .get(expectedIndex.name)?.sql
        : null;
      const actualPredicate = typeof indexSql === "string"
        ? indexSql.match(/\bWHERE\b([\s\S]+)$/i)?.[1]
        : null;
      const valid = actual
        && Boolean(actual.unique) === Boolean(expectedIndex.isUnique)
        && Boolean(actual.partial) === Boolean(expectedIndex.where)
        && JSON.stringify(actualIndexColumns) === JSON.stringify(expectedIndexColumns)
        && normalizePredicate(actualPredicate) === normalizePredicate(expectedIndex.where);
      if (!valid) findings.push({ check: `schema.index.${expectedIndex.name}`, count: 1 });
    }
    for (const actualIndex of tableIndexes) {
      if (
        actualIndex.origin === "c"
        && !expectedIndexNames.has(actualIndex.name)
        && !allowedPendingCompatibilityIndexes.has(actualIndex.name)
      ) {
        findings.push({ check: `schema.unexpected.index.${actualIndex.name}`, count: 1 });
      }
    }
  }

  const actualTables = db.prepare(`SELECT name FROM sqlite_schema
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      AND name NOT LIKE '_cf_%'
      AND name <> 'd1_migrations'`).all();
  for (const { name } of actualTables) {
    if (!expectedTableNames.has(name)) {
      findings.push({ check: `schema.unexpected.table.${name}`, count: 1 });
    }
  }
  const unexpectedObjects = db.prepare(`SELECT type, name FROM sqlite_schema
    WHERE type IN ('trigger', 'view')
      AND name NOT LIKE 'sqlite_%'
      AND name NOT LIKE '_cf_%'`).all();
  for (const { type, name } of unexpectedObjects) {
    findings.push({ check: `schema.unexpected.${type}.${name}`, count: 1 });
  }

  for (const { check, minimumMigration, requires, sql } of businessChecks()) {
    const requirementsMet = requires.every(([tableName, columnName]) => {
      const columns = columnsFor(tableName);
      return columns.length && (!columnName || columns.some((column) => column.name === columnName));
    });
    if (
      !requirementsMet
      || (allowPendingMigrations && minimumMigration && !applied.includes(minimumMigration))
    ) continue;
    try {
      const count = queryCount(db, sql);
      if (count) findings.push({ check, count });
    } catch (error) {
      findings.push({
        check,
        count: 1,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ok: findings.length === 0,
    findings,
    summary: {
      tables: Object.keys(expectedTables).length,
      indexes: checkedIndexes,
      migrations: applied.length,
    },
  };
}

async function openDatabaseSource(sourcePath) {
  if (extname(sourcePath).toLowerCase() !== ".sql") return new DatabaseSync(sourcePath);
  const db = new DatabaseSync(":memory:");
  db.exec(await readFile(sourcePath, "utf8"));
  return db;
}

async function main() {
  const args = process.argv.slice(2);
  const allowPendingMigrations = args.includes("--allow-pending-migrations");
  const source = args.find((argument) => !argument.startsWith("--"));
  if (!source) {
    throw new Error(
      "Uso: npm run db:verify -- [--allow-pending-migrations] <export.sql|database.sqlite>",
    );
  }
  const sourcePath = resolve(source);
  const db = await openDatabaseSource(sourcePath);
  try {
    const result = await verifyDatabase(db, { allowPendingMigrations });
    if (!result.ok) {
      const detail = result.findings.map((finding) => (
        `- ${finding.check}: ${finding.count}${finding.detail ? ` (${finding.detail})` : ""}`
      )).join("\n");
      throw new Error(`La base no supera la verificación de integridad:\n${detail}`);
    }
    console.log(
      `Integridad verificada en ${basename(sourcePath)}: `
      + `${result.summary.tables} tablas, ${result.summary.indexes} índices y `
      + `${result.summary.migrations} migraciones sin hallazgos.`,
    );
  } finally {
    db.close();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
