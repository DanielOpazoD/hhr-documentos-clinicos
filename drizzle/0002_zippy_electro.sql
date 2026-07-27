CREATE TABLE `ai_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`name` text NOT NULL,
	`target_type` text NOT NULL,
	`instructions` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_prompts_owner_target_default_idx` ON `ai_prompts` (`owner_email`,`target_type`) WHERE "is_default" = 1;--> statement-breakpoint
CREATE TABLE `ai_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`run_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`model` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`cached_input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`estimated_cost_microusd` integer,
	`pricing_source` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_usage_owner_created_idx` ON `ai_usage_events` (`owner_email`,`created_at`);--> statement-breakpoint
ALTER TABLE `signatures` ADD `is_default` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `signatures_owner_default_idx` ON `signatures` (`owner_email`) WHERE "is_default" = 1;