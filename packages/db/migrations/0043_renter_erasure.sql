ALTER TABLE "rentals" ADD COLUMN "renter_erased_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rentals" ADD CONSTRAINT "erased_only_when_ended" CHECK ("rentals"."renter_erased_at" is null or "rentals"."state" in ('closed', 'cancelled', 'abandoned'));--> statement-breakpoint
ALTER POLICY "renter_of_shop" ON "renters" TO hold_app,hold_worker USING (exists (select 1 from rentals where rentals.renter_id = "renters"."id" and rentals.renter_erased_at is null));--> statement-breakpoint
-- hand-written below
-- Erasing a renter's personal details on their request (architecture.md section 15.2). hold_app already updates
-- rentals, where the shop's own copies of them are. It gains only the two columns of a text that hold a number or
-- words. The renter's PayPal name and email, shared by every shop that rented to them, change only through
-- hold_erase_renter_identity below. '[erased]' is ERASED in packages/domain.
GRANT UPDATE (to_phone, body) ON text_messages TO hold_app;
--> statement-breakpoint

-- Once erased, a rental's personal details, its renter and the moment stay as they are: erasure cannot be undone.
CREATE FUNCTION hold_keep_rental_erasure() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.renter_erased_at IS NOT NULL AND (
    NEW.renter_erased_at IS DISTINCT FROM OLD.renter_erased_at
    OR NEW.renter_id IS DISTINCT FROM OLD.renter_id
    OR NEW.contact_name IS DISTINCT FROM OLD.contact_name
    OR NEW.contact_email IS DISTINCT FROM OLD.contact_email
    OR NEW.contact_phone IS DISTINCT FROM OLD.contact_phone
    OR NEW.contact_channel IS DISTINCT FROM OLD.contact_channel
    OR NEW.phone_code_hash IS DISTINCT FROM OLD.phone_code_hash
  ) THEN
    RAISE EXCEPTION 'An erased rental''s personal details cannot change.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER rentals_keep_erasure BEFORE UPDATE ON rentals FOR EACH ROW EXECUTE FUNCTION hold_keep_rental_erasure();
--> statement-breakpoint

-- A text's number and words may change only to the marker, so the grant above cannot rewrite who was texted.
CREATE FUNCTION hold_keep_text_record() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF (NEW.to_phone IS DISTINCT FROM OLD.to_phone AND NEW.to_phone <> '[erased]')
    OR (NEW.body IS DISTINCT FROM OLD.body AND NEW.body IS DISTINCT FROM '[erased]') THEN
    RAISE EXCEPTION 'A text''s number and words change only when they are erased.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE TRIGGER text_messages_keep_record BEFORE UPDATE ON text_messages FOR EACH ROW EXECUTE FUNCTION hold_keep_text_record();
--> statement-breakpoint

-- Replaces the renter's PayPal name and email once the asking shop has erased its own rentals of theirs and no shop
-- holds a rental of theirs it has not erased. Until then another shop still needs them, and the asking shop already no
-- longer sees them (the renter_of_shop policy). It answers nothing, so a shop learns nothing of other shops. PayPal
-- gives them again if the renter pays a shop later.
CREATE FUNCTION hold_erase_renter_identity(renter uuid) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE renters SET email = '[erased]', name = '[erased]'
  WHERE renters.id = renter
    AND EXISTS (SELECT 1 FROM rentals WHERE rentals.renter_id = renter AND hold_in_scope(rentals.shop_id) AND rentals.renter_erased_at IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM rentals WHERE rentals.renter_id = renter AND rentals.renter_erased_at IS NULL)
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_erase_renter_identity(uuid) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_erase_renter_identity(uuid) TO hold_app;
