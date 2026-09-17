const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const rangesPath = path.join(
    projectRoot,
    'Plugins',
    'IP2Live_Core',
    'gameplay',
    'common',
    'ip_class_ranges.js'
);
const wiresCorePath = path.join(
    projectRoot,
    'Plugins',
    'IP2Live_Core',
    'gameplay',
    'gameplay1',
    'IPWires',
    'ip_wires_core.js'
);
const gameplayPath = path.join(
    projectRoot,
    'Plugins',
    'IP2Live_Core',
    'gameplay',
    'gameplay2',
    'IPPatchPanel',
    'ip_patchpanel_gameplay.js'
);
const tutorialPath = path.join(
    projectRoot,
    'Plugins',
    'IP2Live_Core',
    'gameplay',
    'gameplay2',
    'IPPatchPanel',
    'ip_patchpanel_tutorial.js'
);

const rendered = [];
const rotations = [];
const filledRects = [];
const gradient = { addColorStop() {} };
const ctx = {
    canvas: { width: 1280, height: 720 },
    font: '',
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    lineWidth: 1,
    lineDashOffset: 0,
    shadowColor: '',
    shadowBlur: 0,
    textAlign: '',
    textBaseline: '',
    save() {}, restore() {}, beginPath() {}, closePath() {}, clip() {}, fill() {}, stroke() {},
    moveTo() {}, lineTo() {}, bezierCurveTo() {}, arc() {},
    fillRect(x, y, w, h) { filledRects.push({ x, y, w, h, alpha: this.globalAlpha, fillStyle: this.fillStyle }); },
    strokeRect() {},
    translate() {}, rotate(angle) { rotations.push(angle); }, setLineDash() {},
    createLinearGradient() { return gradient; },
    createRadialGradient() { return gradient; },
    fillText(text) {
        rendered.push({ text: String(text), font: this.font, fillStyle: this.fillStyle });
    },
    measureText(text) { return { width: String(text).length * 8 }; },
};

const dialogueDefinitions = [];
const context = {
    console,
    window: {},
    Math,
    Date,
    setTimeout,
    clearTimeout,
    Scene: { Base: class {} },
    Common: {
        ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 },
        Platform: { ctx },
    },
    Core: {},
    Data: { Keyboards: {}, Systems: {} },
    Graphic: {},
    Manager: { Stack: { requestPaintHUD: false }, GL: {} },
    Model: {},
    Main: {},
    THREE: {},
    inject() {},
    IP2Live: {
        Assets: {
            oxaniumMediumLoaded: true,
            nebulaLoaded: true,
            abnesLoaded: true,
        },
        DialogueManager: {
            isActive() { return false; },
            drawOverlay() {},
            registerDialogue(id, definition) { dialogueDefinitions.push({ id, definition }); },
            start() { return true; },
        },
    },
};

vm.runInNewContext(fs.readFileSync(rangesPath, 'utf8'), context, { filename: rangesPath });
vm.runInNewContext(fs.readFileSync(wiresCorePath, 'utf8'), context, { filename: wiresCorePath });
vm.runInNewContext(fs.readFileSync(tutorialPath, 'utf8'), context, { filename: tutorialPath });
vm.runInNewContext(fs.readFileSync(gameplayPath, 'utf8'), context, { filename: gameplayPath });

const Screen = context.window.IP2LivePatchPanelGameplayScreen;
const Tutorial = context.window.IP2LiveIPPatchPanelTutorial;
const screen = new Screen({ totalPackets: 15, targetScore: 10, maxAttempts: 2 });
const ranges = context.IP2Live.IPClassRanges;

assert.deepEqual(
    Array.from(ranges.cloneSpecs(), (spec) => [spec.className, spec.min, spec.max]),
    [['A', 0, 127], ['B', 128, 191], ['C', 192, 223], ['D', 224, 239], ['E', 240, 255]]
);
assert.equal(ranges.classifyFirstOctet(0), 'A');
assert.equal(ranges.classifyFirstOctet(127), 'A');
assert.equal(ranges.classifyFirstOctet(128), 'B');
assert.equal(ranges.classifyFirstOctet(255), 'E');
assert.deepEqual(
    Array.from(context.IP2Live.IPWiresCore.cloneClassSpecs(), (spec) => [spec.className, spec.min, spec.max]),
    [['A', 0, 127], ['B', 128, 191], ['C', 192, 223], ['D', 224, 239], ['E', 240, 255]],
    'Gameplay 1 must consume the centralized boundaries'
);
assert.equal(screen.ipPool.find((packet) => packet.text === '255.201.17.6').className, 'E');

assert.equal(screen._uiPrimaryFont(), 'Oxanium-Medium');
assert.equal(screen._uiMonoFont(), 'Oxanium-Medium');
assert.equal(screen._uiTitleFont(), 'Abnes', 'the Network Patch header font must remain unchanged');
assert.notEqual(screen._packetKindStyle({ kind: 'IP' }).accent, screen._packetKindStyle({ kind: 'MASK' }).accent);
assert.equal(screen._packetKindStyle({ kind: 'IP' }).label, 'IP ADDRESS');
assert.equal(screen._packetKindStyle({ kind: 'MASK' }).label, 'SUBNET MASK');

for (let index = 0; index < screen.classOrder.length; index++) {
    const alignedAngle = screen._classBaseAngle(index) + screen._classIndexToAngle(index);
    assert.ok(Math.abs(Math.sin(alignedAngle)) < 1e-10, 'selected tunnel should be horizontal');
    assert.ok(Math.cos(alignedAngle) < -0.999999, 'selected tunnel should align with the left ingress wire');
}

screen.selectedClassIndex = 2;
screen.wheelAngle = screen._classIndexToAngle(2);
screen.targetWheelAngle = screen.wheelAngle;
screen.animTick = 10;
screen.correctTunnelFeedback = null;
rendered.length = 0;
rotations.length = 0;
const metrics = screen._metrics();
screen._drawWheelCore(ctx, metrics);
assert.equal(screen.classButtonRects.length, 5);
const classC = screen.classButtonRects.find((rect) => rect.key === 'C');
assert.ok(classC.x + classC.w * 0.5 < metrics.wheelX, 'the selected Class C tunnel should dock on the left');
assert.ok(rotations.some((angle) => Math.abs(angle - screen.wheelAngle) < 1e-10), 'the carousel texture should rotate with the wheel');
assert.equal(rendered.some((entry) => entry.text === 'ROUTE'), false, 'the center hub must show only the Class letter');
assert.ok(rendered.filter((entry) => entry.text === 'C').every((entry) => /Oxanium-Medium$/.test(entry.font)));

rendered.length = 0;
filledRects.length = 0;
screen.activePackets = [{
    serial: 1,
    spawnIndex: 0,
    x: metrics.leftWireX,
    enteredDecision: false,
    resolved: false,
    reverting: false,
    kind: 'MASK',
    text: '255.0.0.0',
    className: 'A',
}];
screen.activePacket = screen.activePackets[0];
screen.packetCursor = screen.roundPackets.length;
screen._drawPacketDeck(ctx, metrics);
const subnetLabel = rendered.find((entry) => entry.text === 'SUBNET MASK');
assert.ok(subnetLabel, 'subnet-mask cards should carry a prominent packet-type label');
assert.match(subnetLabel.font, /8\.5px Oxanium-Medium$/);
assert.match(rendered.find((entry) => entry.text === '255.0.0.0').font, /19\.0px Oxanium-Medium$/);
assert.equal(
    filledRects.some((rect) => rect.w <= 4 && rect.h > 30),
    false,
    'packet cards should not draw a vertical rail on their left edge'
);
const numberBackplates = filledRects.filter((rect) => Math.abs(rect.h - 25) < 0.01 && rect.w > 100);
assert.equal(numberBackplates.length, 3);
assert.ok(numberBackplates.every((rect) => rect.alpha <= 0.1), 'the horizontal number tint must remain subtle');

rendered.length = 0;
screen._drawPersonaPanels(ctx, metrics);
assert.match(rendered.find((entry) => entry.text === 'NETWORK').font, /px Abnes$/, 'header typography must not change');

Tutorial.showIntro(() => {});
Tutorial.showCurrentGuide(() => {});
Tutorial.showTrainingPacketGuide({
    kind: 'MASK',
    text: '255.0.0.0',
    className: 'A',
    tutorialLesson: { phase: 'mask', order: 1, className: 'A' },
}, () => {});
Tutorial.showTrainingPacketGuide({
    kind: 'IP',
    text: '240.18.7.42',
    className: 'E',
    tutorialLesson: { phase: 'ip', order: 5, className: 'E' },
}, () => {});

const tutorialCopy = dialogueDefinitions
    .flatMap((entry) => entry.definition.slides)
    .flat()
    .join('\n');
assert.match(tutorialCopy, /new packet type: the \{\{highlight:subnet mask\}\}/i);
assert.match(tutorialCopy, /not automatically a Class E IP address/i);
assert.match(tutorialCopy, /\{\{highlight:255\.0\.0\.0\}\}/);
assert.match(tutorialCopy, /\{\{highlight:Class A\}\}/);
assert.match(tutorialCopy, /\{\{highlight:240\.18\.7\.42\}\}/);
assert.match(tutorialCopy, /\{\{highlight:first-octet range 240-255\}\}/);

console.log('IP Patch Panel redesign tests passed.');
