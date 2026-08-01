CREATE TABLE `ai_operation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`operation` text NOT NULL,
	`provider_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE INDEX `ai_operation_runs_owner_created_idx` ON `ai_operation_runs` (`owner_email`,`created_at`);
--> statement-breakpoint
CREATE INDEX `ai_operation_runs_owner_provider_status_idx` ON `ai_operation_runs` (`owner_email`,`provider_id`,`status`);
