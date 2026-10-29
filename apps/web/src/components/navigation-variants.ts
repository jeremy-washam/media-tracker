import { cn } from '@/lib/utils'
import { cva, type VariantProps } from 'class-variance-authority'
const navigationVariants = cva(
  "flex h-[38px] min-w-0 items-center justify-start gap-2.5 rounded-(--radius) border-0 bg-transparent px-2.5 py-0 text-left text-sm font-normal text-muted-foreground cursor-default hover:bg-[var(--surface-hover)] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-[0.52] [&_svg]:size-[17px] [&_svg:not([class*='size-'])]:size-[17px] [&_svg]:shrink-0",
  {
    variants: {
      active: {
        true: 'font-medium bg-[var(--selection)] text-[var(--sidebar-foreground)] hover:bg-[var(--selection)]',
        false: '',
      },
      collapsed: { true: 'justify-center px-0', false: '' },
    },
    defaultVariants: { active: false, collapsed: false },
  },
)

export function navigationItemVariants(props: VariantProps<typeof navigationVariants> = {}) {
  return cn(navigationVariants(props))
}
