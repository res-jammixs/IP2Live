const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
let now = 100000;
let completed = 0;
let failed = 0;
let mistakes = 0;
const labels = [];
const canvas = new Proxy({
  canvas: { width: 1280, height: 720 },
  fillText(text) { labels.push(String(text)); },
  measureText(text) { return { width: String(text).length * 7 }; },
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; },
}, { get: (target, key) => key in target ? target[key] : () => {} });
const context = {
  console: { log() {}, warn() {}, error() {} },
  Date: class extends Date { static now() { return now; } }, Math,
  IP2Live: { GameManager: { handleGameplayMistake() { mistakes++; } } }, window: {},
  Scene: { Base: class {} }, Manager: { Stack: {}, GL: {} },
  Common: { Platform: { ctx: canvas }, ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 } },
  Data: { Systems: {}, Keyboards: { checkCancelMenu() { return false; } } },
  Core: {}, Graphic: {}, Model: {}, Main: {}, THREE: {}, inject() {}, setTimeout, clearTimeout,
};
for (const relative of ['common/ip_cidr_tools.js', 'gameplay5/CIDRQuarantine/ip_cidr_quarantine_gameplay.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(root, 'Plugins/IP2Live_Core/gameplay', relative), 'utf8'), context);
}
const Screen = context.IP2Live.CIDRQuarantineGameplayScreen;
function make(options = {}) {
  return new Screen({ spec: { tutorial: true, profile: { index: 1 } },
    onComplete() { completed++; }, onFailed() { failed++; }, ...options });
}
function enter(screen, value) {
  for (const char of String(value)) screen.onKeyPressed({ code: 'Digit' + char });
  screen.onKeyPressed('Enter');
}
function enterClass(screen, className) {
  for (const char of 'CLASS ' + className) {
    screen.onKeyPressed({ code: char === ' ' ? 'Space' : 'Key' + char });
  }
  screen.onKeyPressed('Enter');
  now += 1000;
  screen.update();
}
function solve(screen) {
  const p = screen.problem;
  enterClass(screen, p.ipClass);
  enter(screen, p.originalCIDR);
  for (let i = 0; i < p.borrowedBits; i++) screen.onKeyPressed('ArrowRight');
  screen.onKeyPressed('Enter');
  enter(screen, p.targetCIDR);
  enter(screen, p.targetHostBits);
  enter(screen, p.optimizedCapacity);
  assert.equal(screen.phase, 'build');
}

const animated = make();
assert.equal(animated._revealProgress(animated.phaseRevealAt), 0);
now += 190;
assert.ok(animated._revealProgress(animated.phaseRevealAt) > 0 && animated._revealProgress(animated.phaseRevealAt) < 1);
now += 200;
assert.equal(animated._revealProgress(animated.phaseRevealAt), 1);
animated._submitSegmentation('CLASS ' + animated.problem.ipClass);
assert.equal(animated._revealProgress(animated.phaseRevealAt), 0, 'each accepted answer starts the next-step reveal');
assert.equal(make({ reducedMotion: true })._revealProgress(now), 1, 'reduced motion skips animated reveals');

// Lock progress follows verified answers, including the final opening and retry.
const lock = make();
assert.equal(lock._lockVisualState().verified, 0);
lock._submitSegmentation('CLASS ' + lock.problem.ipClass);
assert.equal(lock._lockVisualState().verified, 1);
assert.equal(lock._lockVisualState().progress, 0);
now += 1000;
lock.update();
assert.equal(lock._lockVisualState().progress, 1);
lock._submitSegmentation('31');
assert.equal(lock._lockVisualState().verified, 1, 'an incorrect prefix cannot advance the lock');
lock._submitSegmentation(lock.problem.originalCIDR);
assert.equal(lock._lockVisualState().verified, 2);
lock._setBorrowedBits(lock.problem.borrowedBits);
lock._submitSegmentation();
assert.equal(lock._lockVisualState().verified, 3);
lock._submitSegmentation(lock.problem.targetCIDR);
assert.equal(lock._lockVisualState().verified, 4);
lock._submitSegmentation(lock.problem.targetHostBits);
assert.equal(lock._lockVisualState().verified, 5);
assert.equal(lock._lockVisualState().open, 0, 'the shackle stays closed before all six answers');
lock._submitSegmentation(lock.problem.optimizedCapacity);
assert.equal(lock._lockVisualState().verified, 6);
assert.equal(lock._lockVisualState().progress, 5);
now += 325;
assert.ok(lock._lockVisualState().open > 0 && lock._lockVisualState().open < 1);
now += 325;
assert.equal(lock._lockVisualState().progress, 6);
assert.equal(lock._lockVisualState().open, 1);
lock._resetTutorialAttemptAfterFailure();
assert.equal(lock._lockVisualState().verified, 0, 'retry restores the closed lock');
const stillLock = make({ reducedMotion: true });
solve(stillLock);
assert.equal(stillLock._lockVisualState().progress, 6);
assert.equal(stillLock._lockVisualState().open, 1, 'reduced motion immediately shows completed progress');

// The refined brief's /16 -> /19 example, including migration of its route.
const base = make().problem;
const screen = make({ problem: { ...base, ipAddress: '172.16.0.0', ipClass: 'B',
  originalCIDR: 16, requiredSubnets: 6 } });
assert.equal(screen.problem.targetCIDR, 19);
assert.equal(screen.problem.targetHostBits, 13);
assert.equal(screen.problem.optimizedCapacity, 8190);
assert.equal(screen.problem.allocatedCIDR, '172.16.0.0/19');
assert.equal(screen.timeLimitSeconds, 180);
screen.drawHUD();
assert.ok(!labels.some((text) => /APEX|RECOVERY|REACTOR|SECURITY ZONES/.test(text)), 'the class question uses direct networking terms');
assert.ok(labels.includes('03:00'));
assert.ok(labels.join('').includes('172.16.0.0'));
assert.ok(!labels.some((text) => text.includes('/16') || text.includes('/19') || text.includes('8190')),
  'initial screen must not disclose the profile or capacity');
const initialPath = JSON.stringify(screen.path);
screen.onMouseDown(130, 175);
screen.onKeyPressed('ArrowRight');
assert.equal(JSON.stringify(screen.path), initialPath, 'routing is locked during prerequisites');
const wrongClassScreen = make();
const wrongClass = wrongClassScreen.problem.ipClass === 'A' ? 'B' : 'A';
for (const char of 'CLASS ' + wrongClass) wrongClassScreen.onKeyPressed({ code: char === ' ' ? 'Space' : 'Key' + char });
wrongClassScreen.onKeyPressed('Enter');
assert.equal(wrongClassScreen.phase, 'classify', 'wrong answers cannot advance');
assert.equal(wrongClassScreen.classMistakes, 1);
enterClass(screen, 'B');
enter(screen, '16');
assert.equal(screen.phase, 'borrow_bits');
const borrowLabels = [];
const drawText = screen._terminalText;
screen._terminalText = function (ctx, metrics, text, ...rest) {
  borrowLabels.push(String(text));
  return drawText.call(this, ctx, metrics, text, ...rest);
};
screen.drawHUD();
screen._terminalText = drawText;
assert.ok(borrowLabels.some((text) => text.includes('REQUIRED SUBNETS: 6')),
  'the borrowing task keeps the required subnet count visible');
assert.ok(!borrowLabels.some((text) => /2\^|\b(?:1|2|4|8)\s+SUBNETS?\b/i.test(text)),
  'the borrowing task leaves subnet calculations to the calculator');
assert.ok(!screen.segmentationRects.some((rect) => rect.action === 'analyzer'),
  'the analyzer is no longer a second way to solve the prerequisite');
screen._setBorrowedBits(2);
borrowLabels.length = 0;
screen._terminalText = function (ctx, metrics, text, ...rest) {
  borrowLabels.push(String(text));
  return drawText.call(this, ctx, metrics, text, ...rest);
};
screen.drawHUD();
screen._terminalText = drawText;
assert.ok(!borrowLabels.some((text) => /2\^|\b4\s+SUBNETS\b/i.test(text)),
  'changing bulbs must not reveal the calculated subnet total');
screen.onKeyPressed('Enter');
assert.equal(screen.phase, 'borrow_bits', 'four subnets cannot satisfy six zones');
screen._setBorrowedBits(4);
screen.onKeyPressed('Enter');
assert.equal(screen.phase, 'borrow_bits', 'extra borrowed bits must be rejected');
screen._setBorrowedBits(3);
screen.onKeyPressed('Enter');
labels.length = 0;
screen.drawHUD();
assert.ok(!labels.some((text) => text.includes('/19')), 'new prefix is not revealed before answering');
enter(screen, '19');
screen.onKeyPressed('KeyI');
assert.equal(Boolean(screen.analyzerOpen), false, 'I no longer opens an analyzer overlay');
enter(screen, '13');
assert.equal(screen.phase, 'host_capacity');
enter(screen, '8192');
assert.equal(screen.phase, 'host_capacity', 'network and broadcast addresses must be subtracted');
for (let i = 0; i < 4; i++) screen.onKeyPressed('Backspace');
enter(screen, '8190');
assert.equal(screen.phase, 'build');
screen.path = screen.problem.solutionPath.map((tile) => ({ ...tile }));
screen._confirmPath();
assert.equal(screen.phase, 'tracing');
for (let i = 0; i < 1000 && !screen.finished; i++) screen.update();
assert.equal(completed, 1, 'the verified route completes the existing quest callback once');
assert.equal(screen.finished, true);

// Pointer-only completion and calculator placement at several viewport sizes.
for (const [width, height] of [[1280, 720], [1920, 1080], [960, 540]]) {
  canvas.canvas.width = width; canvas.canvas.height = height;
  const seeded = make().problem;
  const s = make({ problem: { ...seeded, ipAddress: '192.168.42.0', ipClass: 'C', originalCIDR: 24, requiredSubnets: 3 }, reducedMotion: true });
  const click = (action, value) => {
    s.drawHUD();
    assert.ok(!s.segmentationRects.some((rect) => rect.action === 'analyzer'),
      'no prerequisite phase presents an analyzer button');
    const target = s.segmentationRects.find((r) => r.action === action && (value === undefined || r.value === value));
    assert.ok(target, `${action} target exists`);
    assert.ok(target.x >= 0 && target.y >= 0 && target.x + target.w <= width && target.y + target.h <= height);
    s.onMouseDown(target.x + target.w / 2, target.y + target.h / 2);
  };
  const digits = (answer) => { for (const digit of String(answer)) click('digit', digit); click('submit'); };
  s._submitSegmentation('CLASS C'); digits(24);
  s.drawHUD();
  const calculator = s.segmentationRects.find((rect) => rect.action === 'calculator');
  assert.ok(calculator, 'calculator stays available once the default prefix is verified');
  assert.equal(calculator.w, 44 * s._metrics().sX);
  assert.equal(calculator.h, 44 * s._metrics().sY);
  assert.equal(calculator.x, 1112 * s._metrics().sX);
  assert.equal(calculator.y, 144 * s._metrics().sY);
  assert.ok(s.segmentationRects.every((r) => r.action !== 'bit' || r.value <= 6));
  click('bit', 2); click('submit'); digits(26);
  digits(6); digits(62);
  assert.equal(s.phase, 'build');
  s.onKeyPressed('KeyI');
  assert.equal(Boolean(s.analyzerOpen), false, 'routing has no analyzer shortcut');
}

// Infection grows during classification, but never consumes the solution early.
const pressure = make({ timeLimitSeconds: 300 });
const initialViruses = pressure.problem.viruses.length;
for (let seconds = 1; seconds <= 250; seconds++) { now += 1000; pressure.update(); }
assert.ok(pressure.problem.viruses.length > initialViruses);
assert.equal(pressure.phase, 'classify');
assert.equal(pressure.virusState.overrun, false, 'density cannot force an early loss');
assert.ok(pressure.problem.solutionPath.every((tile) => !pressure._isVirus(tile)));
solve(pressure);
pressure.path = pressure.problem.solutionPath.map((tile) => ({ ...tile }));
assert.equal(pressure._evaluatePath().ok, true, 'protected weighted route remains valid after heavy infection');

const timed = make({ timeLimitSeconds: 1, maxAttempts: 2 });
const failuresBeforeTimeout = failed;
now += 1001; timed.update();
assert.equal(timed.phase, 'overrun');
labels.length = 0; timed.drawHUD();
assert.ok(labels.includes('QUARANTINE BREACHED'), 'timeout begins with a breach popup');
now += 3000; timed.update();
assert.equal(timed.finished, false, 'the pixel takeover finishes before leaving gameplay');
now += 2200; timed.update();
assert.equal(timed.finished, true, 'timeout ends the run without restarting');
assert.equal(timed.attemptsUsed, 1);
assert.equal(timed.questElapsedMs, 1000, 'the failed run keeps its final clock value');
assert.equal(mistakes, 0, 'timeout goes through the terminal callback rather than a retry diagnostic');
now += 1001; timed.update();
for (let i = 0; i < 45; i++) timed.update();
assert.equal(failed, failuresBeforeTimeout + 1, 'a finished run reports failure only once');
context.IP2Live.ARDiagnosticRewind = { show() { throw new Error('Gameplay 5 must not open AR diagnostics'); } };
for (const tutorialMode of [false, true]) {
  const ended = make({ tutorialMode, timeLimitSeconds: 1 });
  const previousFailures = failed;
  ended._applyVirusOverrunFailure();
  assert.equal(ended.finished, true);
  assert.equal(failed, previousFailures + 1);
  const rejected = make({ tutorialMode });
  rejected.trace = { result: { ok: false, reason: 'too_small' } };
  rejected._resolveTrace();
  assert.equal(rejected.finished, true, 'a rejected final route ends both regular and tutorial play');
}

const unlimited = make({ timeLimitSeconds: 0 });
now += 600000; unlimited.update();
assert.equal(unlimited.phase, 'classify');
assert.equal(unlimited.virusState.overrun, false);
const configured = make({ spec: { timeLimitSeconds: 120 } });
assert.equal(configured.timeLimitSeconds, 120);
const dialog = make();
dialog.tutorialPromptActive = true;
now += 5000; dialog.update();
assert.equal(dialog.questElapsedMs, 0, 'instruction dialogue pauses the clock');
dialog.tutorialPromptActive = false;
now += 1000; dialog.update();
assert.equal(dialog.questElapsedMs, 1000);
context.IP2Live.GameplayPause = { menuOpen: true };
now += 120000;
dialog.onGameplayResume();
context.IP2Live.GameplayPause.menuOpen = false;
now += 1000; dialog.update();
assert.equal(dialog.questElapsedMs, 2000, 'resuming a live pause excludes the paused duration');

Screen._classBag = [];
const classCounts = { A: 0, B: 0, C: 0 };
const borrowedRanges = { A: new Set(), B: new Set(), C: new Set() };
for (let i = 0; i < 45; i++) {
  const generated = new Screen({ spec: { profile: { index: 1 + i % 9 } } });
  const p = generated.problem;
  classCounts[p.ipClass]++;
  borrowedRanges[p.ipClass].add(p.borrowedBits);
  assert.ok(Math.pow(2, p.targetHostBits) - 2 >= p.requiredHosts, 'host capacity reserves network and broadcast addresses');
  assert.ok(Math.pow(2, p.borrowedBits) >= p.requiredSubnets);
  assert.ok(p.borrowedBits === 0 || Math.pow(2, p.borrowedBits - 1) < p.requiredSubnets);
  assert.equal(p.targetHostBits, 32 - p.targetCIDR);
  assert.equal(context.IP2Live.CIDRTools.networkStart(p.ipInt, p.originalCIDR), p.ipInt);
  solve(generated);
  generated.path = p.solutionPath.map((tile) => ({ ...tile }));
  assert.equal(generated._evaluatePath().ok, true);
}
assert.deepEqual(classCounts, { A: 15, B: 15, C: 15 }, 'every three generated puzzles include all classes');
assert.ok([...borrowedRanges.A].some((bits) => bits > 5));
assert.ok([...borrowedRanges.B].some((bits) => bits > 5));
assert.equal(make()._capacityForHostBits(5), 30, 'five host bits cannot support 31 hosts');
assert.equal(make()._capacityForHostBits(6), 62);
console.log('gameplay5_segmentation.test.cjs: PASS');
