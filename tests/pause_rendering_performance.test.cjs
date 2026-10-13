const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../Plugins/IP2Live_Core');

const metrics = { surfaces: [], filters: [], gradients: 0, shadows: 0, images: [], measures: 0 };
function context(canvas) {
    const state = { canvas, globalAlpha: 1,
        measureText(text) { metrics.measures++; return { width: text.length * 12 }; },
        createLinearGradient() { metrics.gradients++; return { addColorStop() {} }; },
        createRadialGradient() { metrics.gradients++; return { addColorStop() {} }; },
        drawImage(...args) { metrics.images.push({ target: canvas, args }); },
    };
    return new Proxy(state, {
        get: (obj, key) => key in obj ? obj[key] : () => {},
        set(obj, key, value) {
            if (key === 'filter' && value !== 'none') metrics.filters.push(value);
            if (key === 'shadowBlur' && value > 0) metrics.shadows++;
            obj[key] = value; return true;
        },
    });
}
const canvas = { width: 3840, height: 2160 }, ctx = context(canvas), sound = { playSound() {} };
let warmup;
const env = vm.createContext({ console: { log() {}, warn() {} }, Math, Date, inject() {},
    window: { requestIdleCallback(callback) { warmup = callback; } },
    document: { createElement() { const canvas = { width: 1, height: 1 }; const ctx = context(canvas);
        canvas.getContext = () => ctx; metrics.surfaces.push(canvas); return canvas; } },
    Common: { Platform: { ctx } }, Core: { Game: { current: { currentMapID: 3 } } },
    Scene: { Base: class { constructor() { this.initialize?.(); } }, Map: class {} },
    Manager: { Stack: {}, GL: { renderer: { domElement: { width: 3840, height: 2160 } } } },
    Data: { Systems: { soundConfirmation: sound, soundCancel: sound }, Keyboards: {} },
    IP2Live: { Assets: { abnesLoaded: true, nebulaLoaded: true },
        TextScramble: { create: () => ({ update() {}, getText: (_, label) => label }) } },
});
// Use the real button painter so the performance contract also includes its glows.
const core = fs.readFileSync(path.join(root, 'code.js'), 'utf8');
vm.runInContext(core.slice(core.indexOf('IP2Live.UI = {'), core.indexOf('//  Section 2.5')), env);
for (const file of ['confir-popup', 'gameplay-pause', 'pause-menu'])
    vm.runInContext(fs.readFileSync(path.join(root, 'modules/screens', file + '.js'), 'utf8'), env);
const ui = env.IP2Live.PauseUI;
assert.equal(typeof warmup, 'function', 'artwork prepares in idle time before a pause click');
warmup();
assert.ok(ui._backdrop.canvas.width <= 1280 && ui._backdrop.canvas.height <= 720);
assert.equal(ui._frameCache.size, 2);
const surfaces = metrics.surfaces.length;
const pause = new env.window.IP2LivePauseMenu(); pause.popupProgress = 0.1;
pause.drawHUD();
assert.equal(metrics.surfaces.length, surfaces, 'opening uses the prepared textures without allocating more canvases');
pause.popupProgress = 1;
pause.drawHUD();
const measureCount = metrics.measures;
const gradientCount = metrics.gradients, shadowCount = metrics.shadows;
for (let i = 0; i < 60; i++) { pause.animTick++; pause.drawHUD(); }
assert.equal(metrics.measures, measureCount, 'unchanged labels are not measured on every frame');
assert.equal(metrics.gradients - gradientCount, 0, 'button and full-screen gradients stay cached throughout animation');
assert.equal(metrics.shadows - shadowCount, 60, 'only the selected label glow repaints; the large frame and button shadows stay cached');
assert.equal(metrics.surfaces.length, surfaces, 'idle animation does not allocate render targets');
assert.deepEqual(metrics.filters, [], 'no live or cached paint uses expensive Canvas blur filters');
env.IP2Live.GameplayPause.activeScreen = { options: {} };
const game = new env.window.IP2LiveGameplayPauseMenu(); game.fadeIn = 1; game.drawHUD();
assert.equal(metrics.surfaces.length, surfaces, 'gameplay reuses the same backdrop and its prepared frame');
const particleDraws = () => metrics.images.filter(image => image.target === canvas && image.args[0] === ui._particleAtlas.canvas);
metrics.images.length = 0; game.animTick = 0; game.drawHUD(); const particles = particleDraws();
metrics.images.length = 0; game.animTick = 60; game.drawHUD();
assert.equal(particleDraws().length, 90);
assert.notDeepEqual(particleDraws().map(image => image.args.slice(5)), particles.map(image => image.args.slice(5)), 'cached particles still move');
const frame = ui.captureBackdrop(true);
assert.equal(frame.width, 1280); assert.equal(frame.height, 720);
assert.equal(metrics.images.filter(image => image.target === frame).length, 2, 'the frozen world keeps both the map and HUD');
game.pauseBackdrop = frame; metrics.images.length = 0; game.drawHUD();
assert.ok(!metrics.images.some(image => image.args[0] === frame), 'fully open menus skip the invisible source snapshot');
game.fadeIn = 0.5; game.drawHUD();
assert.ok(metrics.images.some(image => image.args[0] === frame), 'the source still blends during the transition');
for (const [width, height] of [[800, 600], [1920, 1080], [1024, 768], [3840, 2160]]) {
    Object.assign(canvas, { width, height }); game.drawHUD();
    assert.ok(ui._frameCache.size <= 2, 'resizing bounds the shared frame cache');
    assert.ok(ui._buttonCache.size <= 12, 'resizing bounds the button chrome cache');
    assert.ok(ui._backdrop.canvas.width <= 1280 && ui._backdrop.canvas.height <= 720);
    game.buttonRects.forEach(rect => assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= width && rect.y + rect.h <= height));
}

// Fonts needed by Pause load concurrently, are reused, and never hold up opening.
(async () => {
    let resolveFont;
    const loaded = [], fontGate = new Promise(resolve => { resolveFont = resolve; });
    env.FontFace = class { constructor(name) { this.name = name; } async load() { loaded.push(this.name); await fontGate; return this; } };
    env.document.fonts = { add() {} };
    vm.runInContext(core.slice(core.indexOf('IP2Live.Assets = {'), core.indexOf('IP2Live.BgFx = {')), env);
    const assets = env.IP2Live.Assets;
    assets.loadAll = () => assert.fail('opening Pause must not load unrelated assets');
    let ready = false; const fonts = assets.loadPauseFonts(); fonts.then(() => { ready = true; });
    assert.equal(assets.loadPauseFonts(), fonts, 'concurrent requests share their in-flight font load');
    assert.deepEqual(loaded, ['Abnes', 'Nebula-Regular']);
    await pause.load(); assert.equal(pause.loading, false); assert.equal(ready, false, 'the panel is usable while fonts finish loading');
    resolveFont(); await fonts; await assets.loadPauseFonts();
    assert.equal(loaded.length, 2, 'loaded pause fonts are not fetched again');
    console.log('pause_rendering_performance.test.cjs: PASS (cached 4K artwork, bounded memory, sprite particles, idle warmup, transition copies and nonblocking fonts)');
})().catch(error => { console.error(error); process.exitCode = 1; });
