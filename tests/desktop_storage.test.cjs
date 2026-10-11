const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function main() {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ip2live-storage-test-'));
    const packagedSaveDirectory = path.join(tempRoot, 'empty-export', 'build', 'Saves');
    fs.mkdirSync(packagedSaveDirectory, { recursive: true });
    fs.copyFileSync(path.join(__dirname, 'fixtures', 'legacy-project-saves', '1.json'), path.join(packagedSaveDirectory, '1.json'));
    let packagedSaveReads = 0;
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'Plugins', 'IP2Live_Core', 'modules', 'desktop_storage.js'),
        'utf8'
    );
    const coreSource = fs.readFileSync(
        path.join(__dirname, '..', 'Plugins', 'IP2Live_Core', 'code.js'),
        'utf8'
    );
    const testProcess = {
        env: Object.assign({}, process.env, { LOCALAPPDATA: tempRoot }),
        cwd: () => path.join(tempRoot, 'empty-export'),
        pid: process.pid,
        resourcesPath: path.join(tempRoot, 'resources'),
    };
    const previousWindow = global.window;
    global.window = { require, process: testProcess };

    const packagedSettings = JSON.stringify({ 0: { 1: [38] }, 1: 1 });
    const Common = {
        Platform: {
            IS_DESKTOP: true,
            ROOT_DIRECTORY: './build/',
            registerSave: async () => { throw new Error('legacy writer should not run'); },
            loadSave: async () => { packagedSaveReads++; return { pv: 'bundled-development-save', currentMapId: 4 }; },
            fileExists: async (enginePath) => enginePath === './build/settings-game.json',
            loadFile: async (enginePath) => {
                if (enginePath === './build/settings-game.json') return packagedSettings;
                return 'packaged-asset';
            },
            writeFile: async () => { throw new Error('legacy settings writer should not run'); },
        },
    };
    const Data = { Settings: { isProtected: false } };
    const IP2Live = {};
    const load = new Function('Common', 'Data', 'IP2Live', source + '\nreturn IP2Live.DesktopStorage;');
    const storage = load(Common, Data, IP2Live);

    try {
        const barrierStart = coreSource.indexOf('(function installDesktopSettingsReadBarrier()');
        const barrierEnd = coreSource.indexOf('\n}());', barrierStart);
        assert.notEqual(barrierStart, -1);
        assert.notEqual(barrierEnd, -1);
        let releaseStorage;
        let originalReadCount = 0;
        const barrierData = { Settings: { read: async () => { originalReadCount++; return 'loaded'; } } };
        const barrierIP2Live = {
            DesktopStorageReady: new Promise((resolve) => { releaseStorage = resolve; }),
        };
        new Function('Data', 'IP2Live', coreSource.slice(barrierStart, barrierEnd + '\n}());'.length))(
            barrierData,
            barrierIP2Live
        );
        const pendingSettingsRead = barrierData.Settings.read();
        await Promise.resolve();
        assert.equal(originalReadCount, 0);
        releaseStorage();
        assert.equal(await pendingSettingsRead, 'loaded');
        assert.equal(originalReadCount, 1);

        await storage.boot();
        assert.equal(storage.enabled, true);
        assert.equal(storage.mode, 'desktop-node-fallback');
        assert.equal(storage.rootPath, path.join(tempRoot, 'IP2Live'));
        assert.equal(await Common.Platform.loadSave(1, './build/Saves/1.json'), null, 'fresh storage must not import the packaged development save');
        assert.equal(packagedSaveReads, 0, 'empty user slots never fall back to packaged progress');
        assert.equal(fs.existsSync(path.join(tempRoot, 'IP2Live', 'Saves', '1.json')), false);

        assert.equal(await Common.Platform.loadFile('./build/settings-game.json'), packagedSettings);
        await Common.Platform.writeFile('./build/settings-game.json', { 0: { 1: [40] }, 1: 2 });
        assert.deepEqual(JSON.parse(await Common.Platform.loadFile('./build/settings-game.json')), { 0: { 1: [40] }, 1: 2 });
        await Common.Platform.writeFile('./build/settings-game.json', { 0: { 1: [65] }, 1: 3 });
        const settingsPath = path.join(tempRoot, 'IP2Live', 'Data', 'settings-game.json');
        assert.equal(fs.existsSync(settingsPath + '.bak'), true);
        fs.writeFileSync(settingsPath, '{corrupt', 'utf8');
        assert.deepEqual(JSON.parse(await Common.Platform.loadFile('./build/settings-game.json')), { 0: { 1: [40] }, 1: 2 });
        assert.equal(await Common.Platform.loadFile('./build/system.json'), 'packaged-asset');

        storage.prepareSaveMetadata(1, {
            savedAt: 100,
            profileId: 'profile-test',
            snapshot: { slot: 1, profileName: 'TESTER', mapId: 3, savedAt: 100 },
        });
        await Common.Platform.registerSave(1, './build/Saves/1.json', { pv: 'test', currentMapId: 3 });
        const first = await Common.Platform.loadSave(1, './build/Saves/1.json');
        assert.equal(first.currentMapId, 3);
        assert.equal(first._ip2liveStorage.snapshot.profileName, 'TESTER');

        storage.prepareSaveMetadata(1, {
            savedAt: 200,
            profileId: 'profile-test',
            snapshot: { slot: 1, profileName: 'TESTER', mapId: 7, savedAt: 200 },
        });
        await storage.writeCoreSave(1, { pv: 'test', currentMapId: 7 });
        const savePath = path.join(tempRoot, 'IP2Live', 'Saves', '1.json');
        assert.equal(fs.existsSync(savePath + '.bak'), true);
        assert.equal((await storage.readCoreSave(1)).data.currentMapId, 7);

        fs.writeFileSync(savePath, '{corrupt', 'utf8');
        const recovered = await storage.readCoreSave(1);
        assert.equal(recovered.recoveredFromBackup, true);
        assert.equal(recovered.data.currentMapId, 3);

        assert.equal(await storage.readProgressSnapshot(1, 'TESTER', 'different-profile'), null,
            'same-name profiles with different stable IDs cannot share a snapshot');
        fs.writeFileSync(savePath, JSON.stringify({ currentMapId: 9, _ip2liveStorage: {
            profileId: 'other-profile', snapshot: { mapId: 9, profileName: 'OTHER', profileId: 'other-profile', savedAt: 300 },
        } }), 'utf8');
        assert.equal((await storage.readProgressSnapshot(1, 'OTHER', 'other-profile')).mapId, 9,
            'a newly committed slot replaces metadata cached from an earlier load');
        assert.equal(await storage.readProgressSnapshot(1, 'TESTER', 'profile-test'), null);
        fs.writeFileSync(savePath, JSON.stringify({ currentMapId: 10 }), 'utf8');
        assert.equal(await storage.readProgressSnapshot(1, 'OTHER', 'other-profile'), null,
            'a legacy core save without metadata cannot inherit cached progress');
        assert.equal(storage.getLoadedSaveMetadata(1), null);

        const embedded = { schemaVersion: 2, mapId: 11, savedAt: 400, profileName: 'NOVA', profileId: 'nova-profile',
            gameStates: { gameplaySession: { state: { phase: 'boss', bossBulletImpacts: 4 } } } };
        await storage.writeCoreSave(2, { currentMapId: 11, _ip2liveProgress: embedded });
        const embeddedRead = await storage.readCoreSave(2);
        assert.deepEqual(embeddedRead.data._ip2liveProgress, embedded);
        assert.deepEqual(embeddedRead.metadata.snapshot, embedded);
        await storage.writeCoreSave(2, { currentMapId: 12 });
        assert.equal(await storage.readProgressSnapshot(2, 'NOVA', 'nova-profile'), null,
            'a core overwrite without snapshot evidence drops stale quest/gameplay state');
        assert.equal(storage.prepareSaveMetadata(1.5, {}), false);

        const event = {
            eventId: 'event-test-1',
            eventType: 'attempt_end',
            timestamp: Date.now(),
            infiltratorName: 'TESTER',
            attemptId: 'attempt-test',
            passed: true,
        };
        await storage.appendTelemetry(event);
        const rows = await storage.readTelemetryRecordsSince(Date.now() - 1000, 'TESTER');
        assert.equal(rows.length, 1);
        assert.equal(rows[0].eventId, event.eventId);

        const reportResult = await storage.saveReportBlob(new Blob(['report-bytes']), 'IP2Live_Test.pdf');
        assert.equal(reportResult.ok, true);
        assert.equal(fs.readFileSync(reportResult.path, 'utf8'), 'report-bytes');
        assert.equal(fs.existsSync(reportResult.path + '.sha256'), true);

        // The desktop bridge is asynchronous. Finishing an older write must
        // not consume metadata that was prepared for the next save in that slot.
        const bridgeWrites = [];
        storage._bridge = {
            writeSave(payload) { return new Promise(resolve => bridgeWrites.push({ payload, resolve })); },
            readSave: async () => null,
        };
        storage.prepareSaveMetadata(3, { savedAt: 500, snapshot: { mapId: 3, profileId: 'first' } });
        const firstBridgeWrite = storage.writeCoreSave(3, { currentMapId: 3 });
        storage.prepareSaveMetadata(3, { savedAt: 600, snapshot: { mapId: 4, profileId: 'second' } });
        bridgeWrites[0].resolve({ ok: true });
        await firstBridgeWrite;
        assert.equal(storage._pendingSaveMetadata['3'].snapshot.profileId, 'second');
        const secondBridgeWrite = storage.writeCoreSave(3, { currentMapId: 4 });
        assert.equal(bridgeWrites[1].payload.metadata.snapshot.profileId, 'second');
        bridgeWrites[1].resolve({ ok: true });
        await secondBridgeWrite;
        assert.equal(storage._pendingSaveMetadata['3'], undefined);

        storage.prepareSaveMetadata(3, { savedAt: 700, snapshot: { mapId: 5, profileId: 'failed' } });
        const rejectedBridgeWrite = storage.writeCoreSave(3, { currentMapId: 5 });
        bridgeWrites[2].resolve({ ok: false });
        await assert.rejects(rejectedBridgeWrite, /not committed/);
        assert.equal(storage.getLoadedSaveMetadata(3).snapshot.profileId, 'second', 'failed writes do not become loaded metadata');
        assert.equal(storage._pendingSaveMetadata['3'].snapshot.profileId, 'failed', 'failed writes keep their retry metadata');

        console.log('desktop_storage.test.cjs: PASS');
    } finally {
        global.window = previousWindow;
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
