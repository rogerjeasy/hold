import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLazyMailer } from './lazy-mailer.ts'
import { createMemoryMailer } from './mailer.ts'

const EMAIL = { to: 'ana@lisboa.example', subject: 'You are invited', text: 'Open the link.' }

describe('a mailer made on its first message', () => {
  afterEach(() => vi.restoreAllMocks())

  it('makes the mailer once, and sends every message through it', async () => {
    const inner = createMemoryMailer()
    const make = vi.fn(() => Promise.resolve(inner))
    const mailer = createLazyMailer(make)

    expect(make).not.toHaveBeenCalled()
    await mailer.send(EMAIL)
    await mailer.send(EMAIL)

    expect(make).toHaveBeenCalledTimes(1)
    expect(inner.sent).toHaveLength(2)
  })

  it('reports a message as unsent when the mailer cannot be made, and tries again for the next one', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const inner = createMemoryMailer()
    const make = vi.fn().mockRejectedValueOnce(new Error('secret unreadable')).mockResolvedValue(inner)
    const mailer = createLazyMailer(make)

    expect(await mailer.send(EMAIL)).toBe(false)
    expect(await mailer.send(EMAIL)).toBe(true)
    expect(inner.sent).toHaveLength(1)
  })
})
