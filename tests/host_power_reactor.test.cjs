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
assert.equal(lifecycleScreen.bullets.length, 1, 'auto-fire must begin immediately');
assert.equal(lifecycleScreen.entities[0].hitsRemaining, 3, 'every falling target should begin with a three-hit shell');

const playfield = lifecycleContext.IP2Live.HostPowerPlayfield;
assert.equal(playfield.LANE_COUNT, 5, 'the intake should expose exactly five fixed lanes');
assert.equal(playfield.SHOT_INTERVAL_MS, 1000, 'auto-fire must be limited to one shot per second');
assert.equal(playfield.SPAWN_INTERVAL_MS, 1500, 'drops should use an even, calm cadence');
assert.equal(lifecycleScreen.nextShotAt - lifecycleScreen.startedAt, 1000);

const timingMetrics = lifecycleScreen.lastMetrics;
const bulletCount = lifecycleScreen.bullets.length;
assert.equal(lifecycleScreen._updateGun(timingMetrics, lifecycleScreen.nextShotAt - 1), false);
assert.equal(lifecycleScreen.bullets.length, bulletCount, 'a second bullet must not fire early');
assert.equal(lifecycleScreen._updateGun(timingMetrics, lifecycleScreen.nextShotAt), true);
assert.equal(lifecycleScreen.bullets.length, bulletCount + 1, 'one bullet should fire when the full second elapses');

const laneScreen = new LifecycleScreen({ targetClass: 'C', requiredHosts: 50, durationSeconds: 60 });
const laneMetrics = laneScreen._metrics();
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

const originalGunX = laneMetrics.arena.x + laneMetrics.arena.w * 0.5;
laneScreen.gunX = originalGunX;
laneScreen.onKeyPressed({ code: 'KeyD' });
const nudgedGunX = laneScreen.gunX;
laneScreen._updateHeldMovement(laneMetrics, 0.5);
assert.ok(laneScreen.gunX > nudgedGunX, 'holding D should continuously move the cannon');
laneScreen.onKeyReleased({ code: 'KeyD' });
const releasedGunX = laneScreen.gunX;
laneScreen._updateHeldMovement(laneMetrics, 0.5);
assert.equal(laneScreen.gunX, releasedGunX, 'releasing D should stop continuous movement');

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
    maxHits: 3,
    hitsRemaining: 3,
    hitFlashUntil: 0,
  }];
  const hitTarget = () => {
    impactScreen.bullets = [{ x: 100, y: 100, radius: 4, speed: 390 }];
    impactScreen._resolveCollisions();
  };
  hitTarget();
  assert.equal(impactScreen.entities.length, 1, `the first bullet should not burst a ${target.type}`);
  assert.equal(impactScreen.entities[0].hitsRemaining, 2);
  assert.equal(impactScreen.exponent, target.startExponent, 'target value must not apply after one bullet');
  hitTarget();
  assert.equal(impactScreen.entities.length, 1, `the second bullet should not burst a ${target.type}`);
  assert.equal(impactScreen.entities[0].hitsRemaining, 1);
  assert.equal(impactScreen.exponent, target.startExponent, 'target value must not apply after two bullets');
  hitTarget();
  assert.equal(impactScreen.entities.length, 0, `the third bullet should burst a ${target.type}`);
  assert.equal(impactScreen.exponent, target.finalExponent, 'target value should apply exactly once on the third bullet');
  assert.equal(impactScreen.hits.length, 1, 'three projectile impacts should produce one collected gameplay value');
}

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
for (const [width, height] of [[640, 360], [1280, 720], [1920, 1080]]) {
  canvas.width = width;
  canvas.height = height;
  assert.doesNotThrow(() => lifecycleScreen.drawHUD(), `renderer should support ${width}x${height}`);
  assert.ok(lifecycleScreen.lastMetrics.arena.w > 0, `arena width should remain positive at ${width}x${height}`);
  assert.ok(lifecycleScreen.lastMetrics.right.w > 0, `reactor width should remain positive at ${width}x${height}`);
}

const gameplaySource = fs.readFileSync(gameplayPath, 'utf8');
assert.match(gameplaySource, /P-45/, 'the Gameplay 1/2-style identity badge should be present');
assert.match(gameplaySource, /HOST.*POWER/s, 'the compact Host Power title treatment should be present');
assert.match(gameplaySource, /5 LANES \/\/ 3-HIT SHELLS/, 'the five-column, three-hit rule should be labelled');
assert.match(gameplaySource, /1 SHOT PER SEC/, 'the one-shot-per-second rate should be visible');
assert.doesNotMatch(gameplaySource, /'00:'\s*\+\s*String\(seconds\)/, 'the timer should format 60 seconds as 01:00');

console.log('Host-Power Reactor rules verified.');
