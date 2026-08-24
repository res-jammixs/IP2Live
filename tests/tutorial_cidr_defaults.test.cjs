const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');

function loadGameplay(relativePath) {
  const context = {
    console: { log() {}, warn() {}, error() {} },
    Date, Math, setTimeout, clearTimeout,
    IP2Live: {}, window: {},
    Scene: { Base: class { constructor() {} } },
    Manager: { Stack: {}, GL: {} },
    Common: { ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 }, Platform: {} },
    Core: {}, Data: { Keyboards: {}, Systems: {} }, Graphic: {}, Model: {}, Main: {}, THREE: {}, inject() {},
  };
  vm.runInNewContext(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8'), context, { filename: relativePath });
  return context.IP2Live;
}

const gameplay5 = loadGameplay('Plugins/IP2Live_Core/gameplay/gameplay5/CIDRQuarantine/ip_cidr_quarantine_gameplay.js');
const tutorial5a = new gameplay5.CIDRQuarantineGameplayScreen({ spec: { tutorial: true, profile: { index: 1 } }, tutorialMode: true });
const tutorial5b = new gameplay5.CIDRQuarantineGameplayScreen({ spec: { tutorial: true, profile: { index: 1 } }, tutorialMode: true });
assert.equal(tutorial5a.problem.id, 'cidr-quarantine-tutorial-default-v1');
assert.equal(tutorial5a.problem.requiredHosts, 50);
assert.deepEqual(tutorial5a.problem.solutionPath, tutorial5b.problem.solutionPath);
assert.deepEqual(tutorial5a.problem.viruses, tutorial5b.problem.viruses);

const gameplay6 = loadGameplay('Plugins/IP2Live_Core/gameplay/gameplay6/CIDRQuarantineMatrix/ip_cidr_quarantine_matrix_gameplay.js');
const tutorial6a = new gameplay6.CIDRQuarantineMatrixGameplayScreen({ spec: { tutorial: true, profile: { index: 1 } }, tutorialMode: true });
const tutorial6b = new gameplay6.CIDRQuarantineMatrixGameplayScreen({ spec: { tutorial: true, profile: { index: 1 } }, tutorialMode: true });
assert.equal(tutorial6a.problem.id, 'cidr-matrix-tutorial-default-v1');
assert.equal(tutorial6a.problem.pairCount, 2);
assert.deepEqual(tutorial6a.problem.pairs, tutorial6b.problem.pairs);
assert.deepEqual(tutorial6a.problem.viruses, tutorial6b.problem.viruses);

const gameplay7 = loadGameplay('Plugins/IP2Live_Core/gameplay/gameplay7/NetworkRepair/gameplay.js');
const tutorial7a = gameplay7.NetworkRepairGameplayManager._scenarioForSpec({ id: 'stage.15.ip_network_repair.01', tutorial: true });
const tutorial7b = gameplay7.NetworkRepairGameplayManager._scenarioForSpec({ id: 'stage.15.ip_network_repair.01', tutorial: true });
assert.equal(tutorial7a.id, 'network-repair-tutorial-default-v1');
assert.deepEqual(tutorial7a, tutorial7b);

const gameplay8 = loadGameplay('Plugins/IP2Live_Core/gameplay/gameplay8/VLSMAllocator/ip_vlsm_allocator_gameplay.js');
const tutorial8a = gameplay8.VLSMAllocatorGameplayManager.scenario();
const tutorial8b = gameplay8.VLSMAllocatorGameplayManager.scenario();
assert.equal(tutorial8a.id, 'stage4-level3-vlsm-infiltration-01');
assert.deepEqual(tutorial8a, tutorial8b);

console.log('tutorial_cidr_defaults.test.cjs: PASS');
