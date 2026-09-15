const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'Plugins', 'IP2Live_Core', 'modules', 'game_manager.js'),
    'utf8'
);

function loadGameManager() {
    const IP2Live = {};
    const load = new Function(
        'Common', 'Core', 'Data', 'Graphic', 'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'inject', 'window',
        source + '\nreturn IP2Live.GameManager;'
    );
    return load(
        {}, { Game: { current: { currentMapID: 3 } } }, { Systems: { saveSlots: 9 } }, {}, { Stack: {} },
        { Map: { current: null } }, {}, {}, {}, IP2Live, function () {}, {}
    );
}

const manager = loadGameManager();

for (const gameplay of manager.getGameplayCatalog()) {
    assert.equal(Object.hasOwn(gameplay, 'quests'), false, gameplay.gameplayId + ' metadata must not own map quests');
    assert.equal(Object.hasOwn(gameplay, 'mapId'), false, gameplay.gameplayId + ' metadata must not own map placement');
}

assert.deepEqual(manager.getMapGameplayIds(4), [
    'ip_class_wires',
    'ip_patch_panel_classes',
]);
assert.deepEqual(manager.getMapGameplayIds(6), [
    'ip_class_wires',
    'ip_patch_panel_classes',
    'ip_class_wires_harder',
]);
assert.deepEqual(manager.getMapGameplayIds(14), [], 'unfinished maps should explicitly expose no gameplay assignments');

const map4 = manager.getMapGameplayAssignments(4);
assert.equal(map4.mapId, 4);
assert.equal(map4.gameplays.length, 2);
for (const gameplay of map4.gameplays) {
    for (const quest of gameplay.quests) {
        assert.equal(quest.mapId, 4);
        assert.equal(quest.gameplayId, gameplay.gameplayId);
    }
}

const map8Quests = manager.getMapQuestSpecs(8);
assert.equal(map8Quests.length, 5);
for (const quest of map8Quests) {
    assert.equal(quest.objectives.length, 2, quest.id + ' must retain both chained gameplays');
    assert.deepEqual(Array.from(quest.objectives, (objective) => objective.gameplayId), [
        'ip_cidr_binary_panel',
        'ip_subnet_simulator',
    ]);
    assert.deepEqual(Array.from(quest.objectives, (objective) => objective.objectiveSequence), [1, 2]);
}

const registered = {};
assert.deepEqual(
    manager.registerStageGameplayQuests({ registerQuest(quest) { registered[quest.id] = quest; } }, null, { id: 8 }),
    map8Quests.map((quest) => quest.id)
);
assert.equal(Object.keys(registered).length, 5);
assert.equal(registered['stage.8.cidr_chain.01'].objectives.length, 2);
assert.deepEqual(
    Array.from(registered['stage.8.cidr_chain.01'].objectives, (objective) => objective.neuralGameplayId),
    ['ip_cidr_binary_panel', 'ip_subnet_simulator']
);

const validation = manager.validateGameplayAssignments();
assert.equal(validation.valid, true, validation.errors.join('\n'));
assert.deepEqual(validation.errors, []);
assert.deepEqual(validation.warnings, []);
assert.equal(validation.gameplayCount, 11);
assert.equal(validation.objectiveCount, manager.getAllGameplayAssignments().length);

const stateSource = fs.readFileSync(
    path.join(root, 'Plugins', 'IP2Live_Core', 'modules', 'game-state', 'game_state_manager.js'),
    'utf8'
);
const stateIP2Live = { GameManager: manager };
const loadGameStateManager = new Function(
    'Common', 'Core', 'Data', 'Graphic', 'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'inject', 'window',
    stateSource + '\nreturn IP2Live.GameStateManager;'
);
const GameMapScene = class {};
const gameStateManager = loadGameStateManager(
    {}, { Game: { current: { currentMapID: 5 } } }, {}, {}, { Stack: {} }, { Map: GameMapScene },
    {}, {}, {}, stateIP2Live, function () {}, {}
);
const darklightsMap5 = gameStateManager._darklightsConfigForMap(5);
assert.deepEqual(Array.from(darklightsMap5.objectives), [
    'repair_stage5_ip_wires_01',
    'repair_stage5_ip_wires_harder_04_tutorial',
    'repair_stage5_ip_wires_05',
    'repair_stage5_ip_wires_harder_06',
    'repair_stage5_ip_wires_harder_09',
    'repair_stage5_ip_wires_harder_10',
]);
assert.equal(
    darklightsMap5.quests.some((quest) => quest.questId === 'stage.5.ip_wires_harder.01.tutorial'),
    false,
    'stale pre-mixed-map quest IDs must not leak into runtime state'
);

console.log('game_manager_map_assignments.test.cjs: PASS');
