/** Shared timer configuration. EndlessMode owns its authoritative round deadline. */
(function () {
    const frames = new WeakMap();
    const Timer = {
        DEFAULT_SECONDS: 180,
        isEndless(options) {
            const o = options || {}, s = o.spec || {};
            return [o, s].some(v => v.endlessMode === true || v.unlimitedMode === true || v.featureMode === 'endless');
        },
        // Constructor > launch options > quest spec > existing gameplay default.
        // Invalid values fall through; fractional seconds are supported down to one second.
        resolve(options, timeSeconds, fallback = 180, aliases = [], allowZero = false) {
            const o = options || {}, keys = ['timeLimitSeconds', 'timeSeconds'].concat(aliases);
            const values = [timeSeconds];
            for (const source of [o, o.spec || {}]) for (const key of keys) values.push(source[key]);
            for (const value of values) {
                if (value === undefined || value === null || value === '' || typeof value === 'boolean') continue;
                const n = Number(value);
                if (allowZero && n === 0 && !this.isEndless(o)) return 0;
                if (Number.isFinite(n) && n > 0) return Math.max(1, n);
            }
            return fallback;
        },
        launchOptions(options, timeSeconds) {
            const o = options || {}, result = {};
            if (o.spec) result.spec = o.spec;
            for (const key of ['timeLimitSeconds', 'timeSeconds', 'solveTimeSeconds', 'durationSeconds', 'time',
                'endlessMode', 'unlimitedMode', 'featureMode', 'preparationTimeSeconds']) {
                if (o[key] !== undefined) result[key] = o[key];
            }
            if (timeSeconds !== undefined) result.timeLimitSeconds = timeSeconds;
            return result;
        },
        reset(screen) {
            const seconds = this.resolve(screen.options, screen._constructorTimeSeconds, this.DEFAULT_SECONDS);
            screen.timeLimitSeconds = seconds;
            screen.timerEnabled = this.isEndless(screen.options);
            screen.gameplayTimer = { limitSeconds: seconds, enabled: screen.timerEnabled,
                elapsedMs: 0, remainingMs: seconds * 1000, expired: false };
            this.forget(screen);
        },
        forget(screen) {
            if (screen) frames.delete(screen);
            if (screen?._endlessClockOwned && IP2Live.EndlessMode?.active && IP2Live.EndlessMode.round &&
                IP2Live.TutorialReplay?.session?.screen === screen) {
                IP2Live.EndlessMode.round.lastAt = null; IP2Live.EndlessMode.round.wasRunning = false;
            }
        },
        available(screen) {
            if (!screen || screen.loading || screen._ip2liveGameplayExited) return false;
            if (IP2Live.GameplayPause && IP2Live.GameplayPause.menuOpen) return false;
            if (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive && IP2Live.DialogueManager.isActive()) return false;
            if (typeof document !== 'undefined' && (document.hidden ||
                (typeof document.hasFocus === 'function' && !document.hasFocus()))) return false;
            if (typeof Manager !== 'undefined' && Manager.Stack && Manager.Stack.top && Manager.Stack.top !== screen) return false;
            return true;
        },
        // No intervals/listeners or absolute persisted deadlines. Only active frame intervals count.
        // A suspension over one second is discarded, and the first resumed frame never catches up.
        deltaMs(screen, running = true, now = Date.now()) {
            // Endless synchronizes every native countdown from one clock. A second
            // decrement would make native timed games expire ahead of their budget.
            if (screen._endlessClockOwned) return 0;
            const active = running && this.available(screen);
            const previous = frames.get(screen);
            frames.set(screen, { at: now, active });
            if (!active || !previous || !previous.active) return 0;
            const elapsed = now - previous.at;
            return Number.isFinite(elapsed) && elapsed > 0 && elapsed <= 1000 ? elapsed : 0;
        },
        running(screen, phases) {
            const dialogue = IP2Live.DialogueManager;
            if (screen.finished || screen._finished || screen.completed || screen.tutorialPaused ||
                screen.tutorialPromptActive || screen.tutorialDialogueOpen || screen.pendingMistakeDialogue ||
                screen.helpOpen || screen.calculatorOpen || screen.hostPowerToolOpen ||
                (screen.guidedTutorial && !screen.tutorialComplete) ||
                (dialogue && dialogue.isActive && dialogue.isActive())) return false;
            return !phases || phases.includes(screen.phase);
        },
        update(screen, phases) {
            const clock = screen.gameplayTimer;
            if (!clock || !clock.enabled) return false;
            if (screen._endlessClockOwned) return clock.expired;
            if (clock.expired) return true;
            const elapsed = this.deltaMs(screen, this.running(screen, phases));
            clock.elapsedMs = Math.min(clock.limitSeconds * 1000, clock.elapsedMs + elapsed);
            clock.remainingMs = Math.max(0, clock.limitSeconds * 1000 - clock.elapsedMs);
            if (clock.remainingMs > 0) return false;
            clock.expired = true; // Commit before the callback can navigate or re-enter update.
            screen._onTimerExpired();
            if (typeof Manager !== 'undefined' && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            return true;
        },
        result(screen) {
            const clock = screen.gameplayTimer;
            if (!clock) return {};
            return { timerEnabled: clock.enabled, timeLimitSeconds: clock.enabled ? clock.limitSeconds : 0,
                configuredTimeLimitSeconds: clock.limitSeconds,
                timeRemainingMs: clock.enabled ? clock.remainingMs : null,
                timerElapsedMs: clock.enabled ? clock.elapsedMs : null };
        },
        draw(screen, ctx) {
            const clock = screen.gameplayTimer;
            if (!ctx || !ctx.canvas || !clock || !clock.enabled) return;
            const scale = Math.min(ctx.canvas.width / 1280, ctx.canvas.height / 720);
            // Leave the existing centered pause button and right-hand helper buttons clear.
            const w = 184 * scale, h = 30 * scale, x = ctx.canvas.width / 2 - 273 * scale, y = 2 * scale;
            const seconds = Math.max(0, Math.ceil(clock.remainingMs / 1000));
            const text = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
            const color = seconds <= 10 ? '#FF638C' : seconds <= 30 ? '#E6BE70' : '#62E6D8';
            ctx.save();
            ctx.fillStyle = '#0A1822'; ctx.strokeStyle = color; ctx.lineWidth = scale;
            ctx.beginPath(); ctx.moveTo(x + 7 * scale, y); ctx.lineTo(x + w, y);
            ctx.lineTo(x + w, y + h - 7 * scale); ctx.lineTo(x + w - 7 * scale, y + h);
            ctx.lineTo(x, y + h); ctx.lineTo(x, y + 7 * scale); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.font = '600 ' + Math.round(15 * scale) + 'px Oxanium-Medium, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
            ctx.fillText('TIME  ' + text, x + w / 2, y + h * 0.47);
            ctx.fillRect(x + 7 * scale, y + h - 3 * scale,
                (w - 14 * scale) * clock.remainingMs / (clock.limitSeconds * 1000), 2 * scale);
            ctx.restore();
        },
    };
    IP2Live.GameplayTimer = Timer;
})();
