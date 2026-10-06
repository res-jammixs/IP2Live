const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const plugin = path.join(__dirname, '..', 'Plugins', 'IP2Live_Core');
const args = ['Common', 'Core', 'Data', 'Graphic', 'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'inject', 'window'];

function createTestRun() {
    const map = { name: 'campaign map' };
    const pause = { name: 'developer pause menu' };
    const scenes = [map, pause];
    const stack = {
        get top() { return scenes[scenes.length - 1]; },
        push(scene) { scenes.push(scene); },
        replace(scene) { scenes[scenes.length - 1] = scene; },
        pop() { return scenes.pop(); },
    };
    const IP2Live = {};
    const Common = { ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 } };
    const Core = { Game: { current: { currentMapID: 12 } } };
    const Data = { Systems: {} };
    const Manager = { Stack: stack };
    const Scene = { Base: class {}, Map: { current: { id: 12 } } };
    const window = {};
    const context = [Common, Core, Data, {}, Manager, Scene, {}, {}, {}, IP2Live, () => {}, window];
    const load = (relative) => new Function(...args, fs.readFileSync(path.join(plugin, relative), 'utf8'))(...context);
    load('gameplay/common/ip_cidr_tools.js');
    load('modules/game_manager.js');
    load('gameplay/gameplay5/CIDRQuarantine/ip_cidr_quarantine_gameplay.js');

    const questCalls = [];
    IP2Live.QuestManager = {
        activeQuestId: 'stage.12.campaign.quest',
        startQuest(id) { questCalls.push(['start', id]); throw new Error('Developer test must not start a campaign quest'); },
        completeObjective(id) { questCalls.push(['complete', id]); throw new Error('Developer test must not complete a campaign objective'); },
    };
    IP2Live.GameManager._runTimingDialogues = () => false;
    let loading = null;
    IP2Live.LoadingScreen2 = {
        show(options) {
            loading = { name: 'temporary loading screen', options };
            if (options.mode === 'replace') stack.replace(loading);
            else stack.push(loading);
        },
    };
    function launch(testId) {
        assert.equal(IP2Live.GameManager.launchGameplayTest(testId), true);
        assert.equal(stack.top, loading, 'the test first opens the loading screen');
        loading.options.onComplete();
        const gameplay = stack.top;
        assert.ok(gameplay instanceof IP2Live.CIDRQuarantineGameplayScreen);
        assert.equal(scenes.length, 3, 'the gameplay replaces the temporary loading screen');
        assert.equal(scenes[1], pause, 'the pause menu remains available when gameplay closes');
        assert.equal(gameplay.options.spec.developerTest, true);
        return gameplay;
    }
    return { IP2Live, stack, scenes, map, pause, questCalls, launch };
}

{
    const run = createTestRun();
    const gameplay = run.launch('gameplay-5');
    gameplay.options.onComplete({ passed: true });
    assert.equal(run.stack.top, run.pause, 'finishing the test returns to a rendered menu');
    assert.deepEqual(run.questCalls, [], 'finishing must not look up the synthetic test quest');
    assert.equal(run.IP2Live.QuestManager.activeQuestId, 'stage.12.campaign.quest');
    assert.equal(run.IP2Live.GameManager._activeGameplayNode, null);
}

{
    const run = createTestRun();
    const gameplay = run.launch('gameplay-5-tutorial');
    run.stack.push({ sourceScreen: gameplay, name: 'gameplay pause overlay' });
    run.stack.pop(); // Shared pause handler closes its overlay before cancelling the puzzle.
    gameplay._cancel();
    assert.equal(run.stack.top, run.pause, 'quitting the test returns to a rendered menu');
    assert.deepEqual(run.questCalls, [], 'quitting must not alter the campaign quest');
    assert.equal(run.IP2Live.GameManager._activeGameplayNode, null);
}

for (const id of ['gameplay-5', 'gameplay-5-tutorial']) {
    const run = createTestRun();
    const gameplay = run.launch(id);
    run.IP2Live.ARDiagnosticRewind = { show() { throw new Error('No AR screen should open at the end'); } };
    gameplay._applyVirusOverrunFailure();
    assert.equal(gameplay.finished, true);
    assert.equal(run.stack.top.name, 'temporary loading screen', 'timeout uses loading screen 2');
    run.stack.top.options.onComplete();
    assert.equal(run.stack.top, run.pause, 'a timeout returns to the testing panel without restarting');
    assert.equal(run.IP2Live.GameManager._activeGameplayNode, null);
    assert.deepEqual(run.questCalls, []);
    const restarted = run.launch(id);
    assert.notEqual(restarted, gameplay, 'the next test creates a fresh screen');
    assert.equal(restarted.questElapsedMs, 0);
    assert.equal(restarted.classMistakes, 0);
}

{
    const run = createTestRun();
    run.stack.pop(); // Launch from the campaign floor, without a testing panel.
    let failurePayload;
    run.IP2Live.GameManager.handleGameplayFailed = (id, payload) => { failurePayload = payload; };
    run.IP2Live.CIDRQuarantineGameplayManager.launchCIDRQuarantineGameplay({
        mode: 'push', spec: { id: 'stage.12.campaign.quest', mapId: 12, profile: { index: 1 } },
    });
    run.stack.top._applyVirusOverrunFailure();
    assert.equal(run.stack.top.name, 'temporary loading screen');
    run.stack.top.options.onComplete();
    assert.equal(run.stack.top, run.map, 'campaign failure returns directly to the floor');
    assert.equal(failurePayload.skipDiagnosticScreen, true, 'the terminal failure must suppress AR offers');
}

console.log('gameplay5 developer exit tests passed');
