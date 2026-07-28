CREATE INDEX IF NOT EXISTS `ai_prompts_owner_target_idx` ON `ai_prompts` (`owner_email`,`target_type`,`updated_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `documents_owner_updated_idx` ON `documents` (`owner_email`,`updated_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `files_owner_created_idx` ON `files` (`owner_email`,`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `signatures_owner_updated_idx` ON `signatures` (`owner_email`,`updated_at`);--> statement-breakpoint
UPDATE `ai_prompts`
SET `is_default` = 0
WHERE `target_type` IN ('resumen', 'informe', 'antecedentes');--> statement-breakpoint
UPDATE `ai_prompts`
SET `target_type` = 'informe_medico'
WHERE `target_type` IN ('resumen', 'informe', 'antecedentes');--> statement-breakpoint
UPDATE `signatures`
SET `is_default` = 1
WHERE `id` IN (
	SELECT candidate.`id`
	FROM `signatures` AS candidate
	WHERE NOT EXISTS (
		SELECT 1
		FROM `signatures` AS current_default
		WHERE current_default.`owner_email` = candidate.`owner_email`
			AND current_default.`is_default` = 1
	)
		AND candidate.`id` = (
			SELECT newest.`id`
			FROM `signatures` AS newest
			WHERE newest.`owner_email` = candidate.`owner_email`
			ORDER BY newest.`updated_at` DESC, newest.`id` DESC
			LIMIT 1
		)
);
