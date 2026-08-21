const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const gameplayPath = path.join(
  projectRoot,
  'Plugins',
  'IP2Live_Core',
  'gameplay',
  'gameplay4_5',
  'HostPowerReactor',
  'ip_host_power_gameplay.js'
);

const context = {
  console: { log() {}, warn() {}, error() {} },
  Date,
  Math,
  setTimeout,
  clearTimeout,
  IP2Live: {},
  window: {},
  Scene: { Base: class {} },
  Manager: { Stack: {}, GL: {} },
  Common: { ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 }, Platform: {} },
  Core: {},
  Data: { Keyboards: {}, Systems: {} },
  Graphic: {},
  Model: {},
  Main: {},
  THREE: {},
  inject() {},
};

vm.runInNewContext(fs.readFileSync(gameplayPath, 'utf8'), context, { filename: gameplayPath });
const rules = context.IP2Live.HostPowerRules;

assert.ok(rules, 'HostPowerRules should be exposed through IP2Live');
assert.equal(rules.RESERVED_ADDRESSES, 2);

// The example from the gameplay brief: 3000 hosts needs h=12.
assert.equal(rules.minimumExponent(3000), 12);
assert.equal(rules.totalAddresses(12), 4096);
assert.equal(rules.usableHosts(12), 4094);
assert.equal(rules.evaluate(3000, 11).status, 'under');
assert.equal(rules.evaluate(3000, 12).valid, true);
assert.equal(rules.evaluate(3000, 13).status, 'over');

// Matching total addresses is intentionally insufficient because two are reserved.
assert.equal(rules.totalAddresses(11), 2048);
assert.equal(rules.evaluate(2048, 11).valid, false);
assert.equal(rules.evaluate(2048, 11).status, 'under');
assert.equal(rules.evaluate(2048, 12).valid, true);

// Class-capacity boundaries must remain valid for Class A, B, and C only.
assert.deepEqual(Object.keys(rules.CLASS_LIMITS), ['A', 'B', 'C']);
assert.equal(rules.minimumExponent(rules.CLASS_LIMITS.C.maxHosts), 8);
assert.equal(rules.minimumExponent(rules.CLASS_LIMITS.B.maxHosts), 16);
assert.equal(rules.minimumExponent(rules.CLASS_LIMITS.A.maxHosts), 24);

for (const className of ['A', 'B', 'C']) {
  const config = rules.CLASS_LIMITS[className];
  for (let i = 0; i < 250; i++) {
    const requiredHosts = rules.randomRequiredHosts(className);
    assert.ok(requiredHosts >= config.minHosts, `${className} target should respect its lower range`);
    assert.ok(requiredHosts <= config.maxHosts, `${className} target should respect its maximum usable hosts`);
    assert.ok(rules.minimumExponent(requiredHosts) <= config.maxHostBits, `${className} target must fit its class`);
  }
}

const scenario = rules.createScenario({ targetClass: 'B', requiredHosts: 3000 });
assert.equal(scenario.className, 'B');
assert.equal(scenario.requiredHosts, 3000);
assert.equal(scenario.targetExponent, 12);
assert.equal(scenario.bitsToBorrow, 4);
assert.equal(scenario.addressDemand, 3002);
assert.equal(scenario.usableHosts, 4094);

// RPG Paper Maker may call load() from Scene.Base before the derived
// constructor has finished. Gameplay must still leave "ready" and begin
// spawning on its first live update instead of remaining frozen at 00:60.
class EarlyLoadBase {
  constructor(loading) {
    this.loading = !!loading;
    if (this.loading && typeof this.load === 'function') this.load();
  }
}
const lifecycleContext = {
  console: { log() {}, warn() {}, error() {} },
  Date,
  Math,
  setTimeout,
  clearTimeout,
  IP2Live: {},
  window: {},
  Scene: { Base: EarlyLoadBase },
  Manager: { Stack: { requestPaintHUD: false }, GL: {} },
  Common: {
    ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 },
    Platform: { ctx: { canvas: { width: 1280, height: 720 } } },
  },
  Core: { Game: { current: { currentMapID: 11 } } },
  Data: { Keyboards: {}, Systems: {} },
  Graphic: {},
  Model: {},
  Main: {},
  THREE: {},
  inject() {},
};
vm.runInNewContext(fs.readFileSync(gameplayPath, 'utf8'), lifecycleContext, { filename: gameplayPath });
const LifecycleScreen = lifecycleContext.IP2Live.HostPowerReactorGameplayScreen;
const lifecycleScreen = new LifecycleScreen({ targetClass: 'C', requiredHosts: 50, durationSeconds: 60 });
assert.equal(lifecycleScreen.roundState, 'ready', 'the constructor reproduces the early-load race before the first update');
lifecycleScreen.update();
assert.equal(lifecycleScreen.roundState, 'active', 'the first update must always start a ready reactor');
assert.ok(Number.isFinite(lifecycleScreen.startedAt));
assert.ok(lifecycleScreen.endsAt > lifecycleScreen.startedAt);
assert.equal(lifecycleScreen.entities.length, 1, 'the first falling capsule/virus must spawn immediately');
assert.equal(lifecycleScreen.bullets.length, 0, 'the gun must remain idle until Space is tapped');
assert.equal(lifecycleScreen.entities[0].hitsRemaining, 1, 'every falling target should burst with one hit');

const guidedCalls = [];
const guidedMethods = [
  ['showReactorGuide', 'reactor'],
  ['showFormulaGuide', 'formula'],
  ['showIntakeGuide', 'intake'],
  ['showShellGuide', 'shell'],
  ['showControlsGuide', 'controls'],
  ['showTimerGuide', 'timer'],
];
lifecycleContext.IP2Live.IPHostPowerReactorTutorial = {};
for (const [methodName] of guidedMethods) {
  lifecycleContext.IP2Live.IPHostPowerReactorTutorial[methodName] = (tutorialScenario, onComplete) => {
    guidedCalls.push([methodName, tutorialScenario]);
    onComplete();
    return true;
  };
}
const guidedScreen = new LifecycleScreen({
  targetClass: 'C',
  requiredHosts: 50,
  durationSeconds: 60,
  guidedTutorial: true,
});
assert.equal(guidedScreen.roundState, 'tutorial', 'guided play should hold before the timed round');
assert.equal(guidedScreen.endsAt, null, 'the 60-second clock must not run during instruction');
assert.equal(guidedScreen.tutorialPaused, true);
for (let index = 0; index < guidedMethods.length; index++) {
  const [methodName, highlightType] = guidedMethods[index];
  guidedScreen.update();
  assert.equal(guidedCalls[index][0], methodName, `guided step ${index + 1} should open its dialogue`);
  assert.equal(guidedScreen.tutorialHighlight.type, highlightType, `guided step ${index + 1} should expose its spotlight`);
  assert.equal(guidedScreen.roundState, 'tutorial', 'timed action must remain paused until the final tutorial focus');
  guidedScreen.tutorialSpotlightTimer = 1;
  guidedScreen.update();
}
assert.equal(guidedScreen.tutorialComplete, true, 'all six guided steps should complete');
assert.equal(guidedScreen.tutorialPaused, false);
assert.equal(guidedScreen.roundState, 'active', 'the timed round should begin only after instruction');
assert.ok(guidedScreen.endsAt > guidedScreen.startedAt);
assert.equal(guidedScreen.entities.length, 1, 'guided play should spawn its first real target after training');
assert.equal(guidedScreen.bullets.length, 0, 'guided play must not enable automatic firing');

const playfield = lifecycleContext.IP2Live.HostPowerPlayfield;
assert.equal(playfield.LANE_COUNT, 5, 'the intake should expose exactly five fixed lanes');
assert.equal(playfield.SHOT_COOLDOWN_MS, 160, 'manual taps should use only a short debounce cooldown');
assert.equal(playfield.SPAWN_INTERVAL_MS, 1500, 'drops should use an even, calm cadence');
const timingMetrics = lifecycleScreen.lastMetrics;
lifecycleScreen.onKeyPressed({ code: 'Space' });
assert.equal(lifecycleScreen.bullets.length, 1, 'one Space press should fire exactly one bullet');
lifecycleScreen.onKeyPressedAndRepeat({ code: 'Space' });
assert.equal(lifecycleScreen.bullets.length, 1, 'holding Space must not auto-fire repeated bullets');
lifecycleScreen.onKeyReleased({ code: 'Space' });
lifecycleScreen.lastShotAt -= playfield.SHOT_COOLDOWN_MS;
lifecycleScreen.onKeyPressed({ code: 'Space' });
assert.equal(lifecycleScreen.bullets.length, 2, 'releasing and tapping Space again should fire the next bullet');
lifecycleScreen.onKeyReleased({ code: 'Space' });

const laneScreen = new LifecycleScreen({ targetClass: 'C', requiredHosts: 50, durationSeconds: 60 });
const laneMetrics = laneScreen._metrics();
laneScreen.roundState = 'active';
laneScreen.startedAt = Date.now();
laneScreen.entities = [];
laneScreen.laneCursor = 0;
laneScreen.dropCursor = 0;
laneScreen.nextSpawnAt = 0;
for (let index = 0; index < 5; index++) {
  assert.equal(laneScreen._updateSpawner(laneMetrics, index * laneScreen.spawnIntervalMs), true);
}
assert.deepEqual(
  Array.from(laneScreen.entities, (entity) => entity.laneIndex),
  [0, 2, 4, 1, 3],
  'each lane should be visited once before a lane is reused'
);
assert.equal(new Set(laneScreen.entities.map((entity) => entity.x)).size, 5, 'each lane should have one fixed center');
assert.ok(laneScreen.entities.every((entity) => entity.speed === 48 * laneMetrics.scale));

const laneWidth = laneMetrics.arena.w / playfield.LANE_COUNT;
laneScreen._ensureGun(laneMetrics);
assert.equal(laneScreen.gunLaneIndex, 2, 'the gun should start in the center lane');
assert.equal(laneScreen.gunX, laneMetrics.arena.x + laneWidth * 2.5);
laneScreen.onKeyPressed({ code: 'KeyD' });
assert.equal(laneScreen.gunLaneIndex, 3, 'one D press should move exactly one column');
assert.equal(laneScreen.gunX, laneMetrics.arena.x + laneWidth * 3.5, 'the gun should align with the same center used by falling targets');
laneScreen.onKeyPressedAndRepeat({ code: 'KeyD' });
assert.equal(laneScreen.gunLaneIndex, 3, 'engine key-repeat callbacks must not skip columns');
assert.equal(laneScreen._updateHeldMovement(laneMetrics, 0.329), false, 'held movement should wait for its initial repeat delay');
laneScreen._updateHeldMovement(laneMetrics, 0.001);
assert.equal(laneScreen.gunLaneIndex, 4, 'holding D should step to the next column after the repeat delay');
assert.equal(laneScreen.gunX, laneMetrics.arena.x + laneWidth * 4.5);
laneScreen.onKeyReleased({ code: 'KeyD' });
const releasedGunX = laneScreen.gunX;
laneScreen._updateHeldMovement(laneMetrics, 0.5);
assert.equal(laneScreen.gunX, releasedGunX, 'releasing D should stop column stepping');
laneScreen.onMouseMove(laneMetrics.arena.x + laneWidth * 0.2, laneMetrics.arena.y + laneMetrics.arena.h * 0.5);
assert.equal(laneScreen.gunLaneIndex, 0, 'mouse control should also snap to the nearest fixed column');
assert.equal(laneScreen.gunX, laneMetrics.arena.x + laneWidth * 0.5);

for (const target of [
  { type: 'capsule', value: 2, startExponent: 0, finalExponent: 2 },
  { type: 'virus', value: -1, startExponent: 2, finalExponent: 1 },
]) {
  const impactScreen = new LifecycleScreen({ targetClass: 'C', requiredHosts: 50, durationSeconds: 60 });
  impactScreen.roundState = 'active';
  impactScreen.startedAt = Date.now();
  impactScreen.exponent = target.startExponent;
  impactScreen.evaluation = rules.evaluate(50, impactScreen.exponent);
  impactScreen.entities = [{
    id: 1,
    type: target.type,
    value: target.value,
    x: 100,
    y: 100,
    radius: 20,
    maxHits: 1,
    hitsRemaining: 1,
    hitFlashUntil: 0,
  }];
  const hitTarget = () => {
    impactScreen.bullets = [{ x: 100, y: 100, radius: 4, speed: 390 }];
    impactScreen._resolveCollisions();
  };
  hitTarget();
  assert.equal(impactScreen.entities.length, 0, `one bullet should burst a ${target.type}`);
  assert.equal(impactScreen.exponent, target.finalExponent, 'target value should apply exactly once on the first bullet');
  assert.equal(impactScreen.hits.length, 1, 'one projectile impact should produce one collected gameplay value');
  assert.equal(impactScreen.hits[0].status, 'pending-calculation');
  assert.equal(impactScreen.roundState, 'active', 'matching h must not auto-complete without CALCULATE');
}

const calculateScreen = new LifecycleScreen({ targetClass: 'C', requiredHosts: 50, durationSeconds: 60 });
calculateScreen.roundState = 'active';
calculateScreen.startedAt = Date.now();
calculateScreen.exponent = 5;
assert.equal(calculateScreen.calculatedEvaluation, null, 'capacity should start concealed');
assert.equal(calculateScreen._calculateCurrentPower(), false, 'an insufficient submitted h should not complete');
assert.equal(calculateScreen.calculatedEvaluation.status, 'under');
assert.equal(calculateScreen.calculationAttempts.length, 1);
calculateScreen._applyPower(1, 'capsule');
assert.equal(calculateScreen.exponent, 6);
assert.equal(calculateScreen.calculatedEvaluation, null, 'changing h must lock the result again');
assert.equal(calculateScreen.roundState, 'active', 'the exact h must remain pending until Calculate is clicked');
const calculateButton = calculateScreen._calculateButtonRect(calculateScreen._metrics());
calculateScreen.onMouseDown(calculateButton.x + calculateButton.w * 0.5, calculateButton.y + calculateButton.h * 0.5);
assert.equal(calculateScreen.roundState, 'stabilizing', 'clicking Calculate should submit and accept the exact h');
assert.equal(calculateScreen.calculatedEvaluation.valid, true);
assert.equal(calculateScreen.calculationAttempts.length, 2);

// Exercise the full canvas renderer at common exported-game sizes. The proxy
// deliberately implements only Canvas APIs used by the gameplay so additions
// that assume a missing/invalid context fail this smoke test.
const gradient = { addColorStop() {} };
const canvas = { width: 1280, height: 720 };
const canvasContext = new Proxy({
  canvas,
  createLinearGradient() { return gradient; },
  createRadialGradient() { return gradient; },
  measureText(value) { return { width: String(value || '').length * 6 }; },
}, {
  get(target, property) {
    if (property in target) return target[property];
    return function canvasNoop() {};
  },
  set(target, property, value) {
    target[property] = value;
    return true;
  },
});
lifecycleContext.Common.Platform.ctx = canvasContext;
let dialogueOverlayDraws = 0;
lifecycleContext.IP2Live.DialogueManager = {
  isActive() { return false; },
  drawOverlay() { dialogueOverlayDraws++; },
};
for (const [width, height] of [[640, 360], [1280, 720], [1920, 1080]]) {
  canvas.width = width;
  canvas.height = height;
  assert.doesNotThrow(() => lifecycleScreen.drawHUD(), `renderer should support ${width}x${height}`);
  assert.ok(lifecycleScreen.lastMetrics.arena.w > 0, `arena width should remain positive at ${width}x${height}`);
  assert.ok(lifecycleScreen.lastMetrics.right.w > 0, `reactor width should remain positive at ${width}x${height}`);
}
assert.equal(dialogueOverlayDraws, 3, 'the custom gameplay scene must render DialogueManager overlays');

guidedScreen.tutorialComplete = false;
guidedScreen.tutorialPaused = true;
for (const [, highlightType] of guidedMethods) {
  guidedScreen.tutorialHighlight = { type: highlightType, label: 'TRAINING FOCUS' };
  assert.doesNotThrow(() => guidedScreen.drawHUD(), `the ${highlightType} spotlight should render safely`);
}

const gameplaySource = fs.readFileSync(gameplayPath, 'utf8');
assert.match(gameplaySource, /P-45/, 'the Gameplay 1/2-style identity badge should be present');
assert.match(gameplaySource, /HOST.*POWER/s, 'the compact Host Power title treatment should be present');
assert.match(gameplaySource, /5 LANES \/\/ 1-HIT TARGETS/, 'the five-column, one-hit rule should be labelled');
assert.match(gameplaySource, /TAP SPACE TO FIRE/, 'the manual-fire control should be visible');
assert.match(gameplaySource, /CALCULATE CAPACITY/, 'the explicit calculation action should be visible');
assert.doesNotMatch(gameplaySource, /_updateGun\(/, 'the timed update loop must not contain automatic firing');
assert.match(gameplaySource, /DialogueManager\.drawOverlay/, 'the gameplay scene should draw tutorial dialogue overlays');
assert.match(gameplaySource, /_drawTutorialHighlight/, 'the guided version should include an in-game spotlight renderer');
assert.doesNotMatch(gameplaySource, /'00:'\s*\+\s*String\(seconds\)/, 'the timer should format 60 seconds as 01:00');

console.log('Host-Power Reactor rules verified.');
