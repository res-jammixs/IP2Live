const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'Plugins', 'IP2Live_Core', 'modules', 'dialogue_manager.js'),
    'utf8'
);
const rangeSource = fs.readFileSync(
    path.join(__dirname, '..', 'Plugins', 'IP2Live_Core', 'gameplay', 'common', 'ip_class_ranges.js'),
    'utf8'
);

function MapScene() {}
MapScene.prototype.update = function () {};
MapScene.prototype.drawHUD = function () {};

const context = {
    console,
    document: { addEventListener() {} },
    window: {},
    IP2Live: {},
    Scene: { Map: MapScene },
    Manager: { Stack: {}, Events: { keysPressed: [] } },
    Common: { Platform: { ctx: {} }, ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 } },
    setTimeout,
    clearTimeout,
};

vm.runInNewContext(rangeSource, context);
vm.runInNewContext(source, context);
const dialogueManager = context.window.IP2LiveDialogueManager;

assert.match(source, /oxaniumMediumLoaded\s*\?\s*'Oxanium-Medium'/);
assert.match(source, /ethnocentricLoaded\s*\?\s*'Ethnocentric'/);
assert.match(source, /Math\.round\(22 \* sX\) \+ 'px ' \+ font/);
assert.doesNotMatch(source, /SYS:\/\/NEURAL_LINK|Signal:/);
assert.match(source, /const pipY = panelY \+ headerH \/ 2/);
assert.match(source, /const bodyTopPadding = 38 \* sY/);

assert.equal(dialogueManager._sentenceCaseText('MISSION BRIEF'), 'Mission brief');
assert.equal(
    dialogueManager._sentenceCaseText('SYSTEM BOOT... NEURAL DECK ONLINE.'),
    'System boot... Neural deck online.'
);
assert.equal(
    dialogueManager._sentenceCaseText('LOCATION BREACHED. APEX security has detected our position.'),
    'Location breached. APEX security has detected our position.'
);
assert.equal(dialogueManager._sentenceCaseText('VLSM DIAGNOSTIC'), 'VLSM diagnostic');
assert.equal(dialogueManager._sentenceCaseText('Press ENTER to continue.'), 'Press enter to continue.');
assert.equal(
    dialogueManager._sentenceCaseText('The terminal is locked behind a subnet challenge.'),
    'The terminal is locked behind a subnet challenge.'
);

const measuringContext = {
    font: '',
    measureText(value) { return { width: String(value).length * 10 }; },
};
assert.equal(dialogueManager._measureTrackedText(measuringContext, 'Test', 2), 46);

const richMarkup = 'Route {{highlight:Class A supports 1.0.0.0 through 126.255.255.255 and CIDR /8.}} Press {{key:W|KeyW}}.';
const richTokens = dialogueManager._parseRichText(richMarkup);
assert.deepEqual(Array.from(richTokens, (token) => token.type), ['text', 'highlight', 'text', 'key', 'text']);
assert.equal(
    dialogueManager._visibleTextForTokens(richTokens),
    'Route Class A supports 1.0.0.0 through 126.255.255.255 and CIDR /8. Press W.'
);
assert.equal(richTokens[1].text, 'Class A supports 1.0.0.0 through 126.255.255.255 and CIDR /8.');
assert.equal(richTokens[3].tokenId, 'KeyW');
assert.equal(
    dialogueManager._parseRichText('{{highlight:first range}} and {{highlight:second range}}')
        .filter((token) => token.type === 'highlight').length,
    2,
    'multiple highlighted spans must remain independently styleable'
);
assert.equal(
    dialogueManager._visibleTextForTokens(dialogueManager._parseRichText('Keep {{highlight:unfinished text visible.')),
    'Keep {{highlight:unfinished text visible.'
);
assert.equal(
    dialogueManager._visibleTextForTokens(dialogueManager._parseRichText('Class A: {{highlight:[IP_CLASS_A_FULL]}}')),
    'Class A: 0.0.0.0 to 127.255.255.255',
    'dialogue range placeholders must resolve through the centralized registry'
);

const longHighlightTokens = dialogueManager._parseRichText(
    '{{highlight:Class A supports addresses from 1.0.0.0 through 126.255.255.255 and uses the default CIDR /8 range.}}'
);
const wrappedHighlight = dialogueManager._layoutRichText(measuringContext, longHighlightTokens, 210, {
    sX: 1,
    sY: 1,
    lineH: 28,
    blankLineH: 12,
    letterSpacing: 0,
    bodyFont: '22px Oxanium-Medium',
    keyFont: '12px Oxanium-Medium',
});
assert.ok(wrappedHighlight.lines.length > 2, 'long highlights should wrap across several lines');
assert.ok(
    wrappedHighlight.lines.every((line) => line.runs.every((run) => run.type === 'highlight')),
    'every wrapped fragment should retain its highlight style'
);
const wrappedWords = wrappedHighlight.lines
    .flatMap((line) => line.runs.flatMap((run) => run.text.trim().split(/\s+/).filter(Boolean)));
assert.equal(
    wrappedWords.join('|'),
    dialogueManager._visibleTextForTokens(longHighlightTokens).split(/\s+/).join('|'),
    'wrapping must not lose or duplicate highlighted words'
);

const shortLayout = dialogueManager._layoutRichText(measuringContext, dialogueManager._parseRichText('Short message.'), 900, {
    sX: 1, sY: 1, lineH: 28, bodyFont: '22px Oxanium-Medium', keyFont: '12px Oxanium-Medium',
});
assert.ok(
    dialogueManager._targetPanelHeight(shortLayout, 720, 1, 25) <
        dialogueManager._targetPanelHeight(wrappedHighlight, 720, 1, 25),
    'dialogue height should grow with wrapped content'
);
assert.equal(dialogueManager._targetPanelHeight(shortLayout, 720, 1, 25), 205);
assert.ok(dialogueManager._targetPanelHeight(wrappedHighlight, 720, 1, 25) <= 668);
assert.ok(
    dialogueManager._targetPanelHeight(wrappedHighlight, 720, 1, 25, 38) >
        dialogueManager._targetPanelHeight(shortLayout, 720, 1, 25, 38),
    'adaptive height should include the increased body top padding'
);

const tutorialControlSteps = dialogueManager.getTutorialSteps().filter((step) => step.phase <= 3);
const cameraStep = tutorialControlSteps.find((step) => step.phase === 3);
assert.equal(Array.from(cameraStep.keys).join(','), 'ArrowLeft,ArrowRight');
assert.match(cameraStep.body, /LEFT\|ArrowLeft/);
assert.match(cameraStep.body, /RIGHT\|ArrowRight/);
assert.doesNotMatch(cameraStep.body, /ArrowUp|ArrowDown/);
for (const step of tutorialControlSteps) {
    const stepLayout = dialogueManager._layoutRichText(
        measuringContext,
        dialogueManager._parseRichText(step.body),
        1224,
        {
            sX: 1,
            sY: 1,
            lineH: 28,
            letterSpacing: 1.25,
            bodyFont: '22px Oxanium-Medium',
            keyFont: '12px Oxanium-Medium',
        }
    );
    assert.equal(stepLayout.lines.length, 1, 'tutorial control prompt should fit one line at 1280x720');
}

dialogueManager.registerDialogue('test.manual', {
    slides: [['Wait for training input.']],
    manualAdvance: true,
    allowMovementDuringDialogue: true,
});
dialogueManager.start('test.manual');
assert.equal(dialogueManager.setHighlightState('KeyW', 'confirmed'), true);
assert.equal(dialogueManager._active.highlightStates.KeyW, 'confirmed');
dialogueManager._onKey({ code: 'Enter', preventDefault() {}, stopPropagation() {} });
assert.equal(dialogueManager.isActive(), true, 'manual tutorial prompts must ignore ordinary advance input');
assert.equal(dialogueManager.discardActive('another.dialogue'), false, 'a different owner cannot discard the active dialogue');
assert.equal(dialogueManager.discardActive('test.manual'), true);

assert.equal(
    dialogueManager._displayTextForSlide(['First line.', '', 'Second line.'], { preserveLineBreaks: true }),
    'First line.\n\nSecond line.'
);

const gradient = { addColorStop() {} };
const renderedText = [];
const translatedPoints = [];
const renderContext = {
    canvas: { width: 1280, height: 720 },
    font: '',
    save() {}, restore() {}, beginPath() {}, closePath() {}, clip() {}, fill() {}, stroke() {},
    moveTo() {}, lineTo() {}, fillRect() {}, translate(x, y) { translatedPoints.push({ x, y }); }, rotate() {}, fillText(value) { renderedText.push(String(value)); },
    createLinearGradient() { return gradient; },
    measureText(value) { return { width: String(value).length * 9 }; },
};
context.IP2Live.Assets = { oxaniumMediumLoaded: true, ethnocentricLoaded: true };
dialogueManager.registerDialogue('test.render', {
    title: 'NETWORK RANGE',
    speaker: 'TRAINING',
    slides: [['Use {{highlight:Class A supports 1.0.0.0 through 126.255.255.255.}} Then press {{key:W|KeyW}}.']],
});
dialogueManager.start('test.render');
assert.doesNotMatch(dialogueManager._activeFullText(), /\{\{|\}\}/, 'typewriter text must never expose markup');
dialogueManager.drawOverlay(renderContext);
const measuredPanelHeight = dialogueManager._active.panelHeight;
assert.equal(
    translatedPoints.at(-1).y,
    720 - measuredPanelHeight - 26 + 25,
    'slide diamonds should sit in the upper-right header row'
);
assert.ok(renderedText.every((value) => !/NEURAL_LINK|Signal:/.test(value)));
dialogueManager._active.typeChars = dialogueManager._activeFullText().length;
dialogueManager.drawOverlay(renderContext);
assert.equal(
    dialogueManager._active.panelHeight,
    measuredPanelHeight,
    'panel height must be based on the complete slide rather than typing progress'
);
dialogueManager.discardActive('test.render');

const questSuppressionStates = [];
const minimapHighlightStates = [];
context.IP2Live.QuestManager = {
    setDialogueSuppressed(value) { questSuppressionStates.push(!!value); },
    _questPanelRect() { return { x: 18, y: 88, w: 430, h: 126 }; },
};
context.IP2Live.QuestMinimap = {
    setTutorialHighlight(value) { minimapHighlightStates.push(!!value); },
};
dialogueManager.registerDialogue('test.hud-focus', {
    title: 'HUD TRAINING',
    slides: [
        ['Health systems are online.'],
        { focusOnly: true, focus: 'health', label: 'HEALTH BAR', durationFrames: 999 },
        { focusOnly: true, focus: 'minimap', label: 'QUEST MINIMAP', durationFrames: 999 },
        ['HUD training complete.'],
    ],
});
const clonedFocusSlides = dialogueManager.getSlides('test.hud-focus');
assert.equal(clonedFocusSlides[1].focus, 'health', 'focus-slide metadata must survive dialogue cloning');
dialogueManager.start('test.hud-focus');
assert.equal(questSuppressionStates.at(-1), true, 'ordinary dialogue slides should suppress the Quest HUD');
dialogueManager._active.typeChars = dialogueManager._activeFullText().length;
dialogueManager.advance();
assert.equal(dialogueManager._active.slideIndex, 1);
assert.equal(dialogueManager._activeFullText(), '', 'HUD focus pauses must not expose metadata as dialogue text');
assert.equal(questSuppressionStates.at(-1), false, 'focus pauses should reveal the Quest HUD');
renderedText.length = 0;
dialogueManager._hudFocusTopLayerAvailable = true;
dialogueManager.drawOverlay(renderContext);
assert.equal(renderedText.includes('Health bar'), false, 'the nested dialogue pass must defer focus drawing when a top HUD layer is available');
dialogueManager.drawHudFocusOverlay(renderContext);
assert.ok(renderedText.includes('Health bar'));
assert.ok(renderedText.includes('Inspecting // click to continue'));
assert.ok(renderedText.every((value) => value !== 'Incoming transmission'), 'the large dialogue panel should be hidden during focus pauses');
dialogueManager.advance();
assert.equal(dialogueManager._active.slideIndex, 2);
assert.equal(minimapHighlightStates.at(-1), true, 'the minimap focus pause should enable its yellow DOM glow');
dialogueManager.advance();
assert.equal(questSuppressionStates.at(-1), true, 'the Quest HUD should be suppressed again for the next text box');
assert.equal(minimapHighlightStates.at(-1), false, 'the minimap glow should clear after its focus pause');
dialogueManager.discardActive('test.hud-focus');
dialogueManager._hudFocusTopLayerAvailable = false;

renderedText.length = 0;
dialogueManager.registerDialogue('test.progress', {
    slides: [['Press {{key:W|KeyW}} and {{key:S|KeyS}}.']],
    manualAdvance: true,
    requiredKeyCount: 2,
});
dialogueManager.start('test.progress');
dialogueManager.drawOverlay(renderContext);
assert.ok(renderedText.some((value) => value.includes('Training input: 0/2 confirmed')));
dialogueManager.setHighlightState('KeyW', 'confirmed');
dialogueManager.drawOverlay(renderContext);
assert.ok(renderedText.some((value) => value.includes('Training input: 1/2 confirmed')));
renderContext.canvas.width = 1920;
renderContext.canvas.height = 1080;
dialogueManager.drawOverlay(renderContext);
assert.ok(dialogueManager._active.panelHeight <= 1080 - 52 * 1.5);
dialogueManager.discardActive('test.progress');

console.log('Dialogue typography tests passed.');
