const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pluginRoot = path.join(root, 'Plugins', 'IP2Live_Core');

function read(relativePath) {
    return fs.readFileSync(path.join(pluginRoot, relativePath), 'utf8');
}

function loadGameManager() {
    const IP2Live = {};
    const load = new Function(
        'Common', 'Core', 'Data', 'Graphic', 'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'inject', 'window',
        read('modules/game_manager.js') + '\nreturn IP2Live.GameManager;'
    );
    return load(
        {},
        { Game: { current: { currentMapID: 11 } } },
        { Systems: { saveSlots: 9 } },
        {},
        { Stack: {} },
        { Map: { current: null } },
        {},
        {},
        {},
        IP2Live,
        function () {},
        {}
    );
}

function orderedGameplayIds(manager, mapId) {
    const rows = [];
    let registrationIndex = 0;
    for (const catalog of manager.getGameplayCatalog()) {
        for (const spec of catalog.quests || []) {
            if (Number(spec.mapId || catalog.mapId) !== mapId) continue;
            rows.push({
                gameplayId: spec.gameplayId || catalog.gameplayId,
                sequence: Number.isFinite(Number(spec.sequence)) ? Number(spec.sequence) : Number.MAX_SAFE_INTEGER,
                registrationIndex: registrationIndex++,
                spec,
            });
        }
    }
    rows.sort((a, b) => a.sequence - b.sequence || a.registrationIndex - b.registrationIndex);
    return rows;
}

function testStageProgressionCatalog() {
    const manager = loadGameManager();
    assert.deepEqual(
        Array.from(manager.flowConfig.maps[11].gameplayNodes),
        ['ip_host_power_reactor'],
        'Stage 3 Level 1 must contain only Gameplay 4.5'
    );
    assert.deepEqual(
        Array.from(manager.flowConfig.maps[12].gameplayNodes),
        ['ip_host_power_reactor', 'ip_cidr_quarantine'],
        'Stage 3 Level 2 must introduce Gameplay 5 after Gameplay 4.5'
    );
    assert.deepEqual(
        Array.from(manager.flowConfig.maps[13].gameplayNodes),
        ['ip_host_power_reactor', 'ip_cidr_quarantine', 'ip_cidr_quarantine_matrix'],
        'Stage 3 Level 3 must combine Gameplays 4.5, 5, and 6'
    );

    const level1 = orderedGameplayIds(manager, 11);
    const level2 = orderedGameplayIds(manager, 12);
    const level3 = orderedGameplayIds(manager, 13);
    assert.deepEqual(level1.map((row) => row.gameplayId), [
        'ip_host_power_reactor',
        'ip_host_power_reactor',
        'ip_host_power_reactor',
        'ip_host_power_reactor',
        'ip_host_power_reactor',
    ]);
    assert.deepEqual(level2.map((row) => row.gameplayId), [
        'ip_host_power_reactor',
        'ip_host_power_reactor',
        'ip_cidr_quarantine',
        'ip_cidr_quarantine',
        'ip_cidr_quarantine',
    ]);
    assert.deepEqual(level3.map((row) => row.gameplayId), [
        'ip_host_power_reactor',
        'ip_cidr_quarantine',
        'ip_host_power_reactor',
        'ip_cidr_quarantine',
        'ip_cidr_quarantine_matrix',
    ]);

    assert.equal(level1[0].spec.tutorial, true, 'Gameplay 4.5 must be taught at the first Map 11 node');
    assert.equal(level2[2].spec.tutorial, true, 'Gameplay 5 must be introduced only after the two bridge nodes');
    assert.equal(level3[4].spec.tutorial, true, 'Gameplay 6 must be introduced at the last Map 13 node');

    for (const rows of [level1, level2, level3]) {
        const tiles = new Set();
        for (const row of rows) {
            const tile = row.spec.targetTile;
            assert.ok(tile && tile.x >= 0 && tile.x < 35 && tile.z >= 0 && tile.z < 35, 'quest target must be inside its 35x35 map');
            const key = tile.x + ':' + (tile.y || 0) + ':' + tile.z;
            assert.equal(tiles.has(key), false, 'each stage objective must use a unique terminal');
            tiles.add(key);
        }
    }

    for (const mapId of [11, 12, 13]) {
        const quests = {};
        const questManager = {
            registerQuest(quest) { quests[quest.id] = quest; },
        };
        manager._registeredGameplayQuestIds = {};
        const registered = manager.registerStageGameplayQuests(questManager, null, { id: mapId });
        assert.equal(registered.length, 5, 'Map ' + mapId + ' must register five ordered gameplay quests');
        assert.deepEqual(registered, orderedGameplayIds(manager, mapId).map((row) => row.spec.id));
        assert.equal(Object.keys(quests).length, 5);
    }
}

function testLoaderAndTutorialPlacement() {
    const loader = read('code.js');
    const hostGameplay = loader.indexOf("'ip_host_power_gameplay.js'");
    const hostTutorial = loader.indexOf("'ip_host_power_tutorial.js'");
    const hostTool = loader.indexOf("'ip_host_power_tool.js'");
    assert.ok(hostGameplay > loader.indexOf("'gameplay_completion_popup.js'"), 'the shared success popup must load before Gameplay 4.5');
    assert.ok(hostGameplay < hostTutorial && hostTutorial < hostTool, 'Host-Power rules must load before its tutorial and tool');
    assert.ok(hostTool < loader.indexOf("'ip_cidr_quarantine_gameplay.js'"), 'Gameplay 4.5 must be ready before Gameplay 5');

    const gameplay5Tutorial = read('gameplay/gameplay5/CIDRQuarantine/ip_cidr_quarantine_tutorial.js');
    const gameplay6Tutorial = read('gameplay/gameplay6/CIDRQuarantineMatrix/ip_cidr_quarantine_matrix_tutorial.js');
    assert.match(gameplay5Tutorial, /STAGE 3 LEVEL 2 - CIDR Quarantine/);
    assert.doesNotMatch(gameplay5Tutorial, /mapId:\s*11/);
    assert.match(gameplay6Tutorial, /STAGE 3 LEVEL 3 - CIDR Quarantine Matrix/);
    assert.doesNotMatch(gameplay6Tutorial, /mapId:\s*12/);
}

function testHostPowerQuestLifecycle() {
    const pushes = [];
    const completions = [];
    const questEvents = [];
    const IP2Live = {
        MusicManager: {
            ZONE: { GAMEPLAY_1: 'gameplay', STAGE_3: 'stage3', STAGE_1: 'stage1' },
            play() { return true; },
        },
        QuestManager: {
            activeQuestId: null,
            startQuest(id, options) { this.activeQuestId = id; questEvents.push(['start', id, options.mapId]); },
            completeObjective(id) { questEvents.push(['complete', id]); },
        },
        GameManager: {
            handleGameplayCompleted(id, payload) { completions.push([id, payload]); },
            handleGameplayFailed() {},
            handleGameplayCancelled() {},
            handleGameplayMistake() {},
        },
    };
    const Manager = {
        Stack: {
            push(screen) { pushes.push(screen); },
            pop() { questEvents.push(['pop']); },
            requestPaintHUD: false,
        },
        GL: {},
    };
    const load = new Function(
        'Common', 'Core', 'Data', 'Graphic', 'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'inject', 'window',
        read('gameplay/gameplay4_5/HostPowerReactor/ip_host_power_gameplay.js') + '\nreturn IP2Live.HostPowerReactorGameplayManager;'
    );
    const manager = load(
        { ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 } },
        { Game: { current: { currentMapID: 12 } } },
        { Keyboards: {}, Systems: {} },
        {},
        Manager,
        { Base: class {} },
        {},
        {},
        {},
        IP2Live,
        function () {},
        {}
    );
    const spec = {
        id: 'stage.12.mixed.01.host_power',
        objectiveId: 'stabilize_host_power_12_01',
        mapId: 12,
        targetClass: 'C',
        requiredHosts: 126,
    };
    assert.equal(manager.launchHostPowerReactorGameplay({
        spec,
        questId: spec.id,
        objectiveId: spec.objectiveId,
        mapId: 12,
        mode: 'push',
    }), true);
    assert.equal(pushes.length, 1);
    assert.equal(pushes[0].scenario.className, 'C', 'the scenario must consume its quest specification');
    assert.equal(pushes[0].scenario.requiredHosts, 126);

    pushes[0].options.onComplete({ success: true, exponent: 7, targetExponent: 7 });
    assert.deepEqual(questEvents.slice(0, 3), [
        ['pop'],
        ['start', spec.id, 12],
        ['complete', spec.objectiveId],
    ]);
    assert.equal(completions.length, 1);
    assert.equal(completions[0][0], 'ip_host_power_reactor');
    assert.equal(completions[0][1].mapId, 12);
    assert.equal(manager._active, false);
    assert.equal(manager._activeAttempt, null);
}

try {
    testStageProgressionCatalog();
    testLoaderAndTutorialPlacement();
    testHostPowerQuestLifecycle();
    console.log('stage3_gameplay45_progression.test.cjs: PASS');
} catch (error) {
    console.error(error);
    process.exitCode = 1;
}
