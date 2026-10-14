ALTER TABLE "planning_post" ADD COLUMN "kind" text DEFAULT 'estatico' NOT NULL;--> statement-breakpoint
ALTER TABLE "planning_post" ADD COLUMN "support_text" text;--> statement-breakpoint
ALTER TABLE "planning_post" ADD COLUMN "cta" text;--> statement-breakpoint
ALTER TABLE "planning_post" ADD COLUMN "hashtags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "planning_post" ADD COLUMN "slides" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "planning_post" ADD COLUMN "scenes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "planning_post" ADD COLUMN "notes" text;--> statement-breakpoint
-- Posts do formato antigo (Word): o tipo sai do formato escrito, como fazia o formatKind.
UPDATE "planning_post" SET "kind" = CASE
	WHEN "format" ILIKE '%carross%' THEN 'carrossel'
	WHEN "format" ILIKE '%reel%' THEN 'reels'
	WHEN "format" ILIKE '%stor%' THEN 'stories'
	WHEN "format" ILIKE '%video%' OR "format" ILIKE '%vídeo%' THEN 'video'
	ELSE 'estatico'
END;--> statement-breakpoint
-- As seções "Texto de apoio" e "CTA" viram campos; tema, formato com detalhe ("Carrossel — 3 cards")
-- e as outras seções vão para as observações, na ordem. Nada do texto antigo se perde.
UPDATE "planning_post" AS p SET
	"support_text" = (
		SELECT nullif(string_agg(nullif(trim(t.s->>'text'), ''), E'\n\n' ORDER BY t.ord), '')
		FROM jsonb_array_elements(p."sections") WITH ORDINALITY AS t(s, ord)
		WHERE lower(trim(t.s->>'label')) = 'texto de apoio'
	),
	"cta" = (
		SELECT nullif(string_agg(nullif(trim(t.s->>'text'), ''), E'\n\n' ORDER BY t.ord), '')
		FROM jsonb_array_elements(p."sections") WITH ORDINALITY AS t(s, ord)
		WHERE lower(trim(t.s->>'label')) = 'cta'
	),
	"notes" = nullif(concat_ws(E'\n\n',
		CASE WHEN nullif(trim(p."topic"), '') IS NOT NULL THEN 'Tema: ' || trim(p."topic") END,
		CASE
			WHEN nullif(trim(p."format"), '') IS NOT NULL
				AND lower(trim(p."format")) NOT IN ('card estático', 'estático', 'estatico', 'carrossel', 'reel', 'reels', 'stories', 'vídeo', 'video')
			THEN 'Formato: ' || trim(p."format")
		END,
		(
			SELECT string_agg(trim(t.s->>'label') || E':\n' || trim(t.s->>'text'), E'\n\n' ORDER BY t.ord)
			FROM jsonb_array_elements(p."sections") WITH ORDINALITY AS t(s, ord)
			WHERE lower(trim(t.s->>'label')) NOT IN ('texto de apoio', 'cta') AND nullif(trim(t.s->>'text'), '') IS NOT NULL
		)
	), '');
