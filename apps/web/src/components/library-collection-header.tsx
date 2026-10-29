import { type ComponentProps, type ReactNode } from 'react'
import { AppButton as Button } from './ui-patterns'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from './ui/sheet'
import styles from './library-workspace.module.css'

/** Keep collection controls outside the results' scroll and pagination viewport. */
export function LibraryCollectionHeader({
  children,
  filters,
  filtersOpen,
  onFiltersOpenChange,
}: {
  children: ReactNode
  filters: ReactNode
  filtersOpen: boolean
  onFiltersOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={filtersOpen} onOpenChange={onFiltersOpenChange}>
      <div className={styles['collection-header']} data-ui="collection-header">
        {children}
      </div>
      <SheetContent className={styles['collection-filter-sheet']}>
        <SheetTitle className="sr-only">Collection filters</SheetTitle>
        <SheetDescription className="sr-only">
          Refine the current Library collection.
        </SheetDescription>
        <div className={styles['collection-filter-scroll']}>{filters}</div>
      </SheetContent>
    </Sheet>
  )
}

export function LibraryFiltersTrigger({ children, ...props }: ComponentProps<typeof Button>) {
  return <SheetTrigger render={<Button {...props} />}>{children}</SheetTrigger>
}
