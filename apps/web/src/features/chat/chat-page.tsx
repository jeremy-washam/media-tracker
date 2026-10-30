import { useCallback, memo, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import {
  ChatEventSchema,
  type ChatSnapshotRecord,
  type ChatSend,
  type ChatMessageRecord,
  type ChatPublicRun,
  type ChatMediaReference,
} from '@media-tracker/contracts'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Hint, Notice, LoadingState } from '@/components/ui-patterns'
import { CaretRight, Books, ArrowDown } from '@/components/icons'
import { ChatComposer } from './chat-controls'
import {
  chatRequest,
  chatKeys,
  chatAccepted,
  chatConfig,
  snapshotSchema,
  refreshChatLists,
  applyChatEvent,
  chatErrorText,
  ChatApiError,
} from './chat-api'
import { ChatInspector } from './chat-inspector'
import { tolkienQuotes } from './tolkien-quotes'
import styles from './chat.module.css'

const terminal = (run: ChatPublicRun | null | undefined) =>
  !run || !['running', 'queued'].includes(run.status)
function storedDraft(id: string) {
  try {
    return sessionStorage.getItem(`imladris:chat:draft:${id}`) ?? ''
  } catch {
    return ''
  }
}
function pendingSend(id: string): ChatSend | null {
  try {
    return (
      awaitlessSendSchema.safeParse(
        JSON.parse(sessionStorage.getItem(`imladris:chat:send:${id}`) ?? 'null'),
      ).data ?? null
    )
  } catch {
    return null
  }
}
const awaitlessSendSchema = z.object({
  operationKey: z.string().uuid(),
  text: z.string(),
  expectedHeadId: z.string().nullable(),
  expectedTranscriptRevision: z.number(),
})
function persistSend(id: string, value: ChatSend | null) {
  try {
    if (value) sessionStorage.setItem(`imladris:chat:send:${id}`, JSON.stringify(value))
    else sessionStorage.removeItem(`imladris:chat:send:${id}`)
  } catch {
    /* The in-memory operation key still prevents repeated sends in this view. */
  }
}
function chooseQuote(previousId?: string) {
  const enabled = tolkienQuotes.filter((x) => x.enabled),
    alternatives = enabled.filter((x) => x.id !== previousId)
  const choices = alternatives.length ? alternatives : enabled
  return choices[Math.floor(Math.random() * choices.length)]
}
export function ChatPage({ conversationId }: { conversationId?: string }) {
  const client = useQueryClient(),
    navigate = useNavigate(),
    key = conversationId ?? 'new'
  const [draft, setDraft] = useState(() => storedDraft(key)),
    [pending, setPending] = useState(false),
    [stopping, setStopping] = useState(false),
    [error, setError] = useState<string | null>(null),
    [connection, setConnection] = useState<'connected' | 'reconnecting'>('connected'),
    [unconfirmed, setUnconfirmed] = useState(() => !!pendingSend(key)),
    [quote, setQuote] = useState(chooseQuote),
    [reference, setReference] = useState<{ kind: ChatMediaReference; id: string } | null>(null),
    [atBottom, setAtBottom] = useState(true)
  const input = useRef<HTMLTextAreaElement>(null),
    scroll = useRef<HTMLDivElement>(null),
    operation = useRef<ChatSend | null>(pendingSend(key)),
    sending = useRef(false),
    follow = useRef(true),
    currentKey = useRef(key)
  const config = useQuery({
    queryKey: ['chat', 'config'],
    queryFn: ({ signal }) => chatRequest('/config', chatConfig, { signal }),
    staleTime: 60_000,
    retry: false,
  })
  const snapshot = useQuery({
    queryKey: chatKeys.snapshot(conversationId ?? 'new'),
    queryFn: ({ signal }) =>
      chatRequest(`/conversations/${conversationId}`, snapshotSchema, { signal }),
    enabled: !!conversationId,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
  const citationOrigin = useRef<string | null>(null)
  const openReference = useCallback(
    (value: { kind: ChatMediaReference; id: string }, origin?: HTMLElement) => {
      if (origin) citationOrigin.current = origin.id
      setReference(value)
    },
    [],
  )
  const closeReference = () => {
    setReference(null)
    requestAnimationFrame(() => {
      if (citationOrigin.current) document.getElementById(citationOrigin.current)?.focus()
    })
  }
  const data = snapshot.data,
    active = data?.activeRun,
    running = !!active && !terminal(active)
  useEffect(() => {
    currentKey.current = key
    input.current?.focus()
    return () => {
      currentKey.current = 'detached'
    }
  }, [key])
  useEffect(() => {
    try {
      sessionStorage.setItem(`imladris:chat:draft:${key}`, draft)
    } catch {
      /* Draft still works in memory. */
    }
  }, [key, draft])
  useEffect(() => {
    const reset = () => {
      if (!conversationId) {
        setDraft('')
        setQuote((previous) => chooseQuote(previous?.id))
        input.current?.focus()
      }
    }
    window.addEventListener('imladris:new-chat', reset)
    return () => window.removeEventListener('imladris:new-chat', reset)
  }, [conversationId])
  useEffect(() => {
    if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight
  }, [data?.lastEventSequence])
  useEffect(() => {
    if (!conversationId || !active?.id) return
    const id = conversationId,
      runId = active.id,
      sequence =
        client.getQueryData<ChatSnapshotRecord>(chatKeys.snapshot(id))?.lastEventSequence ?? 0
    const events = new EventSource(
      `/api/chat/conversations/${id}/runs/${runId}/events?after=${sequence}`,
    )
    events.onopen = () => setConnection('connected')
    events.onerror = () => setConnection('reconnecting')
    events.onmessage = (e) => {
      const parsed = ChatEventSchema.safeParse(JSON.parse(e.data))
      if (!parsed.success) {
        events.close()
        setConnection('reconnecting')
        return
      }
      client.setQueryData<ChatSnapshotRecord>(chatKeys.snapshot(id), (old) =>
        old ? applyChatEvent(old, parsed.data) : old,
      )
      const event = parsed.data
      if (event.payload.type === 'run' && terminal(event.payload.run)) {
        events.close()
        setConnection('connected')
        refreshChatLists(client)
        void client.invalidateQueries({ queryKey: chatKeys.snapshot(id) })
        setTimeout(() => refreshChatLists(client), 2500)
      }
    }
    return () => events.close()
  }, [conversationId, active?.id, client])
  async function send(recover = false) {
    if (sending.current || (running && !recover) || (!recover && !draft.trim())) return
    sending.current = true
    setPending(true)
    setError(null)
    const startKey = key,
      body =
        recover && operation.current
          ? operation.current
          : {
              operationKey: crypto.randomUUID(),
              text: draft.trim(),
              expectedHeadId: data?.conversation.headId ?? null,
              expectedTranscriptRevision: data?.conversation.transcriptRevision ?? 0,
            }
    operation.current = body
    persistSend(startKey, body)
    try {
      const result = await chatRequest(
        conversationId ? `/conversations/${conversationId}/runs` : '/conversations',
        chatAccepted,
        { method: 'POST', body: JSON.stringify(body) },
      )
      client.setQueryData(chatKeys.snapshot(result.snapshot.conversation.id), {
        ...result.snapshot,
        latestRun: result.run,
      })
      persistSend(startKey, null)
      operation.current = null
      setUnconfirmed(false)
      refreshChatLists(client)
      if (currentKey.current === startKey) {
        setDraft((value) => (value.trim() === body.text ? '' : value))
        try {
          if (storedDraft(startKey).trim() === body.text)
            sessionStorage.removeItem(`imladris:chat:draft:${startKey}`)
        } catch {
          /* In-memory draft was cleared. */
        }
        if (!conversationId)
          await navigate({
            to: '/chat/$conversationId',
            params: { conversationId: result.snapshot.conversation.id },
          })
        follow.current = true
        input.current?.focus()
      }
    } catch (e) {
      setError(chatErrorText(e))
      if (e instanceof ChatApiError && [400, 404, 409, 429].includes(e.status)) {
        operation.current = null
        persistSend(startKey, null)
        setUnconfirmed(false)
      } else setUnconfirmed(true)
      if (conversationId) void snapshot.refetch()
    } finally {
      sending.current = false
      if (currentKey.current === startKey) setPending(false)
    }
  }
  async function stop() {
    if (!conversationId || !active || stopping) return
    setStopping(true)
    setError(null)
    try {
      const result = await chatRequest(
        `/conversations/${conversationId}/runs/${active.id}/cancel`,
        chatAccepted,
        { method: 'POST', body: '{}' },
      )
      client.setQueryData(chatKeys.snapshot(conversationId), {
        ...result.snapshot,
        latestRun: result.run,
      })
      refreshChatLists(client)
    } catch (e) {
      setError(chatErrorText(e))
      void snapshot.refetch()
    } finally {
      setStopping(false)
    }
  }
  async function older() {
    if (!conversationId || !data?.beforeSequence) return
    try {
      const old = await chatRequest(
        `/conversations/${conversationId}?before=${data.beforeSequence}`,
        snapshotSchema,
      )
      client.setQueryData<ChatSnapshotRecord>(chatKeys.snapshot(conversationId), (current) =>
        current
          ? {
              ...current,
              beforeSequence: old.beforeSequence,
              messages: [...old.messages, ...current.messages].filter(
                (x, i, all) => all.findIndex((y) => y.id === x.id) === i,
              ),
            }
          : current,
      )
    } catch (e) {
      setError(chatErrorText(e))
    }
  }
  const latest = data?.latestRun
  return (
    <section className={styles.page} aria-label="Chat" data-ui="chat-page">
      <div
        className={styles.transcript}
        ref={scroll}
        onScroll={() => {
          const node = scroll.current
          if (node) {
            const near = node.scrollHeight - node.scrollTop - node.clientHeight < 100
            follow.current = near
            setAtBottom(near)
          }
        }}
      >
        {conversationId && snapshot.isPending ? <LoadingState>Loading chat…</LoadingState> : null}
        {snapshot.error ? (
          <Notice>
            {chatErrorText(snapshot.error)}{' '}
            <Button variant="link" onClick={() => void snapshot.refetch()}>
              Reconnect
            </Button>
          </Notice>
        ) : null}
        {!conversationId ? (
          <div className={styles.empty}>
            <blockquote>{quote?.text}</blockquote>
            <p>
              {quote?.attribution} · <cite>{quote?.work}</cite>
            </p>
          </div>
        ) : null}
        {data ? (
          <div className={styles.messages}>
            {data.beforeSequence ? (
              <Button variant="ghost" onClick={() => void older()}>
                Load earlier messages
              </Button>
            ) : null}
            {data.messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                running={running && active?.assistantMessageId === message.id}
                onReference={openReference}
              />
            ))}
            {latest && terminal(latest) && latest.status !== 'completed' ? (
              <p role="status" className={styles.runNotice}>
                {latest.status === 'cancelled'
                  ? 'Response stopped.'
                  : chatErrorText(new ChatApiError(latest.errorCode ?? 'chat_interrupted', 503))}
              </p>
            ) : null}
            {running && !data.messages.at(-1)?.parts.length ? (
              <p role="status" className={styles.working}>
                <span className={styles.pulse} />
                Working…
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className={styles.composerWrap} data-empty={!conversationId}>
        {!atBottom && conversationId ? (
          <div className={styles.jump}>
            <Hint content="Latest messages">
              <Button
                variant="secondary"
                size="icon"
                aria-label="Latest messages"
                onClick={() => {
                  follow.current = true
                  scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' })
                }}
              >
                <ArrowDown />
              </Button>
            </Hint>
          </div>
        ) : null}
        {connection === 'reconnecting' ? (
          <p role="status" className={styles.connection}>
            Reconnecting…{' '}
            <Button variant="link" onClick={() => void snapshot.refetch()}>
              Reconnect
            </Button>
          </p>
        ) : null}
        {error ? <Notice>{error}</Notice> : null}
        {unconfirmed ? (
          <Notice>
            The send could not be confirmed.{' '}
            <Button variant="link" disabled={pending} onClick={() => void send(true)}>
              Check send
            </Button>
          </Notice>
        ) : null}
        {config.isSuccess && !config.data.enabled ? (
          <p className={styles.connection}>
            Chat is unavailable. The configured credits may need attention.
          </p>
        ) : null}
        {config.error ? (
          <Notice>
            Could not connect to Chat.{' '}
            <Button variant="link" onClick={() => void config.refetch()}>
              Reconnect
            </Button>
          </Notice>
        ) : null}
        <ChatComposer
          inputRef={input}
          draft={draft}
          onDraftChange={setDraft}
          onSend={() => void send()}
          onStop={() => void stop()}
          running={running}
          stopping={stopping}
          pending={pending}
          disabled={
            !config.data?.enabled ||
            !!snapshot.error ||
            (!!conversationId && snapshot.isPending) ||
            unconfirmed
          }
        />
        {stopping ? (
          <p role="status" className={styles.connection}>
            Stopping…
          </p>
        ) : null}
      </div>
      {reference ? (
        <ChatInspector
          key={`${reference.kind}:${reference.id}`}
          reference={reference}
          onClose={closeReference}
          onReference={openReference}
        />
      ) : null}
    </section>
  )
}
const ChatMessage = memo(function ChatMessage({
  message,
  running,
  onReference,
}: {
  message: ChatMessageRecord
  running: boolean
  onReference: (reference: { kind: ChatMediaReference; id: string }, origin?: HTMLElement) => void
}) {
  const summaries = message.parts.filter((x) => x.type === 'reasoning_summary'),
    tools = message.parts.filter((x) => x.type === 'tool_activity'),
    references = message.parts.filter((x) => x.type === 'media_reference'),
    citations = message.parts.filter((x) => x.type === 'citation')
  const text = message.parts
    .filter((x) => x.type === 'text')
    .map((x) => x.text)
    .join('\n\n')
  function url(value: string) {
    if (value.startsWith('library:'))
      return references.some((x) => `library:${x.kind}:${x.itemId}` === value) ? value : ''
    try {
      const parsed = new URL(value)
      return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password
        ? value
        : ''
    } catch {
      return ''
    }
  }
  return (
    <article
      className={message.role === 'user' ? styles.userMessage : styles.assistantMessage}
      aria-label={message.role === 'user' ? 'Your message' : 'Assistant response'}
    >
      {message.role === 'user' ? (
        text
      ) : (
        <>
          {summaries.length ? (
            <Collapsible className={styles.activity}>
              <CollapsibleTrigger
                render={
                  <Button
                    variant="ghost"
                    className="justify-start gap-2 px-0 font-normal text-muted-foreground"
                  />
                }
              >
                {running ? <span className={styles.pulse} /> : null}
                {running ? 'Thinking' : 'Thinking summary'}
                <CaretRight className="size-3.5" />
              </CollapsibleTrigger>
              {running ? <p className={styles.preview}>{summaries.at(-1)?.text}</p> : null}
              <CollapsibleContent>
                <div className={styles.summary}>
                  {summaries.map((p) => (
                    <p key={p.id}>{p.text}</p>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
          {tools.length ? (
            <Collapsible className={styles.activity}>
              <CollapsibleTrigger
                render={
                  <Button
                    variant="ghost"
                    className="justify-start gap-2 px-0 font-normal text-muted-foreground"
                  />
                }
              >
                <Books className="size-4" />
                {tools.length} tool call{tools.length === 1 ? '' : 's'}
                <CaretRight className="size-3.5" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className={styles.toolList}>
                  {tools.map((tool) => (
                    <div key={tool.id} className={styles.tool}>
                      <span>{tool.title}</span>
                      <small>{tool.detail}</small>
                      <small>
                        {tool.status === 'running'
                          ? 'In progress…'
                          : tool.status === 'cancelled'
                            ? 'Stopped'
                            : tool.status === 'failed'
                              ? 'Unavailable'
                              : 'Completed'}
                      </small>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
          <div className={styles.answer}>
            <Markdown
              remarkPlugins={[remarkGfm]}
              skipHtml
              urlTransform={url}
              components={{
                a: ({ href, children }) => {
                  if (href?.startsWith('library:')) {
                    const ref = references.find((x) => `library:${x.kind}:${x.itemId}` === href)
                    return ref ? (
                      <Button
                        id={`chat-citation-${message.id}-${ref.id}`}
                        variant="link"
                        className="h-auto whitespace-normal p-0 text-inherit font-inherit underline underline-offset-4"
                        onClick={(event) => {
                          event.currentTarget.focus()
                          onReference({ kind: ref.kind, id: ref.itemId }, event.currentTarget)
                        }}
                      >
                        {children}
                      </Button>
                    ) : (
                      <>{children}</>
                    )
                  }
                  return href ? (
                    <a href={href} target="_blank" rel="noreferrer noopener">
                      {children}
                    </a>
                  ) : (
                    <>{children}</>
                  )
                },
                img: ({ alt }) => <span>{alt}</span>,
              }}
            >
              {text}
            </Markdown>
          </div>
          {references.length || citations.length ? (
            <div className={styles.references} aria-label="Sources">
              {references.map((ref) => (
                <Button
                  key={ref.id}
                  id={`chat-source-${message.id}-${ref.id}`}
                  variant="link"
                  className="h-auto max-w-full whitespace-normal px-0 text-sm text-muted-foreground font-normal"
                  onClick={(event) => {
                    event.currentTarget.focus()
                    onReference({ kind: ref.kind, id: ref.itemId }, event.currentTarget)
                  }}
                >
                  {ref.title}
                </Button>
              ))}
              {citations.map((citation) => (
                <a
                  key={citation.id}
                  href={url(citation.url)}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {citation.title}
                </a>
              ))}
            </div>
          ) : null}
        </>
      )}
    </article>
  )
})
