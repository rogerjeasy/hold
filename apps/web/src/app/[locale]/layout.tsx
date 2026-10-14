import type { Metadata } from 'next'
import { Archivo, JetBrains_Mono } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import { SiteFooter } from '@/features/site/site-footer'
import { SiteHeader } from '@/features/site/site-header'
import { SkipLink } from '@/features/site/skip-link'
import { ThemeProvider } from '@/features/site/theme-provider'
import { routing } from '@/i18n/routing'
import '../globals.css'

const archivo = Archivo({ subsets: ['latin', 'latin-ext'], variable: '--font-archivo', display: 'swap' })
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin', 'latin-ext'], variable: '--font-jetbrains-mono', display: 'swap' })

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return {
    title: { default: t('home.title'), template: `%s · ${t('siteName')}` },
    description: t('home.description'),
  }
}

export default async function LocaleLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale()

  return (
    // next-themes sets the theme class on <html> before React hydrates, so the attribute differs on purpose.
    // The scroll attribute lets Next switch smooth scrolling off while it changes page, so a new page opens at its top.
    <html lang={locale} className={`${archivo.variable} ${jetbrainsMono.variable}`} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col">
        <NextIntlClientProvider>
          <ThemeProvider>
            <SkipLink />
            <SiteHeader />
            <main id="main" className="flex-1">
              {children}
            </main>
            <SiteFooter year={new Date().getFullYear()} />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
