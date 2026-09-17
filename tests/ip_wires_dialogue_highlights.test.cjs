const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
    path.join(
        __dirname,
        '..',
        'Plugins',
        'IP2Live_Core',
        'gameplay',
        'gameplay1',
        'IPWires',
        'ip_wires_tutorial.js'
    ),
    'utf8'
);
const dialogueLibrary = JSON.parse(fs.readFileSync(
    path.join(
        __dirname,
        '..',
        'Plugins',
        'IP2Live_Core',
        'modules',
        'dialogues.json'
    ),
    'utf8'
));

const registrations = [];
const starts = [];
const specs = {
    A: { className: 'A', min: 0, max: 127, shortRange: '0-127', rangeText: '0.0.0.0 to 127.255.255.255' },
    B: { className: 'B', min: 128, max: 191, shortRange: '128-191', rangeText: '128.0.0.0 to 191.255.255.255' },
    C: { className: 'C', min: 192, max: 223, shortRange: '192-223', rangeText: '192.0.0.0 to 223.255.255.255' },
    D: { className: 'D', min: 224, max: 239, shortRange: '224-239', rangeText: '224.0.0.0 to 239.255.255.255' },
    E: { className: 'E', min: 240, max: 255, shortRange: '240-255', rangeText: '240.0.0.0 to 255.255.255.255' },
};

const context = {
    console,
    window: {},
    IP2Live: {
        IPWiresCore: {
            cloneClassSpecs() { return Object.values(specs); },
            specByClassName(className) { return specs[className] || null; },
        },
        DialogueManager: {
            registerDialogue(id, definition) {
                registrations.push({ id, definition });
                return true;
            },
            start(id, startContext) {
                starts.push({ id, context: startContext });
                return true;
            },
        },
    },
};

vm.runInNewContext(source, context);
const tutorial = context.window.IP2LiveIPWiresTutorial;
const screen = {
    _ipGuide: {
        active: true,
        sequence: [{ id: 'source-01', ip: '241.146.149.120', className: 'E' }],
        stepIndex: 0,
        expectedSourceId: null,
        expectedClassName: null,
    },
};

tutorial._startGuidedStep(screen);

const guided = registrations.at(-1);
assert.match(guided.id, /^stage1\.ipwires\.guided\.step\./);
assert.equal(starts.at(-1).id, guided.id);
const guidedLines = guided.definition.slides[0];
assert.match(guidedLines[0], /\{\{highlight:241\.146\.149\.120\}\}/);
assert.match(guidedLines[0], /\{\{highlight:Class E\}\}/);
assert.match(guidedLines[1], /\{\{highlight:240\.0\.0\.0–255\.255\.255\.255\}\}/);
assert.doesNotMatch(guidedLines[1], /240\.0\.0\.0\s+to\s+255\.255\.255\.255/);

const highlightedRange = guidedLines[1].match(/\{\{highlight:([^}]+)\}\}/g).at(-1);
assert.equal(
    highlightedRange,
    '{{highlight:240.0.0.0–255.255.255.255}}',
    'the full class range must remain one no-whitespace highlight unit'
);

const finalScreen = {
    _ipGuide: {
        active: true,
        expectedSourceId: 'source-01',
        expectedClassName: 'E',
    },
};
tutorial._finishGuidedSession(finalScreen);
const recapLines = registrations.at(-1).definition.slides[0].slice(-5);
assert.equal(recapLines.length, 5);
for (const line of recapLines) {
    const range = line.match(/\{\{highlight:([^}]+–[^}]+)\}\}/);
    assert.ok(range, 'each class recap should highlight one complete start/end range');
    assert.doesNotMatch(range[1], /\s/, 'recap range highlights must remain atomic');
}

const firstQuestSuccess = dialogueLibrary.dialogues.find(
    (dialogue) => dialogue.id === 'stage1.ipwires.tutorial.success'
);
assert.ok(firstQuestSuccess, 'the Stage 1 Level 1 first-quest completion dialogue must exist');
assert.equal(firstQuestSuccess.bindings.mapId, 3);
assert.equal(firstQuestSuccess.bindings.objectiveId, 'repair_ip_wires_01');
assert.equal(firstQuestSuccess.bindings.trigger, 'gameplay.completed');
assert.equal(firstQuestSuccess.slides.length, 11, 'HUD onboarding should use short explanations separated by visual focus pauses');
assert.equal(firstQuestSuccess.slides[0][0], 'Patch stable.');

const hudOnboarding = firstQuestSuccess.slides
    .filter(Array.isArray)
    .flat()
    .join(' ');
assert.match(hudOnboarding, /\{\{highlight:Health Bar\}\}/);
assert.match(hudOnboarding, /\{\{highlight:Win streak: \+10, \+11, and so on up to \+15 points\.\}\}/);
assert.match(hudOnboarding, /\{\{highlight:Non-tutorial loss streak: -10, -12, and so on up to -16 points\.\}\}/);
assert.match(hudOnboarding, /\{\{highlight:Quest Area\}\}/);
assert.match(hudOnboarding, /\{\{highlight:quest minimap\}\}/);
assert.match(hudOnboarding, /\{\{highlight:Distance tab\}\}/);

const focusSlides = firstQuestSuccess.slides.filter((slide) => slide && slide.focusOnly);
assert.deepEqual(
    focusSlides.map((slide) => slide.focus),
    ['health', 'streak', 'quest', 'minimap', 'distance'],
    'each HUD explanation should be followed by its own yellow focus pause'
);
assert.ok(focusSlides.every((slide) => slide.durationFrames >= 90));

console.log('IP Wires dialogue highlight tests passed.');
