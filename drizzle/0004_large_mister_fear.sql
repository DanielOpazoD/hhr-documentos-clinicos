ALTER TABLE `files` ADD `mobile_session_id` text;--> statement-breakpoint
CREATE INDEX `files_owner_mobile_session_created_idx` ON `files` (`owner_email`,`mobile_session_id`,`created_at`);