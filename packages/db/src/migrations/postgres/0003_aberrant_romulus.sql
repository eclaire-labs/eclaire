CREATE TABLE "media" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"original_filename" text,
	"storage_id" text NOT NULL,
	"mime_type" text,
	"file_size" integer,
	"due_date" timestamp with time zone,
	"media_type" text NOT NULL,
	"duration" double precision,
	"channels" integer,
	"sample_rate" integer,
	"bitrate" integer,
	"codec" text,
	"language" text,
	"extracted_text" text,
	"thumbnail_storage_id" text,
	"waveform_storage_id" text,
	"extracted_md_storage_id" text,
	"extracted_txt_storage_id" text,
	"raw_metadata" jsonb,
	"original_mime_type" text,
	"user_agent" text,
	"processing_enabled" boolean DEFAULT true NOT NULL,
	"processing_status" text,
	"review_status" text,
	"flag_color" text,
	"is_pinned" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS ((
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(extracted_text, '')), 'C')
      )) STORED
);
--> statement-breakpoint
CREATE TABLE "media_tags" (
	"media_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "media_tags_media_id_tag_id_pk" PRIMARY KEY("media_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_tags" ADD CONSTRAINT "media_tags_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_tags" ADD CONSTRAINT "media_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_user_id_idx" ON "media" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "media_is_pinned_idx" ON "media" USING btree ("is_pinned");--> statement-breakpoint
CREATE INDEX "media_user_id_media_type_idx" ON "media" USING btree ("user_id","media_type");--> statement-breakpoint
CREATE INDEX "media_user_id_processing_enabled_idx" ON "media" USING btree ("user_id") WHERE processing_enabled = true;--> statement-breakpoint
CREATE INDEX "media_user_id_created_at_idx" ON "media" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "media_user_id_title_idx" ON "media" USING btree ("user_id","title");--> statement-breakpoint
CREATE INDEX "media_title_trgm_idx" ON "media" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "media_search_vector_idx" ON "media" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "media_tags_tag_id_idx" ON "media_tags" USING btree ("tag_id");