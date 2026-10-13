const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..', 'Plugins', 'IP2Live_Core');

function harness() {
    let now = 100000;
    const rows = [], overlays = [], frames = [];
    class Screen { initialize() {} update() {} }
    class TestDate extends Date { static now() { return now; } }
    const context = {
        Date: TestDate, console: { log() {}, warn() {} }, window: {}, setTimeout(fn) { fn(); return 1; }, clearTimeout() {},
        document: { hidden: false }, Scene: { Base: class {}, Map: { current: { id: 4 } } },
        Core: { Game: { current: { currentMapID: 4, infiltratorName: 'Student', _ip2liveProfileId: 'student-a', ip2liveGameStates: {} } } },
        Manager: { Stack: { get top() { return frames.at(-1); }, push(s) { frames.push(s); }, pop() { return frames.pop(); } } },
        Data: { Systems: {}, Keyboards: {} }, Common: {}, Graphic: {}, Model: {}, Main: {}, THREE: {}, inject() {},
        IP2Live: {
            ReportManager: { logTelemetryRecord(row) { rows.push(row); return Promise.resolve(true); } },
            WiresGameplayScreen: Screen,
            GameStateManager: { registerState() {}, activate() {}, activeStates: {} },
            QuestManager: { activeQuestId: 'quest-a', activeObjectiveId: 'objective-a', activeMapId: 4 },
            ARDiagnosticRewind: { show(opts) { overlays.push(opts); return true; } },
            NeuralLifeForceGameOver: { show() { return true; } },
        },
    };
    vm.createContext(context);
    const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
    load('modules/game_manager.js');
    const gm = context.IP2Live.GameManager;
    gm._queueCheckpoint = () => {};
    return { context, load, gm, rows, overlays, frames, Screen, advance(ms) { now += ms; } };
}

async function main() {
    {
        const { gm, rows, context } = harness();
        for (const id of Object.keys(gm.gameplayCatalog)) {
            const missing = gm._extractGameplayMetrics(id, {}, false);
            assert.equal(missing.accuracy, null, id + ': absent observations must be unknown');
            assert.equal(missing.totalDecisions, null);
            const actual = gm._extractGameplayMetrics(id, {
                telemetrySchemaVersion: 2, totalDecisions: 99, correctDecisions: 99,
                decisionHistory: [{ concept: 'host_bits', correct: true }, { concept: 'block_size', correct: false }],
                activeElapsedMs: 4200, durationMethod: 'active_frames_v1', calculatorUses: 0,
            }, false);
            assert.equal(actual.accuracy, 0.5, 'observations take precedence over stale counters');
            assert.equal(actual.mistakeCount, 1);
            assert.equal(actual.totalDecisions, 2);
            assert.equal(actual.payload.calculatorUses, 0, 'zero-valued counters survive serialization');
        }
        const subnet = gm._extractGameplayMetrics('ip_cidr_quarantine_matrix', {
            gameplayVersion: 'subnet-blaster-v4', totalShots: 8, correctShots: 7, mistakeCount: 1,
            bulletsFired: 132, bossImpacts: 20,
        }, true);
        assert.equal(subnet.accuracy, 7 / 8);
        assert.equal(subnet.totalDecisions, 8, 'physical bullets are not graded formula decisions');
        assert.equal(subnet.mistakeCount, 1, 'one wrong encounter still costs one heart');
        const attempt = gm._openReportAttempt('ip_class_wires', { questId: 'q', objectiveId: 'o', mapId: 4 });
        context.Core.Game.current._ip2liveProfileId = 'student-b';
        const completion = gm._closeReportAttempt('ip_class_wires', { result: {} }, false);
        assert.equal(completion.profileId, 'student-a', 'an open attempt remains owned by its original profile');
        assert.equal(completion.accuracy, null);
        assert.equal(rows.at(-1).accuracy, null);
        assert.equal(rows.at(-1).accuracyKnown, false);
        gm._openReportAttempt('ip_cidr_quarantine_matrix', { questId: 'subnet-q', mapId: 13 });
        const gameOver = gm._closeReportAttempt('ip_cidr_quarantine_matrix', { result: { reason: 'hearts_exhausted' } }, false);
        assert.equal(gameOver.payload.terminalFailure, true);
        assert.equal(gameOver.payload.gameplayGameOver.attemptId, gameOver.attemptId);
        const cancelled = gm._closeReportAttempt('ip_cidr_quarantine_matrix', { cancelled: true, result: { cancelled: true } }, false);
        assert.equal(cancelled.payload.gameplayGameOver, null);
        assert.ok(rows.every(row => row.eventId && row.timestamp && row.sessionId));
        assert.ok(attempt.attemptId);
        const previousCount = rows.length;
        gm._openReportAttempt('ip_class_wires', { developerTest: true });
        gm._closeReportAttempt('ip_class_wires', { developerQuestFail: true, result: { developerFail: true } }, false);
        gm._logTelemetryEvent('attempt_end', { practiceMode: true });
        assert.equal(rows.length, previousCount, 'test and disposable practice do not enter campaign evidence');
    }
    {
        const h = harness();
        h.load('modules/game-state/neural_life_force_manager.js');
        const neural = h.context.IP2Live.NeuralLifeForce;
        h.context.Core.Game.current.ip2liveGameStates.neuralLifeForce.lifeForce = 1;
        const data = { gameplayId: 'ip_class_wires', mapId: 4, questId: 'q', objectiveId: 'o', result: { reason: 'attempts_exhausted' } };
        neural.handleTerminalFailure(data);
        neural.handleTerminalFailure(data);
        const events = h.rows.filter(row => row.eventType === 'neural_game_over');
        assert.equal(events.length, 1, 'a depleted run is recorded exactly once');
        assert.ok(events[0].payload.neuralRunId);
        assert.equal(data.gameOverEventId, events[0].eventId);
        neural.reset();
        const subnetFailure = { gameplayId: 'ip_cidr_quarantine_matrix', mapId: 13, skipDiagnosticScreen: true, result: { reason: 'hearts_exhausted' } };
        neural.handleTerminalFailure(subnetFailure);
        assert.equal(neural.getState().lifeForce, 90, 'exhausting Subnet Blaster hearts uses the terminal failure pipeline');
        assert.equal(neural.getState().gameplayTerminalFailures.ip_cidr_quarantine_matrix, 1);
        neural.reset();
        neural.simulateGameOver();
        assert.equal(h.rows.filter(row => row.eventType === 'neural_game_over').length, 1, 'developer depletion never becomes a student game over');
    }
    {
        const h = harness();
        h.load('modules/game-state/neural_life_force_manager.js');
        const neural = h.context.IP2Live.NeuralLifeForce;
        const launches = [];
        h.gm.launchTutorialReplay = (id, data) => { launches.push({ id, data }); return true; };
        neural._showTutorialOffer({ gameplayId: 'ip_class_wires', mapId: 4, questId: 'q', objectiveId: 'o' }, 5);
        const shown = h.rows.find(row => row.eventType === 'neural_tutorial_offer');
        assert.equal(shown.payload.choice, 'shown');
        assert.equal(shown.payload.triggerReason, 'repeated_terminal_failures');
        const offer = h.overlays[0];
        offer.actions[0].onSelect();
        offer.actions[0].onSelect();
        offer.actions[1].onSelect();
        assert.equal(launches.length, 1, 'an offer choice cannot be counted twice');
        assert.equal(launches[0].data.tutorialOfferId, shown.payload.tutorialOfferId);
        assert.equal(h.rows.filter(row => row.eventType === 'neural_tutorial_offer').length, 2);
    }
    {
        const h = harness();
        h.load('modules/screens/gameplay-pause.js');
        const pause = h.context.IP2Live.GameplayPause;
        const screen = new h.Screen();
        screen.options = { gameplayId: 'ip_class_wires', questId: 'q', objectiveId: 'o' };
        h.frames.push(screen);
        screen.initialize(); screen.update();
        h.advance(100); screen.update();
        screen.calculatorOpen = true; h.advance(100); screen.update();
        screen.calculatorOpen = false; screen.helpOpen = true; h.advance(100); screen.update();
        screen.helpOpen = false; screen.phase = 'think'; h.advance(100); screen.update();
        screen.phase = 'build'; pause.menuOpen = true; h.advance(5000); screen.update();
        pause.closeMenu(); h.advance(100); screen.update();
        screen.finished = true; h.advance(100); screen.update();
        const timing = pause.getReportTiming('ip_class_wires', screen.options);
        assert.equal(timing.activeElapsedMs, 200);
        assert.equal(timing.calculatorElapsedMs, 100);
        assert.equal(timing.helpElapsedMs, 100);
        assert.equal(timing.preparationMs, 100);
        assert.equal(timing.durationMethod, 'active_frames_v1');
        assert.equal(pause.getReportTiming('ip_network_repair', {}), null);
        const result = h.gm._attachReportTiming('ip_class_wires', { ...screen.options, result: { passed: true } }).result;
        assert.equal(result.activeElapsedMs, 200);
        const saved = pause.captureScreen(screen, 'test');
        assert.ok(saved.state.learningTelemetryClock, 'the cumulative clock is retained in durable session state');
    }
    {
        const h = harness();
        h.load('modules/screens/gameplay-pause.js');
        h.load('gameplay/gameplay4_5/HostPowerReactor/ip_host_power_gameplay.js');
        h.load('gameplay/gameplay4_5/HostPowerReactor/ip_host_power_tool.js');
        const background = new h.Screen();
        background.options = { gameplayId: 'ip_class_wires', questId: 'q', objectiveId: 'o' };
        h.frames.push(background); background.initialize(); background.update();
        const toolManager = h.context.IP2Live.HostPowerToolManager;
        assert.equal(toolManager.launchHostPowerTool({ backgroundScene: background, sourceGameplayId: 'ip_class_wires', targetClass: 'C', requiredHosts: 30 }), true);
        const tool = h.frames.at(-1);
        tool.initialize();
        h.advance(100); tool.update();
        h.advance(100); tool.update();
        tool._close(); tool._close();
        assert.equal(h.frames.at(-1), background, 'duplicate close cannot pop the gameplay');
        assert.equal(background.learningTelemetryClock.calculatorUses, 1, 'initialize/load cannot double-count an open calculator');
        assert.equal(background.learningTelemetryClock.calculatorElapsedMs, 200);
        assert.equal(background.learningTelemetryClock.activeElapsedMs, 0);
        assert.equal(toolManager.launchHostPowerTool({ backgroundScene: background, sourceGameplayId: 'ip_class_wires', targetClass: 'C', requiredHosts: 30 }), true);
        h.advance(100); h.frames.at(-1).update(); toolManager.hide();
        assert.equal(background.learningTelemetryClock.calculatorUses, 2);
        assert.equal(background.learningTelemetryClock.calculatorElapsedMs, 300);
        assert.equal(background.learningTelemetryClock.calculatorOverlayActive, false);
    }
    {
        const h = harness();
        const replay = {
            gameplayId: 'ip_class_wires', options: { questId: 'replay-1', mapId: 4 }, returnQuestId: 'q', returnObjectiveId: 'o',
        };
        h.context.IP2Live.TutorialReplay = { session: replay, prepareScreen(screen) { replay.screen = screen; return true; } };
        h.gm._reportTutorialContexts.ip_class_wires = { tutorialOfferId: 'offer-1', triggerReason: 'repeated_terminal_failures' };
        h.gm._logTelemetryEvent('neural_tutorial_replay', { gameplayId: 'ip_class_wires', payload: { action: 'started' } });
        const screen = {};
        h.frames.push({ map: true });
        h.gm.prepareTutorialReplayScreen(screen, {});
        assert.equal(h.rows.filter(row => row.eventType === 'neural_tutorial_replay').length, 1, 'preparing a screen before its push is not a visible tutorial');
        h.frames.push(screen);
        h.gm._recordTutorialReplayShown(screen);
        h.gm._recordTutorialReplayShown(screen);
        h.context.IP2Live.TutorialReplay.session = null;
        h.gm._logTelemetryEvent('neural_tutorial_replay', { gameplayId: 'ip_class_wires', payload: { action: 'completed' } });
        const events = h.rows.filter(row => row.eventType === 'neural_tutorial_replay');
        assert.deepEqual(events.map(row => row.payload.action), ['started', 'shown', 'completed']);
        assert.ok(events.every(row => row.payload.tutorialReplayId === 'replay-1'));
        assert.ok(events.every(row => row.payload.tutorialOfferId === 'offer-1'));
    }
    {
        const h = harness();
        h.load('modules/screens/gameplay-pause.js');
        h.context.Core.Game.current = null;
        const pause = h.context.IP2Live.GameplayPause, screen = new h.Screen();
        screen.options = { gameplayId: 'ip_class_wires', questId: 'practice-round', tutorialReplay: true, practiceMode: true };
        h.context.IP2Live.TutorialReplay = { session: { screen, pvp: false, practice: true, options: screen.options } };
        h.frames.push(screen);
        screen.initialize(); screen.update(); h.advance(200); screen.update();
        pause.menuOpen = true; h.advance(300); screen.update();
        pause.menuOpen = false; screen.helpOpen = true; h.advance(100); screen.update();
        screen.helpOpen = false; h.advance(200); screen.update();
        const timing = pause.getReportTiming('ip_class_wires', screen.options);
        assert.equal(timing.activeElapsedMs, 400, 'isolated practice needs an active clock even with no campaign Game');
        assert.equal(timing.helpElapsedMs, 100);
        h.context.IP2Live.TutorialReplay.session = null;
        h.advance(100); screen.update();
        assert.equal(pause.getReportTiming('ip_class_wires', screen.options), null, 'stale practice screens must not contribute timing');
        assert.equal(screen.learningTelemetryClock.activeElapsedMs, 400);
    }
    {
        const h = harness(); h.load('modules/screens/gameplay-pause.js');
        h.context.Core.Game.current = null;
        const pause = h.context.IP2Live.GameplayPause, screen = new h.Screen();
        screen.options = { gameplayId: 'ip_class_wires', questId: 'pvp-round', tutorialReplay: true, pvpMode: true };
        const featureSession = { ended: false };
        h.context.IP2Live.TutorialReplay = { session: { screen, pvp: true, practice: true, options: screen.options, featureSession } };
        h.frames.push(screen); screen.initialize(); screen.update();
        h.advance(300); screen.update();
        assert.equal(pause.getReportTiming('ip_class_wires', screen.options).activeElapsedMs, 300, 'human PVP rounds also use the shared active clock');
        featureSession.ended = true; h.advance(100); screen.update();
        assert.equal(pause.getReportTiming('ip_class_wires', screen.options), null, 'finished PVP sessions cannot keep recording active time');
    }
    console.log('telemetry_learning_evidence.test.cjs: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
