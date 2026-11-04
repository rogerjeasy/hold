// App Runner's health check (infra/lib/web-stack.ts): an answer proves the server is up and serving. It reads nothing
// from the request, changes nothing and reaches no service, the database least of all: Aurora may pause when idle, and
// a check that waited for it to resume would see a healthy server as failing. Under /api, which the language proxy
// leaves alone.
export function GET(): Response {
  return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } })
}
