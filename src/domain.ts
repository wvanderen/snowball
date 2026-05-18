export type SphereKind = "center" | "domain";

export type SpherePath = "Flow" | "Charge" | "Bloom" | "Anchor";

export type ModifierEffect =
  | { type: "MULTIPLY_OUTGOING_ENERGY"; value: number }
  | { type: "REDUCE_ROUTING_LOSS"; value: number }
  | { type: "ACTIVE_EDGE_THROUGHPUT_BONUS"; value: number }
  | { type: "STORE_INCOMING_ENERGY_AS_CHARGE"; value: number }
  | { type: "MULTIPLY_MAX_CHARGE"; value: number }
  | { type: "RELEASE_CHARGE_ON_MILESTONE"; value: number }
  | { type: "RELEASE_CHARGE_ON_SESSION_END"; value: number }
  | { type: "MULTIPLY_MILESTONE_BLOOM"; value: number }
  | { type: "BLOOM_NEIGHBOR_ENERGY_SHARE"; value: number }
  | { type: "FIRST_SESSION_MINI_BLOOM"; value: number }
  | { type: "REDUCE_MOMENTUM_DECAY"; value: number }
  | { type: "INCREASE_MOMENTUM_FLOOR"; value: number }
  | { type: "RETURN_AFTER_INACTIVITY_MOMENTUM_BONUS"; value: number };

export type TalentDefinition = {
  id: string;
  path: SpherePath;
  rank: number;
  name: string;
  description: string;
  effects: ModifierEffect[];
};

export type GlyphEffect =
  | "streak"
  | "recent-consistency"
  | "deep-work"
  | "recovery"
  | "persistence"
  | "resonance"
  | "amplify"
  | "store"
  | "release"
  | "bloom"
  | "echo"
  | "kindle";

export type GlyphRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type GlyphInstance = {
  id: string;
  definitionId: string;
  name: string;
  effect: GlyphEffect;
  description: string;
  rarity: GlyphRarity;
  level: number;
  equippedSphereId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Glyph = GlyphInstance;

export type GlyphSlot = {
  id: string;
  sphereId: string;
  index: number;
  unlocked: boolean;
  glyphId: string | null;
  source: "base" | "sphere-upgrade" | "core-upgrade" | "special";
  createdAt: string;
  updatedAt: string;
};

export type PathAllocation = {
  path: SpherePath;
  rank: number;
};

export type SphereUpgradePurchase = {
  id: string;
  sphereId: string;
  upgradeId: string;
  rank: number;
  purchasedAt: string;
};

export type CoreUpgradePurchase = {
  id: string;
  upgradeId: string;
  rank: number;
  purchasedAt: string;
};

export type ConnectionMode = "manual" | "balanced" | "priority" | "disabled";

export type Sphere = {
  id: string;
  kind: SphereKind;
  name: string;
  color: string;
  dailyTargetMinutes: number;
  activeRitualId: string | null;
  ritualIds: string[];
  glyphSlotCount: number;
  equippedGlyphIds: string[];
  glyphSlots: GlyphSlot[];
  level: number;
  xp: number;
  spherePointsEarned: number;
  spherePointsSpent: number;
  availablePoints: number;
  spentPoints: number;
  pathAllocations: PathAllocation[];
  upgradePurchases: SphereUpgradePurchase[];
  charge: number;
  firstRespecUsed: boolean;
  lastSessionAt: string | null;
  momentum: number;
  currentStreak: number;
  bestStreak: number;
  totalSeconds: number;
  todaySeconds: number;
  dailyProgressDate: string;
  milestoneCompletedDate: string | null;
  passiveEnergyRate: number;
  activeEnergyMultiplier: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Ritual = {
  id: string;
  sphereId: string;
  name: string;
  targetMinutes: number | null;
  isFavorite: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Session = {
  id: string;
  sphereId: string;
  ritualId: string | null;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  completedMilestoneAfterSession: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Connection = {
  id: string;
  fromSphereId: string;
  toSphereId: string;
  active: boolean;
  enabled: boolean;
  allocationPercent: number;
  level: number;
  throughputMultiplier: number;
  routingLoss: number;
  mode: ConnectionMode;
  createdAt: string;
  updatedAt: string;
};

export type GameState = {
  energy: number;
  lifetimeEnergy: number;
  experience: number;
  lifetimeExperience: number;
  corePowerLevel: number;
  coreUpgrades: CoreUpgradePurchase[];
  glyphForgeCount: number;
  firstGlyphRewardClaimed: boolean;
  lastPassiveTickAt: string;
};

export type ActiveSession = {
  id: string;
  sphereId: string;
  ritualId: string | null;
  startedAt: string;
};

export type AppState = {
  version: number;
  spheres: Sphere[];
  rituals: Ritual[];
  sessions: Session[];
  connections: Connection[];
  glyphs: Glyph[];
  game: GameState;
  activeSession: ActiveSession | null;
};

export const centerSphereId = "center";
