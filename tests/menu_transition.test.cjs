const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '../Plugins/IP2Live_Core/modules/screens', file), 'utf8');

function harness() {
    let now = 0;
    const events = [];
    const images = [];
    const clips = [];
    const flares = [];
    let points;
    let rectangle;
    const ctx = {
        canvas: { width: 1280, height: 720 },
        save() {}, restore() {}, setTransform() {}, beginPath() {},
        rect(...args) { rectangle = args; }, clip() { clips.push(rectangle); },
        moveTo(...args) { points = [args]; }, lineTo(...args) { points.push(args); },
        closePath() {}, fill() { flares.push(points); },
        fillRect() {}, drawImage(...args) { images.push(args); },
    };
    class Base { close() {} }
    const stack = {
        content: [], get top() { return this.content.at(-1); }, get subTop() { return this.content.at(-2); },
        push(scene) { this.content.push(scene); },
        pop() { const scene = this.content.pop(); scene.close(); return scene; },
    };
    const root = { loading: false, drawHUD() {}, update() {}, close() { events.push('source-close'); } };
    stack.push(root);
    const context = vm.createContext({
        console, Date: { now: () => now },
        document: { createElement() { return { width: 0, height: 0, getContext: () => ({ drawImage() {}, clearRect() {} }) }; } },
        Common: { Platform: { ctx, quit: () => events.push('quit') } },
        Scene: { Base, TitleScreen: class extends Base {} },
        Data: { Systems: { soundImpossible: { playSound() {} }, soundConfirmation: { playSound() {} } } },
        Manager: { Stack: stack }, IP2Live: {}, window: {}, Main: { waitForGameData: async () => events.push('data-ready') },
    });
    vm.runInContext(source('menu-transition.js'), context);
    const transition = context.IP2Live.MenuTransition;
    function step(milliseconds, paint = true) {
        now += milliseconds;
        stack.top.update();
        if (paint) stack.top.drawHUD();
    }
    return { context, transition, stack, root, events, images, clips, flares, step };
}
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

async function main() {
    {
        const h = harness(); let calls = 0;
        const target = { loading: true, drawHUD() {}, update() {}, close() { h.events.push('target-close'); } };
        assert.equal(h.transition.open(() => { calls++; return target; }), true);
        const overlay = h.stack.top;
        assert.equal(h.transition.open(() => target), false, 'double-click cannot start another transition');
        assert.equal(overlay.onMouseUp(), true);
        h.step(260);
        const image = h.images.at(-1);
        assert.deepEqual(image.slice(1), [0, 0], 'closing preserves the picture at its original size and position');
        assert.ok(h.clips.at(-1)[3] < 720 && h.clips.at(-1)[3] > 1, 'the visible aperture closes vertically');
        const closingAperture = h.clips.at(-1);
        assert.equal(closingAperture[2], 1280, 'the picture retains its full width while closing');
        assert.equal(closingAperture[0], 0, 'the picture sides stay fixed');
        assert.ok(closingAperture[3] > 360, 'closing starts gently before accelerating into the collapse');
        assert.equal(calls, 0, 'navigation waits until TV is closed');
        const imageCount = h.images.length;
        h.step(180);
        assert.equal(h.images.length, imageCount, 'the picture is fully hidden during the final flare');
        const diamond = h.flares.at(-1);
        assert.equal(diamond.length, 4);
        assert.ok(diamond[0][0] > 0 && diamond[2][0] < 1280, 'only the light tips converge inward');
        assert.deepEqual(diamond.map(point => point[1]), [360, diamond[1][1], 360, diamond[3][1]]);
        assert.ok(diamond[1][1] < 360 && diamond[3][1] > 360, 'the light forms a diamond around the center');
        assert.equal(diamond[1][0], 640);
        assert.equal(diamond[3][0], 640);
        h.step(80, false); h.step(1, false);
        assert.equal(calls, 0, 'black frame must actually be painted before navigating');
        overlay.drawHUD(); h.step(1); await settle();
        assert.equal(calls, 1);
        h.step(200);
        assert.equal(overlay.phase, 'hold', 'loading destination stays covered');
        target.loading = false; h.step(1);
        assert.equal(overlay.phase, 'in');
        assert.deepEqual(h.stack.content, [h.root, target, overlay]);
        h.step(230);
        assert.deepEqual(h.images.at(-1).slice(1), [0, 0], 'opening preserves the picture at its original size and position');
        assert.ok(h.clips.at(-1)[3] < 720 && h.clips.at(-1)[3] > 1, 'the visible aperture opens vertically');
        assert.equal(h.clips.at(-1)[2], 1280, 'opening keeps the picture sides fixed');
        assert.ok(h.clips.at(-1)[3] < 360, 'opening starts gently before snapping fully open');
        h.step(230);
        assert.equal(h.stack.top, target);
        assert.equal(h.transition.active, null);
        assert.equal(h.transition.back(), true);
        h.step(520); h.step(1); h.step(100);
        assert.equal(h.stack.top.phase, 'in');
        h.step(460);
        assert.equal(h.stack.top, h.root);
        assert.deepEqual(h.events, ['target-close'], 'return closes only the departing screen');
    }
    {
        const h = harness(); let finish;
        h.context.IP2Live.GameManager = { prepareForShutdown: () => { h.events.push('checkpoint'); return new Promise(resolve => { finish = resolve; }); } };
        h.transition.quit('test');
        h.step(520); assert.deepEqual(h.events, []);
        h.step(1); await settle();
        assert.deepEqual(h.events, ['checkpoint']);
        h.step(1000); assert.equal(h.stack.top.phase, 'hold');
        finish(); await settle();
        assert.deepEqual(h.events, ['checkpoint', 'quit']);
        assert.equal(h.stack.top.phase, 'hold', 'Quit never plays the opening half');
    }
    {
        const h = harness();
        h.context.console = { error() {} };
        h.transition.open(() => { throw new Error('factory failed'); });
        h.step(520); h.step(1); await settle();
        assert.equal(h.stack.top.phase, 'in', 'failed navigation reveals the original menu');
        h.step(520);
        assert.equal(h.stack.top, h.root);
        assert.equal(h.transition.active, null);
    }
    // Exercise the real title-button handlers for Load, Settings, Credits, and confirmed Quit.
    for (const index of [1, 2, 3, 4]) {
        const h = harness();
        const screen = () => ({ loading: false, update() {}, drawHUD() {}, close() {} });
        h.context.IP2LiveLoadGameMenu = function () { h.events.push('load'); return screen(); };
        h.context.IP2LiveSettingsMenu = function () { h.events.push('settings'); return screen(); };
        h.context.IP2LiveCreditsScene = function () { h.events.push('credits'); return screen(); };
        let confirm;
        h.context.IP2Live.confirPopup = { show: options => { confirm = options.onConfirm; } };
        vm.runInContext(source('main-menu.js'), h.context);
        const title = new h.context.Scene.TitleScreen();
        h.stack.content = [title];
        title.initialize();
        if (index === 1) {
            title._showMenuPage('story');
            title.selectedIndex = 2;
        } else {
            title.selectedIndex = index - 1;
        }
        title._confirmSelection();
        if (index === 4) {
            assert.equal(h.transition.active, null, 'opening Quit confirmation does not shut the TV off');
            confirm();
        }
        assert.equal(h.stack.top.phase, 'out');
        h.step(520); h.step(1); await settle();
        assert.ok(h.events.includes(['', 'load', 'settings', 'credits', 'quit'][index]));
    }
    {
        const h = harness();
        h.context.Common.ScreenResolution = { SCREEN_X: 1280, SCREEN_Y: 720, getScreenX: x => x, getScreenY: y => y };
        h.context.Data.Systems.soundCursor = { playSound() {} };
        h.context.Data.Keyboards = {
            checkActionMenu: key => key === 'enter', checkCancelMenu: key => key === 'escape',
            isKeyEqual: (a, b) => a === b, menuControls: { Up: 'up', Down: 'down' },
        };
        vm.runInContext(source('main-menu.js'), h.context);
        const title = new h.context.Scene.TitleScreen();
        title.initialize(); h.stack.content = [title];
        assert.deepEqual(Array.from(title.menuItems), ['PLAY GAME', 'SETTINGS', 'CREDITS', 'QUIT GAME']);
        title._confirmSelection();
        assert.deepEqual(Array.from(title.menuItems), ['STORY MODE', 'ENDLESS MODE', 'PRACTICE MODE']);
        for (const index of [1, 2]) {
            title.selectedIndex = index; title._confirmSelection();
            assert.equal(title.menuPage, 'play');
            assert.equal(h.stack.top, title, 'unfinished modes stay on the mode menu');
        }
        title.selectedIndex = 0; title._confirmSelection();
        assert.deepEqual(Array.from(title.menuItems), ['NEW STORY', 'AUTOSAVED', 'LOAD STORY']);
        assert.equal(title.hoverIndex, -1);
        assert.deepEqual(Array.from(title.btnProgress), [0, 0, 0]);
        title.selectedIndex = 1; title._confirmSelection();
        assert.equal(title.menuPage, 'story', 'Autosaved remains a placeholder');
        let loadingOptions;
        h.context.IP2Live.LoadingScreen = { show: options => { loadingOptions = options; } };
        h.context.IP2LiveNameInputScreen = class {};
        h.stack.replace = scene => { h.stack.content[h.stack.content.length - 1] = scene; };
        title.selectedIndex = 0; title._confirmSelection();
        assert.equal(loadingOptions.mode, 'push');
        assert.equal(h.stack.top, title, 'New Story waits for the loading screen');
        loadingOptions.onComplete();
        assert.ok(h.stack.top instanceof h.context.IP2LiveNameInputScreen, 'New Story continues into name entry');
        h.stack.content = [title];
        title.onKeyPressedAndRepeat('up');
        assert.equal(title.selectedIndex, title.menuItems.length, 'keyboard wraps to Back at the bottom');
        title.onKeyPressed('enter');
        assert.equal(title.menuPage, 'play');
        const back = title._backButtonLayout();
        const layout = title._menuLayout();
        assert.equal(back.w, layout.btnW);
        assert.equal(back.h, layout.btnH);
        assert.equal(back.y, layout.startY + 3 * (layout.btnH + layout.gap), 'Back follows the mode buttons');
        assert.equal(layout.btnX + layout.btnW / 2, 296, 'the button stack sits slightly left of the menu area center');
        title.onMouseUp(back.x + back.w / 2, back.y + back.h / 2);
        assert.equal(title.menuPage, 'main', 'mouse Back returns to the parent menu');
        title._confirmSelection(); title._confirmSelection();
        title.onKeyPressed('escape');
        assert.equal(title.menuPage, 'play');
        title.onKeyPressed('escape');
        assert.equal(title.menuPage, 'main');
        title.onKeyPressed('escape');
        assert.equal(title.menuPage, 'main', 'Escape stays on the root menu');
    }
    console.log('menu TV transition lifecycle and navigation tests passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
