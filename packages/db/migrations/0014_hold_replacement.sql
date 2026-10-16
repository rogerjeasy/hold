-- Replacing a hold before it ends: the order the renter is asked to approve, and which authorization a replacement
-- took over from (architecture.md section 7.4).
ALTER TABLE "authorizations" ADD COLUMN "replaces_id" uuid;--> statement-breakpoint
ALTER TABLE "holds" ADD COLUMN "replacement_order_id" text;--> statement-breakpoint
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_replaces_id_authorizations_id_fk" FOREIGN KEY ("replaces_id") REFERENCES "public"."authorizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holds" ADD CONSTRAINT "holds_replacementOrderId_unique" UNIQUE("replacement_order_id");