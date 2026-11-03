# Hold

**The deposit that never leaves your account.**

Product description. PayPal AI Hackathon 2026. Draft 5, 3 November 2026.

This document describes the product: the problem, the audience, the features, the business value and the impact. It does not describe the implementation.

Draft 2 adds six extensions. They are described in sections 6.11 to 6.16 and specified in `extensions.md`. They do not change what Hold is. Each one strengthens a promise the product already makes.

Draft 3 marks what this build does not do yet as planned, where it is described, so the description matches the code.

Draft 4 names the model, marks what has since been built, says plainly what real shops still need from PayPal, and gives the phone app its place.

Draft 5 says what is new against what already exists. A card hold as a deposit, AI photo comparison and a person approving a charge each exist; the summary and section 10 now lead with what Hold adds to them, and claim nothing as a first.

---

## 1. Summary

Hold is a deposit and damage system for small rental businesses.

Instead of charging a security deposit and refunding it later, the shop places a PayPal hold. The money is reserved but never moves. When the item comes back, an AI compares photographs taken at handover with photographs taken at return. If nothing changed, the hold is released on the spot. If something is damaged, the shop reviews an itemized claim, approves it, and only that amount is taken. The rest is released immediately. Renter and shop receive the same evidence.

**In one sentence:** Hold lets a rental shop protect its equipment without taking its customers' money, and settles every damage claim with evidence both sides can see.

**The three ideas that make Hold work:**

1. **The hold is the deposit.** The renter's money is reserved, not charged. If the return is clean, no payment ever happened, so there is nothing to refund, nothing to wait for and nothing lost to currency conversion.
2. **One evidence pack, two readers.** The condition of the item at handover and at return is recorded the same way every time. Code finds what changed before a model explains it, any claim is itemized against the shop's published price list, approved by a person, and shown in full to the renter before it is final.
3. **A disagreement is settled inside limits people set.** When the renter contests a claim, two advocates argue it, one for each side, each inside a limit its own person wrote and never shown the other's. A referee in plain code checks every offer, an agreement can only lower the approved claim, and both people confirm it before PayPal takes anything.

Card holds for deposits already exist in rental software, AI damage detection already exists in equipment rental, and a person approving a charge is common practice. None of them is the idea. The idea is the joined object: the hold, its evidence, the published price list, the named person who approved, what the renter saw, and how it settled, as one record both sides can read, and a fair way to settle it when they disagree. That is the product.

---

## 2. The problem

A security deposit is supposed to make both sides feel safe. In practice it makes both sides unhappy.

### 2.1 For the renter, a deposit is a real charge

- **The money is gone.** A tourist renting an e-bike sees several hundred euros leave a travel budget for an item they intend to return undamaged.
- **The refund is slow.** A refunded charge can take days to reappear, long after the trip has ended.
- **Foreign cards lose money twice.** When a deposit is charged in one currency and refunded later, the renter can lose on the exchange rate and on fees, even though nothing went wrong.
- **The decision is invisible.** If the shop keeps part of the deposit, the renter usually gets a number and a sentence. They cannot see what the shop saw.

Many customers walk away at the moment the deposit is mentioned. Shops know this, which is why so many of them quietly skip the deposit and carry the risk themselves.

### 2.2 For the shop, a deposit is paperwork and conflict

- **Refunds are manual work.** Every clean return still needs someone to issue a refund and answer the customer who asks where it is.
- **Damage is a matter of opinion.** At a busy counter, staff glance at an item and wave it through. Damage is found later, when the renter is gone and nothing can be proved.
- **Old damage is charged to new customers.** Without a reliable record, the shop cannot say whether a scratch was already there. Honest renters are sometimes blamed for it.
- **Disputes are lost for lack of evidence.** When a renter contests a charge with their payment provider, the shop needs dated proof of condition before and after. Most small shops have none.
- **Bad reviews follow.** A single disputed deposit produces the kind of review that costs future bookings.

### 2.3 Existing tools solve the wrong half

| What exists today | What it does well | What it leaves unsolved |
|---|---|---|
| Charging and refunding a deposit | Simple to understand | The renter's money really leaves, refunds are slow, and foreign renters lose on conversion |
| Card holds inside rental software | Reserves money without charging it | Hold periods are short, often about a week. The damage decision is still a person's opinion with no shared evidence |
| Damage waivers and insurance | Removes the deposit entirely | The renter pays a fee every time, the shop still handles claims, and careless use is not discouraged |
| Photos on a staff member's phone | Costs nothing | Inconsistent, undated, unsearchable, and the renter never sees them |
| Automated damage scanners in car rental | Consistent and fast | Expensive fixed hardware. A rollout in 2025 drew public anger because customers were charged automatically, for minor marks, with no person to talk to |

That last row matters. It shows that AI damage detection without human review and without transparency makes customers angrier than the old system did. Hold is designed as the opposite: the AI gathers and compares, a person decides, and the renter sees everything.

---

## 3. Who Hold is for

### 3.1 The people involved

| Person | Who they are | What they need |
|---|---|---|
| **The owner** | Tomás runs a bike and e-bike rental shop in a tourist city. Forty bikes, each e-bike worth more than a month's profit. | To protect his fleet without scaring off customers, and to stop arguing about scratches. |
| **The counter staff** | Jonas is a seasonal employee. In high season he hands over a bike every few minutes. | A handover and return routine that takes under a minute and that he cannot get wrong. |
| **The renter** | Priya is visiting for four days and wants an e-bike for three of them. | To keep her travel money, to know exactly what she could be charged and why, and to be treated fairly. |
| **The remote renter** | Daniel rents a camera lens that is shipped to him. | To prove the condition the item arrived in and the condition he sent it back in. |

### 3.2 The first audience

Hold's first customers are independent rental shops with one to five locations whose items are worth protecting but cheap enough to rent casually. The item value is typically between a few hundred and a few thousand dollars.

- Bike, e-bike and scooter rental
- Camera, lens and audio equipment rental
- Ski, surf, kayak and camping gear rental
- Party and event equipment
- Tool and small equipment rental
- Baby equipment rental for travelling families
- Musical instruments, costumes and formalwear

These shops share three traits. Their customers are often visitors paying with foreign cards. Their staff are often seasonal. And a single damaged item can erase a week's earnings.

### 3.3 The wider audience

- **Online and mail-order rental businesses**, where the item is shipped and nobody is present at handover.
- **Rental marketplaces and peer-to-peer lending platforms**, which need a neutral way to settle damage between strangers.
- **Community tool libraries and lending schemes**, which want accountability without charging members.
- **Any business that lends before it bills**, such as demo equipment, loaner devices and trial products.

### 3.4 The size of the opportunity

Equipment and event rental is a large, established industry. The American Rental Association forecasts roughly $83 billion in United States construction, industrial and general tool rental revenue for 2026, and about $6 billion in event rental. Consumer rental categories such as bikes, cameras and outdoor gear sit alongside those figures, and are made up largely of small independent operators who have no dedicated tools.

---

## 4. Product principles

1. **Reserve, do not charge.** A renter who returns an item in good condition should never see money leave their account.
2. **Evidence before opinion.** No claim exists without a before photograph and an after photograph of the same part of the same item.
3. **The AI gathers and compares. A person decides.** No money is taken on the AI's word alone.
4. **The renter sees what the shop sees.** The same photographs, the same comparison, the same price list, at the same time.
5. **Prices are published before the rental.** The renter agrees to the damage price list when they accept the hold. Nothing is invented afterwards.
6. **Ordinary wear is not damage.** The shop defines what counts as wear, and Hold applies that definition consistently.
7. **Fast when clean.** A clean return must release the hold in seconds. Most rentals are clean, so most customers should experience Hold as something that simply disappears.
8. **An agent acts only inside limits a person set.** A renter or an owner may let an AI agent act for them. It can do so only within limits they wrote down. They can see everything it did, and they can stop it at any time.

---

## 5. One rental with Hold

**Booking.** Priya reserves an e-bike for three days on the shop's page. The rental costs 120 euros. Below the price she reads: "A 300 euro hold protects the bike. This is not a charge. If the bike comes back as it left, the hold is released the moment you return it." She can open the damage price list: a scratched frame is 35 euros, a missing charger is 60 euros, a bent wheel is 90 euros. She pays the rental fee with PayPal. The hold itself is placed when she collects the bike, so it is fresh for the whole rental.

**Handover.** At the shop, Jonas opens the rental on his phone and shows Priya a QR code. She approves the 300 euro hold on her own phone in a few seconds. Hold walks him through six photographs: both sides of the frame, front wheel, rear wheel, display and battery. It tells him when a shot is blurred or too dark and asks for it again. The whole thing takes forty seconds. Hold notes two marks that were already on the bike from earlier rentals. Priya receives the condition report on her phone and confirms it.

**During the rental.** Priya decides to keep the bike one more day. She opens her rental page, taps one more day and sees the price at the day rate she agreed: 40 euros, paid on its own in PayPal, with her 300 euro hold left exactly as it is. She approves it in PayPal and her return time moves at once, with nobody at the shop to ask. Had the bike been booked by someone else that day, or had the hold not covered the new return, she would have been told so, with the date, before paying anything.

**A clean return.** Suppose Priya returns the bike undamaged. Jonas takes the same six photographs. Hold compares each with its handover twin and finds no new marks. Jonas confirms, and the hold is released. Priya's phone tells her: "Your bike is back safely. The 300 euro hold has been released. Nothing was charged." She is out of the shop in under a minute.

**Returning after closing.** Suppose Priya's last ride ends at 21:40 and the shop closed at 19:00. Her rental page says the shop is closed and she can still return the bike. It shows where Tomás wants it left, in his own words, and promises that nothing is charged before a person looks. She photographs the same six views with the handover photograph faint behind her camera, then the bike at the rack. A photograph that only repeats an earlier one is refused while she is still standing there. She sends it, and her receipt says "Returned on time, 21:40", with the 300 euros PayPal confirms are reserved, not taken. The comparison runs overnight. At nine, Jonas sees her return at the top of his queue with the drop-point photograph and anything the comparison found. He checks the rack, taps "It's here", and the return goes on exactly as if she had come to the counter. If the bike were not there, he would say so, and the hold would stay in place.

**A return with damage.** Now suppose the bike comes back with a fresh scratch along the frame. Hold shows the handover and return photographs side by side with the new mark outlined. It is confident this mark was not there before, and it matches the price list entry "scratched frame, 35 euros". It also notes that a scuff on the rear mudguard was already present at handover and should not be charged. Jonas reviews the claim and approves it.

Priya sees the same two photographs, the outlined mark and the price. She accepts. Thirty-five euros are taken, 265 euros are released, and both receive the same record. The whole conversation is about a photograph, not about who is telling the truth.

**A contested claim.** If Priya disagrees, she says so in the same screen and can add her own photographs. Hold summarizes both positions for Tomás, who makes the final decision. If she later raises a dispute with PayPal, the complete record is already assembled.

---

## 6. Features

### 6.1 Shop setup

- **The catalog.** Each rentable item, or each type of item, with its value and the hold amount that protects it.
- **The damage price list.** A plain list of what each kind of damage, loss or lateness costs. The shop writes each entry with its price, and renters read the list before they rent. Drafting the list from the shop's own words is planned, not in this build.
- **The wear policy.** The shop states what it considers ordinary wear, such as small scuffs on pedals or light tyre wear. Hold applies it the same way to every customer.
- **The photo plan.** For each type of item, the set of views that must be captured. Hold suggests a plan from the item type and the shop adjusts it.
- **Rental terms in plain language.** Hold drafts clear terms from the shop's choices, in the languages its customers speak. *Planned, not in this build.*

### 6.2 Booking and the hold

- **Two amounts, clearly separated.** The rental fee is paid. The deposit is held. The page explains the difference in a sentence.
- **The hold is placed close to pickup.** A PayPal hold lasts up to 29 days, so a renter who books weeks ahead approves the hold when they collect the item. A walk-in customer approves the fee and the hold one after the other; approving both at once is planned.
- **The price list is agreed up front.** The renter sees the damage prices and accepts them as part of the booking.
- **Returning customers.** A renter who has used the shop before can rent again without re-entering anything. *Planned, not in this build.*
- **Hold amounts that fit the item.** A helmet and an e-bike do not need the same protection. The shop can also lower the hold for trusted repeat customers.
- **Long rentals.** A PayPal hold lasts up to 29 days. Hold keeps it valid during the rental by renewing it when it charges. This build books rentals of up to four weeks; switching longer rentals to a saved payment method is planned.

### 6.3 Guided handover

- **A guided photo session.** Staff are led through the views one by one, with an outline showing how to frame each shot.
- **Quality checks as they shoot.** Blurred, dark or badly framed photographs are caught immediately, when retaking them is still easy.
- **Existing marks are recorded.** Hold notes anything already present, so the renter is never charged for it.
- **The renter confirms.** The renter receives the condition report and can add a photograph of anything they think was missed.
- **Accessories are counted.** Charger, lock, helmet, lens cap, case. What went out is listed.

### 6.4 Guided return and comparison

- **The same views, again.** The return session repeats the handover session shot for shot.
- **Side-by-side comparison.** Each pair is compared and any new mark is outlined.
- **Three outcomes for each difference.** No change, ordinary wear, or damage. Each comes with a stated level of confidence.
- **Matched to the price list.** Each item of damage is linked to its entry in the published list.
- **Honest about doubt.** When the photographs do not allow a confident answer, Hold says so and asks a person to look at the item itself.
- **Missing and late.** A late return is flagged on the day's list, and staff claim it, or a missing accessory, from the same price list. Finding and pricing them automatically is planned.

### 6.5 Settlement

- **Clean return, instant release.** One confirmation by staff releases the full hold and tells the renter.
- **Itemized claim.** For damage, Hold prepares a claim listing each item, its photographs and its price.
- **A person approves.** Staff or the owner can accept, reduce, remove or add items before anything is charged. The shop can require the owner's approval above a chosen amount.
- **Only the claim is taken.** The approved amount is charged from the hold and the remainder is released at once.
- **Beyond the hold.** If the damage exceeds the hold, the hold is taken in full and the balance is billed separately, with the same evidence attached.
- **A clear message to the renter.** Written in plain words, in the renter's language, with the photographs and the prices.

### 6.6 The renter's side

- **Nothing to install and no account to create.** Everything arrives as a link.
- **Live status of the hold.** Reserved, extended, released or partly taken, always visible.
- **The full evidence.** Every photograph from handover and return, the comparison and the claim.
- **A right to reply.** The renter can accept a claim or contest it, with their own photographs and comments, within a period the shop sets.
- **A fair summary.** When a claim is contested, Claude lays out both positions neutrally for the person who decides, from the records, and the renter reads the same summary. The owner also sees the renter's words, the advocates' exchange and the evidence.
- **A clean record.** A renter who returns items in good condition builds a history the shop can reward with smaller holds.

### 6.7 Shipped rentals

*Planned, not in this build.*

- **Proof at both ends.** The shop photographs the item before packing. The renter is guided through the same views when the parcel is opened and again before sending it back.
- **Tracked both ways.** Outbound and return shipments are followed, so lateness and loss are attributed correctly.
- **Transit damage is separated.** Damage that appears between packing and unboxing is identified as a shipping matter, not charged to the renter.

### 6.8 The item passport

- **A condition history for every item.** Each rental adds a dated set of photographs.
- **Old damage stays old.** Because every mark has a first-seen date, no renter is charged for a previous renter's damage.
- **Maintenance signals.** Hold shows which item in each type is wearing fastest, counted by plain code from the damage the comparison found rental by rental, beside each item's rentals, days out and what was recovered of its damage. Which items are due for repair or retirement is planned.
- **Resale and insurance.** A documented history supports a better resale price and a stronger insurance claim. The history is built; the reports for resale and insurance are planned.

### 6.9 The owner's view

- **Today at a glance.** Items out, items due back, holds in place and claims awaiting a decision.
- **Holds that need attention.** Any hold approaching the end of its life is flagged before it lapses.
- **Damage and recovery.** How much damage occurred, how much was recovered, and from which items.
- **Staff consistency.** Whether handovers and returns are being done fully, by whom, and how long they take. *Planned, not in this build.*
- **Ask the shop.** The owner can ask in plain language: "Which holds are still open from last week?" "Release the hold on Priya's rental." "What did damage cost me in August?" The assistant answers from the records and acts only after confirmation. *Planned, not in this build.*

### 6.10 Safeguards

- **No automatic charges.** Every charge against a hold is approved by a named person.
- **A second approval for large claims.** Above a threshold, the owner must agree.
- **A cap by design.** A claim cannot exceed the published price list for the damage found.
- **A cooling period where the shop chooses one.** The shop can give the renter time to reply before a claim is final.
- **Tamper-evident records.** Photographs are dated at capture and cannot be replaced afterwards.
- **Checks on the photographs themselves.** Hold flags images that appear reused, by their fingerprints, and the comparison says when a photograph shows a different item or view. Checking where a photograph was taken is planned.
- **Privacy.** Faces and bystanders are not needed and are blurred. Photographs are kept only as long as the shop's policy and the law require.
- **Agents have written limits.** An agent acting for a renter or an owner stays inside limits that person set, and its actions are listed for them.
- **No agent can charge.** An agent can release a hold when approved, argue a claim down, or prepare a decision. A charge still begins from a claim with photographs, published prices and a person's approval.

### 6.11 Proven accuracy

- **Measured, not claimed.** Hold tests its comparison on pairs of photographs whose true answer is known: clean returns, ordinary wear and real damage, in good light and bad.
- **Published with the counts.** The results are shown to owners, to renters and to anyone who asks, each as a count such as "57 of 60", never as a bare percentage.
- **The number that protects renters comes first.** How often a clean return was wrongly flagged is the headline figure.
- **Shown beside each finding.** Next to a finding's confidence is how often findings at that level proved correct.
- **It cannot quietly get worse.** A new version that does worse on the test is not released.
- **Every decision teaches.** When a person removes a finding from a claim, that is recorded and tracked over time.
- **Where it stands.** The runner, the gate and the pages are built, and the set holds 300 pairs. They start from freely licensed photographs, and most returns are generated from the handover photograph with damage drawn from its own pixels, each marked synthetic. A run accepted by mistake on 29 October measured almost nothing, because the model answered too few pairs, so it was withdrawn on 3 November and the page says so. No run is accepted now, and until one is, Hold claims no accuracy. A figure worth publishing needs real photographs of real damage.

### 6.12 The morning queue

- **An agent that works overnight.** While the shop is closed, it checks every hold, claim, invoice and dispute against PayPal's records.
- **A short list of decisions.** In the morning the owner finds a handful of lines: release this hold, ask the renter for a fresh hold, answer this dispute with the rental's evidence pack. Proposing an invoice or a refund from the queue is planned; Hold already invoices a balance itself once a charge is settled. Each has a one-line reason and the PayPal reference behind it.
- **One screen to approve.** The owner approves, rejects or postpones each line. Approved lines are carried out at once.
- **It reminds on its own, and nothing more.** Reminders about a return, a reply or an unpaid invoice go out without asking. Anything that moves money waits for the owner, unless the owner turned on the one standing rule: release the hold of a clean return nobody confirmed in time.
- **It never proposes a charge.** A charge can only come from a claim.
- **It learns the shop's habits in the open.** When the owner rejects a suggestion and says why, the agent drafts a rule. The owner confirms it, and it joins a visible list.

### 6.13 The Clean Record

- **Clean returns add up.** Each rental returned in good condition is added to the renter's Clean Record.
- **A published ladder.** Each shop states how many clean returns earn how much off the hold. Renters can read it before they book.
- **It travels.** With the renter's consent, clean returns at one Hold shop count at another. A careful renter is trusted by a shop they have never visited.
- **Only ever lower.** A poor history, or none, means the ordinary hold. Nobody is ever held for more because of their past.
- **An accident is not a stain.** A claim that was settled and paid does not count against a renter. Nor does opening a dispute.
- **The renter's own.** The record holds no name, no email and no shop names. The renter can see it, show it and delete it.
- **Money never taken.** The renter sees a running figure of deposits that, with Hold, never left their account.

### 6.14 Rent through your own assistant

- **Bookable by AI assistants.** A traveller can ask their own AI assistant to find a shop, read its damage prices, get a quote and book.
- **The person approves the money.** The assistant hands over a PayPal link or QR code. The fee and the hold are approved by the renter, in PayPal.
- **The assistant can follow the rental.** It can check the hold, read the condition report and read a claim with its photographs. Asking for an extra day is planned.
- **It cannot decide a claim alone.** Accepting or contesting a claim needs the renter, unless the renter has given it written limits.
- **Always visible.** The renter sees that an assistant is connected, everything it did, and a button to disconnect it.
- **No account, still.** The renter's identity remains their PayPal payment.

### 6.15 An advocate for each side

- **Help with the reply.** A renter who contests a claim can ask an advocate to argue it for them, and tell it the most they are willing to pay.
- **The shop has one too.** The owner sets its limits once: how far a claim may be reduced without asking.
- **They argue from the evidence.** The two advocates exchange itemized offers. Each concession must point at something real: a mark that was already there, a photograph that was unclear, a line in the wear policy.
- **Neither sees the other's limit.**
- **The rules are not an AI.** Fixed rules check every offer. Nothing outside either side's limits can be agreed, no line can be added, and no price can exceed the published list.
- **People confirm.** By default the renter and the owner each confirm the result with one tap. Only then is the agreed amount taken and the rest released.
- **No agreement, no harm.** If the advocates cannot agree, the owner decides, exactly as before, with the full exchange in front of them.
- **On the record.** The exchange is added to the evidence both sides receive.
- **Watch it in the demo.** The demo shop holds a sample claim that still waits for the renter's reply. One button hands it to the two advocates, who argue it live. The renter and their limit are made up for the demonstration, and nothing is ever taken from a sample.

### 6.16 When something happens during the rental

- **One button.** "Something happened." The renter describes it and takes a photograph.
- **Sorted in a minute.** Small damage, a mechanical fault, a theft or loss, or something a person must look at.
- **Small damage can be agreed on the spot.** The renter sees the published price and can agree to it there and then. Nothing is charged until the return, after staff have seen the item.
- **A fault is the shop's matter.** It is logged as such, and staff are told at once.
- **Theft and loss get clear steps and a person.** Nothing is charged automatically.
- **Never a safety verdict.** Hold does not tell a renter that a damaged item is safe to use. Anything doubtful goes to a person.
- **No surprise at the return.** A mark reported during the rental is recognised when the item comes back.

---

## 7. What PayPal does in Hold

PayPal is the mechanism that makes the product possible. The whole idea rests on the difference between reserving money and charging it, and on being able to take a part and release the rest.

| Rental need | PayPal capability | In this build |
|---|---|---|
| The renter pays the rental fee | Checkout, with PayPal's own button | Built |
| The deposit is reserved without being charged | Authorization hold | Built |
| A clean return frees the full amount | Release of the hold | Built |
| Damage is charged for that amount only | Partial capture, with the remainder released | Built |
| A longer rental keeps its protection | Renewal of the hold | Built, and observed live in the sandbox |
| Damage exceeds the hold | Invoicing | Built |
| A claim is corrected after review | Refund | Built |
| A renter disputes a charge | Disputes, with the evidence pack attached | Built |
| Hold knows the true state of every payment | Live payment notifications, each read back from PayPal | Built |
| The operations agent checks every payment overnight | PayPal's MCP server, read tools only | Built |
| A renter's own assistant books a rental | Checkout, approved by the renter in PayPal | Built |
| A trusted renter gets a smaller hold | Authorization hold, for the lower amount | Built |
| An agreed settlement is taken | Partial capture, with the remainder released | Built |
| A returning customer rents in one step | Saved payment method | Planned |
| The renter wants to spread the rental fee | Pay Later | Planned |
| A shipped rental is followed both ways | Shipment tracking | Planned |
| The owner signs up in a minute | Log in with PayPal | Planned |
| The owner's assistant acts on instructions | PayPal's MCP server | Planned |

PayPal also brings two advantages over the card holds found in rental software today. A PayPal hold can last up to 29 days, where many card holds expire in about a week. And a renter paying from a PayPal wallet does not need to hand a card to a shop they have never visited.

For the hackathon, all of this runs in the PayPal sandbox with test money.

**What real shops still need from PayPal.** Two things stand between this build and a shop taking real money.

- **Connecting a shop.** Today a shop pastes its own PayPal app's client ID and secret, and Hold keeps the secret in AWS Secrets Manager. That works for a pilot, but no platform should hold its merchants' secrets. The production path is PayPal's partner onboarding: Partner Referrals, then calls made for the shop with PayPal's auth assertion, so a shop connects with a PayPal sign-in and Hold never sees a secret. The sandbox refused Partner Referrals to this account on 28 October 2026, so it needs PayPal to approve Hold as a partner.
- **Rentals longer than 29 days.** A PayPal hold lasts up to 29 days. Today Hold asks the renter, three days before it ends, to approve a fresh hold from a link. If they do not, the shop is unprotected for the rest of the rental. The plan is to save the renter's PayPal wallet with their consent (Payment Method Tokens) and place the next hold from it.

---

## 8. What AI does in Hold, and what it does not

**The model.** Claude on Amazon Bedrock does every AI step: Opus 4.6 compares photographs and takes an independent second look; Opus 4.5, whose daily allowance in the account is about seven times larger, writes a contested claim's summary, sorting a renter's incident report, the operations agent's overnight checks, the hosted assistant that books through Hold's MCP server, and the two advocates. Plain code does the rest. OpenCV aligns photographs and finds what changed before the model is asked, and checks photo quality on the phone. Amazon Rekognition finds faces so they can be blurred.

**AI does the work that needs perception and language:**

- Guides staff and renters through the photographs and checks each one as it is taken.
- Compares handover and return photographs and outlines what changed.
- Classifies each change as no change, ordinary wear or damage, with a stated confidence.
- Matches damage to the shop's price list.
- Writes the claim in plain words, in the renter's language.
- Summarizes both sides of a contested claim neutrally.
- Turns the shop's rules, written in ordinary language, into a consistent price list and wear policy. (Planned.)
- Spots photographs that look reused or wrong.
- Answers the owner's questions about the business and carries out confirmed instructions. (Planned.)
- Checks every hold, invoice and dispute overnight and prepares decisions for the owner.
- Helps a renter's own assistant book and follow a rental.
- Argues each side of a contested claim from the evidence, inside limits each person set.
- Sorts a report made during a rental and points the renter to the right next step.

**AI does not do the work that needs authority or certainty:**

- It does not decide to charge anyone. A person does.
- It does not set prices. The published price list does.
- It does not decide what a payment's status is. PayPal's record does.
- It does not hide its uncertainty. When it cannot tell, it says so.
- It does not act for anyone beyond the limits that person wrote.
- It does not judge how far a renter can be trusted. Clean returns are counted, and the shop's published ladder does the rest.
- It does not tell a renter that a damaged item is safe to use.

---

## 9. The value for each person

| Person | Before Hold | With Hold |
|---|---|---|
| **The renter** | Pays a deposit, waits for a refund, may lose on conversion, and is told the outcome | Keeps their money, sees the evidence, and has a right to reply |
| **The owner** | Chooses between scaring customers with a deposit and carrying the risk without one | Protects every item without charging anyone who returns it intact |
| **The counter staff** | Judges condition by eye under pressure and absorbs the customer's anger | Follows a one-minute routine and points to a photograph |
| **The business** | Loses damage costs it cannot prove and collects bad reviews for those it can | Recovers what it is owed, loses fewer disputes and earns trust |

**An illustration.** A shop with forty bikes might handle several thousand rentals in a season. If nearly all are clean, then nearly all of its customers currently pay and wait for a deposit for no reason. With Hold, those customers experience no deposit at all. The few rentals with damage are settled in minutes with evidence, in place of an argument at the counter and a possible dispute weeks later.

---

## 10. Why Hold is different

What already exists, and what Hold adds to it:

| Already exists | Where | What Hold adds |
|---|---|---|
| A card hold as a deposit | Small-shop rental software, mostly through Stripe, where a hold lasts about a week and is captured once | A PayPal authorization the renter approves for the exact amount, open for up to 29 days, renewed once when a charge comes late, with a partial final capture that releases the rest at once |
| AI that compares condition photographs | Equipment rental (Texada, March 2026) and condition-report apps | Plain code finds every change before the model is asked, an independent second look checks each damage finding, and nothing is missed when the model is down. Accuracy is counted on photographs the comparison is never tuned on, and every pair is published |
| A person who approves a charge | Common practice, and in about a quarter of this hackathon's entries | It is a rule here, not the idea: the person approves against the published price list, the renter sees the same photographs, and the approval is kept in an append-only record with the claim |
| An AI that mediates a dispute | Several hackathon entries use one model as judge or mediator | Two advocates, one for each side, each in its own call with its own limit; a referee in plain code bounds every offer; the agreement can only lower the claim and both people confirm it |

What no part does alone:

- **It joins the hold to the evidence.** The reserved money, the documented condition, the price list the renter accepted, the person who approved and what the renter saw are one record, settled in one step and read back from PayPal.
- **It settles a disagreement fairly, in the open.** The advocates argue from the evidence, never past their own side's limit, and every move is fingerprinted over the one before, so the transcript both people receive cannot be quietly changed.
- **It lets AI work on both sides without letting it take money.** A renter's assistant can book through Hold's MCP server, an operations agent reads PayPal overnight with read-only tools, and the advocates negotiate. Each acts inside limits a person wrote, and none can charge.
- **Its evidence can be checked without trusting Hold.** The sealed handover photographs come with a signed statement anyone can verify against a published key.
- **It shows its accuracy.** The comparison's results are public, with their counts and every pair behind them, and until a run is accepted it says so.
- **It works for the small shop.** No hardware beyond the phone the staff already carry, priced and designed for an owner with forty bikes.
- **It rewards careful renters.** A Clean Record lowers the next hold, at any shop that uses Hold.

## 11. Business model

These are proposals to be tested with real shops.

| Plan | Who it is for | What they get | Proposed price |
|---|---|---|---|
| **Starter** | A single small shop trying Hold | A limited number of protected rentals each month | Free |
| **Shop** | An independent rental shop | Unlimited rentals at one location, item passports, the owner's assistant | A flat monthly fee per location |
| **Multi-location** | A rental business with several branches | Everything in Shop, plus staff roles, cross-location reporting and owner approvals | A monthly fee per location, reducing with volume |
| **Platform** | Rental marketplaces and peer-to-peer lending platforms | Hold built into their own booking flow | A small fee per protected rental |

**Why shops will pay.** Hold pays for itself in three ways: bookings no longer lost at the mention of a deposit, damage costs actually recovered, and staff time no longer spent on refunds and disputes.

**Why this is good business for PayPal.** Hold gives small rental shops a reason to make PayPal their main way of being paid. It brings authorization volume from a category that today prefers cash and cards at the counter. It reduces disputes by resolving disagreements before they become disputes. And it shows AI being used to make a payment fairer, not just faster.

---

## 12. Trust, fairness and privacy

- **Informed consent.** The renter is told, before paying, that a hold will be placed, how much it is, how long it can last and what each kind of damage costs.
- **No surprise charges.** A renter can only be charged for damage that is on the published list, shown in the photographs and approved by a person.
- **A real right to reply.** Contesting a claim is as easy as accepting one, and it reaches a human being.
- **Consistency.** The same wear policy and the same price list apply to every renter, whoever they are.
- **Honest about the AI's limits.** Lighting, dirt and reflections can mislead any comparison. Hold reports its confidence, asks for a retake when a photograph is poor, and defers to a person whenever it is unsure.
- **Privacy.** Photographs are of items, not people. Faces are blurred. Evidence photographs are locked for the 180 days PayPal accepts a dispute and deleted a year after they are taken, by the storage itself. A renter asks the shop to erase their name, email and phone; its owner does so once their rentals have ended, and the money log, approvals and audit trail stay, without them. The public privacy notice (`/privacy`) and terms of use (`/terms`) say what is recorded, why, for how long and who handles it, and that the hackathon build runs in PayPal's sandbox and is not a registered business. Before paying, the renter is told the photographs are kept as evidence, and for how long.
- **Honest about what it is.** Hold is not an insurer and does not hold customers' money. The funds stay in the renter's own account until a claim is approved.
- **Respect for the rules.** Holds are used only for their proper purpose: reserving a stated amount, for a stated reason, for a limited time.
- **Delegation is a choice.** Nobody has to use an agent. A renter who prefers to reply to a claim themselves does exactly what they did before.
- **Trust is never a penalty.** A renter's history can lower a hold. It can never raise one.
- **A record the renter controls.** Sharing clean returns between shops is off until the renter turns it on, and they can delete the record.
- **Open about the advocates.** In the first version Hold runs both advocates. The rules they must follow are fixed and public, the renter's own limit binds the result, and a renter may bring their own assistant in its place.

---

## 13. Impact, and how it will be measured

**The change Hold aims to make:** renting something becomes as easy as buying it, small rental shops stop losing money to damage they cannot prove, and renters stop being charged on someone's word.

| What we measure | Why it matters |
|---|---|
| Share of bookings completed once the deposit is shown | Shows that holds remove the barrier that deposits create |
| Time from return to release of the hold | Shows the renter's money is truly free again |
| Share of rentals settled with no charge | Shows how many customers never experience a deposit at all |
| Share of claims accepted without contest | Shows that the evidence is convincing |
| Disputes per thousand rentals | Shows that disagreements are being settled early |
| Damage cost recovered against damage cost incurred | Shows that shops are being made whole |
| Time taken for handover and return | Shows that the routine fits a busy counter. Measured since 28 October 2026: the owner's Today page gives the month's median from opening each handover or return to sealing it, with the number of sessions, leaving out sample rentals and sample photographs |
| Cases where the AI deferred to a person, and how they ended | Shows the system knows its limits |
| Clean returns the comparison wrongly flagged in testing, as a count | The error that harms renters, published |
| Average hold for a returning renter against a new one | Shows that care is rewarded |
| Share of contested claims settled without waiting for the owner | Shows that advocates resolve what used to wait |
| Share of the morning queue approved unchanged | Shows the agent proposes what the owner would do |
| Bookings made through an AI assistant | Shows shops can be reached by the next kind of customer |

---

## 14. What the hackathon version shows

The submission demonstrates one shop and three rentals, end to end, in the PayPal sandbox:

1. The owner sets up items, a damage price list and a wear policy in plain language.
2. A renter books, pays the rental fee and has a hold placed.
3. Staff complete a guided handover and the renter confirms the condition.
4. **A clean return:** the comparison finds nothing and the hold is released in seconds.
5. **A return with damage:** the new mark is outlined, matched to the price list, approved by a person, charged in part, and the rest released.
6. **A contested claim:** the renter replies, the owner reviews both sides and adjusts the charge.
7. The item passport shows the item's history across the three rentals.
8. The owner asks the assistant about open holds and releases one by instruction. (Planned, not in this build.)

On top of those eight steps, in this order, each only once the one before it works:

9. **The accuracy scorecard.** The comparison's test results, with counts, on a public page.
10. **The morning queue.** The operations agent's overnight findings, approved by the owner in one screen.
11. **The Clean Record.** A returning renter is offered a lower hold and told why.
12. **Renting through an assistant.** An AI assistant quotes and books, and the renter approves in PayPal.
13. **Advocates.** A contested claim is settled between two advocates and confirmed by both people.
14. **The incident desk,** if time allows. A scratch is reported and agreed during the rental.

**Where it runs.** In a web browser on any phone. Staff and renters install nothing. A native app for iOS and Android is in the repository, but it is not part of this submission's demonstration.

**The story in the video** follows Tomás, Jonas and Priya. It opens on the moment a customer hears the word "deposit" and hesitates, and closes on a clean return where nothing was ever charged.

**How it answers the judging criteria:**

- **Technological implementation.** The fullest use of PayPal's authorize, capture, renew and release flow, supported by checkout with PayPal's own button, invoicing, refunds, disputes with evidence, verified webhooks and PayPal's MCP server, each doing a necessary job. The Agent Toolkit was considered for the assistant's payment step and not used, because its order tool takes an amount from the model. AI agents on both sides of the rental, all behind the same checks, with PayPal's MCP server as working plumbing and the comparison's accuracy measured in public.
- **Design.** A complete product for owner, staff and renter, with a counter routine that takes under a minute.
- **Potential impact.** A specific audience with a familiar, costly problem, and a demonstration that removes it. Careful renters earn smaller holds wherever they rent.
- **Innovation.** The deposit and the evidence joined into one object, with human approval and renter visibility built in. Two agents settling a claim from shared evidence, each inside limits a person wrote.
- **Presentation.** One bike, one scratch, one photograph that settles it.

---

## 15. Roadmap

- **Next.** Pilot with a small number of real rental shops through one season. Tune the photo plans for the most common item types.
- **Then.** A version for rental marketplaces and peer-to-peer lending. Connections to the booking tools shops already use.
- **Later.** Repair partners who quote directly from the evidence. Listing Hold shops in the places where AI assistants look for things to rent, as those services open to rentals. An independent party to run the renter's advocate.

Two items that stood under "Later" in the first draft are now part of the hackathon version: booking through an AI assistant, and a record that lets a careful renter be trusted by a shop they have never visited.

---

## 16. Open questions

These need answers before Hold goes to real shops. None of them blocks the hackathon version.

- **How accurate is the comparison in real shop conditions?** Outdoor light, wet or dirty items and hurried photographs will all test it.
- **What is the right hold for each item type?** Too small protects nothing. Too large brings back the original problem.
- **How should very long rentals be protected** once a hold has reached the end of its life?
- **What do consumer protection rules require** in each country for holds, damage charges and the renter's right to reply?
- **How long may photographs be kept**, and where?
- **What will shops pay?** The pricing in section 11 is a proposal.
- **Who should run the renter's advocate?** In the first version Hold runs both. An independent party may be the right answer for real shops.
- **What must a renter be told before an agent acts for them?** The wording of that consent will differ by country.

---

## 17. Sources

Check each of these against the original before the submission is filed.

- **PayPal Developer documentation, "Authorize a payment and capture funds later":** an authorization holds funds for up to 29 days, with a three-day period in which capture is best assured, and can be renewed within that window. https://developer.paypal.com/docs/checkout/standard/customize/authorization
- **American Rental Association quarterly forecast, as reported by Rental Equipment Register:** roughly $83.5 billion in United States construction, industrial and general tool rental revenue forecast for 2026, and about $6.2 billion in event rental. The two figures come from different quarterly updates. https://www.rermag.com/news-analysis/headline-news/article/55400064/aras-latest-quarterly-forecast-projects-continuing-growth-through-2028
- **Booqable, "Simplify equipment rental security deposits with credit card pre-authorizations":** evidence that card holds for deposits already exist in rental software, with a capture window of about seven days. https://booqable.com/blog/authorize-credit-card-holds/
- **Australian Computer Society, "Hertz faces backlash over AI car scanners", 2025:** reporting on customer reaction to automated damage charges. https://ia.acs.org.au/article/2025/hertz-faces-backlash-over-ai-car-scanners.html

- **PayPal AI Hackathon official rules, read on 13 October 2026:** the five equally weighted judging criteria, the submission deadline of 12 November 2026 at 12:00 pm Pacific Time, and the limit of one Grand Prize or one Honorable Mention, plus one Sponsor Prize. https://paypalaihackathon.devpost.com/rules
- **PayPal Developer documentation, "Agent tools reference":** the tools PayPal offers to AI agents, which include none to place, renew, release or partly capture a hold. https://developer.paypal.com/ai-tools/agent-tools/

No reliable published figure was found for how many customers abandon a rental because of a deposit, or for how long deposit refunds take. The statements on those points in section 2 are qualitative. Interviews with real shop owners before submission would replace them with evidence.
