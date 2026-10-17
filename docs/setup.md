# Setup and testing guide

This guide explains how to open and test the editable IP2Live project. To play the published game, use the standalone Windows download described below.

## Prerequisites

| Requirement | When it is needed |
| --- | --- |
| Windows PC, keyboard, and mouse | The documented development and public-release workflow. |
| RPG Paper Maker **3.2.15** | Opening, editing, testing, and exporting the source project. This version is recorded as `pv` in [settings.json](../settings.json). |
| Complete IP2Live source folder | Editor testing; retain the root files, maps, plugins, and assets. |
| Internet connection | Downloading RPG Paper Maker and the project or public game. |
| Node.js | Optional automated checks and development utilities; the packaging checks were verified with Node.js 24. |
| Windows PowerShell | Preparing a standalone Windows release. |

## 1. Download and install RPG Paper Maker first

1. Open the [official RPG Paper Maker downloads page](https://rpg-paper-maker.com/downloads/) and choose Windows, or use its Steam installation link.
2. Complete installation and launch the editor.
3. Check **Help > About** and use version **3.2.15** to match this project. Keep a backup before allowing a different editor version to convert project files.

The editor supplies the RPG Paper Maker runtime and default resources used by the project.

## 2. Obtain the complete source project

Download the submitted source archive or clone the supplied repository, then extract the archive to a writable local folder. Open the extracted folder and confirm it contains:

```text
IP2Live/
  game.rpmg
  settings.json
  system.json
  Maps/
  Plugins/IP2Live_Core/
  Images/
  Fonts/
  Songs/
  Scripts/
```

`game.rpmg` is the project entry point. Keep it beside the JSON files and asset folders; selecting that file opens the whole project.

## 3. Open IP2Live and launch a test

1. Start **RPG Paper Maker**.
2. Choose **File > Open project > Browse...**, or press **Ctrl+O**.
3. Browse to the extracted project folder and select **game.rpmg**.
4. Wait for the maps and project data to load.
5. Click the toolbar's **Play** button to start the game in a test window.
6. Choose **Play Game > Story Mode > New Story**, enter a player name, and proceed through the illustrated prologue and first lesson.

Use **W/A/S/D** to move, **Enter** to confirm or interact, and **Esc** to open Pause where supported. Puzzle screens provide their own instructions and mouse controls. Menu navigation also accepts arrow keys. Key bindings can be changed in **Settings**.

Stop and restart the test session after changing source files. Opening the source JSON files or individual HTML previews does not launch the full game.

## 4. Suggested evaluation walkthrough

1. Start a New Story and verify the prologue, player name, first floor, lesson prompts, movement, and puzzle input.
2. Complete a quest and check that the quest map, feedback, and next objective update. Submit an incorrect answer to inspect the error recap and correction hint.
3. Open Pause, change a setting, resume, and verify movement and puzzle interaction still work.
4. Save the Story, close and reopen the game, and load the numbered save. Check the map, player identity, quest progress, and supported puzzle state. Check **AUTOSAVED** separately after a checkpoint commits.
5. Try Practice and Endless. The source currently sets `unlockPracticeAndEndlessForTesting: true`; with this bypass disabled, Practice follows Story tutorial unlocks and Endless requires Story completion.
6. Open **Play Game > PVP > VS AI** for an offline race. Test LAN lobbies using the prepared Windows build on two devices, following [PVP setup](PVP_Engine_Race.md).
7. For ending review, the source's **Simulate Ending** developer button prepares the final floor; walk onto the final exit to trigger the epilogue, completion screen, and certificate. Use a separate test Story because this changes its progress. Verify the ordinary Story route separately for release acceptance.

The pause menu's developer **Test** grid launches isolated tutorials and gameplays. These sessions do not validate campaign progression or create Story checkpoints. See [developer gameplay testing](developer-gameplay-tests.md).

Editor playtests do not include the prepared Windows host's full local-storage and LAN integration. Repeat the relevant checks with the exported **Game.exe** before submitting a release. The [deployment guide](deployment.md) provides that workflow.

## Optional automated checks

Open PowerShell in the project root. Install Node.js if it is not already available, then verify it with `node --version`. No root `npm install` or `npm start` command is required for this project.

```powershell
node --test tests/windows-release-preparation.test.mjs tests/windows-storage-service.test.mjs tests/music_registry.test.cjs
```

For broader gameplay and UI checks, consult the relevant feature document and files in [tests/](../tests/). Some integration checks require an installed engine or browser. Run the checks appropriate to the changed features and retain their results with the submission evidence.

## Play the public build

Open [IP2Live on itch.io](https://res-jammixs.itch.io/ip2live-user), download the Windows ZIP, extract all its contents, and double-click **Game.exe** in the extracted folder. This standalone build includes its runtime; RPG Paper Maker and Node.js are needed only for development workflows, not for playing the download.

The public download and the source project are separate artifacts. Compare the release version and test results when evaluating which source changes are included in a published build.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Windows does not recognize `game.rpmg` | Open RPG Paper Maker first, then use **File > Open project > Browse...** to select it. |
| Missing maps, images, or plugin files | Extract the complete source archive and keep its folder structure. Confirm `Plugins/IP2Live_Core/code.js` and `Maps/` are present. |
| Default resources cannot be found | Complete the editor installation and check its Basic Resources path under **Options > Set BR Path**. |
| Source edits do not appear in the game | Close the test window and start a new editor Play session. |
| `Game.exe` fails after download | Extract the entire standalone ZIP and keep the executable beside its supporting files and `resources/` folder. |
| Practice or Endless availability differs | Check the testing bypass and earned Story progress in the build being tested. |
| LAN hosting is unavailable | Use a build prepared with the Windows release script on both devices; see [PVP troubleshooting](PVP_Engine_Race.md). |
| A prior save is absent in another build | Editor sessions and prepared releases can use different storage locations. Back up existing data before changing builds; see [save persistence](story-save-persistence.md). |

The editor's open-project and play workflow is described in the [official RPG Paper Maker guide](https://rpg-paper-maker.gitbook.io/rpg-paper-maker).
