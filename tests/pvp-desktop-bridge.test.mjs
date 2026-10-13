import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import { IP2LivePVPService } from '../deployment/windows/pvp-service.js';

async function desktop(t) {
    const handlers = new Map(), app = new EventEmitter(), bridge = {};
    let service, window;
    Object.assign(app, { getPath: () => path.resolve('.'), getVersion: () => '1.0.0', setName() {}, setPath() {}, requestSingleInstanceLock: () => true,
        commandLine: { appendSwitch() {} }, whenReady: () => Promise.resolve() });
    class BrowserWindow extends EventEmitter {
        constructor() {
            super(); window = this;
            this.webContents = Object.assign(new EventEmitter(), { setWindowOpenHandler() {} });
        }
        isDestroyed() { return false; }
        removeMenu() {}
        loadFile() { return Promise.resolve(); }
    }
    class PVPService extends IP2LivePVPService {
        constructor() { super({ discoveryPort: 0, httpPort: 0 }); service = this; }
    }
    class StorageService { async init() {} async flush() {} }
    const mainUrl = new URL('../deployment/windows/main.js', import.meta.url);
    const main = readFileSync(mainUrl, 'utf8').replace(/^import .+;\r?$/gm, '').replace(/import\.meta\.url/g, '__moduleUrl');
    vm.runInNewContext(main, { app, BrowserWindow, IP2LivePVPService: PVPService, IP2LiveStorageService: StorageService,
        ipcMain: { handle: (channel, handler) => handlers.set(channel, handler), on() {} },
        globalShortcut: {}, dialog: { showErrorBox: (_, error) => assert.fail(error) }, readFileSync, writeFileSync, path, fileURLToPath,
        __moduleUrl: mainUrl.href, process, console, Buffer }, { filename: 'main.js' });
    await new Promise(setImmediate);
    t.after(() => service.close());
    const invoke = async (channel, payload, sender = window.webContents) => structuredClone(await handlers.get(channel)({ sender }, structuredClone(payload)));
    vm.runInNewContext(readFileSync(new URL('../deployment/windows/preload.cjs', import.meta.url), 'utf8'), {
        require: module => { assert.equal(module, 'electron'); return { contextBridge: { exposeInMainWorld: (name, api) => { bridge[name] = api; } }, ipcRenderer: { invoke } }; },
    }, { filename: 'preload.cjs' });
    return { api: bridge.ip2livePVP, service, invoke };
}

test('desktop preload and main IPC forward LAN payloads through the real lobby transport', async t => {
    const host = await desktop(t), guest = await desktop(t);
    assert.ok(Object.isFrozen(host.api));
    const created = await host.api.create({ name: 'Desktop host', lobbyName: 'IPC payload test' });
    assert.equal(created.lobby.players[0].name, 'Desktop host'); assert.equal(created.lobby.name, 'IPC payload test');
    guest.service.discoveryPort = host.service.udp.address().port;
    assert.equal((await guest.api.discover())[0].id, created.lobby.id);
    const joined = await guest.api.join({ address: '127.0.0.1:' + host.service.port, name: 'Desktop guest' });
    assert.equal(joined.lobby.players[1].name, 'Desktop guest');
    await assert.rejects(guest.api.start(), /Only the host/);
    await guest.api.ready({ ready: true }); await host.api.start();
    host.service.room.match.startsAt = Date.now() - 1;
    const lobby = await guest.api.poll(), round = lobby.match.players[1].round;
    const accepted = await guest.api.result({ roundId: round.id, gameplayId: round.game.id, passed: true, metrics: { totalDecisions: 8, correctDecisions: 8, mistakeCount: 0 } });
    assert.equal(accepted.match.players[1].progress, round.game.points);
    await assert.rejects(host.invoke('ip2live-pvp:poll', undefined, {}), /untrusted renderer/);
    await guest.api.leave(); assert.equal((await host.api.poll()).match.winnerId, created.playerId);
});
