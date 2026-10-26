-- The evaluation runner's role (extensions.md section 5.6). Roles belong to the whole cluster, so it is created only
-- if missing. Deploying gives it a login from the hold/database/eval secret.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hold_eval') THEN
    CREATE ROLE hold_eval NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"half" text NOT NULL,
	"data_set_version" text NOT NULL,
	"pipeline_version" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"thresholds" jsonb NOT NULL,
	"case_count" integer NOT NULL,
	"synthetic_count" integer NOT NULL,
	"measures" jsonb NOT NULL,
	"real_measures" jsonb NOT NULL,
	"gate_limits" jsonb,
	"gate_passed" boolean NOT NULL,
	"gate_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"accepted" boolean DEFAULT false NOT NULL,
	"results_key" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "half_allowed" CHECK ("eval_runs"."half" in ('tuning', 'gate'))
);
--> statement-breakpoint
ALTER TABLE "eval_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "finding_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"rental_id" uuid NOT NULL,
	"finding_id" uuid NOT NULL,
	"claim_id" uuid,
	"verdict" text NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finding_outcomes_findingId_unique" UNIQUE("finding_id"),
	CONSTRAINT "verdict_allowed" CHECK ("finding_outcomes"."verdict" in ('upheld', 'reduced', 'removed_by_staff', 'removed_after_contest'))
);
--> statement-breakpoint
ALTER TABLE "finding_outcomes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "finding_outcomes" ADD CONSTRAINT "finding_outcomes_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_outcomes" ADD CONSTRAINT "finding_outcomes_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_outcomes" ADD CONSTRAINT "finding_outcomes_finding_id_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."findings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_outcomes" ADD CONSTRAINT "finding_outcomes_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finding_outcomes" ADD CONSTRAINT "finding_outcomes_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "eval_runs_readable" ON "eval_runs" AS PERMISSIVE FOR SELECT TO "hold_app", "hold_eval", "hold_worker" USING (true);--> statement-breakpoint
CREATE POLICY "eval_runs_recorded" ON "eval_runs" AS PERMISSIVE FOR INSERT TO "hold_eval" WITH CHECK (not "eval_runs"."accepted");--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "finding_outcomes" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("finding_outcomes"."shop_id")) WITH CHECK (hold_in_scope("finding_outcomes"."shop_id"));--> statement-breakpoint
-- The services read the scorecard. The evaluation runner records runs and reads them; it may change none, and it
-- reads nothing else. Accepting a run is the owner's act.
GRANT SELECT ON eval_runs TO hold_app, hold_worker;--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO hold_eval;--> statement-breakpoint
GRANT SELECT, INSERT ON eval_runs TO hold_eval;--> statement-breakpoint
-- The field record is append-only: a verdict, once written, is never changed.
GRANT SELECT, INSERT ON finding_outcomes TO hold_app, hold_worker;
