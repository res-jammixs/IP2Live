const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const root = path.join(__dirname, '../Plugins/IP2Live_Core');
const defaults = JSON.parse(fs.readFileSync(path.join(__dirname, '../keyboard.json'), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function harness() {
    const models = clone(defaults.list), frames = [], writes = [], timers = new Map(), delivered = [];
    const listeners = {}; let serial = 0, parse = async () => clone(defaults);
    const ctx = new Proxy({ canvas: { width: 1280, height: 720 }, measureText: text => ({ width: String(text).length * 7 }),
        createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) },
    { get: (target, key) => key in target ? target[key] : () => {} });
    class Base { constructor(initialize) { this.loading = false; if (initialize) this.initialize?.(); } close() {} update() {} drawHUD() {} }
    class MapScene extends Base {
        constructor(id = 3) { super(); this.id = id; MapScene.current = this; }
        onKeyPressed(key) { delivered.push(key); return true; }
        onKeyPressedRepeat(key) { delivered.push(key); return true; }
        onKeyPressedAndRepeat(key) { return true; }
    }
    const stack = { content: frames, get top() { return frames.at(-1); }, isLoading: () => false,
        push(scene) { frames.push(scene); }, pop() { const scene = frames.pop(); scene?.close(); return scene; },
        popAll() { while (frames.length) this.pop(); }, replace(scene) { this.pop(); this.push(scene); } };
    for (const name of ['onKeyPressed', 'onKeyPressedAndRepeat', 'onKeyPressedRepeat', 'onKeyReleased', 'onMouseUp', 'onMouseDown']) {
        stack[name] = (...args) => stack.top?.[name]?.(...args);
    }
    const keyboards = { controls: Object.fromEntries(models.map(kb => [kb.abr, kb])),
        menuControls: Object.fromEntries(Object.entries({ Action: 'a', Cancel: 'c', Up: 'u', Down: 'd', Left: 'l', Right: 'r' })
            .map(([name, key]) => [name, models.find(kb => kb.id === defaults[key])])),
        get: id => models.find(kb => kb.id === id), getCommandsGraphics: () => models.map(kb => ({ kb })),
        isKeyEqual: (key, kb) => !!kb?.sc.some(group => group.length === 1 && String(group[0]).toUpperCase() === String(key).toUpperCase()),
        checkActionMenu(key) { return this.isKeyEqual(key, this.menuControls.Action); },
        checkCancelMenu(key) { return this.isKeyEqual(key, this.menuControls.Cancel) || this.isKeyEqual(key, this.controls.MainMenu); } };
    const settings = { kb: new Map(models.map(kb => [kb.id, clone(kb.sc)])),
        async save() { writes.push(clone(Object.fromEntries(this.kb))); } };
    const input = { keysPressed: new Set(), lockedKeys: new Map(), mouseLeftPressed: false, mouseRightPressed: false };
    const sound = { playSound() {} };
    const env = vm.createContext({ console: { log() {}, warn() {}, error() {} },
        setTimeout(fn) { timers.set(++serial, fn); return serial; }, clearTimeout(id) { timers.delete(id); },
        window: { addEventListener(name, callback) { (listeners[name] ||= []).push(callback); }, requestIdleCallback() {} },
        document: { createElement: () => ({ width: 1280, height: 720, getContext: () => ctx }),
            addEventListener(name, callback) { (listeners[name] ||= []).push(callback); } },
        Common: { Inputs: input, Platform: { ctx, ROOT_DIRECTORY: 'build/', parseFileJSON: (...args) => parse(...args) },
            Paths: { FILE_KEYBOARD: 'build/keyboard.json' }, ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 } },
        Core: { Game: { current: { currentMapID: 3, infiltratorName: 'Test' } } }, Scene: { Base, Map: MapScene },
        Data: { Settings: settings, Keyboards: keyboards, Systems: { soundCancel: sound, soundCursor: sound, soundConfirmation: sound, soundImpossible: sound } },
        Manager: { Stack: stack, Events: {}, GL: { renderer: { clear() {} } } }, Main: {}, THREE: {}, inject() {},
        IP2Live: { Assets: {}, BgFx: { create: () => ({ update() {}, seed() {} }) }, TextScramble: { create: () => ({ update() {} }) } } });
    const load = name => vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), env, { filename: name });
    for (const name of ['modules/screens/confir-popup.js', 'modules/screens/keyboard-menu.js', 'modules/screens/settings.js',
        'modules/screens/pause-menu.js', 'modules/input_guard.js']) load(name);
    const map = new MapScene(); stack.push(map);
    const open = () => { const menu = new env.window.IP2LiveKeyboardMenu(); stack.push(menu); return menu; };
    const flush = () => { const work = [...timers.values()]; timers.clear(); work.forEach(fn => fn()); };
    return { env, models, stack, input, settings, keyboards, writes, delivered, map, open, load, flush,
        setParser(fn) { parse = fn; } };
}

test('Reset Defaults returns through Settings and mouse Resume to working movement, preserving keyboard model references', async () => {
    const h = harness(), up = h.keyboards.controls.UpHero;
    up.sc = [['i']]; h.keyboards.menuControls.Action.sc = [['f']];
    const pause = new h.env.window.IP2LivePauseMenu(); h.stack.push(pause);
    for (let i = 0; i < 13; i++) pause.update();
    pause._openSettings(); const settings = h.stack.top; settings._executeAction(0); const menu = h.stack.top;
    h.input.keysPressed.add('I'); h.input.lockedKeys.set('I', 90); h.input.mouseLeftPressed = true;
    await menu._resetToDefault();
    assert.equal(h.writes.length, 1, 'one complete settings snapshot is written');
    assert.deepEqual(h.writes[0], Object.fromEntries(defaults.list.map(kb => [kb.id, kb.sc])));
    assert.equal(h.keyboards.controls.UpHero, up); assert.equal(menu.kbItems[0], up);
    assert.equal(h.input.keysPressed.size, 0); assert.equal(h.input.lockedKeys.size, 0); assert.equal(h.input.mouseLeftPressed, false);
    menu.onKeyPressed('ESCAPE'); assert.equal(h.stack.top, settings);
    settings.onKeyPressed('ESCAPE'); for (let i = 0; i < 13; i++) settings.update(); assert.equal(h.stack.top, pause);
    const layout = pause._getLayout(1280, 720); pause.onMouseUp(layout.bx + 20, layout.startY + 20);
    h.flush(); await settle(); for (let i = 0; i < 13; i++) pause.update(); assert.equal(h.stack.top, h.map);
    for (const key of ['W', 'S', 'A', 'D']) {
        h.input.keysPressed.add(key); h.map.onKeyPressed(key); assert.equal(h.delivered.at(-1), key);
        h.env.IP2Live.InputGuard.release({ key: key.toLowerCase() });
    }
});

test('duplicate resets are ignored and a closed menu cannot apply a late defaults response', async () => {
    const h = harness(), waiting = deferred(); let reads = 0;
    h.models[0].sc = [['i']]; h.setParser(() => { reads++; return waiting.promise; });
    const menu = h.open(), reset = menu._resetToDefault();
    assert.equal(menu.busy, true); assert.equal(await menu._resetToDefault(), false); assert.equal(reads, 1);
    menu._goBack(); waiting.resolve(clone(defaults)); assert.equal(await reset, false);
    assert.equal(h.models[0].sc[0][0], 'i'); assert.equal(h.writes.length, 0); assert.equal(menu.listeningMode, false);
});

test('missing or malformed defaults never partially change controls, and resetting can be retried', async () => {
    const h = harness(), menu = h.open(); h.models[0].sc = [['i']];
    h.setParser(async () => { throw new Error('unavailable'); }); assert.equal(await menu._resetToDefault(), false);
    assert.equal(menu.busy, false); assert.equal(h.models[0].sc[0][0], 'i');
    h.setParser(async () => ({ list: defaults.list.slice(0, 4) })); assert.equal(await menu._resetToDefault(), false);
    assert.equal(h.models[0].sc[0][0], 'i'); assert.equal(h.writes.length, 0);
    h.setParser(async () => clone(defaults)); assert.equal(await menu._resetToDefault(), true); assert.equal(h.writes.length, 1);
});

test('settings writes remain ordered across menu instances and their completion cannot clear gameplay input', async () => {
    const h = harness(), pending = [];
    h.settings.save = function () { h.writes.push(clone(Object.fromEntries(this.kb))); const task = deferred(); pending.push(task); return task.promise; };
    const first = h.open(); first.selectedIndex = 0; first._confirmSelection(); first.onKeyPressed('I'); await settle();
    assert.equal(h.writes.length, 1); first._goBack();
    const second = h.open(), reset = second._resetToDefault(); await settle(); assert.equal(h.writes.length, 1);
    h.input.keysPressed.add('W'); pending[0].resolve(); await settle();
    assert.equal(h.writes.length, 2); assert.ok(h.input.keysPressed.has('W'), 'late completion never resets another screen');
    pending[1].resolve(); await reset;
    assert.deepEqual(h.writes[1], Object.fromEntries(defaults.list.map(kb => [kb.id, kb.sc])));
    assert.ok(h.input.keysPressed.has('W')); assert.equal(second.busy, false);
});

test('Escape and Back cancel assignment without changing it, and conflicting navigation keys are rejected', async () => {
    const h = harness(), menu = h.open(); menu.selectedIndex = 0; menu._confirmSelection();
    menu.onKeyPressed('ESCAPE'); assert.equal(menu.listeningMode, false); assert.equal(h.writes.length, 0);
    assert.equal(h.models[0].sc[0][0], 'w'); assert.equal(h.stack.top, menu);
    menu._confirmSelection(); menu.onKeyPressed('S'); assert.equal(menu.listeningMode, true); assert.match(menu.statusLine, /Already used/);
    menu.onKeyPressed('ENTER'); assert.equal(menu.listeningMode, true, 'movement cannot steal the menu action');
    menu.onKeyPressed('I'); await settle(); assert.equal(h.models[0].sc[0][0], 'I'); assert.equal(menu.listeningMode, false);
    const selected = menu.selectedIndex; menu.onKeyPressedAndRepeat('I'); assert.equal(menu.selectedIndex, selected);
    menu.selectedIndex = 1; menu._confirmSelection(); const layout = menu._layout(), back = layout.cells.at(-1);
    menu.onMouseUp((back.x + back.w / 2) * layout.scale, (back.y + back.h / 2) * layout.scale);
    assert.equal(h.stack.top, h.map); assert.equal(menu.listeningMode, false);
});

test('legacy single-key settings writes run sequentially and persistence failure leaves usable live controls', async () => {
    const h = harness(), menu = h.open(); let inFlight = 0, maxFlight = 0;
    h.env.Data.Settings = { async updateKeyboard(id, sc) {
        inFlight++; maxFlight = Math.max(maxFlight, inFlight); await Promise.resolve(); h.writes.push({ id, sc: clone(sc) }); inFlight--;
    } };
    await menu._resetToDefault(); assert.equal(h.writes.length, defaults.list.length); assert.equal(maxFlight, 1);
    h.env.Data.Settings.updateKeyboard = async () => { throw new Error('disk full'); };
    menu.selectedIndex = 0; menu._confirmSelection(); menu.onKeyPressed('I'); await settle();
    assert.equal(menu.busy, false); assert.match(menu.statusLine, /Could not save/); assert.equal(h.models[0].sc[0][0], 'I');
    menu.onKeyPressed('ESCAPE'); h.input.keysPressed.add('I'); h.map.onKeyPressed('I'); assert.equal(h.delivered.at(-1), 'I');
});

if (process.env.IP2LIVE_ENGINE_DIR) test('the installed engine dispatcher handles Reset Defaults, keyboard Resume and movement repeatedly', async () => {
    const h = harness();
    const source = fs.readFileSync(path.join(process.env.IP2LIVE_ENGINE_DIR, 'Common/Inputs.js'), 'utf8')
        .replace(/^import .*;\r?$/gm, '').replace('export class Inputs', 'class Inputs');
    const input = new Function('Data', 'Manager', 'Scene', 'Platform', 'Main', source + '\nreturn Inputs;')(
        h.env.Data, h.env.Manager, h.env.Scene, {}, { loaded: true });
    h.env.Common.Inputs = input;
    const down = key => input.onKeyDown({ key, code: key, repeat: false });
    const up = key => input.onKeyUp({ key, code: key });
    for (let i = 0; i < 20; i++) {
        const pause = new h.env.window.IP2LivePauseMenu(); h.stack.push(pause); for (let j = 0; j < 13; j++) pause.update();
        const menu = h.open(); await menu._resetToDefault(); down('Escape'); up('Escape'); assert.equal(h.stack.top, pause);
        down('Enter'); up('Enter'); h.flush(); await settle(); for (let j = 0; j < 13; j++) pause.update();
        assert.equal(h.stack.top, h.map);
        for (const key of ['w', 's', 'a', 'd']) { down(key); assert.equal(h.delivered.at(-1), key.toUpperCase()); up(key); }
        assert.equal(input.keysPressed.size, 0); assert.equal(input.lockedKeys.size, 0);
    }
});
