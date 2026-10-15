import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SimulatedApproval } from '@/features/simulated-paypal/simulated-approval'
import { getServices } from '@/server/services'

export const metadata: Metadata = { title: 'Simulated PayPal', robots: { index: false, follow: false } }

// Only the test environment has a simulated PayPal. Everywhere else this address does not exist.
export default async function Page({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const links = (await getServices()).simulatedPayPal?.orderLinks(orderId)
  if (links === undefined) notFound()
  return <SimulatedApproval orderId={orderId} amount={links.amount} description={links.description} cancelPath={new URL(links.cancelUrl).pathname} />
}
