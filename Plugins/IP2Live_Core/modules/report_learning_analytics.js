/**
 * Evidence-based learning analysis. Pure: no storage, clocks, UI or mutation.
 * Rates use 0..1; improvement percentages and changes in percentage points use
 * 0..100. Missing observations remain null, including legacy default accuracy.
 */
const IP2LiveReportLearningAnalytics = {
    VERSION: 'learning-analytics-20261011-01',

    analyze(input) {
        const data = input || {};
        const events = this._dedupeEvents(Array.isArray(data.events) ? data.events : []);
        const catalog = {};
        const entries = Array.isArray(data.gameplayCatalog) ? data.gameplayCatalog : Object.values(data.gameplayCatalog || {});
        entries.forEach(entry => { if (entry && (entry.id || entry.gameplayId)) catalog[entry.id || entry.gameplayId] = entry; });
        const attempts = this._normalizeAttempts(data.attempts, events, catalog);
        const recovery = this._recovery(events, attempts);
        const byGameplay = {};
        attempts.forEach(row => {
            if (row.nonLearning) return;
            if (!byGameplay[row.gameplayId]) byGameplay[row.gameplayId] = [];
            byGameplay[row.gameplayId].push(row);
        });
        recovery.perGameplay.forEach(row => { if (!byGameplay[row.gameplayId]) byGameplay[row.gameplayId] = []; });
        const perGameplay = Object.keys(byGameplay).sort().map(id => {
            const rows = byGameplay[id];
            const eligible = rows.filter(row => row.eligible);
            const groups = {};
            eligible.forEach(row => {
                const key = this._stableStringify(row.cohort);
                if (!groups[key]) groups[key] = [];
                groups[key].push(row);
            });
            const cohorts = Object.keys(groups).map(key => this._cohort(groups[key], key));
            const encounterRows = this._encounterRows(eligible);
            const encounterGroups = {};
            encounterRows.forEach(row => {
                const key = this._stableStringify(row.cohort);
                if (!encounterGroups[key]) encounterGroups[key] = [];
                encounterGroups[key].push(row);
            });
            const encounterCohorts = Object.keys(encounterGroups).map(key => this._cohort(encounterGroups[key], key));
            const encounterImprovement = Object.assign(this._aggregateComparisons(encounterCohorts), { unit: 'encounter' });
            const summary = this._aggregateComparisons(cohorts);
            const timed = eligible.filter(row => row.passed && row.activeDurationMs !== null);
            const label = catalog[id] && (catalog[id].label || catalog[id].name) || rows[0] && rows[0].gameplayLabel || id;
            return Object.assign({
                gameplayId: id, gameplayLabel: label, label,
                instanceCount: rows.length,
                assessedCount: rows.filter(row => row.assessed).length,
                eligibleCount: eligible.length,
                excludedCount: rows.length - eligible.length,
                exclusions: this._exclusions(rows),
                typicalActiveMs: cohorts.length === 1 ? this._median(timed.map(row => row.activeDurationMs)) : null,
                typicalTimeNote: cohorts.length > 1 ? 'See each matched cohort; distinct tasks have no pooled typical time.' : 'Personal median of successful, unassisted attempts with active-time evidence.',
                cohorts,
                encounterCohorts, encounterImprovement,
                encounterCurve: encounterCohorts.reduce((all, cohort) => all.concat(cohort.curve), []).sort((a, b) => a.timestamp - b.timestamp || a.encounterIndex - b.encounterIndex),
                curve: cohorts.reduce((all, cohort) => all.concat(cohort.curve), []).sort((a, b) => a.timestamp - b.timestamp),
                recovery: recovery.perGameplay.find(row => row.gameplayId === id) || this._emptyRecovery(id),
            }, summary);
        });
        const comparisons = perGameplay.reduce((all, row) => all.concat(row.cohorts), []);
        const improvement = this._aggregateComparisons(comparisons);
        improvement.comparableGameplayCount = perGameplay.filter(row => row.comparableCohortCount > 0).length;
        improvement.evidence = perGameplay.filter(row => row.comparableCohortCount > 0).map(row => ({
            gameplayId: row.gameplayId, gameplayLabel: row.gameplayLabel, speedImprovementPercent: row.speedImprovementPercent,
            accuracyChangePp: row.accuracyChangePp, passRateChangePp: row.passRateChangePp,
            comparableCohortCount: row.comparableCohortCount,
        }));
        improvement.limitation = 'Observed within-system change, not proof that system use caused improvement. Different gameplay durations are never averaged together.';
        improvement.unit = 'whole_launch';
        const encounterImprovement = Object.assign(this._aggregateComparisons(perGameplay.reduce((all, row) => all.concat(row.encounterCohorts), [])), { unit: 'encounter',
            limitation: 'Subnet Blaster encounter comparisons use the same class, prefix, host bits, requested address and given-bit type. They are separate from whole-launch progress; timestamps identify the parent attempt end.' });
        const weaknesses = this._weaknesses(attempts, events, catalog);
        return {
            version: this.VERSION,
            methodology: {
                speedFormula: '(baseline median active time - recent median active time) / baseline median active time * 100',
                accuracyFormula: '(recent observed decision accuracy - baseline observed decision accuracy) * 100 percentage points',
                passRateFormula: '(recent passed / recent assessed - baseline passed / baseline assessed) * 100 percentage points',
                baseline: 'First and last non-overlapping windows in each chronological matched cohort; each window contains 2 to 5 assessed attempts. At least 4 eligible attempts are required.',
                timing: 'Speed compares successful attempts only, with at least 2 active-time observations in each window. Pause/dialogue/wall-clock duration is not substituted for active time.',
                matching: 'Same gameplay, version, stage/level, task, difficulty, recorded workload and timing method. Random addresses and generated problem IDs are not difficulty keys.',
                aggregate: 'Median of matched-cohort percentage changes. Each cohort has equal weight; raw durations from different gameplays are not pooled.',
                exclusions: 'Cancelled, interrupted, unassessed, developer, practice, guided tutorials and explicitly assisted attempts do not establish unassisted improvement.',
                unknowns: 'Null means not observed or insufficient comparable data; it does not mean zero performance.',
                confidence: 'Evidence labels describe sample size, not statistical confidence intervals.',
                encounters: 'Subnet Blaster encounters are analyzed separately from complete runs. Each matched task needs observations in at least four distinct gameplay runs. Baseline and recent windows use different parent runs, with at least two runs per window.',
                blasterTiming: 'subnet_decisions_v1 measures barrier-selection time after preparation and includes required firing intervals. Preparation time, skips and calculator use must be reviewed alongside it; it is not the full subnet-solving time.',
                previousComparison: 'Learning-curve timing change from previous compares the current successful timed sample with the previous successful timed sample in the same cohort. A single-run change is descriptive, not evidence of mastery.',
            },
            coverage: {
                instances: attempts.filter(row => !row.nonLearning).length,
                assessedAttempts: attempts.filter(row => row.assessed && !row.nonLearning).length,
                eligibleAttempts: attempts.filter(row => row.eligible).length,
                observedAccuracyAttempts: attempts.filter(row => row.eligible && row.accuracy !== null).length,
                activeTimedAttempts: attempts.filter(row => row.eligible && row.activeDurationMs !== null).length,
                missingAccuracyAttempts: attempts.filter(row => row.eligible && row.accuracy === null).length,
                missingActiveTimeAttempts: attempts.filter(row => row.eligible && row.activeDurationMs === null).length,
                successfulActiveTimedAttempts: attempts.filter(row => row.eligible && row.passed && row.activeDurationMs !== null).length,
                excludedDeveloperPractice: attempts.filter(row => row.nonLearning).length,
                excludedFromImprovement: attempts.filter(row => !row.eligible).length,
                eventCount: events.length,
            },
            improvement, encounterImprovement, perGameplay, weaknesses, recovery,
            feedback: this._feedback(perGameplay, weaknesses, recovery, improvement),
        };
    },

    _number(value) { return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null; },
    _firstRecorded(...values) { return values.find(value => value !== undefined && value !== null && value !== ''); },
    _stableValue(value) {
        if (Array.isArray(value)) return value.map(item => this._stableValue(item));
        if (value && typeof value === 'object') {
            const out = {};
            Object.keys(value).sort().forEach(key => {
                if (value[key] !== undefined) out[key] = this._stableValue(value[key]);
            });
            return out;
        }
        return value;
    },
    _stableStringify(value) { return JSON.stringify(this._stableValue(value)); },
    _scenarioShape(source) {
        const row = source || {}, shape = {};
        const values = {
            ipClass: this._firstRecorded(row.ipClass, row.targetClass, row.className),
            prefix: this._firstRecorded(row.targetCIDR, row.cidr, row.prefix),
            hostBits: this._firstRecorded(row.targetHostBits, row.hostBits),
            borrowedBits: this._firstRecorded(row.targetBorrowedBits, row.borrowedBits),
            asked: row.asked, givenBits: row.givenBits,
        };
        Object.keys(values).forEach(key => { if (values[key] !== undefined && values[key] !== null) shape[key] = values[key]; });
        return shape;
    },
    _encounterRows(parents) {
        const output = [];
        parents.forEach(parent => {
            if (!parent.eligible || parent.gameplayId !== 'ip_cidr_quarantine_matrix' || parent.timingMethod !== 'subnet_decisions_v1') return;
            const rounds = parent.result.roundHistory || parent.payload.roundHistory;
            if (!Array.isArray(rounds)) return;
            const decisions = parent.result.decisionHistory || parent.payload.decisionHistory || [];
            rounds.forEach((round, index) => {
                if (!round || typeof round.passed !== 'boolean') return;
                const active = this._number(round.activeElapsedMs);
                const shape = this._scenarioShape(round);
                // All fields are needed to compare genuinely equivalent tasks;
                // incomplete legacy encounter contexts are not guessed.
                if (!['ipClass', 'prefix', 'hostBits', 'asked', 'givenBits'].every(key => shape[key] !== undefined)) return;
                const history = Array.isArray(decisions) && round.problemId ? decisions.filter(decision => decision && decision.problemId === round.problemId) : [];
                const accuracy = this._accuracy({ payload: { result: { decisionHistory: history } } });
                if (accuracy.value === null && round.expected && round.weapon) {
                    const keys = ['operator', 'blockSize'].filter(key => Object.prototype.hasOwnProperty.call(round.weapon, key) && Object.prototype.hasOwnProperty.call(round.expected, key));
                    if (keys.length === 2) {
                        accuracy.correct = keys.filter(key => round.weapon[key] === round.expected[key]).length;
                        accuracy.total = 2; accuracy.value = accuracy.correct / 2;
                    }
                }
                output.push({ gameplayId: parent.gameplayId, gameplayLabel: parent.gameplayLabel,
                    attemptId: parent.attemptId + ':encounter:' + (index + 1), sourceAttemptId: parent.attemptId,
                    encounterIndex: index + 1, timestamp: parent.timestamp, passed: round.passed,
                    accuracy: accuracy.value, correctDecisions: accuracy.correct, totalDecisions: accuracy.total,
                    activeDurationMs: active !== null && active > 0 ? active : null,
                    preparationMs: this._number(round.preparationMs), preparationSkipped: round.preparationSkipped === true,
                    cohort: { unit: 'encounter', gameplayId: parent.gameplayId, version: parent.cohort.version,
                        stageId: parent.cohort.stageId, levelId: parent.cohort.levelId, task: 'two_step_address_assembly',
                        difficulty: parent.cohort.difficulty, workload: shape, timingMethod: 'subnet_decisions_v1' },
                });
            });
        });
        return output;
    },
    _median(values) {
        const sorted = values.filter(value => Number.isFinite(value)).slice().sort((a, b) => a - b);
        if (!sorted.length) return null;
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    },
    _dedupeEvents(events) {
        const seen = new Set();
        return events.filter(event => {
            if (!event || typeof event !== 'object') return false;
            const key = event.eventId ? 'id:' + event.eventId : JSON.stringify([event.eventType, event.attemptId, event.sessionId, event.timestamp, event.payload]);
            if (seen.has(key)) return false;
            seen.add(key); return true;
        }).slice().sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
    },
    _result(row) {
        const payload = row.payload || {};
        return payload.result && typeof payload.result === 'object' ? payload.result : row.result && typeof row.result === 'object' ? row.result : {};
    },
    _nonLearning(row) {
        const payload = row && row.payload || {};
        const result = this._result(row || {});
        const context = payload.context || payload.launchContext || {};
        const spec = row && row.spec || context.spec || payload.spec || {};
        return !!(row && (row.developerTest || row.developerTesting || row.developerSkip || row.developerFail || row.developerQuestFail || row.developerQuestSkip || row.practiceMode || row.practiceGameplay) || payload.developerTest || payload.developerTesting || payload.practiceMode ||
            result.developerSkip || result.developerFail || /^(developerQuestFail|developerQuestSkip)$/.test(String(result.source || row && row.source || '')) ||
            result.developerTest || result.developerTesting || result.practiceMode || context.developerTest || context.developerTesting || context.practiceMode || spec.developerTest || spec.practiceMode || payload.simulated);
    },
    _normalizeAttempts(source, events, catalog) {
        const starts = {};
        events.forEach(event => { if (event.eventType === 'attempt_start' && event.attemptId) starts[event.attemptId] = event; });
        const seen = new Set();
        return (Array.isArray(source) ? source : []).filter(row => row && typeof row === 'object').map((sourceRow, index) => {
            const row = Object.assign({}, starts[sourceRow.attemptId] || {}, sourceRow);
            const payload = row.payload || {};
            const result = this._result(row);
            const context = payload.context || payload.launchContext || {};
            const spec = row.spec || payload.spec || context.spec || {};
            const id = row.gameplayId || 'unknown_gameplay';
            const nonLearning = this._nonLearning(row);
            const outcome = String(row.outcome || (row.passed === true ? 'passed' : row.passed === false ? 'failed' : 'unassessed')).toLowerCase();
            const assessed = !row.cancelled && !result.cancelled && row.assessed !== false && (outcome === 'passed' || outcome === 'failed');
            const tutorial = !!(row.tutorial || row.tutorialReplay || result.tutorial || result.tutorialReplay || spec.tutorial || spec.tutorialReplay || context.tutorial || /guided|tutorial/i.test(String(row.mode || '')));
            const helpUsed = [row, payload, result].some(value => ['helpUses', 'helpOpenCount', 'helpElapsedMs', 'helpDurationMs'].some(key => Number(value[key]) > 0));
            const assisted = !!(row.assisted || row.tutorialAssisted || payload.assisted || payload.tutorialAssisted || result.assisted || context.assisted || helpUsed);
            const active = this._activeTime(row);
            const accuracy = this._accuracy(row);
            const key = row.attemptId || 'anonymous-' + index;
            const duplicate = seen.has(key); seen.add(key);
            const excluded = [];
            if (nonLearning) excluded.push('developer_or_practice');
            if (!assessed) excluded.push('unassessed_or_cancelled');
            if (tutorial) excluded.push('guided_tutorial');
            if (assisted) excluded.push('assisted');
            return {
                source: row, result, payload, gameplayId: id,
                gameplayLabel: catalog[id] && (catalog[id].label || catalog[id].name) || row.gameplayLabel || id,
                attemptId: key, timestamp: Number(row.timestamp || row.endedAt || row.startedAt) || 0,
                passed: outcome === 'passed', assessed, tutorial, assisted, nonLearning,
                eligible: assessed && !nonLearning && !tutorial && !assisted, excluded, duplicate,
                activeDurationMs: active.value, timingMethod: active.method,
                preparationMs: this._number(result.preparationMs === undefined ? payload.preparationMs : result.preparationMs),
                preparationSkipped: result.preparationSkips === undefined && payload.preparationSkips === undefined ? null : Number(result.preparationSkips === undefined ? payload.preparationSkips : result.preparationSkips) > 0,
                accuracy: accuracy.value, correctDecisions: accuracy.correct, totalDecisions: accuracy.total,
                cohort: this._cohortDescriptor(row, active.method),
            };
        }).filter(row => !row.duplicate).sort((a, b) => a.timestamp - b.timestamp || a.attemptId.localeCompare(b.attemptId));
    },
    _activeTime(row) {
        const payload = row.payload || {}, result = this._result(row);
        if (row.activeDurationKnown === false || payload.activeDurationKnown === false) return { value: null, method: 'unobserved' };
        const candidates = [row.activeDurationMs, payload.activeDurationMs, result.activeDurationMs, result.activeElapsedMs];
        for (let i = 0; i < candidates.length; i++) {
            const value = this._number(candidates[i]);
            if (value !== null && value > 0) return { value, method: row.durationMethod || payload.durationMethod || result.durationMethod || 'recorded_active' };
        }
        // Legacy elapsed counters may contain preparation, dialogue and tools.
        // Their components cannot be reconstructed accurately from a total.
        return { value: null, method: 'unobserved' };
    },
    _accuracy(row) {
        const payload = row.payload || {}, result = this._result(row);
        const counts = [row, payload, result];
        for (let i = 0; i < counts.length; i++) {
            const total = this._number(counts[i].totalDecisions), correct = this._number(counts[i].correctDecisions);
            if (total !== null && total > 0 && correct !== null && correct >= 0 && correct <= total) return { value: correct / total, correct, total };
        }
        const history = result.decisionHistory || payload.decisionHistory;
        if (Array.isArray(history)) {
            const checks = history.filter(item => item && typeof item.correct === 'boolean');
            if (checks.length) {
                const correct = checks.filter(item => item.correct).length;
                return { value: correct / checks.length, correct, total: checks.length };
            }
        }
        const totalShots = this._number(result.totalShots), correctShots = this._number(result.correctShots);
        if (/^subnet-blaster-v/.test(result.gameplayVersion || payload.gameplayVersion || '') && totalShots > 0 && correctShots !== null && correctShots >= 0 && correctShots <= totalShots) {
            return { value: correctShots / totalShots, correct: correctShots, total: totalShots };
        }
        const stats = result.slotStats || payload.slotStats || {};
        const totalChecks = this._number(stats.totalChecks), wrongChecks = this._number(stats.wrongChecks);
        if (totalChecks > 0 && wrongChecks !== null && wrongChecks >= 0 && wrongChecks <= totalChecks) return { value: (totalChecks - wrongChecks) / totalChecks, correct: totalChecks - wrongChecks, total: totalChecks };
        const delivered = this._number(result.delivered === undefined ? payload.delivered : result.delivered);
        const mistakes = this._number(result.mistakes === undefined ? payload.misroutes : result.mistakes);
        if (row.gameplayId === 'ip_patch_panel_classes' && delivered > 0 && mistakes !== null && mistakes >= 0 && mistakes <= delivered) return { value: (delivered - mistakes) / delivered, correct: delivered - mistakes, total: delivered };
        const value = this._number(row.accuracy);
        if (row.accuracyKnown === true && payload.accuracyKnown !== false && value !== null && value >= 0 && value <= 1) return { value, correct: null, total: null };
        // Old DTOs always filled a missing accuracy with zero. Without observed
        // grading evidence or an explicit known flag, that number is unreliable.
        return { value: null, correct: null, total: null };
    },
    _cohortDescriptor(row, timingMethod) {
        const payload = row.payload || {}, result = this._result(row);
        const context = payload.context || payload.launchContext || {}, spec = row.spec || payload.spec || context.spec || {};
        const scenario = result.scenario || payload.scenario || {};
        const schemaVersion = result.telemetrySchemaVersion || payload.telemetrySchemaVersion || row.telemetrySchemaVersion;
        const version = row.gameplayVersion || result.gameplayVersion || payload.gameplayVersion || context.gameplayVersion || (schemaVersion ? 'decision_schema_' + schemaVersion : 'legacy_unversioned');
        const profile = spec.profile || result.profile || payload.profile || {};
        const difficulty = this._firstRecorded(row.difficultyKey, result.difficultyKey, payload.difficultyKey, spec.difficultyKey, spec.difficulty, result.difficulty, payload.difficulty, profile.index);
        const task = row.taskType || result.taskType || payload.taskType || spec.taskType || result.terminalType || payload.terminalType || spec.terminalType || 'standard';
        const workload = {};
        ['requiredHosts', 'requiredSubnets', 'targetScore', 'targetCount', 'wireCount', 'zoneCount', 'branchId', 'roundLimit', 'originalCIDR'].forEach(key => {
            const value = result[key] !== undefined ? result[key] : payload[key] !== undefined ? payload[key] : spec[key];
            if (value !== undefined && value !== null) workload[key] = value;
        });
        Object.assign(workload, this._scenarioShape(spec), this._scenarioShape(payload), this._scenarioShape(scenario), this._scenarioShape(result));
        const decisions = Array.isArray(result.decisionHistory) ? result.decisionHistory : Array.isArray(payload.decisionHistory) ? payload.decisionHistory : [];
        const rounds = Array.isArray(result.roundHistory) ? result.roundHistory : Array.isArray(payload.roundHistory) ? payload.roundHistory : [];
        const shapes = rounds.length ? rounds : decisions;
        const contexts = new Map();
        shapes.forEach(source => {
            const shape = this._scenarioShape(source);
            if (Object.keys(shape).length) contexts.set(this._stableStringify(shape), shape);
        });
        if (contexts.size) {
            // A generated address or question identity does not change difficulty.
            // The set of actual class/bit/prefix/question types does. Sort and
            // deduplicate so shuffled order and repeated checks stay comparable.
            workload.scenarioSet = Array.from(contexts.keys()).sort().map(key => contexts.get(key));
        }
        return { unit: 'whole_launch', gameplayId: row.gameplayId || 'unknown_gameplay', version, stageId: Number(row.stageId) || 0, levelId: Number(row.levelId) || 0,
            task: String(task), difficulty: difficulty === undefined || difficulty === null ? 'not_recorded' : typeof difficulty === 'object' ? this._stableStringify(difficulty) : String(difficulty),
            workload, timingMethod, comparisonKey: row.comparisonKey || payload.comparisonKey || result.comparisonKey || null };
    },
    _exclusions(rows) {
        const counts = {};
        rows.forEach(row => row.excluded.forEach(reason => { counts[reason] = (counts[reason] || 0) + 1; }));
        return counts;
    },
    _windowAccuracy(rows) {
        const observed = rows.filter(row => row.accuracy !== null);
        if (!observed.length) return { rate: null, attemptCount: 0, correctDecisions: null, totalDecisions: null, method: 'unobserved' };
        const counted = observed.filter(row => row.totalDecisions !== null);
        if (counted.length === observed.length) {
            const correct = counted.reduce((sum, row) => sum + row.correctDecisions, 0), total = counted.reduce((sum, row) => sum + row.totalDecisions, 0);
            return { rate: correct / total, attemptCount: observed.length, correctDecisions: correct, totalDecisions: total, method: 'observed_decisions' };
        }
        return { rate: observed.reduce((sum, row) => sum + row.accuracy, 0) / observed.length, attemptCount: observed.length, correctDecisions: null, totalDecisions: null, method: 'mean_observed_attempt_accuracy' };
    },
    _cohort(rows, key) {
        const n = rows.length;
        const count = n >= 4 ? Math.min(5, Math.max(2, Math.floor(n / 3))) : 0;
        const encounter = rows[0].cohort.unit === 'encounter';
        const parents = Array.from(new Set(rows.map(row => row.sourceAttemptId || row.attemptId)));
        const parentWindow = parents.length >= 4 ? Math.min(5, Math.max(2, Math.floor(parents.length / 3))) : 0;
        const earlyParents = new Set(parents.slice(0, parentWindow)), recentParents = new Set(parentWindow ? parents.slice(-parentWindow) : []);
        const early = encounter ? rows.filter(row => earlyParents.has(row.sourceAttemptId)) : count ? rows.slice(0, count) : [];
        const recent = encounter ? rows.filter(row => recentParents.has(row.sourceAttemptId)) : count ? rows.slice(-count) : [];
        const windowsKnown = early.length >= 2 && recent.length >= 2;
        const earlyTimed = early.filter(row => row.passed && row.activeDurationMs !== null), recentTimed = recent.filter(row => row.passed && row.activeDurationMs !== null);
        const earlyMs = this._median(earlyTimed.map(row => row.activeDurationMs)), recentMs = this._median(recentTimed.map(row => row.activeDurationMs));
        const speedKnown = windowsKnown && earlyTimed.length >= 2 && recentTimed.length >= 2;
        const speed = speedKnown ? (earlyMs - recentMs) / earlyMs * 100 : null;
        const earlyAccuracy = this._windowAccuracy(early), recentAccuracy = this._windowAccuracy(recent);
        const accuracyKnown = earlyAccuracy.attemptCount >= 2 && recentAccuracy.attemptCount >= 2;
        const earlyPassed = early.filter(row => row.passed).length, recentPassed = recent.filter(row => row.passed).length;
        const activeSuccessful = rows.filter(row => row.passed && row.activeDurationMs !== null);
        let previousSuccessful = null;
        const curve = rows.map((row, index) => {
            const trailing = rows.slice(Math.max(0, index - 4), index + 1).filter(item => item.passed && item.activeDurationMs !== null);
            const rolling = this._median(trailing.map(item => item.activeDurationMs));
            const previous = previousSuccessful;
            if (row.passed && row.activeDurationMs !== null) previousSuccessful = row;
            return { cohortKey: key, unit: row.cohort.unit || 'whole_launch', gameplayId: row.gameplayId, attemptId: row.attemptId,
                sourceAttemptId: row.sourceAttemptId || row.attemptId, encounterIndex: row.encounterIndex || null,
                timestamp: row.timestamp, comparableAttemptNumber: index + 1,
                passed: row.passed, accuracy: row.accuracy, correctDecisions: row.correctDecisions, totalDecisions: row.totalDecisions,
                preparationMs: row.preparationMs === undefined ? null : row.preparationMs, preparationSkipped: row.preparationSkipped === undefined ? null : row.preparationSkipped,
                activeDurationMs: row.activeDurationMs, rollingMedianActiveMs: rolling, rollingTimedCount: trailing.length,
                previousTimedAttemptId: previous ? previous.attemptId : null,
                changeFromPreviousPercent: previous && row.passed && row.activeDurationMs !== null ? (previous.activeDurationMs - row.activeDurationMs) / previous.activeDurationMs * 100 : null,
                changeFromBaselinePercent: speedKnown && row.passed && row.activeDurationMs !== null ? (earlyMs - row.activeDurationMs) / earlyMs * 100 : null };
        });
        return { cohortKey: key, descriptor: rows[0].cohort, eligibleCount: n,
            status: windowsKnown ? (speedKnown || accuracyKnown ? 'comparable_evidence' : 'pass_rate_only') : 'insufficient_data',
            evidenceLevel: (encounter ? parents.length >= 10 : n >= 10) && speedKnown && accuracyKnown ? 'More observations' : windowsKnown ? 'Preliminary' : 'Insufficient',
            baselineCount: early.length, recentCount: recent.length,
            distinctSourceAttempts: parents.length, baselineSourceAttempts: encounter ? parentWindow : early.length, recentSourceAttempts: encounter ? parentWindow : recent.length,
            baselineStartedAt: early[0] && early[0].timestamp || null, baselineEndedAt: early.length ? early[early.length - 1].timestamp : null,
            recentStartedAt: recent[0] && recent[0].timestamp || null, recentEndedAt: recent.length ? recent[recent.length - 1].timestamp : null,
            typicalActiveMs: this._median(activeSuccessful.map(row => row.activeDurationMs)), typicalActiveCount: activeSuccessful.length,
            speedImprovementPercent: speed,
            speedComparison: { baselineMedianActiveMs: earlyMs, recentMedianActiveMs: recentMs, baselineCount: earlyTimed.length, recentCount: recentTimed.length,
                status: speedKnown ? 'comparable_evidence' : 'insufficient_data', reason: speedKnown ? null : encounter ? 'At least four distinct gameplay runs with matched encounters, and two successful active-time observations per window, are required.' : 'At least two successful active-time observations are required in both non-overlapping windows.' },
            accuracyChangePp: accuracyKnown ? (recentAccuracy.rate - earlyAccuracy.rate) * 100 : null,
            accuracyComparison: { baseline: earlyAccuracy, recent: recentAccuracy, status: accuracyKnown ? 'comparable_evidence' : 'insufficient_data' },
            passRateChangePp: windowsKnown ? (recentPassed / recent.length - earlyPassed / early.length) * 100 : null,
            passComparison: { baselinePassed: earlyPassed, baselineAssessed: early.length, recentPassed, recentAssessed: recent.length },
            qualityWarning: speed !== null && speed > 0 && (accuracyKnown && recentAccuracy.rate < earlyAccuracy.rate || recentPassed / recent.length < earlyPassed / early.length)
                ? 'Faster completion coincides with lower accuracy or pass rate; do not interpret speed alone as mastery.' : null,
            qualityGate: !windowsKnown || !accuracyKnown ? 'unobserved' : recentAccuracy.rate < earlyAccuracy.rate || recentPassed / recent.length < earlyPassed / early.length ? 'decreased' : 'maintained',
            validatedSpeedImprovementPercent: speedKnown && accuracyKnown && recentAccuracy.rate >= earlyAccuracy.rate && recentPassed / recent.length >= earlyPassed / early.length ? speed : null,
            curve };
    },
    _aggregateComparisons(cohorts) {
        const comparable = cohorts.filter(row => row.baselineCount >= 2 && row.recentCount >= 2);
        const speed = cohorts.filter(row => row.speedImprovementPercent !== null), accuracy = cohorts.filter(row => row.accuracyChangePp !== null);
        return { status: comparable.length ? 'comparable_evidence' : 'insufficient_data',
            speedImprovementPercent: this._median(speed.map(row => row.speedImprovementPercent)),
            validatedSpeedImprovementPercent: this._median(cohorts.map(row => row.validatedSpeedImprovementPercent)),
            accuracyChangePp: this._median(accuracy.map(row => row.accuracyChangePp)),
            passRateChangePp: this._median(comparable.map(row => row.passRateChangePp)),
            comparableCohortCount: comparable.length, speedCohortCount: speed.length, accuracyCohortCount: accuracy.length,
            baselineCount: comparable.reduce((sum, row) => sum + row.baselineCount, 0),
            recentCount: comparable.reduce((sum, row) => sum + row.recentCount, 0),
            speedBaselineCount: speed.reduce((sum, row) => sum + row.speedComparison.baselineCount, 0),
            speedRecentCount: speed.reduce((sum, row) => sum + row.speedComparison.recentCount, 0),
            qualityWarnings: cohorts.map(row => row.qualityWarning).filter(Boolean),
        };
    },

    _emptyRecovery(gameplayId) {
        return { gameplayId: gameplayId || null, gameOvers: 0, gameplayGameOvers: 0, guidedGameplayGameOvers: 0, tutorialOffers: 0, tutorialShown: 0, tutorialStarted: 0,
            tutorialCompleted: 0, tutorialFailed: 0, tutorialCancelled: 0, tutorialSelected: 0,
            tutorialContinued: 0, repeatedMistakeTutorialOffers: 0, repeatedMistakeTutorialShown: 0, guidedAttemptCount: 0 };
    },
    _recovery(events, attempts) {
        const totals = this._emptyRecovery();
        const groups = {}, evidence = [], seen = new Set();
        const repeatedOffers = new Set(events.filter(event => {
            const payload = event.payload || {};
            return event.eventType === 'neural_tutorial_offer' && !this._nonLearning(event) &&
                (/repeated/.test(String(payload.triggerReason || '')) || Number(payload.failureCount) >= 2);
        }).map(event => event.payload.tutorialOfferId || event.payload.offerId).filter(Boolean));
        const add = (event, counter, identity, extra) => {
            const gameplayId = event.gameplayId || 'unknown_gameplay';
            const key = counter + '|' + identity;
            if (seen.has(key)) return;
            seen.add(key);
            if (!groups[gameplayId]) groups[gameplayId] = this._emptyRecovery(gameplayId);
            totals[counter]++; groups[gameplayId][counter]++;
            evidence.push(Object.assign({ counter, eventId: event.eventId || null, attemptId: event.attemptId || null, gameplayId, timestamp: Number(event.timestamp) || 0 }, extra || {}));
        };
        const gameplayOver = (event, identity) => {
            if (this._nonLearning(event)) return;
            const p = event.payload || {}, r = this._result(event);
            const detail = p.gameplayGameOver && typeof p.gameplayGameOver === 'object' ? p.gameplayGameOver : {};
            const reason = detail.reason || event.failureReason || r.reason;
            if (event.cancelled || r.cancelled || event.outcome === 'cancelled' || event.outcome === 'interrupted') return;
            const failed = event.outcome === 'failed' || event.passed === false || r.passed === false;
            if (!failed || !(p.gameplayGameOver || reason === 'attempts_exhausted' || reason === 'hearts_exhausted')) return;
            const key = detail.attemptId || event.attemptId || identity;
            add(event, 'gameplayGameOvers', key, { reason: reason || 'explicit_gameplay_game_over' });
            if (detail.tutorial || event.tutorial || r.tutorial) add(event, 'guidedGameplayGameOvers', key, { reason: reason || null });
        };
        events.forEach((event, index) => {
            if (this._nonLearning(event)) return;
            const p = event.payload || {}, identity = event.eventId || 'event-' + index;
            const replayId = p.tutorialReplayId || p.replayId;
            const offerId = p.tutorialOfferId || p.offerId;
            const runId = p.neuralRunId || event.neuralRunId;
            if (event.eventType === 'attempt_end') gameplayOver(event, identity);
            if (event.eventType === 'neural_game_over' && p.simulated !== true) add(event, 'gameOvers', runId || identity, { triggerReason: p.triggerReason || null });
            if (event.eventType === 'attempt_end' && p.neuralGameOver) {
                const detail = typeof p.neuralGameOver === 'object' ? p.neuralGameOver : p;
                add(event, 'gameOvers', detail.neuralRunId || runId || event.attemptId || identity, { triggerReason: detail.triggerReason || 'recorded_game_over' });
            }
            if (event.eventType === 'neural_tutorial_offer') {
                const choice = p.choice || p.action;
                if (choice === 'shown' || choice === 'offered') {
                    add(event, 'tutorialOffers', offerId || identity, { failureCount: this._number(p.failureCount), triggerReason: p.triggerReason || null });
                    if (/repeated/.test(String(p.triggerReason || '')) || Number(p.failureCount) >= 2) add(event, 'repeatedMistakeTutorialOffers', offerId || identity);
                } else if (choice === 'tutorial' || choice === 'accepted') add(event, 'tutorialSelected', offerId || identity);
                else if (choice === 'continue' || choice === 'declined') add(event, 'tutorialContinued', offerId || identity);
            }
            if (event.eventType === 'neural_tutorial_replay') {
                const action = p.action;
                const counters = { shown: 'tutorialShown', started: 'tutorialStarted', completed: 'tutorialCompleted', finished: 'tutorialCompleted',
                    passed: 'tutorialCompleted', failed: 'tutorialFailed', cancelled: 'tutorialCancelled' };
                if (counters[action]) add(event, counters[action], replayId || identity, { triggerReason: p.triggerReason || null, tutorialOfferId: offerId || null });
                if (action === 'shown' && (/repeated/.test(String(p.triggerReason || '')) || Number(p.failureCount) >= 2 || repeatedOffers.has(offerId))) {
                    add(event, 'repeatedMistakeTutorialShown', replayId || identity, { triggerReason: p.triggerReason || 'linked_repeated_mistake_offer', tutorialOfferId: offerId || null });
                }
            }
        });
        attempts.forEach(row => {
            if (row.nonLearning) return;
            gameplayOver(row.source, row.attemptId);
            if (!row.tutorial) return;
            if (!groups[row.gameplayId]) groups[row.gameplayId] = this._emptyRecovery(row.gameplayId);
            totals.guidedAttemptCount++; groups[row.gameplayId].guidedAttemptCount++;
        });
        return Object.assign(totals, { perGameplay: Object.keys(groups).sort().map(id => groups[id]), evidence,
            evidenceCoverage: {
                gameOvers: events.some(event => event.eventType === 'neural_game_over' || event.payload && event.payload.neuralGameOver) ? 'recorded_events' : 'no_recorded_events',
                gameplayGameOvers: evidence.some(row => row.counter === 'gameplayGameOvers') ? 'explicit_exhaustion_or_game_over_records' : 'no_explicit_game_over_records',
                tutorialShown: events.some(event => event.eventType === 'neural_tutorial_replay' && event.payload && event.payload.action === 'shown') ? 'explicit_screen_events' : 'not_recorded_in_legacy_history',
                note: 'Counts are observed events within the export window, not lifetime totals. Gameplay exhaustion and campaign neural depletion are separate counters; generic failed attempts are not automatically game overs. Offers, starts and visible tutorial screens are separate events. Missing legacy events cannot be reconstructed.',
            } });
    },

    _concept(gameplayId, detail) {
        const m = typeof detail === 'string' ? { reason: detail } : detail || {};
        const navigation = m.concept === 'quarantine_route_navigation' || gameplayId === 'ip_cidr_quarantine' && /^(virus|disconnected|virus_overrun)$/.test(String(m.issueType || m.diagnosticReason || ''));
        const raw = navigation ? 'quarantine_route_navigation' : String(m.stepKey || m.gameplayStep || m.concept || m.reason || m.taskType || m.issueType || m.mistakeType || '');
        const aliases = { operator: 'address_direction', address_operator: 'address_direction', subnet_operator: 'address_direction',
            hostBits: 'host_bits', remaining_host_bits: 'host_bits', borrowedBits: 'borrowed_bits', blockSize: 'block_size',
            subnet_block_size: 'block_size', host_power: 'host_capacity', exponent: 'host_capacity', targetExponent: 'host_capacity',
            minimum_host_bits: 'host_capacity', classify: 'ip_classification', ipv4_classification: 'ip_classification',
            default_prefix: 'class_default_prefix', borrow_bits: 'borrowed_bits', new_cidr: 'borrowed_bits_to_cidr',
            route_host_bits: 'route_host_bit_total', formula_order: 'formula_selection',
            subnet_mask_classification: 'mask_classification', decimal_mask_to_binary: 'subnet_mask_binary', binary_mask_to_cidr: 'cidr_prefix',
            ip_classification_route: 'ip_classification', wrong_class_mapping: 'ip_classification', misroute: 'ip_classification',
            mask_to_binary: 'subnet_mask_binary', wrong_binary_mask: 'subnet_mask_binary', binary_to_cidr: 'cidr_prefix', wrong_cidr_prefix: 'cidr_prefix',
            networkAddress: 'network_address', broadcastAddress: 'broadcast_address', gatewayAddress: 'first_usable', firstUsable: 'first_usable',
            reserveAddress: 'last_usable', lastUsable: 'last_usable', usableRange: 'usable_range',
            totalHosts: 'total_hosts', usableHosts: 'usable_hosts', usableSubnets: 'subnet_count', totalSubnets: 'subnet_count',
            wrong_formula: 'formula_selection', wrong_variables: 'formula_variables', capacity_too_small: 'vlsm_host_to_prefix',
            cidr_not_optimal: 'vlsm_host_to_prefix', misaligned_network: 'vlsm_block_alignment', overlap: 'vlsm_overlap_check', out_of_parent_range: 'vlsm_parent_containment' };
        let key = aliases[raw] || raw;
        if (!key || /^(wrong_answer|missing_answer|invalid_allocation|route_table_rejected)$/.test(key)) {
            const defaults = { ip_class_wires: 'ip_classification', ip_class_wires_harder: 'ip_classification', ip_patch_panel_classes: 'ip_classification',
                ip_cidr_binary_panel: 'cidr_prefix', ip_cidr_binary_panel_harder: 'cidr_prefix', ip_subnet_simulator: 'subnet_calculation',
                ip_host_power_reactor: 'host_capacity', ip_cidr_quarantine: 'cidr_optimization', ip_cidr_quarantine_matrix: 'address_assembly',
                ip_network_repair: 'network_range_calculation', ip_vlsm_allocator: 'vlsm_allocation' };
            key = defaults[gameplayId] || 'unclassified_check';
        }
        const concepts = {
            address_direction: ['Address formula direction', 'Practice when to add a block to a network address and subtract a block from a broadcast address, keeping the final -1 or +1 boundary correction.'],
            host_bits: ['Remaining host bits', 'Use class defaults /8, /16 and /24 to distinguish borrowed bits from remaining host bits before calculating 2^h.'],
            borrowed_bits: ['Borrowed subnet bits', 'Separate class-default host bits from borrowed bits; remaining host bits equal available host bits minus borrowed bits.'],
            block_size: ['Subnet block size (2^h)', 'Calculate 2^h from remaining host bits. A block includes network and broadcast addresses; 2^h - 2 counts usable hosts.'],
            ip_classification: ['IPv4 class identification and routing', 'Review first-octet class boundaries and match each address to its class before routing.'],
            mask_classification: ['Default subnet mask classification', 'Match each class to its default subnet mask: A /8, B /16 and C /24.'],
            class_default_prefix: ['Class default prefix', 'Identify the IPv4 class first, then use the class default: A /8, B /16 or C /24.'],
            borrowed_bits_to_cidr: ['Borrowed bits to CIDR prefix', 'Add borrowed subnet bits to the class default prefix, then verify the remaining host bits.'],
            route_host_bit_total: ['Route host-bit total', 'Check the sum of the route tile weights against the required remaining host bits.'],
            quarantine_route_navigation: ['Quarantine route navigation', 'Review route connectivity and hazards separately from CIDR calculations. Navigation errors alone do not establish a subnetting misconception.'],
            subnet_mask_binary: ['Subnet mask binary conversion', 'Convert each mask octet to eight bits and check that all mask 1 bits form one continuous prefix.'],
            cidr_prefix: ['CIDR prefix calculation', 'Count the continuous network bits in the mask and distinguish the prefix length from the number of host bits.'],
            subnet_count: ['Subnet count', 'Identify borrowed bits first, then compute 2^s subnets under the current subnetting rules.'],
            total_hosts: ['Total addresses in a subnet', 'Compute 2^h total addresses from the remaining host bits.'],
            usable_hosts: ['Usable host capacity', 'For these conventional IPv4 subnets, subtract the network and broadcast reservations from 2^h.'],
            host_capacity: ['Host demand and power-of-two sizing', 'Choose the smallest 2^h block that covers the host demand plus reserved addresses, then convert h to the prefix.'],
            network_address: ['Network address calculation', 'Find the aligned start of the block, or subtract block size from broadcast and add 1.'],
            broadcast_address: ['Broadcast address calculation', 'Add block size to the aligned network address, then subtract 1.'],
            first_usable: ['First usable host address', 'Find the network address first, then add 1 for these conventional IPv4 subnets.'],
            last_usable: ['Last usable host address', 'Find the broadcast address first, then subtract 1 for these conventional IPv4 subnets.'],
            usable_range: ['Usable host range', 'Compute both subnet boundaries before choosing the first and last usable host addresses.'],
            cidr_optimization: ['CIDR capacity optimization', 'Compare required host demand with usable capacity and choose the smallest sufficient aligned subnet.'],
            address_assembly: ['Network/broadcast formula assembly', 'Review operator direction and block size separately before assembling the requested address formula.'],
            formula_selection: ['Network formula selection', 'Identify which address is given and which boundary is requested before selecting the formula.'],
            formula_variables: ['Formula input selection', 'Distinguish the given address, host bits, borrowed bits and block size before substituting values.'],
            vlsm_host_to_prefix: ['VLSM host-to-prefix sizing', 'Size each branch to the smallest sufficient power-of-two block, including reserved addresses.'],
            vlsm_block_alignment: ['VLSM network alignment', 'Start each allocation on a valid boundary for its block size.'],
            vlsm_overlap_check: ['VLSM overlap analysis', 'Compare complete address intervals and keep branch allocations disjoint.'],
            vlsm_parent_containment: ['VLSM parent network containment', 'Check that both ends of every branch block remain inside the parent network.'],
            vlsm_final_validation: ['VLSM route table validation', 'Review branch sizing, alignment, containment and overlap before committing the final route table.'],
            vlsm_branch_coverage: ['VLSM branch coverage', 'Make sure every required branch has a valid subnet before committing the route table.'],
            vlsm_allocation: ['VLSM allocation', 'Review capacity, network alignment, parent containment and overlap as separate checks.'],
            network_range_calculation: ['Network range analysis', 'Derive the block size and aligned subnet boundaries before computing usable hosts.'],
            subnet_calculation: ['Subnet calculation', 'Identify borrowed and host bits first, then derive capacity and subnet boundaries.'],
            unclassified_check: ['Unclassified recorded check', 'Inspect the recorded submission and expected value; more structured evidence is needed to identify the concept.'],
        };
        const known = concepts[key];
        return { key, label: known ? known[0] : m.stepLabel || key.replace(/[_-]/g, ' '),
            recommendation: known ? known[1] : 'Review worked examples for ' + (m.stepLabel || key.replace(/[_-]/g, ' ')) + ' and compare the submitted and expected values.' };
    },
    _weaknesses(attempts, events, catalog) {
        const attemptMap = {}, sources = {};
        attempts.forEach(row => { attemptMap[row.attemptId] = row; });
        const add = (attemptId, gameplayId, detail, source, count, timestamp) => {
            if (!gameplayId) return;
            const attempt = attemptMap[attemptId];
            if (attempt && attempt.nonLearning) return;
            const concept = this._concept(gameplayId, detail), id = attemptId || 'unlinked-' + timestamp;
            const key = gameplayId + '|' + concept.key + '|' + id;
            if (!sources[key]) sources[key] = { gameplayId, concept, attemptId: id, assessed: !!(attempt && attempt.assessed), independent: !!(attempt && attempt.eligible), tutorial: !!(attempt && attempt.tutorial), linked: !!attempt,
                timestamp: timestamp || attempt && attempt.timestamp || 0, counts: {}, examples: [] };
            const row = sources[key];
            row.counts[source] = (row.counts[source] || 0) + Math.max(1, Number(count) || 1);
            if (typeof detail === 'object' && detail) {
                const submitted = detail.submittedText !== undefined ? detail.submittedText : detail.submitted !== undefined ? detail.submitted : detail.targetClass;
                const expected = detail.expectedText !== undefined ? detail.expectedText : detail.expected !== undefined ? detail.expected : detail.sourceClass;
                if (submitted !== undefined || expected !== undefined) row.examples.push({ submitted: submitted === undefined ? null : submitted, expected: expected === undefined ? null : expected });
            }
        };
        events.forEach((event, index) => {
            if (event.eventType !== 'attempt_mistake' || this._nonLearning(event)) return;
            const p = event.payload || {};
            const mistakes = Array.isArray(p.mistakes) ? p.mistakes : [];
            mistakes.forEach(detail => add(event.attemptId || 'event-' + index, event.gameplayId, detail, 'mistake_events', 1, event.timestamp));
        });
        attempts.forEach(attempt => {
            if (attempt.nonLearning) return;
            const p = attempt.payload, r = attempt.result, id = attempt.attemptId, game = attempt.gameplayId;
            const decisions = Array.isArray(r.decisionHistory) ? r.decisionHistory : Array.isArray(p.decisionHistory) ? p.decisionHistory : [];
            decisions.filter(detail => detail && detail.correct === false).forEach(detail => add(id, game, detail, 'decision_history', 1, attempt.timestamp));
            const mistakes = Array.isArray(p.mistakes) ? p.mistakes : Array.isArray(r.mistakes) ? r.mistakes : [];
            mistakes.forEach(detail => add(id, game, detail, 'attempt_mistakes', 1, attempt.timestamp));
            const rounds = Array.isArray(r.roundHistory) ? r.roundHistory : Array.isArray(p.roundHistory) ? p.roundHistory : [];
            rounds.forEach(round => (Array.isArray(round.mistakes) ? round.mistakes : []).forEach(detail => add(id, game, detail, 'round_history', 1, attempt.timestamp)));
            const slots = r.slotStats && r.slotStats.wrongSlotFrequency || p.wrongSlotFrequency || p.slotStats && p.slotStats.wrongSlotFrequency || {};
            Object.keys(slots).forEach(stepKey => { if (Number(slots[stepKey]) > 0) add(id, game, { stepKey }, 'slot_counts', Number(slots[stepKey]), attempt.timestamp); });
            // Legacy Wires kept only wrong mappings, without separate events.
            if (!mistakes.length && Array.isArray(p.wrongMappings)) p.wrongMappings.forEach(detail => add(id, game, detail, 'wrong_mappings', 1, attempt.timestamp));
        });
        const grouped = {};
        Object.keys(sources).forEach(key => {
            const row = sources[key], groupKey = row.gameplayId + '|' + row.concept.key;
            if (!grouped[groupKey]) grouped[groupKey] = { gameplayId: row.gameplayId, concept: row.concept, mistakeCount: 0,
                attempts: new Set(), assessed: new Set(), independent: new Set(), tutorials: new Set(), independentMistakeCount: 0, tutorialMistakeCount: 0,
                unlinkedMistakeCount: 0, examples: [], sources: new Set(), lastObservedAt: 0 };
            const group = grouped[groupKey];
            const count = Math.max.apply(null, Object.values(row.counts));
            group.mistakeCount += count; group.attempts.add(row.attemptId);
            if (row.assessed) group.assessed.add(row.attemptId);
            if (row.independent) { group.independent.add(row.attemptId); group.independentMistakeCount += count; }
            if (row.tutorial) { group.tutorials.add(row.attemptId); group.tutorialMistakeCount += count; }
            if (!row.linked) group.unlinkedMistakeCount += count;
            Object.keys(row.counts).forEach(source => group.sources.add(source));
            group.examples = group.examples.concat(row.examples).slice(0, 3);
            group.lastObservedAt = Math.max(group.lastObservedAt, row.timestamp);
        });
        const rows = Object.keys(grouped).map(key => {
            const group = grouped[key];
            const assessed = attempts.filter(row => row.gameplayId === group.gameplayId && row.eligible).length;
            const allAssessed = attempts.filter(row => row.gameplayId === group.gameplayId && row.assessed && !row.nonLearning).length;
            const label = catalog[group.gameplayId] && (catalog[group.gameplayId].label || catalog[group.gameplayId].name) ||
                attempts.find(row => row.gameplayId === group.gameplayId)?.gameplayLabel || group.gameplayId;
            return { gameplayId: group.gameplayId, gameplayLabel: label, conceptKey: group.concept.key, conceptLabel: group.concept.label,
                evidenceType: 'structured_checks', mistakeCount: group.mistakeCount, independentMistakeCount: group.independentMistakeCount,
                tutorialMistakeCount: group.tutorialMistakeCount, affectedTutorialAttempts: group.tutorials.size,
                affectedAttempts: group.attempts.size, affectedAssessedAttempts: group.independent.size,
                affectedAllAssessedAttempts: group.assessed.size, allAssessedAttempts: allAssessed,
                assessedAttempts: assessed, affectedAttemptRate: assessed ? group.independent.size / assessed : null,
                unlinkedMistakeCount: group.unlinkedMistakeCount, confidence: group.independent.size >= 5 && assessed >= 10 ? 'More observations' : group.independent.size >= 3 ? 'Developing evidence' : 'Limited evidence',
                recommendation: group.concept.recommendation, examples: group.examples, evidenceSources: Array.from(group.sources), lastObservedAt: group.lastObservedAt,
                countMethod: 'Largest count per attempt/concept across mirrored evidence sources; never sum duplicate event, decision, round and result records.' };
        });
        const gameplayIds = Array.from(new Set(attempts.filter(row => row.eligible).map(row => row.gameplayId)));
        gameplayIds.forEach(gameplayId => {
            const independent = attempts.filter(row => row.eligible && row.gameplayId === gameplayId);
            const failed = independent.filter(row => !row.passed);
            if (failed.length < 2 || rows.some(row => row.gameplayId === gameplayId && row.affectedAssessedAttempts > 0)) return;
            rows.push({ gameplayId, gameplayLabel: independent[0].gameplayLabel, conceptKey: 'completion_consistency', conceptLabel: 'Repeated unsuccessful attempts',
                evidenceType: 'outcome_pattern', mistakeCount: 0, independentMistakeCount: 0, tutorialMistakeCount: 0, affectedTutorialAttempts: 0,
                failedAttempts: failed.length, affectedAttempts: failed.length, affectedAssessedAttempts: failed.length,
                affectedAllAssessedAttempts: failed.length, allAssessedAttempts: independent.length, assessedAttempts: independent.length,
                affectedAttemptRate: failed.length / independent.length, unlinkedMistakeCount: 0,
                confidence: independent.length >= 10 ? 'More observations' : independent.length >= 4 ? 'Developing evidence' : 'Limited evidence',
                recommendation: 'Review a worked example and collect structured checks before assigning a specific misconception. Repeated failures indicate a completion difficulty even when older accuracy fields appear high.',
                examples: [], evidenceSources: ['assessed_outcomes'], lastObservedAt: failed[failed.length - 1].timestamp,
                countMethod: 'Failed independent assessed attempts; no inferred concept-level mistake count.' });
        });
        return rows.sort((a, b) => b.affectedAssessedAttempts - a.affectedAssessedAttempts || b.independentMistakeCount - a.independentMistakeCount || b.mistakeCount - a.mistakeCount || a.conceptKey.localeCompare(b.conceptKey));
    },
    _feedback(perGameplay, weaknesses, recovery, improvement) {
        const priorities = weaknesses.filter(row => row.affectedAssessedAttempts > 0).slice(0, 5).map(row => ({ gameplayId: row.gameplayId, gameplayLabel: row.gameplayLabel,
            concept: row.conceptLabel, evidence: row.evidenceType === 'outcome_pattern'
                ? row.failedAttempts + ' failed independent attempt(s) out of ' + row.assessedAttempts + '; concept-specific evidence is unavailable.'
                : row.independentMistakeCount + ' independent observed mistake(s) across ' + row.affectedAssessedAttempts + ' attempt(s); ' + row.assessedAttempts + ' independent assessed attempt(s) available. Guided mistakes are reported separately.',
            recommendation: row.recommendation, confidence: row.confidence }));
        const strengths = perGameplay.flatMap(row => row.cohorts.filter(cohort => {
            const recent = cohort.accuracyComparison.recent;
            return cohort.recentCount >= 2 && recent.attemptCount >= 2 && recent.rate >= 0.9 && cohort.passComparison.recentPassed === cohort.passComparison.recentAssessed;
        }).map(cohort => ({ gameplayId: row.gameplayId, gameplayLabel: row.gameplayLabel,
            evidence: 'Recent observed accuracy ' + (cohort.accuracyComparison.recent.rate * 100).toFixed(1) + '%; passed ' + cohort.passComparison.recentPassed + '/' + cohort.passComparison.recentAssessed + ' matched recent attempts.',
            confidence: cohort.evidenceLevel })));
        const cautions = [improvement.limitation, recovery.evidenceCoverage.note];
        if (improvement.status === 'insufficient_data') cautions.push('At least four comparable unassisted assessed attempts per cohort are needed before a change percentage can be reported.');
        if (!improvement.speedCohortCount) cautions.push('No matched active-time speed comparison is available. Legacy wall-clock duration includes interruptions and is not a speed score.');
        if (improvement.speedCohortCount && !improvement.accuracyCohortCount) cautions.push('Observed timing change has no matched accuracy coverage. It cannot pass the learning quality gate or establish mastery.');
        cautions.push(...improvement.qualityWarnings);
        let summary;
        if (priorities.length) summary = 'Prioritize ' + priorities[0].concept.toLowerCase() + ' in ' + priorities[0].gameplayLabel + '. ' + priorities[0].recommendation;
        else if (strengths.length) summary = 'Recent matched attempts show consistent success in ' + strengths[0].gameplayLabel + '. Continue collecting independent attempts before extending that conclusion to other skills.';
        else summary = 'More assessed attempts and structured decision evidence are needed to identify strengths and priorities. Completion alone does not establish conceptual mastery.';
        if (recovery.gameOvers) summary += ' ' + recovery.gameOvers + ' recorded neural game-over event(s) warrant checking the recovery history.';
        return { summary, priorities, strengths, cautions };
    },
};

IP2Live.ReportLearningAnalytics = IP2LiveReportLearningAnalytics;
