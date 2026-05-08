import { describe, expect, it } from "vitest";

import type { Session } from "./domain.ts";
import {
  createSyncQueue,
  enqueueSyncOperation,
  lastWriteWins,
  markSyncOperationAcked,
  markSyncOperationFailed,
  mergeAppendOnlySessions,
  pendingSyncOperations,
  retryFailedSyncOperations,
  syncConflictRules,
} from "./sync.ts";

const session = (id: string, startedAt: string): Session => ({
  id,
  sphereId: "sphere_1",
  ritualId: "ritual_1",
  startedAt,
  endedAt: startedAt,
  durationSeconds: 60,
  completedMilestoneAfterSession: false,
  createdAt: startedAt,
  updatedAt: startedAt,
});

describe("sync queue", () => {
  it("tracks pending, failure, retry, and ack lifecycle", () => {
    const queue = createSyncQueue();

    const operation = enqueueSyncOperation(queue, {
      id: "op_1",
      entity: "sphere",
      entityId: "sphere_1",
      kind: "put",
      payload: { name: "Study" },
      baseUpdatedAt: null,
      createdAt: "2026-05-08T10:00:00.000Z",
      updatedAt: "2026-05-08T10:00:00.000Z",
    });

    expect(pendingSyncOperations(queue)).toEqual([operation]);
    markSyncOperationFailed(queue, operation.id, "offline", "2026-05-08T10:01:00.000Z");
    expect(queue.operations[0]).toMatchObject({
      status: "failed",
      attempts: 1,
      lastError: "offline",
    });

    retryFailedSyncOperations(queue, "2026-05-08T10:02:00.000Z");
    expect(pendingSyncOperations(queue)).toHaveLength(1);

    markSyncOperationAcked(queue, operation.id, "2026-05-08T10:03:00.000Z");
    expect(pendingSyncOperations(queue)).toHaveLength(0);
  });
});

describe("sync conflict helpers", () => {
  it("documents session append-only and sphere/ritual last-write-wins rules", () => {
    expect(syncConflictRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entity: "session", strategy: "append" }),
        expect.objectContaining({ entity: "sphere", strategy: "last-write-wins" }),
        expect.objectContaining({ entity: "ritual", strategy: "last-write-wins" }),
      ]),
    );
  });

  it("merges sessions append-only by id newest first", () => {
    const merged = mergeAppendOnlySessions(
      [session("local", "2026-05-08T10:00:00.000Z"), session("same", "2026-05-08T09:00:00.000Z")],
      [session("remote", "2026-05-08T11:00:00.000Z"), session("same", "2026-05-08T12:00:00.000Z")],
    );

    expect(merged.map((item) => item.id)).toEqual(["remote", "local", "same"]);
  });

  it("uses updatedAt for last-write-wins entity merges", () => {
    const merged = lastWriteWins(
      [{ id: "sphere_1", name: "Old", updatedAt: "2026-05-08T10:00:00.000Z" }],
      [{ id: "sphere_1", name: "New", updatedAt: "2026-05-08T11:00:00.000Z" }],
    );

    expect(merged).toEqual([
      { id: "sphere_1", name: "New", updatedAt: "2026-05-08T11:00:00.000Z" },
    ]);
  });
});
