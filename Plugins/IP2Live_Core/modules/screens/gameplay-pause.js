/**
 * IP2Live - Shared Gameplay Pause and Durable Session State
 *
 * Installs one pause button/input contract across every gameplay screen and
 * stores JSON-safe gameplay state inside Core.Game.current.ip2liveGameStates.
 */

(function () {
    const GameplayPause = {
        VERSION: 'gameplay-pause-20260918-01',
        STORAGE_KEY: 'gameplaySessions',
        activeScreen: null,
        menuOpen: false,
        _screenFallbackIds: new WeakMap(),

        _screenDefinitions() {
            return [
                ['WiresGameplayScreen', 'ip_class_wires'],
                ['PatchPanelGameplayScreen', 'ip_patch_panel_classes'],
                ['CIDRPanelGameplayScreen', 'ip_cidr_binary_panel'],
                ['CIDRPanelHarderGameplayScreen', 'ip_cidr_binary_panel_harder'],
                ['SubnetSimulatorGameplayScreen', 'ip_subnet_simulator'],
                ['HostPowerReactorGameplayScreen', 'ip_host_power_reactor'],
                ['CIDRQuarantineGameplayScreen', 'ip_cidr_quarantine'],
                ['CIDRQuarantineMatrixGameplayScreen', 'ip_cidr_quarantine_matrix'],
                ['NetworkRepairGameplayScreen', 'ip_network_repair'],
                ['VLSMAllocatorGameplayScreen', 'ip_vlsm_allocator'],
            ];
        },

        install() {
            const definitions = this._screenDefinitions();
            for (let i = 0; i < definitions.length; i++) {
                const ScreenClass = IP2Live[definitions[i][0]];
                if (ScreenClass && ScreenClass.prototype) this._installOnPrototype(ScreenClass.prototype, definitions[i][1]);
            }
            return true;
        },

        _installOnPrototype(proto, fallbackGameplayId) {
            if (!proto || proto._ip2liveGameplayPauseInstalled) return false;
            Object.defineProperty(proto, '_ip2liveGameplayPauseInstalled', {
                value: true,
                configurable: true,
            });
            const system = this;

            const originalInitialize = proto.initialize;
            proto.initialize = function () {
                const result = typeof originalInitialize === 'function' ? originalInitialize.apply(this, arguments) : undefined;
                system._registerScreen(this, fallbackGameplayId);
                system._restoreIntoScreen(this, fallbackGameplayId);
                return result;
            };

            const originalLoad = proto.load;
            proto.load = async function () {
                const result = typeof originalLoad === 'function' ? await originalLoad.apply(this, arguments) : undefined;
                system._registerScreen(this, fallbackGameplayId);
                system._restoreIntoScreen(this, fallbackGameplayId);
                return result;
            };

            const originalUpdate = proto.update;
            proto.update = function () {
                system._registerScreen(this, fallbackGameplayId);
                return typeof originalUpdate === 'function' ? originalUpdate.apply(this, arguments) : undefined;
            };

            const originalDrawHUD = proto.drawHUD;
            proto.drawHUD = function () {
                const result = typeof originalDrawHUD === 'function' ? originalDrawHUD.apply(this, arguments) : undefined;
                system._registerScreen(this, fallbackGameplayId);
                system.drawPauseButton(this);
                return result;
            };

            const originalOnKeyPressed = proto.onKeyPressed;
            proto.onKeyPressed = function (key) {
                if (system._isCancelKey(key)) {
                    system.open(this, fallbackGameplayId);
                    return true;
                }
                return typeof originalOnKeyPressed === 'function' ? originalOnKeyPressed.apply(this, arguments) : true;
            };

            const originalOnMouseDown = proto.onMouseDown;
            proto.onMouseDown = function (x, y) {
                if (system._isPauseButtonAt(this, x, y)) {
                    this._ip2livePausePointerCaptured = true;
                    system.open(this, fallbackGameplayId);
                    return true;
                }
                return typeof originalOnMouseDown === 'function' ? originalOnMouseDown.apply(this, arguments) : true;
            };

            const originalOnMouseUp = proto.onMouseUp;
            proto.onMouseUp = function (x, y) {
                if (this._ip2livePausePointerCaptured) {
                    this._ip2livePausePointerCaptured = false;
                    return true;
                }
                if (system._isPauseButtonAt(this, x, y)) {
                    system.open(this, fallbackGameplayId);
                    return true;
                }
                return typeof originalOnMouseUp === 'function' ? originalOnMouseUp.apply(this, arguments) : true;
            };
            return true;
        },

        _isCancelKey(key) {
            try {
                return !!(Data && Data.Keyboards && Data.Keyboards.checkCancelMenu && Data.Keyboards.checkCancelMenu(key));
            } catch (error) {
                const value = key && (key.name || key.code || key);
                return String(value || '').toUpperCase() === 'ESCAPE';
            }
        },

        _registerScreen(screen, fallbackGameplayId) {
            if (!screen || screen._ip2liveGameplayExited) return false;
            this.activeScreen = screen;
            if (fallbackGameplayId) this._screenFallbackIds.set(screen, fallbackGameplayId);
            return true;
        },

        _canPauseScreen(screen) {
            if (!screen || screen._ip2liveGameplayExited || screen.finished || screen.completed) return false;
            const phase = String(screen.phase || '').toLowerCase();
            if (phase === 'success' || phase === 'complete' || phase === 'completed') return false;
            return true;
        },

        _game() {
            return Core && Core.Game ? Core.Game.current : null;
        },

        _sessions(create) {
            const game = this._game();
            if (!game) return null;
            if (!game.ip2liveGameStates || typeof game.ip2liveGameStates !== 'object') {
                if (!create) return null;
                game.ip2liveGameStates = {};
            }
            if (!game.ip2liveGameStates[this.STORAGE_KEY] || typeof game.ip2liveGameStates[this.STORAGE_KEY] !== 'object') {
                if (!create) return null;
                game.ip2liveGameStates[this.STORAGE_KEY] = {};
            }
            return game.ip2liveGameStates[this.STORAGE_KEY];
        },

        _descriptorFromScreen(screen, fallbackGameplayId) {
            const options = screen && screen.options && typeof screen.options === 'object' ? screen.options : {};
            const spec = options.spec && typeof options.spec === 'object' ? options.spec : {};
            return {
                gameplayId: String((screen && screen.gameplayId) || options.gameplayId || fallbackGameplayId || '').trim(),
                mapId: Number(options.mapId || spec.mapId || (this._game() && this._game().currentMapID) || 0) || 0,
                questId: String(options.questId || spec.id || '').trim(),
                objectiveId: String(options.objectiveId || spec.objectiveId || '').trim(),
            };
        },

        _descriptorFromPayload(gameplayId, payload) {
            const data = payload || {};
            const spec = data.spec || {};
            return {
                gameplayId: String(gameplayId || data.gameplayId || data.nodeId || '').trim(),
                mapId: Number(data.mapId || spec.mapId || (this._game() && this._game().currentMapID) || 0) || 0,
                questId: String(data.questId || spec.id || '').trim(),
                objectiveId: String(data.objectiveId || spec.objectiveId || '').trim(),
            };
        },

        _sessionKey(descriptor) {
            const d = descriptor || {};
            return [d.gameplayId || 'gameplay', d.mapId || 0, d.questId || 'quest', d.objectiveId || 'objective'].join('::');
        },

        findSession(gameplayId, payload) {
            const sessions = this._sessions(false);
            if (!sessions) return null;
            const descriptor = this._descriptorFromPayload(gameplayId, payload);
            const exact = sessions[this._sessionKey(descriptor)];
            if (exact && exact.state && !exact.completed) return exact;

            const keys = Object.keys(sessions);
            for (let i = 0; i < keys.length; i++) {
                const candidate = sessions[keys[i]];
                if (!candidate || !candidate.state || candidate.completed) continue;
                if (descriptor.gameplayId && candidate.gameplayId !== descriptor.gameplayId) continue;
                if (descriptor.questId && candidate.questId !== descriptor.questId) continue;
                if (descriptor.objectiveId && candidate.objectiveId !== descriptor.objectiveId) continue;
                if (descriptor.mapId && Number(candidate.mapId) !== descriptor.mapId) continue;
                return candidate;
            }
            return null;
        },

        hasSession(gameplayId, payload) {
            return !!this.findSession(gameplayId, payload);
        },

        captureActiveSession(reason) {
            const screen = this.activeScreen;
            if (!screen || screen._ip2liveGameplayExited) return null;
            return this.captureScreen(screen, reason || 'checkpoint');
        },

        captureScreen(screen, reason) {
            if (!screen || screen._ip2liveGameplayExited) return null;
            const fallback = this._screenFallbackIds.get(screen) || '';
            const descriptor = this._descriptorFromScreen(screen, fallback);
            if (!descriptor.gameplayId) return null;
            const state = this._captureScreenState(screen);
            const capturedAt = Date.now();
            const session = Object.assign({
                version: this.VERSION,
                capturedAt,
                reason: reason || 'gameplay_pause',
                state,
                completed: false,
            }, descriptor);
            const sessions = this._sessions(true);
            if (!sessions) return null;
            sessions[this._sessionKey(descriptor)] = session;
            screen._ip2liveSessionKey = this._sessionKey(descriptor);
            return session;
        },

        _captureScreenState(screen) {
            const state = {};
            const excluded = {
                options: true,
                loading: true,
                dragging: true,
                mouse: true,
                particles: true,
                sparks: true,
                fxBursts: true,
                routeShocks: true,
                tutorialSpotlightComplete: true,
                pendingMistakeDialogue: true,
                pendingFailureExit: true,
                _deferredFailureExit: true,
                _ip2livePauseButtonRect: true,
                _ip2livePausePointerCaptured: true,
            };
            const keys = Object.keys(screen);
            const seen = new WeakSet();
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                if (excluded[key] || /^_ip2live/.test(key) || /Rects?$/.test(key)) continue;
                const cloned = this._cloneSerializable(screen[key], seen, 0);
                if (cloned !== undefined) state[key] = cloned;
            }
            return state;
        },

        _cloneSerializable(value, seen, depth) {
            if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
            if (typeof value === 'number') return Number.isFinite(value) ? value : null;
            if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') return undefined;
            if (depth > 12 || !value || typeof value !== 'object') return undefined;
            if (seen.has(value)) return undefined;
            seen.add(value);
            if (Array.isArray(value)) {
                const output = [];
                for (let i = 0; i < value.length; i++) {
                    const item = this._cloneSerializable(value[i], seen, depth + 1);
                    output.push(item === undefined ? null : item);
                }
                seen.delete(value);
                return output;
            }
            const proto = Object.getPrototypeOf(value);
            if (proto !== Object.prototype && proto !== null) {
                seen.delete(value);
                return undefined;
            }
            const output = {};
            const keys = Object.keys(value);
            for (let i = 0; i < keys.length; i++) {
                const item = this._cloneSerializable(value[keys[i]], seen, depth + 1);
                if (item !== undefined) output[keys[i]] = item;
            }
            seen.delete(value);
            return output;
        },

        _restoreIntoScreen(screen, fallbackGameplayId) {
            if (!screen || screen._ip2liveSessionRestoreChecked) return false;
            const options = screen.options && typeof screen.options === 'object' ? screen.options : null;
            const spec = options && options.spec && typeof options.spec === 'object' ? options.spec : {};
            if (!options || !(options.questId || options.objectiveId || spec.id || spec.objectiveId)) return false;
            const descriptor = this._descriptorFromScreen(screen, fallbackGameplayId);
            const session = this.findSession(descriptor.gameplayId, descriptor);
            screen._ip2liveSessionRestoreChecked = true;
            if (!session || !session.state) return false;

            const restored = this._cloneSerializable(session.state, new WeakSet(), 0) || {};
            this._shiftWallClockFields(restored, Math.max(0, Date.now() - Number(session.capturedAt || Date.now())));
            this._normalizeTutorialState(restored);
            const liveOptions = screen.options;
            const keys = Object.keys(restored);
            for (let i = 0; i < keys.length; i++) screen[keys[i]] = restored[keys[i]];
            screen.options = liveOptions;
            screen.dragging = null;
            screen.mouse = { x: -9999, y: -9999 };
            screen._ip2liveRestoredSession = true;
            screen._ip2liveSessionKey = this._sessionKey(descriptor);
            this._registerScreen(screen, fallbackGameplayId);

            if (
                screen._ipGuide && screen._ipGuide.active && !screen._ipGuide.expectedSourceId &&
                IP2Live.IPWiresTutorial && typeof IP2Live.IPWiresTutorial._startGuidedStep === 'function'
            ) {
                setTimeout(function () {
                    if (!screen._ip2liveGameplayExited) IP2Live.IPWiresTutorial._startGuidedStep(screen);
                }, 0);
            }
            return true;
        },

        _shiftWallClockFields(value, delta) {
            if (!delta || !value || typeof value !== 'object') return;
            const timestampKeys = {
                startedAt: true,
                endsAt: true,
                stabilizeStartedAt: true,
                completedAt: true,
                _completionVisibleAt: true,
                hitFlashUntil: true,
            };
            const keys = Object.keys(value);
            for (let i = 0; i < keys.length; i++) {
                const key = keys[i];
                if (timestampKeys[key] && Number(value[key]) > 0) value[key] = Number(value[key]) + delta;
                else if (value[key] && typeof value[key] === 'object') this._shiftWallClockFields(value[key], delta);
            }
        },

        _normalizeTutorialState(state) {
            if (!state || typeof state !== 'object') return;
            state.tutorialDialogueOpen = false;
            state.tutorialSpotlightTimer = 0;
            state.tutorialSpotlightComplete = null;
            state.tutorialHighlight = null;
            const step = String(state.tutorialStep || '');
            if (/_dialogue$/.test(step)) {
                if (step === 'training_dialogue' || step === 'independent_dialogue') state.tutorialStep = 'training_wait';
                else state.tutorialStep = step.replace(/_dialogue$/, '_intro');
                state.tutorialPaused = false;
            }
        },

        clearSession(gameplayId, payload) {
            const sessions = this._sessions(false);
            const released = this.releaseActiveScreen(gameplayId, payload);
            if (!sessions) return released;
            const descriptor = this._descriptorFromPayload(gameplayId, payload);
            const exactKey = this._sessionKey(descriptor);
            let cleared = false;
            if (sessions[exactKey]) {
                delete sessions[exactKey];
                cleared = true;
            }
            const keys = Object.keys(sessions);
            for (let i = 0; i < keys.length; i++) {
                const candidate = sessions[keys[i]];
                if (!candidate) continue;
                if (descriptor.gameplayId && candidate.gameplayId !== descriptor.gameplayId) continue;
                if (descriptor.questId && candidate.questId !== descriptor.questId) continue;
                if (descriptor.objectiveId && candidate.objectiveId !== descriptor.objectiveId) continue;
                delete sessions[keys[i]];
                cleared = true;
            }
            return cleared || released;
        },

        releaseActiveScreen(gameplayId, payload) {
            const screen = this.activeScreen;
            if (!screen) return false;
            const active = this._descriptorFromScreen(screen, this._screenFallbackIds.get(screen) || '');
            const expected = this._descriptorFromPayload(gameplayId, payload);
            if (expected.gameplayId && active.gameplayId !== expected.gameplayId) return false;
            if (expected.questId && active.questId !== expected.questId) return false;
            if (expected.objectiveId && active.objectiveId !== expected.objectiveId) return false;
            screen._ip2liveGameplayExited = true;
            this.activeScreen = null;
            return true;
        },

        clearSessionsForObjective(payload) {
            const data = payload || {};
            if (!data.gameplayId && !data.questId && !data.objectiveId) return false;
            return this.clearSession(data.gameplayId, data);
        },

        open(screen, fallbackGameplayId) {
            if (this.menuOpen || !this._canPauseScreen(screen)) return false;
            this._registerScreen(screen, fallbackGameplayId);
            this.captureScreen(screen, 'pause_opened');
            this.menuOpen = true;
            try { if (Data.Systems.soundConfirmation) Data.Systems.soundConfirmation.playSound(); } catch (error) {}
            if (!Manager || !Manager.Stack || typeof Manager.Stack.push !== 'function') {
                this.menuOpen = false;
                return false;
            }
            Manager.Stack.push(new IP2LiveGameplayPauseMenu(screen));
            const gameManager = IP2Live.GameManager;
            if (gameManager && typeof gameManager.saveProgressToActiveSlot === 'function') {
                Promise.resolve(gameManager.saveProgressToActiveSlot(null, null, { checkpointReason: 'gameplay_paused' })).catch(function () {});
            }
            return true;
        },

        closeMenu() {
            this.menuOpen = false;
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        },

        async exitQuest(screen) {
            if (!screen || screen._ip2liveGameplayExited) return { saved: false, reason: 'no-active-gameplay' };
            this.captureScreen(screen, 'exit_quest');
            let saveResult = { saved: false, reason: 'no-active-save-slot' };
            const gameManager = IP2Live.GameManager;
            if (gameManager && typeof gameManager.saveProgressToActiveSlot === 'function') {
                try {
                    saveResult = await gameManager.saveProgressToActiveSlot(null, null, { checkpointReason: 'gameplay_exit_quest' });
                } catch (error) {
                    saveResult = { saved: false, reason: 'checkpoint-failed', error: String(error && error.message || error) };
                }
            }
            if (IP2Live.DialogueManager && typeof IP2Live.DialogueManager.discardActive === 'function') {
                IP2Live.DialogueManager.discardActive();
            }
            if (Manager && Manager.Stack && typeof Manager.Stack.pop === 'function') Manager.Stack.pop();
            this.closeMenu();
            screen._ip2liveGameplayExited = true;
            if (this.activeScreen === screen) this.activeScreen = null;
            setTimeout(function () {
                if (typeof screen._cancel === 'function') screen._cancel(false);
                else if (screen.options && typeof screen.options.onCancel === 'function') screen.options.onCancel();
            }, 0);
            return saveResult;
        },

        drawPauseButton(screen) {
            const ctx = Common && Common.Platform ? Common.Platform.ctx : null;
            if (!ctx || !ctx.canvas || this.menuOpen || !this._canPauseScreen(screen)) return false;
            const scale = Math.max(0.72, Math.min(ctx.canvas.width / 1280, ctx.canvas.height / 720));
            const w = 154 * scale;
            const h = 34 * scale;
            const x = (ctx.canvas.width - w) / 2;
            const y = 0;
            screen._ip2livePauseButtonRect = { x, y, w, h };

            ctx.save();
            ctx.shadowColor = 'rgba(0,240,255,0.42)';
            ctx.shadowBlur = 10 * scale;
            ctx.beginPath();
            ctx.moveTo(x + 12 * scale, y);
            ctx.lineTo(x + w - 12 * scale, y);
            ctx.lineTo(x + w, y + h - 8 * scale);
            ctx.lineTo(x + w - 8 * scale, y + h);
            ctx.lineTo(x + 8 * scale, y + h);
            ctx.lineTo(x, y + h - 8 * scale);
            ctx.closePath();
            const grad = ctx.createLinearGradient(x, y, x, y + h);
            grad.addColorStop(0, 'rgba(17,32,43,0.98)');
            grad.addColorStop(0.58, 'rgba(4,12,19,0.96)');
            grad.addColorStop(1, 'rgba(1,5,10,0.98)');
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#00F0FF';
            ctx.lineWidth = Math.max(1, 1.3 * scale);
            ctx.stroke();
            ctx.fillStyle = '#FFE600';
            ctx.fillRect(x + 12 * scale, y + h - 3 * scale, w - 24 * scale, 2 * scale);
            ctx.font = 'bold ' + Math.round(12 * scale) + 'px ' + (IP2Live.Assets && IP2Live.Assets.oxaniumMediumLoaded ? 'Oxanium-Medium' : 'monospace');
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#EAFBFF';
            ctx.fillText('Ⅱ  PAUSE', x + w / 2, y + h / 2 + scale);
            ctx.restore();
            return true;
        },

        _isPauseButtonAt(screen, x, y) {
            const r = screen && screen._ip2livePauseButtonRect;
            return !!(r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
        },
    };

    class IP2LiveGameplayPauseMenu extends Scene.Base {
        constructor(sourceScreen) {
            super(true);
            this.sourceScreen = sourceScreen || GameplayPause.activeScreen;
        }

        initialize() {
            this.sourceScreen = this.sourceScreen || GameplayPause.activeScreen;
            this.menuItems = ['RESUME', 'SETTINGS', 'EXIT QUEST'];
            this.selectedIndex = 0;
            this.hoverIndex = -1;
            this.animTick = 0;
            this.pending = false;
            this.statusText = 'GAMEPLAY STATE HELD';
            this.buttonRects = [];
        }

        async load() {
            this.loading = false;
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        }

        update() {
            this.animTick++;
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        }

        draw3D() {}

        onKeyPressed(key) {
            if (this.pending) return true;
            if (GameplayPause._isCancelKey(key)) {
                this._resume();
                return true;
            }
            if (Data.Keyboards.checkActionMenu && Data.Keyboards.checkActionMenu(key)) {
                this._activate();
                return true;
            }
            return true;
        }

        onKeyPressedAndRepeat(key) {
            if (this.pending) return true;
            const previous = this.selectedIndex;
            if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Up)) {
                this.selectedIndex = (this.selectedIndex - 1 + this.menuItems.length) % this.menuItems.length;
            } else if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Down)) {
                this.selectedIndex = (this.selectedIndex + 1) % this.menuItems.length;
            }
            if (previous !== this.selectedIndex) {
                this.hoverIndex = -1;
                try { if (Data.Systems.soundCursor) Data.Systems.soundCursor.playSound(); } catch (error) {}
            }
            return true;
        }

        onMouseMove(x, y) {
            if (this.pending) return true;
            const index = this._buttonAt(x, y);
            if (index >= 0 && index !== this.selectedIndex) {
                this.selectedIndex = index;
                this.hoverIndex = index;
                try { if (Data.Systems.soundCursor) Data.Systems.soundCursor.playSound(); } catch (error) {}
            }
            return true;
        }

        onMouseUp(x, y) {
            if (this.pending) return true;
            const index = this._buttonAt(x, y);
            if (index >= 0) {
                this.selectedIndex = index;
                this._activate();
            }
            return true;
        }

        _buttonAt(x, y) {
            for (let i = 0; i < this.buttonRects.length; i++) {
                const r = this.buttonRects[i];
                if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
            }
            return -1;
        }

        _activate() {
            try { if (Data.Systems.soundConfirmation) Data.Systems.soundConfirmation.playSound(); } catch (error) {}
            const item = this.menuItems[this.selectedIndex];
            if (item === 'RESUME') this._resume();
            else if (item === 'SETTINGS') this._settings();
            else if (item === 'EXIT QUEST') this._exitQuest();
        }

        _resume() {
            if (this.pending) return false;
            try { if (Data.Systems.soundCancel) Data.Systems.soundCancel.playSound(); } catch (error) {}
            GameplayPause.closeMenu();
            if (Manager && Manager.Stack && typeof Manager.Stack.pop === 'function') Manager.Stack.pop();
            return true;
        }

        _settings() {
            if (!window.IP2LiveSettingsMenu || !Manager || !Manager.Stack || typeof Manager.Stack.push !== 'function') return false;
            Manager.Stack.push(new IP2LiveSettingsMenu());
            return true;
        }

        async _exitQuest() {
            if (this.pending) return false;
            this.pending = true;
            this.statusText = 'SAVING QUEST STATE...';
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            await GameplayPause.exitQuest(this.sourceScreen);
            return true;
        }

        drawHUD() {
            const ctx = Common && Common.Platform ? Common.Platform.ctx : null;
            if (!ctx || !ctx.canvas) return;
            const cW = ctx.canvas.width;
            const cH = ctx.canvas.height;
            const s = Math.max(0.72, Math.min(cW / 1280, cH / 720));
            const panelW = 430 * s;
            const panelH = 330 * s;
            const x = (cW - panelW) / 2;
            const y = (cH - panelH) / 2;
            const font = IP2Live.Assets && IP2Live.Assets.oxaniumMediumLoaded ? 'Oxanium-Medium' : 'monospace';

            ctx.save();
            ctx.fillStyle = 'rgba(0,2,8,0.78)';
            ctx.fillRect(0, 0, cW, cH);

            ctx.shadowColor = 'rgba(0,240,255,0.38)';
            ctx.shadowBlur = 22 * s;
            ctx.beginPath();
            ctx.moveTo(x + 18 * s, y);
            ctx.lineTo(x + panelW - 18 * s, y);
            ctx.lineTo(x + panelW, y + 18 * s);
            ctx.lineTo(x + panelW, y + panelH - 18 * s);
            ctx.lineTo(x + panelW - 18 * s, y + panelH);
            ctx.lineTo(x + 18 * s, y + panelH);
            ctx.lineTo(x, y + panelH - 18 * s);
            ctx.lineTo(x, y + 18 * s);
            ctx.closePath();
            const bg = ctx.createLinearGradient(x, y, x + panelW, y + panelH);
            bg.addColorStop(0, 'rgba(4,15,24,0.99)');
            bg.addColorStop(0.62, 'rgba(3,7,15,0.99)');
            bg.addColorStop(1, 'rgba(18,3,12,0.99)');
            ctx.fillStyle = bg;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#00E8F5';
            ctx.lineWidth = Math.max(1, 1.5 * s);
            ctx.stroke();

            ctx.fillStyle = '#FF003C';
            ctx.fillRect(x + 2 * s, y + 2 * s, panelW - 4 * s, 54 * s);
            const header = ctx.createLinearGradient(x, y, x + panelW, y);
            header.addColorStop(0, '#FF164D');
            header.addColorStop(0.48, '#B8003B');
            header.addColorStop(1, '#340018');
            ctx.fillStyle = header;
            ctx.fillRect(x + 2 * s, y + 2 * s, panelW - 4 * s, 54 * s);
            for (let hx = x - 30 * s; hx < x + panelW; hx += 16 * s) {
                ctx.strokeStyle = 'rgba(255,255,255,0.075)';
                ctx.lineWidth = 3 * s;
                ctx.beginPath();
                ctx.moveTo(hx, y + 56 * s);
                ctx.lineTo(hx + 42 * s, y);
                ctx.stroke();
            }

            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold ' + Math.round(20 * s) + 'px ' + font;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('GAMEPLAY PAUSED', x + panelW / 2, y + 29 * s);
            ctx.font = Math.round(8 * s) + 'px ' + font;
            ctx.fillStyle = this.pending ? '#FFE600' : '#00F0FF';
            ctx.fillText(this.statusText, x + panelW / 2, y + 76 * s);

            this.buttonRects = [];
            const bw = 300 * s;
            const bh = 48 * s;
            const bx = x + (panelW - bw) / 2;
            const startY = y + 99 * s;
            for (let i = 0; i < this.menuItems.length; i++) {
                const by = startY + i * 61 * s;
                const active = !this.pending && i === this.selectedIndex;
                const danger = i === 2;
                this.buttonRects.push({ x: bx, y: by, w: bw, h: bh });
                const buttonGrad = ctx.createLinearGradient(bx, by, bx + bw, by);
                buttonGrad.addColorStop(0, active ? (danger ? 'rgba(255,0,60,0.72)' : 'rgba(255,230,0,0.80)') : 'rgba(6,17,27,0.94)');
                buttonGrad.addColorStop(1, active ? (danger ? 'rgba(84,0,31,0.90)' : 'rgba(26,52,48,0.94)') : 'rgba(2,7,14,0.94)');
                ctx.fillStyle = buttonGrad;
                ctx.fillRect(bx, by, bw, bh);
                ctx.strokeStyle = active ? (danger ? '#FF315F' : '#FFE600') : 'rgba(0,240,255,0.52)';
                ctx.lineWidth = Math.max(1, (active ? 2 : 1) * s);
                ctx.strokeRect(bx, by, bw, bh);
                ctx.fillStyle = active && !danger ? '#081013' : '#FFFFFF';
                ctx.font = 'bold ' + Math.round(14 * s) + 'px ' + font;
                ctx.fillText(this.menuItems[i], bx + bw / 2, by + bh / 2);
            }

            ctx.font = Math.round(8 * s) + 'px ' + font;
            ctx.fillStyle = 'rgba(205,244,255,0.62)';
            ctx.fillText('ESC // RESUME', x + panelW / 2, y + panelH - 17 * s);
            ctx.restore();
        }
    }

    IP2Live.GameplayPause = GameplayPause;
    window.IP2LiveGameplayPause = GameplayPause;
    window.IP2LiveGameplayPauseMenu = IP2LiveGameplayPauseMenu;
    GameplayPause.install();
    console.log('[IP2Live] gameplay-pause.js loaded.');
}());
