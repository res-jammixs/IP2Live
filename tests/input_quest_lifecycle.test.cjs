const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const root = path.join(__dirname, '../Plugins/IP2Live_Core');

function harness(legacy = false) {
    const listeners = {}, timers = new Map(), delivered = [];
    let serial = 0;
    class Base {
        constructor(initialize) { this.loading = false; if (initialize && this.initialize) this.initialize(); }
        close() {} update() {} drawHUD() {}
    }
    class MapScene extends Base {
        constructor() { super(); this.id = 3; this.heroMapObject = { position: { x: 0, y: 0, z: 0 } }; }
        onKeyPressed(key) { delivered.push(key); }
        onKeyPressedRepeat(key) { delivered.push(key); return true; }
        onKeyPressedAndRepeat(key) { delivered.push(key); return true; }
    }
    const stack = {
        content: [], get top() { return this.content.at(-1); },
        push(scene) { this.content.push(scene); }, pop() { const s = this.content.pop(); s.close(); return s; },
        popAll() { while (this.content.length) this.pop(); }, replace(scene) { this.pop(); this.push(scene); },
    };
    const store = { keysPressed: legacy ? [] : new Set(), lockedKeys: legacy ? [] : new Map() };
    const commands = ['w', 's', 'a', 'd'].map((key, i) => ({ id: i + 1, sc: [[key]] }));
    const addListener = (name, fn) => (listeners[name] || (listeners[name] = [])).push(fn);
    const ctx = { canvas: { width: 1280, height: 720 } };
    const context = vm.createContext({
        console: { log() {}, warn() {} },
        setTimeout(fn) { timers.set(++serial, fn); return serial; }, clearTimeout(id) { timers.delete(id); },
        document: { hidden: false, addEventListener: addListener,
            removeEventListener(name, fn) { listeners[name] = (listeners[name] || []).filter(listener => listener !== fn); } },
        window: { addEventListener: addListener, requestIdleCallback() {} },
        Scene: { Base, Map: MapScene }, Core: { Game: { current: { currentMapID: 3 } } },
        Common: { Inputs: legacy ? undefined : store, Platform: { ctx }, ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 } },
        Manager: { Stack: stack, Events: legacy ? store : {} },
        Data: { Systems: { soundConfirmation: { playSound() {} }, soundCancel: { playSound() {} } },
            Keyboards: { get: id => commands[id - 1], isKeyEqual: (key, command) => command.sc.some(sc => sc[0].toUpperCase() === String(key).toUpperCase()) } },
        IP2Live: { Assets: {}, TextScramble: { create: () => ({ update() {} }) } },
        THREE: {}, inject() {},
    });
    const load = name => vm.runInContext(fs.readFileSync(path.join(root, name), 'utf8'), context, { filename: name });
    const scene = MapScene.current = new MapScene(); stack.push(scene);
    const press = key => { if (legacy) store.keysPressed.push(key); else store.keysPressed.add(key); scene.onKeyPressed(key); };
    const emit = (name, event = {}) => (listeners[name] || []).forEach(fn => fn(event));
    const flush = () => { const work = [...timers.values()]; timers.clear(); work.forEach(fn => fn()); };
    return { context, load, scene, stack, store, delivered, commands, listeners, timers, press, emit, flush };
}

for (const legacy of [false, true]) test(`movement lifecycle with ${legacy ? 'legacy arrays' : 'current engine Sets and Maps'}`, () => {
    const h = harness(legacy); h.load('modules/input_guard.js');
    const keys = () => Array.from(h.store.keysPressed);
    h.press('W'); h.press('D'); assert.deepEqual(h.delivered, ['W']);
    assert.deepEqual(keys(), ['W', 'D'], 'four-way selection preserves the held-key ledger');
    h.emit('keyup', { key: 'w', code: 'KeyW' }); h.scene.onKeyPressedRepeat('D');
    assert.deepEqual(h.delivered, ['W', 'D'], 'held secondary direction takes over after release');
    const pause = { close() {} };
    for (let i = 0; i < 100; i++) {
        h.stack.push(pause); assert.deepEqual(keys(), []);
        h.press('A'); h.stack.pop(); assert.deepEqual(keys(), []);
        h.press('S'); assert.equal(h.delivered.at(-1), 'S');
    }
    if (legacy) h.store.lockedKeys.push('S'); else h.store.lockedKeys.set('S', 90);
    h.emit('blur'); assert.deepEqual(keys(), []); assert.equal(Array.from(h.store.lockedKeys).length, 0);
    h.press('A'); h.context.document.hidden = true; h.emit('visibilitychange'); assert.deepEqual(keys(), []);
    h.context.document.hidden = false; h.press('W'); h.emit('keyup', { key: 'w', code: 'KeyW' });
    assert.deepEqual(keys(), [], 'capture-phase releases work even if a DOM field swallows bubbling');
    h.commands[0].sc = [['i']]; h.press('I'); assert.equal(h.delivered.at(-1), 'I', 'live key remapping is recognized');
    h.context.IP2Live.DialogueManager = { locksMovement: () => true };
    const before = h.delivered.length; h.scene.onKeyPressedRepeat('I'); assert.equal(h.delivered.length, before);
    h.context.IP2Live.DialogueManager.locksMovement = () => false;
    h.scene.onKeyPressedRepeat('I'); assert.equal(h.delivered.length, before + 1);
    const listenerCount = h.listeners.keyup.length; h.load('modules/input_guard.js'); assert.equal(h.listeners.keyup.length, listenerCount);
});

test('pause actions cannot fire twice, change selection in flight, or reopen a closed menu', async () => {
    const h = harness(); h.load('modules/screens/pause-menu.js');
    const pause = new h.context.window.IP2LivePauseMenu(); h.stack.push(pause);
    const actions = []; pause._executeAction = async index => actions.push(index);
    pause._confirmSelection(); pause.selectedIndex = 3; pause._confirmSelection();
    assert.equal(h.timers.size, 1); h.flush(); await Promise.resolve(); await Promise.resolve();
    assert.deepEqual(actions, [0], 'the original selection is captured once');
    await Promise.resolve(); await Promise.resolve();
    pause._confirmSelection(); pause._resume(); h.flush(); await Promise.resolve();
    assert.deepEqual(actions, [0], 'resume cancels a delayed action');
    h.stack.pop(); assert.equal(h.timers.size, 0);
    const next = new h.context.window.IP2LivePauseMenu(); h.stack.push(next);
    next._executeAction = async () => actions.push('stale'); next._confirmSelection(); h.stack.pop();
    h.flush(); await Promise.resolve(); assert.deepEqual(actions, [0], 'closing cancels the timer');
});

test('the real Resume action closes pause after mouse and keyboard activation', async () => {
    for (const mouse of [false, true]) {
        const h = harness(); h.load('modules/input_guard.js'); h.load('modules/screens/pause-menu.js');
        h.context.Data.Keyboards.checkActionMenu = key => key === 'Enter';
        h.context.Data.Keyboards.checkCancelMenu = key => key === 'Escape';
        const pause = new h.context.window.IP2LivePauseMenu(); h.stack.push(pause);
        for (let i = 0; i < 13; i++) pause.update();
        if (mouse) {
            const layout = pause._getLayout(1280, 720);
            pause.onMouseUp(layout.bx + layout.btnW / 2, layout.startY + layout.btnH / 2);
        } else pause.onKeyPressed('Enter');
        h.flush(); for (let i = 0; i < 8; i++) await Promise.resolve();
        assert.equal(pause.closing, true, 'Resume must not reject its own running action');
        for (let i = 0; i < 13; i++) pause.update();
        assert.equal(h.stack.top, h.scene);
        h.press('W'); assert.equal(h.delivered.at(-1), 'W');
    }
});

test('loaded games and replaced maps discard stale dialogue locks and delayed triggers', () => {
    const h = harness(); h.load('modules/dialogue_manager.js');
    const dm = h.context.IP2Live.DialogueManager;
    dm.mapTriggers = {}; dm.registerDialogue('test', { slides: [['Test']], hideQuestPanel: true });
    dm.start('test', { scene: h.scene }); assert.equal(dm.locksMovement(), true);
    h.context.Core.Game.current = { currentMapID: 3 }; h.scene.update();
    assert.equal(dm.locksMovement(), false); assert.equal(dm._questPanelSuppressed, false);
    let calls = 0;
    dm._runTrigger({ id: 'late', delay: 100, action: () => calls++ }, { scene: h.scene, mapId: 3 });
    const replacement = new h.context.Scene.Map(); h.context.Scene.Map.current = replacement; h.stack.replace(replacement);
    h.flush(); assert.equal(calls, 0, 'old map callbacks cannot start a new movement lock');
    dm.start('test', { scene: replacement });
    dm._queueStart('test', { scene: replacement });
    h.context.Core.Game.current = { currentMapID: 3 }; replacement.update();
    assert.equal(dm.isActive(), false); assert.equal(dm._queuedStarts.length, 0);
});

test('world pause and child menus suspend map dialogue listeners without discarding the dialogue', () => {
    const h = harness(); h.load('modules/dialogue_manager.js'); h.load('modules/screens/pause-menu.js');
    const dm = h.context.IP2Live.DialogueManager;
    dm.registerDialogue('test', { slides: [['Test']] }); dm.start('test', { scene: h.scene });
    const active = dm._active, pause = new h.context.window.IP2LivePauseMenu(); h.stack.push(pause);
    const event = { code: 'Enter', preventDefault() { assert.fail('hidden dialogue swallowed menu input'); }, stopPropagation() {} };
    dm._onKey(event); dm._onClick(event); assert.equal(dm._active, active);
    h.stack.push({ close() {} }); dm._onKey(event); dm._onClick(event);
    h.stack.pop(); h.stack.pop(); assert.equal(dm._teachingSuspended(), false); assert.equal(dm._active, active);
});

test('tutorial capture ignores pause/settings, defers its delayed step, and never treats another floor as the tutorial', () => {
    const h = harness(); h.load('modules/tutorial.js'); const tutorial = h.context.IP2Live.Tutorial;
    h.scene.id = 1; h.context.Core.Game.current.currentMapID = 1;
    tutorial.activate({ skipIntro: true, scene: h.scene });
    tutorial._onKey({ code: 'KeyW' });
    h.stack.push({ close() {} }); h.stack.push({ close() {} });
    tutorial._onKey({ code: 'KeyS', preventDefault() { assert.fail('background tutorial blocked a menu key'); }, stopPropagation() {} });
    assert.equal(tutorial.pressedKeys.has('KeyS'), false, 'rebinding keys cannot complete the background lesson');
    tutorial.phase = tutorial.PHASE.INTRO;
    tutorial._onKey({ code: 'KeyW', preventDefault() { assert.fail('intro captured a menu key'); }, stopPropagation() {} });
    tutorial.phase = tutorial.PHASE.MOVE_FB; h.stack.pop(); h.stack.pop();
    tutorial._onKey({ code: 'KeyS' }); assert.ok(tutorial._stepTimeout);
    h.stack.push({ close() {} }); h.flush(); assert.equal(tutorial.phase, tutorial.PHASE.MOVE_FB);
    assert.ok(tutorial._pendingStep, 'the next lesson waits while pause is open');
    h.stack.pop(); h.scene.update(); assert.equal(tutorial.phase, tutorial.PHASE.MOVE_LR);
    assert.equal(tutorial._pendingStep, null);
    assert.equal(tutorial._isTutorialMap({ id: 3 }), false, 'active tutorial state cannot claim every floor');
    tutorial._onKey({ code: 'KeyA' }); tutorial._onKey({ code: 'KeyD' });
    h.context.Core.Game.current = { currentMapID: 3 }; h.flush();
    assert.equal(tutorial.phase, tutorial.PHASE.MOVE_LR, 'an old delayed callback cannot advance a replacement game');
});

test('the shared numbered-save/autosave restore discards old tutorial capture and held inputs', () => {
    const h = harness(); h.load('modules/input_guard.js'); h.load('modules/dialogue_manager.js');
    h.load('modules/tutorial.js'); h.load('modules/game_manager.js');
    const tutorial = h.context.IP2Live.Tutorial, gm = h.context.IP2Live.GameManager;
    h.scene.id = 1; h.context.Core.Game.current.currentMapID = 1;
    tutorial.activate({ scene: h.scene }); assert.equal(tutorial._dialogueLocksMovement(), true);
    tutorial._scheduleNextStep(); h.store.keysPressed.add('W'); h.store.lockedKeys.set('W', 90);
    const restored = { currentMapID: 3, infiltratorName: 'NOVA', hero: { position: { x: 4, y: 0, z: 8 } } };
    const snapshot = { schemaVersion: 2, mapId: 3, profileName: 'NOVA', heroPosition: restored.hero.position, gameStates: {} };
    h.context.Core.Game.current = restored; gm.restoreProgressFromSnapshot(snapshot, restored);
    assert.equal(tutorial.isActive, false); assert.equal(tutorial._keyRef, null); assert.equal(tutorial._stepTimeout, null);
    assert.equal(h.context.IP2Live.DialogueManager.locksMovement(), false);
    assert.equal(h.store.keysPressed.size, 0); assert.equal(h.store.lockedKeys.size, 0);
    const scene = new h.context.Scene.Map(); h.context.Scene.Map.current = scene; h.stack.replace(scene);
    h.store.keysPressed.add('S'); scene.onKeyPressed('S'); assert.equal(h.delivered.at(-1), 'S');
});

test('quest exit guide recovers after restore; background transitions cannot complete or reset it', () => {
    const h = harness(); h.load('modules/quest_manager.js');
    const qm = h.context.IP2Live.QuestManager;
    let teleports = 0;
    qm.registerQuest({ id: 'exit', resetOnMapEnter: true, objectives: [{ id: 'reach_exit', targetTile: { x: 10, z: 10 }, onComplete: () => teleports++ }] });
    qm.registerMapQuests(3, ['exit'], { autoStart: true, showFinished: false });
    qm.ensureMapQuestFor(3, h.scene);
    const snapshot = qm.snapshotProgress(); snapshot.visible = false; snapshot.guideActive = false; snapshot.allowCompletion = false;
    snapshot.activeObjectiveId = 'obsolete-objective';
    qm.restoreProgress(snapshot); qm.suppressedByDialogue = true; qm.update({ scene: h.scene });
    assert.equal(qm.activeObjectiveId, 'reach_exit'); assert.equal(qm.visible, true);
    assert.equal(qm.guideActive, true); assert.equal(qm.allowCompletion, true); assert.equal(qm.suppressedByDialogue, false);
    qm._isObjectiveComplete = () => true;
    h.stack.push({ close() {} }); qm.update({ scene: h.scene });
    assert.equal(teleports, 0, 'painting a transition background cannot teleport the player');
    h.stack.pop(); qm.update({ scene: h.scene }); assert.equal(teleports, 1);
    qm.update({ scene: h.scene }); assert.equal(teleports, 1, 'completed exits are not reopened by recovery');
    qm.registerQuest({ id: 'manual', objectives: [{ id: 'hidden' }] });
    qm.registerMapQuests(3, ['manual'], { autoStart: false }); qm.startQuest('manual', { visible: false }); qm.update({ scene: h.scene });
    assert.equal(qm.visible, false, 'manual tutorial visibility is preserved');
    let registrations = 0;
    h.context.IP2Live.MapManager = { registerStageQuests() { registrations++; return true; } };
    for (let i = 0; i < 100; i++) qm.update({ scene: h.scene });
    assert.equal(registrations, 1, 'floor registration must not run on every frame');
    h.context.IP2Live.GameManager = { flowConfig: {} }; qm.update({ scene: h.scene });
    assert.equal(registrations, 2, 'late GameManager initialization rebuilds the catalog');
});

// Optional verification against the actual installed engine; no engine source
// is bundled into this repository. Set IP2LIVE_ENGINE_DIR to its Scripts folder.
if (process.env.IP2LIVE_ENGINE_DIR) test('installed engine input dispatcher survives rapid pause and focus changes', () => {
    const h = harness();
    const source = fs.readFileSync(path.join(process.env.IP2LIVE_ENGINE_DIR, 'Common/Inputs.js'), 'utf8')
        .replace(/^import .*;\r?$/gm, '').replace('export class Inputs', 'class Inputs');
    h.stack.isLoading = () => false;
    for (const method of ['onKeyPressed', 'onKeyPressedAndRepeat', 'onKeyReleased'])
        h.stack[method] = key => { if (h.stack.top[method]) h.stack.top[method](key); };
    const inputs = new Function('Data', 'Manager', 'Scene', 'Platform', 'Main', source + '\nreturn Inputs;')(
        h.context.Data, h.context.Manager, h.context.Scene, {}, { loaded: true });
    h.context.Common.Inputs = inputs; h.load('modules/input_guard.js');
    const down = key => inputs.onKeyDown({ key, code: 'Key' + key, repeat: false });
    const up = key => inputs.onKeyUp({ key, code: 'Key' + key });
    for (let i = 0; i < 100; i++) {
        down('W'); down('D'); assert.deepEqual([...inputs.keysPressed], ['W', 'D']);
        up('W'); h.scene.onKeyPressedRepeat('D'); assert.equal(h.delivered.at(-1), 'D');
        h.stack.push({ close() {} }); assert.equal(inputs.keysPressed.size, 0);
        down('A'); h.stack.pop(); assert.equal(inputs.keysPressed.size, 0);
        down('S'); assert.equal(h.delivered.at(-1), 'S');
        inputs.lockedKeys.set('S', 90); h.emit('blur');
        assert.equal(inputs.keysPressed.size, 0); assert.equal(inputs.lockedKeys.size, 0);
    }
});

test('quest marker reattaches to a retained scene and disposes shared resources exactly once', () => {
    const h = harness(), resources = [];
    const vector = () => ({ set() {} });
    class Group {
        constructor() { this.children = []; this.position = vector(); this.rotation = vector(); this.scale = vector(); }
        add(node) { if (node.parent) node.parent.remove(node); this.children.push(node); node.parent = this; }
        remove(node) { this.children = this.children.filter(child => child !== node); node.parent = null; }
        traverse(fn) { fn(this); for (const node of this.children) node.traverse(fn); }
    }
    class Resource { constructor() { this.disposals = 0; resources.push(this); } dispose() { this.disposals++; } }
    class Mesh extends Group { constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; } }
    Object.assign(h.context.THREE, { Group, Mesh, MeshBasicMaterial: Resource, CylinderGeometry: Resource, TorusGeometry: Resource, ConeGeometry: Resource, SphereGeometry: Resource });
    h.load('assets/quest_arrow.js');
    const guide = h.context.IP2Live.QuestArrowAsset.create(), scene = new Group();
    guide.setObjective({ id: 'exit', targetTile: { x: 5, z: 5 } });
    const context = { threeScene: scene, hero: h.scene.heroMapObject, guideActive: true };
    guide.update(context); const group = guide._guideGroup, count = resources.length;
    scene.remove(group); group.visible = false; guide.update(context);
    assert.equal(group.parent, scene); assert.equal(group.visible, true); assert.equal(resources.length, count, 'reattachment reuses resources');
    guide.clear(); assert.equal(scene.children.length, 0);
    assert.ok(resources.every(resource => resource.disposals === 1), 'shared dot geometry and materials dispose once');
    guide.clear(); assert.ok(resources.every(resource => resource.disposals === 1), 'cleanup is idempotent');
});
