CREATE TABLE "client_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "client_request_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"client_id" uuid NOT NULL,
	"title" text NOT NULL,
	"briefing" text NOT NULL,
	"status" text DEFAULT 'aguardando_analise' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expected_on" date,
	"created_by_portal_user_id" text,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_request_number_unique" UNIQUE("number"),
	CONSTRAINT "client_request_status_check" CHECK ("client_request"."status" in ('aguardando_analise', 'em_analise', 'aguardando_orcamento', 'aguardando_aprovacao', 'em_execucao', 'finalizada', 'negada', 'cancelada'))
);
--> statement-breakpoint
CREATE TABLE "client_request_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"author_side" text NOT NULL,
	"author_id" text,
	"author_portal_user_id" text,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_request_message_side_check" CHECK ("client_request_message"."author_side" in ('team', 'client'))
);
--> statement-breakpoint
CREATE TABLE "client_request_message_attachment" (
	"message_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	CONSTRAINT "client_request_message_attachment_message_id_media_id_pk" PRIMARY KEY("message_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "client_request_portal_read" (
	"request_id" uuid NOT NULL,
	"portal_user_id" text NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_request_portal_read_request_id_portal_user_id_pk" PRIMARY KEY("request_id","portal_user_id")
);
--> statement-breakpoint
CREATE TABLE "client_request_read" (
	"request_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_request_read_request_id_user_id_pk" PRIMARY KEY("request_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "client_request_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"status" text NOT NULL,
	"changed_by_side" text NOT NULL,
	"changed_by_id" text,
	"changed_by_portal_user_id" text,
	"changed_by_name" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_request_status_history_status_check" CHECK ("client_request_status_history"."status" in ('aguardando_analise', 'em_analise', 'aguardando_orcamento', 'aguardando_aprovacao', 'em_execucao', 'finalizada', 'negada', 'cancelada')),
	CONSTRAINT "client_request_status_history_side_check" CHECK ("client_request_status_history"."changed_by_side" in ('team', 'client'))
);
--> statement-breakpoint
ALTER TABLE "notification" ADD COLUMN "client_request_id" uuid;--> statement-breakpoint
ALTER TABLE "client_request" ADD CONSTRAINT "client_request_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_request" ADD CONSTRAINT "client_request_created_by_portal_user_id_portal_user_id_fk" FOREIGN KEY ("created_by_portal_user_id") REFERENCES "public"."portal_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_request_message" ADD CONSTRAINT "client_request_message_request_id_client_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."client_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_request_message" ADD CONSTRAINT "client_request_message_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_request_message" ADD CONSTRAINT "client_request_message_author_portal_user_id_portal_user_id_fk" FOREIGN KEY ("author_portal_user_id") REFERENCES "public"."portal_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_request_message_attachment" ADD CONSTRAINT "client_request_message_attachment_message_id_client_request_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."client_request_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_request_message_attachment" ADD CONSTRAINT "client_request_message_attachment_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_request_portal_read" ADD CONSTRAINT "client_request_portal_read_request_id_client_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."client_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_request_portal_read" ADD CONSTRAINT "client_request_portal_read_portal_user_id_portal_user_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_request_read" ADD CONSTRAINT "client_request_read_request_id_client_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."client_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_request_read" ADD CONSTRAINT "client_request_read_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_request_status_history" ADD CONSTRAINT "client_request_status_history_request_id_client_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."client_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_request_status_history" ADD CONSTRAINT "client_request_status_history_changed_by_id_user_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_request_status_history" ADD CONSTRAINT "client_request_status_history_changed_by_portal_user_id_portal_user_id_fk" FOREIGN KEY ("changed_by_portal_user_id") REFERENCES "public"."portal_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_request_client_idx" ON "client_request" USING btree ("client_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "client_request_status_idx" ON "client_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "client_request_message_request_idx" ON "client_request_message" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX "client_request_status_history_request_idx" ON "client_request_status_history" USING btree ("request_id","changed_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_client_request_id_client_request_id_fk" FOREIGN KEY ("client_request_id") REFERENCES "public"."client_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_open_request_message_idx" ON "notification" USING btree ("user_id","client_request_id") WHERE "notification"."type" = 'request.message' and "notification"."read_at" is null;