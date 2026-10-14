ALTER TABLE "shops" ALTER COLUMN "currency" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shops" ALTER COLUMN "owner_approval_threshold_cents" DROP NOT NULL;--> statement-breakpoint
DROP POLICY "sign_up" ON "users" CASCADE;