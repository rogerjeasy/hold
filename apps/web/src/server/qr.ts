import 'server-only'
import QRCode from 'qrcode'

// A QR code of a link, as SVG markup drawn here from the link alone, for a renter to scan at the counter.
export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#141412', light: '#ffffff' } })
}

// The same, as a PNG in base64, for an MCP client that shows images.
export async function qrPng(url: string): Promise<string> {
  return (await QRCode.toBuffer(url, { type: 'png', margin: 1, errorCorrectionLevel: 'M', width: 320 })).toString('base64')
}
