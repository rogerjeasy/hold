// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

// The services are the only way to the database. A health check must never reach them: the database pauses when idle
// and takes a while to resume, and App Runner would replace a healthy server that waited on it.
const getServices = vi.fn(() => Promise.reject(new Error('The health check reached the services.')))
vi.mock('@/server/services', () => ({ getServices }))

const { GET } = await import('./route')

describe('the health check', () => {
  it('answers that the server is up, without reaching the services or the database', async () => {
    const response = GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
    expect(getServices).not.toHaveBeenCalled()
  })

  it('is never cached, so each check reaches the running server', () => {
    expect(GET().headers.get('cache-control')).toBe('no-store')
  })
})
