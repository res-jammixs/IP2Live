const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'Plugins/IP2Live_Core/gameplay/gameplay6/CIDRQuarantineMatrix/ip_cidr_quarantine_matrix_gameplay.js'), 'utf8');

function harness(options = {}) {
    let time = 1000;
    const callbacks = { complete: [], failed: [], mistakes: [], pause: 0 };
    const texts = [], drawn = [];
    const canvas = { width: options.width || 1280, height: options.height || 720 };
    const ctx = new Proxy({ canvas, globalAlpha: 1, measureText: value => ({ width: value.length * 7 }),
        fillText: (text, x, y) => { texts.push(text); drawn.push({ text, x, y, font: ctx.font }); },
        createRadialGradient: () => ({ addColorStop() {} }), createLinearGradient: () => ({ addColorStop() {} }) },
    { get: (target, key) => key in target ? target[key] : () => {} });
    const scenes = [];
    const context = {
        console: { log() {}, warn() {} }, Math, Date: { now: () => time }, setTimeout, clearTimeout,
        IP2Live: { GameplayPause: { open() { callbacks.pause++; } },
            GameManager: { handleGameplayMistake(id, payload) { callbacks.mistakes.push({ id, payload }); } } },
        Scene: { Base: class {} }, window: {}, Common: { Platform: { ctx } },
        Manager: { Stack: { get top() { return scenes.at(-1); }, push(scene) { scenes.push(scene); }, pop() { return scenes.pop(); } }, GL: {} }, Data: { Keyboards: {}, Systems: {} },
    };
    vm.createContext(context);
    for (const file of ['ip_host_power_gameplay.js', 'ip_host_power_tool.js']) vm.runInContext(fs.readFileSync(path.join(root, 'Plugins/IP2Live_Core/gameplay/gameplay4_5/HostPowerReactor', file), 'utf8'), context);
    vm.runInContext(source, context);
    const rules = context.IP2Live.SubnetBlasterRules;
    const Screen = context.IP2Live.CIDRQuarantineMatrixGameplayScreen;
    const screen = new Screen({ onComplete: r => callbacks.complete.push(r), onFailed: r => callbacks.failed.push(r), ...options });
    scenes.push(screen);
    return { screen, rules, callbacks, context, texts, drawn, advance(ms) {
        while (ms > 0) { const step = Math.min(ms, 50); time += step; context.Manager.Stack.top.update(); ms -= step; }
    } };
}
function enterCombat(h) { h.screen.helpOpen = false; h.screen.update(); h.screen.onKeyPressed('Enter'); assert.equal(h.screen.phase, 'barriers'); }
function until(h, predicate, budget = 12000) {
    while (!predicate() && budget > 0) { h.advance(50); budget -= 50; }
    assert.ok(predicate(), 'timed transition did not complete: ' + h.screen.phase);
}
function collect(h, lane) {
    const key = h.screen.waves[h.screen.waveIndex].key;
    h.screen.onKeyPressed({ code: 'Digit' + (lane + 1) });
    until(h, () => h.screen.phase === 'pickup');
    assert.equal(h.screen.barrierHits[lane], 10);
    assert.equal(h.screen.weapon[key], undefined, 'the module installs when its floating animation lands');
    until(h, () => h.screen.phase !== 'pickup');
    assert.notEqual(h.screen.weapon[key], undefined);
}
function assemble(h, wrong = []) {
    if (h.screen.phase === 'think') enterCombat(h);
    assert.deepEqual(Array.from(h.screen.waves, wave => wave.key), ['operator', 'blockSize']);
    for (let i = 0; i < 2; i++) {
        const wave = h.screen.waves[h.screen.waveIndex];
        collect(h, wave.choices.findIndex(choice => wrong.includes(wave.key) ? choice.value !== wave.correct : choice.value === wave.correct));
    }
    assert.equal(h.screen.phase, 'boss_enter');
    until(h, () => h.screen.phase === 'boss');
}
function solveEncounter(h) {
    assemble(h);
    until(h, () => h.screen.phase === 'boss_hit');
    until(h, () => h.screen.phase === 'drop' && h.screen.addressDrop.installed);
}

// Independent IPv4 oracle checks alignment, broadcast endpoints and class ranges,
// including values above signed 32-bit limits and subnet carries across octets.
{
    const { rules } = harness();
    for (const ipClass of ['A', 'B', 'C']) {
        for (let hostBits = 2; hostBits <= 32 - rules.defaults[ipClass]; hostBits++) {
            for (const asked of ['network', 'broadcast']) {
                for (const givenBits of ['host', 'borrowed']) {
                    for (const random of [() => 0, () => 0.999999, Math.random]) {
                        const p = rules.generate({ ipClass, hostBits, asked, givenBits }, random);
                        const mask = (0xffffffff << hostBits) >>> 0;
                        assert.equal((p.network & mask) >>> 0, p.network);
                        assert.equal((p.network | ~mask) >>> 0, p.broadcast);
                        assert.equal(p.broadcast - p.network + 1, 2 ** hostBits);
                        assert.equal(p.borrowedBits + p.hostBits, p.availableBits);
                        assert.equal(p.prefix, 32 - hostBits);
                        assert.ok(p.prefix <= 30, 'conventional broadcast questions exclude /31 and /32');
                        for (const address of [p.givenAddress, p.answerAddress]) assert.ok(address.split('.').every(o => +o >= 0 && +o <= 255));
                        assert.equal(p.operator, asked === 'broadcast' ? '+' : '-');
                        const recovered = asked === 'broadcast' ? p.network + p.blockSize - 1 : p.broadcast - p.blockSize + 1;
                        assert.equal(rules.toIP(recovered), p.answerAddress);
                        for (const wave of rules.waves(p)) {
                            assert.equal(wave.choices.length, 3);
                            assert.equal(new Set(wave.choices.map(c => c.value)).size, 3);
                            assert.equal(wave.choices.filter(c => c.value === wave.correct).length, 1, 'one and only one correct barrier');
                        }
                    }
                }
            }
        }
    }
    const example = rules.generate({ ipClass: 'C', hostBits: 5, asked: 'broadcast', givenBits: 'borrowed' }, () => 0);
    assert.equal(example.borrowedBits, 3); assert.equal(example.blockSize, 32); assert.equal(example.answerAddress, '192.168.0.31');
    const b = rules.generate({ ipClass: 'B', hostBits: 13, asked: 'broadcast' }, () => 0);
    assert.equal(b.answerAddress, '172.16.31.255');
    const a = rules.generate({ ipClass: 'A', hostBits: 20, asked: 'network' }, () => 0.999999);
    assert.equal(a.givenAddress, '10.255.255.255'); assert.equal(a.answerAddress, '10.240.0.0');
}

// The countdown, briefing and calculator cannot accidentally fire or consume time.
{
    const h = harness({ tutorialMode: true });
    assert.equal(h.screen.helpOpen, false, 'preparation stays minimal even in tutorial mode');
    h.screen.onKeyPressed('KeyH');
    h.screen.update(); h.advance(1000);
    assert.equal(h.screen.thinkRemainingMs, 60000);
    h.screen.onKeyPressed('Enter'); h.screen.update(); h.advance(2000);
    assert.equal(h.screen.thinkRemainingMs, 58000);
    assert.equal(h.screen.projectiles.length, 0);
    h.screen.onKeyPressed('KeyC'); h.advance(2500);
    assert.equal(h.screen.thinkRemainingMs, 58000);
    h.screen._skipPreparation(); assert.equal(h.screen.phase, 'think', 'the calculator blocks preparation shortcuts');
    const tool = h.context.Manager.Stack.top;
    assert.ok(tool instanceof h.context.IP2Live.HostPowerToolScreen, 'reuse the actual Gameplay 4.5 tool');
    tool.onKeyPressed('ArrowRight'); tool.onKeyPressed('Enter'); // +2
    tool.onKeyPressed('ArrowRight'); tool.onKeyPressed('Enter'); // +3
    assert.equal(tool.evaluation.totalAddresses, 32);
    assert.equal(h.screen.weapon.blockSize, undefined, 'the helper never installs a formula choice');
    tool.onKeyPressed('Escape'); assert.equal(h.screen.calculatorOpen, false); assert.equal(h.callbacks.pause, 0);
    h.screen.onKeyPressed('Escape'); assert.equal(h.callbacks.pause, 1);
    h.screen.onGameplayResume(); h.advance(50); assert.equal(h.screen.thinkRemainingMs, 58000);
    h.advance(57950); assert.equal(h.screen.phase, 'think', 'preparation lasts the full minute');
    h.advance(50); assert.equal(h.screen.phase, 'barriers');
}

// The circular skip icon and fading hover text work at scaled coordinates.
{
    const h = harness({ width: 1920, height: 1200 });
    h.screen.drawHUD(); assert.ok(h.texts.includes('1:00'));
    assert.ok(h.screen.buttonRects.some(b => b.action === 'skip'));
    assert.ok(!h.texts.includes('SKIP')); assert.ok(!h.texts.includes('Skip preparation'));
    h.screen.update();
    h.screen.onMouseMove(640 * 1.5, 386 * 1.5 + 60); h.screen.drawHUD();
    assert.ok(!h.texts.includes('Skip preparation'), 'hover text starts transparent');
    h.advance(200); h.screen.drawHUD();
    assert.ok(h.texts.includes('Skip preparation'), 'the scaled pointer exposes the hover tooltip');
    assert.ok(h.drawn.find(item => item.text === 'Skip preparation').y > 408, 'hover text appears below the icon');
    h.texts.length = 0; h.screen.onMouseMove(900 * 1.5, 386 * 1.5 + 60); h.screen.drawHUD();
    assert.ok(!h.texts.includes('Skip preparation'), 'moving away hides the tooltip');
    h.screen.onMouseDown(619 * 1.5, 365 * 1.5 + 60);
    assert.equal(h.screen.phase, 'think', 'the corners outside the circle do not activate skip');
    h.screen.onMouseDown(640 * 1.5, 397 * 1.5 + 60);
    assert.equal(h.screen.phase, 'barriers'); assert.equal(h.screen.bulletsFired, 0);
    h.screen._skipPreparation(); assert.equal(h.screen.phase, 'barriers');
    const keyboard = harness(); keyboard.screen.onKeyPressed('Space'); assert.equal(keyboard.screen.phase, 'barriers');
}

// The shared tool supports real bubble dragging, neutral block-size output and safe close/reopen.
for (const givenBits of ['host', 'borrowed']) {
    const h = harness();
    h.screen._newEncounter(h.rules.generate({ ipClass: 'B', hostBits: 9, asked: 'network', givenBits }, () => 0));
    h.screen.update(); h.advance(1000);
    const remaining = h.screen.thinkRemainingMs;
    assert.equal(h.screen._openCalculator(), true);
    const tool = h.context.Manager.Stack.top; tool.drawHUD();
    assert.ok(h.texts.includes('SUBNET GIVEN'));
    assert.ok(h.texts.includes((givenBits === 'host' ? 'Host bits: 9' : 'Borrowed bits: 7')));
    assert.ok(!h.texts.some(text => text.includes('USABLE') || text.includes('VERIFIED NETWORK PREFIX') || text.includes('CIDR /23')), 'the tool shows only the given, never the solved prefix or target exponent');
    const bubble = tool.bubbleRects.find(b => b.value === 5), drop = tool.lastMetrics.calculator;
    tool.onMouseDown(bubble.x, bubble.y); tool.onMouseMove(drop.x + 10, drop.y + 10); tool.onMouseUp(drop.x + 10, drop.y + 10);
    assert.equal(tool.exponent, 5); assert.equal(tool.evaluation.totalAddresses, 32);
    h.advance(2000); assert.equal(h.screen.thinkRemainingMs, remaining);
    tool.onKeyPressed('KeyC'); assert.equal(h.context.Manager.Stack.top, h.screen);
    assert.equal(h.screen.calculatorOpen, false); assert.equal(h.screen.calculatorExponent, 5);
    assert.equal(h.screen._openCalculator(), true); assert.equal(h.context.Manager.Stack.top.exponent, 5);
    h.context.Manager.Stack.top.onKeyPressed('Escape');
    h.screen.update(); h.advance(100); assert.equal(h.screen.thinkRemainingMs, remaining - 100);
}

// Automatic fire, ten-impact barriers, boss damage/retreat and automatic next questions.
// Four impacts never evaluate the weapon; the fifth responds exactly once.
for (const wrong of [[], ['operator']]) {
    const h = harness(); assemble(h, wrong);
    for (let hit = 1; hit <= 4; hit++) {
        h.screen._hitBoss();
        assert.equal(h.screen.bossImpactCount, hit); assert.equal(h.screen.phase, 'boss');
        assert.equal(h.screen.bossHP, 3); assert.equal(h.screen.hearts, 3);
        assert.equal(h.screen.totalShots, 0); assert.equal(h.screen.encounterResult, null);
    }
    h.screen._hitBoss();
    assert.equal(h.screen.bossImpactCount, 5); assert.equal(h.screen.totalShots, 2);
    assert.equal(h.screen.phase, wrong.length ? 'counterattack' : 'boss_hit');
    assert.equal(h.screen.bossHP, wrong.length ? 3 : 2);
    h.screen._hitBoss(); assert.equal(h.screen.totalShots, 2, 'extra impacts cannot grade twice');
}

for (let run = 0; run < 12; run++) {
    const h = harness();
    const classes = new Set(), asked = new Set(), bitGivens = new Set();
    for (let round = 0; round < 3; round++) {
        classes.add(h.screen.problem.ipClass); asked.add(h.screen.problem.asked); bitGivens.add(h.screen.problem.givenBits);
        assemble(h);
        assert.equal(h.screen.bossHP, 3 - round); assert.equal(h.screen.hearts, 3);
        until(h, () => h.screen.phase === 'boss_hit');
        assert.equal(h.screen.bossHP, 2 - round); h.screen.drawHUD();
        assert.ok(h.texts.includes('DIRECT HIT / SHIELD BREAK'));
        h.advance(500); assert.equal(h.screen.phase, 'boss_hit');
        until(h, () => h.screen.phase === 'boss_retreat'); h.screen.drawHUD();
        until(h, () => h.screen.phase === 'drop'); h.screen.drawHUD();
        until(h, () => h.screen.phase === 'think' || h.screen.finished);
    }
    assert.equal(classes.size, 3); assert.equal(asked.size, 2); assert.equal(bitGivens.size, 2);
    assert.equal(h.callbacks.complete.length, 1); assert.equal(h.callbacks.failed.length, 0);
    assert.equal(h.callbacks.complete[0].bossHits, 3); assert.equal(h.callbacks.complete[0].correctShots, 6);
    assert.equal(h.callbacks.complete[0].totalShots, 6);
    assert.equal(h.callbacks.complete[0].heartsRemaining, 3);
    assert.ok(h.callbacks.complete[0].bulletsFired >= 75);
    h.screen._continue(); h.screen._finishSuccess(); assert.equal(h.callbacks.complete.length, 1);
}

// Wrong formulas still face APEX; only its return shot costs a heart.
{
    const h = harness(); solveEncounter(h); h.screen._continue();
    for (let missed = 0; missed < 3; missed++) {
        const previousId = h.screen.problem.id;
        assemble(h, ['operator', 'blockSize']);
        assert.equal(h.screen.hearts, 3 - missed, 'wrong barriers are retained without early damage');
        assert.equal(h.callbacks.mistakes.length, missed);
        until(h, () => h.screen.phase === 'counterattack'); h.screen.drawHUD();
        assert.equal(h.screen.hearts, 3 - missed, 'the charged boss attack has not landed yet');
        assert.equal(h.screen.bossHP, 2);
        h.advance(500); assert.equal(h.screen.hearts, 3 - missed);
        until(h, () => h.screen.phase === 'player_hit'); h.screen.drawHUD();
        assert.equal(h.screen.hearts, 2 - missed, 'one heart per boss attack even if multiple pieces are wrong');
        assert.equal(h.screen.bossHP, 2); assert.equal(h.screen.encounterResult.mistakes.length, 2);
        until(h, () => h.screen.phase === 'boss_retreat');
        h.texts.length = 0; h.screen.drawHUD();
        assert.ok(h.texts.includes('APEX RETREATING'));
        assert.ok(!h.texts.includes(h.screen.problem.answerAddress), 'wrong formulas never drop the requested answer');
        assert.ok(!h.texts.some(text => text.includes('CORRECT:') || text.includes('Borrowed bits are') || text.includes('RECALIBRATING')));
        until(h, () => h.screen.phase === 'think' || h.screen.finished);
        if (missed < 2) {
            assert.equal(h.screen.phase, 'think'); assert.notEqual(h.screen.problem.id, previousId);
            assert.equal(Object.keys(h.screen.weapon).length, 0); assert.equal(h.screen.thinkRemainingMs, 60000);
        }
    }
    assert.equal(h.callbacks.failed.length, 1); assert.equal(h.callbacks.failed[0].mistakeCount, 3);
    assert.equal(h.callbacks.failed[0].reason, 'hearts_exhausted'); assert.equal(h.callbacks.complete.length, 0);
    assert.equal(h.callbacks.mistakes.length, 3); h.screen._failOut(); assert.equal(h.callbacks.failed.length, 1);
}

// A barrier breaks on exactly ten hits, with no premature validation or bullet spill.
{
    const h = harness(); enterCombat(h);
    const wave = h.screen.waves[0], lane = wave.choices.findIndex(c => c.value !== wave.correct);
    h.screen.selectedLane = lane;
    for (let hit = 0; hit < 9; hit++) h.screen._hitBarrier(lane);
    assert.equal(h.screen.phase, 'barriers'); assert.equal(h.screen.barrierHits[lane], 9);
    assert.equal(Object.keys(h.screen.weapon).length, 0); assert.equal(h.screen.hearts, 3);
    h.screen._hitBarrier(lane); assert.equal(h.screen.phase, 'pickup');
    assert.equal(h.screen.projectiles.length, 0); h.screen.drawHUD();
    h.advance(350); assert.equal(h.screen.weapon.operator, undefined);
    h.screen._hitBarrier(lane); assert.equal(h.screen.barrierHits[lane], 10, 'in-flight hits cannot affect an already broken barrier');
    until(h, () => h.screen.phase === 'barriers');
    assert.equal(h.screen.weapon.operator, wave.choices[lane].value); assert.equal(h.screen.hearts, 3);
    assert.equal(h.screen.totalShots, 0, 'grading happens only at the boss');
    assert.equal(h.screen.barrierHits.reduce((a, b) => a + b, 0), 0);
}

// Keyboard and scaled/letterboxed pointer coordinates share the new full-width lanes.
{
    const h = harness({ width: 1920, height: 1200 }); enterCombat(h);
    h.screen.onKeyPressed('ArrowLeft'); assert.equal(h.screen.selectedLane, 0);
    h.screen.onKeyPressed('KeyD'); assert.equal(h.screen.selectedLane, 1);
    h.screen.onMouseDown(1040 * 1.5, 280 * 1.5 + 60); assert.equal(h.screen.selectedLane, 2);
    h.advance(1000); assert.ok(h.screen.barrierHits[2] > 0); assert.ok(h.screen.barrierHits[2] < 10);
    h.screen.onMouseDown(1130 * 1.5, 22 * 1.5 + 60); assert.equal(h.screen.calculatorOpen, true);
    const bullets = h.screen.bulletsFired, hits = h.screen.barrierHits[2], phaseTime = h.screen.phaseElapsedMs;
    h.advance(3000); assert.equal(h.screen.bulletsFired, bullets); assert.equal(h.screen.barrierHits[2], hits); assert.equal(h.screen.phaseElapsedMs, phaseTime);
}

// The scene has JSON-safe progression, so durable pause sessions can resume a shot.
{
    const h = harness(); enterCombat(h);
    const wave = h.screen.waves[0]; h.screen.selectedLane = wave.choices.findIndex(c => c.value === wave.correct); h.advance(1000);
    const previousHits = h.screen.barrierHits[h.screen.selectedLane]; assert.ok(previousHits > 0);
    const snapshot = JSON.parse(JSON.stringify(h.screen));
    const restored = harness(); const callbacks = restored.screen.options;
    Object.assign(restored.screen, snapshot, { options: callbacks }); restored.screen.onGameplayResume();
    assert.equal(restored.screen.barrierHits[restored.screen.selectedLane], previousHits);
    until(restored, () => restored.screen.phase === 'pickup'); until(restored, () => restored.screen.phase !== 'pickup');
    assert.equal(restored.screen.waveIndex, 1); assert.equal(restored.screen.hearts, 3);
    restored.screen.phase = 'build'; restored.screen.problem = { pairs: [] };
    restored.screen.update(); assert.equal(restored.screen.phase, 'think'); assert.ok(restored.screen.problem.asked);
}

// Restoring pickup or counterattack animations completes each side effect exactly once.
for (const desiredPhase of ['pickup', 'counterattack']) {
    const h = harness();
    if (desiredPhase === 'pickup') { enterCombat(h); until(h, () => h.screen.phase === 'pickup'); }
    else { assemble(h, ['operator']); until(h, () => h.screen.phase === 'counterattack'); h.advance(400); }
    const snapshot = JSON.parse(JSON.stringify(h.screen)), restored = harness();
    Object.assign(restored.screen, snapshot, { options: restored.screen.options }); restored.screen.onGameplayResume();
    if (desiredPhase === 'pickup') { until(restored, () => restored.screen.phase === 'barriers'); assert.equal(restored.screen.waveIndex, 1); }
    else {
        until(restored, () => restored.screen.phase === 'player_hit'); assert.equal(restored.screen.hearts, 2);
        restored.screen._takeBossAttack(); assert.equal(restored.screen.hearts, 2);
        assert.equal(restored.screen.roundHistory.length, 1);
    }
}

// Mid-boss pause snapshots retain landed impacts without prematurely grading the formula.
{
    const h = harness(); assemble(h);
    h.screen._hitBoss(); h.screen._hitBoss(); h.screen._hitBoss();
    const snapshot = JSON.parse(JSON.stringify(h.screen)), restored = harness();
    Object.assign(restored.screen, snapshot, { options: restored.screen.options }); restored.screen.onGameplayResume();
    assert.equal(restored.screen.bossImpactCount, 3);
    restored.screen._hitBoss(); assert.equal(restored.screen.bossHP, 3); assert.equal(restored.screen.phase, 'boss');
    restored.screen._hitBoss(); assert.equal(restored.screen.bossHP, 2); assert.equal(restored.screen.phase, 'boss_hit');
}

// Restoring the background of a transient calculator overlay cannot leave the game frozen.
{
    const h = harness(); h.screen._openCalculator();
    const snapshot = JSON.parse(JSON.stringify(h.screen)), restored = harness();
    Object.assign(restored.screen, snapshot, { options: restored.screen.options }); restored.screen.onGameplayResume();
    assert.equal(restored.screen.calculatorOpen, false);
    restored.screen.update(); restored.advance(100);
    assert.equal(restored.screen.thinkRemainingMs, 59900);
}

// Correct answers stay in the arena until their pickup reaches the answer field.
{
    const h = harness(); assemble(h);
    until(h,()=>h.screen.phase==='boss_hit');
    const p = h.screen.problem;
    assert.equal(h.screen.addressDrop.installed,false);
    assert.equal(h.screen._dockValues().answer,p.asked.toUpperCase()+' ?');
    h.texts.length=0; h.screen.drawHUD();
    assert.ok(!h.texts.includes(p.answerAddress),'the address does not appear in the field at the moment of the hit');
    h.advance(500);
    assert.equal(h.screen._addressDropPose().stage,'fall','the address drops from the damaged boss');
    h.screen.drawHUD();
    until(h,()=>h.screen.phase==='drop');
    assert.equal(h.screen._addressDropPose().stage,'hold');
    h.texts.length=0; h.screen.drawHUD();
    assert.ok(h.texts.includes(p.answerAddress),'the bare address remains readable in the arena');
    assert.ok(!h.texts.some(text=>/ADDRESS CORE RECOVERED|NEXT QUESTION IN|NEXT SIGNAL/.test(text)),'the full result panel is removed');
    h.screen.onKeyPressed('Enter');
    assert.equal(h.screen.problem.id,p.id,'Enter cannot skip the drop and its transfer');
    h.advance(1000);
    assert.equal(h.screen._addressDropPose().stage,'hold','the pickup stays visible for several seconds');
    until(h,()=>h.screen._addressDropPose()?.stage==='transfer');
    const before=h.screen.addressDrop.elapsedMs;
    h.screen.onKeyPressed('KeyH'); h.advance(4000);
    assert.equal(h.screen.addressDrop.elapsedMs,before,'reading help freezes the flying pickup');
    h.screen.onKeyPressed('Enter'); h.advance(400);
    const pose=h.screen._addressDropPose();
    assert.ok(pose.x>640 && pose.x<1101 && pose.y>385 && pose.y<661,'the address travels toward the answer field');
    assert.equal(h.screen._dockValues().answer,p.asked.toUpperCase()+' ?','the destination stays blank until arrival');

    const restored=harness(), snapshot=JSON.parse(JSON.stringify(h.screen));
    Object.assign(restored.screen,snapshot,{options:restored.screen.options}); restored.screen.onGameplayResume();
    assert.equal(restored.screen.addressDrop.elapsedMs,h.screen.addressDrop.elapsedMs,'saving retains the transfer position');
    until(restored,()=>restored.screen.addressDrop.installed);
    assert.equal(restored.screen._dockValues().answer,p.answerAddress);
    restored.drawn.length=0; restored.screen.drawHUD();
    const answers=restored.drawn.filter(item=>item.text===p.answerAddress);
    assert.equal(answers.length,1,'the pickup becomes the field value without a duplicate floating answer');
    assert.equal(answers[0].x,1101); assert.equal(answers[0].y,661);
    until(restored,()=>restored.screen.phase==='think');
    assert.equal(restored.screen.thinkRemainingMs,60000);
    assert.equal(restored.screen._dockText('addressValue',restored.screen.problem.givenAddress),p.givenAddress,'the previous question erases before new text types');
    restored.advance(350);
    const next=restored.screen.problem.givenAddress;
    const typed=restored.screen._dockText('addressValue',next).replace(/\u258f/g,'');
    assert.ok(typed.length>0 && typed.length<next.length && next.startsWith(typed),'new givens type in character by character');
    assert.equal(restored.screen.thinkRemainingMs,60000,'typing does not consume preparation time');
    const typingAge=restored.screen.dockTyping.elapsedMs;
    restored.screen.onKeyPressed('KeyH'); restored.advance(2000);
    assert.equal(restored.screen.dockTyping.elapsedMs,typingAge,'typing also pauses with the briefing');
    restored.screen.onKeyPressed('Enter');
    const typedRestore=harness();
    Object.assign(typedRestore.screen,JSON.parse(JSON.stringify(restored.screen)),{options:typedRestore.screen.options});
    typedRestore.screen.onGameplayResume();
    assert.equal(typedRestore.screen.dockTyping.elapsedMs,typingAge,'typing survives JSON save/restore');
    until(typedRestore,()=>!typedRestore.screen._dockTypingActive());
    assert.equal(typedRestore.screen.thinkRemainingMs,60000);
    typedRestore.advance(150); assert.equal(typedRestore.screen.thinkRemainingMs,59850);
    assert.equal(typedRestore.screen._dockValues().answer,typedRestore.screen.problem.asked.toUpperCase()+' ?');
    assert.equal(Object.keys(typedRestore.screen.weapon).length,0,'the new formula starts empty');
    typedRestore.screen._newEncounter(); typedRestore.screen._skipPreparation();
    assert.equal(typedRestore.screen._dockTypingActive(),false,'Skip completes the text transition before combat');
    assert.equal(typedRestore.screen.phase,'barriers');
}

// Old v4 saves and reduced-motion mode retain the same answer timing and outcome.
{
    const h=harness({reducedMotion:true}); assemble(h); until(h,()=>h.screen.phase==='boss_hit');
    h.advance(700); const first=h.screen._addressDropPose();
    h.advance(1200); const second=h.screen._addressDropPose();
    assert.deepEqual(first,second,'reduced motion holds the pickup still');
    const old=JSON.parse(JSON.stringify(h.screen)); delete old.addressDrop; delete old.dockTyping;
    const migrated=harness(); Object.assign(migrated.screen,old,{options:migrated.screen.options});
    migrated.screen.onGameplayResume(); migrated.screen.update();
    assert.ok(migrated.screen.addressDrop,'an older result state joins the drop sequence');
    assert.equal(migrated.screen.bossHP,2,'migration does not damage APEX a second time');
    until(h,()=>h.screen.addressDrop.installed); h.screen._continue();
    assert.equal(h.screen.dockTyping,null,'reduced motion displays the next question immediately');
}

// Canvas smoke coverage for every scene and overlay, including answer visibility.
{
    const h = harness();
    h.screen.drawHUD(); assert.ok(h.texts.includes('06 / SUBNET BLASTER'));
    assert.ok(h.screen.consoleRect.h > 720 * 0.7, 'the console dominates the canvas');
    assert.deepEqual(h.drawn.filter(item => item.y > 46 && item.y < 584).map(item => item.text),
        ['PREPARATION PHASE', '1:00'], 'preparation shows only its heading and timer text, plus the drawn skip icon');
    assert.ok(h.drawn.find(item => item.text === 'PREPARATION PHASE').font.includes('Abnes'), 'preparation uses a different display font');
    assert.ok(!h.texts.includes('FIND THE'), 'the duplicate right-hand prompt is removed');
    assert.ok(!h.texts.some(text => text.includes('SIGNAL ') || text.includes('CORES RECOVERED') || text.includes('SECTOR GUARDIAN')));
    const leftValues = h.drawn.filter(item => [h.screen.problem.givenAddress, String(h.screen.problem.givenBits === 'borrowed' ? h.screen.problem.borrowedBits : h.screen.problem.hostBits)].includes(item.text) && item.x < 370);
    assert.ok(leftValues.every(item => item.x === 155), 'given values use one aligned column');
    assert.ok(!h.texts.includes(h.screen.problem.answerAddress), 'planning does not reveal the answer');
    assert.ok(!h.texts.some(text => text.includes('h = ?') || text.includes('block = 2^h') || text.includes('SELECT LANE') || text.includes('10 HITS TO BREAK')), 'removed footer and formula helper stay hidden');
    h.screen.helpOpen = true; h.screen.drawHUD(); h.screen.helpOpen = false;
    h.screen._openCalculator(); h.context.Manager.Stack.top.drawHUD(); h.context.Manager.Stack.top.onKeyPressed('Escape');
    enterCombat(h); h.texts.length = 0; h.screen.drawHUD();
    assert.ok(h.texts.includes('CHOOSE THE OPERATOR'));
    assert.ok(h.texts.includes('ADD THE BLOCK') && h.texts.includes('SUBTRACT THE BLOCK'));
    assert.ok(!h.texts.some(text => /^0[123] \/|FORMULA MODULE|moves toward|TARGET LOCK|BREAK A BARRIER/.test(text)), 'selection keeps the heading, choice and short description only');
    assert.ok(h.drawn.some(item => item.text === '\u2665' && item.x > 1000 && item.y < 100));
    h.screen._hitBarrier(0); h.screen._hitBarrier(0); h.screen.drawHUD();
    for (let hit = 0; hit < 7; hit++) h.screen._hitBarrier(0);
    h.screen.drawHUD(); assert.ok(!h.texts.some(text => /\d\/10/.test(text)), 'barrier damage uses cracks instead of counters');
    solveEncounter(h); h.screen.drawHUD();
    assert.ok(h.texts.includes(h.screen.problem.answerAddress), 'boss drops the answer');
}

// Calculator grammar has power precedence and rejects code or invalid arithmetic.
{
    const { rules } = harness();
    for (const [expression, expected] of [['2^(8-3)', 32], ['2^13', 8192], ['32-1', 31], ['31-32+1', 0], ['2+3*4', 14], ['-2^2', -4], ['2^3^2', 512]]) assert.equal(rules.calculate(expression), expected);
    for (const expression of ['alert(1)', '2;3', '2**3', '1/0', '2^99999', '(2+3', '1..2', '', '2(3)']) assert.throws(() => rules.calculate(expression));
}

// Versioned report metrics count barrier decisions while keeping legacy results readable.
{
    const h = harness();
    Object.assign(h.context, { Core: { Game: { current: { currentMapID: 13 } } }, Graphic: {}, Model: {}, Main: {}, THREE: {}, inject() {} });
    vm.runInContext(fs.readFileSync(path.join(root, 'Plugins/IP2Live_Core/modules/game_manager.js'), 'utf8'), h.context);
    const gm = h.context.IP2Live.GameManager;
    const metrics = gm._extractGameplayMetrics('ip_cidr_quarantine_matrix', {
        gameplayVersion: 'subnet-blaster-v1', passed: true, attemptsUsed: 2, mistakeCount: 1, totalShots: 10,
        correctShots: 9, bossHits: 3, heartsRemaining: 2, roundHistory: [{ ipClass: 'A', passed: true }],
    }, true);
    assert.equal(metrics.mistakeCount, 1); assert.equal(metrics.accuracy, 0.9);
    assert.equal(metrics.payload.bossHits, 3); assert.equal(metrics.payload.roundHistory[0].ipClass, 'A');
    const current = gm._extractGameplayMetrics('ip_cidr_quarantine_matrix', {
        gameplayVersion: 'subnet-blaster-v2', passed: false, attemptsUsed: 1, mistakeCount: 1,
        totalShots: 3, correctShots: 0, heartsRemaining: 2,
    }, false);
    assert.equal(current.mistakeCount, 1, 'one failed encounter costs one heart');
    assert.equal(current.mistakeRate, 1, 'all three formula pieces were incorrect');
    assert.equal(current.accuracy, 0); assert.equal(current.payload.gameplayVersion, 'subnet-blaster-v2');
    const twoModules = gm._extractGameplayMetrics('ip_cidr_quarantine_matrix', {
        gameplayVersion: 'subnet-blaster-v4', passed: true, attemptsUsed: 2, mistakeCount: 1,
        totalShots: 8, correctShots: 7, bossHits: 3, heartsRemaining: 2,
    }, true);
    assert.equal(twoModules.accuracy, 7 / 8); assert.equal(twoModules.mistakeRate, 1 / 8);
    assert.equal(twoModules.payload.gameplayVersion, 'subnet-blaster-v4');
    const legacy = gm._extractGameplayMetrics('ip_cidr_quarantine_matrix', { attemptsUsed: 2, maxAttempts: 3, pairCount: 2 }, true);
    assert.equal(legacy.payload.pairCount, 2);
    const quest = gm.getGameplayQuestSpecs('ip_cidr_quarantine_matrix')[0];
    assert.equal(quest.title, 'CALIBRATE SUBNET BLASTER');
    assert.equal(quest.id, 'stage.13.mixed.05.cidr_matrix.tutorial');
}

{
    const h = harness();
    const registrations = [], library = new Map();
    const dm = h.context.IP2Live.DialogueManager = {
        _active: null,
        registerDialogue(id, dialogue) { library.set(id, dialogue); registrations.push(dialogue); },
        start(id, context) { this._active = {id,...library.get(id),context,slideIndex:0}; return true; },
        isActive() { return !!this._active; },
        advance() { this._active.slideIndex++; if (this._active.slideIndex >= this._active.slides.length) dismiss(); },
    };
    function dismiss() { const finish = dm._active.onComplete; dm._active = null; finish?.(); }
    h.context.IP2Live.GameManager.prepareTutorialReplayScreen = () => {};
    vm.runInContext(fs.readFileSync(path.join(root,
        'Plugins/IP2Live_Core/gameplay/gameplay6/CIDRQuarantineMatrix/ip_cidr_quarantine_matrix_tutorial.js'), 'utf8'), h.context);
    const manager = h.context.IP2Live.CIDRQuarantineMatrixGameplayManager;
    const options = { mapId:13, questId:'tutorial.blaster', objectiveId:'blaster.first',
        spec:{id:'tutorial.blaster',objectiveId:'blaster.first',mapId:13,tutorial:true},
        problem:h.rules.generate({ipClass:'C',hostBits:5,asked:'broadcast',givenBits:'borrowed'},()=>0),
        showIntro:true, useLoading:false, mode:'push' };
    const launch = extra => {
        manager._active = false; manager._activeAttempt = null;
        assert.equal(manager.launchCIDRQuarantineMatrixGameplay({...options,...extra}),true);
        return h.context.Manager.Stack.top;
    };
    const taught = launch();
    h.screen = taught;
    assert.equal(registrations.length,1,'the actual tutorial launch opens its learning introduction');
    assert.match(dm._active.slides.flat().join(' '),/Welcome to/,'welcome precedes the worked lesson');
    const preparation = taught.thinkRemainingMs;
    h.advance(8000);
    assert.equal(taught.thinkRemainingMs,preparation,'reading the introduction does not consume preparation time');
    dismiss();
    assert.match(dm._active.id,/\.preparation\./);
    const content = dm._active.slides.flat().join(' ');
    assert.match(content,/Values vary: Classes A\/B\/C/);
    assert.match(content,/Network = first address/);
    assert.match(content,/broadcast = last address/);
    assert.match(content,/default host bits - borrowed bits/);
    assert.match(content,/8 - 3 = 5 host bits/);
    assert.match(content,/2\^h total addresses/);
    assert.match(content,/2\^5 = 32/);
    assert.match(content,/Do not subtract 2/);
    assert.match(content,/Broadcast = network \+ block - 1/);
    assert.match(content,/Network = broadcast - block \+ 1/);
    assert.match(content,/operator, then block size/);
    // Focus follows the same controls on standard, wide and tall canvases.
    const ctx = h.context.Common.Platform.ctx;
    for (const [width,height] of [[1280,720],[1920,1080],[800,600],[1000,450]]) {
        ctx.canvas.width = width; ctx.canvas.height = height;
        for (let index=0;index<dm._active.slides.length;index++) {
            dm._active.slideIndex = index;
            taught.drawHUD();
            const rects = taught._tutorialFocusRects(dm._active,taught._tutorialViewport(ctx));
            assert.ok(rects.length,'each preparation step highlights its subject');
            for (const r of rects) assert.ok(r.x>=0 && r.y>=0 && r.x+r.w<=width && r.y+r.h<=height);
            const panel = dm._active.context.panelBounds;
            assert.ok(panel.x>=0 && panel.y>=0 && panel.x+panel.w<=1280,'the compact lesson stays in the viewport');
        }
    }
    assert.ok(h.texts.includes('FIRST ADDRESS') && h.texts.includes('LAST ADDRESS'),'the subnet range is illustrated');
    ctx.canvas.width = 1280; ctx.canvas.height = 720;
    h.advance(8000);
    assert.equal(taught.thinkRemainingMs,preparation,'the worked explanation also preserves planning time');
    dismiss();
    h.advance(500);
    assert.ok(taught.thinkRemainingMs < preparation && taught.thinkRemainingMs >= preparation-500,
        'preparation resumes without adding dialogue time');
    enterCombat(h); h.advance(50);
    assert.match(dm._active.id,/\.phase\.operator\./,'the operator lesson waits for its barriers');
    assert.match(dm._active.slides.flat().join(' '),/Choose \{\{highlight:\+\}\}/);
    const lane = taught.selectedLane;
    taught.onMouseMove(1200,500);
    assert.equal(taught.selectedLane,lane,'reading cannot accidentally change the target');
    h.advance(3000);
    assert.equal(taught.barrierImpacts,0,'reading cannot shoot a barrier');
    taught.drawHUD(); dismiss();
    collect(h,taught.waves[0].choices.findIndex(c=>c.value==='+'));
    h.advance(50);
    assert.match(dm._active.id,/\.phase\.blockSize\./,'block-size guidance waits for the second wave');
    taught.drawHUD(); dismiss();
    collect(h,taught.waves[1].choices.findIndex(c=>c.value===32));
    until(h,()=>taught.phase==='boss'); h.advance(50);
    assert.match(dm._active.id,/\.phase\.boss\./,'boss teaching waits until APEX is visible');
    assert.match(dm._active.slides.flat().join(' '),/Five auto-fire hits/);
    assert.match(dm._active.slides.flat().join(' '),/three hearts/);
    h.advance(3000);
    assert.equal(taught.bossImpactCount,0,'APEX cannot judge the weapon while the player reads');
    for (let i=0;i<dm._active.slides.length;i++) { dm._active.slideIndex=i; taught.drawHUD(); }
    dismiss();
    until(h,()=>taught.phase==='drop' && taught.addressDrop.installed);
    taught._continue(); h.advance(50);
    assert.equal(dm._active,null,'later questions let the player apply the steps independently');
    assert.equal(registrations.length,5,'welcome, preparation, two choice lessons and boss lesson');
    assert.ok(registrations.every(d=>d.slides.every(slide=>slide.length<=2)),'lessons contain at most two points per slide');

    // Current values drive both question directions and both ways of finding h.
    const helper = h.context.IP2Live.IPCIDRQuarantineMatrixTutorial;
    for (const ipClass of ['A','B','C']) for (const asked of ['network','broadcast']) for (const givenBits of ['host','borrowed']) {
        const p = h.rules.generate({ipClass,hostBits:5,asked,givenBits},()=>0);
        helper.showPreparationGuide(p,()=>{});
        const lesson = dm._active.slides.flat().join(' ');
        assert.ok(lesson.includes(p.givenAddress) && lesson.includes('asks for {{highlight:'+asked+'}}'));
        if (givenBits==='host') assert.match(lesson,/host bits are already given: h = 5/);
        else assert.ok(lesson.includes(p.availableBits+' - '+p.borrowedBits+' = 5 host bits'));
        helper.showPhaseGuide('operator',p,()=>{});
        assert.ok(dm._active.slides.flat().join(' ').includes('Choose {{highlight:'+p.operator+'}}'));
    }
    dm._active = null;
    const seen = registrations.length;
    launch(); assert.equal(registrations.length,seen,'ordinary tutorial retries do not repeat the introduction');
    manager._introShown = false;
    launch({_ip2liveResumeGameplay:true});
    assert.equal(registrations.length,seen,'restoring a gameplay does not replay its introduction');
    launch({tutorialReplay:true,showIntro:false});
    assert.equal(registrations.length,seen+1,'an explicitly requested guided replay teaches the current tutorial');
    dm._active = null;
    launch({tutorialReplay:true,practiceGameplay:true,showIntro:false});
    assert.equal(registrations.length,seen+1,'unguided practice does not display the tutorial');
    taught.tutorialPromptActive = true; taught.onGameplayResume();
    assert.equal(taught.tutorialPromptActive,false,'restoring without a transient dialogue releases its input lock');
    delete h.context.IP2Live.DialogueManager;
    manager._introShown = false;
    const fallback = launch(); h.advance(100);
    assert.equal(manager._introShown,false,'an unavailable dialogue does not mark the lesson as read');
    assert.equal(fallback.tutorialPromptActive,false,'a missing dialogue cannot lock the run');
}

// Use the real compact dialogue renderer to check placement beside highlighted controls.
{
    const h = harness({tutorialMode:true});
    const ctx = h.context.Common.Platform.ctx;
    ctx.measureText = text => ({width:String(text).length * (parseFloat(ctx.font) || 16) * 0.55});
    h.context.Common.ScreenResolution = {SCREEN_X:1280,SCREEN_Y:720};
    for (const file of ['modules/dialogue_manager.js',
        'gameplay/gameplay6/CIDRQuarantineMatrix/ip_cidr_quarantine_matrix_tutorial.js']) {
        vm.runInContext(fs.readFileSync(path.join(root,'Plugins/IP2Live_Core',file),'utf8'),h.context);
    }
    const dm = h.context.IP2Live.DialogueManager;
    assert.equal(h.screen.startTutorialWalkthrough(),true);
    dm.stop();
    assert.match(dm._active.id,/\.preparation\./,'the real dialogue completion starts the given walkthrough');
    function checkPlacement() {
        const active = dm._active;
        for (const [width,height] of [[1280,720],[1920,1080],[800,600],[1000,450]]) {
            ctx.canvas.width=width; ctx.canvas.height=height;
            for (let index=0;index<active.slides.length;index++) {
                active.slideIndex=index; active.panelHeight=null; active.typeChars=10000;
                h.screen.drawHUD();
                const bounds=active.context.panelBounds;
                const panel={x:bounds.x*width/1280,y:Math.min(bounds.y*height/720,height-active.panelHeight-16*height/720),
                    w:bounds.w*width/1280,h:active.panelHeight};
                const rects=h.screen._tutorialFocusRects(active,h.screen._tutorialViewport(ctx));
                for (const r of rects) {
                    const overlaps=panel.x<r.x+r.w && panel.x+panel.w>r.x && panel.y<r.y+r.h && panel.y+panel.h>r.y;
                    assert.equal(overlaps,false,active.id+' slide '+index+': lesson must leave its subject visible at '+width+'x'+height);
                }
            }
        }
    }
    checkPlacement(); dm.stop();
    for (const phase of ['operator','blockSize','boss']) {
        h.screen.phase=phase==='boss'?'boss':'barriers'; h.screen.waveIndex=phase==='blockSize'?1:0;
        h.context.IP2Live.IPCIDRQuarantineMatrixTutorial.showPhaseGuide(phase,h.screen.problem,()=>{});
        assert.equal(dm.getDialogue(dm._active.id).timing,'during','phase lessons stay outside campaign before/after queues');
        checkPlacement(); dm.stop();
    }
    // A queued introduction must also pause preparation until it can be displayed.
    h.screen._newEncounter();
    h.context.IP2Live.WorldTitleOverlay={isActive:()=>true};
    assert.equal(h.screen.startTutorialWalkthrough(),true);
    assert.equal(dm.isActive(),false);
    h.advance(2000); h.screen.onKeyPressed('Enter'); h.screen.onKeyPressed('KeyC');
    assert.equal(h.screen.thinkRemainingMs,60000);
    assert.equal(h.screen.phase,'think');
    assert.equal(h.screen.calculatorOpen,false,'queued lessons cannot open competing overlays');
    h.context.IP2Live.WorldTitleOverlay.isActive=()=>false;
    dm._startQueuedIfPossible();
    assert.match(dm._active.id,/\.intro\./);
    dm.stop(); dm.stop();
    h.advance(200);
    assert.ok(h.screen.thinkRemainingMs<60000,'planning starts when the queued walkthrough finishes');
}

console.log('gameplay6_subnet_blaster.test.cjs: PASS');
