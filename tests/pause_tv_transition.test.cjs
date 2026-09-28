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
    assert.equal(h.stack.top,h.root);assert.equal(updates,0,'resume animation must not advance gameplay');
    let resolve;
    const target={loading:false,drawHUD(){},update(){updates++},close(){}};
    h.transition.replace(()=>new Promise(r=>resolve=r));
    h.step(520);h.step(1);await settle();h.step(100);
    assert.equal(h.stack.top.phase,'hold');assert.equal(h.stack.content[0],h.root);
    resolve(target);await settle();h.step(100);h.step(460);
    assert.equal(h.stack.top,target);assert.equal(h.stack.content.length,1,'loaded save replaces old menu/map stack');
    assert.equal(updates,0);assert.equal(h.transition.active,null);
    console.log('Pause and save-load TV transitions passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
