# Practice and endless learning evidence

Exports now include a **Feature Participation** sheet and a **Practice and Endless** PDF section. The **Teacher Dashboard** shows participation, session/day counts, scored versus guided rounds, active time, matched accuracy/pass-rate changes and quality-maintained speed changes. Practice analysis also appears in the report narrative.

**Endless Mode unlocks after Story completion.** Its rounds use the shared tracker and analyzer; no participation is invented from menu visits or unlocks. The **Endless Runs** sheet records final scores, solved gameplays, mistakes, active survival time, end reason, and rules version. **Feature Rounds** includes each round's awarded points, cumulative score, timer budget, pressure level, and countdown time. The dashboard and PDF summarize finished runs and best scores alongside matched learning evidence. No recorded activity in a report window means unobserved, not proof that a feature was never used.

## Recording and ownership

`FeatureTelemetry` records optional activities through the existing ReportManager durable journal/database path and registers pending writes with GameManager so export waits for them. It does not open campaign assessment attempts, save practice puzzle state into a story, or alter quests, HP or mastery.

The current story profile is remembered before the main menu clears the engine Game. Practice uses that profile, including its stable profile ID, throughout a session and across application restarts. The practice library displays the name receiving progress. To change the learner on a shared computer, start or load that learner's story first. Without a known profile, practice stays available but is not silently attributed to someone else or exported as another learner's activity. Historical anonymous/unlogged practice cannot be reconstructed.

Events are `feature_session_start`, `feature_round_start`, `feature_round_end` and `feature_session_end`. Payloads identify mode, session, activity kind and original task specification. End events retain actual decision history, gameplay version, counts, tools/help and timing evidence. Duplicate/stale completion callbacks cannot create extra rounds. Explicit puzzle completion counts as completion; leaving or switching a lesson does not. An unmatched round start remains interrupted/open, not a failure. Tutorial-course lessons count as guided activity.

Practice uses the shared rendered-frame active clock even though it has no campaign Game. Pauses, hidden pages, background screens, dialogue, help and preparation are excluded from active time. Existing gameplay-specific timing definitions remain intact. Missing timing remains N/A; wall-clock duration is never substituted.

## Improvement and transfer

**Practice Improvement**, **Practice Learning Curve**, **Endless Improvement** and **Endless Learning Curve** use the same matching and evidence rules as independent story improvement, separately within each optional mode. Version, task, workload, difficulty and timing method must match. At least four eligible scored rounds are needed, with separate baseline/recent windows. Guided and help-assisted rounds count toward activity but do not establish independent improvement. Speed also requires two successful timed observations in each window; validated speed requires observed accuracy and pass rate to hold steady or improve.

**Story After Practice** compares the last two independent matched story attempts before the first recorded completed/failed practice round for that gameplay with the first two independent matched attempts started after it. Both sides must exist in the selected report window. It describes observed before/after change; it does not prove practice caused the change. Scores from practice/endless never inflate assessed story mastery.

**Feature Rounds**, **Feature Decisions**, and the packaged evidence JSON preserve the evidence behind the summaries. The existing password protection and profile/date filtering also apply to these records.

Verification covers real practice replay launch/completion/automatic repetition/pause exit, retained profile ownership, active clocks without a campaign, duplicate and interrupted events, legacy flagged practice records, guided/help exclusions, distinct difficulties, independent story transfer, empty histories, and PDF/workbook rendering.
