const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', 'Plugins', 'IP2Live_Core', 'modules', 'report_learning_analytics.js'), 'utf8');
const IP2Live = {};
new Function('IP2Live', source)(IP2Live);
const analytics = IP2Live.ReportLearningAnalytics;
const catalog = [{ gameplayId: 'ip_cidr_quarantine_matrix', label: 'Subnet Blaster' }, { gameplayId: 'ip_class_wires', label: 'IP Class Wires' }];

function attempt(number, overrides = {}) {
    const row = {
        attemptId: 'a-' + number, gameplayId: 'ip_cidr_quarantine_matrix', timestamp: number * 1000,
        stageId: 3, levelId: 2, passed: true, outcome: 'passed', assessed: true,
        activeDurationMs: 10000, durationMethod: 'subnet_decisions_v1',
        accuracyKnown: true, correctDecisions: 2, totalDecisions: 2,
        payload: { result: { gameplayVersion: 'subnet-blaster-v4' } },
    };
    return Object.assign(row, overrides);
}
function analyze(attempts, events = []) { return analytics.analyze({ attempts, events, gameplayCatalog: catalog }); }
function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 0.000001, String(actual) + ' differs from ' + expected); }
function freeze(value) {
    Object.freeze(value);
    Object.values(value).forEach(item => { if (item && typeof item === 'object' && !Object.isFrozen(item)) freeze(item); });
    return value;
}

// Independent windows, exactly two observations each; chronological input order
// is irrelevant, and no input objects or nested result histories are mutated.
{
    const rows = freeze([attempt(4, { activeDurationMs: 5000 }), attempt(1), attempt(3, { activeDurationMs: 5000 }), attempt(2)]);
    const before = JSON.stringify(rows);
    const result = analyze(rows);
    const cohort = result.perGameplay[0].cohorts[0];
    assert.equal(JSON.stringify(rows), before);
    assert.equal(cohort.status, 'comparable_evidence');
    assert.equal(cohort.speedImprovementPercent, 50);
    assert.equal(cohort.validatedSpeedImprovementPercent, 50);
    assert.equal(cohort.speedComparison.baselineMedianActiveMs, 10000);
    assert.equal(cohort.speedComparison.recentMedianActiveMs, 5000);
    assert.equal(cohort.speedComparison.baselineCount, 2);
    assert.equal(cohort.speedComparison.recentCount, 2);
    assert.equal(cohort.typicalActiveMs, 7500);
    assert.equal(cohort.passRateChangePp, 0);
    assert.deepEqual(cohort.curve.map(row => row.attemptId), ['a-1', 'a-2', 'a-3', 'a-4']);
    assert.equal(cohort.curve[3].changeFromBaselinePercent, 50);
    assert.equal(cohort.curve[3].rollingMedianActiveMs, 7500);
    assert.equal(cohort.curve[0].changeFromPreviousPercent, null);
    assert.equal(cohort.curve[2].changeFromPreviousPercent, 50);
    assert.equal(cohort.curve[2].previousTimedAttemptId, 'a-2');
    assert.equal(cohort.curve[3].changeFromPreviousPercent, 0);
    assert.equal(result.improvement.comparableGameplayCount, 1);
    assert.equal(result.coverage.eligibleAttempts, 4);
}

// Matched early/recent medians resist individual stalls rather than comparing
// the fastest run or treating a single attempt as a trend.
{
    const durations = [10000, 10000, 999000, 7000, 6000, 6000, 5000, 5000, 500000];
    const result = analyze(durations.map((value, index) => attempt(index + 1, { activeDurationMs: value })));
    const cohort = result.perGameplay[0].cohorts[0];
    assert.equal(cohort.baselineCount, 3);
    assert.equal(cohort.recentCount, 3);
    assert.equal(cohort.speedImprovementPercent, 50);
    assert.equal(cohort.curve[8].rollingTimedCount, 5);
    const few = analyze([attempt(1), attempt(2), attempt(3)]);
    assert.equal(few.improvement.status, 'insufficient_data');
    assert.equal(few.improvement.speedImprovementPercent, null);
    assert.match(few.feedback.cautions.join(' '), /four comparable/);
}

// Cancelled, orphaned, developer, practice, tutorial and assisted results cannot
// inflate the independent baseline, even when they look perfect and very fast.
{
    const rows = [attempt(1), attempt(2), attempt(3), attempt(4),
        attempt(5, { cancelled: true, outcome: 'cancelled' }),
        attempt(6, { outcome: 'interrupted' }), attempt(7, { assessed: false }),
        attempt(8, { developerTesting: true }), attempt(9, { practiceMode: true }),
        attempt(10, { tutorial: true }), attempt(11, { tutorialAssisted: true }), attempt(12, { mode: 'Guided tutorial' }),
        attempt(1)];
    const result = analyze(rows);
    assert.equal(result.coverage.eligibleAttempts, 4);
    assert.equal(result.coverage.excludedDeveloperPractice, 2);
    assert.equal(result.coverage.instances, 10);
    assert.equal(result.perGameplay[0].cohorts[0].eligibleCount, 4);
    assert.equal(result.recovery.guidedAttemptCount, 2);
    assert.equal(result.perGameplay[0].exclusions.guided_tutorial, 2);
}

// A redesign, task change, workload, stage, difficulty or timing definition must
// not masquerade as improvement. Random IP addresses are not difficulty keys.
{
    const variants = [
        { payload: { result: { gameplayVersion: 'subnet-blaster-v3' } } },
        { taskType: 'networkAddress' }, { stageId: 4 }, { levelId: 3 },
        { difficultyKey: 'hard' }, { payload: { result: { gameplayVersion: 'subnet-blaster-v4', requiredHosts: 50 } } },
        { durationMethod: 'wall_clock' },
    ];
    variants.forEach(change => {
        const result = analyze([attempt(1), attempt(2), attempt(3, change), attempt(4, change)]);
        assert.equal(result.perGameplay[0].cohorts.length, 2);
        assert.equal(result.improvement.status, 'insufficient_data');
    });
    const result = analyze([1, 2, 3, 4].map(n => attempt(n, { payload: { result: { gameplayVersion: 'subnet-blaster-v4', problemId: 'random-' + n, baseCIDR: '192.168.' + n + '.0/24' } } })));
    assert.equal(result.perGameplay[0].cohorts.length, 1);
}

// Wall-clock time, missing and nonpositive active durations are never substituted
// for active decision time. Old preparation time is not reconstructible.
{
    const rows = [1, 2, 3, 4].map(n => attempt(n, {
        activeDurationMs: null, durationMs: n < 3 ? 100000 : 1000,
        payload: { result: { gameplayVersion: 'subnet-blaster-v4', elapsedMs: n < 3 ? 100000 : 1000 } },
    }));
    const result = analyze(rows);
    assert.equal(result.improvement.speedImprovementPercent, null);
    assert.equal(result.coverage.missingActiveTimeAttempts, 4);
    assert.equal(result.perGameplay[0].typicalActiveMs, null);
    assert.equal(result.perGameplay[0].cohorts[0].passRateChangePp, 0);
    const observed = analyze([1, 2, 3, 4].map(n => attempt(n, {
        activeDurationMs: null, payload: { result: { gameplayVersion: 'subnet-blaster-v4', activeElapsedMs: n < 3 ? 10000 : 5000, elapsedMs: 1000000 } },
    })));
    assert.equal(observed.improvement.speedImprovementPercent, 50);
    assert.equal(analyze([attempt(1, { activeDurationMs: 0 }), attempt(2, { activeDurationMs: -1 })]).coverage.activeTimedAttempts, 0);
}

// Failed fast exits are excluded from speed, while their actual outcomes remain
// in pass-rate comparisons. There must be two successful timings in each window.
{
    const result = analyze([attempt(1), attempt(2, { passed: false, outcome: 'failed', activeDurationMs: 1 }), attempt(3, { activeDurationMs: 5000 }), attempt(4, { activeDurationMs: 5000 })]);
    const cohort = result.perGameplay[0].cohorts[0];
    assert.equal(cohort.speedImprovementPercent, null);
    assert.equal(cohort.speedComparison.baselineCount, 1);
    assert.equal(cohort.passRateChangePp, 50);
    assert.equal(cohort.passComparison.baselinePassed, 1);
    assert.equal(cohort.passComparison.baselineAssessed, 2);
}

// Legacy numeric defaults are not observations. Actual counted decisions remain
// usable, including legitimate zero accuracy with a nonzero denominator.
{
    const unknown = analyze([1, 2, 3, 4].map(n => attempt(n, { accuracy: 0, accuracyKnown: undefined, correctDecisions: undefined, totalDecisions: undefined })));
    assert.equal(unknown.coverage.missingAccuracyAttempts, 4);
    assert.equal(unknown.improvement.accuracyChangePp, null);
    assert.equal(unknown.improvement.validatedSpeedImprovementPercent, null);
    assert.equal(unknown.feedback.strengths.length, 0);
    assert.match(unknown.feedback.cautions.join(' '), /learning quality gate/);
    const noChecks = analyze([attempt(1, { correctDecisions: 0, totalDecisions: 0, accuracyKnown: false, accuracy: 0 })]);
    assert.equal(noChecks.perGameplay[0].curve[0].accuracy, null);
    const zero = analyze([attempt(1, { correctDecisions: 0, totalDecisions: 2 })]);
    assert.equal(zero.perGameplay[0].curve[0].accuracy, 0);
}

// Observed legacy denominators take precedence over old DTO unknown/default
// flags. A conventional 0 fallback never suppresses actual graded evidence.
{
    const result = analyze([attempt(1, { accuracyKnown: false, correctDecisions: undefined, totalDecisions: undefined,
        payload: { result: { gameplayVersion: 'subnet-blaster-v4', correctShots: 2, totalShots: 4 } } })]);
    assert.equal(result.perGameplay[0].curve[0].accuracy, 0.5);
    assert.equal(result.coverage.observedAccuracyAttempts, 1);
}

// Instructional help qualifies assisted evidence, while calculator use is an
// allowed gameplay tool and does not automatically remove an independent run.
{
    const rows = [attempt(1, { payload: { result: { helpElapsedMs: 20 } } }), attempt(2, { helpUses: 1 }),
        attempt(3, { payload: { result: { calculatorUses: 2, calculatorElapsedMs: 1000, assistanceElapsedMs: 1000 } } })];
    const result = analyze(rows);
    assert.equal(result.coverage.eligibleAttempts, 1);
    assert.equal(result.perGameplay[0].exclusions.assisted, 2);
}

// Three-heart/attempt exhaustion is a gameplay game over, distinct from campaign
// neural depletion. Generic failures and cancelled runs count as neither.
{
    const row = attempt(1, { outcome: 'failed', passed: false, failureReason: 'hearts_exhausted',
        payload: { result: { reason: 'hearts_exhausted' }, gameplayGameOver: { attemptId: 'a-1', reason: 'hearts_exhausted' } } });
    const event = Object.assign({}, row, { eventId: 'gameplay-over', eventType: 'attempt_end' });
    const rows = [row, attempt(2, { outcome: 'failed', passed: false, failureReason: 'attempts_exhausted', tutorial: true }),
        attempt(3, { outcome: 'failed', passed: false }), attempt(4, { outcome: 'cancelled', cancelled: true, failureReason: 'hearts_exhausted' }),
        attempt(5, { outcome: 'failed', passed: false, failureReason: 'hearts_exhausted', payload: { result: { developerSkip: true } } })];
    const result = analyze(rows, [event]);
    assert.equal(result.recovery.gameplayGameOvers, 2);
    assert.equal(result.recovery.guidedGameplayGameOvers, 1);
    assert.equal(result.recovery.gameOvers, 0);
    assert.equal(result.recovery.perGameplay[0].gameplayGameOvers, 2);
    assert.equal(result.recovery.evidenceCoverage.gameplayGameOvers, 'explicit_exhaustion_or_game_over_records');
    assert.equal(result.coverage.excludedDeveloperPractice, 1);
}

// Accuracy is weighted by observed checks, and changes are percentage points
// with the actual decision and attempt denominators preserved.
{
    const result = analyze([
        attempt(1, { correctDecisions: 1, totalDecisions: 2 }), attempt(2, { correctDecisions: 9, totalDecisions: 10 }),
        attempt(3, { correctDecisions: 3, totalDecisions: 4 }), attempt(4, { correctDecisions: 5, totalDecisions: 8 }),
    ]);
    const c = result.perGameplay[0].cohorts[0];
    near(c.accuracyChangePp, -100 / 6);
    assert.equal(c.accuracyComparison.baseline.correctDecisions, 10);
    assert.equal(c.accuracyComparison.baseline.totalDecisions, 12);
    assert.equal(c.accuracyComparison.recent.attemptCount, 2);
    assert.equal(c.qualityGate, 'decreased');
    assert.equal(c.validatedSpeedImprovementPercent, null);
}

// Speed is a timing signal, not mastery: improved speed cannot pass the learning
// quality gate when recent decision accuracy deteriorates.
{
    const result = analyze([attempt(1), attempt(2), attempt(3, { activeDurationMs: 5000, correctDecisions: 1 }), attempt(4, { activeDurationMs: 5000, correctDecisions: 1 })]);
    const c = result.perGameplay[0].cohorts[0];
    assert.equal(c.speedImprovementPercent, 50);
    assert.equal(c.accuracyChangePp, -50);
    assert.equal(c.qualityGate, 'decreased');
    assert.equal(result.improvement.validatedSpeedImprovementPercent, null);
    assert.match(c.qualityWarning, /lower accuracy/);
    assert.match(result.feedback.cautions.join(' '), /not proof/);
}

// Aggregate speed uses matched percentage changes rather than a pooled raw-time
// average that would allow the slowest gameplay to dominate every other skill.
{
    const rows = [1, 2, 3, 4].map(n => attempt(n, { activeDurationMs: n < 3 ? 10000 : 5000 }));
    rows.push(...[5, 6, 7, 8].map(n => attempt(n, { gameplayId: 'ip_class_wires', activeDurationMs: n < 7 ? 100000 : 25000,
        payload: { result: { gameplayVersion: 'wires-v2' } } })));
    const result = analyze(rows);
    assert.equal(result.improvement.speedImprovementPercent, 62.5);
    assert.equal(result.improvement.validatedSpeedImprovementPercent, 62.5);
    assert.equal(result.improvement.comparableGameplayCount, 2);
    assert.equal(result.improvement.speedBaselineCount, 4);
}

// Recovery events represent different observed lifecycle steps, not inferred
// equivalents. One depletion mirrored at attempt end is still one game over.
{
    const game = 'ip_cidr_quarantine_matrix';
    const event = (id, eventType, payload, overrides = {}) => Object.assign({ eventId: id, eventType, gameplayId: game, timestamp: 1000, payload }, overrides);
    const events = [
        event('over', 'neural_game_over', { neuralRunId: 'run-1', simulated: false, triggerReason: 'life_force_depleted' }),
        event('end', 'attempt_end', { neuralGameOver: { neuralRunId: 'run-1' } }),
        event('offer', 'neural_tutorial_offer', { choice: 'shown', tutorialOfferId: 'offer-1', failureCount: 3 }),
        event('offer-mirror', 'neural_tutorial_offer', { choice: 'shown', tutorialOfferId: 'offer-1', failureCount: 3 }),
        event('choice', 'neural_tutorial_offer', { choice: 'tutorial', tutorialOfferId: 'offer-1' }),
        event('start', 'neural_tutorial_replay', { action: 'started', tutorialReplayId: 'replay-1' }),
        event('shown', 'neural_tutorial_replay', { action: 'shown', tutorialReplayId: 'replay-1' }),
        event('shown-mirror', 'neural_tutorial_replay', { action: 'shown', tutorialReplayId: 'replay-1' }),
        event('complete', 'neural_tutorial_replay', { action: 'completed', tutorialReplayId: 'replay-1' }),
        event('legacy-start', 'neural_tutorial_replay', { action: 'started' }),
        event('dev', 'neural_game_over', { neuralRunId: 'run-dev', developerTesting: true }),
        event('simulated', 'neural_game_over', { neuralRunId: 'sim', simulated: true }),
    ];
    events.push(events[0]);
    const result = analyze([attempt(1, { outcome: 'failed', passed: false })], events);
    assert.equal(result.recovery.gameOvers, 1);
    assert.equal(result.recovery.tutorialOffers, 1);
    assert.equal(result.recovery.repeatedMistakeTutorialOffers, 1);
    assert.equal(result.recovery.tutorialSelected, 1);
    assert.equal(result.recovery.tutorialStarted, 2);
    assert.equal(result.recovery.tutorialShown, 1);
    assert.equal(result.recovery.tutorialCompleted, 1);
    assert.equal(result.recovery.perGameplay[0].gameOvers, 1);
    const legacy = analyze([], [event('legacy', 'neural_tutorial_replay', { action: 'started' })]);
    assert.equal(legacy.recovery.tutorialShown, 0);
    assert.equal(legacy.recovery.evidenceCoverage.tutorialShown, 'not_recorded_in_legacy_history');
    assert.equal(analyze([attempt(1, { outcome: 'failed', passed: false })]).recovery.gameOvers, 0);
    assert.match(result.recovery.evidenceCoverage.note, /not lifetime totals/);
}

// A wrong answer mirrored in events, the final result and the round history is
// counted once. Multiple observed wrong decisions within that attempt survive.
{
    const row = attempt(1, { payload: { result: { gameplayVersion: 'subnet-blaster-v4',
        decisionHistory: [{ stepKey: 'address_operator', submitted: '-', expected: '+', correct: false }, { stepKey: 'address_operator', submitted: 'x', expected: '+', correct: false }],
        roundHistory: [{ mistakes: ['operator'] }, { mistakes: ['operator'] }],
    }, mistakes: [{ reason: 'operator', submitted: '-', expected: '+' }] } });
    const event = { eventId: 'mistake-1', eventType: 'attempt_mistake', gameplayId: row.gameplayId, attemptId: row.attemptId, timestamp: 1000,
        payload: { mistakes: [{ reason: 'operator', submitted: '-', expected: '+' }] } };
    const result = analyze([row, attempt(2)], [event, event]);
    const weakness = result.weaknesses[0];
    assert.equal(weakness.conceptKey, 'address_direction');
    assert.equal(weakness.mistakeCount, 2);
    assert.equal(weakness.independentMistakeCount, 2);
    assert.equal(weakness.affectedAttempts, 1);
    assert.equal(weakness.affectedAttemptRate, 0.5);
    assert.equal(weakness.assessedAttempts, 2);
    assert.equal(weakness.examples[0].submitted, '-');
    assert.match(result.feedback.summary, /formula direction/);
}

// Guided errors are useful evidence about practice, but do not inflate the
// independent weakness denominator or turn developer mistakes into priorities.
{
    const rows = [attempt(1, { tutorial: true, payload: { result: { decisionHistory: [{ stepKey: 'subnet_block_size', correct: false }] } } }),
        attempt(2), attempt(3, { developerTest: true })];
    const events = [{ eventId: 'dev-mistake', eventType: 'attempt_mistake', gameplayId: rows[2].gameplayId, attemptId: rows[2].attemptId,
        payload: { mistakes: [{ reason: 'operator' }] } }];
    const result = analyze(rows, events);
    assert.equal(result.weaknesses.length, 1);
    assert.equal(result.weaknesses[0].tutorialMistakeCount, 1);
    assert.equal(result.weaknesses[0].affectedTutorialAttempts, 1);
    assert.equal(result.weaknesses[0].affectedAssessedAttempts, 0);
    assert.equal(result.weaknesses[0].affectedAttemptRate, 0);
    assert.equal(result.feedback.priorities.length, 0);
}

// Repeated failed outcomes remain a priority even if old result defaults claimed
// 100% accuracy. They do not fabricate a diagnosis or a concept mistake count.
{
    const rows = Array.from({ length: 8 }, (_, index) => attempt(index + 1, {
        gameplayId: 'ip_class_wires', passed: index === 7, outcome: index === 7 ? 'passed' : 'failed',
        accuracy: 1, accuracyKnown: undefined, correctDecisions: undefined, totalDecisions: undefined,
        payload: {},
    }));
    const result = analyze(rows);
    const weakness = result.weaknesses[0];
    assert.equal(weakness.evidenceType, 'outcome_pattern');
    assert.equal(weakness.failedAttempts, 7);
    assert.equal(weakness.mistakeCount, 0);
    assert.equal(weakness.affectedAttemptRate, 7 / 8);
    assert.match(result.feedback.priorities[0].evidence, /7 failed independent/);
    assert.match(result.feedback.summary, /Repeated unsuccessful attempts/i);
    assert.equal(result.feedback.strengths.length, 0);
}

// Every current gameplay's structured concepts receive readable intervention
// guidance; legacy slot counters still contribute without duplicating events.
{
    const concepts = [
        ['ip_class_wires', 'ip_classification'], ['ip_patch_panel_classes', 'mask_classification'],
        ['ip_cidr_binary_panel', 'subnet_mask_binary'], ['ip_cidr_binary_panel_harder', 'cidr_prefix'],
        ['ip_subnet_simulator', 'usableHosts'], ['ip_host_power_reactor', 'minimum_host_bits'],
        ['ip_cidr_quarantine', 'borrow_bits'], ['ip_cidr_quarantine', 'new_cidr'], ['ip_cidr_quarantine', 'default_prefix'],
        ['ip_cidr_quarantine_matrix', 'subnet_block_size'], ['ip_network_repair', 'formula_order'],
        ['ip_vlsm_allocator', 'vlsm_overlap_check'], ['ip_vlsm_allocator', 'vlsm_branch_coverage'],
    ];
    const rows = concepts.map(([gameplayId, stepKey], index) => attempt(index + 1, { gameplayId,
        payload: { result: { decisionHistory: [{ stepKey, correct: false, submitted: 0, expected: 1 }] } },
    }));
    const result = analyze(rows);
    assert.equal(result.weaknesses.length, concepts.length);
    result.weaknesses.forEach(row => {
        assert.ok(row.conceptLabel.includes(' '), row.conceptLabel);
        assert.ok(row.recommendation.length > 30);
        assert.equal(row.examples[0].submitted, 0);
    });
    const legacy = analyze([attempt(1, { gameplayId: 'ip_subnet_simulator', payload: { slotStats: { totalChecks: 5, wrongChecks: 3, wrongSlotFrequency: { networkAddress: 3 } } },
        accuracyKnown: undefined, totalDecisions: undefined, correctDecisions: undefined })]);
    assert.equal(legacy.weaknesses[0].mistakeCount, 3);
    assert.equal(legacy.weaknesses[0].conceptLabel, 'Network address calculation');
    assert.equal(legacy.perGameplay[0].curve[0].accuracy, 0.4);
}

// Empty evidence is valid and explicitly insufficient, not a perfect or failing
// learner. The analytics can run offline without browser or storage globals.
{
    const result = analytics.analyze({});
    assert.equal(result.coverage.instances, 0);
    assert.equal(result.improvement.speedImprovementPercent, null);
    assert.equal(result.improvement.accuracyChangePp, null);
    assert.equal(result.weaknesses.length, 0);
    assert.match(result.feedback.summary, /More assessed attempts/);
    assert.doesNotMatch(JSON.stringify(result.methodology), /[^\x00-\x7F]/);
}

// Randomized full runs can still provide comparable task-level encounter
// evidence. A single run's repeated tasks never establish longitudinal growth.
{
    function parent(number, active, extraAsked = 'network') {
        const round = (problemId, asked) => ({ problemId, ipClass: 'C', prefix: 27, hostBits: 5, borrowedBits: 3,
            asked, givenBits: 'host', passed: true, activeElapsedMs: active,
            preparationMs: 60000, preparationSkipped: false,
            expected: { operator: asked === 'broadcast' ? '+' : '-', blockSize: 32 }, weapon: { operator: asked === 'broadcast' ? '+' : '-', blockSize: 32 } });
        return attempt(number, { payload: { result: { gameplayVersion: 'subnet-blaster-v4',
            roundHistory: [round('same-task-' + number, 'broadcast'), round('other-task-' + number, extraAsked)] } } });
    }
    const rows = [parent(1, 20000), parent(2, 20000), parent(3, 10000, 'broadcast'), parent(4, 10000, 'broadcast')];
    const result = analyze(rows);
    assert.equal(result.improvement.speedImprovementPercent, null, 'different whole-run task sets remain separate');
    const cohort = result.perGameplay[0].encounterCohorts.find(row => row.descriptor.workload.asked === 'broadcast');
    assert.equal(cohort.distinctSourceAttempts, 4);
    assert.equal(cohort.baselineSourceAttempts, 2);
    assert.equal(cohort.recentSourceAttempts, 2);
    assert.equal(cohort.speedImprovementPercent, 50);
    assert.equal(cohort.validatedSpeedImprovementPercent, 50);
    assert.equal(result.encounterImprovement.unit, 'encounter');
    assert.equal(cohort.curve[0].sourceAttemptId, 'a-1');
    assert.equal(cohort.curve[0].preparationMs, 60000);
    const sameRun = parent(1, 10000, 'broadcast');
    sameRun.payload.result.roundHistory = Array.from({ length: 12 }, (_, n) => ({ ...sameRun.payload.result.roundHistory[0], problemId: String(n) }));
    const one = analyze([sameRun]);
    assert.equal(one.encounterImprovement.status, 'insufficient_data');
    assert.equal(one.encounterImprovement.speedImprovementPercent, null);
    assert.equal(analyze(rows.map(row => ({ ...row, tutorial: true }))).perGameplay[0].encounterCohorts.length, 0);
}

console.log('report_learning_analytics.test.cjs: PASS');
