# Hold: the demo video

The script for the submission video. It runs 170 seconds, under the three-minute limit, and every shot is footage of
the deployed app at <https://p99faar3kp.us-east-1.awsapprunner.com>.

## What the rules require of the video

| Requirement, from the official rules and the 2 November update | Where this script meets it |
|---|---|
| Under 3 minutes; judges need not watch past it | 170 seconds in total |
| Shows the project working on the device it was built for | Shots 3 to 9 are filmed on a phone for the counter and the renter, and on a laptop for the owner |
| Uploaded to YouTube and publicly visible, link on the form | After editing: upload as Public, not Unlisted, and paste the link |
| No third-party trademarks or copyrighted music without permission | No music, or a track you hold the licence for. PayPal's own pages appear because they are the product's payment step |
| Open with the problem and who it is for, then show PayPal and AI working end to end | Shots 1 and 2, then 3 to 10 |
| Cut loading screens and setup steps; an AI voiceover is fine | Cut every wait, including Claude's thinking; keep the voiceover |
| Make PayPal and AI impossible to miss | Each money shot names the PayPal call; each AI shot names Claude |

## Before recording

- Start a fresh demo as Jonas on the hosted app, and have the sandbox buyer signed in to PayPal on the renter's phone.
- Use an email address you can read for the renter, so the one-time code arrives.
- Add a passkey as Tomás on the laptop before shot 8, so the owner's step is one tap.
- Run the comparison once before filming. If Bedrock is throttled for the day, the screen says the comparison waits
  for a person. Film on a day it answers.
- Record each shot separately and cut the waits out. Do not speed up footage of money moving; cut to its result.

## The shots

| # | Seconds | Beat | On screen | Voiceover |
|---|---|---|---|---|
| 1 | 12 | Hook | A renter at a bike shop counter hears "and a 300 euro deposit". Cut to the homepage: "The deposit that never leaves your account." | "Rent an e-bike abroad and the shop takes 300 euros off your card. It comes back days later, minus the exchange rate. And if there's a scratch, it's your word against theirs." |
| 2 | 13 | Problem | The "For shops" page, then Today in the shop. | "Small rental shops hate it too: refunds by hand, arguments at the counter, disputes they lose. Hold replaces the deposit with a PayPal authorization hold, and settles damage with evidence both sides can see." |
| 3 | 18 | Demo: book and hold | Jonas books a City bike on the phone. The renter's link opens; PayPal's button takes the fee; then "Ask for the hold" and the renter approves 250 euros in PayPal. The rental shows "Held on PayPal". | "The renter pays the fee with PayPal's own button. Then the hold: an order with intent to authorize. 250 euros are reserved in the renter's account. Nothing is charged." |
| 4 | 14 | Demo: handover | The guided photo session; the handover is sealed; the renter confirms the condition report on their phone. | "At handover, Jonas takes guided photographs. They're sealed, write-once, and the renter confirms them." |
| 5 | 22 | Demo: return and AI | The return photograph with the chip; the comparison screen with "Demonstration photographs, real comparison", the outlined chip, Claude's finding and its second look, priced from the list. | "At return, plain code aligns the two photographs and finds what changed. Then Claude, on Amazon Bedrock, says what it is, and takes an independent second look. The price comes from the shop's published list, never from the model." |
| 6 | 14 | Demo: a person decides | "Prepare claim for review", then "Approve and show renter link". | "No charge happens on the AI's word. A named person approves the claim, within their approval limit." |
| 7 | 20 | Demo: renter accepts, PayPal settles | The renter's claim page with both photographs; the one-time code; Accept. Cut to "Settlement confirmed": 35 euros captured, 215 released. | "The renter sees exactly what the shop saw, and accepts with a one-time code. PayPal captures 35 euros as the final capture and releases the other 215. Hold records it only after reading the payment back from PayPal." |
| 8 | 20 | Demo: the advocates | As Tomás on the laptop: Elena Duarte's sample claim, "Let the advocates argue it", the transcript filling in, ending in an agreement. | "When a renter contests, two Claude advocates argue it, one for each side, each inside a limit a person set. Plain code checks every offer. They can only lower a charge, never raise it." |
| 9 | 15 | Demo: agentic commerce | The hosted assistant: "Book me a bike for three days". Its tool calls appear, then the PayPal approval link and QR code. | "And a traveller's own AI assistant can rent through Hold's MCP server. It finds a shop, gets a quote and books, but the person approves every payment in PayPal." |
| 10 | 12 | Technical depth | The architecture diagram from the README, then the code of the tool catalogue test or the referee. | "Every money call goes through an outbox with a PayPal request ID. Row-level security walls off each shop. No agent tool can capture a hold, and a test proves it." |
| 11 | 10 | Close | The reliability page saying "Not measured yet", then the homepage with the URL. | "Hold claims no accuracy it hasn't measured. Hold: the deposit that never leaves your account." |

Total: 170 seconds.

## After editing

- Watch it once with the sound off: every shot must make sense from the screen alone.
- Check the running time is under 3:00 on YouTube itself, not only in the editor.
- Open the YouTube link in a private window, signed out, to confirm it is public.
