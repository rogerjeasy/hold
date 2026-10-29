import type { EvidenceSnapshot } from '@hold/db'
import { DROP_POINT_VIEW } from '@hold/domain'
import { EvidenceRenderError } from './evidence-manifest.ts'
import type { EvidenceDocument } from './evidence-document-layout.ts'

type Session = EvidenceSnapshot['items'][number]['sessions'][number]
type Photo = Session['photos'][number]

function panel(context: EvidenceDocument, photo: Photo | undefined, photos: ReadonlyMap<string, Buffer>, x: number, y: number, width: number, regions: EvidenceSnapshot['comparisons'][number]['findings']) {
  const { doc } = context
  const height = width * 0.75
  doc.save().rect(x, y, width, height).lineWidth(0.5).strokeColor('#8190a0').stroke()
  if (photo === undefined) {
    doc.fontSize(10).text(context.label('missing'), x + 8, y + 16, { width: width - 16 })
  } else {
    const bytes = photos.get(photo.id)
    if (bytes === undefined) throw new EvidenceRenderError('missing_display_photo', photo.id)
    // PDFKit exposes openImage; its separately maintained type definitions omit this method.
    const imageDocument = doc as PDFKit.PDFDocument & { openImage(source: Buffer): { width: number; height: number } }
    let image: { width: number; height: number }
    try { image = imageDocument.openImage(bytes) } catch { throw new EvidenceRenderError('invalid_display_photo', photo.id) }
    const scale = Math.min(width / image.width, height / image.height)
    const imageWidth = image.width * scale
    const imageHeight = image.height * scale
    const left = x + (width - imageWidth) / 2
    const top = y + (height - imageHeight) / 2
    doc.image(bytes, left, top, { width: imageWidth, height: imageHeight })
    for (const finding of regions) {
      const region = finding.region
      doc.rect(left + region.x * imageWidth, top + region.y * imageHeight, Math.min(region.width, 1 - region.x) * imageWidth, Math.min(region.height, 1 - region.y) * imageHeight).lineWidth(2).strokeColor('#b93722').stroke()
    }
  }
  doc.restore()
}

export function renderItemPhotos(context: EvidenceDocument, snapshot: EvidenceSnapshot, photos: ReadonlyMap<string, Buffer>) {
  context.heading(context.label('evidence'))
  context.line('condition', snapshot.rental.conditionReply)
  if (snapshot.rental.conditionRepliedAt) context.line('received', snapshot.rental.conditionRepliedAt)
  if (snapshot.items.length === 0) context.paragraph(context.label('missing'))
  for (const item of snapshot.items) {
    context.line('item', `${item.label} (${item.id})`)
    context.line('serial', item.serial)
    context.line('out', item.accessoriesOut.map((value) => `${value.name}: ${String(value.count)}`).join('; '))
    context.line('back', item.accessoriesBack?.map((value) => `${value.name}: ${String(value.count)}`).join('; '))
    for (const session of item.sessions) {
      context.line('session', `${session.kind} ${session.id}`)
      context.line('sealed', session.sealedAt)
    }
    const comparisons = snapshot.comparisons.filter((value) => item.sessions.some((session) => session.id === value.handoverSessionId || session.id === value.returnSessionId))
    const handovers = item.sessions.filter((session) => session.kind === 'handover')
    const returns = item.sessions.filter((session) => session.kind === 'return')
    const pairs = comparisons.length > 0 ? comparisons.map((comparison) => ({ handover: item.sessions.find((session) => session.id === comparison.handoverSessionId), returned: item.sessions.find((session) => session.id === comparison.returnSessionId), findings: comparison.findings })) : [{ handover: handovers.at(-1), returned: returns.at(-1), findings: [] }]
    const shown = new Set<string>()
    for (const pair of pairs) {
      // Where a renter left the item has no handover twin; it is shown on its own below (architecture.md section 6.13).
      const views = new Set([...(pair.handover?.photos ?? []), ...(pair.returned?.photos ?? [])].filter((photo) => photo.supersededAt === null && photo.view !== DROP_POINT_VIEW).map((photo) => photo.view))
      for (const view of views) {
        const before = pair.handover?.photos.find((photo) => photo.view === view && photo.supersededAt === null)
        const after = pair.returned?.photos.find((photo) => photo.view === view && photo.supersededAt === null)
        pairRow(context, `${item.label} (${item.id})`, view, before, after, photos, pair.findings.filter((finding) => finding.view === view))
        for (const photo of [before, after]) if (photo) shown.add(photo.id)
      }
    }
    for (const session of item.sessions) for (const photo of session.photos.filter((photo) => !shown.has(photo.id))) {
      context.room(240)
      context.line('session', photo.view === DROP_POINT_VIEW ? `${session.kind} / ${context.label('dropPoint')}` : `${session.kind} / ${photo.view}`)
      const top = context.doc.y
      panel(context, photo, photos, context.margin, top, (context.width - 14) / 2, [])
      context.doc.y = top + (context.width - 14) / 2 * 0.75 + 10
      context.line('received', photo.receivedAt)
      if (photo.supersededAt) context.line('superseded', photo.supersededAt)
    }
    if (item.sessions.length === 0) context.paragraph(context.label('missing'))
  }
}

function pairRow(context: EvidenceDocument, item: string, view: string, before: Photo | undefined, after: Photo | undefined, photos: ReadonlyMap<string, Buffer>, findings: EvidenceSnapshot['comparisons'][number]['findings']) {
  const width = (context.width - 14) / 2
  context.room(width * 0.75 + 120 + context.doc.heightOfString(item, { width: context.width }))
  context.line('item', item)
  context.line('view', view)
  const top = context.doc.y
  context.doc.font('Helvetica-Bold').fontSize(10).text(context.label('handover'), context.margin, top, { width })
  context.doc.text(context.label('return'), context.margin + width + 14, top, { width })
  panel(context, before, photos, context.margin, top + 19, width, [])
  panel(context, after, photos, context.margin + width + 14, top + 19, width, findings)
  context.doc.y = top + 19 + width * 0.75 + 10
  for (const photo of [before, after]) if (photo) {
    context.line('received', `${photo.id}: ${photo.receivedAt}${photo.simulated ? ` / ${context.label('simulated')}` : ''}`)
  }
}
