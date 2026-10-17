# Story error diagnostics

Story quests now retain a non-blocking recap of observed incorrect submissions. The Oxanium squircle icon sits below the quest map with the exact unresolved-error count. After an attempt ends or returns to the world, a **New error logged** ribbon slides out to the left of the icon, then retracts toward it. It waits for the world HUD to be visible.

Select the icon to open a scene-owned sidebar. Repeated errors with the same correction share one recap with a **Seen N times** count and the latest example. IP-class mistakes group by the chosen/expected class pair, even when the IP address changes; different class confusions and other error types remain separate. The badge counts distinct unresolved errors rather than every repeated submission.

Pinned recaps appear first, with the newest entries first within each section. Select a row to read the submitted answer, expected result, a highlighted explanation, and a next-step hint. **Pin error** keeps it across quest changes; the same control unpins it. Starting a different quest automatically deletes unpinned recaps. Restarting the same quest, advancing to another objective in it, or loading its save does not clear the list. **Leave unresolved** keeps the recap until the next quest unless pinned. **Debug · Acknowledge** removes even a pinned recap through a pixel-mask dissolve and list collapse. Acknowledging means “I understand”; it does not change answers, scores, mastery, quest completion, or assessment telemetry.

Achievements are anchored below this HUD area. They remain queued while the diagnostic sidebar is open or the viewport cannot fit the banner below the icon. Empty journals remain accessible with a zero badge and an explanatory empty state.

## Explanations

Each gameplay directory contains its own diagnostic class, loaded in the existing gameplay bundle:

| Gameplay | Diagnostic module | Explanation |
| --- | --- | --- |
| IP Wires / harder | `gameplay1/IPWires/ip_wires_diagnostic.js` | Recorded IP, chosen class, expected class and shared first-octet range |
| IP Patch Panel | `gameplay2/IPPatchPanel/ip_patchpanel_diagnostic.js` | IP classification versus classful default-mask routing |
| CIDR Panel / harder | `gameplay3/CIDRPanel/ip_cidrpanel_diagnostic.js` | Octet bit weights, binary mask and total prefix bits; harder-mode target context |
| Subnet Simulator | `gameplay4/SubnetSimulator/ip_subnetsim_diagnostic.js` | Borrowed/host bits, total versus usable counts; explicit legacy subnet rule |
| Host-Power Reactor | `gameplay4_5/HostPowerReactor/ip_host_power_diagnostic.js` | Minimum sufficient host bits, usable capacity and excess allocation |
| Network Re-Segmentation | `gameplay5/CIDRQuarantine/ip_cidr_quarantine_diagnostic.js` | Class/default prefix, borrowing, new CIDR, host bits/capacity, route connectivity/virus errors |
| Subnet Blaster | `gameplay6/CIDRQuarantineMatrix/ip_subnet_blaster_diagnostic.js` | Network/broadcast direction, inclusive boundary adjustment, block size versus usable hosts |
| Network Repair | `gameplay7/NetworkRepair/network_repair_diagnostic.js` | Selected formula-variable sets and individual ordered token slots |
| VLSM Allocator | `gameplay8/VLSMAllocator/ip_vlsm_allocator_diagnostic.js` | Capacity, smallest fitting prefix, alignment, containment, overlap and final coverage |

The shared class and registry live in `gameplay/common/gameplay_diagnostic.js`. Explanations use observed data and the existing `IPClassRanges` source. The game’s Class A partition is 0–127; the recap explains that 0/8 and 127/8 have special uses. Default masks are not mistaken for ordinary Class E IP packets. The simulator’s legacy usable-subnet rule is identified explicitly rather than presented as a universal modern rule.

## Lifecycle and persistence

- `GameManager._closeReportAttempt` supplies canonical decision history on successful and failed Story attempts. A successful retry still retains the earlier mistakes.
- Terminal failure recovery can switch to the previous quest before the attempt closes. The journal accepts that failed attempt only when its recorded rollback destination matches the current quest and map. Its recap retains the failed quest's identity and stays available in the recovery world; repeated wrong matches share one row and a repeat count. A later quest change still clears unpinned recaps.
- Return-to-world/cancellation captures the current assessment history before releasing the active screen. A clean cancellation creates no error. Resume and final completion reconcile with already logged recaps.
- Canonical wrong decisions take precedence over mirrored mistake events. Observed-value fingerprints prevent callback replay from inflating counts; semantic error keys merge repeated corrections. Repeats update the latest example and count without creating another row or another new-error notification.
- Timeouts and failures without a specific recorded wrong answer receive an unfinished-attempt recap, not an invented mathematical diagnosis.
- State is stored at `Core.Game.current.ip2liveGameStates.errorDiagnostics`, alongside other campaign state. The existing Story snapshot, manual save and autosave paths carry it, including pins and repeat counts. New observations, pin changes, quest cleanup and acknowledgement request autosave/checkpoint updates; saving still depends on the existing storage service succeeding.
- `QuestManager.startQuest` and a current-quest synchronization guard clear unpinned logs at a quest boundary. Quest identity includes the map. Late completion callbacks from a previous quest cannot recreate expired rows. Existing saves are compacted on first access, preserving the newest example and any pin.
- Cleared observation identities remain in `seen`, preventing acknowledged recaps from returning when a suspended attempt later finishes. New campaigns start with a fresh state. Profile ownership and runtime-view cleanup prevent another learner’s recaps leaking into the next campaign.
- Practice, Endless, PVP, developer simulations and isolated tutorial replays do not populate the Story journal. Historical missing answers are not reconstructed.

## Interface behavior

The sidebar pauses the world by owning the top scene and consumes game input. Keyboard focus stays in the dialog; Escape and the close button return to the world. The list and details scroll independently. Narrow viewports switch to list/detail views with an **All mistakes** back button. Reduced-motion settings skip the dissolve and drawer transition. User-supplied answers are rendered as text rather than HTML.

The design uses circuit artwork, inset squircle framing, layered scanline/diagonal textures, clipped panel corners, amber pin accents, cyan expected-result cards and separated instructional sections. The refined sidebar uses tighter card padding, 1.55 line spacing for explanations, compact metadata, class-pair summaries and a visible quest-cleanup policy. Oxanium uses the project’s existing local font.

## Local preview

Run `node tools/build-diagnostic-preview.cjs`, then open `tests/fixtures/error_diagnostics_preview.html`. The file embeds the production journal, adapter and UI sources and requires no web server. It uses a simulated world and example decisions, not actual student data. `?panel=1&detail=1` opens an example detail. The preview’s demo buttons can log another error, advance to another quest, or queue an achievement. Pin a row, close the sidebar, then start the next quest to verify retention.

Regenerate the preview after changing source files. For the game itself, reload the project/plugin or make a fresh export so all new diagnostic modules are included.

## Verification — 17 October 2026

The automated suite covers targeted explanations for all 11 variants; repeated/mirrored observations; grouping across different examples; old-save compaction; pin controls and persistence; actual quest-start cleanup and objective/restart exceptions; late callbacks; Story-only exclusions; cancellation/resume; actual GameManager completion/failure integration; JSON and actual Story snapshot/restore persistence; profile isolation; acknowledgement without score changes; sidebar actions and pixel masks; achievement placement/queuing; autosave requests; and external scene cleanup. The IP Wires failure regression exercises three incorrect submissions through the real screen, gameplay manager, GameManager, NeuralLifeForce and QuestManager, verifying both first-quest retry and rollback, the sidebar's single recap with Seen 3 times, persistence, and subsequent cleanup.

Run `node --test tests/error_diagnostics.test.cjs`. Relevant existing regression suites are `gameplay_assessment_telemetry`, `telemetry_learning_evidence`, `story_persistence`, `story_autosave`, `quest_hud_layout`, `save_lifecycle_guards`, and `gameplay_pause_persistence`.

The complete repository suite also reports existing failures in gameplay music registration, ending music registration, Host-Power debounce timing, the Host-Power tutorial’s “five fixed lanes” expectation, and PVP Subnet Blaster music selection. These failures were reproduced with the new GameManager diagnostic integration removed in memory, without altering workspace files. They remain outside this feature’s changes.

See `docs/testing/error-diagnostics/` for captured execution logs and the final test summary. UI interaction tests use a DOM harness. No connected browser was available for an interactive visual check, and a full RPG Paper Maker campaign playthrough was not performed; the local preview and exported game should receive a visual/runtime smoke check before release.
