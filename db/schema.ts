import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const users = sqliteTable("users", {
  email: text("email").primaryKey(),
  displayName: text("display_name").notNull(),
  ...timestamps,
});

// Legacy table retained for migration compatibility; no sample records are seeded.
export const legacyPatients = sqliteTable("patients_demo", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  name: text("name").notNull(),
  rutMasked: text("rut_masked").notNull(),
  birthDate: text("birth_date"),
  sex: text("sex"),
  insurance: text("insurance"),
  ...timestamps,
});

export const documentTemplates = sqliteTable("document_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  schemaJson: text("schema_json").notNull(),
  ...timestamps,
});

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  templateId: text("template_id").notNull(),
  title: text("title").notNull(),
  patientName: text("patient_name").notNull(),
  patientRutMasked: text("patient_rut_masked").notNull(),
  status: text("status").notNull(),
  contentJson: text("content_json").notNull(),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => [
  index("documents_owner_updated_idx").on(table.ownerEmail, table.updatedAt),
]);

export const documentVersions = sqliteTable("document_versions", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull(),
  ownerEmail: text("owner_email").notNull(),
  version: integer("version").notNull(),
  contentJson: text("content_json").notNull(),
  snapshotJson: text("snapshot_json"),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("document_versions_document_version_idx").on(table.documentId, table.version),
]);

export const files = sqliteTable("files", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  mobileSessionId: text("mobile_session_id"),
  objectKey: text("object_key").notNull(),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  origin: text("origin").notNull(),
  status: text("status").notNull(),
  patientId: text("patient_id"),
  ...timestamps,
}, (table) => [
  index("files_owner_created_idx").on(table.ownerEmail, table.createdAt),
  index("files_owner_mobile_session_created_idx").on(
    table.ownerEmail,
    table.mobileSessionId,
    table.createdAt,
  ),
]);

export const documentFiles = sqliteTable("document_files", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull(),
  fileId: text("file_id").notNull(),
  createdAt: text("created_at").notNull(),
});

export const signatures = sqliteTable("signatures", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  kind: text("kind").notNull().default("signature"),
  professionalName: text("professional_name").notNull(),
  professionalRut: text("professional_rut").notNull(),
  specialty: text("specialty").notNull(),
  objectKey: text("object_key").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
}, (table) => [
  index("signatures_owner_updated_idx").on(table.ownerEmail, table.updatedAt),
  uniqueIndex("signatures_owner_default_idx")
    .on(table.ownerEmail, table.kind)
    .where(sql`"is_default" = 1`),
]);

export const mobileUploadSessions = sqliteTable("mobile_upload_sessions", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  status: text("status").notNull(),
  ...timestamps,
});

export const aiImportRuns = sqliteTable("ai_import_runs", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  sourceName: text("source_name").notNull(),
  targetType: text("target_type").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
});

export const aiPrompts = sqliteTable("ai_prompts", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  name: text("name").notNull(),
  targetType: text("target_type").notNull(),
  instructions: text("instructions").notNull(),
  revision: integer("revision").notNull().default(1),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  ...timestamps,
}, (table) => [
  index("ai_prompts_owner_target_idx").on(
    table.ownerEmail,
    table.targetType,
    table.updatedAt,
  ),
  uniqueIndex("ai_prompts_owner_target_default_idx")
    .on(table.ownerEmail, table.targetType)
    .where(sql`"is_default" = 1`),
]);

export const aiUsageEvents = sqliteTable("ai_usage_events", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  runId: text("run_id").notNull(),
  providerId: text("provider_id").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  estimatedCostMicrousd: integer("estimated_cost_microusd"),
  pricingSource: text("pricing_source").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [
  index("ai_usage_owner_created_idx").on(table.ownerEmail, table.createdAt),
]);

export const aiOperationRuns = sqliteTable("ai_operation_runs", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  operation: text("operation").notNull(),
  providerId: text("provider_id").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  finishedAt: text("finished_at"),
}, (table) => [
  index("ai_operation_runs_owner_created_idx").on(table.ownerEmail, table.createdAt),
]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  metadataJson: text("metadata_json").notNull(),
  createdAt: text("created_at").notNull(),
});
