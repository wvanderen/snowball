export type SphereKind = "center" | "domain";

export type GlyphEffect =
  | "streak"
  | "recent-consistency"
  | "deep-work"
  | "recovery"
  | "persistence"
  | "resonance";

export type Glyph = {
  id: string;
  name: string;
  effect: GlyphEffect;
  description: string;
  equippedSphereId: string | null;
  createdAt: string;
  updatedAt: string;
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
