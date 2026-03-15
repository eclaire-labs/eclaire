ALTER TABLE "bookmarks" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS ((
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(extracted_text, '')), 'C') ||
        setweight(to_tsvector('english', coalesce(original_url, '')), 'D')
      )) STORED;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS ((
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(extracted_text, '')), 'C')
      )) STORED;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS ((
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(content, '')), 'B')
      )) STORED;--> statement-breakpoint
ALTER TABLE "photos" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS ((
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(ocr_text, '')), 'C')
      )) STORED;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS ((
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
      )) STORED;--> statement-breakpoint
CREATE INDEX "bookmarks_search_vector_idx" ON "bookmarks" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "documents_search_vector_idx" ON "documents" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "notes_search_vector_idx" ON "notes" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "photos_search_vector_idx" ON "photos" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "tasks_search_vector_idx" ON "tasks" USING gin ("search_vector");