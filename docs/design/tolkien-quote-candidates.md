# Tolkien passage candidates for the Chat empty state

Research date: October 30, 2026. Scope: the isolated Chat review, not production.

There are **100 review candidates below**, each identified by a stable ID. Their
labels are original descriptions of passages, **not Tolkien quotations and not
display copy**. This is a selection aid, not a reproduced 100-quote anthology.
The books and films remain copyrighted; this catalog therefore pairs concise
descriptions with source references and supplies only a small excerpt starter set.

The six actual display excerpts live together in
[`tolkien-quotes.ts`](../../apps/web/src/chat-review/tolkien-quotes.ts).
Each has an `enabled` flag: set it to `false` to veto an entry. The other 94
candidates have no display text and cannot enter random selection from this list.
Additional text can be supplied by the owner or added under an appropriate
permission; selecting a candidate here does not supply or authorize its wording.

## Evidence and review rules

All ten linked Wikiquote pages were consulted. They are secondary, collaboratively
edited transcription sources, not publisher editions or authoritative screenplays.
Book locators below follow their chapter headings; speaker names are identified
where explicit or clear in the cited passage. A question mark means the source
does not independently establish that attribution. No page numbers are asserted.
Film locators are source-page speaker sections, **not verified scene timestamps**;
film cut and exact scene placement remain unverified unless stated otherwise.
Film lines are adaptation dialogue, not automatically Tolkien's book wording.
Bilbo's authorship of the wandering verse is also cross-checked against
[Tolkien Gateway's poem index](https://tolkiengateway.net/wiki/Poems_in_The_Lord_of_the_Rings).

Fit is an editorial recommendation: **A** = promising for a calm empty state;
**B** = optional, comic, long, or dependent on context; **C** = defer because of
threats, insult, grief, combat, or major spoilers. A fit recommendation does not
mean an excerpt is enabled. All 100 are reviewable, including possible vetoes.

The starter set has **29 quoted words**: 10 from _The Hobbit_ and 19 across
_The Lord of the Rings_ (13 Fellowship, 3 Towers, 3 Return). Each excerpt is
under ten words. The wandering verse and Sam's closing dialogue omit the trailing
semicolon/comma belonging to the surrounding source passage; the quoted words
are unchanged. No film dialogue is copied.
Attributions and work/chapter titles are metadata, excluded from excerpt counts.

## Books — 40 candidates

### The Hobbit (1937)

Source for every row: [Wikiquote: The Hobbit][H]. Locators are chapter numbers.
I = An Unexpected Party; III = A Short Rest; IV = Over Hill and Under Hill;
XII = Inside Information; XVIII = The Return Journey.

| ID         | Passage description                       | Speaker  | Chapter | Theme        | Fit        |
| ---------- | ----------------------------------------- | -------- | ------- | ------------ | ---------- |
| hobbit-001 | Morning greeting                          | Bilbo    | I       | Welcome      | A; starter |
| hobbit-002 | Ambiguous greeting unpacked               | Gandalf  | I       | Curiosity    | A          |
| hobbit-003 | Recruiting an adventurer                  | Gandalf  | I       | Invitation   | A          |
| hobbit-004 | Adventures disrupt dinner                 | Bilbo    | I       | Comfort      | B          |
| hobbit-005 | Unexpected reserves within Bilbo          | Gandalf? | I       | Potential    | A          |
| hobbit-006 | Practical questions before departure      | Bilbo    | I       | Preparation  | B          |
| hobbit-007 | Pleasant days resist retelling            | Narrator | III     | Storytelling | A          |
| hobbit-008 | Searching produces unexpected discoveries | Narrator | IV      | Discovery    | A          |
| hobbit-009 | Bilbo rebukes his dragon teasing          | Bilbo    | XII     | Caution      | B; starter |
| hobbit-010 | Hospitality outranks accumulated wealth   | Thorin?  | XVIII   | Contentment  | A          |

### The Fellowship of the Ring (1954)

Source: [Wikiquote: The Fellowship of the Ring][F]. Book I locators:
1 = A Long-expected Party; 2 = The Shadow of the Past;
3 = Three is Company; 10 = Strider. II.5 = The Bridge of Khazad-dûm.

| ID             | Passage description                     | Speaker                  | Chapter | Theme       | Fit        |
| -------------- | --------------------------------------- | ------------------------ | ------- | ----------- | ---------- |
| fellowship-001 | Birthday speech's teasing arithmetic    | Bilbo                    | I.1     | Neighbors   | B          |
| fellowship-002 | Choosing our use of time                | Gandalf                  | I.2     | Agency      | A          |
| fellowship-003 | Mercy's unforeseen consequences         | Gandalf                  | I.2     | Compassion  | A          |
| fellowship-004 | Limits of judging another's fate        | Gandalf                  | I.2     | Humility    | A          |
| fellowship-005 | Paths becoming an unpredictable journey | Bilbo, recalled by Frodo | I.3     | Discovery   | A          |
| fellowship-006 | Advice carries responsibility           | Gildor                   | I.3     | Discernment | A          |
| fellowship-007 | Unexpected sources of bravery           | Gildor                   | I.3     | Courage     | A; starter |
| fellowship-008 | Elvish answers evade certainty          | Frodo                    | I.3     | Ambiguity   | B          |
| fellowship-009 | Wandering need not mean confusion       | Bilbo's verse            | I.10    | Exploration | A; starter |
| fellowship-010 | Escape urged at the bridge              | Gandalf                  | II.5    | Urgency     | C          |

### The Two Towers (1954)

Source: [Wikiquote: The Two Towers][T]. All locators are in Book III:
2 = The Riders of Rohan; 4 = Treebeard; 5 = The White Rider;
6 = The King of the Golden Hall.

| ID         | Passage description                  | Speaker   | Chapter | Theme        | Fit        |
| ---------- | ------------------------------------ | --------- | ------- | ------------ | ---------- |
| towers-001 | Present lives become future legends  | Aragorn   | III.2   | Storytelling | A          |
| towers-002 | Moral judgment across peoples        | Aragorn   | III.2   | Discernment  | A          |
| towers-003 | Beginning despite uncertain outcomes | Aragorn   | III.2   | Courage      | A          |
| towers-004 | Resisting premature answers          | Treebeard | III.4   | Patience     | A; starter |
| towers-005 | Names accumulate personal history    | Treebeard | III.4   | Memory       | A          |
| towers-006 | Language deserves time and attention | Treebeard | III.4   | Listening    | A          |
| towers-007 | Grieving the destroyed groves        | Treebeard | III.4   | Stewardship  | C          |
| towers-008 | Private conversation with oneself    | Gandalf   | III.5   | Humor        | B          |
| towers-009 | Unity over internal quarrels         | Gandalf   | III.6   | Fellowship   | A          |
| towers-010 | Personal judgment amid uncertainty   | Háma      | III.6   | Trust        | A          |

### The Return of the King (1955)

Source: [Wikiquote: The Return of the King][R]. Book V:
1 = Minas Tirith; 2 = The Passing of the Grey Company;
3 = The Muster of Rohan; 5 = The Ride of the Rohirrim.
VI.7 = Homeward Bound; VI.9 = The Grey Havens.

| ID         | Passage description                    | Speaker                       | Chapter | Theme       | Fit        |
| ---------- | -------------------------------------- | ----------------------------- | ------- | ----------- | ---------- |
| return-001 | Caring beyond any single kingdom       | Gandalf                       | V.1     | Stewardship | A          |
| return-002 | Generosity outweighing guarded advice  | Unspecified                   | V.1     | Generosity  | A          |
| return-003 | Rash action misses its mark            | Aragorn                       | V.2     | Patience    | A          |
| return-004 | Confinement as deepest fear            | Éowyn                         | V.2     | Freedom     | B          |
| return-005 | Determination opens possibilities      | Éowyn as Dernhelm             | V.3     | Resolve     | A          |
| return-006 | Distant mountains become overwhelming  | Narrator, Merry's perspective | V.3     | Scale       | B          |
| return-007 | Advancing despite darkness             | Théoden                       | V.5     | Courage     | C          |
| return-008 | Returning home as changed people       | Frodo?                        | VI.7    | Change      | B          |
| return-009 | Friends becoming independently capable | Gandalf                       | VI.7    | Growth      | A          |
| return-010 | Sam's domestic return                  | Sam                           | VI.9    | Homecoming  | A; starter |

## Films — 60 candidates

These are separate adaptation candidates. Matching themes in book rows do not
establish identical dialogue or attribution. Locators below are the named
speaker sections of each linked page; no playback times have been checked.

### The Fellowship of the Ring (2001)

Source: [Wikiquote: Fellowship film][FF]. G = Gandalf the Grey;
Ga = Galadriel; B = Bilbo Baggins; O = Others.

| ID                  | Passage description                     | Speaker   | Section | Theme          | Fit |
| ------------------- | --------------------------------------- | --------- | ------- | -------------- | --- |
| film-fellowship-001 | Recognition after many years            | Gandalf   | G       | Reunion        | A   |
| film-fellowship-002 | Protecting a dangerous secret           | Gandalf   | G       | Responsibility | B   |
| film-fellowship-003 | Hobbits continually defy expectations   | Gandalf   | G       | Curiosity      | A   |
| film-fellowship-004 | Hidden help behind sternness            | Gandalf   | G       | Friendship     | B   |
| film-fellowship-005 | History fading into myth                | Galadriel | Ga      | Memory         | A   |
| film-fellowship-006 | Small people shaping great events       | Galadriel | Ga      | Agency         | A   |
| film-fellowship-007 | Starlight for a difficult journey       | Galadriel | Ga      | Hope           | A   |
| film-fellowship-008 | Exhaustion imagined as stretched butter | Bilbo     | B       | Rest           | B   |
| film-fellowship-009 | Planning a happy book ending            | Bilbo     | B       | Storytelling   | A   |
| film-fellowship-010 | Devotion pledged to a king              | Boromir   | O       | Fellowship     | C   |

### The Two Towers (2002)

Source: [Wikiquote: Towers film][TF]. G = Gandalf the White;
S = Sam Gamgee; Th = Théoden; O = Others.

| ID              | Passage description                      | Speaker   | Section | Theme        | Fit |
| --------------- | ---------------------------------------- | --------- | ------- | ------------ | --- |
| film-towers-001 | A timely unexpected return               | Gandalf   | G       | Renewal      | A   |
| film-towers-002 | Small arrivals initiate enormous change  | Gandalf   | G       | Agency       | A   |
| film-towers-003 | Awaiting help at sunrise                 | Gandalf   | G       | Hope         | A   |
| film-towers-004 | Recognizing a loyal companion            | Sam       | S       | Friendship   | A   |
| film-towers-005 | Stories sustain perseverance             | Sam       | S       | Storytelling | A   |
| film-towers-006 | Darkness gives way to renewal            | Sam       | S       | Hope         | A   |
| film-towers-007 | Defending the world's remaining goodness | Sam       | S       | Resolve      | A   |
| film-towers-008 | Battle's opening moment acknowledged     | Théoden   | Th      | Beginnings   | B   |
| film-towers-009 | Dwarvish preference for brief sprints    | Gimli     | O       | Humor        | B   |
| film-towers-010 | Speech deserving a listener's time       | Treebeard | O       | Attention    | A   |

### The Return of the King (2003)

Source: [Wikiquote: Return film][RF]. A = Aragorn;
G = Gandalf the White; Gi = Gimli; F = Frodo Baggins.

| ID              | Passage description                       | Speaker | Section | Theme       | Fit             |
| --------------- | ----------------------------------------- | ------- | ------- | ----------- | --------------- |
| film-return-001 | Friendship resists surrender              | Aragorn | A       | Courage     | A               |
| film-return-002 | Acting for an absent friend               | Aragorn | A       | Fellowship  | A               |
| film-return-003 | Rebuilding through shared peace           | Aragorn | A       | Renewal     | A               |
| film-return-004 | Honoring the hobbits' achievement         | Aragorn | A       | Gratitude   | A               |
| film-return-005 | A tree preserving civic hope              | Gandalf | G       | Renewal     | A; extended cut |
| film-return-006 | A strategy begins unfolding               | Gandalf | G       | Preparation | B               |
| film-return-007 | Newly earned respect for Pippin           | Gandalf | G       | Growth      | A               |
| film-return-008 | Competitive accounting after an oliphaunt | Gimli   | Gi      | Humor       | B               |
| film-return-009 | Cheerful response to poor odds            | Gimli   | Gi      | Resolve     | C               |
| film-return-010 | Familiar home after a journey             | Frodo   | F       | Homecoming  | A               |

### An Unexpected Journey (2012)

Source: [Wikiquote: Unexpected Journey][UJ]. B = Bilbo Baggins;
G = Gandalf the Grey; Ba = Balin; T = Thorin Oakenshield.

| ID                  | Passage description                      | Speaker | Section | Theme      | Fit |
| ------------------- | ---------------------------------------- | ------- | ------- | ---------- | --- |
| film-unexpected-001 | Excitement on leaving home               | Bilbo   | B       | Beginnings | A   |
| film-unexpected-002 | Home comforts remembered                 | Bilbo   | B       | Belonging  | A   |
| film-unexpected-003 | Travel without familiar comforts         | Gandalf | G       | Discovery  | A   |
| film-unexpected-004 | Backing an unlikely burglar              | Gandalf | G       | Confidence | A   |
| film-unexpected-005 | Greeting examined from every angle       | Gandalf | G       | Curiosity  | A   |
| film-unexpected-006 | Courage expressed through restraint      | Gandalf | G       | Mercy      | A   |
| film-unexpected-007 | Ordinary kindness resisting evil         | Gandalf | G       | Kindness   | A   |
| film-unexpected-008 | Bilbo inspires a wizard's courage        | Gandalf | G       | Friendship | A   |
| film-unexpected-009 | Recognizing someone worth following      | Balin   | Ba      | Trust      | A   |
| film-unexpected-010 | Character valued above military strength | Thorin  | T       | Fellowship | A   |

### The Desolation of Smaug (2013)

Source: [Wikiquote: Desolation][DS]. B = Bilbo Baggins;
T = Thorin Oakenshield; Ba = Balin; S = Smaug; Th = Thranduil.

| ID                  | Passage description                     | Speaker   | Section | Theme       | Fit |
| ------------------- | --------------------------------------- | --------- | ------- | ----------- | --- |
| film-desolation-001 | Courage concealing another discovery    | Bilbo     | B       | Courage     | B   |
| film-desolation-002 | Commitment despite uncertainty          | Bilbo     | B       | Resolve     | A   |
| film-desolation-003 | Flattering an overwhelming dragon       | Bilbo     | B       | Wit         | B   |
| film-desolation-004 | A traveller's riddling self-description | Bilbo     | B       | Identity    | A   |
| film-desolation-005 | Claiming a lost homeland                | Thorin    | T       | Belonging   | B   |
| film-desolation-006 | Fellowship facing a shared danger       | Thorin    | T       | Solidarity  | C   |
| film-desolation-007 | Hobbit courage continually surprises    | Balin     | Ba      | Potential   | A   |
| film-desolation-008 | Caution before disturbing a dragon      | Balin     | Ba      | Prudence    | B   |
| film-desolation-009 | Flattery's limits against danger        | Smaug     | S       | Discernment | C   |
| film-desolation-010 | Patience measured on elvish timescales  | Thranduil | Th      | Time        | C   |

### The Battle of the Five Armies (2014)

Source: [Wikiquote: Five Armies][FA]. B = Bilbo Baggins;
T = Thorin Oakenshield; G = Gandalf; Th = King Thranduil; D = Dwalin.

| ID              | Passage description                    | Speaker   | Section | Theme       | Fit            |
| --------------- | -------------------------------------- | --------- | ------- | ----------- | -------------- |
| film-armies-001 | Asking when victory becomes enough     | Bilbo     | B       | Contentment | A              |
| film-armies-002 | Friendship despite difficult manners   | Bilbo     | B       | Affection   | A              |
| film-armies-003 | An enduring invitation for tea         | Bilbo     | B       | Hospitality | A              |
| film-armies-004 | Requesting companions' trust again     | Thorin    | T       | Fellowship  | B              |
| film-armies-005 | Books and growing trees await          | Thorin    | T       | Home        | C; death scene |
| film-armies-006 | Home valued beyond treasure            | Thorin    | T       | Contentment | C; death scene |
| film-armies-007 | Humility within a vast world           | Gandalf   | G       | Perspective | A              |
| film-armies-008 | Affection alongside honest perspective | Gandalf   | G       | Friendship  | A              |
| film-armies-009 | Recalling a mother's love              | Thranduil | Th      | Love        | C              |
| film-armies-010 | A crown failing to confer greatness    | Dwalin    | D       | Character   | B              |

## Starter decisions and possible next choices

The six `starter` rows are enabled in the data file. Their word counts, in file
order, are 2, 8, 6, 7, 3, and 3. They mix welcome, humor, courage, exploration,
patience, and homecoming. The semicolon and dialogue comma are intentional
transcription fidelity, though the owner may prefer to veto those fragments.
The dragon entry includes a self-directed insult; it is a clear first veto if
the desired tone is entirely gentle. Film candidates remain review-only.

Strong next passages to review in an owned edition are `hobbit-008`,
`fellowship-002`, `towers-003`, `return-009`, `film-unexpected-007`, and
`film-armies-003`. No exact additional wording is supplied here. Review IDs can
be retained even if wording is later supplied from a different verified edition.

[H]: https://en.wikiquote.org/wiki/The_Hobbit
[F]: https://en.wikiquote.org/wiki/The_Fellowship_of_the_Ring
[T]: https://en.wikiquote.org/wiki/The_Two_Towers
[R]: https://en.wikiquote.org/wiki/The_Return_of_the_King
[FF]: https://en.wikiquote.org/wiki/The_Lord_of_the_Rings:_The_Fellowship_of_the_Ring
[TF]: https://en.wikiquote.org/wiki/The_Lord_of_the_Rings:_The_Two_Towers
[RF]: https://en.wikiquote.org/wiki/The_Lord_of_the_Rings:_The_Return_of_the_King
[UJ]: https://en.wikiquote.org/wiki/The_Hobbit:_An_Unexpected_Journey
[DS]: https://en.wikiquote.org/wiki/The_Hobbit:_The_Desolation_of_Smaug
[FA]: https://en.wikiquote.org/wiki/The_Hobbit:_The_Battle_of_the_Five_Armies
