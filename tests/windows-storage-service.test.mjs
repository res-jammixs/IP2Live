import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { IP2LiveStorageService } from '../deployment/windows/storage-service.js';

async function fixture(t, options = {}) {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'ip2live-storage-test-'));
    const rootPath = path.join(parent, 'IP2Live');
    t.after(async () => {
        await fs.rm(parent, { recursive: true, force: true });
    });
    const service = new IP2LiveStorageService({ rootPath, appVersion: '1.2.3', ...options });
    await service.init({ applicationId: 'IP2Live' });
    return { parent, rootPath, service };
}

test('initializes fixed storage directories and reports its stable root', async (t) => {
    const { rootPath, service } = await fixture(t);
    const info = service.getStorageInfo();
    assert.equal(info.rootPath, rootPath);
    assert.equal(info.applicationId, 'IP2Live');
    for (const name of ['Saves', 'Telemetry', 'Reports', 'Data', 'Logs']) {
        assert.equal((await fs.stat(path.join(rootPath, name))).isDirectory(), true);
    }
});

test('writes and reads an integrity-protected core save', async (t) => {
    const { rootPath, service } = await fixture(t);
    const result = await service.writeSave({
        slot: 1,
        data: { pv: '3.2.5', currentMapId: 4, steps: 9 },
        metadata: { profileName: 'Alice', snapshot: { mapId: 4 }, savedAt: 1000 },
    });
    assert.equal(result.ok, true);
    assert.equal(result.path, path.join(rootPath, 'Saves', '1.json'));

    const loaded = await service.readSave({ slot: 1 });
    assert.equal(loaded.data.currentMapId, 4);
    assert.equal(loaded.metadata.profileName, 'Alice');
    assert.match(loaded.metadata.sha256, /^[a-f0-9]{64}$/);
    assert.equal(loaded.recoveredFromBackup, false);
});

test('keeps a verified backup and recovers when the primary is corrupt', async (t) => {
    const { rootPath, service } = await fixture(t);
    await service.writeSave({ slot: 1, data: { revision: 1 }, metadata: { savedAt: 1000 } });
    await service.writeSave({ slot: 1, data: { revision: 2 }, metadata: { savedAt: 2000 } });
    await fs.writeFile(path.join(rootPath, 'Saves', '1.json'), '{incomplete', 'utf8');

    const loaded = await service.readSave({ slot: 1 });
    assert.equal(loaded.data.revision, 1);
    assert.equal(loaded.recoveredFromBackup, true);
});

test('serializes concurrent writes to the same slot', async (t) => {
    const { service } = await fixture(t);
    const writes = [];
    for (let revision = 1; revision <= 8; revision++) {
        writes.push(service.writeSave({
            slot: 3,
            data: { revision },
            metadata: { savedAt: revision * 1000 },
        }));
    }
    await Promise.all(writes);
    const loaded = await service.readSave({ slot: 3 });
    assert.equal(loaded.data.revision, 8);
});

test('persists engine keyboard and language settings and recovers a valid backup', async (t) => {
    const { rootPath, service } = await fixture(t);
    const first = JSON.stringify({ 0: { 1: [38], 2: [40] }, 1: 1 });
    const second = JSON.stringify({ 0: { 1: [87], 2: [83] }, 1: 2 });
    await service.writeEngineSettings(first);

    const restarted = new IP2LiveStorageService({ rootPath, appVersion: '1.2.4' });
    assert.equal((await restarted.readEngineSettings()).content, first);
    await restarted.writeEngineSettings(second);
    assert.equal((await restarted.readEngineSettings()).content, second);

    const settingsPath = path.join(rootPath, 'Data', 'settings-game.json');
    await fs.writeFile(settingsPath, '{corrupt', 'utf8');
    const recovered = await restarted.readEngineSettings();
    assert.equal(recovered.content, first);
    assert.equal(recovered.recoveredFromBackup, true);
});

test('accepts protected base64 engine settings and rejects malformed content', async (t) => {
    const { service } = await fixture(t);
    const protectedContent = Buffer.from(JSON.stringify({ 0: {}, 1: 3 }), 'utf8').toString('base64');
    await service.writeEngineSettings(protectedContent);
    assert.equal((await service.readEngineSettings()).content, protectedContent);
    await assert.rejects(service.writeEngineSettings('not-json-or-base64'), /JSON object/);
});

test('appends telemetry with integrity and filters unreadable or unrelated rows', async (t) => {
    const { rootPath, service } = await fixture(t);
    const august = Date.UTC(2026, 7, 20, 10, 0, 0);
    await service.appendTelemetry({ timestamp: august, infiltratorName: 'Alice', eventType: 'attempt_end' });
    await service.appendTelemetry({ timestamp: august + 1000, infiltratorName: 'Bob', eventType: 'attempt_end' });
    const journal = path.join(rootPath, 'Telemetry', '2026-08.jsonl');
    await fs.appendFile(journal, `${JSON.stringify({
        timestamp: august + 2000,
        infiltratorName: 'Alice',
        eventType: 'unsigned_injection',
    })}\n`, 'utf8');
    await fs.appendFile(journal, '{truncated', 'utf8');

    const result = await service.readTelemetry({ sinceTimestamp: august - 1, infiltratorName: 'Alice' });
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].infiltratorName, 'Alice');
    assert.match(result.records[0].integrity.value, /^[a-f0-9]{64}$/);
});

test('saves reports only below the managed Reports directory', async (t) => {
    const { rootPath, service } = await fixture(t);
    const result = await service.saveReport({
        filename: '..\\..\\unsafe?.pdf',
        bytes: new TextEncoder().encode('%PDF-test'),
    });
    assert.equal(path.dirname(result.path), path.join(rootPath, 'Reports'));
    assert.equal(path.extname(result.path), '.pdf');
    assert.equal(await fs.readFile(result.path, 'utf8'), '%PDF-test');
    assert.match(await fs.readFile(`${result.path}.sha256`, 'utf8'), /^[a-f0-9]{64}  /);
});

test('rejects invalid slots and oversized records before writing', async (t) => {
    const { service } = await fixture(t, { limits: { maxSaveBytes: 256 } });
    await assert.rejects(
        service.writeSave({ slot: '../1', data: {}, metadata: {} }),
        /Save slot must be an integer/,
    );
    await assert.rejects(
        service.writeSave({ slot: 1, data: { value: 'x'.repeat(1000) }, metadata: {} }),
        /configured size limit/,
    );
});

test('imports legacy RPG Paper Maker saves without modifying the source', async (t) => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'ip2live-storage-migration-test-'));
    t.after(async () => fs.rm(parent, { recursive: true, force: true }));
    const legacy = path.join(parent, 'export', 'build', 'Saves');
    const rootPath = path.join(parent, 'LocalAppData', 'IP2Live');
    await fs.mkdir(legacy, { recursive: true });
    const source = path.join(legacy, '2.json');
    await fs.writeFile(source, JSON.stringify({ pv: '3.1.15', currentMapId: 3 }), 'utf8');

    const service = new IP2LiveStorageService({ rootPath, legacySaveDirectories: [legacy] });
    await service.init();
    const loaded = await service.readSave({ slot: 2 });
    assert.equal(loaded.data.currentMapId, 3);
    assert.equal(loaded.metadata.migratedFromLegacy, true);
    assert.equal(JSON.parse(await fs.readFile(source, 'utf8')).currentMapId, 3);
});
