import type { EvidenceLabel } from './evidence-document-labels.ts'

export type EvidenceDocument = ReturnType<typeof evidenceDocument>
export function evidenceDocument(doc: PDFKit.PDFDocument, label: (key: EvidenceLabel) => string, shop: string) {
  const margin = 44
  const width = doc.page.width - margin * 2
  let section = ''
  const clean = (value: string) => Array.from(value).filter((character) => character.charCodeAt(0) >= 32 || character === '\n' || character === '\t').join('')
  function header() {
    doc.font('Helvetica').fontSize(9).fillColor('#465366').text(clean(shop), margin, 24, { width, lineBreak: false })
    doc.y = 49
    if (section) doc.font('Helvetica-Bold').fontSize(10).text(section, margin, doc.y, { width })
    doc.y += 8
    doc.font('Helvetica').fontSize(10).fillColor('#172332')
  }
  doc.on('pageAdded', header)
  header()
  function room(height: number) { if (doc.y + height > doc.page.height - 50) doc.addPage() }
  function heading(text: string) {
    room(64)
    section = text
    doc.font('Helvetica-Bold').fontSize(15).fillColor('#172332').text(clean(text), margin, doc.y, { width })
    doc.moveDown(0.6).font('Helvetica').fontSize(10)
  }
  function paragraph(text: string) {
    doc.font('Helvetica').fontSize(10).fillColor('#172332').text(clean(text), margin, doc.y, { width, paragraphGap: 6, lineGap: 2 })
    doc.moveDown(0.25)
  }
  function line(key: EvidenceLabel, value: string | number | null | undefined) {
    paragraph(`${label(key)}: ${value === null || value === undefined || value === '' ? label('missing') : String(value)}`)
  }
  function footers() {
    const pages = doc.bufferedPageRange()
    for (let page = pages.start; page < pages.start + pages.count; page += 1) {
      doc.switchToPage(page)
      const bottom = doc.page.margins.bottom
      doc.page.margins.bottom = 0
      doc.font('Helvetica').fontSize(8).fillColor('#465366').text(`${label('page')} ${String(page + 1)} / ${String(pages.count)}`, margin, doc.page.height - 29, { width, align: 'right', lineBreak: false })
      doc.page.margins.bottom = bottom
    }
  }
  return { doc, label, margin, width, heading, paragraph, line, room, footers }
}
