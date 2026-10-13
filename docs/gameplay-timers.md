# Gameplay timer parameters

Every gameplay screen, including both harder variants, accepts the same optional second constructor argument in seconds:

```js
new IP2Live.CIDRPanelGameplayScreen(options, 120);
new IP2Live.HarderWiresGameplayScreen({ endlessMode: true }, 90);
```

For game managers and quest assignments, use `timeLimitSeconds` (or `timeSeconds`):

```js
IP2Live.PatchPanelGameplayManager.launchPatchPanelGameplay({
    ...launchOptions,
    timeLimitSeconds: 120,
});

// A quest's spec can also carry the default for that particular puzzle.
const spec = { ...questSpec, timeLimitSeconds: 150 };
```

Resolution order is: valid constructor argument → launch options → quest spec → gameplay default. Within options or a spec, `timeLimitSeconds` takes priority over `timeSeconds`, followed by the gameplay's legacy aliases. Positive numeric strings and fractional seconds work; the minimum is one second. Invalid, infinite and negative values fall through to the next valid value.

| Gameplay | Default solve budget | Story / Practice behavior | Legacy timer alias |
| --- | --- | --- | --- |
| 1: IP Wires / harder | 180 seconds | Untimed | — |
| 2: Patch Panel | 180 seconds | Untimed | — |
| 3: CIDR Panel / harder | 180 seconds | Existing countdown | `solveTimeSeconds` |
| 4: Subnet Simulator | 180 seconds | Existing countdown | `time`, `solveTimeSeconds` |
| 4.5: Host Power Reactor | 120 seconds | Existing countdown | `durationSeconds` |
| 5: Network Re-Segmentation | 180 seconds | Existing countdown | — |
| 6: Subnet Blaster | 180 seconds | Untimed solve; existing preparation timer | — |
| 7: Network Repair | 180 seconds | Untimed | — |
| 8: VLSM Allocator | 180 seconds | Untimed | — |

The formerly untimed games activate their solve countdown and its HUD only with `endlessMode: true`. `unlimitedMode: true`, `featureMode: 'endless'`, and the same flags inside `options.spec` are accepted aliases. Merely supplying a duration does not add a timer to Story, Practice or PVP. Existing timed games retain their normal countdown UI in those modes. Gameplay 5 still accepts `timeLimitSeconds: 0` outside Endless to preserve its previous untimed option.

The new three-minute default for formerly untimed games lives in `gameplay/common/gameplay_timer.js` as `IP2Live.GameplayTimer.DEFAULT_SECONDS`. The loader includes this common module before loading the gameplay screens. Isolated screen tools and fixtures should load it in the same order.

## Endless rounds

The Endless controller supplies a shorter budget when constructing each new round. It starts every gameplay, including the Reactor, at 180 seconds. Its balance settings are in `modules/endless_rules.js`; see [Endless mode](endless-mode.md).

```js
// Standalone screen example. The real Endless controller manages the run deadline.
const screen = new IP2Live.NetworkRepairGameplayScreen({
    endlessMode: true,
    onComplete(result) { /* controller chooses the next round */ },
    onFailed(result) { /* result.reason === 'time_expired' on timeout */ },
}, secondsForThisRound);
```

Timers cover the entire screen challenge. Packet retries and Subnet Blaster encounters do not replenish the solve budget. Change the duration by creating the next screen with a new parameter, rather than mutating an existing timer's fields. The harder Wires class is created by `HarderWiresGameplayManager._ensureHarderScreenClass()` when first launched through its manager.

Gameplay 6 also accepts `preparationTimeSeconds` in its options or quest spec, defaulting to 60 seconds per encounter. This controls the existing planning timer independently of the Endless solve budget. The Endless budget includes planning and combat, while automatic encounter animations do not consume it.

Countdowns use active frame time. Pause menus, background scenes, hidden/unfocused windows and tutorial dialogues do not consume time. New timers also pause during help/calculator overlays and guided lessons. Suspension gaps over one second are ignored. There are no timer intervals or additional input listeners. Host Power Reactor persists a remaining-time value so pausing does not spend its solve budget; older deadline-based saves are migrated on restore.

Standalone expiration commits once through the gameplay's failure callback. Existing timed games keep their timeout animations in Story/Practice. During an actual Endless run, the controller owns one authoritative clock, synchronizes native countdown displays, and immediately ends a round at zero. Results expose `timerEnabled`, `timeLimitSeconds`, and `timeRemainingMs`. Untimed results report an effective limit of zero and retain `configuredTimeLimitSeconds` for future use. Reports compare different recorded solve/preparation budgets separately.

Validation: `node --test tests/gameplay_timers.test.cjs tests/endless_mode.test.cjs` exercises constructors and managers, countdown rendering, expiry, pause/focus/dialogue suspension, internal retries, configured durations, and actual Endless run lifecycle, handoff, scoring, certificates and telemetry.
