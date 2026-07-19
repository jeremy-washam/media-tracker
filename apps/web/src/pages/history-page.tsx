export function HistoryPage() {
  return (
    <section className="page-stack" aria-labelledby="history-title">
      <div className="page-heading">
        <p className="eyebrow">Personal ledger</p>
        <h1 id="history-title">Your media history, in one place.</h1>
        <p>
          Movies, books, podcasts, articles, and videos will appear here as source connections come
          online.
        </p>
      </div>

      <div className="summary-grid" aria-label="History summary">
        <article className="summary-card">
          <span>Items imported</span>
          <strong>0</strong>
          <small>Waiting for the first connection</small>
        </article>
        <article className="summary-card">
          <span>Sources connected</span>
          <strong>0 / 5</strong>
          <small>Readwise will be first</small>
        </article>
        <article className="summary-card">
          <span>Last sync</span>
          <strong>—</strong>
          <small>No sync runs yet</small>
        </article>
      </div>

      <div className="empty-panel">
        <div className="empty-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div>
          <h2>No media yet</h2>
          <p>
            The application shell is connected. The next milestone adds the canonical ledger,
            followed by Readwise history ingestion.
          </p>
        </div>
      </div>
    </section>
  )
}
