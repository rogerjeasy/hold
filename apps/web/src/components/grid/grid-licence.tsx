'use client'

import { LicenseManager } from 'ag-grid-enterprise'

// Hands the AG Grid Enterprise licence key, read from the server's settings, to every grid on the page. It is set while
// rendering, before any grid is created in an effect, and setting it again is harmless. A route that shows a grid draws
// this beside it.
export function GridLicence({ licenceKey }: { licenceKey: string | undefined }) {
  if (licenceKey !== undefined) LicenseManager.setLicenseKey(licenceKey)
  return null
}
