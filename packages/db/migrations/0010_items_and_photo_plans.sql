-- Item types gain a category, a day rate and a kit; items gain a size and a status. Rows written before this are
-- the demonstration's sample rows, the only way an item could be made until now: they are marked simulated and
-- given the category and day rate of their sample type, before the unique names below are enforced.
ALTER TABLE "item_types" ADD COLUMN "category" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "item_types" ADD COLUMN "day_rate_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "item_types" ADD COLUMN "accessories" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "item_types" ADD COLUMN "simulated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "size" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "status" text DEFAULT 'in_service' NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "status_note" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "status_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "simulated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "item_types" SET "simulated" = true,
  "category" = CASE "name" WHEN 'E-bike' THEN 'e_bike' WHEN 'E-mountain bike' THEN 'e_bike' WHEN 'Tandem kayak' THEN 'water' WHEN 'Hybrid bike' THEN 'bike' WHEN 'Gravel bike' THEN 'bike' ELSE 'other' END,
  "day_rate_cents" = CASE "name" WHEN 'Hybrid bike' THEN 2500 WHEN 'E-bike' THEN 4500 WHEN 'Tandem kayak' THEN 6000 WHEN 'Gravel bike' THEN 3500 WHEN 'Child seat' THEN 800 WHEN 'E-mountain bike' THEN 7000 ELSE 100 END;--> statement-breakpoint
UPDATE "items" SET "simulated" = true;--> statement-breakpoint
ALTER TABLE "item_types" ALTER COLUMN "category" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "item_types" ALTER COLUMN "day_rate_cents" DROP DEFAULT;--> statement-breakpoint
-- No capture session exists yet: the handover that writes them is built after this.
ALTER TABLE "capture_sessions" ADD COLUMN "photo_plan_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "capture_sessions" ADD CONSTRAINT "capture_sessions_photo_plan_id_photo_plans_id_fk" FOREIGN KEY ("photo_plan_id") REFERENCES "public"."photo_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_types_shop_name_unique" ON "item_types" USING btree ("shop_id",lower("name")) WHERE not "item_types"."simulated";--> statement-breakpoint
CREATE UNIQUE INDEX "items_shop_label_unique" ON "items" USING btree ("shop_id",lower("label")) WHERE not "items"."simulated";--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN "retired_at";--> statement-breakpoint
ALTER TABLE "item_types" ADD CONSTRAINT "category_allowed" CHECK ("item_types"."category" in ('bike', 'e_bike', 'scooter', 'water', 'snow', 'camera', 'camping', 'event', 'tool', 'other'));--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "status_allowed" CHECK ("items"."status" in ('in_service', 'in_repair', 'retired'));--> statement-breakpoint
-- A photo plan is never changed once saved. An edit saves a new plan, so a capture session keeps the one it used.
REVOKE UPDATE ON "photo_plans" FROM hold_app, hold_worker;
