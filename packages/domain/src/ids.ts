declare const idBrand: unique symbol

type Id<Name extends string> = string & { readonly [idBrand]: Name }

export type ArchiveEntryEvidenceId = Id<'ArchiveEntryEvidenceId'>
export type ArchiveEntryId = Id<'ArchiveEntryId'>
export type ConnectionId = Id<'ConnectionId'>
export type ExternalIdentityId = Id<'ExternalIdentityId'>
export type MediaItemId = Id<'MediaItemId'>
export type RawObjectId = Id<'RawObjectId'>
export type SourceRecordId = Id<'SourceRecordId'>
export type SyncCursorId = Id<'SyncCursorId'>
export type SyncRunId = Id<'SyncRunId'>

function toId<Name extends string>(value: string, name: Name): Id<Name> {
  if (value.trim().length === 0) {
    throw new TypeError(`${name} cannot be empty`)
  }

  return value as Id<Name>
}

export const archiveEntryEvidenceId = (value: string): ArchiveEntryEvidenceId =>
  toId(value, 'ArchiveEntryEvidenceId')
export const archiveEntryId = (value: string): ArchiveEntryId => toId(value, 'ArchiveEntryId')
export const connectionId = (value: string): ConnectionId => toId(value, 'ConnectionId')
export const externalIdentityId = (value: string): ExternalIdentityId =>
  toId(value, 'ExternalIdentityId')
export const mediaItemId = (value: string): MediaItemId => toId(value, 'MediaItemId')
export const rawObjectId = (value: string): RawObjectId => toId(value, 'RawObjectId')
export const sourceRecordId = (value: string): SourceRecordId => toId(value, 'SourceRecordId')
export const syncCursorId = (value: string): SyncCursorId => toId(value, 'SyncCursorId')
export const syncRunId = (value: string): SyncRunId => toId(value, 'SyncRunId')
