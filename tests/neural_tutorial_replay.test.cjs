const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..', 'Plugins', 'IP2Live_Core');
const definitions = [
    ['gameplay1/IPWires/ip_wires_gameplay.js', 'ip_class_wires'],
    ['gameplay1/IPWires/ip_wires_gameplay_harder.js', 'ip_class_wires_harder'],
    ['gameplay2/IPPatchPanel/ip_patchpanel_gameplay.js', 'ip_patch_panel_classes'],
    ['gameplay3/CIDRPanel/ip_cidrpanel_gameplay.js', 'ip_cidr_binary_panel'],
    ['gameplay3/CIDRPanel/ip_cidrpanel_gameplay_harder.js', 'ip_cidr_binary_panel_harder'],
    ['gameplay4/SubnetSimulator/ip_subnetsim_gameplay.js', 'ip_subnet_simulator'],
    ['gameplay4_5/HostPowerReactor/ip_host_power_gameplay.js', 'ip_host_power_reactor'],
    ['gameplay5/CIDRQuarantine/ip_cidr_quarantine_gameplay.js', 'ip_cidr_quarantine'],
    ['gameplay6/CIDRQuarantineMatrix/ip_cidr_quarantine_matrix_gameplay.js', 'ip_cidr_quarantine_matrix'],
    ['gameplay7/NetworkRepair/gameplay.js', 'ip_network_repair'],
    ['gameplay8/VLSMAllocator/ip_vlsm_allocator_gameplay.js', 'ip_vlsm_allocator'],
];

function harness() {
    const frames = [{ id: 18 }];
    const calls = { dialogue: [], telemetry: [], overlays: [], music: [] };
    const context = {
        console: { log() {}, warn(...args) { throw new Error(args.join(' ')); } },
        window: {}, inject() {}, setTimeout(fn) { fn(); return 1; }, clearTimeout() {},
        Common: { ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 } },
        Core: { Game: { current: { currentMapID: 18, ip2liveGameStates: {} } } },
        Data: { Systems: {}, Keyboards: {} }, Graphic: {}, Model: {}, Main: {}, THREE: {},
        Scene: { Base: class {}, Map: { current: frames[0] } },
        Manager: { Stack: {
            get top() { return frames.at(-1); },
            push(screen) { frames.push(screen); }, pop() { return frames.pop(); },
            replace() { assert.fail('a replay must never replace the current map'); },
        } },
        IP2Live: {
            QuestManager: {
                activeQuestId: 'current.quest', activeObjectiveId: 'current.objective', activeMapId: 18,
                completedObjectives: { prior: { objective: true } },
                completeObjective() { assert.fail('replay completed a campaign objective'); },
                startQuest() { assert.fail('replay switched the campaign quest'); },
            },
            MusicManager: { currentZone: () => 'stage4', play(zone) { calls.music.push(zone); }, ZONE: { GAMEPLAY_1: 'gameplay', GAMEPLAY_2: 'gameplay2' } },
            ARDiagnosticRewind: { show(options) { calls.overlays.push(options); return true; } },
            DialogueManager: {
                queueByTiming(scope, timing) { calls.dialogue.push({ scope, timing }); return ['opening']; },
                startById(id, options) { options.onComplete(); return true; },
            },
        },
        ReplayScreenStub: class {
            constructor(options) { this.options = options; this.scenario = options.scenario; }
        },
    };
    vm.createContext(context);
    const load = (relative, transform = (s) => s) => vm.runInContext(transform(fs.readFileSync(path.join(root, relative), 'utf8')), context, { filename: relative });
    load('modules/tutorial_replay.js');
    load('modules/game_manager.js');
    const gm = context.IP2Live.GameManager;
    gm._logTelemetryEvent = (type, data) => calls.telemetry.push({ type, data });
    gm._ensureQuestMinimap = () => {};
    gm._openReportAttempt = () => assert.fail('tutorial replay opened an assessed attempt');
    gm.startMapFlow = () => assert.fail('tutorial replay changed map');
    context.IP2Live.DialogueManager.discardActive = () => { calls.discarded = true; };
    return { context, load, gm, frames, calls };
}

for (const [file, gameplayId] of definitions) {
    for (const outcome of ['completed', 'failed', 'cancelled']) {
        const { context, load, gm, frames, calls } = harness();
        // Run real launcher and lifecycle code, replacing only puzzle screens.
        // This exercises their stack operations, options, and completion callbacks.
        if (gameplayId === 'ip_class_wires_harder') context.IP2Live.WiresGameplayScreen = context.ReplayScreenStub;
        if (gameplayId === 'ip_cidr_binary_panel_harder') context.IP2Live.CIDRPanelGameplayScreen = context.ReplayScreenStub;
        load('gameplay/' + file, (source) => source.replace(/new IP2Live\w+(?:Gameplay|Connector)Screen\(/g, 'new ReplayScreenStub(').replace(/new HarderScreenClass\(/g, 'new ReplayScreenStub('));
        const node = gm.flowConfig.gameplayNodes[gameplayId];
        const owner = context.IP2Live[node.manager];
        // Quarantine generates a puzzle through a temporary screen constructor.
        if (owner._freshProblem) owner._freshProblem = () => ({});
        for (const helper of ['IPPatchPanelTutorial', 'IPHostPowerReactorTutorial', 'IPCIDRPanelHarderTutorial']) {
            context.IP2Live[helper] = { showIntro() { assert.fail('replay opened a pre-game intro: ' + helper); } };
        }
        for (const helper of ['IPWiresTutorial', 'IPWiresHarderTutorial', 'IPNetworkRepairTutorial', 'IPVLSMAllocatorTutorial']) {
            const start = () => {
                assert.equal(frames.length, 2, 'tutorial dialogue starts above its gameplay instance');
                assert.equal(frames.at(-1).options.tutorialReplay, true);
                calls.inGameLesson = helper;
            };
            context.IP2Live[helper] = { showIntro: start, activateGuidedSession: start };
        }
        const questBefore = JSON.stringify(context.IP2Live.QuestManager);
        context.IP2Live.CIDRGameplayState = { latest: { mask: '255.255.255.0' } };
        assert.equal(gm.launchTutorialReplay(gameplayId), true, gameplayId);
        assert.equal(frames.length, 2, gameplayId + ': replay must sit above the map');
        const screen = frames.at(-1);
        assert.equal(screen.options.tutorialReplay, true);
        assert.equal(screen.options.mapId, 18);
        assert.equal(screen.options.spec.tutorial, true);
        assert.equal(context.IP2Live.TutorialReplay.session.screen, screen, 'dedicated replay manager owns the screen');
        assert.equal(gm._tutorialReplaySession.options.showIntro, false);
        if (['ip_class_wires', 'ip_class_wires_harder', 'ip_network_repair', 'ip_vlsm_allocator'].includes(gameplayId)) assert.ok(calls.inGameLesson);
        if (['ip_class_wires', 'ip_patch_panel_classes', 'ip_cidr_binary_panel', 'ip_cidr_binary_panel_harder', 'ip_subnet_simulator', 'ip_host_power_reactor'].includes(gameplayId)) assert.equal(screen.options.guidedTutorial, true, 'in-game guidance is retained');
        assert.equal(gm.launchTutorialReplay(gameplayId), false, 'duplicate launches are blocked');
        const source = gm.getGameplayQuestSpecs(gameplayId).find((s) => s.tutorial || s.harderIntro);
        assert.equal(screen.options.spec.tutorialSource.mapId, source.mapId);
        assert.equal(calls.dialogue.length, 0, 'replay opens immediately without campaign intro dialogue');
        context.IP2Live.CIDRGameplayState.latest.mask = 'practice';
        const options = gm._tutorialReplaySession.options;
        if (outcome === 'completed') screen.options.onComplete({ passed: true });
        if (outcome === 'failed') screen.options.onFailed({ passed: false, reason: 'attempts_exhausted' });
        if (outcome === 'cancelled') screen.options.onCancel();
        assert.equal(frames.length, 1, gameplayId + ': return to the original map');
        assert.equal(context.Core.Game.current.currentMapID, 18);
        assert.equal(JSON.stringify(context.IP2Live.QuestManager), questBefore);
        assert.equal(context.IP2Live.CIDRGameplayState.latest.mask, '255.255.255.0');
        assert.equal(gm._tutorialReplaySession, null);
        assert.equal(gm._activeGameplayNode, null);
        assert.equal(calls.dialogue.length, 0, 'replay never opens post-completion onboarding');
        assert.equal(calls.discarded, true, 'replay dialogue is discarded on finish');
        assert.equal(calls.music.at(-1), 'stage4');
        assert.equal(calls.overlays.length, outcome === 'failed' ? 1 : 0);
        gm.finishTutorialReplay(gameplayId, options, outcome);
        assert.equal(frames.length, 1, 'duplicate callbacks must not pop the map');
    }
}

async function testReplayPause() {
    const { context, load, gm } = harness();
    const id = 'ip_class_wires';
    context.IP2Live.GameplayManager = { launchWireGameplay(options) {
        const screen = new context.ReplayScreenStub(options);
        gm.prepareTutorialReplayScreen(screen, options);
        context.Manager.Stack.push(screen);
        return true;
    } };
    load('modules/screens/gameplay-pause.js');
    assert.equal(gm.launchTutorialReplay(id), true);
    const replayScreen = gm._tutorialReplaySession.screen;
    replayScreen.connections = { practice: 'A' };
    const pause = context.IP2Live.GameplayPause;
    assert.equal(pause.captureScreen(replayScreen, 'pause'), null);
    assert.equal(pause.findSession(id, replayScreen.options), null);
    assert.equal(replayScreen.connections.practice, 'A', 'pausing retains the live puzzle in memory');
    assert.equal(context.Core.Game.current.ip2liveGameStates.gameplaySessions, undefined);
    pause.activeScreen = replayScreen;
    const menu = new context.window.IP2LiveGameplayPauseMenu(replayScreen);
    menu.initialize();
    assert.equal(menu.menuItems[2].title, 'FINISH TUTORIAL');
    context.Manager.Stack.push(menu);
    gm.saveProgressToActiveSlot = () => assert.fail('finishing a replay must not save a campaign quest exit');
    const result = await pause.exitQuest(replayScreen);
    assert.equal(result.finished, true);
    assert.equal(context.IP2Live.TutorialReplay.session, null);
    assert.equal(context.Manager.Stack.top.id, 18, 'Finish Tutorial returns directly to the current map');
    assert.equal(context.IP2Live.QuestManager.activeQuestId, 'current.quest');
    assert.equal((await pause.exitQuest(replayScreen)).reason, 'no-active-tutorial');
}

{
    const { context, gm, frames, calls } = harness();
    assert.equal(gm.launchTutorialReplay('unknown'), false);
    context.IP2Live.GameplayManager = { launchWireGameplay() { return false; } };
    assert.equal(gm.launchTutorialReplay('ip_class_wires'), true);
    assert.equal(gm._tutorialReplaySession, null);
    assert.equal(gm._activeGameplayNode, null);
    assert.equal(frames.length, 1);
    assert.equal(calls.overlays[0].title, 'TUTORIAL UNAVAILABLE');
}
testReplayPause().then(() => console.log('neural_tutorial_replay.test.cjs: PASS')).catch(error => { console.error(error); process.exitCode = 1; });
