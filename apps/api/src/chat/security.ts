import { ChatConflict } from '@media-tracker/db'

export async function chatDigest(value: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('')
}
function base64(bytes: Uint8Array) {
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}
function unbase64(value: string) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))
}
async function signingKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`imladris-chat-cursor-v1:${secret}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}
export async function chatCursor(type: string, payload: unknown, secret: string) {
  const body = new TextEncoder().encode(JSON.stringify({ v: 1, type, payload }))
  return `${base64(body)}.${base64(new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(secret), body)))}`
}
export async function readChatCursor(
  value: string,
  type: string,
  secret: string,
): Promise<unknown> {
  try {
    if (value.length > 2048) throw new Error()
    const [body, signature, ...rest] = value.split('.')
    if (!body || !signature || rest.length) throw new Error()
    const bytes = unbase64(body)
    if (!(await crypto.subtle.verify('HMAC', await signingKey(secret), unbase64(signature), bytes)))
      throw new Error()
    const decoded = JSON.parse(new TextDecoder().decode(bytes)) as {
      v: number
      type: string
      payload: unknown
    }
    if (decoded.v !== 1 || decoded.type !== type) throw new Error()
    return decoded.payload
  } catch {
    throw new ChatConflict('chat_cursor_invalid', 400)
  }
}
export function publicChatUrl(value: string): string | null {
  try {
    if (value.length > 4096) return null
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null
    const host = url.hostname.toLowerCase().replace(/\.$/, '')
    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host.endsWith('.localhost') ||
      host.includes(':') ||
      /^\d+(\.\d+){3}$/.test(host) ||
      !host.includes('.')
    )
      return null
    return url.href
  } catch {
    return null
  }
}
/** Known private evidence is barred from web queries; free public queries remain a documented residual risk. */
export function validatePublicSearch(query: string, privateText: readonly string[]): string {
  const value = query.trim()
  if (
    !value ||
    value.length > 240 ||
    /[\r\n]/.test(value) ||
    /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(value) ||
    /\b(sk-|Bearer\s|localhost|127\.0\.0\.1|10\.\d+\.|192\.168\.|file:|\/Users\/)/i.test(value)
  )
    throw new ChatConflict('chat_private_search_blocked', 400)
  const normalized = value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')
  for (const text of privateText) {
    const words = text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(' ')
      .filter(Boolean)
    for (let i = 0; i + 5 < words.length; i++) {
      const phrase = words.slice(i, i + 6).join(' ')
      if (phrase.length >= 24 && normalized.includes(phrase))
        throw new ChatConflict('chat_private_search_blocked', 400)
    }
  }
  for (const match of value.matchAll(/https?:\/\/[^\s]+/g))
    if (!publicChatUrl(match[0])) throw new ChatConflict('chat_private_search_blocked', 400)
  return value
}
