/**
 * IP2Live - Durable Desktop Storage
 *
 * Keeps Windows saves, telemetry, and generated reports outside the installed
 * application directory. The preferred production path is the restricted
 * preload bridge installed by deployment/prepare-windows-release.ps1. A direct
 * Node fallback is retained for RPG Paper Maker desktop previews and older
 * exports. Browser builds continue to use IndexedDB/localStorage.
 *
 * Loaded by code.js via fetch() + new Function(). Do not use import/export.
 */

const IP2LiveDesktopStorage = {
    VERSION: 'desktop-storage-20260821-02',
    SAVE_SCHEMA_VERSION: 2,
    TELEMETRY_SCHEMA_VERSION: 1,
    APPLICATION_ID: 'IP2Live',
    MAX_JSON_BYTES: 32 * 1024 * 1024,
    MAX_TELEMETRY_BYTES: 256 * 1024,
    MAX_REPORT_BYTES: 128 * 1024 * 1024,
    MAX_ENGINE_SETTINGS_BYTES: 1024 * 1024,

    enabled: false,
    mode: 'browser-fallback',
    rootPath: null,
    paths: null,
    _bridge: null,
    _node: null,
    _originalPlatform: null,
    _pendingSaveMetadata: {},
    _loadedSaveMetadata: {},
    _pendingWrites: new Set(),

    async boot() {
        if (this.enabled) return this.getStorageInfo();
        if (!Common || !Common.Platform || !Common.Platform.IS_DESKTOP) {
            this.mode = 'browser-fallback';
            return this.getStorageInfo();
        }

        this._bridge = this._detectBridge();
        if (this._bridge) {
            try {
                const info = await this._bridge.init({
                    applicationId: this.APPLICATION_ID,
                    schemaVersion: this.SAVE_SCHEMA_VERSION,
                });
                this.mode = 'secure-preload-bridge';
                this.enabled = true;
                this.rootPath = info && info.rootPath ? String(info.rootPath) : null;
                this.paths = info && info.paths ? info.paths : null;
            } catch (error) {
                console.warn('[IP2Live] Secure desktop storage bridge did not initialize:', error);
                this._bridge = null;
            }
        }

        if (!this.enabled) {
            this._node = this._detectNodeRuntime();
            if (this._node) {
                this._initializeNodeStorage();
                this.mode = 'desktop-node-fallback';
                this.enabled = true;
                await this._migrateLegacyNodeSaves();
            }
        }

        if (this.enabled) {
            this._installPlatformSaveHooks();
            console.log('[IP2Live] Durable desktop storage ready:', this.mode, this.rootPath || 'managed path');
        } else {
            console.warn('[IP2Live] Desktop file storage unavailable; IndexedDB/localStorage fallback remains active.');
        }
        return this.getStorageInfo();
    },

    _detectBridge() {
        if (typeof window === 'undefined') return null;
        const api = window.ip2liveStorage;
        if (!api || typeof api.init !== 'function' || typeof api.writeSave !== 'function' || typeof api.readSave !== 'function') {
            return null;
        }
        return api;
    },

    _detectNodeRuntime() {
        let nodeRequire = null;
        try {
            if (typeof window !== 'undefined' && typeof window.require === 'function') nodeRequire = window.require;
        } catch (error) {}
        try {
            if (!nodeRequire && typeof require === 'function') nodeRequire = require;
        } catch (error) {}
        if (!nodeRequire) return null;
        try {
            const bufferModule = nodeRequire('buffer');
            return {
                fs: nodeRequire('fs'),
                path: nodeRequire('path'),
                os: nodeRequire('os'),
                crypto: nodeRequire('crypto'),
                Buffer: bufferModule.Buffer,
                process: (typeof window !== 'undefined' && window.process) ? window.process : process,
            };
        } catch (error) {
            console.warn('[IP2Live] Node desktop storage modules unavailable:', error);
            return null;
        }
    },

    _initializeNodeStorage() {
        const n = this._node;
        const env = (n.process && n.process.env) ? n.process.env : {};
        const base = env.LOCALAPPDATA || env.APPDATA || n.path.join(n.os.homedir(), 'AppData', 'Local');
        this.rootPath = n.path.resolve(base, this.APPLICATION_ID);
        this.paths = {
            root: this.rootPath,
            saves: n.path.join(this.rootPath, 'Saves'),
            telemetry: n.path.join(this.rootPath, 'Telemetry'),
            reports: n.path.join(this.rootPath, 'Reports'),
            data: n.path.join(this.rootPath, 'Data'),
            logs: n.path.join(this.rootPath, 'Logs'),
        };
        const keys = Object.keys(this.paths);
        for (let i = 0; i < keys.length; i++) {
            n.fs.mkdirSync(this.paths[keys[i]], { recursive: true, mode: 0o700 });
        }
        this._atomicWriteNodeJSON(n.path.join(this.paths.data, 'storage-info.json'), {
            applicationId: this.APPLICATION_ID,
            storageVersion: this.VERSION,
            saveSchemaVersion: this.SAVE_SCHEMA_VERSION,
            rootPath: this.rootPath,
            policy: {
                saves: 'retained until the user removes them',
                telemetry: 'retained locally; reports support at least 90 days',
                reports: 'retained until the user removes them',
            },
            updatedAt: Date.now(),
        }, { keepBackup: false });
    },

    _installPlatformSaveHooks() {
        if (this._originalPlatform || !Common || !Common.Platform) return;
        const platform = Common.Platform;
        const self = this;
        this._originalPlatform = {
            registerSave: platform.registerSave.bind(platform),
            loadSave: platform.loadSave.bind(platform),
            fileExists: platform.fileExists.bind(platform),
            loadFile: platform.loadFile.bind(platform),
            writeFile: platform.writeFile.bind(platform),
        };

        platform.registerSave = async function (slot, enginePath, json) {
            if (!self._isGameSave(slot, enginePath)) {
                return self._originalPlatform.registerSave(slot, enginePath, json);
            }
            return self.writeCoreSave(slot, json, { enginePath: enginePath });
        };

        platform.loadSave = async function (slot, enginePath) {
            if (!self._isGameSave(slot, enginePath)) {
                return self._originalPlatform.loadSave(slot, enginePath);
            }
            const stored = await self.readCoreSave(slot);
            if (stored && stored.data) return stored.data;

            const legacy = await self._originalPlatform.loadSave(slot, enginePath);
            if (legacy) {
                try {
                    await self.writeCoreSave(slot, legacy, {
                        enginePath: enginePath,
                        migratedFromLegacy: true,
                    });
                } catch (error) {
                    console.warn('[IP2Live] Legacy save loaded but could not be migrated:', error);
                }
            }
            return legacy;
        };

        // RPG Paper Maker reads settings-game.json after plugins load, but its
        // default implementation reads the immutable packaged build. Route only
        // this logical file to the managed per-user Data directory. Other engine
        // assets continue through the original read-only resource path.
        platform.fileExists = async function (enginePath) {
            if (!self._isEngineSettingsPath(enginePath)) {
                return self._originalPlatform.fileExists(enginePath);
            }
            const stored = await self.readEngineSettings({ quiet: true });
            if (stored && typeof stored.content === 'string') return true;
            return self._originalPlatform.fileExists(enginePath);
        };

        platform.loadFile = async function (enginePath, forcePath) {
            if (!forcePath && self._isEngineSettingsPath(enginePath)) {
                const stored = await self.readEngineSettings({ quiet: true });
                if (stored && typeof stored.content === 'string') return stored.content;
            }
            return self._originalPlatform.loadFile(enginePath, forcePath);
        };

        platform.writeFile = async function (enginePath, json) {
            if (!self._isEngineSettingsPath(enginePath)) {
                return self._originalPlatform.writeFile(enginePath, json);
            }
            return self.writeEngineSettings(json);
        };
    },

    _isGameSave(slot, enginePath) {
        const n = Number(slot);
        if (!Number.isInteger(n) || n < 1 || n > 999) return false;
        const normalized = String(enginePath || '').replace(/\\/g, '/');
        return !normalized || /(^|\/)Saves\/\d+\.json$/i.test(normalized);
    },

    _isEngineSettingsPath(enginePath) {
        const normalized = String(enginePath || '')
            .replace(/\\/g, '/')
            .replace(/[?#].*$/, '')
            .replace(/^\.\//, '');
        return /^build\/settings-game\.json$/i.test(normalized);
    },

    async readEngineSettings(options) {
        if (!this.enabled) return null;
        try {
            if (this._bridge && typeof this._bridge.readEngineSettings === 'function') {
                return await this._bridge.readEngineSettings();
            }
            if (!this._node) return null;
            const primary = this._node.path.join(this.paths.data, 'settings-game.json');
            const candidates = [
                { path: primary, recoveredFromBackup: false },
                { path: primary + '.bak', recoveredFromBackup: true },
            ];
            for (let i = 0; i < candidates.length; i++) {
                const candidate = candidates[i];
                if (!this._node.fs.existsSync(candidate.path)) continue;
                const content = this._node.fs.readFileSync(candidate.path, 'utf8');
                if (!this._isValidEngineSettingsContent(content)) continue;
                return {
                    ok: true,
                    content: content,
                    path: candidate.path,
                    recoveredFromBackup: candidate.recoveredFromBackup,
                };
            }
            return null;
        } catch (error) {
            if (!options || !options.quiet) console.warn('[IP2Live] Engine settings could not be read:', error);
            return null;
        }
    },

    async writeEngineSettings(json) {
        if (!this.enabled) throw new Error('Durable desktop settings storage is unavailable.');
        let content = JSON.stringify(json || {});
        if (typeof Data !== 'undefined' && Data.Settings && Data.Settings.isProtected) {
            if (typeof btoa === 'function') {
                content = btoa(content);
            } else if (this._node) {
                content = this._node.Buffer.from(content, 'binary').toString('base64');
            } else {
                throw new Error('Protected settings encoding is unavailable.');
            }
        }
        if (!this._isValidEngineSettingsContent(content)) {
            throw new Error('Engine settings are not valid JSON content.');
        }
        if (this._nodeByteLength(content) > this.MAX_ENGINE_SETTINGS_BYTES) {
            throw new Error('Engine settings exceed the local storage size limit.');
        }
        if (this._bridge && typeof this._bridge.writeEngineSettings === 'function') {
            return this._trackWrite(this._bridge.writeEngineSettings(content));
        }
        if (this._bridge && this._originalPlatform && this._originalPlatform.writeFile) {
            // Compatibility for an older hardened host: its restricted legacy
            // save-file IPC still accepts only build/settings-game.json.
            return this._originalPlatform.writeFile('./build/settings-game.json', json);
        }
        if (!this._node) throw new Error('Durable desktop settings storage is unavailable.');
        const filePath = this._node.path.join(this.paths.data, 'settings-game.json');
        let keepBackup = false;
        if (this._node.fs.existsSync(filePath)) {
            try {
                keepBackup = this._isValidEngineSettingsContent(this._node.fs.readFileSync(filePath, 'utf8'));
            } catch (error) {}
        }
        this._atomicWriteNodeBuffer(filePath, this._bufferFromString(content), { keepBackup: keepBackup });
        return { ok: true, path: filePath };
    },

    _isValidEngineSettingsContent(content) {
        const text = String(content || '');
        if (!text || this._nodeByteLength(text) > this.MAX_ENGINE_SETTINGS_BYTES) return false;
        const isJSONObject = function (candidate) {
            try {
                const value = JSON.parse(candidate);
                return !!value && typeof value === 'object' && !Array.isArray(value);
            } catch (error) {
                return false;
            }
        };
        if (isJSONObject(text)) return true;
        try {
            let decoded;
            if (this._node) decoded = this._node.Buffer.from(text, 'base64').toString('utf8');
            else if (typeof atob === 'function') decoded = atob(text);
            else return false;
            return isJSONObject(decoded);
        } catch (error) {
            return false;
        }
    },

    _nodeByteLength(text) {
        if (this._node && this._node.Buffer) return this._node.Buffer.byteLength(String(text), 'utf8');
        if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(String(text)).byteLength;
        return unescape(encodeURIComponent(String(text))).length;
    },

    prepareSaveMetadata(slot, metadata) {
        const key = String(Number(slot) || 0);
        if (key === '0') return false;
        this._pendingSaveMetadata[key] = this._clonePlain(metadata || {});
        return true;
    },

    clearPendingSaveMetadata(slot) {
        delete this._pendingSaveMetadata[String(Number(slot) || 0)];
    },

    getLoadedSaveMetadata(slot) {
        const value = this._loadedSaveMetadata[String(Number(slot) || 0)];
        return value ? this._clonePlain(value) : null;
    },

    async readProgressSnapshot(slot, profileName) {
        const key = String(Number(slot) || 0);
        let metadata = this._loadedSaveMetadata[key] || null;
        if (!metadata) {
            const stored = await this.readCoreSave(slot);
            metadata = stored && stored.metadata ? stored.metadata : null;
        }
        const snapshot = metadata && metadata.snapshot ? metadata.snapshot : null;
        if (!snapshot) return null;
        const expected = String(profileName || '').trim();
        const actual = String(snapshot.profileName || '').trim();
        if (expected && actual && expected !== actual) return null;
        return this._clonePlain(snapshot);
    },

    async writeProgressSnapshot(slot, snapshot) {
        if (!this.enabled || !snapshot) return null;
        const payload = {
            version: 'progress-snapshot-20260821-01',
            slot: Number(slot) || 0,
            profileName: snapshot.profileName || null,
            savedAt: Number(snapshot.savedAt) || Date.now(),
            snapshot: this._clonePlain(snapshot),
        };
        if (this._bridge && typeof this._bridge.writeProgress === 'function') {
            return this._trackWrite(this._bridge.writeProgress(payload));
        }
        if (this._node) {
            const filePath = this._node.path.join(this.paths.data, 'progress-slot-' + payload.slot + '.json');
            this._atomicWriteNodeJSON(filePath, payload);
            return { ok: true, path: filePath };
        }
        return null;
    },

    async writeCoreSave(slot, gameJson, options) {
        const resolvedSlot = Number(slot) || 0;
        if (!this.enabled || resolvedSlot < 1) {
            if (this._originalPlatform && this._originalPlatform.registerSave) {
                return this._originalPlatform.registerSave(slot, options && options.enginePath, gameJson);
            }
            throw new Error('Durable desktop save storage is unavailable.');
        }
        const key = String(resolvedSlot);
        let metadata = this._pendingSaveMetadata[key] || null;
        if (!metadata) {
            const existing = await this.readCoreSave(resolvedSlot, { quiet: true });
            metadata = existing && existing.metadata ? existing.metadata : {};
        }
        metadata = Object.assign({}, this._clonePlain(metadata || {}), {
            applicationId: this.APPLICATION_ID,
            storageVersion: this.VERSION,
            saveSchemaVersion: this.SAVE_SCHEMA_VERSION,
            slot: resolvedSlot,
            savedAt: Number(metadata && metadata.savedAt) || Date.now(),
            migratedFromLegacy: !!(options && options.migratedFromLegacy),
        });

        let result;
        if (this._bridge) {
            result = await this._trackWrite(this._bridge.writeSave({
                slot: resolvedSlot,
                data: this._clonePlain(gameJson || {}),
                metadata: metadata,
            }));
        } else {
            const record = this._buildIntegritySaveRecord(gameJson, metadata);
            const filePath = this._nodeSavePath(resolvedSlot);
            this._atomicWriteNodeJSON(filePath, record, {
                keepBackup: this._isValidNodeSaveFile(filePath),
            });
            result = { ok: true, path: filePath, savedAt: metadata.savedAt };
        }
        this._loadedSaveMetadata[key] = metadata;
        delete this._pendingSaveMetadata[key];
        return result;
    },

    async readCoreSave(slot, options) {
        const resolvedSlot = Number(slot) || 0;
        if (!this.enabled || resolvedSlot < 1) return null;
        let result = null;
        try {
            if (this._bridge) {
                result = await this._bridge.readSave({ slot: resolvedSlot });
            } else {
                result = this._readNodeSaveWithBackup(resolvedSlot);
            }
        } catch (error) {
            if (!options || !options.quiet) console.warn('[IP2Live] Save slot ' + resolvedSlot + ' could not be read:', error);
            return null;
        }
        if (!result || !result.data) return null;
        const metadata = result.metadata || result.data._ip2liveStorage || null;
        if (metadata) this._loadedSaveMetadata[String(resolvedSlot)] = this._clonePlain(metadata);
        return {
            data: result.data,
            metadata: metadata,
            path: result.path || null,
            recoveredFromBackup: !!result.recoveredFromBackup,
        };
    },

    _buildIntegritySaveRecord(gameJson, metadata) {
        const record = this._clonePlain(gameJson || {});
        delete record._ip2liveStorage;
        const storage = this._clonePlain(metadata || {});
        delete storage.sha256;
        record._ip2liveStorage = storage;
        storage.sha256 = this._sha256(JSON.stringify(record));
        return record;
    },

    _verifyIntegritySaveRecord(record) {
        if (!record || typeof record !== 'object') return false;
        const storage = record._ip2liveStorage;
        if (!storage || !storage.sha256) return true;
        const expected = String(storage.sha256);
        const clone = this._clonePlain(record);
        if (clone._ip2liveStorage) delete clone._ip2liveStorage.sha256;
        return this._sha256(JSON.stringify(clone)) === expected;
    },

    async appendTelemetry(record) {
        if (!this.enabled || !record) return false;
        const payload = this._clonePlain(record);
        if (this._bridge && typeof this._bridge.appendTelemetry === 'function') {
            return this._trackWrite(this._bridge.appendTelemetry(payload));
        }
        if (!this._node) return false;
        const lineRecord = this._withTelemetryIntegrity(payload);
        const timestamp = Number(lineRecord.timestamp) || Date.now();
        const month = new Date(timestamp).toISOString().slice(0, 7);
        const filePath = this._node.path.join(this.paths.telemetry, month + '.jsonl');
        const line = JSON.stringify(lineRecord) + '\n';
        if (this._node.Buffer.byteLength(line, 'utf8') > this.MAX_TELEMETRY_BYTES) {
            throw new Error('Telemetry record exceeds the local storage size limit.');
        }
        const fd = this._node.fs.openSync(filePath, 'a', 0o600);
        try {
            this._node.fs.writeFileSync(fd, line, { encoding: 'utf8' });
            this._node.fs.fsyncSync(fd);
        } finally {
            this._node.fs.closeSync(fd);
        }
        return { ok: true, path: filePath };
    },

    async readTelemetryRecordsSince(sinceTimestamp, profileName) {
        if (!this.enabled) return [];
        const request = {
            sinceTimestamp: Number(sinceTimestamp) || 0,
            infiltratorName: String(profileName || '').trim(),
        };
        if (this._bridge && typeof this._bridge.readTelemetry === 'function') {
            const result = await this._bridge.readTelemetry(request);
            return result && Array.isArray(result.records) ? result.records : [];
        }
        if (!this._node) return [];
        const files = this._node.fs.readdirSync(this.paths.telemetry)
            .filter(function (name) { return /^\d{4}-\d{2}\.jsonl$/.test(name); })
            .sort();
        const records = [];
        for (let i = 0; i < files.length; i++) {
            const filePath = this._node.path.join(this.paths.telemetry, files[i]);
            const lines = this._node.fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
            for (let j = 0; j < lines.length; j++) {
                if (!lines[j]) continue;
                try {
                    const row = JSON.parse(lines[j]);
                    if (!this._verifyTelemetryIntegrity(row)) continue;
                    const timestamp = Number(row.timestamp) || 0;
                    if (timestamp < request.sinceTimestamp) continue;
                    if (request.infiltratorName && row.infiltratorName !== request.infiltratorName) continue;
                    records.push(row);
                } catch (error) {
                    console.warn('[IP2Live] Skipped an unreadable telemetry line in ' + files[i] + '.');
                }
            }
        }
        records.sort(function (a, b) { return (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0); });
        return records;
    },

    _withTelemetryIntegrity(record) {
        const row = this._clonePlain(record || {});
        delete row.integrity;
        row.storageSchemaVersion = this.TELEMETRY_SCHEMA_VERSION;
        row.integrity = {
            algorithm: 'sha256',
            value: this._sha256(JSON.stringify(row)),
        };
        return row;
    },

    _verifyTelemetryIntegrity(record) {
        if (!record || !record.integrity || !record.integrity.value) return true;
        const expected = String(record.integrity.value);
        const clone = this._clonePlain(record);
        delete clone.integrity;
        return this._sha256(JSON.stringify(clone)) === expected;
    },

    async saveReportBlob(blob, filename) {
        if (!this.enabled || !blob) return null;
        if (Number(blob.size || 0) > this.MAX_REPORT_BYTES) throw new Error('Report exceeds the local storage size limit.');
        const safeName = this._sanitizeFilename(filename, 'IP2Live_Report.bin');
        const buffer = await blob.arrayBuffer();
        if (this._bridge && typeof this._bridge.saveReport === 'function') {
            return this._trackWrite(this._bridge.saveReport({ filename: safeName, bytes: buffer }));
        }
        if (!this._node) return null;
        const bytes = this._node.Buffer.from(buffer);
        const filePath = this._node.path.join(this.paths.reports, safeName);
        this._atomicWriteNodeBuffer(filePath, bytes);
        this._atomicWriteNodeBuffer(filePath + '.sha256', this._bufferFromString(this._sha256Buffer(bytes) + '  ' + safeName + '\n'), { keepBackup: false });
        return { ok: true, path: filePath };
    },

    async flushPendingWrites() {
        const writes = Array.from(this._pendingWrites);
        if (!writes.length) return [];
        return Promise.allSettled(writes);
    },

    getStorageInfo() {
        return {
            enabled: !!this.enabled,
            mode: this.mode,
            rootPath: this.rootPath,
            paths: this.paths ? this._clonePlain(this.paths) : null,
            minimumReportWindowDays: 90,
        };
    },

    _trackWrite(promise) {
        const tracked = Promise.resolve(promise);
        this._pendingWrites.add(tracked);
        const self = this;
        tracked.then(function () { self._pendingWrites.delete(tracked); }, function () { self._pendingWrites.delete(tracked); });
        return tracked;
    },

    _nodeSavePath(slot) {
        return this._node.path.join(this.paths.saves, String(Number(slot) || 0) + '.json');
    },

    _readNodeSaveWithBackup(slot) {
        const primary = this._nodeSavePath(slot);
        const backup = primary + '.bak';
        const candidates = [
            { path: primary, recoveredFromBackup: false },
            { path: backup, recoveredFromBackup: true },
        ];
        let lastError = null;
        for (let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i];
            if (!this._node.fs.existsSync(candidate.path)) continue;
            try {
                const data = JSON.parse(this._node.fs.readFileSync(candidate.path, 'utf8'));
                if (!this._verifyIntegritySaveRecord(data)) throw new Error('SHA-256 integrity check failed');
                return {
                    data: data,
                    metadata: data._ip2liveStorage || null,
                    path: candidate.path,
                    recoveredFromBackup: candidate.recoveredFromBackup,
                };
            } catch (error) {
                lastError = error;
            }
        }
        if (lastError) throw lastError;
        return null;
    },

    _isValidNodeSaveFile(filePath) {
        if (!this._node.fs.existsSync(filePath)) return false;
        try {
            const data = JSON.parse(this._node.fs.readFileSync(filePath, 'utf8'));
            return this._verifyIntegritySaveRecord(data);
        } catch (error) {
            return false;
        }
    },

    async _migrateLegacyNodeSaves() {
        const n = this._node;
        const candidates = [];
        const add = function (value) {
            if (!value) return;
            const resolved = n.path.resolve(value);
            if (candidates.indexOf(resolved) === -1) candidates.push(resolved);
        };
        try {
            add(n.path.resolve(n.process.cwd(), 'build', 'Saves'));
            const root = Common && Common.Platform ? String(Common.Platform.ROOT_DIRECTORY || '') : '';
            if (root) add(n.path.resolve(n.process.cwd(), root, 'Saves'));
            if (n.process.resourcesPath) add(n.path.join(n.process.resourcesPath, 'app', 'build', 'Saves'));
        } catch (error) {}

        for (let i = 0; i < candidates.length; i++) {
            const directory = candidates[i];
            if (!n.fs.existsSync(directory)) continue;
            const files = n.fs.readdirSync(directory).filter(function (name) { return /^\d+\.json$/.test(name); });
            for (let j = 0; j < files.length; j++) {
                const slot = Number(files[j].replace(/\.json$/, ''));
                const destination = this._nodeSavePath(slot);
                if (n.fs.existsSync(destination)) continue;
                try {
                    const legacyPath = n.path.join(directory, files[j]);
                    const legacy = JSON.parse(n.fs.readFileSync(legacyPath, 'utf8'));
                    const record = this._buildIntegritySaveRecord(legacy, {
                        applicationId: this.APPLICATION_ID,
                        storageVersion: this.VERSION,
                        saveSchemaVersion: this.SAVE_SCHEMA_VERSION,
                        slot: slot,
                        savedAt: Date.now(),
                        migratedFromLegacy: true,
                    });
                    this._atomicWriteNodeJSON(destination, record, { keepBackup: false });
                    console.log('[IP2Live] Migrated legacy save slot ' + slot + ' to durable storage.');
                } catch (error) {
                    console.warn('[IP2Live] Could not migrate legacy save ' + files[j] + ':', error);
                }
            }
        }
    },

    _atomicWriteNodeJSON(filePath, value, options) {
        const text = JSON.stringify(value);
        if (this._node.Buffer.byteLength(text, 'utf8') > this.MAX_JSON_BYTES) {
            throw new Error('JSON payload exceeds the local storage size limit.');
        }
        JSON.parse(text);
        this._atomicWriteNodeBuffer(filePath, this._bufferFromString(text), options);
    },

    _atomicWriteNodeBuffer(filePath, buffer, options) {
        if (!this._isWithinNodeRoot(filePath)) throw new Error('Refusing to write outside IP2Live storage root.');
        const n = this._node;
        const opts = options || {};
        n.fs.mkdirSync(n.path.dirname(filePath), { recursive: true, mode: 0o700 });
        const tempPath = filePath + '.' + (n.process.pid || 0) + '.' + Date.now() + '.tmp';
        const backupPath = filePath + '.bak';
        const fd = n.fs.openSync(tempPath, 'wx', 0o600);
        try {
            n.fs.writeFileSync(fd, buffer);
            n.fs.fsyncSync(fd);
        } finally {
            n.fs.closeSync(fd);
        }
        try {
            if (opts.keepBackup !== false && n.fs.existsSync(filePath)) {
                n.fs.copyFileSync(filePath, backupPath);
            }
            try {
                n.fs.renameSync(tempPath, filePath);
            } catch (renameError) {
                if (n.fs.existsSync(filePath)) n.fs.unlinkSync(filePath);
                n.fs.renameSync(tempPath, filePath);
            }
            try { n.fs.chmodSync(filePath, 0o600); } catch (error) {}
        } finally {
            if (n.fs.existsSync(tempPath)) n.fs.unlinkSync(tempPath);
        }
    },

    _isWithinNodeRoot(filePath) {
        const n = this._node;
        const root = n.path.resolve(this.rootPath);
        const target = n.path.resolve(filePath);
        return target === root || target.indexOf(root + n.path.sep) === 0;
    },

    _sha256(text) {
        if (!this._node || !this._node.crypto) return '';
        return this._node.crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
    },

    _sha256Buffer(buffer) {
        return this._node.crypto.createHash('sha256').update(buffer).digest('hex');
    },

    _bufferFromString(text) {
        return this._node.Buffer.from(String(text), 'utf8');
    },

    _nodeRequireBuffer(arrayBuffer) {
        return this._node.Buffer.from(arrayBuffer);
    },

    _sanitizeFilename(filename, fallback) {
        let name = String(filename || '').trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
        name = name.replace(/^\.+/, '').replace(/[. ]+$/, '').slice(0, 120);
        return name || fallback;
    },

    _clonePlain(value) {
        if (value === undefined) return undefined;
        try { return JSON.parse(JSON.stringify(value)); } catch (error) { return null; }
    },
};

IP2Live.DesktopStorage = IP2LiveDesktopStorage;
if (typeof window !== 'undefined') window.IP2LiveDesktopStorage = IP2LiveDesktopStorage;
console.log('[IP2Live] desktop_storage.js loaded.');
