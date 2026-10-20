CREATE TABLE "client_request_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_by_id" text,
	"sent_by_name" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_by_portal_user_id" text,
	"answered_by_name" text,
	"answered_at" timestamp with time zone,
	CONSTRAINT "client_request_delivery_round_unique" UNIQUE("request_id","round"),
	CONSTRAINT "client_request_delivery_status_check" CHECK ("client_request_delivery"."status" in ('pending', 'approved', 'changes_requested', 'superseded'))
);
--> statement-breakpoint
CREATE TABLE "client_request_delivery_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"decision" text,
	"comment" text,
	"decided_by_portal_user_id" text,
	"decided_by_name" text,
	"decided_at" timestamp with time zone,
	CONSTRAINT "client_request_delivery_file_media_unique" UNIQUE("delivery_id","media_id"),
	CONSTRAINT "client_request_delivery_file_decision_check" CHECK ("client_request_delivery_file"."decision" in ('approved', 'changes'))
);
--> statement-breakpoint
CREATE TABLE "portal_notification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portal_user_id" text NOT NULL,
	"type" text NOT NULL,
	"client_request_id" uuid NOT NULL,
	"actor_id" text,
	"actor_name" text,
	"data" jsonb NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "client_request_event" DROP CONSTRAINT "client_request_event_type_check";--> statement-breakpoint
ALTER TABLE "client_request_delivery" ADD CONSTRAINT "client_request_delivery_request_id_client_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."client_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_request_delivery" ADD CONSTRAINT "client_request_delivery_sent_by_id_user_id_fk" FOREIGN KEY ("sent_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_request_delivery" ADD CONSTRAINT "client_request_delivery_answered_by_portal_user_id_portal_user_id_fk" FOREIGN KEY ("answered_by_portal_user_id") REFERENCES "public"."portal_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_request_delivery_file" ADD CONSTRAINT "client_request_delivery_file_delivery_id_client_request_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."client_request_delivery"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_request_delivery_file" ADD CONSTRAINT "client_request_delivery_file_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_request_delivery_file" ADD CONSTRAINT "client_request_delivery_file_decided_by_portal_user_id_portal_user_id_fk" FOREIGN KEY ("decided_by_portal_user_id") REFERENCES "public"."portal_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_notification" ADD CONSTRAINT "portal_notification_portal_user_id_portal_user_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_notification" ADD CONSTRAINT "portal_notification_client_request_id_client_request_id_fk" FOREIGN KEY ("client_request_id") REFERENCES "public"."client_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portal_notification" ADD CONSTRAINT "portal_notification_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_request_delivery_file_delivery_idx" ON "client_request_delivery_file" USING btree ("delivery_id","position");--> statement-breakpoint
CREATE INDEX "portal_notification_user_updated_at_idx" ON "portal_notification" USING btree ("portal_user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "portal_notification_open_message_idx" ON "portal_notification" USING btree ("portal_user_id","client_request_id") WHERE "portal_notification"."type" = 'request.message' and "portal_notification"."read_at" is null;--> statement-breakpoint
ALTER TABLE "client_request_event" ADD CONSTRAINT "client_request_event_type_check" CHECK ("client_request_event"."type" in ('expected_on', 'edited', 'delivery_sent', 'delivery_answered'));