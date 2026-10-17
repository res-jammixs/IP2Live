# IP2Live

IP2Live is a cyberpunk educational adventure built with **RPG Paper Maker**. Players infiltrate the systems controlled by APEX and learn IPv4 addressing, binary conversion, subnet masks, CIDR notation, host capacity, network repair, and VLSM through guided tutorials and interactive puzzles.

**Public game:** [Download IP2Live on itch.io](https://res-jammixs.itch.io/ip2live-user). The public release is a downloadable Windows game.

## Set up and test the source project

**Install RPG Paper Maker first, then open the project in the editor to test the game.**

1. Download and install [RPG Paper Maker](https://rpg-paper-maker.com/downloads/). Use **3.2.15** to match the project version recorded in [settings.json](settings.json).
2. Download or clone the complete source project. Extract it if downloaded as a ZIP, keeping all project folders together.
3. Start RPG Paper Maker and choose **File > Open project > Browse...** (or **Ctrl+O**).
4. Select [game.rpmg](game.rpmg) in this project's root folder.
5. Click the editor's **Play** button to launch a test session.
6. In the game, choose **Play Game > Story Mode > New Story**, enter a player name, and follow the prologue and tutorial.

Restart the test session after editing files to load the changes. See the [setup and testing guide](docs/setup.md) for prerequisites, controls, troubleshooting, and a suggested evaluation walkthrough.

## Play the public Windows release

1. Open the [IP2Live itch.io page](https://res-jammixs.itch.io/ip2live-user).
2. Download the Windows ZIP and **extract the entire archive**.
3. Open the extracted folder and double-click **Game.exe**.

The standalone download includes its runtime, so players do not need to install RPG Paper Maker or Node.js. Keep `Game.exe` with the accompanying files and folders. Internet access is needed to download the game; Story, Practice, Endless, and VS AI run locally. Two-player PVP uses a shared local network.

## Game features

| Feature | Description |
| --- | --- |
| Story Mode | Illustrated prologue, guided networking lessons, floor quests, progression through APEX's systems, and a completion epilogue and certificate. |
| Networking puzzles | IP Wires, IP Patch Panel, CIDR Panel, Subnet Simulator, Host Power Reactor, CIDR Quarantine, Subnet Blaster, Network Repair, VLSM Allocator, and harder Wires/CIDR variants. |
| Practice Mode | Replay tutorials and puzzles outside campaign progression. |
| Endless Mode | Randomized gameplays 1–6, increasing time pressure, mistake/speed scoring, and a participation PDF. |
| PVP / Engine Race | Local two-player lobbies and offline VS AI, with shared problems, scoring, and winner certificates. Open **Play Game > PVP**. |
| Progress recovery | Numbered Story saves, recovery autosaves, and restoration of supported in-progress puzzles. |
| Learning feedback | Quest error recaps, repeat counts, pinned corrections, achievements, learning reports, and saved completion summaries. |

### Current testing configuration

The source currently enables developer buttons, map jumps, gameplay testing, ending simulation, and access to Practice and Endless without Story progress. With the testing bypass disabled, Practice unlocks through Story tutorials and Endless unlocks after Story completion. The [deployment guide](docs/deployment.md) identifies the release settings to review.

The Combined toolkit is enabled only on **Stage 4 Level 4** for testing. It offers 11 draggable gameplay variants, minimized tabs with running timers, and separate saved tool states for Stage 4 Levels 1–4. Final-puzzle integration is deferred. See [Combined toolkit configuration](docs/combined-gameplay.md).

## Default controls

| Action | Control |
| --- | --- |
| Move the character | **W / A / S / D** |
| Navigate menus | **Arrow keys** or **W / A / S / D** |
| Confirm / interact | **Enter** |
| Pause / back | **Esc**; availability follows the current screen |
| Puzzle interaction | Mouse and the instructions displayed in each puzzle |

Controls can be changed in **Settings**. See [PVP setup and race rules](docs/PVP_Engine_Race.md) for multiplayer controls and LAN requirements.

## Deployment and submission

Public distribution uses the existing [IP2Live itch.io page](https://res-jammixs.itch.io/ip2live-user). Export a Windows desktop build from RPG Paper Maker, prepare it with [tools/prepare-windows-release.ps1](tools/prepare-windows-release.ps1), test the prepared game, and upload the complete release ZIP.

Follow the [Windows deployment and submission guide](docs/deployment.md) for export settings, PowerShell commands, itch.io upload steps, and the final submission checklist. The repository contains editable source; the standalone export is the package supplied to players.

## Automated verification

Node.js is required only for the automated checks and development tools. There is no root npm installation step for opening or playing this project. From the project root in PowerShell, run these focused checks for packaging, local storage, and registered audio:

```powershell
node --test tests/windows-release-preparation.test.mjs tests/windows-storage-service.test.mjs tests/music_registry.test.cjs
```

Additional feature checks live in [tests/](tests/). Automated checks supplement the editor and packaged-game walkthroughs in the [setup guide](docs/setup.md); they do not establish that an uploaded build matches the latest source.

## Project structure

| Path | Purpose |
| --- | --- |
| [game.rpmg](game.rpmg) | Project entry point opened with RPG Paper Maker. |
| Root JSON files | Engine settings, game database, controls, maps index, and asset registrations. |
| [Maps/](Maps/) | World maps, objects, and map events. |
| [Plugins/IP2Live_Core/](Plugins/IP2Live_Core/) | Custom gameplay, menus, progression, saves, telemetry, and reports. |
| [Images/](Images/), [Fonts/](Fonts/), [Songs/](Songs/), [Videos/](Videos/) | Game assets. |
| [deployment/windows/](deployment/windows/) | Windows runtime templates for local storage and LAN PVP. |
| [tools/](tools/), [tests/](tests/) | Release preparation, development utilities, and regression checks. |
| [docs/](docs/) | Setup, deployment, feature documentation, and verification notes. |

## Feature documentation

- [Story prologue and controls](docs/story-prologue.md), [floor states](docs/floor-states.md), and [story completion and certificates](docs/story-completion.md).
- [Story autosave](docs/STORY_AUTOSAVE.md) and [save persistence](docs/story-save-persistence.md).
- [Error diagnostics and local preview](docs/error-diagnostics.md): repeated corrections, submitted/expected answers, hints, and pinned errors under the quest map. Pins and repeat counts persist in saves; unpinned logs clear at the next quest. Debug acknowledges a recap with a pixel dissolve, and achievement banners appear below the recaps.
- [Gameplay registration](docs/gameplay-registration.md): shared definitions connect launchers, telemetry, PDF/Excel coverage, and saved Story victory summaries; revisions distinguish changed implementations in learning comparisons.
- [Gameplay timers](docs/gameplay-timers.md): optional timers use constructor options or `timeLimitSeconds`; formerly untimed puzzles retain Story/Practice behavior and receive a three-minute Endless timer.
- [Endless configuration and scoring](docs/endless-mode.md), [PVP / Engine Race](docs/PVP_Engine_Race.md), and [developer gameplay testing](docs/developer-gameplay-tests.md).
- [Learning reports](docs/learning-report-telemetry.md) and [music management](docs/music-management.md).

World, gameplay, and tutorial pause menus share cyberpunk panels, a textured backdrop, and floating particles. Artwork and glows are cached, particles use small sprites, and transition snapshots are capped at 1280 × 720. Pause opens without waiting for font or image downloads; gameplay state is captured immediately and durable checkpoints queue after the opening animation or on quick resume. Run `node tests/pause_rendering_performance.test.cjs` to check these limits. See the [world](docs/screenshots/menu/pause-main.png), [gameplay](docs/screenshots/menu/pause-gameplay.png), and [tutorial](docs/screenshots/menu/pause-tutorial.png) previews.

**Settings > PVP Button / Debug** shows or hides the PVP button on this device. The debug row follows `IP2Live.GameManager.enableDeveloperButtons`; code can also call `IP2Live.GameManager.setPVPButtonEnabled(false)` or `true`.
