ALTER TABLE `document_versions` ADD `snapshot_json` text;--> statement-breakpoint
CREATE INDEX `document_versions_document_version_idx` ON `document_versions` (`document_id`,`version`);
