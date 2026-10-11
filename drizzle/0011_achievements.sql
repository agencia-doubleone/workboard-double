CREATE TABLE "achievement_counter" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievement_counter_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "achievement_launch" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"launched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievement_launch_single" CHECK ("achievement_launch"."id")
);
--> statement-breakpoint
CREATE TABLE "achievement_record" (
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"ref_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"on_time" boolean,
	CONSTRAINT "achievement_record_user_id_kind_ref_id_pk" PRIMARY KEY("user_id","kind","ref_id")
);
--> statement-breakpoint
CREATE TABLE "guestbook_entry" (
	"user_id" text PRIMARY KEY NOT NULL,
	"message" text,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_achievement" (
	"user_id" text NOT NULL,
	"achievement_id" text NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone,
	"granted_by_id" text,
	"granted_by_name" text,
	CONSTRAINT "user_achievement_user_id_achievement_id_pk" PRIMARY KEY("user_id","achievement_id")
);
--> statement-breakpoint
ALTER TABLE "planning_month" ADD COLUMN "adjustments_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "achievement_counter" ADD CONSTRAINT "achievement_counter_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_record" ADD CONSTRAINT "achievement_record_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guestbook_entry" ADD CONSTRAINT "guestbook_entry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievement" ADD CONSTRAINT "user_achievement_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievement" ADD CONSTRAINT "user_achievement_granted_by_id_user_id_fk" FOREIGN KEY ("granted_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "achievement_record_kind_ref_idx" ON "achievement_record" USING btree ("kind","ref_id");--> statement-breakpoint
CREATE INDEX "user_achievement_achievement_idx" ON "user_achievement" USING btree ("achievement_id");--> statement-breakpoint
-- As conquistas contam a partir daqui (ninguém começa com nada do que fez antes).
INSERT INTO "achievement_launch" ("id") VALUES (true) ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Meses que estão em "Ajustes pedidos" agora já não são "Aprovado de Primeira".
UPDATE "planning_month" SET "adjustments_requested_at" = "status_changed_at" WHERE "status" = 'ajustes';
