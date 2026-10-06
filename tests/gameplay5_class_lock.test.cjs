const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let now = 100000;
const context = {
  console: { log() {}, warn() {} },
  Date: class extends Date { static now() { return now; } }, Math, setTimeout, clearTimeout,
  window: {}, IP2Live: {}, Scene: { Base: class {} }, Manager: { Stack: {}, GL: {} },
  Common: { ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 }, Platform: {} },
  Data: { Systems: {}, Keyboards: { checkCancelMenu() { return false; } } },
  Core: {}, Graphic: {}, Model: {}, Main: {}, THREE: {}, inject() {},
};
const root = path.join(__dirname, '../Plugins/IP2Live_Core/gameplay');
for (const file of ['common/ip_class_ranges.js', 'common/ip_cidr_tools.js',
  'gameplay5/CIDRQuarantine/ip_cidr_quarantine_gameplay.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}
const Screen = context.IP2Live.CIDRQuarantineGameplayScreen;
function make(options = {}) {
  return new Screen({ spec: { profile: { index: 1 } }, ...options });
}
function type(screen, value) {
  for (const letter of value) screen.onKeyPressed(letter === ' '
    ? { name: ' ', code: 'Space' } : { name: letter.toLowerCase(), code: 'Key' + letter });
  screen.onKeyPressed({ code: 'Enter' });
}

const seen = new Set();
const panel = make({ reducedMotion: true });
panel._segmentationLayout(panel._metrics());
assert.deepEqual(Array.from(panel.segmentationRects, (rect) => rect.action), ['entry'],
  'the compact class panel exposes only the typed answer field');
for (let i = 0; i < 60; i++) {
  const screen = make();
  const p = screen.problem;
  seen.add(p.ipClass);
  assert.equal(context.IP2Live.IPClassRanges.classifyAddress(p.ipAddress), p.ipClass);
  assert.equal(p.originalCIDR, { A: 8, B: 16, C: 24 }[p.ipClass]);
  assert.equal(p.targetCIDR, p.originalCIDR + p.borrowedBits);
  assert.ok(Math.pow(2, p.borrowedBits) >= p.requiredSubnets);
  assert.equal(screen._pathExponent(p.solutionPath), p.targetHostBits);
}
assert.deepEqual([...seen].sort(), ['A', 'B', 'C'], 'initial locks should cover all three classes');

const recalculated = make({ spec: { profile: { index: 1 }, classOverride: 'C' }, reducedMotion: true });
const old = { ...recalculated.problem };
recalculated.questElapsedMs = 12500;
type(recalculated, 'A');
assert.equal(recalculated.phase, 'classify');
assert.equal(recalculated.classMistakes, 1, 'a wrong lone letter spends a try before refreshing');
assert.equal(recalculated.classFormation, null, 'reduced motion replaces the formation immediately');
assert.notEqual(recalculated.problem.ipClass, old.ipClass);
assert.notEqual(recalculated.problem.ipAddress, old.ipAddress);
assert.notEqual(recalculated.problem.originalCIDR, old.originalCIDR);
assert.notEqual(recalculated.problem.targetCIDR, old.targetCIDR);
assert.equal(recalculated.questElapsedMs, 12500, 'address refresh cannot reset the timer');
assert.equal(recalculated.path.length, 1);
assert.equal(recalculated._pathExponent(recalculated.problem.solutionPath), recalculated.problem.targetHostBits);
const refreshedProblem = recalculated.problem;
type(recalculated, refreshedProblem.ipClass);
assert.equal(recalculated.phase, 'default_prefix', 'a correct lone letter unlocks the next step');
assert.equal(recalculated.problem, refreshedProblem, 'a correct answer must retain the address and virus formation');
assert.equal(recalculated.classMistakes, 1, 'success does not spend an attempt');

for (const ipClass of ['A', 'B', 'C']) {
  for (const answer of [ipClass.toLowerCase(), 'CLASS ' + ipClass]) {
    const correct = make({ spec: { profile: { index: 1 }, classOverride: ipClass }, reducedMotion: true });
    const initialProblem = correct.problem;
    type(correct, answer);
    assert.equal(correct.phase, 'default_prefix');
    assert.equal(correct.problem, initialProblem);
    assert.equal(correct.classMistakes, 0);
  }
}

let failure;
const lockout = make({ spec: { profile: { index: 1 }, classOverride: 'B' }, reducedMotion: true,
  onFailed(result) { failure = result; } });
lockout._submitSegmentation('');
assert.equal(lockout.classMistakes, 0, 'empty submission does not spend a try');
for (let i = 1; i <= 3; i++) {
  type(lockout, 'CLASS ' + (lockout.problem.ipClass === 'A' ? 'B' : 'A'));
  assert.equal(lockout.classMistakes, i);
  assert.equal(lockout.finished, i === 3);
}
assert.equal(failure.diagnosticReason, 'class_lockout');
assert.equal(failure.attemptsUsed, 3);
assert.equal(failure.maxAttempts, 3);
lockout._submitSegmentation(lockout.problem.ipClass);
assert.equal(lockout.phase, 'classify', 'finished locks reject direct submissions');

let tutorialFailure;
const tutorialLockout = make({ tutorialMode: true, reducedMotion: true,
  onFailed(result) { tutorialFailure = result; } });
for (let i = 0; i < 3; i++) type(tutorialLockout, tutorialLockout.problem.ipClass === 'A' ? 'B' : 'A');
assert.equal(tutorialLockout.finished, true, 'tutorial classification still fails after three mistakes');
assert.equal(tutorialFailure.attemptsUsed, 3);
assert.equal(tutorialFailure.diagnosticReason, 'class_lockout');

const reforming = make();
const oldFormation = JSON.stringify(reforming.problem.viruses);
reforming.questElapsedMs = 12500;
type(reforming, reforming.problem.ipClass === 'A' ? 'B' : 'A');
assert.equal(reforming.classMistakes, 1);
assert.equal(reforming._classFormationActive(), true);
assert.equal(JSON.stringify(reforming.classFormation.oldViruses), oldFormation);
const newProblem = reforming.problem;
type(reforming, newProblem.ipClass);
assert.equal(reforming.phase, 'classify', 'answer entry waits for the new formation');
assert.equal(reforming.classMistakes, 1, 'repeated Enter during the transition does not spend more attempts');
now += 800;
reforming.update();
assert.equal(reforming.classFormation, null);
assert.equal(reforming.questElapsedMs, 13300, 'changing formation does not reset or stop the quest clock');
type(reforming, newProblem.ipClass);
assert.equal(reforming.phase, 'default_prefix');
assert.equal(reforming.problem, newProblem);
now += 1000;
reforming.update();

const extraLetters = make({ spec: { profile: { index: 1 }, classOverride: 'A' }, reducedMotion: true });
type(extraLetters, 'CLASS AA');
assert.equal(extraLetters.phase, 'classify', 'extra characters must never become a valid truncated answer');
assert.equal(extraLetters.classMistakes, 1);

const animated = make({ spec: { profile: { index: 1 }, classOverride: 'A' } });
type(animated, 'CLASS A');
assert.equal(animated.phase, 'default_prefix');
assert.equal(animated._classUnlockActive(), true);
animated.onKeyPressed({ code: 'Digit8' });
assert.equal(animated.answer, '', 'input stays locked through the reveal');
now += 500;
animated.update();
assert.equal(animated._classUnlockActive(), true);
assert.equal(animated.questElapsedMs, 0, 'the short reveal does not consume quest time');
now += 500;
animated.update();
assert.equal(animated._classUnlockActive(), false);
assert.equal(animated.questElapsedMs, 0);
animated.onKeyPressed({ code: 'Digit8' });
assert.equal(animated.answer, '8');

// Exercise the real transition painter, including its captured accepted answer.
const paintedText = [];
const slices = [];
function canvasContext(canvas) {
  return new Proxy({
    canvas, globalAlpha: 1,
    measureText() { return { width: NaN }; },
    fillText(text) { paintedText.push(String(text)); },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    drawImage(...args) { if (args.length === 9) slices.push(args); },
  }, { get: (target, key) => key in target ? target[key] : () => {} });
}
context.document = { createElement() {
  const canvas = { width: 0, height: 0 };
  canvas.getContext = () => canvasContext(canvas);
  return canvas;
} };
const dissolve = make();
type(dissolve, dissolve.problem.ipClass === 'A' ? 'B' : 'A');
const spriteCenters = [];
let maskPixels = 0;
const maskContext = canvasContext({ width: 1280, height: 720 });
maskContext.rect = () => { maskPixels++; };
dissolve._drawVirusIcon = (ctx, x, y) => spriteCenters.push([x, y]);
const grid = { x: 0, y: 0, w: 320, h: 320 };
now += 200;
dissolve._drawClassFormation(maskContext, { sX: 1, sY: 1 }, grid, 20);
assert.deepEqual(spriteCenters, Array.from(dissolve.classFormation.oldViruses,
  (tile) => [tile.col * 20 + 10, tile.row * 20 + 10]), 'fade out uses the old formation');
assert.ok(maskPixels > 0 && maskPixels < spriteCenters.length * 64,
  'the pixel mask removes fragments rather than fading an intact sprite');
spriteCenters.length = 0;
now += 400;
dissolve._drawClassFormation(maskContext, { sX: 1, sY: 1 }, grid, 20);
assert.deepEqual(spriteCenters, Array.from(dissolve.problem.viruses,
  (tile) => [tile.col * 20 + 10, tile.row * 20 + 10]), 'fade in assembles the new formation');

const painted = make({ spec: { profile: { index: 1 }, classOverride: 'B' } });
type(painted, 'CLASS B');
const output = canvasContext({ width: 1280, height: 720 });
now += 300;
painted._drawClassUnlockTransition(output, { sX: 1, sY: 1 });
assert.ok(paintedText.includes('CLASS B'), 'the departing pane retains the accepted answer');
assert.ok(!paintedText.includes('CLASS _'), 'success must not flash the empty input');
assert.ok(slices.some((args) => args[5] !== 0), 'success displaces actual popup pixels');
const captured = painted.classUnlockSurface;
now += 300;
painted._drawClassUnlockTransition(output, { sX: 1, sY: 1 });
assert.equal(painted.classUnlockSurface, captured, 'animation reuses the captured surface');
now += 400;
painted.update();
assert.equal(painted.classUnlockSurface, null, 'completion releases the captured surface');
const still = make({ spec: { profile: { index: 1 }, classOverride: 'C' }, reducedMotion: true });
type(still, 'CLASS C');
assert.equal(still.phase, 'default_prefix');
assert.equal(still._classUnlockActive(), false, 'reduced motion immediately opens the next step');

console.log('gameplay5_class_lock.test.cjs: PASS');
