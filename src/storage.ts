import { type AppState, centerSphereId } from "./domain.ts";

export type BackupFile = {
  app: "snowball";
  exportedAt: string;
  state: AppState;
};

const storageKey = "snowball:v0:state";
const supportedStateVersion = 1;

const nowIso = () => new Date().toISOString();

export const createId = (prefix: string) => {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}_${random}`;
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

export const localDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const parseBackupState = (raw: string): AppState => {
  const parsed = JSON.parse(raw) as unknown;
  const candidate = isRecord(parsed) && parsed.app === "snowball" ? parsed.state : parsed;
  if (!isRecord(candidate)) throw new Error("Backup does not contain Snowball state.");
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
  restored.spheres = restored.spheres.map((sphere) => ({
    ...sphere,
    archivedAt: sphere.archivedAt ?? null,
  }));
  return restored;
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

export const loadState = (): AppState => {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return createInitialState();

  try {
    return parseBackupState(raw);
  } catch {
    return createInitialState();
  }
};

export const saveState = (state: AppState) => {
  localStorage.setItem(storageKey, JSON.stringify(state));
};

export const resetState = () => {
  localStorage.removeItem(storageKey);
};
