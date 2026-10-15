import { notFound } from 'next/navigation'

// Any address without a page lands here, so the not-found page keeps the reader's language and the site frame.
export default function UnknownPage() {
  notFound()
}
