// PayPal's v6 web SDK, as its reference shows it (developer.paypal.com, standard checkout v6): a script with no
// settings in its address, an instance made from the shop's client ID, and a one-time payment session that PayPal's own
// button starts. Only the parts Hold uses are typed here.

export type PayPalCheckout = { readonly clientId: string; readonly environment: 'sandbox' }

export type PaymentSessionCallbacks = {
  readonly onApprove: (data: { readonly orderId: string }) => Promise<void>
  readonly onCancel: () => void
  readonly onError: (error: unknown) => void
}
export type PaymentSession = { start(options: { readonly presentationMode: 'auto' }, order: Promise<{ readonly orderId: string }>): Promise<void> }
type SdkInstance = {
  findEligibleMethods(): Promise<{ isEligible(method: string): boolean }>
  createPayPalOneTimePaymentSession(callbacks: PaymentSessionCallbacks): Promise<PaymentSession>
}
type PayPalNamespace = { createInstance(options: { readonly clientId: string; readonly components: readonly string[] }): Promise<SdkInstance> }

const SCRIPTS: Record<PayPalCheckout['environment'], string> = { sandbox: 'https://www.sandbox.paypal.com/web-sdk/v6/core' }
const LOAD_MILLISECONDS = 10_000

const loaded = (): PayPalNamespace | undefined => {
  const candidate = (window as { paypal?: Partial<PayPalNamespace> }).paypal
  return typeof candidate?.createInstance === 'function' ? (candidate as PayPalNamespace) : undefined
}

function loadScript(environment: PayPalCheckout['environment']): Promise<PayPalNamespace | undefined> {
  const present = loaded()
  if (present !== undefined) return Promise.resolve(present)
  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = SCRIPTS[environment]
    script.async = true
    const timer = window.setTimeout(() => {
      resolve(undefined)
    }, LOAD_MILLISECONDS)
    script.addEventListener('load', () => {
      window.clearTimeout(timer)
      resolve(loaded())
    })
    script.addEventListener('error', () => {
      window.clearTimeout(timer)
      resolve(undefined)
    })
    document.head.append(script)
  })
}

// A payment session for PayPal's own button, or nothing when the SDK cannot load or PayPal is not offered here. The
// caller then sends the renter to PayPal's page instead.
export async function paypalSession(checkout: PayPalCheckout, callbacks: PaymentSessionCallbacks): Promise<PaymentSession | undefined> {
  try {
    const paypal = await loadScript(checkout.environment)
    if (paypal === undefined) return undefined
    const instance = await paypal.createInstance({ clientId: checkout.clientId, components: ['paypal-payments'] })
    if (!(await instance.findEligibleMethods()).isEligible('paypal')) return undefined
    return await instance.createPayPalOneTimePaymentSession(callbacks)
  } catch {
    // The SDK refused the client ID or could not reach PayPal: the page's own button still works.
    return undefined
  }
}
