import { z } from 'zod'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import type { ChatConversationRecord } from '@media-tracker/contracts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DotsThree, Star, NotePencil, Trash } from '@/components/icons'
import { Hint, Notice } from '@/components/ui-patterns'
import { NewChatAction, ChatSectionTrigger } from './chat-controls'
import {
  chatRequest,
  chatKeys,
  ChatListSchema,
  ChatConversationSchema,
  refreshChatLists,
  chatErrorText,
  snapshotSchema,
} from './chat-api'
import styles from './chat.module.css'

function stored(section: string) {
  try {
    return localStorage.getItem(`imladris:chat:${section}:v1`) !== 'false'
  } catch {
    return true
  }
}
export function ChatSidebar({ onNavigate }: { onNavigate: () => void }) {
  const location = useLocation(),
    navigate = useNavigate(),
    client = useQueryClient()
  const [editing, setEditing] = useState<{
      chat: ChatConversationRecord
      action: 'rename' | 'delete'
    } | null>(null),
    [title, setTitle] = useState(''),
    [pending, setPending] = useState(false),
    [error, setError] = useState<string | null>(null)
  async function toggle(chat: ChatConversationRecord) {
    setError(null)
    try {
      const fresh = await chatRequest(`/conversations/${chat.id}`, snapshotSchema)
      await chatRequest(`/conversations/${chat.id}`, ChatConversationSchema, {
        method: 'PATCH',
        body: JSON.stringify({
          expectedMetadataRevision: fresh.conversation.metadataRevision,
          favorite: !chat.favorite,
        }),
      })
      refreshChatLists(client)
      void client.invalidateQueries({ queryKey: chatKeys.snapshot(chat.id) })
    } catch (e) {
      setError(chatErrorText(e))
      refreshChatLists(client)
    }
  }
  async function commit() {
    if (!editing) return
    setPending(true)
    setError(null)
    try {
      if (editing.action === 'delete') {
        await chatRequest(`/conversations/${editing.chat.id}`, z.object({ cleanup: z.string() }), {
          method: 'DELETE',
        })
        client.removeQueries({ queryKey: chatKeys.snapshot(editing.chat.id) })
        if (location.pathname === `/chat/${editing.chat.id}`) {
          await navigate({ to: '/chat' })
          onNavigate()
        }
      } else
        await chatRequest(`/conversations/${editing.chat.id}`, ChatConversationSchema, {
          method: 'PATCH',
          body: JSON.stringify({ expectedMetadataRevision: editing.chat.metadataRevision, title }),
        })
      setEditing(null)
      refreshChatLists(client)
      void client.invalidateQueries({ queryKey: ['chat', 'snapshot'] })
    } catch (e) {
      setError(chatErrorText(e))
      if (editing.action === 'rename') {
        try {
          const fresh = await chatRequest(`/conversations/${editing.chat.id}`, snapshotSchema)
          setEditing({ ...editing, chat: fresh.conversation })
        } catch {
          /* Keep the draft until the owner can reconnect. */
        }
      }
    } finally {
      setPending(false)
    }
  }
  return (
    <div className={styles.sidebar} data-ui="chat-sidebar">
      <NewChatAction
        onClick={() => {
          void navigate({ to: '/chat' })
          onNavigate()
          window.dispatchEvent(new Event('imladris:new-chat'))
        }}
      />
      <div className={styles.sections}>
        {(['favorites', 'chats'] as const).map((section) => (
          <ChatSection
            key={section}
            section={section}
            selected={location.pathname.split('/')[2]}
            onNavigate={onNavigate}
            onEdit={(chat, action) => {
              setEditing({ chat, action })
              setTitle(chat.title)
              setError(null)
            }}
            onFavorite={(chat) => void toggle(chat)}
          />
        ))}
      </div>
      {error && !editing ? <Notice>{error}</Notice> : null}
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open && !pending) setEditing(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing?.action === 'delete' ? 'Delete chat?' : 'Rename chat'}
            </DialogTitle>
            <DialogDescription>
              {editing?.action === 'delete'
                ? 'This removes the conversation and its saved response evidence. Your library is unchanged.'
                : 'Choose a title for this conversation.'}
            </DialogDescription>
          </DialogHeader>
          {editing?.action === 'rename' ? (
            <Input
              autoFocus
              aria-label="Chat title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && title.trim() && !pending) void commit()
              }}
            />
          ) : null}
          {error ? <Notice>{error}</Notice> : null}
          <DialogFooter>
            <Button variant="ghost" disabled={pending} onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              variant={editing?.action === 'delete' ? 'destructive' : 'default'}
              disabled={pending || (editing?.action === 'rename' && !title.trim())}
              onClick={() => void commit()}
            >
              {pending ? 'Saving…' : editing?.action === 'delete' ? 'Delete' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
function ChatSection({
  section,
  selected,
  onNavigate,
  onEdit,
  onFavorite,
}: {
  section: 'favorites' | 'chats'
  selected: string | undefined
  onNavigate: () => void
  onEdit: (chat: ChatConversationRecord, action: 'rename' | 'delete') => void
  onFavorite: (chat: ChatConversationRecord) => void
}) {
  const [open, setOpen] = useState(() => stored(section)),
    client = useQueryClient()
  useEffect(() => {
    try {
      localStorage.setItem(`imladris:chat:${section}:v1`, String(open))
    } catch {
      /* Collapse remains local to this window. */
    }
  }, [section, open])
  const query = useInfiniteQuery({
    queryKey: [...chatKeys.lists, section],
    queryFn: ({ pageParam, signal }) =>
      chatRequest(
        `/conversations?section=${section}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`,
        ChatListSchema,
        { signal },
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: open,
    retry: false,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  })
  const chats = [
    ...new Map(
      query.data?.pages.flatMap((page) => page.data).map((chat) => [chat.id, chat]) ?? [],
    ).values(),
  ]
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <ChatSectionTrigger title={section === 'favorites' ? 'Favorites' : 'Chats'} open={open} />
      <CollapsibleContent>
        <div className={styles.chatList}>
          {chats.map((chat) => (
            <div key={chat.id} className={styles.chatRow} data-selected={selected === chat.id}>
              <Link
                to="/chat/$conversationId"
                params={{ conversationId: chat.id }}
                className={styles.chatLink}
                aria-current={selected === chat.id ? 'page' : undefined}
                onClick={onNavigate}
              >
                {chat.title}
              </Link>
              <div className={styles.rowActions}>
                <Hint content={chat.favorite ? 'Unfavorite' : 'Favorite'}>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`${chat.favorite ? 'Unfavorite' : 'Favorite'} ${chat.title}`}
                    onClick={() => onFavorite(chat)}
                  >
                    <Star className="size-4" weight={chat.favorite ? 'fill' : 'regular'} />
                  </Button>
                </Hint>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`More actions for ${chat.title}`}
                      />
                    }
                  >
                    <DotsThree className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => onEdit(chat, 'rename')}>
                      <NotePencil />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onFavorite(chat)}>
                      <Star />
                      {chat.favorite ? 'Unfavorite' : 'Favorite'}
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => onEdit(chat, 'delete')}>
                      <Trash />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
        {query.isPending ? <p className={styles.sidebarNote}>Loading…</p> : null}
        {!query.isPending && !chats.length && !query.error ? (
          <p className={styles.sidebarNote}>
            {section === 'favorites' ? 'No favorites yet' : 'No chats yet'}
          </p>
        ) : null}
        {query.error ? (
          <div className={styles.sidebarNote}>
            <p>{chatErrorText(query.error)}</p>
            <Button variant="link" onClick={() => refreshChatLists(client)}>
              Refresh
            </Button>
          </div>
        ) : null}
        {query.hasNextPage ? (
          <Button
            variant="ghost"
            className="w-full font-normal"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
          </Button>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  )
}
