import { vi } from 'vitest'

// Next.js navigation needs a running app router. Tests set the current path here instead.
export const navigation = { pathname: '/' }

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({}),
  useSelectedLayoutSegment: () => null,
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
  notFound: vi.fn(),
}))
