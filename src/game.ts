import {
  type AppState,
  type Connection,
  type Ritual,
  type Session,
  type Sphere,
  centerSphereId,
} from "./domain.ts";
import { createId, localDateKey } from "./storage.ts";

const secondsPerMinute = 60;

const nowIso = () => new Date().toISOString();
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const domainSpheres = (state: AppState) =>
  state.spheres.filter((sphere) => sphere.kind === "domain");

export const getRitual = (state: AppState, ritualId: string | null) =>
  ritualId ? (state.rituals.find((ritual) => ritual.id === ritualId) ?? null) : null;

export const ensureToday = (state: AppState) => {
  const today = localDateKey();

  for (const sphere of state.spheres) {
    if (sphere.dailyProgressDate !== today) {
      const missedMilestone =
        sphere.kind === "domain" && sphere.milestoneCompletedDate !== sphere.dailyProgressDate;
      sphere.todaySeconds = 0;
      sphere.dailyProgressDate = today;
      sphere.momentum = missedMilestone ? clamp(sphere.momentum - 10, 0, 100) : sphere.momentum;
      sphere.updatedAt = nowIso();
    }
  }
};

export const applyPassiveProduction = (state: AppState) => {
  const now = new Date();
  const lastTick = new Date(state.game.lastPassiveTickAt);
  const elapsedSeconds = Math.max(0, (now.getTime() - lastTick.getTime()) / 1000);
  if (elapsedSeconds < 30) return 0;

  const energyPerSecond = domainSpheres(state).reduce((total, sphere) => {
    const momentumMultiplier = 0.25 + sphere.momentum / 100;
    return total + sphere.passiveEnergyRate * sphere.level * momentumMultiplier;
  }, 0);

  const gained = energyPerSecond * elapsedSeconds;
  state.game.energy += gained;
  state.game.lifetimeEnergy += gained;
  state.game.lastPassiveTickAt = now.toISOString();
  return gained;
};

export const createDomainSphere = (
  state: AppState,
  name: string,
  color: string,
  dailyTargetMinutes: number,
) => {
  const now = nowIso();
  const sphereId = createId("sphere");
  const ritualId = createId("ritual");

  const ritual: Ritual = {
    id: ritualId,
    sphereId,
    name: "Focus",
    targetMinutes: dailyTargetMinutes,
    isFavorite: true,
    createdAt: now,
    updatedAt: now,
  };

  const sphere: Sphere = {
    id: sphereId,
    kind: "domain",
    name,
    color,
    dailyTargetMinutes,
    activeRitualId: ritualId,
    ritualIds: [ritualId],
    level: 1,
    momentum: 35,
    currentStreak: 0,
    bestStreak: 0,
    totalSeconds: 0,
    todaySeconds: 0,
    dailyProgressDate: localDateKey(),
    milestoneCompletedDate: null,
    passiveEnergyRate: 0.001,
    activeEnergyMultiplier: 6,
    createdAt: now,
    updatedAt: now,
  };

  const connection: Connection = {
    id: createId("connection"),
    fromSphereId: sphereId,
    toSphereId: centerSphereId,
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  state.spheres.push(sphere);
  state.rituals.push(ritual);
  state.connections.push(connection);
};

export const createFirstSphere = createDomainSphere;

export const startSession = (state: AppState, sphereId: string) => {
  const sphere = state.spheres.find((item) => item.id === sphereId && item.kind === "domain");
  if (!sphere || state.activeSession) return;

  state.activeSession = {
    id: createId("session"),
    sphereId,
    ritualId: sphere.activeRitualId,
    startedAt: nowIso(),
  };
};

export const finishActiveSession = (state: AppState) => {
  const active = state.activeSession;
  if (!active) return null;

  ensureToday(state);

  const sphere = state.spheres.find((item) => item.id === active.sphereId);
  if (!sphere) {
    state.activeSession = null;
    return null;
  }

  const endedAt = nowIso();
  const durationSeconds = Math.max(
    1,
    Math.floor((Date.now() - new Date(active.startedAt).getTime()) / 1000),
  );
  const hadMilestone = sphere.milestoneCompletedDate === localDateKey();

  sphere.totalSeconds += durationSeconds;
  sphere.todaySeconds += durationSeconds;

  const reachedMilestone =
    sphere.dailyTargetMinutes > 0 &&
    sphere.todaySeconds >= sphere.dailyTargetMinutes * secondsPerMinute;
  const completedMilestoneAfterSession = reachedMilestone && !hadMilestone;

  if (completedMilestoneAfterSession) {
    sphere.milestoneCompletedDate = localDateKey();
    sphere.currentStreak += 1;
    sphere.bestStreak = Math.max(sphere.bestStreak, sphere.currentStreak);
  }

  const minutes = durationSeconds / secondsPerMinute;
  const xpGained = minutes;
  const momentumSessionBoost = minutes >= 5 ? 5 : 2;
  const milestoneMomentumBoost = completedMilestoneAfterSession ? 15 : 0;
  const momentumBefore = sphere.momentum;
  sphere.momentum = clamp(sphere.momentum + momentumSessionBoost + milestoneMomentumBoost, 0, 100);

  const momentumMultiplier = 1 + sphere.momentum / 100;
  const activeEnergy = minutes * sphere.level * momentumMultiplier * sphere.activeEnergyMultiplier;
  const milestoneEnergy = completedMilestoneAfterSession ? sphere.dailyTargetMinutes * 2 : 0;
  const energyGained = activeEnergy + milestoneEnergy;

  state.game.energy += energyGained;
  state.game.lifetimeEnergy += energyGained;
  state.game.experience += xpGained;
  state.game.lifetimeExperience += xpGained;

  const session: Session = {
    id: active.id,
    sphereId: active.sphereId,
    ritualId: active.ritualId,
    startedAt: active.startedAt,
    endedAt,
    durationSeconds,
    completedMilestoneAfterSession,
    createdAt: active.startedAt,
    updatedAt: endedAt,
  };

  state.sessions.unshift(session);
  state.activeSession = null;
  sphere.updatedAt = endedAt;

  return { session, energyGained, xpGained, momentumBefore, momentumAfter: sphere.momentum };
};

export const formatMinutes = (seconds: number) => Math.floor(seconds / 60).toString();

export const formatDuration = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};
