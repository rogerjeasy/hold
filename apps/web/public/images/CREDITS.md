# Photograph credits

The eight photographs come from Unsplash, whose license allows free commercial use without attribution. Credit is given anyway, here and in the site footer.

| File | Source | Photographer | Edits |
|---|---|---|---|
| `frame-handover.jpg` | https://unsplash.com/photos/blue-bicycle-frame-handlebars-and-front-wheel-on-black-LEOTyGdbpu4 | Florian (falmdesign) | Cropped to 21:9. The tyre maker's name and two frame badges retouched out. A faint scuff drawn on the down tube. |
| `frame-return.jpg` | Same photograph | Florian (falmdesign) | As above, plus a scratch drawn on the down tube. |
| `shop.jpg` | https://unsplash.com/photos/multiple-bicycles-stored-on-shelves-in-a-garage-XwZKcZes8xo | Nuno Alves | Cropped to 16:9. |
| `sample-handover.jpg` | Same photograph as `frame-handover.jpg` | Florian (falmdesign) | `frame-handover.jpg` resized to 1600 pixels wide and brightened (gain 2, offset 12), so it passes the handover's photo check. The sample photograph staff can use in a demonstration, said to be one on screen. |
| `sample-return-damage.jpg` | Same photograph as `frame-return.jpg` | Florian (falmdesign) | `frame-return.jpg` given the same resize and brightening as `sample-handover.jpg`, then a chip in the paint drawn on the down tube, about 130 pixels long: a jagged outline in primer grey and bare metal with paint flakes. The sample a return can use to show damage, said to be one on screen. |
| `sample-return-contested.jpg` | Same photograph as `frame-handover.jpg` | Florian (falmdesign) | `frame-handover.jpg` given the same resize and brightening as `sample-handover.jpg`, then a scratch through the paint drawn on the down tube, about 130 pixels long, running on from the faint scuff, which stays visible at its lower end. The sample a return can use for a claim the renter contests, said to be one on screen. |
| `sample-drop-point.jpg` | https://unsplash.com/photos/a-bicycle-parked-outside-a-building-with-address-ia1dpGctSUc | leon lee (liyongfun) | Cropped to 4:3 at 1200 by 900, which takes the street address on the wall out of the frame. Where a renter left the e-bike in the sample return made with nobody at the counter, said to be a sample on screen. |
| `renter.jpg` | https://unsplash.com/photos/a-person-riding-a-bike-with-a-cell-phone-in-their-hand-IQpw1eRRGjo | Krzysztof Kowalik | Cropped to 16:9. |

The scratches, the scuff and the chip on the frame are drawn on. They are not real damage. The site says "Illustrative photographs" beside them.

Replace `frame-handover.jpg` and `frame-return.jpg` with a real handover and return pair before submission. `docs/tech-stack.md` section 16, item 4 asks for that pair. Keep the 21:9 crop, and update the mark positions in `src/features/marketing/evidence-photo.ts`.

## The hero film

`public/video/hero-wide.mp4`, `public/video/hero-tall.mp4`, `hero/hero-wide-still.webp` and `hero/hero-tall-still.webp` are Hold's own work: a Three.js scene of a city bike and an e-scooter modelled in code, rendered frame by frame in a browser and encoded with ffmpeg. No photograph, model or music from anyone else is in them. The still is frame 186 of the 360, where the brackets have closed on the chip.
