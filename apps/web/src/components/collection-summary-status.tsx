import { Notice } from './ui-patterns'
import { Button } from './ui/button'

export function CollectionSummaryStatus({
  query,
}: {
  query: { isError: boolean; isFetching: boolean; refetch: () => Promise<unknown> }
}) {
  if (!query.isError) return null
  return (
    <Notice>
      <p>Library counts and filters could not be loaded.</p>
      <Button variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
        Retry summary
      </Button>
    </Notice>
  )
}
