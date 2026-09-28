# Story autosave

Story Mode keeps one recovery point in `IP2Live_Database` (IndexedDB version 4), in the `storyAutosaves` store under the `current` key. The schema upgrade preserves existing profile and telemetry stores.

A checkpoint is requested on the first ready story map and after a whole quest completes. Map-changing quests wait for the destination map and quest state. A checkpoint can finish while Pause is open. Practice sessions, tutorial replays and developer gameplay tests do not create story checkpoints.

The record contains native engine save data and the GameManager progress snapshot, including a story-run ID, player identity, position, quest state, life force, gameplay state and elapsed time. The full record is replaced in one read/write transaction; success is reported only at transaction completion. Strict durability is requested where supported. A failed or interrupted write retains the last committed record.

The service intercepts only reserved engine slot `-2`, which is never a numbered/manual save. Native `Game.save()` runs on a temporary engine instance, preserving the live game's slot and save counter. Capture and manual save operations share the GameManager save queue. Autosave restore uses the engine's native `load()` and the same quest/map restoration helper as manual saves, with no active manual slot.

## Player flows

- **AUTOSAVED** enables when a valid checkpoint exists and shows player, location and timestamp before resuming through the TV transition.
- **New Story** offers Resume Autosave or Start New Story; Escape dismisses without taking either action. Cancelling name entry leaves the previous autosave intact. A new story replaces it only after its first checkpoint commits.
- Loading a different manual story warns before transferring autosave protection. Failure to load leaves the previous autosave intact. Manual Save Story does not delete the recovery point.
- “Saving story…” changes to “Story autosaved” only after commit. Failure displays a message and retries when the next checkpoint is requested.

Recovery covers the last committed checkpoint, not unsaved actions after it. Deleting application/site data also deletes IndexedDB; this is not a substitute for a separately kept manual save.

## Verification

Run `node --test tests/story_autosave.test.cjs` for queueing, failed/aborted writes, isolation, map transitions, story replacement, restoration and confirmation behavior.

Run `node tools/verify-story-autosave.cjs` on Windows for a real headless-browser test. It creates a temporary Edge profile, migrates a v3 IndexedDB database, calls the installed RPG Paper Maker engine's native save/load methods, commits a checkpoint, aborts an overwrite, forcibly terminates the browser, and verifies recovery after reopening that profile. It does not touch the player's database. Set `AUTOSAVE_TEST_BROWSER` or `AUTOSAVE_TEST_ENGINE` to override the installed browser executable or engine `Core/Game.js` path.
