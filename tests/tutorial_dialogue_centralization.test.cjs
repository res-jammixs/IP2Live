const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'Plugins', 'IP2Live_Core', 'modules', 'tutorial.js'),
    'utf8'
);

function MapScene() {}
MapScene.current = null;
MapScene.prototype.drawHUD = function () {};
MapScene.prototype.update = function () {};

const starts = [];
const registrations = [];
const discards = [];
let activeDialogue = null;
const stepKeys = {
    1: ['KeyW', 'KeyS'],
    2: ['KeyA', 'KeyD'],
    3: ['ArrowLeft', 'ArrowRight'],
    4: ['Enter', 'Space', 'KeyZ'],
};
const steps = [1, 2, 3, 4].map((phase) => ({
    phase,
    header: 'STEP 0' + phase,
    body: phase < 4 ? 'Press {{key:TEST|KeyW}} to train.' : 'Tutorial instruction 4.',
    hint: phase < 4 ? '' : 'Tutorial hint 4.',
    keys: stepKeys[phase],
}));
const highlightUpdates = [];

const DialogueManager = {
    getSlides() { return [['Tutorial story.']]; },
    getTutorialSteps() { return steps.map((step) => ({ ...step })); },
    registerDialogue(id, definition) { registrations.push({ id, definition }); return true; },
    start(id, context) {
        activeDialogue = { id, context: context || {} };
        starts.push(activeDialogue);
        return true;
    },
    discardActive(id) {
        if (!activeDialogue || activeDialogue.id !== id) return false;
        discards.push(id);
        activeDialogue = null;
        return true;
    },
    setHighlightState(id, state) { highlightUpdates.push({ id, state }); return true; },
    isActive() { return !!activeDialogue; },
};

const context = {
    console,
    window: {},
    document: { addEventListener() {}, removeEventListener() {} },
    IP2Live: { DialogueManager },
    Scene: { Map: MapScene },
    Manager: { Stack: { requestPaintHUD: false }, Events: { keysPressed: [] } },
    Common: { ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 } },
    Core: { Game: { current: null } },
    Data: { Systems: { soundConfirmation: { playSound() {} } } },
    THREE: {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
};

vm.runInNewContext(source, context);
const tutorial = context.window.IP2LiveTutorial;

tutorial.activate({ skipIntro: true });
assert.equal(starts.at(-1).id, 'tutorial.step.1');
assert.equal(registrations.at(-1).definition.manualAdvance, true);
assert.equal(registrations.at(-1).definition.allowMovementDuringDialogue, true);
assert.equal(registrations.at(-1).definition.requiredKeyCount, 2);
assert.equal(registrations.at(-1).definition.slides[0].length, 1, 'control prompts should stay on one authored line');
tutorial._onKey({ code: 'KeyW', preventDefault() {}, stopPropagation() {} });
assert.deepEqual(highlightUpdates.at(-1), { id: 'KeyW', state: 'confirmed' });

tutorial._nextStep();
assert.equal(discards.at(-1), 'tutorial.step.1');
assert.equal(starts.at(-1).id, 'tutorial.step.2');

tutorial._nextStep();
const highlightCountBeforeCameraInput = highlightUpdates.length;
let cameraAdvanceRequests = 0;
const scheduleNextStep = tutorial._scheduleNextStep;
tutorial._scheduleNextStep = () => { cameraAdvanceRequests++; };
tutorial._onKey({ code: 'ArrowUp', preventDefault() {}, stopPropagation() {} });
assert.equal(highlightUpdates.length, highlightCountBeforeCameraInput, 'up/down arrows must not count as camera training input');
tutorial._onKey({ code: 'ArrowLeft', preventDefault() {}, stopPropagation() {} });
assert.deepEqual(highlightUpdates.at(-1), { id: 'ArrowLeft', state: 'confirmed' });
assert.equal(cameraAdvanceRequests, 0, 'one horizontal camera direction is not enough to advance');
tutorial._onKey({ code: 'ArrowRight', preventDefault() {}, stopPropagation() {} });
assert.deepEqual(highlightUpdates.at(-1), { id: 'ArrowRight', state: 'confirmed' });
assert.equal(cameraAdvanceRequests, 1, 'both horizontal camera directions should advance the lesson');
tutorial._scheduleNextStep = scheduleNextStep;
tutorial._nextStep();
assert.equal(starts.at(-1).id, 'tutorial.step.4');
assert.equal(registrations.at(-2).definition.requiredKeyCount, 2, 'camera training requires left and right arrow inputs');
assert.equal(registrations.at(-1).definition.manualAdvance, false);
assert.equal(registrations.at(-1).definition.lockMovement, true);

const questPrompt = activeDialogue;
activeDialogue = null;
questPrompt.context.onComplete();
assert.equal(tutorial.phase, tutorial.PHASE.QUEST_ACTIVE);

tutorial._nextStep();
assert.equal(starts.at(-1).id, 'tutorial.outro');

assert.doesNotMatch(source, /this\._drawIntroBoxV2\(/);
assert.doesNotMatch(source, /this\._drawStepHUD\(/);
assert.doesNotMatch(source, /Nebula-Regular|nebulaLoaded/);

console.log('Tutorial dialogue centralization tests passed.');
