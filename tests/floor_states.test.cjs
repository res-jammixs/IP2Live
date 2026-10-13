const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../Plugins/IP2Live_Core');
const plain = value => JSON.parse(JSON.stringify(value));

function harness(mapId = 3) {
    class MapScene { update() {} drawHUD() {} }
    MapScene.current = null;
    const c = vm.createContext({ console: { log() {}, warn() {} }, window: {}, inject() {},
        setTimeout: () => 1, clearTimeout() {},
        Common: { Platform: { ctx: null }, ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 } },
        Core: { Game: { current: { currentMapID: mapId, ip2liveGameStates: {} } } },
        Scene: { Map: MapScene }, Manager: { Stack: {} }, Data: { Systems: {} }, Graphic: {}, Model: {}, Main: {},
        THREE: { Fog: class { constructor(color, near, far) { Object.assign(this, { color, near, far }); } } }, IP2Live: {},
    });
    const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), c, { filename: file });
    for (const file of ['modules/lighting_manager.js', 'modules/game-state/floor_state_config.js',
        'modules/game-state/game_state_manager.js', 'modules/game-state/darklights_state.js',
        'modules/quest_manager.js', 'modules/game_manager.js', 'modules/game-state/neural_life_force_manager.js']) load(file);
    const ip = c.IP2Live, gm = ip.GameManager, qm = ip.QuestManager, gsm = ip.GameStateManager, lighting = ip.LightingManager;
    gsm.bindGameManager(gm);
    gm._queueCheckpoint = () => false; gm._closeReportAttempt = () => {}; gm._runTimingDialogues = () => false;
    gm._ensureQuestMinimap = () => false;
    let scans = 0, applications = 0;
    const getSpecs = gm.getMapQuestSpecs.bind(gm), apply = lighting.applyPreset.bind(lighting);
    gm.getMapQuestSpecs = id => { scans++; return getSpecs(id); };
    lighting.applyPreset = (...args) => { applications++; return apply(...args); };
    const register = id => {
        const ids = gm.registerStageGameplayQuests(qm, null, { id });
        qm.registerMapQuests(id, ids, { autoStart: true });
        return getSpecs(id);
    };
    const enter = (id, restore = false) => {
        const specs = register(id), scene = new MapScene();
        scene.id = id; scene.loading = false;
        const light = { name: 'NativeSun', intensity: 2, isLight: true, children: [] };
        const fog = { authored: true };
        scene.scene = { children: [light], fog, add(object) { this.children.push(object); object.parent = this; },
            remove(object) { this.children = this.children.filter(child => child !== object); object.parent = null; } };
        c.Core.Game.current.currentMapID = id; MapScene.current = scene; c.Manager.Stack.top = scene;
        if (restore) {
            scene._ip2liveQuestEntryReset = true;
            qm.activeMapId = id;
        } else qm.ensureMapQuestFor(id, scene);
        gm.emit(gm.EVENT.MAP_ENTERED, { mapId: id, scene, context: restore ? { preservePersistentState: true } : {} });
        return { scene, light, fog, specs };
    };
    const complete = spec => {
        qm.startQuest(spec.id, { mapId: spec.mapId, mapQuestMode: true });
        assert.ok(qm.completeObjective(spec.objectiveId));
        gm.handleGameplayCompleted(spec.gameplayId, { spec, mapId: spec.mapId, objectiveId: spec.objectiveId, result: {} });
    };
    const fail = spec => {
        qm.startQuest(spec.id, { mapId: spec.mapId, mapQuestMode: true });
        gm.handleGameplayFailed(spec.gameplayId, { spec, questId: spec.id, objectiveId: spec.objectiveId, mapId: spec.mapId,
            result: { reason: 'attempts_exhausted' }, skipDiagnosticScreen: true });
    };
    return { c, ip, gm, qm, gsm, lighting, enter, complete, fail, register,
        get scans() { return scans; }, get applications() { return applications; } };
}

test('every assigned wire floor shares exact progress across normal, harder and tutorial objectives', () => {
    const expected = new Map([[3, 4], [4, 5], [5, 6], [6, 5]]);
    for (const [id, total] of expected) {
        const h = harness(id), { light, fog, scene, specs } = h.enter(id);
        const wires = specs.filter(spec => ['ip_class_wires', 'ip_class_wires_harder'].includes(spec.gameplayId));
        assert.equal(wires.length, total);
        assert.equal(h.gsm.getFloorDefinition(id).states.darklights.totalObjectives, total);
        assert.equal(h.lighting._overlayAlpha, .88); assert.equal(light.intensity, .4);
        let previousOverlay = .88;
        for (let i = 0; i < wires.length; i++) {
            h.complete(wires[i]);
            const store = h.gsm._darklightsStore(id);
            assert.equal(store.completedCount, i + 1); assert.equal(store.brightnessStep, i + 2);
            assert.equal(store.progress, (i + 1) / total);
            assert.ok(h.lighting._overlayAlpha < previousOverlay);
            assert.ok(Math.abs(light.intensity - (0.2 + .8 * (i + 1) / total) * 2) < 1e-10);
            assert.equal(store.cleared, i + 1 === total);
            previousOverlay = h.lighting._overlayAlpha;
            const applications = h.applications;
            h.gm.handleGameplayCompleted(wires[i].gameplayId, { spec: wires[i] });
            h.gm.emit(h.gm.EVENT.QUEST_OBJECTIVE_COMPLETED, { mapId: id, objectiveId: wires[i].objectiveId });
            assert.equal(h.gsm._darklightsStore(id).completedCount, i + 1, 'duplicate events never add light');
            assert.equal(h.applications, applications, 'duplicate events do not rebuild lighting');
        }
        assert.equal(h.gsm.activeStates.darklights, undefined);
        assert.equal(h.lighting._apertureConfig, null); assert.equal(h.lighting._overlayAlpha, 0);
        assert.equal(scene.scene.fog, fog, 'the authored floor fog is restored');
        assert.equal(Object.keys(h.gsm._darklightsStore(id).completedObjectives).length, total, 'full light retains its evidence');
    }
});

test('finishing only ordinary wires cannot fully light a floor with unfinished harder wires', () => {
    const h = harness(6), { specs } = h.enter(6);
    for (const spec of specs.filter(row => row.gameplayId === 'ip_class_wires')) h.complete(spec);
    const store = h.gsm._darklightsStore(6);
    assert.equal(store.completedCount, 3); assert.equal(store.totalObjectives, 5);
    assert.equal(store.progress, .6); assert.equal(store.cleared, false); assert.ok(h.lighting._overlayAlpha > 0);
});

test('real terminal rollback from Patch Panel removes the preceding harder wire light and replay restores exactly one step', () => {
    const h = harness(5), { specs, light } = h.enter(5);
    for (const spec of specs.filter(row => row.sequence <= 6)) h.complete(spec);
    assert.equal(h.gsm._darklightsStore(5).completedCount, 4);
    const before = light.intensity, applications = h.applications;
    h.fail(specs.find(row => row.sequence === 7));
    assert.equal(h.qm.activeQuestId, specs.find(row => row.sequence === 6).id);
    assert.equal(h.gsm._darklightsStore(5).completedCount, 3);
    assert.ok(light.intensity < before);
    assert.equal(h.applications, applications + 1, 'restart and failure events share one lighting update');
    h.complete(specs.find(row => row.sequence === 6));
    assert.equal(h.gsm._darklightsStore(5).completedCount, 4); assert.equal(light.intensity, before);
    const stable = light.intensity;
    h.fail(specs.find(row => row.sequence === 6)); // The preceding quest is another wire.
    assert.equal(h.gsm._darklightsStore(5).completedCount, 3); assert.ok(light.intensity < stable);
});

test('full light can be undone by a setback; restarting non-wire quests does not dim unrelated repairs', () => {
    const h = harness(4), { specs, light } = h.enter(4);
    for (const spec of specs) h.complete(spec);
    assert.equal(light.intensity, 2); assert.equal(h.gsm._darklightsStore(4).cleared, true);
    const patch = specs.find(spec => spec.sequence === 6);
    h.qm.startQuest(patch.id, { mapId: 4, restart: true });
    assert.equal(light.intensity, 2);
    const last = specs.find(spec => spec.sequence === 7);
    h.qm.startQuest(last.id, { mapId: 4, restart: true });
    assert.equal(h.gsm._darklightsStore(4).cleared, false);
    assert.equal(h.gsm._darklightsStore(4).completedCount, 4); assert.ok(light.intensity < 2);
    h.complete(last); assert.equal(light.intensity, 2);
});

test('save restoration derives light from quests, correcting stale cleared flags and legacy brightness counters', () => {
    const h = harness(6), { specs } = h.enter(6);
    h.complete(specs[0]);
    const snapshot = plain(h.qm.snapshotProgress());
    const store = h.gsm._darklightsStore(6);
    Object.assign(store, { cleared: true, brightnessStep: 6, completedObjectives: {}, progress: 1 });
    h.qm.restoreProgress(snapshot);
    assert.equal(store.completedCount, 1); assert.equal(store.brightnessStep, 2); assert.equal(store.cleared, false);
    const { scene } = h.enter(6, true);
    h.gsm.queueMapStateRestore(scene, 6, { source: 'test-load' });
    scene.loading = true; h.gsm._restoreQueuedMapState(scene);
    assert.ok(scene._ip2livePendingGameStateRestore);
    scene.loading = false; h.gsm._restoreQueuedMapState(scene);
    assert.equal(store.completedCount, 1); assert.equal(store.progress, .2);
    assert.ok(Math.abs(h.lighting._overlayAlpha - .88 * .8) < 1e-10);
    assert.equal(scene._ip2livePendingGameStateRestore, undefined);
});

test('leaving a wire floor restores its light and fog without leaking darkness into other maps', () => {
    const h = harness(3), old = h.enter(3);
    h.complete(old.specs[0]);
    const next = h.enter(7);
    assert.equal(old.light.intensity, 2); assert.equal(old.scene.scene.fog, old.fog);
    assert.equal(next.light.intensity, 2); assert.equal(next.scene.scene.fog, next.fog);
    assert.equal(h.lighting._overlayAlpha, 0); assert.equal(h.gsm.activeStates.darklights, undefined);
    assert.equal(h.gsm._darklightsStore(3).completedCount, 1);
});

test('isolated feature/replay events cannot change a campaign floor or its brightness', () => {
    const h = harness(3), { specs, light } = h.enter(3);
    h.complete(specs[0]);
    const saved = JSON.stringify(h.c.Core.Game.current.ip2liveGameStates), brightness = light.intensity;
    for (const flag of ['practiceMode', 'endlessMode', 'pvpMode', 'developerTest', 'tutorialReplay']) {
        const payload = { mapId: 3, objectiveId: specs[1].objectiveId, gameplayId: specs[1].gameplayId, [flag]: true };
        h.gm.emit(h.gm.EVENT.GAMEPLAY_COMPLETED, payload);
        h.gm.emit(h.gm.EVENT.GAMEPLAY_FAILED, payload);
        h.gm.emit(h.gm.EVENT.QUEST_OBJECTIVE_COMPLETED, payload);
        assert.equal(JSON.stringify(h.c.Core.Game.current.ip2liveGameStates), saved);
    }
    h.ip.PracticeMode = { active: true };
    assert.equal(h.gsm.recordDarklightsRollback('test', 3, specs[0].objectiveId), null);
    assert.equal(h.gsm.resetDarklightsProgress(3), null);
    assert.equal(h.gsm.resetDarklights(3), null);
    assert.equal(h.qm.completedObjectives[specs[0].id][specs[0].objectiveId], true);
    h.ip.PracticeMode.active = false;
    const game = h.c.Core.Game.current; h.c.Core.Game.current = null;
    h.gsm.syncFloorStates(3); h.gm.emit(h.gm.EVENT.MAP_ENTERED, { mapId: 3 });
    h.c.Core.Game.current = game;
    assert.equal(JSON.stringify(game.ip2liveGameStates), saved); assert.equal(light.intensity, brightness);
});

test('newly assigned floors and multi-objective quests are discovered automatically and support other registered states', () => {
    const h = harness(7);
    h.gm.mapGameplayAssignments[7].gameplays.ip_class_wires = [
        { id: 'future.wire-chain', sequence: 1, objectiveSequence: 1, objectiveId: 'future.wire.one' },
        { id: 'future.wire-chain', sequence: 1, objectiveSequence: 2, objectiveId: 'future.wire.two' },
    ];
    h.gsm.floorConfig.levels[7] = { name: 'Future Floor', gameplays: { ip_cidr_binary_panel: ['dataRecovery'] } };
    const progress = [], cleared = [];
    h.gsm.registerState('dataRecovery', { activate(manager, options) { progress.push(options.progress); },
        clear(manager, options) { cleared.push(options); } });
    const { specs } = h.enter(7);
    const definition = h.gsm.getFloorDefinition(7);
    assert.equal(definition.name, 'Future Floor');
    assert.deepEqual(plain(definition.gameplays.ip_class_wires), ['darklights']);
    assert.equal(definition.states.darklights.totalObjectives, 2);
    const chain = specs.find(spec => spec.id === 'future.wire-chain');
    h.qm.startQuest(chain.id, { mapId: 7, mapQuestMode: true });
    h.qm.completeObjective('future.wire.one'); assert.equal(h.gsm._darklightsStore(7).progress, .5);
    h.qm.startQuest(chain.id, { mapId: 7, restart: true }); assert.equal(h.gsm._darklightsStore(7).progress, 0);
    const panels = specs.filter(spec => spec.gameplayId === 'ip_cidr_binary_panel');
    for (const panel of panels) h.complete(panel);
    assert.ok(progress.includes(0) && progress.includes(.2));
    assert.equal(cleared.at(-1).progress, 1); assert.equal(cleared.at(-1).totalObjectives, 5);
    assert.equal(h.gsm.activeStates.dataRecovery, undefined);
    definition.gameplays.ip_class_wires.length = 0;
    assert.equal(h.gsm.getFloorDefinition(7).gameplays.ip_class_wires.length, 1, 'public snapshots cannot mutate the cache');
});

test('idle frames and duplicate events do not scan the curriculum or rebuild Three.js lights', () => {
    const h = harness(6), { scene } = h.enter(6);
    const scans = h.scans, applications = h.applications;
    for (let i = 0; i < 500; i++) { h.gsm.update(scene); h.lighting.update(scene); }
    assert.equal(h.scans, scans); assert.equal(h.applications, applications);
    for (let i = 0; i < 50; i++) h.gsm.syncFloorStates(6);
    assert.equal(h.scans, scans); assert.equal(h.applications, applications);
    const next = h.enter(7); h.lighting.update(next.scene);
    const unlitApplications = h.applications;
    for (let i = 0; i < 500; i++) h.lighting.update(next.scene);
    assert.equal(h.applications, unlitApplications, 'floors without a preset are also cached');
});

test('runtime curriculum/settings edits recalculate the shared denominator and compatibility baseline', () => {
    const h = harness(3), { specs, light } = h.enter(3);
    h.complete(specs[0]);
    h.gm.mapGameplayAssignments[3].gameplays.ip_class_wires_harder = [
        { id: 'additional.harder', sequence: 5, objectiveId: 'additional.harder.objective' },
    ];
    h.gsm.floorConfig.levels[3].states = { darklights: {
        startingDimOverlay: .5, minimumSceneLightMultiplier: .1, baselineBrightnessStep: 2,
    } };
    h.gsm.invalidateFloorStateConfig(3); h.register(3); h.gsm.syncFloorStates(3, { force: true });
    const store = h.gsm._darklightsStore(3);
    assert.equal(store.totalObjectives, 5); assert.equal(store.completedCount, 1);
    assert.equal(store.progress, .2); assert.equal(store.brightnessStep, 3);
    assert.ok(Math.abs(h.lighting._overlayAlpha - .4) < 1e-10);
    assert.ok(Math.abs(light.intensity - .56) < 1e-10);
    assert.deepEqual(plain(h.gsm.getFloorDefinition(3).states.darklights.gameplayIds), ['ip_class_wires', 'ip_class_wires_harder']);
});

test('custom states release the old scene on same-floor reloads and when leaving the floor', () => {
    const h = harness(7), clearContexts = [];
    h.gsm.floorConfig.levels[7] = { gameplays: { ip_cidr_binary_panel: ['dataRecovery'] } };
    h.gsm.registerState('dataRecovery', { activate() {}, clear(manager, context) { clearContexts.push(context); } });
    const first = h.enter(7); h.complete(first.specs[0]);
    const second = h.enter(7, true);
    assert.equal(clearContexts.at(-1).scene, first.scene);
    assert.equal(clearContexts.at(-1).temporary, true);
    assert.equal(h.gsm.activeStates.dataRecovery, true);
    h.enter(8);
    assert.equal(clearContexts.at(-1).scene, second.scene);
    assert.equal(h.gsm.activeStates.dataRecovery, undefined);
    assert.equal(h.c.Core.Game.current.ip2liveGameStates.floorStates.maps['7'].dataRecovery.completedCount, 1);
});
