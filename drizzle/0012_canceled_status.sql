ALTER TABLE "job_status" ADD COLUMN "is_canceled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job_status" ADD CONSTRAINT "job_status_canceled_is_final" CHECK (not "job_status"."is_canceled" or "job_status"."is_final");--> statement-breakpoint
-- O status "Cancelado", no fim da lista. Se já existir um com esse nome (e não for o padrão), ele vira o de cancelamento.
INSERT INTO "job_status" ("name", "text_color", "background_color", "position", "is_default", "is_final", "is_canceled")
VALUES ('Cancelado', '#ffffff', '#dc2626', (SELECT coalesce(max("position"), -1) + 1 FROM "job_status"), false, true, true)
ON CONFLICT ("name") DO UPDATE SET "is_final" = true, "is_canceled" = true WHERE "job_status"."is_default" = false;
