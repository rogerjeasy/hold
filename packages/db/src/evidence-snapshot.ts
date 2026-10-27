import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { evidenceSnapshotSchema } from './evidence-snapshot-schema.ts'
import { readJson } from './read-json.ts'
import { priceLists, rentals, shops, wearPolicies } from './schema/index.ts'
import type { Transaction } from './scope.ts'

// One statement gives the whole document one PostgreSQL snapshot, even at READ COMMITTED.
// Explicit fields keep contacts, raw provider payloads and operational notes out of the shared record.
export async function evidenceSnapshot(transaction: Transaction, rentalId: string) {
  const [row] = await transaction.select({
    schemaVersion: sql<unknown>`1`,
    shop: sql<unknown>`jsonb_build_object('name', ${shops.name}, 'timeZone', ${shops.timeZone})`,
    rental: sql<unknown>`jsonb_build_object('id', ${rentals.id}, 'startsAt', ${rentals.startsAt}, 'endsAt', ${rentals.endsAt}, 'state', ${rentals.state}, 'currency', ${rentals.currency}, 'feeCents', ${rentals.feeCents}, 'holdCents', ${rentals.holdCents}, 'language', ${rentals.language}, 'simulated', ${rentals.simulated}, 'conditionReply', ${rentals.conditionReply}, 'conditionRepliedAt', ${rentals.conditionRepliedAt})`,
    agreement: sql<unknown>`jsonb_build_object('priceListVersion', ${priceLists.version}, 'publishedText', ${priceLists.publishedText}, 'wearPolicyVersion', ${wearPolicies.version}, 'wearRules', ${wearPolicies.rules}, 'prices', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'description', p.description, 'amountCents', p.amount_cents, 'currency', p.currency, 'category', p.category) order by p.position, p.id) from price_entries p where p.price_list_id = ${rentals.priceListId}), '[]'::jsonb))`,
    items: sql<unknown>`coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'label', i.label, 'serial', i.serial, 'accessoriesOut', ri.accessories_out, 'accessoriesBack', ri.accessories_back,
      'sessions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'kind', s.kind, 'sealedAt', s.sealed_at, 'manifest', s.manifest, 'manifestFingerprint', s.manifest_fingerprint, 'previousManifestFingerprint', s.previous_manifest_fingerprint,
        'photos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'view', p.view, 'sha256', p.sha256, 'receivedAt', p.received_at, 'displayKey', coalesce(p.display_key, p.evidence_key), 'supersededAt', p.superseded_at, 'simulated', coalesce((p.quality->>'simulated')::numeric = 1, false)) order by p.view, p.received_at, p.id) from photos p where p.session_id = s.id), '[]'::jsonb)
      ) order by s.sealed_at, s.id) from capture_sessions s where s.rental_item_id = ri.id and s.sealed_at is not null), '[]'::jsonb)
    ) order by ri.id) from rental_items ri join items i on i.id = ri.item_id where ri.rental_id = ${rentals.id}), '[]'::jsonb)`,
    comparisons: sql<unknown>`coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'handoverSessionId', c.handover_session_id, 'returnSessionId', c.return_session_id, 'state', c.state, 'model', c.model, 'promptVersion', c.prompt_version, 'simulated', c.simulated, 'deferredReason', c.deferred_reason,
      'findings', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'view', f.view, 'region', f.region, 'class', f.class, 'confidence', f.confidence, 'description', f.description, 'secondLookConfirmed', f.second_look_confirmed) order by f.id) from findings f where f.comparison_id = c.id), '[]'::jsonb)
    ) order by c.id) from comparisons c join capture_sessions s on s.id = c.return_session_id join rental_items ri on ri.id = s.rental_item_id where ri.rental_id = ${rentals.id}), '[]'::jsonb)`,
    claim: sql<unknown>`(select jsonb_build_object('id', c.id, 'state', c.state, 'totalCents', c.total_cents, 'presentedAt', c.presented_at, 'replyDueAt', c.reply_due_at,
      'lines', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'description', p.description, 'amountCents', l.amount_cents, 'priceEntryId', l.price_entry_id, 'findingId', l.finding_id, 'reason', l.reason, 'actorName', u.name) order by l.created_at, l.id) from claim_lines l join price_entries p on p.id = l.price_entry_id left join users u on u.id = l.added_by_user_id where l.claim_id = c.id), '[]'::jsonb)
    ) from claims c where c.rental_id = ${rentals.id})`,
    approvals: sql<unknown>`coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'subject', a.subject, 'decision', a.decision, 'method', a.method, 'actorName', u.name, 'changes', a.changes, 'createdAt', a.created_at) order by a.created_at, a.id) from approvals a left join users u on u.id = a.decided_by_user_id where (a.subject in ('claim', 'refund') and a.subject_id in (select id from claims where rental_id = ${rentals.id})) or (a.subject = 'release' and a.subject_id in (select id from holds where rental_id = ${rentals.id}))), '[]'::jsonb)`,
    replies: sql<unknown>`coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'decision', r.decision, 'comment', r.comment, 'addedPhotoIds', r.added_photo_ids, 'createdAt', r.created_at) order by r.created_at, r.id) from claim_replies r join claims c on c.id = r.claim_id where c.rental_id = ${rentals.id}), '[]'::jsonb)`,
    payments: sql<unknown>`coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'amountCents', m.amount_cents, 'currency', m.currency, 'paypalReference', m.paypal_reference, 'occurredAt', m.occurred_at) order by m.occurred_at, m.id) from money_events m where m.rental_id = ${rentals.id}), '[]'::jsonb)`,
    invoices: sql<unknown>`coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'paypalInvoiceId', b.paypal_invoice_id, 'state', b.state, 'amountCents', b.amount_cents, 'currency', b.currency) order by b.created_at, b.id) from invoices b where b.rental_id = ${rentals.id}), '[]'::jsonb)`,
    authorizations: sql<unknown>`coalesce((select jsonb_agg(jsonb_build_object('reference', a.paypal_authorization_id, 'state', a.state, 'amountCents', a.amount_cents, 'currency', a.currency, 'createdAt', a.created_at, 'validUntil', a.valid_until) order by a.created_at, a.id) from authorizations a join holds h on h.id = a.hold_id where h.rental_id = ${rentals.id}), '[]'::jsonb)`,
    paypalMode: sql<unknown>`(select mode from paypal_accounts where shop_id = ${rentals.shopId} order by created_at desc, id desc limit 1)`,
    // The advocates' transcript (extensions.md section 9.7): moves, grounds, the records they cite and the chain of
    // fingerprints. Neither side's limits: they stay in the mandates, which the record never reads.
    negotiation: sql<unknown>`(select jsonb_build_object('id', n.id, 'kind', n.kind, 'state', n.state, 'endedReason', n.ended_reason, 'agreedCents', (n.agreed->>'totalCents')::bigint, 'simulated', n.simulated,
      'moves', coalesce((select jsonb_agg(jsonb_build_object('sequence', m.sequence, 'side', m.side, 'kind', m.kind, 'lines', m.lines, 'totalCents', m.total_cents, 'passReason', m.pass_reason, 'actor', m.actor, 'model', m.model, 'promptVersion', m.prompt_version, 'createdAt', m.created_at, 'previousFingerprint', m.previous_fingerprint, 'fingerprint', m.fingerprint) order by m.sequence) from negotiation_moves m where m.negotiation_id = n.id), '[]'::jsonb)
    ) from negotiations n where n.rental_id = ${rentals.id})`,
    measurement: sql<unknown>`(select jsonb_build_object('pipelineVersion', e.pipeline_version, 'dataSetVersion', e.data_set_version, 'completedAt', e.completed_at, 'damageFound', e.measures->'damageFound', 'cleanWronglyFlagged', e.measures->'cleanWronglyFlagged') from eval_runs e where e.half = 'gate' and e.accepted order by e.completed_at desc limit 1)`,
  }).from(rentals).innerJoin(shops, eq(shops.id, rentals.shopId)).innerJoin(priceLists, eq(priceLists.id, rentals.priceListId)).innerJoin(wearPolicies, eq(wearPolicies.id, rentals.wearPolicyId)).where(eq(rentals.id, rentalId))
  if (row === undefined) return undefined
  const { schemaVersion, paypalMode, ...jsonFields } = row
  const decoded: Record<string, unknown> = { schemaVersion, paypalMode }
  for (const [key, value] of Object.entries(jsonFields)) decoded[key] = readJson(z.unknown(), value)
  return evidenceSnapshotSchema.parse(decoded)
}
