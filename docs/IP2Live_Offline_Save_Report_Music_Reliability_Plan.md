# IP2Live Offline Save, Report, and Music Reliability Plan

Version: 2026-08-21  
Target: RPG Paper Maker Windows desktop export  
Primary goal: a fully offline game whose save slots, progress metadata, attempt history, reports, and assigned music continue working after installation, restart, update, or moving the distributed package.

## 1. Release outcome

The Windows release must work without a server or internet connection. The installed application is treated as read-only. All changing player data is stored per Windows user below:

```text
%LOCALAPPDATA%\IP2Live\
  Saves\
    1.json
    1.json.bak
  Data\
    progress-slot-1.json
    storage-info.json
  Telemetry\
    2026-08.jsonl
  Reports\
    IP2Live_Report_<profile>_<timestamp>.pdf
    IP2Live_Report_<profile>_<timestamp>.xls
    IP2Live_Report_<profile>_<timestamp>.json
  Logs\
```

Core save slots and progress do not expire. Telemetry is retained locally indefinitely by default, so the most recent 90 days remain reportable. Generated reports remain until the Windows user removes them.

IndexedDB and `localStorage` remain enabled as offline mirrors and browser-build fallbacks. They are no longer the sole location of custom progress or attempt history in the hardened Windows build.

## 2. Reliability and security model

### Save transaction

Each RPG Paper Maker core save JSON contains an `_ip2liveStorage` section with the matching profile identity, save name, map, hero position, quest state, custom game states, timestamp, schema version, and SHA-256 checksum. The core state and IP2Live snapshot therefore commit together.

The desktop storage host performs this sequence:

1. Validate the logical slot and payload size.
2. Serialize and validate the complete JSON document.
3. Write a unique temporary file in the `Saves` directory.
4. Flush it to the operating system.
5. Preserve the previous verified save as `.bak`.
6. Replace the primary file.
7. Acknowledge success only after the write completes.

On load, the primary checksum is verified. If the primary file is corrupt or incomplete, the last valid backup is loaded. The checksum detects accidental corruption and casual editing; it is not proof against a device owner who can modify both the program and local files.

### Electron boundary

Production exports use a restricted preload bridge. The renderer sends logical operations such as “write slot 2” or “append this event”; it cannot supply arbitrary filesystem paths. The main process derives and validates every path below the IP2Live data root.

The post-export hardening step must set `nodeIntegration: false`, `contextIsolation: true`, limit RPG Paper Maker IPC to approved window operations, block unexpected navigation, and remove the unrestricted `save-file` channel. Direct Node access in `desktop_storage.js` is a compatibility fallback for the RPG Paper Maker editor and older test exports, not the preferred release boundary.

## 3. Telemetry and report completeness

Every new telemetry row receives a stable `eventId` plus profile, session, attempt, event type, timestamp, map/stage/quest context, result, timing, retry, mistake, accuracy, and security fields. Events are appended immediately to monthly JSONL journals and mirrored to IndexedDB only after/alongside the durable write.

The report process:

1. Drains pending telemetry writes.
2. Retries journal writes that previously failed.
3. Queries both the filesystem journal and IndexedDB mirror.
4. Deduplicates by `eventId`, with a deterministic legacy fingerprint fallback.
5. Filters by immutable `profileId` when present while retaining compatibility with legacy name-only rows.
6. Includes starts that lack a terminal row as `interrupted`, rather than silently dropping them.
7. Builds the selected PDF and SpreadsheetML `.xls` report.
8. Archives PDF/XLS plus a JSON evidence copy under `Reports` and writes SHA-256 sidecars.
9. Optionally triggers the familiar Downloads copy for user sharing.

The default report scope is 90 days; 7- and 30-day views remain available. Exports for an `UNKNOWN` profile are rejected instead of producing a misleading empty report.

All known gameplay cancellation exits must use `handleGameplayCancelled`. Passed and failed attempts remain assessed; cancelled and interrupted attempts are visible but unassessed. Clear-time statistics use passed attempts only.

## 4. Profile and cache handling

New profiles receive an immutable UUID `profileId`. Re-entering an existing display name preserves the existing profile, its UUID, and `progressBySlot` instead of overwriting the record. The UUID is embedded in the save transaction and all new telemetry.

Restore priority is:

1. Verified metadata embedded in the durable save file.
2. IndexedDB profile snapshot.
3. `localStorage` snapshot cache.

The durable progress sidecar is an additional diagnostic/recovery artifact, but it does not replace the RPG Paper Maker core save. The embedded metadata is authoritative on Windows; the two browser caches improve compatibility and allow the same codebase to keep working in a future browser export.

## 5. Save timing

Manual Save Game remains the explicit way to select and name a slot. Once a slot has been selected, the game also checkpoints it:

- every 60 seconds while a playable game and explicit slot exist;
- after gameplay completion;
- after a quest objective completes; and
- during a graceful application shutdown.

Automatic checkpoints never select or overwrite a slot for a brand-new player who has not selected one. A release usability follow-up may require initial slot selection before entering the tutorial if unconditional new-game autosave is desired.

## 6. Music packaging and playback

The nine IP2Live music tracks and two custom effects must be registered in RPG Paper Maker's `songs.json`, not merely placed in loose `Songs` folders. Stable assignments are:

| ID | Track | Assignment |
|---:|---|---|
| 9 | Main Menu.mp3 | Main menu, load, settings, credits, native title fallback |
| 10 | Tutorial.mp3 | Tutorial |
| 11–14 | Stage 1–4 Music.mp3 | Corresponding stage maps |
| 15 | Gameplay 1.mp3 | Default gameplay |
| 16 | Gameplay 2.mp3 | Patch-panel gameplay |
| 17 | Gameplay 5 & 6.mp3 | Later CIDR gameplay mapping |

Music effects use IDs 2 (`Typing.mp3`) and 3 (`Glitch01.mp3`) in the music-effect group.

`MusicManager` remains the public zone adapter used by current maps and gameplay modules, but playback is delegated to RPG Paper Maker's `Data.Songs`/Howler objects. This makes protected Windows exports use the base64 audio embedded by the exporter. No release code fetches `build/Songs/Musics/*.mp3`.

Playback uses latest-request-wins tokens, same-zone idempotence, fades, engine audio-context resume, and first-input retry. A new export is required after the song database changes; copying only the plugin into an old export cannot add omitted audio bytes.

## 7. Legacy migration

Migration is idempotent and non-destructive:

1. If a stable slot is empty, inspect legacy `resources\app\build\Saves\<slot>.json` locations.
2. Validate and import the legacy JSON into the stable save directory.
3. Do not overwrite an existing stable slot.
4. Keep the old file untouched for rollback.
5. Preserve the old `%APPDATA%\game` Chromium profile until an explicitly tested application-identity migration has completed. A newly isolated browser profile cannot query that old LevelDB automatically.
6. Export old reports or perform a controlled old-profile migration before relying on the new identity; new filesystem journal rows and the new IndexedDB mirror are merged by event ID/fingerprint after migration.

Changing the Electron package name alone can make old IndexedDB appear missing. The current preparation tool intentionally isolates new data and imports normal core JSON only when it is discoverable in the prepared installation's legacy save folder; it does not copy the collision-prone generic Chromium profile. Existing pilot users therefore need an explicit backup/migration procedure.

## 8. Reproducible Windows release workflow

1. Commit and back up the RPG Paper Maker source project.
2. Export a fresh Windows build after the registered-song changes.
3. Run `tools/prepare-windows-release.ps1` against the full exported folder.
4. Confirm the script validates the RPG Paper Maker runtime signature, installs the restricted main/preload storage host, synchronizes the current IP2Live plugin, checks embedded custom songs, and removes release-excluded development artifacts.
5. Start `Game.exe` from a standard Windows account.
6. Save and verify `%LOCALAPPDATA%\IP2Live\Saves\1.json` appears while the installation folder remains unchanged.
7. Complete, fail, cancel, and interrupt attempts; verify the monthly JSONL file.
8. Export a 90-day report and verify PDF, XLS, JSON, and checksum files under `Reports`.
9. Package the complete export directory as a ZIP, itch.io download, or installer. Never distribute `Game.exe` by itself.
10. Code-sign the executable/installer for public release when a trusted certificate is available.

## 9. Acceptance gates

- A standard user can run an installation below Program Files and save without administrator rights.
- The installed application tree does not change after play.
- Save, immediate close, relaunch, and load restore profile, map, position, quest, and custom game state.
- Clearing IndexedDB/localStorage does not destroy the durable Windows save or filesystem telemetry.
- A corrupt primary save recovers from `.bak`; invalid JSON is never accepted silently.
- Reinstalling or updating the game preserves `%LOCALAPPDATA%\IP2Live`.
- Two Windows accounts receive separate data roots.
- An immediate post-attempt report includes the latest terminal event.
- A cancellation is not counted as failure; an orphan start appears as interrupted.
- Events from the previous 90 days remain queryable after restart.
- Report export confirms real archive paths and non-empty file hashes.
- Main-menu, tutorial, maps representing stages 1–4, and every gameplay music zone play in packaged `Game.exe` with no missing-file errors.
- Music at 0/50/100%, focus loss, sleep/resume, save/load, success/fail/cancel transitions, and first-input autoplay retry all pass.
- Path traversal, absolute renderer paths, invalid slots, oversized messages, and unexpected IPC channels are rejected.

## 10. Online deployment decision

No online database is required for a downloadable offline Windows game or a browser game whose data may remain on one browser/device. Keep IndexedDB for browser-offline support.

Add an authenticated server database when requirements include cross-device continuation, central teacher visibility, remote backup, account recovery, official assessment records, or administrative reporting. In that architecture, retain the local journal/IndexedDB as an offline outbox and synchronize immutable events through HTTPS. Server-side reports—not locally editable files—should be the authoritative record for graded or compliance-sensitive use.

## 11. Implementation map

- `Plugins/IP2Live_Core/modules/desktop_storage.js`: renderer adapter, stable storage, fallback migration, checksums, backups, journals, and report archives.
- `Plugins/IP2Live_Core/code.js`: storage loader, IndexedDB schema/index upgrade, transaction-complete acknowledgement.
- `Plugins/IP2Live_Core/modules/game_manager.js`: event IDs, profile IDs, write draining, unified save metadata, checkpoints, and shutdown handling.
- `Plugins/IP2Live_Core/modules/report_manager.js`: durable-first telemetry, merge/deduplication, interrupted attempts, archive writes, and 90-day default.
- `Plugins/IP2Live_Core/modules/screens/export-report.js`: 90-day default and archive status.
- `Plugins/IP2Live_Core/modules/screens/name-input.js`: stable profile UUID and non-destructive updates.
- `Plugins/IP2Live_Core/modules/music_manager.js`, `songs.json`, `titlescreenGameover.json`: native packaged audio.
- `deployment/windows/` and `tools/prepare-windows-release.ps1`: repeatable secure Electron host preparation.
- `tests/`: storage, recovery, report merge, and packaging verification.
