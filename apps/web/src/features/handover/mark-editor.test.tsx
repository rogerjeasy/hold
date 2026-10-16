import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/render'
import { MarkEditor } from './mark-editor'

const addHandoverMark = vi.fn()
const confirmKnownMarks = vi.fn()
const refresh = vi.fn()
vi.mock('./actions', () => ({ addHandoverMark: (...args: unknown[]) => addHandoverMark(...args) as unknown, confirmKnownMarks: (...args: unknown[]) => confirmKnownMarks(...args) as unknown }))
vi.mock('@/i18n/navigation', async (original) => ({ ...(await original<object>()), useRouter: () => ({ refresh, push: vi.fn() }) }))

const known = { id: 'mark-1', view: 'left-side', region: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, description: 'Dent in the mudguard', confirmed: false, new: false }

describe('marks on a view', () => {
  it('shows the item’s known marks on the photograph, for staff to confirm they are still there', async () => {
    confirmKnownMarks.mockResolvedValue({ ok: true, value: {} })
    renderWithIntl(<MarkEditor sessionId="session-1" view="left-side" photoUrl="/photo.jpg" marks={[known]} />)
    expect(screen.getByText('Dent in the mudguard')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Still there: Dent in the mudguard' }))
    await waitFor(() => {
      expect(confirmKnownMarks).toHaveBeenCalled()
    })
    expect((confirmKnownMarks.mock.calls[0]?.[1] as FormData).getAll('markId')).toEqual(['mark-1'])
  })

  it('places a new box by keyboard, moves and sizes it with the arrows, and saves it with a description', async () => {
    addHandoverMark.mockResolvedValue({ ok: true, value: { markId: 'mark-2' } })
    renderWithIntl(<MarkEditor sessionId="session-1" view="left-side" photoUrl="/photo.jpg" marks={[]} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add a mark' }))
    const box = screen.getByRole('slider', { name: "The new mark's box" })
    box.focus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{Shift>}{ArrowDown}{/Shift}')
    await userEvent.type(screen.getByLabelText('What is the mark?'), 'Scratch on the top tube')
    await userEvent.click(screen.getByRole('button', { name: 'Save the mark' }))
    await waitFor(() => {
      expect(addHandoverMark).toHaveBeenCalled()
    })
    const sent = addHandoverMark.mock.calls[0]?.[1] as FormData
    expect([sent.get('x'), sent.get('y'), sent.get('width'), sent.get('height'), sent.get('description')]).toEqual(['0.42', '0.4', '0.2', '0.21', 'Scratch on the top tube'])
  })
})
