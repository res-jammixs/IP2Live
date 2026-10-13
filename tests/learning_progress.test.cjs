const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const base = path.join(__dirname, '../Plugins/IP2Live_Core/modules');
const firstDay = Date.UTC(2026, 0, 1), DAY = 86400000;
const gameplay = 'ip_class_wires', second = 'ip_cidr_binary_panel';
const catalog = [{ gameplayId: gameplay, label: 'IP Class Wires' }, { gameplayId: second, label: 'CIDR Binary Panel' }];
function harness() {
    const context = vm.createContext({ console, window: {}, IP2Live: {}, Blob, TextEncoder, TextDecoder,
        Core: { Game: { current: { infiltratorName: 'Student', profileId: 'student-id' } } },
        localStorage: { getItem() { return null; }, setItem() {} }, setTimeout, clearTimeout });
    const load = file => vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), context, { filename: file });
    load('game_manager.js'); load('report_learning_analytics.js'); load('report_manager.js'); load('feature_telemetry.js');
    return { context, load, report: context.IP2Live.ReportManager, analytics: context.IP2Live.ReportLearningAnalytics };
}
function event(id, n, accuracy, time, mode = 'story', game = gameplay) {
    const optional = mode !== 'story', pvp = mode.startsWith('pvp_');
    return { eventId: id, eventType: optional ? 'feature_round_end' : 'attempt_end', attemptId: id, gameplayId: game,
        infiltratorName: 'Student', profileId: 'student-id', sessionId: mode + '-session', timestamp: firstDay + n * DAY,
        startedAt: firstDay + n * DAY - time, endedAt: firstDay + n * DAY, passed: true, outcome: 'passed', mapId: 1, stageId: 1, levelId: 1,
        accuracy, accuracyKnown: true, totalDecisions: 100, correctDecisions: accuracy * 100, activeDurationMs: time, durationMethod: 'active-test-v1',
        payload: { featureMode: optional ? mode : undefined, featureSessionId: mode + '-session', activityKind: 'gameplay',
            spec: { practiceMode: optional && !pvp, practiceGameplay: optional, tutorialReplay: optional, pvpMode: pvp, taskType: 'network_class', difficulty: 'normal' },
            result: { gameplayVersion: 'test-v1', activeElapsedMs: time, durationMethod: 'active-test-v1', totalDecisions: 100, correctDecisions: accuracy * 100 } } };
}
function dto(report, events, extra = {}) { return report._buildReportDTO({ infiltratorName: 'Student', generatedAt: firstDay + 100 * DAY, gameplayCatalog: catalog, telemetry: events, ...extra }); }
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, actual + ' != ' + expected);

test('first/latest and windowed percentages use actual error rates, balanced across gameplays and modes', async () => {
    const { report } = harness();
    const events = [.5, .6, .8, .9].map((a, n) => event('story-' + n, n, a, [100000, 90000, 70000, 50000][n]));
    events.push(...[.2, .4, .5, .6].map((a, n) => event('practice-' + n, n + 4, a, 120000 - n * 20000, 'practice')));
    events.push(...[.5, .5, .75, .75].map((a, n) => event('ai-human-' + n, n + 8, a, 120000 - n * 20000, 'pvp_ai')));
    events.push(...[.5, .5, .6, .75].map((a, n) => event('second-' + n, n, a, 120000 - n * 20000, 'story', second)));
    events.push(...[.5, .5, .75, .75].map((a, n) => event('endless-' + n, n + 8, a, 120000 - n * 20000, 'endless', second)));
    const result = dto(report, events), progress = result.learningProgress;
    const story = progress.cohorts.find(row => row.gameplayId === gameplay && row.mode === 'story');
    close(story.learningImprovementPercent, 80);
    close(story.windowLearningImprovementPercent, 100 * (.45 - .15) / .45);
    close(story.accuracyChangePp, 40); close(story.validatedSpeedImprovementPercent, 50);
    assert.equal(story.firstMistakes, 50); close(story.latestMistakes, 10);
    assert.equal(story.repetitions, 3);
    assert.equal(story.firstAttemptId, 'story-0'); assert.equal(story.latestAttemptId, 'story-3');
    close(progress.perGameplay.find(row => row.gameplayId === gameplay).learningImprovementPercent, 60);
    close(progress.overall.learningImprovementPercent, 55);
    assert.equal(progress.overall.metricCounts.learningImprovementPercent, 2);
    assert.equal(progress.overall.eligibleCount, 20); assert.equal(progress.overall.repetitions, 15);
    assert.equal(result.kpi.assessedAttempts, 8, 'optional play must not inflate story assessment');
    assert.equal(progress.perMode.find(row => row.mode === 'pvp_ai').eligibleCount, 4);
    assert.equal(progress.perMode.find(row => row.mode === 'pvp_lan').eligibleCount, 0);
    assert.match(progress.summary, /Observational/);
    const xml = await report._buildExcelXmlBlob(result).text();
    const sheets = [...xml.matchAll(/<Worksheet ss:Name="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(sheets.slice(0, 2), ['Teacher Dashboard', 'Learning Improvement']);
    for (const name of ['Progress Task Evidence', 'Progress Timeline', 'Progress Metric Coverage']) assert.ok(sheets.includes(name));
    assert.doesNotMatch(xml, /NaN|Infinity|\[object Object\]/);
    const evidence = report._learningProgressEvidenceSheets(result).find(sheet => sheet.name === 'Progress Task Evidence');
    assert.equal(evidence.rows[1].__cellStyles[17], 'Body', '80 percentage-number units must not render as 8000%');
    assert.equal(evidence.rows[1].__cellStyles[13], 'Pct', 'accuracy is a fractional rate');
    const texts = [], originalWriter = report._createSecurePdfWriter.bind(report);
    report._createSecurePdfWriter = () => { const writer = originalWriter(), text = writer.text.bind(writer); writer.text = (...args) => { texts.push(String(args[3])); return text(...args); }; return writer; };
    assert.match((await report._buildPdfBlob(result)).type, /pdf/);
    assert.match(texts.join('\n'), /Learning Improvement/);
    assert.match(texts.join('\n'), /55\.0%/);
    assert.doesNotMatch(texts.join('\n'), /NaN|Infinity|\[object Object\]/);
});

test('ceiling, decline, unknown evidence, guidance, cancelled runs and task differences never manufacture gains', () => {
    const { report } = harness();
    const events = [event('first', 0, 1, 100000), event('last', 1, .5, 50000)];
    const decline = dto(report, events).learningProgress;
    assert.equal(decline.overall.learningImprovementPercent, null, 'zero baseline errors make relative reduction undefined');
    close(decline.overall.accuracyChangePp, -50);
    close(decline.overall.speedImprovementPercent, 50);
    assert.equal(decline.overall.validatedSpeedImprovementPercent, null, 'faster wrong answers do not establish quality speed gains');
    assert.match(decline.cohorts[0].caution, /error-free/);
    const worsening = [event('bad-first', 0, .9, 100000), event('bad-last', 1, .5, 100000)];
    close(dto(report, worsening).learningProgress.overall.learningImprovementPercent, -400);
    const single = dto(report, [event('only', 0, .5, 100000)]).learningProgress;
    assert.equal(single.overall.learningImprovementPercent, null);
    assert.equal(single.overall.matchedGameplayCount, 0);
    const different = event('other-task', 1, 1, 10000); different.payload.spec.difficulty = 'hard';
    assert.equal(dto(report, [event('baseline', 0, .5, 100000), different]).learningProgress.overall.learningImprovementPercent, null);
    const excluded = [];
    for (const flag of ['guided', 'help', 'cancelled', 'interrupted', 'developer', 'simulated']) {
        const row = event(flag, excluded.length + 2, 1, 10000, flag === 'simulated' ? 'pvp_ai' : 'practice');
        if (flag === 'guided') row.payload.activityKind = 'tutorial';
        if (flag === 'help') row.payload.result.helpUses = 1;
        if (flag === 'cancelled' || flag === 'interrupted') row.outcome = flag;
        if (flag === 'developer') row.payload.result.developerSkip = true;
        if (flag === 'simulated') row.payload.simulated = true;
        excluded.push(row);
    }
    const baseline = event('practice-first', 0, .5, 100000, 'practice'), latest = event('practice-last', 1, .75, 80000, 'practice');
    const clean = dto(report, [baseline, latest, ...excluded, { ...latest, eventId: 'duplicate-terminal' }]).learningProgress;
    assert.equal(clean.overall.eligibleCount, 2);
    close(clean.overall.learningImprovementPercent, 50);
    assert.equal(clean.overall.windowLearningImprovementPercent, null);
    assert.equal(clean.perMode.find(row => row.mode === 'pvp_ai').recordedAttempts, 0);
    assert.ok(clean.overall.recordedAttempts > clean.overall.eligibleCount);
    const unknown = event('unknown', 1, 1, 100000); delete unknown.totalDecisions; delete unknown.correctDecisions; unknown.accuracyKnown = false; unknown.payload.result = {};
    const missing = dto(report, [event('known', 0, .5, 100000), unknown]).learningProgress;
    assert.equal(missing.overall.learningImprovementPercent, null);
    const undated = event('undated', 0, .5, 100000, 'practice'); undated.timestamp = undated.endedAt = undated.startedAt = 0;
    assert.equal(dto(report, [undated, event('dated', 1, 1, 100000, 'practice')]).learningProgress.overall.learningImprovementPercent, null, 'unknown chronology cannot establish first-to-latest change');
});

test('more repetition alone earns no percentage improvement and failed fast runs are not speed evidence', () => {
    const { report } = harness();
    const events = Array.from({ length: 20 }, (_, n) => event('stable-' + n, n, .5, 100000, 'practice'));
    const progress = dto(report, events).learningProgress;
    assert.equal(progress.overall.repetitions, 19); close(progress.overall.learningImprovementPercent, 0);
    close(progress.overall.windowLearningImprovementPercent, 0);
    const failed = event('failed', 21, .5, 1, 'practice'); failed.passed = false; failed.outcome = 'failed';
    assert.equal(dto(report, [...events, failed]).learningProgress.overall.speedImprovementPercent, null);
});

test('actual export queries all profile history while retaining the selected dashboard window', async () => {
    const { report } = harness();
    const now = Date.now(), old = event('old', 0, .5, 100000), recent = event('recent', 1, .75, 80000);
    old.timestamp = old.endedAt = now - 120 * DAY; old.startedAt = old.timestamp - 100000;
    recent.timestamp = recent.endedAt = now - DAY; recent.startedAt = recent.timestamp - 80000;
    let query;
    report._queryTelemetry = async (name, since, profileId) => { query = { name, since, profileId }; return [old, recent]; };
    report._buildPasswordProtectedZipBlob = async () => new Blob(['test']);
    report._archiveReportBlob = async () => null; report._downloadBlob = () => {};
    const output = await report.export({ infiltratorName: 'Student', profileId: 'student-id', scopeDays: 7, format: 'excel', gameplayCatalog: catalog });
    assert.equal(query.since, 0); assert.equal(query.profileId, 'student-id');
    assert.equal(output.report.kpi.assessedAttempts, 1);
    assert.equal(output.report.learningProgress.allHistory, true);
    assert.equal(output.report.learningProgress.overall.eligibleCount, 2);
    close(output.report.learningProgress.overall.learningImprovementPercent, 50);
    assert.equal(output.report.progressEventAudit.eventCount, 2);
    assert.equal(output.report.eventAudit.eventCount, 1);
});
