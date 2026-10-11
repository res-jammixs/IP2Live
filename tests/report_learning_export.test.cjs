const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

async function main() {
    const base = path.join(__dirname, '..', 'Plugins', 'IP2Live_Core', 'modules');
    const IP2Live = {};
    new Function('IP2Live', fs.readFileSync(path.join(base, 'report_learning_analytics.js'), 'utf8'))(IP2Live);
    new Function('IP2Live', 'window', fs.readFileSync(path.join(base, 'report_manager.js'), 'utf8'))(IP2Live, {});
    const report = IP2Live.ReportManager;
    const start = Date.UTC(2026, 9, 1);
    const catalog = [{ gameplayId: 'ip_cidr_quarantine_matrix', label: 'Subnet Blaster', competencyKey: 'subnet_boundaries', competencyLabel: 'Subnet boundaries' }];
    function event(id, index, options = {}) {
        const round = {
            ipClass: 'C', asked: 'broadcast', givenBits: 'host', hostBits: 5, borrowedBits: 3, prefix: 27,
            givenAddress: '192.168.1.32', answer: '192.168.1.63', passed: true,
            expected: { operator: '+', blockSize: 32 }, weapon: { operator: '+', blockSize: 32 },
            preparationMs: 60000, preparationSkipped: false, calculatorUses: 0, calculatorElapsedMs: 0,
            activeElapsedMs: 25000, barrierImpacts: 20, bossBulletImpacts: 5,
        };
        const result = {
            gameplayVersion: 'subnet-blaster-v4', telemetrySchemaVersion: 2,
            activeElapsedMs: [120000, 100000, 75000, 65000][index] || 90000, durationMethod: 'subnet_decisions_v1',
            preparationMs: 180000, preparationSkips: 0, calculatorUses: 0, calculatorElapsedMs: 0, helpElapsedMs: 0,
            bulletsFired: 200, barrierImpacts: 60, bossBulletImpacts: 15,
            roundHistory: Array.from({ length: 3 }, () => ({ ...round })),
            decisionHistory: Array.from({ length: 6 }, (_, n) => ({ stepKey: n % 2 ? 'subnet_block_size' : 'address_operator', submitted: n % 2 ? 32 : '+', expected: n % 2 ? 32 : '+', correct: true })),
        };
        return { eventId: id, eventType: 'attempt_end', timestamp: start + index * 86400000,
            startedAt: start + index * 86400000 - 350000, endedAt: start + index * 86400000,
            profileId: 'learner', infiltratorName: '=SAFE <Learner>', sessionId: 'session-' + index, attemptId: id,
            gameplayId: 'ip_cidr_quarantine_matrix', stageId: 3, levelId: 1, mapId: 0,
            passed: true, outcome: 'passed', accuracy: 1, durationMs: 350000, attemptsUsed: 1,
            payload: { result, ...options.payload }, ...options };
    }
    const events = [0, 1, 2, 3].map(n => event('run-' + n, n));
    const failure = event('failure', 4, { passed: false, outcome: 'failed', levelId: 2, failureReason: 'hearts_exhausted' });
    failure.payload.result.reason = 'hearts_exhausted';
    failure.payload.result.decisionHistory[0] = { stepKey: 'address_operator', submitted: '-', expected: '+', correct: false };
    failure.payload.result.roundHistory.forEach(round => { round.passed = false; });
    failure.payload.gameplayGameOver = { attemptId: failure.attemptId, reason: 'hearts_exhausted' };
    failure.payload.neuralGameOver = { neuralRunId: 'neural-run' };
    events.push(failure);
    events.push({ ...event('legacy-unknown', 5), gameplayId: 'ip_class_wires', payload: { result: {} }, accuracy: 1, passed: false, outcome: 'failed' });
    events.push({ ...event('legacy-blaster', 6), levelId: 3, payload: { result: { gameplayVersion: 'subnet-blaster-v3', correctShots: 4, totalShots: 6, elapsedMs: 300000 } } });
    events.push({ ...event('tutorial', 7), tutorial: true });
    events.push({ ...event('developer', 8), payload: { result: { developerSkip: true } } });
    events.push({ eventId: 'orphan', eventType: 'attempt_start', attemptId: 'orphan', gameplayId: 'ip_class_wires', timestamp: start + 9 * 86400000 });
    const lifecycle = (id, eventType, payload) => ({ eventId: id, eventType, timestamp: start + 4 * 86400000, gameplayId: 'ip_cidr_quarantine_matrix', attemptId: failure.attemptId, payload });
    events.push(lifecycle('game-over', 'neural_game_over', { neuralRunId: 'neural-run' }));
    events.push(lifecycle('offer', 'neural_tutorial_offer', { choice: 'shown', offerId: 'offer-id', failureCount: 3, triggerReason: 'repeated_terminal_failures' }));
    events.push(lifecycle('selected', 'neural_tutorial_offer', { choice: 'tutorial', offerId: 'offer-id' }));
    for (const action of ['started', 'shown', 'completed']) events.push(lifecycle('replay-' + action, 'neural_tutorial_replay', { action, tutorialReplayId: 'replay-id', tutorialOfferId: 'offer-id' }));
    events.push(events[events.length - 1]); // Mirrored records must not double-count recovery.
    events.push({ ...events[2], eventId: 'second-terminal-for-same-attempt' });
    const dto = report._buildReportDTO({ infiltratorName: '=SAFE <Learner>', scopeDays: 90, generatedAt: start + 10 * 86400000, telemetry: events, gameplayCatalog: catalog });
    assert.equal(dto.kpi.assessedAttempts, 7);
    assert.equal(dto.kpi.gameplayInstances, 10, 'one terminal attempt is counted once, even if mirrored under a second event ID');
    assert.equal(dto.kpi.cancelledAttempts, 1, 'tutorial and developer activity are not cancellations');
    assert.equal(dto.kpi.unassessedAttempts, 3);
    assert.equal(dto.attemptsRaw.find(a => a.attemptId === 'legacy-unknown').accuracy, null, 'old default 100% must not count as graded evidence');
    assert.equal(dto.attemptsRaw.find(a => a.attemptId === 'legacy-blaster').accuracy, 4 / 6, 'actual historical formula choices remain evidence');
    assert.equal(dto.attemptsRaw.find(a => a.attemptId === 'legacy-blaster').activeDurationMs, null, 'elapsed time with preparation is not active time');
    assert.equal(dto.attemptsRaw.find(a => a.attemptId === 'run-0').roundsUsed, 3);
    assert.equal(dto.attemptsRaw.find(a => a.attemptId === 'orphan').outcome, 'interrupted');
    assert.equal(dto.learning.recovery.gameOvers, 1);
    assert.equal(dto.learning.recovery.gameplayGameOvers, 1);
    assert.equal(dto.learning.recovery.tutorialOffers, 1);
    assert.equal(dto.learning.recovery.tutorialShown, 1);
    assert.equal(dto.learning.recovery.repeatedMistakeTutorialShown, 1);
    assert.equal(dto.learning.recovery.tutorialCompleted, 1);
    const expected = (110000 - 70000) / 110000 * 100;
    assert.ok(Math.abs(dto.learning.improvement.speedImprovementPercent - expected) < 1e-8, JSON.stringify(dto.learning.improvement));
    assert.ok(Math.abs(dto.learning.improvement.validatedSpeedImprovementPercent - expected) < 1e-8);
    assert.equal(dto.learning.encounterImprovement.speedImprovementPercent, 0, 'whole-run and encounter times are separate units');
    assert.match(dto.performanceSummary, /formula direction/i);
    assert.doesNotMatch(dto.performanceSummary, /Ready for extension work/);
    const xml = await report._buildExcelXmlBlob(dto).text();
    for (const name of ['Teacher Dashboard', 'Improvement', 'Learning Curve', 'Blaster Improvement', 'Blaster Learning Curve', 'Teaching Feedback', 'Recovery and Tutorials', 'Recovery Events', 'Decision Evidence', 'Blaster Encounters', 'Gameplay Timing and Tools', 'Gameplay Coverage', 'Measurement Guide', 'Event Audit']) assert.ok(xml.includes('ss:Name="' + name + '"'), name);
    assert.ok(xml.includes('192.168.1.32') && xml.includes('192.168.1.63'));
    assert.match(xml, /Validated speed improvement/);
    assert.match(xml, /Campaign game overs/);
    assert.match(xml, /Gameplay game overs/);
    assert.ok(xml.includes('=SAFE &lt;Learner&gt;'));
    assert.doesNotMatch(xml, /ss:Formula=/, 'exported strings must never become executable spreadsheet formulas');
    assert.doesNotMatch(xml, /NaN|Infinity|\[object Object\]/);
    if (process.platform === 'win32') {
        const root = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '[xml]$reportXml = [Console]::In.ReadToEnd(); $reportXml.DocumentElement.LocalName'], { input: xml, encoding: 'utf8', maxBuffer: 1024 * 1024 });
        assert.equal(root.trim(), 'Workbook', 'the actual exported workbook must parse as strict XML');
    }
    const boundedXml = report._spreadsheetXml([{ name: 'Evidence', rows: [['Header'], ['A\u0001B'], ['x'.repeat(40000)]] }]);
    assert.doesNotMatch(boundedXml, /\u0001/);
    assert.match(boundedXml, /Truncated in Excel; full evidence is in the packaged evidence JSON/);
    const largeXml = report._spreadsheetXml([{ name: 'Large Evidence', rows: [['Record']].concat(Array.from({ length: 60001 }, (_, n) => [n])) }]);
    assert.ok(largeXml.includes('ss:Name="Large Evidence 2"'));
    assert.ok(largeXml.includes('>60000</Data>'), 'worksheet continuation must retain the final record');
    const sheets = report._learningWorkbookSheets(dto);
    const encounter = sheets.find(sheet => sheet.name === 'Blaster Encounters');
    const col = name => encounter.rows[0].indexOf(name);
    assert.equal(encounter.rows[1][col('Network')], '192.168.1.32');
    assert.equal(encounter.rows[1][col('Broadcast')], '192.168.1.63');
    assert.equal(encounter.rows[1][col('Given Bits Mode')], 'host');
    const texts = [];
    const createWriter = report._createSecurePdfWriter.bind(report);
    report._createSecurePdfWriter = () => {
        const writer = createWriter();
        const text = writer.text.bind(writer);
        writer.text = (...args) => { texts.push(String(args[3])); return text(...args); };
        return writer;
    };
    const pdf = Buffer.from(await (await report._buildPdfBlob(dto)).arrayBuffer());
    assert.match(pdf.subarray(0, 8).toString('ascii'), /^%PDF-1\./);
    assert.equal(pdf.toString('latin1').includes('Learner'), false, 'student report remains encrypted');
    assert.match(texts.join('\n'), /Improvement During System Use|Learning Curves/);
    assert.match(texts.join('\n'), /Teaching Feedback/);
    assert.match(texts.join('\n'), /gameplay game overs/);
    assert.doesNotMatch(texts.join('\n'), /NaN|Infinity|\[object Object\]/);
    const empty = report._buildReportDTO({ infiltratorName: 'EMPTY', telemetry: [], gameplayCatalog: catalog });
    assert.equal(empty.kpi.accuracy, null);
    assert.equal(empty.kpi.weightedMastery, null);
    assert.equal(empty.learning.improvement.speedImprovementPercent, null);
    assert.ok((await report._buildExcelXmlBlob(empty).text()).includes('N/A'));
    assert.ok((await report._buildPdfBlob(empty)).size > 100);
    let queryStart;
    report._queryTelemetry = async (name, since) => { queryStart = since; return events; };
    const allHistory = await report.export({ infiltratorName: 'Learner', scopeDays: 0, format: 'excel', gameplayCatalog: catalog });
    assert.equal(queryStart, 0);
    assert.equal(allHistory.report.summary.scopeDays, 0);
    assert.ok((await report._buildExcelXmlBlob(allHistory.report).text()).includes('All recorded history'));
    const menuWindow = {};
    new Function('Scene', 'window', 'IP2Live', fs.readFileSync(path.join(base, 'screens', 'export-report.js'), 'utf8'))({ Base: class {} }, menuWindow, { PopupChrome: { capture: () => null } });
    const menu = new menuWindow.IP2LiveExportReportMenu();
    menu._defaultFilename = () => 'Report';
    menu.initialize();
    assert.ok(menu.scopeDaysOptions.includes(0), 'all-history scope is accessible from the actual export menu');
    console.log('report_learning_export.test.cjs: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
