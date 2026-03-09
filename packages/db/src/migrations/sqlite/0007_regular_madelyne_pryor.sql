ALTER TABLE `history` ADD `actor_id` text;--> statement-breakpoint
CREATE INDEX `history_actor_id_idx` ON `history` (`actor_id`);