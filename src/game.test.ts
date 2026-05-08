import { describe, expect, it, vi } from "vitest";

import {
  applyPassiveProduction,
  createDomainSphere,
  createRitual,
  ensureToday,
  finishActiveSession,
  setActiveRitual,
  startSession,
  updateDomainSphere,
} from "./game.ts";
import { createBackupJson, createInitialState, localDateKey, parseBackupState } from "./storage.ts";

const setNow = (iso: string) => vi.setSystemTime(new Date(iso));

describe("core game calculations", () => {
  it("applies passive energy production from domain sphere rates, levels, and momentum", () => {
    vi.useFakeTimers();
    setNow("2026-05-08T12:00:00.000Z");
    const state = createInitialState();
    createDomainSphere(state, "Health", "#22c55e", 30);
    const sphere = state.spheres.find((item) => item.kind === "domain");
    expect(sphere).toBeDefined();

    sphere!.level = 2;
    sphere!.momentum = 50;
    sphere!.passiveEnergyRate = 0.001;
    state.game.lastPassiveTickAt = "2026-05-08T11:58:00.000Z";

    const gained = applyPassiveProduction(state);

    expect(gained).toBeCloseTo(0.18);
    expect(state.game.energy).toBeCloseTo(0.18);
    expect(state.game.lifetimeEnergy).toBeCloseTo(0.18);
    expect(state.game.lastPassiveTickAt).toBe("2026-05-08T12:00:00.000Z");

    vi.useRealTimers();
  });

  it("does not apply passive production for tiny or negative elapsed time windows", () => {
    vi.useFakeTimers();
    setNow("2026-05-08T12:00:00.000Z");
    const state = createInitialState();
    createDomainSphere(state, "Health", "#22c55e", 30);
    state.game.lastPassiveTickAt = "2026-05-08T11:59:45.000Z";

    expect(applyPassiveProduction(state)).toBe(0);
    expect(state.game.energy).toBe(0);
    expect(state.game.lastPassiveTickAt).toBe("2026-05-08T11:59:45.000Z");

    state.game.lastPassiveTickAt = "2026-05-08T12:01:00.000Z";
    expect(applyPassiveProduction(state)).toBe(0);
    expect(state.game.energy).toBe(0);
    expect(state.game.lastPassiveTickAt).toBe("2026-05-08T12:01:00.000Z");

    vi.useRealTimers();
  });

  it("finishes active sessions with milestone rewards, streaks, momentum, xp, and energy", () => {
    vi.useFakeTimers();
    setNow("2026-05-08T12:00:00.000Z");
    const state = createInitialState();
    createDomainSphere(state, "Study", "#38bdf8", 10);
    const sphere = state.spheres.find((item) => item.kind === "domain");
    expect(sphere).toBeDefined();

    state.activeSession = {
      id: "session_test",
      sphereId: sphere!.id,
      ritualId: sphere!.activeRitualId,
      startedAt: "2026-05-08T11:50:00.000Z",
    };

    const result = finishActiveSession(state);

    expect(result).not.toBeNull();
    expect(result!.session.durationSeconds).toBe(600);
    expect(result!.session.completedMilestoneAfterSession).toBe(true);
    expect(result!.xpGained).toBe(10);
    expect(result!.energyGained).toBeCloseTo(113);
    expect(result!.momentumBefore).toBe(35);
    expect(result!.momentumAfter).toBe(55);
    expect(sphere!.todaySeconds).toBe(600);
    expect(sphere!.totalSeconds).toBe(600);
    expect(sphere!.milestoneCompletedDate).toBe(localDateKey());
    expect(sphere!.currentStreak).toBe(1);
    expect(sphere!.bestStreak).toBe(1);
    expect(state.game.experience).toBe(10);
    expect(state.game.lifetimeExperience).toBe(10);
    expect(state.game.energy).toBeCloseTo(113);
    expect(state.game.lifetimeEnergy).toBeCloseTo(113);
    expect(state.sessions).toHaveLength(1);
    expect(state.activeSession).toBeNull();

    vi.useRealTimers();
  });

  it("records partial session progress without milestone bonuses", () => {
    vi.useFakeTimers();
    setNow("2026-05-08T12:00:00.000Z");
    const state = createInitialState();
    createDomainSphere(state, "Study", "#38bdf8", 20);
    const sphere = state.spheres.find((item) => item.kind === "domain")!;
    sphere.momentum = 35;
    state.activeSession = {
      id: "session_partial",
      sphereId: sphere.id,
      ritualId: sphere.activeRitualId,
      startedAt: "2026-05-08T11:55:00.000Z",
    };

    const result = finishActiveSession(state);

    expect(result!.session.durationSeconds).toBe(300);
    expect(result!.session.completedMilestoneAfterSession).toBe(false);
    expect(result!.xpGained).toBe(5);
    expect(result!.energyGained).toBeCloseTo(42);
    expect(result!.momentumBefore).toBe(35);
    expect(result!.momentumAfter).toBe(40);
    expect(sphere.todaySeconds).toBe(300);
    expect(sphere.milestoneCompletedDate).toBeNull();
    expect(sphere.currentStreak).toBe(0);

    vi.useRealTimers();
  });

  it("only awards the daily milestone once per local date", () => {
    vi.useFakeTimers();
    setNow("2026-05-08T12:00:00.000Z");
    const state = createInitialState();
    createDomainSphere(state, "Study", "#38bdf8", 10);
    const sphere = state.spheres.find((item) => item.kind === "domain")!;
    sphere.todaySeconds = 600;
    sphere.milestoneCompletedDate = localDateKey();
    sphere.currentStreak = 1;
    sphere.bestStreak = 1;
    sphere.momentum = 55;
    state.activeSession = {
      id: "session_repeat",
      sphereId: sphere.id,
      ritualId: sphere.activeRitualId,
      startedAt: "2026-05-08T11:54:00.000Z",
    };

    const result = finishActiveSession(state);

    expect(result!.session.durationSeconds).toBeGreaterThanOrEqual(357);
    expect(result!.session.durationSeconds).toBeLessThanOrEqual(360);
    expect(result!.session.completedMilestoneAfterSession).toBe(false);
    expect(result!.energyGained).toBeGreaterThan(0);
    expect(result!.energyGained).toBeLessThan(60);
    expect(result!.momentumAfter).toBe(60);
    expect(sphere.currentStreak).toBe(1);
    expect(sphere.bestStreak).toBe(1);
    expect(sphere.milestoneCompletedDate).toBe(localDateKey());

    vi.useRealTimers();
  });

  it("mutates spheres and rituals and uses the active ritual id without changing sphere timer target", () => {
    vi.useFakeTimers();
    setNow("2026-05-08T12:00:00.000Z");
    const state = createInitialState();
    createDomainSphere(state, "Old", "#111111", 20);
    const sphere = state.spheres.find((item) => item.kind === "domain")!;
    const defaultRitualId = sphere.activeRitualId;

    expect(updateDomainSphere(state, sphere.id, "New", "#222222", 30)).toBe(true);
    expect(sphere.name).toBe("New");
    expect(sphere.color).toBe("#222222");
    expect(sphere.dailyTargetMinutes).toBe(30);

    const ritual = createRitual(state, sphere.id, "Sprint", 5)!;
    expect(ritual.targetMinutes).toBe(5);
    expect(sphere.ritualIds).toEqual([defaultRitualId, ritual.id]);
    expect(sphere.activeRitualId).toBe(ritual.id);
    expect(setActiveRitual(state, sphere.id, defaultRitualId!)).toBe(true);
    startSession(state, sphere.id);

    expect(state.activeSession?.ritualId).toBe(defaultRitualId);
    expect(getRitualTargetMinutes(state, state.activeSession?.ritualId ?? null)).toBe(20);

    vi.useRealTimers();
  });

  it("resets daily progress and penalizes momentum when a milestone was missed", () => {
    vi.useFakeTimers();
    setNow("2026-05-08T12:00:00.000Z");
    const state = createInitialState();
    createDomainSphere(state, "Writing", "#f97316", 20);
    const sphere = state.spheres.find((item) => item.kind === "domain");
    expect(sphere).toBeDefined();

    sphere!.dailyProgressDate = "2026-05-07";
    sphere!.milestoneCompletedDate = null;
    sphere!.todaySeconds = 300;
    sphere!.momentum = 35;

    ensureToday(state);

    expect(sphere!.dailyProgressDate).toBe("2026-05-08");
    expect(sphere!.todaySeconds).toBe(0);
    expect(sphere!.momentum).toBe(25);

    vi.useRealTimers();
  });

  it("exports and imports Snowball backup files", () => {
    const state = createInitialState();
    createDomainSphere(state, "Backup", "#38bdf8", 15);
    state.game.energy = 42;

    const restored = parseBackupState(createBackupJson(state));

    expect(restored.game.energy).toBe(42);
    expect(restored.spheres.some((sphere) => sphere.name === "Backup")).toBe(true);
  });

  it("rejects invalid backup files", () => {
    expect(() =>
      parseBackupState(JSON.stringify({ app: "snowball", state: { version: 1, game: {} } })),
    ).toThrow("Backup is missing required local data arrays.");
  });

  it("rejects backups with missing or unsupported state versions", () => {
    const state = createInitialState();
    const backup = JSON.parse(createBackupJson(state)) as { state: { version?: number } };

    delete backup.state.version;
    expect(() => parseBackupState(JSON.stringify(backup))).toThrow(
      "Backup version is not supported.",
    );

    backup.state.version = 999;
    expect(() => parseBackupState(JSON.stringify(backup))).toThrow(
      "Backup version is not supported.",
    );
  });

  it("rolls completed days forward without penalizing momentum", () => {
    vi.useFakeTimers();
    setNow("2026-05-08T12:00:00.000Z");
    const state = createInitialState();
    createDomainSphere(state, "Writing", "#f97316", 20);
    const sphere = state.spheres.find((item) => item.kind === "domain")!;
    sphere.dailyProgressDate = "2026-05-07";
    sphere.milestoneCompletedDate = "2026-05-07";
    sphere.todaySeconds = 1200;
    sphere.momentum = 65;

    ensureToday(state);

    expect(sphere.dailyProgressDate).toBe("2026-05-08");
    expect(sphere.todaySeconds).toBe(0);
    expect(sphere.momentum).toBe(65);

    vi.useRealTimers();
  });
});

const getRitualTargetMinutes = (
  state: ReturnType<typeof createInitialState>,
  ritualId: string | null,
) => state.rituals.find((ritual) => ritual.id === ritualId)?.targetMinutes ?? null;
