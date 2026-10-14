import type { ConnectionsResponse } from '@media-tracker/contracts'
import readwise from '@/assets/sources/readwise.svg'
import hardcover from '@/assets/sources/hardcover.png'
import letterboxd from '@/assets/sources/letterboxd.svg'
import spotify from '@/assets/sources/spotify.svg'
import youtube from '@/assets/sources/youtube.png'

const logos = { readwise, hardcover, letterboxd, spotify, youtube }

export function SourceLogo({
  source,
  className,
}: {
  source: ConnectionsResponse['data'][number]['source']
  className?: string | undefined
}) {
  return <img src={logos[source]} className={className} alt="" aria-hidden="true" />
}
