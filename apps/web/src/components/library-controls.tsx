import { type ComponentProps } from 'react'
import { Grid2X2, List, Star } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type LibrarySelectProps = Omit<
  ComponentProps<typeof SelectTrigger>,
  'value' | 'onChange' | 'children'
> & {
  value: string
  options: { value: string; label: string }[]
  onValueChange: (value: string) => void
}

export function LibrarySelect({
  className,
  value,
  options,
  onValueChange,
  disabled,
  ...props
}: LibrarySelectProps) {
  return (
    <Select
      value={value}
      items={options}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next)
      }}
    >
      <SelectTrigger className={cn('min-w-0 max-w-full shrink-0', className)} {...props}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        className="w-max min-w-(--anchor-width) max-w-(--available-width)"
      >
        <SelectGroup>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              className="[&>:first-child]:min-w-0 [&>:first-child]:shrink [&>:first-child]:whitespace-normal [&>:first-child]:[overflow-wrap:anywhere]"
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export function RatingStars({ rating }: { rating: number | null }) {
  if (rating === null)
    return (
      <span className="rating-stars rating-unavailable" aria-label="Not rated">
        —
      </span>
    )
  return (
    <span className="rating-stars" role="img" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: Math.ceil(rating) }, (_, index) => (
        <span className="rating-star" key={index}>
          <Star aria-hidden="true" />
          <span style={{ width: `${Math.min(1, rating - index) * 100}%` }}>
            <Star aria-hidden="true" />
          </span>
        </span>
      ))}
    </span>
  )
}

export function MediaCard({ className = '', ...props }: ComponentProps<'button'>) {
  return <button type="button" {...props} className={`media-card ${className}`} />
}

export function LibraryLayoutToggle({
  value,
  onValueChange,
}: {
  value: 'list' | 'grid'
  onValueChange: (value: 'list' | 'grid') => void
}) {
  return (
    <ToggleGroup
      className="layout-toggle"
      aria-label="Result layout"
      variant="outline"
      spacing={0}
      multiple={false}
      value={[value]}
      onValueChange={(values) => {
        const next = values[0] ?? value
        if (next === 'list' || next === 'grid') onValueChange(next)
      }}
    >
      <ToggleGroupItem value="list" aria-label="List view">
        <List aria-hidden="true" />
      </ToggleGroupItem>
      <ToggleGroupItem value="grid" aria-label="Grid view">
        <Grid2X2 aria-hidden="true" />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

// Application-specific row targets and click-away surfaces are intentional native buttons.
// Ordinary actions must use ui/button; keep native button exceptions in this file.
export function MediaRowButton(props: ComponentProps<'button'>) {
  return <button type="button" {...props} />
}
export function InspectorBackdrop(props: ComponentProps<'button'>) {
  return <button type="button" {...props} />
}
