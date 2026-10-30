/**
 * Small, source-checked excerpt set shared by Chat and its retained design review.
 * Review candidates and provenance limits: docs/design/tolkien-quote-candidates.md.
 * Keep stable IDs so the owner can veto individual entries with enabled: false.
 */
export interface TolkienQuote {
  id: string
  text: string
  attribution: string
  work: string
  location: string
  sourceHref: string
  enabled: boolean
}

export const tolkienQuotes: readonly TolkienQuote[] = [
  {
    id: 'hobbit-001',
    text: 'Good morning!',
    attribution: 'Bilbo Baggins',
    work: 'The Hobbit',
    location: 'Chapter I: An Unexpected Party',
    sourceHref: 'https://en.wikiquote.org/wiki/The_Hobbit#Chapter_I:_An_Unexpected_Party',
    enabled: true,
  },
  {
    id: 'hobbit-009',
    text: 'Never laugh at live dragons, Bilbo you fool!',
    attribution: 'Bilbo Baggins',
    work: 'The Hobbit',
    location: 'Chapter XII: Inside Information',
    sourceHref: 'https://en.wikiquote.org/wiki/The_Hobbit#Chapter_XII:_Inside_Information',
    enabled: true,
  },
  {
    id: 'fellowship-007',
    text: 'Courage is found in unlikely places.',
    attribution: 'Gildor Inglorion',
    work: 'The Fellowship of the Ring',
    location: 'Book I: Three is Company',
    sourceHref: 'https://en.wikiquote.org/wiki/The_Fellowship_of_the_Ring#Three_is_Company',
    enabled: true,
  },
  {
    id: 'fellowship-009',
    text: 'Not all those who wander are lost',
    attribution: 'Bilbo Baggins, verse about Aragorn',
    work: 'The Fellowship of the Ring',
    location: 'Book I: Strider',
    sourceHref: 'https://en.wikiquote.org/wiki/The_Fellowship_of_the_Ring#Strider',
    enabled: true,
  },
  {
    id: 'towers-004',
    text: 'Not so hasty!',
    attribution: 'Treebeard',
    work: 'The Two Towers',
    location: 'Book III: Treebeard',
    sourceHref: 'https://en.wikiquote.org/wiki/The_Two_Towers#Treebeard',
    enabled: true,
  },
  {
    id: 'return-010',
    text: "Well, I'm back",
    attribution: 'Samwise Gamgee',
    work: 'The Return of the King',
    location: 'Book VI: The Grey Havens',
    sourceHref: 'https://en.wikiquote.org/wiki/The_Return_of_the_King#The_Grey_Havens',
    enabled: true,
  },
]
