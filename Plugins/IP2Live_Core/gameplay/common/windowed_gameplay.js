/** Shared windowed version host. Isolates puzzle execution and serializes tool sessions. */
(function () {
    const definitions = [];
    const inside = (x, y, r) => !!r && x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;

    class WindowedGameplay {
        constructor(definition, desktop, options = {}) {
            this.definition = definition;
            this.desktop = desktop;
            this.options = options;
            this.canvas = document.createElement('canvas');
            this.canvas.width = 1280;
            this.canvas.height = 720;
            this.ctx = this.canvas.getContext('2d');
            this.cidrState = {};
            this.overlays = [];
            this.toolState = { _active: false, _activeScreen: null };
            this.status = 'loading';
            this.minimized = false;
            this.disposed = false;
            this.x = null;
            this.y = null;
            this.pointerCaptured = false;
        }

        async load() {
            const spec = Object.assign({}, this.options.spec, { tutorial: false, combinedMode: true });
            const options = Object.assign({}, this.options, {
                spec, combinedMode: true, gameplayId: this.definition.id,
                questId: 'combined.' + this.definition.id, objectiveId: 'tool',
                tutorialMode: false, guidedTutorial: false, tutorialFeedback: false,
                onComplete: result => this.finish('solved', result),
                onFailed: result => this.finish('failed', result),
                onCancel: () => this.desktop.remove(this),
                onMistake: (mistake, done) => { if (done) done(); },
            });
            try {
                this.screen = this.run(() => this.definition.create(options));
                // Constructors in the engine initialize before receiving their options.
                this.screen.options = Object.assign({}, this.screen.options, { combinedMode: true });
                this.screen._ip2liveSessionRestoreChecked = true;
                if (this.screen.load) await this.run(() => this.screen.load());
                if (this.disposed) return;
                this.screen.loading = false;
                if (this.restoreData) this.restore(this.restoreData);
                else this.status = 'ready';
                this.paint();
            } catch (error) {
                this.status = 'error';
                console.warn('[IP2Live] Windowed version could not open: ' + this.definition.id, error);
            }
            Manager.Stack.requestPaintHUD = true;
        }

        get activeScreen() { return this.overlays[this.overlays.length - 1] || this.screen; }

        // All swaps are synchronous and restored in finally. Native calculators stay
        // inside their owning window; campaign saves and CIDR handoffs stay untouched.
        run(action) {
            const stack = Manager.Stack, gm = IP2Live.GameManager;
            const pause = IP2Live.GameplayPause, tool = IP2Live.HostPowerToolManager;
            const saved = { ctx: Common.Platform.ctx, game: Core.Game.current,
                cidr: IP2Live.CIDRGameplayState, hadCidr: Object.prototype.hasOwnProperty.call(IP2Live, 'CIDRGameplayState'),
                push: stack.push, pop: stack.pop, replace: stack.replace,
                mistake: gm && gm.handleGameplayMistake,
                pauseScreen: pause && pause.activeScreen, pauseOpen: pause && pause.menuOpen,
                toolActive: tool && tool._active, toolScreen: tool && tool._activeScreen };
            Common.Platform.ctx = this.ctx;
            Core.Game.current = null;
            IP2Live.CIDRGameplayState = this.cidrState;
            if (gm) gm.handleGameplayMistake = () => true;
            if (pause) { pause.activeScreen = null; pause.menuOpen = false; }
            if (tool) Object.assign(tool, this.toolState);
            stack.push = screen => {
                screen.options = Object.assign({}, screen.options, { combinedMode: true });
                this.overlays.push(screen);
                if (screen.load) Promise.resolve(screen.load()).catch(error => console.warn('[IP2Live] Window tool load failed:', error));
                return screen;
            };
            stack.pop = () => this.overlays.pop();
            stack.replace = screen => { this.overlays.pop(); return stack.push(screen); };
            try { return action(); }
            finally {
                this.cidrState = IP2Live.CIDRGameplayState;
                if (tool) { this.toolState = { _active: tool._active, _activeScreen: tool._activeScreen }; tool._active = saved.toolActive; tool._activeScreen = saved.toolScreen; }
                if (pause) { pause.activeScreen = saved.pauseScreen; pause.menuOpen = saved.pauseOpen; }
                if (gm) gm.handleGameplayMistake = saved.mistake;
                stack.push = saved.push; stack.pop = saved.pop; stack.replace = saved.replace;
                Common.Platform.ctx = saved.ctx;
                Core.Game.current = saved.game;
                if (saved.hadCidr) IP2Live.CIDRGameplayState = saved.cidr;
                else delete IP2Live.CIDRGameplayState;
            }
        }

        finish(status, result) {
            if (this.disposed || this.status === 'solved' || this.status === 'failed') return;
            this.status = status;
            this.result = result;
            this.desktop.onResult(this, status, result);
        }

        resume() {
            if (!this.screen) return;
            this.run(() => {
                for (const screen of [this.screen, ...this.overlays]) {
                    if (IP2Live.GameplayTimer) IP2Live.GameplayTimer.forget(screen);
                    if (screen.onGameplayResume) screen.onGameplayResume();
                    if ('lastUpdateAt' in screen) screen.lastUpdateAt = null;
                }
            });
        }

        releaseInput() {
            const captured = this.pointerCaptured;
            this.pointerCaptured = false;
            if (this.screen) this.run(() => {
                const screen = this.activeScreen;
                if (captured && screen.onMouseUp) screen.onMouseUp(-9999, -9999);
                if (screen.onMouseLeave) screen.onMouseLeave();
                // Reactor and other action tools track held keys on their screen.
                for (const key of this.desktop.heldKeys) if (screen.onKeyReleased) screen.onKeyReleased(key);
            });
        }

        update(paint = true) {
            if (this.status !== 'ready' || this.disposed) return;
            this.run(() => { if (this.activeScreen.update) this.activeScreen.update(); });
            if (paint) this.paint();
        }

        snapshot() {
            if (this.restoreData && !this.disposed) return this.restoreData;
            if (!this.screen || this.disposed || this.status === 'loading' || this.status === 'error') return null;
            const pause = IP2Live.GameplayPause;
            if (!pause || !pause._captureScreenState) return null;
            const clone = value => pause._cloneSerializable(value, new WeakSet(), 0);
            return { gameplayId: this.definition.id, capturedAt: Date.now(),
                options: clone(this.screen.options), state: pause._captureScreenState(this.screen),
                cidrState: clone(this.cidrState), status: this.status, result: clone(this.result),
                minimized: this.minimized, x: this.x, y: this.y,
                viewportWidth: this.viewportWidth, viewportHeight: this.viewportHeight };
        }

        restore(saved) {
            const pause = IP2Live.GameplayPause;
            if (!pause || !saved.state) { this.status = 'ready'; return; }
            const state = pause._cloneSerializable(saved.state, new WeakSet(), 0) || {};
            // Time away from the saved game is not playing time. Native clocks
            // keep their remaining budget and animation timestamps are rebased.
            const elapsed = Math.max(0, Date.now() - Number(saved.capturedAt || Date.now()));
            pause._shiftWallClockFields(state, elapsed);
            for (const key of ['phaseRevealAt', 'routeRevealAt', 'classUnlockAt']) if (Number(state[key]) > 0) state[key] += elapsed;
            if (state.classFormation && Number(state.classFormation.at) > 0) state.classFormation.at += elapsed;
            if (state.virusState && Number(state.virusState.overrunAt) > 0) state.virusState.overrunAt += elapsed;
            pause._normalizeRestoredOverlays(state);
            const options = this.screen.options;
            Object.assign(this.screen, state);
            this.screen.options = options;
            if ('tools' in this.screen) this.screen.tools = IP2Live.CIDRTools;
            this.screen.dragging = null;
            if ('dragBallId' in this.screen) this.screen.dragBallId = null;
            if ('dragOriginSlotKey' in this.screen) this.screen.dragOriginSlotKey = null;
            if ('draggingPath' in this.screen) this.screen.draggingPath = false;
            this.screen.mouse = { x: -9999, y: -9999 };
            this.screen.heldLeft = this.screen.heldRight = this.screen.shootHeld = false;
            this.cidrState = saved.cidrState || {};
            this.status = ['ready', 'solved', 'failed'].includes(saved.status) ? saved.status : 'ready';
            this.result = saved.result;
            this.x = Number.isFinite(saved.x) ? saved.x : null;
            this.y = Number.isFinite(saved.y) ? saved.y : null;
            this.viewportWidth = saved.viewportWidth;
            this.viewportHeight = saved.viewportHeight;
            this.minimized = true;
            this.restoreData = null;
            this.resume();
        }

        timerLabel() {
            const screen = this.screen;
            if (this.status === 'solved') return 'SOLVED';
            if (this.status === 'failed') return 'FAILED';
            if (!screen || this.status === 'loading') return 'LOADING';
            let ms = null;
            if (Number.isFinite(screen.roundRemainingMs)) ms = screen.roundRemainingMs;
            else if (Number.isFinite(screen.solveTimerTicks)) ms = screen.solveTimerTicks / 60 * 1000;
            else if (screen.gameplayTimer && screen.gameplayTimer.enabled) ms = screen.gameplayTimer.remainingMs;
            else if (screen.timerEnabled && Number.isFinite(screen.questElapsedMs)) ms = screen.timeLimitSeconds * 1000 - screen.questElapsedMs;
            if (ms === null) return 'LIVE';
            const seconds = Math.max(0, Math.ceil(ms / 1000));
            return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
        }

        paint() {
            if (!this.screen || this.disposed) return;
            this.ctx.save();
            try {
                this.ctx.setTransform(1, 0, 0, 1, 0, 0);
                this.ctx.clearRect(0, 0, 1280, 720);
                this.run(() => { if (this.activeScreen.drawHUD) this.activeScreen.drawHUD(); });
            } finally { this.ctx.restore(); }
        }

        pointer(method, x, y) {
            const body = this.bounds.body;
            const captured = this.pointerCaptured;
            if (method === 'onMouseUp') this.pointerCaptured = false;
            if (!inside(x, y, body) && !captured) return;
            if (method === 'onMouseDown') this.pointerCaptured = true;
            const screen = this.activeScreen;
            if (this.status === 'ready' && screen && screen[method]) {
                this.run(() => screen[method]((x - body.x) * 1280 / body.w, (y - body.y) * 720 / body.h));
                this.paint();
            }
        }

        key(method, key) {
            const screen = this.activeScreen;
            if (this.status === 'ready' && screen && screen[method]) this.run(() => screen[method](key));
        }

        dispose() {
            if (this.disposed) return;
            this.releaseInput();
            this.disposed = true;
            this.run(() => {
                for (const screen of this.overlays) {
                    if (screen._endReportAssistance) screen._endReportAssistance();
                    if (screen.close) screen.close();
                }
            });
            if (this.screen) this.screen._ip2liveGameplayExited = true;
            this.overlays.length = 0;
            this.canvas.width = this.canvas.height = 0;
        }
    }

    IP2Live.WindowedGameplay = {
        definitions, Window: WindowedGameplay, inside,
        register(definition) {
            if (definitions.some(item => item.id === definition.id)) throw new Error('Duplicate windowed version: ' + definition.id);
            definitions.push(definition);
        },
    };
})();
