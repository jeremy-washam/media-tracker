import { type ComponentProps } from 'react'
import { Star } from 'lucide-react'

export function LibrarySelect({ className = '', ...props }: ComponentProps<'select'>) {
  return <select {...props} className={`library-native-select ${className}`} />
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
