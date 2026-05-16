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

export type Glyph = {
  id: string;
  name: string;
  effect: GlyphEffect;
  description: string;
  equippedSphereId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PathAllocation = {
  path: SpherePath;
  rank: number;
};

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
  level: number;
  xp: number;
  availablePoints: number;
  spentPoints: number;
  pathAllocations: PathAllocation[];
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
  createdAt: string;
  updatedAt: string;
};

export type GameState = {
  energy: number;
  lifetimeEnergy: number;
  experience: number;
  lifetimeExperience: number;
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
