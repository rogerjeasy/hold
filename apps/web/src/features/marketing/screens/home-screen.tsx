import { AdvocatesBand } from '../advocates-band'
import { AudiencePanels } from '../audience-panels'
import { BothSides } from '../both-sides'
import { ClosingCall } from '../closing-call'
import { Hero } from '../hero'
import { HowItWorks } from '../how-it-works'
import { JoinedParts } from '../joined-parts'
import { PayPalCapabilities } from '../paypal-capabilities'

// The hold, the photographs and a person who approves are where Hold starts, not what sets it apart: the page leads
// with the advocates and the parts Hold joins to the hold, then shows the rental itself.
export function HomeScreen() {
  return (
    <>
      <Hero />
      <AdvocatesBand />
      <JoinedParts />
      <BothSides />
      <HowItWorks />
      <AudiencePanels />
      <PayPalCapabilities />
      <ClosingCall />
    </>
  )
}
