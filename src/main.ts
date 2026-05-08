import "./style.css";
import { type AppState, type Session, type Sphere } from "./domain.ts";
import {
  applyPassiveProduction,
  createDomainSphere,
  createRitual,
  domainSpheres,
  ensureToday,
  finishActiveSession,
  formatDuration,
  formatMinutes,
  getRitual,
  setActiveRitual,
  startSession,
  updateDomainSphere,
} from "./game.ts";
import { loadState, resetState, saveState } from "./storage.ts";

const app = document.querySelector<HTMLDivElement>("#app")!;
let state: AppState = loadState();
let lastReward: string | null = null;
let isCreatingSphere = false;
let editingSphereId: string | null = null;
let creatingRitualForSphereId: string | null = null;

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

  const angle = (90 + (index * 360) / total) * (Math.PI / 180);
  const radius = total <= 4 ? 32 : 35;
  return {
    x: 50 + Math.cos(angle) * radius,
    y: 50 + Math.sin(angle) * radius,
  };
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

const renderSphereForm = (isFirstRun: boolean) => `
  <section class="intro-card">
    <p class="eyebrow">Snowball v0</p>
    <h1>${isFirstRun ? "Start with one sphere." : "Add a sphere."}</h1>
    <p class="lede">Pick a life domain you want to keep in motion. Tapping it will immediately start a focus session.</p>
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
        <button type="submit">Create sphere</button>
      </div>
    </form>
  </section>`;

const renderOnboarding = () => {
  app.innerHTML = `
    <main class="app-shell onboarding-shell">
      ${renderSphereForm(true)}
    </main>`;
};

const renderSphere = (sphere: Sphere, index: number, spheres: Sphere[]) => {
  const progress = sphereProgress(sphere);
  const ritual = getRitual(state, sphere.activeRitualId);
  const isActive = state.activeSession?.sphereId === sphere.id;
  const position = spherePosition(index, spheres.length);

  return `
    <button class="sphere domain-sphere ${isActive ? "is-active" : ""}" data-action="start-session" data-sphere-id="${sphere.id}" style="--sphere-color: ${sphere.color}; --progress: ${progress}%; --sphere-x: ${position.x}%; --sphere-y: ${position.y}%">
      <span class="progress-ring"></span>
      <span class="sphere-core">
        <span class="sphere-name">${sphere.name}</span>
        <span class="sphere-meta">${formatMinutes(sphere.todaySeconds)} / ${sphere.dailyTargetMinutes}m</span>
      </span>
      <span class="ritual-pill">${ritual?.name ?? "Focus"}</span>
    </button>`;
};

const renderConnectionLines = (spheres: Sphere[]) =>
  spheres
    .map((sphere, index) => {
      const position = spherePosition(index, spheres.length);
      const isActive = state.activeSession?.sphereId === sphere.id;
      return `<line class="lattice-line ${isActive ? "is-flowing" : ""}" x1="50" y1="50" x2="${position.x}" y2="${position.y}" />`;
    })
    .join("");

const renderHome = () => {
  ensureToday(state);
  const spheres = domainSpheres(state);

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
        <button class="ghost" data-action="show-create-sphere">Add</button>
        <button class="ghost" data-action="reset">Reset</button>
      </header>

      <section class="lattice-card">
        <div class="lattice">
          <svg class="connection-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            ${renderConnectionLines(spheres)}
          </svg>
          <div class="sphere center-sphere">
            <span class="sphere-core">
              <span class="sphere-name">Center</span>
              <span class="sphere-meta">output</span>
            </span>
          </div>
          ${spheres.map(renderSphere).join("")}
        </div>
      </section>

      <section class="sphere-list">
        ${spheres.map(renderSphereStats).join("")}
      </section>
      <p class="tap-hint">Tap any sphere to start immediately. Partial sessions count; milestone blooms trigger when the full daily target is reached.</p>
      ${renderSessionHistory()}

      ${isCreatingSphere ? `<div class="modal-scrim">${renderSphereForm(false)}</div>` : ""}
      ${renderEditSphereModal()}
      ${renderRitualModal()}
      ${state.activeSession ? renderSessionOverlay() : ""}
      ${lastReward ? `<aside class="toast">${lastReward}</aside>` : ""}
    </main>`;
};

const renderRitualHotbar = (sphere: Sphere) => {
  const rituals = state.rituals.filter(
    (ritual) => ritual.sphereId === sphere.id && ritual.isFavorite,
  );

  return `
    <div class="ritual-hotbar" aria-label="${sphere.name} rituals">
      ${rituals
        .map(
          (ritual) => `
            <button class="ritual-chip ${ritual.id === sphere.activeRitualId ? "is-selected" : ""}" data-action="set-active-ritual" data-sphere-id="${sphere.id}" data-ritual-id="${ritual.id}">
              ${ritual.name}${ritual.targetMinutes ? ` · ${ritual.targetMinutes}m` : ""}
            </button>`,
        )
        .join("")}
      <button class="ritual-chip add-chip" data-action="show-create-ritual" data-sphere-id="${sphere.id}">+ Ritual</button>
    </div>`;
};

const renderSphereStats = (sphere: Sphere) => {
  const milestoneDone = sphere.milestoneCompletedDate === sphere.dailyProgressDate;

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
        <button class="tiny-action" data-action="show-edit-sphere" data-sphere-id="${sphere.id}">Edit</button>
      </div>
      ${renderRitualHotbar(sphere)}
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

const renderSessionOverlay = () => {
  const active = state.activeSession;
  if (!active) return "";

  const sphere = state.spheres.find((item) => item.id === active.sphereId);
  const ritual = getRitual(state, active.ritualId);
  const elapsed = activeElapsedSeconds();
  const targetSeconds = ritual?.targetMinutes ? ritual.targetMinutes * 60 : null;
  const displaySeconds = targetSeconds ? Math.max(0, targetSeconds - elapsed) : elapsed;

  return `
    <section class="session-sheet">
      <p class="eyebrow">Active sphere</p>
      <h2>${sphere?.name ?? "Session"}</h2>
      <p>${ritual?.name ?? "Focus"}</p>
      <div class="timer">${formatDuration(displaySeconds)}</div>
      <p class="timer-mode">${targetSeconds ? "counting down ritual target" : "counting up"}</p>
      <button data-action="finish-session">Stop & log session</button>
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
    createDomainSphere(state, name, color, target ?? 20);
    isCreatingSphere = false;
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

  saveState(state);
  render();
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

  if (action === "show-create-ritual") {
    creatingRitualForSphereId = actionElement.dataset.sphereId ?? null;
    render();
  }

  if (action === "cancel-create-ritual") {
    creatingRitualForSphereId = null;
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
      saveState(state);
      render();
    }
  }

  if (action === "finish-session") {
    const result = finishActiveSession(state);
    if (result) {
      const milestone = result.session.completedMilestoneAfterSession ? " + milestone bloom" : "";
      lastReward = `+${round(result.energyGained)} energy, +${Math.floor(result.xpGained)} XP${milestone}`;
    }
    saveState(state);
    render();
  }

  if (action === "reset" && confirm("Reset local Snowball data?")) {
    resetState();
    state = loadState();
    lastReward = null;
    isCreatingSphere = false;
    editingSphereId = null;
    creatingRitualForSphereId = null;
    render();
  }
});

setInterval(() => {
  if (state.activeSession) render();
}, 1000);

render();
