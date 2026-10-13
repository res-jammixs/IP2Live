# Endless Mode

Finish Story Mode, then open Play Game → Endless Mode. Eligibility comes from saved Story completion certificates. When several players have completed Story, Change Player selects the certificate owner; their name and profile ID are used throughout the run, telemetry, and PDF. No new Story unlock is granted by Endless participation.

Each shuffled cycle contains gameplays 1, 2, 3, 4, 4.5, 5 and 6 once. Gameplay 3 and 4 form an inseparable pair; 4 consumes the exact mask and keyed CIDR handoff solved in 3. A fresh handoff is required for every pair. Gameplay 7, 8, and harder variants are outside this mode's requested pool.

## Balance settings

For developer testing, `IP2Live.GameManager.unlockPracticeAndEndlessForTesting` in `Plugins/IP2Live_Core/modules/game_manager.js` is enabled (`true`). This immediately unlocks Endless and every Practice exercise, including harder variants. With no completed Story player, Endless uses the remembered player profile or `DEVELOPER` on a fresh installation. It does not create Story completion records, grant Story certificates, or persist Practice unlocks. Set the flag to `false` to restore normal requirements; genuinely earned access remains. No save reset is needed.

Edit `Plugins/IP2Live_Core/modules/endless_rules.js`:

| Parameter | Default | Meaning |
| --- | --- | --- |
| `initialSeconds` | 180 | Every new round's initial solve budget, including 4.5 |
| `graceMs` | 300000 | Five active minutes before pressure begins |
| `pressureStepMs` | 60000 | Another reduction per active minute |
| `easyReductionSeconds` | 15 | Reduction per step for 1, 2, 3, 4.5 |
| `hardReductionSeconds` | 8 | Gentler reduction for 4, 5, 6 |
| `minimumSeconds` | 1 | Eventually forces an end, rather than a permanent easy plateau |

At exactly 5:00 active run time, the next easy round receives 165 seconds and the next hard round 172 seconds. At 6:00 those become 150 and 164. The current round retains the budget assigned at launch; pressure never changes its limit halfway through. The HUD shows score, round number, and the gameplay's countdown.

The run and round clocks count active interactive play, including Subnet Blaster preparation and combat. Pause, help, calculators, dialogue, hidden/unfocused windows, background screens, automatic completion/arrival animations, and suspension gaps above one second are excluded. One controller owns the clock; native game timers display its remaining budget without decrementing it a second time. Reattempting a puzzle inside its screen does not refill the round clock. The shared CRT transition covers initial loading and movement between gameplays; the clock begins after the puzzle is revealed, with no inter-round information page.

At zero, failure is committed immediately before the next gameplay update or action. Normal gameplay failure also ends the run. Pause → Finish Run retires the run and opens its results. Duplicate/stale completion callbacks are consumed without touching Story. There is no Endless autosave; the run must be finished or retired in one session.

## Points

The base points for 1 / 2 / 3 / 4 / 4.5 / 5 / 6 are **100 / 120 / 150 / 220 / 120 / 260 / 300**. Each successful screen earns:

```
remainingFraction = clamp(1 - activeRoundMs / (roundLimitSeconds * 1000), 0, 1)
speedBonus = round(basePoints * remainingFraction)
points = max(1, round((basePoints + speedBonus) / (1 + 0.25 * observedMistakes)))
```

Mistakes use the gameplay's observed assessment metrics, including incorrect decisions. A faster clean solve earns more than a slow or mistaken solve of the same gameplay and budget. Failed, unavailable and retired rounds award zero; previously earned points are retained. Points are a play-performance measure and are not used as a learning percentage.

## Results and certificates

The lobby uses a cached, textured infinity core, bevelled metal plates, seven gameplay chips, and a highlighted 3–4 connection. Labels focus on the player, starting limit, and pressure start. The score HUD uses the same layered metal finish. Nebula headings and Oxanium text match the game; user names have system font fallbacks for Unicode characters. Materials are cached instead of regenerated every frame.

Results show the total points, solved gameplays, active survival time, mistakes, and the last three successful round rewards. Download Certificate exports an offline landscape PDF using the Story certificate's textured paper, faceted uplink, metal spine, foil seal and automatic name fitting. Its text explicitly says participation in Endless Mode and includes the player's name and score. High-quality canvas resampling keeps certificate previews clear at different screen sizes.

The last 50 finished run summaries are cached on this device for Last Certificate in the lobby. Detailed round evidence lives in the durable telemetry journal. Story's completion certificate and campaign saves are preserved.

## Learning reports

Each run emits feature session start/end events; every attempted gameplay emits feature round start/end events. Round results include score breakdown, timer budget, pressure step, countdown time, rules version, and observed assessment evidence. Final events include score, solved rounds, mistakes, active survival time and end reason.

Teacher Dashboard and PDF optional-mode analysis summarize participation and scores. The Endless Runs and Feature Rounds workbook sheets expose run and round values. Existing Endless Improvement, Endless Learning Curve and lifetime Learning Improvement analyses use these rounds with their existing requirements: sufficient unassisted observations, matching gameplay/task/workload/version/time budgets, observed mistakes and active time. Shorter timer budgets form separate comparison groups. More score or survival time alone does not establish learning or a causal effect.

Run `node --test tests/endless_mode.test.cjs tests/gameplay_timers.test.cjs tests/feature_telemetry_report.test.cjs tests/learning_progress.test.cjs` for focused checks. `tests/fixtures/endless_preview.html` renders the lobby, results, long names and participation certificate independently for visual inspection.
