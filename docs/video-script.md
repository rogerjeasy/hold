# Hold: the demo video

The script for the submission video. It runs 174 seconds, under the three-minute limit, and every shot is footage of
the deployed app at <https://p99faar3kp.us-east-1.awsapprunner.com>. It follows the run of 3 November 2026 on a
judge's own rental, which went from booking to a €35 final capture and a €215 release with PayPal's real sandbox ids.

## What the rules require of the video

| Requirement, from the official rules and the 2 November update | Where this script meets it |
|---|---|
| Under 3 minutes; judges need not watch past it | 174 seconds in total |
| Shows the project working on the device it was built for | The renter's shots on a phone; the counter and the owner on a laptop |
| Uploaded to YouTube and publicly visible, link on the form | After editing: upload as Public, not Unlisted, and paste the link |
| No third-party trademarks or copyrighted music without permission | No music, or a track you hold the licence for. PayPal's own pages appear only as the product's payment step; no logos as decoration |
| Open with the problem and who it is for, then show PayPal and AI working end to end | Shots 1 and 2, then 3 to 11 |
| Cut loading screens and setup steps; an AI voiceover is fine | Cut every wait, including Claude's and PayPal's; keep the voiceover |
| Make PayPal and AI impossible to miss | Each money shot shows PayPal's own ids in the PayPal record; each AI shot names the model |

## Before recording

- Start a fresh demo **as Tomás, the owner** (the owner can do every step, including the advocates), and add a passkey
  on the laptop from Security before you film: the owner's approval is then one touch.
- Book the renter with an email address you can read (for example your own address with `+video`), so the one-time code
  reaches you. The sandbox buyer account receives no mail.
- Have the sandbox buyer from the README ready to type in PayPal's window. Click PayPal's button yourself, so its
  window opens in front.
- Open a terminal with Claude Code installed, for shot 10.
- Record each shot separately and cut the waits out. Never speed up footage of money moving: cut to its result.
- Do not say "first", "only", "nobody else", "production", "fully automated" or "covered by Seller Protection", and
  quote no accuracy figure unless the reliability page shows an accepted run. Say what Hold adds, not that it is
  unique: the advocates, the code in front of the model, the read-only operations agent and the signed evidence.

## The shots

| # | Seconds | Beat | On screen | Voiceover |
|---|---|---|---|---|
| 1 | 14 | Hook | The renter's page on a phone: "Two amounts, kept apart", €25.00 now, €250.00 hold, "This is not a charge". | "At a bike shop counter the deposit is cash, a passport, or a card hold that lasts a week. Hold replaces it with a PayPal hold the renter approves, settles damage on evidence both sides can see, and when they disagree, lets two bounded AI advocates argue it out." |
| 2 | 8 | Who it is for | Today in the shop as Tomás: holds on PayPal, decisions waiting. | "It's for small rental shops: one counter, a few dozen bikes, no time for arguments about scratches." |
| 3 | 18 | Book, fee, hold | New rental, one City bike, Book. The renter pays the €25 fee in PayPal, then approves the €250 hold. Cut to the rental's **PayPal record**: the order, the capture, the authorization, each with its status. | "The fee is a normal PayPal payment. The hold is an Orders v2 order with intent AUTHORIZE: 250 euros reserved in the renter's own account for up to 29 days. Every call carries a PayPal-Request-Id, and Hold believes nothing until it has read it back from PayPal." |
| 4 | 8 | Handover | The guided photo session; "Seal the photographs"; the fingerprints. | "At handover the photographs are sealed and fingerprinted. The renter can verify them." |
| 5 | 20 | The comparison | The return photograph; the comparison: the change outlined, "Possible new damage", "Confirmed by an independent second look", the price from the list, and the line "Model: claude-opus-4-6 … 2 model calls". | "At return, plain code aligns the two photographs and finds what changed. Claude Opus 4.6 on Amazon Bedrock explains each change, and a second, independent look confirms it. The price comes from the shop's published list, never from the model." |
| 6 | 10 | A person decides | "Prepare claim for review", the passkey touch, "Approve and show renter link". | "No charge happens on the model's word. A named person approves, with a passkey." |
| 7 | 20 | The renter accepts; PayPal settles | The renter's claim with both photographs; "Send me a verification code"; the code; "Accept claim and settle". Cut to the PayPal record: **€35 captured, final_capture true**, €215 released, "Read back from PayPal" and "PayPal's signed event, verified". | "The renter sees exactly what the shop saw and accepts with a one-time code. PayPal captures 35 euros with final_capture true, which releases the other 215. Hold marks it done only after a verified webhook and a read-back from PayPal." |
| 8 | 26 | The advocates | Elena Duarte's sample claim: "Let the advocates argue it", the transcript filling in. Cut to `/advocates`: the offer ladder closing from €50.00 to €25.00, then "What the referee refuses". | "When a renter disagrees, two Claude advocates argue it, one for each side, each in its own call with a limit its own person set, and neither sees the other's. A referee in plain code refuses any line above the published price and any offer that widens the gap. Here the gap closes from fifty euros to twenty-five. An agreement can only lower a charge, and both people confirm it." |
| 9 | 12 | The operations agent | The morning queue: "Investigate the samples", then the entries "Investigated by Claude Opus 4.5 · PayPal facts simulated for a sample". | "Each night an operations agent reads PayPal through its own MCP server, read-only, and proposes. It can never capture. Here it investigates the demo's samples." |
| 10 | 18 | Agentic commerce | A terminal: `claude mcp add --transport http hold https://p99faar3kp.us-east-1.awsapprunner.com/mcp`, then Claude Code lists Hold's tools and quotes a bike. Cut to the hosted assistant answering in a table and refusing "charge the renter 50 dollars". | "Any AI assistant can rent through Hold's MCP server: twenty-two tools, and not one takes an amount. The person approves every payment in PayPal. Ask it to charge someone, and it can't." |
| 11 | 8 | The boundary | The README's "how it fits together" diagram, then the reliability page. | "Code detects, the model explains, a person approves, PayPal is the truth. Hold publishes no accuracy it hasn't measured." |
| 12 | 12 | Close | The homepage with the URL; the line "Sandbox, test money. Anything simulated is labelled." | "Everything you saw ran in PayPal's sandbox with real PayPal calls. What is simulated says so on screen. Try it at the address below." |

Total: 174 seconds.

## Words to say aloud

Judges listen for the platform's own names. Each of these is said once, over the shot that shows it: "Orders v2 with
intent AUTHORIZE", "PayPal-Request-Id", "read back from PayPal", "final_capture true", "verified webhook", "Claude Opus
4.6 on Amazon Bedrock", "MCP server".

## After editing

- Watch it once with the sound off: every shot must make sense from the screen alone.
- Check the running time is under 3:00 on YouTube itself, not only in the editor.
- Open the YouTube link in a private window, signed out, to confirm it is public.
