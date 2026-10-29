# Contracts

Zod schemas for REST requests and responses, queue messages, connector inputs, and generated OpenAPI definitions.

Library query dates validate real calendar values. Publication boundaries retain
year/month/day precision; end boundaries include their full stated interval.
All date ranges reject reversed bounds. Search text is limited to 500 characters,
and Books/Articles/Podcasts/Music queries accept at most 50 selected facet values
in total, so combined filters leave room for D1's scalar and pagination parameters.
Videos retains larger selections (up to 500 values per facet) using JSON-bound
SQL membership rather than one parameter per selected value. Catalog
queue operations require their matching source and durable job identifier.
