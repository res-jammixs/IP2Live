const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

function moduleSource(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function loadPersistentStateHarness() {
    class MapScene {
        update() {}
        drawHUD() {}
    }
    MapScene.current = null;

    const savedDarklights = {
        mapId: 4,
        brightnessStep: 4,
        maxBrightnessStep: 6,
        dimLevel: 2,
        cleared: false,
        completedObjectives: {
            repair_stage4_ip_wires_01: true,
            repair_stage4_ip_wires_02: true,
            repair_stage4_ip_wires_04: true,
        },
        lastReason: 'stage-one-level-two-wire-success',
        progressInitialized: true,
    };
    const Core = {
        Game: {
            current: {
                currentMapID: 4,
                ip2liveGameStates: {
                    darklights: {
                        maps: { '4': savedDarklights },
                        activeMapId: 4,
                    },
                    securityLight: {
                        maps: {
                            '4': {
                                mapId: 4,
                                strikes: 0,
                                triggered: false,
                                lastFailureAt: null,
                                lastQuestId: null,
                            },
                        },
                    },
                },
            },
        },
    };
    const Scene = { Map: MapScene };
    const applied = [];
    const refreshed = [];
    const presets = [];
    const IP2Live = {
        QuestManager: { completedObjectives: {} },
        LightingManager: {
            setPreset(mapId, preset) {
                presets.push({ mapId, preset });
                return true;
            },
            applyPreset(mapId, scene) {
                applied.push({ mapId, scene });
                return true;
            },
            refresh(scene) {
                refreshed.push(scene);
                return true;
            },
            clearPreset() { return true; },
            clearAperture() { return true; },
        },
    };
    const windowObject = {};
    const load = (source) => new Function(
        'Common', 'Core', 'Data', 'Graphic', 'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'window',
        source
    )(
        { Platform: { ctx: null } }, Core, {}, {}, { Stack: {} }, Scene, {}, {}, {}, IP2Live, windowObject
    );

    load(moduleSource('Plugins/IP2Live_Core/modules/game-state/game_state_manager.js'));
    load(moduleSource('Plugins/IP2Live_Core/modules/game-state/darklights_state.js'));
    return { Core, Scene, IP2Live, savedDarklights, applied, refreshed, presets };
}

function testLoadedMapRehydratesOnlyAfterSceneIsReady() {
    const harness = loadPersistentStateHarness();
    const scene = new harness.Scene.Map();
    scene.id = 4;
    scene.loading = true;
    harness.Scene.Map.current = scene;

    assert.equal(
        harness.IP2Live.GameStateManager.queueMapStateRestore(scene, 4, { slot: 1 }),
        true
    );
    scene.update();
    assert.equal(harness.applied.length, 0, 'lighting must wait until RPG Paper Maker finishes loading the map');
    assert.equal(harness.refreshed.length, 0);

    scene.loading = false;
    scene.update();
    assert.equal(harness.IP2Live.GameStateManager.activeStates.darklights, true);
    assert.equal(harness.applied.length, 1, 'saved darklights must be reactivated on direct slot load');
    assert.equal(harness.refreshed.length, 1, 'the completed Three.js scene must receive a forced refresh');
    assert.equal(harness.presets.at(-1).mapId, 4);
    assert.equal(scene._ip2livePendingGameStateRestore, undefined);
    assert.equal(scene._ip2liveGameStateRestoreApplied.mapId, 4);

    assert.equal(harness.savedDarklights.brightnessStep, 4, 'restore must preserve the saved brightness step');
    assert.equal(harness.savedDarklights.dimLevel, 2, 'restore must preserve the saved dim level');
    assert.deepEqual(Object.keys(harness.savedDarklights.completedObjectives).sort(), [
        'repair_stage4_ip_wires_01',
        'repair_stage4_ip_wires_02',
        'repair_stage4_ip_wires_04',
    ]);

    scene.update();
    assert.equal(harness.applied.length, 1, 'the restore queue must be consumed exactly once');
    assert.equal(harness.refreshed.length, 1);
}

function testCompletedLightingStateDoesNotEraseSavedObjectives() {
    const harness = loadPersistentStateHarness();
    Object.assign(harness.savedDarklights, {
        brightnessStep: 6,
        dimLevel: 0,
        cleared: true,
        completedObjectives: {
            repair_stage4_ip_wires_01: true,
            repair_stage4_ip_wires_02: true,
            repair_stage4_ip_wires_04: true,
            repair_stage4_ip_wires_05: true,
            repair_stage4_ip_wires_07: true,
        },
    });
    const scene = new harness.Scene.Map();
    scene.id = 4;
    scene.loading = false;
    harness.Scene.Map.current = scene;

    harness.IP2Live.GameStateManager.queueMapStateRestore(scene, 4, { slot: 2 });
    scene.update();

    assert.equal(harness.savedDarklights.cleared, true);
    assert.equal(harness.savedDarklights.brightnessStep, 6);
    assert.equal(
        Object.keys(harness.savedDarklights.completedObjectives).length,
        5,
        'loading a completed level must not erase its saved completion evidence'
    );
}

function loadLightingHarness() {
    class MapScene {
        update() {}
        drawHUD() {}
    }
    MapScene.current = null;
    const Scene = { Map: MapScene };
    const Core = { Game: { current: { currentMapID: 4 } } };
    const IP2Live = {};
    const windowObject = {};
    const load = new Function(
        'Common', 'Core', 'Data', 'Graphic', 'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'window',
        moduleSource('Plugins/IP2Live_Core/modules/lighting_manager.js') + '\nreturn IP2Live.LightingManager;'
    );
    const manager = load(
        { Platform: { ctx: null } }, Core, {}, {}, { Stack: {} }, Scene, {}, {}, {}, IP2Live, windowObject
    );
    return { manager, Scene };
}

function testEarlyLightingPresetIsReappliedAfterNativeLightsExist() {
    const { manager, Scene } = loadLightingHarness();
    const threeScene = {
        children: [],
        add(object) {
            object.parent = this;
            this.children.push(object);
        },
        remove(object) {
            this.children = this.children.filter((item) => item !== object);
            object.parent = null;
        },
    };
    const scene = new Scene.Map();
    scene.id = 4;
    scene.loading = true;
    scene.scene = threeScene;
    Scene.Map.current = scene;

    manager.setPreset(4, {
        name: 'Saved state lighting',
        enabled: true,
        dimOverlay: 0.4,
        sceneLightMultiplier: 0.5,
    });
    manager.applyPreset(4, scene);
    assert.equal(manager._reapplyWhenSceneReady, true);

    const nativeLight = {
        name: 'RPGPM_NativeSun',
        type: 'AmbientLight',
        isLight: true,
        intensity: 2,
        children: [],
    };
    threeScene.add(nativeLight);
    scene.loading = false;
    scene.update();

    assert.equal(nativeLight.intensity, 1, 'the post-load pass must dim the actual native map light');
    assert.equal(manager._reapplyWhenSceneReady, false);
    scene.update();
    assert.equal(nativeLight.intensity, 1, 'later frames must not compound the light multiplier');
}

try {
    testLoadedMapRehydratesOnlyAfterSceneIsReady();
    testCompletedLightingStateDoesNotEraseSavedObjectives();
    testEarlyLightingPresetIsReappliedAfterNativeLightsExist();
    console.log('load_resume_game_state.test.cjs: PASS');
} catch (error) {
    console.error(error);
    process.exitCode = 1;
}
