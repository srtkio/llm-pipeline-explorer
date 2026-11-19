import { EOW } from './bpe'

export const DEFAULT_CORPUS = `the king and the queen ruled the kingdom from the palace.
the prince and the princess were playing in the royal garden.
a cat chased a mouse while the dog was sleeping by the door.
the kitten and the puppy were playing together on the floor.
she cooked rice and bread for dinner, then baked a sweet cake.
he was running, jumping and swimming at the beach all morning.
the happy child smiled, the sad child cried, the angry child shouted.
we were walking, talking and laughing in the cold rain.
apples, bananas and oranges are fruits; carrots and onions are vegetables.
the doctor and the nurse helped the patient at the hospital.
the teacher taught the students, and the students learned quickly.
the king was happy, and the queen was kind to the people of the kingdom.`

export const DEFAULT_SENTENCE = 'the kittens were happily playing in the kingdom'

export const INK = ['#F2C14E', '#F28482', '#84DCC6', '#B8B8FF', '#8ECAE6', '#F7B267']

export function inkFor(text: string) {
  let h = 0
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) | 0
  return INK[Math.abs(h) % INK.length]
}

export const stripEow = (t: string) => t.endsWith(EOW) ? t.slice(0, -EOW.length) : t

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
