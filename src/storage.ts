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
const migratedXpThresholds = [0, 15, 45, 100, 180, 300, 475, 725, 1050, 1500] as const;
const levelForMigratedXp = (xp: number) =>
  migratedXpThresholds.reduce(
    (level, threshold, index) => (xp >= threshold ? index + 1 : level),
    1,
  );

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
  const centerRituals = createCenterRecoveryRituals(now);

  return {
    version: 1,
    spheres: [
      {
        id: centerSphereId,
        kind: "center",
        name: "Center",
        color: "#a78bfa",
        dailyTargetMinutes: 0,
        activeRitualId: centerRituals[0]?.id ?? null,
        ritualIds: centerRituals.map((ritual) => ritual.id),
        glyphSlotCount: 0,
        equippedGlyphIds: [],
        glyphSlots: [],
        level: 1,
        xp: 0,
        spherePointsEarned: 0,
        spherePointsSpent: 0,
        availablePoints: 0,
        spentPoints: 0,
        pathAllocations: [],
        upgradePurchases: [],
        charge: 0,
        firstRespecUsed: false,
        lastSessionAt: null,
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
    rituals: centerRituals,
    sessions: [],
    connections: [],
    glyphs: createStarterGlyphs(now),
    game: {
      energy: 0,
      lifetimeEnergy: 0,
      experience: 0,
      lifetimeExperience: 0,
      corePowerLevel: 1,
      coreUpgrades: [],
      glyphForgeCount: 0,
      lastPassiveTickAt: now,
    },
    activeSession: null,
  };
};

const createCenterRecoveryRituals = (now: string): Ritual[] => [
  {
    id: "ritual_center_breathe",
    sphereId: centerSphereId,
    name: "Breathe",
    targetMinutes: 3,
    isFavorite: true,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "ritual_center_rest",
    sphereId: centerSphereId,
    name: "Rest",
    targetMinutes: null,
    isFavorite: true,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: "ritual_center_reset",
    sphereId: centerSphereId,
    name: "Reset",
    targetMinutes: 5,
    isFavorite: true,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  },
];

const createStarterGlyphs = (now: string): Glyph[] =>
  [
    ["glyph_streak", "Streak Lens", "streak", "Active energy scales with this sphere's streak."],
    [
      "glyph_recent_consistency",
      "Consistency Prism",
      "recent-consistency",
      "Milestone completion today improves passive production.",
    ],
    ["glyph_deep_work", "Deep Work Rune", "deep-work", "Long sessions earn extra active energy."],
    ["glyph_recovery", "Recovery Knot", "recovery", "Missed days decay momentum more gently."],
    [
      "glyph_persistence",
      "Persistence Mark",
      "persistence",
      "Every logged session adds extra momentum.",
    ],
    [
      "glyph_resonance",
      "Resonance Sigil",
      "resonance",
      "Outgoing routes carry a stronger active-session buff.",
    ],
    ["glyph_amplify", "Amplify", "amplify", "Sphere output +10%."],
    ["glyph_store", "Store", "store", "Store 5% of outgoing Energy as Charge."],
    ["glyph_release", "Release", "release", "Session end releases 25% of Charge."],
    ["glyph_bloom", "Bloom", "bloom", "Milestone Bloom +20%."],
    ["glyph_echo", "Echo", "echo", "Bloom Energy ripples into connected spheres."],
    ["glyph_kindle", "Kindle", "kindle", "First return after inactivity gives +8 Momentum."],
  ].map(([id, name, effect, description]) => ({
    id,
    definitionId: id,
    name,
    effect: effect as Glyph["effect"],
    description,
    rarity: "common",
    level: 1,
    equippedSphereId: null,
    createdAt: now,
    updatedAt: now,
  }));

const mergeStarterGlyphs = (glyphs: Glyph[], now: string) => {
  const existingIds = new Set(glyphs.map((glyph) => glyph.id));
  const missingStarters = createStarterGlyphs(now).filter((glyph) => !existingIds.has(glyph.id));
  return [...glyphs, ...missingStarters];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const defaultGlyphSlots = (sphere: Sphere, now: string) =>
  Array.from({ length: sphere.glyphSlotCount }, (_, index) => ({
    id: `${sphere.id}_glyph_slot_${index + 1}`,
    sphereId: sphere.id,
    index,
    unlocked: true,
    glyphId: sphere.equippedGlyphIds[index] ?? null,
    source: index === 0 ? "base" : "sphere-upgrade",
    createdAt: sphere.createdAt ?? now,
    updatedAt: sphere.updatedAt ?? now,
  })) satisfies Sphere["glyphSlots"];

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
  const now = nowIso();
  restored.game = {
    ...createInitialState().game,
    ...(isRecord(candidate.game) ? candidate.game : {}),
    corePowerLevel: Math.max(1, Number(restored.game.corePowerLevel ?? 1)),
    coreUpgrades: Array.isArray(restored.game.coreUpgrades) ? restored.game.coreUpgrades : [],
    glyphForgeCount: Math.max(0, Number(restored.game.glyphForgeCount ?? 0)),
  } as GameState;
  restored.connections = (Array.isArray(candidate.connections) ? restored.connections : []).map(
    (connection) => ({
      ...connection,
      active: connection.active ?? connection.enabled ?? true,
      enabled: connection.enabled ?? connection.active ?? true,
      allocationPercent: connection.allocationPercent ?? 100,
      level: connection.level ?? 1,
      throughputMultiplier: connection.throughputMultiplier ?? 1,
      routingLoss: connection.routingLoss ?? (connection.toSphereId === centerSphereId ? 0 : 0.05),
      mode: connection.mode ?? "manual",
    }),
  );
  restored.glyphs = mergeStarterGlyphs(
    Array.isArray(candidate.glyphs) ? restored.glyphs : [],
    now,
  ).map((glyph) => ({
    ...glyph,
    definitionId: glyph.definitionId ?? glyph.id,
    rarity: glyph.rarity ?? "common",
    level: glyph.level ?? 1,
  }));
  restored.activeSession = isRecord(candidate.activeSession) ? restored.activeSession : null;
  restored.spheres = restored.spheres.map((sphere) => {
    const legacySphere = sphere as Sphere & { lastSessionDate?: string | null };
    const xp = sphere.xp ?? Math.floor((sphere.totalSeconds ?? 0) / 60);
    const level = sphere.kind === "domain" ? levelForMigratedXp(xp) : (sphere.level ?? 1);
    const pathAllocations = sphere.pathAllocations ?? [];
    const spentPoints = pathAllocations.reduce((total, allocation) => total + allocation.rank, 0);
    return {
      ...sphere,
      level,
      xp,
      spherePointsEarned:
        sphere.spherePointsEarned ?? (sphere.kind === "domain" ? Math.max(0, level - 1) : 0),
      spherePointsSpent: sphere.spherePointsSpent ?? (sphere.kind === "domain" ? spentPoints : 0),
      availablePoints:
        sphere.kind === "domain"
          ? Math.max(0, level - 1 - spentPoints)
          : (sphere.availablePoints ?? 0),
      spentPoints: sphere.kind === "domain" ? spentPoints : (sphere.spentPoints ?? 0),
      pathAllocations,
      upgradePurchases: sphere.upgradePurchases ?? [],
      charge: sphere.charge ?? 0,
      firstRespecUsed: sphere.firstRespecUsed ?? false,
      lastSessionAt: sphere.lastSessionAt ?? legacySphere.lastSessionDate ?? null,
      glyphSlotCount: sphere.glyphSlotCount ?? (sphere.kind === "domain" ? 1 : 0),
      equippedGlyphIds: sphere.equippedGlyphIds ?? [],
      glyphSlots:
        sphere.glyphSlots ??
        defaultGlyphSlots(
          {
            ...sphere,
            glyphSlotCount: sphere.glyphSlotCount ?? (sphere.kind === "domain" ? 1 : 0),
            equippedGlyphIds: sphere.equippedGlyphIds ?? [],
          },
          now,
        ),
      archivedAt: sphere.archivedAt ?? null,
    };
  });
  const center = restored.spheres.find((sphere) => sphere.id === centerSphereId);
  const existingCenterRituals = restored.rituals.filter(
    (ritual) => ritual.sphereId === centerSphereId,
  );
  if (center) {
    if (existingCenterRituals.length === 0) {
      const centerRituals = createCenterRecoveryRituals(nowIso());
      restored.rituals.push(...centerRituals);
      center.activeRitualId = centerRituals[0]?.id ?? null;
      center.ritualIds = centerRituals.map((ritual) => ritual.id);
    } else {
      center.ritualIds = existingCenterRituals.map((ritual) => ritual.id);
      center.activeRitualId = center.activeRitualId ?? existingCenterRituals[0]?.id ?? null;
    }
  }
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
