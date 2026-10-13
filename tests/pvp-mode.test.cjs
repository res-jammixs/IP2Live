const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../Plugins/IP2Live_Core');
const files = {
    ip_class_wires: 'gameplay1/IPWires/ip_wires_gameplay.js',
    ip_patch_panel_classes: 'gameplay2/IPPatchPanel/ip_patchpanel_gameplay.js',
    ip_cidr_binary_panel: 'gameplay3/CIDRPanel/ip_cidrpanel_gameplay.js',
    ip_subnet_simulator: 'gameplay4/SubnetSimulator/ip_subnetsim_gameplay.js',
    ip_host_power_reactor: 'gameplay4_5/HostPowerReactor/ip_host_power_gameplay.js',
    ip_cidr_quarantine: 'gameplay5/CIDRQuarantine/ip_cidr_quarantine_gameplay.js',
    ip_cidr_quarantine_matrix: 'gameplay6/CIDRQuarantineMatrix/ip_cidr_quarantine_matrix_gameplay.js',
};
function harness(realScreens = false, settings = {}) {
    let now = settings.now || 100000;
    const frames = [{ menu: true }], texts = [], calls = [], musicCalls = [], telemetryRows = [];
    const canvas = { width: 1920, height: 1080, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 }) };
    const makeContext = canvas => new Proxy({ canvas, measureText: text => ({ width: text.length * 8 }), fillText: text => texts.push(text),
        createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) }, { get: (o, key) => key in o ? o[key] : () => {} });
    const ctx = makeContext(canvas);
    const gameMath = Object.create(Math); gameMath.random = settings.random || Math.random;
    const context = vm.createContext({ console: { log() {}, warn() {} }, setTimeout, clearTimeout, Math: gameMath, Date: { now: () => now }, window: {},
        localStorage: { getItem: () => null, setItem() {} },
        document: { createElement(tag) { assert.equal(tag, 'canvas'); const c = { width: 1280, height: 720 }; c.getContext = () => makeContext(c); return c; } },
        Common: { Platform: { ctx }, ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720, CANVAS_WIDTH: 1280, CANVAS_HEIGHT: 720, getScreenX: x => x, getScreenY: y => y } },
        Core: { Game: { current: { currentMapID: 18, ip2liveGameStates: { saved: 'story' } } } },
        Data: { Systems: {}, Keyboards: { checkCancelMenu: k => k === 'Escape', checkActionMenu: k => k === 'Enter' } }, Graphic: {}, Model: {}, Main: {}, THREE: {},
        Scene: { Base: class { constructor(initialize) { if (settings.initializeEarly && initialize && this.initialize) this.initialize(); } }, Map: { current: { id: 18 } } },
        Manager: { Stack: { get top() { return frames.at(-1); }, push: s => frames.push(s), pop: () => {
            const scene = frames.pop(); if (settings.closeOnPop && scene && scene.close) scene.close(); return scene;
        }, replace: s => { frames.pop(); frames.push(s); } } },
        IP2Live: {
            QuestManager: { activeQuestId: 'story', activeObjectiveId: 'objective', completedObjectives: { untouched: true } },
            QuestMinimap: { destroy() {}, create() {}, update() {}, isActive: () => false },
            MusicManager: {
                play: zone => musicCalls.push({zone}), playGameplay: gameplayId => musicCalls.push({gameplayId}),
                restoreContext: () => musicCalls.push({context: 'race'}),
                ZONE: { MAIN_MENU: 'menu', PVP_MENU: 'pvp-menu', PVP_RACE: 'pvp-race', GAMEPLAY_1: 'game', GAMEPLAY_2: 'game', GAMEPLAY_56: 'game' },
            },
            NeuralLifeForce: { isRunOver: () => true }, DialogueManager: { resetTransitionState() {}, isActive: () => false },
            GameplayPause: { activeScreen: { story: true }, clearSession() {} },
        },
        RaceScreenStub: class {
            constructor(options) { this.options = options; this.scenario = options.scenario; }
            drawHUD() { calls.push({ type: 'draw', width: context.Common.Platform.ctx.canvas.width }); }
            update() { calls.push({ type: 'update' }); }
            onMouseDown(x, y) { calls.push({ type: 'mouse', x, y, width: context.Common.Platform.ctx.canvas.width }); }
            onKeyPressed(key) { calls.push({ type: 'key', key }); }
        },
    });
    const load = (file, transform = s => s) => vm.runInContext(transform(fs.readFileSync(path.join(root, file), 'utf8')), context, { filename: file });
    load('modules/tutorial_replay.js'); load('modules/game_manager.js'); load('modules/pvp_rules.js'); load('modules/certificate_pdf.js'); load('modules/pvp_certificate.js'); load('modules/pvp_mode.js'); load('modules/screens/pvp.js');
    if (settings.telemetry) {
        context.Core.Game.current.infiltratorName = 'Learner'; context.Core.Game.current.profileId = 'learner-id';
        context.IP2Live.ReportManager = { logTelemetryRecord: async row => { telemetryRows.push(row); return true; } };
        load('modules/feature_telemetry.js');
    }
    const gm = context.IP2Live.GameManager, mode = context.IP2Live.PVPMode, rules = context.IP2Live.PVPRules;
    gm._logTelemetryEvent = () => assert.fail('PVP wrote campaign telemetry');
    gm._openReportAttempt = () => assert.fail('PVP wrote an assessed campaign attempt');
    gm._ensureQuestMinimap = () => assert.fail('PVP restored campaign HUD between rounds');
    load('gameplay/common/ip_class_ranges.js'); load('gameplay/common/ip_cidr_tools.js'); load('gameplay/gameplay1/IPWires/ip_wires_core.js');
    for (const id of Object.keys(files)) {
        load('gameplay/' + files[id], s => realScreens ? s : s.replace(/new IP2Live\w+(?:Gameplay|Connector)Screen\(/g, 'new RaceScreenStub('));
        const owner = context.IP2Live[gm.flowConfig.gameplayNodes[id].manager];
        if (!realScreens && owner._freshProblem) owner._freshProblem = () => ({});
    }
    function startAt(id, playerId = 'local') {
        const seed = Array.from({ length: 100 }, (_, i) => i + 1).find(seed => rules.gameAt(seed, 0).id === id);
        assert.ok(seed, 'test seed for ' + id);
        const match = rules.createMatch([{ id: 'local', name: 'Pilot' }, { id: 'ai', name: 'Circuit' }], seed, now - 3001); rules.tick(match, now);
        mode.aiMatch = match; mode.aiRandom = () => 0.5; mode.nextAiAt = Infinity;
        mode.start({ match: rules.snapshot(match) }, playerId, frames[0], true); mode.tick();
        return frames.at(-1);
    }
    return { context, load, gm, mode, rules, frames, texts, calls, musicCalls, telemetryRows, ctx, startAt, advance(ms) { now += ms; const top = frames.at(-1); if (top.update) top.update(); }, now: () => now };
}

async function main() {
    const plain = value => JSON.parse(JSON.stringify(value));
    {
        const h = harness(false, { telemetry: true });
        h.startAt('ip_class_wires');
        const replay = h.context.IP2Live.TutorialReplay.session;
        const simulated = h.rules.round(h.mode.aiMatch, 'ai');
        h.mode._aiResult(simulated);
        assert.equal(h.telemetryRows.filter(row => row.eventType === 'feature_round_end').length, 0, 'simulated AI performance is never learner telemetry');
        h.gm.handleGameplayCompleted('ip_class_wires', Object.assign({}, replay.options, {
            result: { correctDecisions: 8, totalDecisions: 10, activeElapsedMs: 12000, durationMethod: 'active-test-v1' },
        }));
        await h.mode.leave(); await h.gm.flushTelemetryWrites();
        const ends = h.telemetryRows.filter(row => row.eventType === 'feature_round_end');
        assert.equal(ends.length, 1); assert.equal(ends[0].accuracy, .8);
        assert.equal(ends[0].activeDurationMs, 12000); assert.equal(ends[0].payload.featureMode, 'pvp_ai');
        assert.ok(h.telemetryRows.every(row => row.profileId === 'learner-id'));
        assert.equal(h.telemetryRows.filter(row => row.eventType === 'feature_session_start').length, 1);
        assert.equal(h.telemetryRows.filter(row => row.eventType === 'feature_session_end').length, 1);
    }
    {
        const h = harness();
        const expected = [
            ['ip_class_wires', 0.80, 14, 22], ['ip_patch_panel_classes', 0.80, 20, 30],
            ['ip_cidr_binary_panel', 0.80, 22, 34], ['ip_subnet_simulator', 0.80, 30, 44],
            ['ip_host_power_reactor', 0.80, 15, 24], ['ip_cidr_quarantine', 0.75, 65, 90],
            ['ip_cidr_quarantine_matrix', 0.72, 80, 105],
        ];
        for (const [id, chance, min, max] of expected) {
            const match = h.rules.createMatch([{ id: 'local' }, { id: 'ai' }], 31, h.now());
            match.players[1].roundIndex = h.rules.sequence(31, 0).findIndex(g => g.id === id);
            h.mode.aiMatch = match; h.mode.aiRandom = h.rules.random(49201);
            const round = h.rules.round(match, 'ai');
            let passed = 0, flawless = 0;
            for (let i = 0; i < 6000; i++) {
                h.mode._scheduleAI(h.now());
                const elapsed = (h.mode.nextAiAt - h.now()) / 1000;
                assert.ok(elapsed >= min && elapsed <= max, id + ': thinking time stays in its gameplay range');
                const result = h.mode._aiResult(round), m = result.metrics;
                assert.equal(result.roundId, round.id); assert.equal(result.gameplayId, id);
                assert.equal(m.correctDecisions + m.mistakeCount, m.totalDecisions);
                assert.ok(m.correctDecisions >= 0);
                if (result.passed) { passed++; if (!m.mistakeCount) flawless++; }
                else assert.ok(m.mistakeCount >= 2, 'failed attempts must not report perfect accuracy');
            }
            assert.ok(Math.abs(passed / 6000 - chance) < 0.02, id + ': completion rate matches the requested ability');
            assert.ok(flawless / passed > (chance === 0.8 ? 0.60 : 0.30), 'successful solves can earn strong accuracy rewards');
            // Retries retain a real thinking-time floor, especially for 5 and 6.
            match.players[1].attempt = 3; h.mode.aiRandom = () => 0;
            h.mode._scheduleAI(h.now()); assert.equal(h.mode.nextAiAt - h.now(), min * 1000);
        }
        const samples = progress => {
            h.mode.aiMatch.players[0].progress = progress; h.mode.aiRandom = h.rules.random(74);
            return Array.from({ length: 12 }, () => {
                h.mode._scheduleAI(h.now());
                return [h.mode.nextAiAt, plain(h.mode._aiResult(h.rules.round(h.mode.aiMatch, 'ai')))];
            });
        };
        assert.deepEqual(samples(0), samples(999), 'the AI does not rubber-band based on the human score');
    }
    {
        const seed = 1, h = harness(false, { random: () => (seed + 0.5) / 0xffffffff });
        assert.equal(h.mode.startAI(h.frames[0], 'Pilot'), true);
        const match = h.mode.aiMatch, ai = match.players[1];
        const first = h.rules.round(match, 'ai'), profile = h.mode.AI_PROFILES[first.game.id];
        assert.ok(h.mode.nextAiAt >= match.startsAt + profile.minSeconds * 1000, 'first solve includes the full intro and thinking time');
        assert.equal(h.mode.startAI(h.frames[0], 'Duplicate'), false); assert.equal(h.mode.aiMatch, match);
        h.advance(2999); assert.equal(ai.wins, 0); assert.equal(match.status, 'countdown');
        h.advance(1); assert.equal(match.status, 'racing'); assert.equal(ai.wins, 0);
        h.advance(h.mode.nextAiAt - h.now() - 1); assert.equal(ai.attempt, 0);
        h.mode.aiRandom = () => 0.99; h.advance(1);
        assert.equal(ai.attempt, 1); assert.equal(ai.progress, 0); assert.equal(ai.lastReward, 0);
        assert.equal(h.rules.round(match, 'ai').problemSeed, first.problemSeed, 'failure retries the identical problem');
        assert.ok(h.mode.nextAiAt >= h.now() + profile.minSeconds * 1000);
        h.mode.aiRandom = () => 0; match.players[0].progress = 200;
        h.mode.setLeaveConfirmation(true);
        for (let i = 0; i < 3; i++) h.advance(h.mode.nextAiAt - h.now());
        assert.equal(ai.wins, 3, 'AI keeps solving while the leave confirmation is open');
        assert.equal(ai.attempt, 0); assert.equal(ai.attackCharge, 0);
        assert.equal(match.players[0].progress, 60, 'AI wins launch bombs through the shared rules');
        assert.equal(ai.receipts.length, 4); h.mode.tick(); assert.equal(ai.receipts.length, 4, 'same-tick updates cannot duplicate a reward');
        h.advance(300000); assert.equal(ai.receipts.length, 5, 'a late update processes only one attempt');
        assert.ok(h.mode.nextAiAt > h.now());
        match.target = ai.progress + 1; h.advance(h.mode.nextAiAt - h.now());
        assert.equal(match.status, 'finished'); assert.equal(match.winnerId, 'ai'); assert.equal(h.mode.nextAiAt, Infinity);
        await h.mode.leave();
    }
    const problem = (id, screen) => plain(id === 'ip_class_wires' ? { left: screen.leftItems, right: screen.rightItems }
        : id === 'ip_patch_panel_classes' ? screen.roundPackets
        : id === 'ip_cidr_binary_panel' ? { mask: screen.targetMask, cidr: screen.targetCIDR, ipClass: screen.targetClass }
        : id === 'ip_subnet_simulator' ? { mask: screen.cidrState.mask, answers: screen.answers, balls: screen.balls }
        : id === 'ip_host_power_reactor' ? screen.scenario
        : id === 'ip_cidr_quarantine_matrix' ? { given: screen.problem, waves: screen.waves, classes: screen.classOrder }
        : screen.problem);
    for (const id of Object.keys(files).filter(id => id !== 'ip_subnet_simulator')) {
        // Separate renderer contexts represent devices with different clocks,
        // native random draws, player identities and rendering histories.
        const a = harness(true, { now: 100000, random: () => 0.01, initializeEarly: true });
        const b = harness(true, { now: 900000, random: () => 0.99, initializeEarly: true });
        b.context.IP2Live.CIDRQuarantineGameplayScreen._classBag = ['C'];
        let first = a.startAt(id, 'local'), second = b.startAt(id, 'ai');
        assert.equal(a.mode.round.problemSeed, b.mode.round.problemSeed);
        const expected = problem(id, first);
        assert.deepEqual(problem(id, second), expected, id + ': both players receive identical problem data');
        first.drawHUD(); first.drawHUD(); a.advance(71);
        if (id === 'ip_patch_panel_classes') {
            first._resetRound();
            assert.deepEqual(problem(id, first), expected, 'packet restarts retain the shared packet order');
        }
        if (id === 'ip_cidr_binary_panel') {
            first._configure();
            assert.deepEqual(problem(id, first), expected, 'prior mask history cannot change the shared mask');
            for (const [h, screen] of [[a, first], [b, second]]) {
                screen._saveCIDRState('/' + screen.targetCIDR);
                const replay = h.context.IP2Live.TutorialReplay.session;
                h.context.IP2Live.TutorialReplay.finish(id, replay.options, 'completed', { totalDecisions: 8, correctDecisions: 8 });
                h.advance(2000);
            }
            first = a.context.IP2Live.TutorialReplay.session.screen;
            second = b.context.IP2Live.TutorialReplay.session.screen;
            assert.deepEqual(problem('ip_subnet_simulator', first), problem('ip_subnet_simulator', second), '3 → 4 shares the same mask, answers and starting supplies');
            assert.notEqual(first.options.handoffKey, second.options.handoffKey, 'player handoffs remain isolated');
        } else if (id === 'ip_cidr_quarantine') {
            first._submitSegmentation(first.problem.ipClass === 'A' ? 'B' : 'A');
            assert.equal(first.classMistakes, 1);
            assert.deepEqual(problem(id, first), expected, 'a wrong class cannot reroll a race problem');
        } else if (id === 'ip_cidr_quarantine_matrix') {
            first.weapon = { operator: 'wrong', blockSize: -1 }; first._setPhase('boss');
            for (let i = 0; i < 5; i++) first._hitBoss();
            first._takeBossAttack(); first._newEncounter();
            assert.equal(first.hearts, 2);
            assert.deepEqual(problem(id, first), expected, 'a boss counterattack retries the same subquestion and choices');
            for (let hit = 1; hit < 3; hit++) {
                for (const screen of [first, second]) { screen.bossHP = 3 - hit; screen._newEncounter(); }
                assert.deepEqual(problem(id, first), problem(id, second), 'boss subquestion ' + (hit + 1) + ' stays identical despite mistakes');
            }
        }
        const currentId = a.context.IP2Live.TutorialReplay.session.gameplayId;
        const retryExpected = problem(currentId, first), replay = a.context.IP2Live.TutorialReplay.session;
        const source = plain(replay.options.tutorialSource), seed = a.mode.round.problemSeed;
        a.context.IP2Live.TutorialReplay.finish(currentId, replay.options, 'failed', { mistakeCount: 1 });
        a.advance(2000);
        const retry = a.context.IP2Live.TutorialReplay.session;
        assert.equal(a.mode.round.problemSeed, seed);
        assert.deepEqual(plain(retry.options.tutorialSource), source, 'a retry keeps the same quest specification');
        const retryScreen = retry.screen;
        // A full Gameplay 6 retry starts its shared three-question set again.
        assert.deepEqual(problem(currentId, retryScreen), id === 'ip_cidr_quarantine_matrix' ? expected : retryExpected,
            id + ': a game over cannot replace the shared question');
        assert.equal(b.mode.me.roundIndex, id === 'ip_cidr_binary_panel' ? 1 : 0, 'one player retrying does not advance the opponent');
        await a.mode.leave(); await b.mode.leave();
    }
    {
        const h = harness(), menu = new h.context.IP2Live.PVPMenu(); menu.initialize(); h.frames.push(menu); menu.drawHUD();
        for (const label of ['PVP ARENA', 'CREATE LOBBY', 'JOIN LOBBY', 'VS AI', 'GO THROUGH TUTORIALS']) assert.ok(h.texts.includes(label));
        assert.equal(menu._buttons().filter(b => b.id === 'tutorials').length, 1, 'home retains one tutorial action below the race choices');
        menu.onMouseMove(959, 624); h.advance(100);
        assert.ok(menu.cardMotion[1] > 0 && menu.cardMotion[1] < 1, 'the hovered panel eases into its lifted state');
        assert.equal(menu.cardMotion[0], 0); const lifted = menu.cardMotion[1];
        menu.onMouseMove(10, 10); h.advance(100);
        assert.ok(menu.cardMotion[1] < lifted, 'moving off the panel eases it back');
        let chosen; menu._activate = id => { chosen = id; }; menu.onMouseUp(1540, 624);
        assert.equal(chosen, 'ai', 'the revised card layout remains clickable');
        menu.onMouseUp(960, 939); assert.equal(chosen, 'tutorials', 'the centered tutorial button is clickable at the scaled viewport');
    }
    {
        const h = harness(), inputs = [], makeElement = h.context.document.createElement;
        h.context.document.body = { appendChild: input => inputs.push(input) };
        h.context.document.createElement = tag => {
            if (tag !== 'input') return makeElement(tag);
            return { style: {}, events: {}, attributes: {}, setAttribute(k, v) { this.attributes[k] = v; },
                addEventListener(k, fn) { this.events[k] = fn; }, blur() { this.events.blur(); }, remove() { this.removed = true; } };
        };
        let bounds = { left: 24, top: 36, width: 960, height: 540 };
        h.ctx.canvas.getBoundingClientRect = () => bounds;
        const menu = new h.context.IP2Live.PVPMenu(); menu.initialize(); h.frames.push(menu); menu.drawHUD();
        const input = inputs[0]; assert.equal(input.attributes['aria-label'], 'Pilot name');
        assert.match(input.style.fontFamily, /Oxanium/); assert.equal(input.style.background, 'transparent');
        assert.equal(Number(input.style.opacity), 0, 'the DOM text fades in together with its canvas frame');
        h.advance(400); menu.drawHUD(); assert.equal(Number(input.style.opacity), 1);
        for (const size of [[960, 540], [1920, 1080]]) {
            bounds = { ...bounds, width: size[0], height: size[1] }; menu.drawHUD();
            const scale = bounds.width / 1280, left = parseFloat(input.style.left), top = parseFloat(input.style.top);
            assert.ok(left > bounds.left + 440 * scale && left + parseFloat(input.style.width) < bounds.left + 840 * scale, 'editable text fits inside the name bezel after resize');
            assert.ok(top > bounds.top + 158 * scale && top + parseFloat(input.style.height) < bounds.top + 204 * scale);
        }
        assert.equal(inputs.length, 1, 'redrawing and resizing reuse the name field');
        input.events.focus(); assert.equal(menu.focusedInput, 'pilot');
        input.value = '  Nyx Ω  '; input.events.input();
        let stopped = false; input.events.keydown({ key: 'Enter', stopPropagation() { stopped = true; } });
        assert.ok(stopped); assert.equal(menu.focusedInput, null, 'typing does not trigger the selected menu action');
        menu._hideInputs(); assert.equal(menu.pilot, 'Nyx Ω'); assert.ok(input.removed); assert.equal(Object.keys(menu.inputs).length, 0);
        h.context.IP2Live.MenuTransition = { active: {} };
        menu.drawHUD();
        assert.equal(Object.keys(menu.inputs).length, 0, 'the transition uses canvas text so no DOM field floats above it');
        h.context.IP2Live.MenuTransition.active = null; menu.drawHUD();
        assert.equal(menu.inputs.pilot.value, 'Nyx Ω', 'the editable name returns unchanged after the transition');
    }
    {
        const h = harness();
        const match = h.rules.createMatch([{ id: 'local', name: 'Hood One' }, { id: 'ai', name: 'Hood Two' }], 1, h.now());
        h.mode.aiMatch = match; h.mode.nextAiAt = Infinity;
        h.mode.start({ match: h.rules.snapshot(match) }, 'local', h.frames[0], true); h.mode.tick();
        const intro = h.mode.scene, ui = h.context.IP2Live.PVPUI, fades = [], fade = ui.fade;
        ui.fade = function (ctx, opacity) { fades.push(opacity); fade.call(this, ctx, opacity); };
        intro.drawHUD(); assert.equal(fades.at(-1), 1, 'the versus entrance starts from a dark frame');
        for (const label of ['PVP', 'PLAYER 1', 'PLAYER 2', 'Hood One', 'Hood Two']) assert.ok(h.texts.includes(label));
        assert.equal(h.context.IP2Live.TutorialReplay.session, null, 'the intro precedes gameplay');
        intro.onMouseUp(1728, 1000); assert.equal(h.mode.confirmLeave, false, 'hidden score-panel controls cannot be clicked during the intro');
        intro.onKeyPressed('Escape'); assert.equal(h.mode.confirmLeave, true);
        intro.onKeyPressed('Escape'); assert.equal(h.mode.confirmLeave, false);
        h.advance(210); intro.drawHUD(); assert.ok(fades.at(-1) > 0.4 && fades.at(-1) < 0.6, 'the versus screen gradually appears');
        h.advance(700); intro.drawHUD(); assert.equal(fades.at(-1), 0, 'portraits and names remain fully visible in the middle of the countdown');
        h.advance(1990); intro.drawHUD(); assert.ok(fades.at(-1) > 0.85, 'the versus screen fades out before gameplay');
        assert.equal(h.frames.at(-1), intro, 'both players wait for the synchronized start');
        h.advance(101); assert.notEqual(h.frames.at(-1), intro); assert.ok(h.context.IP2Live.TutorialReplay.session);
        assert.equal(h.mode.gameplayRevealAt, null, 'launching preserves the synchronized start without consuming the visual reveal');
        h.advance(600); h.frames.at(-1).drawHUD();
        h.texts.length = 0; h.context.IP2Live.PVPUI.race(h.ctx, h.mode);
        assert.ok(h.texts.includes('0 / 3 ATTACK')); assert.ok(!h.texts.some(t => /%/.test(t)), 'liquid tubes have no percentage labels');
        assert.equal(fades.at(-1), 1, 'even a late first gameplay frame continues from the dark transition');
        h.advance(210); ui.race(h.ctx, h.mode); assert.ok(fades.at(-1) > 0.4 && fades.at(-1) < 0.6);
        h.advance(210); ui.race(h.ctx, h.mode); assert.equal(fades.at(-1), 0, 'gameplay becomes fully visible without delaying its launch');
        await h.mode.leave();
    }
    {
        const h = harness(), screen = h.startAt('ip_class_wires');
        screen.drawHUD();
        const replay = h.context.IP2Live.TutorialReplay.session;
        h.context.IP2Live.TutorialReplay.finish(replay.gameplayId, replay.options, 'completed', { totalDecisions: 10, correctDecisions: 10 });
        const outgoing = h.mode.transitionFrame;
        assert.ok(outgoing, 'the last rendered puzzle is retained for closing');
        h.texts.length = 0; h.mode.scene.drawHUD();
        assert.ok(!h.texts.some(t => /NEXT CIRCUIT|TRANSMITTING RESULT|Preparing the next/i.test(t)), 'round changes have no intermission screen or text');
        h.advance(219); assert.equal(h.frames.at(-1), h.mode.scene, 'the outgoing puzzle closes before switching');
        h.advance(1); const next = h.frames.at(-1);
        assert.notEqual(next, h.mode.scene, 'the next puzzle launches after 220ms instead of 1.8 seconds');
        assert.equal(h.mode.gameplayRevealAt, null, 'slow first paints keep the shutters closed');
        const before = h.calls.length; next.onMouseDown(768, 540); assert.equal(h.calls.length, before, 'hidden puzzle input is blocked');
        next.drawHUD(); assert.equal(h.mode.isRoundTransitioning(), true);
        h.advance(260); assert.equal(h.mode.isRoundTransitioning(), false);
        next.onMouseDown(768, 540); assert.equal(h.calls.at(-1).type, 'mouse');
        assert.equal(h.mode.transitionFrame, outgoing, 'the outgoing frame remains separate from the new gameplay surface');
        await h.mode.leave(); assert.equal(h.mode.transitionFrame, null, 'leaving releases the retained frame');
    }
    {
        const h = harness(), screen = h.startAt('ip_class_wires'); screen.drawHUD();
        let accept, submitted;
        h.mode.ai = false; h.mode.nextPollAt = Infinity;
        h.mode.bridge = () => ({ result: payload => { submitted = payload; return new Promise(resolve => { accept = resolve; }); }, leave: async () => {} });
        const replay = h.context.IP2Live.TutorialReplay.session;
        h.context.IP2Live.TutorialReplay.finish(replay.gameplayId, replay.options, 'completed', { totalDecisions: 10, correctDecisions: 10 });
        h.advance(1500); h.mode.scene.drawHUD();
        assert.equal(h.frames.at(-1), h.mode.scene, 'a delayed LAN response keeps the transition closed');
        assert.ok(h.mode.pending); assert.equal(h.mode.round, null, 'no unacknowledged puzzle can launch');
        h.rules.complete(h.mode.aiMatch, 'local', submitted, h.now());
        accept({ match: h.rules.snapshot(h.mode.aiMatch) });
        for (let i = 0; i < 8; i++) await Promise.resolve();
        h.advance(1); assert.ok(h.context.IP2Live.TutorialReplay.session, 'the next puzzle opens immediately after acknowledgement: ' + h.mode.error);
        assert.equal(h.mode.pending, null);
        await h.mode.leave();
    }
    for (const id of Object.keys(files).filter(id => id !== 'ip_subnet_simulator')) {
        const h = harness(true), screen = h.startAt(id);
        assert.ok(screen); assert.equal(h.context.IP2Live.TutorialReplay.session.gameplayId, id);
        assert.ok(h.musicCalls.some(call => call.gameplayId === id), id + ' selects its own gameplay music profile');
        assert.equal(!!screen.tutorialMode, false); assert.equal(!!screen.guidedTutorial, false);
        assert.notEqual(screen.maxAttempts, Infinity, id + ' has normal attempt limits');
        screen.drawHUD(); assert.equal(h.context.Common.Platform.ctx, h.ctx);
        if (id === 'ip_cidr_binary_panel') {
            screen._saveCIDRState('/' + screen.targetCIDR);
            const expected = screen.targetMask, replay = h.context.IP2Live.TutorialReplay.session;
            h.context.IP2Live.TutorialReplay.finish(id, replay.options, 'completed', { totalDecisions: 8, correctDecisions: 8 });
            h.advance(2000); const simulator = h.context.IP2Live.TutorialReplay.session.screen;
            assert.equal(h.context.IP2Live.TutorialReplay.session.gameplayId, 'ip_subnet_simulator');
            assert.equal(simulator.cidrState.mask, expected); simulator.drawHUD();
        }
        await h.mode.leave();
        assert.equal(h.musicCalls.at(-1).zone, 'pvp-menu', 'leaving a race restores the PVP lobby profile');
    }
    for (const id of Object.keys(files).filter(id => id !== 'ip_subnet_simulator')) {
        const h = harness(), originalGame = h.context.Core.Game.current, originalPush = h.context.Manager.Stack.push;
        const originalCidr = { latest: { mask: '255.255.255.0', story: true } }; h.context.IP2Live.CIDRGameplayState = originalCidr;
        const screen = h.startAt(id), replay = h.context.IP2Live.TutorialReplay.session;
        assert.equal(replay.gameplayId, id); assert.equal(screen.options.pvpMode, true);
        assert.equal(screen.options.practiceMode, false); assert.equal(!!screen.options.guidedTutorial, false, 'competitive rounds do not start guided tutorials');
        assert.equal(replay.options.tutorialMode, false); assert.equal(replay.options.enforceAttemptLimit, true); assert.equal(replay.options.maxAttempts, 3);
        assert.equal(h.context.Core.Game.current, null); assert.equal(h.gm.isStorySaveExcluded(originalGame), true);
        screen.drawHUD(); assert.equal(h.calls.at(-1).width, 1280); assert.equal(h.context.Common.Platform.ctx, h.ctx);
        screen.onMouseDown(768, 540); const pointer = h.calls.at(-1); assert.equal(pointer.type, 'mouse'); assert.equal(pointer.x, 640); assert.equal(pointer.y, 360);
        const length = h.calls.length; screen.onMouseDown(1750, 540); assert.equal(h.calls.length, length, 'meter clicks do not enter the puzzle');
        h.context.IP2Live.TutorialReplay.finish(id, replay.options, 'completed', { totalDecisions: 10, correctDecisions: 8, mistakeCount: 2, telemetrySchemaVersion: 2 });
        assert.ok(h.mode.me.progress > 0); assert.equal(h.mode.me.mistakes, 2); assert.equal(h.frames.at(-1), h.mode.scene);
        assert.ok(h.texts.includes('ENGINE RACE')); assert.ok(h.texts.includes('3 WINS → BOMB / −140'));
        await h.mode.leave(); assert.equal(h.context.Core.Game.current, originalGame); assert.equal(h.context.Manager.Stack.push, originalPush);
        assert.equal(JSON.stringify(h.context.IP2Live.CIDRGameplayState), JSON.stringify(originalCidr)); assert.equal(h.frames.length, 1);
    }
    {
        const h = harness(true); h.context.Math = Object.create(Math); h.context.Math.random = () => 0.999;
        const binary = h.startAt('ip_cidr_binary_panel'); binary._saveCIDRState('/' + binary.targetCIDR);
        const replay = h.context.IP2Live.TutorialReplay.session;
        h.context.IP2Live.TutorialReplay.finish(replay.gameplayId, replay.options, 'completed', { totalDecisions: 8, correctDecisions: 8 });
        h.advance(2000);
        const simulator = h.context.IP2Live.TutorialReplay.session.screen;
        const bounds = h.mode._virtual(simulator._metrics, simulator, []);
        const contained = ball => {
            assert.ok(ball.x - ball.r >= bounds.arenaX && ball.x + ball.r <= bounds.arenaX + bounds.arenaW, 'node fits the PVP playfield horizontally');
            assert.ok(ball.y - ball.r >= bounds.arenaY && ball.y + ball.r <= bounds.arenaY + bounds.arenaH, 'node fits the PVP playfield vertically');
        };
        simulator.balls.forEach(contained);
        // Exercise the actual merge/duplicate/release paths at the field edges.
        const run = (method, ...args) => h.mode._virtual(simulator[method], simulator, args);
        const pair = simulator.balls.filter(b => !b.minus && !b.duplicate).slice(0, 2);
        for (const ball of pair) { ball.value = 64; ball.x = bounds.arenaX + bounds.arenaW - 1; ball.y = bounds.arenaY + bounds.arenaH - 1; }
        run('_mergeBalls', ...pair);
        const merged = simulator.balls.find(b => b.value === 128);
        assert.ok(merged); contained(merged);
        assert.ok(merged.y + merged.r * 1.23 <= bounds.arenaY + bounds.arenaH, 'merged nodes leave space for their pulsing outline');
        const duplicate = simulator._duplicateBall();
        run('_applyDuplicate', merged, duplicate);
        const copied = simulator.balls.find(b => b.value === 128 && b.id !== merged.id);
        assert.ok(copied); contained(copied);
        assert.ok(copied.x + copied.r * 1.23 <= bounds.arenaX + bounds.arenaW, 'duplicated nodes include their visible ring in the bounds');
        for (const point of [[-200, -200], [5000, 5000]]) {
            const released = run('_clampPointToArena', ...point, 42); contained({ ...released, r: 42 });
        }
        simulator.balls.forEach(contained);
        await h.mode.leave();
    }
    {
        const h = harness(); h.startAt('ip_cidr_binary_panel'); const replay = h.context.IP2Live.TutorialReplay.session;
        const key = replay.options.handoffKey;
        h.context.IP2Live.CIDRGameplayState = { latest: { handoffKey: key, mask: '255.255.255.224', cidr: 27 }, handoffs: { [key]: { handoffKey: key, mask: '255.255.255.224', cidr: 27 } } };
        h.context.IP2Live.TutorialReplay.finish(replay.gameplayId, replay.options, 'completed', { totalDecisions: 8, correctDecisions: 8 });
        h.advance(2000); const next = h.context.IP2Live.TutorialReplay.session;
        assert.equal(next.gameplayId, 'ip_subnet_simulator'); assert.equal(next.options.handoffKey, key);
        assert.equal(h.context.IP2Live.CIDRGameplayState.latest.mask, '255.255.255.224');
        h.context.IP2Live.TutorialReplay.finish(next.gameplayId, next.options, 'failed', { slotStats: { totalChecks: 5, wrongChecks: 3 } });
        const charge = h.mode.me.progress; h.advance(2000);
        assert.equal(h.mode.me.progress, charge); assert.equal(h.mode.me.streak, 0);
        assert.equal(h.context.IP2Live.TutorialReplay.session.gameplayId, 'ip_subnet_simulator');
        assert.equal(h.context.IP2Live.CIDRGameplayState.latest.mask, '255.255.255.224');
        await h.mode.leave();
    }
    {
        const h = harness(false, { closeOnPop: true }), original = h.context.Core.Game.current;
        h.frames[0].drawHUD = () => h.texts.push('PVP MENU');
        const screen = h.startAt('ip_class_wires'); screen.drawHUD();
        screen.onKeyPressed('Escape'); assert.equal(h.mode.leavePopup.selected, 'stay');
        assert.equal(h.mode.leavePopupProgress(), 0, 'the popup starts invisible');
        h.advance(90); assert.ok(Math.abs(h.mode.leavePopupProgress() - 0.5) < 0.01);
        const ui = h.context.IP2Live.PVPUI, stay = ui.leaveLayout().stay;
        screen.onMouseUp((stay.x + stay.w / 2) * 1.5, (stay.y + stay.h / 2) * 1.5);
        assert.equal(h.mode.confirmLeave, true, 'opening input cannot accidentally activate a button');
        h.advance(90); screen.drawHUD(); assert.ok(h.texts.includes('LEAVE RACE?'));
        screen.onKeyPressed('Enter'); assert.equal(h.mode.confirmLeave, false, 'Keep Playing is selected by default');
        assert.equal(h.mode.leavePopupProgress(), 1, 'dismissal animates from the visible popup');
        h.advance(70); assert.ok(Math.abs(h.mode.leavePopupProgress() - 0.5) < 0.01);
        const before = h.calls.length; screen.onMouseDown(768, 540); assert.equal(h.calls.length, before, 'closing still captures puzzle input');
        h.advance(70); assert.equal(h.mode.isLeavePopupVisible(), false);
        screen.onKeyPressed('Escape'); h.advance(180); screen.onKeyPressed('ArrowLeft'); screen.onKeyPressed('Enter');
        const exit = h.mode.exitTransition;
        assert.ok(exit instanceof h.context.IP2Live.PVPExitTransition); assert.equal(exit._pvpDecorated, undefined);
        assert.equal(h.mode.requestLeave(), false, 'double confirmation creates only one exit');
        h.advance(320); assert.equal(exit.phase, 'hold'); assert.equal(h.mode.active, true, 'cleanup waits for a painted black frame');
        exit.drawHUD(); h.advance(1); for (let i = 0; i < 8; i++) await Promise.resolve();
        assert.equal(h.mode.active, false); assert.equal(h.context.Core.Game.current, original);
        assert.equal(h.frames.at(-1), exit); assert.equal(exit.closed, false, 'temporary stack movement must not dispose the exit overlay');
        assert.equal(exit.phase, 'in'); exit.drawHUD(); assert.ok(h.texts.includes('PVP MENU'));
        h.advance(320); assert.equal(h.frames.length, 1); assert.equal(h.mode.exitTransition, null); assert.equal(exit.frame, null);
    }
    {
        const h = harness(false, { closeOnPop: true }); h.frames[0].drawHUD = () => {};
        const screen = h.startAt('ip_class_wires'); screen.drawHUD();
        let finishLeave, leaves = 0;
        h.mode.ai = false; h.mode.nextPollAt = Infinity;
        h.mode.bridge = () => ({ leave: () => { leaves++; return new Promise(resolve => { finishLeave = resolve; }); } });
        screen.onKeyPressed('Escape'); h.advance(180);
        const leave = h.context.IP2Live.PVPUI.leaveLayout().leave;
        screen.onMouseUp((leave.x + leave.w / 2) * 1.5, (leave.y + leave.h / 2) * 1.5);
        const exit = h.mode.exitTransition; h.advance(320); exit.drawHUD(); h.advance(1);
        for (let i = 0; i < 8; i++) await Promise.resolve();
        h.advance(1500); exit.drawHUD();
        assert.equal(exit.phase, 'hold', 'a delayed LAN forfeit stays behind the exit transition');
        assert.equal(h.frames.at(-1), exit); assert.equal(h.mode.requestLeave(), false); assert.equal(leaves, 1);
        finishLeave(); for (let i = 0; i < 8; i++) await Promise.resolve();
        assert.equal(exit.phase, 'in'); assert.equal(h.mode.active, false);
        h.advance(320); assert.equal(h.frames.length, 1);
    }
    {
        const h = harness(); const screen = h.startAt('ip_class_wires'); screen.onKeyPressed('Escape');
        assert.equal(h.mode.confirmLeave, true); h.advance(50000); assert.equal(h.mode.active, true);
        screen.onKeyPressed('Escape'); assert.equal(h.mode.confirmLeave, false);
        h.mode.aiMatch.status = 'finished'; h.mode.aiMatch.winnerId = 'ai'; h.advance(1);
        assert.equal(h.context.IP2Live.TutorialReplay.session, null); assert.equal(h.frames.at(-1), h.mode.scene);
        h.mode.scene.drawHUD(); assert.ok(h.texts.includes('RIVAL ENGINE ONLINE'));
        assert.ok(!h.texts.includes('DOWNLOAD CERTIFICATE')); assert.equal(await h.mode.downloadCertificate(), false);
        await h.mode.leave();
    }
    {
        const h = harness(); h.startAt('ip_class_wires');
        h.mode.aiMatch.status = 'finished'; h.mode.aiMatch.winnerId = 'local'; h.mode.aiMatch.players[0].progress = 1000;
        h.advance(1); h.mode.scene.drawHUD(); assert.ok(h.texts.includes('DOWNLOAD CERTIFICATE'));
        const completedAt = h.mode.completedAt; let creates = 0, downloads = 0, release;
        h.context.IP2Live.PVPCertificate.create = (match, playerId, options) => {
            creates++; assert.equal(playerId, 'local'); assert.equal(options.completedAt, completedAt);
            return { filename: 'Victory.pdf', blob: {} };
        };
        h.context.IP2Live.PVPCertificate.download = () => { downloads++; return new Promise(resolve => { release = resolve; }); };
        const button = h.context.IP2Live.PVPUI.layout().confirm;
        h.mode.scene.onMouseUp((button.x + button.w / 2) * 1.5, (button.y + button.h / 2) * 1.5);
        assert.equal(h.mode.certificateBusy, true); assert.equal(await h.mode.downloadCertificate(), false, 'double clicking cannot start concurrent exports');
        release(); await Promise.resolve(); await Promise.resolve();
        assert.equal(h.mode.certificateBusy, false); assert.equal(downloads, 1); assert.match(h.mode.certificateNotice, /download started/);
        h.context.IP2Live.PVPCertificate.download = async () => { throw new Error('disk/download failed'); };
        assert.equal(await h.mode.downloadCertificate(), false); assert.equal(h.mode.certificateError, true);
        h.context.IP2Live.PVPCertificate.download = async () => { downloads++; };
        h.mode.scene.onKeyPressed('KeyC'); await Promise.resolve(); await Promise.resolve();
        assert.equal(h.mode.certificateError, false); assert.equal(downloads, 2); assert.equal(creates, 1, 're-downloads reuse the same certificate');
        await h.mode.leave();
    }
    {
        // Exercise the actual Subnet Blaster, including two barriers, five boss
        // impacts, dropped-address animations and its real completion callback.
        const h = harness(); h.startAt('ip_cidr_quarantine_matrix');
        const replay = h.context.IP2Live.TutorialReplay.session, stub = replay.screen;
        const real = new h.context.IP2Live.CIDRQuarantineMatrixGameplayScreen(stub.options);
        h.frames.pop(); h.gm.prepareTutorialReplayScreen(real, replay.options); h.context.Manager.Stack.push(real);
        real.drawHUD(); assert.equal(h.context.Common.Platform.ctx, h.ctx);
        let budget = 180000;
        while (h.context.IP2Live.TutorialReplay.session && budget > 0) {
            if (real.phase === 'think') real.onKeyPressed('Enter');
            if (real.phase === 'barriers') {
                const wave = real.waves[real.waveIndex], lane = wave.choices.findIndex(c => c.value === wave.correct);
                real.onKeyPressed({ code: 'Digit' + (lane + 1) });
            }
            h.advance(50); budget -= 50;
        }
        assert.ok(budget > 0, 'the real blaster completes inside the PVP viewport');
        assert.equal(h.mode.me.wins, 1); assert.equal(h.mode.me.progress, 240); assert.equal(h.mode.me.mistakes, 0);
        await h.mode.leave();
    }
    console.log('pvp-mode.test.cjs: PASS (AI ability, pace, retries, bombs and suspended updates; identical problems on independent renderers, stable retries and boss questions, concise menu and hover, victory download, versus intro, 7 real screens, bounded simulator nodes, full blaster combat, 3→4 state, scoring, input, isolation, exit)');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
