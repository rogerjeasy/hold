// An expected failure is a value the caller must handle, not an exception.
export type Result<Value, Failure> =
  | { readonly ok: true; readonly value: Value }
  | { readonly ok: false; readonly error: Failure }

export function ok<Value>(value: Value): { readonly ok: true; readonly value: Value } {
  return { ok: true, value }
}

export function fail<Failure>(error: Failure): { readonly ok: false; readonly error: Failure } {
  return { ok: false, error }
}
