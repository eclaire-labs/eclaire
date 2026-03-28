CREATE TYPE "public"."actor_kind" AS ENUM('human', 'agent', 'system', 'service');--> statement-breakpoint
CREATE TYPE "public"."task_attention_status" AS ENUM('none', 'needs_triage', 'awaiting_input', 'needs_review', 'failed', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."task_delegate_mode" AS ENUM('manual', 'assist', 'handle');--> statement-breakpoint
CREATE TYPE "public"."task_occurrence_execution_status" AS ENUM('idle', 'scheduled', 'queued', 'running', 'awaiting_input', 'awaiting_review', 'failed', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."task_occurrence_kind" AS ENUM('manual_run', 'scheduled_run', 'recurring_run', 'reminder', 'review_run');--> statement-breakpoint
CREATE TYPE "public"."task_review_status" AS ENUM('none', 'pending', 'approved', 'changes_requested');--> statement-breakpoint
CREATE TYPE "public"."task_schedule_type" AS ENUM('none', 'one_time', 'recurring');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'in_progress', 'blocked', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_provider_id_account_id_unique" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "actor_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"grant_id" text NOT NULL,
	"type" text DEFAULT 'api_key' NOT NULL,
	"key_id" text NOT NULL,
	"key_hash" text NOT NULL,
	"hash_version" integer DEFAULT 1 NOT NULL,
	"key_suffix" text NOT NULL,
	"name" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "actor_credentials_key_id_unique" UNIQUE("key_id")
);
--> statement-breakpoint
CREATE TABLE "actor_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"owner_user_id" text NOT NULL,
	"granted_by_actor_id" text,
	"name" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "actors" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"kind" "actor_kind" NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"step_number" integer NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"thinking_content" text,
	"text_content" text,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"stop_reason" text,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"tool_executions" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"system_prompt" text NOT NULL,
	"tool_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skill_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"model_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_model_selection" (
	"context" text PRIMARY KEY NOT NULL,
	"model_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "ai_models" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"provider_id" text NOT NULL,
	"provider_model" text NOT NULL,
	"capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tokenizer" jsonb,
	"source" jsonb,
	"pricing" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "ai_providers" (
	"id" text PRIMARY KEY NOT NULL,
	"dialect" text NOT NULL,
	"base_url" text,
	"auth" jsonb DEFAULT '{"type":"none"}'::jsonb NOT NULL,
	"headers" jsonb,
	"engine" jsonb,
	"overrides" jsonb,
	"cli" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"key_id" text NOT NULL,
	"key_hash" text NOT NULL,
	"hash_version" integer DEFAULT 1 NOT NULL,
	"key_suffix" text NOT NULL,
	"name" text NOT NULL,
	"user_id" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "api_keys_key_id_unique" UNIQUE("key_id")
);
--> statement-breakpoint
CREATE TABLE "_app_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookmarks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"original_url" text NOT NULL,
	"normalized_url" text,
	"title" text,
	"description" text,
	"author" text,
	"lang" text,
	"due_date" timestamp with time zone,
	"page_last_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"content_type" text,
	"etag" text,
	"last_modified" text,
	"raw_metadata" jsonb,
	"user_agent" text,
	"favicon_storage_id" text,
	"thumbnail_storage_id" text,
	"screenshot_desktop_storage_id" text,
	"screenshot_mobile_storage_id" text,
	"screenshot_full_page_storage_id" text,
	"pdf_storage_id" text,
	"readable_html_storage_id" text,
	"extracted_md_storage_id" text,
	"extracted_txt_storage_id" text,
	"raw_html_storage_id" text,
	"readme_storage_id" text,
	"extracted_text" text,
	"processing_enabled" boolean DEFAULT true NOT NULL,
	"processing_status" text,
	"review_status" text,
	"flag_color" text,
	"is_pinned" boolean DEFAULT false,
	"search_vector" "tsvector" GENERATED ALWAYS AS ((
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(extracted_text, '')), 'C') ||
        setweight(to_tsvector('english', coalesce(original_url, '')), 'D')
      )) STORED
);
--> statement-breakpoint
CREATE TABLE "bookmarks_tags" (
	"bookmark_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "bookmarks_tags_bookmark_id_tag_id_pk" PRIMARY KEY("bookmark_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_actor_id" text,
	"name" varchar(255) NOT NULL,
	"platform" text NOT NULL,
	"capability" text NOT NULL,
	"config" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_actor_id" text NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone,
	"message_count" integer DEFAULT 0 NOT NULL,
	"execution_status" text DEFAULT 'idle' NOT NULL,
	"has_unread_response" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"original_filename" text,
	"due_date" timestamp with time zone,
	"storage_id" text,
	"mime_type" text,
	"file_size" integer,
	"thumbnail_storage_id" text,
	"screenshot_storage_id" text,
	"pdf_storage_id" text,
	"raw_metadata" jsonb,
	"original_mime_type" text,
	"user_agent" text,
	"processing_enabled" boolean DEFAULT true NOT NULL,
	"processing_status" text,
	"extracted_md_storage_id" text,
	"extracted_txt_storage_id" text,
	"extracted_text" text,
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
CREATE TABLE "documents_tags" (
	"document_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "documents_tags_document_id_tag_id_pk" PRIMARY KEY("document_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"description" text NOT NULL,
	"sentiment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "history" (
	"id" text PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"item_type" text NOT NULL,
	"item_id" text NOT NULL,
	"item_name" text,
	"before_data" jsonb,
	"after_data" jsonb,
	"actor" text NOT NULL,
	"actor_id" text,
	"authorized_by_actor_id" text,
	"grant_id" text,
	"metadata" jsonb,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text,
	"conversation_id" text,
	"message_id" text
);
--> statement-breakpoint
CREATE TABLE "human_actors" (
	"actor_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instance_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "mcp_servers" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"transport" text NOT NULL,
	"command" text,
	"args" jsonb,
	"connect_timeout" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"tool_mode" text DEFAULT 'managed',
	"availability" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"original_filename" text,
	"source_url" text,
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
	"width" integer,
	"height" integer,
	"frame_rate" double precision,
	"video_codec" text,
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
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"role" text NOT NULL,
	"author_actor_id" text,
	"content" text NOT NULL,
	"thinking_content" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"description" text,
	"raw_metadata" jsonb,
	"original_mime_type" text,
	"user_agent" text,
	"processing_enabled" boolean DEFAULT true NOT NULL,
	"processing_status" text,
	"due_date" timestamp with time zone,
	"review_status" text,
	"flag_color" text,
	"is_pinned" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS ((
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(content, '')), 'B')
      )) STORED
);
--> statement-breakpoint
CREATE TABLE "notes_tags" (
	"note_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "notes_tags_note_id_tag_id_pk" PRIMARY KEY("note_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"original_filename" text,
	"storage_id" text NOT NULL,
	"mime_type" text,
	"file_size" integer,
	"device_id" text,
	"due_date" timestamp with time zone,
	"date_taken" timestamp with time zone,
	"camera_make" text,
	"camera_model" text,
	"lens_model" text,
	"iso" integer,
	"f_number" numeric,
	"exposure_time" numeric,
	"orientation" integer,
	"image_width" integer,
	"image_height" integer,
	"latitude" numeric,
	"longitude" numeric,
	"altitude" numeric,
	"location_city" text,
	"location_country_iso2" text,
	"location_country_name" text,
	"photo_type" text,
	"extracted_text" text,
	"dominant_colors" jsonb,
	"thumbnail_storage_id" text,
	"screenshot_storage_id" text,
	"converted_jpg_storage_id" text,
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
CREATE TABLE "photos_tags" (
	"photo_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "photos_tags_photo_id_tag_id_pk" PRIMARY KEY("photo_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"author_actor_id" text,
	"user_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_occurrences" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" "task_occurrence_kind" NOT NULL,
	"scheduled_for" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"execution_status" "task_occurrence_execution_status" DEFAULT 'idle' NOT NULL,
	"prompt" text,
	"result_summary" text,
	"result_body" text,
	"error_body" text,
	"requires_review" boolean DEFAULT false NOT NULL,
	"occurrence_review_status" "task_review_status" DEFAULT 'none' NOT NULL,
	"executor_actor_id" text,
	"requested_by_actor_id" text,
	"token_usage" jsonb,
	"delivery_result" jsonb,
	"retry_of_occurrence_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"prompt" text,
	"delegate_actor_id" text,
	"delegate_mode" "task_delegate_mode" DEFAULT 'manual' NOT NULL,
	"delegated_by_actor_id" text,
	"task_status" "task_status" DEFAULT 'open' NOT NULL,
	"attention_status" "task_attention_status" DEFAULT 'none' NOT NULL,
	"review_status" "task_review_status" DEFAULT 'none' NOT NULL,
	"schedule_type" "task_schedule_type" DEFAULT 'none' NOT NULL,
	"schedule_rule" text,
	"schedule_summary" text,
	"timezone" text,
	"next_occurrence_at" timestamp with time zone,
	"max_occurrences" integer,
	"occurrence_count" integer DEFAULT 0 NOT NULL,
	"latest_execution_status" "task_occurrence_execution_status",
	"latest_result_summary" text,
	"latest_error_summary" text,
	"delivery_targets" jsonb,
	"source_conversation_id" text,
	"due_date" timestamp with time zone,
	"priority" integer DEFAULT 0 NOT NULL,
	"flag_color" text,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"sort_order" double precision,
	"processing_enabled" boolean DEFAULT true NOT NULL,
	"processing_status" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS ((
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
      )) STORED
);
--> statement-breakpoint
CREATE TABLE "tasks_tags" (
	"task_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "tasks_tags_task_id_tag_id_pk" PRIMARY KEY("task_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"user_type" text NOT NULL,
	"display_name" text,
	"full_name" text,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"avatar_storage_id" text,
	"avatar_color" text,
	"bio" text,
	"time_zone" text,
	"city" text,
	"country" text,
	"is_instance_admin" boolean DEFAULT false NOT NULL,
	"account_status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "verifications_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "queue_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"queue" text NOT NULL,
	"key" text,
	"data" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"scheduled_for" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"backoff_ms" integer,
	"backoff_type" text,
	"locked_by" text,
	"locked_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"lock_token" text,
	"error_message" text,
	"error_details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"stages" jsonb,
	"current_stage" text,
	"overall_progress" integer DEFAULT 0,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "queue_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"queue" text NOT NULL,
	"key" text NOT NULL,
	"cron" text NOT NULL,
	"data" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"run_limit" integer,
	"run_count" integer DEFAULT 0 NOT NULL,
	"end_date" timestamp with time zone,
	"timezone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "queue_schedules_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actor_credentials" ADD CONSTRAINT "actor_credentials_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actor_credentials" ADD CONSTRAINT "actor_credentials_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actor_credentials" ADD CONSTRAINT "actor_credentials_grant_id_actor_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."actor_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actor_grants" ADD CONSTRAINT "actor_grants_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actor_grants" ADD CONSTRAINT "actor_grants_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actor_grants" ADD CONSTRAINT "actor_grants_granted_by_actor_id_actors_id_fk" FOREIGN KEY ("granted_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_steps" ADD CONSTRAINT "agent_steps_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_steps" ADD CONSTRAINT "agent_steps_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_selection" ADD CONSTRAINT "ai_model_selection_model_id_ai_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."ai_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_selection" ADD CONSTRAINT "ai_model_selection_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_provider_id_ai_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."ai_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_providers" ADD CONSTRAINT "ai_providers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks_tags" ADD CONSTRAINT "bookmarks_tags_bookmark_id_bookmarks_id_fk" FOREIGN KEY ("bookmark_id") REFERENCES "public"."bookmarks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks_tags" ADD CONSTRAINT "bookmarks_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_agent_actor_id_actors_id_fk" FOREIGN KEY ("agent_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents_tags" ADD CONSTRAINT "documents_tags_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents_tags" ADD CONSTRAINT "documents_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history" ADD CONSTRAINT "history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history" ADD CONSTRAINT "history_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history" ADD CONSTRAINT "history_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_actors" ADD CONSTRAINT "human_actors_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_actors" ADD CONSTRAINT "human_actors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instance_settings" ADD CONSTRAINT "instance_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD CONSTRAINT "mcp_servers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_tags" ADD CONSTRAINT "media_tags_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_tags" ADD CONSTRAINT "media_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes_tags" ADD CONSTRAINT "notes_tags_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes_tags" ADD CONSTRAINT "notes_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos_tags" ADD CONSTRAINT "photos_tags_photo_id_photos_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."photos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photos_tags" ADD CONSTRAINT "photos_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_actor_id_actors_id_fk" FOREIGN KEY ("author_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_occurrences" ADD CONSTRAINT "task_occurrences_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_occurrences" ADD CONSTRAINT "task_occurrences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_occurrences" ADD CONSTRAINT "task_occurrences_executor_actor_id_actors_id_fk" FOREIGN KEY ("executor_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_occurrences" ADD CONSTRAINT "task_occurrences_requested_by_actor_id_actors_id_fk" FOREIGN KEY ("requested_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_occurrences" ADD CONSTRAINT "task_occurrences_retry_of_occurrence_id_task_occurrences_id_fk" FOREIGN KEY ("retry_of_occurrence_id") REFERENCES "public"."task_occurrences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_delegate_actor_id_actors_id_fk" FOREIGN KEY ("delegate_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_delegated_by_actor_id_actors_id_fk" FOREIGN KEY ("delegated_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks_tags" ADD CONSTRAINT "tasks_tags_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks_tags" ADD CONSTRAINT "tasks_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "actor_credentials_actor_id_idx" ON "actor_credentials" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "actor_credentials_owner_user_id_idx" ON "actor_credentials" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "actor_credentials_grant_id_idx" ON "actor_credentials" USING btree ("grant_id");--> statement-breakpoint
CREATE INDEX "actor_grants_actor_id_idx" ON "actor_grants" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "actor_grants_owner_user_id_idx" ON "actor_grants" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "actor_grants_granted_by_actor_id_idx" ON "actor_grants" USING btree ("granted_by_actor_id");--> statement-breakpoint
CREATE INDEX "actors_owner_user_id_idx" ON "actors" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "actors_owner_user_id_kind_idx" ON "actors" USING btree ("owner_user_id","kind");--> statement-breakpoint
CREATE INDEX "agent_steps_message_id_idx" ON "agent_steps" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "agent_steps_conversation_id_idx" ON "agent_steps" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "agent_steps_conversation_id_step_number_idx" ON "agent_steps" USING btree ("conversation_id","step_number");--> statement-breakpoint
CREATE INDEX "agents_user_id_idx" ON "agents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agents_user_id_updated_at_idx" ON "agents" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_user_id_name_lower_idx" ON "agents" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "ai_models_provider_id_idx" ON "ai_models" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "api_keys_user_id_idx" ON "api_keys" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bookmarks_user_id_idx" ON "bookmarks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bookmarks_is_pinned_idx" ON "bookmarks" USING btree ("is_pinned");--> statement-breakpoint
CREATE INDEX "bookmarks_user_id_normalized_url_idx" ON "bookmarks" USING btree ("user_id","normalized_url");--> statement-breakpoint
CREATE INDEX "bookmarks_user_id_processing_enabled_idx" ON "bookmarks" USING btree ("user_id") WHERE processing_enabled = true;--> statement-breakpoint
CREATE INDEX "bookmarks_user_id_created_at_idx" ON "bookmarks" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "bookmarks_user_id_title_idx" ON "bookmarks" USING btree ("user_id","title");--> statement-breakpoint
CREATE INDEX "bookmarks_title_trgm_idx" ON "bookmarks" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "bookmarks_search_vector_idx" ON "bookmarks" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "bookmarks_tags_tag_id_idx" ON "bookmarks_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "channels_user_id_idx" ON "channels" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "channels_agent_actor_id_idx" ON "channels" USING btree ("agent_actor_id");--> statement-breakpoint
CREATE INDEX "channels_platform_idx" ON "channels" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "channels_is_active_idx" ON "channels" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "channels_config_idx" ON "channels" USING gin ("config");--> statement-breakpoint
CREATE INDEX "conversations_user_id_idx" ON "conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "conversations_user_id_agent_actor_id_idx" ON "conversations" USING btree ("user_id","agent_actor_id");--> statement-breakpoint
CREATE INDEX "conversations_last_message_at_idx" ON "conversations" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "documents_user_id_idx" ON "documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "documents_is_pinned_idx" ON "documents" USING btree ("is_pinned");--> statement-breakpoint
CREATE INDEX "documents_user_id_processing_enabled_idx" ON "documents" USING btree ("user_id") WHERE processing_enabled = true;--> statement-breakpoint
CREATE INDEX "documents_user_id_created_at_idx" ON "documents" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_user_id_title_idx" ON "documents" USING btree ("user_id","title");--> statement-breakpoint
CREATE INDEX "documents_title_trgm_idx" ON "documents" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "documents_user_id_updated_at_idx" ON "documents" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "documents_search_vector_idx" ON "documents" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "documents_tags_tag_id_idx" ON "documents_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "feedback_user_id_idx" ON "feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feedback_created_at_idx" ON "feedback" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "history_item_idx" ON "history" USING btree ("item_type","item_id");--> statement-breakpoint
CREATE INDEX "history_user_id_idx" ON "history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "history_actor_id_idx" ON "history" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "history_authorized_by_actor_id_idx" ON "history" USING btree ("authorized_by_actor_id");--> statement-breakpoint
CREATE INDEX "history_grant_id_idx" ON "history" USING btree ("grant_id");--> statement-breakpoint
CREATE INDEX "history_conversation_id_idx" ON "history" USING btree ("conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "human_actors_user_id_idx" ON "human_actors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "media_user_id_idx" ON "media" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "media_is_pinned_idx" ON "media" USING btree ("is_pinned");--> statement-breakpoint
CREATE INDEX "media_user_id_media_type_idx" ON "media" USING btree ("user_id","media_type");--> statement-breakpoint
CREATE INDEX "media_user_id_processing_enabled_idx" ON "media" USING btree ("user_id") WHERE processing_enabled = true;--> statement-breakpoint
CREATE INDEX "media_user_id_created_at_idx" ON "media" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "media_user_id_title_idx" ON "media" USING btree ("user_id","title");--> statement-breakpoint
CREATE INDEX "media_title_trgm_idx" ON "media" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "media_search_vector_idx" ON "media" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "media_tags_tag_id_idx" ON "media_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_id_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_author_actor_id_idx" ON "messages" USING btree ("author_actor_id");--> statement-breakpoint
CREATE INDEX "messages_created_at_idx" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notes_user_id_idx" ON "notes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notes_is_pinned_idx" ON "notes" USING btree ("is_pinned");--> statement-breakpoint
CREATE INDEX "notes_user_id_processing_enabled_idx" ON "notes" USING btree ("user_id") WHERE processing_enabled = true;--> statement-breakpoint
CREATE INDEX "notes_user_id_created_at_idx" ON "notes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notes_user_id_title_idx" ON "notes" USING btree ("user_id","title");--> statement-breakpoint
CREATE INDEX "notes_title_trgm_idx" ON "notes" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "notes_search_vector_idx" ON "notes" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "notes_tags_tag_id_idx" ON "notes_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "photos_user_id_idx" ON "photos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "photos_is_pinned_idx" ON "photos" USING btree ("is_pinned");--> statement-breakpoint
CREATE INDEX "photos_date_taken_idx" ON "photos" USING btree ("date_taken");--> statement-breakpoint
CREATE INDEX "photos_user_id_processing_enabled_idx" ON "photos" USING btree ("user_id") WHERE processing_enabled = true;--> statement-breakpoint
CREATE INDEX "photos_user_id_created_at_idx" ON "photos" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "photos_user_id_date_taken_idx" ON "photos" USING btree ("user_id","date_taken");--> statement-breakpoint
CREATE INDEX "photos_user_id_title_idx" ON "photos" USING btree ("user_id","title");--> statement-breakpoint
CREATE INDEX "photos_title_trgm_idx" ON "photos" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "photos_search_vector_idx" ON "photos" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "photos_tags_tag_id_idx" ON "photos_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_user_id_name_lower_idx" ON "tags" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "task_comments_task_id_idx" ON "task_comments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_comments_user_id_idx" ON "task_comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_comments_author_actor_id_idx" ON "task_comments" USING btree ("author_actor_id");--> statement-breakpoint
CREATE INDEX "task_comments_created_at_idx" ON "task_comments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "task_occurrences_task_id_created_at_idx" ON "task_occurrences" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "task_occurrences_user_id_created_at_idx" ON "task_occurrences" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "task_occurrences_execution_status_idx" ON "task_occurrences" USING btree ("execution_status");--> statement-breakpoint
CREATE INDEX "task_occurrences_executor_actor_id_idx" ON "task_occurrences" USING btree ("executor_actor_id");--> statement-breakpoint
CREATE INDEX "task_occurrences_kind_idx" ON "task_occurrences" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "tasks_user_id_idx" ON "tasks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tasks_task_status_idx" ON "tasks" USING btree ("task_status");--> statement-breakpoint
CREATE INDEX "tasks_attention_status_idx" ON "tasks" USING btree ("attention_status");--> statement-breakpoint
CREATE INDEX "tasks_due_date_idx" ON "tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "tasks_delegate_actor_id_idx" ON "tasks" USING btree ("delegate_actor_id");--> statement-breakpoint
CREATE INDEX "tasks_is_pinned_idx" ON "tasks" USING btree ("is_pinned");--> statement-breakpoint
CREATE INDEX "tasks_completed_at_idx" ON "tasks" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "tasks_schedule_type_idx" ON "tasks" USING btree ("schedule_type");--> statement-breakpoint
CREATE INDEX "tasks_next_occurrence_at_idx" ON "tasks" USING btree ("next_occurrence_at");--> statement-breakpoint
CREATE INDEX "tasks_user_id_attention_status_idx" ON "tasks" USING btree ("user_id","attention_status");--> statement-breakpoint
CREATE INDEX "tasks_user_id_processing_enabled_idx" ON "tasks" USING btree ("user_id") WHERE processing_enabled = true;--> statement-breakpoint
CREATE INDEX "tasks_user_id_created_at_idx" ON "tasks" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "tasks_user_id_due_date_idx" ON "tasks" USING btree ("user_id","due_date");--> statement-breakpoint
CREATE INDEX "tasks_user_id_task_status_created_at_idx" ON "tasks" USING btree ("user_id","task_status","created_at");--> statement-breakpoint
CREATE INDEX "tasks_user_id_priority_created_at_idx" ON "tasks" USING btree ("user_id","priority","created_at");--> statement-breakpoint
CREATE INDEX "tasks_user_id_sort_order_idx" ON "tasks" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE INDEX "tasks_title_trgm_idx" ON "tasks" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "tasks_search_vector_idx" ON "tasks" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "tasks_tags_tag_id_idx" ON "tasks_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_idx" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "queue_jobs_queue_key_idx" ON "queue_jobs" USING btree ("queue","key");--> statement-breakpoint
CREATE INDEX "queue_jobs_queue_status_idx" ON "queue_jobs" USING btree ("queue","status");--> statement-breakpoint
CREATE INDEX "queue_jobs_status_scheduled_idx" ON "queue_jobs" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "queue_jobs_status_retry_idx" ON "queue_jobs" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "queue_jobs_status_expires_idx" ON "queue_jobs" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "queue_schedules_enabled_next_run_idx" ON "queue_schedules" USING btree ("enabled","next_run_at");