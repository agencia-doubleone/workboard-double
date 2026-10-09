CREATE TABLE "job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pit" integer GENERATED ALWAYS AS IDENTITY (sequence name "job_pit_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"client_id" uuid NOT NULL,
	"status_id" uuid NOT NULL,
	"due_date" date,
	"active" boolean DEFAULT true NOT NULL,
	"briefing" text,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_pit_unique" UNIQUE("pit")
);
--> statement-breakpoint
CREATE TABLE "job_assignee" (
	"job_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "job_assignee_job_id_user_id_pk" PRIMARY KEY("job_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "job_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"author_id" text,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"mentions" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_message_attachment" (
	"message_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	CONSTRAINT "job_message_attachment_message_id_media_id_pk" PRIMARY KEY("message_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "job_read" (
	"job_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_read_job_id_user_id_pk" PRIMARY KEY("job_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "job_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"text_color" text NOT NULL,
	"background_color" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_final" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_status_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "job_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"status_id" uuid,
	"status_name" text NOT NULL,
	"text_color" text NOT NULL,
	"background_color" text NOT NULL,
	"changed_by_id" text,
	"changed_by_name" text,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_client_id_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."client"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_status_id_job_status_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."job_status"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignee" ADD CONSTRAINT "job_assignee_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_assignee" ADD CONSTRAINT "job_assignee_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_message" ADD CONSTRAINT "job_message_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_message" ADD CONSTRAINT "job_message_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_message_attachment" ADD CONSTRAINT "job_message_attachment_message_id_job_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."job_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_message_attachment" ADD CONSTRAINT "job_message_attachment_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_read" ADD CONSTRAINT "job_read_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_read" ADD CONSTRAINT "job_read_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_status_history" ADD CONSTRAINT "job_status_history_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_status_history" ADD CONSTRAINT "job_status_history_status_id_job_status_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."job_status"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_status_history" ADD CONSTRAINT "job_status_history_changed_by_id_user_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_status_idx" ON "job" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "job_client_idx" ON "job" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "job_created_at_idx" ON "job" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "job_assignee_user_idx" ON "job_assignee" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "job_message_job_idx" ON "job_message" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX "job_status_history_job_idx" ON "job_status_history" USING btree ("job_id","changed_at" DESC NULLS LAST);--> statement-breakpoint
-- Status iniciais (editáveis em Administração › Status). "Novo trabalho" é o padrão de todo trabalho novo.
INSERT INTO "job_status" ("name", "text_color", "background_color", "position", "is_default", "is_final") VALUES
	('Novo trabalho', '#ffffff', '#16a34a', 0, true, false),
	('Em andamento', '#ffffff', '#2563eb', 1, false, false),
	('Aguardando aprovação', '#ffffff', '#9333ea', 2, false, false),
	('Em alteração', '#422006', '#fbbf24', 3, false, false),
	('Aprovado', '#ffffff', '#0d9488', 4, false, false),
	('Finalizado', '#ffffff', '#4b5563', 5, false, true);
