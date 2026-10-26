import { credentialKeys } from '@/server/clean-record'

// The public key Clean Record credentials are signed with, as a JSON Web Key Set, so anyone can check a credential
// without asking Hold (extensions.md section 7.7). It reads nothing from the request and changes nothing.
export async function GET(): Promise<Response> {
  const keys = await credentialKeys()
  if (keys.length === 0) return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  return Response.json({ keys }, { headers: { 'Cache-Control': 'public, max-age=300' } })
}
