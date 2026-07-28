CREATE TABLE `signatures` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`professional_name` text NOT NULL,
	`professional_rut` text NOT NULL,
	`specialty` text NOT NULL,
	`object_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signatures_owner_default_idx` ON `signatures` (`owner_email`) WHERE "is_default" = 1;
