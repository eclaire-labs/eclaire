CREATE TYPE "public"."actor_kind" AS ENUM('human', 'agent', 'system', 'service');--> statement-breakpoint
ALTER TYPE "public"."task_status" ADD VALUE 'backlog' BEFORE 'not-started';--> statement-breakpoint
ALTER TYPE "public"."task_status" ADD VALUE 'cancelled';--> statement-breakpoint
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
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"system_prompt" text NOT NULL,
	"tool_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skill_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "human_actors" (
	"actor_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookmarks" RENAME COLUMN "enabled" TO "processing_enabled";--> statement-breakpoint
ALTER TABLE "documents" RENAME COLUMN "enabled" TO "processing_enabled";--> statement-breakpoint
ALTER TABLE "notes" RENAME COLUMN "enabled" TO "processing_enabled";--> statement-breakpoint
ALTER TABLE "photos" RENAME COLUMN "enabled" TO "processing_enabled";--> statement-breakpoint
ALTER TABLE "tasks" RENAME COLUMN "assigned_to_id" TO "assignee_actor_id";--> statement-breakpoint
ALTER TABLE "tasks" RENAME COLUMN "enabled" TO "processing_enabled";--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_assigned_to_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "bookmarks_user_id_enabled_idx";--> statement-breakpoint
DROP INDEX "documents_user_id_enabled_idx";--> statement-breakpoint
DROP INDEX "notes_user_id_enabled_idx";--> statement-breakpoint
DROP INDEX "photos_user_id_enabled_idx";--> statement-breakpoint
DROP INDEX "tasks_user_id_enabled_idx";--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "agent_actor_id" text;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "agent_actor_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "history" ADD COLUMN "actor_id" text;--> statement-breakpoint
ALTER TABLE "history" ADD COLUMN "authorized_by_actor_id" text;--> statement-breakpoint
ALTER TABLE "history" ADD COLUMN "grant_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "author_actor_id" text;--> statement-breakpoint
ALTER TABLE "task_comments" ADD COLUMN "author_actor_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "sort_order" double precision;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "actor_credentials" ADD CONSTRAINT "actor_credentials_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actor_credentials" ADD CONSTRAINT "actor_credentials_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actor_credentials" ADD CONSTRAINT "actor_credentials_grant_id_actor_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."actor_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actor_grants" ADD CONSTRAINT "actor_grants_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actor_grants" ADD CONSTRAINT "actor_grants_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actor_grants" ADD CONSTRAINT "actor_grants_granted_by_actor_id_actors_id_fk" FOREIGN KEY ("granted_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_actors" ADD CONSTRAINT "human_actors_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_actors" ADD CONSTRAINT "human_actors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actor_credentials_actor_id_idx" ON "actor_credentials" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "actor_credentials_owner_user_id_idx" ON "actor_credentials" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "actor_credentials_grant_id_idx" ON "actor_credentials" USING btree ("grant_id");--> statement-breakpoint
CREATE INDEX "actor_grants_actor_id_idx" ON "actor_grants" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "actor_grants_owner_user_id_idx" ON "actor_grants" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "actor_grants_granted_by_actor_id_idx" ON "actor_grants" USING btree ("granted_by_actor_id");--> statement-breakpoint
CREATE INDEX "actors_owner_user_id_idx" ON "actors" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "actors_owner_user_id_kind_idx" ON "actors" USING btree ("owner_user_id","kind");--> statement-breakpoint
CREATE INDEX "agents_user_id_idx" ON "agents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "agents_user_id_updated_at_idx" ON "agents" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_user_id_name_lower_idx" ON "agents" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "human_actors_user_id_idx" ON "human_actors" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_agent_actor_id_actors_id_fk" FOREIGN KEY ("agent_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_actor_id_actors_id_fk" FOREIGN KEY ("author_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_actor_id_actors_id_fk" FOREIGN KEY ("assignee_actor_id") REFERENCES "public"."actors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookmarks_user_id_processing_enabled_idx" ON "bookmarks" USING btree ("user_id") WHERE processing_enabled = true;--> statement-breakpoint
CREATE INDEX "bookmarks_user_id_created_at_idx" ON "bookmarks" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "bookmarks_user_id_title_idx" ON "bookmarks" USING btree ("user_id","title");--> statement-breakpoint
CREATE INDEX "bookmarks_title_trgm_idx" ON "bookmarks" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "channels_agent_actor_id_idx" ON "channels" USING btree ("agent_actor_id");--> statement-breakpoint
CREATE INDEX "conversations_user_id_agent_actor_id_idx" ON "conversations" USING btree ("user_id","agent_actor_id");--> statement-breakpoint
CREATE INDEX "documents_user_id_processing_enabled_idx" ON "documents" USING btree ("user_id") WHERE processing_enabled = true;--> statement-breakpoint
CREATE INDEX "documents_user_id_created_at_idx" ON "documents" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_user_id_title_idx" ON "documents" USING btree ("user_id","title");--> statement-breakpoint
CREATE INDEX "documents_title_trgm_idx" ON "documents" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "documents_user_id_updated_at_idx" ON "documents" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "history_actor_id_idx" ON "history" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "history_authorized_by_actor_id_idx" ON "history" USING btree ("authorized_by_actor_id");--> statement-breakpoint
CREATE INDEX "history_grant_id_idx" ON "history" USING btree ("grant_id");--> statement-breakpoint
CREATE INDEX "messages_author_actor_id_idx" ON "messages" USING btree ("author_actor_id");--> statement-breakpoint
CREATE INDEX "notes_user_id_processing_enabled_idx" ON "notes" USING btree ("user_id") WHERE processing_enabled = true;--> statement-breakpoint
CREATE INDEX "notes_user_id_created_at_idx" ON "notes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notes_user_id_title_idx" ON "notes" USING btree ("user_id","title");--> statement-breakpoint
CREATE INDEX "notes_title_trgm_idx" ON "notes" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "photos_user_id_processing_enabled_idx" ON "photos" USING btree ("user_id") WHERE processing_enabled = true;--> statement-breakpoint
CREATE INDEX "photos_user_id_created_at_idx" ON "photos" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "photos_user_id_date_taken_idx" ON "photos" USING btree ("user_id","date_taken");--> statement-breakpoint
CREATE INDEX "photos_user_id_title_idx" ON "photos" USING btree ("user_id","title");--> statement-breakpoint
CREATE INDEX "photos_title_trgm_idx" ON "photos" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "task_comments_author_actor_id_idx" ON "task_comments" USING btree ("author_actor_id");--> statement-breakpoint
CREATE INDEX "tasks_assignee_actor_id_idx" ON "tasks" USING btree ("assignee_actor_id");--> statement-breakpoint
CREATE INDEX "tasks_parent_id_idx" ON "tasks" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "tasks_user_id_processing_enabled_idx" ON "tasks" USING btree ("user_id") WHERE processing_enabled = true;--> statement-breakpoint
CREATE INDEX "tasks_user_id_created_at_idx" ON "tasks" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "tasks_user_id_due_date_idx" ON "tasks" USING btree ("user_id","due_date");--> statement-breakpoint
CREATE INDEX "tasks_user_id_status_created_at_idx" ON "tasks" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE INDEX "tasks_user_id_priority_created_at_idx" ON "tasks" USING btree ("user_id","priority","created_at");--> statement-breakpoint
CREATE INDEX "tasks_user_id_sort_order_idx" ON "tasks" USING btree ("user_id","sort_order");--> statement-breakpoint
CREATE INDEX "tasks_title_trgm_idx" ON "tasks" USING gin ("title" gin_trgm_ops);