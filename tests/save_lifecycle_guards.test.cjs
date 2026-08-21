const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function loadGameManager() {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'Plugins', 'IP2Live_Core', 'modules', 'game_manager.js'),
        'utf8'
    );
    const Core = { Game: { current: null } };
    const Data = { Systems: { saveSlots: 9 } };
    const IP2Live = {};
    const load = new Function(
        'Common', 'Core', 'Data', 'Graphic', 'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'inject',
        source + '\nreturn IP2Live.GameManager;'
    );
    const manager = load({}, Core, Data, {}, {}, { Map: {} }, {}, {}, {}, IP2Live, function () {});
    return { manager, Core };
}

async function testSaveSlotOwnershipAndQueue() {
    const previousWindow = global.window;
    global.window = {};
    try {
        const { manager, Core } = loadGameManager();
        const loadedGame = {};
        Core.Game.current = loadedGame;
        assert.equal(manager.setActiveSaveSlot(2), true);
        assert.equal(manager._hasExplicitSaveSlot(), true);
        assert.equal(manager.getActiveSaveSlot(loadedGame), 2);

        const freshGame = {};
        Core.Game.current = freshGame;
        assert.equal(manager._hasExplicitSaveSlot(), false, 'a fresh Core.Game must not inherit another game\'s slot');

        manager.startTutorialFlow = function () { return true; };
        manager.startNewGameFlow('TESTER');
        assert.equal(manager.getActiveSaveSlot(loadedGame), null);
        assert.equal(loadedGame._ip2liveSaveSlot, undefined);

        manager.setActiveSaveSlot(3, freshGame);
        const temporaryLoadedGame = { _ip2liveSaveSlot: 8 };
        Core.Game.current = temporaryLoadedGame;
        assert.equal(manager._hasExplicitSaveSlot(), false, 'slot enumeration must not activate checkpoints');

        const noSlotCheckpoint = await manager._saveProgressToActiveSlotNow(null, null, {
            checkpointReason: 'periodic_60_seconds',
        });
        assert.equal(noSlotCheckpoint.reason, 'no-explicit-save-slot');

        const checkpointGame = { currentMapID: 3 };
        Core.Game.current = checkpointGame;
        manager.setActiveSaveSlot(4, checkpointGame);
        let finishSnapshotRead;
        manager.getSlotProgressSnapshot = function () {
            return new Promise((resolve) => { finishSnapshotRead = resolve; });
        };
        const staleCheckpoint = manager._saveProgressToActiveSlotNow(null, null, {
            checkpointReason: 'periodic_60_seconds',
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        Core.Game.current = { currentMapID: 1 };
        finishSnapshotRead(null);
        assert.equal((await staleCheckpoint).reason, 'game-changed-before-save');

        manager._saveQueue = null;
        let concurrent = 0;
        let maximumConcurrent = 0;
        const order = [];
        manager._saveProgressToActiveSlotNow = async function (_slot, saveName) {
            concurrent++;
            maximumConcurrent = Math.max(maximumConcurrent, concurrent);
            order.push('start:' + saveName);
            await new Promise((resolve) => setTimeout(resolve, 12));
            order.push('end:' + saveName);
            concurrent--;
            return { saved: true, saveName };
        };

        const first = manager.saveProgressToActiveSlot(1, 'FIRST');
        const second = manager.saveProgressToActiveSlot(1, 'SECOND');
        await Promise.all([first, second]);
        assert.equal(maximumConcurrent, 1);
        assert.deepEqual(order, ['start:FIRST', 'end:FIRST', 'start:SECOND', 'end:SECOND']);
    } finally {
        global.window = previousWindow;
    }
}

async function testPauseQuitAwaitsShutdownCheckpoint() {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'Plugins', 'IP2Live_Core', 'modules', 'screens', 'pause-menu.js'),
        'utf8'
    );
    const previousWindow = global.window;
    global.window = {};
    try {
        const calls = [];
        const Common = {
            Platform: {
                quit() { calls.push('quit'); },
            },
        };
        const Core = { Game: { current: { infiltratorName: 'TESTER' } } };
        const Data = { Keyboards: {}, Systems: {} };
        const Scene = { Base: class {}, Map: class {} };
        const IP2Live = {
            GameManager: {
                async prepareForShutdown(reason) {
                    calls.push('prepare:' + reason);
                    await new Promise((resolve) => setTimeout(resolve, 12));
                    calls.push('prepared');
                },
            },
            confirPopup: {
                show(options) { options.onConfirm(); },
            },
        };
        const load = new Function(
            'Common', 'Core', 'Data', 'Graphic', 'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'inject',
            source + '\nreturn window.IP2LivePauseMenu;'
        );
        const PauseMenu = load(Common, Core, Data, {}, {}, Scene, {}, {}, {}, IP2Live, function () {});
        const menu = new PauseMenu();
        menu._openQuitConfirmation();
        assert.deepEqual(calls, ['prepare:pause_menu_quit']);
        await new Promise((resolve) => setTimeout(resolve, 25));
        assert.deepEqual(calls, ['prepare:pause_menu_quit', 'prepared', 'quit']);
    } finally {
        global.window = previousWindow;
    }
}

Promise.resolve()
    .then(testSaveSlotOwnershipAndQueue)
    .then(testPauseQuitAwaitsShutdownCheckpoint)
    .then(() => console.log('save_lifecycle_guards.test.cjs: PASS'))
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
