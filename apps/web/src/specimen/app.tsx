import { useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  ArrowUp,
  ArrowUpDown,
  BookOpen,
  ChartNoAxesColumn,
  Check,
  ChevronDown,
  ChevronRight,
  Film,
  Headphones,
  Library,
  MessageSquare,
  Music2,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  SlidersHorizontal,
  X,
  CalendarDays,
  RotateCcw,
  FileText,
  Video,
} from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { Button } from './ui/button'
import { Calendar } from './ui/calendar'
import { Checkbox } from './ui/checkbox'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from './ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Textarea } from './ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import { items, types, sources, dateLabel, type Item, type MediaType } from '../design/data'

import { ThemePicker } from './theme-picker'
import { applyAppearance, initialAppearance, type Theme, type Mode } from './themes'
const mediaIcons = [BookOpen, Film, FileText, Headphones, Video, Music2]
const localDate = (value: string) => new Date(`${value}T12:00:00`)
const shortDate = (value: Date) =>
  value.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button variant="ghost" size="icon" aria-label={label} onClick={onClick} />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

function Cover({ item, large = false }: { item: Item; large?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`cover ${large ? 'cover-large' : ''} cover-${item.motif % 4}`}
      style={{ '--cover': item.color, '--ink': item.ink } as CSSProperties}
    >
      <span>{item.creator.split(' · ')[0]}</span>
      <strong>{item.title}</strong>
      <i />
    </div>
  )
}

export function Specimen() {
  const [theme, setTheme] = useState<Theme>(() => initialAppearance().theme)
  const [mode, setMode] = useState<Mode>(() => initialAppearance().mode)
  const [collapsed, setCollapsed] = useState(false)
  const [media, setMedia] = useState<MediaType>('Books')
  const [state, setState] = useState('archive')
  const [query, setQuery] = useState('')
  const [rated, setRated] = useState(false)
  const [repeated, setRepeated] = useState(false)
  const [range, setRange] = useState<DateRange | undefined>()
  const [ascending, setAscending] = useState(false)
  const [selected, setSelected] = useState<Item | undefined>(items[1])
  const [draft, setDraft] = useState('')
  const [sent, setSent] = useState('')
  const [scope, setScope] = useState(true)
  const [inspectorTab, setInspectorTab] = useState('details')
  useLayoutEffect(() => {
    applyAppearance(theme, mode)
  }, [theme, mode])

  const matchesDate = (date: string) =>
    !range?.from ||
    (localDate(date) >= new Date(new Date(range.from).setHours(0, 0, 0, 0)) &&
      localDate(date) <= new Date(new Date(range.to ?? range.from).setHours(23, 59, 59, 999)))
  const matchingDates = (item: Item) => item.dates.filter(matchesDate).sort().reverse()
  const visible = items
    .filter(
      (item) =>
        item.type === media &&
        Boolean(item.queue) === (state === 'queue') &&
        `${item.title} ${item.creator}`.toLowerCase().includes(query.toLowerCase()) &&
        (!rated || Boolean(item.rating)) &&
        (!repeated || item.dates.length > 1) &&
        (!range?.from || matchingDates(item).length > 0),
    )
    .sort(
      (a, b) =>
        (matchingDates(b)[0] ?? '').localeCompare(matchingDates(a)[0] ?? '') * (ascending ? -1 : 1),
    )
  const clear = () => {
    setQuery('')
    setRated(false)
    setRepeated(false)
    setRange(undefined)
  }
  const send = () => {
    if (draft.trim()) {
      setSent(draft.trim())
      setDraft('')
    }
  }
  const chooseMedia = (value: MediaType) => {
    setMedia(value)
    setSelected(undefined)
  }

  return (
    <TooltipProvider delay={350}>
      <div className="specimen-page">
        <header className="specimen-header">
          <div>
            <div className="eyebrow">INTERFACE STUDY / 08</div>
            <h1>Components & theme</h1>
            <p>shadcn/ui + Base UI · Synthetic library data</p>
          </div>
          <ThemePicker theme={theme} mode={mode} onTheme={setTheme} onMode={setMode} />
        </header>
        <div className={`workspace ${collapsed ? 'is-collapsed' : ''}`}>
          <aside className="sidebar" aria-label="Library navigation">
            <div className="brand">
              {!collapsed && (
                <span>
                  Margin<span className="accent">.</span>
                </span>
              )}
              <IconButton
                label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                onClick={() => setCollapsed(!collapsed)}
              >
                {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
              </IconButton>
            </div>
            <nav className="global-nav" aria-label="Surfaces">
              <a href="/design.html?direction=index&surface=chat" title="Open Chat layout study">
                <MessageSquare />
                {!collapsed && 'Chat'}
              </a>
              <button
                className="active"
                aria-current="page"
                title="Library"
                onClick={() => document.getElementById('library-title')?.focus()}
              >
                <Library />
                {!collapsed && 'Library'}
              </button>
              <a
                href="/design.html?direction=index&surface=recaps"
                title="Open Recaps layout study"
              >
                <ChartNoAxesColumn />
                {!collapsed && 'Recaps'}
              </a>
            </nav>
            <div className="media-nav">
              <span className="nav-label">{collapsed ? '—' : 'Media'}</span>
              {types.map((type, index) => {
                const Icon = mediaIcons[index]!
                return (
                  <button
                    key={type}
                    className={media === type ? 'active' : ''}
                    title={type}
                    aria-pressed={media === type}
                    onClick={() => chooseMedia(type)}
                  >
                    <Icon />
                    {!collapsed && (
                      <>
                        <span>{type}</span>
                        <small>
                          {items.filter((item) => item.type === type && !item.queue).length}
                        </small>
                      </>
                    )}
                  </button>
                )
              })}
            </div>
            <div className="sidebar-bottom">
              <div className="avatar">J</div>
              {!collapsed && <span>Jeremy</span>}
            </div>
          </aside>
          <main className="library-workspace">
            <div className="library-heading">
              <div className="breadcrumb">
                Library
                <ChevronRight />
                <span>{media}</span>
              </div>
              <span className="sample-label">Component preview</span>
            </div>
            <div className="collection-heading">
              <h2 id="library-title" tabIndex={-1}>
                {media}
              </h2>
              <span>
                {visible.length} {visible.length === 1 ? 'item' : 'items'}
              </span>
            </div>
            <Tabs
              value={state}
              onValueChange={(value) => setState(String(value))}
              className="collection-tabs"
            >
              <TabsList variant="line">
                <TabsTrigger value="archive">Archive</TabsTrigger>
                <TabsTrigger value="queue">Queue</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="collection-toolbar">
              <label className="search">
                <Search />
                <input
                  aria-label="Search library"
                  placeholder={`Search ${media.toLowerCase()}`}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button aria-label="Clear search" onClick={() => setQuery('')}>
                    <X />
                  </button>
                )}
              </label>
              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      aria-label="Filter library"
                      className={rated || repeated ? 'filter-active' : ''}
                    />
                  }
                >
                  <SlidersHorizontal />
                  <span>Filter</span>
                  {(rated || repeated) && <i className="active-dot" />}
                </PopoverTrigger>
                <PopoverContent align="end" className="filter-popover">
                  <PopoverTitle>Filter items</PopoverTitle>
                  <label>
                    <Checkbox checked={rated} onCheckedChange={setRated} />
                    Has a personal rating
                  </label>
                  <label>
                    <Checkbox checked={repeated} onCheckedChange={setRepeated} />
                    Consumed more than once
                  </label>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setRated(false)
                      setRepeated(false)
                    }}
                  >
                    Reset filters
                  </Button>
                </PopoverContent>
              </Popover>
              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      aria-label="Filter by consumption date"
                      className={range?.from ? 'filter-active' : ''}
                    />
                  }
                >
                  <CalendarDays />
                  <span>
                    {range?.from
                      ? `${shortDate(range.from)}${range.to ? ` – ${shortDate(range.to)}` : ''}`
                      : 'Date'}
                  </span>
                </PopoverTrigger>
                <PopoverContent align="end" className="date-popover">
                  <PopoverTitle>Date consumed</PopoverTitle>
                  <div className="date-presets">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setRange({ from: new Date(2026, 8, 1), to: new Date(2026, 8, 30) })
                      }
                    >
                      September
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setRange({ from: new Date(2026, 7, 1), to: new Date(2026, 7, 31) })
                      }
                    >
                      August
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setRange(undefined)}>
                      All dates
                    </Button>
                  </div>
                  <Calendar
                    mode="range"
                    selected={range}
                    onSelect={setRange}
                    defaultMonth={new Date(2026, 8, 1)}
                  />
                  <p>Includes any matching consumption.</p>
                </PopoverContent>
              </Popover>
              <IconButton
                label={ascending ? 'Sort newest first' : 'Sort oldest first'}
                onClick={() => setAscending(!ascending)}
              >
                <ArrowUpDown />
              </IconButton>
            </div>
            <div className="list-labels">
              <span>Title / Creator</span>
              <span>{state === 'archive' ? 'Date consumed' : 'Queue'}</span>
            </div>
            <div className="media-list" aria-label={`${media} ${state}`}>
              {visible.map((item) => (
                <button
                  key={item.id}
                  className={`media-row ${selected?.id === item.id ? 'selected' : ''}`}
                  aria-pressed={selected?.id === item.id}
                  onClick={() => {
                    setSelected(item)
                    setInspectorTab('details')
                  }}
                >
                  <Cover item={item} />
                  <span className="row-main">
                    <strong>{item.title}</strong>
                    <span>{item.creator}</span>
                    <small>
                      {item.year} · {item.detail}
                    </small>
                  </span>
                  <span className="row-end">
                    {state === 'archive' && (
                      <span>
                        {matchingDates(item)[0]
                          ? shortDate(localDate(matchingDates(item)[0]!))
                          : 'Unknown'}
                      </span>
                    )}
                    {item.rating && (
                      <span
                        className="rating"
                        aria-label={`Personal rating ${item.rating.length} stars`}
                      >
                        {item.rating}
                      </span>
                    )}
                    {item.dates.length > 1 && (
                      <small>
                        <RotateCcw />
                        {item.dates.length}{' '}
                        {item.type === 'Books' || item.type === 'Articles'
                          ? 'reads'
                          : item.type === 'Movies' || item.type === 'YouTube'
                            ? 'watches'
                            : 'listens'}
                      </small>
                    )}
                  </span>
                </button>
              ))}
              {!visible.length && (
                <div className="empty">
                  <Search />
                  <h3>No matching items</h3>
                  <p>Try another search or clear the filters.</p>
                  <Button variant="secondary" onClick={clear}>
                    Clear filters
                  </Button>
                </div>
              )}
            </div>
            <footer className="collection-footer">
              <span>
                {visible.length} {visible.length === 1 ? 'item' : 'items'}
                {range?.from ? ' · Date filter applied' : ''}
              </span>
              <span>Sample data</span>
            </footer>
          </main>
          {selected && (
            <aside className="inspector" aria-label="Item details">
              <header>
                <span>Details</span>
                <IconButton label="Close inspector" onClick={() => setSelected(undefined)}>
                  <X />
                </IconButton>
              </header>
              <div className="inspector-body">
                <Cover item={selected} large />
                <h2>{selected.title}</h2>
                <p className="creator">{selected.creator}</p>
                <p className="metadata">
                  {selected.year} · {selected.detail}
                </p>
                {selected.rating && (
                  <p className="personal-rating">
                    <span>{selected.rating}</span>
                    <small>Your rating</small>
                  </p>
                )}
                <Tabs
                  value={inspectorTab}
                  onValueChange={(value) => setInspectorTab(String(value))}
                >
                  <TabsList variant="line">
                    <TabsTrigger value="details">Details</TabsTrigger>
                    <TabsTrigger value="history">
                      History <small>{selected.dates.length}</small>
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="details">
                    <p className="description">{selected.description}</p>
                    <dl>
                      <div>
                        <dt>Source</dt>
                        <dd>{sources[selected.type]}</dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>{selected.queue ? 'Queue' : 'Archive'}</dd>
                      </div>
                      <div>
                        <dt>Last consumed</dt>
                        <dd>{selected.dates[0] ? dateLabel(selected.dates[0]) : 'Unknown'}</dd>
                      </div>
                    </dl>
                  </TabsContent>
                  <TabsContent value="history">
                    <div className="history-list">
                      {selected.dates.length ? (
                        selected.dates.map((date) => (
                          <div key={date}>
                            <i className={range?.from && matchesDate(date) ? 'match' : ''} />
                            <span>
                              {dateLabel(date)}
                              <small>
                                {sources[selected.type]}
                                {range?.from && matchesDate(date) ? ' · Matches filter' : ''}
                              </small>
                            </span>
                          </div>
                        ))
                      ) : (
                        <p>No recorded consumption.</p>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </aside>
          )}
        </div>
        <div className="component-bottom">
          <section className="composer-section">
            <div className="section-title">
              <h2>Chat composer</h2>
              <span>Local interaction only</span>
            </div>
            {sent && (
              <div role="status" className="sent-message">
                <Check />
                Message captured: “{sent}”
              </div>
            )}
            <div className="composer">
              <Textarea
                aria-label="Chat message"
                placeholder="Ask about your library…"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    send()
                  }
                }}
              />
              <div className="composer-toolbar">
                <Popover>
                  <PopoverTrigger render={<Button variant="ghost" size="sm" />}>
                    <Library />
                    {scope ? 'Library context' : 'No library context'}
                    <ChevronDown />
                  </PopoverTrigger>
                  <PopoverContent className="filter-popover">
                    <PopoverTitle>Context</PopoverTitle>
                    <label>
                      <Checkbox checked={scope} onCheckedChange={setScope} />
                      Include your Library
                    </label>
                  </PopoverContent>
                </Popover>
                <Button
                  aria-label="Send sample message"
                  size="icon"
                  disabled={!draft.trim()}
                  onClick={send}
                >
                  <ArrowUp />
                </Button>
              </div>
            </div>
            <p className="component-note">Enter to send · Shift + Enter for a new line</p>
          </section>
          <section className="states-section">
            <div className="section-title">
              <h2>Control states</h2>
              <span>Same tokens across surfaces</span>
            </div>
            <div className="state-grid">
              {['Default', 'Hover', 'Selected', 'Focus', 'Disabled'].map((label) => (
                <div key={label}>
                  <Button
                    variant="outline"
                    disabled={label === 'Disabled'}
                    className={`sample-state state-${label.toLowerCase()}`}
                    aria-pressed={label === 'Selected'}
                  >
                    <SlidersHorizontal />
                    Filter
                  </Button>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <div className="token-strip">
              <span>
                <i className="token-surface" />
                Surface
              </span>
              <span>
                <i className="token-border" />
                Border
              </span>
              <span>
                <i className="token-muted" />
                Secondary text
              </span>
              <span>
                <i className="token-accent" />
                Accent
              </span>
            </div>
          </section>
        </div>
        <footer className="specimen-footer">
          <span>14px controls · 15px metadata · Theme-defined corners</span>
          <a href="/design.html?direction=index">Open layout studies ↗</a>
        </footer>
      </div>
    </TooltipProvider>
  )
}
