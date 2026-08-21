const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadManager() {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'Plugins', 'IP2Live_Core', 'modules', 'game_manager.js'),
        'utf8'
    );
    const Core = { Game: { current: null } };
    const Data = { Systems: { saveSlots: 9 } };
    const Scene = { Map: { current: null } };
    const dialogueStarts = [];
    const tutorialActivations = [];
    const queuedMapStateRestores = [];
    const IP2Live = {
        MapManager: {
            stageFor(mapId) {
                return Number(mapId) === 1
                    ? { id: 1, tutorial: true }
                    : { id: Number(mapId), stage: 1, level: Number(mapId) - 2 };
            },
        },
        DialogueManager: {
            queueByTiming(scope, timing) {
                if (timing !== 'after') return [];
                return [Number(scope.mapId) === 1 ? 'tutorial.intro' : 'stage.' + scope.mapId + '.intro'];
            },
            startById(id, context) {
                dialogueStarts.push({ id, context });
                return true;
            },
        },
        Tutorial: {
            activate(options) {
                tutorialActivations.push(options || {});
            },
        },
        GameStateManager: {
            queueMapStateRestore(scene, mapId, options) {
                queuedMapStateRestores.push({ scene, mapId, options });
                return true;
            },
        },
    };
    const load = new Function(
        'Common', 'Core', 'Data', 'Graphic', 'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'inject',
        source + '\nreturn IP2Live.GameManager;'
    );
    const manager = load({}, Core, Data, {}, { Stack: {} }, Scene, {}, {}, {}, IP2Live, function () {});
    return { manager, Core, Scene, IP2Live, dialogueStarts, tutorialActivations, queuedMapStateRestores };
}

function loadMapManager(state) {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'Plugins', 'IP2Live_Core', 'modules', 'map_manager.js'),
        'utf8'
    );
    const dialogueStarts = [];
    const DialogueManager = {
        EVENT: { MAP_ENTER: 'map.enter' },
        dialogues: {},
        mapTriggers: {},
        getDialogue(id) { return this.dialogues[id] || null; },
        registerDialogue(id, definition) { this.dialogues[id] = definition; return true; },
        registerMapTrigger(mapId, trigger) {
            if (!this.mapTriggers[mapId]) this.mapTriggers[mapId] = [];
            this.mapTriggers[mapId].push(trigger);
            return true;
        },
        isActive() { return false; },
        start(id) { dialogueStarts.push(id); return true; },
    };
    const QuestManager = {
        quests: {},
        registerQuest(quest) { this.quests[quest.id] = quest; return true; },
        registerMapQuests() { return true; },
    };
    const IP2Live = {
        DialogueManager,
        QuestManager,
        GameManager: {
            handlesMapIntro() { return false; },
            registerStageGameplayQuests() { return []; },
            isResumingMapFromSave() { return !!state.resuming; },
            hasSeenMapEntryDialogue() { return !!state.seen; },
            markMapEntryDialogueSeen() { state.seen = true; return true; },
            prepareLoadedMapScene(scene) {
                scene._ip2liveStageIntroStarted = true;
                scene._ip2liveEntryDialogueSuppressedForRestore = true;
                state.seen = true;
                return true;
            },
        },
    };
    class MapScene {}
    MapScene.current = null;
    MapScene.prototype.update = function () {};
    const Scene = { Map: MapScene };
    const load = new Function(
        'Common', 'Core', 'Data', 'Graphic', 'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'inject',
        source + '\nreturn IP2Live.MapManager;'
    );
    const previousFetch = global.fetch;
    global.fetch = undefined;
    try {
        const mapManager = load(
            { Platform: { ROOT_DIRECTORY: '' } },
            { Game: { current: {} } },
            { TitlescreenGameover: { isTitleBackgroundVideo: false } },
            {}, { Stack: {} }, Scene, {}, {}, {}, IP2Live, function () {}
        );
        return { mapManager, DialogueManager, dialogueStarts };
    } finally {
        global.fetch = previousFetch;
    }
}

function attachOldSaveRestore(manager, Core, mapId) {
    const game = { currentMapID: mapId };
    Core.Game.current = game;
    const context = manager._buildSlotRestoreContext(2, {
        mapId,
        profileName: 'RESUME_TEST',
        // Deliberately no gameStates: old saves must still be protected.
        questState: { activeMapId: mapId, completedObjectives: {} },
    });
    manager._attachPendingSlotRestore(game, context);
    return game;
}

function testGameplayResumeSkipsOnlyEntryBriefing() {
    const { manager, Core, Scene, dialogueStarts, queuedMapStateRestores } = loadManager();
    const game = attachOldSaveRestore(manager, Core, 3);
    const resumedScene = { id: 3 };
    Scene.Map.current = resumedScene;

    assert.equal(manager._afterWorldTitle(3, { scene: resumedScene }), true);
    assert.equal(dialogueStarts.length, 0, 'resume must not replay the level-entry briefing');
    assert.equal(resumedScene._ip2liveStageIntroStarted, true);
    assert.equal(resumedScene._ip2liveEntryDialogueSuppressedForRestore, true);
    assert.equal(manager.hasSeenMapEntryDialogue(3, game), true, 'old save should be upgraded in memory');
    assert.equal(queuedMapStateRestores.length, 1, 'direct load must queue durable map-state rehydration');
    assert.equal(queuedMapStateRestores[0].scene, resumedScene);
    assert.equal(queuedMapStateRestores[0].mapId, 3);

    delete game._ip2livePendingSlotRestore;
    const reconstructedScene = { id: 3 };
    Scene.Map.current = reconstructedScene;
    manager._afterWorldTitle(3, { scene: reconstructedScene });
    assert.equal(dialogueStarts.length, 0, 'the persisted per-game marker must survive later scene reconstruction');

    const freshGame = { currentMapID: 3 };
    Core.Game.current = freshGame;
    const firstEntryScene = { id: 3 };
    Scene.Map.current = firstEntryScene;
    manager._afterWorldTitle(3, { scene: firstEntryScene });
    assert.equal(dialogueStarts.at(-1).id, 'stage.3.intro', 'a genuine first entry must still show its briefing');

    dialogueStarts.length = 0;
    manager._afterWorldTitle(3, {
        scene: firstEntryScene,
        securityBreachReturn: true,
        returnDialogueId: 'stage1.level1.security.return',
    });
    assert.equal(dialogueStarts.at(-1).id, 'stage1.level1.security.return', 'special return dialogue must not be hidden by the entry marker');

    const restartedGame = { currentMapID: 3 };
    Core.Game.current = restartedGame;
    const restartedScene = { id: 3 };
    Scene.Map.current = restartedScene;
    dialogueStarts.length = 0;
    manager._afterWorldTitle(3, { scene: restartedScene });
    assert.equal(dialogueStarts.at(-1).id, 'stage.3.intro', 'a genuine level restart with a fresh game state must retain first-entry behavior');
}

function testTutorialResumeSkipsStoryButReactivatesTutorial() {
    const { manager, Core, Scene, dialogueStarts, tutorialActivations } = loadManager();
    attachOldSaveRestore(manager, Core, 1);
    const resumedScene = { id: 1 };
    Scene.Map.current = resumedScene;

    manager._afterWorldTitle(1, { scene: resumedScene });
    assert.equal(dialogueStarts.length, 0, 'tutorial story dialogue must not replay on slot resume');
    assert.equal(tutorialActivations.length, 1, 'tutorial controls must still be activated after resume');
    assert.equal(tutorialActivations[0].skipIntro, true);
    assert.equal(tutorialActivations[0].preserveQuestProgress, true);
    assert.equal(tutorialActivations[0].resumeQuestProgress, true);

    const freshGame = { currentMapID: 1 };
    Core.Game.current = freshGame;
    const firstEntryScene = { id: 1 };
    Scene.Map.current = firstEntryScene;
    dialogueStarts.length = 0;
    manager._afterWorldTitle(1, { scene: firstEntryScene });
    assert.equal(dialogueStarts.at(-1).id, 'tutorial.intro', 'new game must still show the tutorial story');
}

async function testCoreOnlySaveStillCreatesResumeGuard() {
    const { manager, Core, Scene, dialogueStarts } = loadManager();
    const game = { currentMapID: 8, infiltratorName: 'LEGACY_CORE_ONLY' };
    Core.Game.current = game;
    manager.getSlotProgressSnapshot = async function () { return null; };

    const restored = await manager.restoreProgressFromSlot(4, game);
    assert.equal(restored.restored, true);
    assert.equal(restored.metadataRestored, false);
    assert.equal(restored.reason, 'core-save-only');
    assert.equal(game._ip2livePendingSlotRestore.mapId, 8);

    const resumedScene = { id: 8 };
    Scene.Map.current = resumedScene;
    manager._afterWorldTitle(8, { scene: resumedScene });
    assert.equal(dialogueStarts.length, 0, 'core-only legacy save must not replay its level briefing');
}

function testDynamicallyRegisteredStageIntroHonorsResumeAndSeenState() {
    const state = { resuming: false, seen: false };
    const { DialogueManager, dialogueStarts } = loadMapManager(state);
    const trigger = DialogueManager.mapTriggers[4].find((item) => item.id === 'stage_intro_4');
    assert.ok(trigger, 'dynamic stage intro trigger should be registered');

    const firstScene = { id: 4 };
    assert.equal(trigger.condition({ scene: firstScene }, DialogueManager), true);
    trigger.action({ scene: firstScene }, DialogueManager);
    assert.equal(dialogueStarts.at(-1), 'stage.4.intro');
    assert.equal(state.seen, true, 'showing a dynamic entry briefing must persist its marker');

    assert.equal(trigger.condition({ scene: { id: 4 } }, DialogueManager), false, 'seen dynamic intro must not replay');
    state.seen = false;
    state.resuming = true;
    assert.equal(trigger.condition({ scene: { id: 4 } }, DialogueManager), false, 'slot resume must suppress the delayed dynamic trigger too');
}

const previousWindow = global.window;
global.window = {};
Promise.resolve()
    .then(testGameplayResumeSkipsOnlyEntryBriefing)
    .then(testTutorialResumeSkipsStoryButReactivatesTutorial)
    .then(testCoreOnlySaveStillCreatesResumeGuard)
    .then(testDynamicallyRegisteredStageIntroHonorsResumeAndSeenState)
    .then(() => console.log('load_resume_dialogue_guards.test.cjs: PASS'))
    .finally(() => { global.window = previousWindow; })
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
