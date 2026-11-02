-- How each evidence photograph was taken (architecture.md section 9.7): Hold's live camera or a chosen file, as the
-- capture screen reported, or a demonstration sample, known by fingerprint. Written once with the photograph; the
-- service roles' column grants of 0015 leave it out, so no role can change it later.
ALTER TABLE "photos" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "photos" ADD CONSTRAINT "source_allowed" CHECK ("photos"."source" in ('camera', 'file', 'sample'));