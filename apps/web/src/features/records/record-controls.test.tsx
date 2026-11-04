import { act, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { RecordBuildForm } from './record-controls'
import type { RecordAction } from './record-input'

const refresh = vi.hoisted(() => vi.fn())
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ refresh }) }))
afterEach(() => { vi.useRealTimers(); refresh.mockClear() })

it('refreshes a building record for read-only viewers while hiding document preparation controls', () => {
  vi.useFakeTimers()
  const action: RecordAction = () => Promise.resolve({ ok: true, value: {} })
  renderWithIntl(<RecordBuildForm action={action} rentalId="rental-1" building hasVersions failed={false} settled={[]} canBuild={false} />)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
  act(() => { vi.advanceTimersByTime(2000) })
  expect(refresh).toHaveBeenCalledOnce()
})
