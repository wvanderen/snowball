import type { AppState, Connection, Glyph, Ritual, Session, Sphere } from "./domain.ts";

export type SyncEntity = "sphere" | "ritual" | "session" | "connection" | "glyph" | "game";

export type SyncOperationKind = "put" | "delete";

export type SyncOperationStatus = "pending" | "in_flight" | "acked" | "failed";

export type SyncOperation = {
  id: string;
  entity: SyncEntity;
  entityId: string;
  kind: SyncOperationKind;
  payload: unknown;
  baseUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  status: SyncOperationStatus;
  attempts: number;
  lastError: string | null;
};

export type SyncQueue = {
  operations: SyncOperation[];
};

export type ConflictResolution = "append" | "last-write-wins" | "ignore-duplicate" | "manual";

export type ConflictRule = {
  entity: SyncEntity;
  strategy: ConflictResolution;
  notes: string;
};

export const syncConflictRules: ConflictRule[] = [
  {
    entity: "session",
    strategy: "append",
    notes:
      "Sessions are immutable after completion and merge by id. Unknown remote sessions are appended; duplicate ids are ignored. No remote delete should remove session history.",
  },
  {
    entity: "sphere",
    strategy: "last-write-wins",
    notes:
      "Editable sphere fields, archive state, levels, momentum, streak and totals use updatedAt as the tie-breaker. Newer updatedAt replaces older data.",
  },
  {
    entity: "ritual",
    strategy: "last-write-wins",
    notes:
      "Ritual name, target, favorite and archive changes use updatedAt as the tie-breaker. The winning ritual drives active ritual repair on its sphere.",
  },
  {
    entity: "connection",
    strategy: "last-write-wins",
    notes: "Route endpoints and active state use updatedAt as the tie-breaker.",
  },
  {
    entity: "glyph",
    strategy: "last-write-wins",
    notes:
      "Glyph equipment uses updatedAt as the tie-breaker; clients must repair impossible duplicate equipment after merge.",
  },
  {
    entity: "game",
    strategy: "manual",
    notes:
      "Energy and experience are derived counters today. Future cloud sync should prefer server-applied operation deltas or a reconciliation pass, not blind replacement.",
  },
];

export const createSyncQueue = (): SyncQueue => ({ operations: [] });

export const enqueueSyncOperation = (
  queue: SyncQueue,
  operation: Omit<SyncOperation, "status" | "attempts" | "lastError">,
) => {
  const next: SyncOperation = {
    ...operation,
    status: "pending",
    attempts: 0,
    lastError: null,
  };
  queue.operations.push(next);
  return next;
};

export const pendingSyncOperations = (queue: SyncQueue) =>
  queue.operations.filter((operation) => operation.status === "pending");

export const markSyncOperationInFlight = (queue: SyncQueue, operationId: string, now: string) =>
  updateOperation(queue, operationId, { status: "in_flight", updatedAt: now });

export const markSyncOperationAcked = (queue: SyncQueue, operationId: string, now: string) =>
  updateOperation(queue, operationId, { status: "acked", updatedAt: now, lastError: null });

export const markSyncOperationFailed = (
  queue: SyncQueue,
  operationId: string,
  error: string,
  now: string,
) => {
  const operation = queue.operations.find((item) => item.id === operationId);
  if (!operation) return null;
  operation.status = "failed";
  operation.attempts += 1;
  operation.lastError = error;
  operation.updatedAt = now;
  return operation;
};

export const retryFailedSyncOperations = (queue: SyncQueue, now: string) => {
  queue.operations.forEach((operation) => {
    if (operation.status === "failed") {
      operation.status = "pending";
      operation.updatedAt = now;
    }
  });
};

export const pruneAckedSyncOperations = (queue: SyncQueue) => {
  queue.operations = queue.operations.filter((operation) => operation.status !== "acked");
};

export const mergeAppendOnlySessions = (local: Session[], remote: Session[]) => {
  const seen = new Set<string>();
  return [...local, ...remote]
    .filter((session) => {
      if (seen.has(session.id)) return false;
      seen.add(session.id);
      return true;
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
};

export const lastWriteWins = <T extends { id: string; updatedAt: string }>(
  local: T[],
  remote: T[],
) => {
  const merged = new Map<string, T>();
  [...local, ...remote].forEach((item) => {
    const existing = merged.get(item.id);
    if (!existing || item.updatedAt >= existing.updatedAt) merged.set(item.id, item);
  });
  return [...merged.values()];
};

export const mergeRemoteStateForSync = (local: AppState, remote: AppState): AppState => ({
  ...local,
  version: Math.max(local.version, remote.version),
  spheres: lastWriteWins<Sphere>(local.spheres, remote.spheres),
  rituals: lastWriteWins<Ritual>(local.rituals, remote.rituals),
  sessions: mergeAppendOnlySessions(local.sessions, remote.sessions),
  connections: lastWriteWins<Connection>(local.connections, remote.connections),
  glyphs: lastWriteWins<Glyph>(local.glyphs, remote.glyphs),
});

const updateOperation = (queue: SyncQueue, operationId: string, patch: Partial<SyncOperation>) => {
  const operation = queue.operations.find((item) => item.id === operationId);
  if (!operation) return null;
  Object.assign(operation, patch);
  return operation;
};
