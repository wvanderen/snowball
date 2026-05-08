import "./style.css";
import { type AppState, type Session, type Sphere } from "./domain.ts";
import {
  activeRitualsForSphere,
  applyPassiveProduction,
  archiveDomainSphere,
  archiveRitual,
  canUnlockSphereSlot,
  createDomainSphere,
  createRitual,
  domainSpheres,
  ensureToday,
  finishActiveSession,
  formatDuration,
  formatMinutes,
  getRitual,
  recentSessionsForRitual,
  setActiveRitual,
  sphereLevelCost,
  sphereRates,
  sphereSlotCost,
  purchaseSphereLevel,
  startSession,
  updateDomainSphere,
  updateRitual,
} from "./game.ts";
import { createBackupJson, loadState, parseBackupState, resetState, saveState } from "./storage.ts";

const app = document.querySelector<HTMLDivElement>("#app")!;
let state: AppState = loadState();
type CompletionFeedback = {
  sphereId: string;
  durationSeconds: number;
  energyGained: number;
  activeEnergy: number;
  milestoneEnergy: number;
  xpGained: number;
  completedMilestone: boolean;
};

let lastReward: string | null = null;
let lastCompletion: CompletionFeedback | null = null;
let timerCompletedSessionId: string | null = null;
let isCreatingSphere = false;
let editingSphereId: string | null = null;
let creatingRitualForSphereId: string | null = null;
let editingRitualId: string | null = null;

const backupInputId = "backup-import-input";
const round = (value: number) => Math.floor(value).toLocaleString();
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

const sphereProgress = (sphere: Sphere) => {
  if (sphere.dailyTargetMinutes <= 0) return 0;
  return Math.min(100, (sphere.todaySeconds / (sphere.dailyTargetMinutes * 60)) * 100);
};

const spherePosition = (index: number, total: number) => {
  if (total === 1) return { x: 50, y: 76 };

  const angle = (-90 + (index * 360) / total) * (Math.PI / 180);
  const radius = total <= 4 ? 31 : total <= 7 ? 34 : 37;
  const verticalSquash = total >= 8 ? 0.88 : 0.94;

  return {
    x: 50 + Math.cos(angle) * radius,
    y: 50 + Math.sin(angle) * radius * verticalSquash,
  };
};

const sphereVisualState = (sphere: Sphere) => {
  const progress = sphereProgress(sphere);
  if (sphere.milestoneCompletedDate === sphere.dailyProgressDate) return "is-complete";
  if (progress < 25 && sphere.momentum < 35) return "needs-attention";
  return "in-progress";
};

const renderEditSphereForm = (sphere: Sphere) => `
  <section class="intro-card compact-card">
    <p class="eyebrow">Edit sphere</p>
    <h1>${sphere.name}</h1>
    <form id="edit-sphere-form" class="sphere-form" data-sphere-id="${sphere.id}">
      <label>
        Sphere name
        <input name="name" autocomplete="off" required maxlength="32" value="${sphere.name}" />
      </label>
      <label>
        Daily milestone
        <div class="inline-input">
          <input name="target" type="number" min="1" max="240" value="${sphere.dailyTargetMinutes}" required />
          <span>minutes</span>
        </div>
      </label>
      <label>
        Color
        <input name="color" type="color" value="${sphere.color}" />
      </label>
      <div class="form-actions">
        <button type="button" class="danger ghost" data-action="archive-sphere" data-sphere-id="${sphere.id}">Archive</button>
        <button type="button" class="ghost" data-action="cancel-edit-sphere">Cancel</button>
        <button type="submit">Save sphere</button>
      </div>
    </form>
  </section>`;

const renderRitualForm = (sphere: Sphere) => `
  <section class="intro-card compact-card">
    <p class="eyebrow">${sphere.name}</p>
    <h1>Add ritual.</h1>
    <p class="lede">Rituals are favorite activities inside this sphere. New rituals become active immediately.</p>
    <form id="create-ritual-form" class="sphere-form" data-sphere-id="${sphere.id}">
      <label>
        Ritual name
        <input name="name" autocomplete="off" placeholder="Guitar practice" required maxlength="36" />
      </label>
      <label>
        Optional target
        <div class="inline-input">
          <input name="target" type="number" min="1" max="240" placeholder="Count up" />
          <span>minutes</span>
        </div>
      </label>
      <div class="form-actions">
        <button type="button" class="ghost" data-action="cancel-create-ritual">Cancel</button>
        <button type="submit">Add ritual</button>
      </div>
    </form>
  </section>`;

const renderEditRitualForm = (ritualId: string) => {
  const ritual = getRitual(state, ritualId);
  const sphere = ritual ? state.spheres.find((item) => item.id === ritual.sphereId) : null;
  if (!ritual || ritual.archivedAt || !sphere) return "";

  return `
  <section class="intro-card compact-card">
    <p class="eyebrow">${sphere.name}</p>
    <h1>Edit ritual.</h1>
    <form id="edit-ritual-form" class="sphere-form" data-ritual-id="${ritual.id}">
      <label>
        Ritual name
        <input name="name" autocomplete="off" required maxlength="36" value="${ritual.name}" />
      </label>
      <label>
        Optional target
        <div class="inline-input">
          <input name="target" type="number" min="1" max="240" placeholder="Count up" value="${ritual.targetMinutes ?? ""}" />
          <span>minutes</span>
        </div>
      </label>
      <div class="form-actions">
        <button type="button" class="danger ghost" data-action="archive-ritual" data-ritual-id="${ritual.id}">Archive</button>
        <button type="button" class="ghost" data-action="cancel-edit-ritual">Cancel</button>
        <button type="submit">Save ritual</button>
      </div>
    </form>
  </section>`;
};

const renderSphereForm = (isFirstRun: boolean) => {
  const slotCost = sphereSlotCost(state);
  const canUnlock = canUnlockSphereSlot(state);

  return `
  <section class="intro-card">
    <p class="eyebrow">Snowball v0</p>
    <h1>${isFirstRun ? "Start with one sphere." : "Unlock a sphere slot."}</h1>
    <p class="lede">${
      isFirstRun
        ? "Pick a life domain you want to keep in motion. Your first sphere is free."
        : `A new lattice slot costs ${round(slotCost)} energy. Earn focus energy to grow deliberately.`
    }</p>
    <form id="create-sphere-form" class="sphere-form">
      <label>
        Sphere name
        <input name="name" autocomplete="off" placeholder="Music" required maxlength="32" />
      </label>
      <label>
        Daily milestone
        <div class="inline-input">
          <input name="target" type="number" min="1" max="240" value="20" required />
          <span>minutes</span>
        </div>
      </label>
      <label>
        Color
        <input name="color" type="color" value="#7dd3fc" />
      </label>
      <div class="form-actions">
        ${isFirstRun ? "" : `<button type="button" class="ghost" data-action="cancel-create-sphere">Cancel</button>`}
        <button type="submit" ${canUnlock ? "" : "disabled"}>${isFirstRun ? "Create sphere" : `Unlock & create · ${round(slotCost)} energy`}</button>
      </div>
    </form>
  </section>`;
};

const renderOnboarding = () => {
  app.innerHTML = `
    <main class="app-shell onboarding-shell">
      ${renderSphereForm(true)}
    </main>`;
};

const renderSphere = (sphere: Sphere, index: number, totalSlots: number) => {
  const progress = sphereProgress(sphere);
  const ritual = getRitual(state, sphere.activeRitualId);
  const isActive = state.activeSession?.sphereId === sphere.id;
  const completion = lastCompletion?.sphereId === sphere.id ? lastCompletion : null;
  const position = spherePosition(index, totalSlots);

  const visualState = sphereVisualState(sphere);
  const momentum = Math.round(sphere.momentum);

  return `
    <button class="sphere domain-sphere ${visualState} ${isActive ? "is-active" : ""} ${completion ? "just-completed" : ""} ${completion?.completedMilestone ? "just-bloomed" : ""}" data-action="start-session" data-sphere-id="${sphere.id}" aria-label="${sphere.name}: ${Math.round(progress)}% of daily milestone, ${momentum}% momentum${completion?.completedMilestone ? ", milestone bloom completed" : ""}" style="--sphere-color: ${sphere.color}; --progress: ${progress}%; --momentum: ${momentum}; --sphere-x: ${position.x}%; --sphere-y: ${position.y}%">
      <span class="attention-orbit"></span>
      <span class="progress-ring"></span>
      <span class="sphere-core">
        <span class="sphere-name">${sphere.name}</span>
        <span class="sphere-meta">${formatMinutes(sphere.todaySeconds)} / ${sphere.dailyTargetMinutes}m</span>
        <span class="momentum-chip">${momentum}% flow</span>
        ${completion?.completedMilestone ? `<span class="bloom-badge">Bloom</span>` : ""}
      </span>
      <span class="ritual-pill">${ritual?.name ?? "Focus"}</span>
    </button>`;
};

const renderConnectionLines = (spheres: Sphere[], totalSlots: number) =>
  spheres
    .map((sphere, index) => {
      const position = spherePosition(index, totalSlots);
      const isActive = state.activeSession?.sphereId === sphere.id;
      const completed = sphere.milestoneCompletedDate === sphere.dailyProgressDate;
      const progress = sphereProgress(sphere);
      return `<g class="lattice-connection ${isActive ? "is-flowing" : ""} ${completed ? "is-complete" : ""}" style="--sphere-color: ${sphere.color}; --momentum: ${Math.round(sphere.momentum)}; --progress: ${Math.round(progress)}%">
        <line class="lattice-line" x1="50" y1="50" x2="${position.x}" y2="${position.y}" />
        <circle class="flow-particle" r="0.85" cx="50" cy="50">
          <animateMotion dur="${Math.max(1.4, 3.4 - sphere.momentum / 45).toFixed(1)}s" repeatCount="indefinite" path="M 0 0 L ${position.x - 50} ${position.y - 50}" />
        </circle>
      </g>`;
    })
    .join("");

const renderHome = () => {
  ensureToday(state);
  const spheres = domainSpheres(state);
  const nextSlotCost = sphereSlotCost(state);
  const canUnlockSlot = canUnlockSphereSlot(state);
  const visibleLatticeSlots = spheres.length + 1;

  app.innerHTML = `
    <main class="app-shell">
      <header class="top-bar">
        <div>
          <p class="eyebrow">Energy</p>
          <strong>${round(state.game.energy)}</strong>
        </div>
        <div>
          <p class="eyebrow">XP</p>
          <strong>${round(state.game.experience)}</strong>
        </div>
        <div>
          <p class="eyebrow">Passive</p>
          <strong>${round(spheres.reduce((sum, sphere) => sum + sphereRates(sphere).passivePerHour, 0))}/h</strong>
        </div>
        <button class="ghost" data-action="show-create-sphere" ${canUnlockSlot ? "" : "disabled"}>${canUnlockSlot ? "Add" : `Locked · ${round(nextSlotCost)} energy`}</button>
        <button class="ghost" data-action="export-backup">Export</button>
        <button class="ghost" data-action="import-backup">Import</button>
        <button class="ghost" data-action="reset">Reset</button>
        <input id="${backupInputId}" class="visually-hidden" type="file" accept="application/json,.json" />
      </header>

      <section class="lattice-card">
        <div class="lattice">
          <svg class="connection-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            ${renderConnectionLines(spheres, visibleLatticeSlots)}
          </svg>
          <div class="sphere center-sphere">
            <span class="sphere-core">
              <span class="sphere-name">Center</span>
              <span class="sphere-meta">output</span>
            </span>
          </div>
          ${spheres.map((sphere, index) => renderSphere(sphere, index, visibleLatticeSlots)).join("")}
          ${renderLockedSphereSlot(spheres.length, visibleLatticeSlots, nextSlotCost)}
        </div>
      </section>

      <section class="sphere-list">
        ${spheres.map(renderSphereStats).join("")}
      </section>
      <p class="tap-hint">Tap any sphere to start immediately. New lattice slots unlock with energy; next slot costs ${round(nextSlotCost)} energy.</p>
      ${renderSessionHistory()}

      ${isCreatingSphere ? `<div class="modal-scrim">${renderSphereForm(false)}</div>` : ""}
      ${renderEditSphereModal()}
      ${renderRitualModal()}
      ${renderEditRitualModal()}
      ${state.activeSession ? renderSessionOverlay() : ""}
      ${lastCompletion ? renderCompletionFeedback(lastCompletion) : lastReward ? `<aside class="toast">${lastReward}</aside>` : ""}
    </main>`;
};

const renderLockedSphereSlot = (index: number, total: number, cost: number) => {
  const position = spherePosition(index, total);
  return `
    <button class="sphere domain-sphere locked-sphere" data-action="show-create-sphere" aria-label="Locked sphere slot. Unlock costs ${round(cost)} energy" style="--sphere-color: #94a3b8; --progress: 0%; --momentum: 0; --sphere-x: ${position.x}%; --sphere-y: ${position.y}%">
      <span class="sphere-core">
        <span class="sphere-name">Locked</span>
        <span class="sphere-meta">${round(cost)} energy</span>
      </span>
    </button>`;
};

const renderRitualHotbar = (sphere: Sphere) => {
  const rituals = activeRitualsForSphere(state, sphere.id).filter((ritual) => ritual.isFavorite);

  return `
    <div class="ritual-hotbar" aria-label="${sphere.name} rituals">
      ${rituals
        .map(
          (ritual) => `
            <span class="ritual-chip-wrap">
              <button class="ritual-chip ${ritual.id === sphere.activeRitualId ? "is-selected" : ""}" data-action="set-active-ritual" data-sphere-id="${sphere.id}" data-ritual-id="${ritual.id}">
                ${ritual.name}${ritual.targetMinutes ? ` · ${ritual.targetMinutes}m` : ""}
              </button>
              <button class="ritual-edit-button" data-action="show-edit-ritual" data-ritual-id="${ritual.id}" aria-label="Edit ${ritual.name}">Edit</button>
            </span>`,
        )
        .join("")}
      <button class="ritual-chip add-chip" data-action="show-create-ritual" data-sphere-id="${sphere.id}">+ Ritual</button>
    </div>`;
};

const renderSphereStats = (sphere: Sphere) => {
  const milestoneDone = sphere.milestoneCompletedDate === sphere.dailyProgressDate;
  const levelCost = sphereLevelCost(sphere);
  const rates = sphereRates(sphere);
  const canAffordLevel = state.game.energy >= levelCost;

  return `
    <article class="sphere-stat-card" style="--sphere-color: ${sphere.color}">
      <div class="sphere-stat-grid">
        <div>
          <p class="eyebrow">${sphere.name}</p>
          <strong>${milestoneDone ? "Bloomed" : `${Math.round(sphereProgress(sphere))}%`}</strong>
        </div>
        <div>
          <p class="eyebrow">Momentum</p>
          <strong>${Math.round(sphere.momentum)}%</strong>
        </div>
        <div>
          <p class="eyebrow">Today</p>
          <strong>${formatMinutes(sphere.todaySeconds)}m</strong>
        </div>
        <div>
          <p class="eyebrow">Level</p>
          <strong>${sphere.level}</strong>
        </div>
        <button class="tiny-action" data-action="show-edit-sphere" data-sphere-id="${sphere.id}">Edit</button>
      </div>
      <div class="economy-row">
        <span>Active ${rates.activePerMinute.toFixed(1)}/m</span>
        <span>Passive ${rates.passivePerHour.toFixed(1)}/h</span>
        <button class="tiny-action upgrade-action" data-action="level-sphere" data-sphere-id="${sphere.id}" ${canAffordLevel ? "" : "disabled"}>Level up · ${round(levelCost)} energy</button>
      </div>
      ${renderRitualHotbar(sphere)}
      ${renderActiveRitualHistory(sphere)}
    </article>`;
};

const renderEditSphereModal = () => {
  if (!editingSphereId) return "";

  const sphere = state.spheres.find(
    (item) => item.id === editingSphereId && item.kind === "domain",
  );
  return sphere ? `<div class="modal-scrim">${renderEditSphereForm(sphere)}</div>` : "";
};

const renderRitualModal = () => {
  if (!creatingRitualForSphereId) return "";

  const sphere = state.spheres.find((item) => item.id === creatingRitualForSphereId);
  return sphere ? `<div class="modal-scrim">${renderRitualForm(sphere)}</div>` : "";
};

const renderEditRitualModal = () =>
  editingRitualId ? `<div class="modal-scrim">${renderEditRitualForm(editingRitualId)}</div>` : "";

const renderActiveRitualHistory = (sphere: Sphere) => {
  if (!sphere.activeRitualId) return "";
  const ritual = getRitual(state, sphere.activeRitualId);
  const sessions = recentSessionsForRitual(state, sphere.activeRitualId, 3);

  return `
    <div class="ritual-history">
      <p class="eyebrow">${ritual?.name ?? "Ritual"} history</p>
      ${
        sessions.length > 0
          ? `<ol>${sessions.map((session) => `<li>${formatDuration(session.durationSeconds)} · ${formatSessionTime(session.startedAt)}</li>`).join("")}</ol>`
          : `<p class="empty-history">No sessions for this ritual yet.</p>`
      }
    </div>`;
};

const renderSessionHistoryItem = (session: Session) => {
  const sphere = state.spheres.find((item) => item.id === session.sphereId);
  const ritual = getRitual(state, session.ritualId);

  return `
    <li class="history-item" style="--sphere-color: ${sphere?.color ?? "#7dd3fc"}">
      <span class="history-dot"></span>
      <div>
        <strong>${sphere?.name ?? "Unknown sphere"}</strong>
        <p>${ritual?.name ?? "Focus"} · ${formatDuration(session.durationSeconds)}${session.completedMilestoneAfterSession ? " · bloom" : ""}</p>
      </div>
      <time>${formatSessionTime(session.startedAt)}</time>
    </li>`;
};

const renderSessionHistory = () => {
  const recentSessions = state.sessions.slice(0, 5);

  return `
    <section class="history-card">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Recent</p>
          <h2>Session history</h2>
        </div>
        <span>${state.sessions.length} total</span>
      </div>
      ${
        recentSessions.length > 0
          ? `<ol class="history-list">${recentSessions.map(renderSessionHistoryItem).join("")}</ol>`
          : `<p class="empty-history">Your logged sessions will appear here.</p>`
      }
    </section>`;
};

const renderCompletionFeedback = (feedback: CompletionFeedback) => `
  <aside class="completion-toast ${feedback.completedMilestone ? "is-bloom" : ""}" role="status" aria-live="polite">
    <p class="eyebrow">Session complete</p>
    <strong>${formatDuration(feedback.durationSeconds)} logged</strong>
    <div class="reward-grid">
      <span>XP <b>+${Math.floor(feedback.xpGained)}</b></span>
      <span>Energy <b>+${round(feedback.energyGained)}</b></span>
      ${feedback.completedMilestone ? `<span class="bloom-reward">Bloom bonus <b>+${round(feedback.milestoneEnergy)}</b></span>` : ""}
    </div>
  </aside>`;

const renderSessionOverlay = () => {
  const active = state.activeSession;
  if (!active) return "";

  const sphere = state.spheres.find((item) => item.id === active.sphereId);
  const ritual = getRitual(state, active.ritualId);
  const elapsed = activeElapsedSeconds();
  const targetSeconds = ritual?.targetMinutes ? ritual.targetMinutes * 60 : null;
  const targetComplete = targetSeconds !== null && elapsed >= targetSeconds;
  if (targetComplete) timerCompletedSessionId = active.id;
  const displaySeconds = targetSeconds ? Math.max(0, targetSeconds - elapsed) : elapsed;

  return `
    <section class="session-sheet ${targetComplete ? "target-complete" : ""}">
      <p class="eyebrow">Active sphere</p>
      <h2>${sphere?.name ?? "Session"}</h2>
      <p>${ritual?.name ?? "Focus"}</p>
      <div class="timer">${formatDuration(displaySeconds)}</div>
      <p class="timer-mode">${targetComplete ? "ritual target complete" : targetSeconds ? "counting down ritual target" : "counting up"}</p>
      ${targetComplete ? `<div class="timer-complete-alert" role="status" aria-live="assertive">Target complete — ready to log this ritual.</div>` : ""}
      <button data-action="finish-session">${targetComplete ? "Log completed ritual" : "Stop & log session"}</button>
    </section>`;
};

const render = () => {
  const passiveGained = applyPassiveProduction(state);
  if (passiveGained > 1) lastReward = `+${round(passiveGained)} passive energy while away`;
  saveState(state);

  if (domainSpheres(state).length === 0) renderOnboarding();
  else renderHome();
};

app.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;

  event.preventDefault();
  const data = new FormData(form);
  const rawName = data.get("name");
  const rawTarget = data.get("target");
  const name = typeof rawName === "string" && rawName.trim() ? rawName.trim() : "Focus";
  const target = typeof rawTarget === "string" && rawTarget ? Number(rawTarget) : null;

  if (form.id === "create-sphere-form") {
    const rawColor = data.get("color");
    const color = typeof rawColor === "string" ? rawColor : "#7dd3fc";
    if (createDomainSphere(state, name, color, target ?? 20)) {
      lastReward =
        domainSpheres(state).length === 1 ? "First sphere created" : "Sphere slot unlocked";
      isCreatingSphere = false;
    } else {
      lastReward = `Need ${round(sphereSlotCost(state))} energy to unlock the next sphere slot`;
    }
  }

  if (form.id === "edit-sphere-form") {
    const rawColor = data.get("color");
    const sphereId = form.dataset.sphereId;
    const color = typeof rawColor === "string" ? rawColor : "#7dd3fc";
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

  saveState(state);
  render();
});

app.addEventListener("change", async (event) => {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || input.id !== backupInputId) return;

  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  try {
    const importedState = parseBackupState(await file.text());
    if (!confirm("Import this backup and replace current local Snowball data?")) return;
    state = importedState;
    saveState(state);
    lastReward = "Backup imported";
    lastCompletion = null;
    timerCompletedSessionId = null;
    isCreatingSphere = false;
    editingSphereId = null;
    creatingRitualForSphereId = null;
    editingRitualId = null;
    render();
  } catch {
    alert("That file is not a valid Snowball backup.");
  }
});

app.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const actionElement = target.closest<HTMLElement>("[data-action]");
  if (!actionElement) return;

  const action = actionElement.dataset.action;

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

    if (state.activeSession?.sphereId === sphereId) {
      alert("Finish the active session before archiving this sphere.");
      return;
    }

    if (
      confirm(
        `Archive ${sphere.name}? Its past sessions will stay in history, but it will leave the active lattice.`,
      )
    ) {
      archiveDomainSphere(state, sphereId);
      editingSphereId = null;
      saveState(state);
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
    if (state.activeSession?.ritualId === ritualId) {
      alert("Finish the active session before archiving this ritual.");
      return;
    }
    if (confirm(`Archive ${ritual.name}? Past sessions will stay in history.`)) {
      archiveRitual(state, ritualId);
      editingRitualId = null;
      saveState(state);
      render();
    }
  }

  if (action === "level-sphere") {
    const sphereId = actionElement.dataset.sphereId;
    if (sphereId && purchaseSphereLevel(state, sphereId)) lastReward = "Sphere leveled up";
    saveState(state);
    render();
  }

  if (action === "set-active-ritual") {
    const sphereId = actionElement.dataset.sphereId;
    const ritualId = actionElement.dataset.ritualId;
    if (sphereId && ritualId) setActiveRitual(state, sphereId, ritualId);
    saveState(state);
    render();
  }

  if (action === "start-session") {
    const sphereId = actionElement.dataset.sphereId;
    if (sphereId) {
      startSession(state, sphereId);
      lastReward = null;
      lastCompletion = null;
      timerCompletedSessionId = null;
      saveState(state);
      render();
    }
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

  if (action === "import-backup") {
    document.querySelector<HTMLInputElement>(`#${backupInputId}`)?.click();
  }

  if (action === "finish-session") {
    const result = finishActiveSession(state);
    if (result) {
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
    saveState(state);
    render();
  }

  if (action === "reset" && confirm("Reset local Snowball data?")) {
    resetState();
    state = loadState();
    lastReward = null;
    lastCompletion = null;
    timerCompletedSessionId = null;
    isCreatingSphere = false;
    editingSphereId = null;
    creatingRitualForSphereId = null;
    editingRitualId = null;
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
