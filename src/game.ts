import {
  type AppState,
  type Connection,
  type GlyphEffect,
  type Ritual,
  type Session,
  type Sphere,
  centerSphereId,
} from "./domain.ts";
import { createId, localDateKey } from "./storage.ts";

const secondsPerMinute = 60;
const millisecondsPerDay = 24 * 60 * 60 * 1000;
const maxPassiveElapsedSeconds = 8 * 60 * 60;

export const sphereLevelCost = (sphere: Sphere) => Math.floor(50 * sphere.level ** 1.65);

export const glyphSlotsForLevel = (level: number) =>
  Math.min(3, 1 + Math.floor(Math.max(0, level - 1) / 3));

export const equippedGlyphsForSphere = (state: AppState, sphereId: string) =>
  state.glyphs.filter((glyph) => glyph.equippedSphereId === sphereId);

export const hasGlyphEffect = (state: AppState, sphereId: string, effect: GlyphEffect) =>
  equippedGlyphsForSphere(state, sphereId).some((glyph) => glyph.effect === effect);

export const equipGlyph = (state: AppState, glyphId: string, sphereId: string) => {
  const glyph = state.glyphs.find((item) => item.id === glyphId);
  const sphere = state.spheres.find(
    (item) => item.id === sphereId && item.kind === "domain" && !item.archivedAt,
  );
  if (!glyph || !sphere) return false;

  const now = nowIso();
  const previousSphere = glyph.equippedSphereId
    ? state.spheres.find((item) => item.id === glyph.equippedSphereId)
    : null;

  sphere.glyphSlotCount = Math.max(sphere.glyphSlotCount, glyphSlotsForLevel(sphere.level));
  const isAlreadyEquippedHere = sphere.equippedGlyphIds.includes(glyph.id);
  if (!isAlreadyEquippedHere && sphere.equippedGlyphIds.length >= sphere.glyphSlotCount) {
    return false;
  }

  if (previousSphere && previousSphere.id !== sphere.id) {
    previousSphere.equippedGlyphIds = previousSphere.equippedGlyphIds.filter(
      (id) => id !== glyph.id,
    );
    previousSphere.updatedAt = now;
  }

  if (!isAlreadyEquippedHere) sphere.equippedGlyphIds.push(glyph.id);
  glyph.equippedSphereId = sphere.id;
  glyph.updatedAt = now;
  sphere.updatedAt = now;
  return true;
};

export const unequipGlyph = (state: AppState, glyphId: string) => {
  const glyph = state.glyphs.find((item) => item.id === glyphId);
  if (!glyph?.equippedSphereId) return false;

  const sphere = state.spheres.find((item) => item.id === glyph.equippedSphereId);
  if (sphere) {
    sphere.equippedGlyphIds = sphere.equippedGlyphIds.filter((id) => id !== glyph.id);
    sphere.updatedAt = nowIso();
  }
  glyph.equippedSphereId = null;
  glyph.updatedAt = nowIso();
  return true;
};

export const sphereSlotCost = (state: AppState) => {
  const activeSphereCount = domainSpheres(state).length;
  if (activeSphereCount === 0) return 0;
  return Math.floor(100 * activeSphereCount ** 1.75);
};

export const canUnlockSphereSlot = (state: AppState) => state.game.energy >= sphereSlotCost(state);

export const sphereRates = (sphere: Sphere, buffMultiplier = 1) => {
  const momentumMultiplier = 0.25 + sphere.momentum / 100;
  const passivePerHour =
    sphere.passiveEnergyRate * sphere.level * momentumMultiplier * buffMultiplier * 60 * 60;
  const activePerMinute =
    (1 + sphere.momentum / 100) * sphere.level * sphere.activeEnergyMultiplier * buffMultiplier;
  return { passivePerHour, activePerMinute };
};

export const connectedSphereBuffMultiplier = (state: AppState, sphereId: string) => {
  const activeSphereId = state.activeSession?.sphereId;
  if (!activeSphereId || activeSphereId === sphereId) return 1;

  const hasActiveRoute = state.connections.some(
    (connection) =>
      connection.active &&
      connection.fromSphereId === activeSphereId &&
      connection.toSphereId === sphereId,
  );
  if (!hasActiveRoute) return 1;
  return hasGlyphEffect(state, activeSphereId, "resonance") ? 1.35 : 1.25;
};

export const glyphRateMultiplier = (state: AppState, sphere: Sphere) => {
  let multiplier = 1;
  if (hasGlyphEffect(state, sphere.id, "streak")) {
    multiplier += Math.min(0.15, sphere.currentStreak * 0.005);
  }
  if (
    hasGlyphEffect(state, sphere.id, "recent-consistency") &&
    sphere.milestoneCompletedDate === sphere.dailyProgressDate
  ) {
    multiplier += 0.1;
  }
  return multiplier;
};

export const routedSphereRates = (state: AppState, sphere: Sphere) =>
  sphereRates(
    sphere,
    connectedSphereBuffMultiplier(state, sphere.id) * glyphRateMultiplier(state, sphere),
  );

export const momentumModel = {
  partialMissDecay: 3,
  missedDayDecay: 6,
  maxReturnGapDecay: 30,
  shortSessionBoost: 2,
  focusedSessionBoost: 5,
  milestoneBoost: 15,
} as const;

const nowIso = () => new Date().toISOString();
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const daysBetweenLocalDateKeys = (from: string, to: string) => {
  const fromTime = new Date(`${from}T00:00:00`).getTime();
  const toTime = new Date(`${to}T00:00:00`).getTime();
  if (Number.isNaN(fromTime) || Number.isNaN(toTime)) return 0;
  return Math.max(0, Math.round((toTime - fromTime) / millisecondsPerDay));
};

const missedMomentumDecay = (state: AppState, sphere: Sphere, today: string) => {
  if (sphere.kind !== "domain") return 0;
  const elapsedDays = daysBetweenLocalDateKeys(sphere.dailyProgressDate, today);
  if (elapsedDays <= 0 || sphere.milestoneCompletedDate === sphere.dailyProgressDate) return 0;

  const firstMissDecay =
    sphere.todaySeconds > 0 ? momentumModel.partialMissDecay : momentumModel.missedDayDecay;
  const gapDecay = Math.max(0, elapsedDays - 1) * momentumModel.missedDayDecay;
  const baseDecay = Math.min(momentumModel.maxReturnGapDecay, firstMissDecay + gapDecay);
  return hasGlyphEffect(state, sphere.id, "recovery") ? Math.floor(baseDecay * 0.7) : baseDecay;
};

export const domainSpheres = (state: AppState) =>
  state.spheres.filter((sphere) => sphere.kind === "domain" && !sphere.archivedAt);

export const getRitual = (state: AppState, ritualId: string | null) =>
  ritualId ? (state.rituals.find((ritual) => ritual.id === ritualId) ?? null) : null;

export const activeRitualsForSphere = (state: AppState, sphereId: string) =>
  state.rituals.filter((ritual) => ritual.sphereId === sphereId && !ritual.archivedAt);

export const ensureToday = (state: AppState) => {
  const today = localDateKey();

  for (const sphere of state.spheres) {
    if (sphere.dailyProgressDate !== today) {
      const decay = missedMomentumDecay(state, sphere, today);
      sphere.todaySeconds = 0;
      sphere.dailyProgressDate = today;
      sphere.momentum = clamp(sphere.momentum - decay, 0, 100);
      sphere.updatedAt = nowIso();
    }
  }
};

export const applyPassiveProduction = (state: AppState) => {
  const now = new Date();
  const lastTick = new Date(state.game.lastPassiveTickAt);
  const elapsedSeconds = Math.min(
    maxPassiveElapsedSeconds,
    Math.max(0, (now.getTime() - lastTick.getTime()) / 1000),
  );
  if (elapsedSeconds < 30) return 0;

  const energyPerSecond = domainSpheres(state).reduce((total, sphere) => {
    const { passivePerHour } = routedSphereRates(state, sphere);
    return total + passivePerHour / (60 * 60);
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
  const slotCost = sphereSlotCost(state);
  if (state.game.energy < slotCost) return null;

  state.game.energy -= slotCost;
  const now = nowIso();
  const sphereId = createId("sphere");
  const ritualId = createId("ritual");

  const ritual: Ritual = {
    id: ritualId,
    sphereId,
    name: "Focus",
    targetMinutes: dailyTargetMinutes,
    isFavorite: true,
    archivedAt: null,
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
    glyphSlotCount: 1,
    equippedGlyphIds: [],
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
    archivedAt: null,
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
  return sphere;
};

export const createFirstSphere = createDomainSphere;

export const connectionForSphere = (state: AppState, sphereId: string) =>
  state.connections.find(
    (connection) => connection.fromSphereId === sphereId || connection.toSphereId === sphereId,
  ) ?? null;

export const toggleConnection = (state: AppState, connectionId: string) => {
  const connection = state.connections.find((item) => item.id === connectionId);
  if (!connection) return false;

  connection.active = !connection.active;
  connection.updatedAt = nowIso();
  return true;
};

export const reverseConnection = (state: AppState, connectionId: string) => {
  const connection = state.connections.find((item) => item.id === connectionId);
  if (
    !connection ||
    connection.fromSphereId === centerSphereId ||
    connection.toSphereId === centerSphereId
  ) {
    return false;
  }

  [connection.fromSphereId, connection.toSphereId] = [
    connection.toSphereId,
    connection.fromSphereId,
  ];
  connection.updatedAt = nowIso();
  return true;
};

export const routeConnectionToSphere = (
  state: AppState,
  sphereId: string,
  targetSphereId: string,
) => {
  if (sphereId === centerSphereId || sphereId === targetSphereId) return false;
  const sphere = state.spheres.find(
    (item) => item.id === sphereId && item.kind === "domain" && !item.archivedAt,
  );
  const target = state.spheres.find((item) => item.id === targetSphereId && !item.archivedAt);
  if (!sphere || !target) return false;

  const now = nowIso();
  let connection = connectionForSphere(state, sphereId);
  if (!connection) {
    connection = {
      id: createId("connection"),
      fromSphereId: sphereId,
      toSphereId: targetSphereId,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    state.connections.push(connection);
    return true;
  }

  connection.fromSphereId = sphereId;
  connection.toSphereId = targetSphereId;
  connection.active = true;
  connection.updatedAt = now;
  return true;
};

export const archiveDomainSphere = (state: AppState, sphereId: string) => {
  const sphere = state.spheres.find(
    (item) => item.id === sphereId && item.kind === "domain" && !item.archivedAt,
  );
  if (!sphere || state.activeSession?.sphereId === sphereId) return false;

  const now = nowIso();
  sphere.archivedAt = now;
  sphere.updatedAt = now;
  for (const connection of state.connections) {
    if (connection.fromSphereId === sphereId || connection.toSphereId === sphereId) {
      connection.active = false;
      connection.updatedAt = now;
    }
  }
  return true;
};

export const purchaseSphereLevel = (state: AppState, sphereId: string) => {
  const sphere = state.spheres.find(
    (item) => item.id === sphereId && item.kind === "domain" && !item.archivedAt,
  );
  if (!sphere) return false;

  const cost = sphereLevelCost(sphere);
  if (state.game.energy < cost) return false;

  state.game.energy -= cost;
  sphere.level += 1;
  sphere.glyphSlotCount = Math.max(sphere.glyphSlotCount, glyphSlotsForLevel(sphere.level));
  sphere.updatedAt = nowIso();
  return true;
};

export const updateDomainSphere = (
  state: AppState,
  sphereId: string,
  name: string,
  color: string,
  dailyTargetMinutes: number,
) => {
  const sphere = state.spheres.find(
    (item) => item.id === sphereId && item.kind === "domain" && !item.archivedAt,
  );
  if (!sphere) return false;

  sphere.name = name;
  sphere.color = color;
  sphere.dailyTargetMinutes = dailyTargetMinutes;
  sphere.updatedAt = nowIso();
  return true;
};

export const createRitual = (
  state: AppState,
  sphereId: string,
  name: string,
  targetMinutes: number | null,
) => {
  const sphere = state.spheres.find(
    (item) => item.id === sphereId && item.kind === "domain" && !item.archivedAt,
  );
  if (!sphere) return null;

  const now = nowIso();
  const ritual: Ritual = {
    id: createId("ritual"),
    sphereId,
    name,
    targetMinutes,
    isFavorite: true,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  state.rituals.push(ritual);
  sphere.ritualIds.push(ritual.id);
  sphere.activeRitualId = ritual.id;
  sphere.updatedAt = now;
  return ritual;
};

export const setActiveRitual = (state: AppState, sphereId: string, ritualId: string) => {
  const sphere = state.spheres.find(
    (item) => item.id === sphereId && item.kind === "domain" && !item.archivedAt,
  );
  const ritual = state.rituals.find(
    (item) => item.id === ritualId && item.sphereId === sphereId && !item.archivedAt,
  );
  if (!sphere || !ritual) return false;

  sphere.activeRitualId = ritualId;
  sphere.updatedAt = nowIso();
  return true;
};

export const updateRitual = (
  state: AppState,
  ritualId: string,
  name: string,
  targetMinutes: number | null,
) => {
  const ritual = state.rituals.find((item) => item.id === ritualId && !item.archivedAt);
  if (!ritual) return false;

  ritual.name = name;
  ritual.targetMinutes = targetMinutes;
  ritual.updatedAt = nowIso();
  return true;
};

export const archiveRitual = (state: AppState, ritualId: string) => {
  const ritual = state.rituals.find((item) => item.id === ritualId && !item.archivedAt);
  if (!ritual || state.activeSession?.ritualId === ritualId) return false;

  const sphere = state.spheres.find(
    (item) => item.id === ritual.sphereId && item.kind === "domain" && !item.archivedAt,
  );
  if (!sphere) return false;

  const remaining = activeRitualsForSphere(state, sphere.id).filter((item) => item.id !== ritualId);
  if (remaining.length === 0) return false;

  const now = nowIso();
  ritual.archivedAt = now;
  ritual.updatedAt = now;
  sphere.ritualIds = sphere.ritualIds.filter((id) => id !== ritualId);
  if (sphere.activeRitualId === ritualId) sphere.activeRitualId = remaining[0]?.id ?? null;
  sphere.updatedAt = now;
  return true;
};

export const recentSessionsForRitual = (state: AppState, ritualId: string, limit = 5) =>
  state.sessions.filter((session) => session.ritualId === ritualId).slice(0, limit);

export const startSession = (state: AppState, sphereId: string) => {
  const sphere = state.spheres.find(
    (item) => item.id === sphereId && item.kind === "domain" && !item.archivedAt,
  );
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
  const momentumSessionBoost =
    minutes >= 5 ? momentumModel.focusedSessionBoost : momentumModel.shortSessionBoost;
  const milestoneMomentumBoost = completedMilestoneAfterSession ? momentumModel.milestoneBoost : 0;
  const momentumBefore = sphere.momentum;
  const glyphMomentumBoost = hasGlyphEffect(state, sphere.id, "persistence") ? 1 : 0;
  sphere.momentum = clamp(
    sphere.momentum + momentumSessionBoost + milestoneMomentumBoost + glyphMomentumBoost,
    0,
    100,
  );

  const { activePerMinute } = routedSphereRates(state, sphere);
  const deepWorkMultiplier =
    hasGlyphEffect(state, sphere.id, "deep-work") && minutes >= 25 ? 1.2 : 1;
  const activeEnergy = minutes * activePerMinute * deepWorkMultiplier;
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

  return {
    session,
    energyGained,
    activeEnergy,
    milestoneEnergy,
    xpGained,
    momentumBefore,
    momentumAfter: sphere.momentum,
  };
};

export const formatMinutes = (seconds: number) => Math.floor(seconds / 60).toString();

export const formatDuration = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};
