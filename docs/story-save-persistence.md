# Story Mode save and recovery data

Numbered saves now include a version 2 `_ip2liveProgress` snapshot inside the native engine save payload. In browser builds, this goes through the engine's IndexedDB save path. Desktop builds retain their existing atomic file writes and integrity envelope. The engine state and its matching story snapshot travel together; profile records and localStorage remain compatibility caches.

The snapshot contains the story run and profile IDs, map and hero position, quest/objective progress, play time, map entry dialogue flags, persistent ambience/security/neural state, retained gameplay sessions, and resumable report attempt context. Shared gameplay manager data includes VLSM branch allocations and visit order, CIDR prerequisite handoffs, introduction flags, and recovery-loop counters. Gameplay sessions include their current problem, decisions, round history, timer state, and learning telemetry clocks. Gameplay 6 retains preparation progress, operator/block choices, barrier damage, bullets, boss impacts, hearts, boss health, and recorded encounter evidence.

The shared snapshot builder is used by manual saves, numbered checkpoints, and recovery autosaves. Each capture is detached from live objects. A mismatched map, malformed snapshot, or unsupported snapshot version is rejected before it can replace valid progress. Loading a new-format save uses its embedded snapshot instead of an unrelated sidecar. Stable profile IDs supplement profile names when checking older desktop metadata.

## Recovery autosave

IndexedDB recovery records use envelope version 2 in `storyAutosaves/current`. Existing version 1 records remain readable. The database itself upgrades additively to version 5, retaining existing stores and adding profile/story query indexes.

Recovery autosaves run every 30 seconds during eligible foreground map play or retained Story Mode gameplay. Map transitions, completed quests, gameplay pause/return, and an orderly application shutdown also request checkpoints. A story does not need a numbered save slot to receive recovery protection. Periodic captures wait while another menu is on top, the document is hidden, the map is loading, or a tutorial replay/practice/developer session is active. Map transitions save the destination once it is ready.

Save operations share a queue. Recovery writes wait for IndexedDB transaction completion; aborts and storage failures leave the previous committed recovery record intact. Switching stories invalidates queued captures and aborts an in-flight recovery transaction. A failed load restores the previous runtime ownership and quest context. Save status reports success only after commit.

There is one recovery record for the application, separate from numbered saves. The existing prompt protects it when switching stories; use Save Story for permanent checkpoints. Abrupt process termination or power loss can lose changes since the last successful checkpoint. Browser unload cannot guarantee completion of asynchronous storage work. No storage migration can reconstruct progress or telemetry that an older build never recorded.

## Restoring gameplay and report measurements

Restoration rebuilds map effects from persistent state and suppresses repeated map-entry briefings. It clears stale gameplay ownership/trigger locks, closes transient calculator/help overlays, and resets frame clocks so an open tool cannot freeze a restored gameplay. VLSM screens reconnect to the campaign manager's allocation state. New or legacy stories cannot inherit allocations or prerequisite handoffs from another run. Offline gaps do not become calculator dwell, active learning time, or restored attempt duration. Recorded historical timestamps stay unchanged.

A retained unfinished gameplay keeps its attempt ID and recorded mistakes when resumed. Returning to the quest suspends that attempt and excludes idle time before re-entry. Resumption records an `attempt_resume` event instead of a second `attempt_start`. If an old checkpoint's attempt already has a terminal report event, replaying that checkpoint starts a new attempt. Resuming does not erase prior report evidence or create extra game-over/tutorial counts.

Practice, developer testing, and tutorial replays cannot overwrite Story Mode saves. Previously registered scenes are bound to their originating game and cannot capture state into a different story.

## Verification

`story_persistence.test.cjs` exercises the native payload hooks with the real GameManager, including embedded state, failed writes, profile enumeration, legacy loading, autosave resume, failed replacement rollback, attempt identity, and offline/idle timing. `gameplay_pause_persistence.test.cjs` round-trips the actual Gameplay 6 screen. IndexedDB durability, desktop storage, autosave cadence/races, map effects, load/archive, shutdown, telemetry, and report tests cover adjacent behavior. These automated fixtures do not replace an end-to-end packaged-browser/device check.
