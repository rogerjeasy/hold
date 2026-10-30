-- Repair closes the loop (architecture.md section 9.6): repairs, what each covers, the repair session kind, and the
-- repair that closed a mark. A repair done is never changed, and a line's outcome is written once.
CREATE TABLE "repair_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"repair_id" uuid NOT NULL,
	"mark_id" uuid,
	"claim_line_id" uuid,
	"description" text NOT NULL,
	"claimed_cents" bigint,
	"outcome" text,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outcome_allowed" CHECK ("repair_lines"."outcome" is null or "repair_lines"."outcome" in ('repaired', 'left'))
);
--> statement-breakpoint
ALTER TABLE "repair_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "repairs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"claim_id" uuid,
	"rental_item_id" uuid NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"session_id" uuid,
	"currency" char(3) NOT NULL,
	"cost_cents" bigint,
	"note" text,
	"opened_by_user_id" uuid,
	"closed_by_user_id" uuid,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "state_allowed" CHECK ("repairs"."state" in ('open', 'done')),
	CONSTRAINT "done_is_costed" CHECK (("repairs"."state" = 'done') = ("repairs"."closed_at" is not null and "repairs"."cost_cents" is not null and "repairs"."closed_by_user_id" is not null)),
	CONSTRAINT "cost_not_negative" CHECK ("repairs"."cost_cents" is null or "repairs"."cost_cents" >= 0)
);
--> statement-breakpoint
ALTER TABLE "repairs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "capture_sessions" DROP CONSTRAINT "kind_allowed";--> statement-breakpoint
ALTER TABLE "marks" ADD COLUMN "repair_id" uuid;--> statement-breakpoint
ALTER TABLE "repair_lines" ADD CONSTRAINT "repair_lines_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_lines" ADD CONSTRAINT "repair_lines_repair_id_repairs_id_fk" FOREIGN KEY ("repair_id") REFERENCES "public"."repairs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_lines" ADD CONSTRAINT "repair_lines_mark_id_marks_id_fk" FOREIGN KEY ("mark_id") REFERENCES "public"."marks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repair_lines" ADD CONSTRAINT "repair_lines_claim_line_id_claim_lines_id_fk" FOREIGN KEY ("claim_line_id") REFERENCES "public"."claim_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repairs" ADD CONSTRAINT "repairs_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repairs" ADD CONSTRAINT "repairs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repairs" ADD CONSTRAINT "repairs_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repairs" ADD CONSTRAINT "repairs_rental_item_id_rental_items_id_fk" FOREIGN KEY ("rental_item_id") REFERENCES "public"."rental_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repairs" ADD CONSTRAINT "repairs_session_id_capture_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."capture_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repairs" ADD CONSTRAINT "repairs_opened_by_user_id_users_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repairs" ADD CONSTRAINT "repairs_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "repairs_claim_item" ON "repairs" USING btree ("claim_id","item_id") WHERE "repairs"."claim_id" is not null;--> statement-breakpoint
ALTER TABLE "capture_sessions" ADD CONSTRAINT "kind_allowed" CHECK ("capture_sessions"."kind" in ('handover', 'return', 'packing', 'unboxing', 'send_back', 'condition', 'incident', 'repair'));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "repair_lines" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("repair_lines"."shop_id")) WITH CHECK (hold_in_scope("repair_lines"."shop_id"));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "repairs" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("repairs"."shop_id")) WITH CHECK (hold_in_scope("repairs"."shop_id"));--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_repair_id_repairs_id_fk" FOREIGN KEY ("repair_id") REFERENCES "public"."repairs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "repaired_by_a_repair" CHECK (("status" = 'repaired') = ("repair_id" is not null));--> statement-breakpoint
GRANT SELECT, INSERT ON repairs, repair_lines TO hold_app, hold_worker;--> statement-breakpoint
GRANT UPDATE (state, session_id, cost_cents, note, closed_by_user_id, closed_at) ON repairs TO hold_app;--> statement-breakpoint
GRANT UPDATE (outcome) ON repair_lines TO hold_app;--> statement-breakpoint
CREATE FUNCTION hold_repair_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.state = 'done' THEN
    RAISE EXCEPTION 'A repair done is never changed.';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER repair_guard BEFORE UPDATE ON repairs FOR EACH ROW EXECUTE FUNCTION hold_repair_guard();--> statement-breakpoint
CREATE FUNCTION hold_repair_line_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.outcome IS NOT NULL THEN
    RAISE EXCEPTION 'A repair line''s outcome is written once.';
  END IF;
  RETURN NEW;
END $$;--> statement-breakpoint
CREATE TRIGGER repair_line_guard BEFORE UPDATE ON repair_lines FOR EACH ROW EXECUTE FUNCTION hold_repair_line_guard();
