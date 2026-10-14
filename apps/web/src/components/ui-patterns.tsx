import {
  useRef,
  useId,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button as PrimitiveButton } from '@/components/ui/button'
import { Input as PrimitiveInput } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export function AppButton({ className, ...props }: ComponentProps<typeof PrimitiveButton>) {
  return (
    <PrimitiveButton
      className={cn('text-[length:inherit] text-[color:inherit] font-normal', className)}
      {...props}
    />
  )
}
export function AppInput({ className, ...props }: ComponentProps<typeof PrimitiveInput>) {
  return (
    <PrimitiveInput
      className={cn('text-[length:inherit] md:text-[length:inherit]', className)}
      {...props}
    />
  )
}
export function Notice({ children, className, ...props }: ComponentProps<typeof Alert>) {
  return (
    <Alert variant="destructive" className={cn('my-2', className)} {...props}>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}
export function LoadingState({ children, className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col gap-3 py-4', className)}
      {...props}
    >
      <div>{children}</div>
      <Skeleton aria-hidden="true" className="h-4 w-3/4 max-w-64" />
      <Skeleton aria-hidden="true" className="h-4 w-1/2 max-w-48" />
    </div>
  )
}
export function Hint({ content, children }: { content: ReactNode; children: ReactElement }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  return (
    <Tooltip onOpenChange={setOpen}>
      <TooltipTrigger aria-describedby={open ? id : undefined} render={children} />
      <TooltipContent id={id} role="tooltip">
        {content}
      </TooltipContent>
    </Tooltip>
  )
}
export function FileUploadButton({
  children,
  disabled,
  buttonSize = 'default',
  ...props
}: Omit<ComponentProps<typeof PrimitiveInput>, 'type'> & {
  buttonSize?: ComponentProps<typeof PrimitiveButton>['size']
}) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <PrimitiveButton
        type="button"
        variant="outline"
        size={buttonSize}
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        {children}
      </PrimitiveButton>
      <AppInput ref={input} type="file" hidden tabIndex={-1} disabled={disabled} {...props} />
    </>
  )
}
