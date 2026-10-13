/** Shared, deterministic race rules. Used by the renderer and the LAN host. */
(function () {
    'use strict';
    const games = [
        { id: 'ip_class_wires', number: '1', name: 'IP Class Wires', points: 90, seconds: 40 },
        { id: 'ip_patch_panel_classes', number: '2', name: 'IP Patch Panel', points: 110, seconds: 55 },
        { id: 'ip_cidr_binary_panel', number: '3', name: 'CIDR Binary Panel', points: 130, seconds: 60 },
        { id: 'ip_subnet_simulator', number: '4', name: 'Subnet Simulator', points: 160, seconds: 75 },
        { id: 'ip_host_power_reactor', number: '4.5', name: 'Host-Power Reactor', points: 100, seconds: 40 },
        { id: 'ip_cidr_quarantine', number: '5', name: 'Network Re-Segmentation', points: 220, seconds: 100 },
        { id: 'ip_cidr_quarantine_matrix', number: '6', name: 'Subnet Blaster', points: 240, seconds: 110 },
    ];
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
    function random(seed) {
        let n = Number(seed) >>> 0;
        return () => { n += 0x6D2B79F5; let x = n; x = Math.imul(x ^ x >>> 15, x | 1); x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296; };
    }
    function sequence(seed, cycle) {
        const groups = [[0], [1], [2, 3], [4], [5], [6]], rng = random((seed + Math.imul(cycle + 1, 2654435761)) >>> 0);
        for (let i = groups.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [groups[i], groups[j]] = [groups[j], groups[i]]; }
        return groups.flat().map(index => games[index]);
    }
    function gameAt(seed, index) { return sequence(seed, Math.floor(index / 7))[index % 7]; }
    const PROBLEM_VERSION = 1;
    function problemSeed(seed, index) {
        let value = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
        value = Math.imul(value ^ value >>> 16, 0x85ebca6b);
        value = Math.imul(value ^ value >>> 13, 0xc2b2ae35);
        return (value ^ value >>> 16) >>> 0;
    }
    function problemSeedFor(options) {
        const opts = options || {}, spec = opts.spec || {};
        const seed = opts.pvpProblemSeed === undefined ? spec.pvpProblemSeed : opts.pvpProblemSeed;
        return (opts.pvpMode || spec.pvpMode) && Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed : null;
    }
    // Each logical puzzle/supply stream owns its RNG. Drawing, clocks, player
    // identities and retry counts must never consume or change these draws.
    function problemRandom(options, channel = 'problem') {
        const seed = problemSeedFor(options);
        if (seed === null) return Math.random;
        let salt = 2166136261;
        for (const char of channel) salt = Math.imul(salt ^ char.charCodeAt(0), 16777619);
        return random((seed ^ salt) >>> 0);
    }
    function metrics(input) {
        const m = input || {}, known = Number.isFinite(m.totalDecisions) && m.totalDecisions > 0 && Number.isFinite(m.correctDecisions);
        const total = known ? Math.round(clamp(m.totalDecisions, 1, 10000)) : null;
        const correct = known ? Math.round(clamp(m.correctDecisions, 0, total)) : null;
        const mistakes = Math.max(Math.round(clamp(m.mistakeCount, 0, 10000)), known ? total - correct : 0);
        // A missing decision count is neutral; it must not earn a perfect-accuracy bonus.
        const accuracy = known ? correct / total : (mistakes ? 1 / (mistakes + 1) : 0.75);
        return { totalDecisions: total, correctDecisions: correct, mistakeCount: mistakes, accuracy };
    }
    function reward(gameId, input) {
        const game = games.find(g => g.id === gameId);
        if (!game) throw new Error('Unknown gameplay.');
        const m = metrics(input);
        return Math.max(10, Math.round(game.points * (0.2 + 0.8 * m.accuracy) / (1 + 0.25 * m.mistakeCount)));
    }
    function createMatch(players, seed, now = Date.now()) {
        if (!Array.isArray(players) || players.length !== 2 || players[0].id === players[1].id) throw new Error('A race requires two players.');
        return { version: 3, id: 'race-' + now + '-' + (seed >>> 0), seed: seed >>> 0, target: 1000, bombDamage: 140,
            status: 'countdown', startsAt: now + 3000, winnerId: null, finishReason: null, eventSerial: 0, events: [],
            players: players.map(p => ({ id: p.id, name: String(p.name || 'Pilot').slice(0, 24), progress: 0, streak: 0, attackCharge: 0, wins: 0, mistakes: 0,
                roundIndex: 0, attempt: 0, roundErrors: 0, roundFailures: 0, lastReward: 0, lastResult: null, receipts: [] })) };
    }
    function tick(match, now = Date.now()) { if (match.status === 'countdown' && now >= match.startsAt) match.status = 'racing'; return match; }
    function round(match, player) {
        const p = typeof player === 'string' ? match.players.find(p => p.id === player) : player;
        if (!p) throw new Error('Unknown player.');
        return { id: match.id + ':' + p.roundIndex + ':' + p.attempt, index: p.roundIndex, attempt: p.attempt,
            problemVersion: PROBLEM_VERSION, problemSeed: problemSeed(match.seed, p.roundIndex),
            game: gameAt(match.seed, p.roundIndex), handoffKey: match.id + ':' + p.id + ':' + (gameAt(match.seed, p.roundIndex).number === '4' ? p.roundIndex - 1 : p.roundIndex) };
    }
    function event(match, data) {
        match.events.push(Object.assign({ id: ++match.eventSerial }, data));
        if (match.events.length > 40) match.events.shift();
    }
    function complete(match, playerId, result, now = Date.now()) {
        tick(match, now);
        const p = match.players.find(p => p.id === playerId);
        if (!p || !result || typeof result.roundId !== 'string') throw new Error('Invalid round result.');
        if (p.receipts.includes(result.roundId)) return match; // Retried HTTP requests cannot award points twice.
        if (match.status !== 'racing') throw new Error('The race is not running.');
        const current = round(match, p);
        if (result.roundId !== current.id || result.gameplayId !== current.game.id || typeof result.passed !== 'boolean') throw new Error('This result does not match the current round.');
        const m = metrics(result.metrics), opponent = match.players.find(other => other.id !== p.id);
        p.receipts.push(current.id); if (p.receipts.length > 64) p.receipts.shift();
        const priorErrors = p.roundErrors;
        const combined = { mistakeCount: m.mistakeCount + priorErrors, totalDecisions: m.totalDecisions === null ? null : m.totalDecisions + priorErrors, correctDecisions: m.correctDecisions };
        p.mistakes += m.mistakeCount; p.lastReward = result.passed ? Math.max(10, Math.round(reward(current.game.id, combined) / (1 + 0.2 * p.roundFailures))) : 0;
        p.lastResult = { passed: result.passed, game: current.game.name, points: p.lastReward, mistakes: m.mistakeCount + priorErrors };
        if (result.passed) {
            p.progress = Math.min(match.target, p.progress + p.lastReward); p.wins++; p.streak++; p.attackCharge++; p.roundIndex++; p.attempt = 0; p.roundErrors = 0; p.roundFailures = 0;
            event(match, { type: 'charge', playerId: p.id, points: p.lastReward });
            if (p.attackCharge >= 3) {
                p.attackCharge = 0;
                const damage = Math.min(match.bombDamage, opponent.progress); opponent.progress -= damage;
                event(match, { type: 'bomb', from: p.id, to: opponent.id, damage });
            }
            if (p.progress >= match.target) { match.status = 'finished'; match.winnerId = p.id; match.finishReason = 'engine-powered'; }
        } else { p.streak = 0; p.attackCharge = Math.max(0, p.attackCharge - 1); p.attempt++; p.roundErrors += m.mistakeCount; p.roundFailures++; event(match, { type: 'retry', playerId: p.id }); }
        return match;
    }
    function forfeit(match, playerId) {
        if (match.status === 'finished') return match;
        if (!match.players.some(p => p.id === playerId)) throw new Error('Unknown player.');
        const other = match.players.find(p => p.id !== playerId);
        if (!other) throw new Error('Unknown player.');
        match.status = 'finished'; match.winnerId = other.id; match.finishReason = 'opponent-left'; return match;
    }
    function snapshot(match) {
        return Object.assign({}, match, { players: match.players.map(p => { const { receipts, ...publicPlayer } = p; return Object.assign(publicPlayer, { round: round(match, p) }); }), events: match.events.slice() });
    }
    const rules = { games, random, sequence, gameAt, PROBLEM_VERSION, problemSeed, problemSeedFor, problemRandom, metrics, reward, createMatch, tick, round, complete, forfeit, snapshot };
    if (typeof module !== 'undefined' && module.exports) module.exports = rules;
    if (typeof IP2Live !== 'undefined') IP2Live.PVPRules = rules;
})();
