import { Children, isValidElement, type ReactNode, type ComponentProps } from 'react'
import { Select } from '@base-ui/react/select'
import { Check, ChevronDown, Star } from 'lucide-react'

export function LibrarySelect({
  children,
  value,
  onChange,
  'aria-label': label,
}: {
  children: ReactNode
  value: string
  onChange: (event: { target: { value: string } }) => void
  'aria-label'?: string
}) {
  const options = Children.toArray(children)
    .filter(isValidElement<{ value: string; children: ReactNode }>)
    .map((child) => ({ value: child.props.value, label: child.props.children }))
  return (
    <Select.Root
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange({ target: { value: next } })
      }}
    >
      <Select.Trigger className="library-select-trigger" aria-label={label}>
        <Select.Value>{options.find((option) => option.value === value)?.label}</Select.Value>
        <Select.Icon>
          <ChevronDown size={14} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner sideOffset={6} align="end" className="library-select-positioner">
          <Select.Popup className="library-select-popup">
            {options.map((option) => (
              <Select.Item
                key={option.value}
                value={option.value}
                className="library-select-option"
              >
                <Select.ItemText>{option.label}</Select.ItemText>
                <Select.ItemIndicator>
                  <Check size={14} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
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
