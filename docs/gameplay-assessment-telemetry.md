# Gameplay assessment evidence

New gameplay results use `telemetrySchemaVersion: 2`. Each assessed submission is stored in `decisionHistory` with `stepKey`, `concept`, `submitted`, `expected`, and a Boolean `correct`. `totalDecisions`, `correctDecisions`, and `incorrectDecisions` aggregate those recorded submissions. Empty explicitly submitted answers count as incorrect; unseen questions, incidental movement, bullets, and animation frames do not count as assessments.

These fields describe evidence observed by the application. They are not a psychometric diagnosis. For example, choosing usable-host capacity instead of the total block size supports a specific calculation error; choosing a wrong block after borrowed bits were given does not establish whether the learner miscalculated host bits or the exponent. Requested address, class, and the available bit information provide context for reviewing that distinction.

| Gameplay | Recorded assessments | Retry handling |
| --- | --- | --- |
| 1 / harder IP Wires | IPv4 class for each unlocked source | Correct wires locked by an earlier confirmation are not counted again. |
| 2 Patch Panel | Each routed IP/mask class, including protected guided retries | Evidence and round summaries survive internal round resets. Only routed packets count, including early success before all packets spawn. |
| 3 / harder CIDR Panel | Each binary mask confirmation and CIDR verification | Targets/classes and submitted values survive adaptive rerolls in the history. |
| 4 Subnet Simulator | Each of the four answer slots per validation | Missing slots count as incorrect. `slotStats` includes them in its denominator and slot frequencies. |
| 4.5 Host-Power Reactor | Each explicit CALCULATE submission | Collection hits remain separate. Under-allocation and excess allocation receive distinct issue types. |
| 5 Network Re-Segmentation | Class, default prefix, borrowed bits, new CIDR, host bits, usable-host capacity, and route verification | Previously silent prerequisite errors now produce telemetry-only mistake events, preserving the existing feedback flow. Route navigation failures have a separate concept from an incorrect host-bit total. |
| 6 Subnet Blaster v4 | Exactly two decisions per completed encounter: operator and total block size | Grading occurs after five boss bullet impacts. Wrong choices are retained through the boss attack. One failed encounter costs one heart even when both choices are wrong. |
| 7 Network Repair | Each caught variable set and each submitted ordered formula slot | Independent-play mistakes remain in result evidence even when tutorial correction is disabled. |
| 8 VLSM Allocator | Each committed branch allocation or complete route table | `mistakeCount` is terminal-local. `lifetimeMistakeCount` separately preserves cumulative mission failures; earlier terminals no longer inflate the new terminal's accuracy. Validation failures retain the failed VLSM check. |

## Subnet Blaster details

The existing `correctShots` and `totalShots` fields remain compatible with saved results, but refer to assessed formula decisions. `bulletsFired`, `barrierImpacts`, and `bossBulletImpacts` are physical-action counts and must not be used as the accuracy denominator. Boss damage (`bossHits`) and lost hearts are encounter outcomes.

Every completed `roundHistory` entry includes the given address, requested address role, class/default prefix, prefix, available bits, borrowed and host bits, correct block size, chosen weapon, expected weapon, answer, pass/fail, and failed choice keys. It also includes preparation duration/skip, calculator usage/dwell, decision time, module collection times, and physical impacts for that encounter.

`activeElapsedMs` with `durationMethod: subnet_decisions_v1` measures barrier decision time. It excludes preparation, calculator/help/dialogue overlays, pickups, boss entry/combat/attack/retreat, answer drops, and completion animations. This prevents skipping the one-minute preparation or waiting for fixed animations from masquerading as faster subnet reasoning. It includes the required barrier firing interval, which is constant in the current version; comparisons should keep gameplay version and duration method consistent.

`preparationMs`, `preparationSkips`, `calculatorUses`, `calculatorElapsedMs`, `helpElapsedMs`, `assistanceElapsedMs`, and `phaseDurationsMs` retain the surrounding experience separately. Calculator duration is the observed open-to-close dwell, rather than an inferred arithmetic speed. `elapsedMs` keeps the existing foreground gameplay clock. The shared reporting lifecycle supplies the universal active/assistance clock for other gameplays; Gameplay 5's `questClockElapsedMs` remains its gameplay countdown clock, which can continue during calculator use and is therefore not interchangeable with assistance-free decision time.

Existing exports retain their original evidence. Older results do not acquire invented per-choice answers or timing. A restored older Subnet Blaster v4 scene initializes only newly observed metrics and marks `decisionHistoryComplete: false`. Other older saved scenes record subsequent observable submissions; an absent history remains unavailable. Generic lifecycle events and result evidence represent the same mistakes when they overlap and must be deduplicated in analytics.
