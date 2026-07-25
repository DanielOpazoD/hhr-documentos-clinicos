import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

export const users = sqliteTable("users", {
  email: text("email").primaryKey(),
  displayName: text("display_name").notNull(),
  ...timestamps,
});

export const patientsDemo = sqliteTable("patients_demo", {
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
});

export const documentVersions = sqliteTable("document_versions", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull(),
  ownerEmail: text("owner_email").notNull(),
  version: integer("version").notNull(),
  contentJson: text("content_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const files = sqliteTable("files", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  objectKey: text("object_key").notNull(),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  origin: text("origin").notNull(),
  status: text("status").notNull(),
  patientId: text("patient_id"),
  ...timestamps,
});

export const documentFiles = sqliteTable("document_files", {
  id: text("id").primaryKey(),
  documentId: text("document_id").notNull(),
  fileId: text("file_id").notNull(),
  createdAt: text("created_at").notNull(),
});

export const signatures = sqliteTable("signatures", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  professionalName: text("professional_name").notNull(),
  professionalRut: text("professional_rut").notNull(),
  specialty: text("specialty").notNull(),
  objectKey: text("object_key").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  ...timestamps,
});

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

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  metadataJson: text("metadata_json").notNull(),
  createdAt: text("created_at").notNull(),
});
