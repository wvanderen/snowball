import "./style.css";
import { type AppState, type Sphere } from "./domain.ts";
import {
  applyPassiveProduction,
  createFirstSphere,
  domainSpheres,
  ensureToday,
  finishActiveSession,
  formatDuration,
  formatMinutes,
  getRitual,
  startSession,
} from "./game.ts";
import { loadState, resetState, saveState } from "./storage.ts";

const app = document.querySelector<HTMLDivElement>("#app")!;
let state: AppState = loadState();
let lastReward: string | null = null;

const round = (value: number) => Math.floor(value).toLocaleString();
const activeElapsedSeconds = () =>
  state.activeSession
    ? Math.floor((Date.now() - new Date(state.activeSession.startedAt).getTime()) / 1000)
    : 0;

const sphereProgress = (sphere: Sphere) => {
  if (sphere.dailyTargetMinutes <= 0) return 0;
  return Math.min(100, (sphere.todaySeconds / (sphere.dailyTargetMinutes * 60)) * 100);
};

const renderOnboarding = () => {
  app.innerHTML = `
    <main class="app-shell onboarding-shell">
      <section class="intro-card">
        <p class="eyebrow">Snowball v0</p>
        <h1>Start with one sphere.</h1>
        <p class="lede">Pick one life domain you want to keep in motion. Tapping it will immediately start a focus session.</p>
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
          <button type="submit">Create sphere</button>
        </form>
      </section>
    </main>`;
};

const renderSphere = (sphere: Sphere) => {
  const progress = sphereProgress(sphere);
  const ritual = getRitual(state, sphere.activeRitualId);
  const isActive = state.activeSession?.sphereId === sphere.id;

  return `
    <button class="sphere domain-sphere ${isActive ? "is-active" : ""}" data-action="start-session" data-sphere-id="${sphere.id}" style="--sphere-color: ${sphere.color}; --progress: ${progress}%">
      <span class="progress-ring"></span>
      <span class="sphere-core">
        <span class="sphere-name">${sphere.name}</span>
        <span class="sphere-meta">${formatMinutes(sphere.todaySeconds)} / ${sphere.dailyTargetMinutes}m</span>
      </span>
      <span class="ritual-pill">${ritual?.name ?? "Focus"}</span>
    </button>`;
};

const renderHome = () => {
  ensureToday(state);
  const spheres = domainSpheres(state);
  const firstSphere = spheres[0];
  const milestoneDone = firstSphere?.milestoneCompletedDate === firstSphere?.dailyProgressDate;

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
        <button class="ghost" data-action="reset">Reset</button>
      </header>

      <section class="lattice-card">
        <div class="lattice">
          <div class="connection-line ${state.activeSession ? "is-flowing" : ""}"></div>
          <div class="sphere center-sphere">
            <span class="sphere-core">
              <span class="sphere-name">Center</span>
              <span class="sphere-meta">output</span>
            </span>
          </div>
          ${spheres.map(renderSphere).join("")}
        </div>
      </section>

      ${firstSphere ? renderSphereStats(firstSphere, milestoneDone) : ""}
      ${state.activeSession ? renderSessionOverlay() : ""}
      ${lastReward ? `<aside class="toast">${lastReward}</aside>` : ""}
    </main>`;
};

const renderSphereStats = (sphere: Sphere, milestoneDone: boolean) => `
  <section class="stats-card">
    <div>
      <p class="eyebrow">Momentum</p>
      <strong>${Math.round(sphere.momentum)}%</strong>
    </div>
    <div>
      <p class="eyebrow">Today</p>
      <strong>${formatMinutes(sphere.todaySeconds)}m</strong>
    </div>
    <div>
      <p class="eyebrow">Milestone</p>
      <strong>${milestoneDone ? "Bloomed" : `${Math.round(sphereProgress(sphere))}%`}</strong>
    </div>
  </section>
  <p class="tap-hint">Tap ${sphere.name} to start immediately. Partial sessions count; the bloom triggers at ${sphere.dailyTargetMinutes} minutes.</p>`;

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
  if (!(form instanceof HTMLFormElement) || form.id !== "create-sphere-form") return;

  event.preventDefault();
  const data = new FormData(form);
  const rawName = data.get("name");
  const rawColor = data.get("color");
  const rawTarget = data.get("target");
  const name = typeof rawName === "string" && rawName.trim() ? rawName.trim() : "Focus";
  const color = typeof rawColor === "string" ? rawColor : "#7dd3fc";
  const target = typeof rawTarget === "string" ? Number(rawTarget) : 20;

  createFirstSphere(state, name, color, target);
  saveState(state);
  render();
});

app.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const actionElement = target.closest<HTMLElement>("[data-action]");
  if (!actionElement) return;

  const action = actionElement.dataset.action;

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
    render();
  }
});

setInterval(() => {
  if (state.activeSession) render();
}, 1000);

render();
