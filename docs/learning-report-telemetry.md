# Learning report and telemetry

The Export Report feature produces an updated teacher dashboard, detailed Excel worksheets, a PDF review, and the complete evidence JSON in the existing password-protected package. It works offline and reads the selected learner's durable telemetry journal with the IndexedDB mirror as a fallback. Profile identity and event/attempt identities prevent cross-profile mixing and mirrored-record double counting.

Choose **All recorded history** in the export scope to review change since the learner's first available system record. The existing 7-, 30-, and 90-day windows remain available. All counts and improvement estimates refer to the selected window; they are not reconstructed lifetime totals.

## Dashboard and evidence

The teacher dashboard now shows regular assessed attempts, actual passes/failures, unassessed or excluded activity, observed decision accuracy with its evidence count, recorded active time, and all stages/levels. Teaching feedback identifies recorded concepts and gives a focused practice recommendation, with an evidence label. Repeated failed outcomes still warrant attention when older records lack enough detail to identify a specific misconception.

Missing accuracy stays unknown. No errors recorded, unused chances, a cancelled launch, or a completion event alone do not establish 100% accuracy. The descriptive learning indicator uses 70% recorded accuracy and 30% regular assessed pass rate. Speed and improvement no longer inflate that indicator. It is not a validated proficiency score or an automatic recommendation to advance.

| Worksheet | Purpose |
| --- | --- |
| Teacher Dashboard | Performance, recovery, improvement, coverage and teaching priorities |
| Improvement | Whole-run matched cohorts, baseline/recent medians, percentages, sample counts and quality checks |
| Learning Curve | Chronological whole-run observations and rolling median active time |
| Blaster Improvement | Matched Gameplay 6 encounters across separate gameplay runs |
| Blaster Learning Curve | Task-level encounter observations with parent attempt IDs, preparation and skip evidence |
| Teaching Feedback | Concepts, independent/guided error counts, affected-attempt rates, examples and interventions |
| Recovery and Tutorials | Gameplay exhaustion, campaign game overs, offers, selections, starts, visible screens and tutorial outcomes |
| Recovery Events | Auditable event identities and recovery triggers |
| Decision Evidence | Submitted and expected answers and the result of each recorded assessment |
| Gameplay Timing and Tools | Active/elapsed time, timing method, preparation, calculator/help use and physical actions |
| Gameplay Coverage | Available gameplays, observed versions and coverage of decisions, accuracy and active timing |
| Blaster Encounters | A/B/C givens, requested boundary, bit information, expected/chosen formulas, answer and encounter timing |
| Measurement Guide | Formulas, comparison rules, definitions, exclusions and missing-evidence counts |
| Existing detailed sheets | Daily activity, attempts, quest repetitions, stages, gameplay/competency summaries, mistake analysis, raw events and metadata |

The PDF contains improvement tables, chronological curves, separate Subnet Blaster encounter evidence, game-over/tutorial activity, teaching feedback and the measurement guide alongside the existing review sections. Full structured events and payloads remain in the evidence JSON and Event Audit sheet.

Very long Excel cells carry a visible truncation notice; the packaged evidence JSON retains the complete value. Large worksheet histories continue in numbered sheets with their header repeated. Invalid XML control characters are removed from spreadsheet text so an individual value cannot invalidate the workbook.

## Improvement calculator

Whole-run comparisons match gameplay identity/version, stage/level, task, difficulty, recorded class/bit/prefix/workload, and timing method. Random IP addresses, generated question IDs and shuffled question order do not define difficulty. Different recorded difficulty objects and different target tasks remain separate.

Each cohort needs at least four eligible runs. Baseline and recent windows are the first and last non-overlapping groups of 2–5 runs; window size is `min(5, max(2, floor(runCount / 3)))`. Speed also requires at least two successful active-time observations in each window. The typical time is that cohort's personal median of successful active-time observations; it is not an external population norm.

```
timing change (%) = (baseline median active time - recent median active time)
                    / baseline median active time * 100

accuracy change (percentage points) = (recent accuracy - baseline accuracy) * 100

pass-rate change (percentage points) = (recent pass rate - baseline pass rate) * 100
```

For example, a reduction from 120 seconds to 90 seconds is a 25% timing improvement. An accuracy change from 60% to 80% is +20 percentage points. Negative timing changes mean slower completion. A zero value means observed stability; `N/A` means missing or insufficient evidence.

The headline **validated speed improvement** requires observed accuracy in both windows and no decrease in accuracy or pass rate. Raw timing change remains visible even when that condition fails, with a caution. Overall percentages are medians of matched-cohort percentages, with equal weight for each cohort. Durations from different gameplays are never pooled. This describes observed change during system use and does not establish that the system caused that change.

Curves show chronological observations and a rolling median using up to five matched samples, retaining successful active-time observations only for the timing median. Failed outcomes stay in accuracy/pass-rate evidence and are not rewarded as fast completions.

The curve also records the percentage timing change from the previous successful timed sample in the same cohort, alongside the change from baseline and the previous sample's ID. This lets a reviewer inspect recent repetition-to-repetition progress without treating one faster run as established mastery.

## Subnet Blaster

Gameplay 6 evaluates exactly two formula decisions per completed encounter: operator and total block size. Physical bullets and barrier/boss impacts are separate counters. Five boss impacts trigger evaluation; an incorrect weapon produces a counterattack and a lost heart, and the next encounter replaces the problem. Three successful encounters deplete the boss's three health segments. Internal rounds are counted from the encounter history, so a flawless three-encounter run is not reported as one round.

Encounter evidence retains class/default prefix, given address, requested network/broadcast boundary, borrowed-versus-host-bit givens, host bits, borrowed bits, prefix, correct block size, chosen/expected operator and block, correct answer, success/failure, preparation duration/skip, calculator dwell, and active selection time. The two decisions support analysis of address direction and block-size selection. A wrong block alone does not prove whether the learner misunderstood host bits or made an exponent error.

`subnet_decisions_v1` measures barrier-selection time after preparation, including the required firing interval. It excludes preparation, tools/help, dialogue and boss/pickup/drop animations. Learners may reason during preparation, so selection time is not the complete subnet-solving time. Preparation duration/skips and tool use remain available for interpretation.

Randomized complete runs may not repeat the same task set often enough for a reliable whole-run comparison. The separate encounter analysis matches class, prefix, host bits, requested address and given-bit type. It requires at least four distinct parent gameplay runs, using different parent runs for baseline and recent windows, with at least two parent runs per window. Repeating a task several times in one run cannot establish longitudinal improvement. Encounter percentages and complete-run percentages remain separate.

## Recovery counts

- **Gameplay game over:** explicit exhausted hearts or attempts on a failed terminal attempt. Ordinary failures and cancellations are not inferred to be game overs. Guided gameplay exhaustion is also identified as a subset.
- **Campaign game over:** an observed transition to depleted Neural Life Force, counted once per neural run. This can differ from gameplay exhaustion.
- **Tutorial offer:** the recovery choice was presented. Repeated-mistake offers retain their failure count and trigger.
- **Tutorial selected/started/shown:** separate actions. “Shown” requires the actual tutorial screen to be visible; a launch request does not count as visibility.
- **Shown after repeated mistakes:** visible recovery tutorials with an explicit repeated-failure trigger or a link to a repeated-mistake offer. This is a subset of tutorials shown and has its own dashboard count.
- **Tutorial outcome:** completed, failed or cancelled replay, linked through replay and offer IDs.

Gameplay 6's `hearts_exhausted` reason now participates in terminal failure and repeated-failure recovery, alongside `attempts_exhausted`. The boss-retreat flow remains in place and does not show AR diagnostic feedback.

## Timing, assistance and legacy data

Other gameplay screens use the persisted `active_frames_v1` clock for rendered interactive intervals. It excludes pause, hidden/suspended gaps, dialogue, tools/help and recognized completion/transition phases. Calculator overlay use/dwell is recorded separately. Wall-clock launch-to-exit duration remains available and is never substituted for active time in improvement comparisons.

Cancelled/interrupted, practice, developer, guided tutorial and instructional-help-assisted runs do not establish independent improvement. Calculator use is an allowed gameplay tool and does not automatically exclude a run; its use and time are retained. Tutorial/practice evidence can still be reviewed separately. New developer/practice simulations are excluded at the telemetry source; historical flagged records remain excluded from independent assessment.

Older records retain real observed counts when available, such as formula choices, routed packets or slot checks. Missing per-choice answers, visible-tutorial events, active-time intervals and historical game overs are not invented. Partial restored histories retain only observed evidence. An interrupted start remains interrupted, with no fabricated end time or grading.

Mistake events, decision histories, round histories and result aggregates can mirror the same failed choice. The weakness analysis uses the largest count per attempt/concept across those evidence sources, rather than summing all mirrored copies. Independent and guided errors have separate counts and denominators. Evidence labels describe sample size, not statistical confidence intervals.

See [gameplay-assessment-telemetry.md](gameplay-assessment-telemetry.md) for the current assessment evidence in gameplays 1–8, including 4.5 and harder variants. When future gameplay grading, difficulty or timing semantics change, bump the corresponding gameplay/timing version so incompatible runs do not share a cohort.

## Validation

Focused coverage includes deterministic analytics examples, missing/legacy data, matching/exclusions, quality gates, repeated outcomes, encounter-versus-whole-run units, event deduplication, profile isolation, recovery lifecycle, universal timing, all-gameplay assessment invariants, encrypted Excel/PDF export, orphan recovery and the actual all-history menu option. The existing gameplay and pause/replay regression suites remain applicable.
