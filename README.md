# IP2Live

New Stories open with four illustrated Canvas story scenes and gentle ambient motion before tutorial training. Tutorial and floor briefings connect subnetting to reclaiming the resources guarded by APEX. See [story content and prologue controls](docs/story-prologue.md).

Floor immersion states are configured by level and gameplay, with shared lighting progression for standard/harder Wires and automatic quest setback/save reconciliation. See [floor state configuration](docs/floor-states.md).

Endless Mode unlocks after Story completion: randomized gameplays 1–6, escalating time pressure, mistake/speed scoring, results, and a named participation PDF. See [Endless configuration and scoring](docs/endless-mode.md).

All gameplay screens accept an optional timer in seconds through their constructor or `timeLimitSeconds` launch option. Formerly untimed puzzles keep their Story/Practice behavior and receive a three-minute solve timer in Endless. See [gameplay timer configuration](docs/gameplay-timers.md).

PVP is available under **Play Game → PVP**, with local two-player lobbies and **VS AI**. See [PVP setup and race rules](docs/PVP_Engine_Race.md) for desktop build requirements, network setup, scoring, and verification.

World and gameplay pause menus share the same cyberpunk panels and buttons over a dark textured background with floating particles. See the [main pause preview](docs/screenshots/menu/pause-main.png), [gameplay pause preview](docs/screenshots/menu/pause-gameplay.png), and [tutorial pause preview](docs/screenshots/menu/pause-tutorial.png).

Pause artwork and button glows are prepared during idle time and reused. Particles use small sprites instead of blur filters; transition snapshots are capped at 1280 × 720. Pause opens without waiting for font or image downloads. Gameplay state is captured immediately, with durable pause checkpoints queued after the opening animation (or on quick resume). Run `node tests/pause_rendering_performance.test.cjs` to verify these rendering and loading limits.

To show or hide the PVP button, open **Settings → PVP Button / Debug**. The ON/OFF choice is saved on this device. The debug row follows `IP2Live.GameManager.enableDeveloperButtons`; code can also call `IP2Live.GameManager.setPVPButtonEnabled(false)` or `true`.
