import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { items, type Item } from '@/design/data'
import { AppButton as Button, Hint } from '@/components/ui-patterns'
import { TooltipProvider } from '@/components/ui/tooltip'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Checkbox } from '@/components/ui/checkbox'
import { FieldLabel } from '@/components/ui/field'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { FlatTabs, FlatTabsContent, FlatTabsList, FlatTabsTrigger } from '@/components/flat-tabs'
import {
  LibraryLayoutToggle,
  LibrarySelect,
  MediaRowButton,
  RatingStars,
} from '@/components/library-controls'
import { navigationItemVariants } from '@/components/navigation-variants'
import {
  ArrowDown,
  ArrowUp,
  ArrowLineLeft,
  ArrowLineRight,
  Article,
  BookOpen,
  Books,
  CaretRight,
  ChartBar,
  ChatCircle,
  FilmReel,
  Funnel,
  List,
  MagnifyingGlass,
  Microphone,
  Moon,
  MusicNotes,
  Plugs,
  Sun,
  X,
  YoutubeLogo,
} from '@/components/icons'
import shell from '@/components/app-shell.module.css'
import styles from './preview.module.css'

// Illustrative content only. This preview never connects to the application API.
const examples = items.filter((item) => item.type === 'Books')
const extra = [
  ['The Overstory', 'Richard Powers', '2018'],
  ['A Field Guide to Getting Lost', 'Rebecca Solnit', '2005'],
  ['The Living Mountain', 'Nan Shepherd', '1977'],
  ['The Death and Life of Great American Cities', 'Jane Jacobs', '1961'],
  ['Pilgrim at Tinker Creek', 'Annie Dillard', '1974'],
  ['The Poetics of Space', 'Gaston Bachelard', '1958'],
  ['Braiding Sweetgrass', 'Robin Wall Kimmerer', '2013'],
  ['The Book of Disquiet', 'Fernando Pessoa', '1982'],
].map(([title, creator, year], index): Item => ({
  ...examples[index % examples.length]!,
  id: index + 100,
  title: title!,
  creator: creator!,
  year: year!,
  description: 'Illustrative book details for reviewing the collection layout.',
  dates: [`2025-${String(12 - index).padStart(2, '0')}-12`],
}))
const books = [...examples, ...extra]
const media = [
  ['Books', BookOpen],
  ['Movies', FilmReel],
  ['Articles', Article],
  ['Podcasts', Microphone],
  ['Music', MusicNotes],
  ['Videos', YoutubeLogo],
] as const

function Cover({ book }: { book: Item }) {
  return (
    <span
      className={styles.cover}
      style={{ '--cover': book.color, '--ink': book.ink } as CSSProperties}
      aria-hidden="true"
    >
      <small>{book.creator}</small>
      <strong>{book.title}</strong>
      <span />
    </span>
  )
}

export function HeaderPreview() {
  const [persistent, setPersistent] = useState(true)
  const [dark, setDark] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [collection, setCollection] = useState('archive')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('recent')
  const [ascending, setAscending] = useState(false)
  const [layout, setLayout] = useState<'list' | 'grid'>('list')
  const [fiction, setFiction] = useState(false)
  const [date, setDate] = useState('all')
  const [selected, setSelected] = useState<Item | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const viewport = useRef<HTMLDivElement>(null)
  const selectionTrigger = useRef<HTMLButtonElement | null>(null)
  const closeInspectorButton = useRef<HTMLButtonElement>(null)
  const activeFilters = Number(fiction) + Number(date !== 'all')
  const collectionBooks =
    collection === 'archive' ? books : books.filter((book) => book.id % 2 === 0)
  const visible = useMemo(() => {
    const filtered = collectionBooks.filter(
      (book) =>
        `${book.title} ${book.creator}`.toLowerCase().includes(query.toLowerCase()) &&
        (!fiction || [1, 3, 5, 7, 100, 107].includes(book.id)) &&
        (date === 'all' || book.dates[0]?.startsWith(date)),
    )
    return [...filtered].sort((a, b) => {
      const comparison =
        sort === 'title'
          ? a.title.localeCompare(b.title)
          : sort === 'author'
            ? a.creator.localeCompare(b.creator)
            : (b.dates[0] ?? '').localeCompare(a.dates[0] ?? '')
      return ascending ? -comparison : comparison
    })
  }, [collectionBooks, query, fiction, date, sort, ascending])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])
  useEffect(() => {
    if (selected) closeInspectorButton.current?.focus()
  }, [selected])

  function closeInspector() {
    setSelected(null)
    selectionTrigger.current?.focus()
  }
  function changeCollection(value: unknown) {
    if (typeof value !== 'string') return
    setCollection(value)
    setSelected(null)
    viewport.current?.scrollTo({ top: 0 })
  }
  function resetFilters() {
    setFiction(false)
    setDate('all')
  }

  const navigation = (
    <>
      <div className={styles.brand}>
        <span className={shell['app-brand-mark']} aria-hidden="true" />
        {!collapsed && <strong>Imladris</strong>}
        <Hint content={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ArrowLineRight /> : <ArrowLineLeft />}
          </Button>
        </Hint>
      </div>
      <nav aria-label="Application" className={styles.navigation}>
        <Button variant="ghost" disabled className={navigationItemVariants({ collapsed })}>
          <ChatCircle />
          {!collapsed && (
            <>
              Chat <small>Later</small>
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          aria-current="page"
          className={navigationItemVariants({ active: true, collapsed })}
          onClick={() => setNavigationOpen(false)}
        >
          <Books />
          {!collapsed && 'Library'}
        </Button>
        <Button variant="ghost" disabled className={navigationItemVariants({ collapsed })}>
          <ChartBar />
          {!collapsed && (
            <>
              Recaps <small>Later</small>
            </>
          )}
        </Button>
      </nav>
      <nav aria-label="Media types" className={styles.navigation}>
        {!collapsed && <span className={styles.eyebrow}>Media</span>}
        {media.map(([label, Icon]) => (
          <Hint
            key={label}
            content={label === 'Books' ? label : `${label} is outside this Books preview`}
          >
            <Button
              variant="ghost"
              aria-label={label}
              disabled={label !== 'Books'}
              aria-current={label === 'Books' ? 'page' : undefined}
              onClick={() => setNavigationOpen(false)}
              className={navigationItemVariants({ active: label === 'Books', collapsed })}
            >
              <Icon />
              {!collapsed && label}
            </Button>
          </Hint>
        ))}
      </nav>
      <div className={styles.sidebarBottom}>
        {!collapsed && (
          <div className={styles.review}>
            <span>Header preview</span>
            <LibrarySelect
              aria-label="Header behavior"
              value={persistent ? 'proposed' : 'current'}
              options={[
                { value: 'proposed', label: 'Proposed · persistent' },
                { value: 'current', label: 'Current · scrolls away' },
              ]}
              onValueChange={(value) => setPersistent(value === 'proposed')}
            />
            <small>Illustrative content</small>
          </div>
        )}
        <Button variant="ghost" disabled className={navigationItemVariants({ collapsed })}>
          <Plugs />
          {!collapsed && 'Connections'}
        </Button>
        <Button
          variant="ghost"
          aria-label={dark ? 'Use light appearance' : 'Use dark appearance'}
          className={navigationItemVariants({ collapsed })}
          onClick={() => setDark(!dark)}
        >
          {dark ? <Sun /> : <Moon />}
          {!collapsed && (dark ? 'Light appearance' : 'Dark appearance')}
        </Button>
      </div>
    </>
  )

  const toolbar = (
    <section className={styles.tools} aria-label="Collection toolbar" data-ui="preview-toolbar">
      <div className={styles.toolbar}>
        <InputGroup className={styles.search}>
          <InputGroupInput
            aria-label="Search books"
            placeholder="Search title, author, series, or ISBN"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              viewport.current?.scrollTo({ top: 0 })
            }}
          />
          <InputGroupAddon>
            <MagnifyingGlass />
          </InputGroupAddon>
          {query && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                aria-label="Clear search"
                size="icon-xs"
                onClick={() => setQuery('')}
              >
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetTrigger
            render={
              <Button
                variant="outline"
                aria-label={`Filters${activeFilters ? `, ${activeFilters} active` : ''}`}
              />
            }
          >
            <Funnel />
            Filters{activeFilters > 0 && <span>{activeFilters}</span>}
          </SheetTrigger>
          <SheetContent className="gap-6 p-6">
            <div>
              <SheetTitle>Filter books</SheetTitle>
              <SheetDescription>Refine this illustrative collection.</SheetDescription>
            </div>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <FieldLabel htmlFor="preview-date">
                  {collection === 'archive' ? 'Read date' : 'Added date'}
                </FieldLabel>
                <LibrarySelect
                  id="preview-date"
                  aria-label={collection === 'archive' ? 'Read date' : 'Added date'}
                  value={date}
                  options={[
                    { value: 'all', label: 'Any time' },
                    { value: '2026', label: '2026' },
                    { value: '2025', label: '2025' },
                  ]}
                  onValueChange={setDate}
                />
              </div>
              <FieldLabel htmlFor="preview-fiction">
                <Checkbox
                  id="preview-fiction"
                  checked={fiction}
                  onCheckedChange={(checked) => setFiction(checked === true)}
                />
                Fiction
              </FieldLabel>
            </div>
            <div className="mt-auto flex gap-2">
              <Button variant="outline" onClick={resetFilters} disabled={!activeFilters}>
                Clear all
              </Button>
              <Button onClick={() => setFiltersOpen(false)}>Show {visible.length} books</Button>
            </div>
          </SheetContent>
        </Sheet>
        <LibrarySelect
          aria-label="Sort books"
          value={sort}
          options={[
            {
              value: 'recent',
              label: collection === 'archive' ? 'Recently read' : 'Recently added',
            },
            { value: 'title', label: 'Title' },
            { value: 'author', label: 'Author' },
          ]}
          onValueChange={setSort}
        />
        <Hint content={ascending ? 'Sort descending' : 'Sort ascending'}>
          <Button
            variant="outline"
            size="icon"
            aria-label={ascending ? 'Sort descending' : 'Sort ascending'}
            onClick={() => setAscending(!ascending)}
          >
            {ascending ? <ArrowUp /> : <ArrowDown />}
          </Button>
        </Hint>
        <LibraryLayoutToggle value={layout} onValueChange={setLayout} />
      </div>
      <div className={styles.summary}>
        <span role="status">
          {visible.length === collectionBooks.length
            ? `${visible.length} books`
            : `${visible.length} of ${collectionBooks.length} books`}
        </span>
        {fiction && (
          <Button
            variant="secondary"
            size="xs"
            onClick={() => setFiction(false)}
            aria-label="Remove Fiction filter"
          >
            Fiction <X />
          </Button>
        )}
        {date !== 'all' && (
          <Button
            variant="secondary"
            size="xs"
            onClick={() => setDate('all')}
            aria-label={`Remove ${date} filter`}
          >
            {collection === 'archive' ? 'Read' : 'Added'} in {date} <X />
          </Button>
        )}
        {activeFilters > 0 && (
          <Button variant="ghost" size="xs" onClick={resetFilters}>
            Clear all
          </Button>
        )}
      </div>
    </section>
  )

  return (
    <TooltipProvider delay={200}>
      <div
        className={styles.frame}
        data-collapsed={collapsed}
        data-inspector={Boolean(selected)}
        data-persistent={persistent}
      >
        <aside className={styles.sidebar} aria-label="Primary navigation">
          {navigation}
        </aside>
        <FlatTabs value={collection} onValueChange={changeCollection} className={styles.workspace}>
          <header className={styles.header} data-ui="preview-workspace-header">
            <Sheet open={navigationOpen} onOpenChange={setNavigationOpen}>
              <SheetTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className={styles.mobileNav}
                    aria-label="Open navigation"
                  />
                }
              >
                <List />
              </SheetTrigger>
              <SheetContent side="left" className="p-3">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <SheetDescription className="sr-only">
                  Illustrative Library navigation
                </SheetDescription>
                {navigation}
              </SheetContent>
            </Sheet>
            <div className={styles.breadcrumb}>
              <span>Library</span>
              <span>/</span>
              <strong>Books</strong>
            </div>
            <FlatTabsList aria-label="Book collections" className="ml-auto h-full">
              <FlatTabsTrigger value="archive">
                Archive <span className={styles.tabCount}>{books.length}</span>
              </FlatTabsTrigger>
              <FlatTabsTrigger value="queue">
                Queue{' '}
                <span className={styles.tabCount}>
                  {books.filter((book) => book.id % 2 === 0).length}
                </span>
              </FlatTabsTrigger>
            </FlatTabsList>
          </header>
          {persistent && toolbar}
          <div
            ref={viewport}
            className={styles.scroll}
            data-ui="preview-results-scroll"
            tabIndex={0}
            aria-label="Book results"
          >
            {!persistent && toolbar}
            {['archive', 'queue'].map((value) => (
              <FlatTabsContent key={value} value={value} keepMounted={false}>
                <div className={cn(styles.results, layout === 'grid' && styles.grid)}>
                  {visible.map((book) => (
                    <MediaRowButton
                      key={book.id}
                      className={cn(styles.row, selected?.id === book.id && styles.selected)}
                      aria-label={`Open ${book.title}`}
                      aria-pressed={selected?.id === book.id}
                      onClick={(event) => {
                        selectionTrigger.current = event.currentTarget
                        if (selected?.id === book.id) closeInspector()
                        else setSelected(book)
                      }}
                    >
                      <span className={styles.identity}>
                        <Cover book={book} />
                        <span>
                          <strong>{book.title}</strong>
                          <small>{book.creator}</small>
                        </span>
                      </span>
                      <span className={styles.year}>{book.year}</span>
                      <span className={styles.date}>{book.dates[0] ?? '—'}</span>
                      <span className={styles.rating}>
                        <RatingStars rating={book.id % 3 === 0 ? 5 : 4} />
                      </span>
                      <CaretRight className={styles.chevron} />
                    </MediaRowButton>
                  ))}
                </div>
                {visible.length === 0 && (
                  <div className={styles.empty}>
                    <BookOpen />
                    <h2>No books match</h2>
                    <p>Try another search or clear the filters.</p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setQuery('')
                        resetFilters()
                      }}
                    >
                      Clear search and filters
                    </Button>
                  </div>
                )}
                {visible.length > 0 && (
                  <p className={styles.end}>
                    {visible.length} books · End of illustrative collection
                  </p>
                )}
              </FlatTabsContent>
            ))}
          </div>
        </FlatTabs>
        {selected && (
          <aside
            className={styles.inspector}
            aria-label={`Details for ${selected.title}`}
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeInspector()
            }}
          >
            <header>
              <span>Book</span>
              <Button
                ref={closeInspectorButton}
                variant="ghost"
                size="icon"
                aria-label="Close inspector"
                onClick={closeInspector}
              >
                <X />
              </Button>
            </header>
            <div className={styles.inspectorScroll}>
              <div className={styles.hero}>
                <Cover book={selected} />
                <h1>{selected.title}</h1>
                <p>{selected.creator}</p>
              </div>
              <FlatTabs defaultValue="details">
                <FlatTabsList context="standalone" aria-label="Book information">
                  <FlatTabsTrigger value="details">Details</FlatTabsTrigger>
                  <FlatTabsTrigger value="history">History</FlatTabsTrigger>
                </FlatTabsList>
                <FlatTabsContent value="details">
                  <section className={styles.details}>
                    <h2>Overview</h2>
                    <p>{selected.description}</p>
                    <dl>
                      <div>
                        <dt>Published</dt>
                        <dd>{selected.year}</dd>
                      </div>
                      <div>
                        <dt>Length</dt>
                        <dd>{selected.detail}</dd>
                      </div>
                    </dl>
                    <h2>About this preview</h2>
                    <p>
                      The collection toolbar stays above the results. Opening this inspector narrows
                      the collection and lets the toolbar wrap.
                    </p>
                    <p>
                      Details scroll independently so you can keep your place in the collection.
                    </p>
                  </section>
                </FlatTabsContent>
                <FlatTabsContent value="history">
                  <section className={styles.details}>
                    <h2>Illustrative reading history</h2>
                    {selected.dates.length ? (
                      selected.dates.map((day) => <p key={day}>Read · {day}</p>)
                    ) : (
                      <p>Read date unavailable.</p>
                    )}
                  </section>
                </FlatTabsContent>
              </FlatTabs>
            </div>
          </aside>
        )}
      </div>
    </TooltipProvider>
  )
}
