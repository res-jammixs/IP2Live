const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let now = 100000;
let active = null;
const definitions = new Map();
const shown = [];
const dm = {
  registerDialogue(id, definition) { definitions.set(id, definition); },
  start(id, context) { active = { ...definitions.get(id), context }; shown.push({ id, ...active }); return true; },
  isActive() { return active !== null; },
  advance() {},
};
const context = {
  console: { log() {}, warn() {} }, window: {}, IP2Live: { DialogueManager: dm },
  Date: class extends Date { static now() { return now; } }, Math, setTimeout, clearTimeout,
  Scene: { Base: class {} }, Manager: { Stack: {}, GL: {} },
  Common: { ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 }, Platform: {} },
  Data: { Systems: {}, Keyboards: { checkCancelMenu() { return false; } } },
  Core: {}, Graphic: {}, Model: {}, Main: {}, THREE: {}, inject() {},
};
const directory = path.join(__dirname, '../Plugins/IP2Live_Core/gameplay');
for (const file of ['common/ip_class_ranges.js', 'common/ip_cidr_tools.js',
  'gameplay5/CIDRQuarantine/ip_cidr_quarantine_tutorial.js',
  'gameplay5/CIDRQuarantine/ip_cidr_quarantine_gameplay.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(directory, file), 'utf8'), context);
}
const Screen = context.IP2Live.CIDRQuarantineGameplayScreen;
const make = (options = {}) => new Screen({ spec: { tutorial: true, profile: { index: 1 } }, tutorialMode: true, ...options });
function dismiss() {
  for (let count = 0; active; count++) {
    assert.ok(count < 10, 'dialogue callbacks must not loop');
    const current = active;
    active = null;
    current.onComplete?.();
  }
}
function enter(screen, number) {
  for (const digit of String(number)) screen.onKeyPressed({ code: 'Digit' + digit });
  screen.onKeyPressed({ code: 'Enter' });
  screen.update();
}
function enterClass(screen) {
  for (const char of 'CLASS ' + screen.problem.ipClass) {
    screen.onKeyPressed({ code: char === ' ' ? 'Space' : 'Key' + char });
  }
  screen.onKeyPressed({ code: 'Enter' });
  now += 1000;
  screen.update();
}

const screen = make();
screen.update();
assert.match(shown.at(-1).id, /\.intro\./, 'story must precede the first question');
assert.match(active.slides.flat().join(' '), /APEX/);
assert.doesNotMatch(active.slides.flat().join(' '), /usable hosts = \d+/, 'story must not reveal answers');
const elapsed = screen.questElapsedMs;
const infection = screen.problem.viruses.length;
now += 20000;
screen.update();
screen.onKeyPressed({ code: 'KeyC' });
assert.equal(screen.phase, 'classify', 'dialogue must block answer entry');
assert.equal(screen.questElapsedMs, elapsed, 'reading must not consume quest time');
assert.equal(screen.problem.viruses.length, infection, 'reading must suspend infection');
dismiss();
assert.match(shown.at(-1).id, /phase\.classify\./);
assert.match(shown.at(-1).slides.flat().join(' '), /A = 1-126/);
assert.match(shown.at(-1).slides.flat().join(' '), /recessed display/);
assert.match(shown.at(-1).slides.flat().join(' '), /three small lights/);
const count = shown.length;
screen.update();
assert.equal(shown.length, count, 'a completed lesson must not replay each frame');
screen.onKeyPressed({ code: 'KeyA' });
screen.update();
assert.equal(screen.phase, 'classify');
assert.equal(shown.length, count, 'a wrong answer keeps the current lesson complete');
screen.onKeyPressed({ code: 'Backspace' });
enterClass(screen);
assert.match(shown.at(-1).id, /phase\.default_prefix\./);
const prefixLesson = active.slides.flat().join(' ');
assert.match(prefixLesson, /Gameplay 3/);
assert.doesNotMatch(prefixLesson, /Gameplay 2/);
assert.match(prefixLesson, /8 light bulbs/);
assert.match(prefixLesson, /Remember: 8 bulbs per octet/);
assert.doesNotMatch(prefixLesson, /Count the lit bulbs/i);
assert.match(prefixLesson, /A = 1 x 8 = \/8; B = 2 x 8 = \/16; C = 3 x 8 = \/24/);
dismiss();
enter(screen, screen.problem.originalCIDR);
assert.match(shown.at(-1).id, /phase\.borrow_bits\./);
const bulbs = active.slides.flat().join(' ');
assert.equal(active.slides.length, 3, 'borrowing guidance stays compact');
assert.ok(active.slides.every(slide => slide.length <= 2), 'each slide contains at most two points');
assert.match(bulbs, /remaining host bits \(h\)/);
assert.match(bulbs, /two addresses per subnet/);
assert.match(bulbs, /Do not subtract 2 from the subnet count/);
dismiss();
for (let i = 0; i < screen.problem.borrowedBits; i++) screen.onKeyPressed({ code: 'ArrowRight' });
screen.onKeyPressed({ code: 'Enter' });
screen.update();
assert.match(shown.at(-1).id, /phase\.new_cidr\./);
dismiss();
enter(screen, screen.problem.targetCIDR);
assert.match(shown.at(-1).id, /phase\.host_bits\./);
assert.match(active.slides.flat().join(' '), /binary positions, not devices/);
dismiss();
enter(screen, screen.problem.targetHostBits);
assert.match(shown.at(-1).id, /phase\.host_capacity\./);
assert.match(active.slides.flat().join(' '), /\{\{highlight:2\^h = total addresses\}\}/);
dismiss();
const totalAddresses = Math.pow(2, screen.problem.targetHostBits);
enter(screen, totalAddresses);
assert.equal(screen.phase, 'host_capacity', 'total addresses must not pass as usable hosts');
for (const digit of String(totalAddresses)) screen.onKeyPressed('Backspace');
enter(screen, screen.problem.optimizedCapacity);
assert.match(shown.at(-1).id, /\.route\./);
assert.ok(active.slides.flat().join(' ').includes(screen._formatHosts(totalAddresses) + ' total addresses'));
assert.ok(active.slides.flat().join(' ').includes(screen._formatHosts(screen.problem.optimizedCapacity) + ' usable hosts per subnet'));
dismiss();
assert.match(shown.at(-1).id, /\.step\.1\./);
let direction;
const append = screen._appendDirection;
screen._appendDirection = (value) => { direction = value; };
screen.onKeyPressed({ code: 'KeyD' });
assert.equal(direction, 'R', 'advertised WASD controls must accept browser key codes');
screen._appendDirection = append;
screen._handlePathTile(screen.problem.solutionPath[1]);
assert.match(shown.at(-1).id, /\.step\.2\./);
dismiss();

screen._resetTutorialAttemptAfterFailure();
screen.update();
assert.match(shown.at(-1).id, /phase\.classify\./, 'retry restores prerequisite guidance');
assert.equal(shown.filter((entry) => entry.id.includes('.intro.')).length, 1, 'retry need not repeat the story');
dismiss();
const regular = make({ tutorialMode: false });
assert.deepEqual(screen._classLockLayout(), regular._classLockLayout(),
  'tutorial and regular play share the compact popup geometry');
screen._segmentationLayout(screen._metrics());
const entry = screen.segmentationRects.find((rect) => rect.action === 'entry');
const field = screen._classLockLayout().input;
assert.deepEqual([entry.x, entry.y, entry.w, entry.h], [field.x, field.y, field.w, field.h],
  'the tutorial hit target is aligned with the visible answer field');
const beforeRegular = shown.length;
regular.update();
assert.equal(shown.length, beforeRegular, 'regular nodes stay independent');

// Each lesson uses the current controls rather than the legacy right-panel bounds.
for (const [width, height] of [[1280, 720], [1920, 1080], [960, 540]]) {
  context.Common.Platform.ctx = { canvas: { width, height } };
  const m = screen._metrics();
  screen._buildInteractionRects(m);
  for (const phase of ['classify', 'default_prefix', 'borrow_bits', 'new_cidr', 'host_bits', 'host_capacity']) {
    screen.phase = phase;
    screen._segmentationLayout(m);
    context.IP2Live.IPCIDRQuarantineTutorial.showPhaseGuide(phase, screen._tutorialContext(), () => {});
    active.slides.forEach((_, slideIndex) => {
      active.slideIndex = slideIndex;
      const rects = screen._tutorialFocusRects(m, active);
      assert.ok(rects.length, phase + ': every instruction slide has a target');
      for (const r of rects) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= m.cW && r.y + r.h <= m.cH);
      const names = active.context.gameplayFocus[slideIndex];
      if (names.includes('verify')) assert.ok(rects.includes(screen.segmentationRects.find(r => r.action === 'submit')) || phase === 'borrow_bits');
      if (names.includes('class_input')) {
        const r = rects[names.indexOf('class_input')];
        assert.equal(r.x, field.x * m.sX); assert.equal(r.w, field.w * m.sX);
      }
    });
    dismiss();
  }
}

const classB = make({ problem: { ...make().problem, ipAddress: '172.16.0.0', ipClass: 'B', originalCIDR: 16, requiredSubnets: 6 } });
const values = classB._tutorialContext();
assert.equal(values.optimizedHostBits, 13);
assert.equal(Number(values.totalAddresses.replace(/,/g, '')), 8192);
assert.equal(Number(values.optimizedCapacity.replace(/,/g, '')), 8190);
context.IP2Live.IPCIDRQuarantineTutorial.showPhaseGuide('classify', { timeLimitSeconds: 0 }, () => {});
assert.match(active.slides.flat().join(' '), /no time limit/);
dismiss();

// The helper's synchronous fallback must not leave the game locked or recurse.
delete context.IP2Live.DialogueManager;
const fallback = make();
fallback.update();
assert.equal(fallback.tutorialPromptActive, false);
assert.equal(fallback.tutorialSeenPhases.classify, true);
console.log('gameplay5_tutorial_flow.test.cjs: PASS');
