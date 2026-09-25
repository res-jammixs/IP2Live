const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const IP2Live = {};
const Core = { Game: { current: { currentMapID: 3 } } };
const Manager = { Stack: {} };
const Scene = { Map: class { drawHUD() {} onMouseUp() { return false; } } };
const scene = Scene.Map.current = new Scene.Map();
scene.id = 3;
const bounds = { left: 40, top: 25, width: 960, height: 540 };
const ctx = { canvas: { width: 1920, height: 1080, getBoundingClientRect: () => bounds } };
const Common = { Platform: { ctx }, ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 } };
const timers = [];
const gameOver = [];
for (const name of ['game_manager.js', 'quest_minimap.js', 'game-state/neural_life_force_manager.js']) {
    const source = fs.readFileSync(path.join(__dirname, '../Plugins/IP2Live_Core/modules', name), 'utf8');
    new Function('IP2Live', 'Core', 'Manager', 'Scene', 'Common', 'window', 'Data', 'setTimeout', source)(
        IP2Live, Core, Manager, Scene, Common, {}, { Systems: {} }, fn => timers.push(fn));
}
IP2Live.NeuralLifeForceGameOver = { show: options => gameOver.push(options) };
const gm = IP2Live.GameManager;
const minimap = IP2Live.QuestMinimap;
const neural = IP2Live.NeuralLifeForce;
minimap._container = { style: {} };
minimap._fallbackHost = { style: {} };
gm._drawDeveloperQuestButton = () => {};
gm._injectMapHooks();

// Every combination packs into a single row, and the minimap follows the
// current flags even before the old canvas hit rectangles are repainted.
const flags = ['enableSingleQuestSkipButton', 'enableQuestFailButton', 'enableQuestSkipButton', 'enableGameOverButton'];
for (const [width, height] of [[1280, 720], [1920, 1080], [960, 540]]) {
    ctx.canvas.width = width;
    ctx.canvas.height = height;
    for (let mask = 0; mask < 16; mask++) {
        flags.forEach((flag, i) => { gm[flag] = !!(mask & (1 << i)); });
        const layout = gm.getQuestHudLayout(ctx, scene);
        assert.equal(layout.buttons.length, flags.filter(flag => gm[flag]).length);
        layout.buttons.forEach((button, i, buttons) => {
            assert.equal(button.w, button.h, 'buttons remain square');
            assert.equal(button.y, 16 * height / 720);
            if (i) assert.ok(button.x > buttons[i - 1].x + buttons[i - 1].w);
            assert.ok(button.y + button.h < layout.y, 'toolbar never overlaps minimap');
        });
        minimap._syncPlacement();
        const style = minimap._fallbackHost.style;
        assert.equal(style.top, Math.round(bounds.top + (mask ? 60 : 16) * bounds.height / 720) + 'px');
        assert.equal(style.left, Math.round(bounds.left + (1280 - 238) * bounds.width / 1280) + 'px');
        assert.equal(style.width, '165px');
    }
}
flags.forEach(flag => { gm[flag] = true; });
gm._drawGameOverButton(ctx, scene);
const oldRect = gm._gameOverButtonRect;
gm.enableDeveloperButtons = false;
minimap._syncPlacement();
assert.equal(minimap._fallbackHost.style.top, '37px', 'master switch removes all reserved toolbar space');
assert.equal(scene.onMouseUp(oldRect.x + 1, oldRect.y + 1), false, 'hidden stale buttons cannot receive clicks');
gm.enableDeveloperButtons = true;

// Dispatch the real game-over action at full and depleted Life Force.
for (const startingLife of [100, 35]) {
    neural.reset();
    Core.Game.current.ip2liveGameStates.neuralLifeForce.lifeForce = startingLife;
    gm._drawGameOverButton(ctx, scene);
    const rect = gm._gameOverButtonRect;
    const before = gameOver.length;
    assert.equal(scene.onMouseUp(rect.x + rect.w / 2, rect.y + rect.h / 2), true);
    assert.equal(neural.getState().lifeForce, 0);
    assert.equal(neural.isRunOver(), true);
    assert.equal(neural.getState().lastChange.delta, -100);
    timers.splice(0).forEach(fn => fn());
    assert.equal(gameOver.length, before + 1, 'opens the real game-over screen once');
    scene.onMouseUp(rect.x + 1, rect.y + 1);
    assert.equal(timers.length, 0, 'repeated clicks cannot reopen game over');
}
neural.reset();
IP2Live.DialogueManager = { isActive: () => true };
assert.equal(gm.simulateGameOver(), false);
IP2Live.DialogueManager.isActive = () => false;
gm._activeGameplayNode = {};
assert.equal(gm.simulateGameOver(), false);
gm._activeGameplayNode = null;
gm.enableGameOverButton = false;
assert.equal(gm.simulateGameOver(), false);
assert.equal(neural.getState().lifeForce, 100, 'unavailable controls cannot mutate Life Force');

console.log('quest HUD layout and developer game-over tests passed');
