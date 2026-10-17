import { cn } from '@/lib/utils'
import { SpinnerGap, type IconProps } from '@/components/icons'

function Spinner({ className, ...props }: IconProps) {
  return (
    <SpinnerGap
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      aria-hidden={false}
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  )
}

export { Spinner }
