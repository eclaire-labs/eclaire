CREATE INDEX "bookmarks_user_id_enabled_idx" ON "bookmarks" USING btree ("user_id") WHERE enabled = true;--> statement-breakpoint
CREATE INDEX "documents_user_id_enabled_idx" ON "documents" USING btree ("user_id") WHERE enabled = true;--> statement-breakpoint
CREATE INDEX "notes_user_id_enabled_idx" ON "notes" USING btree ("user_id") WHERE enabled = true;--> statement-breakpoint
CREATE INDEX "photos_user_id_enabled_idx" ON "photos" USING btree ("user_id") WHERE enabled = true;--> statement-breakpoint
CREATE INDEX "tasks_user_id_enabled_idx" ON "tasks" USING btree ("user_id") WHERE enabled = true;