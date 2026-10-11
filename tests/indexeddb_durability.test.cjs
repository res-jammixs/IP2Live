const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../Plugins/IP2Live_Core/code.js'), 'utf8');
const core = source.slice(source.indexOf('const IP2Live = {};'), source.indexOf('window.IP2Live = IP2Live;') + 'window.IP2Live = IP2Live;'.length);
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const namedError = (name, message) => Object.assign(new Error(message), { name });

function fixture(oldVersion = 4) {
    const stores = new Map();
    const names = values => ({ contains: name => values.has(name) });
    function createStore(name, options) {
        const store = {
            options, rows: new Map(), indexes: new Map(),
            createIndex(index, keyPath, options) { this.indexes.set(index, { keyPath, options }); },
        };
        store.indexNames = names(store.indexes);
        stores.set(name, store);
        return store;
    }
    createStore('profiles', { keyPath: 'infiltratorName' }).rows.set('NOVA', { infiltratorName: 'NOVA', progressBySlot: { 1: { mapId: 3 } } });
    createStore('telemetry', { keyPath: 'id', autoIncrement: true }).rows.set(1, { id: 1, eventType: 'attempt_end', profileId: 'nova-id' });
    if (oldVersion >= 4) createStore('storyAutosaves', { keyPath: 'id' }).rows.set('current', { id: 'current', coreSave: { currentMapId: 3 }, snapshot: { profileId: 'nova-id' } });
    const requests = [], transactions = [], connections = [];
    let synchronousOpenFailure = null;
    const indexedDB = { open(name, version) {
        if (synchronousOpenFailure) { const failure = synchronousOpenFailure; synchronousOpenFailure = null; throw failure; }
        const request = { name, version };
        requests.push(request);
        return request;
    } };
    function connect(request = requests.at(-1)) {
        const db = {
            closed: false, objectStoreNames: names(stores), createObjectStore: createStore,
            close() { this.closed = true; },
            transaction(storeNames, mode, options) {
                if (this.closed) throw namedError('InvalidStateError', 'Connection closed');
                if (options && db.legacyOptions) throw namedError('TypeError', 'Options unsupported');
                const tx = { storeNames, mode, options, pending: [], aborted: false,
                    objectStore(name) {
                        const source = stores.get(name);
                        if (!source) throw namedError('NotFoundError', 'Missing store');
                        const makeRequest = result => {
                            const req = { result };
                            tx.pending.push(req); return req;
                        };
                        return {
                            indexNames: source.indexNames,
                            put(row) { tx.write = row; return makeRequest(row[source.options.keyPath]); },
                            get(key) { return makeRequest(source.rows.get(key)); },
                            getAll() { return makeRequest([...source.rows.values()]); },
                            index(indexName) { return { getAll(value) {
                                const keyPath = source.indexes.get(indexName).keyPath;
                                const get = row => keyPath.split('.').reduce((at, key) => at && at[key], row);
                                return makeRequest([...source.rows.values()].filter(row => get(row) === value));
                            } }; },
                        };
                    },
                    success() { for (const req of this.pending) req.onsuccess?.({ target: req }); },
                    complete() {
                        if (this.aborted) return;
                        if (this.write) {
                            const store = stores.get(storeNames[0]);
                            store.rows.set(this.write[store.options.keyPath], this.write);
                        }
                        this.oncomplete?.();
                    },
                    abort() { this.aborted = true; queueMicrotask(() => this.onabort?.()); },
                };
                transactions.push(tx); return tx;
            },
        };
        connections.push(db);
        if (oldVersion < request.version) request.onupgradeneeded({ target: { result: db, transaction: { objectStore: name => stores.get(name) } } });
        request.onsuccess({ target: { result: db } });
        return db;
    }
    const env = { window: { indexedDB }, console, IDBKeyRange: { bound: (lower, upper) => ({ lower, upper }) } };
    vm.createContext(env); vm.runInContext(core, env);
    return { manager: env.window.IP2Live.DBManager, requests, transactions, stores, connections, connect,
        failOpenSynchronously(error) { synchronousOpenFailure = error; } };
}

(async () => {
    for (const version of [1, 4]) {
        const h = fixture(version), dbm = h.manager;
        const before = JSON.stringify([...h.stores].map(([name, store]) => [name, [...store.rows]]));
        const first = dbm.initDB(), second = dbm.initDB();
        assert.equal(first, second, 'parallel callers share one upgrade/open request');
        h.connect(); await first;
        assert.equal(h.requests[0].version, 5);
        assert.ok(h.stores.get('telemetry').indexes.has('profileId'));
        assert.ok(h.stores.get('sessions').indexes.has('profileId'));
        assert.equal(h.stores.get('storyAutosaves').indexes.get('savedAt').keyPath, 'snapshot.savedAt');
        for (const [name, rows] of JSON.parse(before)) assert.deepEqual([...h.stores.get(name).rows], rows, 'migration retains every old record');
    }

    const h = fixture(), dbm = h.manager;
    h.failOpenSynchronously(namedError('SecurityError', 'Storage temporarily unavailable'));
    await assert.rejects(dbm.initDB(), /temporarily unavailable/);
    const open = dbm.initDB(); const db = h.connect(); await open;
    assert.equal(h.requests.length, 1, 'a synchronous open failure leaves initialization retryable');

    let resolved = false;
    const write = dbm.saveRecord('profiles', { infiltratorName: 'NOVA', profileId: 'nova-id' }).then(result => { resolved = true; return result; });
    await settle(); const tx = h.transactions.at(-1);
    assert.equal(tx.options.durability, 'strict');
    tx.success(); await settle(); assert.equal(resolved, false, 'request success does not report a durable save');
    tx.complete(); assert.equal(await write, 'NOVA');

    const failedRead = dbm.getRecord('profiles', 'NOVA'); await settle();
    const readTx = h.transactions.at(-1); readTx.success(); readTx.error = new Error('Read transaction aborted'); readTx.abort();
    await assert.rejects(failedRead, /Read transaction aborted/, 'a read cannot restore an uncommitted result');

    db.legacyOptions = true;
    const legacyWrite = dbm.saveRecord('profiles', { infiltratorName: 'LEGACY' }); await settle();
    const legacyTx = h.transactions.at(-1); assert.equal(legacyTx.options, undefined);
    legacyTx.success(); legacyTx.complete(); await legacyWrite;

    const previousRows = [...h.stores.get('profiles').rows];
    const failedWrite = dbm.saveRecord('profiles', { infiltratorName: 'FAILED' }); await settle();
    const failedTx = h.transactions.at(-1); failedTx.success(); failedTx.error = new Error('Quota exceeded'); failedTx.abort();
    await assert.rejects(failedWrite, /Quota exceeded/);
    assert.deepEqual([...h.stores.get('profiles').rows], previousRows, 'aborted writes leave committed progress intact');

    db.closed = true;
    const reconnectRead = dbm.getAllRecords('profiles'); await settle();
    assert.equal(h.requests.length, 2, 'a stale handle is reopened once');
    const replacement = h.connect(); await settle(); const reconnectTx = h.transactions.at(-1);
    reconnectTx.success(); reconnectTx.complete(); assert.ok((await reconnectRead).some(row => row.infiltratorName === 'NOVA'));
    db.onclose(); assert.equal(dbm.db, replacement, 'a late close event from an old handle does not invalidate its replacement');
    replacement.onversionchange(); assert.equal(dbm.db, null); assert.equal(replacement.closed, true);

    console.log('IndexedDB durability: non-destructive migrations, strict commits, aborts, retry and connection ownership passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
