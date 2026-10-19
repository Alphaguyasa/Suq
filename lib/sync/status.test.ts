import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import type { OutboxEntry } from '@/lib/db';
import { freshDatabase } from '@/lib/db/test-helpers';
import { MAX_ATTEMPTS, deriveState, worstAttempts } from './status';

beforeEach(async () => {
  await freshDatabase();
});

function queued(rowId: string, attempts: number): Omit<OutboxEntry, 'id'> {
  return {
    table: 'sales',
    op: 'upsert',
    row_id: rowId,
    payload: { id: rowId },
    created_at: '2026-10-19T08:00:00.000Z',
    attempts,
    last_error: attempts > 0 ? 'Failed to fetch' : null,
    last_tried_at: attempts > 0 ? '2026-10-19T08:00:05.000Z' : null,
  };
}

describe('worstAttempts', () => {
  it('is 0 for an empty outbox', async () => {
    expect(await worstAttempts()).toBe(0);
  });

  it('finds the highest attempt count wherever it sits in the queue', async () => {
    await db.outbox.bulkAdd([queued('a', 0), queued('b', MAX_ATTEMPTS), queued('c', 1)]);
    expect(await worstAttempts()).toBe(MAX_ATTEMPTS);

    await db.outbox.where('row_id').equals('b').delete();
    expect(await worstAttempts()).toBe(1);
  });

  it('turns the pill blocked from a large queue with one failing row', async () => {
    // The cold-start case: hundreds of rows waiting, one stuck at the back.
    await db.outbox.bulkAdd(Array.from({ length: 300 }, (_, i) => queued(`r${i}`, 0)));
    await db.outbox.add(queued('stuck', MAX_ATTEMPTS + 2));

    const maxAttempts = await worstAttempts();
    expect(maxAttempts).toBe(MAX_ATTEMPTS + 2);
    expect(
      deriveState({ online: true, authed: true, syncing: false, pending: 301, maxAttempts }),
    ).toBe('blocked');
  });
});
