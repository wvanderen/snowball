# Snowball Roadmap

## Roadmap principles

1. Protect the core loop: tap sphere, start immediately, log real effort.
2. Build the life-tracking foundation before deep game systems.
3. Add game depth in layers that do not increase daily-use friction.
4. Keep missed-day recovery emotionally safe.
5. Stay local-first now, sync-ready later.

## Phase 0: Vision and prototype foundation

Status: in progress.

Goals:

- establish product vision
- define core domain model
- create first usable prototype loop

Done:

- product direction clarified
- first sphere setup
- center/domain lattice view
- tap-to-start session
- timer overlay
- session logging
- XP, energy, momentum, milestone progress
- local persistence

Remaining:

- clean up starter template remnants
- add docs and roadmap
- add tests around core calculations

## Phase 1: Daily-use MVP

Goal: make Snowball genuinely usable as a personal focus tracker for one or a few spheres.

Features:

- create/edit/delete domain spheres
- set daily time milestones
- tap sphere to start current ritual immediately
- stop/log session
- session history
- daily progress reset by local day
- momentum decay/recovery tuning
- XP and energy display
- milestone completion feedback
- local persistence
- import/export backup

Quality bar:

- user can rely on it for daily tracking
- partial sessions feel worthwhile
- milestone completion feels satisfying
- app remains fast on mobile

## Phase 2: Ritual favorites

Goal: support flexible domains without adding start friction.

Features:

- multiple rituals per sphere
- one active ritual per sphere
- favorite ritual hotbar/list
- quick ritual switching
- ritual target duration optional
- count down for targeted rituals
- count up for untargeted rituals
- ritual-specific session history

Design rule:

Switching rituals should be fast, but tapping the sphere should still start immediately with the active ritual.

## Phase 3: Lattice visual system

Goal: make the home screen feel like a living personal sigil.

Features:

- responsive center + radial sphere layout
- support 2-10 spheres visually
- sphere progress rings
- glow intensity based on momentum
- active pulse animation
- energy flow particles/lines
- milestone bloom animation
- visual distinction for completed/needs-attention spheres

Quality bar:

The user should be able to glance at the lattice and understand what needs attention today.

## Phase 4: Passive and active production v1

Goal: make the incremental layer feel alive while preserving real activity as the strongest source of progress.

Features:

- passive production balance pass
- offline production calculation
- optional offline cap
- active production significantly stronger than passive
- session completion burst
- basic sphere leveling
- spend energy on simple sphere upgrades

Open decisions:

- active/passive ratio
- offline cap duration
- diminishing returns for long sessions
- whether daily targets affect production scaling

## Phase 5: Sphere slots and lattice growth

Goal: let the sigil bloom from 2 nodes into a small network.

Features:

- purchase additional sphere slots with energy
- add domain spheres after slot unlock
- radial placement around center
- basic directed connections from spheres to center
- display total energy rate/output
- escalating slot costs

Quality bar:

Adding a sphere should feel like a major progression moment and a meaningful life-design choice.

## Phase 6: Connections and routing strategy

Goal: turn the lattice into a strategic playground.

Features:

- toggle connections active/inactive
- set connection direction
- energy flow visualization per edge
- simple connected-sphere buffs
- center as output node
- connection upgrades

Possible mechanics:

- active sphere buffs connected destinations
- high-momentum sphere amplifies outgoing flow
- center upgrades improve incoming conversion
- routing choices change production profile

## Phase 7: Glyph system v1

Goal: introduce build variety and make different consistency styles viable.

Features:

- glyph inventory
- glyph slots on spheres
- equip/unequip glyphs
- first set of basic glyphs
- glyph effects based on existing stats

Initial glyph candidates:

- Chain Glyph: streak scaling
- Resilience Glyph: recent consistency scaling
- Deep Work Glyph: long-session scaling
- Spark Glyph: return-after-miss reward
- Persistence Glyph: lifetime XP/time scaling
- Resonance Glyph: connected-sphere active buff

Quality bar:

Streak builds should be possible, but not mandatory or dominant.

## Phase 8: Center Sphere and recovery rituals

Goal: make rest/centering a first-class but non-punitive part of the system.

Features:

- tappable Center Sphere
- rest/recovery ritual hotbar
- breathing/break timers
- recovery-focused rewards
- center upgrades
- global lattice modifiers

Design caution:

Rest should not feel like another productivity obligation.

## Phase 9: Sync-ready data layer

Goal: prepare for multi-device continuity.

Features:

- move from localStorage blob to IndexedDB/repository layer
- schema migrations
- event/session append model
- import/export backup
- sync operation queue abstraction
- conflict strategy documentation

Later:

- user accounts
- cloud sync
- multi-device active session handling

## Phase 10: Rich progression layers

Goal: deepen long-term engagement after the core loop is strong.

Possible systems:

- ritual gems
- sphere specializations
- global center upgrades
- milestone chains
- weekly quests/challenges
- cosmetic sigil customization
- prestige/seasonal mechanics, if appropriate

Design caution:

Avoid mechanics that encourage fake check-ins or make real life feel subservient to optimization.

## Immediate next implementation candidates

Recommended order:

1. Clean project starter remnants.
2. Add unit tests for core game calculations.
3. Add sphere edit/create support beyond first sphere.
4. Add ritual favorites and switching.
5. Improve milestone bloom and session completion feedback.
6. Add basic session history view.

## Definition of done for MVP

Snowball reaches MVP when a user can:

- create multiple spheres
- set daily milestones
- define/switch rituals
- start sessions with one tap
- accumulate progress across sessions
- see momentum and milestone status clearly
- gain XP and energy persistently
- unlock at least one additional sphere slot
- use the app comfortably on mobile for a week
