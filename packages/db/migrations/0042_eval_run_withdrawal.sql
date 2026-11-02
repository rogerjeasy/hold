-- An accepted evaluation run can be withdrawn when it turns out to measure nothing (extensions.md section 5.9). It
-- stays on record; the scorecard stops showing it and the next run is no longer measured against it.
ALTER TABLE "eval_runs" ADD COLUMN "withdrawn_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD COLUMN "withdrawn_reason" text;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "withdrawnReason_allowed" CHECK ("eval_runs"."withdrawn_reason" in ('model_not_asked'));--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_withdrawn_with_reason" CHECK (("eval_runs"."withdrawn_at" is null) = ("eval_runs"."withdrawn_reason" is null));--> statement-breakpoint
-- The run accepted by mistake on 29 October 2026: the model answered too few of its pairs for it to measure the
-- comparison. Every accepted gate run whose pairs reached the model less than half the time is withdrawn on that ground.
UPDATE "eval_runs" SET "withdrawn_at" = now(), "withdrawn_reason" = 'model_not_asked'
WHERE "accepted" AND "half" = 'gate' AND "withdrawn_at" IS NULL
  AND 2 * (SELECT count(*) FROM jsonb_array_elements("cases") AS "pair" WHERE coalesce(("pair"->>'inputTokens')::integer, 0) > 0) < jsonb_array_length("cases");
