import { describe, expect, it, vi } from "vitest";

import {
  activeRitualsForSphere,
  applyPassiveProduction,
  archiveDomainSphere,
  connectedSphereBuffMultiplier,
  connectionForSphere,
  corePowerCost,
  corePowerProgress,
  archiveRitual,
  createDomainSphere,
  createRitual,
  domainSpheres,
  ensureToday,
  equipGlyph,
  equippedGlyphsForSphere,
  finishActiveSession,
  purchaseCorePower,
  recentSessionsForRitual,
  outgoingConnectionsForSphere,
  reverseConnection,
  resolveProgressionModifiers,
  routedSphereRates,
  routeConnectionToSphere,
  setActiveRitual,
  setConnectionAllocation,
  sphereSlotCost,
  spendSpherePoint,
  startSession,
  toggleConnection,
  unequipGlyph,
  updateDomainSphere,
  updateRitual,
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

  it("caps passive production while away so active focus remains strongest", () => {
    vi.useFakeTimers();
    setNow("2026-05-08T12:00:00.000Z");
    const state = createInitialState();
    createDomainSphere(state, "Health", "#22c55e", 30);
    const sphere = state.spheres.find((item) => item.kind === "domain")!;
    sphere.level = 3;
    sphere.momentum = 100;
    state.game.lastPassiveTickAt = "2026-05-07T12:00:00.000Z";

    const gained = applyPassiveProduction(state);

    expect(gained).toBeCloseTo(108);
    expect(gained).toBeLessThan(15 * sphere.level * 2 * sphere.activeEnergyMultiplier);

    vi.useRealTimers();
  });

  it("applies tiny passive production ticks but ignores negative elapsed time windows", () => {
    vi.useFakeTimers();
    setNow("2026-05-08T12:00:00.000Z");
    const state = createInitialState();
    createDomainSphere(state, "Health", "#22c55e", 30);
    const sphere = state.spheres.find((item) => item.kind === "domain")!;
    sphere.level = 2;
    sphere.momentum = 50;
    sphere.passiveEnergyRate = 0.001;
    state.game.lastPassiveTickAt = "2026-05-08T11:59:45.000Z";

    expect(applyPassiveProduction(state)).toBeCloseTo(0.0225);
    expect(state.game.energy).toBeCloseTo(0.0225);
    expect(state.game.lastPassiveTickAt).toBe("2026-05-08T12:00:00.000Z");

    state.game.lastPassiveTickAt = "2026-05-08T12:01:00.000Z";
    expect(applyPassiveProduction(state)).toBe(0);
    expect(state.game.energy).toBeCloseTo(0.0225);
    expect(state.game.lastPassiveTickAt).toBe("2026-05-08T12:01:00.000Z");

    vi.useRealTimers();
  });

  it("purchases persistent Core Power at the Center with escalating Energy costs", () => {
    const state = createInitialState();
    const center = state.spheres.find((item) => item.kind === "center")!;

    expect(corePowerCost(1)).toBe(120);
    expect(corePowerProgress(state)).toEqual({ cost: 120, percent: 0 });
    expect(purchaseCorePower(state)).toBe(false);

    state.game.energy = 120;
    expect(purchaseCorePower(state)).toBe(true);
    expect(state.game.energy).toBe(0);
    expect(state.game.corePowerLevel).toBe(2);
    expect(center.level).toBe(2);
    expect(state.game.coreUpgrades).toHaveLength(1);
    expect(state.game.coreUpgrades[0]).toMatchObject({ upgradeId: "core_power", rank: 2 });
    expect(corePowerCost(state.game.corePowerLevel)).toBeGreaterThan(120);
  });

  it("logs optional Center recovery rituals with gentle rewards and domain momentum recovery", () => {
    vi.useFakeTimers();
    setNow("2026-05-08T12:00:00.000Z");
    const state = createInitialState();
    createDomainSphere(state, "Study", "#38bdf8", 10);
    const domain = state.spheres.find((item) => item.kind === "domain")!;
    domain.momentum = 20;
    const center = state.spheres.find((item) => item.kind === "center")!;

    state.activeSession = {
      id: "session_rest",
      sphereId: center.id,
      ritualId: center.activeRitualId,
      startedAt: "2026-05-08T11:50:00.000Z",
    };

    const result = finishActiveSession(state);

    expect(result).not.toBeNull();
    expect(result!.session.sphereId).toBe(center.id);
    expect(result!.session.completedMilestoneAfterSession).toBe(false);
    expect(result!.energyGained).toBeCloseTo(10);
    expect(result!.xpGained).toBe(0);
    expect(center.currentStreak).toBe(0);
    expect(center.milestoneCompletedDate).toBeNull();
    expect(domain.momentum).toBe(23);

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
    expect(sphere!.xp).toBe(10);
    expect(state.game.experience).toBe(0);
    expect(state.game.lifetimeExperience).toBe(0);
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

  it("routes connections, toggles active flow, reverses domain routes, and keeps center as output", () => {
    const state = createInitialState();
    const first = createDomainSphere(state, "Health", "#22c55e", 30)!;
    state.game.energy = 500;
    const second = createDomainSphere(state, "Music", "#7dd3fc", 20)!;

    const connection = connectionForSphere(state, first.id)!;
    expect(connection.toSphereId).toBe("center");
    expect(toggleConnection(state, connection.id)).toBe(true);
    expect(connection.active).toBe(false);
    expect(reverseConnection(state, connection.id)).toBe(false);
    expect(connection.toSphereId).toBe("center");

    expect(routeConnectionToSphere(state, first.id, second.id)).toBe(true);
    expect(connection.active).toBe(true);
    expect(connection.toSphereId).toBe(second.id);
    expect(reverseConnection(state, connection.id)).toBe(true);
    expect(connection.fromSphereId).toBe(second.id);
    expect(connection.toSphereId).toBe(first.id);
  });

  it("routes from the requested sphere instead of mutating an incoming route", () => {
    const state = createInitialState();
    const first = createDomainSphere(state, "Health", "#22c55e", 30)!;
    state.game.energy = 1000;
    const second = createDomainSphere(state, "Music", "#7dd3fc", 20)!;
    state.game.energy = 1000;
    const third = createDomainSphere(state, "Study", "#38bdf8", 25)!;

    expect(routeConnectionToSphere(state, first.id, second.id)).toBe(true);
    expect(routeConnectionToSphere(state, second.id, third.id)).toBe(true);

    expect(outgoingConnectionsForSphere(state, first.id)[0]!.toSphereId).toBe(second.id);
    expect(outgoingConnectionsForSphere(state, second.id)[0]!.toSphereId).toBe(third.id);
  });

  it("normalizes both old and new sources when reversing route allocations", () => {
    const state = createInitialState();
    const first = createDomainSphere(state, "Health", "#22c55e", 30)!;
    state.game.energy = 1000;
    const second = createDomainSphere(state, "Music", "#7dd3fc", 20)!;
    state.game.energy = 1000;
    const third = createDomainSphere(state, "Study", "#38bdf8", 25)!;
    routeConnectionToSphere(state, first.id, second.id);
    const firstRoute = outgoingConnectionsForSphere(state, first.id)[0]!;
    state.connections.push({
      ...firstRoute,
      id: "connection_extra_reverse",
      toSphereId: third.id,
      allocationPercent: 50,
    });
    expect(setConnectionAllocation(state, firstRoute.id, 50)).toBe(true);

    expect(reverseConnection(state, firstRoute.id)).toBe(true);

    expect(outgoingConnectionsForSphere(state, first.id)[0]!.allocationPercent).toBe(100);
    expect(
      outgoingConnectionsForSphere(state, second.id).reduce(
        (sum, connection) => sum + connection.allocationPercent,
        0,
      ),
    ).toBe(100);
  });

  it("normalizes enabled route allocations and scales active route buffs", () => {
    const state = createInitialState();
    const first = createDomainSphere(state, "Health", "#22c55e", 30)!;
    state.game.energy = 1000;
    const second = createDomainSphere(state, "Music", "#7dd3fc", 20)!;
    state.game.energy = 1000;
    const third = createDomainSphere(state, "Study", "#38bdf8", 25)!;
    routeConnectionToSphere(state, first.id, second.id);
    const firstRoute = connectionForSphere(state, first.id)!;
    state.connections.push({
      ...firstRoute,
      id: "connection_extra",
      toSphereId: third.id,
      allocationPercent: 50,
    });

    expect(setConnectionAllocation(state, firstRoute.id, 25)).toBe(true);
    expect(firstRoute.allocationPercent + state.connections.at(-1)!.allocationPercent).toBe(100);

    startSession(state, first.id);
    expect(connectedSphereBuffMultiplier(state, second.id)).toBeCloseTo(1.066);
    expect(toggleConnection(state, state.connections.at(-1)!.id)).toBe(true);
    expect(firstRoute.allocationPercent).toBe(100);
    expect(connectedSphereBuffMultiplier(state, second.id)).toBeCloseTo(1.2);
  });

  it("buffs nodes connected to the active sphere", () => {
    const state = createInitialState();
    const first = createDomainSphere(state, "Health", "#22c55e", 30)!;
    state.game.energy = 500;
    const second = createDomainSphere(state, "Music", "#7dd3fc", 20)!;
    routeConnectionToSphere(state, first.id, second.id);

    startSession(state, first.id);

    expect(connectedSphereBuffMultiplier(state, second.id)).toBe(1.2);
    expect(connectedSphereBuffMultiplier(state, first.id)).toBe(1);

    first.xp = 45;
    expect(spendSpherePoint(state, first.id, "Flow")).toBe(true);
    expect(spendSpherePoint(state, first.id, "Flow")).toBe(true);
    expect(connectedSphereBuffMultiplier(state, second.id)).toBe(1.25);

    first.xp = 100;
    expect(spendSpherePoint(state, first.id, "Flow")).toBe(true);
    expect(connectedSphereBuffMultiplier(state, second.id)).toBe(1.4);

    const connection = connectionForSphere(state, first.id)!;
    reverseConnection(state, connection.id);

    expect(connectedSphereBuffMultiplier(state, second.id)).toBe(1);
    expect(connectedSphereBuffMultiplier(state, first.id)).toBe(1);
  });

  it("equips glyphs into sphere slots and applies v1 consistency effects", () => {
    vi.useFakeTimers();
    setNow("2026-05-08T12:00:00.000Z");
    const state = createInitialState();
    const sphere = createDomainSphere(state, "Study", "#38bdf8", 20)!;

    expect(sphere.glyphSlotCount).toBe(1);
    expect(equipGlyph(state, "glyph_streak", sphere.id)).toBe(true);
    expect(equippedGlyphsForSphere(state, sphere.id).map((glyph) => glyph.effect)).toEqual([
      "streak",
    ]);
    expect(equipGlyph(state, "glyph_deep_work", sphere.id)).toBe(false);

    sphere.currentStreak = 10;
    const baseActive = routedSphereRates(state, sphere).activePerMinute;
    expect(baseActive).toBeCloseTo(8.505);

    sphere.xp = 45;
    state.activeSession = {
      id: "session_slot",
      sphereId: sphere.id,
      ritualId: sphere.activeRitualId,
      startedAt: "2026-05-08T11:59:00.000Z",
    };
    finishActiveSession(state);
    sphere.glyphSlotCount = 2;
    expect(equipGlyph(state, "glyph_deep_work", sphere.id)).toBe(true);
    expect(unequipGlyph(state, "glyph_streak")).toBe(true);
    expect(equippedGlyphsForSphere(state, sphere.id).map((glyph) => glyph.effect)).toEqual([
      "deep-work",
    ]);

    state.activeSession = {
      id: "session_deep",
      sphereId: sphere.id,
      ritualId: sphere.activeRitualId,
      startedAt: "2026-05-08T11:30:00.000Z",
    };
    const result = finishActiveSession(state)!;
    expect(result.activeEnergy).toBeCloseTo(1017.36);

    vi.useRealTimers();
  });

  it("keeps glyph state intact when moving to a full sphere fails", () => {
    const state = createInitialState();
    state.game.energy = 100;
    const source = createDomainSphere(state, "Study", "#38bdf8", 20)!;
    const target = createDomainSphere(state, "Move", "#f97316", 20)!;

    expect(equipGlyph(state, "glyph_streak", source.id)).toBe(true);
    expect(equipGlyph(state, "glyph_deep_work", target.id)).toBe(true);
    expect(equipGlyph(state, "glyph_streak", target.id)).toBe(false);

    expect(state.glyphs.find((glyph) => glyph.id === "glyph_streak")?.equippedSphereId).toBe(
      source.id,
    );
    expect(source.equippedGlyphIds).toEqual(["glyph_streak"]);
    expect(target.equippedGlyphIds).toEqual(["glyph_deep_work"]);
  });

  it("resolves stacked progression modifiers for sphere and routing calculations", () => {
    const state = createInitialState();
    const sphere = createDomainSphere(state, "Study", "#38bdf8", 20)!;
    sphere.xp = 100;

    expect(spendSpherePoint(state, sphere.id, "Flow")).toBe(true);
    expect(spendSpherePoint(state, sphere.id, "Flow")).toBe(true);
    expect(spendSpherePoint(state, sphere.id, "Bloom")).toBe(true);
    expect(equipGlyph(state, "glyph_amplify", sphere.id)).toBe(true);
    sphere.glyphSlotCount = 2;
    expect(equipGlyph(state, "glyph_store", sphere.id)).toBe(true);

    const resolution = resolveProgressionModifiers(state, { sphereId: sphere.id });

    expect(resolution.effects).toHaveLength(5);
    expect(resolution.totals.outputMultiplierBonus).toBeCloseTo(0.15);
    expect(resolution.totals.routingLossReduction).toBeCloseTo(0.05);
    expect(resolution.totals.milestoneBloomMultiplierBonus).toBeCloseTo(0.1);
    expect(resolution.totals.chargeStoreShare).toBeCloseTo(0.05);
    expect(routedSphereRates(state, sphere).activePerMinute).toBeCloseTo(37.26);
  });

  it("levels domain spheres from XP and grants sphere-specific path points", () => {
    vi.useFakeTimers();
    setNow("2026-05-08T12:00:00.000Z");
    const state = createInitialState();
    const sphere = createDomainSphere(state, "Study", "#38bdf8", 20)!;
    state.game.energy = 100;
    const otherSphere = createDomainSphere(state, "Music", "#7dd3fc", 20)!;

    state.activeSession = {
      id: "session_level",
      sphereId: sphere.id,
      ritualId: sphere.activeRitualId,
      startedAt: "2026-05-08T11:45:00.000Z",
    };

    const result = finishActiveSession(state)!;

    expect(result.xpGained).toBe(15);
    expect(sphere.xp).toBe(15);
    expect(sphere.level).toBe(2);
    expect(sphere.availablePoints).toBe(1);
    expect(otherSphere.xp).toBe(0);
    expect(otherSphere.level).toBe(1);
    expect(otherSphere.availablePoints).toBe(0);
    expect(state.game.experience).toBe(0);
    expect(state.game.lifetimeExperience).toBe(0);
    expect(spendSpherePoint(state, sphere.id, "Flow")).toBe(true);
    expect(sphere.availablePoints).toBe(0);
    expect(sphere.pathAllocations).toEqual([{ path: "Flow", rank: 1 }]);
    expect(routedSphereRates(state, sphere).activePerMinute).toBeGreaterThan(16.2);

    vi.useRealTimers();
  });

  it("applies return momentum only after 24 hours of inactivity", () => {
    vi.useFakeTimers();
    setNow("2026-05-09T00:10:00.000Z");
    const state = createInitialState();
    const sphere = createDomainSphere(state, "Study", "#38bdf8", 60)!;
    sphere.xp = 100;
    expect(spendSpherePoint(state, sphere.id, "Anchor")).toBe(true);
    expect(spendSpherePoint(state, sphere.id, "Anchor")).toBe(true);
    expect(spendSpherePoint(state, sphere.id, "Anchor")).toBe(true);
    sphere.momentum = 10;
    sphere.lastSessionAt = "2026-05-08T23:50:00.000Z";
    state.activeSession = {
      id: "session_cross_midnight",
      sphereId: sphere.id,
      ritualId: sphere.activeRitualId,
      startedAt: "2026-05-09T00:05:00.000Z",
    };

    const recentReturn = finishActiveSession(state)!;

    expect(recentReturn.momentumAfter).toBe(15);

    setNow("2026-05-10T00:20:00.000Z");
    sphere.momentum = 10;
    sphere.todaySeconds = 0;
    sphere.dailyProgressDate = localDateKey();
    sphere.lastSessionAt = "2026-05-09T00:10:00.000Z";
    state.activeSession = {
      id: "session_after_inactivity",
      sphereId: sphere.id,
      ritualId: sphere.activeRitualId,
      startedAt: "2026-05-10T00:15:00.000Z",
    };

    const inactiveReturn = finishActiveSession(state)!;

    expect(inactiveReturn.momentumAfter).toBe(25);

    vi.useRealTimers();
  });

  it("applies bloom spillover and release glyph effects", () => {
    vi.useFakeTimers();
    setNow("2026-05-08T12:00:00.000Z");
    const state = createInitialState();
    const source = createDomainSphere(state, "Study", "#38bdf8", 20)!;
    state.game.energy = 500;
    const neighbor = createDomainSphere(state, "Music", "#7dd3fc", 20)!;
    routeConnectionToSphere(state, source.id, neighbor.id);

    source.xp = 45;
    expect(spendSpherePoint(state, source.id, "Bloom")).toBe(true);
    expect(spendSpherePoint(state, source.id, "Bloom")).toBe(true);
    state.activeSession = {
      id: "session_bloom_spillover",
      sphereId: source.id,
      ritualId: source.activeRitualId,
      startedAt: "2026-05-08T11:40:00.000Z",
    };

    const bloomResult = finishActiveSession(state)!;
    expect(bloomResult.milestoneEnergy).toBeCloseTo(44);
    expect(
      bloomResult.energyGained - bloomResult.activeEnergy - bloomResult.milestoneEnergy,
    ).toBeCloseTo(2.2);

    source.charge = 80;
    expect(equipGlyph(state, "glyph_release", source.id)).toBe(true);
    setNow("2026-05-08T12:10:00.000Z");
    state.activeSession = {
      id: "session_release_glyph",
      sphereId: source.id,
      ritualId: source.activeRitualId,
      startedAt: "2026-05-08T12:05:00.000Z",
    };

    const releaseResult = finishActiveSession(state)!;
    expect(
      releaseResult.energyGained - releaseResult.activeEnergy - releaseResult.milestoneEnergy,
    ).toBeCloseTo(20);
    expect(source.charge).toBeCloseTo(60);

    vi.useRealTimers();
  });

  it("gates additional sphere slots behind escalating energy costs while first sphere is free", () => {
    const state = createInitialState();

    expect(sphereSlotCost(state)).toBe(0);
    expect(createDomainSphere(state, "Study", "#38bdf8", 20)).not.toBeNull();
    expect(state.game.energy).toBe(0);

    const secondSlotCost = sphereSlotCost(state);
    expect(secondSlotCost).toBe(100);
    expect(createDomainSphere(state, "Health", "#22c55e", 30)).toBeNull();
    expect(domainSpheres(state)).toHaveLength(1);

    state.game.energy = secondSlotCost;
    expect(createDomainSphere(state, "Health", "#22c55e", 30)).not.toBeNull();
    expect(state.game.energy).toBe(0);
    expect(sphereSlotCost(state)).toBeGreaterThan(secondSlotCost);
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

  it("edits and archives rituals while preserving ritual history", () => {
    vi.useFakeTimers();
    setNow("2026-05-08T12:00:00.000Z");
    const state = createInitialState();
    createDomainSphere(state, "Music", "#38bdf8", 20);
    const sphere = state.spheres.find((item) => item.kind === "domain")!;
    const defaultRitualId = sphere.activeRitualId!;
    const ritual = createRitual(state, sphere.id, "Scales", 10)!;
    state.sessions.unshift({
      id: "session_scales",
      sphereId: sphere.id,
      ritualId: ritual.id,
      startedAt: "2026-05-08T11:30:00.000Z",
      endedAt: "2026-05-08T11:40:00.000Z",
      durationSeconds: 600,
      completedMilestoneAfterSession: false,
      createdAt: "2026-05-08T11:30:00.000Z",
      updatedAt: "2026-05-08T11:40:00.000Z",
    });

    expect(updateRitual(state, ritual.id, "Arpeggios", null)).toBe(true);
    expect(ritual.name).toBe("Arpeggios");
    expect(ritual.targetMinutes).toBeNull();
    expect(recentSessionsForRitual(state, ritual.id)).toHaveLength(1);
    expect(archiveRitual(state, ritual.id)).toBe(true);

    expect(ritual.archivedAt).toBe("2026-05-08T12:00:00.000Z");
    expect(activeRitualsForSphere(state, sphere.id).map((item) => item.id)).toEqual([
      defaultRitualId,
    ]);
    expect(sphere.activeRitualId).toBe(defaultRitualId);
    expect(state.sessions[0]?.ritualId).toBe(ritual.id);
    expect(setActiveRitual(state, sphere.id, ritual.id)).toBe(false);

    vi.useRealTimers();
  });

  it("archives spheres without deleting historical sessions", () => {
    vi.useFakeTimers();
    setNow("2026-05-08T12:00:00.000Z");
    const state = createInitialState();
    createDomainSphere(state, "Retired", "#38bdf8", 20);
    const sphere = state.spheres.find((item) => item.kind === "domain")!;
    state.sessions.unshift({
      id: "session_history",
      sphereId: sphere.id,
      ritualId: sphere.activeRitualId,
      startedAt: "2026-05-08T11:30:00.000Z",
      endedAt: "2026-05-08T11:50:00.000Z",
      durationSeconds: 1200,
      completedMilestoneAfterSession: true,
      createdAt: "2026-05-08T11:30:00.000Z",
      updatedAt: "2026-05-08T11:50:00.000Z",
    });

    expect(archiveDomainSphere(state, sphere.id)).toBe(true);

    expect(sphere.archivedAt).toBe("2026-05-08T12:00:00.000Z");
    expect(domainSpheres(state)).toEqual([]);
    expect(state.sessions[0]?.sphereId).toBe(sphere.id);
    expect(state.spheres.find((item) => item.id === sphere.id)?.name).toBe("Retired");
    expect(startSession(state, sphere.id)).toBeUndefined();
    expect(state.activeSession).toBeNull();
    expect(state.connections.every((connection) => !connection.active)).toBe(true);

    vi.useRealTimers();
  });

  it("does not archive a sphere with an active session", () => {
    const state = createInitialState();
    createDomainSphere(state, "Active", "#38bdf8", 20);
    const sphere = state.spheres.find((item) => item.kind === "domain")!;
    startSession(state, sphere.id);

    expect(archiveDomainSphere(state, sphere.id)).toBe(false);
    expect(sphere.archivedAt).toBeNull();
    expect(domainSpheres(state)).toContain(sphere);
  });

  it("resets daily progress and gently decays momentum when a partial day missed its milestone", () => {
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
    expect(sphere!.momentum).toBe(32);

    vi.useRealTimers();
  });

  it("decays missed days without harsh resets when returning after a gap", () => {
    vi.useFakeTimers();
    setNow("2026-05-08T12:00:00.000Z");
    const state = createInitialState();
    createDomainSphere(state, "Health", "#22c55e", 20);
    const sphere = state.spheres.find((item) => item.kind === "domain")!;
    sphere.dailyProgressDate = "2026-05-01";
    sphere.milestoneCompletedDate = null;
    sphere.todaySeconds = 0;
    sphere.momentum = 80;

    ensureToday(state);

    expect(sphere.dailyProgressDate).toBe("2026-05-08");
    expect(sphere.todaySeconds).toBe(0);
    expect(sphere.momentum).toBe(50);

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

  it("adds missing starter glyphs when importing older saved states", () => {
    const state = createInitialState();
    const backup = JSON.parse(createBackupJson(state)) as {
      state: ReturnType<typeof createInitialState>;
    };
    backup.state.glyphs = backup.state.glyphs.filter((glyph) =>
      ["glyph_streak", "glyph_recent_consistency", "glyph_deep_work"].includes(glyph.id),
    );

    const restored = parseBackupState(JSON.stringify(backup));

    expect(restored.glyphs.map((glyph) => glyph.id)).toEqual(
      expect.arrayContaining([
        "glyph_streak",
        "glyph_amplify",
        "glyph_store",
        "glyph_release",
        "glyph_bloom",
        "glyph_echo",
        "glyph_kindle",
      ]),
    );
  });

  it("defaults progression v0.2 fields when importing old saved states", () => {
    const state = createInitialState();
    const sphere = createDomainSphere(state, "Legacy", "#38bdf8", 20)!;
    sphere.xp = 45;
    sphere.pathAllocations = [{ path: "Flow", rank: 1 }];
    const connection = connectionForSphere(state, sphere.id)!;
    const backup = JSON.parse(createBackupJson(state)) as { state: Record<string, any> };

    delete backup.state.game.corePowerLevel;
    delete backup.state.game.coreUpgrades;
    delete backup.state.game.glyphForgeCount;
    delete backup.state.spheres[1].spherePointsEarned;
    delete backup.state.spheres[1].spherePointsSpent;
    delete backup.state.spheres[1].upgradePurchases;
    delete backup.state.spheres[1].glyphSlots;
    delete backup.state.connections[0].enabled;
    delete backup.state.connections[0].allocationPercent;
    delete backup.state.connections[0].level;
    delete backup.state.connections[0].throughputMultiplier;
    delete backup.state.connections[0].routingLoss;
    delete backup.state.connections[0].mode;
    delete backup.state.glyphs[0].definitionId;
    delete backup.state.glyphs[0].rarity;
    delete backup.state.glyphs[0].level;

    const restored = parseBackupState(JSON.stringify(backup));
    const restoredSphere = restored.spheres.find((item) => item.id === sphere.id)!;
    const restoredConnection = restored.connections.find((item) => item.id === connection.id)!;

    expect(restored.game.corePowerLevel).toBe(1);
    expect(restored.game.coreUpgrades).toEqual([]);
    expect(restored.game.glyphForgeCount).toBe(0);
    expect(restoredSphere.spherePointsEarned).toBe(2);
    expect(restoredSphere.spherePointsSpent).toBe(1);
    expect(restoredSphere.availablePoints).toBe(1);
    expect(restoredSphere.upgradePurchases).toEqual([]);
    expect(restoredSphere.glyphSlots).toHaveLength(1);
    expect(restoredConnection.enabled).toBe(true);
    expect(restoredConnection.allocationPercent).toBe(100);
    expect(restoredConnection.level).toBe(1);
    expect(restoredConnection.mode).toBe("manual");
    expect(restored.glyphs[0]).toMatchObject({
      definitionId: restored.glyphs[0]!.id,
      rarity: "common",
      level: 1,
    });
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
