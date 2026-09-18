const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const screensDir = path.join(
    __dirname,
    '..',
    'Plugins',
    'IP2Live_Core',
    'modules',
    'screens'
);
const fullSource = fs.readFileSync(path.join(screensDir, 'loading-screen.js'), 'utf8');
const simpleSource = fs.readFileSync(path.join(screensDir, 'loading-screen-2.js'), 'utf8');

for (const source of [fullSource, simpleSource]) {
    assert.match(
        source,
        /oxaniumMediumLoaded\s*\?\s*'Oxanium-Medium'/,
        'loading copy should select the shared Oxanium Medium asset'
    );
    assert.match(
        source,
        /_drawTitle\(ctx, cW, sX, sY, titleFont\)/,
        'IP2LIVE title must continue to receive its dedicated title font'
    );
    assert.match(source, /label: 'Subnet Tip'/);
    assert.match(source, /topPadding: 14/);
    assert.match(source, /font,/);
}

assert.match(fullSource, /_drawTexturedCorner\(ctx, points/);
assert.match(fullSource, /LoadingUIComponents\s*=\s*IP2Live\.LoadingUIComponents\s*\|\|/);
assert.match(fullSource, /function drawStatusModule\(ctx, options\)/);
assert.match(fullSource, /function drawInfoCard\(ctx, options\)/);
assert.match(fullSource, /function drawProgressTrack\(ctx, options\)/);
assert.doesNotMatch(fullSource, /TRANSIT STATUS|KNOWLEDGE CACHE/);
assert.match(fullSource, /segmentCount = 18/);
assert.match(fullSource, /Math\.round\(12 \* o\.sX\) \+ 'px ' \+ o\.font/);
assert.match(fullSource, /toUpperCase\(\)/, 'loading headings should render in uppercase');
assert.match(fullSource, /const tracking = 1\.35 \* o\.sX/);
assert.match(fullSource, /const bodyTracking = 0\.35 \* o\.sX/);
assert.match(fullSource, /ctx\.clip\(\)/, 'telemetry components should clip their animated textures');
assert.match(fullSource, /createLinearGradient/, 'loading components should use dimensional color gradients');
const statusRenderer = fullSource.slice(
    fullSource.indexOf('function drawStatusModule'),
    fullSource.indexOf('function drawInfoCard')
);
assert.doesNotMatch(statusRenderer, /traceNotchedPanel|ctx\.clip\(\)/, 'loading status must remain unboxed');
assert.match(statusRenderer, /ctx\.textAlign = 'center'/);
assert.match(statusRenderer, /drawTrackedText\(ctx, title, centerX/);
assert.doesNotMatch(statusRenderer, /o\.detail|eyebrow/, 'status captions and supporting detail should be hidden');
assert.doesNotMatch(statusRenderer, /pulseX|tick \*|translate\(/, 'separator node should remain centered');
assert.match(statusRenderer, /ctx\.arc\(centerX, accentY/);
const infoRenderer = fullSource.slice(
    fullSource.indexOf('function drawInfoCard'),
    fullSource.indexOf('function drawProgressTrack')
);
assert.doesNotMatch(infoRenderer, /traceNotchedPanel|ctx\.clip\(\)/, 'Subnet Tip should be plain text');
assert.match(infoRenderer, /\+ ':'/);
assert.match(infoRenderer, /const firstX = centerX - firstGroupWidth \/ 2/);

const drawHudStart = fullSource.indexOf('drawHUD()');
const fullDrawHud = fullSource.slice(drawHudStart, fullSource.indexOf('\n    _drawBackground(ctx', drawHudStart));
assert.ok(fullDrawHud.indexOf('_drawFactPanel') < fullDrawHud.indexOf('_drawForegroundCorner'));
assert.ok(fullDrawHud.indexOf('_drawForegroundCorner') < fullDrawHud.indexOf('_drawLoadingLine'));

for (const source of [fullSource, simpleSource]) {
    assert.match(source, /LoadingUIComponents\.drawStatusModule/);
    assert.match(source, /LoadingUIComponents\.drawInfoCard/);
    assert.match(source, /LoadingUIComponents\.drawProgressTrack/);
}

assert.match(fullSource, /fillText\('IP2LIVE'/);
assert.match(simpleSource, /fillText\('IP2LIVE SYSTEM'/);
assert.doesNotMatch(fullSource, /SYS::TRANSIT_BRIDGE/);
assert.doesNotMatch(simpleSource, /STAGE TRANSITION_BRIDGE/);
assert.match(fullSource, /'px ' \+ titleFont/);
assert.match(simpleSource, /'px ' \+ titleFont/);

class BaseScene {}
const context = {
    console,
    window: {},
    IP2Live: {},
    Scene: { Base: BaseScene },
    Common: { Platform: {}, ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 } },
    Manager: { Stack: {} },
    setTimeout,
    clearTimeout,
};
vm.runInNewContext(fullSource, context);

const gradient = { addColorStop() {} };
const rendered = [];
const renderContext = {
    font: '',
    save() {}, restore() {}, beginPath() {}, closePath() {}, fill() {}, stroke() {}, clip() {},
    moveTo() {}, lineTo() {}, rect() {}, arc() {}, fillRect() {}, translate() {}, rotate() {},
    createLinearGradient() { return gradient; },
    measureText(text) { return { width: String(text).length * 8 }; },
    fillText(text) { rendered.push({ text: String(text), font: this.font }); },
};
const components = context.IP2Live.LoadingUIComponents;
components.drawStatusModule(renderContext, {
    x: 330, y: 480, w: 620, h: 72,
    title: 'Loading New Game', detail: 'Opening infiltrator profile channel',
    font: 'Oxanium-Medium', sX: 1, sY: 1, tick: 20,
});
components.drawInfoCard(renderContext, {
    x: 190, y: 564, w: 900, h: 78,
    label: 'Subnet Tip', text: 'A reusable networking fact.',
    font: 'Oxanium-Medium', sX: 1, sY: 1,
});
components.drawProgressTrack(renderContext, {
    x: 330, y: 672, w: 620, progress: 0.36,
    label: 'ROUTE TRANSFER', sX: 1, sY: 1, tick: 20,
});

assert.match(rendered.find((entry) => entry.text === 'L').font, /Oxanium-Medium$/);
assert.equal(rendered.some((entry) => entry.text.includes('Opening infiltrator')), false);
assert.match(rendered.find((entry) => entry.text === ':').font, /Oxanium-Medium$/);
assert.match(rendered.find((entry) => entry.text === 'ROUTE TRANSFER').font, /monospace$/);
assert.ok(rendered.some((entry) => entry.text === '036%'));

console.log('Loading screen typography tests passed.');
