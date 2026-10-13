# Learning Improvement tab

The Excel **Learning Improvement** tab is immediately beside **Teacher Dashboard**. It reports per-gameplay and overall observed change from the earliest retained comparable attempt to the latest, plus more stable comparisons between early and recent groups of attempts. The dashboard and PDF also contain summaries.

Actual exports query all retained records for the selected profile. The dashboard still uses its selected date window; this new tab uses all recorded history. Its header states that difference. Direct report generation without lifetime records labels the evidence as report-window data instead. The earliest retained event is not necessarily the student's first-ever exposure to the game or subnetting.

## What the percentages mean

The main **learning improvement (%)** is explicitly defined as **observed error-rate reduction**. This is a descriptive performance proxy, not a validated learning scale.

```
wrong-answer rate = incorrect graded decisions / all graded decisions
learning improvement (%) = (first wrong-answer rate - latest wrong-answer rate)
                           / first wrong-answer rate * 100
```

For example, 5 wrong answers out of 10 at first and 2 out of 10 most recently yield `(0.5 - 0.2) / 0.5 * 100 = 60%` error reduction. Accuracy rises from 50% to 80%, an increase of **30 percentage points**. These are different quantities. The same result does not become a larger gain merely because the student repeats the exercise more often.

The first-to-latest comparison requires two eligible attempts within the same matched task group. It is labeled descriptive. **Windowed improvement** requires at least four eligible attempts and compares the first and last non-overlapping groups of 2–5 attempts. Accuracy is weighted by observed graded decisions within each window when counts are available. It reduces dependence on a single unusually good or bad result but is still observational evidence.

**Active-time change** uses `(first active time - latest active time) / first active time * 100`, comparing successful attempts only. **Quality speed change** additionally requires observed accuracy to hold steady or improve. Windowed quality speed uses the existing matched-window timing rules: at least two successful active-time samples in each window and no decline in accuracy or pass rate. A quick failed attempt never counts as a fast successful solve.

Pauses, preparation, dialogue, help overlays and hidden/background intervals are not substituted for active solving time. Different timing definitions are separate task groups. Subnet Blaster selection time follows its preparation phase and must not be interpreted as the whole subnet-solving duration.

**Matched repetitions** count `eligible attempts - 1` within each task group. They measure exposure, not skill gain. More repetitions with unchanged performance yield 0% observed improvement, not bonus points.

## Modes, tasks, and totals

Story, Practice, Endless, PVP vs AI and LAN PVP are matched separately. Only the human player's PVP puzzle attempts are recorded as learner evidence. Simulated opponent performance is never included. PVP telemetry starts with this update; unrecorded past PVP sessions cannot be reconstructed. Endless unlocks after Story completion and records actual gameplay attempts. Its escalating timer budgets are matched separately; run scores and survival times describe play performance and do not replace mistake-based learning evidence.

Eligible attempts must be unassisted graded human gameplay. Guided/tutorial activity, help-assisted attempts, cancellations, interrupted/open attempts, developer testing and simulated events do not establish independent improvement. Real guided and assisted attempts remain in recorded-use counts. Story mastery calculations remain separate.

Matching requires the same gameplay, version, mode, stage/level, task, difficulty, recorded workload and timing method. Random IP addresses and shuffled question identities are not treated as difficulty. A new, unmatched difficult task is not compared directly to an earlier easy one.

Aggregation is deliberate and reproducible:

1. Average observed percentages across matched task groups within each gameplay/mode.
2. Average observed mode summaries within each gameplay, giving modes equal weight.
3. Average observed gameplay summaries for the overall percentage, giving gameplays equal weight.

This prevents frequent easy practice from dominating a much less frequently played difficult gameplay. Each metric has its own contributing counts. These means summarize recorded comparisons; they are not pooled student test scores or population treatment effects.

An error-free first attempt has a zero denominator, so relative error reduction is **N/A**, even if later accuracy falls. Accuracy change still displays the decline. Missing measurements, unplayed gameplays and insufficient data also stay N/A, rather than becoming zero or a perfect score. Negative values are retained; no gains are clipped to hide deterioration.

## Audit and research use

**Progress Task Evidence** retains first/latest attempt IDs, dates, raw wrong/correct decision counts and denominators, active times, early/recent sample counts and task definitions. **Progress Timeline** retains each eligible observation, chronological repetition number and changes from first and previous timed attempts. **Progress Metric Coverage** shows which modes contribute to each gameplay metric. Full lifetime source events are retained in `progressEventAudit` in the encrypted evidence JSON.

These values can document within-student performance change while using IP2Live. They cannot by themselves establish that the system caused transferable subnetting skill improvement: practice effects, prior knowledge, other instruction and participant selection may also contribute. For an effectiveness study, use independent equivalent subnetting pre/post assessments, a suitable comparison group (random assignment where feasible), and report uncertainty and effect sizes at the student level. Do not treat repeated attempts by one student as independent students.

The [IES What Works Clearinghouse Procedures and Standards Handbook, version 5.0](https://ies.ed.gov/ncee/wwc/Docs/referenceresources/Final_WWC-HandbookVer5.0-0-508.pdf) provides research-design standards for causal educational evidence. The game-specific error-reduction formula and averaging scheme above are our descriptive definitions; they are not a WWC-endorsed learning metric.

Validation includes exact arithmetic, all-mode balancing, first/latest IDs, window comparisons, scope independence, zero-error ceilings, negative changes, missing evidence, excluded assistance/developer/simulated records, mirrored terminal events, repetition without gains, failed fast solves, human PVP lifecycle logging, PDF generation and worksheet ordering.
