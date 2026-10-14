import mediaStyles from '@/components/media-presentation.module.css'
import controlsStyles from '@/components/library-controls.module.css'
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
      <SelectTrigger
        className={cn(
          'min-w-0 max-w-full shrink-0 text-[length:inherit] text-[color:inherit] data-placeholder:text-[color:inherit] font-normal',
          className,
        )}
        {...props}
      >
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
      <span
        className={cn(mediaStyles['rating-stars'], mediaStyles['rating-unavailable'])}
        aria-label="Not rated"
        data-ui="rating-stars"
      >
        —
      </span>
    )
  return (
    <span
      className={mediaStyles['rating-stars']}
      role="img"
      aria-label={`${rating} out of 5 stars`}
      data-ui="rating-stars"
    >
      {Array.from({ length: Math.ceil(rating) }, (_, index) => (
        <span className={mediaStyles['rating-star']} key={index}>
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
  return <button type="button" {...props} className={cn(mediaStyles['media-card'], className)} />
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
      className={controlsStyles['layout-toggle']}
      aria-label="Result layout"
      variant="outline"
      spacing={0}
      multiple={false}
      value={[value]}
      onValueChange={(values) => {
        const next = values[0] ?? value
        if (next === 'list' || next === 'grid') onValueChange(next)
      }}
      data-ui="layout-toggle"
    >
      <ToggleGroupItem
        value="list"
        aria-label="List view"
        className="text-[length:inherit] font-normal"
      >
        <List aria-hidden="true" />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="grid"
        aria-label="Grid view"
        className="text-[length:inherit] font-normal"
      >
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

// Application density belongs to these compositions; primitives retain their defaults.
type LibraryPart = { 'data-ui'?: string }
export function LibraryToolbar({
  className,
  'data-ui': part,
  ...props
}: ComponentProps<'div'> & LibraryPart) {
  return (
    <div
      className={cn(
        controlsStyles['books-toolbar'],
        '[&_[data-ui~=toolbar-button]]:text-[11px] [&_[data-ui~=library-sort]]:text-[11px] [&_[data-slot=select-trigger]]:text-[11px] [&_[data-slot=input-group-control]]:text-[12px]',
        className,
      )}
      {...props}
      data-ui={['library-toolbar', part].filter(Boolean).join(' ')}
    />
  )
}
export function LibraryFilterPanel({
  className,
  'data-ui': part,
  ...props
}: ComponentProps<'section'> & LibraryPart) {
  return (
    <section
      className={cn(
        controlsStyles['filter-panel'],
        'text-[12px] [&_label]:text-[12px] [&_[data-slot=field-label]]:text-[12px] [&_[data-slot=input]]:text-[12px] [&_[data-slot=select-trigger]]:text-[12px] [&_[data-slot=button]]:text-[12px]',
        className,
      )}
      {...props}
      data-ui={['filter-panel', part].filter(Boolean).join(' ')}
    />
  )
}
