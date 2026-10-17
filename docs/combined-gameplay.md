# Combined gameplay toolkit

Combined adds a centered, rendered equipment icon below the main world's distance bar, without a text label. Its grid contains all 11 gameplay variants, including Host-Power Reactor and the harder Wires and CIDR panels. The grid opens with a short fade and scale transition, honoring reduced-motion preferences. It uses textured metal panels, extruded polygon faces, inset equipment emblems, and cyan/red terminal accents. The world behind gameplay windows stays visible with light dimming and a subtle blur, prepared once when opening. Each adapter is a separate `*_windowed_version.js` file beside its existing gameplay file, with **Windowed Version** in its label.

Each tool opens the existing playable puzzle in a draggable window with a fixed 16:9 content area. Windows are 800 design pixels wide, reduced from 1000, and stay clear of the bottom tabs. Drag the title bar to move one. Multiple tools can stay open; clicking a window focuses it. The minus button or Escape minimizes a tool into a bottom tab that shows its name and remaining time. Minimizing the last visible window returns control to the world. Click a tab to restore the same puzzle. Each window and tab has an × button that discards that instance and stops its timer. Closing the toolkit grid exits it fully and closes its tools. Native calculators stay within their owning windows.

Minimizing animates the window down into its matching tab over 340ms. Closing a window, minimized tab or the grid shrinks and fades its last frame over 190ms. These are visual snapshots, capped at 960×600: minimized timers keep running, closed tools are removed from saves immediately, and restoring a tab cancels its pending minimize visual. Reduced-motion preferences disable these effects.

Open tools keep running when unfocused, minimized or covered by the grid, including their native countdowns. Minimized tools update from the main world scene without rendering their hidden canvases. A game pause/menu or leaving the current floor suspends them; loading a saved game preserves the remaining budget rather than charging for time away. The toolkit does not complete Story quests, unlock lessons, affect Life Force or write assessment reports. Final-puzzle logic is deferred.

## Manual saves and autosaves

On Stage 4 Levels 1–4 (maps 15–18), the shared Story snapshot captures each floor's Combined state under `gameStates.combinedGameplayFloors[mapId]`. It stores puzzle inputs, scenarios, remaining timers, window positions, statuses, results and pending-instance counts. Manual saves and transactional autosaves use the same capture path. Periodic autosaves also run with the Combined grid or a tool window open. Opening, minimizing, closing or finishing tools requests an autosave checkpoint.

Loading restores saved tools into bottom tabs. The puzzle state and window position return when a tab is clicked; calculators and transient pointer/held-key state are reset. Each floor retains separate data, and different campaigns/save slots cannot inherit one another's live windows. Closing an instance removes it from subsequent saves. The existing shared gameplay capture continues to save regular Stage 4 Network Repair and VLSM terminal state too.

## Floor toggles

Every stage floor has an explicit `combinedGameplayEnabled` boolean in `GameManager.flowConfig.maps` in `Plugins/IP2Live_Core/modules/game_manager.js`. Only map **18 / Stage 4 Level 4** is enabled for testing. Set a floor's boolean to `true` to make the toolkit available there. Tutorial maps have no toolkit by default.

## Pending-instance badges

Badges start at zero and are hidden when there is no pending work. A future puzzle controller can supply its counts without changing the grid:

```js
IP2Live.CombinedGameplay.setPendingCounts({
    ip_class_wires: 3,
    ip_cidr_binary_panel: 2,
    ip_subnet_simulator: 1,
});
IP2Live.CombinedGameplay.setPendingCount('ip_class_wires', 4);
IP2Live.CombinedGameplay.getPendingCount('ip_class_wires'); // 4
```

Use the IDs in `IP2Live.WindowedGameplay.definitions`; this registry also exposes each tool's name and constructor adapter. Each successful tool instance consumes one pending count, once. Failure, minimization and cancellation leave the count unchanged. Counts above 99 display as `99+`; exact counts remain available through the API. The toolkit button shows their total. Counts and results are stored with that floor's tools; they are not final-puzzle objectives.

`IP2Live.CombinedGameplay.launch()` opens the grid on an enabled floor. `IP2Live.CombinedGameplay.desktop.openTool(index, options)` opens/focuses a registered window; `options` can supply a standalone scenario, problem or time limit. The desktop's `session.results` contains local tool outcomes for inspection. Add final-puzzle orchestration separately when ready.

## Validation and preview

Run `node --test tests/combined_gameplay.test.cjs tests/gameplay_timers.test.cjs tests/gameplay_pause_persistence.test.cjs tests/story_persistence.test.cjs tests/story_autosave.test.cjs tests/load_resume_game_state.test.cjs tests/save_lifecycle_guards.test.cjs`.

`tests/fixtures/combined_gameplay_preview.html` is an interactive canvas preview using the real gameplay classes and a simulated world backdrop. `?tool=0` through `?tool=10` opens a tool, `?state=hud` shows the main-screen button, `?state=dock` shows three minimized bottom tabs, and `?tool=2&multi=1` shows multiple windows. The preview supplies example notification counts. Run `tools/render-combined.ps1` to render every tool, or choose `-States grid,hud,cidr,dock -Width 800 -Height 480` for a compact layout.
