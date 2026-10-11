const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..', 'Plugins/IP2Live_Core/gameplay');
let now = 100000;
const events = [];
const canvas = new Proxy({ canvas: { width: 1280, height: 720 }, measureText: value => ({ width: String(value).length * 8 }),
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) },
    { get: (target, key) => key in target ? target[key] : () => {} });
const context = { console: { log() {}, warn() {} }, Date: class extends Date { static now() { return now; } }, Math,
    IP2Live: { GameManager: { handleGameplayMistake(id, payload) { events.push({ id, payload }); } } }, window: {},
    Scene: { Base: class {} }, Manager: { Stack: {}, GL: {} }, Common: { Platform: { ctx: canvas }, ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 } },
    Data: { Keyboards: {}, Systems: {} }, Core: {}, Graphic: {}, Model: {}, Main: {}, THREE: {}, inject() {}, setTimeout, clearTimeout };
vm.createContext(context);
for (const file of ['common/ip_class_ranges.js', 'common/ip_cidr_tools.js', 'gameplay1/IPWires/ip_wires_core.js',
    'gameplay1/IPWires/ip_wires_gameplay.js', 'gameplay2/IPPatchPanel/ip_patchpanel_gameplay.js',
    'gameplay3/CIDRPanel/ip_cidrpanel_gameplay.js', 'gameplay4/SubnetSimulator/ip_subnetsim_gameplay.js',
    'gameplay4_5/HostPowerReactor/ip_host_power_gameplay.js', 'gameplay5/CIDRQuarantine/ip_cidr_quarantine_gameplay.js',
    'gameplay6/CIDRQuarantineMatrix/ip_cidr_quarantine_matrix_gameplay.js', 'gameplay7/NetworkRepair/gameplay.js',
    'gameplay8/VLSMAllocator/ip_vlsm_allocator_gameplay.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
const ip = context.IP2Live;
function counts(result, total, correct) {
    assert.equal(result.telemetrySchemaVersion, 2);
    assert.equal(result.totalDecisions, total);
    assert.equal(result.correctDecisions, correct);
    assert.equal(result.incorrectDecisions, total - correct);
    assert.equal(result.decisionHistory.length, total);
    assert.ok(result.decisionHistory.every(row => typeof row.correct === 'boolean' && row.stepKey && row.concept));
    assert.doesNotThrow(() => JSON.stringify(result));
}

// A retry assesses only the previously rejected wires, not every locked success again.
{
    let result;
    const screen = new ip.WiresGameplayScreen({ onComplete: value => { result = value; } });
    screen.drawHUD(); screen.drawHUD(); counts(screen._assessmentResult(), 0, 0);
    const first = screen.leftItems[0];
    for (const item of screen.leftItems) screen.connections[item.id] = item.className;
    screen.connections[first.id] = first.className === 'A' ? 'B' : 'A';
    screen._evaluateConnections();
    const initialTotal = screen.leftItems.length;
    counts(screen._assessmentResult(), initialTotal, initialTotal - 1);
    screen.verdictTimer = 0; screen.connections[first.id] = first.className;
    screen._evaluateConnections(); screen._finish();
    counts(result, initialTotal + 1, initialTotal);
}

// Packet evidence survives internal round resets and records early completion without counting unseen packets.
{
    const screen = new ip.PatchPanelGameplayScreen({ targetScore: 2, totalPackets: 4 });
    screen._emitBurst = screen._emitRouteShock = screen._syncFocusPacket = screen._setBanner = () => {};
    screen.selectedClassIndex = screen.classOrder.indexOf('A');
    screen._evaluateCurrentPacket({ className: 'B', text: '172.16.0.1', kind: 'IP' });
    screen._onRoundEnd(); screen._resetRound();
    screen._evaluateCurrentPacket({ className: 'A', text: '10.0.0.1', kind: 'IP' });
    screen._evaluateCurrentPacket({ className: 'A', text: '255.0.0.0', kind: 'MASK' });
    counts(screen.endResult, 3, 2);
    assert.equal(screen.endResult.roundHistory.length, 2);
    assert.equal(screen.endResult.decisionHistory[2].stepKey, 'mask_classification');
}

// Binary-mask and CIDR decisions retain separate concept evidence across retries.
{
    const screen = new ip.CIDRPanelGameplayScreen({ targetMask: '255.255.255.224' });
    screen._evaluateConfirmResult(); // all bulbs are initially off
    screen.bulbs = screen.targetBits.map(row => row.slice());
    screen._evaluateConfirmResult();
    screen.cidrInput = '28'; screen._verifyCIDRInput();
    screen.cidrInput = '27'; screen._verifyCIDRInput();
    counts(screen.lastResult, 4, 2);
    assert.equal(screen.lastResult.decisionHistory[0].stepKey, 'subnet_mask_binary');
    assert.equal(screen.lastResult.decisionHistory[2].submitted, 28);
}

// Empty slots are failed assessed answers, rather than disappearing from the denominator.
{
    const screen = new ip.SubnetSimulatorGameplayScreen({});
    screen._slotValue = () => null;
    screen._submitAnswers();
    counts(screen._assessmentResult(), 4, 0);
    assert.equal(screen.slotStatTotals.totalChecks, 4);
    assert.equal(screen.slotStatTotals.wrongChecks, 4);
    screen._slotValue = key => screen.answers[key]; screen._submitAnswers();
    counts(screen._assessmentResult(), 8, 4);
    assert.ok(screen.decisionHistory.slice(0, 4).every(row => row.issueType === 'missing_answer'));
}

// Reactor hits are movement/collection telemetry; only CALCULATE is an assessed submission.
{
    const screen = new ip.HostPowerReactorGameplayScreen({ targetClass: 'C', requiredHosts: 50 });
    screen.update();
    screen._applyPower(2, 'test'); counts(screen._result(), 0, 0);
    screen._calculateCurrentPower();
    screen._applyPower(4, 'test'); screen._calculateCurrentPower();
    counts(screen._result(), 2, 1);
    assert.equal(screen._result().decisionHistory[0].issueType, 'insufficient_host_capacity');
}

// Quarantine prerequisite checks, including formerly silent mistakes, are counted separately from the final route.
{
    const screen = new ip.CIDRQuarantineGameplayScreen({ reducedMotion: true, timeLimitSeconds: 0 });
    const p = screen.problem;
    screen._submitSegmentation(p.ipClass); screen._submitSegmentation(p.originalCIDR + 1); screen._submitSegmentation(p.originalCIDR);
    screen.borrowedBits = p.borrowedBits; screen._submitSegmentation(); screen._submitSegmentation(p.targetCIDR);
    screen._submitSegmentation(p.targetHostBits); screen._submitSegmentation(p.optimizedCapacity);
    screen.path = p.solutionPath.map(tile => ({ ...tile })); screen._confirmPath();
    counts(screen._baseResult(screen._pathStats()), 8, 7);
    assert.ok(events.some(event => event.id === 'ip_cidr_quarantine' && event.payload.telemetryOnly && event.payload.mistakes[0].stepKey === 'default_prefix'));
}

// Preparation/assistance do not masquerade as faster subnet decision-making; five boss impacts still grade two choices.
{
    const screen = new ip.CIDRQuarantineMatrixGameplayScreen({});
    screen.update(); now += 100; screen.update();
    let close;
    ip.HostPowerToolManager = { launchHostPowerTool(options) { close = options.onClose; return true; } };
    screen._openCalculator(); now += 500; screen.update(); close({ exponent: 5 });
    assert.equal(screen.calculatorUses, 1); assert.equal(screen.calculatorElapsedMs, 500);
    assert.equal(screen.preparationMs, 100); assert.equal(screen.activeElapsedMs, 0);
    screen._skipPreparation(); screen.update(); now += 100; screen.update();
    for (let index = 0; index < 2; index++) {
        const wave = screen.waves[index], lane = wave.choices.findIndex(choice => choice.value === wave.correct);
        for (let hit = 0; hit < 10; hit++) screen._hitBarrier(lane);
        screen._completePickup();
    }
    screen._setPhase('boss');
    for (let hit = 0; hit < 4; hit++) screen._hitBoss();
    counts(screen._result(false), 0, 0);
    screen._hitBoss(); const result = screen._result(true);
    counts(result, 2, 2);
    assert.equal(result.preparationSkips, 1); assert.equal(result.activeElapsedMs, 100);
    assert.equal(result.bossBulletImpacts, 5); assert.equal(result.barrierImpacts, 20);
    assert.equal(result.roundHistory[0].givenAddress, screen.problem.givenAddress);
    assert.equal(result.roundHistory[0].expected.blockSize, screen.problem.blockSize);
    assert.equal(result.roundHistory[0].calculatorUses, 1);
    const restored = JSON.parse(JSON.stringify(screen));
    assert.equal(restored.roundHistory[0].preparationSkipped, true);
    result.roundHistory[0].expected.blockSize = 0;
    assert.equal(screen.roundHistory[0].expected.blockSize, screen.problem.blockSize, 'export snapshots do not mutate durable scene evidence');
    delete screen.encounterTelemetry; delete screen.activeElapsedMs; delete screen.decisionHistory;
    screen._ensureSessionCompatible();
    assert.equal(screen.decisionHistoryComplete, false, 'old paused v4 scenes do not invent historical evidence');
    assert.equal(screen.activeElapsedMs, 0);
}

// A failed token set and each ordered formula slot remain visible in independent-play telemetry.
{
    const screen = new ip.NetworkRepairGameplayScreen({});
    screen.caughtTokens = screen.scenario.targetTokens.map(token => ({ ...token }));
    screen.caughtTokens[0].id = 'wrong'; screen._evaluateCaughtTokens();
    screen.caughtTokens = screen.scenario.targetTokens.map(token => ({ ...token })); screen._evaluateCaughtTokens();
    screen.formulaSlots = screen.scenario.targetTokens.map(token => ({ ...token })); screen._submitArrangement();
    counts(screen._assessmentResult(), 2 + screen.formulaSlots.length, 1 + screen.formulaSlots.length);
    assert.equal(screen._assessmentResult().mistakesUsed, 1);
}

// Branch-terminal results use local errors; the shared mission's older failures are a separate lifetime counter.
{
    const state = { allocations: {}, visitOrder: [], mistakeCount: 20 };
    let result;
    const screen = new ip.VLSMAllocatorGameplayScreen({ spec: { terminalType: 'branch', branchId: 'hq' }, state,
        onComplete: value => { result = value; } });
    screen._submitBranch();
    screen.selectedPrefix = screen._optimalPrefix(screen._branch().hosts); screen.selectedBlockIndex = 0; screen._submitBranch();
    counts(result, 2, 1);
    assert.equal(result.mistakeCount, 1); assert.equal(result.lifetimeMistakeCount, 21);
    assert.equal(result.decisionHistory[0].stepKey, 'vlsm_host_to_prefix');
}
console.log('gameplay_assessment_telemetry.test.cjs: PASS');
