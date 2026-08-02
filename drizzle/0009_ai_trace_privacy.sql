UPDATE `audit_events`
SET `metadata_json` = CASE
  WHEN json_valid(`metadata_json`) THEN json_remove(`metadata_json`, '$.sourceNames')
  ELSE `metadata_json`
END
WHERE `entity_type` = 'ai_import';
--> statement-breakpoint
DROP TABLE `ai_import_runs`;
