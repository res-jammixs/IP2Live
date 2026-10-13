const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const base = path.join(__dirname, '../Plugins/IP2Live_Core/modules');
const load = (context, file) => vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), context, { filename: file });
function harness() {
    const store = new Map(), rows = [];
    const context = vm.createContext({ console, window: {}, Core: { Game: { current: { infiltratorName: 'LEARNER', profileId: 'learner-id' } } },
        localStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) },
        IP2Live: {}, Blob, TextEncoder, TextDecoder, setTimeout, clearTimeout });
    load(context, 'game_manager.js'); load(context, 'report_learning_analytics.js'); load(context, 'report_manager.js'); load(context, 'feature_telemetry.js');
    context.IP2Live.ReportManager.logTelemetryRecord = async row => { rows.push(row); return true; };
    return { context, rows, store, gm: context.IP2Live.GameManager, tracker: context.IP2Live.FeatureTelemetry, report: context.IP2Live.ReportManager };
}
const start = Date.UTC(2026, 9, 1), day = 86400000;
const gameplayId = 'ip_class_wires';
const catalog = [{ gameplayId, label: 'IP Class Wires' }];
function attempt(id, n, accuracy, time, mode = 'practice', overrides = {}) {
    const row = { eventId: id, eventType: mode ? 'feature_round_end' : 'attempt_end', attemptId: id, gameplayId,
        profileId: 'learner-id', infiltratorName: 'LEARNER', sessionId: mode ? 'practice-session' : 'story-session',
        timestamp: start + n * day, startedAt: start + n * day - time, endedAt: start + n * day,
        passed: true, outcome: 'passed', stageId: 1, levelId: 1, mapId: 1,
        activeDurationMs: time, durationMethod: 'active-v1', accuracy, accuracyKnown: true,
        correctDecisions: accuracy * 10, totalDecisions: 10,
        payload: { featureMode: mode || undefined, activityKind: 'gameplay', featureSessionId: mode ? 'practice-session' : undefined,
            spec: { practiceMode: !!mode, tutorialReplay: !!mode, taskType: 'classify', difficulty: 1 },
            result: { gameplayVersion: 'wires-v1', activeElapsedMs: time, durationMethod: 'active-v1', correctDecisions: accuracy * 10, totalDecisions: 10 } },
        ...overrides };
    return row;
}
test('feature sessions retain the selected profile and use the durable journal without campaign attempts', async () => {
    const { context, rows, tracker, gm, store } = harness();
    gm._openReportAttempt = () => assert.fail('feature activity must never open a campaign assessment');
    tracker.rememberProfile(context.Core.Game.current);
    context.Core.Game.current = null;
    tracker._profile = null; // Reopening the application restores the remembered identity.
    assert.equal(tracker.profile().profileId, 'learner-id');
    const session = tracker.startSession('practice', 'gameplay');
    const round = tracker.startRound(session, gameplayId, { questId: 'round-id', spec: { practiceMode: true } });
    assert.equal(tracker.endRound(session, round, 'completed', { correctDecisions: 8, totalDecisions: 10, activeElapsedMs: 1200, durationMethod: 'active-v1' }), true);
    assert.equal(tracker.endRound(session, round, 'failed', {}), false);
    tracker.endSession(session); tracker.endSession(session);
    await gm.flushTelemetryWrites();
    assert.equal(rows.length, 4);
    assert.ok(rows.every(row => row.infiltratorName === 'LEARNER' && row.profileId === 'learner-id'));
    assert.equal(rows[2].accuracy, .8);
    assert.equal(rows[2].activeDurationMs, 1200);
    assert.ok(rows.every(row => row.payload.featureMode === 'practice'));
    assert.ok(store.size > 0);
    context.Core.Game.current = { infiltratorName: 'SECOND', profileId: 'second-id' };
    tracker.rememberProfile(context.Core.Game.current);
    assert.equal(tracker.startSession('practice', 'tutorial').identity.profileId, 'second-id');
    // A session already in progress never changes owner when another profile is selected.
    assert.equal(session.identity.profileId, 'learner-id');
    tracker._profile = null; store.clear(); context.Core.Game.current = null;
    const count = rows.length;
    tracker.startSession('practice', 'gameplay');
    assert.equal(rows.length, count, 'anonymous activity must not be attributed to another learner');
});

test('optional-mode evidence reports improvement and transfer without inflating assessed story mastery', async () => {
    const { report } = harness();
    const events = [attempt('before-1', 0, .5, 200000, null), attempt('before-2', 1, .5, 180000, null),
        attempt('p1', 2, .5, 200000), attempt('p2', 3, .5, 180000), attempt('p3', 4, 1, 120000), attempt('p4', 5, 1, 100000),
        attempt('after-1', 8, 1, 120000, null), attempt('after-2', 9, 1, 100000, null)];
    const guided = attempt('guided', 6, 1, 1000); guided.tutorial = true; guided.payload.activityKind = 'tutorial';
    const help = attempt('help', 6, 1, 1000); help.payload.result.helpUses = 1;
    const otherTask = attempt('different-task', 6, 1, 1000); otherTask.payload.spec.difficulty = 3;
    const developer = attempt('dev', 6, 1, 1000); developer.payload.result.developerSkip = true;
    const pvp = attempt('pvp', 6, 1, 1000); pvp.payload.spec.pvpMode = true;
    const interrupted = { ...attempt('open', 7, 1, 1000), eventType: 'feature_round_start', outcome: undefined, passed: undefined };
    events.push(guided, help, otherTask, developer, pvp, interrupted, { ...events[2], eventId: 'mirrored-end' });
    const dto = report._buildReportDTO({ infiltratorName: 'LEARNER', scopeDays: 90, generatedAt: start + 10 * day, telemetry: events, gameplayCatalog: catalog });
    const features = dto.learning.features, practice = features.practice;
    assert.equal(dto.kpi.assessedAttempts, 4);
    assert.equal(practice.sessionCount, 1);
    assert.equal(practice.roundCount, 8, 'mirrors, developer and PVP activity must not inflate participation');
    assert.equal(practice.scoredRounds, 6);
    assert.equal(practice.guidedRounds, 1);
    assert.equal(practice.interruptedRounds, 1);
    assert.equal(practice.eligibleRounds, 5, 'guided/help activity does not establish independent improvement');
    assert.equal(practice.improvement.comparableCohortCount, 1, 'different difficulties must not be pooled');
    assert.equal(practice.improvement.accuracyChangePp, 50);
    assert.ok(practice.improvement.validatedSpeedImprovementPercent > 40);
    assert.equal(practice.trend, 'Improving');
    assert.equal(features.endless.observed, false);
    assert.match(features.endless.availability, /Available after Story completion/);
    assert.equal(features.transfer.cohorts.length, 1);
    assert.equal(features.transfer.improvement.accuracyChangePp, 50);
    assert.match(dto.performanceSummary, /Practice Mode: 1 sessions/);
    const xml = await report._buildExcelXmlBlob(dto).text();
    for (const sheet of ['Feature Participation', 'Practice Improvement', 'Practice Learning Curve', 'Endless Improvement', 'Feature Rounds', 'Feature Decisions', 'Story After Practice']) assert.ok(xml.includes('ss:Name="' + sheet + '"'), sheet);
    assert.match(xml, /PRACTICE AND ENDLESS/);
    assert.match(xml, /Insufficient comparable data|Improving/);
    assert.doesNotMatch(xml, /NaN|Infinity|\[object Object\]/);
    const texts = [], originalWriter = report._createSecurePdfWriter.bind(report);
    report._createSecurePdfWriter = () => { const writer = originalWriter(), text = writer.text.bind(writer); writer.text = (...args) => { texts.push(String(args[3])); return text(...args); }; return writer; };
    assert.ok((await report._buildPdfBlob(dto)).size > 100);
    assert.match(texts.join('\n'), /Practice and Endless Participation/);
    assert.match(texts.join('\n'), /Quality-maintained speed|quality-maintained speed/);
});

test('practice writes wait for report initialization and poor accuracy blocks validated speed gains', async () => {
    const { context, tracker, report, gm, rows } = harness();
    let ready;
    context.IP2Live.ReportManagerReady = new Promise(resolve => { ready = resolve; });
    context.IP2Live.ReportManager = null;
    tracker.startSession('practice', 'tutorial');
    assert.equal(rows.length, 0);
    context.IP2Live.ReportManager = report; ready();
    await gm.flushTelemetryWrites();
    assert.equal(rows.length, 1, 'a fast menu launch must not drop activity while report modules load');
    const events = [attempt('quality-1', 1, 1, 100000), attempt('quality-2', 2, 1, 100000), attempt('quality-3', 3, .5, 50000), attempt('quality-4', 4, .5, 50000)];
    const dto = report._buildReportDTO({ infiltratorName: 'LEARNER', telemetry: events, gameplayCatalog: catalog });
    const practice = dto.learning.features.practice;
    assert.equal(practice.improvement.speedImprovementPercent, 50);
    assert.equal(practice.improvement.validatedSpeedImprovementPercent, null);
    assert.equal(practice.improvement.accuracyChangePp, -50);
    assert.equal(practice.trend, 'Needs review');
    assert.equal(practice.improvement.qualityWarnings.length, 1);
});

test('actual practice replay completion, automatic next round and pause exit emit one lifecycle each', async () => {
    const { context, gm, tracker, rows } = harness();
    const frames = [{}];
    context.Manager = { Stack: { get top() { return frames.at(-1); }, push: scene => frames.push(scene), pop: () => frames.pop() } };
    context.IP2Live.QuestManager = {};
    load(context, 'tutorial_replay.js'); load(context, 'practice_mode.js');
    const practice = context.IP2Live.PracticeMode, replay = context.IP2Live.TutorialReplay;
    const node = gm.flowConfig.gameplayNodes[gameplayId];
    context.IP2Live[node.manager] = { [node.method](options) {
        const screen = { options }; replay.prepareScreen(screen, options); frames.push(screen); return true;
    } };
    tracker.rememberProfile(context.Core.Game.current);
    practice._loaded = true; practice.unlocks[gameplayId] = true;
    const game = context.Core.Game.current;
    gm._openReportAttempt = () => assert.fail('practice mutated story assessments');
    assert.equal(practice.launch(gameplayId, 'gameplay', frames[0]), true);
    assert.equal(context.Core.Game.current, null);
    const original = replay.session;
    assert.equal(replay.finish(gameplayId, original.options, 'completed', { totalDecisions: 10, correctDecisions: 8 }), true);
    for (let n = 0; n < 4; n++) await Promise.resolve();
    assert.ok(replay.session && replay.session !== original, 'completed free practice starts another round');
    // A duplicate callback from the prior puzzle must not finish the current round.
    replay.finish(gameplayId, original.options, 'completed', {});
    replay.finishScreen(replay.session.screen);
    await gm.flushTelemetryWrites();
    assert.equal(context.Core.Game.current, game);
    assert.equal(practice.active, false);
    assert.equal(rows.filter(row => row.eventType === 'feature_session_start').length, 1);
    assert.equal(rows.filter(row => row.eventType === 'feature_session_end').length, 1);
    assert.equal(rows.filter(row => row.eventType === 'feature_round_start').length, 2);
    const ends = rows.filter(row => row.eventType === 'feature_round_end');
    assert.equal(ends.length, 2);
    assert.equal(ends[0].outcome, 'passed'); assert.equal(ends[0].accuracy, .8);
    assert.equal(ends[1].outcome, 'cancelled', 'leaving free practice is not a pass or failure');
    assert.ok(rows.every(row => row.profileId === 'learner-id'));
});

test('sparse, cancelled and legacy optional-mode data stay honest, and endless has separate cohorts', () => {
    const { report } = harness();
    const legacy = attempt('legacy', 1, 1, 1000); legacy.eventType = 'attempt_end'; delete legacy.payload.featureMode;
    const cancelled = attempt('cancel', 2, 1, 1000, 'endless', { outcome: 'cancelled', passed: false });
    const endless = [0, 1, 2, 3].map(n => attempt('e' + n, n + 3, 1, 100000 - n * 10000, 'endless'));
    const dto = report._buildReportDTO({ infiltratorName: 'LEARNER', telemetry: [legacy, cancelled, ...endless], gameplayCatalog: catalog });
    assert.equal(dto.kpi.assessedAttempts, 0);
    assert.equal(dto.learning.features.practice.scoredRounds, 1);
    assert.equal(dto.learning.features.practice.improvement.accuracyChangePp, null);
    assert.equal(dto.learning.features.endless.sessionCount, 1);
    assert.equal(dto.learning.features.endless.cancelledRounds, 1);
    assert.equal(dto.learning.features.endless.improvement.comparableCohortCount, 1);
    const empty = report._buildReportDTO({ infiltratorName: 'LEARNER', telemetry: [], gameplayCatalog: catalog });
    assert.equal(empty.learning.features.practice.accuracy, null);
    assert.equal(empty.learning.features.practice.activeDurationMs, null);
    assert.equal(empty.learning.features.practice.participation, 'No recorded participation');
});
