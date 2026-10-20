CREATE TABLE "receipt_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shop_id" uuid NOT NULL,
	"rental_id" uuid NOT NULL,
	"pack_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"renter_id" uuid,
	"language" text NOT NULL,
	"kind" text NOT NULL,
	"amount_cents" bigint NOT NULL,
	"released_cents" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"paypal_reference" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"lease_owner" text,
	"lease_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipt_deliveries_eventId_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "receipt_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "receipt_deliveries" ADD CONSTRAINT "receipt_deliveries_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_deliveries" ADD CONSTRAINT "receipt_deliveries_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_deliveries" ADD CONSTRAINT "receipt_deliveries_pack_id_evidence_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."evidence_packs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_deliveries" ADD CONSTRAINT "receipt_deliveries_event_id_money_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."money_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_deliveries" ADD CONSTRAINT "receipt_deliveries_renter_id_renters_id_fk" FOREIGN KEY ("renter_id") REFERENCES "public"."renters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "shop_isolation" ON "receipt_deliveries" AS PERMISSIVE FOR ALL TO "hold_app", "hold_worker" USING (hold_in_scope("receipt_deliveries"."shop_id")) WITH CHECK (hold_in_scope("receipt_deliveries"."shop_id"));--> statement-breakpoint
GRANT SELECT, INSERT ON receipt_deliveries TO hold_app, hold_worker;--> statement-breakpoint
GRANT UPDATE (status, lease_owner, lease_until, attempts, last_error, sent_at) ON receipt_deliveries TO hold_worker;--> statement-breakpoint
ALTER TABLE receipt_deliveries ADD CONSTRAINT receipt_status CHECK (status IN ('queued','sending','sent','failed'));--> statement-breakpoint
ALTER TABLE receipt_deliveries ADD CONSTRAINT receipt_kind CHECK (kind IN ('capture','release','refund','invoice_sent','invoice_paid'));--> statement-breakpoint
CREATE FUNCTION hold_immutable_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'sent' THEN RAISE EXCEPTION 'Sent receipts are immutable'; END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER receipt_immutable BEFORE UPDATE ON receipt_deliveries FOR EACH ROW EXECUTE FUNCTION hold_immutable_receipt();
