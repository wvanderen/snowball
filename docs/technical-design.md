# Snowball Technical Design

## Current stack

- Vite Plus project
- TypeScript
- No frontend framework yet
- Local-first browser storage

## Current implementation status

Implemented prototype foundation plus progression v0.2 slices:

- first sphere creation
- default ritual creation
- center + domain lattice view
- tap-to-start session
- countdown timer for targeted ritual
- session logging
- per-sphere XP/energy/momentum updates
- sphere level curve and Sphere Points
- Core Power purchase at Center
- sphere path upgrades and glyph slots
- daily milestone progress
- passive production while away
- controllable route connections and allocations
- glyph inventory, socketing, first reward, and forge choices
- localStorage/IndexedDB-backed persistence

## Domain entities

### AppState

Top-level persisted state.

Contains:

- version
- spheres
- rituals
- sessions
- connections
- game state
- active session

### Sphere

A sphere is either:

- `center`
- `domain`

Important fields:

- stable id
- name/color
- daily target minutes
- active ritual id
- ritual ids
- level
- xp
- Sphere Points earned/spent/available
- path allocations and upgrade purchases
- glyph slot count, equipped glyph ids, and glyph slots
- charge
- momentum
- streak stats
- total/today seconds
- daily progress date
- milestone completed date
- production values
- timestamps

### Ritual

A ritual belongs to a sphere and represents a concrete activity.

Important fields:

- stable id
- sphere id
- name
- target minutes or null
- favorite flag
- timestamps

### Session

A session records actual focused time.

Important fields:

- stable id
- sphere id
- ritual id
- start/end timestamps
- duration seconds
- whether it completed the milestone
- timestamps

### Connection

A directed edge between spheres.

Important fields:

- stable id
- from sphere
- to sphere
- active/enabled flags
- allocation percent
- level and throughput multiplier
- routing loss
- mode
- timestamps

### GameState

Global game economy state.

Important fields:

- current energy
- lifetime energy
- legacy current XP/lifetime XP fields for compatibility; progression uses per-sphere XP
- Core Power level and purchases
- glyph forge count
- first glyph reward claimed flag
- last passive tick timestamp

## Local-first, sync-ready principles

Current persistence uses localStorage behind a small storage module. This is acceptable for the prototype, but the data model should remain sync-ready.

Guidelines:

- Use stable UUID-like IDs for every record.
- Include `createdAt` and `updatedAt` on syncable entities.
- Keep sessions append-friendly.
- Prefer recalculable derived values where possible.
- Avoid coupling game calculations directly to UI components.
- Keep persistence behind an abstraction so it can move to IndexedDB later.
- Add schema migrations before public use.

## Likely storage evolution

### Prototype

`localStorage` JSON blob.

Pros:

- simple
- easy to inspect/reset
- fast to implement

Cons:

- poor for large session history
- no indexing
- not ideal for sync/conflict handling

### Next local-first step

IndexedDB via a small repository layer.

Possible structure:

- app metadata store
- spheres store
- rituals store
- sessions store
- connections store
- game state store
- pending sync operations store

### Future sync

Potential options:

- custom backend with per-record timestamps
- CRDT/event-log style session records
- local-first sync library
- account-based cloud sync

Conflict strategy should be simple for most records:

- sessions are append-only
- sphere/ritual edits can use last-write-wins initially
- game derived totals may be recalculated from event/session history where possible

## UI architecture direction

The current app is vanilla TypeScript. As complexity grows, we should decide whether to stay frameworkless or adopt a small UI framework.

Pressure points that may justify a framework:

- ritual management screens
- animations/state transitions
- multiple routes/views
- settings and edit flows
- richer lattice interactions
- upgrade/glyph inventories

If adopting a framework, choose one that keeps the mobile interaction loop fast and the bundle modest.

## Current source map

- `src/domain.ts`: domain types/constants
- `src/storage.ts`: local persistence and ID/date helpers
- `src/game.ts`: game/session/reward logic
- `src/main.ts`: UI rendering and event handling
- `src/style.css`: visual design

## Validation commands

Use Vite Plus commands:

```sh
vp check
vp build
```

Before significant work, also check available tasks/scripts:

```sh
vp help
vp run --help
```

## Near-term technical debt

- Remove unused starter files/assets if no longer needed.
- Add tests for reward and milestone calculations.
- Add explicit migration handling for persisted state versions.
- Separate UI rendering into smaller modules/components.
- Replace localStorage with IndexedDB once session history grows.
- Add import/export backup for local data.
