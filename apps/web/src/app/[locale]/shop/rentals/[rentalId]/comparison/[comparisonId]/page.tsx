import { acceptedEvalRun, comparisonReport, inShop } from '@hold/db'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ComparisonScreen } from '@/features/returns/comparison-screen'
import { reviewNote } from '@/features/returns/review-input'
import { getServices } from '@/server/services'
import { requireShop } from '@/server/shop-page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('shop.comparison')
  return { title: t('title'), robots: { index: false, follow: false } }
}

export default async function Page({ params }: { params: Promise<{ rentalId: string; comparisonId: string }> }) {
  const { rentalId, comparisonId } = await params
  const context = await requireShop()
  const { database, evidence } = await getServices()
  const { report, run } = await inShop(database, { role: 'hold_app', shopId: context.shop.id, userId: context.person.userId }, async (transaction) => ({ report: await comparisonReport(transaction, comparisonId), run: await acceptedEvalRun(transaction) }))
  if (report === undefined || report.rentalId !== rentalId) notFound()
  const display = async (photo: { view: string; displayKey: string | null }) => ({ view: photo.view, url: photo.displayKey === null || evidence === undefined ? null : await evidence.displayLink(photo.displayKey) })
  const reviews = report.reviews.map((review) => ({ actorName: review.actorName, ...reviewNote.parse(review.detail) }))
  return <ComparisonScreen shopName={context.shop.name} report={{ ...report, reviews, before: await Promise.all(report.before.map(display)), after: await Promise.all(report.after.map(display)) }} canAct={context.role !== 'read_only'} calibration={run?.measures.confidence} />
}
