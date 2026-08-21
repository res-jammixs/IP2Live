const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function main() {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'Plugins', 'IP2Live_Core', 'modules', 'report_manager.js'),
        'utf8'
    );
    const exportScreenSource = fs.readFileSync(
        path.join(__dirname, '..', 'Plugins', 'IP2Live_Core', 'modules', 'screens', 'export-report.js'),
        'utf8'
    );
    const previousWindow = global.window;
    global.window = {};
    const now = Date.now();
    const completed = {
        eventId: 'event-complete',
        eventType: 'attempt_end',
        timestamp: now - 100,
        startedAt: now - 1000,
        endedAt: now - 100,
        infiltratorName: 'TESTER',
        profileId: 'profile-a',
        sessionId: 'session-a',
        attemptId: 'attempt-a',
        gameplayId: 'ip_class_wires',
        passed: true,
        durationMs: 900,
    };
    const orphan = {
        eventId: 'event-orphan',
        eventType: 'attempt_start',
        timestamp: now - 50,
        startedAt: now - 50,
        infiltratorName: 'TESTER',
        profileId: 'profile-a',
        sessionId: 'session-a',
        attemptId: 'attempt-b',
        gameplayId: 'ip_subnet_simulator',
    };
    const otherProfile = Object.assign({}, completed, {
        eventId: 'event-other',
        attemptId: 'attempt-other',
        profileId: 'profile-b',
    });
    const indexedCompleted = Object.assign({}, completed, {
        passed: false,
        sourceMarker: 'indexeddb-mirror',
    });
    const durableCompleted = Object.assign({}, completed, {
        sourceMarker: 'filesystem-journal',
        integrity: { algorithm: 'sha256', value: 'a'.repeat(64) },
    });
    const IP2Live = {
        DBManager: {
            getRecordsByIndex: async () => [indexedCompleted, otherProfile],
        },
        DesktopStorage: {
            enabled: true,
            readTelemetryRecordsSince: async () => [durableCompleted, orphan],
            flushPendingWrites: async () => true,
        },
    };
    const load = new Function('IP2Live', source + '\nreturn IP2Live.ReportManager;');
    const report = load(IP2Live);

    try {
        const rows = await report._queryTelemetry('TESTER', now - 5000, 'profile-a');
        assert.equal(rows.length, 2, 'disk/IndexedDB duplicates should collapse and another profile should be excluded');
        const selectedCompleted = rows.find((row) => row.eventId === 'event-complete');
        assert.equal(selectedCompleted.sourceMarker, 'filesystem-journal');
        assert.match(selectedCompleted.integrity.value, /^[a-f0-9]{64}$/);
        const attempts = report._attemptRows(rows);
        assert.equal(attempts.length, 2);
        assert.equal(attempts.find((row) => row.attemptId === 'attempt-a').outcome, 'passed');
        const interrupted = attempts.find((row) => row.attemptId === 'attempt-b');
        assert.equal(interrupted.outcome, 'interrupted');
        assert.equal(interrupted.cancelled, true);
        assert.equal(interrupted.payload.recoveredOrphan, true);

        const dto = report._buildReportDTO({
            infiltratorName: 'TESTER',
            scopeDays: 90,
            generatedAt: now,
            telemetry: rows,
            gameplayCatalog: [],
        });
        const pdf = await report._buildPdfBlob(dto);
        const pdfHeader = Buffer.from(await pdf.arrayBuffer()).subarray(0, 8).toString('ascii');
        assert.match(pdfHeader, /^%PDF-1\./);
        const excel = report._buildExcelXmlBlob(dto);
        const excelText = Buffer.from(await excel.arrayBuffer()).toString('utf8');
        assert.match(excelText, /<Workbook/);
        assert.match(excelText, /TESTER/);

        const Scene = { Base: class {} };
        const loadExportScreen = new Function(
            'Scene', 'window',
            exportScreenSource + '\nreturn window.IP2LiveExportReportMenu;'
        );
        const ExportScreen = loadExportScreen(Scene, global.window);
        const exportScreen = new ExportScreen();
        exportScreen.filename = 'Teacher_Report';
        const firstArchiveBase = exportScreen._exportFilenameBase(Date.UTC(2026, 7, 21, 4, 5, 6, 7));
        const secondArchiveBase = exportScreen._exportFilenameBase(Date.UTC(2026, 7, 21, 4, 5, 6, 8));
        assert.match(firstArchiveBase, /^Teacher_Report_2026-08-21T04-05-06-007Z$/);
        assert.notEqual(firstArchiveBase, secondArchiveBase, 'each report archive base should be timestamp-unique');
        console.log('report_durability.test.cjs: PASS');
    } finally {
        global.window = previousWindow;
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
