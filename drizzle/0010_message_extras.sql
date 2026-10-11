CREATE TABLE "chat_message_favorite" (
	"user_id" text NOT NULL,
	"message_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_message_favorite_user_id_message_id_pk" PRIMARY KEY("user_id","message_id")
);
--> statement-breakpoint
CREATE TABLE "chat_message_reaction" (
	"message_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_message_reaction_message_id_user_id_emoji_pk" PRIMARY KEY("message_id","user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE "job_message_favorite" (
	"user_id" text NOT NULL,
	"message_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_message_favorite_user_id_message_id_pk" PRIMARY KEY("user_id","message_id")
);
--> statement-breakpoint
CREATE TABLE "job_message_reaction" (
	"message_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_message_reaction_message_id_user_id_emoji_pk" PRIMARY KEY("message_id","user_id","emoji")
);
--> statement-breakpoint
ALTER TABLE "chat_message" ADD COLUMN "pinned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_message" ADD COLUMN "pinned_by_id" text;--> statement-breakpoint
ALTER TABLE "chat_message" ADD COLUMN "pinned_by_name" text;--> statement-breakpoint
ALTER TABLE "job_message" ADD COLUMN "pinned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_message" ADD COLUMN "pinned_by_id" text;--> statement-breakpoint
ALTER TABLE "job_message" ADD COLUMN "pinned_by_name" text;--> statement-breakpoint
ALTER TABLE "chat_message_favorite" ADD CONSTRAINT "chat_message_favorite_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_favorite" ADD CONSTRAINT "chat_message_favorite_message_id_chat_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_reaction" ADD CONSTRAINT "chat_message_reaction_message_id_chat_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message_reaction" ADD CONSTRAINT "chat_message_reaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_message_favorite" ADD CONSTRAINT "job_message_favorite_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_message_favorite" ADD CONSTRAINT "job_message_favorite_message_id_job_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."job_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_message_reaction" ADD CONSTRAINT "job_message_reaction_message_id_job_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."job_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_message_reaction" ADD CONSTRAINT "job_message_reaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_message_favorite_message_idx" ON "chat_message_favorite" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "job_message_favorite_message_idx" ON "job_message_favorite" USING btree ("message_id");--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_pinned_by_id_user_id_fk" FOREIGN KEY ("pinned_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_message" ADD CONSTRAINT "job_message_pinned_by_id_user_id_fk" FOREIGN KEY ("pinned_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_message_pinned_idx" ON "chat_message" USING btree ("conversation_id") WHERE "chat_message"."pinned_at" is not null;--> statement-breakpoint
CREATE INDEX "job_message_pinned_idx" ON "job_message" USING btree ("job_id") WHERE "job_message"."pinned_at" is not null;