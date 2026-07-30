DROP INDEX `signatures_owner_default_idx`;--> statement-breakpoint
ALTER TABLE `signatures` ADD `kind` text DEFAULT 'signature' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `signatures_owner_default_idx` ON `signatures` (`owner_email`,`kind`) WHERE "is_default" = 1;