const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..', 'Plugins/IP2Live_Core');
const definitions = [
    ['gameplay1/IPWires/ip_wires_gameplay.js', 'WiresGameplayScreen', false, 180],
    ['gameplay1/IPWires/ip_wires_gameplay_harder.js', 'HarderWiresGameplayScreen', false, 180],
    ['gameplay2/IPPatchPanel/ip_patchpanel_gameplay.js', 'PatchPanelGameplayScreen', false, 180],
    ['gameplay3/CIDRPanel/ip_cidrpanel_gameplay.js', 'CIDRPanelGameplayScreen', true, 180],
    ['gameplay3/CIDRPanel/ip_cidrpanel_gameplay_harder.js', 'CIDRPanelHarderGameplayScreen', true, 180],
    ['gameplay4/SubnetSimulator/ip_subnetsim_gameplay.js', 'SubnetSimulatorGameplayScreen', true, 180],
    ['gameplay4_5/HostPowerReactor/ip_host_power_gameplay.js', 'HostPowerReactorGameplayScreen', true, 120],
    ['gameplay5/CIDRQuarantine/ip_cidr_quarantine_gameplay.js', 'CIDRQuarantineGameplayScreen', true, 180],
    ['gameplay6/CIDRQuarantineMatrix/ip_cidr_quarantine_matrix_gameplay.js', 'CIDRQuarantineMatrixGameplayScreen', false, 180],
    ['gameplay7/NetworkRepair/gameplay.js', 'NetworkRepairGameplayScreen', false, 180],
    ['gameplay8/VLSMAllocator/ip_vlsm_allocator_gameplay.js', 'VLSMAllocatorGameplayScreen', false, 180],
];

function harness(autoInitialize = false) {
    let now = 100000;
    const texts = [], frames = [];
    const ctx = new Proxy({ canvas: { width: 1280, height: 720 },
        fillText: (text, x, y) => texts.push({ text, x, y }), measureText: value => ({ width: String(value).length * 8 }),
        createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) },
        { get: (target, key) => key in target ? target[key] : () => {} });
    const c = {
        console: { log() {}, warn() {} }, window: {}, Math,
        Date: class extends Date { static now() { return now; } },
        document: { hidden: false, hasFocus: () => true },
        setTimeout, clearTimeout, inject() {}, Graphic: {}, Model: {}, Main: {}, THREE: {},
        Common: { Platform: { ctx }, ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 } },
        Core: { Game: { current: { currentMapID: 3, ip2liveGameStates: {} } } },
        Scene: { Base: class { constructor() { if (autoInitialize && this.initialize) this.initialize(); } }, Map: { current: {} } },
        Manager: { GL: {}, Stack: { get top() { return frames.at(-1); }, push: screen => frames.push(screen),
            replace: screen => { frames.splice(0, frames.length, screen); }, pop: () => frames.pop() } },
        Data: { Keyboards: {}, Systems: {} },
        IP2Live: { GameManager: { handleGameplayMistake() {} } },
    };
    vm.createContext(c);
    const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), c, { filename: file });
    for (const file of ['gameplay/common/gameplay_timer.js', 'gameplay/common/ip_class_ranges.js',
        'gameplay/common/ip_cidr_tools.js', 'gameplay/gameplay1/IPWires/ip_wires_core.js',
        ...definitions.map(d => 'gameplay/' + d[0])]) load(file);
    c.IP2Live.HarderWiresGameplayManager._ensureHarderScreenClass();
    return { c, ip: c.IP2Live, ctx, texts, frames, load, advance: ms => { now += ms; },
        screen(name, options = {}, seconds) {
            const screen = new c.IP2Live[name](options, seconds);
            screen.loading = false;
            frames.splice(0, frames.length, screen);
            return screen;
        } };
}
function limit(screen) { return screen.solveTimeSeconds ?? screen.durationSeconds ?? screen.timeLimitSeconds; }
function remaining(screen) {
    if (screen.gameplayTimer) return screen.gameplayTimer.remainingMs;
    if ('solveTimerTicks' in screen) return screen.solveTimerTicks / 60 * 1000;
    if ('roundRemainingMs' in screen) return screen.roundRemainingMs;
    return screen.timeLimitSeconds * 1000 - screen.questElapsedMs;
}
function closeEnough(actual, expected, name) { assert.ok(Math.abs(actual - expected) < 0.001, name + ': ' + actual + ' != ' + expected); }

test('all 11 constructors accept seconds, options and quest specs, including engine auto-initialization', () => {
    for (const initialize of [false, true]) {
        const h = harness(initialize);
        for (const [, name, native, defaultSeconds] of definitions) {
            assert.equal(limit(h.screen(name)), defaultSeconds, name + ' keeps its existing default');
            assert.equal(limit(h.screen(name, { timeLimitSeconds: 48 })), 48, name);
            assert.equal(limit(h.screen(name, { spec: { timeLimitSeconds: 33 } })), 33, name);
            assert.equal(limit(h.screen(name, { timeSeconds: 26, spec: { timeLimitSeconds: 90 } })), 26, name + ' launch wins over spec');
            const screen = h.screen(name, { timeLimitSeconds: 48, timeSeconds: 120, spec: { timeLimitSeconds: 33 }, endlessMode: true }, 1.25);
            assert.equal(limit(screen), 1.25, name + ' constructor wins and allows short budgets');
            if (!native) assert.equal(screen.timerEnabled, true);
        }
        assert.equal(limit(h.screen('CIDRPanelGameplayScreen', { solveTimeSeconds: 12 })), 12);
        assert.equal(limit(h.screen('SubnetSimulatorGameplayScreen', { time: 14 })), 14);
        assert.equal(limit(h.screen('HostPowerReactorGameplayScreen', { durationSeconds: 16 })), 16);
        assert.equal(limit(h.screen('CIDRQuarantineGameplayScreen', { timeLimitSeconds: 0 })), 0, 'legacy untimed quarantine remains supported');
        assert.equal(limit(h.screen('CIDRQuarantineGameplayScreen', { timeLimitSeconds: 0, endlessMode: true })), 180, 'Endless cannot disable its deadline');
        const prep = h.screen('CIDRQuarantineMatrixGameplayScreen', { preparationTimeSeconds: 12 });
        assert.equal(prep.thinkRemainingMs, 12000);
        prep._newEncounter(); assert.equal(prep.thinkRemainingMs, 12000);
    }
});

test('formerly untimed gameplays retain untimed Story, Practice and PVP behavior and hide the new HUD', () => {
    const h = harness();
    for (const [, name, native] of definitions.filter(d => !d[2])) {
        for (const mode of [{}, { practiceMode: true }, { pvpMode: true }]) {
            let failures = 0;
            const screen = h.screen(name, { ...mode, onFailed: () => failures++ }, 1);
            assert.equal(screen.timerEnabled, false, name);
            screen.update(); h.advance(500); screen.update(); h.advance(500); screen.update(); h.advance(500); screen.update();
            assert.equal(failures, 0, name + ' gets no new deadline');
            h.texts.length = 0; h.ip.GameplayTimer.draw(screen, h.ctx);
            assert.equal(h.texts.length, 0, name + ' has no timer UI');
            assert.equal(h.ip.GameplayTimer.result(screen).timeLimitSeconds, 0);
        }
    }
});

test('Endless-only countdowns fail each untimed gameplay once without inventing incorrect answers', () => {
    for (const [, name] of definitions.filter(d => !d[2])) {
        const h = harness(), failures = [];
        const screen = h.screen(name, { endlessMode: true, onFailed: result => failures.push(result) }, 1.25);
        screen.update();
        h.texts.length = 0; screen.drawHUD();
        const badge = h.texts.find(item => item.text === 'TIME  00:02');
        assert.ok(badge, name + ' draws its actual countdown');
        assert.ok(badge.x < 563, 'timer badge leaves the top-center pause button clear');
        for (let i = 0; i < 8; i++) { h.advance(250); screen.update(); }
        assert.equal(failures.length, 1, name);
        assert.equal(failures[0].reason, 'time_expired', name);
        assert.equal(failures[0].timeLimitSeconds, 1.25);
        assert.equal(failures[0].timeRemainingMs, 0);
        assert.equal(failures[0].incorrectDecisions, 0);
        const before = JSON.stringify(screen.decisionHistory);
        screen.onKeyPressed('Enter'); screen.onMouseDown(400, 200);
        assert.equal(JSON.stringify(screen.decisionHistory), before, name + ' locks solving input after timeout');
    }
});

test('existing timed games honor shorter limits and retain their timeout sequences with one failure callback', () => {
    for (const [, name] of definitions.filter(d => d[2])) {
        const h = harness(), failures = [];
        const screen = h.screen(name, { endlessMode: true, onFailed: result => failures.push(result) }, 1);
        for (let i = 0; i < 430 && !failures.length; i++) {
            screen.update(); h.advance(screen.phase === 'overrun' ? 5201 : 20);
        }
        for (let i = 0; i < 3; i++) { screen.update(); h.advance(20); }
        assert.equal(failures.length, 1, name);
        assert.equal(failures[0].reason, 'time_expired', name);
        assert.equal(failures[0].timeLimitSeconds, 1, name);
    }
});

test('timers stop for pause, background, focus loss and dialogue without catching up on resume', () => {
    for (const [, name] of definitions) {
        const h = harness(), failures = [];
        const screen = h.screen(name, { endlessMode: true, onFailed: result => failures.push(result) }, 10);
        screen.update(); h.advance(500); screen.update();
        closeEnough(remaining(screen), 9500, name);
        h.ip.GameplayPause = { menuOpen: true };
        h.frames.push({ overlay: true }); h.advance(500); screen.update();
        h.advance(40000);
        h.ip.GameplayPause.menuOpen = false; h.frames.pop(); h.ip.GameplayTimer.forget(screen);
        if (screen.onGameplayResume) screen.onGameplayResume();
        screen.update(); closeEnough(remaining(screen), 9500, name + ' pause');
        h.c.document.hidden = true; h.advance(500); screen.update();
        h.c.document.hidden = false; screen.update();
        closeEnough(remaining(screen), 9500, name + ' hidden');
        h.c.document.hasFocus = () => false; h.advance(500); screen.update();
        h.c.document.hasFocus = () => true; screen.update();
        closeEnough(remaining(screen), 9500, name + ' blur');
        h.ip.DialogueManager = { isActive: () => true }; h.advance(500); screen.update();
        h.ip.DialogueManager.isActive = () => false; screen.update();
        closeEnough(remaining(screen), 9500, name + ' dialogue');
        h.advance(250); screen.update(); closeEnough(remaining(screen), 9250, name + ' resumed');
        h.advance(60000); screen.update(); closeEnough(remaining(screen), 9250, name + ' suspended frame');
        assert.equal(failures.length, 0);
    }
});

test('internal retries keep the remaining budget, and guided CIDR honors the configured duration', () => {
    const h = harness();
    const patch = h.screen('PatchPanelGameplayScreen', { endlessMode: true }, 20);
    patch.update(); h.advance(500); patch.update(); patch._resetRound();
    assert.equal(patch.gameplayTimer.remainingMs, 19500, 'packet auto-restart does not award extra time');
    const blaster = h.screen('CIDRQuarantineMatrixGameplayScreen', { endlessMode: true }, 20);
    blaster.update(); h.advance(500); blaster.update(); blaster._newEncounter();
    assert.equal(blaster.gameplayTimer.remainingMs, 19500, 'new encounter keeps the whole-launch budget');
    h.load('gameplay/gameplay3/CIDRPanel/ip_cidrpanel_tutorial.js');
    const cidr = h.screen('CIDRPanelGameplayScreen', { guidedTutorial: true, tutorialMode: true }, 45);
    h.ip.IPCIDRPanelTutorial.prepareTutorialTimer(cidr);
    assert.equal(cidr.solveTimeSeconds, 45); assert.equal(cidr.solveTimerTicks, 45 * 60);
    assert.equal(cidr.glitchStartElapsedSeconds, 30);
});

test('invalid timer inputs fall through safely and mode aliases only activate the new timers explicitly', () => {
    const h = harness(), t = h.ip.GameplayTimer;
    for (const value of [NaN, Infinity, -1, 0, '', null, false, true, 'bad']) {
        assert.equal(t.resolve({ timeLimitSeconds: value, spec: { timeSeconds: 80 } }, value), 80);
    }
    assert.equal(t.resolve({ timeSeconds: '25.5' }), 25.5);
    assert.equal(t.resolve({ timeSeconds: 0.25 }), 1);
    for (const options of [{ unlimitedMode: true }, { featureMode: 'endless' }, { spec: { endlessMode: true } }]) {
        assert.equal(h.screen('NetworkRepairGameplayScreen', options).timerEnabled, true);
    }
    assert.equal(h.screen('NetworkRepairGameplayScreen', { mode: 'default' }).timerEnabled, false);
});

test('timer options reach real screens through every gameplay manager', () => {
    for (const [file, name] of definitions) {
        const h = harness();
        h.load('modules/game_manager.js');
        const gm = h.ip.GameManager;
        const entry = Object.values(gm.flowConfig.gameplayNodes).find(node => {
            const owner = h.ip[node.manager];
            return owner && fs.readFileSync(path.join(root, 'gameplay', file), 'utf8').includes(node.method + '(options)');
        });
        assert.ok(entry, name + ' has a launch manager');
        const spec = gm.getGameplayQuestSpecs(entry.id).find(s => !s.tutorial) || gm.getGameplayQuestSpecs(entry.id)[0];
        assert.ok(spec, name + ' has a quest specification');
        gm._currentMapId = () => spec.mapId;
        const owner = h.ip[entry.manager];
        owner[entry.method]({ spec, mapId: spec.mapId, questId: spec.id, objectiveId: spec.objectiveId,
            _fromGameManager: true, showIntro: false, useLoading: false, mode: 'push', endlessMode: true, timeLimitSeconds: 17.5 });
        const screen = h.frames.at(-1);
        assert.ok(screen instanceof h.ip[name], name + ' actually opens');
        assert.equal(limit(screen), 17.5, name + ' receives custom seconds');
        if (screen.gameplayTimer) assert.equal(screen.gameplayTimer.enabled, true, name + ' receives mode');
    }
});

test('real pause persistence restores Reactor remaining time and migrates legacy deadlines without a bonus', () => {
    const h = harness();
    h.load('modules/screens/gameplay-pause.js');
    const pause = h.ip.GameplayPause;
    const options = { mapId: 3, questId: 'timer.quest', objectiveId: 'timer.objective' };
    const original = h.screen('HostPowerReactorGameplayScreen', options, 12);
    original.update(); h.advance(500); original.update();
    const session = pause.captureScreen(original, 'timer_test');
    assert.ok(session);
    assert.equal(session.state.roundRemainingMs, 11500);
    h.advance(86400000);
    const restored = h.screen('HostPowerReactorGameplayScreen', options, 12);
    assert.equal(pause._restoreIntoScreen(restored, 'ip_host_power_reactor'), true);
    assert.equal(restored.roundRemainingMs, 11500);
    restored.update(); h.advance(500); restored.update();
    assert.equal(restored.roundRemainingMs, 11000);

    delete session.state.roundRemainingMs;
    h.advance(86400000);
    const legacy = h.screen('HostPowerReactorGameplayScreen', options, 12);
    assert.equal(pause._restoreIntoScreen(legacy, 'ip_host_power_reactor'), true);
    assert.equal(legacy.roundRemainingMs, 11500, 'old saves derive remaining time from the rebased deadline');
    const endless = h.screen('NetworkRepairGameplayScreen', { ...options, endlessMode: true }, 20);
    assert.equal(pause.captureScreen(endless), null, 'future Endless rounds never overwrite a campaign session');
});

test('critical Reactor pressure adjusts the new timer option consistently', () => {
    const h = harness();
    h.load('modules/game-state/neural_life_force_manager.js');
    const neural = h.ip.NeuralLifeForce;
    neural._state = () => ({ lifeForce: 20, runOver: false });
    neural.isCritical = () => true;
    const options = neural.prepareLaunchOptions('ip_host_power_reactor', { timeLimitSeconds: 80 });
    assert.equal(options.durationSeconds, 60);
    assert.equal(options.timeLimitSeconds, 60);
    assert.equal(limit(h.screen('HostPowerReactorGameplayScreen', options)), 60);
});

test('learning comparisons keep different timer budgets in different task cohorts', () => {
    const h = harness();
    h.load('modules/report_learning_analytics.js');
    const analytics = h.ip.ReportLearningAnalytics;
    const a = analytics._cohortDescriptor({ gameplayId: 'ip_class_wires', payload: { result: { timeLimitSeconds: 180 } } }, 'active_frames_v1');
    const b = analytics._cohortDescriptor({ gameplayId: 'ip_class_wires', payload: { result: { timeLimitSeconds: 60 } } }, 'active_frames_v1');
    assert.equal(a.workload.timeLimitSeconds, 180);
    assert.equal(b.workload.timeLimitSeconds, 60);
    assert.notDeepEqual(a, b);
});
