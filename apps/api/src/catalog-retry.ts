/** A delivery must survive transient provider, storage or continuation failures. */
export class CatalogRetryError extends Error {
  constructor(
    readonly delaySeconds = 60,
    options?: ErrorOptions,
  ) {
    super('Catalog refresh needs another delivery', options)
    this.name = 'CatalogRetryError'
  }
}
