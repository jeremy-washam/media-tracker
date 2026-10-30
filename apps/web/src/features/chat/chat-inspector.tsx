import type { ChatMediaReference } from '@media-tracker/contracts'
import { InspectorBackdrop } from '@/components/library-controls'
import { BookInspector } from '@/features/books/books-collection-page'
import { MovieInspector } from '@/features/movies/movies-collection-page'
import { ArticleInspector } from '@/features/articles/articles-collection-page'
import { PodcastInspector } from '@/features/podcasts/podcasts-collection-page'
import { MusicInspector } from '@/features/music/music-collection-page'
import { VideoInspector, ChannelInspector } from '@/features/videos/videos-collection-page'

export function ChatInspector({
  reference,
  onClose,
  onReference,
}: {
  reference: { kind: ChatMediaReference; id: string }
  onClose: () => void
  onReference: (ref: { kind: ChatMediaReference; id: string }) => void
}) {
  const { kind, id } = reference
  return (
    <>
      <InspectorBackdrop aria-label="Close inspector" onClick={onClose} />
      {kind === 'book' ? (
        <BookInspector mediaItemId={id} onClose={onClose} />
      ) : kind === 'movie' ? (
        <MovieInspector mediaItemId={id} search={{}} onClose={onClose} />
      ) : kind === 'article' ? (
        <ArticleInspector id={id} onClose={onClose} />
      ) : kind === 'podcast_episode' || kind === 'show' ? (
        <PodcastInspector
          id={id}
          kind={kind === 'show' ? 'show' : 'episode'}
          onClose={onClose}
          onOpenShow={(show) => onReference({ kind: 'show', id: show })}
        />
      ) : kind === 'video' ? (
        <VideoInspector id={id} onClose={onClose} />
      ) : kind === 'channel' ? (
        <ChannelInspector id={id} onClose={onClose} />
      ) : (
        <MusicInspector
          id={id}
          view={kind === 'album' ? 'albums' : kind === 'artist' ? 'artists' : 'tracks'}
          matchingItem={null}
          onClose={onClose}
        />
      )}
    </>
  )
}
