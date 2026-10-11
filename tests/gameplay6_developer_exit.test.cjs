const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const plugin = path.join(__dirname, '..', 'Plugins', 'IP2Live_Core');
const args = ['Common', 'Core', 'Data', 'Graphic', 'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'inject', 'window'];

function createTestRun() {
    const map = { name: 'campaign map' }, pause = { name: 'developer pause menu' };
    const scenes = [map, pause];
    const stack = {
        get top() { return scenes.at(-1); },
        push(scene) { scenes.push(scene); },
        replace(scene) { scenes[scenes.length - 1] = scene; },
        pop() { return scenes.pop(); },
    };
    const IP2Live = {};
    const context = [{ ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 } },
        { Game: { current: { currentMapID: 13 } } }, { Systems: {} }, {}, { Stack: stack },
        { Base: class {}, Map: { current: { id: 13 } } }, {}, {}, {}, IP2Live, () => {}, {}];
    for (const file of ['modules/game_manager.js', 'gameplay/common/gameplay_completion_popup.js', 'gameplay/gameplay6/CIDRQuarantineMatrix/ip_cidr_quarantine_matrix_gameplay.js']) {
        new Function(...args, fs.readFileSync(path.join(plugin, file), 'utf8'))(...context);
    }
    const questCalls = [];
    IP2Live.QuestManager = {
        activeQuestId: 'stage.13.campaign.quest',
        startQuest(id) { questCalls.push(['start', id]); throw new Error('Developer test must not start a campaign quest'); },
        completeObjective(id) { questCalls.push(['complete', id]); throw new Error('Developer test must not complete a campaign objective'); },
    };
    IP2Live.GameManager._runTimingDialogues = () => false;
    let loading;
    IP2Live.LoadingScreen2 = { show(options) {
        loading = { name: 'temporary loading screen', options };
        if (options.mode === 'replace') stack.replace(loading);
        else stack.push(loading);
    } };
    IP2Live.ARDiagnosticRewind = { show() { throw new Error('Gameplay 6 must not open diagnostic feedback'); } };
    function launch(testId) {
        assert.equal(IP2Live.GameManager.launchGameplayTest(testId), true);
        assert.equal(stack.top, loading);
        loading.options.onComplete();
        const gameplay = stack.top;
        assert.ok(gameplay instanceof IP2Live.CIDRQuarantineMatrixGameplayScreen);
        assert.equal(scenes.length, 3, 'the gameplay replaces its loader');
        assert.equal(scenes[1], pause, 'the testing menu remains below the game');
        assert.equal(gameplay.options.spec.developerTest, true);
        return gameplay;
    }
    return { IP2Live, stack, scenes, map, pause, questCalls, launch };
}

for (const testId of ['gameplay-6', 'gameplay-6-tutorial']) {
    for (const exit of ['complete', 'failed', 'cancel']) {
        const run = createTestRun(), game = run.launch(testId);
        if (exit === 'complete') {
            game._finishSuccess();
            assert.equal(run.stack.top, game, 'the success popup stays visible before returning');
            run.IP2Live.GameplayCompletionPopup.update(game, Date.now() + 2000);
        }
        else if (exit === 'failed') { game.hearts = 0; game._failOut(); }
        else game._cancel();
        assert.equal(run.stack.top, run.pause, exit + ' returns to the rendered testing menu');
        assert.equal(run.scenes.length, 2, 'no loading screen remains on the stack');
        assert.deepEqual(run.questCalls, []);
        assert.equal(run.IP2Live.QuestManager.activeQuestId, 'stage.13.campaign.quest');
        assert.equal(run.IP2Live.GameManager._activeGameplayNode, null);
        const fresh = run.launch(testId);
        assert.notEqual(fresh, game); assert.equal(fresh.hearts, 3);
        assert.equal(fresh.bossHP, 3); assert.equal(fresh.thinkRemainingMs, 60000);
    }
}

// Campaign failure suppresses AR, while successful campaign play still advances its quest.
{
    const run = createTestRun(); run.stack.pop();
    let failurePayload;
    run.IP2Live.GameManager.handleGameplayFailed = (id, payload) => { failurePayload = payload; };
    const manager = run.IP2Live.CIDRQuarantineMatrixGameplayManager;
    const spec = { id: 'stage.13.campaign.quest', objectiveId: 'clear', mapId: 13 };
    manager.launchCIDRQuarantineMatrixGameplay({ mode: 'push', _fromGameManager: true, spec, questId: spec.id, objectiveId: spec.objectiveId });
    run.stack.top._failOut();
    assert.equal(run.stack.top, run.map);
    assert.equal(failurePayload.skipDiagnosticScreen, true);
    run.IP2Live.QuestManager.completeObjective = id => run.questCalls.push(['complete', id]);
    run.IP2Live.GameManager.handleGameplayCompleted = () => {};
    manager.launchCIDRQuarantineMatrixGameplay({ mode: 'push', _fromGameManager: true, spec, questId: spec.id, objectiveId: spec.objectiveId });
    run.stack.top._finishSuccess();
    run.IP2Live.GameplayCompletionPopup.update(run.stack.top, Date.now() + 2000);
    assert.equal(run.stack.top, run.map);
    assert.deepEqual(run.questCalls, [['complete', 'clear']]);
}

console.log('gameplay6 developer exit tests passed');
