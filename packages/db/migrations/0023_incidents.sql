CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"rental_id" uuid NOT NULL,
	"rental_item_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"hint" text NOT NULL,
	"description" text NOT NULL,
	"language" text NOT NULL,
	"state" text DEFAULT 'reported' NOT NULL,
	"kind" text,
	"safety" boolean DEFAULT false NOT NULL,
	"triage_outcome" text,
	"triage" jsonb,
	"model" text,
	"prompt_version" text,
	"simulated" boolean DEFAULT false NOT NULL,
	"confirmation" text,
	"currency" char(3) NOT NULL,
	"suggested_price_entry_id" uuid,
	"offered_price_entry_id" uuid,
	"offer_confirmed_by_user_id" uuid,
	"offer_confirmed_at" timestamp with time zone,
	"agreed_price_entry_id" uuid,
	"agreed_cents" bigint,
	"agreed_at" timestamp with time zone,
	"theft_details" jsonb,
	"staff_alerted_at" timestamp with time zone,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"sorted_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "incidents_sessionId_unique" UNIQUE("session_id"),
	CONSTRAINT "hint_allowed" CHECK ("incidents"."hint" in ('damage', 'fault', 'gone', 'unsafe', 'not_sure')),
	CONSTRAINT "kind_allowed" CHECK ("incidents"."kind" in ('small_damage', 'mechanical_fault', 'theft_or_loss', 'unsafe_or_unclear')),
	CONSTRAINT "state_allowed" CHECK ("incidents"."state" in ('reported', 'triaged', 'agreed', 'shop_matter', 'awaiting_staff', 'claim_opened', 'resolved', 'withdrawn')),
	CONSTRAINT "triageOutcome_allowed" CHECK ("incidents"."triage_outcome" in ('answered', 'refused', 'unavailable', 'invalid'))
);
--> statement-breakpoint
ALTER TABLE "incidents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "claim_lines" DROP CONSTRAINT "source_allowed";--> statement-breakpoint
ALTER TABLE "capture_sessions" DROP CONSTRAINT "kind_allowed";--> statement-breakpoint
ALTER TABLE "findings" DROP CONSTRAINT "class_allowed";--> statement-breakpoint
ALTER TABLE "marks" DROP CONSTRAINT "status_allowed";--> statement-breakpoint
ALTER TABLE "claim_lines" ADD COLUMN "incident_id" uuid;--> statement-breakpoint
ALTER TABLE "marks" ADD COLUMN "incident_id" uuid;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_rental_item_id_rental_items_id_fk" FOREIGN KEY ("rental_item_id") REFERENCES "public"."rental_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_session_id_capture_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."capture_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_suggested_price_entry_id_price_entries_id_fk" FOREIGN KEY ("suggested_price_entry_id") REFERENCES "public"."price_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_offered_price_entry_id_price_entries_id_fk" FOREIGN KEY ("offered_price_entry_id") REFERENCES "public"."price_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_offer_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("offer_confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_agreed_price_entry_id_price_entries_id_fk" FOREIGN KEY ("agreed_price_entry_id") REFERENCES "public"."price_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_lines" ADD CONSTRAINT "claim_lines_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "marks_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_lines" ADD CONSTRAINT "source_allowed" CHECK ("claim_lines"."source" in ('finding', 'person', 'agreed_in_rental'));--> statement-breakpoint
ALTER TABLE "capture_sessions" ADD CONSTRAINT "kind_allowed" CHECK ("capture_sessions"."kind" in ('handover', 'return', 'packing', 'unboxing', 'send_back', 'condition', 'incident'));--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "class_allowed" CHECK ("findings"."class" in ('new_damage', 'known_mark', 'wear', 'missing_part', 'uncertain', 'reported'));--> statement-breakpoint
ALTER TABLE "marks" ADD CONSTRAINT "status_allowed" CHECK ("marks"."status" in ('open', 'repaired', 'reported'));--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "incidents" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("incidents"."shop_id")) WITH CHECK (hold_in_scope("incidents"."shop_id"));--> statement-breakpoint
-- hand-written below
-- The incident desk (extensions.md section 10). The services may read, add and move incidents, never delete one. The
-- renter's words, the rental and item, the photographs and when it was reported are evidence and never change.
GRANT SELECT, INSERT ON incidents TO hold_app, hold_worker;--> statement-breakpoint
GRANT UPDATE (state, kind, safety, triage_outcome, triage, model, prompt_version, simulated, confirmation, suggested_price_entry_id, offered_price_entry_id, offer_confirmed_by_user_id, offer_confirmed_at, agreed_price_entry_id, agreed_cents, agreed_at, theft_details, staff_alerted_at, sent_at, sorted_at, resolved_at) ON incidents TO hold_app, hold_worker;--> statement-breakpoint
-- A price the renter may agree to is one a named staff member confirmed, never the model's suggestion alone.
ALTER TABLE incidents ADD CONSTRAINT incidents_confirmed_offer CHECK ((offered_price_entry_id IS NULL) = (offer_confirmed_by_user_id IS NULL) AND (offered_price_entry_id IS NULL) = (offer_confirmed_at IS NULL));--> statement-breakpoint
-- An agreed line is a confirmed entry, its positive amount and the time, together.
ALTER TABLE incidents ADD CONSTRAINT incidents_agreed_line CHECK ((agreed_cents IS NULL) = (agreed_price_entry_id IS NULL) AND (agreed_cents IS NULL) = (agreed_at IS NULL) AND (agreed_cents IS NULL OR agreed_cents > 0) AND (agreed_price_entry_id IS NULL OR agreed_price_entry_id = offered_price_entry_id));--> statement-breakpoint
-- A line agreed during the rental names its incident, and no other line does.
ALTER TABLE claim_lines ADD CONSTRAINT claim_lines_agreed_incident CHECK ((source = 'agreed_in_rental') = (incident_id IS NOT NULL));--> statement-breakpoint
-- The incident's state machine (domain incident.ts), again in the database: no move that is not listed, and neither a
-- confirmed price, the renter's account of a theft, nor an agreed line changes once set.
CREATE FUNCTION hold_incident_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.state <> OLD.state AND (OLD.state, NEW.state) NOT IN (
    ('reported', 'triaged'), ('reported', 'withdrawn'),
    ('triaged', 'agreed'), ('triaged', 'shop_matter'), ('triaged', 'awaiting_staff'), ('triaged', 'withdrawn'),
    ('awaiting_staff', 'agreed'), ('awaiting_staff', 'shop_matter'), ('awaiting_staff', 'claim_opened'),
    ('agreed', 'resolved'), ('shop_matter', 'resolved'), ('claim_opened', 'resolved')
  ) THEN
    RAISE EXCEPTION 'An incident cannot move from % to %', OLD.state, NEW.state;
  END IF;
  IF OLD.offered_price_entry_id IS NOT NULL AND (NEW.offered_price_entry_id IS DISTINCT FROM OLD.offered_price_entry_id OR NEW.offer_confirmed_by_user_id IS DISTINCT FROM OLD.offer_confirmed_by_user_id OR NEW.offer_confirmed_at IS DISTINCT FROM OLD.offer_confirmed_at) THEN
    RAISE EXCEPTION 'A confirmed price never changes';
  END IF;
  IF OLD.sent_at IS NOT NULL AND NEW.sent_at IS DISTINCT FROM OLD.sent_at THEN
    RAISE EXCEPTION 'A sent report is never unsent';
  END IF;
  -- The renter's account of a theft is given once; only a missing police report number may be added, once.
  IF OLD.theft_details IS NOT NULL AND NEW.theft_details IS DISTINCT FROM OLD.theft_details AND NOT (
    NEW.theft_details IS NOT NULL AND (NEW.theft_details - 'policeReport') = (OLD.theft_details - 'policeReport')
    AND OLD.theft_details ->> 'policeReport' = '' AND coalesce(NEW.theft_details ->> 'policeReport', '') <> ''
  ) THEN
    RAISE EXCEPTION 'Theft details are never rewritten';
  END IF;
  IF OLD.agreed_cents IS NOT NULL AND (NEW.agreed_cents IS DISTINCT FROM OLD.agreed_cents OR NEW.agreed_price_entry_id IS DISTINCT FROM OLD.agreed_price_entry_id OR NEW.agreed_at IS DISTINCT FROM OLD.agreed_at) THEN
    RAISE EXCEPTION 'An agreed line never changes';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER incident_guard BEFORE UPDATE ON incidents FOR EACH ROW EXECUTE FUNCTION hold_incident_guard();
