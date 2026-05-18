# Snowball Game Design Notes

## Core loop

```txt
Choose sphere -> start ritual/session -> focus -> stop/complete -> gain XP/energy -> update momentum -> lattice reacts -> unlock/upgrade over time
```

The real-world action is the generator. The game exists to make returning to that action compelling.

## MVP loop

1. User creates first domain sphere.
2. User sets a daily time milestone.
3. App creates a default ritual.
4. User taps sphere to start immediately.
5. Timer runs.
6. User stops/logs session.
7. Session contributes to today's milestone.
8. User gains XP and energy.
9. Momentum changes.
10. Lattice visually updates.

## Timer rules

- If the active ritual has a target duration, count down from that target.
- If the active ritual has no target duration, count up.
- Sphere daily milestone progress accumulates across sessions and rituals.

## Reward rules v0

### Sphere XP

Global XP is deprecated. XP is local to the sphere being practiced.

```txt
sphereXpGained = focusedMinutes
```

XP represents real effort and should remain mostly grounded in time. Late-game glyphs or upgrades may add balanced Sphere XP bonuses, especially through Momentum synergies, but these should accelerate practice rather than replace it.

### Active energy

Initial simple formula:

```txt
energyGained = focusedMinutes * sphereLevel * momentumMultiplier * activeEnergyMultiplier
momentumMultiplier = 1 + momentum / 100
```

Active production should feel meaningfully stronger than passive production.

### Milestone boost

When the daily milestone is crossed for the first time that day:

```txt
milestoneEnergy = dailyTargetMinutes * 2
momentum += milestoneBoost
```

There is no partial credit for the milestone boost itself.

### Passive energy

Passive production continues while away.

Initial simple model:

```txt
passiveEnergyPerSecond = spherePassiveRate * sphereLevel * (0.25 + momentum / 100)
```

Passive production should reward consistency but not overshadow actual activity.

## Momentum model

Momentum range:

```txt
0..100
```

Current v1 adjustments:

- any logged session under 5 minutes: +2 momentum
- any logged session of 5+ minutes: +5 momentum
- first daily milestone completion: +15 momentum
- completed days roll forward with no decay
- missed day with partial progress: -3 momentum
- missed day with no progress: -6 momentum
- return after a multi-day gap: add -6 for each extra missed day, capped at -30 total decay

Momentum is intentionally recoverable. It is not a streak replacement with a different name; it should feel elastic. Partial sessions soften missed-day decay, and a long gap bends momentum without resetting it.

## Streak model

Track these values for later use:

- current streak
- best streak
- milestone completion dates
- recent consistency windows

Streaks may power specific glyphs/builds, but the baseline app should not depend on strict streak pressure.

## Lattice model

The lattice begins with:

```txt
Domain Sphere -> Center Sphere
```

Later it grows to roughly 6-10 domain spheres around the Center.

Connections are directed and can be active/inactive. The current routing UI lets users retarget routes, pause/run them, swap non-Center direction, and set outgoing allocation percentages that normalize to 100%.

## Sphere roles: future design space

Spheres may become specialized through glyphs/upgrades:

- generator: produces high energy directly
- buffer: amplifies connected spheres
- converter: changes one output type into another
- stabilizer: reduces decay or protects momentum
- catalyst: spikes output during active sessions
- global modifier: applies lattice-wide effects

## Glyphs

Glyphs are sphere-slotted modifiers that create build variety. Domain spheres earn slots at levels 1, 4, and 7 for 1 Sphere Point each. Unlocking the first slot triggers a guaranteed choose-one-of-three glyph reward; later Glyph Forge rolls cost `floor(75 × 1.85^forgeCount)` Energy and reveal three choices.

Potential glyph design axes:

- momentum scaling
- streak scaling
- 5-of-7-day consistency
- total lifetime XP
- active session duration
- short-session frequency
- recovery after missed day
- connection count
- center proximity/routing

Example glyphs:

- Chain Glyph: rewards consecutive milestone days.
- Resilience Glyph: rewards recent consistency instead of strict streaks.
- Deep Work Glyph: rewards longer sessions.
- Spark Glyph: rewards returning after a miss.
- Persistence Glyph: scales with lifetime time in the sphere.
- Resonance Glyph: buffs connected spheres during active sessions.

## Ritual gems

Ritual gems are a future ritual-level equivalent to glyphs. They should modify the gameplay meaning of specific activities without changing the sphere's domain identity.

Possible effects:

- improve active production for a ritual
- convert completion into extra momentum
- buff a connected sphere only during that ritual
- reward repetition/iterations/tasks
- interact with sphere glyphs

## Progression philosophy

Snowball should provide strategic depth without requiring over-optimization.

Good progression:

- offers interesting choices
- changes how the lattice behaves
- rewards experimentation
- unlocks gradually
- keeps the real activity loop simple

Risky progression:

- punishes missed days too harshly
- makes the user feel they are playing wrong
- requires too much setup before starting
- over-incentivizes fake/low-quality tracking

## Open balance questions

- How much stronger should active production be than passive production?
- Should passive production have offline caps?
- How quickly should momentum decay?
- Should milestone boosts scale with sphere level, target duration, or both?
- Should very long sessions have diminishing returns?
- How should sphere slot costs scale?
- What is the first compelling non-streak glyph build?
- Should Sphere Points alone buy permanent identity nodes, or should stronger nodes also require Energy?
- How quickly should advanced Glyph Forge rarity tiers enter?
- Should stronger sphere identity nodes add Energy gates, or remain Sphere Point only?
