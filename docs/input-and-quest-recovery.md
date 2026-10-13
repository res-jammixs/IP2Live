# Movement and quest guide lifecycle fixes

The audit found several concrete failure paths consistent with intermittent movement and missing quest markers. There was no recorded play session identifying which path caused each tester's incident, so these fixes do not establish that every intermittent game issue is resolved.

## Input and screen changes

- The installed RPG Paper Maker engine uses `Common.Inputs.keysPressed` (a Set) and `lockedKeys` (a Map). The plugin's older movement filters used `Manager.Events.keysPressed`, an array. They also looked for model fields directly on graphics wrappers and passed shortcut arrays to a comparison function that expects a keyboard model.
- Four-way movement now filters map key dispatch instead of deleting secondary keys from the engine's held-key ledger. A held second direction can take over when the first is released. Current bindings are read from keyboard models, so reassignment is respected.
- `modules/input_guard.js` supports both current and legacy input stores. Stack changes, window blur, and hiding the document clear transient pressed keys, camera-angle locks, and mouse buttons. Capture-phase key release cleanup also works when a DOM input stops bubbling. No additional keydown listener is installed.
- Pause actions capture the selected action once, reject duplicate activation, and cancel delayed actions on Resume or close. A departed pause menu cannot later reopen a save screen. World dialogue listeners suspend while Pause and its child menus are open.
- The world-pause Resume action no longer rejects its own dispatch as an already-running action. Mouse and keyboard Resume both finish the closing animation. Competing input is blocked at the event handlers while an action runs.
- Reset Defaults updates the existing keyboard models, clears held input and writes one complete settings snapshot. Older engines serialize individual writes; all keyboard-menu instances share the write queue. Duplicate reset requests are ignored, a closed menu cannot apply a delayed defaults response, and finishing a settings write does not clear input on another screen. Failures remain visible and can be retried. Escape or Back cancels key assignment, and conflicting movement/menu bindings are rejected before they can strand navigation.
- Tutorial capture listeners ignore menus, hidden windows and replacement game/map owners. Delayed lesson advances wait for the map to regain focus. Saved-story restoration discards the previous tutorial's listeners, dialogue and held input before restoring the durable quest state. A background autosave does not reset input or change keyboard assignments.
- Dialogue instances, queued starts, and delayed triggers retain their game/map owner. Replaced saves or maps discard stale dialogue locks and suppression without running old completion callbacks.
- Cancelled menu transitions cannot execute deferred navigation. Failed stack changes release the global transition reference instead of leaving an invisible input lock.

## Quest markers and performance

- Quest updates ignore loading maps and background maps beneath overlays. Rendering a transition cannot reset quest entry state or complete an exit behind the overlay.
- Restored objective IDs are validated against the current quest. Invalid IDs fall back to its first unfinished objective. Auto-start floor quests restore guide visibility and completion readiness on returning to the foreground, and clear orphaned dialogue suppression. Manual tutorial visibility and completed objectives remain intact.
- A retained 3D scene can lose its children while the guide still caches its group. The guide now reattaches that group and restores its visibility. A new scene still gets its own guide.
- Rebuilding a guide disposes its exclusive geometries/materials exactly once, including shared path-dot resources. Floor quest registration is cached by manager/catalog identity instead of walking every floor each frame; late GameManager initialization still refreshes registration.

## Verification

```powershell
node --test tests/input_quest_lifecycle.test.cjs tests/keybindings_lifecycle.test.cjs tests/menu_transition.test.cjs tests/pause_tv_transition.test.cjs tests/story_autosave.test.cjs tests/story_persistence.test.cjs tests/gameplay_pause_persistence.test.cjs tests/load_resume_dialogue_guards.test.cjs tests/popup_menu_controls.test.cjs tests/tutorial_dialogue_centralization.test.cjs tests/story_prologue.test.cjs

# Optional: exercise the actual engine input dispatcher installed on this PC.
$env:IP2LIVE_ENGINE_DIR = 'C:/Program Files (x86)/Steam/steamapps/common/RPG Paper Maker/resources/app/dist/Scripts'
node --test tests/input_quest_lifecycle.test.cjs tests/keybindings_lifecycle.test.cjs
```

The regression checks cover legacy arrays and current Sets/Maps, overlapping keys, 100 rapid pause/focus cycles, the full Settings/Reset Defaults/Resume path, ordered settings writes, failed or delayed defaults reads, cancelling key assignment, hidden tutorial/dialogue listeners, stale map callbacks, autosave input isolation, invalid saved objective IDs, background exit completion, marker reattachment and GPU resource disposal. The installed engine dispatcher also passed 20 repeated Reset Defaults/keyboard Resume/movement cycles. All **37 focused checks** passed with the installed-engine checks enabled.

The full suite passed **177 of 179 checks**, including the installed-engine tests. The two known baseline failures are in `host_power_reactor.test.cjs` (expects a 160ms firing cooldown; the existing gameplay uses 230ms) and `stage3_gameplay45_progression.test.cjs` (expects old "five fixed lanes" tutorial wording; the existing tutorial describes the collector tether). Those gameplay/tutorial paths were not changed by this lifecycle fix.

For a packaged playtest, re-export or prepare the updated plugin, then test held W/D with Escape, repeated Pause/Settings/Resume, autosave recovery and numbered saves mid-quest, and Alt-Tab while holding a direction. Release and press movement keys after returning. Complete the remaining objectives and verify that the exit beacon appears and teleports exactly once. Automated checks do not replace a full story playthrough in the packaged game.
