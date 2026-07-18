# ADR 0002: React/Vite Web Client and Hono REST API

- Status: Accepted
- Date: 2026-07-18

## Context

The product does not need server-rendered marketing pages or Next.js conventions.
It does need a lightweight web UI, a Worker-compatible API, and a stable boundary
that a future iOS application can consume.

## Decision

Build a React single-page application with Vite and a separate Hono REST API on
Cloudflare Workers. Share Zod contracts, not server implementation details. Use
TanStack Router and Query in the web client.

## Consequences

Web and API can be tested and deployed independently. Native clients can use the
same HTTP contract. We must design explicit API endpoints and cannot rely on
Next.js server actions, route handlers, or React Server Components.
