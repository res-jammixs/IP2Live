const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..', 'Plugins', 'IP2Live_Core', 'modules', 'screens');

function harness(width = 1280, height = 720) {
    const text = [];
    const rectangles = [];
    const states = [];
    const clock = { now: 0 };
    const frames = [{ id: 'map', draw3D() { events.push('map-3d'); }, drawHUD() { events.push('map-hud'); } }];
    const events = [];
    const gradient = () => ({ addColorStop() {} });
    const ctx = {
        canvas: { width, height }, font: '16px sans-serif', globalAlpha: 1, letterSpacing: '0px',
        save() { states.push({ font: this.font, globalAlpha: this.globalAlpha, fillStyle: this.fillStyle, letterSpacing: this.letterSpacing, textAlign: this.textAlign }); },
        restore() { Object.assign(this, states.pop()); }, scale() {}, translate() {}, rotate() {},
        beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
        bezierCurveTo() { events.push('hood-curve'); }, quadraticCurveTo() {},
        fill() {}, stroke() {}, rect() {}, clip() {},
        fillRect(x, y, w, h) { rectangles.push({ x, y, w, h, alpha: this.globalAlpha, color: this.fillStyle }); },
        createLinearGradient: gradient, createRadialGradient: gradient,
        fillText(value, x, y) {
            if (this.globalAlpha > 0) text.push({ value, x, y, font: this.font, alpha: this.globalAlpha, tracking: this.letterSpacing, color: this.fillStyle });
        },
        measureText(value) {
            return { width: String(value).length * (parseFloat(this.font.replace('bold ', '')) || 16) * 0.55 };
        },
    };
    class Game {
        constructor() { this.infiltratorName = ''; this.initialized = false; }
        initializeDefault() { this.initialized = true; events.push('game-initialized'); }
    }
    Game.current = Object.assign(new Game(), { infiltratorName: 'NOVA' });
    class LoadGameMenu { constructor() { this.id = 'load-game'; } }
    const context = {
        Date: class extends Date { static now() { return clock.now; } },
        Common: { ScreenResolution: { SCREEN_X: 1280, SCREEN_Y: 720 }, Platform: { ctx } },
        Core: { Game },
        Data: {
            Keyboards: {
                menuControls: { Left: 'left', Right: 'right', Up: 'up', Down: 'down' },
                checkActionMenu(key) { return key === 'action' || (key && key.command === 'action'); },
                checkCancelMenu(key) { return key === 'cancel' || (key && key.command === 'cancel'); },
                isKeyEqual(key, control) { return key === control || (key && key.command === control); },
            },
            Systems: {
                soundCursor: { playSound() { events.push('cursor'); } },
                soundConfirmation: { playSound() { events.push('confirm'); } },
            },
        },
        // Match RPG Paper Maker's lifecycle: Base invokes the virtual load()
        // before the derived constructor body has run.
        Scene: { Base: class {
            constructor(loading = true) {
                if (this.initialize) this.initialize();
                if (loading && this.load) {
                    this.loading = true;
                    const pending = this.load();
                    if (pending && typeof pending.catch === 'function') pending.catch((error) => { throw error; });
                }
            }
        } },
        Manager: { Stack: {
            get top() { return frames.at(-1); },
            push(s) { frames.push(s); },
            pop() { events.push('pop'); return frames.pop(); },
            popAll() { events.push('pop-all'); frames.length = 0; },
            pushTitleScreen() { events.push('push-title'); frames.push({ id: 'title' }); },
            clearHUD() { events.push('clear-hud'); },
        } },
        IP2Live: {
            Assets: { nebulaLoaded: true, oxaniumMediumLoaded: true, astronomousLoaded: true },
            QuestManager: { hideQuest() { events.push('hide-quest'); } },
            QuestMinimap: { destroy() { events.push('destroy-minimap'); } },
            DialogueManager: { resetTransitionState() { events.push('reset-dialogue'); } },
            GameManager: { startNewGameFlow(name) { events.push('restart:' + name); return true; } },
            MusicManager: {
                ZONE: { MAIN_MENU: 'title' },
                play(zone) { events.push('music:' + zone); },
                fadeOutForTransition() { events.push('music-fade'); },
            },
        },
        window: { IP2LiveLoadGameMenu: LoadGameMenu },
    };
    vm.createContext(context);
    for (const file of ['ar-diagnostic-rewind.js', 'neural-life-force-game-over.js']) {
        vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
    }
    return { context, frames, events, text, rectangles, ctx, clock };
}

function actualPoint(screen, rect, ctx) {
    const layout = screen._layout();
    return {
        x: (rect.x + rect.w / 2) * ctx.canvas.width / layout.sw,
        y: (rect.y + rect.h / 2) * ctx.canvas.height / layout.sh,
    };
}

function clickButton(screen, ctx, index) {
    const point = actualPoint(screen, screen._layout().buttons[index], ctx);
    screen.onMouseMove(point.x, point.y);
    screen.onMouseDown(point.x, point.y);
    screen.onMouseUp(point.x, point.y);
}

function advance(screen, ticks) {
    for (let i = 0; i < ticks; i++) screen.update();
}

function assertKeyboardIgnored(screen) {
    const before = [screen.tick, screen.selectedIndex, screen.scrollOffset, screen._warningView, screen._exitTick];
    for (const key of ['Escape', 'Tab', 'ArrowRight', 'ArrowLeft', 'PageDown', 'cancel', 'action', { command: 'action' }, { command: 'cancel' }, { command: 'right' }]) {
        screen.onKeyPressed(key);
        screen.onKeyPressedAndRepeat(key);
    }
    assert.deepEqual([screen.tick, screen.selectedIndex, screen.scrollOffset, screen._warningView, screen._exitTick], before, 'keyboard cannot skip, select, dismiss or navigate the warning');
}

for (const [width, height] of [[1280, 720], [1920, 1080], [960, 540]]) {
    const { context, frames, text, ctx } = harness(width, height);
    const choices = [];
    const Screen = context.IP2Live.ARDiagnosticRewind;
    Screen.show({
        title: 'APEX SECURITY ALERT', gameplayLabel: 'CIDR Quarantine Matrix', statusLabel: 'Stage 3 Level 3', failureCount: 15,
        tutorialSection: true,
        lines: ["We've made repeated mistakes in this APEX security level. If we keep making mistakes, APEX could detect us. Review this gameplay's tutorial, or continue and try again."],
        actions: [{ id: 'tutorial', label: 'See Tutorial Again', onSelect: () => choices.push('tutorial') }, { id: 'continue', label: 'Continue', onSelect: () => choices.push('continue') }],
    });
    let screen = frames.at(-1);
    const timing = screen._warningTiming();
    const hiddenPoint = actualPoint(screen, screen._layout().buttons[0], ctx);
    screen.onMouseDown(hiddenPoint.x, hiddenPoint.y); screen.onMouseUp(hiddenPoint.x, hiddenPoint.y);
    assert.deepEqual(choices, [], 'hidden actions cannot activate');
    screen.tick = timing.textStart + 30;
    screen.drawHUD();
    assertKeyboardIgnored(screen);
    assert.ok(text.some(t => t.value === timing.rows[0].slice(0, 15)), 'first line types one character every two ticks');
    assert.ok(!text.some(t => t.value === timing.rows[1]), 'later wrapped lines remain hidden');
    assert.ok(!text.some(t => t.value === 'See Tutorial Again'));
    text.length = 0;
    screen.tick = timing.rowStarts[1] + 30;
    screen.drawHUD();
    const firstLine = text.find(t => t.value === timing.rows[0]);
    const secondLine = text.find(t => t.value === timing.rows[1].slice(0, 15));
    assert.ok(firstLine && secondLine, 'second line types after the first has finished');
    for (const row of timing.rows.slice(2)) assert.ok(!text.some(t => t.value === row), 'subsequent lines cannot appear early');
    screen.tick = timing.buttonsStart + 30;
    text.length = 0;
    screen.drawHUD();
    assert.ok(text.some(t => t.value === 'See Tutorial Again'));
    assert.ok(!text.some(t => t.value === 'Continue'), 'second action appears after the first');
    screen.onKeyPressed('action');
    assert.deepEqual(choices, [], 'keyboard does not select an option');
    assert.equal(screen.tick, timing.buttonsStart + 30, 'keyboard does not skip animation');
    screen.tick = timing.ready;
    screen.drawHUD();
    assert.ok(!text.some(t => /ARROWS|TAB TO|ENTER|ESC TO|PAGE UP/.test(t.value)), 'no keyboard instructions are displayed');
    assertKeyboardIgnored(screen);
    assert.ok(!text.some(t => /FAILED RUNS|NEURAL DECK|CIDR Quarantine Matrix|Stage 3 Level 3/.test(t.value)), 'extra header labels are removed');
    assert.ok(text.some((t) => t.value === 'See Tutorial Again'));
    assert.equal(screen.maxScroll, 0, 'the standard warning fits without scrolling');
    screen.onMouseDown(1, 1); screen.onMouseUp(1, 1);
    assert.equal(frames.length, 2, 'background clicks cannot dismiss the warning');
    const point = actualPoint(screen, screen._layout().buttons[1], ctx);
    screen.onMouseMove({ offsetX: point.x, offsetY: point.y });
    assert.equal(screen.selectedIndex, 1);
    screen.onMouseDown(point.x, point.y); screen.onMouseUp(point.x, point.y);
    screen.onKeyPressed('action');
    assert.deepEqual(choices, [], 'Continue opens confirmation without completing');
    advance(screen, 49);
    assert.equal(screen._warningView, 'confirm');
    screen.tick = screen._warningTiming().ready;
    clickButton(screen, ctx, 0);
    advance(screen, 55);
    assert.deepEqual(choices, ['continue'], 'scaled pointer callbacks fire exactly once');
    assert.equal(frames.length, 1);

    Screen.show({ lines: ['Feedback'], onComplete: () => choices.push('legacy') });
    screen = frames.at(-1); screen.drawHUD(); screen.onKeyPressed('cancel');
    assert.equal(choices.at(-1), 'legacy', 'configured cancel control preserves existing callbacks');

    Screen.show({ actions: [{ id: 'tutorial', label: 'Tutorial', onSelect: () => choices.push('tutorial') }, { id: 'continue', label: 'Continue' }] });
    screen = frames.at(-1);
    screen.onKeyPressedAndRepeat('right'); assert.equal(screen.selectedIndex, 1);
    screen.onKeyPressedAndRepeat('left'); assert.equal(screen.selectedIndex, 0);
    screen.onKeyPressed('action'); assert.equal(choices.at(-1), 'tutorial');

    Screen.show({ lines: ['Very long feedback '.repeat(150)] });
    screen = frames.at(-1); screen.drawHUD();
    assert.ok(screen.maxScroll > 0);
    screen.onKeyPressed('PageDown'); assert.equal(screen.scrollOffset, 100);
    screen.onKeyPressed('PageUp'); assert.equal(screen.scrollOffset, 0);
    for (const line of screen._wrap(ctx, 'x'.repeat(400), 200)) assert.ok(ctx.measureText(line).width <= 200);
    screen.onKeyPressed('cancel');

    context.IP2Live.NeuralLifeForceGameOver.show({ lifeForce: 0 });
    screen = frames.at(-1);
    text.length = 0;
    const gameOverTiming = screen._messageTiming();
    screen.transitionTick = 200; screen.drawHUD();
    assert.ok(text.some(t => t.value === 'GAME OVER'), 'main header precedes the message');
    assert.ok(!text.some(t => t.value.startsWith('The security')));
    screen.transitionTick = gameOverTiming.textStart + 30; screen.drawHUD();
    assert.ok(text.some(t => t.value === 'The security la'), 'message types progressively under the header');
    screen.transitionTick = gameOverTiming.textEnd; screen.drawHUD();
    assert.ok(text.some(t => t.value === 'THANK YOU FOR YOUR HELP, INFILTRATOR.' && t.font.startsWith('bold ') && t.color === '#FFF0F5'), 'thank-you line is emphasized');
    assert.ok(text.some(t => t.value === 'it was not enough' && t.font.startsWith('bold ') && t.color === '#FFF0F5'), 'key phrase is emphasized');
    text.length = 0;
    screen.transitionTick = gameOverTiming.buttonsStart + 30; screen.drawHUD();
    assert.ok(text.some(t => t.value === 'RETURN TO MAIN MENU' && t.alpha === 0.5), 'first recovery action fades in');
    assert.ok(!text.some(t => t.value === 'LOAD GAME'), 'recovery buttons appear in sequence');
    screen.transitionTick = gameOverTiming.ready; screen.drawHUD();
    assert.ok(text.some((t) => t.value === 'GAME OVER'));
    assert.ok(text.some((t) => t.value === 'RETURN TO MAIN MENU'));
    assert.ok(text.some((t) => t.value === 'RESTART STORY'));
    assert.ok(text.some((t) => t.value === 'LOAD GAME'));
    assert.ok(text.some((t) => t.value === 'GAME OVER' && /Astronomous/.test(t.font)));
    assert.ok(!text.some(t => /APEX LOCKDOWN|NEURAL LINK TERMINATED|ARROWS|ENTER TO|SKIP TRANSMISSION/.test(t.value)), 'obsolete captions are removed');
    assert.ok(text.some(t => t.value === 'CHOOSE A RECOVERY PROTOCOL' && t.y < screen._layout().buttons[0].y));
    const mainPoint = actualPoint(screen, screen._layout().buttons[0], ctx);
    screen.onMouseDown(mainPoint.x, mainPoint.y); screen.onMouseUp(mainPoint.x, mainPoint.y);
    assert.equal(frames.at(-1), screen, 'navigation waits for fade-out');
    advance(screen, 61);
    assert.equal(frames.at(-1).id, 'title');
}

for (const actionId of ['tutorial', 'continue']) {
    const { context, frames, events, text, rectangles, ctx } = harness();
    const choices = [];
    context.IP2Live.ARDiagnosticRewind.show({
        tutorialSection: true, title: 'APEX SECURITY ALERT', lines: ['First line.\nSecond line.\nThird line.'],
        actions: ['tutorial', 'continue'].map(id => ({ id, label: id, onSelect: () => choices.push(id) })),
        onComplete: id => choices.push('complete:' + id),
    });
    const screen = frames.at(-1);
    screen.tick = 36; screen.draw3D(); screen.drawHUD();
    assert.ok(events.includes('map-3d') && events.includes('map-hud'), 'incoming scene remains visible during blackout');
    assert.ok(rectangles.some(r => r.color === '#000000' && r.alpha === 0.5), 'entry slowly fades to black');
    assert.equal(text.length, 0, 'content stays hidden during blackout');
    text.length = 0; screen.tick = 156; screen.drawHUD();
    assert.equal(text.length, 0, 'background arrives before header');
    screen.tick = 209; screen.drawHUD();
    assert.ok(text.some(t => t.value === 'APEX SECURITY ALERT' && /Astronomous/.test(t.font) && t.alpha < 1));
    assert.ok(!text.some(t => t.value === 'First line.'), 'header precedes body');
    screen.tick = screen._warningTiming().ready;
    clickButton(screen, ctx, actionId === 'tutorial' ? 0 : 1);
    if (actionId === 'continue') {
        advance(screen, 49);
        screen.tick = screen._warningTiming().ready;
        clickButton(screen, ctx, 0);
    }
    for (let i = 0; i < 27; i++) screen.update();
    rectangles.length = 0; screen.drawHUD();
    assert.equal(rectangles.at(-1).color, '#000000');
    assert.equal(rectangles.at(-1).alpha, 0.5, 'exit passes through a partial fade');
    assert.deepEqual(choices, []);
    screen.onKeyPressed('cancel'); screen.onKeyPressed('action');
    for (let i = 0; i < 27; i++) screen.update();
    rectangles.length = 0; screen.drawHUD();
    assert.equal(rectangles.at(-1).alpha, 1, 'full black frame precedes callbacks');
    assert.equal(frames.at(-1), screen);
    screen.update(); screen.update();
    assert.deepEqual(choices, [actionId, 'complete:' + actionId], 'each exit completes once despite repeated input');
    assert.equal(events.filter(e => e === 'confirm').length, actionId === 'continue' ? 2 : 1);
    assert.equal(frames.length, 1);
}

{
    const { context, frames, text, ctx } = harness(1920, 1080);
    const choices = [];
    context.IP2Live.ARDiagnosticRewind.show({
        tutorialSection: true, lines: ['Review this tutorial before trying again.\nSecond line stays hidden.'],
        actions: [{ id: 'tutorial', label: 'Replay Tutorial', onSelect: () => choices.push('tutorial') },
            { id: 'continue', label: 'Continue', onSelect: () => choices.push('continue') }],
    });
    const screen = frames.at(-1);
    screen.tick = screen._warningTiming().ready;
    clickButton(screen, ctx, 1);
    advance(screen, 24);
    text.length = 0; screen.drawHUD();
    assert.ok(text.some(t => t.value === 'Continue' && t.alpha === 0.5), 'original buttons fade out');
    assert.ok(text.some(t => t.value === screen.lines[0].split('\n')[0] && t.alpha < 0.5), 'message fades with buttons');
    assert.ok(!text.some(t => t.value.startsWith('Continue without')), 'confirmation waits for outgoing content');
    clickButton(screen, ctx, 1);
    assertKeyboardIgnored(screen);
    advance(screen, 25);
    assert.equal(screen._warningView, 'confirm');
    assert.deepEqual(choices, [], 'opening confirmation does not continue');
    let timing = screen._warningTiming();
    screen.tick = timing.textStart + 2;
    text.length = 0; screen.drawHUD();
    assert.ok(text.some(t => t.value === 'C'), 'confirmation types from the first character');
    assert.ok(!text.some(t => t.value === 'Confirm' || t.value === 'Go Back'));
    screen.tick = timing.buttonsStart + 30;
    text.length = 0; screen.drawHUD();
    assert.ok(text.some(t => t.value === 'Confirm' && t.alpha === 0.5));
    assert.ok(!text.some(t => t.value === 'Go Back'));
    screen.tick += 42;
    text.length = 0; screen.drawHUD();
    assert.ok(text.some(t => t.value === 'Go Back' && t.alpha === 0.5));
    screen.tick = timing.ready;
    assertKeyboardIgnored(screen);
    clickButton(screen, ctx, 1);
    advance(screen, 24);
    text.length = 0; screen.drawHUD();
    assert.ok(text.some(t => t.value === 'Go Back' && t.alpha === 0.5), 'confirmation fades out when returning');
    advance(screen, 25);
    assert.equal(screen._warningView, 'offer');
    assert.deepEqual(choices, [], 'Go Back never continues or launches a tutorial');
    timing = screen._warningTiming();
    text.length = 0; screen.drawHUD();
    for (const row of timing.rows) assert.ok(text.some(t => t.value === row), 'Go Back restores every complete line without retyping');
    assert.ok(!text.some(t => t.value === 'Replay Tutorial'));
    screen.tick = timing.buttonsStart + 30;
    text.length = 0; screen.drawHUD();
    assert.ok(text.some(t => t.value === 'Replay Tutorial' && t.alpha === 0.5), 'original choices fade in again');
    screen.tick = timing.ready;
    clickButton(screen, ctx, 0);
    advance(screen, 55);
    assert.deepEqual(choices, ['tutorial'], 'replay still works after returning from confirmation');
}

{
    const { context, frames, events } = harness();
    context.IP2Live.NeuralLifeForceGameOver.show({ lifeForce: 0 });
    const screen = frames.at(-1);
    screen.transitionTick = screen._messageTiming().textStart + 10;
    screen.onKeyPressed({ command: 'action' });
    assert.equal(screen._warningRevealTick, screen.transitionTick, 'first action completes typing');
    assert.equal(screen._menuVisible(), false, 'finishing typing retains the button fade');
    screen.transitionTick = screen._messageTiming().ready;
    screen.onKeyPressedAndRepeat({ command: 'right' });
    screen.onKeyPressed({ command: 'action' });
    assert.ok(!events.includes('game-initialized'), 'restart waits for fade-out');
    advance(screen, 61);
    assert.ok(events.includes('game-initialized'));
    assert.ok(events.includes('restart:NOVA'));
    assert.equal(context.Core.Game.current.initialized, true);
}

{
    const { context, frames, ctx } = harness(1920, 1080);
    context.IP2Live.NeuralLifeForceGameOver.show({ lifeForce: 0 });
    const screen = frames.at(-1);
    screen.transitionTick = screen._messageTiming().ready;
    const loadPoint = actualPoint(screen, screen._layout().buttons[2], ctx);
    screen.onMouseDown(loadPoint.x, loadPoint.y); screen.onMouseUp(loadPoint.x, loadPoint.y);
    advance(screen, 61);
    assert.equal(frames.at(-1).id, 'load-game');
    assert.equal(frames.at(-2).id, 'title', 'load menu retains the title as its back destination');
}

for (const view of ['offer', 'confirm']) {
    const { context, frames, text, ctx, clock } = harness();
    context.IP2Live.ARDiagnosticRewind.show({
        tutorialSection: true,
        lines: ["We've made repeated mistakes in this APEX security level. If we keep making mistakes, APEX could detect us. Review this gameplay's tutorial, or continue and try again."],
    });
    const screen = frames.at(-1);
    screen._warningView = view;
    const timing = screen._warningTiming();
    screen.tick = timing.ready;
    screen.drawHUD();
    const rendered = timing.rows.map(row => text.find(t => t.value === row));
    assert.ok(rendered.every(Boolean));
    const midpoint = (rendered[0].y - timing.fontSize + rendered.at(-1).y) / 2;
    assert.equal(midpoint, 360, 'message block is vertically centered in both views');
    assert.ok(rendered.every(t => t.x === 640 - 1.1 && t.tracking === '0.65px'), 'both messages share centered alignment and subtle tracking');
    assert.equal(ctx.letterSpacing, '0px', 'body tracking does not leak into the header or buttons');
    assert.equal(screen._wordGlitch, undefined);
    clock.now = 1999; screen.drawHUD();
    assert.equal(screen._wordGlitch, undefined, 'no glitch before two seconds');
    clock.now = 2000; screen.drawHUD();
    const first = screen._wordGlitch;
    assert.ok(first && first.parts.every(part => timing.rows[part.rowIndex].includes(part.text)), 'glitch targets actual message text');
    assert.equal(first.parts.map(part => part.text).join(' ').split(/\s+/).length, 3, 'glitch spans three consecutive words');
    clock.now = 2439; screen.drawHUD();
    assert.equal(screen._wordGlitch, first, 'phrase holds the brief static effect');
    clock.now = 2440; screen.drawHUD();
    assert.equal(screen._wordGlitch, null, 'phrase recovers after the short glitch');
    clock.now = 3999; screen.drawHUD();
    assert.equal(screen._wordGlitch, null);
    clock.now = 4000; screen.drawHUD();
    assert.ok(screen._wordGlitch && screen._wordGlitch.key !== first.key, 'next two-second interval glitches a different word');
    screen._transitionWarning(view === 'offer' ? 'confirm' : 'offer');
    screen.drawHUD();
    assert.equal(screen._wordGlitch, null, 'glitches stop during transitions');
}

{
    const { context, frames, ctx, clock, text } = harness();
    context.IP2Live.ARDiagnosticRewind.show({ tutorialSection: true, lines: ['First visible word.\nHidden line.'] });
    const screen = frames.at(-1);
    const timing = screen._warningTiming();
    screen.tick = timing.textStart + 10;
    screen.drawHUD();
    clock.now = 2000; screen.drawHUD();
    assert.equal(screen._wordGlitch, null, 'glitch waits until three consecutive words are fully visible');
    screen.tick = timing.rowStarts[1];
    clock.now = 4000; screen.drawHUD();
    assert.equal(screen._wordGlitch.parts[0].text, 'First visible word.', 'glitch does not expose the next untyped line');
    delete ctx.letterSpacing;
    text.length = 0;
    screen._fillTrackedText(ctx, 'ABC', 640, 360, 0.65);
    assert.equal(text.map(t => t.value).join(''), 'ABC', 'older canvas runtimes render tracking character by character');
    assert.ok(text[1].x - text[0].x > ctx.measureText('A').width, 'fallback leaves a gap between letters');
}

for (const view of ['offer', 'confirm']) {
    for (const input of ['Enter', 'Space', 13, 32, 'click']) {
        const { context, frames, text, ctx } = harness(1920, 1080);
        const choices = [];
        context.IP2Live.ARDiagnosticRewind.show({
            tutorialSection: true, lines: ['First line is typing.\nSecond line must also finish.'],
            actions: [{ id: 'tutorial', label: 'Replay Tutorial', onSelect: () => choices.push('tutorial') },
                { id: 'continue', label: 'Continue', onSelect: () => choices.push('continue') }],
        });
        const screen = frames.at(-1);
        screen._warningView = view;
        let timing = screen._warningTiming();
        screen.onKeyPressed('Enter');
        assert.equal(screen.tick, 0, 'skip does not bypass the screen entrance');
        assert.equal(screen._warningRevealTick, null);
        screen.tick = timing.textStart + 4;
        const originalTick = screen.tick;
        screen.onKeyPressedAndRepeat('Enter');
        assert.equal(screen._warningRevealTick, null, 'a held key does not auto-skip the next message');
        if (input === 'click') {
            // The eventual button area is also a valid place to finish typing.
            clickButton(screen, ctx, 0);
        } else screen.onKeyPressed(input);
        assert.equal(screen.tick, originalTick, 'finishing text does not fast-forward the backdrop or header');
        timing = screen._warningTiming();
        assert.equal(timing.buttonsStart, originalTick, 'skip starts the button fade immediately');
        text.length = 0; screen.drawHUD();
        for (const row of timing.rows) assert.ok(text.some(t => t.value === row), 'skip reveals all lines in either view');
        assert.equal(screen._warningTransition, null);
        assert.equal(screen._exitTick, null, 'skip never chooses an action');
        assert.deepEqual(choices, []);
        advance(screen, 30);
        text.length = 0; screen.drawHUD();
        assert.ok(text.some(t => t.value === (view === 'confirm' ? 'Confirm' : 'Replay Tutorial') && t.alpha === 0.5), 'buttons retain their fade after skipping');
        screen.tick = timing.ready;
        screen.onKeyPressed('Enter'); screen.onKeyPressed('Space'); screen.onKeyPressed('Escape');
        assert.equal(screen._exitTick, null, 'keyboard still cannot confirm or dismiss after typing');
        assert.equal(screen._warningTransition, null);
        assert.deepEqual(choices, []);
    }
}

{
    const { context, frames, clock } = harness();
    context.IP2Live.ARDiagnosticRewind.show({ tutorialSection: true, lines: ['One two\nthree'] });
    const screen = frames.at(-1);
    screen.tick = screen._warningTiming().ready;
    screen.drawHUD();
    clock.now = 2000; screen.drawHUD();
    const parts = screen._wordGlitch.parts;
    assert.equal(parts.length, 2, 'three-word glitches can cross a line break');
    assert.equal(parts.map(part => part.text).join(' '), 'One two three');
}

for (const [logicalWidth, logicalHeight] of [[1280, 720], [960, 540], [600, 400]]) {
    const { context, frames, text, rectangles, clock, events, ctx } = harness();
    context.Common.ScreenResolution = { SCREEN_X: logicalWidth, SCREEN_Y: logicalHeight };
    context.IP2Live.NeuralLifeForceGameOver.show({ lifeForce: 0 });
    const screen = frames.at(-1), timing = screen._messageTiming();
    screen.transitionTick = timing.textEnd;
    screen.drawHUD();
    const first = text.find(t => t.value === timing.rows[0] && t.color === '#D5DFE8');
    const last = text.find(t => t.value === timing.rows.at(-1) && t.color === '#D5DFE8');
    assert.ok(first && last);
    assert.equal((first.y - timing.fontSize + last.y) / 2, logicalHeight / 2, 'message remains centered across logical resolutions');
    assert.equal(first.tracking, '0.65px');
    assert.equal(screen._messageCompletedAt, 0);
    clock.now = 4999;
    screen.transitionTick = timing.ready;
    text.length = 0; screen.drawHUD();
    assert.equal(screen._sequenceState(timing).deleting, false, 'complete text holds for a full five seconds');
    assert.ok(text.some(t => t.value === 'The Neural Link can no longer conceal us.' || timing.rows.at(-1) === t.value));
    const promptAlpha = text.find(t => t.value === 'CHOOSE A RECOVERY PROTOCOL').alpha;
    advance(screen, 20);
    text.length = 0; screen.drawHUD();
    assert.notEqual(text.find(t => t.value === 'CHOOSE A RECOVERY PROTOCOL').alpha, promptAlpha, 'recovery prompt blinks');
    clock.now = 5000;
    assert.equal(screen._sequenceState(timing).deleting, true, 'deletion starts at five seconds');
    clock.now = 5800;
    text.length = 0; screen.drawHUD();
    assert.ok(!text.some(t => t.value === timing.rows.at(-1)), 'glitch deletion removes characters from the end');
    assert.ok(!text.some(t => t.value === 'FOUND YOU, INFILTRATOR!'), 'APEX waits for deletion to finish');
    clock.now = 6600;
    assert.equal(screen._sequenceState(timing).apex, true);
    clock.now = 7100;
    text.length = 0; screen.drawHUD();
    assert.ok(text.some(t => t.value === 'FOUND YOU, INFILTRATOR!' && t.alpha > 0 && t.alpha < 1), 'APEX threat fades in');
    assert.ok(text.some(t => t.value === 'GAME OVER'), 'main header persists through interception');
    assert.ok(!text.some(t => t.value === timing.rows[0]), 'old message is replaced');
    assert.ok(events.includes('hood-curve'), 'hooded hologram is rendered under the transmission');
    assert.equal(ctx.globalAlpha, 1, 'animation drawing restores canvas state');
    assert.equal(screen._menuVisible(), true, 'recovery remains available during APEX interception');
    clickButton(screen, ctx, 2);
    screen.onKeyPressed('Enter'); clickButton(screen, ctx, 0);
    advance(screen, 21);
    text.length = 0; rectangles.length = 0; screen.drawHUD();
    assert.ok(text.some(t => t.value === 'LOAD GAME' && t.alpha === 0.5), 'all recovery buttons fade out on selection');
    assert.equal(frames.at(-1), screen);
    advance(screen, 39);
    rectangles.length = 0; screen.drawHUD();
    assert.equal(rectangles.at(-1).color, '#000000');
    assert.equal(rectangles.at(-1).alpha, 1, 'exit paints a black frame before navigating');
    screen.update(); screen.update();
    assert.equal(frames.at(-1).id, 'load-game');
    assert.equal(events.filter(e => e === 'confirm').length, 1, 'repeated input cannot trigger a second recovery action');
}

{
    const { context, frames, clock } = harness();
    context.IP2Live.NeuralLifeForceGameOver.show({ lifeForce: 0 });
    const screen = frames.at(-1);
    screen.transitionTick = screen._messageTiming().textStart + 10;
    clock.now = 1000;
    screen.onKeyPressed('Space');
    clock.now = 5999;
    assert.equal(screen._sequenceState(screen._messageTiming()).deleting, false, 'skipping typing still gets five seconds to read');
    clock.now = 6000;
    assert.equal(screen._sequenceState(screen._messageTiming()).deleting, true);
}

console.log('neural_diagnostic_screens.test.cjs: PASS');
