'use client'
import { useEffect } from 'react'
import { z } from 'zod'
import { fillCode } from './fill-code'

const otpCredential = z.object({ code: z.string().regex(/^[0-9]{8}$/) })

// On a phone that supports it, the browser offers the code from the text Hold just sent, and one tap fills it in
// (the WebOTP API, architecture.md section 12.3). The text's last line names Hold's own site, so no other page gets it.
// Elsewhere nothing happens and the renter types the code, or the keyboard suggests it.
export function useWebOtp(inputId: string, waiting: boolean): void {
  useEffect(() => {
    if (!waiting || !('OTPCredential' in window)) return
    const controller = new AbortController()
    const request: CredentialRequestOptions & { readonly otp: { readonly transport: readonly string[] } } = { otp: { transport: ['sms'] }, signal: controller.signal }
    navigator.credentials
      .get(request)
      .then((credential) => {
        const parsed = otpCredential.safeParse(credential)
        if (parsed.success) fillCode(inputId, parsed.data.code)
      })
      .catch(() => {
        // Aborted when the page moves on, or refused by the renter: they type the code instead.
      })
    return () => { controller.abort() }
  }, [inputId, waiting])
}
