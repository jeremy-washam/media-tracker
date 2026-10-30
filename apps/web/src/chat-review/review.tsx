import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  ArrowLineLeft,
  ArrowLineRight,
  BookOpen,
  Books,
  CaretRight,
  ChartBar,
  ChatCircle,
  Check,
  Clock,
  DotsThree,
  IconContext,
  List,
  MagnifyingGlass,
  Moon,
  Plugs,
  Star,
  Sun,
  X,
} from '@/components/icons'
import type { AppIcon } from '@/components/icons'
import styles from './review.module.css'
import { ChatComposer, ChatSectionTrigger, NewChatAction } from './review-controls'
import { tolkienQuotes } from '@/features/chat/tolkien-quotes'

type Version = 'classic' | 'compact' | 'activity'
type Scenario = 'empty' | 'thinking' | 'tools' | 'complete' | 'stopped'
type Chat = { id: string; title: string; favorite: boolean; activity: number }
type Message = { role: 'user' | 'assistant'; text: string }
function chooseQuote(previousId?: string) {
  const enabled = tolkienQuotes.filter((quote) => quote.enabled)
  const alternatives = enabled.filter((quote) => quote.id !== previousId)
  const choices = alternatives.length ? alternatives : enabled
  return choices[Math.floor(Math.random() * choices.length)] ?? null
}
const versions: { id: Version; name: string; description: string }[] = [
  {
    id: 'classic',
    name: '01 · Familiar',
    description: 'Inline activity · generous reading width',
  },
  {
    id: 'compact',
    name: '02 · Compact',
    description: 'Denser history · compact conversation',
  },
  {
    id: 'activity',
    name: '03 · Focus',
    description: 'Response activity beside the conversation',
  },
]
const initialChats: Chat[] = [
  { id: 'a', title: 'Stories about memory', favorite: true, activity: 8 },
  { id: 'b', title: 'A reading path through systems', favorite: true, activity: 7 },
  { id: 'c', title: 'What connects my recent reading?', favorite: false, activity: 10 },
  { id: 'd', title: 'Films to sit with for a while', favorite: false, activity: 6 },
  { id: 'e', title: 'Notes on attention', favorite: false, activity: 5 },
  { id: 'f', title: 'Where to start with Ursula Le Guin', favorite: false, activity: 4 },
  { id: 'g', title: 'The shape of a good question', favorite: false, activity: 3 },
  { id: 'h', title: 'Something for a long walk', favorite: false, activity: 2 },
]
const demoQuestion = 'What connects my recent reading on attention, and what should I explore next?'
const summary =
  'I’m looking for a shared thread across your saved books and articles, then checking a few sources for a useful next step.'
const finalAnswer =
  'A thread running through these pieces is that attention is something you practice, rather than something you simply have. Each approaches that idea from a different direction.'
const tools = [
  {
    icon: Books,
    title: 'Searched your library',
    detail: 'Books and articles · attention, habits, perception',
    result: '12 matching items',
    state: 'done',
  },
  {
    icon: BookOpen,
    title: 'Read saved details',
    detail: 'Selected highlights, notes, and reading history',
    result: '4 items reviewed',
    state: 'done',
  },
  {
    icon: MagnifyingGlass,
    title: 'Searched the web',
    detail: 'Primary sources for the next step',
    result: '3 sources found',
    state: 'done',
  },
]
function stored(key: string, fallback: boolean) {
  try {
    return localStorage.getItem(key) === null ? fallback : localStorage.getItem(key) === 'true'
  } catch {
    return fallback
  }
}
function save(key: string, value: boolean) {
  try {
    localStorage.setItem(key, String(value))
  } catch {
    /* review remains usable without storage */
  }
}
function fromQuery<T extends string>(key: string, values: readonly T[], fallback: T) {
  const value = new URLSearchParams(location.search).get(key)
  return values.includes(value as T) ? (value as T) : fallback
}

function Activity({
  inMargin = false,
  scenario,
  thinkingOpen,
  setThinkingOpen,
  activityOpen,
  setActivityOpen,
  stoppedTools,
}: {
  inMargin?: boolean
  scenario: Scenario
  thinkingOpen: boolean
  setThinkingOpen: (value: boolean) => void
  activityOpen: boolean
  setActivityOpen: (value: boolean) => void
  stoppedTools: boolean
}) {
  const running = scenario === 'thinking' || scenario === 'tools'
  return (
    <div className={styles.activity} data-margin={inMargin}>
      <Collapsible open={thinkingOpen} onOpenChange={setThinkingOpen}>
        <CollapsibleTrigger render={<Button variant="ghost" className={styles.activityTrigger} />}>
          <span className={running ? styles.pulse : styles.finishedDot} />
          <span>
            {scenario === 'thinking'
              ? 'Thinking'
              : scenario === 'stopped'
                ? 'Thinking stopped'
                : 'Finished thinking'}
          </span>
          <CaretRight className={thinkingOpen ? styles.chevronOpen : ''} />
        </CollapsibleTrigger>
        {scenario === 'thinking' && !thinkingOpen && <p className={styles.preview}>{summary}</p>}
        <CollapsibleContent>
          <p className={styles.summary}>{summary}</p>
        </CollapsibleContent>
      </Collapsible>
      {scenario !== 'thinking' && (scenario !== 'stopped' || stoppedTools) && (
        <Collapsible open={activityOpen} onOpenChange={setActivityOpen}>
          <CollapsibleTrigger
            render={<Button variant="ghost" className={styles.activityTrigger} />}
          >
            <Books />
            <span>{scenario === 'tools' ? 'Searching the web' : '3 tool calls'}</span>
            <CaretRight className={activityOpen ? styles.chevronOpen : ''} />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className={styles.toolList}>
              {tools.map((tool, index) => (
                <div key={tool.title} className={styles.tool}>
                  <tool.icon />
                  <div>
                    <span>
                      {scenario === 'tools' && index === 2
                        ? 'Searching the web'
                        : scenario === 'stopped' && index === 2
                          ? 'Web search stopped'
                          : tool.title}
                    </span>
                    <small>{tool.detail}</small>
                    <small className={styles.toolResult}>
                      {scenario === 'tools' && index === 2
                        ? 'In progress…'
                        : scenario === 'stopped' && index === 2
                          ? 'Stopped before completion'
                          : tool.result}
                    </small>
                  </div>
                  {scenario === 'tools' && index === 2 ? (
                    <span className={styles.pulse} />
                  ) : scenario === 'stopped' && index === 2 ? (
                    <X />
                  ) : (
                    <Check />
                  )}
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}

export function ChatReview() {
  const [version, setVersion] = useState<Version>(() =>
    fromQuery('variant', ['classic', 'compact', 'activity'], 'classic'),
  )
  const [scenario, setScenario] = useState<Scenario>(() =>
    fromQuery('state', ['empty', 'thinking', 'tools', 'complete', 'stopped'], 'complete'),
  )
  const [dark, setDark] = useState(() => stored('chat-review:dark', true))
  const [chats, setChats] = useState(initialChats)
  const [selected, setSelected] = useState<string | null>('c')
  const [favoritesOpen, setFavoritesOpen] = useState(() => stored('chat-review:favorites', true))
  const [chatsOpen, setChatsOpen] = useState(() => stored('chat-review:chats', true))
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [quote, setQuote] = useState(() => chooseQuote())
  const [stoppedTools, setStoppedTools] = useState(true)
  const [stoppedPartial, setStoppedPartial] = useState(true)
  const [messages, setMessages] = useState<Message[]>([])
  const [dialog, setDialog] = useState<{ kind: 'rename' | 'delete'; chat: Chat } | null>(null)
  const [rename, setRename] = useState('')
  const [inspector, setInspector] = useState<string | null>(null)
  const [navigationNote, setNavigationNote] = useState('')
  const [activityOpen, setActivityOpen] = useState(
    () => new URLSearchParams(location.search).get('variant') === 'activity',
  )
  const [thinkingOpen, setThinkingOpen] = useState(false)
  const [overflow, setOverflow] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const runId = useRef(0)
  const input = useRef<HTMLTextAreaElement>(null)
  const running = scenario === 'thinking' || scenario === 'tools'
  const current = chats.find((chat) => chat.id === selected)
  const selectedVersion = versions.find((item) => item.id === version)!
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    save('chat-review:dark', dark)
  }, [dark])
  useEffect(() => {
    save('chat-review:favorites', favoritesOpen)
  }, [favoritesOpen])
  useEffect(() => {
    save('chat-review:chats', chatsOpen)
  }, [chatsOpen])
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  function changeScenario(value: Scenario) {
    runId.current++
    if (timer.current) clearTimeout(timer.current)
    setScenario(value)
    if (value === 'empty') setQuote((current) => chooseQuote(current?.id))
    if (value === 'stopped') {
      setStoppedTools(true)
      setStoppedPartial(true)
    }
    setMessages([])
    setActivityOpen(value === 'tools')
    setThinkingOpen(value === 'thinking')
    if (value !== 'empty' && !selected) setSelected('c')
  }
  function newChat() {
    changeScenario('empty')
    setSelected(null)
    setDraft('')
    setMobileOpen(false)
    requestAnimationFrame(() => input.current?.focus())
  }
  function chooseChat(chat: Chat) {
    changeScenario('complete')
    setSelected(chat.id)
    setMobileOpen(false)
  }
  function favorite(chat: Chat) {
    setChats((items) =>
      items.map((item) => (item.id === chat.id ? { ...item, favorite: !item.favorite } : item)),
    )
  }
  function send() {
    if (running) {
      setStoppedTools(scenario === 'tools')
      setStoppedPartial(false)
      runId.current++
      if (timer.current) clearTimeout(timer.current)
      setScenario('stopped')
      return
    }
    if (!draft.trim()) return
    const question = draft.trim()
    setDraft('')
    setMessages((items) => [...items, { role: 'user', text: question }])
    setScenario('thinking')
    setThinkingOpen(true)
    if (!selected) {
      const id = `local-${Date.now()}`
      setChats((items) => [
        {
          id,
          title: question.length > 42 ? `${question.slice(0, 42)}…` : question,
          favorite: false,
          activity: Date.now(),
        },
        ...items,
      ])
      setSelected(id)
    } else
      setChats((items) =>
        items.map((item) => (item.id === selected ? { ...item, activity: Date.now() } : item)),
      )
    const id = ++runId.current
    timer.current = setTimeout(() => {
      if (id !== runId.current) return
      setScenario('tools')
      setThinkingOpen(false)
      setActivityOpen(true)
      timer.current = setTimeout(() => {
        if (id !== runId.current) return
        setScenario('complete')
        setActivityOpen(false)
      }, 4000)
    }, 3000)
  }
  function toggleOverflow() {
    setOverflow(!overflow)
    setChats((items) =>
      overflow
        ? items.filter((item) => !item.id.startsWith('overflow-'))
        : [
            ...items,
            ...Array.from({ length: 32 }, (_, index) => ({
              id: `overflow-${index}`,
              title:
                [
                  'Questions worth returning to',
                  'A small collection of big ideas',
                  'Fiction, place, and memory',
                  'Things to read slowly',
                ][index % 4] + ` ${index + 1}`,
              favorite: true,
              activity: -index,
            })),
          ],
    )
    setFavoritesOpen(true)
  }
  const sidebar = (
    <div className={styles.chatSidebar}>
      <NewChatAction onClick={newChat} />
      <div className={styles.chatLists}>
        {[
          { title: 'Favorites', favorite: true, open: favoritesOpen, onChange: setFavoritesOpen },
          { title: 'Chats', favorite: false, open: chatsOpen, onChange: setChatsOpen },
        ].map((section) => (
          <Collapsible key={section.title} open={section.open} onOpenChange={section.onChange}>
            <ChatSectionTrigger title={section.title} open={section.open} />
            <CollapsibleContent>
              <div className={styles.chatItems}>
                {chats
                  .filter((chat) => chat.favorite === section.favorite)
                  .sort((a, b) => b.activity - a.activity)
                  .map((chat) => (
                    <div
                      key={chat.id}
                      className={styles.chatRow}
                      data-selected={selected === chat.id}
                      data-ui="chat-row"
                    >
                      <Button
                        variant="link"
                        className={styles.chatTitle}
                        onClick={() => chooseChat(chat)}
                        aria-current={selected === chat.id ? 'page' : undefined}
                      >
                        {chat.title}
                      </Button>
                      <div className={styles.rowActions}>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`${chat.favorite ? 'Unfavorite' : 'Favorite'} ${chat.title}`}
                          onClick={() => favorite(chat)}
                        >
                          <Star className="size-4" weight={chat.favorite ? 'fill' : 'regular'} />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`More options for ${chat.title}`}
                              />
                            }
                          >
                            <DotsThree className="size-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-44">
                            <DropdownMenuItem
                              onClick={() => {
                                setDialog({ kind: 'rename', chat })
                                setRename(chat.title)
                              }}
                            >
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => favorite(chat)}>
                              {chat.favorite ? 'Unfavorite' : 'Favorite'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => setDialog({ kind: 'delete', chat })}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    </div>
  )

  const navigation = (mobile = false) => (
    <aside
      className={mobile ? styles.mobileSidebar : styles.globalSidebar}
      aria-label="Application navigation"
    >
      <div className={styles.brand}>
        <span className={styles.brandMark} />
        <span className={styles.wordmark}>Imladris</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={
            mobile
              ? 'Close chat navigation'
              : collapsed
                ? 'Expand application navigation'
                : 'Collapse application navigation'
          }
          onClick={() => (mobile ? setMobileOpen(false) : setCollapsed(!collapsed))}
        >
          {mobile ? <X /> : collapsed ? <ArrowLineRight /> : <ArrowLineLeft />}
        </Button>
      </div>
      <nav>
        {(
          [
            { label: 'Chat', icon: ChatCircle },
            { label: 'Library', icon: Books },
            { label: 'Recaps', icon: ChartBar },
          ] satisfies { label: string; icon: AppIcon }[]
        ).map((item) => (
          <Button
            key={item.label}
            variant={item.label === 'Chat' ? 'secondary' : 'ghost'}
            aria-label={item.label}
            aria-current={item.label === 'Chat' ? 'page' : undefined}
            className={styles.globalNav}
            onClick={() =>
              item.label === 'Chat'
                ? setNavigationNote('')
                : setNavigationNote(`${item.label} is outside this Chat design preview.`)
            }
          >
            <item.icon />
            <span>{item.label}</span>
          </Button>
        ))}
      </nav>
      <section className={styles.sidebarChatSection} aria-label="Chat navigation">
        {sidebar}
      </section>
      <div className={styles.globalBottom}>
        <Button
          variant="ghost"
          className={styles.globalNav}
          aria-label="Connections"
          onClick={() => setNavigationNote('Connections is outside this Chat design preview.')}
        >
          <Plugs />
          <span>Connections</span>
        </Button>
      </div>
    </aside>
  )

  const composer = (
    <div className={styles.composerWrap}>
      <ChatComposer
        inputRef={input}
        draft={draft}
        onDraftChange={setDraft}
        onSend={send}
        running={running}
      />
    </div>
  )
  return (
    <IconContext.Provider
      value={{ size: 20, weight: 'regular', 'aria-hidden': true, focusable: false }}
    >
      <div className={styles.review}>
        <header className={styles.reviewBar}>
          <div className={styles.reviewIdentity}>
            <span className={styles.reviewEyebrow}>Imladris · Chat study</span>
            <span className={styles.reviewDisclaimer}>
              Interactive mock · synthetic content · no API calls
            </span>
          </div>
          <div className={styles.versionButtons}>
            {versions.map((item) => (
              <Button
                key={item.id}
                variant={version === item.id ? 'secondary' : 'ghost'}
                aria-pressed={version === item.id}
                onClick={() => {
                  setVersion(item.id)
                  if (item.id === 'activity') setActivityOpen(true)
                }}
              >
                {item.name}
              </Button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={dark ? 'Switch to light appearance' : 'Switch to dark appearance'}
            onClick={() => setDark(!dark)}
          >
            {dark ? <Sun /> : <Moon />}
          </Button>
        </header>
        <div className={styles.scenarioBar}>
          <p>{selectedVersion.description}</p>
          <div className={styles.scenarioControls}>
            <span>Preview</span>
            {(['empty', 'thinking', 'tools', 'complete', 'stopped'] as const).map((value) => (
              <Button
                key={value}
                size="xs"
                variant={scenario === value ? 'secondary' : 'ghost'}
                aria-pressed={scenario === value}
                onClick={() => changeScenario(value)}
              >
                {value === 'complete' ? 'Answered' : value.charAt(0).toUpperCase() + value.slice(1)}
              </Button>
            ))}
            <Button
              size="xs"
              variant={overflow ? 'secondary' : 'ghost'}
              aria-pressed={overflow}
              onClick={toggleOverflow}
            >
              Many favorites
            </Button>
          </div>
        </div>
        <div className={styles.app} data-version={version} data-global-collapsed={collapsed}>
          {navigation()}
          <main className={styles.main}>
            <div className={styles.workspaceHeader}>
              <div className={styles.headerTitle}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Open chat navigation"
                  className={styles.mobileMenu}
                  onClick={() => setMobileOpen(true)}
                >
                  <List />
                </Button>
                <span>{scenario === 'empty' ? 'New chat' : current?.title || 'New chat'}</span>
              </div>
              <span className={styles.headerMeta}>
                {running ? 'Working' : scenario === 'empty' ? '' : 'Today'}
              </span>
            </div>
            {navigationNote && (
              <div className={styles.navigationNote}>
                <span>{navigationNote}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Dismiss navigation notice"
                  onClick={() => setNavigationNote('')}
                >
                  <X />
                </Button>
              </div>
            )}
            {scenario === 'empty' ? (
              <div className={styles.empty}>
                {quote && (
                  <blockquote
                    className={styles.emptyQuote}
                    data-ui="empty-chat-quote"
                    data-quote-id={quote.id}
                  >
                    <p>“{quote.text}”</p>
                    <cite>
                      {quote.attribution} · {quote.work}
                    </cite>
                  </blockquote>
                )}
                {composer}
              </div>
            ) : (
              <div className={styles.conversationLayout}>
                <div className={styles.conversationColumn}>
                  <div className={styles.transcript}>
                    <div className={styles.userMessage}>
                      {messages.length ? messages[messages.length - 1]?.text : demoQuestion}
                    </div>
                    <div className={styles.assistantMessage}>
                      <div className={styles.inlineActivity}>
                        <Activity
                          scenario={scenario}
                          thinkingOpen={thinkingOpen}
                          setThinkingOpen={setThinkingOpen}
                          activityOpen={activityOpen}
                          setActivityOpen={setActivityOpen}
                          stoppedTools={stoppedTools}
                        />
                      </div>
                      {scenario === 'tools' && (
                        <p className={styles.workingText}>
                          I found a few connections in your library. I’m checking one more source
                          before bringing them together.
                        </p>
                      )}
                      {scenario === 'thinking' && version === 'activity' && (
                        <p className={styles.workingText}>
                          Looking for connections across your reading…
                        </p>
                      )}
                      {(scenario === 'complete' || (scenario === 'stopped' && stoppedPartial)) && (
                        <div className={styles.answer}>
                          <p>{finalAnswer}</p>
                          <h2>Three ways of looking at it</h2>
                          <p>
                            <strong>Make room for noticing.</strong>{' '}
                            <Button
                              variant="link"
                              className={styles.citation}
                              onClick={() => setInspector('The Art of Noticing')}
                            >
                              The Art of Noticing <BookOpen />
                            </Button>{' '}
                            treats curiosity as an everyday habit: small shifts in what you notice
                            can change what you find interesting.
                          </p>
                          <p>
                            <strong>Change the conditions.</strong> Your saved article{' '}
                            <Button
                              variant="link"
                              className={styles.citation}
                              onClick={() => setInspector('A Quiet Place to Think')}
                            >
                              A Quiet Place to Think <BookOpen />
                            </Button>{' '}
                            puts the emphasis on environment. A quieter setting makes sustained
                            attention easier.
                          </p>
                          {scenario === 'complete' && (
                            <>
                              <p>
                                <strong>Leave something unresolved.</strong>{' '}
                                <Button
                                  variant="link"
                                  className={styles.citation}
                                  onClick={() => setInspector('Ways of Seeing')}
                                >
                                  Ways of Seeing <BookOpen />
                                </Button>{' '}
                                invites you to question the habits behind perception itself.
                              </p>
                              <h2>A useful next step</h2>
                              <p>
                                Try a short walk without headphones, then write down one detail you
                                would usually miss. It’s a small experiment that connects all three
                                ideas.
                              </p>
                              <p className={styles.sources}>
                                Grounded in 4 library items and 3 web sources.
                              </p>
                            </>
                          )}
                          {scenario === 'stopped' && (
                            <p className={styles.stopped}>
                              <span className={styles.stopSquare} />
                              Response stopped
                            </p>
                          )}
                        </div>
                      )}
                      {scenario === 'stopped' && !stoppedPartial && (
                        <p className={styles.stopped}>
                          <span className={styles.stopSquare} />
                          Response stopped
                        </p>
                      )}
                    </div>
                  </div>
                  {composer}
                </div>
                {version === 'activity' && (
                  <aside className={styles.activityMargin} aria-label="Response activity">
                    <div className={styles.marginHeading}>
                      <Clock />
                      Activity
                    </div>
                    <Activity
                      inMargin
                      scenario={scenario}
                      thinkingOpen={thinkingOpen}
                      setThinkingOpen={setThinkingOpen}
                      activityOpen={activityOpen}
                      setActivityOpen={setActivityOpen}
                      stoppedTools={stoppedTools}
                    />
                    <div className={styles.marginNote}>
                      <Books />
                      <p>
                        Library evidence stays connected to the answer. Open an inline reference to
                        inspect the source.
                      </p>
                    </div>
                  </aside>
                )}
              </div>
            )}
          </main>
        </div>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className={styles.navigationSheet} showCloseButton={false}>
            <SheetTitle className="sr-only">Chat navigation</SheetTitle>
            <SheetDescription className="sr-only">Favorites and recent chats</SheetDescription>
            {navigation(true)}
          </SheetContent>
        </Sheet>
        <Sheet
          open={dialog !== null}
          onOpenChange={(open) => {
            if (!open) setDialog(null)
          }}
        >
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>{dialog?.kind === 'rename' ? 'Rename chat' : 'Delete chat?'}</SheetTitle>
              <SheetDescription>
                {dialog?.kind === 'rename'
                  ? 'Give this conversation a name you’ll recognize.'
                  : `“${dialog?.chat.title || ''}” will be removed from this mock. This does not change any real data.`}
              </SheetDescription>
            </SheetHeader>
            <div className={styles.dialogBody}>
              {dialog?.kind === 'rename' && (
                <Input
                  aria-label="Chat name"
                  autoFocus
                  value={rename}
                  onChange={(event) => setRename(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && rename.trim() && dialog) {
                      setChats((items) =>
                        items.map((item) =>
                          item.id === dialog.chat.id ? { ...item, title: rename.trim() } : item,
                        ),
                      )
                      setDialog(null)
                    }
                  }}
                />
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialog(null)}>
                  Cancel
                </Button>
                <Button
                  variant={dialog?.kind === 'delete' ? 'destructive' : 'default'}
                  disabled={dialog?.kind === 'rename' && !rename.trim()}
                  onClick={() => {
                    if (!dialog) return
                    if (dialog.kind === 'rename')
                      setChats((items) =>
                        items.map((item) =>
                          item.id === dialog.chat.id ? { ...item, title: rename.trim() } : item,
                        ),
                      )
                    else {
                      setChats((items) => items.filter((item) => item.id !== dialog.chat.id))
                      if (selected === dialog.chat.id) newChat()
                    }
                    setDialog(null)
                  }}
                >
                  {dialog?.kind === 'rename' ? 'Save name' : 'Delete chat'}
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
        <Sheet
          open={inspector !== null}
          onOpenChange={(open) => {
            if (!open) setInspector(null)
          }}
        >
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>{inspector}</SheetTitle>
              <SheetDescription>Library · Synthetic review item</SheetDescription>
            </SheetHeader>
            <div className={styles.inspectorBody}>
              <div className={styles.bookCover}>
                <span>{inspector}</span>
                <BookOpen />
              </div>
              <h2>{inspector}</h2>
              <p>
                A small collection of observations about curiosity, perception, and the conditions
                that make thoughtful work possible.
              </p>
              <dl>
                <dt>Source</dt>
                <dd>Example library import</dd>
                <dt>Evidence</dt>
                <dd>Saved highlight</dd>
              </dl>
              <blockquote>“What we notice becomes part of what we know.”</blockquote>
              <p className={styles.sources}>Illustrative evidence for this interface study.</p>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </IconContext.Provider>
  )
}
