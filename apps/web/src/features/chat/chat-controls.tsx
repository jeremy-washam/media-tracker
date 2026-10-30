import type { Ref } from 'react'
import { ArrowUp, CaretRight, NotePencil } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { CollapsibleTrigger } from '@/components/ui/collapsible'
import { InputGroup, InputGroupAddon, InputGroupTextarea } from '@/components/ui/input-group'

export function NewChatAction({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className="h-11 w-full justify-start gap-3 px-2.5 font-normal"
    >
      <NotePencil className="size-5" />
      New Chat
    </Button>
  )
}
export function ChatSectionTrigger({ title, open }: { title: string; open: boolean }) {
  return (
    <CollapsibleTrigger
      render={
        <Button
          variant="link"
          className="h-9 justify-start gap-1 px-2.5 font-normal text-muted-foreground no-underline hover:text-foreground hover:no-underline"
        />
      }
    >
      <span>{title}</span>
      <CaretRight className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
    </CollapsibleTrigger>
  )
}
export function ChatComposer({
  inputRef,
  draft,
  onDraftChange,
  onSend,
  onStop,
  running,
  stopping,
  pending,
  disabled,
}: {
  inputRef: Ref<HTMLTextAreaElement>
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  running: boolean
  stopping: boolean
  pending: boolean
  disabled: boolean
}) {
  return (
    <InputGroup
      data-ui="chat-composer"
      className="items-end rounded-[28px] border-transparent bg-secondary has-disabled:bg-secondary has-disabled:opacity-100 dark:bg-secondary dark:has-disabled:bg-secondary"
    >
      <InputGroupTextarea
        ref={inputRef}
        aria-label="Message Imladris"
        placeholder="Message Imladris"
        value={draft}
        rows={1}
        maxLength={32000}
        className="min-h-14 max-h-52 [field-sizing:content] px-5 py-4 text-base leading-6 md:text-base"
        onChange={(e) => onDraftChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            if (!running && !pending && !disabled) onSend()
          }
        }}
      />
      <InputGroupAddon align="inline-end" className="self-end py-2 pr-2">
        <Button
          variant="default"
          size="icon"
          className="size-10 rounded-full bg-foreground text-background hover:bg-foreground/85 disabled:opacity-35"
          aria-label={
            stopping
              ? 'Stopping response'
              : running
                ? 'Stop response'
                : pending
                  ? 'Sending message'
                  : 'Send message'
          }
          disabled={stopping || pending || (!running && (disabled || !draft.trim()))}
          onClick={running ? onStop : onSend}
        >
          {running ? (
            <span className="size-3 rounded-[2px] bg-current" />
          ) : (
            <ArrowUp className="size-5" />
          )}
        </Button>
      </InputGroupAddon>
    </InputGroup>
  )
}
