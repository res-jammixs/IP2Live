/** Runs real gameplay instances inside a disposable, two-player engine race. */
(function () {
    'use strict';
    const Rules = IP2Live.PVPRules;
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const mode = {
        GAMEPLAY_FRACTION: 4 / 5,
        ROUND_CLOSE_MS: 220, ROUND_OPEN_MS: 260,
        LEAVE_OPEN_MS: 180, LEAVE_CLOSE_MS: 140,
        // Simulated solving ability and thinking time, independent of human progress.
        // Keep harder combat puzzles slower, including on retries.
        AI_PROFILES: Object.freeze({
            ip_class_wires: Object.freeze({ successChance: 0.80, minSeconds: 14, maxSeconds: 22, cleanChance: 0.65, maxMistakes: 1 }),
            ip_patch_panel_classes: Object.freeze({ successChance: 0.80, minSeconds: 20, maxSeconds: 30, cleanChance: 0.65, maxMistakes: 1 }),
            ip_cidr_binary_panel: Object.freeze({ successChance: 0.80, minSeconds: 22, maxSeconds: 34, cleanChance: 0.65, maxMistakes: 1 }),
            ip_subnet_simulator: Object.freeze({ successChance: 0.80, minSeconds: 30, maxSeconds: 44, cleanChance: 0.65, maxMistakes: 1 }),
            ip_host_power_reactor: Object.freeze({ successChance: 0.80, minSeconds: 15, maxSeconds: 24, cleanChance: 0.65, maxMistakes: 1 }),
            ip_cidr_quarantine: Object.freeze({ successChance: 0.75, minSeconds: 65, maxSeconds: 90, cleanChance: 0.40, maxMistakes: 2 }),
            ip_cidr_quarantine_matrix: Object.freeze({ successChance: 0.72, minSeconds: 80, maxSeconds: 105, cleanChance: 0.35, maxMistakes: 2 }),
        }),
        active: false, bridge: () => typeof window !== 'undefined' ? window.ip2livePVP : null,
        start(lobby, playerId, menu, ai = false) {
            if (this.active || (IP2Live.TutorialReplay && IP2Live.TutorialReplay.session)) return false;
            this.active = true; this.ai = ai; this.playerId = playerId; this.menu = menu;
            this.savedGame = Core.Game.current; this.savedManagerState = IP2Live.GameManager.state;
            this.savedCidr = clone(IP2Live.CIDRGameplayState); this.hadCidr = Object.prototype.hasOwnProperty.call(IP2Live, 'CIDRGameplayState');
            this.savedPauseScreen = IP2Live.GameplayPause && IP2Live.GameplayPause.activeScreen;
            this.telemetrySession = IP2Live.FeatureTelemetry ? IP2Live.FeatureTelemetry.startSession(ai ? 'pvp_ai' : 'pvp_lan', 'gameplay') : null;
            Core.Game.current = null; delete IP2Live.CIDRGameplayState;
            this.cidrState = null; this.error = ''; this.notice = ''; this.pending = null; this.polling = false;
            this.round = null; this.nextRoundAt = 0; this.nextPollAt = 0; this.offlineSince = 0; this.lastEvent = 0;
            this.animations = []; this.levels = {}; this.closing = false; this.ending = false; this.confirmLeave = false;
            this.leavePopup = null; this.exitTransition = null;
            this.rotorAngle = 0; this.levelAt = 0; this.gameplayRevealAt = null;
            this.roundTransitionAt = null; this.transitionFrame = null;
            this.completedAt = 0; this.certificate = null; this.certificateBusy = false; this.certificateNotice = ''; this.certificateError = false;
            this.lobby = null; this._setLobby(lobby);
            if (IP2Live.QuestMinimap) IP2Live.QuestMinimap.destroy();
            this.scene = new IP2Live.PVPRace(); Manager.Stack.push(this.scene);
            this._installStackBridge();
            return true;
        },
        startAI(menu, name) {
            if (this.active || (IP2Live.TutorialReplay && IP2Live.TutorialReplay.session)) return false;
            const seed = Math.floor(Math.random() * 0xffffffff), match = Rules.createMatch([{ id: 'local', name: name || 'Pilot' }, { id: 'ai', name: 'Circuit / AI' }], seed);
            this.aiMatch = match; this.aiRandom = Rules.random(seed ^ 0xa1a1a1);
            this._scheduleAI(match.startsAt);
            return this.start({ match, players: match.players }, 'local', menu, true);
        },
        _scheduleAI(now) {
            const round = Rules.round(this.aiMatch, 'ai'), profile = this.AI_PROFILES[round.game.id];
            const seconds = profile.minSeconds + this.aiRandom() * (profile.maxSeconds - profile.minSeconds);
            // Familiarity speeds up a retry slightly, never below this gameplay's minimum.
            const retryFactor = round.attempt > 0 ? 0.9 : 1;
            this.nextAiAt = now + Math.max(profile.minSeconds, seconds * retryFactor) * 1000;
        },
        _aiResult(round) {
            const profile = this.AI_PROFILES[round.game.id], passed = this.aiRandom() < profile.successChance;
            const total = 8 + Math.floor(this.aiRandom() * 9);
            const mistakes = passed
                ? (this.aiRandom() < profile.cleanChance ? 0 : 1 + Math.floor(this.aiRandom() * profile.maxMistakes))
                : 2 + Math.floor(this.aiRandom() * 3);
            return { roundId: round.id, gameplayId: round.game.id, passed,
                metrics: { totalDecisions: total, correctDecisions: total - mistakes, mistakeCount: mistakes } };
        },
        _setLobby(lobby) {
            if (this.lobby && lobby.id === this.lobby.id && Number(lobby.revision) < Number(this.lobby.revision)) return;
            this.lobby = lobby; this.match = lobby && lobby.match;
            if (Number.isFinite(lobby.serverTime)) this.clockOffset = lobby.serverTime - Date.now();
            else if (this.ai) this.clockOffset = 0;
            if (!this.match) return;
            for (const e of this.match.events || []) {
                if (e.id <= this.lastEvent) continue;
                this.lastEvent = e.id;
                if (e.type === 'bomb') this.animations.push(Object.assign({ startedAt: Date.now() }, e));
            }
            this.me = this.match.players.find(p => p.id === this.playerId);
            this.opponent = this.match.players.find(p => p.id !== this.playerId);
            if (this.match.status === 'finished' && !this.completedAt) this.completedAt = this.serverNow();
        },
        tick() {
            if (!this.active) return;
            const now = Date.now();
            if (this._tickAt === now) return;
            this._tickAt = now;
            if (this.ai) {
                Rules.tick(this.aiMatch, now);
                if (this.aiMatch.status === 'racing' && now >= this.nextAiAt) {
                    const current = Rules.round(this.aiMatch, 'ai');
                    Rules.complete(this.aiMatch, 'ai', this._aiResult(current), now);
                    // One result per tick: a suspended window cannot trigger a burst of wins.
                    if (this.aiMatch.status === 'racing') this._scheduleAI(now);
                    else this.nextAiAt = Infinity;
                }
                this._setLobby({ match: Rules.snapshot(this.aiMatch), players: this.aiMatch.players });
            } else if (!this.polling && now >= this.nextPollAt && !this.closing && !this.ending) {
                this.polling = true; this.nextPollAt = now + 500;
                const session = this.scene;
                Promise.resolve(this.bridge().poll()).then(lobby => {
                    if (!this.active || session !== this.scene) return;
                    this.offlineSince = 0; this._setLobby(lobby);
                }).catch(error => {
                    if (!this.active || session !== this.scene) return;
                    if (!this.offlineSince) this.offlineSince = Date.now();
                    if (Date.now() - this.offlineSince > 12000) this.fail('Connection lost. ' + error.message);
                }).finally(() => { if (session === this.scene) this.polling = false; });
            }
            if (this.pending && !this.pending.sending && now >= this.pending.retryAt) this._submit();
            if (this.match && this.match.status === 'finished' && !this.ending) this._endRound();
            if (this.match && this.match.status === 'racing' && !this.error && !this.pending && !this.isLeavePopupVisible() && !this.round &&
                now >= this.nextRoundAt && Manager.Stack.top === this.scene) this._launchRound();
            this.animations = this.animations.filter(a => now - a.startedAt < 2000);
            Manager.Stack.requestPaintHUD = true;
        },
        serverNow() { return Date.now() + (this.clockOffset || 0); },
        _launchRound() {
            const round = this.ai ? Rules.round(this.aiMatch, this.playerId) : this.me.round;
            if (!round) return this.fail('The host did not provide a gameplay round.');
            if (round.problemVersion !== Rules.PROBLEM_VERSION || !Number.isInteger(round.problemSeed) || round.problemSeed < 0 || round.problemSeed > 0xffffffff)
                return this.fail('Shared problems require the updated desktop build on both devices.');
            this.round = clone(round); this.notice = '';
            // Preserve the exact mask built in Gameplay 3, including retries in Gameplay 4.
            const cidr = round.game.number === '4' ? this.cidrState : null;
            if (round.game.number === '4' && (!cidr || !cidr.latest)) return this.fail('The CIDR handoff is missing. Please start a new race.');
            // Constructors seed positions too: use the same surface as drawing/input.
            const opened = this._virtual(IP2Live.TutorialReplay.launch, IP2Live.TutorialReplay, [round.game.id,
                { practiceMode: true, practiceGameplay: true, pvpMode: true,
                    round: round.index + 1, pvpProblemSeed: round.problemSeed, handoffKey: round.handoffKey, cidrState: cidr }]);
            if (!opened && this.active && !this.error) this.fail('This gameplay could not be opened.');
        },
        configureScreen(screen) {
            screen.options.pvpMode = true;
            screen._ip2liveSessionRestoreChecked = true;
            this._decorate(screen);
        },
        _beginRoundTransition() {
            // Keep the outgoing puzzle visible as the shutters close. No intermission page.
            if (this.canvas) {
                if (!this.transitionFrame) this.transitionFrame = document.createElement('canvas');
                this.transitionFrame.width = this.canvas.width; this.transitionFrame.height = this.canvas.height;
                this.transitionFrame.getContext('2d').drawImage(this.canvas, 0, 0);
            }
            this.roundTransitionAt = Date.now(); this.gameplayRevealAt = null;
            this.nextRoundAt = this.roundTransitionAt + this.ROUND_CLOSE_MS;
        },
        isRoundTransitioning() {
            return this.roundTransitionAt !== null && (this.gameplayRevealAt === null || Date.now() - this.gameplayRevealAt < this.ROUND_OPEN_MS);
        },
        leavePopupProgress() {
            const popup = this.leavePopup;
            if (!popup) return 0;
            const duration = popup.to ? this.LEAVE_OPEN_MS : this.LEAVE_CLOSE_MS;
            const t = Math.max(0, Math.min(1, (Date.now() - popup.changedAt) / duration));
            return popup.from + (popup.to - popup.from) * t * t * (3 - 2 * t);
        },
        isLeavePopupVisible() { return this.confirmLeave || this.leavePopupProgress() > 0; },
        setLeaveConfirmation(open) {
            if (this.closing || this.exitTransition || this.confirmLeave === open) return;
            const from = this.leavePopupProgress();
            this.confirmLeave = open;
            this.leavePopup = { from, to: open ? 1 : 0, changedAt: Date.now(), selected: 'stay' };
            Manager.Stack.requestPaintHUD = true;
        },
        handleLeavePopupKey(key, repeat = false) {
            if (!this.confirmLeave) return true; // Closing still owns input.
            const code = String(key && (key.code || key.key) || key), controls = Data.Keyboards.menuControls || {};
            const equal = name => Data.Keyboards.isKeyEqual && controls[name] && Data.Keyboards.isKeyEqual(key, controls[name]);
            if (['ArrowLeft', 'ArrowUp'].includes(code) || equal('Left') || equal('Up')) this.leavePopup.selected = 'leave';
            else if (['ArrowRight', 'ArrowDown'].includes(code) || equal('Right') || equal('Down')) this.leavePopup.selected = 'stay';
            else if (!repeat && Data.Keyboards.checkCancelMenu(key)) this.setLeaveConfirmation(false);
            else if (!repeat && Data.Keyboards.checkActionMenu(key) && this.leavePopupProgress() >= 0.99) {
                if (this.leavePopup.selected === 'leave') this.requestLeave();
                else this.setLeaveConfirmation(false);
            }
            Manager.Stack.requestPaintHUD = true;
            return true;
        },
        requestLeave() {
            if (!this.active || this.closing || this.exitTransition) return false;
            if (!IP2Live.PVPExitTransition) { this.leave(); return true; }
            this.exitTransition = new IP2Live.PVPExitTransition();
            // Navigation owns the native surface, so bypass the gameplay decorator.
            (this._stackMethods ? this._stackMethods.push : Manager.Stack.push).call(Manager.Stack, this.exitTransition);
            Manager.Stack.requestPaintHUD = true;
            return true;
        },
        onRoundFinished(gameplayId, outcome, result, cidrState) {
            if (!this.active || this.closing || this.ending) return;
            if (outcome === 'cancelled' || outcome === 'finished') { this.setLeaveConfirmation(true); outcome = 'failed'; }
            if (outcome === 'unavailable') { this.fail('This gameplay is unavailable. The race has been stopped.'); return; }
            const round = this.round; if (!round || round.game.id !== gameplayId) return;
            if (outcome === 'completed' && gameplayId === 'ip_cidr_binary_panel') this.cidrState = clone(cidrState);
            if (outcome === 'completed' && gameplayId === 'ip_subnet_simulator') this.cidrState = null;
            const gm = IP2Live.GameManager, extracted = gm._extractGameplayMetrics(gameplayId, result || {}, outcome === 'completed');
            const payload = { roundId: round.id, gameplayId, passed: outcome === 'completed', metrics: {
                totalDecisions: extracted.totalDecisions, correctDecisions: extracted.correctDecisions, mistakeCount: extracted.mistakeCount,
            } };
            this._beginRoundTransition();
            this.round = null; this.pending = { payload, sending: false, retryAt: 0 };
            const music = IP2Live.MusicManager;
            if (music && music.ZONE) music.play(music.ZONE.PVP_RACE || music.ZONE.GAMEPLAY_56);
            this._submit();
        },
        _submit() {
            const pending = this.pending; if (!pending || pending.sending || this.closing) return;
            pending.sending = true;
            const session = this.scene;
            const accepted = lobby => {
                if (!this.active || session !== this.scene || this.pending !== pending) return;
                this._setLobby(lobby); this.pending = null; this.offlineSince = 0;
                const p = this.me, last = p.lastResult;
                this.notice = last && last.passed ? '+' + last.points + ' CHARGE / ' + last.mistakes + ' mistakes' : 'No charge. Attack meter: ' + p.attackCharge + '/3. Retry this gameplay.';
                this.nextRoundAt = Math.max(Date.now(), this.roundTransitionAt + this.ROUND_CLOSE_MS);
            };
            if (this.ai) {
                try { Rules.complete(this.aiMatch, this.playerId, pending.payload); accepted({ match: Rules.snapshot(this.aiMatch) }); }
                catch (e) { this.fail(e.message); }
                return;
            }
            Promise.resolve(this.bridge().result(pending.payload)).then(accepted).catch(error => {
                if (this.pending !== pending || session !== this.scene) return;
                pending.sending = false; pending.retryAt = Date.now() + 1000;
                this.notice = 'Reconnecting / result queued';
                if (!this.offlineSince) this.offlineSince = Date.now();
                if (Date.now() - this.offlineSince > 12000) this.fail(error.message);
            });
        },
        _endRound() {
            this.ending = true;
            this.confirmLeave = false; this.leavePopup = null;
            const replay = IP2Live.TutorialReplay.session;
            // Close calculator overlays before disposing their owning gameplay.
            if (replay && replay.pvp) {
                this._unwindTo(replay.screen);
                IP2Live.TutorialReplay.finish(replay.gameplayId, replay.options, 'cancelled');
            }
            this._unwindTo(this.scene); this.round = null; this.pending = null;
            if (IP2Live.FeatureTelemetry) IP2Live.FeatureTelemetry.endSession(this.telemetrySession, this.error ? 'stopped' : this.closing ? 'left_race' : 'match_finished');
            const music = IP2Live.MusicManager;
            if (!this.closing && music && music.ZONE) music.play(music.ZONE.PVP_RACE || music.ZONE.GAMEPLAY_56);
        },
        fail(message) {
            this.error = String(message || 'Race stopped.'); this._endRound();
        },
        canDownloadCertificate() { return this.active && !this.error && this.match && this.match.status === 'finished' && this.match.winnerId === this.playerId; },
        async downloadCertificate() {
            if (!this.canDownloadCertificate() || this.certificateBusy) return false;
            const session = this.scene;
            this.certificateBusy = true; this.certificateError = false; this.certificateNotice = '';
            try {
                if (!IP2Live.PVPCertificate) throw new Error('Certificate export is unavailable. Please update the game.');
                if (!this.certificate) this.certificate = IP2Live.PVPCertificate.create(this.match, this.playerId, { ai: this.ai, completedAt: this.completedAt });
                await IP2Live.PVPCertificate.download(this.certificate);
                if (session === this.scene) this.certificateNotice = 'Certificate download started.';
                return true;
            } catch (error) {
                if (session === this.scene) { this.certificateNotice = 'Could not download the certificate. Please try again.'; this.certificateError = true; }
                console.warn('[IP2Live] Victory certificate failed:', error); return false;
            } finally { if (session === this.scene) this.certificateBusy = false; Manager.Stack.requestPaintHUD = true; }
        },
        _unwindTo(screen) {
            let count = 0;
            while (screen && Manager.Stack.top !== screen && Manager.Stack.top !== this.scene && count++ < 8) Manager.Stack.pop();
        },
        async leave(transition = null) {
            if (!this.active || this.closing) return;
            this.closing = true;
            const push = this._stackMethods ? this._stackMethods.push : Manager.Stack.push;
            if (transition) transition.moving = true;
            if (transition && Manager.Stack.top === transition) Manager.Stack.pop();
            this._endRound();
            if (Manager.Stack.top === this.scene) Manager.Stack.pop();
            if (transition) push.call(Manager.Stack, transition);
            if (transition) transition.moving = false;
            // Keep the black transition above the stack while the LAN forfeit is acknowledged.
            if (!this.ai && this.bridge()) await Promise.resolve().then(() => this.bridge().leave()).catch(() => {});
            this._restoreStackBridge();
            Core.Game.current = this.savedGame; IP2Live.GameManager.state = this.savedManagerState;
            if (this.hadCidr) IP2Live.CIDRGameplayState = this.savedCidr; else delete IP2Live.CIDRGameplayState;
            if (IP2Live.GameplayPause) { IP2Live.GameplayPause.activeScreen = this.savedPauseScreen; IP2Live.GameplayPause.menuOpen = false; }
            if (IP2Live.HostPowerToolManager) { IP2Live.HostPowerToolManager._active = false; IP2Live.HostPowerToolManager._activeScreen = null; }
            if (this.menu) { this.menu.lobby = null; this.menu.page = 'home'; this.menu.notice = ''; }
            this.active = false; this.closing = false; this.scene = null; this.savedGame = null;
            this.transitionFrame = null; this.roundTransitionAt = null;
            const music = IP2Live.MusicManager; if (music && music.ZONE) music.play(music.ZONE.PVP_MENU || music.ZONE.MAIN_MENU);
            Manager.Stack.requestPaintHUD = true;
        },
        _installStackBridge() {
            const stack = Manager.Stack, mode = this;
            this._stackMethods = { push: stack.push, replace: stack.replace };
            for (const method of ['push', 'replace']) {
                if (typeof stack[method] !== 'function') continue;
                stack[method] = function (screen) { if (mode.active && screen !== mode.scene) mode._decorate(screen); return mode._stackMethods[method].apply(this, arguments); };
            }
        },
        _restoreStackBridge() {
            if (!this._stackMethods) return;
            Object.assign(Manager.Stack, this._stackMethods); this._stackMethods = null;
        },
        _surface() {
            if (!this.canvas) { this.canvas = document.createElement('canvas'); this.virtualContext = this.canvas.getContext('2d'); }
            const w = Common.ScreenResolution.SCREEN_X, h = Common.ScreenResolution.SCREEN_Y;
            if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
            return this.virtualContext;
        },
        viewport(ctx) {
            const width = Math.floor(ctx.canvas.width * this.GAMEPLAY_FRACTION), scale = Math.min(width / Common.ScreenResolution.SCREEN_X, ctx.canvas.height / Common.ScreenResolution.SCREEN_Y);
            return { x: (width - Common.ScreenResolution.SCREEN_X * scale) / 2, y: (ctx.canvas.height - Common.ScreenResolution.SCREEN_Y * scale) / 2,
                w: Common.ScreenResolution.SCREEN_X * scale, h: Common.ScreenResolution.SCREEN_Y * scale, width, scale };
        },
        _virtual(fn, receiver, args) {
            const actual = Common.Platform.ctx;
            Common.Platform.ctx = this._surface();
            try { return fn.apply(receiver, args); } finally { Common.Platform.ctx = actual; }
        },
        _decorate(screen) {
            if (!screen || screen._pvpDecorated) return;
            screen._pvpDecorated = true;
            const mode = this, draw = screen.drawHUD, update = screen.update;
            screen.drawHUD = function () {
                const ctx = Common.Platform.ctx;
                // An overlay may draw its underlying gameplay; avoid composing recursively.
                if (ctx === mode.virtualContext) return draw && draw.apply(this, arguments);
                const v = mode.viewport(ctx);
                if (draw) mode._virtual(draw, this, arguments);
                ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.fillStyle = '#030710'; ctx.fillRect(0, 0, v.width, ctx.canvas.height);
                ctx.drawImage(mode.canvas, v.x, v.y, v.w, v.h); ctx.restore();
                // Start the reveal when a gameplay is actually visible, including after a late LAN poll or load.
                if (mode.gameplayRevealAt === null && mode.match.status === 'racing' && !mode.error && !mode.ending) mode.gameplayRevealAt = Date.now();
                if (IP2Live.PVPUI) IP2Live.PVPUI.race(ctx, mode);
            };
            screen.update = function () {
                mode.tick();
                if (mode.active && !mode.ending && !mode.isLeavePopupVisible() && !mode.error && update) return mode._virtual(update, this, arguments);
            };
            let pointerCaptured = false;
            for (const method of ['onMouseDown', 'onMouseUp', 'onMouseMove']) {
                const original = screen[method];
                screen[method] = function (x, y, ...rest) {
                    const ctx = Common.Platform.ctx, v = mode.viewport(ctx);
                    if (mode.exitTransition || mode.closing) return true;
                    if (mode.isLeavePopupVisible()) {
                        pointerCaptured = false;
                        if (method === 'onMouseUp' && IP2Live.PVPUI) IP2Live.PVPUI.click(ctx, mode, x, y);
                        if (method === 'onMouseMove' && IP2Live.PVPUI) IP2Live.PVPUI.hoverLeave(ctx, mode, x, y);
                        return true;
                    }
                    const captured = pointerCaptured;
                    if (method === 'onMouseUp') pointerCaptured = false;
                    if (captured && (method === 'onMouseUp' || method === 'onMouseMove')) {
                        if (original && !mode.confirmLeave && !mode.ending) return mode._virtual(original, this, [(x - v.x) / v.scale, (y - v.y) / v.scale, ...rest]);
                        return true;
                    }
                    if (method === 'onMouseUp' && IP2Live.PVPUI && IP2Live.PVPUI.click(ctx, mode, x, y)) return true;
                    if (mode.isRoundTransitioning()) { pointerCaptured = false; return true; }
                    if (x < v.x || x > v.x + v.w || y < v.y || y > v.y + v.h || mode.confirmLeave || mode.ending) return true;
                    if (method === 'onMouseDown') pointerCaptured = true;
                    if (original) return mode._virtual(original, this, [(x - v.x) / v.scale, (y - v.y) / v.scale, ...rest]);
                    return true;
                };
            }
            for (const method of ['onKeyPressed', 'onKeyPressedAndRepeat', 'onKeyReleased']) {
                const original = screen[method];
                screen[method] = function (key) {
                    if (mode.exitTransition || mode.closing) return true;
                    if (mode.isLeavePopupVisible()) return method === 'onKeyReleased' ? true : mode.handleLeavePopupKey(key, method !== 'onKeyPressed');
                    if (method === 'onKeyPressed' && Data.Keyboards.checkCancelMenu(key)) {
                        if (mode.ending || mode.error) { mode.requestLeave(); return true; }
                        if (typeof this._closeGameplayOverlay === 'function' && this._closeGameplayOverlay()) return true;
                        if (this !== (IP2Live.TutorialReplay.session && IP2Live.TutorialReplay.session.screen) && original) return mode._virtual(original, this, arguments);
                        mode.setLeaveConfirmation(true); return true;
                    }
                    if (mode.confirmLeave || mode.ending || mode.error) {
                        if (method === 'onKeyPressed' && Data.Keyboards.checkActionMenu(key)) mode.requestLeave();
                        return true;
                    }
                    if (mode.isRoundTransitioning()) return true;
                    if (original) return mode._virtual(original, this, arguments);
                    return true;
                };
            }
        },
    };
    IP2Live.PVPMode = mode;
})();
