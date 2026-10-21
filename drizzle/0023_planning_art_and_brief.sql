CREATE TABLE "planning_post_asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"media_id" uuid,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planning_post_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"type" text NOT NULL,
	"data" jsonb NOT NULL,
	"actor_id" text,
	"actor_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planning_review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"send_id" uuid,
	"stage" text NOT NULL,
	"decision" text NOT NULL,
	"comment" text,
	"side" text NOT NULL,
	"portal_user_id" text,
	"user_id" text,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "planning" ADD COLUMN "approves_brief" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "planning_post" ADD COLUMN "brief_state" text DEFAULT 'rascunho' NOT NULL;--> statement-breakpoint
ALTER TABLE "planning_post" ADD COLUMN "brief_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "planning_post" ADD COLUMN "brief_decided_by_name" text;--> statement-breakpoint
ALTER TABLE "planning_post" ADD COLUMN "brief_decided_by_side" text;--> statement-breakpoint
ALTER TABLE "planning_post" ADD COLUMN "brief_caption" jsonb;--> statement-breakpoint
ALTER TABLE "planning_post" ADD COLUMN "art_state" text DEFAULT 'sem_arte' NOT NULL;--> statement-breakpoint
ALTER TABLE "planning_post" ADD COLUMN "art_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "planning_post" ADD COLUMN "art_decided_by_name" text;--> statement-breakpoint
ALTER TABLE "planning_post" ADD COLUMN "art_decided_by_side" text;--> statement-breakpoint
ALTER TABLE "planning_post_asset" ADD CONSTRAINT "planning_post_asset_post_id_planning_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."planning_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_post_asset" ADD CONSTRAINT "planning_post_asset_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_post_asset" ADD CONSTRAINT "planning_post_asset_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_post_event" ADD CONSTRAINT "planning_post_event_post_id_planning_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."planning_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_post_event" ADD CONSTRAINT "planning_post_event_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_review" ADD CONSTRAINT "planning_review_post_id_planning_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."planning_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_review" ADD CONSTRAINT "planning_review_portal_user_id_portal_user_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_review" ADD CONSTRAINT "planning_review_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planning_post_asset_post_idx" ON "planning_post_asset" USING btree ("post_id","version","position");--> statement-breakpoint
CREATE INDEX "planning_post_asset_media_idx" ON "planning_post_asset" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "planning_post_event_post_idx" ON "planning_post_event" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "planning_review_post_idx" ON "planning_review" USING btree ("post_id","stage","created_at");