ALTER TABLE "renter_links" ALTER COLUMN "scopes" SET DATA TYPE jsonb USING to_jsonb("scopes");
