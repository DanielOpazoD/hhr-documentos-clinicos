CREATE TABLE `document_template_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`template_id` text NOT NULL,
	`title` text NOT NULL,
	`sections_json` text NOT NULL,
	`prompt_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `document_template_settings_owner_template_idx` ON `document_template_settings` (`owner_email`,`template_id`);--> statement-breakpoint
ALTER TABLE `signatures` ADD `name` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `signatures`
SET `name` = CASE
	WHEN `kind` = 'stamp' THEN 'Timbre de ' || `professional_name`
	ELSE 'Firma de ' || `professional_name`
END
WHERE trim(`name`) = '';
