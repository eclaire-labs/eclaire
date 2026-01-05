DROP INDEX `tags_user_id_name_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `tags_user_id_name_idx` ON `tags` (`user_id`,`name`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`original_filename` text,
	`storage_id` text NOT NULL,
	`mime_type` text,
	`file_size` integer,
	`device_id` text,
	`due_date` integer,
	`date_taken` integer,
	`camera_make` text,
	`camera_model` text,
	`lens_model` text,
	`iso` integer,
	`f_number` real,
	`exposure_time` real,
	`orientation` integer,
	`image_width` integer,
	`image_height` integer,
	`latitude` real,
	`longitude` real,
	`altitude` real,
	`location_city` text,
	`location_country_iso2` text,
	`location_country_name` text,
	`photo_type` text,
	`ocr_text` text,
	`dominant_colors` text,
	`thumbnail_storage_id` text,
	`screenshot_storage_id` text,
	`converted_jpg_storage_id` text,
	`raw_metadata` text,
	`original_mime_type` text,
	`user_agent` text,
	`enabled` integer DEFAULT true NOT NULL,
	`review_status` text,
	`flag_color` text,
	`is_pinned` integer DEFAULT false,
	`created_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((unixepoch('subsec') * 1000) as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_photos`("id", "user_id", "title", "description", "original_filename", "storage_id", "mime_type", "file_size", "device_id", "due_date", "date_taken", "camera_make", "camera_model", "lens_model", "iso", "f_number", "exposure_time", "orientation", "image_width", "image_height", "latitude", "longitude", "altitude", "location_city", "location_country_iso2", "location_country_name", "photo_type", "ocr_text", "dominant_colors", "thumbnail_storage_id", "screenshot_storage_id", "converted_jpg_storage_id", "raw_metadata", "original_mime_type", "user_agent", "enabled", "review_status", "flag_color", "is_pinned", "created_at", "updated_at") SELECT "id", "user_id", "title", "description", "original_filename", "storage_id", "mime_type", "file_size", "device_id", "due_date", "date_taken", "camera_make", "camera_model", "lens_model", "iso", "f_number", "exposure_time", "orientation", "image_width", "image_height", "latitude", "longitude", "altitude", "location_city", "location_country_iso2", "location_country_name", "photo_type", "ocr_text", "dominant_colors", "thumbnail_storage_id", "screenshot_storage_id", "converted_jpg_storage_id", "raw_metadata", "original_mime_type", "user_agent", "enabled", "review_status", "flag_color", "is_pinned", "created_at", "updated_at" FROM `photos`;--> statement-breakpoint
DROP TABLE `photos`;--> statement-breakpoint
ALTER TABLE `__new_photos` RENAME TO `photos`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `photos_user_id_idx` ON `photos` (`user_id`);--> statement-breakpoint
CREATE INDEX `photos_is_pinned_idx` ON `photos` (`is_pinned`);--> statement-breakpoint
CREATE INDEX `photos_date_taken_idx` ON `photos` (`date_taken`);--> statement-breakpoint
CREATE INDEX `bookmarks_tags_tag_id_idx` ON `bookmarks_tags` (`tag_id`);--> statement-breakpoint
CREATE INDEX `documents_tags_tag_id_idx` ON `documents_tags` (`tag_id`);--> statement-breakpoint
CREATE INDEX `notes_tags_tag_id_idx` ON `notes_tags` (`tag_id`);--> statement-breakpoint
CREATE INDEX `photos_tags_tag_id_idx` ON `photos_tags` (`tag_id`);--> statement-breakpoint
CREATE INDEX `tasks_tags_tag_id_idx` ON `tasks_tags` (`tag_id`);