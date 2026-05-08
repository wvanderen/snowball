# Sync operation queue and conflict strategy

Snowball is still local-first. This design adds a pending operation queue abstraction so future cloud sync can replay local mutations without changing game logic now.

## Pending operation queue

`src/sync.ts` defines `SyncQueue` and `SyncOperation`:

- each local mutation can enqueue a `put` or `delete` for an entity (`sphere`, `ritual`, `session`, `connection`, `glyph`, or `game`);
- operations start as `pending`, can become `in_flight`, then `acked` or `failed`;
- failed operations keep `attempts` and `lastError` and can be retried;
- acked operations can be pruned after the server confirms durable receipt.

The queue is intentionally transport-agnostic. A later cloud client can persist the queue in IndexedDB and send `pendingSyncOperations(queue)` in creation order.

## Conflict rules

The conflict matrix is exported as `syncConflictRules` for implementation and UI references.

| Entity        | Strategy            | Rule                                                                                                                                                          |
| ------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session       | Append-only         | Completed sessions are immutable history. Merge by id, append unknown remote sessions, ignore duplicate ids, and never delete history from remote tombstones. |
| Sphere        | Last write wins     | Editable fields, archive state, level, momentum, streaks, and totals use `updatedAt`; newest record wins.                                                     |
| Ritual        | Last write wins     | Name, target, favorite, and archive fields use `updatedAt`; newest record wins.                                                                               |
| Connection    | Last write wins     | Route endpoints and active flag use `updatedAt`; newest record wins.                                                                                          |
| Glyph         | Last write wins     | Equipment uses `updatedAt`; a later repair pass should resolve impossible duplicate equipment.                                                                |
| Game counters | Manual/future delta | Energy and experience are derived counters; future sync should use server-applied operation deltas or reconciliation instead of blind replacement.            |

## Append-only session handling

Sessions are the audit log for progress. `mergeAppendOnlySessions(local, remote)` returns local and remote sessions de-duplicated by id and sorted newest first. A completed session should not be edited after creation; corrections should be represented by a future explicit adjustment operation rather than mutating or deleting the original session.

## Sphere and ritual last-write-wins

Sphere and ritual records already carry `updatedAt`, making them suitable for simple last-write-wins merging. `mergeRemoteStateForSync(local, remote)` applies this rule to spheres and rituals while preserving append-only sessions. Equal timestamps currently prefer the later merge input, so server ordering should be stable when it calls the helper.
