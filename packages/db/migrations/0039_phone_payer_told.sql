-- When the email PayPal gave was told which number a renter's texts go to (architecture.md section 12.3): a number
-- confirmed before anyone paid is told as soon as PayPal names the payer.
ALTER TABLE "rentals" ADD COLUMN "phone_payer_told_at" timestamp with time zone;