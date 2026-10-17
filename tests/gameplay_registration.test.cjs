'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../Plugins/IP2Live_Core');

function harness() {
    let now = Date.UTC(2026, 9, 15);
    const rows = [], launched = [];
    const game = { currentMapID: 18, infiltratorName: 'Registry Learner', _ip2liveProfileId: 'learner', ip2liveGameStates: {} };
    const env = vm.createContext({ console: { log() {}, warn() {} }, window: {}, Blob, TextEncoder, Uint8Array,
        Date: class extends Date { static now() { return now; } }, setTimeout, clearTimeout,
        Core: { Game: { current: game } }, Scene: { Map: { current: { id: 18 } } },
        Manager: { Stack: { requestPaintHUD: false } }, Common: {}, IP2Live: {} });
    const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), env, { filename: file });
    load('gameplay/common/gameplay_definition.js');
    const definitions = env.IP2Live.GameplayDefinitions;
    // Register in a gameplay module before GameManager's asynchronous load.
    let before = definitions.beginModule('packet-routing.js', 'packet routing implementation v1');
    env.IP2Live.PacketRoutingManager = { launch: options => { launched.push(options); return true; }, objective: () => true };
    env.IP2Live.registerGameplay({ gameplayId: 'packet_routing', label: 'Packet Routing', gameplayVersion: 'routing-v1',
        competencyKey: 'packet_routes', competencyLabel: 'Packet routing decisions',
        launcher: { manager: 'PacketRoutingManager', method: 'launch', mapId: 18 },
        objectiveHandler: { manager: 'PacketRoutingManager', method: 'objective' },
        normalizeResult: result => ({ telemetrySchemaVersion: 2,
            decisionHistory: (result.checks || []).map(check => ({ correct: check.success, stepKey: 'route_selection', submitted: check.answer, expected: check.target })),
            activeElapsedMs: result.elapsedActive, durationMethod: 'routing_decisions_v1', comparisonKey: 'same-route-task' }),
    });
    definitions.endModule(before);
    load('modules/game_manager.js'); load('modules/report_learning_analytics.js'); load('modules/report_manager.js');
    const ip = env.IP2Live, gm = ip.GameManager, report = ip.ReportManager;
    report.logTelemetryRecord = row => { rows.push(JSON.parse(JSON.stringify(row))); return Promise.resolve(true); };
    ip.MapManager = { stages: [{ id: 18, stage: 4, level: 4, name: 'Final Floor' }], stageFor: id => Number(id) === 18 ? ip.MapManager.stages[0] : null };
    ip.QuestManager = { completedObjectives: { 'new.quest': { route: true } } };
    gm.mapGameplayAssignments[18].gameplays.packet_routing = [{ id: 'new.quest', objectiveId: 'route', sequence: 99, label: 'New routing task' }];
    const attempt = (result = {}) => {
        gm._openReportAttempt('packet_routing', { mapId: 18, questId: 'new.quest', objectiveId: 'route' });
        now += 20000;
        return gm._closeReportAttempt('packet_routing', { result }, true);
    };
    return { env, ip, gm, report, definitions, rows, launched, game, load, attempt };
}

test('early registration immediately supplies launch, test entries, map assignments and report metadata', () => {
    const h = harness();
    assert.equal(h.definitions.pending.size, 0);
    const entry = h.gm.getGameplayCatalog().find(gameplay => gameplay.gameplayId === 'packet_routing');
    assert.equal(entry.label, 'Packet Routing'); assert.match(entry.source.revision, /^source-/);
    assert.ok(h.gm.getGameplayTestCatalog().some(test => test.gameplayId === 'packet_routing' && !test.tutorial));
    assert.ok(h.gm.getGameplayQuestSpecs('packet_routing').some(spec => spec.id === 'new.quest'));
    assert.equal(h.gm.startGameplayNode('packet_routing', { skipBeforeDialogues: true, mapId: 18, questId: 'new.quest', objectiveId: 'route' }), true);
    assert.equal(h.launched.length, 1); assert.equal(h.launched[0]._fromGameManager, true);
    assert.equal(h.rows.find(row => row.eventType === 'attempt_start').competencyLabel, 'Packet routing decisions');
});

test('new result formats normalize into observed evidence and appear in PDF and Excel without an explicit catalog', async () => {
    const h = harness();
    const raw = { checks: [{ success: true, answer: 'A', target: 'A' }, { success: false, answer: 'C', target: 'B' }], elapsedActive: 5000 };
    const completed = h.attempt(raw);
    assert.equal(completed.accuracy, .5); assert.equal(completed.totalDecisions, 2); assert.equal(completed.activeDurationMs, 5000);
    assert.deepEqual(raw.checks.map(check => check.answer), ['A', 'C'], 'adapters cannot mutate source results');
    const dto = h.report._buildReportDTO({ telemetry: h.rows, generatedAt: Date.now(), scopeDays: 0, infiltratorName: h.game.infiltratorName });
    assert.ok(dto.gameplayCatalog.some(gameplay => gameplay.gameplayId === 'packet_routing'));
    assert.equal(dto.attemptsRaw[0].gameplayLabel, 'Packet Routing'); assert.equal(dto.attemptsRaw[0].accuracy, .5);
    assert.ok(dto.competencies.some(competency => competency.competencyKey === 'packet_routes'));
    assert.match(await h.report._buildExcelXmlBlob(dto).text(), /Packet Routing/);
    assert.ok((await h.report._buildPdfBlob(dto)).size > 1000);
});

test('generic launch callbacks record a single terminal result and developer tests stay outside assessed telemetry', () => {
    const h = harness(); h.gm._queueCheckpoint = () => {};
    h.gm.startGameplayNode('packet_routing', { skipBeforeDialogues: true, mapId: 18 });
    const callbacks = h.launched[0];
    assert.equal(callbacks.onComplete({ checks: [{ success: true }], elapsedActive: 3000 }), true);
    assert.equal(callbacks.onFail({ reason: 'late_duplicate' }), false);
    assert.equal(h.rows.filter(row => row.eventType === 'attempt_end').length, 1);
    assert.equal(h.rows.find(row => row.eventType === 'attempt_end').accuracy, 1);
    h.gm.startGameplayNode('packet_routing', { skipBeforeDialogues: true, mapId: 18, developerTest: true });
    h.launched[1].onComplete({ checks: [{ success: true }] });
    assert.equal(h.rows.filter(row => row.eventType === 'attempt_end').length, 1);
});

test('optional modes use the same definition and result adapters without producing story attempts', () => {
    const h = harness(); h.load('modules/feature_telemetry.js');
    const tracker = h.ip.FeatureTelemetry, session = tracker.startSession('practice', 'gameplay');
    const round = tracker.startRound(session, 'packet_routing', {});
    const definition = round.gameplayDefinition.definitionVersion;
    h.ip.registerGameplay({ gameplayId: 'packet_routing', label: 'Later routing label', gameplayVersion: 'routing-v2' });
    tracker.endRound(session, round, 'completed', { checks: [{ success: true }, { success: false }], elapsedActive: 4000 });
    const row = h.rows.find(row => row.eventType === 'feature_round_end');
    assert.equal(row.accuracy, .5); assert.equal(row.definitionVersion, definition); assert.equal(row.gameplayLabel, 'Packet Routing');
    assert.equal(h.rows.some(row => row.eventType === 'attempt_end'), false);
});

test('definition changes preserve attempt snapshots and keep different implementations in separate learning cohorts', () => {
    const h = harness(), result = { gameplayVersion: 'unchanged-result-version', checks: [{ success: true }], elapsedActive: 5000 };
    h.attempt(result); h.attempt(result);
    h.gm._openReportAttempt('packet_routing', { mapId: 18 });
    h.ip.registerGameplay({ gameplayId: 'packet_routing', label: 'Routing Revised', gameplayVersion: 'routing-v2', competencyKey: 'routes_v2', competencyLabel: 'Revised routing decisions' });
    const inFlight = h.gm._closeReportAttempt('packet_routing', { result }, true);
    assert.equal(inFlight.gameplayLabel, 'Packet Routing', 'an in-flight attempt retains its opening definition');
    h.attempt(result); h.attempt(result);
    const dto = h.report._buildReportDTO({ telemetry: h.rows, generatedAt: Date.now(), scopeDays: 0 });
    assert.equal(dto.gameplayCatalog.find(gameplay => gameplay.gameplayId === 'packet_routing').label, 'Routing Revised');
    assert.equal(dto.attemptsRaw[0].gameplayLabel, 'Packet Routing');
    const cohorts = dto.learning.perGameplay.find(gameplay => gameplay.gameplayId === 'packet_routing').cohorts;
    assert.equal(cohorts.length, 2); assert.notEqual(cohorts[0].descriptor.definitionVersion, cohorts[1].descriptor.definitionVersion);
    assert.equal(dto.learning.improvement.speedImprovementPercent, null, 'different implementations cannot manufacture a four-run improvement');
    assert.ok(dto.competencies.some(row => row.competencyKey === 'packet_routes'));
    assert.ok(dto.competencies.some(row => row.competencyKey === 'routes_v2'));
});

test('a gameplay source edit changes its definition revision without a manual version bump', () => {
    const h = harness(), original = h.gm.getGameplayDefinition('packet_routing');
    const before = h.definitions.beginModule('packet-routing.js', 'packet routing implementation v2');
    h.ip.PacketRoutingManager = { launch() { return true; } }; h.definitions.endModule(before);
    const changed = h.gm.getGameplayDefinition('packet_routing');
    assert.equal(changed.gameplayVersion, original.gameplayVersion);
    assert.notEqual(changed.definitionVersion, original.definitionVersion);
});

test('completion snapshots count the live curriculum, persist its revisions and do not change after later edits', async () => {
    const h = harness(), summary = h.gm.getStoryCompletionSummary(h.game);
    const gameplay = summary.gameplays.find(gameplay => gameplay.gameplayId === 'packet_routing');
    assert.equal(gameplay.objectiveCount, 1); assert.equal(gameplay.completedObjectives, 1);
    assert.equal(summary.floors, 1); assert.equal(summary.gameplayCount, summary.gameplays.length);
    h.ip.registerGameplay({ gameplayId: 'packet_routing', label: 'Changed after completion' });
    assert.equal(gameplay.label, 'Packet Routing');
    const record = { id: 'run', storyRunId: 'run', name: h.game.infiltratorName, completedAt: Date.now(), floors: 1, curriculum: summary };
    const dto = h.report._buildReportDTO({ telemetry: [{ eventType: 'story_completed', payload: { record } }], scopeDays: 0 });
    assert.equal(dto.storyCompletions[0].curriculum.gameplayCount, summary.gameplayCount);
    assert.ok((await h.report._buildExcelXmlBlob(dto).text()).includes('Story Completion'), 'the current workbook includes Story completions');
    assert.ok((await h.report._buildPdfBlob(dto)).size > 1000);
});

test('unknown gameplay IDs retain their evidence and missing grades remain unavailable', () => {
    const h = harness();
    const missing = h.gm._extractGameplayMetrics('future_gameplay', {}, true);
    assert.equal(missing.accuracy, null); assert.equal(missing.totalDecisions, null);
    const dto = h.report._buildReportDTO({ telemetry: [{ eventType: 'attempt_end', attemptId: 'future', gameplayId: 'future_gameplay',
        gameplayLabel: 'Future Gameplay', passed: true, outcome: 'passed', payload: { result: { telemetrySchemaVersion: 2, decisionHistory: [{ correct: true }] } } }], scopeDays: 0 });
    assert.ok(dto.gameplayCatalog.some(gameplay => gameplay.gameplayId === 'future_gameplay'));
    assert.equal(dto.attemptsRaw[0].accuracy, 1);
    assert.throws(() => h.gm.registerGameplay({ gameplayId: '__proto__' }), /gameplayId/);
    assert.throws(() => h.gm.registerGameplay({ gameplayId: 'bad', launcher: {} }), /launcher/);
    assert.equal(h.gm.gameplayCatalog.bad, undefined, 'invalid registration is atomic');
});
