# Raw photographs for the evaluation set

These are the raw photographs that `pnpm --filter @hold/eval augment --raw eval/raw` turns into the evaluation set. They start from freely licensed photographs on Wikimedia Commons, not photographs taken for this project. None shows a person.

## Licence

Every photograph here, and every pair the augmentation tool builds from them, is a derivative of a CC BY-SA 4.0 work. They are therefore shared under the same licence, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). This is separate from the MIT licence of the code. `/reliability` credits the authors and the licence.

## The originals

The full-size originals are in `originals/`, unchanged.

| Local file | Commons file | Author | Taken | Used as |
|---|---|---|---|---|
| `urwahn-mural-1559.jpg` | [Urwahn E-Bike „Platzhirsch“.jpg](https://commons.wikimedia.org/wiki/File:Urwahn_E-Bike_%E2%80%9EPlatzhirsch%E2%80%9C.jpg) | Writtenby | 26 March 2021 | Bike A: the handover, and the source of every generated return |
| `rm-new-charger-right.jpg` | [Riese und Müller New Charger S-Pedelec rechts.jpg](https://commons.wikimedia.org/wiki/File:Riese_und_M%C3%BCller_New_Charger_S-Pedelec_rechts.jpg) | Sänger | 18 September 2018 | Bike B, the wrong item |
| `urwahn-mural-1536.jpg` | [E-Bike Urwahn „Platzhirsch“.jpg](https://commons.wikimedia.org/wiki/File:E-Bike_Urwahn_%E2%80%9EPlatzhirsch%E2%80%9C.jpg) | Writtenby | 26 March 2021 | Not used (see below) |
| `urwahn-fence-0324.jpg` | [Urwahn Platzhirsch.jpg](https://commons.wikimedia.org/wiki/File:Urwahn_Platzhirsch.jpg) | Writtenby | 24 March 2021 | Not used (see below) |
| `urwahn-teufelsberg.jpg` | [Urwahn Platzhirsch am Berliner Teufelsberg.jpg](https://commons.wikimedia.org/wiki/File:Urwahn_Platzhirsch_am_Berliner_Teufelsberg.jpg) | Writtenby | 26 March 2021 | Not used (see below) |

### Why three real re-shots are not used

The same Urwahn was photographed on two days in three places. The first set used those shots as the returns.

The comparison trusts a pair only when the return lines up with the handover, at 92 percent similarity or better. Shots from another place, with another background, never line up that closely. A run on 29 October sent all 144 such pairs to a person without calling the model.

In a shop, the return is taken at the same counter, framed with the handover overlay. The returns are therefore generated to match that.

## What is real and what is generated

- **Real.** `A-s1-<view>.jpg`, cut from the handover photograph, and `B-s1-<view>.jpg`, cut from the other bike.
- **Generated.** `A-s2-<view>.generated.jpg` to `A-s4-<view>.generated.jpg` are re-shots made from the handover original, not taken. The augmentation tool reads `.generated` in the name and marks every pair built on them as synthetic, so only the wrong-item and reused-photograph pairs count as real.

### How a re-shot is generated

Each re-shot re-cuts the view from the original photograph with each corner nudged by up to 1.5 percent of the view. That is a small camera move, as a hand-held phone makes, with no empty borders. Then it changes:
- brightness by up to 8 percent;
- colour, contrast and white balance by less;
- the sensor noise.

It is saved at JPEG quality 84 to 92. It is never blurred, because the phone's quality check refuses a blurred photograph before upload.

Larger moves were tried. At 2 percent, a quarter of the re-shots already break the comparison's limit of eight changed regions, against busy brick and spokes. At 1.5 percent, 16 of 18 pass. The two that fail are wheel close-ups, where one-pixel spokes against brick turn any tiny misalignment into changed regions.

The set itself is built with `pnpm --filter @hold/eval augment --raw eval/raw --seed 2`. Seed 2 replaced seed 1 on 29 October, to refresh the gate half after a change made in answer to it.

The generator lives outside the repository. Its settings are recorded here: corner nudge 0.015, light 0.08, seed 29, three re-shots per view.

## Cutting the views

Each photograph is cut into six views of the same part of the bike: `rear-wheel`, `front-wheel`, `drivetrain`, `frame`, `cockpit` and `full-side`. Each view is placed relative to the two wheel hubs and measured in wheelbases, then reduced to at most 1600 pixels on its long side. The pipeline works on 1280 pixels, so nothing above that is used. EXIF data, including any location, is dropped.

| Photograph | Rear hub | Front hub |
|---|---|---|
| A, the handover | 0.236, 0.667 | 0.752, 0.665 |
| B | 0.202, 0.495 | 0.696, 0.686 |

The hub positions are fractions of the upright photograph's width and height.

| View | Centre | Width and height |
|---|---|---|
| rear-wheel | 0.02, 0.00 | 0.78, 0.78 |
| front-wheel | 1.00, 0.00 | 0.78, 0.78 |
| drivetrain | 0.33, -0.04 | 0.56, 0.42 |
| frame | 0.55, 0.30 | 0.62, 0.465 |
| cockpit | 0.85, 0.52 | 0.44, 0.33 |
| full-side | 0.52, 0.25 | 1.80, 1.20 |

Centres and sizes are in wheelbases, measured along the wheelbase from the rear hub and then upward.

## The masks

Each of bike A's photographs has a mask beside it: `A-s1-<view>.mask.png`, or `A-s2-<view>.generated.mask.png` for a re-shot. It is white where the yellow frame is and black everywhere else. The augmentation tool draws damage and known marks only on the white part. Without a mask it picks the most detailed place in the photograph, which here is often the brick mural.

The masks were made by colour:
- **Colour band.** Pillow hue 23 to 34 of 255, with saturation and brightness above 125 and 70. The frame paint sits at hue 24 to 31 and saturation 133 to 197. The sand at the foot of the mural sits at saturation 75 to 119.
- **Cleanup.** Specks were removed, and only the frame's large connected pieces were kept.
- **Margin.** The mask was eroded slightly, so a mark's centre sits on the tube rather than its edge.

## The drawn damage

All damage is drawn by `eval/src/damage.ts` on the return photograph, inside the frame's mask, and labelled with the exact box it changed. It is drawn from the photograph's own pixels, so it keeps the light on the tube:
- **Chip.** Bare aluminium, the photograph's light without its colour, with grain, a pale primer ring, a broken paint edge and shading across the tube.
- **Scratch.** A thin, broken line that lightens the paint, with a faint shadow.
- **Crack.** A fine dark line with a branch.
- **Dent.** A shadowed hollow and a highlight, with no change of colour.
- **Scuff.** A soft abraded patch with fine parallel scrape lines.

There are no missing-part pairs: a missing part cannot be drawn believably.

## What to expect from a run

A dry run on 29 October passed every gate pair through the steps before the model: the reuse check and the alignment.

| Group | Reaches the model | Reused, to a person | Refused, to a person |
|---|---|---|---|
| Clean, easy | 21 | 2 | 7 |
| Clean, hard | 6 | 6 | 18 |
| Wear | 13 | 4 | 4 |
| Damage | 21 | 6 | 15 |
| Known mark | 8 | 2 | 5 |
| Wrong item or reused | 0 | 9 | 3 |

Every pair sent to a person counts as "Sent to a person", and the scorecard reports that separately. Deferring is never counted as an error, and never as a success.
