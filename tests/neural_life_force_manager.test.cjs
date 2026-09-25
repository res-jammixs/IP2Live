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
            if (options && options.restart) this.completedObjectives[questId] = options.completedObjectives || {};
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
            gameplayAssignments: [
                { id: 'wire.tutorial', gameplayId: 'ip_class_wires', mapId: 4, tutorial: true, objectiveId: 'tutorial' },
                { id: 'wire.one', gameplayId: 'ip_class_wires', mapId: 4, objectiveId: 'one' },
            ],
            getAllGameplayAssignments() {
                return this.gameplayAssignments;
            },
            getGameplayQuestSpecs(gameplayId) {
                return this.gameplayAssignments.filter((spec) => spec.gameplayId === gameplayId);
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
    const { manager, game } = createHarness();
    game.ip2liveGameStates.neuralLifeForce.lifeForce = 40;
    const deltas = [];
    const hp = [];
    for (let i = 0; i < 7; i++) {
        const payload = { gameplayId: 'ip_class_wires', questId: 'q' + i, objectiveId: 'o' + i };
        deltas.push(manager.handleCompletion(payload).delta);
        hp.push(manager.getState().lifeForce);
        assert.equal(payload.neuralLifeForceDelta, deltas[i]);
    }
    assert.deepEqual(deltas, [0, 0, 12, 13, 14, 15, 15]);
    assert.deepEqual(hp, [40, 40, 52, 65, 79, 94, 100], 'HP recovery begins on win three and remains capped at 100');

    const first = manager.handleTerminalFailure(terminalFailure());
    assert.equal(manager.getState().lifeForce, 90, 'the first failure immediately removes HP');
    const second = manager.handleTerminalFailure(terminalFailure());
    assert.equal(first.delta, -10);
    assert.equal(second.delta, -12);
    assert.equal(manager.getState().successStreak, 0);
    assert.equal(manager.getState().lifeForce, 78);

    for (const expectedHp of [78, 78, 90]) {
        manager.handleCompletion({ gameplayId: 'ip_class_wires', questId: 'new-win', objectiveId: 'win' });
        assert.equal(manager.getState().lifeForce, expectedHp, 'a failure requires rebuilding the three-win streak');
        assert.equal(manager.getState().failureStreak, 0);
    }
}

{
    const { manager, questManager, starts, overlays, game, IP2Live } = createHarness();
    questManager.mapQuestQueues[4].questIds = ['wire.two'];
    questManager.activeQuestId = 'wire.two';
    questManager.activeObjectiveId = 'two';
    const choices = [];
    IP2Live.GameManager.launchTutorialReplay = (id, data) => { choices.push(id); return true; };
    for (let i = 1; i <= 15; i++) {
        // Isolate warning thresholds from the separately tested game-over rule.
        game.ip2liveGameStates.neuralLifeForce.lifeForce = 100;
        const failure = terminalFailure();
        const response = manager.handleTerminalFailure(failure);
        assert.equal(response.kind, 'retry-first-quest');
        assert.equal(failure.neuralRecoveryHandled, true);
        assert.equal(overlays.length, Math.floor(i / 5));
        assert.equal(manager.getState().gameplayTerminalFailures.ip_class_wires, i);
        manager.handleCompletion({ gameplayId: 'ip_class_wires', questId: 'other', objectiveId: 'other' });
    }
    assert.deepEqual(overlays.map((o) => o.failureCount), [5, 10, 15]);
    assert.equal(starts.length, 15, 'each failure restarts the first quest');
    assert.deepEqual(questManager.completedObjectives['wire.two'], {});
    assert.deepEqual(questManager.completedObjectives['wire.one'], { one: true });
    assert.deepEqual(questManager.completedObjectives['wire.tutorial'], { tutorial: true });
    overlays[0].actions[1].onSelect();
    assert.equal(choices.length, 0);
    overlays[1].actions[0].onSelect();
    assert.deepEqual(choices, ['ip_class_wires']);
    assert.equal(manager.getState().acknowledgedFailureMilestones.ip_class_wires, 15);
    const saved = JSON.parse(JSON.stringify(game.ip2liveGameStates));
    game.ip2liveGameStates = saved;
    manager.handleMapEntered(4);
    assert.equal(overlays.length, 3, 'loading does not re-display acknowledged milestones');
    assert.equal(manager.getState().gameplayTerminalFailures.ip_class_wires, 15);

    game.ip2liveGameStates.neuralLifeForce.pendingTutorialRecovery = { mapId: 3, questId: 'old-tutorial' };
    delete game.ip2liveGameStates.neuralLifeForce.acknowledgedFailureMilestones;
    manager.handleMapEntered(3);
    assert.equal(manager.getState().pendingTutorialRecovery, null);
    assert.equal(manager.getState().gameplayTerminalFailures.ip_class_wires, 15);
    assert.equal(manager.getState().acknowledgedFailureMilestones.ip_class_wires, 15);
    assert.equal(starts.length, 15, 'loading must not restart another quest');
}

{
    // Map 4 interleaves gameplay types. Failure classification follows the
    // failed assignment while quest recovery follows the map's quest order.
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
    IP2Live.GameManager.gameplayAssignments = [
        { id: 'wire.one', gameplayId: 'ip_class_wires', mapId: 4, objectiveId: 'one' },
        { id: 'wire.two', gameplayId: 'ip_class_wires', mapId: 4, objectiveId: 'two' },
        { id: 'patch.tutorial', gameplayId: 'ip_patch_panel_classes', mapId: 4, objectiveId: 'patch.learn', tutorial: true },
        { id: 'patch.normal', gameplayId: 'ip_patch_panel_classes', mapId: 4, objectiveId: 'patch.secure' },
    ];

    const result = manager.handleTerminalFailure({
        // This intentionally conflicts with the assignment to verify that the
        // quest/objective mapping, not the source payload, selects rollback.
        gameplayId: 'ip_class_wires',
        mapId: 4,
        questId: 'patch.normal',
        objectiveId: 'patch.secure',
        spec: { id: 'patch.normal', objectiveId: 'patch.secure', mapId: 4 },
        result: { reason: 'attempts_exhausted' },
    });

    assert.equal(result.kind, 'rollback-previous-quest');
    assert.equal(result.rollbackQuestId, 'wire.two');
    assert.equal(starts.length, 1);
    assert.deepEqual(questManager.completedObjectives['wire.two'], {});
    assert.equal(questManager.completedObjectives['wire.one'].one, true);
    assert.equal(manager.getState().questTerminalFailures['ip_patch_panel_classes::patch.normal::patch.secure'], 1);
}

{
    const { manager, questManager, starts, game } = createHarness();
    game.ip2liveGameStates.neuralLifeForce.lifeForce = 100;
    questManager.activeQuestId = 'wire.two';
    questManager.activeObjectiveId = 'two';

    const fromThird = manager.handleTerminalFailure(terminalFailure());
    assert.equal(fromThird.rollbackQuestId, 'wire.one');
    assert.equal(questManager.activeQuestId, 'wire.one');
    assert.deepEqual(questManager.completedObjectives['wire.one'], {});

    game.ip2liveGameStates.neuralLifeForce.lifeForce = 100;
    const fromSecond = manager.handleTerminalFailure({
        gameplayId: 'ip_class_wires', mapId: 4, questId: 'wire.one', objectiveId: 'one',
        spec: { id: 'wire.one', objectiveId: 'one', mapId: 4 },
        result: { reason: 'attempts_exhausted' },
    });
    assert.equal(fromSecond.rollbackQuestId, 'wire.tutorial');
    assert.equal(questManager.activeQuestId, 'wire.tutorial');
    assert.deepEqual(questManager.completedObjectives['wire.tutorial'], {});
    assert.deepEqual(starts.map((entry) => entry.questId), ['wire.one', 'wire.tutorial']);
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
    assert.equal(starts.length, 0);
    assert.deepEqual(questManager.completedObjectives['wire.tutorial'], { tutorial: true });
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
    const { manager, game, overlays, gameOver } = createHarness();
    game.ip2liveGameStates.neuralLifeForce.successStreak = 2;
    game.ip2liveGameStates.neuralLifeForce.failureStreak = 1;
    const before = manager.getState();
    for (const spec of [{ tutorial: true }, { harderIntro: true }, { tutorialReplay: true }]) {
        manager.handleCompletion({ spec });
        manager.handleTerminalFailure({ spec, result: { reason: 'attempts_exhausted' } });
        assert.deepEqual(manager.getState(), before, 'tutorials change neither HP nor either streak');
    }
    manager.handleTerminalFailure({ gameplayId: 'ip_class_wires', result: { reason: 'wrong_answer' } });
    assert.deepEqual(manager.getState(), before);
    for (const id of ['ip_class_wires', 'ip_class_wires_harder']) {
        game.ip2liveGameStates.neuralLifeForce.lifeForce = 100;
        manager.handleTerminalFailure({ gameplayId: id, result: { reason: 'attempts_exhausted' } });
    }
    assert.equal(manager.getState().gameplayTerminalFailures.ip_class_wires, 1);
    assert.equal(manager.getState().gameplayTerminalFailures.ip_class_wires_harder, 1);
    game.ip2liveGameStates.neuralLifeForce.gameplayTerminalFailures.ip_class_wires = 4;
    game.ip2liveGameStates.neuralLifeForce.lifeForce = 1;
    manager.handleTerminalFailure(terminalFailure());
    assert.equal(gameOver.length, 1);
    assert.equal(overlays.length, 0, 'game over takes precedence over the fifth-failure offer');
    manager.reset();
    assert.deepEqual(manager.getState().gameplayTerminalFailures, {});
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
