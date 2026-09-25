/** Canvas-native Neural Deck diagnostic and optional tutorial support. */
class IP2LiveARDiagnosticRewindScreen extends Scene.Base {
    constructor(options) {
        super(true);
        this.options = options || {};
        this.tick = 0;
        this.title = this.options.title || 'AR DIAGNOSTIC';
        this.lines = Array.isArray(this.options.lines) && this.options.lines.length
            ? this.options.lines.map(String) : ['Review the feedback, then try again.'];
        this.actions = Array.isArray(this.options.actions) && this.options.actions.length
            ? this.options.actions.slice(0, 2) : [{ id: 'continue', label: 'Continue' }];
        this.selectedIndex = 0;
        this.hoverIndex = -1;
        this.scrollOffset = 0;
        this.maxScroll = 0;
        this.pressedIndex = -1;
        this._pointerDownSeen = false;
        this._finished = false;
        this._exitTick = null;
        this._pendingAction = null;
        this._warningView = 'offer';
        this._warningTextStart = 268;
        this._warningRevealTick = null;
        this._warningTransition = null;
        this._continueAction = null;
        this.parentScene = null;
        this.signalTrails = [];
        this._seedDiagnosticVisuals();
    }

    initialize() { this.tick = 0; }
    async load() { this.loading = false; this._paint(); }
    update() {
        this.tick++;
        if (this._exitTick !== null) {
            this._exitTick++;
            // Keep the scene on the stack through a fully black frame.
            if (this._exitTick > 54) {
                this._completeAction(this._pendingAction);
                return;
            }
        }
        if (this.options.tutorialSection) {
            if (this._warningTransition && this.tick - this._warningTransition.start > 48) {
                this._warningView = this._warningTransition.target;
                this._warningTransition = null;
                this._warningTextStart = this.tick;
                this._warningRevealTick = this._warningView === 'offer' ? this.tick : null;
                this._wordGlitch = null;
                this._nextWordGlitchAt = null;
                this._lastGlitchWord = null;
                this.scrollOffset = 0;
                this.selectedIndex = -1;
                this.hoverIndex = -1;
                this.pressedIndex = -1;
                this._pointerDownSeen = false;
                this._warningFocus = this._warningActions().map(() => 0);
                if (this._warningView === 'offer') this._continueAction = null;
            }
            this._seedSpaceVisuals();
            for (const particle of this.particles) {
                particle.y -= particle.speed * 0.6;
                particle.x += particle.drift;
                if (particle.y < -20) particle.y = 760;
            }
            if (!this._warningFocus) this._warningFocus = this._warningActions().map(() => 0);
            this._warningFocus.forEach((mix, index) => {
                this._warningFocus[index] += ((index === this.hoverIndex ? 1 : 0) - mix) * 0.09;
            });
        }
        this._paint();
    }
    _paint() { if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true; }
    draw3D() {
        if (this.options.tutorialSection && this.tick < 72 && this.parentScene && typeof this.parentScene.draw3D === 'function') {
            this.parentScene.draw3D();
        } else if (Manager && Manager.GL && Manager.GL.renderer) Manager.GL.renderer.clear();
    }

    _key(key) {
        const value = key && (key.name || key.code || key.key || key.keyCode || key.which || key);
        const codes = { 13: 'ENTER', 32: 'SPACE', 27: 'ESCAPE', 9: 'TAB', 37: 'ARROWLEFT', 38: 'ARROWUP', 39: 'ARROWRIGHT', 40: 'ARROWDOWN', 33: 'PAGEUP', 34: 'PAGEDOWN' };
        return codes[value] || String(value || '').toUpperCase();
    }

    _engineKey(method, key) {
        const keyboards = typeof Data !== 'undefined' && Data.Keyboards;
        return !!(keyboards && typeof keyboards[method] === 'function' && keyboards[method](key));
    }

    _engineDirection(key) {
        const keyboards = typeof Data !== 'undefined' && Data.Keyboards;
        const controls = keyboards && keyboards.menuControls;
        if (!keyboards || !controls || typeof keyboards.isKeyEqual !== 'function') return 0;
        if (keyboards.isKeyEqual(key, controls.Left) || keyboards.isKeyEqual(key, controls.Up)) return -1;
        if (keyboards.isKeyEqual(key, controls.Right) || keyboards.isKeyEqual(key, controls.Down)) return 1;
        return 0;
    }

    onKeyPressed(key) {
        if (this._finished) return true;
        const value = this._key(key);
        if (this.options.tutorialSection) {
            if (['ENTER', 'SPACE', 'SPACEBAR', ' '].includes(value)) this._revealWarningText();
            return true;
        }
        if (this._engineKey('checkCancelMenu', key) || value === 'ESCAPE') {
            this._finish(Math.max(0, this.actions.findIndex((action) => action.id === 'continue')));
        } else if (this._engineKey('checkActionMenu', key) || ['ENTER', 'SPACE', 'SPACEBAR', ' '].includes(value)) {
            this._finish(this.selectedIndex);
        } else {
            this._navigateKey(key, value);
        }
        return true;
    }

    onKeyPressedAndRepeat(key) {
        if (this._finished || this.options.tutorialSection) return true;
        return this._navigateKey(key, this._key(key));
    }

    _navigateKey(key, value) {
        let delta = this._engineDirection(key);
        if (!delta && ['TAB', 'ARROWRIGHT', 'ARROWDOWN', 'ARROWLEFT', 'ARROWUP'].includes(value)) {
            delta = value === 'ARROWLEFT' || value === 'ARROWUP' ? -1 : 1;
        }
        if (delta) {
            this.selectedIndex = (this.selectedIndex + delta + this.actions.length) % this.actions.length;
            this.hoverIndex = -1;
            this._playSound('soundCursor');
            this._paint();
        } else if (value === 'PAGEDOWN' || value === 'PAGEUP') {
            this.scrollOffset = Math.max(0, Math.min(this.maxScroll, this.scrollOffset + (value === 'PAGEDOWN' ? 100 : -100)));
            this._paint();
        }
        return true;
    }

    _layout() {
        const resolution = Common.ScreenResolution || {};
        const sw = resolution.SCREEN_X || 1280;
        const sh = resolution.SCREEN_Y || 720;
        const w = Math.min(860, sw - 40);
        const h = Math.min(this.options.tutorialSection ? 530 : 470, sh - 40);
        const x = (sw - w) / 2, y = (sh - h) / 2;
        const gap = 14, inset = 32;
        const actions = this.options.tutorialSection ? this._warningActions() : this.actions;
        const buttonW = (w - inset * 2 - gap * (actions.length - 1)) / actions.length;
        const buttons = actions.map((action, index) => ({ x: x + inset + index * (buttonW + gap), y: y + h - 80, w: buttonW, h: 48 }));
        return { sw, sh, x, y, w, h, buttons };
    }

    _buttonAt(x, y) {
        if (this._finished || this._warningTransition) return -1;
        if (this.options.tutorialSection && this.tick < this._warningTiming().ready) return -1;
        const point = this._logicalPointer(x, y);
        if (!point) return -1;
        return this._layout().buttons.findIndex((r) => point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h);
    }
    _logicalPointer(x, y) {
        if (x && typeof x === 'object') {
            const event = x;
            y = event.y !== undefined ? event.y : (event.offsetY !== undefined ? event.offsetY : event.clientY);
            x = event.x !== undefined ? event.x : (event.offsetX !== undefined ? event.offsetX : event.clientX);
        }
        if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) return null;
        const l = this._layout();
        const ctx = Common && Common.Platform && Common.Platform.ctx;
        const width = ctx && ctx.canvas ? ctx.canvas.width : l.sw;
        const height = ctx && ctx.canvas ? ctx.canvas.height : l.sh;
        return { x: Number(x) * l.sw / Math.max(1, width), y: Number(y) * l.sh / Math.max(1, height) };
    }
    onMouseMove(x, y) {
        this.hoverIndex = this._buttonAt(x, y);
        if (this.hoverIndex >= 0) this.selectedIndex = this.hoverIndex;
        this._paint();
        return true;
    }
    onMouseDown(x, y) {
        this._pointerDownSeen = true;
        this.pressedIndex = this._buttonAt(x, y);
        if (this.pressedIndex >= 0) {
            this.selectedIndex = this.pressedIndex;
            this._paint();
        }
        return true;
    }
    onMouseUp(x, y) {
        if (this.options.tutorialSection && this._logicalPointer(x, y) && this._revealWarningText()) {
            this.pressedIndex = -1;
            this._pointerDownSeen = false;
            return true;
        }
        const index = this._buttonAt(x, y);
        // Some engine builds omit mouse-down for modal scenes. Accept that
        // path while still rejecting drag-release activation.
        if (index >= 0 && (!this._pointerDownSeen || this.pressedIndex === index)) this._finish(index);
        this.pressedIndex = -1;
        this._pointerDownSeen = false;
        return true;
    }
    _playSound(name) {
        const systems = typeof Data !== 'undefined' && Data.Systems;
        const sound = systems && systems[name];
        if (sound && typeof sound.playSound === 'function') sound.playSound();
    }
    _finish(index) {
        if (this._finished) return;
        const actions = this.options.tutorialSection ? this._warningActions() : this.actions;
        let action = actions[index === undefined ? this.selectedIndex : index];
        if (!action) return;
        if (this.options.tutorialSection) {
            if (this._warningTransition || this.tick < this._warningTiming().ready) return;
            if (this._warningView === 'offer' && action.id === 'continue') {
                this._continueAction = action;
                this._transitionWarning('confirm');
                return;
            }
            if (this._warningView === 'confirm') {
                if (action.id === 'back') {
                    this._transitionWarning('offer');
                    return;
                }
                action = this._continueAction;
                if (!action) return;
            }
        }
        this._finished = true;
        this._playSound('soundConfirmation');
        if (this.options.tutorialSection) {
            this._pendingAction = action;
            this._exitTick = 0;
            this._paint();
            return;
        }
        this._completeAction(action);
    }

    _warningActions() {
        return this._warningView === 'confirm'
            ? [{ id: 'confirm', label: 'Confirm' }, { id: 'back', label: 'Go Back' }]
            : this.actions;
    }

    _revealWarningText() {
        if (this._finished || this._warningTransition || this._warningRevealTick !== null) return false;
        const timing = this._warningTiming();
        if (this.tick < timing.textStart || this.tick >= timing.textEnd) return false;
        this._warningRevealTick = this.tick;
        this._paint();
        return true;
    }

    _warningVisibleCount(timing, rowIndex) {
        return this._warningRevealTick !== null ? Infinity
            : Math.max(0, Math.floor((this.tick - timing.rowStarts[rowIndex]) / timing.characterTicks));
    }

    _transitionWarning(target) {
        this._warningTransition = { target, start: this.tick };
        this.hoverIndex = -1;
        this._playSound('soundConfirmation');
        this._paint();
    }

    _completeAction(action) {
        if (this._actionCompleted) return;
        this._actionCompleted = true;
        if (Manager && Manager.Stack && Manager.Stack.top === this) Manager.Stack.pop();
        this._paint();
        if (typeof action.onSelect === 'function') action.onSelect();
        if (typeof this.options.onComplete === 'function') this.options.onComplete(action.id);
    }

    _plate(ctx, x, y, w, h, cut) {
        const c = cut || 12;
        ctx.beginPath();
        ctx.moveTo(x + c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - c);
        ctx.lineTo(x + w - c, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + c); ctx.closePath();
    }
    _wrap(ctx, text, width, tracking = 0) {
        const rows = [];
        const measure = (value) => this._trackedWidth(ctx, value, tracking);
        for (const paragraph of String(text).split('\n')) {
            let row = '';
            for (const word of paragraph.split(/\s+/)) {
                if (row && measure(row + ' ' + word) > width) { rows.push(row); row = ''; }
                // Split unusually long tokens so feedback cannot extend out of the panel.
                for (const char of (row ? ' ' : '') + word) {
                    if (row && measure(row + char) > width) { rows.push(row); row = ''; }
                    row += char;
                }
            }
            rows.push(row);
        }
        return rows;
    }
    _fit(ctx, text, width, size, family) {
        let fontSize = size;
        ctx.font = 'bold ' + fontSize + 'px ' + family;
        while (fontSize > 12 && ctx.measureText(text).width > width) {
            fontSize--; ctx.font = 'bold ' + fontSize + 'px ' + family;
        }
    }

    _seedDiagnosticVisuals() {
        if (this.signalTrails.length) return;
        let seed = 0xD1A640;
        const random = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
        };
        for (let i = 0; i < 24; i++) {
            this.signalTrails.push({
                x: random(), y: random(), width: 26 + random() * 120,
                speed: 0.08 + random() * 0.34, alpha: 0.025 + random() * 0.085,
                color: i % 5 === 0 ? '255,230,0' : '255,42,82',
            });
        }
    }

    _linear(ctx, x0, y0, x1, y1, stops, fallback) {
        if (!ctx.createLinearGradient) return fallback;
        const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
        stops.forEach((stop) => gradient.addColorStop(stop[0], stop[1]));
        return gradient;
    }

    _radial(ctx, x0, y0, r0, x1, y1, r1, stops, fallback) {
        if (!ctx.createRadialGradient) return fallback;
        const gradient = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
        stops.forEach((stop) => gradient.addColorStop(stop[0], stop[1]));
        return gradient;
    }

    _drawBackdrop(ctx, l, accent) {
        ctx.fillStyle = this._linear(ctx, 0, 0, l.sw, l.sh,
            [[0, '#03040A'], [0.48, '#0C0911'], [1, '#020308']], '#05060C');
        ctx.fillRect(0, 0, l.sw, l.sh);
        ctx.strokeStyle = 'rgba(255,49,88,0.055)'; ctx.lineWidth = 1;
        for (let gx = -l.sh; gx < l.sw; gx += 34) {
            ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx + l.sh, l.sh); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(90,218,231,0.026)';
        for (let gx = 0; gx < l.sw + l.sh; gx += 57) {
            ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx - l.sh, l.sh); ctx.stroke();
        }
        this.signalTrails.forEach((trail, index) => {
            const travel = (trail.x * l.sw + this.tick * trail.speed * 2.2) % (l.sw + trail.width) - trail.width;
            const py = trail.y * l.sh;
            ctx.fillStyle = 'rgba(' + trail.color + ',' + trail.alpha.toFixed(3) + ')';
            ctx.fillRect(travel, py, trail.width, index % 4 === 0 ? 2 : 1);
            ctx.fillRect(travel + trail.width - 2, py - 3, 3, 7);
        });
        ctx.fillStyle = 'rgba(0,0,0,0.13)';
        for (let gy = (this.tick * 0.25) % 4; gy < l.sh; gy += 4) ctx.fillRect(0, gy, l.sw, 1);
        const glow = this._radial(ctx, l.sw * 0.52, l.sh * 0.48, 10, l.sw * 0.52, l.sh * 0.48, l.sw * 0.55,
            [[0, accent === '#FFE600' ? 'rgba(255,230,0,0.055)' : 'rgba(255,35,79,0.07)'], [0.55, 'rgba(255,20,67,0.018)'], [1, 'rgba(0,0,0,0.74)']], 'rgba(0,0,0,0.28)');
        ctx.fillStyle = glow; ctx.fillRect(0, 0, l.sw, l.sh);
    }

    _seedSpaceVisuals() {
        // Scene.Base calls the virtual load() method from its constructor.
        // At that point this subclass constructor has not assigned these
        // collections yet, so initialize them here as well as in constructor.
        if (!Array.isArray(this.particles)) this.particles = [];
        if (!Array.isArray(this.traces)) this.traces = [];
        if (!Array.isArray(this.shards)) this.shards = [];
        if (this.particles.length) return;
        let seed = 0xA93F17;
        const random = () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
        };
        for (let i = 0; i < 84; i++) {
            this.particles.push({
                x: random() * 1280, y: random() * 720,
                speed: 0.12 + random() * 0.42,
                drift: (random() - 0.5) * 0.12,
                radius: 0.5 + random() * 1.8,
                alpha: 0.035 + random() * 0.18,
            });
        }
        for (let i = 0; i < 15; i++) {
            this.traces.push({
                x: random(), y: random(), length: 0.08 + random() * 0.22,
                bend: (random() - 0.5) * 0.12, speed: 0.00025 + random() * 0.00065,
                phase: random() * Math.PI * 2,
            });
        }
        for (let i = 0; i < 11; i++) {
            this.shards.push({
                x: random(), y: random(), w: 30 + random() * 150,
                h: 2 + random() * 13, phase: random() * Math.PI * 2,
            });
        }
    }

    _drawSpaceBackdrop(ctx, l, activity) {
        if (activity <= 0) return;
        this._seedSpaceVisuals();
        ctx.save();
        ctx.globalAlpha *= activity;
        ctx.fillStyle = this._linear(ctx, 0, 0, l.sw, l.sh,
            [[0, '#020207'], [0.45, '#09030B'], [0.76, '#030309'], [1, '#0B0005']], '#050208');
        ctx.fillRect(0, 0, l.sw, l.sh);
        ctx.strokeStyle = 'rgba(255,28,70,0.038)';
        ctx.lineWidth = 1;
        for (let d = -l.sh; d < l.sw; d += 24) {
            ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d + l.sh, l.sh); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(130,190,205,0.025)';
        for (let d = 0; d < l.sw + l.sh; d += 31) {
            ctx.beginPath(); ctx.moveTo(d, 0); ctx.lineTo(d - l.sh, l.sh); ctx.stroke();
        }
        for (const trace of this.traces) {
            const drift = Math.sin(this.tick * trace.speed * 90 + trace.phase) * 22;
            const x = trace.x * l.sw + drift;
            const y = trace.y * l.sh;
            const length = trace.length * l.sw;
            ctx.strokeStyle = 'rgba(255,32,73,0.10)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + length * 0.35, y);
            ctx.lineTo(x + length * 0.48, y + trace.bend * l.sh);
            ctx.lineTo(x + length, y + trace.bend * l.sh);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,70,104,0.24)';
            ctx.fillRect(x + length - 2, y + trace.bend * l.sh - 2, 4, 4);
        }
        for (const particle of this.particles) {
            ctx.fillStyle = 'rgba(255,78,112,' + particle.alpha.toFixed(3) + ')';
            ctx.fillRect(particle.x / 1280 * l.sw, particle.y / 720 * l.sh, particle.radius, particle.radius);
        }
        for (const shard of this.shards) {
            const flicker = 0.5 + 0.5 * Math.sin(this.tick * 0.045 + shard.phase);
            ctx.fillStyle = 'rgba(255,15,62,' + (0.015 + flicker * 0.035).toFixed(3) + ')';
            ctx.fillRect(shard.x * l.sw, shard.y * l.sh, shard.w, shard.h);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        for (let y = (this.tick * 0.35) % 4; y < l.sh; y += 4) ctx.fillRect(0, y, l.sw, 1);
        const vignette = this._radial(ctx, l.sw / 2, l.sh / 2, l.sh * 0.12, l.sw / 2, l.sh / 2, l.sw * 0.72,
            [[0, 'rgba(0,0,0,0)'], [0.63, 'rgba(0,0,0,0.16)'], [1, 'rgba(0,0,0,0.92)']], 'rgba(0,0,0,0.25)');
        ctx.fillStyle = vignette; ctx.fillRect(0, 0, l.sw, l.sh);
        ctx.restore();
    }

    _warningTiming() {
        const l = this._layout();
        const ctx = Common && Common.Platform && Common.Platform.ctx;
        const assets = IP2Live.Assets || {};
        const font = assets.oxaniumMediumLoaded ? 'Oxanium-Medium' : 'sans-serif';
        const fontSize = l.w < 600 ? 16 : 19;
        const tracking = 0.65;
        const lines = this._warningView === 'confirm'
            ? ['Continue without replaying the tutorial? You will return to the current security level and try again.']
            : this.lines;
        const text = lines.join('\n\n');
        let rows = lines;
        if (ctx) {
            ctx.save();
            ctx.font = fontSize + 'px ' + font;
            rows = this._wrap(ctx, text, l.w - 88, tracking);
            ctx.restore();
        }
        const textStart = this._warningTextStart, characterTicks = 2, lineGap = 16;
        let nextStart = textStart;
        const rowStarts = rows.map((row) => {
            const start = nextStart;
            nextStart += Array.from(row).length * characterTicks + lineGap;
            return start;
        });
        const revealed = this._warningRevealTick !== null;
        const textEnd = revealed ? this._warningRevealTick : nextStart - lineGap;
        const buttonsStart = textEnd + (revealed ? 0 : 72);
        return { rows, rowStarts, fontSize, tracking, textStart, characterTicks, textEnd, buttonsStart,
            ready: buttonsStart + (this._warningActions().length - 1) * 42 + 60 };
    }

    _warningFade(start, duration) {
        const t = Math.max(0, Math.min(1, (this.tick - start) / duration));
        return t * t * (3 - 2 * t);
    }

    _trackedWidth(ctx, text, tracking = 0) {
        return ctx.measureText(text).width + Math.max(0, Array.from(text).length - 1) * tracking;
    }

    _fillTrackedText(ctx, text, x, y, tracking) {
        if (!tracking) { ctx.fillText(text, x, y); return; }
        ctx.save();
        if ('letterSpacing' in ctx) {
            ctx.letterSpacing = tracking + 'px';
            ctx.fillText(text, x, y);
        } else {
            // Older game runtimes do not implement canvas letterSpacing.
            let cursor = x - this._trackedWidth(ctx, text, tracking) / 2;
            ctx.textAlign = 'left';
            for (const char of Array.from(text)) {
                ctx.fillText(char, cursor, y);
                cursor += ctx.measureText(char).width + tracking;
            }
        }
        ctx.restore();
    }

    _warningGlitch(timing, now = Date.now()) {
        if (this._warningTransition || this._finished || this.tick < timing.textStart) {
            this._wordGlitch = null;
            this._nextWordGlitchAt = null;
            return null;
        }
        if (this._nextWordGlitchAt == null) this._nextWordGlitchAt = now + 2000;
        if (now >= this._nextWordGlitchAt) {
            this._nextWordGlitchAt = now + 2000;
            const words = [];
            timing.rows.forEach((row, rowIndex) => {
                const count = this._warningVisibleCount(timing, rowIndex);
                for (const match of row.matchAll(/\S+/g)) {
                    const end = match.index + match[0].length;
                    words.push({ rowIndex, start: match.index, end, text: match[0],
                        visible: Array.from(row.slice(0, end)).length <= count, key: rowIndex + ':' + match.index });
                }
            });
            const choices = [];
            for (let index = 0; index + 2 < words.length; index++) {
                const phrase = words.slice(index, index + 3);
                if (!phrase.every(word => word.visible) || phrase[0].key === this._lastGlitchWord) continue;
                const parts = [];
                for (const word of phrase) {
                    let part = parts[parts.length - 1];
                    if (!part || part.rowIndex !== word.rowIndex) {
                        part = { rowIndex: word.rowIndex, start: word.start, text: word.text };
                        parts.push(part);
                    } else part.text = timing.rows[word.rowIndex].slice(part.start, word.end);
                }
                choices.push({ key: phrase[0].key, parts });
            }
            const phrase = choices[Math.floor(Math.random() * choices.length)];
            this._wordGlitch = phrase ? { ...phrase, started: now, until: now + 440, seed: Math.random() * 1000 } : null;
            if (phrase) this._lastGlitchWord = phrase.key;
        }
        if (this._wordGlitch && now >= this._wordGlitch.until) this._wordGlitch = null;
        return this._wordGlitch;
    }

    _drawWordGlitch(ctx, glitch, part, row, center, y, timing) {
        const prefix = row.slice(0, part.start);
        const x = center - this._trackedWidth(ctx, row, timing.tracking) / 2
            + (prefix ? this._trackedWidth(ctx, prefix, timing.tracking) + timing.tracking : 0);
        const width = this._trackedWidth(ctx, part.text, timing.tracking);
        const phase = Math.floor((Date.now() - glitch.started) / 65);
        ctx.save();
        ctx.beginPath(); ctx.rect(x - 2, y - timing.fontSize, width + 4, timing.fontSize + 4); ctx.clip();
        // Stronger RGB tearing and static stay confined to the three-word phrase.
        for (let band = 0; band < 5; band++) {
            const noise = Math.sin(glitch.seed + phase * 19 + band * 37);
            const bandY = y - timing.fontSize + band * timing.fontSize / 5;
            ctx.save();
            ctx.beginPath(); ctx.rect(x - 2, bandY, width + 4, 4); ctx.clip();
            ctx.fillStyle = 'rgba(5,7,15,0.96)'; ctx.fillRect(x - 2, bandY, width + 4, 4);
            ctx.fillStyle = '#FF427E';
            this._fillTrackedText(ctx, part.text, x + width / 2 + noise * 11 - 4, y + 1, timing.tracking);
            ctx.fillStyle = '#9BF1FF';
            this._fillTrackedText(ctx, part.text, x + width / 2 + noise * 11 + 4, y - 1, timing.tracking);
            ctx.restore();
            ctx.fillStyle = 'rgba(180,237,246,0.7)';
            ctx.fillRect(x + (noise + 1) * width * 0.3, bandY, Math.max(3, width * 0.26), 2);
        }
        ctx.restore();
    }

    _hologramText(ctx, text, x, y, bright, tracking = 0) {
        if (!text) return;
        ctx.save();
        const strength = 0.94 + Math.sin(this.tick * 0.027) * 0.035;
        ctx.globalAlpha *= strength;
        ctx.fillStyle = 'rgba(105,219,235,0.18)';
        this._fillTrackedText(ctx, text, x - 1.1, y, tracking);
        ctx.fillStyle = 'rgba(255,58,108,0.22)';
        this._fillTrackedText(ctx, text, x + 1.1, y + 0.5, tracking);
        ctx.shadowColor = bright ? '#FF416C' : '#8ECEDA';
        ctx.shadowBlur = bright ? 20 : 8;
        ctx.fillStyle = bright ? '#FFF0F5' : '#D5DFE8';
        this._fillTrackedText(ctx, text, x, y, tracking);
        ctx.shadowBlur = 0;
        // A slow, narrow projection sweep crosses the glyphs without flashing.
        const size = parseFloat(ctx.font.replace('bold ', '')) || 18;
        const sweepY = y - size + ((this.tick * 0.12) % (size + 8));
        const width = this._trackedWidth(ctx, text, tracking);
        ctx.beginPath(); ctx.rect(x - width, sweepY, width * 2, 1.5); ctx.clip();
        ctx.fillStyle = 'rgba(226,253,255,0.5)'; this._fillTrackedText(ctx, text, x, y, tracking);
        ctx.restore();
    }

    _drawFadedAction(ctx, r, label, font, mix, focused) {
        ctx.save();
        // Feathered edges: light and lettering emerge from the background.
        const glow = 'rgba(165,28,69,' + (0.09 + mix * 0.2) + ')';
        ctx.fillStyle = this._linear(ctx, r.x, 0, r.x + r.w, 0,
            [[0, 'rgba(0,0,0,0)'], [0.3, glow], [0.7, glow], [1, 'rgba(0,0,0,0)']], 'transparent');
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = this._linear(ctx, r.x, 0, r.x + r.w, 0,
            [[0, 'rgba(255,90,138,0)'], [0.5, 'rgba(255,148,179,' + (0.22 + mix * 0.55) + ')'], [1, 'rgba(255,90,138,0)']], '#8B475C');
        ctx.fillRect(r.x, r.y, r.w, 1);
        ctx.fillRect(r.x, r.y + r.h, r.w, 1);
        ctx.textAlign = 'center';
        this._fit(ctx, label, r.w - 42, 17, font);
        ctx.shadowColor = '#FF608C'; ctx.shadowBlur = 6 + mix * 12;
        ctx.fillStyle = focused ? '#FFF2F7' : '#AFA4B6';
        ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 6);
        ctx.shadowBlur = 0;
        // A quiet moving light along the lower edge marks keyboard focus.
        ctx.globalAlpha *= mix * 0.6;
        const sweep = (Math.sin(this.tick * 0.022) * 0.5 + 0.5) * (r.w - 70);
        ctx.fillStyle = this._linear(ctx, r.x + sweep, 0, r.x + sweep + 70, 0,
            [[0, 'transparent'], [0.5, '#FFE2EC'], [1, 'transparent']], '#FFD1E1');
        ctx.fillRect(r.x + sweep, r.y + r.h, 70, 1);
        ctx.restore();
    }

    _drawTutorialWarning(ctx, l, body, heading) {
        const timing = this._warningTiming();
        const center = l.sw / 2, left = l.x + 32, width = l.w - 64;
        const top = l.y + 35;
        ctx.save();
        ctx.globalAlpha = this._warningFade(0, 72);
        ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, l.sw, l.sh);
        ctx.restore();
        this._drawSpaceBackdrop(ctx, l, this._warningFade(84, 72));
        // A dim projection cloud dissolves into the same black space as Game Over.
        ctx.save(); ctx.globalAlpha = this._warningFade(84, 72);
        ctx.fillStyle = this._radial(ctx, center, top + 150, 0, center, top + 150, width * 0.6,
            [[0, 'rgba(99,18,51,0.13)'], [0.55, 'rgba(39,42,64,0.035)'], [1, 'rgba(0,0,0,0)']], 'transparent');
        ctx.fillRect(0, 0, l.sw, l.sh); ctx.restore();

        ctx.save();
        const headerFade = this._warningFade(176, 66);
        ctx.globalAlpha = headerFade;
        ctx.translate(-(1 - headerFade) * l.sw * 0.18, 0);
        // Match Game Over's slanted, edge-to-edge crimson security banner.
        const bannerY = top - 18;
        ctx.save();
        ctx.translate(center, bannerY + 45); ctx.rotate(-0.018); ctx.translate(-center, -(bannerY + 45));
        ctx.shadowColor = '#FF003D'; ctx.shadowBlur = 36;
        ctx.fillStyle = 'rgba(255,0,52,0.20)'; ctx.fillRect(-30, bannerY - 10, l.sw + 60, 102);
        ctx.shadowBlur = 0;
        ctx.fillStyle = this._linear(ctx, 0, bannerY, l.sw, bannerY,
            [[0, '#35000F'], [0.18, '#E40037'], [0.56, '#FF174D'], [0.82, '#9E0027'], [1, '#240008']], '#C90035');
        ctx.beginPath();
        ctx.moveTo(-25, bannerY + 10); ctx.lineTo(l.sw * 0.16, bannerY - 8);
        ctx.lineTo(l.sw + 25, bannerY + 11); ctx.lineTo(l.sw * 0.86, bannerY + 92);
        ctx.lineTo(l.sw * 0.12, bannerY + 82); ctx.closePath(); ctx.fill();
        ctx.restore();
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        this._fit(ctx, this.title, width, Math.min(42, l.w * 0.048), heading);
        ctx.shadowColor = '#000000'; ctx.shadowBlur = 8;
        ctx.fillStyle = '#FFF7F8'; ctx.fillText(this.title, center, top + 48);
        ctx.shadowBlur = 0;
        ctx.restore();

        // Fade the outgoing message and choices together before changing views.
        ctx.save();
        ctx.globalAlpha *= this._warningTransition ? 1 - this._warningFade(this._warningTransition.start, 48) : 1;
        const confirming = this._warningView === 'confirm';
        const textBottom = l.buttons[0].y - 82;
        const fontSize = timing.fontSize;
        const lineHeight = fontSize + 12;
        const blockHeight = fontSize + (timing.rows.length - 1) * lineHeight;
        const textTop = Math.max(top + 164, Math.min(textBottom - blockHeight + fontSize,
            l.sh / 2 - blockHeight / 2 + fontSize));
        const glitch = this._warningGlitch(timing);
        ctx.save();
        ctx.font = fontSize + 'px ' + body; ctx.textAlign = 'center';
        const rows = timing.rows;
        this.maxScroll = Math.max(0, rows.length * lineHeight - (textBottom - textTop));
        this.scrollOffset = Math.min(this.scrollOffset, this.maxScroll);
        ctx.beginPath(); ctx.rect(left, textTop - fontSize - 6, width, textBottom - textTop + fontSize + 12); ctx.clip();
        rows.forEach((row, index) => {
            const count = this._warningVisibleCount(timing, index);
            const visible = Array.from(row).slice(0, count).join('');
            if (!visible) return;
            ctx.save(); ctx.globalAlpha *= this._warningRevealTick !== null ? 1 : this._warningFade(timing.rowStarts[index], 18);
            // Keep each line anchored to its final position while characters appear.
            const tx = center - this._trackedWidth(ctx, row, timing.tracking) / 2 + this._trackedWidth(ctx, visible, timing.tracking) / 2;
            const rowY = textTop + index * lineHeight - this.scrollOffset;
            this._hologramText(ctx, visible, tx, rowY, false, timing.tracking);
            if (glitch) {
                for (const part of glitch.parts) {
                    if (part.rowIndex === index) this._drawWordGlitch(ctx, glitch, part, row, center, rowY, timing);
                }
            }
            ctx.restore();
        });
        ctx.restore();

        ctx.save(); ctx.globalAlpha *= this._warningFade(timing.textEnd + 15, 60);
        ctx.textAlign = 'center'; ctx.fillStyle = '#9395A6'; ctx.font = '11px ' + body;
        ctx.fillText(confirming ? 'Go back to review your options, or confirm to continue.'
            : 'Review the tutorial without an additional penalty, or continue.', center, l.buttons[0].y - 30);
        ctx.restore();

        l.buttons.forEach((r, index) => {
            const fade = this._warningFade(timing.buttonsStart + index * 42, 60);
            if (fade <= 0) return;
            const mix = this._warningFocus ? this._warningFocus[index] : 0;
            const by = r.y + (1 - fade) * 10;
            ctx.save(); ctx.globalAlpha *= fade;
            this._drawFadedAction(ctx, { x: r.x, y: by, w: r.w, h: r.h },
                this._warningActions()[index].label, body, mix, index === this.hoverIndex);
            ctx.restore();
        });
        ctx.restore();
        if (this._exitTick !== null) {
            const progress = Math.min(1, this._exitTick / 54);
            ctx.save(); ctx.globalAlpha = progress * progress * (3 - 2 * progress);
            ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, l.sw, l.sh); ctx.restore();
        }
    }

    drawHUD() {
        const ctx = Common && Common.Platform && Common.Platform.ctx;
        if (!ctx || !ctx.canvas) return;
        if (this.options.tutorialSection && this.tick < 72 && this.parentScene && typeof this.parentScene.drawHUD === 'function') {
            this.parentScene.drawHUD();
        }
        const l = this._layout();
        const { x, y, w, h } = l;
        const danger = !!this.options.danger;
        const accent = danger ? '#FF3158' : '#FFE600';
        const assets = IP2Live.Assets || {};
        const heading = assets.nebulaLoaded ? 'Nebula-Regular' : 'sans-serif';
        const body = assets.oxaniumMediumLoaded ? 'Oxanium-Medium' : 'sans-serif';
        const pulse = 0.5 + 0.5 * Math.sin(this.tick * 0.035);
        ctx.save();
        ctx.scale(ctx.canvas.width / l.sw, ctx.canvas.height / l.sh);
        if (this.options.tutorialSection) {
            this._drawTutorialWarning(ctx, l, body, assets.astronomousLoaded ? 'Astronomous' : heading);
            ctx.restore();
            return;
        }
        this._drawBackdrop(ctx, l, accent);
        this._plate(ctx, x - 8, y + 8, w + 16, h, 20);
        ctx.fillStyle = 'rgba(255, 28, 72, 0.12)'; ctx.fill();
        ctx.shadowColor = accent; ctx.shadowBlur = 20 + pulse * 8;
        this._plate(ctx, x, y, w, h, 18);
        ctx.fillStyle = this._linear(ctx, x, y, x + w, y + h,
            [[0, 'rgba(20,19,31,0.985)'], [0.55, 'rgba(11,12,21,0.99)'], [1, 'rgba(24,11,22,0.985)']], '#11121D');
        ctx.fill();
        ctx.strokeStyle = danger ? 'rgba(255,49,88,0.70)' : 'rgba(255,230,0,0.52)';
        ctx.lineWidth = 1.5; ctx.stroke(); ctx.shadowBlur = 0;
        // Micro-grid and etched panel texture.
        ctx.save(); this._plate(ctx, x + 1, y + 1, w - 2, h - 2, 17); ctx.clip();
        ctx.strokeStyle = 'rgba(255,255,255,0.018)'; ctx.lineWidth = 1;
        for (let px = x + 18; px < x + w; px += 24) {
            ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + h); ctx.stroke();
        }
        for (let py = y + 18; py < y + h; py += 24) {
            ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + w, py); ctx.stroke();
        }
        ctx.restore();
        ctx.fillStyle = '#FF174D'; ctx.fillRect(x + 1, y + 24, 4, h - 48);
        ctx.fillStyle = accent; ctx.fillRect(x + w - 80, y - 2, 56, 4);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.font = 'bold 11px ' + body; ctx.fillStyle = accent;
        ctx.fillText(this.options.eyebrow || 'NEURAL DECK / DIAGNOSTIC REPORT', x + 32, y + 35);
        this._fit(ctx, this.title, w - 126, danger ? 30 : 27, heading);
        ctx.fillStyle = '#FFFFFF'; ctx.fillText(this.title, x + 32, y + 78);
        // Compact security crest.
        this._plate(ctx, x + w - 76, y + 31, 42, 48, 9);
        ctx.fillStyle = danger ? '#441323' : '#373019'; ctx.fill();
        ctx.strokeStyle = accent; ctx.stroke();
        ctx.font = 'bold 26px ' + body; ctx.textAlign = 'center'; ctx.fillStyle = accent;
        ctx.fillText(danger ? '!' : 'AR', x + w - 55, y + 64);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#24242F'; ctx.fillRect(x + 32, y + 99, w - 64, 1);
        const status = [this.options.gameplayLabel, this.options.statusLabel].filter(Boolean).join(' / ');
        ctx.fillStyle = '#B6B5C6'; this._fit(ctx, status || (danger ? 'CONNECTION LOST / 0 HP' : 'REVIEW / ADJUST / RETRY'), w - 190, 12, body);
        ctx.fillText(status || (danger ? 'CONNECTION LOST / 0 HP' : 'REVIEW / ADJUST / RETRY'), x + 32, y + 126);
        if (Number.isFinite(this.options.failureCount)) {
            ctx.textAlign = 'right'; ctx.font = 'bold 12px ' + body; ctx.fillStyle = accent;
            ctx.fillText(this.options.failureCount + ' FAILED RUNS', x + w - 32, y + 126); ctx.textAlign = 'left';
        }
        const textTop = y + 157;
        const textBottom = y + h - (this.options.tutorialSection ? 190 : 108);
        ctx.font = '16px ' + body;
        const rows = this.lines.flatMap((line) => this._wrap(ctx, line, w - 80).concat(['']));
        this.maxScroll = Math.max(0, rows.length * 25 - (textBottom - textTop));
        this.scrollOffset = Math.min(this.scrollOffset, this.maxScroll);
        ctx.save(); ctx.beginPath(); ctx.rect(x + 32, textTop - 18, w - 64, textBottom - textTop + 20); ctx.clip();
        ctx.fillStyle = '#E5E2EE';
        rows.forEach((line, index) => ctx.fillText(line, x + 32, textTop + index * 25 - this.scrollOffset));
        ctx.restore();
        if (this.maxScroll > 0) {
            ctx.font = '10px ' + body; ctx.fillStyle = accent;
            ctx.fillText('PAGE UP / PAGE DOWN TO READ MORE', x + 32, textBottom + 17);
        }
        if (this.options.tutorialSection) {
            const sy = y + h - 169;
            this._plate(ctx, x + 32, sy, w - 64, 69, 8);
            ctx.fillStyle = this._linear(ctx, x + 32, sy, x + w - 32, sy,
                [[0, 'rgba(255,230,0,0.15)'], [0.38, 'rgba(34,32,42,0.98)'], [1, 'rgba(19,18,28,0.98)']], '#20202B');
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,230,0,0.34)'; ctx.lineWidth = 1; ctx.stroke();
            ctx.fillStyle = accent; ctx.fillRect(x + 32, sy + 10, 4, 49);
            this._plate(ctx, x + 48, sy + 13, 42, 42, 8);
            ctx.fillStyle = 'rgba(255,230,0,0.12)'; ctx.fill(); ctx.strokeStyle = accent; ctx.stroke();
            ctx.textAlign = 'center'; ctx.font = 'bold 17px ' + body; ctx.fillStyle = accent; ctx.fillText('↻', x + 69, sy + 41);
            ctx.textAlign = 'left'; ctx.font = 'bold 10px ' + body; ctx.fillStyle = accent;
            ctx.fillText('OPTIONAL RECOVERY PATH / ZERO PENALTY', x + 105, sy + 20);
            ctx.font = 'bold 15px ' + body; ctx.fillStyle = '#FFFFFF';
            ctx.fillText('Re-enter the guided simulation.', x + 105, sy + 40);
            ctx.font = '10px ' + body; ctx.fillStyle = '#AAA6B5';
            ctx.fillText('CURRENT QUEST, HP, AND STREAK REMAIN INTACT', x + 105, sy + 56);
        }
        l.buttons.forEach((r, index) => {
            const focused = index === this.selectedIndex;
            const primary = index === 0;
            this._plate(ctx, r.x, r.y, r.w, r.h, 8);
            if (focused) { ctx.shadowColor = accent; ctx.shadowBlur = 14 + pulse * 8; }
            ctx.fillStyle = primary
                ? this._linear(ctx, r.x, r.y, r.x + r.w, r.y, [[0, accent], [0.74, danger ? '#B90032' : '#D7C000'], [1, '#5F1529']], accent)
                : this._linear(ctx, r.x, r.y, r.x + r.w, r.y, [[0, '#292733'], [0.72, '#1D1C27'], [1, '#351520']], '#24242F');
            ctx.fill(); ctx.shadowBlur = 0;
            ctx.strokeStyle = focused ? '#FFFFFF' : (primary ? accent : '#494855'); ctx.lineWidth = focused ? 2 : 1; ctx.stroke();
            if (focused) { ctx.fillStyle = accent; ctx.fillRect(r.x + 12, r.y + r.h + 6, 28 + pulse * 8, 2); }
            ctx.fillStyle = primary ? '#11121D' : '#F4F0FA'; ctx.textAlign = 'center';
            this._fit(ctx, this.actions[index].label, r.w - 30, 15, body);
            ctx.fillText(this.actions[index].label, r.x + r.w / 2, r.y + 30);
        });
        ctx.textAlign = 'center'; ctx.font = '10px ' + body; ctx.fillStyle = '#918D9F';
        ctx.fillText('ARROWS / TAB TO SELECT     ENTER TO CONFIRM', x + w / 2, y + h - 12);
        ctx.restore();
    }

    static show(options) {
        const screen = new this(options || {});
        screen.parentScene = Manager && Manager.Stack ? Manager.Stack.top : null;
        if (Manager && Manager.Stack && typeof Manager.Stack.push === 'function') {
            Manager.Stack.push(screen); Manager.Stack.requestPaintHUD = true; return true;
        }
        if (options && typeof options.onComplete === 'function') options.onComplete('continue');
        return false;
    }
}
IP2Live.ARDiagnosticRewind = IP2LiveARDiagnosticRewindScreen;
window.IP2LiveARDiagnosticRewind = IP2LiveARDiagnosticRewindScreen;
