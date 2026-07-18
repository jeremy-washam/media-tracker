# ADR 0005: Single-User Authentication and Secret Handling

- Status: Accepted
- Date: 2026-07-18

## Context

Only one person uses the application, but its media history and provider tokens
are private. OAuth callbacks and some webhook endpoints must remain reachable
without a normal browser session.

## Decision

Protect the web client and ordinary API routes with Cloudflare Access and enforce
one configured identity. Keep callback/webhook routes narrowly public with their
own state or signature verification. Store static credentials as Worker secrets.
Encrypt rotating provider tokens in D1 with AES-GCM using a versioned Worker-held
key. Keep R2 private and redact logs.

## Consequences

There is no application registration, password system, or multi-user permission
model. Public integration routes still require careful threat-specific controls.
A future native iOS client will require an explicit native-compatible auth design
before it can access this API.
