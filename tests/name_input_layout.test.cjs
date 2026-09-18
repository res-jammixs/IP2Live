const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
    path.join(__dirname, '..', 'Plugins', 'IP2Live_Core', 'modules', 'screens', 'name-input.js'),
    'utf8'
);

assert.match(source, /oxaniumMediumLoaded\s*\?\s*'Oxanium-Medium'/);
assert.doesNotMatch(source, /Nebula-Regular|monospace/);
assert.doesNotMatch(source, /PROFILE_INIT|AWAITING_INPUT|INPUT REQUIRED|SYS::IDENTITY_COMMIT/);
assert.doesNotMatch(source, /topBand|chargeW|\[ BACK \]|\[ CONFIRM \]/);
assert.match(source, /const panelW = 500/);
assert.match(source, /const panelH = 218/);
assert.match(source, /'BACK', this\.hoverBack, true, font/);
assert.match(source, /'CONFIRM', this\.hoverConfirm, false, font/);
assert.match(source, /'Type your name'/);
assert.match(source, /_drawHologramPanel\(/);
assert.match(source, /_drawAnimatedInputText\(/);
assert.match(source, /_getButtonTransitionLabel\(/);
assert.match(source, /buttonHoverMix/);
assert.match(source, /_drawBevelFacets\(/);
assert.match(source, /_drawCornerArmor\(/);
assert.match(source, /_drawEdgePlate\(/);
assert.doesNotMatch(source, /ID\.NODE|AUTH\s+AES|24 CHAR MAX/);

class BaseScene {}
const context = {
    console,
    window: {},
    Scene: { Base: BaseScene },
    Common: {
        ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 },
        Platform: { ctx: { canvas: { width: 1920, height: 1080 } } },
    },
    IP2Live: {},
    Manager: {},
    Data: {},
    Core: {},
    Main: {},
    setTimeout,
};
vm.runInNewContext(source, context);

const Screen = context.window.IP2LiveNameInputScreen;
const screen = new Screen();
const layout = screen._getPanelLayout(1280, 720);
assert.equal(layout.panelW, 500);
assert.equal(layout.panelH, 218);
assert.equal(layout.buttonW, 156);
assert.equal(layout.buttonH, 40);
assert.ok(layout.confirmX > layout.backX + layout.buttonW);
assert.ok(layout.buttonY + layout.buttonH < layout.panelY + layout.panelH);

const rects = screen._getButtonRects();
assert.equal(rects.backRect.w, 234);
assert.equal(rects.backRect.h, 60);
assert.equal(rects.confirmRect.w, rects.backRect.w);
assert.equal(rects.confirmRect.y, rects.backRect.y);
assert.ok(rects.confirmRect.x > rects.backRect.x + rects.backRect.w);

screen.animTick = 12;
screen.nameGlyphAnimations = [];
screen._lastInputValue = '';
screen._syncNameGlyphs('NOVA');
assert.equal(screen.nameGlyphAnimations.length, 4);
assert.equal(screen.nameGlyphAnimations[0].target, 'N');
assert.equal(screen._lastInputValue, 'NOVA');

const firstAnimation = screen.nameGlyphAnimations[0];
screen.animTick = firstAnimation.startedAt + firstAnimation.duration;
assert.equal(screen._getAnimatedNameGlyph('N', firstAnimation, 0), 'N');

screen.buttonHoverMix = { back: 0, confirm: 0 };
screen.hoverBack = true;
screen.hoverConfirm = false;
screen.inputActivity = 0;
assert.equal(screen._updateInteractionAnimations(), true);
assert.ok(screen.buttonHoverMix.back > 0);
const hoveredBackMix = screen.buttonHoverMix.back;
screen.hoverBack = false;
screen._updateInteractionAnimations();
assert.ok(screen.buttonHoverMix.back < hoveredBackMix);

console.log('Name input layout tests passed.');
