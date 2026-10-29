#!/usr/bin/env python3
"""Explicit operator reconciliation of reviewed, provably orphaned legacy runs.

Planning is read-only. Apply requires the protected plan's SHA-256 and changes
only terminal status/diagnostics for its exact run IDs, never source evidence,
cursors, admission accounting, credentials, or provider state.
"""
import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sys

from release import API, ROOT, fetch

COLUMNS = ('id', 'connection_id', 'kind', 'status', 'started_at', 'finished_at',
           'raw_object_count', 'source_record_count', 'normalized_record_count',
           'failed_record_count', 'error_code', 'error_message')
ERROR_CODE = 'source_run_interrupted'
ERROR_MESSAGE = 'Operator reconciliation: no active or resumable execution remains; closure time is when this was observed.'
MAX_RUNS = 5
MIN_AGE = timedelta(minutes=20)
MAX_PLAN_AGE = timedelta(hours=1)


class ReconciliationError(RuntimeError):
    pass


def timestamp(value):
    return value.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def parse_timestamp(value):
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            raise ValueError()
        return parsed.astimezone(timezone.utc)
    except (ValueError, TypeError, AttributeError):
        raise ReconciliationError('Invalid reconciliation timestamp') from None


def digest(value):
    return hashlib.sha256(value).hexdigest()


def protected_path(path, existing=False):
    path = Path(path).absolute()
    root = (ROOT / '.private').resolve()
    if root not in path.parents or path != path.resolve():
        raise ReconciliationError('Receipt must remain under ignored .private without links')
    if root.exists() and not root.is_dir():
        raise ReconciliationError('Ignored receipt root is not a directory')
    current = root
    for part in path.relative_to(root).parts[:-1]:
        current = current / part
        if current.exists() and (current.is_symlink() or not current.is_dir()):
            raise ReconciliationError('Receipt directories must not contain links')
    # Existing repository ancestors can be ordinary directories; the dedicated
    # receipt folder and every receipt themselves must be private.
    if path.parent.exists() and path.parent.stat().st_mode & 0o077:
        raise ReconciliationError('Receipt directory must be protected')
    if path.exists() and (path.is_symlink() or not path.is_file() or path.stat().st_mode & 0o077):
        raise ReconciliationError('Receipt must be a protected regular file')
    if existing and not path.is_file():
        raise ReconciliationError('Reviewed receipt is missing')
    return path


def save_receipt(path, value):
    path = protected_path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    payload = (json.dumps(value, sort_keys=True, indent=2) + '\n').encode()
    with open(path, 'xb', opener=lambda name, flags: os.open(name, flags, 0o600)) as stream:
        stream.write(payload)
        stream.flush()
        os.fsync(stream.fileno())
    return digest(payload)


def load_receipt(path):
    path = protected_path(path, existing=True)
    if path.stat().st_size > 128 * 1024:
        raise ReconciliationError('Receipt exceeds the bounded review size')
    return json.loads(path.read_bytes())


class Remote:
    def __init__(self, account, database, token_file):
        if not re.fullmatch('[a-f0-9]{32}', account) or not re.fullmatch('[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}', database):
            raise ReconciliationError('Invalid production target')
        token_file = Path(token_file).absolute()
        if (token_file != token_file.resolve() or not token_file.is_file()
                or token_file.is_symlink() or token_file.stat().st_mode & 0o077):
            raise ReconciliationError('Token must be a protected regular file without links')
        token = token_file.read_text().strip()
        if not token or any(c.isspace() for c in token):
            raise ReconciliationError('Token file is empty or malformed')
        self.target = {'account': account, 'database': database}
        self.token = token

    def query(self, sql, params, mutation=False):
        status, body = fetch(API + '/accounts/' + self.target['account'] + '/d1/database/' + self.target['database'] + '/query',
            {'Authorization': 'Bearer ' + self.token, 'Content-Type': 'application/json'},
            json.dumps({'sql': sql, 'params': params}).encode())
        if status != 200:
            raise ReconciliationError('Cloudflare reconciliation request failed (HTTP ' + str(status) + ')')
        value = json.loads(body)
        results = value.get('result', [])
        if (value.get('success') is not True or len(results) != 1
                or results[0].get('success') is not True or not isinstance(results[0].get('results'), list)):
            raise ReconciliationError('Cloudflare reconciliation response was unsuccessful')
        if not mutation and results[0].get('meta', {}).get('rows_written') != 0:
            raise ReconciliationError('A reconciliation read unexpectedly reported writes')
        return results[0]['results']


def run_ids(values):
    if (not isinstance(values, list) or not 1 <= len(values) <= MAX_RUNS
            or any(not isinstance(value, str) or not re.fullmatch('[A-Za-z0-9:_-]{1,128}', value) for value in values)
            or len(set(values)) != len(values)):
        raise ReconciliationError('Review between one and five distinct exact run IDs')
    return values


def guards():
    # All role/ownership exclusions are conservative. In particular, an old
    # Hardcover snapshot can legitimately keep its original started_at.
    return '''r.status='running' AND r.finished_at IS NULL
      AND r.kind IN ('backfill','reconcile') AND c.source IN ('hardcover','spotify')
      AND julianday(r.started_at)<=julianday(?)
      AND NOT EXISTS(SELECT 1 FROM source_sync_lease WHERE expires_at>?)
      AND NOT EXISTS(SELECT 1 FROM hardcover_sync_progress WHERE sync_run_id=r.id)
      AND NOT EXISTS(SELECT 1 FROM source_sync_admission WHERE snapshot_run_id=r.id)
      AND NOT EXISTS(SELECT 1 FROM spotify_catalog_backfill_jobs WHERE sync_run_id=r.id)
      AND NOT EXISTS(SELECT 1 FROM sync_cursors WHERE sync_run_id=r.id)'''


def inspect(remote, ids, cutoff, now):
    fields = ','.join('r.' + name for name in COLUMNS)
    return remote.query('SELECT ' + fields + ',c.source,CASE WHEN ' + guards() + ''' THEN 1 ELSE 0 END eligible
      FROM sync_runs r JOIN connections c ON c.id=r.connection_id
      WHERE r.id IN (''' + ','.join('?' for _ in ids) + ') ORDER BY r.id',
      [cutoff, int(now.timestamp() * 1000), *ids])


def create_plan(remote, ids, path, now=None):
    now = now or datetime.now(timezone.utc)
    path = protected_path(path)
    if path.exists():
        raise ReconciliationError('Keep the existing plan receipt; choose a new filename')
    ids = sorted(run_ids(ids))
    cutoff = timestamp(now - MIN_AGE)
    rows = inspect(remote, ids, cutoff, now)
    if [row.get('id') for row in rows] != ids or any(row.get('eligible') != 1 for row in rows):
        raise ReconciliationError('Every reviewed ID must be a provably orphaned source run')
    plan = {'version': 1, 'target': remote.target, 'createdAt': timestamp(now),
            'cutoffAt': cutoff, 'rows': rows}
    return {'reviewedRuns': len(rows), 'planSha256': save_receipt(path, plan)}


def row_snapshot(row):
    return {key: row[key] for key in (*COLUMNS, 'source')}


def apply_plan(remote, path, reviewed_sha256, now=None):
    now = now or datetime.now(timezone.utc)
    path = protected_path(path, existing=True)
    plan = load_receipt(path)
    if not re.fullmatch('[a-f0-9]{64}', reviewed_sha256) or digest(path.read_bytes()) != reviewed_sha256:
        raise ReconciliationError('Reviewed plan fingerprint changed')
    if plan.get('version') != 1 or plan.get('target') != remote.target:
        raise ReconciliationError('Reviewed plan target differs')
    rows = plan.get('rows', [])
    ids = run_ids([row['id'] for row in rows])
    created = parse_timestamp(plan['createdAt'])
    cutoff = parse_timestamp(plan['cutoffAt'])
    if cutoff != created - MIN_AGE:
        raise ReconciliationError('Reviewed plan cutoff differs from the bounded execution window')
    attempt_path = path.with_suffix('.attempt.json')
    completed_path = path.with_suffix('.completed.json')
    current = inspect(remote, ids, plan['cutoffAt'], now)
    if attempt_path.exists():
        attempt = load_receipt(attempt_path)
        if attempt.get('planSha256') != reviewed_sha256 or attempt.get('target') != remote.target:
            raise ReconciliationError('Existing attempt belongs to another reviewed plan')
        expected = [dict(row_snapshot(row), status='failed', finished_at=attempt['observedAt'],
                         error_code=ERROR_CODE, error_message=ERROR_MESSAGE) for row in rows]
        if [row_snapshot(row) for row in current] != expected:
            raise ReconciliationError('Previous attempt is uncertain or state changed; inspect it before making a fresh plan')
        if not completed_path.exists():
            save_receipt(completed_path, dict(attempt, reconciledRuns=len(ids)))
        return {'reconciledRuns': 0, 'alreadyReconciled': len(ids)}
    if now < created or now - created > MAX_PLAN_AGE:
        raise ReconciliationError('Reviewed plan is stale or from the future')
    if ([row_snapshot(row) for row in current] != [row_snapshot(row) for row in rows]
            or any(row.get('eligible') != 1 for row in current)):
        raise ReconciliationError('Reviewed run fingerprint or recovery guard changed')
    # Persist the intended closure before issuing the single remote mutation.
    # A transport failure is never blindly retried: readback can establish that
    # this exact attempt committed, otherwise an operator must review a new plan.
    observed = timestamp(now)
    attempt = {'version': 1, 'planSha256': reviewed_sha256, 'target': remote.target,
               'observedAt': observed, 'runIds': ids}
    save_receipt(attempt_path, attempt)
    matches, parameters = [], []
    for row in rows:
        matches.append('(' + ' AND '.join('r.' + name + ' IS ?' for name in COLUMNS) + ' AND c.source IS ?)')
        parameters.extend(row[name] for name in COLUMNS)
        parameters.append(row['source'])
    # MATERIALIZED freezes the reviewed candidate set before any row changes.
    # Count equality makes a raced guard/fingerprint failure close zero rows.
    sql = '''WITH eligible AS MATERIALIZED (
      SELECT r.id FROM sync_runs r JOIN connections c ON c.id=r.connection_id
      WHERE (''' + ' OR '.join(matches) + ') AND ' + guards() + ''')
      UPDATE sync_runs SET status='failed',finished_at=?,error_code=?,error_message=?
      WHERE id IN (SELECT id FROM eligible) AND (SELECT COUNT(*) FROM eligible)=?
      RETURNING id'''
    parameters.extend([plan['cutoffAt'], int(now.timestamp() * 1000), observed,
                       ERROR_CODE, ERROR_MESSAGE, len(ids)])
    changed = remote.query(sql, parameters, mutation=True)
    if sorted(row.get('id') for row in changed) != sorted(ids):
        raise ReconciliationError('Atomic recovery guard changed; no automatic retry was performed')
    after = inspect(remote, ids, plan['cutoffAt'], now)
    expected = [dict(row_snapshot(row), status='failed', finished_at=observed,
                     error_code=ERROR_CODE, error_message=ERROR_MESSAGE) for row in rows]
    if [row_snapshot(row) for row in after] != expected:
        raise ReconciliationError('Reconciliation readback differs; retain the attempt receipt')
    save_receipt(completed_path, dict(attempt, reconciledRuns=len(ids)))
    return {'reconciledRuns': len(ids), 'alreadyReconciled': 0}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['plan', 'apply'])
    parser.add_argument('--account', required=True)
    parser.add_argument('--database', required=True)
    parser.add_argument('--token-file', type=Path, required=True)
    parser.add_argument('--receipt', type=Path, required=True)
    parser.add_argument('--run-id', action='append')
    parser.add_argument('--reviewed-sha256')
    args = parser.parse_args()
    try:
        remote = Remote(args.account, args.database, args.token_file)
        if args.operation == 'plan':
            if args.reviewed_sha256:
                raise ReconciliationError('Plan does not accept apply approval')
            report = create_plan(remote, args.run_id, args.receipt)
        else:
            if args.run_id or not args.reviewed_sha256:
                raise ReconciliationError('Apply requires only the existing receipt and its reviewed SHA-256')
            report = apply_plan(remote, args.receipt, args.reviewed_sha256)
        print(json.dumps(report))
        return 0
    except Exception as error:
        # Native SQL/errors can contain account data. Only our fixed diagnostics
        # are public; protected local receipts retain reviewed run identities.
        message = str(error) if isinstance(error, ReconciliationError) else type(error).__name__
        print('Source-run reconciliation stopped: ' + message, file=sys.stderr)
        return 1


if __name__ == '__main__':
    os.umask(0o077)
    sys.exit(main())
