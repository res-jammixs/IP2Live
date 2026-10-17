# Windows deployment and submission guide

IP2Live is distributed publicly through [res-jammixs.itch.io/ip2live-user](https://res-jammixs.itch.io/ip2live-user) as a downloadable Windows game. The release workflow is: test the source in RPG Paper Maker, export a Windows desktop application, prepare the exported runtime, test the complete release, and upload its ZIP to the existing itch.io page.

## 1. Review the source and release settings

Install RPG Paper Maker **3.2.15**, open [game.rpmg](../game.rpmg), and follow the [setup walkthrough](setup.md). Preserve a source snapshot for the submission and record its revision alongside the chosen game release version. The editor version and the game release version are separate values.

The current source enables testing shortcuts in [modules/game_manager.js](../Plugins/IP2Live_Core/modules/game_manager.js). For a normal player release, review these settings before exporting:

| Setting | Player release value | Effect |
| --- | --- | --- |
| `enableDeveloperButtons` | `false` | Hides the quest developer toolbar, including skip and simulation actions. |
| `enableGameplayTestingButton` | `false` | Hides the pause-menu gameplay testing entry. |
| `enableDebugMapJumpButton` | `false` | Hides the pause-menu map jump entry. |
| `unlockPracticeAndEndlessForTesting` | `false` | Restores the normal Story-based mode unlocks. |

If evaluator shortcuts are retained in a demonstration build, label that build clearly and describe the enabled shortcuts in the submission. The Combined toolkit currently opens only on Stage 4 Level 4 for testing; final-puzzle integration is deferred. Do not describe it as completed final-puzzle integration.

## 2. Export a fresh Windows build

1. Save the project in RPG Paper Maker.
2. Choose **File > Export standalone...**.
3. Select **Deploy a desktop application**, choose **Windows**, and use the Windows x64 target for the current public distribution.
4. Set the game release version and choose an export folder outside the editable source project.
5. Export the complete application. If **Protect data** is enabled, include that setting in the release notes and verify that exact export during testing.
6. Confirm the export contains **Game.exe** and **resources/app/**.

The release tool expects the Electron export layout, including `resources/app/main.js`, `preload.js`, `package.json`, and `build/`. A source folder or browser export is not valid input. See the [official export instructions](https://rpg-paper-maker.gitbook.io/rpg-paper-maker#deploy-your-game).

## 3. Prepare the Windows runtime

Run these commands in PowerShell from the IP2Live project root. Replace the example paths with the actual exported folder and a **new, nonexistent** release folder. Keep the destination outside the source export.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\prepare-windows-release.ps1 `
  -SourceExportPath "C:\IP2Live-builds\windows-export" `
  -DestinationPath "C:\IP2Live-builds\windows-release" `
  -ProjectRoot "."
```

| Parameter | Purpose |
| --- | --- |
| `SourceExportPath` | The complete RPG Paper Maker Windows export containing `Game.exe`. |
| `DestinationPath` | A new release folder; the tool refuses an existing destination or one inside the export. |
| `ProjectRoot` | The current IP2Live source root. Supplying `.` synchronizes its complete `Plugins/IP2Live_Core` tree into the release. |
| `ReleaseVersion` | Optional semantic version override for the exported runtime's `package.json`; otherwise the exported version is retained. Keep any override consistent with the submission and itch.io upload. |

The script copies the export without changing it, installs the IP2Live Windows storage and LAN PVP host, verifies the copied plugin when `ProjectRoot` is supplied, checks custom song registrations and bundled audio, removes embedded Git directories and numbered development saves, and writes `resources/app/ip2live-runtime-manifest.json` with runtime hashes.

Always export the current project first. Synchronizing the plugin does not update stale maps, database JSON, or other exported assets. If the tool reports missing song registrations, register the songs in RPG Paper Maker and re-export; the preparation script does not embed or convert audio.

Prepared releases store durable player data under **%LOCALAPPDATA%\IP2Live**, including saves and report archives, independently of the extracted game folder. Editor or older builds can use other locations; back up their data before an upgrade. An existing generic Electron profile is not automatically migrated.

## 4. Verify the prepared application

Run the following focused checks from the source root:

```powershell
node --test tests/windows-release-preparation.test.mjs tests/windows-storage-service.test.mjs tests/music_registry.test.cjs
```

Then launch **Game.exe from the prepared release folder** and complete the applicable checks:

- Start a fresh Story; verify the prologue, tutorial, movement, puzzle interaction, pause/resume, fonts, and music.
- Complete and fail puzzle attempts; check quest updates, error recaps, and learning-report output.
- Save, close, reopen, and load; verify identity, map, position, quest progress, and supported in-progress gameplay. Check recovery autosave separately.
- Verify Practice and Endless unlocks using the intended release settings.
- Finish the Story route and check the epilogue, completion screen, certificate download, and certificate archive.
- Test offline VS AI; for LAN support, run the same prepared build on two devices on the same network and check discovery, direct joining, ready/start, and a completed race. See [PVP requirements](PVP_Engine_Race.md).
- Confirm that a new player receives no developer saves and that new saves and report archives are written under **%LOCALAPPDATA%\IP2Live**.

Record the release version, source revision or snapshot identifier, Windows environment, date, and observed results. Mark checks that were not run as pending. Automated checks do not replace this packaged-game verification.

## 5. Package and upload to itch.io

1. ZIP the **entire prepared release folder**, including `Game.exe`, `resources/`, and all other runtime files. Use a clear Windows filename such as `ip2live-user-win-64.zip`; record the release version with the upload.
2. Extract the ZIP into a fresh folder and launch its `Game.exe` to confirm the archive is complete.
3. Sign in to the itch.io account that manages IP2Live and edit the **existing** [project page](https://res-jammixs.itch.io/ip2live-user).
4. Use the **Downloadable** project type and tag the uploaded ZIP for **Windows**.
5. Update the release description, version details, screenshots, and install instructions to match the tested build. State whether it is a normal player release or an evaluator demonstration build.
6. Save the page and ensure its visibility is **Public** so evaluators and players can access it.
7. Open the public page while signed out, confirm the Windows file is downloadable, then download, extract, and launch that uploaded artifact for the final distribution check.

Itch.io hosts the standalone download; the current release runs on Windows after extraction. Follow itch.io's [creator guide](https://itch.io/docs/creators/getting-started) for upload and visibility controls.

### Install instructions for the itch.io page

> Download the Windows ZIP and extract all files. Open the extracted folder and double-click Game.exe to start IP2Live. Keep the accompanying files and folders together. The standalone game includes its runtime, so RPG Paper Maker is not required to play. Use W/A/S/D to move, Enter to confirm or interact, and Esc to pause where available. Follow each puzzle's on-screen instructions.

## Submission checklist

Complete this checklist against the exact build being submitted:

- [ ] The source snapshot includes `game.rpmg`, all required JSON files, maps, plugins, and assets.
- [ ] [README](../README.md) and [setup instructions](setup.md) are included and identify RPG Paper Maker 3.2.15 as the source prerequisite.
- [ ] Developer shortcuts and testing unlocks match the declared build purpose.
- [ ] A fresh Windows export has been prepared successfully with the release script.
- [ ] Automated results and packaged-game walkthrough results are recorded; untested items are identified.
- [ ] The submitted release version and source snapshot are identified, and known limitations are documented.
- [ ] The complete ZIP launches after extraction and includes no developer saves.
- [ ] The matching Windows ZIP is available from the public [itch.io page](https://res-jammixs.itch.io/ip2live-user), and the downloaded upload has been checked.
- [ ] The submission includes the source archive or repository reference, public game link, setup/deployment guides, and required evaluation evidence.

This checklist is a release record to complete during packaging and upload; its presence alone does not mean a new build has been published or playtested.
