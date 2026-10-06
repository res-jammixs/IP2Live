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
        clearRect() {}, fillRect() {}, drawImage(...args) { images.push(args); },
    };
    class Base { close() {} }
    const stack = {
        content: [], get top() { return this.content.at(-1); }, get subTop() { return this.content.at(-2); },
        push(scene) { this.content.push(scene); },
        popAll() { while (this.content.length) this.pop(); },
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


(async () => {
    {
        const h = harness();
        let openPause;
        h.context.Scene.Map = class extends h.context.Scene.Base {};
        h.context.inject = (target, name, handler) => {
            if (target === h.context.Scene.Map && name === 'onKeyPressed') openPause = handler;
        };
        h.context.Data.Keyboards = { checkCancelMenu: key => key === 'Escape' };
        h.context.Data.Systems.soundCancel = { playSound() {} };
        h.context.Common.ScreenResolution = { SCREEN_X: 1280, SCREEN_Y: 720 };
        const ctx = h.context.Common.Platform.ctx;
        ctx.createLinearGradient = () => ({ addColorStop() {} });
        ctx.fillText = () => {};
        ctx.stroke = () => {};
        const animation = [];
        const frame = { width: 1280, height: 720 };
        const backdropAlpha = [];
        const drawImage = ctx.drawImage;
        ctx.drawImage = (source, ...args) => {
            if (source === frame) backdropAlpha.push(ctx.globalAlpha);
            drawImage(source, ...args);
        };
        h.context.IP2Live.PopupChrome = {
            capture() { return frame; },
            animate(_ctx, _rect, progress) { animation.push(progress); },
        };
        h.context.IP2Live.Assets = {};
        h.context.IP2Live.BgFx = { create: () => ({ update() {}, drawBg() {}, drawParticles() {} }) };
        h.context.IP2Live.TextScramble = { create: () => ({ update() {} }) };
        vm.runInContext(source('pause-menu.js'), h.context);

        openPause.call({ super() {} }, 'Escape');
        const pause = h.stack.top;
        assert.ok(pause instanceof h.context.window.IP2LivePauseMenu);
        assert.equal(pause.pauseBackdrop, frame, 'world pause keeps the last map frame beneath the popup');
        assert.equal(h.transition.active, null, 'opening world pause does not start a TV transition');
        pause.initialize();
        for (const method of ['_drawPauseTwistBackground', '_drawPauseContainer', '_drawPausedTitle',
            '_drawGameplayTestButton', '_drawPauseSettingsIcon', '_drawButton']) pause[method] = () => {};
        pause.update();
        pause.drawHUD();
        assert.ok(animation[0] > 0 && animation[0] < 1, 'the pause panel uses the shared popup animation');
        assert.ok(backdropAlpha[0] > 0 && backdropAlpha[0] < 1, 'the map fades into the pause backdrop');
        for (let i = 1; i < 12; i++) pause.update();
        assert.equal(pause.popupProgress, 1);
        pause.drawHUD();
        assert.equal(animation[1], 1);
        assert.equal(backdropAlpha[1], 0);
        pause._resume();
        pause.update();
        pause.drawHUD();
        assert.ok(animation[2] < animation[1], 'the popup reverses on resume');
        assert.ok(backdropAlpha[2] > 0, 'the frozen map returns as the pause panel closes');
        for (let i = 0; i < 10; i++) pause.update();
        assert.equal(h.stack.top, pause, 'world remains paused while the popup closes');
        pause.update();
        assert.equal(h.stack.top, h.root);
        assert.equal(h.transition.active, null, 'resuming world pause does not start a TV transition');
    }
    {
        const h=harness(); let constructed=0;
        h.context.inject=()=>{};
        h.context.window.IP2LiveLoadGameMenu=class {
            constructor(options){this.options=options;constructed++;}
            drawHUD(){} update(){} close(){}
        };
        vm.runInContext(source('pause-menu.js'),h.context);
        const pause=Object.create(h.context.window.IP2LivePauseMenu.prototype);
        await pause._saveGameProgress();
        assert.equal(h.stack.top.phase,'out');assert.equal(constructed,0,'Save Story waits for the TV to close');
        h.step(520);h.step(1);await settle();h.step(100);h.step(460);
        assert.equal(constructed,1);assert.equal(h.stack.top.options.saveMode,true);
    }
    const h=harness(); let updates=0;
    const pause={loading:false,drawHUD(){},close(){}};
    h.root.update=()=>updates++;
    h.stack.push(pause);
    assert.equal(h.transition.back({freezeTarget:true}),true);
    h.step(520);h.step(1);h.step(100);h.step(460);
    assert.equal(h.stack.top,h.root);assert.equal(updates,0,'generic menu-back transition must not advance its parent scene');
    let resolve;
    const target={loading:false,drawHUD(){},update(){updates++},close(){}};
    h.transition.replace(()=>new Promise(r=>resolve=r));
    h.step(520);h.step(1);await settle();h.step(100);
    assert.equal(h.stack.top.phase,'hold');assert.equal(h.stack.content[0],h.root);
    resolve(target);await settle();h.step(100);h.step(460);
    assert.equal(h.stack.top,target);assert.equal(h.stack.content.length,1,'loaded save replaces old menu/map stack');
    assert.equal(updates,0);assert.equal(h.transition.active,null);
    console.log('World pause popup and save-load TV transitions passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
