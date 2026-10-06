const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

let now = 0;
const context = vm.createContext({
    console: { log() {} }, Date: { now: () => now }, window: {},
    Scene: { Base: class {}, TitleScreen: class {} },
    Manager: { Stack: {} }, IP2Live: {}
});
vm.runInContext(fs.readFileSync(path.join(__dirname,
    '../Plugins/IP2Live_Core/modules/screens/main-menu.js'), 'utf8'), context);
function menu() {
    const result = new context.Scene.TitleScreen();
    result.initialize(); result._heroLastUpdateAt = now;
    return result;
}
const opening = menu();
assert.equal(opening._heroAnimationState().gateLight, 0);
assert.equal(opening._heroAnimationState().coreLight, 0);
assert.equal(opening._heroAnimationState().figureLight, 0);
opening._heroElapsedMs = 2400;
const checkpoint = opening._heroAnimationState();
assert.ok(checkpoint.gateLight > 0.5, 'the open gate is lit before the core');
assert.equal(checkpoint.coreLight, 0, 'the final door stays dark during the first reveal');
opening._heroElapsedMs = 4200;
const core = opening._heroAnimationState();
assert.equal(core.gateLight, 1);
assert.ok(core.coreLight > 0 && core.coreLight < 1);
opening._heroElapsedMs = 6000;
const complete = opening._heroAnimationState();
assert.equal(complete.gateLight, 1); assert.equal(complete.coreLight, 1);
assert.equal(complete.figureLight, 1);
opening._showMenuPage('play');
assert.equal(opening._heroAnimationState().coreLight, 1, 'navigation does not restart the reveal');

function advance(fps) {
    now = 0; const screen = menu();
    for (let frame = 1; frame <= fps * 6; frame++) {
        now = frame * 1000 / fps; screen.update();
    }
    return screen;
}
const slow = advance(30), fast = advance(144);
assert.ok(Math.abs(slow._heroElapsedMs - fast._heroElapsedMs) < 0.001,
    'the sequence has the same duration at different frame rates');
now += 60000; const beforePause = fast._heroElapsedMs; fast.update();
assert.equal(fast._heroElapsedMs - beforePause, 100, 'a suspended window resumes smoothly');

const paths = [];
const savedAlpha = [];
const ctx = new Proxy({
    globalAlpha: 1,
    save() { savedAlpha.push(this.globalAlpha); },
    restore() {
        assert.ok(savedAlpha.length, 'every restore has a matching save');
        this.globalAlpha = savedAlpha.pop();
    },
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} })
}, { get(target, key) {
    if (key in target) return target[key];
    return (...args) => paths.push([key, ...args]);
}, set(target, key, value) {
    if (key === 'globalAlpha') assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
    target[key] = value; return true;
} });
opening._heroElapsedMs = 7000;
opening._drawUnlockedGate(ctx, opening._heroAnimationState());
const firstGate = paths.filter(row => row[0] === 'lineTo').map(row => row.slice(1));
paths.length = 0;
opening._heroElapsedMs = 9500;
opening._drawUnlockedGate(ctx, opening._heroAnimationState());
const nextGate = paths.filter(row => row[0] === 'lineTo').map(row => row.slice(1));
assert.notDeepEqual(firstGate, nextGate, 'open gate leaves have idle movement');
assert.ok(nextGate.some(([x]) => x < -110 && x > -120));
assert.ok(nextGate.some(([x]) => x > 110 && x < 120), 'gate leaves remain away from the center');
paths.length = 0;
opening._drawInfiltrator(ctx, 0.5, opening._heroAnimationState());
const firstCloak = paths.filter(row => row[0] === 'quadraticCurveTo');
paths.length = 0;
opening._heroElapsedMs = 11500;
opening._drawInfiltrator(ctx, 0.5, opening._heroAnimationState());
assert.notDeepEqual(firstCloak, paths.filter(row => row[0] === 'quadraticCurveTo'),
    'cloak contours and folds continue moving after the reveal');
context.IP2Live.Assets = {};
for (const elapsed of [0, 2400, 4200, 7000, 9500]) {
    opening._heroElapsedMs = elapsed;
    opening._drawHeroComposition(ctx, 1920, 1080);
    assert.equal(savedAlpha.length, 0, 'rendering every phase leaves the canvas state balanced');
    assert.equal(ctx.globalAlpha, 1, 'hero lighting does not dim the menu buttons');
}
console.log('main_menu_animation.test.cjs: PASS (staged reveal, frame rates, resume, navigation, gate and cloak idle)');
