import { AiBoundaries } from '../ai-boundaries'
import { AudiencePanels } from '../audience-panels'
import { BothSides } from '../both-sides'
import { ClosingCall } from '../closing-call'
import { Hero } from '../hero'
import { HowItWorks } from '../how-it-works'
import { PayPalCapabilities } from '../paypal-capabilities'

export function HomeScreen() {
  return (
    <>
      <Hero />
      <BothSides />
      <HowItWorks />
      <AudiencePanels />
      <AiBoundaries />
      <PayPalCapabilities />
      <ClosingCall />
    </>
  )
}
