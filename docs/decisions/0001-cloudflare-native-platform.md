# ADR 0001: Cloudflare-Native Platform

- Status: Accepted
- Date: 2026-07-18

## Context

The application is private, single-user, sync-heavy, and expected to fit within
small hosted-service limits. It needs scheduled work, durable relational storage,
private object storage, queues, and authenticated web access without substantial
operations work.

## Decision

Deploy the API to Cloudflare Workers. Use D1 for normalized relational data, R2
for raw objects and authorized full text, Queues for asynchronous work, Cron
Triggers for reconciliation, and Access for initial user authentication.

## Consequences

The first deployment is inexpensive and operationally compact. Code must respect
Worker runtime constraints and Cloudflare binding semantics. Platform-specific
APIs remain in adapters so the domain, connectors, contracts, and REST clients
can survive a future move.
