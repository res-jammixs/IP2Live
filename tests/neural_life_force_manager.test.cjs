const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'Plugins', 'IP2Live_Core', 'modules', 'game-state', 'neural_life_force_manager.js'),
    'utf8'
);
const vlsmSource = fs.readFileSync(
    path.join(root, 'Plugins', 'IP2Live_Core', 'gameplay', 'gameplay8', 'VLSMAllocator', 'ip_vlsm_allocator_gameplay.js'),
    'utf8'
);

function createHarness() {
    const starts = [];
    const overlays = [];
    const gameOver = [];
    const questManager = {
        mapQuestQueues: {
            4: { questIds: ['wire.tutorial', 'wire.one', 'wire.two'] },
        },
        quests: {
            'wire.tutorial': {
                id: 'wire.tutorial',
                objectives: [{ id: 'tutorial', neuralGameplayId: 'ip_class_wires', neuralTutorial: true }],
            },
            'wire.one': {
                id: 'wire.one',
                objectives: [{ id: 'one', neuralGameplayId: 'ip_class_wires' }],
            },
            'wire.two': {
                id: 'wire.two',
                objectives: [{ id: 'two', neuralGameplayId: 'ip_class_wires' }],
            },
        },
        completedObjectives: {
            'wire.tutorial': { tutorial: true },
            'wire.one': { one: true },
            'wire.two': { two: true },
        },
        activeMapId: 4,
        startQuest(questId, options) {
            starts.push({ questId, options });
            this.activeQuestId = questId;
            this.activeObjectiveId = this.quests[questId].objectives.find((objective) =>
                !this.completedObjectives[questId][objective.id]
            ).id;
            return true;
        },
        _questPanelRect() {
            return { x: 18, y: 88, w: 430 };
        },
    };
    const game = { currentMapID: 4, ip2liveGameStates: {} };
    const IP2Live = {
        QuestManager: questManager,
        GameStateManager: {
            activeStates: {},
            registerState() { return true; },
            activate() { return true; },
            recordDarklightsRollback() { return {}; },
        },
        GameManager: {
            getGameplayCatalog() {
                return [{
                    gameplayId: 'ip_class_wires',
                    mapId: 4,
                    quests: [
                        { id: 'wire.tutorial', mapId: 4, tutorial: true, objectiveId: 'tutorial' },
                        { id: 'wire.one', mapId: 4, objectiveId: 'one' },
                    ],
                }];
            },
            startMapFlow() { return true; },
        },
        ARDiagnosticRewind: { show(options) { overlays.push(options); return true; } },
        NeuralLifeForceGameOver: { show(options) { gameOver.push(options); return true; } },
    };
    const load = new Function(
        'Core', 'IP2Live', 'Manager', 'Scene', 'window', 'setTimeout', 'console',
        source + '\nreturn IP2Live.NeuralLifeForce;'
    );
    const manager = load(
        { Game: { current: game } },
        IP2Live,
        { Stack: {} },
        { Map: { current: { id: 4 } } },
        {},
        (fn) => { fn(); return 1; },
        { log() {}, warn() {} }
    );
    return { manager, game, questManager, starts, overlays, gameOver, IP2Live };
}

function terminalFailure() {
    return {
        gameplayId: 'ip_class_wires',
        mapId: 4,
        questId: 'wire.two',
        objectiveId: 'two',
        spec: { id: 'wire.two', objectiveId: 'two', mapId: 4 },
        result: { reason: 'attempts_exhausted' },
    };
}

{
    const { manager } = createHarness();
    const deltas = [];
    for (let i = 0; i < 7; i++) {
        const payload = { gameplayId: 'ip_class_wires', questId: 'q' + i, objectiveId: 'o' + i };
        deltas.push(manager.handleCompletion(payload).delta);
    }
    assert.deepEqual(deltas, [10, 11, 12, 13, 14, 15, 15]);

    const first = manager.handleTerminalFailure(terminalFailure());
    const second = manager.handleTerminalFailure(terminalFailure());
    assert.equal(first.delta, -10);
    assert.equal(second.delta, -12);
    assert.equal(manager.getState().successStreak, 0);
}

{
    const { manager, questManager, starts, overlays } = createHarness();
    manager.handleTerminalFailure(terminalFailure());
    manager.handleTerminalFailure(terminalFailure());
    const third = manager.handleTerminalFailure(terminalFailure());

    assert.equal(third.kind, 'tutorial-recovery');
    assert.equal(starts.at(-1).questId, 'wire.tutorial');
    assert.deepEqual(questManager.completedObjectives['wire.tutorial'], {});
    assert.deepEqual(questManager.completedObjectives['wire.one'], {});
    assert.deepEqual(questManager.completedObjectives['wire.two'], {});
    assert.equal(overlays.length, 1);
    assert.equal(manager.getState().questTerminalFailures['ip_class_wires::wire.two::two'], undefined);
}

{
    // Regression: map 4 interleaves wires and patch-panel objectives. Even
    // if a stale launcher reports the wire gameplay id, recovery must use the
    // catalog entry for the failed patch-panel quest and never roll back to a
    // completed wire quest.
    const { manager, questManager, starts, IP2Live } = createHarness();
    questManager.mapQuestQueues[4] = {
        questIds: ['wire.one', 'patch.tutorial', 'wire.two', 'patch.normal'],
    };
    questManager.quests['patch.tutorial'] = {
        id: 'patch.tutorial',
        objectives: [{ id: 'patch.learn', neuralGameplayId: 'ip_class_wires', neuralTutorial: true }],
    };
    questManager.quests['patch.normal'] = {
        id: 'patch.normal',
        objectives: [{ id: 'patch.secure', neuralGameplayId: 'ip_class_wires' }],
    };
    questManager.completedObjectives['patch.tutorial'] = { 'patch.learn': true };
    questManager.completedObjectives['patch.normal'] = { 'patch.secure': true };
    IP2Live.GameManager.getGameplayCatalog = function () {
        return [
            {
                gameplayId: 'ip_class_wires',
                mapId: 4,
                quests: [
                    { id: 'wire.one', mapId: 4, objectiveId: 'one' },
                    { id: 'wire.two', mapId: 4, objectiveId: 'two' },
                ],
            },
            {
                gameplayId: 'ip_patch_panel_classes',
                mapId: 4,
                quests: [
                    { id: 'patch.tutorial', mapId: 4, objectiveId: 'patch.learn', tutorial: true },
                    { id: 'patch.normal', mapId: 4, objectiveId: 'patch.secure' },
                ],
            },
        ];
    };

    const result = manager.handleTerminalFailure({
        // This intentionally conflicts with the catalog to verify that the
        // quest/objective mapping, not the source payload, selects rollback.
        gameplayId: 'ip_class_wires',
        mapId: 4,
        questId: 'patch.normal',
        objectiveId: 'patch.secure',
        spec: { id: 'patch.normal', objectiveId: 'patch.secure', mapId: 4 },
        result: { reason: 'attempts_exhausted' },
    });

    assert.equal(result.kind, 'rollback');
    assert.equal(result.rollbackQuestId, 'patch.tutorial');
    assert.equal(starts.at(-1).questId, 'patch.tutorial');
    assert.equal(manager.getState().questTerminalFailures['ip_patch_panel_classes::patch.normal::patch.secure'], 1);
}

{
    // A tutorial's own attempt limit is a retry of that tutorial, never a
    // fall-through to a gameplay-specific legacy failure handler.
    const { manager, questManager, starts } = createHarness();
    const result = manager.handleTerminalFailure({
        gameplayId: 'ip_class_wires',
        mapId: 4,
        questId: 'wire.tutorial',
        objectiveId: 'tutorial',
        spec: { id: 'wire.tutorial', objectiveId: 'tutorial', mapId: 4, tutorial: true },
        result: { reason: 'attempts_exhausted' },
    });
    assert.equal(result.handled, true);
    assert.equal(result.kind, 'tutorial-retry');
    assert.equal(starts.at(-1).questId, 'wire.tutorial');
    assert.deepEqual(questManager.completedObjectives['wire.tutorial'], {});
}

{
    const { manager, game, gameOver } = createHarness();
    game.ip2liveGameStates.neuralLifeForce.lifeForce = 35;
    const criticalPatch = manager.prepareLaunchOptions('ip_patch_panel_classes', {});
    const criticalHost = manager.prepareLaunchOptions('ip_host_power_reactor', {});
    const tutorialHost = manager.prepareLaunchOptions('ip_host_power_reactor', { spec: { tutorial: true } });
    assert.equal(criticalPatch.speedMultiplier, 1.1);
    assert.equal(criticalHost.durationSeconds, 45);
    assert.equal(tutorialHost.neuralCritical, false);

    game.ip2liveGameStates.neuralLifeForce.lifeForce = 10;
    const finalFailure = manager.handleTerminalFailure(terminalFailure());
    assert.equal(finalFailure.gameOver, true);
    assert.equal(manager.isRunOver(), true);
    assert.equal(gameOver.length, 1);
}

{
    const IP2Live = { VLSMAllocatorGameplayManager: {} };
    const load = new Function(
        'Common', 'Core', 'Data', 'Graphic', 'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'inject', 'window',
        vlsmSource + '\nreturn IP2Live.VLSMAllocatorGameplayScreen;'
    );
    const Screen = load(
        { ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 } }, {}, { Keyboards: {}, Systems: {} }, {},
        { Stack: {}, GL: {} }, { Base: class {} }, {}, {}, {}, IP2Live, function () {}, {}
    );
    const failures = [];
    const screen = Object.assign(Object.create(Screen.prototype), {
        tutorialMode: false,
        validationFailures: 0,
        maxAttempts: 3,
        finished: false,
        state: { mistakeCount: 0 },
        options: {
            onMistake(mistake, done) { done(); },
            onFailed(result) { failures.push(result); },
        },
    });
    screen._recordValidationFailure({ issueType: 'invalid_allocation' });
    screen._recordValidationFailure({ issueType: 'invalid_allocation' });
    assert.equal(failures.length, 0);
    screen._recordValidationFailure({ issueType: 'invalid_allocation' });
    assert.equal(failures.length, 1);
    assert.equal(failures[0].reason, 'attempts_exhausted');
    assert.equal(failures[0].attemptsUsed, 3);

    const tutorialFailures = [];
    const tutorial = Object.assign(Object.create(Screen.prototype), {
        tutorialMode: true,
        validationFailures: 0,
        maxAttempts: Number.MAX_SAFE_INTEGER,
        finished: false,
        state: { mistakeCount: 0 },
        options: {
            onMistake(mistake, done) { done(); },
            onFailed(result) { tutorialFailures.push(result); },
        },
    });
    for (let i = 0; i < 8; i++) tutorial._recordValidationFailure({ issueType: 'invalid_allocation' });
    assert.equal(tutorialFailures.length, 0, 'tutorial validation remains retryable');
}

console.log('neural_life_force_manager.test.cjs passed');
