import 'server-only'
import QRCode from 'qrcode'

// A QR code of a link, as SVG markup drawn here from the link alone, for a renter to scan at the counter.
export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#141412', light: '#ffffff' } })
}
