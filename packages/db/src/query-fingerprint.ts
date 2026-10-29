/** Hash query identity so accepted filters cannot grow the returned cursor. */
export async function queryFingerprint(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(value)),
  )
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

/** Accept persisted pre-hash cursors while emitting only bounded new cursors. */
export async function matchesQueryFingerprint(actual: unknown, expected: string): Promise<boolean> {
  if (actual === expected) return true
  if (typeof actual !== 'string' || actual.startsWith('sha256:')) return false
  try {
    return (await queryFingerprint(JSON.parse(actual))) === expected
  } catch {
    return false
  }
}
