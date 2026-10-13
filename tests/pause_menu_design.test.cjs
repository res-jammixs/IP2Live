const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '../Plugins/IP2Live_Core');

function harness(preferences = new Map()) {
    const buttons = [], particles = [], texts = [], frames = [];
    const ctx = new Proxy({ canvas: { width: 1280, height: 720 }, filter: 'none',
        createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
        measureText: text => ({ width: text.length * 18 }), fillText: text => texts.push(text),
        arc: (...args) => particles.push(args),
    }, { get: (obj, key) => key in obj ? obj[key] : () => {} });
    const sound = { playSound() {} };
    const context = vm.createContext({ console: { log() {}, warn() {} }, Math, Date, setTimeout, clearTimeout, inject() {},
        window: {}, document: { createElement: () => ({ getContext: () => ctx }) },
        localStorage: { getItem: key => preferences.get(key) || null, setItem: (key, value) => preferences.set(key, value) },
        Common: { Platform: { ctx }, ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 } },
        Core: { Game: { current: { currentMapID: 3, ip2liveGameStates: {} } } },
        Scene: { Base: class { constructor() { this.initialize?.(); } }, Map: class {}, TitleScreen: class {} },
        Data: { Systems: { soundConfirmation: sound, soundCancel: sound, soundCursor: sound, soundImpossible: sound },
            Keyboards: { checkActionMenu: key => key === 'Enter', checkCancelMenu: key => key === 'Escape',
                isKeyEqual: (key, expected) => key === expected, menuControls: { Up: 'Up', Down: 'Down' } } },
        Manager: { Stack: { get top() { return frames.at(-1); }, push: scene => frames.push(scene), pop: () => frames.pop() } },
        IP2Live: { Assets: { abnesLoaded: true, nebulaLoaded: true },
            UI: { drawCyberButton: options => buttons.push(options) },
            BgFx: { create: () => ({}) }, TextScramble: { create: () => ({ update() {}, getText: (_, label) => label }) } },
    });
    const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
    for (const file of ['modules/game_manager.js', 'modules/screens/confir-popup.js', 'modules/screens/settings.js',
        'modules/screens/main-menu.js', 'modules/screens/gameplay-pause.js', 'modules/screens/pause-menu.js']) load(file);
    return { context, ctx, buttons, particles, texts, frames, preferences };
}

// The same renderer supplies textures, frame, fonts and cyber buttons to both
// pause types. Its real hit rectangles remain usable at small/large resolutions.
{
    const h = harness(), ip = h.context.IP2Live;
    h.context.window.IP2LiveBackgroundScreen = class { constructor() { assert.fail('pause must not construct the network-map background'); } };
    const world = new h.context.window.IP2LivePauseMenu(); world.popupProgress = 1;
    ip.GameplayPause.activeScreen = { options: {} };
    const gameplay = new h.context.window.IP2LiveGameplayPauseMenu(); gameplay.fadeIn = 1;
    let frameDraws = 0;
    const drawFrame = h.context.window.IP2LivePauseMenu.prototype._drawPauseContainer;
    h.context.window.IP2LivePauseMenu.prototype._drawPauseContainer = function (...args) { frameDraws++; return drawFrame.apply(this, args); };
    for (const [width, height] of [[1280, 720], [1920, 1080], [800, 600], [640, 360]]) {
        Object.assign(h.ctx.canvas, { width, height });
        h.buttons.length = 0; world.drawHUD();
        const worldResume = h.buttons.find(button => button.label === 'RESUME');
        h.buttons.length = 0; gameplay.drawHUD();
        const gameplayResume = h.buttons.find(button => button.label === 'RESUME');
        for (const key of ['w', 'h', 'scaleX', 'scaleY', 'labelFontSize', 'numberLabel', 'isDanger'])
            assert.equal(gameplayResume[key], worldResume[key], key + ' is shared between pause menus');
        for (const menu of [world, gameplay]) {
            menu.buttonRects.forEach((rect, index) => {
                assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= width && rect.y + rect.h <= height);
                const hit = menu === world ? menu._getButtonAt.bind(menu) : menu._buttonAt.bind(menu);
                assert.equal(hit(rect.x + rect.w / 2, rect.y + rect.h / 2), index);
            });
        }
        assert.equal(h.buttons.find(button => button.label === 'EXIT QUEST').isDanger, true);
        const { SW, SH, scaleX, scaleY } = ip.PauseUI.viewport(h.ctx.canvas);
        const gear = world._settingsButtonLayout(SW, SH), testing = world._gameplayTestButtonLayout(SW, SH);
        assert.ok(world._isSettingsButtonAt((gear.x + gear.w / 2) * scaleX, (gear.y + gear.h / 2) * scaleY));
        assert.ok(world._isGameplayTestButtonAt((testing.x + testing.w / 2) * scaleX, (testing.y + testing.h / 2) * scaleY));
    }
    assert.equal(frameDraws, 8, 'both menus use the same panel renderer');
    assert.ok(h.texts.includes('PAUSED')); assert.ok(!h.texts.includes('GAMEPLAY PAUSED'));
    h.particles.length = 0; ip.PauseUI.drawBackdrop(h.ctx, 1280, 720, 0); const start = h.particles.slice();
    h.particles.length = 0; ip.PauseUI.drawBackdrop(h.ctx, 1280, 720, 240);
    assert.notDeepEqual(h.particles, start, 'background particles drift over time');
    h.context.window.matchMedia = () => ({ matches: true }); delete gameplay._pauseReducedMotion;
    h.particles.length = 0; gameplay.animTick = 20; gameplay.drawHUD(); const still = h.particles.slice();
    h.particles.length = 0; gameplay.animTick = 300; gameplay.drawHUD();
    assert.deepEqual(h.particles, still, 'reduced-motion preference stops background particle drift');
    ip.PracticeMode = { course: { index: 10, entries: Array(11).fill({}) } };
    ip.GameplayPause.activeScreen = { options: { tutorialReplay: true, tutorialCourse: true } };
    const course = new h.context.window.IP2LiveGameplayPauseMenu(); course.fadeIn = 1; course.drawHUD();
    assert.equal(course.menuItems.length, 6);
    course.buttonRects.forEach(r => assert.ok(r.y >= 0 && r.y + r.h <= h.ctx.canvas.height));
    assert.ok(h.buttons.find(button => button.label === 'FINISH WALKTHROUGH').labelFontSize < 19, 'long labels fit within the shared buttons');
}

// Debug visibility is accessible without PVP, persists across launches, and
// cannot leave a hidden PVP action clickable in an already-open Play menu.
{
    const h = harness(), gm = h.context.IP2Live.GameManager;
    const menu = new h.context.Scene.TitleScreen(); menu.initialize(); menu._showMenuPage('play');
    assert.ok(menu.menuItems.includes('PVP'));
    menu.selectedIndex = 3;
    const settings = new h.context.window.IP2LiveSettingsMenu({ popupTransition: true });
    settings.popupProgress = 1; settings.drawHUD();
    const index = settings.menuItems.indexOf('PVP BUTTON / DEBUG'); assert.ok(index >= 0);
    const r = settings.buttonRects[index]; settings.onMouseUp(r.x + r.w / 2, r.y + r.h / 2);
    assert.equal(gm.isPVPButtonEnabled(), false);
    assert.equal(h.preferences.get('ip2live.debug.pvpButton'), 'off');
    menu._openMenu = () => assert.fail('a stale hidden action opened PVP');
    menu._confirmSelection(); assert.ok(!menu.menuItems.includes('PVP')); assert.ok(menu.selectedIndex < menu.menuItems.length);
    const reopened = harness(h.preferences), next = new reopened.context.Scene.TitleScreen(); next.initialize(); next._showMenuPage('play');
    assert.ok(!next.menuItems.includes('PVP'), 'disabled PVP stays hidden after a restart');
    settings.selectedIndex = index; settings.onKeyPressed('Enter');
    menu.update(); assert.ok(menu.menuItems.includes('PVP'), 'keyboard toggle restores PVP without restarting');
    assert.equal(h.preferences.get('ip2live.debug.pvpButton'), 'on');
    gm.enableDeveloperButtons = false;
    const playerSettings = new h.context.window.IP2LiveSettingsMenu();
    assert.ok(!playerSettings.menuItems.includes('PVP BUTTON / DEBUG'), 'the master developer switch hides the debug control');
    const withoutStorage = harness(); withoutStorage.context.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    const fallback = withoutStorage.context.IP2Live.GameManager;
    assert.equal(fallback.isPVPButtonEnabled(), true); assert.equal(fallback.setPVPButtonEnabled(false), false);
}
console.log('pause_menu_design.test.cjs: PASS (shared pause skin, responsive hit targets, particles, reduced motion, persistent PVP toggle and stale-action guard)');
