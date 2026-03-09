CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "bookmarks_user_id_created_at_idx" ON "bookmarks" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "bookmarks_user_id_title_idx" ON "bookmarks" USING btree ("user_id","title");--> statement-breakpoint
CREATE INDEX "bookmarks_title_trgm_idx" ON "bookmarks" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "documents_user_id_created_at_idx" ON "documents" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_user_id_title_idx" ON "documents" USING btree ("user_id","title");--> statement-breakpoint
CREATE INDEX "documents_title_trgm_idx" ON "documents" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "documents_user_id_updated_at_idx" ON "documents" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "notes_user_id_created_at_idx" ON "notes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notes_user_id_title_idx" ON "notes" USING btree ("user_id","title");--> statement-breakpoint
CREATE INDEX "notes_title_trgm_idx" ON "notes" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "photos_user_id_created_at_idx" ON "photos" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "photos_user_id_date_taken_idx" ON "photos" USING btree ("user_id","date_taken");--> statement-breakpoint
CREATE INDEX "photos_user_id_title_idx" ON "photos" USING btree ("user_id","title");--> statement-breakpoint
CREATE INDEX "photos_title_trgm_idx" ON "photos" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "tasks_user_id_created_at_idx" ON "tasks" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "tasks_user_id_due_date_idx" ON "tasks" USING btree ("user_id","due_date");--> statement-breakpoint
CREATE INDEX "tasks_user_id_status_created_at_idx" ON "tasks" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "tasks_title_trgm_idx" ON "tasks" USING gin ("title" gin_trgm_ops);