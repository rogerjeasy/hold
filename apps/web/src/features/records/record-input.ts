export type RecordActionResult =
  | { readonly ok: true; readonly value: { readonly packId?: string; readonly url?: string; readonly filename?: string } }
  | { readonly ok: false; readonly failure: string; readonly reason?: string }

export type RecordAction = (previous: unknown, data: FormData) => Promise<RecordActionResult>
