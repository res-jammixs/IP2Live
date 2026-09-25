const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const plugin = path.join(__dirname, '..', 'Plugins', 'IP2Live_Core');
function harness(mapId) {
    const IP2Live = {};
    const Common = { ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 } };
    const Core = { Game: { current: { currentMapID: mapId } } };
    const Manager = { Stack: {} };
    const Scene = { Map: class { update() {} drawHUD() {} onMouseUp() { return false; } } };
    const scene = Scene.Map.current = new Scene.Map();
    scene.id = mapId;
    for (const file of ['modules/game_manager.js', 'modules/quest_manager.js', 'modules/game-state/neural_life_force_manager.js']) {
        new Function('Common', 'Core', 'Data', 'Graphic', 'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'inject', 'window',
            fs.readFileSync(path.join(plugin, file), 'utf8'))(
            Common, Core, { Systems: {} }, {}, Manager, Scene, {}, {}, {}, IP2Live, () => {}, {});
    }
    const gm = IP2Live.GameManager;
    const qm = IP2Live.QuestManager;
    const neural = IP2Live.NeuralLifeForce;
    const ids = gm.registerStageGameplayQuests(qm, null, { id: mapId });
    qm.registerMapQuests(mapId, ids);
    gm._queueCheckpoint = () => {};
    gm._closeReportAttempt = () => {};
    gm._drawDeveloperQuestButton = () => {};
    gm._injectMapHooks();
    const failures = [];
    gm.on(gm.EVENT.GAMEPLAY_FAILED, data => failures.push(data));
    function start(index, objectiveIndex = 0) {
        neural.reset();
        qm.completedObjectives = {};
        ids.forEach((id, i) => {
            qm.completedObjectives[id] = {};
            qm.quests[id].objectives.forEach((o, j) => {
                if (i < index || (i === index && j < objectiveIndex)) qm.completedObjectives[id][o.id] = true;
            });
        });
        qm.startQuest(ids[index], { mapId, mapQuestMode: true, visible: true, guideActive: true, allowCompletion: true });
    }
    function click(width = 1280, height = 720) {
        gm._drawQuestFailButton({ canvas: { width, height } }, scene);
        const rect = gm._questFailButtonRect;
        assert.equal(rect.active, true);
        assert.equal(scene.onMouseUp(rect.x + rect.w / 2, rect.y + rect.h / 2), true);
    }
    return { gm, qm, neural, ids, Core, failures, start, click };
}

// Exercise real assignments, quest registration, mouse hook, failure handling,
// and quest advancement together, including tutorials in the middle of levels.
const maps = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 17];
for (const mapId of maps) {
    const h = harness(mapId);
    for (let i = 0; i < h.ids.length; i++) {
        for (let j = 0; j < h.qm.quests[h.ids[i]].objectives.length; j++) {
            h.start(i, j);
            h.click(i % 2 ? 1920 : 960, i % 2 ? 1080 : 540);
            const expected = h.ids[Math.max(0, i - 1)];
            assert.equal(h.qm.activeQuestId, expected, `map ${mapId}, quest ${i + 1}, objective ${j + 1}`);
            assert.equal(h.qm.activeObjectiveId, h.qm.quests[expected].objectives[0].id);
            assert.deepEqual(h.qm.completedObjectives[expected], {});
            assert.equal(h.neural.getState().lifeForce, 90, 'developer simulation models a campaign failure even on a tutorial assignment');
            assert.equal(h.qm.activeMapId, mapId);
            assert.equal(h.Core.Game.current.currentMapID, mapId);
        }
    }
}

{
    const h = harness(4);
    h.start(3);
    for (const expectedIndex of [2, 1, 0, 0]) {
        h.click();
        assert.equal(h.qm.activeQuestId, h.ids[expectedIndex], 'repeated failures pass the mid-level tutorial and stop at quest one');
    }
    h.qm.completeObjective(h.qm.activeObjectiveId);
    assert.equal(h.qm.activeQuestId, h.ids[1], 'only a successful completion advances from the first quest');
}

{
    const h = harness(4);
    h.start(2); // The real patch-panel tutorial remains penalty-free.
    const spec = h.gm.getAllGameplayAssignments().find(s => s.id === h.ids[2]);
    const before = h.neural.getState();
    h.gm.handleGameplayFailed(spec.gameplayId, { spec, mapId: 4, questId: spec.id, result: { reason: 'attempts_exhausted' } });
    assert.equal(h.qm.activeQuestId, h.ids[2]);
    assert.deepEqual(h.neural.getState(), before);
}

console.log('developer quest failure integration tests passed');
