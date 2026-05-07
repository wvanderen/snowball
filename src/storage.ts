import { type AppState, centerSphereId } from "./domain.ts";

const storageKey = "snowball:v0:state";

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

export const loadState = (): AppState => {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return createInitialState();

  try {
    return { ...createInitialState(), ...(JSON.parse(raw) as AppState) };
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
