import { constants as fsConstants, promises as fs } from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

export const DEFAULT_STORAGE_LIMITS = Object.freeze({
    maxSaveBytes: 32 * 1024 * 1024,
    maxProgressBytes: 4 * 1024 * 1024,
    maxTelemetryRecordBytes: 512 * 1024,
    maxTelemetryFileBytes: 128 * 1024 * 1024,
    maxTelemetryQueryRecords: 100000,
    maxReportBytes: 64 * 1024 * 1024,
    maxEngineSettingsBytes: 1024 * 1024,
});

const APPLICATION_ID = 'IP2Live';
const SAVE_SCHEMA_VERSION = 2;
const TELEMETRY_SCHEMA_VERSION = 1;
const REPORT_EXTENSIONS = new Set(['.pdf', '.xls', '.xlsx', '.csv', '.json', '.bin']);
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

/**
 * Main-process-only durable storage for the Windows RPG Paper Maker export.
 * Renderer input is always data or a numeric slot; no public method accepts a path.
 */
export class IP2LiveStorageService {
    constructor(options = {}) {
        if (!options.rootPath || !path.isAbsolute(options.rootPath)) {
            throw new Error('IP2Live storage root must be an absolute path.');
        }

        this.rootPath = path.resolve(options.rootPath);
        this.appVersion = String(options.appVersion || '0.0.0');
        this.legacySaveDirectories = this._normalizeLegacyDirectories(options.legacySaveDirectories || []);
        this.limits = Object.freeze({ ...DEFAULT_STORAGE_LIMITS, ...(options.limits || {}) });
        this.paths = Object.freeze({
            root: this.rootPath,
            saves: path.join(this.rootPath, 'Saves'),
            telemetry: path.join(this.rootPath, 'Telemetry'),
            reports: path.join(this.rootPath, 'Reports'),
            data: path.join(this.rootPath, 'Data'),
            logs: path.join(this.rootPath, 'Logs'),
        });

        this._readyPromise = null;
        this._queues = new Map();
        this._pending = new Set();
    }

    async init(clientOptions = {}) {
        if (clientOptions.applicationId && clientOptions.applicationId !== APPLICATION_ID) {
            throw new Error('Unexpected desktop storage application ID.');
        }
        if (!this._readyPromise) {
            this._readyPromise = this._initialize();
        }
        await this._readyPromise;
        return this.getStorageInfo();
    }

    getStorageInfo() {
        return {
            ok: true,
            applicationId: APPLICATION_ID,
            appVersion: this.appVersion,
            saveSchemaVersion: SAVE_SCHEMA_VERSION,
            telemetrySchemaVersion: TELEMETRY_SCHEMA_VERSION,
            rootPath: this.rootPath,
            paths: { ...this.paths },
            minimumReportWindowDays: 90,
        };
    }

    async writeSave(payload) {
        await this.init();
        const slot = this._validateSlot(payload && payload.slot);
        const data = this._cloneJSONObject(payload && payload.data, 'save data');
        const metadata = this._cloneOptionalObject(payload && payload.metadata, 'save metadata');

        return this._enqueue(`save:${slot}`, async () => {
            return this._writeSaveNow(slot, data, metadata);
        });
    }

    async readSave(payload) {
        await this.init();
        const slot = this._validateSlot(payload && payload.slot);
        await this._waitForQueue(`save:${slot}`);

        const candidates = await this._saveCandidates(slot);
        const valid = [];
        for (const candidate of candidates) {
            const loaded = await this._readVerifiedSave(candidate.filePath);
            if (!loaded) continue;
            valid.push({ ...candidate, ...loaded });
        }
        if (!valid.length) return null;

        valid.sort((a, b) => {
            const savedDelta = (Number(b.metadata && b.metadata.savedAt) || 0)
                - (Number(a.metadata && a.metadata.savedAt) || 0);
            if (savedDelta) return savedDelta;
            const modifiedDelta = (Number(b.mtimeMs) || 0) - (Number(a.mtimeMs) || 0);
            if (modifiedDelta) return modifiedDelta;
            return a.priority - b.priority;
        });

        const selected = valid[0];
        return {
            ok: true,
            slot,
            data: selected.record,
            metadata: selected.metadata,
            path: selected.filePath,
            recoveredFromBackup: selected.kind === 'backup',
            recoveredFromTemporaryFile: selected.kind === 'temporary',
        };
    }

    async writeProgress(payload) {
        await this.init();
        const slot = this._validateSlot(payload && payload.slot);
        const record = this._cloneJSONObject(payload, 'progress snapshot');
        record.slot = slot;
        record.savedAt = this._validTimestamp(record.savedAt, Date.now());
        const bytes = this._jsonBuffer(record, this.limits.maxProgressBytes, 'Progress snapshot');
        const target = this._progressPath(slot);

        return this._enqueue(`progress:${slot}`, async () => {
            await this._atomicWrite(target, bytes, { keepBackup: true });
            return { ok: true, slot, path: target, savedAt: record.savedAt };
        });
    }

    async appendTelemetry(record) {
        await this.init();
        const row = this._cloneJSONObject(record, 'telemetry record');
        row.timestamp = this._validTimestamp(row.timestamp, Date.now());
        row.storageSchemaVersion = TELEMETRY_SCHEMA_VERSION;
        delete row.integrity;
        row.integrity = {
            algorithm: 'sha256',
            value: this._sha256(JSON.stringify(row)),
        };

        const line = this._jsonBuffer(row, this.limits.maxTelemetryRecordBytes, 'Telemetry record');
        const lineWithNewline = Buffer.concat([line, Buffer.from('\n', 'utf8')]);
        const month = new Date(row.timestamp).toISOString().slice(0, 7);
        const target = this._telemetryPath(month);

        return this._enqueue(`telemetry:${month}`, async () => {
            const size = await this._fileSize(target);
            if (size + lineWithNewline.length > this.limits.maxTelemetryFileBytes) {
                throw new Error(`Telemetry journal ${month} reached its configured size limit.`);
            }
            const handle = await fs.open(target, fsConstants.O_CREAT | fsConstants.O_APPEND | fsConstants.O_WRONLY, 0o600);
            try {
                await handle.write(lineWithNewline);
                await handle.sync();
            } finally {
                await handle.close();
            }
            return { ok: true, path: target, timestamp: row.timestamp };
        });
    }

    async readTelemetry(request = {}) {
        await this.init();
        await this.flush();
        const sinceTimestamp = this._validTimestamp(request.sinceTimestamp, 0, { allowZero: true });
        const infiltratorName = String(request.infiltratorName || '').trim();
        const entries = await fs.readdir(this.paths.telemetry, { withFileTypes: true });
        const files = entries
            .filter((entry) => entry.isFile() && /^\d{4}-\d{2}\.jsonl$/.test(entry.name))
            .map((entry) => entry.name)
            .sort();
        const records = [];
        const seenIntegrityValues = new Set();

        for (const filename of files) {
            const filePath = path.join(this.paths.telemetry, filename);
            this._assertWithinRoot(filePath);
            const stat = await fs.stat(filePath);
            if (stat.size > this.limits.maxTelemetryFileBytes) {
                throw new Error(`Telemetry journal ${filename} exceeds the configured read limit.`);
            }
            const text = await fs.readFile(filePath, 'utf8');
            for (const line of text.split(/\r?\n/)) {
                if (!line) continue;
                if (Buffer.byteLength(line, 'utf8') > this.limits.maxTelemetryRecordBytes) continue;
                let row;
                try {
                    row = JSON.parse(line);
                } catch {
                    // A truncated final append is ignored; earlier complete lines remain usable.
                    continue;
                }
                if (!this._verifyTelemetry(row)) continue;
                const timestamp = Number(row.timestamp) || 0;
                if (timestamp < sinceTimestamp) continue;
                if (infiltratorName && row.infiltratorName !== infiltratorName) continue;
                const integrityValue = row.integrity && row.integrity.value;
                if (integrityValue && seenIntegrityValues.has(integrityValue)) continue;
                if (integrityValue) seenIntegrityValues.add(integrityValue);
                records.push(row);
                if (records.length > this.limits.maxTelemetryQueryRecords) {
                    throw new Error('Telemetry query exceeded the configured record limit.');
                }
            }
        }

        records.sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
        return { ok: true, records };
    }

    async saveReport(payload) {
        await this.init();
        const filename = this._sanitizeReportFilename(payload && payload.filename);
        const bytes = this._toBuffer(payload && payload.bytes, 'report');
        if (bytes.length > this.limits.maxReportBytes) {
            throw new Error('Report exceeds the configured size limit.');
        }
        const target = path.join(this.paths.reports, filename);
        const digest = this._sha256(bytes);

        return this._enqueue(`report:${filename.toLowerCase()}`, async () => {
            await this._atomicWrite(target, bytes, { keepBackup: true });
            await this._atomicWrite(
                `${target}.sha256`,
                Buffer.from(`${digest}  ${filename}\n`, 'utf8'),
                { keepBackup: false },
            );
            return { ok: true, filename, path: target, sha256: digest, bytes: bytes.length };
        });
    }

    async writeEngineSettings(content) {
        await this.init();
        const bytes = Buffer.from(String(content || ''), 'utf8');
        if (bytes.length > this.limits.maxEngineSettingsBytes) {
            throw new Error('Engine settings exceed the configured size limit.');
        }
        if (!this._isValidEngineSettingsContent(bytes.toString('utf8'))) {
            throw new Error('Engine settings must contain a JSON object or its protected base64 representation.');
        }
        const target = path.join(this.paths.data, 'settings-game.json');
        return this._enqueue('engine-settings', async () => {
            const current = await this._readValidEngineSettingsFile(target);
            await this._atomicWrite(target, bytes, { keepBackup: !!current });
            return { ok: true, path: target };
        });
    }

    async readEngineSettings() {
        await this.init();
        await this._waitForQueue('engine-settings');
        const primary = path.join(this.paths.data, 'settings-game.json');
        const candidates = [
            { filePath: primary, recoveredFromBackup: false },
            { filePath: `${primary}.bak`, recoveredFromBackup: true },
        ];
        for (const candidate of candidates) {
            const loaded = await this._readValidEngineSettingsFile(candidate.filePath);
            if (!loaded) continue;
            return {
                ok: true,
                content: loaded.content,
                path: candidate.filePath,
                recoveredFromBackup: candidate.recoveredFromBackup,
            };
        }
        return null;
    }

    async flush() {
        while (this._pending.size) {
            await Promise.allSettled([...this._pending]);
        }
        return { ok: true };
    }

    async _initialize() {
        for (const directory of Object.values(this.paths)) {
            this._assertWithinRoot(directory);
            await fs.mkdir(directory, { recursive: true, mode: 0o700 });
        }

        await this._migrateLegacySaves();
        const storageInfo = {
            applicationId: APPLICATION_ID,
            appVersion: this.appVersion,
            saveSchemaVersion: SAVE_SCHEMA_VERSION,
            telemetrySchemaVersion: TELEMETRY_SCHEMA_VERSION,
            rootPath: this.rootPath,
            policy: {
                saves: 'retained until explicitly removed by the Windows user',
                telemetry: 'retained locally; report queries support at least 90 days',
                reports: 'retained until explicitly removed by the Windows user',
            },
        };
        await this._atomicWrite(
            path.join(this.paths.data, 'storage-info.json'),
            this._jsonBuffer(storageInfo, this.limits.maxProgressBytes, 'Storage information'),
            { keepBackup: false },
        );
    }

    async _writeSaveNow(slot, data, metadata) {
        const record = this._cloneJSONObject(data, 'save data');
        delete record._ip2liveStorage;
        const storage = {
            ...metadata,
            applicationId: APPLICATION_ID,
            saveSchemaVersion: SAVE_SCHEMA_VERSION,
            slot,
            savedAt: this._validTimestamp(metadata.savedAt, Date.now()),
        };
        delete storage.sha256;
        record._ip2liveStorage = storage;
        storage.sha256 = this._sha256(JSON.stringify(record));
        const bytes = this._jsonBuffer(record, this.limits.maxSaveBytes, 'Save data');
        const target = this._savePath(slot);
        await this._atomicWrite(target, bytes, { keepBackup: true, verifyExistingSave: true });
        await this._removeOldSaveTemps(slot);
        return { ok: true, slot, path: target, savedAt: storage.savedAt, sha256: storage.sha256 };
    }

    async _migrateLegacySaves() {
        const markerPath = path.join(this.paths.data, 'legacy-save-migration.json');
        if (await this._exists(markerPath)) return;

        const imported = [];
        const skipped = [];
        for (const directory of this.legacySaveDirectories) {
            let entries;
            try {
                entries = await fs.readdir(directory, { withFileTypes: true });
            } catch (error) {
                if (error && error.code === 'ENOENT') continue;
                skipped.push({ directory, reason: String(error && error.message || error) });
                continue;
            }

            for (const entry of entries) {
                const match = entry.isFile() && /^(\d+)\.json$/i.exec(entry.name);
                if (!match) continue;
                const slot = Number(match[1]);
                if (!Number.isInteger(slot) || slot < 1 || slot > 999) continue;
                if (await this._hasAnySaveCandidate(slot)) {
                    skipped.push({ directory, filename: entry.name, reason: 'destination slot already exists' });
                    continue;
                }

                const source = path.join(directory, entry.name);
                try {
                    const stat = await fs.stat(source);
                    if (stat.size > this.limits.maxSaveBytes) throw new Error('legacy save exceeds size limit');
                    const raw = JSON.parse(await fs.readFile(source, 'utf8'));
                    const legacyMetadata = this._cloneOptionalObject(raw._ip2liveStorage, 'legacy save metadata');
                    delete raw._ip2liveStorage;
                    await this._writeSaveNow(slot, raw, {
                        ...legacyMetadata,
                        migratedFromLegacy: true,
                        legacySourceHash: this._sha256(await fs.readFile(source)),
                        savedAt: this._validTimestamp(legacyMetadata.savedAt, stat.mtimeMs),
                    });
                    imported.push({ slot, source, sourceSize: stat.size });
                } catch (error) {
                    skipped.push({ directory, filename: entry.name, reason: String(error && error.message || error) });
                }
            }
        }

        const marker = {
            version: 1,
            completedAt: Date.now(),
            imported,
            skipped,
        };
        await this._atomicWrite(
            markerPath,
            this._jsonBuffer(marker, this.limits.maxProgressBytes, 'Migration marker'),
            { keepBackup: false },
        );
    }

    async _atomicWrite(target, bytes, options = {}) {
        this._assertWithinRoot(target);
        await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
        const temporary = `${target}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
        this._assertWithinRoot(temporary);
        const handle = await fs.open(temporary, fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY, 0o600);
        try {
            await handle.writeFile(bytes);
            await handle.sync();
        } finally {
            await handle.close();
        }

        try {
            if (options.keepBackup && await this._exists(target)) {
                let copyExisting = true;
                if (options.verifyExistingSave) copyExisting = !!(await this._readVerifiedSave(target));
                if (copyExisting) {
                    const backup = `${target}.bak`;
                    await fs.copyFile(target, backup);
                    await this._syncFile(backup);
                }
            }

            try {
                await fs.rename(temporary, target);
            } catch (error) {
                if (!error || !['EEXIST', 'EPERM', 'EACCES'].includes(error.code) || !(await this._exists(target))) {
                    throw error;
                }
                const displaced = `${target}.replace-${process.pid}-${Date.now()}`;
                await fs.rename(target, displaced);
                try {
                    await fs.rename(temporary, target);
                    await fs.rm(displaced, { force: true });
                } catch (replaceError) {
                    if (!(await this._exists(target)) && await this._exists(displaced)) {
                        await fs.rename(displaced, target);
                    }
                    throw replaceError;
                }
            }
            await this._syncDirectory(path.dirname(target));
        } finally {
            await fs.rm(temporary, { force: true }).catch(() => {});
        }
    }

    async _saveCandidates(slot) {
        const primary = this._savePath(slot);
        const candidates = [
            { kind: 'primary', priority: 0, filePath: primary },
            { kind: 'backup', priority: 2, filePath: `${primary}.bak` },
        ];
        const entries = await fs.readdir(this.paths.saves, { withFileTypes: true });
        const prefix = `${slot}.json.tmp-`;
        for (const entry of entries) {
            if (entry.isFile() && entry.name.startsWith(prefix)) {
                candidates.push({ kind: 'temporary', priority: 1, filePath: path.join(this.paths.saves, entry.name) });
            }
        }
        const existing = [];
        for (const candidate of candidates) {
            try {
                const stat = await fs.stat(candidate.filePath);
                if (stat.isFile() && stat.size <= this.limits.maxSaveBytes) {
                    existing.push({ ...candidate, mtimeMs: stat.mtimeMs });
                }
            } catch (error) {
                if (!error || error.code !== 'ENOENT') throw error;
            }
        }
        return existing;
    }

    async _readVerifiedSave(filePath) {
        try {
            this._assertWithinRoot(filePath);
            const bytes = await fs.readFile(filePath);
            if (bytes.length > this.limits.maxSaveBytes) return null;
            const record = JSON.parse(bytes.toString('utf8'));
            if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
            const metadata = record._ip2liveStorage;
            if (!metadata || !metadata.sha256) return null;
            const expected = String(metadata.sha256);
            const clone = this._cloneJSONObject(record, 'save verification record');
            delete clone._ip2liveStorage.sha256;
            if (!this._safeDigestEqual(this._sha256(JSON.stringify(clone)), expected)) return null;
            return { record, metadata };
        } catch {
            return null;
        }
    }

    _verifyTelemetry(row) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
        if (!row.integrity || !row.integrity.value) return false;
        const expected = String(row.integrity.value);
        const clone = this._cloneJSONObject(row, 'telemetry verification record');
        delete clone.integrity;
        return this._safeDigestEqual(this._sha256(JSON.stringify(clone)), expected);
    }

    async _readValidEngineSettingsFile(filePath) {
        try {
            this._assertWithinRoot(filePath);
            const stat = await fs.stat(filePath);
            if (!stat.isFile() || stat.size > this.limits.maxEngineSettingsBytes) return null;
            const content = await fs.readFile(filePath, 'utf8');
            return this._isValidEngineSettingsContent(content) ? { content } : null;
        } catch (error) {
            if (error && error.code === 'ENOENT') return null;
            throw error;
        }
    }

    _isValidEngineSettingsContent(content) {
        const text = String(content || '');
        if (!text || Buffer.byteLength(text, 'utf8') > this.limits.maxEngineSettingsBytes) return false;
        const isJSONObject = (candidate) => {
            try {
                const parsed = JSON.parse(candidate);
                return !!parsed && typeof parsed === 'object' && !Array.isArray(parsed);
            } catch {
                return false;
            }
        };
        if (isJSONObject(text)) return true;
        if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text) || text.length % 4 !== 0) return false;
        try {
            return isJSONObject(Buffer.from(text, 'base64').toString('utf8'));
        } catch {
            return false;
        }
    }

    _safeDigestEqual(actual, expected) {
        if (!/^[a-f0-9]{64}$/i.test(actual) || !/^[a-f0-9]{64}$/i.test(expected)) return false;
        return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
    }

    _enqueue(key, operation) {
        const previous = this._queues.get(key) || Promise.resolve();
        const current = previous.catch(() => {}).then(operation);
        this._queues.set(key, current);
        this._pending.add(current);
        current.then(
            () => this._settleQueue(key, current),
            () => this._settleQueue(key, current),
        );
        return current;
    }

    _settleQueue(key, promise) {
        this._pending.delete(promise);
        if (this._queues.get(key) === promise) this._queues.delete(key);
    }

    async _waitForQueue(key) {
        const pending = this._queues.get(key);
        if (pending) await pending;
    }

    _validateSlot(value) {
        const slot = Number(value);
        if (!Number.isInteger(slot) || slot < 1 || slot > 999) {
            throw new TypeError('Save slot must be an integer from 1 through 999.');
        }
        return slot;
    }

    _cloneJSONObject(value, label) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new TypeError(`${label} must be a JSON object.`);
        }
        let text;
        try {
            text = JSON.stringify(value);
        } catch {
            throw new TypeError(`${label} must be JSON serializable.`);
        }
        if (!text) throw new TypeError(`${label} must be JSON serializable.`);
        const clone = JSON.parse(text);
        if (!clone || typeof clone !== 'object' || Array.isArray(clone)) {
            throw new TypeError(`${label} must be a JSON object.`);
        }
        return clone;
    }

    _cloneOptionalObject(value, label) {
        if (value === undefined || value === null) return {};
        return this._cloneJSONObject(value, label);
    }

    _jsonBuffer(value, maximumBytes, label) {
        const bytes = Buffer.from(JSON.stringify(value), 'utf8');
        if (bytes.length > maximumBytes) throw new Error(`${label} exceeds the configured size limit.`);
        return bytes;
    }

    _toBuffer(value, label) {
        if (Buffer.isBuffer(value)) return Buffer.from(value);
        if (value instanceof ArrayBuffer) return Buffer.from(value);
        if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
        if (value && value.type === 'Buffer' && Array.isArray(value.data)) return Buffer.from(value.data);
        throw new TypeError(`${label} bytes must be an ArrayBuffer or typed array.`);
    }

    _sanitizeReportFilename(value) {
        let filename = String(value || '').trim();
        filename = path.basename(filename.replace(/\\/g, '/'));
        filename = filename.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
        filename = filename.replace(/^\.+/, '').replace(/[. ]+$/, '').slice(0, 120);
        if (!filename) filename = 'IP2Live_Report.bin';
        if (WINDOWS_RESERVED_NAMES.test(filename)) filename = `_${filename}`;
        let extension = path.extname(filename).toLowerCase();
        if (!REPORT_EXTENSIONS.has(extension)) {
            filename = `${filename.slice(0, 116)}.bin`;
            extension = '.bin';
        }
        if (!REPORT_EXTENSIONS.has(extension)) throw new Error('Unsupported report extension.');
        return filename;
    }

    _validTimestamp(value, fallback, options = {}) {
        const numeric = Number(value);
        if (options.allowZero && numeric === 0) return 0;
        if (Number.isFinite(numeric) && numeric > 0 && numeric <= 8640000000000000) return numeric;
        return fallback;
    }

    _savePath(slot) {
        const target = path.join(this.paths.saves, `${slot}.json`);
        this._assertWithinRoot(target);
        return target;
    }

    _progressPath(slot) {
        const target = path.join(this.paths.data, `progress-slot-${slot}.json`);
        this._assertWithinRoot(target);
        return target;
    }

    _telemetryPath(month) {
        if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Invalid telemetry journal month.');
        const target = path.join(this.paths.telemetry, `${month}.jsonl`);
        this._assertWithinRoot(target);
        return target;
    }

    _assertWithinRoot(target) {
        const resolved = path.resolve(target);
        if (resolved !== this.rootPath && !resolved.startsWith(`${this.rootPath}${path.sep}`)) {
            throw new Error('Refusing filesystem access outside the IP2Live storage root.');
        }
        return resolved;
    }

    _normalizeLegacyDirectories(values) {
        const normalized = [];
        for (const value of values) {
            if (!value || !path.isAbsolute(value)) continue;
            const resolved = path.resolve(value);
            if (!normalized.includes(resolved)) normalized.push(resolved);
        }
        return normalized;
    }

    _sha256(value) {
        return crypto.createHash('sha256').update(value).digest('hex');
    }

    async _fileSize(filePath) {
        try {
            return (await fs.stat(filePath)).size;
        } catch (error) {
            if (error && error.code === 'ENOENT') return 0;
            throw error;
        }
    }

    async _exists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        } catch (error) {
            if (error && error.code === 'ENOENT') return false;
            throw error;
        }
    }

    async _hasAnySaveCandidate(slot) {
        return (await this._saveCandidates(slot)).length > 0;
    }

    async _removeOldSaveTemps(slot) {
        const prefix = `${slot}.json.tmp-`;
        const entries = await fs.readdir(this.paths.saves, { withFileTypes: true });
        await Promise.all(entries
            .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
            .map((entry) => fs.rm(path.join(this.paths.saves, entry.name), { force: true })));
    }

    async _syncFile(filePath) {
        try {
            // Windows rejects fsync on some read-only handles, so request a
            // writable handle for the backup and retain a best-effort fallback.
            const handle = await fs.open(filePath, 'r+');
            try {
                await handle.sync();
            } finally {
                await handle.close();
            }
        } catch (error) {
            if (!error || !['EPERM', 'EINVAL', 'ENOTSUP'].includes(error.code)) throw error;
        }
    }

    async _syncDirectory(directory) {
        // Windows may reject directory handles. The file itself is already synced,
        // so directory syncing is best-effort and should not turn a good save into an error.
        try {
            const handle = await fs.open(directory, 'r');
            try {
                await handle.sync();
            } finally {
                await handle.close();
            }
        } catch {}
    }
}
