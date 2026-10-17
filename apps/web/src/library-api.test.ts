import { expect, it } from 'vitest'
import { checkLibraryCursorResponse, InvalidLibraryCursorError } from './library-api'

it('recognizes invalid/stale pagination without treating other failures as cursor errors', () => {
  for (const message of [
    'Videos pagination cursor is stale',
    'Invalid Article pagination cursor',
    'Invalid Movies pagination cursor',
  ]) {
    expect(() => checkLibraryCursorResponse(400, { error: { message } })).toThrow(
      InvalidLibraryCursorError,
    )
  }
  for (const body of [null, {}, { error: 'bad' }, { error: { message: 'Invalid filter' } }])
    expect(() => checkLibraryCursorResponse(400, body)).not.toThrow()
  expect(() =>
    checkLibraryCursorResponse(503, { error: { message: 'pagination cursor' } }),
  ).not.toThrow()
})
