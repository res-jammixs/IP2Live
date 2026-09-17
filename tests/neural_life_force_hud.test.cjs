const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(
    path.join(root, 'Plugins', 'IP2Live_Core', 'modules', 'game-state', 'neural_life_force_manager.js'),
    'utf8'
);
const questSource = fs.readFileSync(
    path.join(root, 'Plugins', 'IP2Live_Core', 'modules', 'quest_manager.js'),
    'utf8'
);
const distanceSource = fs.readFileSync(
    path.join(root, 'Plugins', 'IP2Live_Core', 'assets', 'quest_arrow.js'),
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
assert.ok(ctx.text.includes('4'), 'streak count should be drawn inside the standalone icon');
assert.equal(ctx.text.includes('QUEST CHAIN'), false);
assert.equal(ctx.text.includes('WIN STREAK'), false);
assert.ok(ctx.text.includes('084 / 100'));
assert.equal(ctx.text.includes('NEURAL LIFE FORCE'), false);
assert.equal(ctx.text.some((value) => value.includes('SYNC STABLE')), false);
assert.ok(ctx.bezierCalls >= 3, 'HUD should include layered conduit and cable paths');
assert.ok(ctx.gradientStops.some(([, color]) => color === '#FF174D'));
assert.ok(ctx.gradientStops.some(([, color]) => color === '#FF8A00'));
assert.ok(ctx.gradientStops.some(([, color]) => color === '#FFE600'));
assert.equal(ctx.gradientStops.some(([, color]) => color === '#4A555B'), false, 'HP housing should not use the old metallic gray');

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
assert.ok(ctx.text.includes('3'));
assert.equal(ctx.text.includes('LOSS STREAK'), false);

state.lifeForce = 30;
state.failureStreak = 0;
manager._animHp = 30;
manager._ghostHp = 30;
ctx = createContext();
assert.equal(manager.drawHUD(ctx), true);
assert.ok(ctx.text.includes('0'));
assert.equal(ctx.text.includes('NEUTRAL'), false);
assert.ok(ctx.text.includes('DANGER // LIFE FORCE CRITICAL'));

assert.match(source, /oxaniumMediumLoaded\s*\?\s*'Oxanium-Medium'/);
assert.doesNotMatch(source, /fillText\('QUEST CHAIN'|fillText\(statusLabel/);
assert.match(source, /barGrad\.addColorStop\(0, '#FF174D'\)/);
assert.match(source, /barGrad\.addColorStop\(0\.52, '#FF8A00'\)/);
assert.match(source, /barGrad\.addColorStop\(1, '#FFE600'\)/);
assert.match(questSource, /oxaniumMediumLoaded\s*\?\s*'Oxanium-Medium'/);
assert.match(questSource, /nebulaLoaded\s*\?\s*'Nebula-Regular'/);
assert.match(questSource, /ctx\.fillRect\(o\.x, o\.y, leftW, plateH\)/, 'red quest header should be straight');
assert.match(questSource, /leftGrad\.addColorStop\(0, '#FF164D'\)/, 'quest header should inherit dialogue styling');
assert.match(questSource, /const rightW = 124 \* o\.sX;/, 'yellow quest header should use the wider plate');
assert.match(questSource, /_drawTrackedText\(ctx, quest\.title/);
assert.match(questSource, /quest\.title \|\| 'QUEST AREA', qX \+ 18 \* sX/);
assert.match(questSource, /Math\.round\(12\.5 \* sX\) \+ 'px ' \+ headerFont/);
assert.doesNotMatch(questSource, /const slashX|for \(let si = 0; si < 3; si\+\+\)/);
assert.doesNotMatch(questSource, /LIVE_TRACKING|OBJ 01\/01/);
assert.ok(
    questSource.indexOf('dialogueManager.drawHudFocusOverlay(Common.Platform.ctx)') >
        questSource.indexOf('manager.drawHUD(Common.Platform.ctx)'),
    'HUD focus frames must render after the Health Bar, Quest Area, and Distance tab'
);
assert.match(distanceSource, /oxaniumMediumLoaded\s*\?\s*'Oxanium-Medium'/);
assert.match(distanceSource, /_drawTrackedText\(ctx, distanceLabel/);

console.log('neural_life_force_hud.test.cjs: PASS');
