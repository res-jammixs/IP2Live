const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'Plugins', 'IP2Live_Core', 'modules', 'game-state', 'neural_life_force_manager.js'),
    'utf8'
);

function createHarness() {
    const game = { currentMapID: 3, ip2liveGameStates: {} };
    const IP2Live = {
        GameStateManager: {
            activeStates: {},
            registerState() { return true; },
            activate() { return true; },
        },
        QuestManager: {
            visible: false,
            suppressedByDialogue: false,
            activeQuestId: 'stage.3.ip_wires.01.tutorial',
            activeObjectiveId: 'repair_ip_wires_01',
            currentQuest() { return { id: this.activeQuestId }; },
            currentObjective() { return { id: this.activeObjectiveId }; },
            _questPanelRect() { return { x: 18, y: 88, w: 430, h: 126 }; },
        },
    };
    const load = new Function(
        'Core', 'IP2Live', 'Manager', 'Scene', 'window', 'setTimeout', 'console',
        source + '\nreturn IP2Live.NeuralLifeForce;'
    );
    const manager = load(
        { Game: { current: game } },
        IP2Live,
        { Stack: {} },
        { Map: { current: { id: 3 } } },
        {},
        function (callback) { callback(); return 1; },
        { log() {}, warn() {} }
    );
    return { manager, state: manager._state(), questManager: IP2Live.QuestManager };
}

function createContext() {
    const text = [];
    const gradientStops = [];
    let bezierCalls = 0;
    return {
        canvas: { width: 1280, height: 720 },
        text,
        gradientStops,
        get bezierCalls() { return bezierCalls; },
        save() {}, restore() {}, beginPath() {}, closePath() {}, clip() {},
        moveTo() {}, lineTo() {}, bezierCurveTo() { bezierCalls++; }, rect() {}, arc() {}, fill() {}, stroke() {},
        fillRect() {},
        createLinearGradient() {
            return {
                addColorStop(offset, color) { gradientStops.push([offset, color]); },
            };
        },
        fillText(value) { text.push(String(value)); },
    };
}

const { manager, state, questManager } = createHarness();
let winIcons = 0;
let lossIcons = 0;
const originalWinIcon = manager._drawWinStreakIcon;
const originalLossIcon = manager._drawVirusIcon;
manager._drawWinStreakIcon = function (...args) {
    winIcons++;
    return originalWinIcon.apply(this, args);
};
manager._drawVirusIcon = function (...args) {
    lossIcons++;
    return originalLossIcon.apply(this, args);
};

state.lifeForce = 84;
state.successStreak = 4;
state.failureStreak = 0;
manager._animHp = 84;
manager._ghostHp = 84;
let ctx = createContext();
assert.equal(manager.drawHUD(ctx), false, 'life force must stay hidden during movement and camera onboarding');
assert.deepEqual(ctx.text, []);

questManager.visible = true;
assert.equal(manager.drawHUD(ctx), true);
assert.equal(winIcons, 1);
assert.equal(lossIcons, 0);
assert.ok(ctx.text.includes('QUEST CHAIN'));
assert.ok(ctx.text.includes('WIN STREAK'));
assert.ok(ctx.text.includes('084 / 100'));
assert.ok(ctx.bezierCalls >= 3, 'HUD should include layered conduit and cable paths');
assert.ok(ctx.gradientStops.some(([, color]) => color === '#294D53'));
assert.ok(ctx.gradientStops.some(([, color]) => color === '#78999B'));
assert.equal(ctx.gradientStops.some(([, color]) => color === '#00F0FF'), false, 'life-force gradient should use muted colors');

questManager.suppressedByDialogue = true;
ctx = createContext();
assert.equal(manager.drawHUD(ctx), false, 'life force and the quest panel must hide together during dialogue');
questManager.suppressedByDialogue = false;

state.lifeForce = 42;
state.successStreak = 0;
state.failureStreak = 3;
manager._animHp = 42;
manager._ghostHp = 42;
ctx = createContext();
assert.equal(manager.drawHUD(ctx), true);
assert.equal(lossIcons, 1);
assert.ok(ctx.text.includes('LOSS STREAK'));

state.lifeForce = 30;
state.failureStreak = 0;
manager._animHp = 30;
manager._ghostHp = 30;
ctx = createContext();
assert.equal(manager.drawHUD(ctx), true);
assert.ok(ctx.text.includes('NEUTRAL'));
assert.ok(ctx.text.includes('DANGER // LIFE FORCE CRITICAL'));

console.log('neural_life_force_hud.test.cjs: PASS');
