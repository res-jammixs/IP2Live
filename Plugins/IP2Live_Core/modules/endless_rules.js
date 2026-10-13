/** Endless balance is kept here so time pressure and rewards can be tuned together. */
(function () {
    'use strict';
    const games = [
        { id: 'ip_class_wires', number: '1', name: 'IP Class Wires', basePoints: 100, hard: false },
        { id: 'ip_patch_panel_classes', number: '2', name: 'IP Patch Panel', basePoints: 120, hard: false },
        { id: 'ip_cidr_binary_panel', number: '3', name: 'CIDR Binary Panel', basePoints: 150, hard: false },
        { id: 'ip_subnet_simulator', number: '4', name: 'Subnet Simulator', basePoints: 220, hard: true },
        { id: 'ip_host_power_reactor', number: '4.5', name: 'Host-Power Reactor', basePoints: 120, hard: false },
        { id: 'ip_cidr_quarantine', number: '5', name: 'Network Re-Segmentation', basePoints: 260, hard: true },
        { id: 'ip_cidr_quarantine_matrix', number: '6', name: 'Subnet Blaster', basePoints: 300, hard: true },
    ];
    const config = { initialSeconds: 180, graceMs: 300000, pressureStepMs: 60000,
        easyReductionSeconds: 15, hardReductionSeconds: 8, minimumSeconds: 1 };
    function random(seed) {
        let n = seed >>> 0;
        return () => { n += 0x6D2B79F5; let x = n; x = Math.imul(x ^ x >>> 15, x | 1);
            x ^= x + Math.imul(x ^ x >>> 7, x | 61); return ((x ^ x >>> 14) >>> 0) / 4294967296; };
    }
    function sequence(seed, cycle = 0) {
        // Shuffle six independent units. The CIDR -> Subnet pair never separates.
        const groups = [[0], [1], [2, 3], [4], [5], [6]], rng = random((seed + Math.imul(cycle + 1, 2654435761)) >>> 0);
        for (let i = groups.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1)); [groups[i], groups[j]] = [groups[j], groups[i]];
        }
        return groups.flat().map(i => games[i]);
    }
    const pressure = elapsedMs => elapsedMs < config.graceMs ? 0 :
        1 + Math.floor((elapsedMs - config.graceMs) / config.pressureStepMs);
    function budget(gameId, elapsedMs) {
        const game = games.find(g => g.id === gameId);
        if (!game) throw new Error('Unknown Endless gameplay.');
        return Math.max(config.minimumSeconds, config.initialSeconds - pressure(elapsedMs) *
            (game.hard ? config.hardReductionSeconds : config.easyReductionSeconds));
    }
    function reward(gameId, metrics, elapsedMs, limitSeconds) {
        const game = games.find(g => g.id === gameId);
        if (!game) throw new Error('Unknown Endless gameplay.');
        const m = metrics || {}, mistakes = Math.max(0, Number(m.mistakeCount) || 0,
            m.totalDecisions > 0 ? m.totalDecisions - m.correctDecisions : 0);
        const remaining = Math.max(0, Math.min(1, 1 - elapsedMs / (limitSeconds * 1000)));
        const speedBonus = Math.round(game.basePoints * remaining);
        const accuracyMultiplier = 1 / (1 + mistakes * 0.25);
        return { points: Math.max(1, Math.round((game.basePoints + speedBonus) * accuracyMultiplier)),
            basePoints: game.basePoints, speedBonus, accuracyMultiplier, mistakes };
    }
    IP2Live.EndlessRules = { VERSION: 'endless-v1', games, config, sequence, pressure, budget, reward };
})();
