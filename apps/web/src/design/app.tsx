import { useState, type CSSProperties } from 'react'
import { items, types, sources, dateLabel, type Item, type MediaType } from './data'

type Surface = 'Library' | 'Chat' | 'Recaps'
type Direction = 'index' | 'top' | 'browser' | 'journal' | 'shelves' | 'tabs' | 'document'
const directions: { id: Direction; name: string; note: string }[] = [
  { id: 'index', name: '01 Index', note: 'Sidebar workspace · collection with optional inspector' },
  {
    id: 'top',
    name: '02 Top nav',
    note: 'Global navigation above the workspace · local navigation belongs to each surface',
  },
  { id: 'browser', name: '03 Two-pane', note: 'Compact selection list · persistent detail area' },
  {
    id: 'journal',
    name: '04 Journal',
    note: 'Date-grouped history · chronological recaps and conversations',
  },
  {
    id: 'shelves',
    name: '05 Gallery',
    note: 'Artwork-led shelves · compact rail · overlay inspection',
  },
  {
    id: 'tabs',
    name: '06 Research',
    note: 'Persistent workspace tabs · optional side-by-side reference',
  },
  {
    id: 'document',
    name: '07 Documents',
    note: 'Page tree · readable documents · section outline',
  },
]
function Icon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    Library: 'M4 4h4v16H4z M11 4h3v16h-3z M17 4l3-1 4 16-3 1z',
    Chat: 'M4 4h16v12H9l-5 4z M8 8h8 M8 12h5',
    Recaps: 'M4 20V9 M10 20V4 M16 20v-8 M22 20V7',
    search: 'm16 16 5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    list: 'M8 5h13 M8 12h13 M8 19h13 M3 5h1 M3 12h1 M3 19h1',
    close: 'm6 6 12 12 M6 18 18 6',
    arrow: 'M12 20V4 m-6 6 6-6 6 6',
    spark: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z',
    settings: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
    link: 'M9 15l6-6 M8 17l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0 M16 7l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',
    save: 'M6 3h12v18l-6-4-6 4z',
  }
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 26 26"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.spark} />
    </svg>
  )
}
function Art({ item, small = false }: { item: Item; small?: boolean }) {
  return (
    <div
      className={`art art-${item.motif % 4} ${small ? 'small' : ''} ${['Articles', 'YouTube'].includes(item.type) ? 'landscape' : ''}`}
      style={{ '--cover': item.color, '--ink': item.ink } as CSSProperties}
    >
      <div className="art-lines" />
      <div className="art-orbit" />
      <span className="art-author">{item.creator}</span>
      <strong>{item.title}</strong>
      <span className="art-bottom">
        {item.year} <span>↗</span>
      </span>
    </div>
  )
}
export default function App() {
  const initial = new URLSearchParams(location.search).get('direction')
  const [direction, setDirection] = useState<Direction>(
    directions.find((d) => d.id === initial)?.id || 'index',
  )
  const initialSurface = new URLSearchParams(location.search).get('surface')
  const [surface, setSurface] = useState<Surface>(
    initialSurface === 'chat' ? 'Chat' : initialSurface === 'recaps' ? 'Recaps' : 'Library',
  )
  const [type, setType] = useState<MediaType>('Books')
  const [state, setState] = useState('Archive')
  const [view, setView] = useState('grid')
  const [query, setQuery] = useState('')
  const [period, setPeriod] = useState('all')
  const [sort, setSort] = useState('recent')
  const [selected, setSelected] = useState<Item | null>(null)
  const [chatMode, setChatMode] = useState('conversation')
  const [chatTitle, setChatTitle] = useState('Learning to pay attention')
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<string[]>([])
  const [saved, setSaved] = useState(false)
  const [artifactName, setArtifactName] = useState('Reading activity · September')
  const [expanded, setExpanded] = useState(false)
  const [annual, setAnnual] = useState(false)
  const [month, setMonth] = useState(8)
  const [chartType, setChartType] = useState<MediaType>('Books')
  const [chartPoint, setChartPoint] = useState<number | null>(null)
  const [workspaceTabs, setWorkspaceTabs] = useState<Surface[]>(['Library', 'Chat', 'Recaps'])
  const [compare, setCompare] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(true)
  function navigate(next: Surface) {
    setWorkspaceTabs((tabs) => (tabs.includes(next) ? tabs : [...tabs, next]))
    setSurface(next)
    setSelected(null)
    setExpanded(false)
  }
  function changeDirection(next: Direction) {
    setDirection(next)
    history.replaceState(null, '', `?direction=${next}`)
  }
  const filtered = items
    .filter(
      (i) =>
        i.type === type &&
        (state === 'Queue' ? i.queue : i.dates.length > 0 || !i.queue) &&
        (!query || `${i.title} ${i.creator}`.toLowerCase().includes(query.toLowerCase())) &&
        (period === 'all' || i.dates.some((d) => d.startsWith(period))),
    )
    .sort((a, b) =>
      sort === 'title'
        ? a.title.localeCompare(b.title)
        : (b.dates.filter((d) => period === 'all' || d.startsWith(period))[0] || '').localeCompare(
            a.dates.filter((d) => period === 'all' || d.startsWith(period))[0] || '',
          ),
    )
  const inspectorItem =
    direction === 'browser' && surface === 'Library'
      ? filtered.find((i) => i.id === selected?.id) || filtered[0] || null
      : selected
  const monthName = new Date(2026, month, 1).toLocaleDateString('en-US', { month: 'long' })
  const totals = annual ? [32, 94, 216, 108, 163, 1240] : [4, 8, 21, 12, 18, 146]
  const total = totals[types.indexOf(chartType)]!
  const weights = Array.from({ length: annual ? 12 : 5 }, (_, i) => ((i * 7 + month) % 9) + 2)
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0)
  let cumulative = 0
  const chartValues = weights.map((weight) => {
    const previous = Math.round((cumulative / weightSum) * total)
    cumulative += weight
    return Math.round((cumulative / weightSum) * total) - previous
  })
  function chart() {
    return (
      <div className="chart">
        <div className="chart-head">
          <div>
            <h3>
              {chartType} by {annual ? 'month' : 'week'}
            </h3>
          </div>
          <select
            aria-label="Chart media type"
            value={chartType}
            onChange={(e) => {
              setChartType(e.target.value as MediaType)
              setChartPoint(null)
            }}
          >
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="bars">
          {chartValues.map((v, i) => (
            <button
              key={i}
              className={chartPoint === i ? 'picked' : ''}
              onClick={() => setChartPoint(i)}
              aria-label={`${annual ? new Date(2026, i).toLocaleDateString('en-US', { month: 'short' }) : `Week ${i + 1}`}: ${v} ${chartType.toLowerCase()}`}
              style={{ '--height': `${(v / Math.max(...chartValues, 1)) * 100}%` } as CSSProperties}
            >
              <span className="bar-value">{v}</span>
              <span className="bar" />
              <small>
                {annual
                  ? new Date(2026, i).toLocaleDateString('en-US', { month: 'short' })
                  : `W${i + 1}`}
              </small>
            </button>
          ))}
        </div>
        <p className="chart-caption">
          {chartPoint === null
            ? 'Select a column to explore the period.'
            : `${chartValues[chartPoint]} ${chartType.toLowerCase()} · ${annual ? new Date(2026, chartPoint).toLocaleDateString('en-US', { month: 'long' }) : `Week ${chartPoint + 1}`} · sample activity`}
        </p>
        {chartPoint !== null && (
          <div className="chart-items">
            {items
              .filter((i) => i.type === chartType)
              .slice(0, 2)
              .map((i) => (
                <button key={i.id} onClick={() => setSelected(i)}>
                  {i.title} <span>↗</span>
                </button>
              ))}
          </div>
        )}
      </div>
    )
  }
  const localNavigation = (
    <>
      {surface === 'Library' && (
        <div className="local-nav">
          <div className="nav-label">MEDIA</div>
          {types.map((t) => (
            <button
              className={type === t ? 'chosen' : ''}
              key={t}
              onClick={() => {
                setType(t)
                setSelected(null)
                setQuery('')
              }}
            >
              <span>{t}</span>
              <small>{items.filter((item) => item.type === t).length}</small>
            </button>
          ))}
        </div>
      )}
      {surface === 'Chat' && (
        <div className="local-nav chat-nav">
          <button
            className="new-chat"
            onClick={() => {
              setChatMode('new')
              setMessages([])
              setChatTitle('New conversation')
              setSelected(null)
            }}
          >
            ＋ New chat
          </button>
          <button
            className={chatMode === 'artifacts' ? 'chosen' : ''}
            onClick={() => {
              setChatMode('artifacts')
              setSelected(null)
            }}
          >
            <span>◇ Artifacts</span>
            <small>{saved ? 3 : 2}</small>
          </button>
          <div className="nav-label">RECENT CONVERSATIONS</div>
          {['Learning to pay attention', 'Los Angeles, on film', 'Where to start with Le Guin'].map(
            (c) => (
              <button
                className={chatTitle === c && chatMode === 'conversation' ? 'chosen' : ''}
                key={c}
                onClick={() => {
                  setChatTitle(c)
                  setChatMode('conversation')
                  setMessages([])
                }}
              >
                {c}
              </button>
            ),
          )}
        </div>
      )}
      {surface === 'Recaps' && (
        <div className="local-nav">
          <div className="nav-label">PERIOD</div>
          <button className={!annual ? 'chosen' : ''} onClick={() => setAnnual(false)}>
            Monthly recaps
          </button>
          <button className={annual ? 'chosen' : ''} onClick={() => setAnnual(true)}>
            Yearly recaps
          </button>
        </div>
      )}

      {surface === 'Recaps' && ['browser', 'journal', 'document', 'top'].includes(direction) && (
        <div className="period-list">
          {Array.from({ length: 12 }, (_, i) => 11 - i).map((m) => (
            <button
              key={m}
              className={month === m && !annual ? 'chosen' : ''}
              onClick={() => {
                setMonth(m)
                setAnnual(false)
              }}
            >
              {new Date(2026, m).toLocaleDateString('en-US', { month: 'long' })}
              <small>2026</small>
            </button>
          ))}
        </div>
      )}
    </>
  )
  const mediaButton = (item: Item) => (
    <button
      className={`media-item ${inspectorItem?.id === item.id ? 'selected' : ''}`}
      key={item.id}
      onClick={() => setSelected(item)}
    >
      {direction === 'journal' && (
        <span className="entry-date">
          {item.dates[0]
            ? dateLabel(
                item.dates.filter((d) => period === 'all' || d.startsWith(period))[0] ||
                  item.dates[0],
              )
            : 'Undated'}
        </span>
      )}
      <Art item={item} />
      <div className="item-copy">
        <strong>{item.title}</strong>
        <span>{item.creator}</span>
        <div className="item-meta">
          <span className="rating">{item.rating || item.detail}</span>
          <span>
            {item.dates[0]
              ? dateLabel(
                  item.dates.filter((d) => period === 'all' || d.startsWith(period))[0] ||
                    item.dates[0],
                )
              : 'Date unknown'}
          </span>
        </div>
      </div>
    </button>
  )
  const collection = (
    <div
      className={`collection ${['browser', 'journal', 'document'].includes(direction) || view === 'list' || ['Articles', 'Podcasts', 'Songs'].includes(type) ? 'rows' : 'covers'}`}
    >
      {filtered.map(mediaButton)}
    </div>
  )
  return (
    <div className={`prototype ${direction}`}>
      <div className="studybar">
        <span className="study-label">
          DESIGN STUDIES <span> / </span> MEDIA
        </span>
        <div className="directions">
          {directions.map((d) => (
            <button
              key={d.id}
              aria-pressed={direction === d.id}
              onClick={() => changeDirection(d.id)}
            >
              {d.name}
            </button>
          ))}
        </div>
        <span className="study-note">Sample content · concept artwork</span>
      </div>
      <div className="app-frame">
        <aside className="global-nav">
          <div className="wordmark">
            <span className="brand-mark">i</span>
            <span>
              Imladris<span className="brand-period">.</span>
            </span>
          </div>

          <nav>
            {(['Chat', 'Library', 'Recaps'] as Surface[]).map((s) => (
              <button
                title={s}
                aria-label={s}
                className={surface === s ? 'active' : ''}
                onClick={() => navigate(s)}
                key={s}
              >
                <Icon name={s} />
                <span>{s}</span>
                {surface === s && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
          {['index', 'journal', 'document'].includes(direction) && localNavigation}
          <div className="nav-bottom">
            <div>
              <Icon name="link" /> Connections <span className="status-dot" />
            </div>
            <div>
              <Icon name="settings" /> Settings
            </div>
            <div className="profile">
              <span>J</span>
              <div>Jeremy</div>
            </div>
          </div>
        </aside>
        <div className={`layout-body surface-${surface.toLowerCase()}`}>
          {(['browser'].includes(direction) ||
            (['top', 'shelves', 'tabs'].includes(direction) &&
              surface !== 'Library' &&
              historyOpen)) && <aside className="surface-nav">{localNavigation}</aside>}
          <div className="workspace">
            {direction === 'tabs' && (
              <div className="workspace-tabs" role="tablist" aria-label="Workspaces">
                {workspaceTabs.map((tab) => (
                  <div key={tab} className={tab === surface ? 'active' : ''}>
                    <button
                      role="tab"
                      aria-selected={tab === surface}
                      onClick={() => navigate(tab)}
                    >
                      <Icon name={tab} />
                      {tab === 'Library'
                        ? `${type} · ${state}`
                        : tab === 'Chat'
                          ? chatTitle
                          : 'September 2026'}
                    </button>
                    <button
                      aria-label={`Close ${tab} tab`}
                      disabled={workspaceTabs.length === 1}
                      onClick={() => {
                        const next = workspaceTabs.filter((t) => t !== tab)
                        setWorkspaceTabs(next)
                        if (surface === tab) setSurface(next[0]!)
                        setSelected(null)
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  className="compare-toggle"
                  aria-pressed={compare}
                  onClick={() => setCompare(!compare)}
                >
                  ▥ {compare ? 'Close reference' : 'Reference pane'}
                </button>
              </div>
            )}
            {direction === 'document' && (
              <div className="document-path">
                Pages <span>/</span> {surface} <span>/</span>{' '}
                {surface === 'Library'
                  ? type
                  : surface === 'Chat'
                    ? chatTitle
                    : `${monthName} 2026`}
                <span className="document-status">Private</span>
              </div>
            )}
            {['top', 'shelves', 'tabs'].includes(direction) && surface === 'Library' && (
              <div className="inline-navigation">{localNavigation}</div>
            )}

            <header className="workspace-header">
              <div>
                {surface}
                <span>/</span>
                {surface === 'Library'
                  ? type
                  : surface === 'Chat'
                    ? chatMode === 'artifacts'
                      ? 'Artifacts'
                      : chatTitle
                    : annual
                      ? 'Year in review'
                      : 'Monthly recap'}
              </div>
              {['top', 'shelves', 'tabs'].includes(direction) && surface !== 'Library' && (
                <button className="history-toggle" onClick={() => setHistoryOpen(!historyOpen)}>
                  {historyOpen ? 'Hide' : 'Show'} {surface === 'Chat' ? 'history' : 'periods'}
                </button>
              )}
            </header>
            <main
              className={`${surface.toLowerCase()}-main ${inspectorItem ? 'has-inspector' : ''}`}
            >
              {direction === 'document' && (
                <div className="document-heading">
                  <span className="document-icon">
                    <Icon name={surface} />
                  </span>
                  <h1>
                    {surface === 'Library'
                      ? `${type} / ${state}`
                      : surface === 'Chat'
                        ? chatMode === 'artifacts'
                          ? 'Artifacts'
                          : chatTitle
                        : annual
                          ? '2026 recap'
                          : `${monthName} 2026`}
                  </h1>
                  <div>
                    <span>Jeremy</span>
                    <span>September 19, 2026</span>
                  </div>
                </div>
              )}
              {surface === 'Library' && (
                <>
                  <div className="page-heading">
                    <div>
                      <h1>{type}</h1>
                    </div>
                  </div>
                  <div className="collection-tabs">
                    {['Archive', 'Queue'].map((s) => (
                      <button
                        className={state === s ? 'active' : ''}
                        key={s}
                        onClick={() => setState(s)}
                      >
                        {s}
                        <small>
                          {
                            items.filter(
                              (i) =>
                                i.type === type &&
                                (s === 'Queue' ? i.queue : i.dates.length > 0 || !i.queue),
                            ).length
                          }
                        </small>
                      </button>
                    ))}
                  </div>
                  <div className="collection-tools">
                    <label className="search">
                      <Icon name="search" />
                      <input
                        aria-label={`Search ${type}`}
                        placeholder={`Search ${type.toLowerCase()}…`}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Consumed date"
                      value={period}
                      onChange={(e) => setPeriod(e.target.value)}
                    >
                      <option value="all">All dates</option>
                      <option value="2026-09">September 2026</option>
                      <option value="2026-08">August 2026</option>
                      <option value="2022">2022</option>
                    </select>
                    <select
                      aria-label="Sort collection"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="recent">Recently consumed</option>
                      <option value="title">Title A–Z</option>
                    </select>
                    <div className="view-toggle">
                      {['grid', 'list'].map((v) => (
                        <button
                          key={v}
                          aria-label={`${v} view`}
                          aria-pressed={view === v}
                          onClick={() => setView(v)}
                        >
                          <Icon name={v} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="collection-meta">
                    <span>
                      {filtered.length}{' '}
                      {filtered.length === 1
                        ? {
                            Books: 'book',
                            Movies: 'movie',
                            Articles: 'article',
                            Podcasts: 'podcast',
                            YouTube: 'video',
                            Songs: 'song',
                          }[type]
                        : type.toLowerCase()}
                      {period !== 'all' ? ` · consumed in ${period}` : ''}
                    </span>
                  </div>
                  {direction === 'shelves' ? (
                    <div className="shelf-groups">
                      <section>
                        <div className="shelf-heading">
                          <h2>{state === 'Queue' ? 'Queued' : 'Recently consumed'}</h2>
                          <span>{filtered.length} items</span>
                        </div>
                        <div className="shelf-track">{filtered.slice(0, 5).map(mediaButton)}</div>
                      </section>
                      {filtered.length > 5 && (
                        <section>
                          <div className="shelf-heading">
                            <h2>{state === 'Queue' ? 'More in Queue' : 'Earlier'}</h2>
                            <span>{type}</span>
                          </div>
                          <div className="shelf-track secondary-shelf">
                            {filtered.slice(5).map(mediaButton)}
                          </div>
                        </section>
                      )}
                    </div>
                  ) : direction === 'journal' ? (
                    <div className="journal-entries">
                      <div className="journal-period">
                        <h2>
                          {period === '2022'
                            ? '2022'
                            : period === '2026-08'
                              ? 'August 2026'
                              : 'September 2026'}
                        </h2>
                        <span>{filtered.length} items</span>
                      </div>
                      {collection}
                    </div>
                  ) : (
                    <>
                      {direction === 'document' && (
                        <div className="document-table-head">
                          <span>Title</span>
                          <span>Creator / rating / consumed</span>
                        </div>
                      )}
                      {collection}
                    </>
                  )}
                  {filtered.length === 0 && (
                    <div className="empty">
                      <h2>No items in this view</h2>
                      <p>Try another date range or search.</p>
                      <button
                        onClick={() => {
                          setQuery('')
                          setPeriod('all')
                        }}
                      >
                        Clear filters
                      </button>
                    </div>
                  )}
                </>
              )}
              {surface === 'Chat' && (
                <>
                  {chatMode === 'artifacts' ? (
                    <>
                      <div className="page-heading">
                        <div>
                          <h1>Artifacts</h1>
                        </div>
                      </div>
                      <div className="artifact-grid">
                        {[
                          artifactName,
                          'Los Angeles, on film',
                          ...(saved ? ['Reading activity · saved'] : []),
                        ].map((a, i) => (
                          <button
                            className="artifact-tile"
                            key={a}
                            onClick={() => {
                              setChatTitle(
                                i === 1 ? 'Los Angeles, on film' : 'Learning to pay attention',
                              )
                              setChatMode('conversation')
                              setExpanded(i !== 1)
                            }}
                          >
                            <div className={`artifact-preview preview-${i}`}>
                              {i === 1 ? (
                                <div className="mini-covers">
                                  {items
                                    .filter((x) => x.type === 'Movies')
                                    .slice(0, 3)
                                    .map((x) => (
                                      <Art key={x.id} item={x} />
                                    ))}
                                </div>
                              ) : (
                                <div className="mini-bars">
                                  {[20, 50, 35, 70, 90, 65, 85].map((h, j) => (
                                    <i key={j} style={{ height: `${h}%` }} />
                                  ))}
                                </div>
                              )}
                            </div>
                            <span className="eyebrow">
                              {i === 1 ? 'CURATED LIST' : 'INTERACTIVE VISUALIZATION'}
                            </span>
                            <h3>{a}</h3>
                            <p>From a conversation · Sep 18</p>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className={`conversation ${expanded ? 'expanded' : ''}`}>
                      <div className="conversation-body">
                        {chatMode === 'new' ? (
                          <div className="chat-welcome">
                            <span className="welcome-mark">✳</span>
                            <h1>New chat</h1>

                            <div className="prompts">
                              {[
                                'What connects my recent reading?',
                                'Show me my month in media',
                                'Find a different side of Los Angeles',
                              ].map((p) => (
                                <button key={p} onClick={() => setDraft(p)}>
                                  {p} ↗
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="chat-date">FRIDAY, SEPTEMBER 18</div>
                            <div className="user-message">
                              {chatTitle === 'Los Angeles, on film'
                                ? 'Which films would help me see a different side of LA?'
                                : chatTitle === 'Where to start with Le Guin'
                                  ? 'Where should I go next after The Dispossessed?'
                                  : 'What connects the books I’ve been reading lately?'}
                            </div>
                            <div className="assistant-label">
                              <Icon name="spark" /> IMLADRIS
                            </div>
                            <h2>
                              {chatTitle === 'Los Angeles, on film'
                                ? 'Films set in Los Angeles'
                                : chatTitle === 'Where to start with Le Guin'
                                  ? 'More from Ursula K. Le Guin'
                                  : 'Connections in your recent reading'}
                            </h2>
                            <p className="answer">
                              {chatTitle === 'Los Angeles, on film'
                                ? 'Start with the restless, sun-bleached Los Angeles of The Long Goodbye, then follow the city through other filmmakers’ eyes.'
                                : chatTitle === 'Where to start with Le Guin'
                                  ? 'The Left Hand of Darkness is a natural next step: another encounter with a society that makes familiar assumptions feel strange.'
                                  : 'There’s a thread running through your recent reading: attention as a creative practice. Rubin explores how we notice, Berger questions how we see, and Le Guin asks what becomes possible when we change our perspective.'}
                            </p>
                            <div className="reference-cards">
                              {(chatTitle === 'Los Angeles, on film'
                                ? items.filter((i) => i.type === 'Movies').slice(1, 3)
                                : chatTitle === 'Where to start with Le Guin'
                                  ? [items[1]!, items[5]!]
                                  : [items[0]!, items[2]!]
                              ).map((i) => (
                                <button key={i.id} onClick={() => setSelected(i)}>
                                  <Art item={i} small />
                                  <div>
                                    <strong>{i.title}</strong>
                                    <span>{i.creator}</span>
                                    <small>In your library ↗</small>
                                  </div>
                                </button>
                              ))}
                            </div>

                            <div id="visualization" className="chat-artifact">
                              <div className="artifact-toolbar">
                                <span>
                                  <Icon name="Recaps" />
                                  <input
                                    aria-label="Artifact name"
                                    title="Rename artifact"
                                    value={artifactName}
                                    onChange={(e) => setArtifactName(e.target.value)}
                                  />
                                </span>
                                <div>
                                  <button onClick={() => setSaved(!saved)}>
                                    <Icon name="save" />
                                    {saved ? 'Saved' : 'Save artifact'}
                                  </button>
                                  <button
                                    onClick={() => setExpanded(!expanded)}
                                    aria-label={
                                      expanded ? 'Reduce visualization' : 'Expand visualization'
                                    }
                                  >
                                    {expanded ? '↙' : '↗'}
                                  </button>
                                </div>
                              </div>
                              {chart()}
                            </div>
                            <div className="response-actions">
                              <button
                                onClick={() =>
                                  setDraft(
                                    'Tell me more about the connection between attention and creativity',
                                  )
                                }
                              >
                                Explore this connection ↗
                              </button>
                              <span>Illustrative response · sample library</span>
                            </div>
                          </>
                        )}
                        {messages.map((m, i) => (
                          <div key={`${m}-${i}`}>
                            <div className="user-message">{m}</div>
                            <div className="demo-response">
                              This prototype demonstrates the conversation layout. Live model
                              responses will be connected after design selection.
                            </div>
                          </div>
                        ))}
                      </div>
                      <form
                        className="composer"
                        onSubmit={(e) => {
                          e.preventDefault()
                          if (draft.trim()) {
                            setMessages([...messages, draft.trim()])
                            setDraft('')
                            setChatMode('conversation')
                          }
                        }}
                      >
                        <textarea
                          aria-label="Message"
                          placeholder="Message…"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          rows={2}
                        />
                        <div>
                          <span>Library + web</span>
                          <button type="submit" aria-label="Send message" disabled={!draft.trim()}>
                            <Icon name="arrow" />
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </>
              )}
              {surface === 'Recaps' && (
                <>
                  <div className="recap-controls">
                    <div className="segmented">
                      <button className={!annual ? 'active' : ''} onClick={() => setAnnual(false)}>
                        Month
                      </button>
                      <button className={annual ? 'active' : ''} onClick={() => setAnnual(true)}>
                        Year
                      </button>
                    </div>
                    <div>
                      <button
                        aria-label="Previous month"
                        disabled={annual || month === 0}
                        onClick={() => setMonth(month - 1)}
                      >
                        ←
                      </button>
                      <span>{annual ? '2026' : `${monthName} 2026`}</span>
                      <button
                        aria-label="Next month"
                        disabled={annual || month === 11}
                        onClick={() => setMonth(month + 1)}
                      >
                        →
                      </button>
                    </div>
                  </div>
                  <section className="recap-hero">
                    <div>
                      <h1>{annual ? '2026' : `${monthName} 2026`}</h1>
                      <span className="recap-subtitle">
                        {annual ? 'Yearly recap' : 'Monthly recap'}
                      </span>
                    </div>
                    <div className="hero-books">
                      {[items[2]!, items[1]!, items[0]!].map((i) => (
                        <button
                          key={i.id}
                          onClick={() => setSelected(i)}
                          aria-label={`Inspect ${i.title}`}
                        >
                          <Art item={i} />
                        </button>
                      ))}
                    </div>
                  </section>
                  <div id="summary" className="recap-stats">
                    {types.map((t, i) => (
                      <button
                        key={t}
                        className={chartType === t ? 'selected' : ''}
                        onClick={() => {
                          setChartType(t)
                          setChartPoint(null)
                        }}
                      >
                        <strong>{totals[i]}</strong>
                        <span>{t === 'YouTube' ? 'Videos' : t}</span>
                      </button>
                    ))}
                  </div>
                  {direction === 'journal' && (
                    <section className="recap-timeline">
                      <h2>{annual ? '2026 timeline' : `${monthName} activity`}</h2>
                      {[18, 16, 14].map((day, i) => (
                        <div className="timeline-day" key={day}>
                          <time>
                            {annual
                              ? ['September', 'August', 'July'][i]
                              : `${monthName.slice(0, 3)} ${day}`}
                          </time>
                          <div>{items.slice(i * 2, i * 2 + 2).map(mediaButton)}</div>
                        </div>
                      ))}
                    </section>
                  )}
                  <div id="activity" className="recap-columns">
                    {chart()}
                    <div className="standout">
                      <span className="eyebrow">{annual ? 'REREADS' : 'HIGHEST RATED'}</span>
                      <h2>{annual ? 'The Dispossessed' : 'The Creative Act'}</h2>
                      <p>
                        {annual
                          ? 'Read in April 2022, August 2026, and September 2026.'
                          : 'Rick Rubin · 5 / 5 on Hardcover'}
                      </p>
                      <button onClick={() => setSelected(items[annual ? 1 : 0]!)}>
                        View book <span>↗</span>
                      </button>
                      <span className="sample-caption">Sample data</span>
                    </div>
                  </div>
                  <div id="books" className="section-title">
                    <h2>{annual ? 'Books · 2026' : `Books · ${monthName}`}</h2>
                    <button
                      onClick={() => {
                        navigate('Library')
                        setType('Books')
                        setPeriod(annual ? 'all' : `2026-${String(month + 1).padStart(2, '0')}`)
                      }}
                    >
                      Explore in Library ↗
                    </button>
                  </div>
                  <div className="recap-shelf">
                    {items.slice(0, 5).map((i) => (
                      <button key={i.id} onClick={() => setSelected(i)}>
                        <Art item={i} />
                        <strong>{i.title}</strong>
                        <span>{i.creator}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </main>
          </div>
          {direction === 'document' && !inspectorItem && (
            <aside className="document-outline">
              <span>ON THIS PAGE</span>
              {(surface === 'Recaps'
                ? [
                    ['summary', 'Summary'],
                    ['activity', 'Activity'],
                    ['books', 'Books'],
                  ]
                : surface === 'Chat'
                  ? [['visualization', 'Visualization']]
                  : []
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() =>
                    document
                      .getElementById(id!)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                >
                  {label}
                </button>
              ))}
              <div className="outline-rule" />
              <small>
                {surface === 'Library'
                  ? 'Select an item to view its details.'
                  : surface === 'Chat'
                    ? 'Media references open in the inspector.'
                    : 'Monthly / yearly report'}
              </small>
            </aside>
          )}
          {direction === 'tabs' && compare && !inspectorItem && (
            <aside className="reference-pane">
              <div className="inspector-top">
                <span>REFERENCE · LIBRARY</span>
                <button onClick={() => setCompare(false)} aria-label="Close reference pane">
                  ×
                </button>
              </div>
              <div className="reference-scroll">
                <h2>{type}</h2>
                <div className="collection rows">
                  {items.filter((i) => i.type === type).map(mediaButton)}
                </div>
              </div>
            </aside>
          )}
          {inspectorItem && (
            <aside className="inspector">
              <div className="inspector-top">
                <span>DETAILS</span>
                <button
                  aria-label="Close inspector"
                  disabled={direction === 'browser' && surface === 'Library'}
                  onClick={() => setSelected(null)}
                >
                  <Icon name="close" />
                </button>
              </div>
              <div className="inspector-scroll">
                <Art item={inspectorItem} />
                <span className="eyebrow">
                  {inspectorItem.type} · {inspectorItem.year}
                </span>
                <h2>{inspectorItem.title}</h2>
                <p className="inspector-creator">{inspectorItem.creator}</p>
                {inspectorItem.rating && (
                  <p className="inspector-rating">
                    {inspectorItem.rating}
                    <small>Your rating · {sources[inspectorItem.type]}</small>
                  </p>
                )}
                <p className="description">{inspectorItem.description}</p>
                <dl>
                  <div>
                    <dt>Length</dt>
                    <dd>{inspectorItem.detail}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>{sources[inspectorItem.type]}</dd>
                  </div>
                  <div>
                    <dt>Collection</dt>
                    <dd>{inspectorItem.queue ? 'Archive & Queue' : 'Archive'}</dd>
                  </div>
                </dl>
                <h3>
                  Your history <span>{inspectorItem.dates.length}</span>
                </h3>
                <div className="history">
                  {inspectorItem.dates.length ? (
                    inspectorItem.dates.map((d) => (
                      <div
                        key={d}
                        className={period !== 'all' && d.startsWith(period) ? 'matched' : ''}
                      >
                        <i />
                        <div>
                          {dateLabel(d)}
                          <small>
                            {inspectorItem.type === 'Books'
                              ? 'Finished reading'
                              : inspectorItem.type === 'Movies'
                                ? 'Watched'
                                : 'Consumed'}{' '}
                            · {sources[inspectorItem.type]}
                          </small>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p>Consumption date unknown</p>
                  )}
                </div>
                <button
                  className="inspector-chat"
                  onClick={() => {
                    const title = inspectorItem.title
                    navigate('Chat')
                    setChatMode('new')
                    setDraft(`Help me explore ${title}`)
                  }}
                >
                  <Icon name="Chat" /> Explore in Chat
                </button>
                <p className="sample-caption">Sample metadata · illustrative cover design</p>
              </div>
            </aside>
          )}
        </div>
      </div>
      <footer className="study-footer">
        <span>{directions.find((d) => d.id === direction)?.note}</span>
        <span>Layout exploration · September 2026</span>
      </footer>
    </div>
  )
}
