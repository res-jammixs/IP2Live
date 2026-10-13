import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { IP2LivePVPService, Rules } from '../deployment/windows/pvp-service.js';

const lanAdapter = Object.entries(os.networkInterfaces()).flatMap(([label, items]) => (items || []).map(item => ({ ...item, label })))
    .filter(item => item.family === 'IPv4' && !item.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(item.address))
    .sort((a, b) => Number(!/wi-fi|wifi|wlan/i.test(a.label)) - Number(!/wi-fi|wifi|wlan/i.test(b.label)))[0];

function peer(t) {
    const child = fork(new URL('./fixtures/pvp-lan-peer.mjs', import.meta.url), [], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    let serial = 0, stderr = ''; const pending = new Map();
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
    child.on('message', message => {
        const item = pending.get(message.id); if (!item) return;
        pending.delete(message.id); clearTimeout(item.timer);
        if (message.error) item.reject(new Error(message.error)); else item.resolve(message.value);
    });
    child.on('exit', () => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('LAN peer exited. ' + stderr)); } pending.clear(); });
    t.after(async () => { if (child.exitCode !== null) return; const exited = once(child, 'exit'); child.disconnect(); await exited; });
    return (operation, input) => new Promise((resolve, reject) => {
        const id = ++serial, timer = setTimeout(() => { pending.delete(id); reject(new Error('LAN peer timed out: ' + operation)); }, 6000);
        pending.set(id, { resolve, reject, timer }); child.send({ id, operation, input });
    });
}

test('an interrupted HTTP response rejects promptly instead of hanging the LAN client', async t => {
    const server = http.createServer((req, res) => {
        req.resume(); res.writeHead(200, { 'content-type': 'application/json' });
        res.write('{"playerId":'); setTimeout(() => res.destroy(), 20);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const client = new IP2LivePVPService(); let timer;
    t.after(async () => { clearTimeout(timer); await client.close(); await new Promise(resolve => server.close(resolve)); });
    const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('LAN client stayed pending after the response disconnected')), 500); });
    await assert.rejects(Promise.race([client.join({ address: '127.0.0.1:' + server.address().port }), deadline]), /interrupted|aborted|reset|closed/i);
    assert.equal(client.busy, false);
});

test('a dropped join reply retries the same guest reservation without filling the lobby', async t => {
    const host = new IP2LivePVPService({ discoveryPort: 0, httpPort: 0 }), guest = new IP2LivePVPService();
    let requests = 0, joinIds = [];
    const proxy = http.createServer((req, res) => {
        let raw = ''; req.on('data', chunk => { raw += chunk; });
        req.on('end', () => {
            const input = JSON.parse(raw); joinIds.push(input.joinId);
            const joined = host._dispatch('join', input); requests++;
            if (requests === 1) { res.writeHead(200); res.write('{'); setTimeout(() => res.destroy(), 10); }
            else { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(joined)); }
        });
    });
    t.after(async () => { await guest.close(); await host.close(); await new Promise(resolve => proxy.close(resolve)); });
    await host.create(); await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
    const joined = await guest.join({ address: ' 127.0.0.1:' + proxy.address().port + ' ', name: 'Retry pilot' });
    assert.equal(requests, 2); assert.equal(joinIds[0], joinIds[1]); assert.equal(joined.lobby.players.length, 2);
    assert.equal(host.room.players[1].id, joined.playerId); assert.ok(!JSON.stringify(joined.lobby).includes(joinIds[0]));
});

test('an occupied preferred TCP port falls back to the address actually shown to players', async t => {
    const occupied = http.createServer(); await new Promise(resolve => occupied.listen(0, '0.0.0.0', resolve));
    const host = new IP2LivePVPService({ discoveryPort: 0, httpPort: occupied.address().port }), guest = new IP2LivePVPService();
    t.after(async () => { await guest.close(); await host.close(); await new Promise(resolve => occupied.close(resolve)); });
    const created = await host.create(); assert.notEqual(host.port, occupied.address().port);
    assert.ok(created.lobby.addresses.every(address => address.endsWith(':' + host.port)));
    assert.ok(created.lobby.connectionOptions.every(option => option.address.endsWith(':' + host.port)));
    assert.equal((await guest.join({ address: '127.0.0.1:' + host.port })).lobby.id, created.lobby.id);
});

test('closing a search releases every adapter socket and permits another search', async () => {
    const client = new IP2LivePVPService({ discoveryPort: 0 });
    const search = client.discover(); await client.close(); await search;
    assert.equal(client.searches.size, 0);
    const retry = client.discover(); await client.close(); await retry;
    assert.equal(client.searches.size, 0);
});

test('discovery uses the LAN adapter, tolerates an unavailable adapter and prefers LAN over loopback', { skip: !lanAdapter }, async t => {
    const host = new IP2LivePVPService({ discoveryPort: 0, httpPort: 0 });
    const guest = new IP2LivePVPService({ networkInterfaces: () => [lanAdapter, { address: '192.0.2.234', netmask: '255.255.255.0', label: 'Disconnected adapter' }] });
    t.after(async () => { await guest.close(); await host.close(); });
    await host.create(); guest.discoveryPort = host.udp.address().port;
    const sources = new Set(); host.udp.on('message', (_, remote) => sources.add(remote.address));
    const found = await guest.discover();
    assert.ok(sources.has(lanAdapter.address), 'discovery must send from the actual LAN adapter');
    assert.equal(found.length, 1); assert.equal(found[0].address, lanAdapter.address + ':' + host.port);
    assert.equal((await guest.join({ address: found[0].address })).lobby.players.length, 2);
    assert.equal(guest.searches.size, 0);
});

test('separate processes discover, join and sync a race through this machine’s LAN address', { skip: !lanAdapter }, async t => {
    const host = peer(t), guest = peer(t);
    const created = await host('create', { name: 'LAN host' }), transport = await host('transport');
    const found = await guest('discover', { discoveryPort: transport.discoveryPort });
    const address = lanAdapter.address + ':' + transport.httpPort;
    assert.ok(found.some(lobby => lobby.id === created.lobby.id && lobby.address === address), 'the lobby is reachable through its LAN address');
    const joined = await guest('join', { address, name: 'LAN guest' });
    await guest('ready', { ready: true }); await host('start'); await host('advance', 3001);
    const state = await guest('poll'); assert.equal(state.match.status, 'racing');
    const round = state.match.players.find(player => player.id === joined.playerId).round;
    await guest('result', { roundId: round.id, gameplayId: round.game.id, passed: true, metrics: { totalDecisions: 8, correctDecisions: 8, mistakeCount: 0 } });
    const synced = await host('poll'); assert.equal(synced.match.players.find(player => player.id === joined.playerId).progress, round.game.points);
    assert.equal(synced.match.players.find(player => player.id === joined.playerId).attackCharge, 1);
    await guest('leave'); const final = await host('poll'); assert.equal(final.match.winnerId, created.playerId);
});

test('shuffle covers 1–6 and 4.5, with an uninterrupted 3 → 4 handoff in every cycle', () => {
    for (let seed = 1; seed <= 100; seed++) {
        for (let cycle = 0; cycle < 10; cycle++) {
            const games = Rules.sequence(seed, cycle);
            assert.deepEqual(games.map(g => g.number).sort(), ['1', '2', '3', '4', '4.5', '5', '6']);
            assert.equal(games[games.findIndex(g => g.number === '4') - 1].number, '3');
        }
    }
});

test('both players advance independently through the same problem seeds, including retries and later cycles', () => {
    const match = Rules.createMatch([{ id: 'a' }, { id: 'b' }], 0, 0);
    const first = Rules.round(match, 'a'), seeds = new Set();
    for (let index = 0; index < 35; index++) {
        match.players[0].roundIndex = index;
        match.players[0].attempt = 4;
        match.players[1].roundIndex = index;
        match.players[1].attempt = 0;
        const a = Rules.round(match, 'a'), b = Rules.round(match, 'b');
        assert.equal(a.problemSeed, b.problemSeed);
        assert.equal(a.problemVersion, Rules.PROBLEM_VERSION);
        assert.equal(a.game.id, b.game.id);
        assert.notEqual(a.id, b.id, 'result receipts still distinguish retries');
        assert.notEqual(a.handoffKey, b.handoffKey, 'CIDR handoffs remain player-specific');
        assert.ok(!seeds.has(a.problemSeed)); seeds.add(a.problemSeed);
    }
    match.players[0].roundIndex = 2; match.players[1].roundIndex = 0;
    assert.equal(Rules.round(match, 'b').problemSeed, first.problemSeed, 'a faster player cannot skip the other player forward');
    assert.notEqual(Rules.round(match, 'a').problemSeed, first.problemSeed);
    assert.notEqual(Rules.problemSeed(1, 0), first.problemSeed, 'a new match can use fresh problems');
});

test('reward scales with difficulty and observed errors; failures retry without free charge', () => {
    const perfect = { totalDecisions: 20, correctDecisions: 20, mistakeCount: 0 };
    assert.ok(Rules.reward('ip_cidr_quarantine_matrix', perfect) > Rules.reward('ip_class_wires', perfect));
    assert.ok(Rules.reward('ip_class_wires', { ...perfect, correctDecisions: 10, mistakeCount: 10 }) < Rules.reward('ip_class_wires', perfect) / 4);
    assert.ok(Rules.reward('ip_class_wires', {}) < Rules.reward('ip_class_wires', perfect), 'unknown evidence is not perfect accuracy');
    const m = Rules.createMatch([{ id: 'a' }, { id: 'b' }], 17, 0), r = Rules.round(m, 'a');
    Rules.complete(m, 'a', { roundId: r.id, gameplayId: r.game.id, passed: false, metrics: { mistakeCount: 2 } }, 3001);
    assert.equal(m.players[0].progress, 0); assert.equal(m.players[0].streak, 0);
    assert.equal(Rules.round(m, 'a').game.id, r.game.id);
    assert.notEqual(Rules.round(m, 'a').id, r.id);
    assert.equal(Rules.round(m, 'a').problemSeed, r.problemSeed);
    const retry = Rules.round(m, 'a');
    Rules.complete(m, 'a', { roundId: retry.id, gameplayId: retry.game.id, passed: true, metrics: perfect }, 3002);
    assert.ok(m.players[0].progress < Rules.reward(r.game.id, perfect), 'a game over cannot erase the mistake penalty');
});

test('bombs occur at wins 3 and 6, clamp to zero, and duplicate results are idempotent', () => {
    const m = Rules.createMatch([{ id: 'a' }, { id: 'b' }], 1, 0); m.target = 10000; m.players[1].progress = 200;
    const finish = passed => { const r = Rules.round(m, 'a'); const input = { roundId: r.id, gameplayId: r.game.id, passed, metrics: { totalDecisions: 10, correctDecisions: 10 } }; Rules.complete(m, 'a', input, 3001); return input; };
    finish(true); finish(true); const duplicate = finish(true), progress = m.players[0].progress;
    assert.equal(m.players[1].progress, 60); Rules.complete(m, 'a', duplicate, 3002); assert.equal(m.players[0].progress, progress);
    finish(true); finish(true); finish(true);
    assert.equal(m.players[1].progress, 0); assert.equal(m.events.filter(e => e.type === 'bomb').length, 2);
    finish(false); finish(true); finish(true); assert.equal(m.events.filter(e => e.type === 'bomb').length, 2);
    assert.throws(() => Rules.complete(m, 'a', { ...duplicate, roundId: 'forged' }, 3003), /current round/);
    assert.ok(!JSON.stringify(Rules.snapshot(m)).includes('receipts'));
});

test('attack meter banks wins, loses only one step per defeat and resets after each bomb', () => {
    const m = Rules.createMatch([{ id: 'a' }, { id: 'b' }], 1, 0); m.target = 10000; m.players[1].progress = 400;
    const pilot = m.players[0];
    const finish = passed => {
        const r = Rules.round(m, 'a'), result = { roundId: r.id, gameplayId: r.game.id, passed, metrics: { totalDecisions: 10, correctDecisions: 10 } };
        Rules.complete(m, 'a', result, 3001); return result;
    };
    finish(false); finish(false); assert.equal(pilot.attackCharge, 0, 'defeats cannot make the meter negative');
    finish(true); finish(true); assert.equal(pilot.attackCharge, 2);
    const charge = pilot.progress, failed = finish(false);
    assert.equal(pilot.attackCharge, 1); assert.equal(pilot.progress, charge, 'defeat removes an attack step, not earned engine charge');
    Rules.complete(m, 'a', failed, 3002); assert.equal(pilot.attackCharge, 1, 'a retried result cannot deduct another step');
    finish(true); assert.equal(pilot.attackCharge, 2); assert.equal(m.events.filter(e => e.type === 'bomb').length, 0);
    const bomb = finish(true);
    assert.equal(pilot.attackCharge, 0); assert.equal(m.players[1].progress, 260, 'two wins after the loss still complete the banked meter');
    Rules.complete(m, 'a', bomb, 3003); assert.equal(m.players[1].progress, 260, 'a duplicate third-win result cannot launch another bomb');
    finish(true); finish(true); finish(true);
    assert.equal(pilot.attackCharge, 0); assert.equal(m.players[1].progress, 120);
    assert.equal(m.events.filter(e => e.type === 'bomb').length, 2);
});

test('a third attack step still launches its bomb when that gameplay wins the race', () => {
    const m = Rules.createMatch([{ id: 'a' }, { id: 'b' }], 1, 0);
    m.players[0].progress = 999; m.players[0].attackCharge = 2; m.players[1].progress = 200;
    const r = Rules.round(m, 'a');
    Rules.complete(m, 'a', { roundId: r.id, gameplayId: r.game.id, passed: true, metrics: { totalDecisions: 10, correctDecisions: 10 } }, 3001);
    assert.equal(m.status, 'finished'); assert.equal(m.winnerId, 'a');
    assert.equal(m.players[1].progress, 60); assert.equal(m.players[0].attackCharge, 0);
    assert.equal(m.events.filter(e => e.type === 'bomb').length, 1);
});

test('two actual LAN clients discover, join, ready, start and exchange authoritative results', async t => {
    let now = Date.now();
    const host = new IP2LivePVPService({ discoveryPort: 0, httpPort: 0, clock: () => now });
    const guest = new IP2LivePVPService(), third = new IP2LivePVPService();
    t.after(async () => { await Promise.all([host.close(), guest.close(), third.close()]); });
    const created = await host.create({ name: 'Host', lobbyName: 'Test circuit' });
    guest.discoveryPort = host.udp.address().port;
    const found = await guest.discover(); assert.equal(found.length, 1); assert.equal(found[0].name, 'Test circuit'); assert.equal(found[0].players, 1);
    const address = '127.0.0.1:' + host.port;
    const joined = await guest.join({ address, name: 'Guest' });
    assert.equal(joined.lobby.players.length, 2);
    await assert.rejects(third.join({ address, name: 'Third' }), /two players/);
    await assert.rejects(host.start(), /Both pilots/);
    await assert.rejects(guest.start(), /Only the host/);
    await guest.ready({ ready: true }); await host.start(); now += 3001;
    const lobby = await guest.poll(); assert.equal(lobby.match.status, 'racing');
    assert.deepEqual(lobby.match.players.map(p => p.round.game.id), [lobby.match.players[0].round.game.id, lobby.match.players[0].round.game.id]);
    assert.equal(lobby.match.players[0].round.problemSeed, lobby.match.players[1].round.problemSeed, 'the LAN snapshot supplies a shared problem seed');
    const r = lobby.match.players.find(p => p.id === joined.playerId).round;
    const result = { roundId: r.id, gameplayId: r.game.id, passed: true, metrics: { totalDecisions: 8, correctDecisions: 8, mistakeCount: 0 }, points: 999999 };
    const accepted = await guest.result(result); const p = accepted.match.players.find(p => p.id === joined.playerId);
    assert.equal(p.progress, r.game.points, 'client-supplied points are ignored');
    assert.equal(p.attackCharge, 1);
    const hostAfterGuest = (await host.poll()).match.players.find(p => p.id === created.playerId);
    assert.equal(hostAfterGuest.round.index, 0, 'the host still solves its current problem when the guest advances');
    assert.equal(hostAfterGuest.round.problemSeed, r.problemSeed);
    const hostAccepted = await host.result({ ...result, roundId: hostAfterGuest.round.id });
    assert.equal(hostAccepted.match.players[0].round.problemSeed, hostAccepted.match.players[1].round.problemSeed, 'the slower player reaches the identical next problem');
    await guest.result(result); assert.equal((await host.poll()).match.players.find(p => p.id === joined.playerId).progress, r.game.points);
    assert.ok(accepted.revision > lobby.revision); assert.ok(!JSON.stringify(accepted).includes(joined.token));
    const submit = async passed => {
        const state = await guest.poll(), next = state.match.players.find(p => p.id === joined.playerId).round;
        return guest.result({ roundId: next.id, gameplayId: next.game.id, passed, metrics: { totalDecisions: 8, correctDecisions: 8 } });
    };
    await submit(true); await submit(false);
    const afterLoss = (await host.poll()).match.players.find(p => p.id === joined.playerId);
    assert.equal(afterLoss.attackCharge, 1, 'the host synchronizes a one-step loss');
    await submit(true); const afterBomb = await submit(true);
    assert.equal(afterBomb.match.players.find(p => p.id === joined.playerId).attackCharge, 0);
    assert.equal(afterBomb.match.events.filter(e => e.type === 'bomb').length, 1, 'LAN uses the banked three-step attack rule');
    await guest.leave(); const finished = await host.poll();
    assert.equal(finished.match.winnerId, created.playerId); assert.equal(finished.match.finishReason, 'opponent-left');
});

test('disconnected lobby slots expire; race disconnections forfeit; public addresses are rejected', async t => {
    let now = Date.now(); const host = new IP2LivePVPService({ discoveryPort: 0, httpPort: 0, clock: () => now }), guest = new IP2LivePVPService();
    t.after(async () => { await host.close(); await guest.close(); });
    await assert.rejects(guest.join({ address: '8.8.8.8:80' }), /local IPv4/);
    await host.create({ name: 'Host' }); const address = '127.0.0.1:' + host.port;
    await guest.join({ address }); now += 12001;
    assert.equal((await host.poll()).players.length, 1); await guest.close();
    const joined = await guest.join({ address }); await guest.ready({ ready: true }); await host.start(); now += 6000;
    await host.poll(); now += 6001; const state = await host.poll();
    assert.equal(state.match.status, 'finished'); assert.notEqual(state.match.winnerId, joined.playerId);
});

test('a departing host leaves its final result readable, then can host again', async t => {
    let now = Date.now(); const host = new IP2LivePVPService({ discoveryPort: 0, httpPort: 0, clock: () => now }), guest = new IP2LivePVPService();
    t.after(async () => { await host.close(); await guest.close(); });
    await host.create(); const joined = await guest.join({ address: '127.0.0.1:' + host.port });
    await guest.ready({ ready: true }); await host.start(); now += 3001; await host.leave();
    const final = await guest.poll(); assert.equal(final.match.winnerId, joined.playerId);
    await guest.close(); await host.create({ name: 'New host' });
    assert.equal((await host.poll()).players.length, 1); assert.equal(host.closeTimer, null);
});
