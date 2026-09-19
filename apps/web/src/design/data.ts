export const types = ['Books', 'Movies', 'Articles', 'Podcasts', 'YouTube', 'Songs'] as const
export type MediaType = (typeof types)[number]
export type Item = {
  id: number
  type: MediaType
  title: string
  creator: string
  year: string
  color: string
  ink: string
  motif: number
  detail: string
  description: string
  dates: string[]
  queue?: boolean
  rating?: string
}
const books = [
  [
    'The Creative Act',
    'Rick Rubin',
    '2023',
    '#d5d0b7',
    '#242d27',
    '432 pages',
    'A meditation on noticing, making, and finding a creative practice in everyday life.',
  ],
  [
    'The Dispossessed',
    'Ursula K. Le Guin',
    '1974',
    '#c96c48',
    '#292926',
    '387 pages',
    'A physicist travels between two worlds, testing the boundaries of freedom, belonging, and possibility.',
  ],
  [
    'Ways of Seeing',
    'John Berger',
    '1972',
    '#344c6a',
    '#eadfc6',
    '166 pages',
    'An invitation to look again at the images around us, and the assumptions we bring to them.',
  ],
  [
    'Piranesi',
    'Susanna Clarke',
    '2020',
    '#a7b7b4',
    '#233d41',
    '272 pages',
    'Within a house of infinite halls and tides, an unexpected visitor changes everything.',
  ],
  [
    'A Swim in a Pond in the Rain',
    'George Saunders',
    '2021',
    '#c3b34d',
    '#25312d',
    '410 pages',
    'Seven stories become a conversation about how fiction works and how closely we can learn to read.',
  ],
  [
    'The Left Hand of Darkness',
    'Ursula K. Le Guin',
    '1969',
    '#657477',
    '#ece1cc',
    '304 pages',
    'An envoy crosses a frozen world, discovering the limits of his own understanding.',
  ],
  [
    'The Art of Noticing',
    'Rob Walker',
    '2019',
    '#d4b097',
    '#722f32',
    '256 pages',
    'Small experiments in paying attention to a world that is easily overlooked.',
  ],
  [
    'Invisible Cities',
    'Italo Calvino',
    '1972',
    '#776b92',
    '#f0dfc4',
    '165 pages',
    'Imagined cities unfold as portraits of memory, desire, and the places we inhabit.',
  ],
]
export const items: Item[] = books.map((b, i) => ({
  id: i,
  type: 'Books',
  title: b[0]!,
  creator: b[1]!,
  year: b[2]!,
  color: b[3]!,
  ink: b[4]!,
  detail: b[5]!,
  description: b[6]!,
  motif: i,
  dates:
    i === 6
      ? []
      : [
          `2026-09-${String(18 - i * 2).padStart(2, '0')}`,
          ...(i === 1 ? ['2026-08-12', '2022-04-19'] : []),
        ],
  rating: i % 3 === 0 ? '★★★★★' : '★★★★',
  queue: i > 5,
}))
const other: [MediaType, string, string, string, string][] = [
  ['Movies', 'Perfect Days', 'Wim Wenders', '2023', '124 min'],
  ['Movies', 'Chungking Express', 'Wong Kar-wai', '1994', '102 min'],
  ['Movies', 'The Long Goodbye', 'Robert Altman', '1973', '112 min'],
  ['Movies', 'Paris, Texas', 'Wim Wenders', '1984', '145 min'],
  ['Articles', 'The art of paying attention', 'The Marginalian', '2026', '12 min read'],
  ['Articles', 'In praise of the Midwest', 'Chris Arnade', '2026', '10 min read'],
  ['Articles', 'On Being a Senior Engineer', 'Kitchen Soap', '2012', '20 min read'],
  ['Articles', 'Internal Combustion Engine', 'Bartosz Ciechanowski', '2021', '23 min read'],
  ['Podcasts', 'The architecture of everyday life', '99% Invisible', '2026', '48 min'],
  ['Podcasts', 'A conversation about attention', 'The Ezra Klein Show', '2026', '76 min'],
  ['Podcasts', 'How we learn to see', 'Design Matters', '2026', '54 min'],
  ['YouTube', 'How a film finds its rhythm', 'Every Frame a Painting', '2024', '12 min'],
  ['YouTube', 'The quiet geometry of a city', 'The B1M', '2026', '18 min'],
  ['YouTube', 'A study of light and shadow', 'Nerdwriter1', '2025', '9 min'],
  ['Songs', 'Everything In Its Right Place', 'Radiohead · Kid A', '2000', '4:11'],
  ['Songs', 'Open Eye Signal', 'Jon Hopkins · Immunity', '2013', '7:51'],
  ['Songs', 'Teardrop', 'Massive Attack · Mezzanine', '1998', '5:30'],
  ['Songs', 'Avril 14th', 'Aphex Twin · Drukqs', '2001', '2:05'],
]
other.forEach((b, i) =>
  items.push({
    id: i + 8,
    type: b[0],
    title: b[1],
    creator: b[2],
    year: b[3],
    detail: b[4],
    color: ['#698b85', '#b95a3f', '#c4b67f', '#778699'][i % 4]!,
    ink: '#f5eada',
    motif: i,
    description: `${b[1]} — a sample ${b[0].toLowerCase()} item for exploring this library layout.`,
    dates: [
      `2026-09-${String(18 - (i % 15)).padStart(2, '0')}`,
      ...(i % 3 === 0 ? ['2026-08-14'] : []),
    ],
    queue: i % 3 === 2,
    ...(b[0] === 'Movies' ? { rating: '★★★★½' } : {}),
  }),
)
export const sources: Record<MediaType, string> = {
  Books: 'Hardcover',
  Movies: 'Letterboxd',
  Articles: 'Readwise Reader',
  Podcasts: 'Spotify',
  YouTube: 'YouTube',
  Songs: 'Spotify',
}
export const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
