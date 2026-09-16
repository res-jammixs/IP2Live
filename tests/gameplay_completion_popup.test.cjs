const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const popupPath = path.join(
    root,
    'Plugins',
    'IP2Live_Core',
    'gameplay',
    'common',
    'gameplay_completion_popup.js'
);

function loadPopup() {
    const source = fs.readFileSync(popupPath, 'utf8');
    let dialogueActive = false;
    const IP2Live = {
        Assets: { nebulaLoaded: true, abnesLoaded: true, ethnocentricLoaded: true },
        DialogueManager: { isActive() { return dialogueActive; } },
    };
    const Manager = { Stack: { requestPaintHUD: false } };
    const windowObject = {};
    new Function('IP2Live', 'Manager', 'window', source)(IP2Live, Manager, windowObject);
    return {
        popup: IP2Live.GameplayCompletionPopup,
        Manager,
        setDialogueActive(value) { dialogueActive = !!value; },
    };
}

function fakeContext(width, height) {
    const text = [];
    const rectangles = [];
    const gradient = { addColorStop() {} };
    const ctx = {
        canvas: { width, height },
        font: '10px monospace',
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        globalAlpha: 1,
        save() {},
        restore() {},
        setTransform() {},
        fillRect(x, y, w, h) { rectangles.push({ x, y, w, h, fillStyle: this.fillStyle }); },
        createLinearGradient() { return gradient; },
        beginPath() {},
        moveTo() {},
        lineTo() {},
        closePath() {},
        clip() {},
        arc() {},
        fill() {},
        stroke() {},
        fillText(value, x, y) { text.push({ value: String(value), x, y, font: this.font }); },
        measureText(value) {
            const match = String(this.font || '').match(/([0-9]+(?:\.[0-9]+)?)px/);
            const px = match ? Number(match[1]) : 10;
            return { width: String(value || '').length * px * 0.58 };
        },
    };
    return { ctx, text, rectangles };
}

function testCompactSharedRenderer() {
    const { popup } = loadPopup();
    const canvas = fakeContext(1280, 720);
    const metrics = popup.draw(canvas.ctx, {
        label: 'IP class routes connected',
        footer: 'PROGRESS SECURED // RETURNING TO NETWORK',
        progress: 0.6,
        tick: 12,
    });

    assert.ok(metrics, 'the renderer should return its measured card');
    assert.equal(metrics.w, 520, 'desktop card should stay compact');
    assert.equal(metrics.h, 150, 'desktop card should stay compact');
    assert.equal(metrics.progress, 0.6);
    assert.deepEqual(canvas.text.map((entry) => entry.value), ['Task Complete']);
    assert.equal(metrics.title, 'Task Complete');
    assert.equal('label' in metrics, false);
    assert.equal('footer' in metrics, false);
    assert.ok(canvas.rectangles.some((rect) => rect.w === 1280 && rect.h === 720), 'a restrained focus veil should be drawn');

    const smallCanvas = fakeContext(640, 360);
    const smallMetrics = popup.draw(smallCanvas.ctx, { label: 'Responsive objective' });
    assert.ok(smallMetrics.w < metrics.w);
    assert.ok(smallMetrics.h < metrics.h);
    assert.ok(smallMetrics.w <= 640 - 20, 'the component must remain inside a small canvas');
}

function testDialogueDefersPopupAndPausesTimer() {
    const { popup, setDialogueActive } = loadPopup();
    const screen = {};
    const completions = [];
    popup.begin(screen, {
        startedAt: 100,
        durationMs: 800,
        onComplete() { completions.push('done'); },
    });

    assert.equal(popup.update(screen, 499), true);
    setDialogueActive(true);
    assert.equal(popup.update(screen, 500), true);
    const hiddenCanvas = fakeContext(1280, 720);
    assert.equal(popup.draw(hiddenCanvas.ctx, { progress: 0.5 }), false, 'direct universal draws must wait for dialogue');
    assert.equal(popup.drawFor(screen, hiddenCanvas.ctx), false, 'stateful popup draws must wait for dialogue');
    assert.equal(hiddenCanvas.text.length, 0);
    assert.equal(popup.update(screen, 1000), true);
    assert.equal(completions.length, 0);

    setDialogueActive(false);
    assert.equal(popup.update(screen, 1000), true);
    assert.equal(popup.progressFor(screen, 1000), 0.5, 'dialogue time must not consume popup display time');
    assert.equal(popup.update(screen, 1399), true);
    assert.equal(completions.length, 0);
    assert.equal(popup.update(screen, 1400), true);
    assert.deepEqual(completions, ['done']);
}

function testTimedCompletionRunsExactlyOnce() {
    const { popup, Manager } = loadPopup();
    const screen = {};
    const results = [];
    assert.equal(popup.begin(screen, {
        startedAt: 100,
        durationMs: 800,
        result: { passed: true },
        onComplete(result) { results.push(result); },
    }), true);
    assert.equal(Manager.Stack.requestPaintHUD, true);
    assert.equal(popup.begin(screen, {}), false, 'the same screen cannot open a duplicate completion popup');
    assert.equal(popup.update(screen, 899), true);
    assert.equal(results.length, 0);
    assert.equal(popup.update(screen, 900), true);
    assert.deepEqual(results, [{ passed: true }]);
    assert.equal(popup.update(screen, 1200), false);
    assert.equal(results.length, 1, 'the completion callback must remain exactly-once');
}

function testEveryGameplayUsesTheSharedComponent() {
    const relativeFiles = [
        'gameplay/gameplay1/IPWires/ip_wires_gameplay.js',
        'gameplay/gameplay2/IPPatchPanel/ip_patchpanel_gameplay.js',
        'gameplay/gameplay3/CIDRPanel/ip_cidrpanel_gameplay.js',
        'gameplay/gameplay4/SubnetSimulator/ip_subnetsim_gameplay.js',
        'gameplay/gameplay4_5/HostPowerReactor/ip_host_power_gameplay.js',
        'gameplay/gameplay5/CIDRQuarantine/ip_cidr_quarantine_gameplay.js',
        'gameplay/gameplay6/CIDRQuarantineMatrix/ip_cidr_quarantine_matrix_gameplay.js',
        'gameplay/gameplay7/NetworkRepair/gameplay.js',
        'gameplay/gameplay8/VLSMAllocator/ip_vlsm_allocator_gameplay.js',
    ];
    for (const relative of relativeFiles) {
        const source = fs.readFileSync(path.join(root, 'Plugins', 'IP2Live_Core', relative), 'utf8');
        assert.match(source, /GameplayCompletionPopup/, relative + ' must use the shared completion component');
    }

    const harderWires = fs.readFileSync(
        path.join(root, 'Plugins', 'IP2Live_Core', 'gameplay', 'gameplay1', 'IPWires', 'ip_wires_gameplay_harder.js'),
        'utf8'
    );
    const harderCIDR = fs.readFileSync(
        path.join(root, 'Plugins', 'IP2Live_Core', 'gameplay', 'gameplay3', 'CIDRPanel', 'ip_cidrpanel_gameplay_harder.js'),
        'utf8'
    );
    assert.match(harderWires, /extends IP2Live\.WiresGameplayScreen/, 'harder Gameplay 1 should inherit the shared base popup path');
    assert.match(harderCIDR, /extends BaseScreen/, 'harder Gameplay 3 should inherit the shared base popup path');

    const directTimerFiles = [
        'gameplay/gameplay3/CIDRPanel/ip_cidrpanel_gameplay.js',
        'gameplay/gameplay4/SubnetSimulator/ip_subnetsim_gameplay.js',
        'gameplay/gameplay7/NetworkRepair/gameplay.js',
    ];
    for (const relative of directTimerFiles) {
        const source = fs.readFileSync(path.join(root, 'Plugins', 'IP2Live_Core', relative), 'utf8');
        assert.match(source, /isDialogueBlocking\(\)/, relative + ' must pause its direct success timer for dialogue');
    }

    const loader = fs.readFileSync(path.join(root, 'Plugins', 'IP2Live_Core', 'code.js'), 'utf8');
    assert.ok(
        loader.indexOf('gameplay_completion_popup.js') < loader.indexOf('ip_wires_gameplay.js'),
        'the shared component must load before any gameplay screen'
    );
}

try {
    testCompactSharedRenderer();
    testTimedCompletionRunsExactlyOnce();
    testDialogueDefersPopupAndPausesTimer();
    testEveryGameplayUsesTheSharedComponent();
    console.log('gameplay_completion_popup.test.cjs: PASS');
} catch (error) {
    console.error(error);
    process.exitCode = 1;
}
