CREATE TABLE "planning_answer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month_id" uuid NOT NULL,
	"note" text,
	"approved" integer DEFAULT 0 NOT NULL,
	"changes" integer DEFAULT 0 NOT NULL,
	"portal_user_id" text,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "planning_send" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_by_id" text,
	"sent_by_name" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "planning_send_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"send_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"previous_state" text NOT NULL,
	"art_version" integer,
	"answered_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "portal_notification" ALTER COLUMN "client_request_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "portal_notification" ADD COLUMN "planning_month_id" uuid;--> statement-breakpoint
ALTER TABLE "planning_month" ADD COLUMN "shared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "planning_review" ADD COLUMN "send_post_id" uuid;--> statement-breakpoint
ALTER TABLE "planning_answer" ADD CONSTRAINT "planning_answer_month_id_planning_month_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."planning_month"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_answer" ADD CONSTRAINT "planning_answer_portal_user_id_portal_user_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_send" ADD CONSTRAINT "planning_send_month_id_planning_month_id_fk" FOREIGN KEY ("month_id") REFERENCES "public"."planning_month"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_send" ADD CONSTRAINT "planning_send_sent_by_id_user_id_fk" FOREIGN KEY ("sent_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_send_post" ADD CONSTRAINT "planning_send_post_send_id_planning_send_id_fk" FOREIGN KEY ("send_id") REFERENCES "public"."planning_send"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_send_post" ADD CONSTRAINT "planning_send_post_post_id_planning_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."planning_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planning_answer_month_idx" ON "planning_answer" USING btree ("month_id","created_at");--> statement-breakpoint
CREATE INDEX "planning_send_month_idx" ON "planning_send" USING btree ("month_id","stage","status");--> statement-breakpoint
CREATE INDEX "planning_send_post_send_idx" ON "planning_send_post" USING btree ("send_id");--> statement-breakpoint
CREATE UNIQUE INDEX "planning_send_post_pending_idx" ON "planning_send_post" USING btree ("post_id","stage") WHERE "planning_send_post"."state" = 'pending';--> statement-breakpoint
ALTER TABLE "portal_notification" ADD CONSTRAINT "portal_notification_planning_month_id_planning_month_id_fk" FOREIGN KEY ("planning_month_id") REFERENCES "public"."planning_month"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_review" ADD CONSTRAINT "planning_review_send_id_planning_send_id_fk" FOREIGN KEY ("send_id") REFERENCES "public"."planning_send"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_review" ADD CONSTRAINT "planning_review_send_post_id_planning_send_post_id_fk" FOREIGN KEY ("send_post_id") REFERENCES "public"."planning_send_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "planning_review_draft_idx" ON "planning_review" USING btree ("send_post_id") WHERE "planning_review"."submitted_at" is null;--> statement-breakpoint
ALTER TABLE "portal_notification" ADD CONSTRAINT "portal_notification_target_check" CHECK (num_nonnulls("portal_notification"."client_request_id", "portal_notification"."planning_month_id") = 1);