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

export const PRESETS = [
  { name: 'Royalty, animals, food', sentence: 'the princess was playing with the puppies in the castle', corpus: `the king and the queen ruled the kingdom from the castle.
the prince and the princess danced in the royal palace.
the cat chased the mouse while the dog barked at the horse.
the kitten, the puppy and the foal were playing in the field.
she baked bread, cooked rice and sliced fresh apples and mangoes.
he was eating bananas, oranges, grapes and cherries for lunch.
the king, the queen and the prince were eating cake in the palace.` },
  { name: 'Word endings', sentence: 'the unhappy players were replaying the jumping game', corpus: `play played playing player players playful replay
jump jumped jumping jumper jumpers
walk walked walking walker walkers
teach teacher teaching taught teachers
happy happier happiest happily unhappy happiness
kind kinder kindest kindly unkind kindness
run runner running runs` },
  { name: 'Feelings, weather, places', sentence: 'the joyful nurse walked to the sunny beach after school', corpus: `she felt happy and joyful when the sun was shining.
he was sad and lonely while the rain was falling.
the angry man shouted, the calm woman smiled.
it was cold and snowy in the mountains, warm and sunny on the beach.
the doctor and the nurse worked in the hospital.
the teacher and the student met at the school.
the pilot flew the plane from the airport to the city.` },
]
