-- Every pair of an evaluation run, as the pipeline left it, for the open scorecard to show case by case
-- (extensions.md section 5.5). Runs recorded before this keep none.
ALTER TABLE "eval_runs" ADD COLUMN "cases" jsonb DEFAULT '[]'::jsonb NOT NULL;