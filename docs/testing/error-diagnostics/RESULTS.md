# Error diagnostics test record — 17 October 2026

Environment: Windows; Node v24.14.1. Source: local working tree based on HEAD `1362354`, including existing uncommitted work and the new diagnostic feature. This is a development verification record, not a tagged/deployed release certificate.

Latest bug fix: IP Wires terminal-failure rollback was changing the active quest before the attempt closed. The stale-quest guard then discarded all three wrong submissions. The fix recognizes a terminal failure whose rollback destination matches the current quest and map, allowing its recap to appear in the recovery world without changing normal quest cleanup.

| Execution | Actual result | Evidence |
| --- | --- | --- |
| Reproduce three wrong matches before the fix, using the real IP Wires screen, gameplay manager, GameManager, NeuralLifeForce and QuestManager | First-quest retry passed; rollback failed with 0 recaps instead of 1. | [Reproduction log](rollback-reproduction-2026-10-17.log) |
| Fixed diagnostic cases + nine relevant existing regression files | 38 passed; 0 failed. Includes 29 diagnostic cases. | [Rollback fix focused log](rollback-fix-focused-2026-10-17.log) |

The fixed path produces one recap with **Seen 3 times** after returning to the world. Tests verify the original failed quest and address/class details, zero change to assessment counts or life-force loss, persistence across world refresh/save reload, duplicate callback protection, and cleanup at the next quest. Guard cases reject mismatched recovery destinations/maps, successful/cancelled attempts, non-terminal exits and excluded tutorial/developer activity. JavaScript syntax and regenerated preview compilation also passed. The full repository suite was not rerun for this focused fix; its earlier results follow. No interactive campaign playthrough was performed.

Earlier refinement run (duplicate grouping, pins, quest cleanup and tighter sidebar):

| Execution | Actual result | Evidence |
| --- | --- | --- |
| Refined diagnostic cases + seven relevant existing regression files | 33 passed; 0 failed. Includes 26 diagnostic cases. | [Refinement focused log](refinements-focused-2026-10-17.log) |
| Full repository suite after refinements | 270 checks; 265 passed; the same 5 existing failures remain. | [Refinement full regression log](refinements-regression-2026-10-17.log) |

Additional checks cover grouping different IP examples with the same class confusion, retaining distinct corrections, repeat counts without callback inflation, automatic compaction of existing saves, pin/unpin controls and save persistence, real quest-start boundaries, same-quest restarts/objective changes, cleanup of stale sidebar selection, mode isolation, and late callbacks that would otherwise recreate expired logs. Syntax and generated preview compilation also passed. Interactive visual checking remains unavailable because no browser is connected.

Original implementation run:

| Execution | Actual result | Evidence |
| --- | --- | --- |
| New diagnostic cases + seven relevant existing regression files | 23 passed; 0 failed. Includes 16 new diagnostic cases. | [Focused log](focused-2026-10-17.log) |
| All repository `*.test.cjs` and `*.test.mjs` files | 260 checks reported by Node; 255 passed; 5 failed. | [Full regression log](regression-2026-10-17.log) |
| Reproduction of the five failures with the new GameManager diagnostic integration removed in memory | 14 checks; 9 passed; the same 5 failures reproduced. Workspace sources were not reverted or modified for this comparison. | [Baseline failure log](baseline-failures-2026-10-17.log) |
| JavaScript syntax and generated preview script compilation | Passed | Checked with `node --check` and `vm.Script` |
| Interactive browser / full campaign playthrough | Not performed: no connected browser; no RPG Paper Maker campaign session was run | Use the local preview and packaged-game checklist below |

Node’s count combines individual `node:test` cases and existing file-level assertion scripts. It is not a count of user acceptance requirements.

## Existing failures

- `gameplay_bgm.test.cjs`: gameplay music registration/copy expectation.
- `story_ending_audio.test.cjs`: ending music registration/copy expectation.
- `host_power_reactor.test.cjs`: manual debounce is 230 ms while the test expects 160 ms.
- `stage3_gameplay45_progression.test.cjs`: tutorial text does not match the existing “five fixed lanes” assertion.
- `pvp-mode.test.cjs`: Subnet Blaster gameplay music-profile expectation.

No claim is made that the whole project passes regression. These failures were left unchanged by this feature.

## Packaged-game smoke check still needed

1. In Story, submit an incorrect IP Wires match, then finish or return to the world. Verify the badge, retracting notification and recorded address/class explanation.
2. Repeat in CIDR, Host-Power, Subnet Blaster and VLSM with a known invalid answer. Confirm expected answers and explanations match the actual recorded attempt.
3. Leave a recap unresolved, save/close/reload, and verify it remains. Debug it and reload again; confirm it stays cleared and scores do not change.
4. Resume a previously cancelled puzzle and complete it; confirm old mistakes are not duplicated and new mistakes are added separately.
5. Open/close by mouse and keyboard, resize to a smaller viewport, scroll long details, and check the reduced-motion setting.
6. Verify achievements appear below the diagnostic area and wait while the sidebar is open. Confirm the HUD is hidden in gameplay/pause/menu and optional non-Story modes.
7. Load another campaign/profile or start a new Story. Verify the previous campaign’s recaps do not appear.
8. Make the same class mistake with a different IP: verify one recap, an increased **Seen** count, and the latest example. Check a different class confusion still produces its own row.
9. Pin an error, start another quest, and verify only pinned errors remain. Save/reload the same quest and confirm its logs and pins stay. Unpin an old recap and start the next quest to verify removal.
10. In a later IP Wires quest, submit the same incorrect match three times until attempts are exhausted. After rollback, verify one recap with **Seen 3 times**, the original address and failed-quest context. Check the same flow on the first quest, then verify the next quest clears the unpinned recap.

The runnable local UI preview is [error_diagnostics_preview.html](../../../tests/fixtures/error_diagnostics_preview.html). Its background and decisions are simulated; it is not evidence of an actual campaign playthrough.
