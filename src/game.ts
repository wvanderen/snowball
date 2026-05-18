import {
  type AppState,
  type Connection,
  type GlyphEffect,
  type ModifierEffect,
  type Ritual,
  type SpherePath,
  type TalentDefinition,
  type Session,
  type Sphere,
  centerSphereId,
} from "./domain.ts";
import { createId, localDateKey } from "./storage.ts";

const secondsPerMinute = 60;
const millisecondsPerDay = 24 * 60 * 60 * 1000;
const maxPassiveElapsedSeconds = 8 * 60 * 60;
const inactivityReturnThresholdMs = millisecondsPerDay;
const baseMaxCharge = 100;

export const xpLevelThresholds = [0, 15, 45, 100, 180, 300, 475, 725, 1050, 1500] as const;
export const spherePaths: SpherePath[] = ["Flow", "Charge", "Bloom", "Anchor"];

export const talentDefinitions: TalentDefinition[] = [
  {
    id: "flow_1",
    path: "Flow",
    rank: 1,
    name: "Smooth Current",
    description: "Output +5%.",
    effects: [{ type: "MULTIPLY_OUTGOING_ENERGY", value: 0.05 }],
  },
  {
    id: "flow_2",
    path: "Flow",
    rank: 2,
    name: "Open Channel",
    description: "Route loss -5%.",
    effects: [{ type: "REDUCE_ROUTING_LOSS", value: 0.05 }],
  },
  {
    id: "flow_3",
    path: "Flow",
    rank: 3,
    name: "Live Conduit",
    description: "Active route +15%.",
    effects: [{ type: "ACTIVE_EDGE_THROUGHPUT_BONUS", value: 0.15 }],
  },
  {
    id: "charge_1",
    path: "Charge",
    rank: 1,
    name: "Vessel",
    description: "Store 5% input.",
    effects: [{ type: "STORE_INCOMING_ENERGY_AS_CHARGE", value: 0.05 }],
  },
  {
    id: "charge_2",
    path: "Charge",
    rank: 2,
    name: "Deeper Vessel",
    description: "Max Charge +50%.",
    effects: [{ type: "MULTIPLY_MAX_CHARGE", value: 0.5 }],
  },
  {
    id: "charge_3",
    path: "Charge",
    rank: 3,
    name: "Release",
    description: "Target dumps charge.",
    effects: [{ type: "RELEASE_CHARGE_ON_MILESTONE", value: 1 }],
  },
  {
    id: "bloom_1",
    path: "Bloom",
    rank: 1,
    name: "First Petal",
    description: "Target energy +10%.",
    effects: [{ type: "MULTIPLY_MILESTONE_BLOOM", value: 0.1 }],
  },
  {
    id: "bloom_2",
    path: "Bloom",
    rank: 2,
    name: "Spillover",
    description: "Route 5% target energy.",
    effects: [{ type: "BLOOM_NEIGHBOR_ENERGY_SHARE", value: 0.05 }],
  },
  {
    id: "bloom_3",
    path: "Bloom",
    rank: 3,
    name: "Partial Bloom",
    description: "First run bonus.",
    effects: [{ type: "FIRST_SESSION_MINI_BLOOM", value: 0.15 }],
  },
  {
    id: "anchor_1",
    path: "Anchor",
    rank: 1,
    name: "Weight",
    description: "Decay -5%.",
    effects: [{ type: "REDUCE_MOMENTUM_DECAY", value: 0.05 }],
  },
  {
    id: "anchor_2",
    path: "Anchor",
    rank: 2,
    name: "Root",
    description: "Momentum floor +5.",
    effects: [{ type: "INCREASE_MOMENTUM_FLOOR", value: 5 }],
  },
  {
    id: "anchor_3",
    path: "Anchor",
    rank: 3,
    name: "Return Path",
    description: "Return +10 momentum.",
    effects: [{ type: "RETURN_AFTER_INACTIVITY_MOMENTUM_BONUS", value: 10 }],
  },
];

export const levelForXp = (xp: number) => {
  let level = 1;
  for (let index = 0; index < xpLevelThresholds.length; index += 1) {
    if (xp >= xpLevelThresholds[index]!) level = index + 1;
  }
  return level;
};

export const corePowerCost = (level = 1) => Math.floor(120 * level ** 1.65);

export const sphereLevelCost = (sphere: Sphere) =>
  sphere.kind === "center" ? corePowerCost(sphere.level) : Number.POSITIVE_INFINITY;

export const corePowerProgress = (state: AppState) => {
  const cost = corePowerCost(state.game.corePowerLevel);
  return { cost, percent: Math.min(100, (state.game.energy / cost) * 100) };
};

export type ProgressionModifierContext = {
  sphereId?: string;
  connectionId?: string;
  sessionId?: string;
};

export type ProgressionModifierTotals = {
  outputMultiplierBonus: number;
  routingLossReduction: number;
  activeEdgeThroughputBonus: number;
  chargeStoreShare: number;
  maxChargeMultiplierBonus: number;
  milestoneChargeReleaseShare: number;
  sessionEndChargeReleaseShare: number;
  milestoneBloomMultiplierBonus: number;
  bloomNeighborEnergyShare: number;
  firstSessionMiniBloomShare: number;
  momentumDecayReduction: number;
  momentumFloorIncrease: number;
  returnAfterInactivityMomentumBonus: number;
};

export type ProgressionModifierResolution = {
  context: ProgressionModifierContext;
  effects: ModifierEffect[];
  totals: ProgressionModifierTotals;
};

const emptyModifierTotals = (): ProgressionModifierTotals => ({
  outputMultiplierBonus: 0,
  routingLossReduction: 0,
  activeEdgeThroughputBonus: 0,
  chargeStoreShare: 0,
  maxChargeMultiplierBonus: 0,
  milestoneChargeReleaseShare: 0,
  sessionEndChargeReleaseShare: 0,
  milestoneBloomMultiplierBonus: 0,
  bloomNeighborEnergyShare: 0,
  firstSessionMiniBloomShare: 0,
  momentumDecayReduction: 0,
  momentumFloorIncrease: 0,
  returnAfterInactivityMomentumBonus: 0,
});

const aggregateModifierEffects = (effects: ModifierEffect[]): ProgressionModifierTotals => {
  const totals = emptyModifierTotals();
  for (const effect of effects) {
    if (effect.type === "MULTIPLY_OUTGOING_ENERGY") totals.outputMultiplierBonus += effect.value;
    else if (effect.type === "REDUCE_ROUTING_LOSS") totals.routingLossReduction += effect.value;
    else if (effect.type === "ACTIVE_EDGE_THROUGHPUT_BONUS")
      totals.activeEdgeThroughputBonus += effect.value;
    else if (effect.type === "STORE_INCOMING_ENERGY_AS_CHARGE")
      totals.chargeStoreShare += effect.value;
    else if (effect.type === "MULTIPLY_MAX_CHARGE") totals.maxChargeMultiplierBonus += effect.value;
    else if (effect.type === "RELEASE_CHARGE_ON_MILESTONE")
      totals.milestoneChargeReleaseShare += effect.value;
    else if (effect.type === "RELEASE_CHARGE_ON_SESSION_END")
      totals.sessionEndChargeReleaseShare += effect.value;
    else if (effect.type === "MULTIPLY_MILESTONE_BLOOM")
      totals.milestoneBloomMultiplierBonus += effect.value;
    else if (effect.type === "BLOOM_NEIGHBOR_ENERGY_SHARE")
      totals.bloomNeighborEnergyShare += effect.value;
    else if (effect.type === "FIRST_SESSION_MINI_BLOOM")
      totals.firstSessionMiniBloomShare += effect.value;
    else if (effect.type === "REDUCE_MOMENTUM_DECAY") totals.momentumDecayReduction += effect.value;
    else if (effect.type === "INCREASE_MOMENTUM_FLOOR")
      totals.momentumFloorIncrease += effect.value;
    else if (effect.type === "RETURN_AFTER_INACTIVITY_MOMENTUM_BONUS")
      totals.returnAfterInactivityMomentumBonus += effect.value;
  }
  return totals;
};

export const pathRank = (sphere: Sphere, path: SpherePath) =>
  sphere.pathAllocations.find((allocation) => allocation.path === path)?.rank ?? 0;

export const effectsForSphere = (state: AppState, sphere: Sphere): ModifierEffect[] => {
  const pathEffects = sphere.pathAllocations.flatMap((allocation) =>
    talentDefinitions
      .filter((talent) => talent.path === allocation.path && talent.rank <= allocation.rank)
      .flatMap((talent) => talent.effects),
  );
  const glyphEffects: ModifierEffect[] = equippedGlyphsForSphere(state, sphere.id).flatMap(
    (glyph): ModifierEffect[] => {
      if (glyph.effect === "amplify") return [{ type: "MULTIPLY_OUTGOING_ENERGY", value: 0.1 }];
      if (glyph.effect === "store")
        return [{ type: "STORE_INCOMING_ENERGY_AS_CHARGE", value: 0.05 }];
      if (glyph.effect === "release")
        return [{ type: "RELEASE_CHARGE_ON_SESSION_END", value: 0.25 }];
      if (glyph.effect === "bloom") return [{ type: "MULTIPLY_MILESTONE_BLOOM", value: 0.2 }];
      if (glyph.effect === "echo") return [{ type: "BLOOM_NEIGHBOR_ENERGY_SHARE", value: 0.1 }];
      if (glyph.effect === "kindle")
        return [{ type: "RETURN_AFTER_INACTIVITY_MOMENTUM_BONUS", value: 8 }];
      return [];
    },
  );
  return [...pathEffects, ...glyphEffects];
};

export const resolveProgressionModifiers = (
  state: AppState,
  context: ProgressionModifierContext,
): ProgressionModifierResolution => {
  const sphere = context.sphereId
    ? state.spheres.find((item) => item.id === context.sphereId)
    : null;
  const effects = sphere ? effectsForSphere(state, sphere) : [];
  return { context, effects, totals: aggregateModifierEffects(effects) };
};

export const maxChargeForSphere = (state: AppState, sphere: Sphere) =>
  baseMaxCharge *
  (1 + resolveProgressionModifiers(state, { sphereId: sphere.id }).totals.maxChargeMultiplierBonus);

const recalculateSphereProgression = (sphere: Sphere) => {
  if (sphere.kind !== "domain") return;
  sphere.level = levelForXp(sphere.xp);
  sphere.spentPoints = sphere.pathAllocations.reduce(
    (total, allocation) => total + allocation.rank,
    0,
  );
  sphere.spherePointsEarned = Math.max(0, sphere.level - 1);
  sphere.spherePointsSpent = sphere.spentPoints;
  sphere.availablePoints = Math.max(0, sphere.spherePointsEarned - sphere.spherePointsSpent);
};

export const spendSpherePoint = (state: AppState, sphereId: string, path: SpherePath) => {
  const sphere = state.spheres.find(
    (item) => item.id === sphereId && item.kind === "domain" && !item.archivedAt,
  );
  if (!sphere || !spherePaths.includes(path)) return false;
  recalculateSphereProgression(sphere);
  const currentRank = pathRank(sphere, path);
  if (currentRank >= 3 || sphere.availablePoints <= 0) return false;
  const allocation = sphere.pathAllocations.find((item) => item.path === path);
  if (allocation) allocation.rank += 1;
  else sphere.pathAllocations.push({ path, rank: 1 });
  recalculateSphereProgression(sphere);
  sphere.charge = Math.min(sphere.charge, maxChargeForSphere(state, sphere));
  sphere.updatedAt = nowIso();
  return true;
};

export const respecSphere = (state: AppState, sphereId: string) => {
  const sphere = state.spheres.find(
    (item) => item.id === sphereId && item.kind === "domain" && !item.archivedAt,
  );
  if (!sphere) return false;
  recalculateSphereProgression(sphere);
  const cost = sphere.firstRespecUsed ? 25 * sphere.spentPoints : 0;
  if (state.game.energy < cost) return false;
  state.game.energy -= cost;
  sphere.pathAllocations = [];
  sphere.firstRespecUsed = true;
  sphere.charge = Math.min(sphere.charge, baseMaxCharge);
  recalculateSphereProgression(sphere);
  sphere.updatedAt = nowIso();
  return true;
};

export const centerRecoveryMultiplier = (state: AppState) =>
  1 + Math.max(0, state.game.corePowerLevel - 1) * 0.05;

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
    previousSphere.glyphSlots.forEach((slot) => {
      if (slot.glyphId === glyph.id) {
        slot.glyphId = null;
        slot.updatedAt = now;
      }
    });
    previousSphere.updatedAt = now;
  }

  if (!isAlreadyEquippedHere) sphere.equippedGlyphIds.push(glyph.id);
  const openSlot = sphere.glyphSlots.find((slot) => slot.unlocked && slot.glyphId === null);
  if (openSlot && !isAlreadyEquippedHere) {
    openSlot.glyphId = glyph.id;
    openSlot.updatedAt = now;
  }
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
    const now = nowIso();
    sphere.equippedGlyphIds = sphere.equippedGlyphIds.filter((id) => id !== glyph.id);
    sphere.glyphSlots.forEach((slot) => {
      if (slot.glyphId === glyph.id) {
        slot.glyphId = null;
        slot.updatedAt = now;
      }
    });
    sphere.updatedAt = now;
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

export const sphereRates = (sphere: Sphere, buffMultiplier = 1, outputMultiplier = 1) => {
  const momentumMultiplier = 0.25 + sphere.momentum / 100;
  const passivePerHour =
    sphere.passiveEnergyRate *
    sphere.level *
    momentumMultiplier *
    buffMultiplier *
    outputMultiplier *
    60 *
    60;
  const activePerMinute =
    (1 + sphere.momentum / 100) *
    sphere.level *
    sphere.activeEnergyMultiplier *
    buffMultiplier *
    outputMultiplier;
  return { passivePerHour, activePerMinute };
};

export const outgoingConnectionsForSphere = (state: AppState, sphereId: string) =>
  state.connections.filter((connection) => connection.fromSphereId === sphereId);

export const enabledOutgoingConnectionsForSphere = (state: AppState, sphereId: string) =>
  outgoingConnectionsForSphere(state, sphereId).filter(
    (connection) => connection.enabled && connection.active,
  );

export const normalizeOutgoingAllocations = (state: AppState, sphereId: string) => {
  const enabled = enabledOutgoingConnectionsForSphere(state, sphereId);
  if (enabled.length === 0) return false;

  const positive = enabled.filter((connection) => connection.allocationPercent > 0);
  const source = positive.length > 0 ? positive : enabled;
  const total = source.reduce(
    (sum, connection) => sum + Math.max(0, connection.allocationPercent),
    0,
  );
  const equalShare = 100 / enabled.length;
  let assigned = 0;

  enabled.forEach((connection, index) => {
    const raw = total > 0 ? (Math.max(0, connection.allocationPercent) / total) * 100 : equalShare;
    const allocation = index === enabled.length - 1 ? 100 - assigned : Math.round(raw);
    connection.allocationPercent = clamp(allocation, 0, 100);
    assigned += connection.allocationPercent;
  });
  return true;
};

export const connectedSphereBuffMultiplier = (state: AppState, sphereId: string) => {
  const activeSphereId = state.activeSession?.sphereId;
  if (!activeSphereId || activeSphereId === sphereId) return 1;

  const activeRoutes = enabledOutgoingConnectionsForSphere(state, activeSphereId).filter(
    (connection) => connection.toSphereId === sphereId,
  );
  if (activeRoutes.length === 0) return 1;
  const activeSphere = state.spheres.find((sphere) => sphere.id === activeSphereId);
  const modifiers = activeSphere
    ? resolveProgressionModifiers(state, { sphereId: activeSphere.id })
    : null;
  const conduitBonus = modifiers?.totals.activeEdgeThroughputBonus ?? 0;
  const baseLoss = sphereId === centerSphereId ? 0 : 0.05;
  const reducedLoss = Math.max(0, baseLoss - (modifiers?.totals.routingLossReduction ?? 0));
  const fullRouteMultiplier =
    (hasGlyphEffect(state, activeSphereId, "resonance") ? 1.35 : 1.25) + conduitBonus - reducedLoss;
  const allocatedShare = Math.min(
    1,
    activeRoutes.reduce((sum, connection) => sum + connection.allocationPercent, 0) / 100,
  );
  return 1 + (fullRouteMultiplier - 1) * allocatedShare;
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

export const routedSphereRates = (state: AppState, sphere: Sphere) => {
  const modifiers = resolveProgressionModifiers(state, { sphereId: sphere.id });
  return sphereRates(
    sphere,
    connectedSphereBuffMultiplier(state, sphere.id) * glyphRateMultiplier(state, sphere),
    1 + modifiers.totals.outputMultiplierBonus,
  );
};

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
  const glyphAdjusted = hasGlyphEffect(state, sphere.id, "recovery")
    ? Math.floor(baseDecay * 0.7)
    : baseDecay;
  const modifiers = resolveProgressionModifiers(state, { sphereId: sphere.id });
  const anchorAdjusted = glyphAdjusted * (1 - modifiers.totals.momentumDecayReduction);
  return Math.floor(anchorAdjusted / centerRecoveryMultiplier(state));
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
      const floor = resolveProgressionModifiers(state, {
        sphereId: sphere.id,
      }).totals.momentumFloorIncrease;
      sphere.momentum = clamp(sphere.momentum - decay, floor, 100);
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
  if (elapsedSeconds <= 0) return 0;

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
    glyphSlots: [
      {
        id: `${sphereId}_glyph_slot_1`,
        sphereId,
        index: 0,
        unlocked: true,
        glyphId: null,
        source: "base",
        createdAt: now,
        updatedAt: now,
      },
    ],
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
    enabled: true,
    allocationPercent: 100,
    level: 1,
    throughputMultiplier: 1,
    routingLoss: 0,
    mode: "manual",
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
  connection.enabled = connection.active;
  connection.mode = connection.active ? "manual" : "disabled";
  connection.updatedAt = nowIso();
  normalizeOutgoingAllocations(state, connection.fromSphereId);
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
  normalizeOutgoingAllocations(state, connection.fromSphereId);
  return true;
};

export const setConnectionAllocation = (
  state: AppState,
  connectionId: string,
  allocationPercent: number,
) => {
  const connection = state.connections.find((item) => item.id === connectionId);
  if (!connection || !Number.isFinite(allocationPercent)) return false;

  connection.allocationPercent = clamp(Math.round(allocationPercent), 0, 100);
  connection.updatedAt = nowIso();
  normalizeOutgoingAllocations(state, connection.fromSphereId);
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
      enabled: true,
      allocationPercent: 100,
      level: 1,
      throughputMultiplier: 1,
      routingLoss: targetSphereId === centerSphereId ? 0 : 0.05,
      mode: "manual",
      createdAt: now,
      updatedAt: now,
    };
    state.connections.push(connection);
    normalizeOutgoingAllocations(state, sphereId);
    return true;
  }

  connection.fromSphereId = sphereId;
  connection.toSphereId = targetSphereId;
  connection.active = true;
  connection.enabled = true;
  connection.mode = "manual";
  connection.routingLoss = targetSphereId === centerSphereId ? 0 : 0.05;
  connection.updatedAt = now;
  normalizeOutgoingAllocations(state, sphereId);
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
      connection.enabled = false;
      connection.mode = "disabled";
      connection.updatedAt = now;
    }
  }
  return true;
};

export const purchaseCorePower = (state: AppState) => {
  const cost = corePowerCost(state.game.corePowerLevel);
  if (state.game.energy < cost) return false;

  const now = nowIso();
  const nextLevel = state.game.corePowerLevel + 1;
  state.game.energy -= cost;
  state.game.corePowerLevel = nextLevel;
  state.game.coreUpgrades.push({
    id: createId("core_upgrade"),
    upgradeId: "core_power",
    rank: nextLevel,
    purchasedAt: now,
  });

  const center = state.spheres.find((item) => item.id === centerSphereId && !item.archivedAt);
  if (center) {
    center.level = nextLevel;
    center.updatedAt = now;
  }
  return true;
};

export const purchaseSphereLevel = (state: AppState, sphereId: string) =>
  sphereId === centerSphereId ? purchaseCorePower(state) : false;

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
  const sphere = state.spheres.find((item) => item.id === sphereId && !item.archivedAt);
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
  const sphere = state.spheres.find((item) => item.id === sphereId && !item.archivedAt);
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

  const sphere = state.spheres.find((item) => item.id === ritual.sphereId && !item.archivedAt);
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
  const sphere = state.spheres.find((item) => item.id === sphereId && !item.archivedAt);
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
  const today = localDateKey();
  const hadMilestone = sphere.milestoneCompletedDate === today;
  const hadAnyProgressToday = sphere.todaySeconds > 0;
  const inactiveReturn =
    sphere.kind === "domain" &&
    sphere.lastSessionAt !== null &&
    new Date(endedAt).getTime() - new Date(sphere.lastSessionAt).getTime() >=
      inactivityReturnThresholdMs;

  sphere.totalSeconds += durationSeconds;
  sphere.todaySeconds += durationSeconds;

  if (sphere.kind === "center") {
    const minutes = durationSeconds / secondsPerMinute;
    const xpGained = 0;
    const energyGained = minutes * centerRecoveryMultiplier(state);
    const recoveryBoost = Math.min(4, Math.max(1, Math.floor(minutes / 5) + 1));
    for (const domainSphere of domainSpheres(state)) {
      domainSphere.momentum = clamp(domainSphere.momentum + recoveryBoost, 0, 100);
      domainSphere.updatedAt = endedAt;
    }
    state.game.energy += energyGained;
    state.game.lifetimeEnergy += energyGained;

    const session: Session = {
      id: active.id,
      sphereId: active.sphereId,
      ritualId: active.ritualId,
      startedAt: active.startedAt,
      endedAt,
      durationSeconds,
      completedMilestoneAfterSession: false,
      createdAt: active.startedAt,
      updatedAt: endedAt,
    };

    state.sessions.unshift(session);
    state.activeSession = null;
    sphere.updatedAt = endedAt;

    return {
      session,
      energyGained,
      activeEnergy: energyGained,
      milestoneEnergy: 0,
      xpGained,
      momentumBefore: sphere.momentum,
      momentumAfter: sphere.momentum,
    };
  }

  const reachedMilestone =
    sphere.dailyTargetMinutes > 0 &&
    sphere.todaySeconds >= sphere.dailyTargetMinutes * secondsPerMinute;
  const completedMilestoneAfterSession = reachedMilestone && !hadMilestone;

  if (completedMilestoneAfterSession) {
    sphere.milestoneCompletedDate = today;
    sphere.currentStreak += 1;
    sphere.bestStreak = Math.max(sphere.bestStreak, sphere.currentStreak);
  }

  const minutes = durationSeconds / secondsPerMinute;
  const xpGained = minutes;
  sphere.xp += xpGained;
  recalculateSphereProgression(sphere);
  const momentumSessionBoost =
    minutes >= 5 ? momentumModel.focusedSessionBoost : momentumModel.shortSessionBoost;
  const milestoneMomentumBoost = completedMilestoneAfterSession ? momentumModel.milestoneBoost : 0;
  const momentumBefore = sphere.momentum;
  const glyphMomentumBoost = hasGlyphEffect(state, sphere.id, "persistence") ? 1 : 0;
  const modifiers = resolveProgressionModifiers(state, {
    sphereId: sphere.id,
    sessionId: active.id,
  });
  const returnBoost = inactiveReturn ? modifiers.totals.returnAfterInactivityMomentumBonus : 0;
  const momentumFloor = modifiers.totals.momentumFloorIncrease;
  sphere.momentum = clamp(
    sphere.momentum +
      momentumSessionBoost +
      milestoneMomentumBoost +
      glyphMomentumBoost +
      returnBoost,
    momentumFloor,
    100,
  );

  const { activePerMinute } = routedSphereRates(state, sphere);
  const deepWorkMultiplier =
    hasGlyphEffect(state, sphere.id, "deep-work") && minutes >= 25 ? 1.2 : 1;
  const activeEnergy = minutes * activePerMinute * deepWorkMultiplier;
  const baseMilestoneEnergy = sphere.dailyTargetMinutes * 2;
  const bloomMultiplier = 1 + modifiers.totals.milestoneBloomMultiplierBonus;
  const fullBloomEnergy = baseMilestoneEnergy * bloomMultiplier;
  const miniBloomEnergy =
    !hadAnyProgressToday && !completedMilestoneAfterSession
      ? fullBloomEnergy * modifiers.totals.firstSessionMiniBloomShare
      : 0;
  const milestoneEnergy = completedMilestoneAfterSession ? fullBloomEnergy : miniBloomEnergy;
  const milestoneChargeRelease =
    completedMilestoneAfterSession && modifiers.totals.milestoneChargeReleaseShare > 0
      ? sphere.charge * Math.min(1, modifiers.totals.milestoneChargeReleaseShare)
      : 0;
  if (milestoneChargeRelease > 0) sphere.charge = 0;
  const sessionChargeRelease =
    milestoneChargeRelease > 0
      ? 0
      : sphere.charge * Math.min(1, modifiers.totals.sessionEndChargeReleaseShare);
  if (sessionChargeRelease > 0) sphere.charge -= sessionChargeRelease;
  const bloomNeighborEnergy = completedMilestoneAfterSession
    ? state.connections
        .filter((connection) => {
          if (
            !connection.active ||
            (connection.fromSphereId !== sphere.id && connection.toSphereId !== sphere.id)
          ) {
            return false;
          }
          const neighborId =
            connection.fromSphereId === sphere.id ? connection.toSphereId : connection.fromSphereId;
          return state.spheres.some(
            (item) => item.id === neighborId && item.kind === "domain" && !item.archivedAt,
          );
        })
        .reduce((total) => total + milestoneEnergy * modifiers.totals.bloomNeighborEnergyShare, 0)
    : 0;
  const energyGained =
    activeEnergy +
    milestoneEnergy +
    milestoneChargeRelease +
    sessionChargeRelease +
    bloomNeighborEnergy;

  const chargeStored = (activeEnergy + milestoneEnergy) * modifiers.totals.chargeStoreShare;
  sphere.charge = Math.min(maxChargeForSphere(state, sphere), sphere.charge + chargeStored);

  state.game.energy += energyGained;
  state.game.lifetimeEnergy += energyGained;

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
  sphere.lastSessionAt = endedAt;
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
