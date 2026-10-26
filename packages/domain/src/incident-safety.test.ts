import { describe, expect, it } from 'vitest'
import { mentionsSafety } from './incident-safety.ts'

describe('the safety check over a renter’s words', () => {
  it.each([
    // English
    'Someone was hurt when the bike tipped over',
    'I fell off at the corner',
    'The frame has a crack near the pedals',
    'The brakes stopped working downhill',
    'The battery is smoking and smells of fire',
    'Battery got very hot and swollen',
    'My son is bleeding from his knee',
    // French
    'Mon ami est blessé',
    'Le cadre est fissuré',
    'Les freins ne marchent plus',
    'La batterie fume',
    'Je suis tombé dans la descente',
    // Spanish
    'Mi hija está herida',
    'El cuadro tiene una grieta',
    'Los frenos no funcionan',
    'La batería echa humo',
    'Tuve un accidente con un coche',
    // German
    'Mein Freund ist verletzt',
    'Der Rahmen hat einen Riss',
    'Die Bremse funktioniert nicht',
    'Der Akku raucht',
    'Ich bin gestürzt',
  ])('routes “%s” to a person', (description) => {
    expect(mentionsSafety(description)).toBe(true)
  })

  it.each([
    'A scratch on the left side of the frame after leaning it on a bike rack',
    'Une rayure sur le garde-boue',
    'Un arañazo en la pintura del guardabarros',
    'Ein Kratzer am Schutzblech',
    'The battery will not charge',
    'The bike is gone from where I locked it',
  ])('leaves “%s” to the sorting', (description) => {
    expect(mentionsSafety(description)).toBe(false)
  })

  it('reads capitals and accents as their plain letters', () => {
    expect(mentionsSafety('LES FREINS SONT CASSÉS')).toBe(true)
    expect(mentionsSafety('Der Akku ist ÜBERHITZT')).toBe(true)
  })
})
