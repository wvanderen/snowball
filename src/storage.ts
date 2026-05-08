import {
  type ActiveSession,
  type AppState,
  type Connection,
  type GameState,
  type Glyph,
  type Ritual,
  type Session,
  type Sphere,
  centerSphereId,
} from "./domain.ts";

export type BackupFile = {
  app: "snowball";
  exportedAt: string;
  state: AppState;
};

const legacyStorageKey = "snowball:v0:state";
const dbName = "snowball";
const dbVersion = 3;
const supportedStateVersion = 1;

const stores = {
  metadata: "metadata",
  spheres: "spheres",
  rituals: "rituals",
  sessions: "sessions",
  connections: "connections",
  glyphs: "glyphs",
} as const;

const metadataKeys = {
  version: "version",
  game: "game",
  activeSession: "activeSession",
} as const;

const legacyBlobStoreName = "state";
const legacyBlobKey = "current";

type MetadataRecord =
  | { key: typeof metadataKeys.version; value: number }
  | { key: typeof metadataKeys.game; value: GameState }
  | { key: typeof metadataKeys.activeSession; value: ActiveSession | null };

type LegacyPersistedStateRecord = {
  key: typeof legacyBlobKey;
  state: AppState;
  savedAt: string;
};

const nowIso = () => new Date().toISOString();

export const createId = (prefix: string) => {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}_${random}`;
};

export const localDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const createInitialState = (): AppState => {
  const now = nowIso();

  return {
    version: 1,
    spheres: [
      {
        id: centerSphereId,
        kind: "center",
        name: "Center",
        color: "#a78bfa",
        dailyTargetMinutes: 0,
        activeRitualId: null,
        ritualIds: [],
        glyphSlotCount: 0,
        equippedGlyphIds: [],
        level: 1,
        momentum: 50,
        currentStreak: 0,
        bestStreak: 0,
        totalSeconds: 0,
        todaySeconds: 0,
        dailyProgressDate: localDateKey(),
        milestoneCompletedDate: null,
        passiveEnergyRate: 0,
        activeEnergyMultiplier: 1,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    rituals: [],
    sessions: [],
    connections: [],
    glyphs: createStarterGlyphs(now),
    game: {
      energy: 0,
      lifetimeEnergy: 0,
      experience: 0,
      lifetimeExperience: 0,
      lastPassiveTickAt: now,
    },
    activeSession: null,
  };
};

const createStarterGlyphs = (now: string): Glyph[] => [
  {
    id: "glyph_streak",
    name: "Streak Lens",
    effect: "streak",
    description: "Active energy scales with this sphere's streak.",
    equippedSphereId: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "glyph_recent_consistency",
    name: "Consistency Prism",
    effect: "recent-consistency",
    description: "Milestone completion today improves passive production.",
    equippedSphereId: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "glyph_deep_work",
    name: "Deep Work Rune",
    effect: "deep-work",
    description: "Long sessions earn extra active energy.",
    equippedSphereId: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "glyph_recovery",
    name: "Recovery Knot",
    effect: "recovery",
    description: "Missed days decay momentum more gently.",
    equippedSphereId: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "glyph_persistence",
    name: "Persistence Mark",
    effect: "persistence",
    description: "Every logged session adds extra momentum.",
    equippedSphereId: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "glyph_resonance",
    name: "Resonance Sigil",
    effect: "resonance",
    description: "Outgoing routes carry a stronger active-session buff.",
    equippedSphereId: null,
    createdAt: now,
    updatedAt: now,
  },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const migrateState = (candidate: Record<string, unknown>): AppState => {
  if (candidate.version !== supportedStateVersion) {
    throw new Error("Backup version is not supported.");
  }

  if (
    !Array.isArray(candidate.spheres) ||
    !Array.isArray(candidate.rituals) ||
    !Array.isArray(candidate.sessions)
  ) {
    throw new Error("Backup is missing required local data arrays.");
  }
  if (!isRecord(candidate.game)) throw new Error("Backup is missing game data.");

  const restored = { ...createInitialState(), ...candidate } as AppState;
  restored.connections = Array.isArray(candidate.connections) ? restored.connections : [];
  restored.glyphs = Array.isArray(candidate.glyphs)
    ? restored.glyphs
    : createStarterGlyphs(nowIso());
  restored.activeSession = isRecord(candidate.activeSession) ? restored.activeSession : null;
  restored.spheres = restored.spheres.map((sphere) => ({
    ...sphere,
    glyphSlotCount: sphere.glyphSlotCount ?? (sphere.kind === "domain" ? 1 : 0),
    equippedGlyphIds: sphere.equippedGlyphIds ?? [],
    archivedAt: sphere.archivedAt ?? null,
  }));
  restored.rituals = restored.rituals.map((ritual) => ({
    ...ritual,
    archivedAt: ritual.archivedAt ?? null,
  }));
  return restored;
};

export const parseBackupState = (raw: string): AppState => {
  const parsed = JSON.parse(raw) as unknown;
  const candidate = isRecord(parsed) && parsed.app === "snowball" ? parsed.state : parsed;
  if (!isRecord(candidate)) throw new Error("Backup does not contain Snowball state.");
  return migrateState(candidate);
};

export const createBackupJson = (state: AppState) =>
  JSON.stringify(
    {
      app: "snowball",
      exportedAt: nowIso(),
      state,
    } satisfies BackupFile,
    null,
    2,
  );

const ensureEntityStore = (database: IDBDatabase, storeName: string) => {
  if (!database.objectStoreNames.contains(storeName))
    database.createObjectStore(storeName, { keyPath: "id" });
};

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(stores.metadata)) {
        database.createObjectStore(stores.metadata, { keyPath: "key" });
      }
      ensureEntityStore(database, stores.spheres);
      ensureEntityStore(database, stores.rituals);
      ensureEntityStore(database, stores.sessions);
      ensureEntityStore(database, stores.connections);
      ensureEntityStore(database, stores.glyphs);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const getAll = <T>(database: IDBDatabase, storeName: string) =>
  new Promise<T[]>((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });

const readMetadataValue = <T>(database: IDBDatabase, key: string) =>
  new Promise<T | null>((resolve, reject) => {
    const request = database
      .transaction(stores.metadata, "readonly")
      .objectStore(stores.metadata)
      .get(key);
    request.onsuccess = () => resolve((request.result as { value: T } | undefined)?.value ?? null);
    request.onerror = () => reject(request.error);
  });

const writeEntityState = (database: IDBDatabase, state: AppState) =>
  new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(Object.values(stores), "readwrite");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);

    const metadata = transaction.objectStore(stores.metadata);
    const spheres = transaction.objectStore(stores.spheres);
    const rituals = transaction.objectStore(stores.rituals);
    const sessions = transaction.objectStore(stores.sessions);
    const connections = transaction.objectStore(stores.connections);
    const glyphs = transaction.objectStore(stores.glyphs);
    const storesToClear = [metadata, spheres, rituals, sessions, connections, glyphs];
    let clearedCount = 0;

    const writeRecords = () => {
      metadata.put({ key: metadataKeys.version, value: state.version } satisfies MetadataRecord);
      metadata.put({ key: metadataKeys.game, value: state.game } satisfies MetadataRecord);
      metadata.put({
        key: metadataKeys.activeSession,
        value: state.activeSession,
      } satisfies MetadataRecord);
      state.spheres.forEach((sphere) => spheres.put(sphere));
      state.rituals.forEach((ritual) => rituals.put(ritual));
      state.sessions.forEach((session) => sessions.put(session));
      state.connections.forEach((connection) => connections.put(connection));
      state.glyphs.forEach((glyph) => glyphs.put(glyph));
    };

    storesToClear.forEach((store) => {
      const request = store.clear();
      request.onsuccess = () => {
        clearedCount += 1;
        if (clearedCount === storesToClear.length) writeRecords();
      };
      request.onerror = () => reject(request.error);
    });
  });

const readEntityState = async (database: IDBDatabase): Promise<AppState | null> => {
  const version = await readMetadataValue<number>(database, metadataKeys.version);
  if (version === null) return null;

  return migrateState({
    version,
    spheres: await getAll<Sphere>(database, stores.spheres),
    rituals: await getAll<Ritual>(database, stores.rituals),
    sessions: await getAll<Session>(database, stores.sessions),
    connections: await getAll<Connection>(database, stores.connections),
    glyphs: await getAll<Glyph>(database, stores.glyphs),
    game: await readMetadataValue<GameState>(database, metadataKeys.game),
    activeSession: await readMetadataValue<ActiveSession | null>(
      database,
      metadataKeys.activeSession,
    ),
  });
};

const readLegacyIndexedDbBlob = (database: IDBDatabase) =>
  new Promise<AppState | null>((resolve, reject) => {
    if (!database.objectStoreNames.contains(legacyBlobStoreName)) {
      resolve(null);
      return;
    }

    const request = database
      .transaction(legacyBlobStoreName, "readonly")
      .objectStore(legacyBlobStoreName)
      .get(legacyBlobKey);
    request.onsuccess = () => {
      const record = request.result as LegacyPersistedStateRecord | undefined;
      resolve(record ? migrateState(record.state as unknown as Record<string, unknown>) : null);
    };
    request.onerror = () => reject(request.error);
  });

const migrateLegacyLocalStorage = async (database: IDBDatabase) => {
  const raw = localStorage.getItem(legacyStorageKey);
  if (!raw) return null;

  try {
    const migrated = parseBackupState(raw);
    await writeEntityState(database, migrated);
    localStorage.removeItem(legacyStorageKey);
    return migrated;
  } catch {
    return null;
  }
};

const migrateLegacyIndexedDb = async (database: IDBDatabase) => {
  const migrated = await readLegacyIndexedDbBlob(database);
  if (!migrated) return null;
  await writeEntityState(database, migrated);
  return migrated;
};

export const loadState = async (): Promise<AppState> => {
  try {
    const database = await openDatabase();
    const stored = await readEntityState(database);
    return (
      stored ??
      (await migrateLegacyIndexedDb(database)) ??
      (await migrateLegacyLocalStorage(database)) ??
      createInitialState()
    );
  } catch {
    return createInitialState();
  }
};

export const saveState = async (state: AppState) => {
  const database = await openDatabase();
  await writeEntityState(database, state);
};

export const resetState = async () => {
  const database = await openDatabase();
  await writeEntityState(database, createInitialState());
  localStorage.removeItem(legacyStorageKey);
};
