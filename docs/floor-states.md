# Floor states

`Plugins/IP2Live_Core/modules/game-state/floor_state_config.js` is the configuration entry point. Its `levels` table is organized **level → gameplay → state names**. `gameplayStates` supplies defaults for any floor, so adding Gameplay 1 or its harder variant to a new map automatically gives it the `darklights` state.

GameManager's `mapGameplayAssignments` remains the sole list of gameplay objectives. The state manager derives its objective totals from that list instead of maintaining a second set of quest IDs. Tutorial wire objectives count once, as do ordinary and harder wire objectives. Multiple wire objectives in one quest each contribute one step.

| Level | Map ID | Standard wire objectives | Harder wire objectives | Total light steps |
| --- | --- | --- | --- | --- |
| Stage 1 Level 1 | 3 | 4 | 0 | 4 |
| Stage 1 Level 2 | 4 | 5 | 0 | 5 |
| Stage 1 Level 3 | 5 | 2 | 4 | 6 |
| Stage 1 Level 4 | 6 | 3 | 2 | 5 |

## Lighting progression and setbacks

Each floor starts dark, with a small player visibility area. Restoration is `completed wire objectives / total wire objectives` across both wire variants. Each completed wire objective reduces the darkness overlay by an equal share and raises the native map light multiplier by an equal share. Other gameplay completions do not add wire progress. All wire objectives must be complete before the darkness, restricted vision and added fog are removed and authored map lighting/fog are restored.

The completed quest table is authoritative once the floor's quests are registered. A terminal failure uses NeuralLifeForce's existing previous-quest rollback. Restarting that quest triggers a state reconciliation immediately: any wire objectives removed from the completed quest table also lose their light contribution. This works even if the failed gameplay was Patch Panel and the reopened quest was harder Wires. Repeating the notification cannot remove another light step. A retry without a quest rollback does not undo unrelated repairs.

Fully lit floors retain their completed objective evidence, so they can darken again after a quest restart. Partial progress, setbacks, slot loads and autosave loads use the same reconciliation. Existing `darklights.maps` save records and legacy Stage 1 fields remain compatible. If the quest table has not loaded yet, saved objective evidence supplies the temporary state; once quests are restored their actual completion takes precedence over old brightness or `cleared` flags.

Practice, Endless, PVP, developer gameplay replays and tutorial replays cannot change campaign floor states. Opening a floor without the state clears the previous floor's transient effect. Starting a new Story clears the runtime effects and creates separate progress.

## Configuration

For example, Stage 1 Level 3 contains both wire variants:

```js
5: { name: 'Stage 1 Level 3', gameplays: {
    ip_class_wires: ['darklights'],
    ip_class_wires_harder: ['darklights'],
} },
```

Shared darkness settings are under `stateDefaults.darklights`:

| Setting | Default | Meaning |
| --- | --- | --- |
| `startingDimOverlay` | 0.88 | Darkness overlay at zero completed wire objectives, clamped to 0–0.95 |
| `minimumSceneLightMultiplier` | 0.2 | Native map light intensity multiplier before repairs, clamped to 0–1 |
| `baselineBrightnessStep` | 1 | Compatibility baseline for saved brightness counters; completion always uses the actual objective ratio |

Use a level's `states.darklights` object to override these settings for that floor. Use an empty gameplay array such as `ip_class_wires: []` to disable that gameplay's default state on a particular level. A gameplay can drive multiple registered states by listing several names.

## Adding another state

Register its handler with the existing state manager and add its module to the game-state loader in `code.js`:

```js
IP2Live.GameStateManager.registerState('dataRecovery', {
    activate(manager, context) {
        // Apply/update the effect for context.mapId and context.progress (0–1).
        // context also contains scene, completedCount, totalObjectives,
        // completedObjectives, config and reason.
    },
    clear(manager, context) {
        // Restore resources when complete, leaving the floor or starting a Story.
        // context.fullRestore identifies full completion; temporary identifies exit.
    },
    // Optional: update(manager, scene), drawHUD(ctx, manager, scene).
});
```

Then bind it under a level's `gameplays`, for example `ip_cidr_binary_panel: ['dataRecovery']`. Its progress is calculated from that gameplay's actual objectives, including reversals, and persisted under `ip2liveGameStates.floorStates.maps`. Handlers must tolerate repeated activation and clear their scene resources in `clear`.

Inspect a detached description using `IP2Live.GameStateManager.getFloorDefinition(6)`, or inspect every level using `getFloorStateCatalog()`. Runtime edits inside assignment arrays or configuration objects require `invalidateFloorStateConfig(mapId)`, followed by `syncFloorStates(mapId, { force: true })` to refresh the visible floor. File edits take effect after restarting the game.

## Performance and verification

Floor definitions and objective lists are cached. State reconciliation runs on map entry, quest completion, quest restart/reset, progress restoration and gameplay failure; it does not scan the curriculum every frame. Duplicate completion/failure notifications do not recreate lights. Floors with no lighting preset are also cached by LightingManager, avoiding a repeated empty-preset application on every rendered frame.

`node --test tests/floor_states.test.cjs tests/load_resume_game_state.test.cjs tests/game_manager_map_assignments.test.cjs tests/neural_life_force_manager.test.cjs tests/input_quest_lifecycle.test.cjs` checks all current wire floors, harder variants, real rollback callbacks, duplicate notifications, full restoration, save loading, native light/fog restoration, isolation, future floor/state bindings and idle-frame costs.
