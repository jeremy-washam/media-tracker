import { Unzip, UnzipInflate } from 'fflate'

export const hostedZipInflatedLimit = 8 * 1024 * 1024
export const hostedZipMemberLimit = 2000
export const hostedZipLimitMessage =
  'Hosted imports support ZIPs up to 25 MiB compressed, 8 MiB expanded, and 2,000 files. Use the local app import workflow for larger exports.'

export class HostedZipError extends Error {
  constructor() {
    super(hostedZipLimitMessage)
    this.name = 'HostedZipError'
  }
}

interface Member {
  compressed: number
  expanded: number
  method: number
  flags: number
  localOffset: number
  name: Uint8Array
}

/** Check directory metadata before inflation, then independently count actual
 * decompressor output. ZIP fields are untrusted, including originalSize. */
export function preflightHostedZip(bytes: Uint8Array): void {
  const fail = (): never => {
    throw new HostedZipError()
  }
  if (bytes.byteLength < 22) fail()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = -1
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 22 - 65535); offset--) {
    if (
      view.getUint32(offset, true) === 0x06054b50 &&
      offset + 22 + view.getUint16(offset + 20, true) === bytes.length
    ) {
      end = offset
      break
    }
  }
  if (end < 0) fail()
  if (view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) fail()
  const count = view.getUint16(end + 10, true)
  if (count !== view.getUint16(end + 8, true) || count > hostedZipMemberLimit) fail()
  const directorySize = view.getUint32(end + 12, true)
  const directoryOffset = view.getUint32(end + 16, true)
  if (directoryOffset + directorySize !== end || directorySize > 2 * 1024 * 1024) fail()
  const members: Member[] = []
  let offset = directoryOffset
  let expanded = 0
  const equal = (left: Uint8Array, right: Uint8Array) =>
    left.length === right.length && left.every((byte, index) => byte === right[index])
  const names = new Set<string>()
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) fail()
    const flags = view.getUint16(offset + 8, true)
    const method = view.getUint16(offset + 10, true)
    const compressed = view.getUint32(offset + 20, true)
    const original = view.getUint32(offset + 24, true)
    const nameSize = view.getUint16(offset + 28, true)
    const extraSize = view.getUint16(offset + 30, true)
    const commentSize = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const next = offset + 46 + nameSize + extraSize + commentSize
    if (
      (flags & 1) !== 0 ||
      ![0, 8].includes(method) ||
      view.getUint16(offset + 34, true) !== 0 ||
      original === 0xffffffff ||
      compressed === 0xffffffff ||
      localOffset === 0xffffffff ||
      nameSize === 0 ||
      nameSize > 1024 ||
      next > end
    )
      fail()
    const name = bytes.subarray(offset + 46, offset + 46 + nameSize)
    const nameKey = String.fromCharCode(...name)
    if (names.has(nameKey)) fail()
    names.add(nameKey)
    expanded += original
    if (original > hostedZipInflatedLimit || expanded > hostedZipInflatedLimit) fail()
    if (
      localOffset + 30 > directoryOffset ||
      view.getUint32(localOffset, true) !== 0x04034b50 ||
      view.getUint16(localOffset + 6, true) !== flags ||
      view.getUint16(localOffset + 8, true) !== method
    )
      fail()
    const localNameSize = view.getUint16(localOffset + 26, true)
    const dataOffset = localOffset + 30 + localNameSize + view.getUint16(localOffset + 28, true)
    if (
      dataOffset + compressed > directoryOffset ||
      !equal(bytes.subarray(localOffset + 30, localOffset + 30 + localNameSize), name)
    )
      fail()
    if (
      (flags & 8) === 0 &&
      (view.getUint32(localOffset + 18, true) !== compressed ||
        view.getUint32(localOffset + 22, true) !== original)
    )
      fail()
    members.push({ compressed, expanded: original, method, flags, localOffset, name })
    offset = next
  }
  if (offset !== end) fail()
  // Small compressed pushes prevent a high-ratio member from allocating its
  // entire declared output before the ondata limit gets a chance to run.
  let actualTotal = 0
  let seen = 0
  let completed = 0
  let failure: unknown
  const ordered = members.slice().sort((a, b) => a.localOffset - b.localOffset)
  const unzip = new Unzip((file) => {
    const expected = ordered[seen++]
    if (
      !expected ||
      file.compression !== expected.method ||
      (file.size !== undefined && file.size !== expected.compressed)
    ) {
      failure = new HostedZipError()
      file.terminate()
      return
    }
    let actual = 0
    file.ondata = (error, chunk, final) => {
      if (failure) return
      if (error) {
        failure = error
        file.terminate()
        return
      }
      actual += chunk.byteLength
      actualTotal += chunk.byteLength
      if (
        actual > hostedZipInflatedLimit ||
        actualTotal > hostedZipInflatedLimit ||
        actual > expected.expanded
      ) {
        failure = new HostedZipError()
        file.terminate()
        return
      }
      if (final) {
        if (actual !== expected.expanded) failure = new HostedZipError()
        completed++
      }
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  try {
    for (let cursor = 0; cursor < bytes.length; cursor += 1024) {
      if (failure) fail()
      unzip.push(bytes.subarray(cursor, cursor + 1024), cursor + 1024 >= bytes.length)
    }
  } catch {
    fail()
  }
  if (failure || seen !== count || completed !== count || actualTotal !== expanded) fail()
}

export async function readHostedZip(object: {
  readonly size: number
  arrayBuffer(): Promise<ArrayBuffer>
}): Promise<Uint8Array> {
  if (object.size > 25 * 1024 * 1024) throw new HostedZipError()
  const bytes = new Uint8Array(await object.arrayBuffer())
  if (bytes.byteLength > 25 * 1024 * 1024) throw new HostedZipError()
  preflightHostedZip(bytes)
  return bytes
}

/** Spotify's prepared JSON avoids ZIP replay, but legacy local manifests may
 * still be too large to buffer safely in a hosted Worker. */
export async function readHostedImportManifest(object: {
  readonly size: number
  arrayBuffer(): Promise<ArrayBuffer>
}): Promise<Uint8Array> {
  if (object.size > hostedZipInflatedLimit) throw new HostedZipError()
  const bytes = new Uint8Array(await object.arrayBuffer())
  if (bytes.byteLength > hostedZipInflatedLimit) throw new HostedZipError()
  return bytes
}
