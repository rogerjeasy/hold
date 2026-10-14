import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { navigation } from '@/test/navigation'
import { renderWithIntl } from '@/test/render'
import { LanguageSwitcher } from './language-switcher'

describe('LanguageSwitcher', () => {
  it('shows the current language on the button', () => {
    renderWithIntl(<LanguageSwitcher />)
    expect(screen.getByRole('button', { name: 'Language' })).toHaveTextContent('EN')
  })

  it('lists the four languages by their own names', async () => {
    renderWithIntl(<LanguageSwitcher />)
    await userEvent.click(screen.getByRole('button', { name: 'Language' }))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'English',
      'Español',
      'Français',
      'Deutsch',
    ])
  })

  it('links each language to the same page in that language', async () => {
    navigation.pathname = '/for-shops'
    renderWithIntl(<LanguageSwitcher />)
    await userEvent.click(screen.getByRole('button', { name: 'Language' }))
    expect(screen.getByRole('menuitem', { name: 'Deutsch' })).toHaveAttribute('href', '/de/for-shops')
    // The prefix is written even for the default language, so the proxy can record the choice before it redirects to the bare path.
    expect(screen.getByRole('menuitem', { name: 'English' })).toHaveAttribute('href', '/en/for-shops')
  })

  it('marks the language in use', async () => {
    navigation.pathname = '/fr/ai'
    renderWithIntl(<LanguageSwitcher />, { locale: 'fr' })
    await userEvent.click(screen.getByRole('button', { name: 'Language' }))
    expect(screen.getByRole('menuitem', { name: 'Français' })).toHaveAttribute('aria-current', 'true')
  })
})
