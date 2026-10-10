DROP INDEX "job_assignee_user_idx";--> statement-breakpoint
ALTER TABLE "job_assignee" ADD COLUMN "position" double precision DEFAULT (-extract(epoch from now())) NOT NULL;--> statement-breakpoint
CREATE INDEX "job_assignee_user_position_idx" ON "job_assignee" USING btree ("user_id","position");--> statement-breakpoint
-- Vínculos que já existiam: a ordem inicial da planilha é a de hoje (o trabalho mais novo primeiro).
UPDATE "job_assignee" SET "position" = -extract(epoch from "job"."created_at") FROM "job" WHERE "job"."id" = "job_assignee"."job_id";
