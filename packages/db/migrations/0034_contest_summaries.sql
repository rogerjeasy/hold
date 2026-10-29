-- The neutral summary written when a renter contests a claim (architecture.md section 6.15). Append-only: every attempt
-- is kept, and the latest is shown. Nobody may update or delete one.
CREATE TABLE "contest_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"claim_id" uuid NOT NULL,
	"outcome" text NOT NULL,
	"summary" jsonb,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"simulated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outcome_allowed" CHECK ("contest_summaries"."outcome" in ('answered', 'refused', 'unavailable', 'invalid', 'dropped')),
	CONSTRAINT "summary_when_answered" CHECK (("contest_summaries"."outcome" = 'answered') = ("contest_summaries"."summary" is not null))
);
--> statement-breakpoint
ALTER TABLE "contest_summaries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contest_summaries" ADD CONSTRAINT "contest_summaries_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_summaries" ADD CONSTRAINT "contest_summaries_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "contest_summaries" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("contest_summaries"."shop_id")) WITH CHECK (hold_in_scope("contest_summaries"."shop_id"));--> statement-breakpoint
GRANT SELECT, INSERT ON contest_summaries TO hold_app, hold_worker;
