/** Dependency-free LAN lobby transport. Network access stays in the main process. */
import http from 'node:http';
import dgram from 'node:dgram';
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const Rules = require(existsSync(new URL('./pvp-rules.cjs', import.meta.url)) ? './pvp-rules.cjs' : '../../Plugins/IP2Live_Core/modules/pvp_rules.js');
const DISCOVERY_PORT = 43871, HTTP_PORT = 43872, PROTOCOL = 'ip2live-pvp-3';
const token = () => randomBytes(24).toString('hex');
const name = v => String(v || 'Pilot').replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 24) || 'Pilot';
const localIP = ip => /^127\./.test(ip) || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^169\.254\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
function endpoint(value) {
    const match = /^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/.exec(String(value || '').trim());
    const address = match && match[1].split('.').map(Number).join('.'), port = match && Number(match[2] || HTTP_PORT);
    if (!match || address.split('.').some(p => Number(p) > 255) || !localIP(address) || port < 1 || port > 65535) throw new Error('Enter a local IPv4 address and port, for example 192.168.1.12:43872.');
    return { address, port };
}
function interfaces() {
    return Object.entries(os.networkInterfaces()).flatMap(([label, items]) => (items || []).filter(i => i && (i.family === 'IPv4' || i.family === 4) && !i.internal && localIP(i.address)).map(i => ({ ...i, label })))
        .sort((a, b) => interfaceRank(a) - interfaceRank(b));
}
function interfaceRank(item) {
    if (/^127\./.test(item.address)) return 4;
    if (/^169\.254\./.test(item.address)) return 3;
    if (/zerotier|tailscale|vpn|virtual|vbox|vmware|vethernet|hyper-v|docker|wsl|tap|tun/i.test(item.label || '')) return 2;
    return /wi-fi|wifi|wlan|wireless/i.test(item.label || '') ? 0 : 1;
}
function request(target, route, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body || {});
        let settled = false, timer;
        const finish = (error, value, retryable = false) => {
            if (settled) return;
            settled = true; clearTimeout(timer);
            if (error) error.retryable = retryable;
            if (error) reject(error); else resolve(value);
        };
        const req = http.request({ host: target.address, port: target.port, path: '/ip2live/' + route, method: 'POST', timeout: 2500,
            headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, res => {
            let raw = '', bytes = 0;
            res.setEncoding('utf8');
            res.on('data', chunk => {
                bytes += Buffer.byteLength(chunk);
                if (bytes > 262144) req.destroy(new Error('Invalid lobby response.'));
                else raw += chunk;
            });
            res.on('aborted', () => finish(new Error('Lobby response interrupted. Please try again.'), null, true));
            res.on('error', error => finish(error, null, true));
            res.on('close', () => { if (!res.complete) finish(new Error('Lobby connection closed before the response completed. Please try again.'), null, true); });
            res.on('end', () => {
                try {
                    const value = JSON.parse(raw);
                    if (res.statusCode !== 200) finish(new Error(value.error || 'Lobby request failed.'));
                    else finish(null, value);
                } catch { finish(new Error('Invalid lobby response.')); }
            });
        });
        // Bound the whole operation, including a peer that keeps sending partial data.
        const timeout = () => req.destroy(new Error('The lobby did not respond. Check that both devices are on the same network.'));
        timer = setTimeout(timeout, 2500);
        req.on('timeout', timeout);
        req.on('error', error => {
            if (error.code === 'ECONNREFUSED') error.message = 'Cannot connect to ' + target.address + ':' + target.port + '. Keep the host lobby open and check its displayed address and port.';
            else if (error.code === 'EHOSTUNREACH' || error.code === 'ENETUNREACH') error.message = 'The host is unreachable. Both devices must use the same local network.';
            else if (error.code === 'EACCES' || error.code === 'EPERM') error.message = 'The network connection was blocked. Allow IP2Live on the private network.';
            finish(error, null, true);
        }); req.end(data);
    });
}

export class IP2LivePVPService {
    constructor({ discoveryPort = DISCOVERY_PORT, httpPort = HTTP_PORT, clock = () => Date.now(), networkInterfaces = interfaces } = {}) {
        this.discoveryPort = discoveryPort; this.httpPort = httpPort; this.clock = clock;
        this.networkInterfaces = networkInterfaces;
        this.server = null; this.udp = null; this.room = null; this.connection = null;
        this.searches = new Set(); this.busy = false; this.pendingJoin = null; this.discoveryAvailable = false;
    }
    _public() {
        const r = this.room; if (!r) throw new Error('Lobby closed.');
        const now = this.clock();
        if (r.match) Rules.tick(r.match, now);
        const guest = r.players[1];
        if (guest && now - guest.seen > 12000 && !r.match) { r.players.pop(); r.revision++; }
        if (r.match && r.match.status !== 'finished') {
            const gone = r.players.find(p => now - p.seen > 12000);
            if (gone) { Rules.forfeit(r.match, gone.id); r.revision++; }
        }
        return { protocol: PROTOCOL, id: r.id, revision: r.revision, serverTime: now, name: r.name, hostId: r.players[0].id, port: this.port,
            addresses: this.networkInterfaces().map(i => i.address + ':' + this.port),
            connectionOptions: this.networkInterfaces().map(i => ({ label: i.label || 'Local network', address: i.address + ':' + this.port })),
            discoveryAvailable: this.discoveryAvailable, status: r.match ? r.match.status : 'lobby',
            players: r.players.map(p => ({ id: p.id, name: p.name, ready: p.ready })), match: r.match ? Rules.snapshot(r.match) : null };
    }
    _dispatch(route, input) {
        if (!this.room) throw new Error('Lobby closed.');
        const r = this.room;
        this._public();
        if (route === 'join') {
            if (input.protocol !== PROTOCOL) throw new Error('This lobby uses a different game version.');
            if (input.joinId !== undefined && !/^[a-f0-9]{48}$/.test(input.joinId)) throw new Error('Invalid join request.');
            // A lost reply must not occupy the only guest slot and lock out its retry.
            const previous = input.joinId && r.players.find(p => p.joinId === input.joinId);
            if (previous) { previous.seen = this.clock(); return { playerId: previous.id, token: previous.token, lobby: this._public() }; }
            if (r.match || r.players.length >= 2) throw new Error('This lobby already has two players or has started.');
            const guest = { id: token().slice(0, 12), token: token(), joinId: input.joinId, name: name(input.name), ready: false, seen: this.clock() };
            r.players.push(guest); r.revision++; return { playerId: guest.id, token: guest.token, lobby: this._public() };
        }
        const player = r.players.find(p => p.token === input.token);
        if (!player) throw new Error('Your lobby session has ended.');
        player.seen = this.clock();
        if (route === 'poll') return this._public();
        if (route === 'ready') { if (r.match) throw new Error('Race already started.'); player.ready = input.ready === true; }
        else if (route === 'start') {
            if (player !== r.players[0]) throw new Error('Only the host can start the race.');
            if (r.match || r.players.length !== 2 || !r.players.every(p => p.ready)) throw new Error('Both pilots must be ready.');
            r.match = Rules.createMatch(r.players, randomBytes(4).readUInt32LE(), this.clock());
        } else if (route === 'result') {
            if (!r.match) throw new Error('The race has not started.');
            Rules.complete(r.match, player.id, input.result, this.clock());
        } else if (route === 'leave') {
            if (r.match) Rules.forfeit(r.match, player.id);
            if (player !== r.players[0] && !r.match) r.players.splice(1, 1);
        } else throw new Error('Unknown lobby operation.');
        r.revision++;
        return this._public();
    }
    async _listen() {
        const server = http.createServer((req, res) => {
            res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store');
            const reply = (status, value) => { if (!res.writableEnded) { res.statusCode = status; res.end(JSON.stringify(value)); } };
            // No browser CORS, arbitrary destinations, paths, or renderer-owned sockets.
            const peer = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
            if (!localIP(peer) || req.method !== 'POST' || !/^\/ip2live\/(join|poll|ready|start|result|leave)$/.test(req.url || '') || req.headers.origin) { reply(403, { error: 'Local game clients only.' }); req.resume(); return; }
            let raw = '', rejected = false;
            req.on('data', chunk => { raw += chunk; if (raw.length > 16384) { rejected = true; reply(413, { error: 'Request too large.' }); req.destroy(); } });
            req.on('end', () => { if (rejected) return; try { reply(200, this._dispatch(req.url.slice(9), JSON.parse(raw))); } catch (e) { reply(400, { error: e.message }); } });
        });
        server.requestTimeout = 5000; server.headersTimeout = 5000; server.maxConnections = 24;
        this.server = server;
        const bind = port => new Promise((resolve, reject) => { const error = e => { server.removeListener('listening', ready); reject(e); }; const ready = () => { server.removeListener('error', error); resolve(); }; server.once('error', error); server.once('listening', ready); server.listen(port, '0.0.0.0'); });
        try { await bind(this.httpPort); } catch (e) { if (e.code !== 'EADDRINUSE') throw e; await bind(0); }
        this.port = server.address().port;
        server.on('error', () => {});
        const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true }); this.udp = udp;
        udp.on('error', () => { this.discoveryAvailable = false; }); // Direct joining remains available.
        udp.on('message', (buffer, remote) => {
            if (!localIP(remote.address) || buffer.length > 512 || !this.room || this.room.match) return;
            try {
                const data = JSON.parse(buffer.toString());
                if (data.protocol !== PROTOCOL || data.type !== 'discover') return;
                const r = this._public(), message = Buffer.from(JSON.stringify({ protocol: PROTOCOL, type: 'lobby', nonce: data.nonce,
                    id: r.id, name: r.name, port: this.port, players: r.players.length, capacity: 2 }));
                udp.send(message, remote.port, remote.address, () => {});
            } catch {}
        });
        await new Promise(resolve => { const done = () => { udp.removeListener('error', done); udp.removeListener('listening', done); resolve(); }; udp.once('error', done); udp.once('listening', done); udp.bind(this.discoveryPort, '0.0.0.0'); });
        try { this.discoveryAvailable = !!udp.address().port; } catch { this.discoveryAvailable = false; }
    }
    async create(input = {}) {
        if (this.busy || this.connection) throw new Error('Leave your current lobby first.');
        this.busy = true;
        try {
            if (this.server) await this.close();
            const host = { id: token().slice(0, 12), token: token(), name: name(input.name), ready: true, seen: this.clock() };
            this.room = { id: token().slice(0, 12), revision: 0, name: name(input.lobbyName || host.name + "'s lobby"), players: [host], match: null };
            await this._listen(); this.connection = { host: true, playerId: host.id, token: host.token };
            return { playerId: host.id, lobby: this._public() };
        } catch (e) { await this.close(); throw e; } finally { this.busy = false; }
    }
    async discover() {
        if (this.searches.size >= 1) throw new Error('A lobby search is already running.');
        const found = new Map(), nonce = token().slice(0, 12), sockets = new Set();
        const adapters = [...this.networkInterfaces(), { address: '127.0.0.1', netmask: '255.0.0.0', label: 'Loopback' }]
            .filter((item, index, all) => all.findIndex(other => other.address === item.address) === index);
        return new Promise((resolve, reject) => {
            let timer, repeat, done = false, lastError, sent = false;
            const finish = () => {
                if (done) return;
                done = true; clearTimeout(timer); clearInterval(repeat);
                for (const socket of sockets) { this.searches.delete(socket); try { socket.close(); } catch {} }
                if (!sent && lastError) reject(new Error('Lobby discovery could not use the local network. Try joining by the host address.'));
                else resolve([...found.values()].sort((a, b) => a.rank - b.rank).map(({ rank, ...lobby }) => lobby));
            };
            const message = Buffer.from(JSON.stringify({ protocol: PROTOCOL, type: 'discover', nonce }));
            const probes = [];
            // Binding a socket to each adapter avoids Windows/VPN default-route selection.
            for (const item of adapters) {
                const socket = dgram.createSocket('udp4'); sockets.add(socket); this.searches.add(socket);
                socket.on('error', error => { lastError = error; this.searches.delete(socket); try { socket.close(); } catch {} });
                socket.on('close', () => { this.searches.delete(socket); sockets.delete(socket); if (!sockets.size) finish(); });
                socket.on('message', (buffer, remote) => {
                    if (!localIP(remote.address) || buffer.length > 2048 || done) return;
                    try {
                        const data = JSON.parse(buffer.toString());
                        if (data.protocol !== PROTOCOL || data.type !== 'lobby' || data.nonce !== nonce || typeof data.id !== 'string') return;
                        const host = endpoint(remote.address + ':' + data.port), rank = interfaceRank(item);
                        const existing = found.get(data.id);
                        if (!existing || rank < existing.rank) found.set(data.id, { rank, id: data.id.slice(0, 40), name: name(data.name), address: host.address + ':' + host.port,
                            players: Math.min(2, Math.max(0, Number(data.players) || 0)), capacity: 2 });
                    } catch {}
                });
                socket.bind(0, item.address, () => {
                    if (done) return;
                    try { socket.setBroadcast(true); } catch (error) { lastError = error; socket.close(); return; }
                    const ip = item.address.split('.').map(Number), mask = item.netmask.split('.').map(Number);
                    const destinations = /^127\./.test(item.address) ? [item.address]
                        : [ip.map((v, i) => v | (255 ^ mask[i])).join('.'), '255.255.255.255', item.address];
                    const probe = () => {
                        if (done || !sockets.has(socket) || !this.searches.has(socket)) return;
                        for (const address of new Set(destinations)) socket.send(message, this.discoveryPort, address, error => { if (error) lastError = error; else sent = true; });
                    };
                    probes.push(probe); probe();
                });
            }
            // Repeat in the same search window to tolerate a dropped UDP packet.
            repeat = setInterval(() => { for (const probe of probes) probe(); }, 350);
            timer = setTimeout(finish, 1200);
        });
    }
    async join(input = {}) {
        if (this.busy || this.connection) throw new Error('Leave your current lobby first.');
        this.busy = true;
        try {
            if (this.server) await this.close();
            const target = endpoint(input.address);
            if (!this.pendingJoin || this.pendingJoin.address !== target.address || this.pendingJoin.port !== target.port) this.pendingJoin = { ...target, id: token() };
            const body = { protocol: PROTOCOL, name: name(input.name), joinId: this.pendingJoin.id };
            let joined;
            try { joined = await request(target, 'join', body); }
            catch (error) { if (!error.retryable) throw error; joined = await request(target, 'join', body); }
            if (!joined || typeof joined.playerId !== 'string' || !/^[a-f0-9]{48}$/.test(joined.token) || !joined.lobby || joined.lobby.protocol !== PROTOCOL) throw new Error('Invalid lobby response. Check that both devices use the updated desktop build.');
            this.connection = { ...target, token: joined.token, playerId: joined.playerId, host: false };
            this.pendingJoin = null;
            return { playerId: joined.playerId, lobby: joined.lobby };
        } finally { this.busy = false; }
    }
    async command(route, data = {}) {
        const c = this.connection; if (!c) throw new Error('Join a lobby first.');
        return c.host ? this._dispatch(route, { ...data, token: c.token }) : request(c, route, { ...data, token: c.token });
    }
    poll() { return this.command('poll'); }
    ready(input) { return this.command('ready', { ready: !!(input && input.ready) }); }
    start() { return this.command('start'); }
    result(input) { return this.command('result', { result: input }); }
    async leave() {
        const publishFinal = this.connection && this.connection.host && this.room && this.room.match;
        try { if (this.connection) await this.command('leave'); } catch {}
        if (publishFinal) {
            this.connection = null;
            // Keep the final snapshot reachable briefly so the other device can see its win.
            this.closeTimer = setTimeout(() => this.close(), 5000); this.closeTimer.unref();
        } else await this.close();
        return true;
    }
    async close() {
        clearTimeout(this.closeTimer); this.closeTimer = null;
        this.connection = null; this.room = null; this.pendingJoin = null; this.discoveryAvailable = false;
        for (const search of this.searches) { try { search.close(); } catch {} }
        if (this.udp) { try { this.udp.close(); } catch {} this.udp = null; }
        const server = this.server; this.server = null;
        if (server) await new Promise(resolve => { server.close(resolve); if (server.closeAllConnections) server.closeAllConnections(); });
    }
}
