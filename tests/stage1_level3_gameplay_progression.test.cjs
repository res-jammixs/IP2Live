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
        {}, { Game: { current: { currentMapID: 5 } } }, { Systems: { saveSlots: 9 } }, {}, { Stack: {} },
        { Map: { current: null } }, {}, {}, {}, IP2Live, function () {}, {}
    );
}

function orderedGameplayRows(manager, mapId) {
    return manager.getMapQuestSpecs(mapId).map((spec, registrationIndex) => ({
        gameplayId: spec.gameplayId,
        sequence: Number(spec.sequence),
        registrationIndex,
        spec,
    }));
}

function blockedMapTiles(mapId) {
    const mapDirectory = path.join(root, 'Maps', 'MAP' + String(mapId).padStart(4, '0'));
    const mapInfo = JSON.parse(fs.readFileSync(path.join(mapDirectory, 'infos.json'), 'utf8'));
    const blocked = new Set();
    for (const filename of fs.readdirSync(mapDirectory)) {
        const parts = filename.split('_');
        if (parts.length !== 3 || parts[1] !== '0' || !parts[2].endsWith('.json')) continue;
        const chunkX = Number(parts[0]);
        const chunkZ = Number(parts[2].slice(0, -'.json'.length));
        if (!Number.isFinite(chunkX) || !Number.isFinite(chunkZ)) continue;
        const chunk = JSON.parse(fs.readFileSync(path.join(mapDirectory, filename), 'utf8'));
        for (const group of ['walls', 'moun', 'objs3d', 'objs', 'sprites']) {
            for (const entry of chunk[group] || []) {
                const key = entry && entry.k;
                if (!Array.isArray(key) || key.length < 4) continue;
                const x = Math.floor(Number(key[0])) + chunkX * 16;
                const z = Math.floor(Number(key[3])) + chunkZ * 16;
                if (x >= 0 && z >= 0 && x < mapInfo.l && z < mapInfo.w) blocked.add(x + ':' + z);
            }
        }
    }
    return { width: Number(mapInfo.l), height: Number(mapInfo.w), blocked };
}

function reachableTiles(map, spawn) {
    const key = (x, z) => x + ':' + z;
    const reachable = new Set();
    const queue = [];
    if (!map.blocked.has(key(spawn.x, spawn.z))) {
        reachable.add(key(spawn.x, spawn.z));
        queue.push({ x: spawn.x, z: spawn.z });
    }
    for (let index = 0; index < queue.length; index++) {
        const current = queue[index];
        for (const offset of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const x = current.x + offset[0];
            const z = current.z + offset[1];
            const tileKey = key(x, z);
            if (x < 0 || z < 0 || x >= map.width || z >= map.height || map.blocked.has(tileKey) || reachable.has(tileKey)) continue;
            reachable.add(tileKey);
            queue.push({ x, z });
        }
    }
    return reachable;
}

const manager = loadGameManager();
const rows = orderedGameplayRows(manager, 5);

assert.deepEqual(manager.getMapGameplayIds(5), [
    'ip_class_wires',
    'ip_patch_panel_classes',
    'ip_class_wires_harder',
]);
assert.deepEqual(rows.map((row) => row.sequence), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
assert.deepEqual(rows.map((row) => row.gameplayId), [
    'ip_class_wires',
    'ip_patch_panel_classes',
    'ip_patch_panel_classes',
    'ip_class_wires_harder',
    'ip_class_wires',
    'ip_class_wires_harder',
    'ip_patch_panel_classes',
    'ip_patch_panel_classes',
    'ip_class_wires_harder',
    'ip_class_wires_harder',
]);
assert.equal(rows[3].spec.tutorial, true, 'the fourth quest introduces the harder wire mode');
assert.equal(rows.filter((row) => row.spec.tutorial).length, 1, 'only the harder wire introduction is a tutorial');

const registeredQuests = {};
manager._registeredGameplayQuestIds = {};
const registered = manager.registerStageGameplayQuests({
    registerQuest(quest) { registeredQuests[quest.id] = quest; },
}, null, { id: 5 });
assert.deepEqual(registered, rows.map((row) => row.spec.id));
assert.equal(Object.keys(registeredQuests).length, 10);

const map = blockedMapTiles(5);
const reachable = reachableTiles(map, manager.flowConfig.maps[5].spawn);
const targets = new Set();
for (const row of rows) {
    const tile = row.spec.targetTile;
    const key = tile.x + ':' + tile.z;
    assert.ok(tile.x >= 0 && tile.x < map.width && tile.z >= 0 && tile.z < map.height, 'target must be inside Stage 1 Level 3');
    assert.equal(map.blocked.has(key), false, row.spec.id + ' must not be placed on collision');
    assert.equal(reachable.has(key), true, row.spec.id + ' must be reachable from the Level 3 spawn');
    assert.equal(targets.has(key), false, 'each Level 3 quest needs its own target tile');
    targets.add(key);
}

console.log('stage1_level3_gameplay_progression.test.cjs: PASS');
