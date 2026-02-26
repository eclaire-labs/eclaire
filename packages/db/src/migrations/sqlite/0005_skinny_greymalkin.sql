DROP INDEX `users_email_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new__app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new__app_meta`("key", "value", "updated_at") SELECT "key", "value", "updated_at" FROM `_app_meta`;--> statement-breakpoint
DROP TABLE `_app_meta`;--> statement-breakpoint
ALTER TABLE `__new__app_meta` RENAME TO `_app_meta`;--> statement-breakpoint
PRAGMA foreign_keys=ON;