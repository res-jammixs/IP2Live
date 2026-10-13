/** Four story paintings with gentle ambient motion, typed captions and fades. */
(function () {
    const W = 1280, H = 720;
    const FONT = '"Oxanium-Medium", "Segoe UI", sans-serif';
    // BGM profiles live in music_manager.js; matching layers use the SFX slider.
    const AUDIO = [
        ['STORY_PROLOGUE', 'PROLOGUE_ARRIVAL'], ['PROLOGUE_TAKING', 'PROLOGUE_TAKING'],
        ['PROLOGUE_FORTRESS', 'PROLOGUE_FORTRESS'], ['PROLOGUE_UPLINK', 'PROLOGUE_UPLINK'],
    ];
    function frame(ctx, x, y, w, h, cut = 10) {
        ctx.beginPath(); ctx.moveTo(x + cut, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - cut);
        ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + cut); ctx.closePath();
    }
    function label(ctx, value, x, y, size, color, align = 'left') {
        ctx.font = size + 'px ' + FONT; ctx.textAlign = align; ctx.textBaseline = 'middle';
        ctx.fillStyle = color; ctx.fillText(value, x, y);
    }
    class StoryPrologueScreen extends Scene.Base {
        constructor(onComplete) {
            super(true);
            this.onComplete = onComplete; this.beats = IP2Live.StoryLore.prologue;
            this.loading = true;
            this.characters = Array.from(this.beats[0].text);
            this.index = 0; this.phase = 'fadeIn'; this.elapsed = 0; this.visibleChars = 0; this.typeBudget = 0;
            this.lastAt = null; this.readyAt = 0;
            this.ambientTime = 0; this._ambientFrame = -1;
            this._arrivalFleet = null;
            this._audioTime = 0; this._audioLayer = null; this._audioZone = null;
            this.closed = false; this.launched = false; this.notice = ''; this._cache = new Map(); this._layout = null; this._panel = null;
            this.reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        }
        initialize() {}
        async load() {
            try { await IP2Live.Assets?.loadPauseFonts?.(); } catch (error) { console.warn('[IP2Live] Prologue fonts:', error); }
            if (this.closed) return;
            this._surface(this.index); this._fleetSprites(); this.loading = false; this.lastAt = Date.now(); this.readyAt = Date.now() + 250;
            this._startAudio(); this._paint();
        }
        _startAudio() {
            this._audioLayer?.stop(); this._audioTime = 0;
            const [zone, effect] = AUDIO[this.index]; this._audioZone = zone;
            IP2Live.MusicManager?.play(zone);
            // Reduced motion skips ship descent, so its matching one-shot is omitted.
            this._audioLayer = this.index === 0 && this.reducedMotion ? null : IP2Live.SoundFX?.createLayer?.(effect);
            this._syncAudio(this._available());
        }
        _syncAudio(active) {
            let gain = 1;
            if (this.phase === 'fadeIn') gain = Math.min(1, this.elapsed / this._fadeMs());
            else if (this.phase === 'fadeOut') gain = Math.max(0, 1 - this.elapsed / this._fadeMs());
            else if (this.phase === 'leaving') gain = 0;
            this._audioLayer?.sync(this._audioTime / 1000, active, gain * gain * (3 - 2 * gain));
        }
        _stopMusic(fadeMs) {
            const music = IP2Live.MusicManager;
            // A tutorial/map may already own BGM during Stack.replace().
            if (music && this._audioZone && (music._requestedZone === this._audioZone ||
                (music.currentZone?.() === this._audioZone && (!music.isZoneActive || music.isZoneActive(this._audioZone))))) music.stop(fadeMs);
        }
        _paint() { Manager.Stack.requestPaintHUD = true; }
        _available() {
            return !this.loading && !this.closed && (!Manager.Stack.top || Manager.Stack.top === this) &&
                (typeof document === 'undefined' || (!document.hidden && (!document.hasFocus || document.hasFocus())));
        }
        _fadeMs() { return this.reducedMotion ? 140 : this.phase === 'fadeIn' ? 750 : 550; }
        update() {
            const now = Date.now(); let delta = Math.min(100, Math.max(0, now - (this.lastAt ?? now))); this.lastAt = now;
            if (!this._available()) { this.suspended = true; this._syncAudio(false); return; }
            if (this.suspended) { delta = 0; this.suspended = false; }
            let repaint = false;
            if (this.phase === 'fadeIn' || this.phase === 'fadeOut') {
                repaint = true;
                this.elapsed += delta;
                if (this.elapsed >= this._fadeMs()) {
                    if (this.phase === 'fadeIn') { this.phase = 'reading'; this.elapsed = 0; }
                    else if (this.finishAfterFade) this._finish();
                    else {
                        const old = this._cache.get(this.index); if (old) { old.width = old.height = 0; this._cache.delete(this.index); }
                        if (this.index === 0) this._releaseFleet();
                        this.index++; this.phase = 'fadeIn'; this.elapsed = 0; this.visibleChars = 0; this.typeBudget = 0;
                        this.ambientTime = 0; this._ambientFrame = -1;
                        this.characters = Array.from(this.beats[this.index].text);
                        this._layout = null; this._surface(this.index); this.readyAt = now + 250;
                        this._startAudio();
                    }
                }
            } else if (this.phase === 'reading') {
                const before = this.visibleChars;
                if (!this._revealed()) this.typeBudget += delta;
                while (this.visibleChars < this.characters.length) {
                    const previous = this.characters[this.visibleChars - 1] || '';
                    const cost = 1000 / 36 + (/[.!?]/.test(previous) ? 125 : /[,;]/.test(previous) ? 65 : 0);
                    if (this.typeBudget < cost) break;
                    this.typeBudget -= cost; this.visibleChars++;
                }
                repaint = this.visibleChars !== before;
                // Require a fresh, deliberate press after the last character appears.
                if (repaint && this._revealed()) this.readyAt = now + 220;
                // Prepaint one next scene during reading, never at the fade boundary.
                if (this.visibleChars > 45 && this.index < 3 && !this._cache.has(this.index + 1)) this._surface(this.index + 1);
            }
            // The heavy illustration stays cached. Only the small ambient pass
            // changes, at 24 fps, using foreground time rather than wall time.
            if (!this.reducedMotion && ['reading', 'fadeIn', 'fadeOut'].includes(this.phase)) {
                this.ambientTime += delta;
                const frame = Math.floor(this.ambientTime / (1000 / 24));
                if (frame !== this._ambientFrame) { this._ambientFrame = frame; repaint = true; }
            }
            if (['reading', 'fadeIn', 'fadeOut'].includes(this.phase)) this._audioTime += delta;
            this._syncAudio(this.phase !== 'leaving');
            if (repaint && !this.closed) this._paint();
        }
        _revealed() { return this.visibleChars >= this.characters.length; }
        _advance() {
            if (!this._available() || Date.now() < this.readyAt || this.phase === 'fadeOut' || this.phase === 'leaving') return;
            if (this.phase === 'error') { this._finish(); return; }
            if (this.phase !== 'reading' || !this._revealed()) return;
            this.readyAt = Date.now() + 220;
            this.finishAfterFade = this.index === this.beats.length - 1;
            this.phase = 'fadeOut'; this.elapsed = 0; this._paint();
            this._stopMusic(this._fadeMs());
        }
        _finish() {
            if (this.launched || this.closed) return;
            this.launched = true; this.phase = 'leaving'; IP2Live.InputGuard?.reset();
            this._audioLayer?.stop(); this._audioLayer = null;
            try {
                if (this.onComplete() === false) throw new Error('Tutorial route unavailable');
            } catch (error) {
                this.launched = false; this.phase = 'error'; this.notice = 'The tutorial could not open. Press Space or Enter to reconnect.';
                this.readyAt = Date.now() + 300; console.warn('[IP2Live] Prologue handoff:', error); this._paint();
            }
        }
        onKeyPressed(key) {
            if (key?.repeat === true) return true;
            const value = String(key?.key ?? key).toUpperCase();
            // Engine key codes and DOM key names share the same two controls.
            if (['ENTER', ' ', 'SPACE', 'SPACEBAR', '13', '32'].includes(value)) this._advance();
            return true;
        }
        onKeyPressedAndRepeat() { return true; }
        onMouseMove() { return true; }
        onMouseDown() { return true; }
        onMouseUp() { return true; }
        draw3D() { Manager.GL?.renderer?.clear(); }
        _fleetSprites() {
            if (!this._arrivalFleet) {
                const canvas = Common.Platform.ctx.canvas;
                this._arrivalFleet = IP2Live.PrologueArt.createArrivalFleet(Math.min(canvas.width / W, canvas.height / H));
            }
            return this._arrivalFleet;
        }
        _releaseFleet() {
            if (this._arrivalFleet) for (const sprite of this._arrivalFleet) sprite.surface.width = sprite.surface.height = 0;
            this._arrivalFleet = null;
        }
        _surface(index) {
            if (this._cache.has(index)) return this._cache.get(index);
            const canvas = Common.Platform.ctx.canvas;
            const density = Math.min(1.5, Math.max(1, Math.min(canvas.width / W, canvas.height / H)));
            const surface = document.createElement('canvas'); surface.width = Math.round(W * density); surface.height = Math.round(H * density);
            const p = surface.getContext('2d'); p.setTransform(density, 0, 0, density, 0, 0); IP2Live.PrologueArt.paint(p, index);
            this._cache.set(index, surface); return surface;
        }
        _textRows(ctx) {
            const content = this.phase === 'error' ? this.notice : this.beats[this.index].text;
            if (this._layout?.content === content) return this._layout.rows;
            const rows = []; let row = '', start = 0;
            ctx.font = '22px ' + FONT;
            for (const word of content.split(' ')) {
                if (row && ctx.measureText(row + ' ' + word).width > 1116) {
                    rows.push({ text: row, start }); start += row.length + 1; row = word;
                } else row += (row ? ' ' : '') + word;
            }
            if (row) rows.push({ text: row, start });
            this._layout = { content, rows }; return rows;
        }
        _captionGeometry(ctx) {
            const rows = this._textRows(ctx), h = 66 + rows.length * 30;
            // Measure the whole caption, so the housing never jumps while typing.
            return { x: 48, y: 689 - h, w: 1184, h, rows, textX: 82, textY: 689 - h + 39, promptY: 669 };
        }
        _captionSkin(box) {
            const canvas = Common.Platform.ctx.canvas;
            const density = Math.min(1.5, Math.max(1, Math.min(canvas.width / W, canvas.height / H)));
            if (this._panel?.h === box.h && this._panel.density === density) return this._panel.surface;
            if (this._panel) this._panel.surface.width = this._panel.surface.height = 0;
            const surface = document.createElement('canvas');
            surface.width = Math.ceil(box.w * density); surface.height = Math.ceil(box.h * density);
            const p = surface.getContext('2d'), w = box.w, h = box.h;
            p.setTransform(density, 0, 0, density, 0, 0);
            frame(p, 1, 1, w - 2, h - 2, 14);
            const rim = p.createLinearGradient(0, 0, 0, h);
            rim.addColorStop(0, '#71808a'); rim.addColorStop(.12, '#343b50'); rim.addColorStop(1, '#786476');
            p.fillStyle = rim; p.fill();
            frame(p, 4, 4, w - 8, h - 8, 12);
            const body = p.createLinearGradient(0, 0, 0, h);
            body.addColorStop(0, '#192330'); body.addColorStop(1, '#090e19');
            p.fillStyle = body; p.fill(); p.strokeStyle = '#050811'; p.stroke();
            p.save(); p.clip();
            // Brushed metal grain is deterministic, subtle and cached with the housing.
            for (let y = 5; y < h; y += 3) {
                p.fillStyle = y % 2 ? '#aecbd303' : '#02071318'; p.fillRect(4, y, w - 8, .6);
            }
            for (let i = 0; i < 180; i++) {
                p.fillStyle = '#cbd7e206'; p.fillRect(7 + (i * 137) % (w - 14), 5 + (i * 47) % (h - 10), 1, 1);
            }
            p.fillStyle = '#050b164f'; p.fillRect(4, 4, w - 8, 20);
            p.beginPath(); p.moveTo(4, 24); p.lineTo(208, 24); p.lineTo(228, 4); p.lineTo(4, 4); p.closePath();
            p.fillStyle = '#37505b40'; p.fill();
            p.beginPath(); p.moveTo(w - 150, h - 4); p.lineTo(w - 121, h - 31); p.lineTo(w - 4, h - 31); p.lineTo(w - 4, h - 4); p.closePath();
            p.fillStyle = '#43334635'; p.fill(); p.strokeStyle = '#b28b9e24'; p.stroke();
            p.restore();
            // Recessed seams, corner plates and tiny fasteners sit outside the prose.
            p.strokeStyle = '#c4d2d51c'; frame(p, 7, 7, w - 14, h - 14, 10); p.stroke();
            p.fillStyle = '#5fcec1'; p.fillRect(25, 2, 62, 2);
            p.fillStyle = '#768d963f'; p.fillRect(91, 2, 29, 2);
            p.strokeStyle = '#78b6b45c'; p.lineWidth = 1.5;
            p.beginPath(); p.moveTo(3, 43); p.lineTo(3, 16); p.lineTo(16, 3); p.lineTo(25, 3); p.stroke();
            p.strokeStyle = '#c39ba56b'; p.beginPath(); p.moveTo(w - 3, h - 42); p.lineTo(w - 3, h - 16); p.lineTo(w - 16, h - 3); p.lineTo(w - 47, h - 3); p.stroke();
            p.strokeStyle = '#75c5bd29'; p.lineWidth = 1;
            p.beginPath(); p.moveTo(18, h - 20); p.lineTo(99, h - 20); p.lineTo(109, h - 30); p.lineTo(172, h - 30); p.stroke();
            for (const [x, y] of [[15, 30], [15, h - 14], [w - 15, 14], [w - 15, h - 30]]) {
                p.fillStyle = '#030811'; p.fillRect(x - 2, y - 2, 4, 4);
                p.fillStyle = '#82919a6b'; p.fillRect(x - 1, y - 1, 2, 1);
            }
            this._panel = { h, density, surface }; return surface;
        }
        _drawDiamonds(ctx, box) {
            // Match the in-game dialogue header's size, spacing and gold current slide.
            const right = box.x + box.w - 28, gap = 15, y = box.y + 16;
            for (let i = 0; i < this.beats.length; i++) {
                const current = i === this.index, size = current ? 4.8 : 3.1;
                ctx.save(); ctx.translate(right - (this.beats.length - 1 - i) * gap, y); ctx.rotate(Math.PI / 4);
                ctx.shadowColor = current ? '#FFE600' : 'transparent'; ctx.shadowBlur = current ? 9 : 0;
                ctx.fillStyle = current ? '#FFE600' : 'rgba(218,238,255,0.30)';
                ctx.fillRect(-size, -size, size * 2, size * 2); ctx.restore();
            }
        }
        drawHUD() {
            if (this.closed) return;
            const ctx = Common.Platform.ctx, canvas = ctx.canvas, scale = Math.min(canvas.width / W, canvas.height / H);
            ctx.save(); ctx.fillStyle = '#02040a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.translate((canvas.width - W * scale) / 2, (canvas.height - H * scale) / 2); ctx.scale(scale, scale);
            ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
            let opacity = 1;
            if (this.phase === 'fadeIn') opacity = Math.min(1, this.elapsed / this._fadeMs());
            else if (this.phase === 'fadeOut') opacity = Math.max(0, 1 - this.elapsed / this._fadeMs());
            else if (this.phase === 'leaving') opacity = 0;
            ctx.globalAlpha = opacity * opacity * (3 - 2 * opacity);
            ctx.drawImage(this._surface(this.index), 0, 0, W, H);
            if (this.index === 0) IP2Live.PrologueArt.drawArrivalFleet(ctx, this._fleetSprites(), this.ambientTime / 1000, { reducedMotion: this.reducedMotion });
            IP2Live.PrologueArt.paintAmbient(ctx, this.index, this.ambientTime / 1000, { reducedMotion: this.reducedMotion });
            frame(ctx, 20, 20, 1240, 680, 18); ctx.strokeStyle = '#8a637b55'; ctx.lineWidth = 1; ctx.stroke();
            label(ctx, 'IP2LIVE / ORIGINS', 54, 44, 11, '#c0abb9');
            const beat = this.beats[this.index];
            label(ctx, beat.subtitle, 72, 97, 10, '#d198a9');
            ctx.font = '32px "Nebula-Regular", sans-serif'; ctx.fillStyle = '#f3e9eb'; ctx.textAlign = 'left'; ctx.fillText(beat.title, 70, 132);
            const box = this._captionGeometry(ctx), rows = box.rows, shown = this.phase === 'error' ? Infinity : this.visibleChars;
            ctx.drawImage(this._captionSkin(box), box.x, box.y, box.w, box.h);
            this._drawDiamonds(ctx, box);
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i], count = Math.max(0, Math.min(row.text.length, shown - row.start));
                label(ctx, row.text.slice(0, count), box.textX, box.textY + i * 30, 22, '#edf0f3');
                if (count > 0 && count < row.text.length) {
                    const x = box.textX + ctx.measureText(row.text.slice(0, count)).width;
                    ctx.fillStyle = '#89ebd7'; ctx.fillRect(x + 3, box.textY - 8 + i * 30, 2, 17);
                }
            }
            label(ctx, this.phase === 'error' ? 'Space / Enter to retry' : 'Space / Enter to continue story', W / 2, box.promptY, 12,
                this._revealed() || this.phase === 'error' ? '#c5dfdd' : '#818e9e', 'center');
            ctx.restore();
        }
        close() {
            this.closed = true;
            this._audioLayer?.stop(); this._audioLayer = null; this._stopMusic(0);
            for (const surface of this._cache.values()) surface.width = surface.height = 0;
            this._cache.clear(); this._layout = null;
            this._releaseFleet();
            if (this._panel) this._panel.surface.width = this._panel.surface.height = 0;
            this._panel = null;
            if (IP2Live.StoryPrologue.active === this) IP2Live.StoryPrologue.active = null;
            IP2Live.InputGuard?.reset();
            if (super.close) super.close();
        }
    }
    IP2Live.StoryPrologueScreen = StoryPrologueScreen;
    IP2Live.StoryPrologue = {
        active: null,
        show(onComplete) {
            if (this.active || typeof onComplete !== 'function' || !IP2Live.StoryLore || !IP2Live.PrologueArt) return false;
            IP2Live.DialogueManager?.resetTransitionState?.({ stopActive: true, discardActive: true });
            const screen = this.active = new StoryPrologueScreen(onComplete); IP2Live.InputGuard?.reset();
            if (Manager.Stack.top) Manager.Stack.replace(screen); else Manager.Stack.push(screen);
            return true;
        },
    };
}());
