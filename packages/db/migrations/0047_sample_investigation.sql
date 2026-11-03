-- A demo shop's sample entries on the morning queue, investigated by the operations agent when the owner asks
-- (extensions.md section 6.14). The worker may not rewrite a proposal's words (0022); this function lets it rewrite only
-- a sample's, still waiting, in the shop the transaction is scoped to, and marks it investigated with PayPal's facts
-- simulated, since a sample's PayPal references were never on PayPal. Written by hand, not by drizzle-kit, so that it
-- can be renumbered in order at merge.
CREATE FUNCTION hold_record_sample_investigation(entry uuid, new_reason text, new_references jsonb, new_draft text, new_model text, new_prompt_version text, new_run_id uuid, at timestamptz)
RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH changed AS (
    UPDATE proposals SET
      reason = new_reason,
      "references" = new_references,
      draft = new_draft,
      model = new_model,
      prompt_version = new_prompt_version,
      run_id = new_run_id,
      payload = (proposals.payload - 'fixedReason' - 'investigated' - 'paypalChecked') || '{"investigated":"yes","paypalChecked":"simulated"}'::jsonb,
      updated_at = at
    WHERE proposals.id = entry
      AND proposals.state = 'pending'
      AND proposals.payload->>'simulated' = 'yes'
      AND proposals.shop_id = nullif(current_setting('hold.shop_id', true), '')::uuid
    RETURNING proposals.id
  )
  SELECT count(*) = 1 FROM changed
$$;--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION hold_record_sample_investigation(uuid, text, jsonb, text, text, text, uuid, timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION hold_record_sample_investigation(uuid, text, jsonb, text, text, text, uuid, timestamptz) TO hold_worker;
