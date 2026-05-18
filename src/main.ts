import "./style.css";
import {
  type AppState,
  type Session,
  type Sphere,
  type SpherePath,
  centerSphereId,
} from "./domain.ts";
import {
  activeRitualsForSphere,
  applyPassiveProduction,
  archiveDomainSphere,
  archiveRitual,
  canUnlockSphereSlot,
  centerRecoveryMultiplier,
  corePowerCost,
  corePowerProgress,
  createDomainSphere,
  createRitual,
  domainSpheres,
  ensureToday,
  equipGlyph,
  equippedGlyphsForSphere,
  finishActiveSession,
  formatDuration,
  formatMinutes,
  getRitual,
  connectionForSphere,
  reverseConnection,
  routeConnectionToSphere,
  routedSphereRates,
  setActiveRitual,
  sphereSlotCost,
  pathRank,
  purchaseCorePower,
  respecSphere,
  spendSpherePoint,
  spherePaths,
  talentDefinitions,
  maxChargeForSphere,
  xpLevelThresholds,
  toggleConnection,
  startSession,
  unequipGlyph,
  updateDomainSphere,
  updateRitual,
} from "./game.ts";
import { createBackupJson, loadState, parseBackupState, resetState, saveState } from "./storage.ts";

const app = document.querySelector<HTMLDivElement>("#app")!;
let state: AppState = await loadState();

type CompletionFeedback = {
  sphereId: string;
  durationSeconds: number;
  energyGained: number;
  activeEnergy: number;
  milestoneEnergy: number;
  xpGained: number;
  completedMilestone: boolean;
};

type FocusLayer = "activity" | "game";
type LatticePanel = "growth" | "route" | "glyphs";

let focusLayer: FocusLayer = "activity";
let latticePanel: LatticePanel = "growth";
let selectedSphereId: string | null = null;
let lastReward: string | null = null;
let lastCompletion: CompletionFeedback | null = null;
let timerCompletedSessionId: string | null = null;
let isCreatingSphere = false;
let editingSphereId: string | null = null;
let creatingRitualForSphereId: string | null = null;
let editingRitualId: string | null = null;
let isSettingsOpen = false;

const backupInputId = "backup-import-input";
const round = (value: number) => Math.floor(value).toLocaleString();
const oneDecimal = (value: number) => value.toFixed(1).replace(/\.0$/, "");
const percent = (value: number) => `${Math.round(value)}%`;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const formatSessionTime = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
const activeElapsedSeconds = () =>
  state.activeSession
    ? Math.floor((Date.now() - new Date(state.activeSession.startedAt).getTime()) / 1000)
    : 0;
const liveTodaySeconds = (sphere: Sphere) =>
  state.activeSession?.sphereId === sphere.id
    ? sphere.todaySeconds + activeElapsedSeconds()
    : sphere.todaySeconds;
const persistState = () => {
  void saveState(state).catch((error: unknown) => {
    console.error("Unable to save Snowball state", error);
  });
};

const sphereProgress = (sphere: Sphere) => {
  if (sphere.dailyTargetMinutes <= 0) return 0;
  return Math.min(100, (liveTodaySeconds(sphere) / (sphere.dailyTargetMinutes * 60)) * 100);
};

const dailyState = (sphere: Sphere) => {
  if (sphere.milestoneCompletedDate === sphere.dailyProgressDate) return "done";
  const progress = sphereProgress(sphere);
  if (state.activeSession?.sphereId === sphere.id && progress >= 100) return "target ready";
  if (progress >= 70) return "70%+";
  if (progress > 0) return "active";
  if (sphere.momentum < 35) return "low";
  return "idle";
};

const spherePosition = (index: number, total: number) => {
  if (total <= 1) return { x: 50, y: 76 };
  const angle = (-90 + (index * 360) / total) * (Math.PI / 180);
  const radius = total <= 4 ? 33 : total <= 7 ? 36 : 38;
  const verticalSquash = total >= 8 ? 0.84 : 0.9;
  return { x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius * verticalSquash };
};

const activeDomainSpheres = () => domainSpheres(state);
const pathLabel = (path: SpherePath) => (path === "Bloom" ? "Target" : path);
const nextLevelXp = (sphere: Sphere) => xpLevelThresholds[sphere.level] ?? null;
const levelProgressCopy = (sphere: Sphere) => {
  const nextXp = nextLevelXp(sphere);
  return nextXp
    ? `Level ${sphere.level}, ${oneDecimal(Math.max(0, nextXp - sphere.xp))} XP to level ${sphere.level + 1}`
    : `Level ${sphere.level}, max shown track`;
};
const centerUpgradeCopy = () =>
  `Core Power ${state.game.corePowerLevel + 1}: cost floor(120 × ${state.game.corePowerLevel}^1.65) = ${round(corePowerCost(state.game.corePowerLevel))}. Gives rest multiplier +0.05 and expands the global lattice spine.`;
const selectedSphere = () => {
  const spheres = activeDomainSpheres();
  const candidate = state.spheres.find(
    (sphere) => sphere.id === selectedSphereId && !sphere.archivedAt,
  );
  if (candidate) return candidate;
  return spheres[0] ?? state.spheres.find((sphere) => sphere.id === centerSphereId) ?? null;
};

const renderCreateOrEditSphereForm = (sphere: Sphere | null) => {
  const isFirstRun = !sphere && activeDomainSpheres().length === 0;
  const slotCost = sphereSlotCost(state);
  const canUnlock = canUnlockSphereSlot(state);
  return `
    <section class="form-panel" role="dialog" aria-labelledby="sphere-form-title">
      <p class="kicker">${sphere ? "Edit" : isFirstRun ? "First node" : "New node"}</p>
      <h1 id="sphere-form-title">${sphere ? sphere.name : isFirstRun ? "Add node" : "Add node"}</h1>
      <p class="lede">${
        sphere
          ? "Name, target, color."
          : isFirstRun
            ? "Pick one domain. Start immediately."
            : `Cost: ${round(slotCost)} energy.`
      }</p>
      <form id="${sphere ? "edit-sphere-form" : "create-sphere-form"}" class="sphere-form" ${sphere ? `data-sphere-id="${sphere.id}"` : ""}>
        <label>Name<input name="name" autocomplete="off" placeholder="Music" required maxlength="32" value="${sphere?.name ?? ""}" /></label>
        <label>Daily target<div class="inline-input"><input name="target" type="number" min="1" max="240" value="${sphere?.dailyTargetMinutes ?? 20}" required /><span>min</span></div></label>
        <label>Color<input name="color" type="color" value="${sphere?.color ?? "#8bd8ff"}" /></label>
        <div class="form-actions">
          ${sphere ? `<button type="button" class="quiet danger" data-action="archive-sphere" data-sphere-id="${sphere.id}">Archive</button>` : ""}
          ${isFirstRun ? "" : `<button type="button" class="quiet" data-action="${sphere ? "cancel-edit-sphere" : "cancel-create-sphere"}">Cancel</button>`}
          <button type="submit" ${!sphere && !canUnlock ? "disabled" : ""}>${sphere ? "Save" : isFirstRun ? "Create" : `Spend ${round(slotCost)}`}</button>
        </div>
      </form>
    </section>`;
};

const renderRitualForm = (sphere: Sphere) => `
  <section class="form-panel" role="dialog" aria-labelledby="ritual-form-title">
    <p class="kicker">${sphere.name}</p>
    <h1 id="ritual-form-title">Add action</h1>
    <p class="lede">Quick start for this node.</p>
    <form id="create-ritual-form" class="sphere-form" data-sphere-id="${sphere.id}">
      <label>Name<input name="name" autocomplete="off" placeholder="Guitar" required maxlength="36" /></label>
      <label>Target<div class="inline-input"><input name="target" type="number" min="1" max="240" placeholder="Open" /><span>min</span></div></label>
      <div class="form-actions"><button type="button" class="quiet" data-action="cancel-create-ritual">Cancel</button><button type="submit">Add</button></div>
    </form>
  </section>`;

const renderEditRitualForm = (ritualId: string) => {
  const ritual = getRitual(state, ritualId);
  const sphere = ritual ? state.spheres.find((item) => item.id === ritual.sphereId) : null;
  if (!ritual || ritual.archivedAt || !sphere) return "";
  return `
  <section class="form-panel" role="dialog" aria-labelledby="edit-ritual-title">
    <p class="kicker">${sphere.name}</p>
    <h1 id="edit-ritual-title">Edit action</h1>
    <form id="edit-ritual-form" class="sphere-form" data-ritual-id="${ritual.id}">
      <label>Name<input name="name" autocomplete="off" required maxlength="36" value="${ritual.name}" /></label>
      <label>Target<div class="inline-input"><input name="target" type="number" min="1" max="240" placeholder="Open" value="${ritual.targetMinutes ?? ""}" /><span>min</span></div></label>
      <div class="form-actions"><button type="button" class="quiet danger" data-action="archive-ritual" data-ritual-id="${ritual.id}">Archive</button><button type="button" class="quiet" data-action="cancel-edit-ritual">Cancel</button><button type="submit">Save</button></div>
    </form>
  </section>`;
};

const renderOnboarding = () => {
  app.innerHTML = `
    <main class="onboarding-shell">
      <div class="onboarding-sigil" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
      ${renderCreateOrEditSphereForm(null)}
    </main>`;
};

const renderConnectionLines = (spheres: Sphere[], totalSlots: number) => {
  const positionForSphere = (sphereId: string) => {
    if (sphereId === centerSphereId) return { x: 50, y: 50 };
    const index = spheres.findIndex((sphere) => sphere.id === sphereId);
    return index >= 0 ? spherePosition(index, totalSlots) : null;
  };

  return state.connections
    .filter((connection) => connection.active)
    .map((connection) => {
      const source = state.spheres.find((sphere) => sphere.id === connection.fromSphereId);
      const from = positionForSphere(connection.fromSphereId);
      const to = positionForSphere(connection.toSphereId);
      if (!source || !from || !to) return "";
      const isFlowing = state.activeSession?.sphereId === connection.fromSphereId;
      const completed = source.milestoneCompletedDate === source.dailyProgressDate;
      return `<g class="lattice-connection ${isFlowing ? "is-flowing" : ""} ${completed ? "is-complete" : ""}" style="--sphere-color: ${source.color}; --momentum: ${Math.round(source.momentum)}">
        <line class="route-line route-shadow" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />
        <line class="route-line" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />
        <circle class="flow-particle" r="0.9" cx="${from.x}" cy="${from.y}"><animateMotion dur="${Math.max(1.2, 3.2 - source.momentum / 48).toFixed(1)}s" repeatCount="indefinite" path="M 0 0 L ${to.x - from.x} ${to.y - from.y}" /></circle>
      </g>`;
    })
    .join("");
};

const renderDomainSphere = (sphere: Sphere, index: number, totalSlots: number) => {
  const progress = sphereProgress(sphere);
  const position = spherePosition(index, totalSlots);
  const ritual = getRitual(state, sphere.activeRitualId);
  const completion = lastCompletion?.sphereId === sphere.id ? lastCompletion : null;
  const isSelected = selectedSphere()?.id === sphere.id;
  const isActive = state.activeSession?.sphereId === sphere.id;
  return `
    <button class="sigil-node domain-node ${isSelected ? "is-selected" : ""} ${isActive ? "is-active" : ""} ${completion?.completedMilestone ? "just-bloomed" : ""}" data-action="select-sphere" data-sphere-id="${sphere.id}" aria-label="${sphere.name}: ${percent(progress)} target, ${Math.round(sphere.momentum)} percent momentum" style="--sphere-color: ${sphere.color}; --progress: ${progress}%; --momentum: ${Math.round(sphere.momentum)}; --x: ${position.x}%; --y: ${position.y}%">
      <span class="node-ring"></span>
      <span class="node-core"><span>${sphere.name}</span><small>${dailyState(sphere)}</small></span>
      <span class="node-ritual">${ritual?.name ?? "Start"}</span>
    </button>`;
};

const renderLockedSlot = (index: number, total: number, cost: number) => {
  const position = spherePosition(index, total);
  return `<button class="sigil-node locked-node" data-action="show-create-sphere" aria-label="Locked sphere slot costs ${round(cost)} energy" style="--x: ${position.x}%; --y: ${position.y}%"><span class="node-core"><span>+</span><small>${round(cost)}</small></span></button>`;
};

const renderSigil = (spheres: Sphere[]) => {
  const totalSlots = Math.min(10, spheres.length + 1);
  const center = state.spheres.find((sphere) => sphere.id === centerSphereId)!;
  const nextSlotCost = sphereSlotCost(state);
  const canUnlockSlot = canUnlockSphereSlot(state);
  return `
    <section class="sigil-stage" aria-label="Your sphere sigil">
      <div class="sigil-orbits" aria-hidden="true"><span></span><span></span><span></span></div>
      <svg class="connection-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${renderConnectionLines(spheres, totalSlots)}</svg>
      <button class="sigil-node center-node ${selectedSphere()?.id === centerSphereId ? "is-selected" : ""}" data-action="select-sphere" data-sphere-id="${centerSphereId}" aria-label="Center recovery node" style="--sphere-color: ${center.color}; --momentum: ${Math.round(center.momentum)}; --progress: ${sphereProgress(center)}%">
        <span class="node-ring"></span><span class="node-core"><span>0</span><small>rest</small></span>
      </button>
      ${spheres.map((sphere, index) => renderDomainSphere(sphere, index, totalSlots)).join("")}
      ${spheres.length < 10 && canUnlockSlot ? renderLockedSlot(spheres.length, totalSlots, nextSlotCost) : ""}
      ${lastCompletion ? renderCompletionFeedback(lastCompletion) : ""}
    </section>`;
};

const projectedActiveEnergy = () => {
  const active = state.activeSession;
  if (!active) return 0;
  const sphere = state.spheres.find((item) => item.id === active.sphereId);
  if (!sphere) return 0;
  const minutes = activeElapsedSeconds() / 60;
  const rate =
    sphere.kind === "domain"
      ? routedSphereRates(state, sphere).activePerMinute
      : centerRecoveryMultiplier(state);
  return minutes * rate;
};

const renderEconomyDock = (spheres: Sphere[]) => {
  const passiveRate = spheres.reduce(
    (sum, sphere) => sum + routedSphereRates(state, sphere).passivePerHour,
    0,
  );
  const active = state.activeSession
    ? state.spheres.find((sphere) => sphere.id === state.activeSession?.sphereId)
    : null;
  const activeRate = active
    ? active.kind === "domain"
      ? routedSphereRates(state, active).activePerMinute
      : centerRecoveryMultiplier(state)
    : 0;
  const currentGain = active
    ? `${oneDecimal(activeRate + passiveRate / 60)}/m`
    : `${oneDecimal(passiveRate)}/h`;
  return `
    <aside class="economy-dock" aria-label="Snowball economy">
      <div><span>Energy</span><strong>${round(state.game.energy + projectedActiveEnergy())}</strong></div>
      <div><span>Gain</span><strong>+${currentGain}</strong></div>
      <div><span>Idle</span><strong>${round(passiveRate)}/h</strong></div>
      <div class="active-chip ${active ? "" : "is-idle"}"><span>Active</span><strong>${active?.name ?? "None"}</strong></div>
    </aside>`;
};

const renderSphereFocus = (sphere: Sphere | null) => {
  if (!sphere) return "";
  const progress = sphereProgress(sphere);
  const rates =
    sphere.kind === "domain"
      ? routedSphereRates(state, sphere)
      : { activePerMinute: centerRecoveryMultiplier(state), passivePerHour: 0 };
  const milestoneDone = sphere.milestoneCompletedDate === sphere.dailyProgressDate;
  return `
    <section class="focus-panel" style="--sphere-color: ${sphere.color}">
      <div class="focus-heading"><p class="kicker">${sphere.kind === "center" ? "Rest" : dailyState(sphere)}</p><h1>${sphere.name}</h1></div>
      ${renderLayerTabs(sphere)}
      ${
        focusLayer === "activity"
          ? `<div class="sphere-layer sphere-activity-layer">
              <div class="progress-lens" aria-label="${percent(progress)} daily target"><span style="--progress: ${progress}%"></span><strong>${milestoneDone ? "Done" : percent(progress)}</strong><small>${formatMinutes(liveTodaySeconds(sphere))} / ${sphere.dailyTargetMinutes}m</small></div>
              <dl class="focus-stats"><div><dt>Momentum</dt><dd>${Math.round(sphere.momentum)}%</dd></div><div><dt>Level</dt><dd>${sphere.level}</dd></div><div><dt>${sphere.kind === "domain" ? "Pts" : "Gain"}</dt><dd>${sphere.kind === "domain" ? sphere.availablePoints : `${rates.activePerMinute.toFixed(1)}/m`}</dd></div></dl>
              <p class="mechanic-line">${sphere.kind === "domain" ? `Progress = today minutes ÷ ${sphere.dailyTargetMinutes}m. ${levelProgressCopy(sphere)}.` : `Rest energy = minutes × ${centerRecoveryMultiplier(state).toFixed(2)}. Rest also raises every node's momentum by 1 to 4.`}</p>
              <div class="panel-actions">${sphere.kind === "domain" ? `<button class="quiet icon-button" data-action="show-edit-sphere" data-sphere-id="${sphere.id}" aria-label="Edit ${sphere.name}" title="Edit">✎</button>` : ""}</div>
              ${renderSphereTraces(sphere)}
            </div>`
          : renderSphereGameLayer(sphere)
      }
    </section>`;
};

const renderSphereTraces = (sphere: Sphere) => {
  const sessions = state.sessions.filter((session) => session.sphereId === sphere.id).slice(0, 5);
  return `<section class="sphere-traces" aria-label="Recent ${sphere.name} traces"><div class="layer-section-title"><span>Log</span><strong>${sessions.length}</strong></div>${
    sessions.length > 0
      ? `<ol class="compact-trace-list">${sessions.map(renderSessionHistoryItem).join("")}</ol>`
      : `<p class="empty-history">No runs yet.</p>`
  }</section>`;
};

const renderSphereGameLayer = (sphere: Sphere) => {
  const coreProgress = corePowerProgress(state);
  const canAffordCorePower = state.game.energy >= coreProgress.cost;
  const rates =
    sphere.kind === "domain"
      ? routedSphereRates(state, sphere)
      : { activePerMinute: centerRecoveryMultiplier(state), passivePerHour: 0 };
  const connection = connectionForSphere(state, sphere.id);
  const routedTo = connection
    ? state.spheres.find((item) => item.id === connection.toSphereId)?.name
    : null;
  const equippedGlyphs = equippedGlyphsForSphere(state, sphere.id);
  const availableGlyphs = state.glyphs.filter((glyph) => !glyph.equippedSphereId);
  const routeOptions = [
    { id: centerSphereId, name: "Center" },
    ...activeDomainSpheres()
      .filter((item) => item.id !== sphere.id)
      .map((item) => ({ id: item.id, name: item.name })),
  ];
  const availablePanels = sphere.kind === "domain" ? ["growth", "route", "glyphs"] : ["growth"];
  if (!availablePanels.includes(latticePanel)) latticePanel = "growth";
  const panelNav =
    sphere.kind === "domain"
      ? `<nav class="lattice-menu" aria-label="Game menus"><button class="${latticePanel === "growth" ? "is-selected" : ""}" data-action="set-lattice-panel" data-panel="growth"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 14V5" /><path d="M8 5L4 9" /><path d="M8 5l4 4" /><path d="M3 3h10" /></svg><span>Up</span></button><button class="${latticePanel === "route" ? "is-selected" : ""}" data-action="set-lattice-panel" data-panel="route"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8h8" /><path d="M10 8l-3-3" /><path d="M10 8l-3 3" /><circle cx="13" cy="8" r="2" /></svg><span>Route</span></button><button class="${latticePanel === "glyphs" ? "is-selected" : ""}" data-action="set-lattice-panel" data-panel="glyphs"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1l1.8 5H15l-4.2 3.2 1.6 5L8 11l-4.4 3.2 1.6-5L1 6h5.2z" /></svg><span>Mods</span></button></nav>`
      : "";
  const activePanel =
    sphere.kind === "center"
      ? `<section class="lattice-section"><div class="lattice-section-copy"><span>Center · Core Power ${state.game.corePowerLevel}</span><p>${centerUpgradeCopy()}</p><small>${round(state.game.energy)} / ${round(coreProgress.cost)} Energy · ${Math.round(coreProgress.percent)}% ready</small></div><button class="upgrade-action" data-action="buy-core-power" ${canAffordCorePower ? "" : "disabled"}>Core Power ${state.game.corePowerLevel + 1} · ${round(coreProgress.cost)}</button></section>`
      : latticePanel === "route" && connection
        ? `<section class="lattice-section route-row"><div class="lattice-section-copy"><span>Route</span><p>${connection.active ? `To ${routedTo ?? "node"}. Active route boosts target output 1.25×, then applies route loss.` : "Paused, no route boost."}</p><small>Formula: target multiplier = 1.25 + Flow active bonus + Resonance bonus, minus 5% route loss unless target is Center. Flow can reduce that loss.</small></div><label>Target<select data-action="route-connection" data-sphere-id="${sphere.id}">${routeOptions.map((option) => `<option value="${option.id}" ${option.id === connection.toSphereId ? "selected" : ""}>${option.name}</option>`).join("")}</select></label><div class="lattice-actions"><button class="quiet" data-action="toggle-connection" data-connection-id="${connection.id}">${connection.active ? "Pause" : "Run"}</button><button class="quiet" data-action="reverse-connection" data-connection-id="${connection.id}" ${connection.fromSphereId === centerSphereId || connection.toSphereId === centerSphereId ? "disabled" : ""}>Swap</button></div></section>`
        : latticePanel === "glyphs"
          ? `<section class="lattice-section glyph-row"><div class="lattice-section-copy"><span>Mods ${equippedGlyphs.length}/${sphere.glyphSlotCount}</span><p>Slots unlock at levels 1, 4, and 7. Equipped mods alter the formulas below immediately.</p></div>${equippedGlyphs.length > 0 ? `<div class="equipped-glyphs">${equippedGlyphs.map((glyph) => `<button class="glyph-chip" title="${glyph.description}" data-action="unequip-glyph" data-glyph-id="${glyph.id}">${glyph.name} ×</button>`).join("")}</div>` : ""}<label>Add<select data-action="equip-glyph" data-sphere-id="${sphere.id}" ${availableGlyphs.length === 0 || equippedGlyphs.length >= sphere.glyphSlotCount ? "disabled" : ""}><option value="">Choose</option>${availableGlyphs.map((glyph) => `<option value="${glyph.id}">${glyph.name}: ${glyph.description}</option>`).join("")}</select></label></section>`
          : renderProgressionPanel(sphere);
  return `<div class="sphere-layer sphere-game-layer">
    <section class="lattice-summary" aria-label="Game effect for ${sphere.name}">
      <span><b>Run</b> ${rates.activePerMinute.toFixed(1)}/m</span>
      <span><b>Idle</b> ${rates.passivePerHour.toFixed(1)}/h</span>
      <span><b>${sphere.kind === "domain" ? "Pts" : "Rest"}</b> ${sphere.kind === "domain" ? sphere.availablePoints : `×${centerRecoveryMultiplier(state).toFixed(2)}`}</span>
    </section>
    ${sphere.kind === "domain" ? renderMechanicsBrief(sphere, rates.activePerMinute, rates.passivePerHour) : `<p class="mechanic-line">Rest multiplier = 1 + (Core Power - 1) × 0.05. Current: ×${centerRecoveryMultiplier(state).toFixed(2)}. Global XP is retired; Energy now funds Core Power.</p>`}
    ${panelNav}
    ${activePanel}
  </div>`;
};

const renderLayerTabs = (sphere: Sphere | null) => `
  <nav class="layer-tabs" aria-label="${sphere?.name ?? "Sphere"} focus">
    <button class="${focusLayer === "activity" ? "is-selected" : ""}" data-action="set-focus-layer" data-layer="activity" ${sphere ? "" : "disabled"}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.5" /><path d="M8 2.5v-1M8 14.5v-1M2.5 8h-1M14.5 8h-1M4.4 4.4l-.7-.7M12.3 12.3l-.7-.7M4.4 11.6l-.7.7M12.3 3.7l-.7.7" /></svg><span>Today</span></button>
    <button class="${focusLayer === "game" ? "is-selected" : ""}" data-action="set-focus-layer" data-layer="game" ${sphere ? "" : "disabled"}><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2L14 6v4L8 14 2 10V6z" /><path d="M8 6l3 2-3 2-3-2z" /><path d="M2 6l6 4M14 6l-6 4" /></svg><span>Game</span></button>
  </nav>`;

const renderRitualHotbar = (sphere: Sphere, activeRitualId = sphere.activeRitualId) => {
  const rituals = activeRitualsForSphere(state, sphere.id).filter((ritual) => ritual.isFavorite);
  return `<div class="ritual-hotbar" aria-label="${sphere.name} rituals">${rituals
    .map(
      (ritual) =>
        `<span class="ritual-wrap"><button class="ritual-chip ${ritual.id === activeRitualId ? "is-selected" : ""}" data-action="set-active-ritual" data-sphere-id="${sphere.id}" data-ritual-id="${ritual.id}">${ritual.name}${ritual.targetMinutes ? ` · ${ritual.targetMinutes}m` : ""}</button><button class="ritual-edit" data-action="show-edit-ritual" data-ritual-id="${ritual.id}" aria-label="Edit ${ritual.name}">✎</button></span>`,
    )
    .join(
      "",
    )}<button class="ritual-chip add-chip" data-action="show-create-ritual" data-sphere-id="${sphere.id}">+ Action</button></div>`;
};

const renderMechanicsBrief = (sphere: Sphere, activePerMinute: number, passivePerHour: number) => `
  <section class="mechanics-brief" aria-label="${sphere.name} formulas">
    <div><b>Active energy</b><span>minutes × ${activePerMinute.toFixed(1)}/m. Rate = (1 + momentum%) × level × 6 × route/mod bonuses.</span></div>
    <div><b>Idle energy</b><span>${passivePerHour.toFixed(1)}/h. Rate = 0.001 × level × (0.25 + momentum%) × bonuses × 3600.</span></div>
    <div><b>Target reward</b><span>First daily hit gives ${sphere.dailyTargetMinutes} × 2 energy, then Bloom/mod bonuses. Momentum +15.</span></div>
    <div><b>XP and points</b><span>XP = minutes. ${levelProgressCopy(sphere)}. Each level after 1 grants 1 point.</span></div>
  </section>`;

const renderProgressionPanel = (sphere: Sphere) => {
  const nextXp = nextLevelXp(sphere);
  const respecCost = sphere.firstRespecUsed ? 25 * sphere.spentPoints : 0;
  return `<section class="lattice-section progression-panel">
    <div class="lattice-section-copy"><span>Upgrade</span><p>Spend points. Reset later.</p></div>
    <div class="progression-summary"><span>XP ${oneDecimal(sphere.xp)}${nextXp ? ` / ${nextXp}` : ""}</span><span>Pts ${sphere.availablePoints} avail · ${sphere.spherePointsEarned} earned · ${sphere.spherePointsSpent} spent</span><span>Charge ${oneDecimal(sphere.charge)} / ${oneDecimal(maxChargeForSphere(state, sphere))}</span></div>
    <div class="path-grid">${spherePaths
      .map((path) => {
        const rank = pathRank(sphere, path);
        const next = talentDefinitions.find(
          (talent) => talent.path === path && talent.rank === Math.min(3, rank + 1),
        );
        return `<div class="path-column"><div><strong>${pathLabel(path)}</strong><span>${rank}/3</span></div><p>${next?.description ?? "Max."}</p><button class="quiet" data-action="spend-path-point" data-sphere-id="${sphere.id}" data-path="${path}" ${sphere.availablePoints > 0 && rank < 3 ? "" : "disabled"}>${rank < 3 ? "+1" : "Max"}</button></div>`;
      })
      .join("")}</div>
    <button class="quiet" data-action="respec-sphere" data-sphere-id="${sphere.id}" ${sphere.spentPoints > 0 && state.game.energy >= respecCost ? "" : "disabled"}>Reset${respecCost > 0 ? ` · ${round(respecCost)}` : " · free"}</button>
  </section>`;
};

const renderSessionHistoryItem = (session: Session) => {
  const sphere = state.spheres.find((item) => item.id === session.sphereId);
  const ritual = getRitual(state, session.ritualId);
  return `<li class="history-item" style="--sphere-color: ${sphere?.color ?? "oklch(75% 0.14 230)"}"><span class="history-dot"></span><div><strong>${sphere?.name ?? "Archived"}</strong><p>${ritual?.name ?? "Start"} · ${formatDuration(session.durationSeconds)}${session.completedMilestoneAfterSession ? " · done" : ""}</p></div><time>${formatSessionTime(session.startedAt)}</time></li>`;
};

const renderModalLayers = () =>
  `${isCreatingSphere ? `<div class="modal-scrim">${renderCreateOrEditSphereForm(null)}</div>` : ""}${renderEditSphereModal()}${renderRitualModal()}${renderEditRitualModal()}${renderSettingsPanel()}${lastReward ? `<aside class="toast" role="status">${lastReward}</aside>` : ""}`;

const renderSettingsPanel = () =>
  isSettingsOpen
    ? `<div class="modal-scrim settings-scrim"><section class="settings-panel" role="dialog" aria-labelledby="settings-title"><div class="settings-heading"><p class="kicker">Local</p><h1 id="settings-title">Settings</h1><button class="quiet" type="button" data-action="close-settings">Close</button></div><div class="settings-group"><h2>Data</h2><p>Stored in this browser.</p><div class="settings-actions"><button class="quiet" data-action="export-backup">Export</button><button class="quiet" data-action="import-backup">Import</button></div></div><div class="settings-group danger-zone"><h2>Reset</h2><p>Clears nodes, actions, sessions, energy, and sphere progress.</p><button class="quiet danger" data-action="reset">Reset</button></div></section></div>`
    : "";

const renderEditSphereModal = () => {
  if (!editingSphereId) return "";
  const sphere = state.spheres.find(
    (item) => item.id === editingSphereId && item.kind === "domain",
  );
  return sphere ? `<div class="modal-scrim">${renderCreateOrEditSphereForm(sphere)}</div>` : "";
};
const renderRitualModal = () => {
  if (!creatingRitualForSphereId) return "";
  const sphere = state.spheres.find((item) => item.id === creatingRitualForSphereId);
  return sphere ? `<div class="modal-scrim">${renderRitualForm(sphere)}</div>` : "";
};
const renderEditRitualModal = () =>
  editingRitualId ? `<div class="modal-scrim">${renderEditRitualForm(editingRitualId)}</div>` : "";

const renderCompletionFeedback = (feedback: CompletionFeedback) => {
  const sphere = state.spheres.find((item) => item.id === feedback.sphereId);
  return `
  <aside class="session-sheet completion-toast ${feedback.completedMilestone ? "is-bloom" : ""}" style="--sphere-color: ${sphere?.color ?? "oklch(75% 0.14 230)"}; --progress: 100%" role="status" aria-live="polite">
    <div class="session-orb" aria-hidden="true"><span></span></div>
    <div class="session-copy"><p class="kicker">${feedback.completedMilestone ? "Target hit" : "Logged"}</p><h2>${formatDuration(feedback.durationSeconds)}</h2><p>${sphere?.name ?? "Session"}</p></div>
    <div class="reward-grid"><span>XP <b>+${Math.floor(feedback.xpGained)}</b></span><span>Energy <b>+${round(feedback.energyGained)}</b></span>${feedback.completedMilestone ? `<span>Target <b>+${round(feedback.milestoneEnergy)}</b></span>` : ""}</div>
    <button class="quiet" data-action="dismiss-completion">Done</button>
  </aside>`;
};

const renderSessionToolbar = (sphere: Sphere | null) => {
  const active = state.activeSession;
  const toolbarSphere = active ? state.spheres.find((item) => item.id === active.sphereId) : sphere;
  const ritual = active
    ? getRitual(state, active.ritualId)
    : getRitual(state, toolbarSphere?.activeRitualId ?? null);
  const elapsed = activeElapsedSeconds();
  const targetSeconds = active && ritual?.targetMinutes ? ritual.targetMinutes * 60 : null;
  const targetComplete = targetSeconds !== null && elapsed >= targetSeconds;
  if (active && targetComplete) timerCompletedSessionId = active.id;
  const displaySeconds = active
    ? targetSeconds
      ? Math.max(0, targetSeconds - elapsed)
      : elapsed
    : 0;
  const progress =
    active && targetSeconds
      ? clamp((elapsed / targetSeconds) * 100, 0, 100)
      : sphere
        ? sphereProgress(sphere)
        : 0;
  return `
    <section class="session-toolbar ${active ? "is-running" : "is-ready"} ${targetComplete ? "target-complete" : ""}" style="--sphere-color: ${toolbarSphere?.color ?? "oklch(77% 0.15 196)"}; --progress: ${progress}%" aria-label="Session management">
      <div class="session-toolbar-node">
        <span class="toolbar-orb" aria-hidden="true"><span></span></span>
        <div><p class="kicker">${active ? (targetComplete ? "Target hit" : "Running") : "Ready"}</p><strong>${toolbarSphere?.name ?? "Pick node"}</strong><small>${ritual?.name ?? "Start"}${!active && ritual?.targetMinutes ? ` · ${ritual.targetMinutes}m` : ""}</small></div>
      </div>
      ${toolbarSphere ? renderRitualHotbar(toolbarSphere, active ? active.ritualId : toolbarSphere.activeRitualId) : ""}
      <div class="session-toolbar-control">
        ${active ? `<div class="toolbar-timer"><span>${formatDuration(displaySeconds)}</span><small>${targetComplete ? "Target hit" : targetSeconds ? "Down" : "Up"}</small></div><button data-action="finish-session">${targetComplete ? "Log" : "Stop"}</button>` : `<button data-action="start-session" data-sphere-id="${toolbarSphere?.id ?? ""}" ${toolbarSphere ? "" : "disabled"}>${toolbarSphere?.kind === "center" ? "Rest" : "Start"}</button>`}
      </div>
    </section>`;
};

const renderHome = () => {
  ensureToday(state);
  const spheres = activeDomainSpheres();
  const selected = selectedSphere();
  app.innerHTML = `
    <main class="app-shell">
      <header class="app-header">
        <div class="brand-mark">Snowball</div>
        ${renderEconomyDock(spheres)}
        <button class="settings-button quiet" type="button" data-action="open-settings" aria-label="Settings" title="Settings">⚙</button>
      </header>
      ${renderSessionToolbar(selected)}
      <div class="home-grid">${renderSigil(spheres)}${renderSphereFocus(selected)}</div>
      <input id="${backupInputId}" class="visually-hidden" type="file" accept="application/json,.json" />
      ${renderModalLayers()}
    </main>`;
};

const render = () => {
  const restoreWindowScroll = window.scrollY;
  const restoreFocusScroll = document.querySelector<HTMLElement>(".focus-panel")?.scrollTop ?? null;
  const passiveGained = applyPassiveProduction(state);
  if (passiveGained > 1) lastReward = `+${round(passiveGained)} passive energy while away`;
  persistState();
  if (activeDomainSpheres().length === 0) renderOnboarding();
  else renderHome();
  if (state.activeSession) {
    window.scrollTo({ top: restoreWindowScroll, left: window.scrollX, behavior: "instant" });
    const focusPanel = document.querySelector<HTMLElement>(".focus-panel");
    if (focusPanel && restoreFocusScroll !== null) focusPanel.scrollTop = restoreFocusScroll;
  }
};

app.addEventListener("change", async (event) => {
  const input = event.target;
  if (input instanceof HTMLSelectElement && input.dataset.action === "equip-glyph") {
    const sphereId = input.dataset.sphereId;
    const glyphId = input.value;
    if (sphereId && glyphId && equipGlyph(state, glyphId, sphereId)) lastReward = "Mod equipped";
    persistState();
    render();
    return;
  }
  if (input instanceof HTMLSelectElement && input.dataset.action === "route-connection") {
    const sphereId = input.dataset.sphereId;
    if (sphereId) routeConnectionToSphere(state, sphereId, input.value);
    persistState();
    render();
    return;
  }
  if (!(input instanceof HTMLInputElement) || input.id !== backupInputId) return;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    const importedState = parseBackupState(await file.text());
    if (!confirm("Import this backup and replace current local Snowball data?")) return;
    state = importedState;
    lastReward = "Backup imported";
    lastCompletion = null;
    timerCompletedSessionId = null;
    isCreatingSphere = false;
    editingSphereId = null;
    creatingRitualForSphereId = null;
    editingRitualId = null;
    isSettingsOpen = false;
    selectedSphereId = null;
    persistState();
    render();
  } catch {
    alert("That file is not a valid Snowball backup.");
  }
});

app.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  const data = new FormData(form);
  const rawName = data.get("name");
  const rawTarget = data.get("target");
  const name = typeof rawName === "string" && rawName.trim() ? rawName.trim() : "Run";
  const target = typeof rawTarget === "string" && rawTarget ? Number(rawTarget) : null;
  if (form.id === "create-sphere-form") {
    const rawColor = data.get("color");
    const color = typeof rawColor === "string" ? rawColor : "#8bd8ff";
    const sphere = createDomainSphere(state, name, color, target ?? 20);
    if (sphere) {
      selectedSphereId = sphere.id;
      focusLayer = "activity";
      latticePanel = "growth";
      lastReward = activeDomainSpheres().length === 1 ? "Node added" : "Slot opened";
      isCreatingSphere = false;
    } else lastReward = `Need ${round(sphereSlotCost(state))} energy`;
  }
  if (form.id === "edit-sphere-form") {
    const rawColor = data.get("color");
    const sphereId = form.dataset.sphereId;
    const color = typeof rawColor === "string" ? rawColor : "#8bd8ff";
    if (sphereId) updateDomainSphere(state, sphereId, name, color, target ?? 20);
    editingSphereId = null;
  }
  if (form.id === "create-ritual-form") {
    const sphereId = form.dataset.sphereId;
    if (sphereId) createRitual(state, sphereId, name, target);
    creatingRitualForSphereId = null;
  }
  if (form.id === "edit-ritual-form") {
    const ritualId = form.dataset.ritualId;
    if (ritualId) updateRitual(state, ritualId, name, target);
    editingRitualId = null;
  }
  persistState();
  render();
});

app.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const actionElement = target.closest<HTMLElement>("[data-action]");
  if (!actionElement) return;
  const action = actionElement.dataset.action;

  if (action === "set-focus-layer") {
    focusLayer = (actionElement.dataset.layer as FocusLayer) ?? "activity";
    render();
  }
  if (action === "set-lattice-panel") {
    latticePanel = (actionElement.dataset.panel as LatticePanel) ?? "growth";
    render();
  }
  if (action === "open-settings") {
    isSettingsOpen = true;
    render();
  }
  if (action === "close-settings") {
    isSettingsOpen = false;
    render();
  }
  if (action === "select-sphere") {
    selectedSphereId = actionElement.dataset.sphereId ?? null;
    lastCompletion = null;
    render();
  }
  if (action === "show-create-sphere") {
    isCreatingSphere = true;
    render();
  }
  if (action === "cancel-create-sphere") {
    isCreatingSphere = false;
    render();
  }
  if (action === "show-edit-sphere") {
    editingSphereId = actionElement.dataset.sphereId ?? null;
    render();
  }
  if (action === "cancel-edit-sphere") {
    editingSphereId = null;
    render();
  }
  if (action === "archive-sphere") {
    const sphereId = actionElement.dataset.sphereId;
    const sphere = state.spheres.find((item) => item.id === sphereId);
    if (!sphereId || !sphere) return;
    if (state.activeSession?.sphereId === sphereId)
      return alert("Stop the run before archiving this node.");
    if (confirm(`Archive ${sphere.name}? Past logs stay.`)) {
      archiveDomainSphere(state, sphereId);
      editingSphereId = null;
      selectedSphereId = null;
      persistState();
      render();
    }
  }
  if (action === "show-create-ritual") {
    creatingRitualForSphereId = actionElement.dataset.sphereId ?? null;
    render();
  }
  if (action === "cancel-create-ritual") {
    creatingRitualForSphereId = null;
    render();
  }
  if (action === "show-edit-ritual") {
    editingRitualId = actionElement.dataset.ritualId ?? null;
    render();
  }
  if (action === "cancel-edit-ritual") {
    editingRitualId = null;
    render();
  }
  if (action === "archive-ritual") {
    const ritualId = actionElement.dataset.ritualId;
    const ritual = getRitual(state, ritualId ?? null);
    if (!ritualId || !ritual) return;
    if (state.activeSession?.ritualId === ritualId)
      return alert("Stop the run before archiving this action.");
    if (confirm(`Archive ${ritual.name}? Past logs stay.`)) {
      archiveRitual(state, ritualId);
      editingRitualId = null;
      persistState();
      render();
    }
  }
  if (action === "unequip-glyph") {
    const glyphId = actionElement.dataset.glyphId;
    if (glyphId && unequipGlyph(state, glyphId)) lastReward = "Mod removed";
    persistState();
    render();
  }
  if (action === "buy-core-power") {
    if (purchaseCorePower(state)) lastReward = `Core Power ${state.game.corePowerLevel}`;
    persistState();
    render();
  }
  if (action === "spend-path-point") {
    const sphereId = actionElement.dataset.sphereId;
    const path = actionElement.dataset.path;
    if (sphereId && path && spendSpherePoint(state, sphereId, path as SpherePath))
      lastReward = "Path +1";
    persistState();
    render();
  }
  if (action === "respec-sphere") {
    const sphereId = actionElement.dataset.sphereId;
    if (sphereId && respecSphere(state, sphereId)) lastReward = "Reset";
    persistState();
    render();
  }
  if (action === "toggle-connection") {
    const connectionId = actionElement.dataset.connectionId;
    if (connectionId) toggleConnection(state, connectionId);
    persistState();
    render();
  }
  if (action === "reverse-connection") {
    const connectionId = actionElement.dataset.connectionId;
    if (connectionId) reverseConnection(state, connectionId);
    persistState();
    render();
  }
  if (action === "set-active-ritual") {
    const sphereId = actionElement.dataset.sphereId;
    const ritualId = actionElement.dataset.ritualId;
    if (sphereId && ritualId) {
      setActiveRitual(state, sphereId, ritualId);
      if (state.activeSession?.sphereId === sphereId) state.activeSession.ritualId = ritualId;
    }
    persistState();
    render();
  }
  if (action === "start-session") {
    const sphereId = actionElement.dataset.sphereId;
    if (sphereId) {
      startSession(state, sphereId);
      selectedSphereId = sphereId;
      lastReward = null;
      lastCompletion = null;
      timerCompletedSessionId = null;
      persistState();
      render();
    }
  }
  if (action === "dismiss-completion") {
    lastCompletion = null;
    render();
  }
  if (action === "export-backup") {
    const blob = new Blob([createBackupJson(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `snowball-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  if (action === "import-backup")
    document.querySelector<HTMLInputElement>(`#${backupInputId}`)?.click();
  if (action === "finish-session") {
    const result = finishActiveSession(state);
    if (result) {
      selectedSphereId = result.session.sphereId;
      lastReward = null;
      lastCompletion = {
        sphereId: result.session.sphereId,
        durationSeconds: result.session.durationSeconds,
        energyGained: result.energyGained,
        activeEnergy: result.activeEnergy,
        milestoneEnergy: result.milestoneEnergy,
        xpGained: result.xpGained,
        completedMilestone: result.session.completedMilestoneAfterSession,
      };
    }
    timerCompletedSessionId = null;
    persistState();
    render();
  }
  if (action === "reset" && confirm("Reset local Snowball data?")) {
    await resetState();
    state = await loadState();
    lastReward = null;
    lastCompletion = null;
    timerCompletedSessionId = null;
    isCreatingSphere = false;
    editingSphereId = null;
    creatingRitualForSphereId = null;
    editingRitualId = null;
    isSettingsOpen = false;
    selectedSphereId = null;
    focusLayer = "activity";
    latticePanel = "growth";
    render();
  }
});

setInterval(() => {
  if (!state.activeSession) return;
  const ritual = getRitual(state, state.activeSession.ritualId);
  const targetSeconds = ritual?.targetMinutes ? ritual.targetMinutes * 60 : null;
  if (
    targetSeconds !== null &&
    timerCompletedSessionId !== state.activeSession.id &&
    activeElapsedSeconds() >= targetSeconds
  ) {
    timerCompletedSessionId = state.activeSession.id;
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  }
  render();
}, 1000);

render();
