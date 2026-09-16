const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const gameplayPath = path.join(
    __dirname,
    '..',
    'Plugins',
    'IP2Live_Core',
    'gameplay',
    'gameplay1',
    'IPWires',
    'ip_wires_gameplay.js'
);
const harderPath = path.join(
    __dirname,
    '..',
    'Plugins',
    'IP2Live_Core',
    'gameplay',
    'gameplay1',
    'IPWires',
    'ip_wires_gameplay_harder.js'
);
const source = fs.readFileSync(gameplayPath, 'utf8');
const harderSource = fs.readFileSync(harderPath, 'utf8');

class BaseScene {}

const gradient = { addColorStop() {} };
const rendered = [];
const ctx = {
    canvas: { width: 1280, height: 720 },
    font: '',
    save() {}, restore() {}, beginPath() {}, closePath() {}, clip() {}, fill() {}, stroke() {},
    moveTo() {}, lineTo() {}, bezierCurveTo() {}, arc() {}, fillRect() {}, strokeRect() {},
    translate() {}, setLineDash() {},
    createLinearGradient() { return gradient; },
    createRadialGradient() { return gradient; },
    fillText(text) { rendered.push({ text: String(text), font: this.font }); },
    measureText(text) { return { width: String(text).length * 8 }; },
};

const context = {
    console,
    window: {},
    setTimeout,
    clearTimeout,
    Scene: { Base: BaseScene },
    Common: { Platform: { ctx } },
    Manager: { Stack: { requestPaintHUD: false } },
    IP2Live: {
        IPWiresCore: { cloneClassSpecs() { return []; } },
        Assets: {
            nebulaLoaded: true,
            oxaniumMediumLoaded: true,
            abnesLoaded: true,
        },
        DialogueManager: { isActive() { return false; }, drawOverlay() {} },
    },
};

vm.runInNewContext(source, context);
const Screen = context.window.IP2LiveWiresGameplayScreen;

const routingProbe = Object.create(Screen.prototype);
routingProbe.failFlash = 0;
routingProbe.sparks = [];
routingProbe.completed = false;
routingProbe._ensurePuzzleReady = () => {};
routingProbe._layout = () => ({ sX: 1, sY: 1 });
routingProbe._drawBackground = () => {};
let panelFont = null;
let terminalFont = null;
routingProbe._drawPanel = (renderCtx, layout, font) => { panelFont = font; };
routingProbe._drawConnections = () => {};
routingProbe._drawFailedWire = () => {};
routingProbe._drawDragWire = () => {};
routingProbe._drawTerminals = (renderCtx, layout, font) => { terminalFont = font; };
routingProbe._drawRerollOverlay = () => {};
routingProbe._drawFailureOverlay = () => {};
routingProbe.drawHUD();

assert.equal(panelFont, 'Nebula-Regular', 'chassis and header typography must remain unchanged');
assert.equal(terminalFont, 'Oxanium-Medium', 'wire terminal content must use Oxanium Medium');

const terminalProbe = Object.create(Screen.prototype);
terminalProbe.animTick = 0;
const point = { x: 420, y: 180, r: 10, sX: 1, sY: 1, density: 0 };
terminalProbe._drawTerminal(ctx, point, '241.146.149.120', '#00F0FF', 'Oxanium-Medium', false, false, null, { index: 0 });
terminalProbe._drawTerminal(ctx, point, 'Class E', '#FFE600', 'Oxanium-Medium', true, false, '240-255', { index: 0 });

assert.match(rendered.find((entry) => entry.text === '241.146.149.120').font, /px Oxanium-Medium$/);
assert.match(rendered.find((entry) => entry.text === 'Class E').font, /px Oxanium-Medium$/);
assert.match(rendered.find((entry) => entry.text === 'RANGE::240-255').font, /px Oxanium-Medium$/);
assert.match(rendered.find((entry) => entry.text === '01').font, /monospace$/, 'wire row numbering should retain its existing font');

assert.match(harderSource, /extends IP2Live\.WiresGameplayScreen/);
assert.doesNotMatch(harderSource, /_drawTerminals\s*\(/, 'harder modes must inherit the shared terminal typography');

console.log('IP Wires terminal typography tests passed.');
