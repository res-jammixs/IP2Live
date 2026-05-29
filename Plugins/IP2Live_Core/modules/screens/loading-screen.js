/**
 * IP2Live - Loading Screen
 * A short cyberpunk / Persona-inspired bridge for map and menu transitions.
 *
 * Loaded via fetch + new Function() by code.js. Do not use import/export.
 */

class IP2LiveLoadingScreen extends Scene.Base {
    constructor(options) {
        super(true);
        this._pendingOptions = options || {};
        if (this._loadingInitialized) this._configure(this._pendingOptions);
    }

    initialize() {
        this._loadingInitialized = true;
        this.animTick = 0;
        this.scanlineOffset = 0;
        this.progress = 0;
        this.durationMs = this._randomDurationMs();
        this.transitionInRatio = 0.24;
        this.transitionOutRatio = 0.28;
        this.fadeInRatio = 0.36;
        this.fadeOutRatio = 0.38;
        this.startedAt = 0;
        this.status = 'Loading';
        this.detail = 'Preparing route';
        this.onComplete = null;
        this._actionStarted = false;
        this._actionError = null;
        this._factPool = this._createSubnetFacts();
        this.fact = this._randomFact();
        this.particles = [];
        this.shards = [];
        this._configure(this._pendingOptions || {});
    }

    _configure(options) {
        const opts = options || {};
        this.status = opts.status || opts.label || this.status || 'Loading';
        this.detail = opts.detail || opts.substatus || this.detail || '';
        this.onComplete = typeof opts.onComplete === 'function' ? opts.onComplete : null;
        this.durationMs = typeof opts.durationMs === 'number'
            ? Math.max(300, opts.durationMs)
            : this._randomDurationMs();
        if (opts.fact) this.fact = opts.fact;
    }

    _randomDurationMs() {
        return 2000 + Math.floor(Math.random() * 1501);
    }

    async load() {
        if (IP2Live.Assets && typeof IP2Live.Assets.loadAll === 'function' && !IP2Live.Assets.nebulaLoaded) {
            try {
                await IP2Live.Assets.loadAll();
            } catch (e) {
                console.warn('[IP2Live] Loading screen asset warmup failed:', e);
            }
        }

        const ctx = Common.Platform.ctx;
        const cW = ctx && ctx.canvas ? ctx.canvas.width : Common.ScreenResolution.SCREEN_X;
        const cH = ctx && ctx.canvas ? ctx.canvas.height : Common.ScreenResolution.SCREEN_Y;
        this._seedParticles(cW, cH);
        this._seedShards(cW, cH);
        this.startedAt = Date.now();
        this.loading = false;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    _seedParticles(cW, cH) {
        const chars = ['0', '1', '/24', '/16', '/30', '255', '128', '64', '32', 'ARP', 'CIDR', 'NET'];
        this.particles = [];
        for (let i = 0; i < 70; i++) {
            this.particles.push({
                x: Math.random() * cW,
                y: Math.random() * cH,
                vx: (Math.random() - 0.5) * 0.45,
                vy: 0.35 + Math.random() * 0.95,
                size: 8 + Math.random() * 10,
                alpha: 0.04 + Math.random() * 0.18,
                char: chars[Math.floor(Math.random() * chars.length)],
                flip: 24 + Math.floor(Math.random() * 90),
                cW,
                cH,
            });
        }
    }

    _seedShards(cW, cH) {
        this.shards = [];
        for (let i = 0; i < 16; i++) {
            this.shards.push({
                x: Math.random() * cW,
                y: Math.random() * cH,
                w: 28 + Math.random() * 120,
                h: 3 + Math.random() * 8,
                speed: 0.4 + Math.random() * 1.4,
                color: i % 3 === 0 ? '#FF003C' : (i % 3 === 1 ? '#00F0FF' : '#FFE600'),
                alpha: 0.08 + Math.random() * 0.22,
            });
        }
    }

    update() {
        this.animTick++;
        this.scanlineOffset = (this.scanlineOffset + 0.55) % 4;

        if (!this.startedAt) this.startedAt = Date.now();
        const elapsed = Date.now() - this.startedAt;
        this.progress = Math.min(1, elapsed / this.durationMs);

        const chars = ['0', '1', '/24', '/27', '/30', '255', '128', '64', '32', 'CIDR', 'MASK'];
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.flip--;
            if (p.flip <= 0) {
                p.char = chars[Math.floor(Math.random() * chars.length)];
                p.flip = 24 + Math.floor(Math.random() * 90);
            }
            if (p.y > p.cH + 24) {
                p.y = -24;
                p.x = Math.random() * p.cW;
            }
            if (p.x < -50) p.x = p.cW + 20;
            if (p.x > p.cW + 50) p.x = -20;
        }

        const ctx = Common.Platform.ctx;
        const cW = ctx && ctx.canvas ? ctx.canvas.width : Common.ScreenResolution.SCREEN_X;
        for (let i = 0; i < this.shards.length; i++) {
            const s = this.shards[i];
            s.x += s.speed;
            if (s.x > cW + 140) s.x = -160;
        }

        if (this.progress >= 1 && !this._actionStarted) {
            this._runCompleteAction();
        }

        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    _runCompleteAction() {
        this._actionStarted = true;
        if (!this.onComplete) return;

        try {
            const result = this.onComplete(this);
            if (result && typeof result.then === 'function') {
                result.catch((e) => {
                    this._actionError = e;
                    console.warn('[IP2Live] Loading transition failed:', e);
                });
            }
        } catch (e) {
            this._actionError = e;
            console.warn('[IP2Live] Loading transition failed:', e);
        }
    }

    draw3D() {
        if (Manager && Manager.GL && Manager.GL.renderer) Manager.GL.renderer.clear();
    }

    drawHUD() {
        const ctx = Common.Platform.ctx;
        if (!ctx) return;

        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const sX = cW / SW;
        const sY = cH / SH;
        const font = IP2Live.Assets && IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace';
        const titleFont = IP2Live.Assets && IP2Live.Assets.abnesLoaded ? 'Abnes' : 'Arial Black';

        ctx.save();
        this._drawBackground(ctx, cW, cH, sX, sY);
        this._drawTitle(ctx, cW, sX, sY, titleFont);
        this._drawCenterObject(ctx, cW / 2, cH * 0.44, Math.min(cW, cH) / 720);
        this._drawStatus(ctx, cW, cH, sX, sY, font);
        this._drawFactPanel(ctx, cW, cH, sX, sY, font);
        this._drawLoadingLine(ctx, cW, cH, sX, sY, font);
        this._drawShutterTransition(ctx, cW, cH, sX, sY);
        this._drawSoftFade(ctx, cW, cH);
        ctx.restore();
    }

    _drawBackground(ctx, cW, cH, sX, sY) {
        const tick = this.animTick || 0;
        const bg = ctx.createLinearGradient(0, 0, cW, cH);
        bg.addColorStop(0, '#02030A');
        bg.addColorStop(0.52, '#070A16');
        bg.addColorStop(1, '#11030A');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, cW, cH);

        ctx.save();
        ctx.globalAlpha = 0.52;
        for (let i = 0; i < this.shards.length; i++) {
            const s = this.shards[i];
            ctx.fillStyle = this._rgba(s.color, s.alpha);
            ctx.fillRect(s.x, s.y, s.w, s.h);
        }
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = 0.9;
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = i % 5 === 0 ? '#FFE600' : '#00F0FF';
            ctx.font = Math.round(p.size * sX) + 'px monospace';
            ctx.fillText(p.char, p.x, p.y);
        }
        ctx.restore();

        ctx.save();
        ctx.globalAlpha = 0.09;
        ctx.strokeStyle = '#00F0FF';
        ctx.lineWidth = 1 * sX;
        const gap = 52 * sX;
        const offset = (tick * 0.35) % gap;
        for (let x = -cH; x < cW + cH; x += gap) {
            ctx.beginPath();
            ctx.moveTo(x + offset, 0);
            ctx.lineTo(x + offset + cH * 0.45, cH);
            ctx.stroke();
        }
        ctx.restore();

        ctx.globalAlpha = 0.07;
        ctx.fillStyle = '#000000';
        for (let y = this.scanlineOffset * sY; y < cH; y += 4 * sY) {
            ctx.fillRect(0, y, cW, Math.max(1, 1.5 * sY));
        }
        ctx.globalAlpha = 1;

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(286 * sX, 0);
        ctx.lineTo(210 * sX, 72 * sY);
        ctx.lineTo(0, 112 * sY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,0,60,0.92)';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(cW, cH);
        ctx.lineTo(cW - 340 * sX, cH);
        ctx.lineTo(cW - 250 * sX, cH - 76 * sY);
        ctx.lineTo(cW, cH - 136 * sY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,230,0,0.90)';
        ctx.fill();
    }

    _drawTitle(ctx, cW, sX, sY, titleFont) {
        const tick = this.animTick || 0;
        const y = 84 * sY;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = 'bold ' + Math.round(54 * sX) + 'px ' + titleFont;
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('IP2LIVE', cW / 2, y);

        ctx.font = Math.round(9 * sX) + 'px monospace';
        ctx.fillStyle = 'rgba(0,240,255,0.72)';
        ctx.fillText('SYS::TRANSIT_BRIDGE // ROUTE HANDSHAKE ' + String((tick % 997)).padStart(3, '0'), cW / 2, y + 24 * sY);

        const slashW = 118 * sX;
        const slashY = y + 36 * sY;
        ctx.fillStyle = '#FF003C';
        ctx.beginPath();
        ctx.moveTo(cW / 2 - slashW - 36 * sX, slashY);
        ctx.lineTo(cW / 2 - 36 * sX, slashY);
        ctx.lineTo(cW / 2 - 58 * sX, slashY + 9 * sY);
        ctx.lineTo(cW / 2 - slashW - 58 * sX, slashY + 9 * sY);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#FFE600';
        ctx.beginPath();
        ctx.moveTo(cW / 2 + 40 * sX, slashY);
        ctx.lineTo(cW / 2 + slashW + 40 * sX, slashY);
        ctx.lineTo(cW / 2 + slashW + 18 * sX, slashY + 9 * sY);
        ctx.lineTo(cW / 2 + 18 * sX, slashY + 9 * sY);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    _drawCenterObject(ctx, cx, cy, unit) {
        const tick = this.animTick || 0;
        const red = '#FF003C';
        const cyan = '#00F0FF';
        const yellow = '#FFE600';
        const pulse = 0.5 + 0.5 * Math.sin(tick * 0.09);
        const pct = Math.floor(this.progress * 100);

        ctx.save();
        ctx.translate(cx, cy);

        // Soft radial halo behind the icon.
        const haloR = 188 * unit;
        const halo = ctx.createRadialGradient(0, 0, 14 * unit, 0, 0, haloR);
        halo.addColorStop(0, 'rgba(0,240,255,0.16)');
        halo.addColorStop(0.55, 'rgba(255,0,60,0.10)');
        halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(0, 0, haloR, 0, Math.PI * 2);
        ctx.fill();

        // Orbit rings with depth and glow.
        ctx.shadowColor = cyan;
        ctx.shadowBlur = 30 * unit;
        for (let i = 0; i < 5; i++) {
            ctx.save();
            const dir = i % 2 === 0 ? 1 : -1;
            ctx.rotate(tick * 0.011 * dir + i * Math.PI / 5);
            ctx.strokeStyle = i % 2 === 0 ? 'rgba(0,240,255,0.48)' : 'rgba(255,0,60,0.40)';
            ctx.lineWidth = (1.8 + i * 0.30) * unit;
            ctx.beginPath();
            ctx.ellipse(
                0,
                0,
                (76 + i * 22) * unit,
                (36 + i * 10) * unit,
                0,
                Math.PI * (0.05 + i * 0.03),
                Math.PI * (1.68 - i * 0.03)
            );
            ctx.stroke();
            ctx.restore();
        }
        ctx.shadowBlur = 0;

        // Segmented ring accents inspired by sleek HUD motifs.
        for (let i = 0; i < 3; i++) {
            const r = (56 + i * 17) * unit;
            ctx.save();
            ctx.rotate(-tick * 0.013 + i * 0.7);
            ctx.lineWidth = (3 - i * 0.6) * unit;
            ctx.strokeStyle = i === 1 ? 'rgba(255,230,0,0.72)' : 'rgba(0,240,255,0.62)';
            for (let seg = 0; seg < 6; seg++) {
                const a0 = seg * (Math.PI * 2 / 6) + 0.08;
                const a1 = a0 + 0.38;
                ctx.beginPath();
                ctx.arc(0, 0, r, a0, a1);
                ctx.stroke();
            }
            ctx.restore();
        }

        // Outer frame with layered bevel.
        ctx.save();
        ctx.rotate(Math.PI / 4 + tick * 0.018);
        this._poly(ctx, 0, 0, 80 * unit, 4, 'rgba(3,7,20,0.95)', 'rgba(0,240,255,0.96)', 3.2 * unit);
        this._poly(ctx, 0, 0, 70 * unit, 4, 'rgba(1,3,10,0.90)', 'rgba(0,240,255,0.24)', 1.2 * unit);
        ctx.restore();

        // Core diamond with gradient + specular highlight.
        ctx.save();
        ctx.rotate(-Math.PI / 4 - tick * 0.026);
        const coreR = (40 + pulse * 5) * unit;
        const coreGrad = ctx.createLinearGradient(-coreR, -coreR, coreR, coreR);
        coreGrad.addColorStop(0, 'rgba(255,70,120,0.98)');
        coreGrad.addColorStop(0.42, 'rgba(255,0,60,0.94)');
        coreGrad.addColorStop(1, 'rgba(120,0,38,0.92)');
        this._poly(ctx, 0, 0, coreR, 4, coreGrad, '#FFFFFF', 1.7 * unit);
        ctx.globalAlpha = 0.26;
        this._poly(ctx, -8 * unit, -8 * unit, 18 * unit, 4, 'rgba(255,255,255,0.22)', 'rgba(255,255,255,0)', 0);
        ctx.globalAlpha = 1;
        ctx.restore();

        // Directional blades / pylons replacing flat bars.
        this._drawCenterBlade(ctx, 0, -110 * unit, 20 * unit, 58 * unit, yellow, tick, true);
        this._drawCenterBlade(ctx, 0, 110 * unit, 20 * unit, 58 * unit, yellow, tick, false);
        this._drawCenterBlade(ctx, -128 * unit, 0, 74 * unit, 14 * unit, red, tick, true);
        this._drawCenterBlade(ctx, 128 * unit, 0, 74 * unit, 14 * unit, cyan, tick, false);

        // Progress text with subtle glow.
        ctx.shadowColor = '#FFFFFF';
        ctx.shadowBlur = 10 * unit;
        ctx.font = 'bold ' + Math.round(19 * unit) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(String(pct).padStart(2, '0') + '%', 0, 7 * unit);
        ctx.shadowBlur = 0;

        // Tiny orbiting indicator nodes for extra motion depth.
        for (let i = 0; i < 6; i++) {
            const a = tick * 0.03 + i * (Math.PI * 2 / 6);
            const rr = (112 + Math.sin(tick * 0.05 + i) * 8) * unit;
            const x = Math.cos(a) * rr;
            const y = Math.sin(a) * rr * 0.52;
            ctx.fillStyle = i % 2 === 0 ? 'rgba(0,240,255,0.85)' : 'rgba(255,230,0,0.85)';
            ctx.beginPath();
            ctx.arc(x, y, (2.2 + (i % 3) * 0.4) * unit, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    _drawCenterBlade(ctx, x, y, w, h, color, tick, reverse) {
        ctx.save();
        ctx.translate(x, y);

        const glow = color === '#FFE600' ? '#FFE600' : (color === '#FF003C' ? '#FF003C' : '#00F0FF');
        const light = color === '#FFE600' ? 'rgba(255,244,120,0.95)' : (color === '#FF003C' ? 'rgba(255,82,128,0.95)' : 'rgba(120,250,255,0.95)');
        const dark = color === '#FFE600' ? 'rgba(140,120,0,0.95)' : (color === '#FF003C' ? 'rgba(120,0,42,0.95)' : 'rgba(0,88,120,0.95)');

        const grad = ctx.createLinearGradient(reverse ? -w / 2 : -w / 3, -h / 2, w / 2, h / 2);
        grad.addColorStop(0, light);
        grad.addColorStop(0.45, color);
        grad.addColorStop(1, dark);

        const skew = Math.max(3, Math.min(w, h) * 0.28);
        ctx.beginPath();
        if (w > h) {
            ctx.moveTo(-w / 2 + skew, -h / 2);
            ctx.lineTo(w / 2, -h / 2);
            ctx.lineTo(w / 2 - skew, h / 2);
            ctx.lineTo(-w / 2, h / 2);
        } else {
            ctx.moveTo(-w / 2, -h / 2 + skew);
            ctx.lineTo(w / 2, -h / 2);
            ctx.lineTo(w / 2, h / 2 - skew);
            ctx.lineTo(-w / 2, h / 2);
        }
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = 'rgba(255,255,255,0.46)';
        ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.08);
        ctx.stroke();

        ctx.globalAlpha = 0.24 + 0.14 * Math.sin(tick * 0.1);
        ctx.fillStyle = '#FFFFFF';
        if (w > h) ctx.fillRect(-w * 0.18, -h * 0.22, w * 0.34, h * 0.18);
        else ctx.fillRect(-w * 0.20, -h * 0.18, w * 0.26, h * 0.34);

        ctx.globalAlpha = 1;
        ctx.shadowColor = glow;
        ctx.shadowBlur = Math.max(5, Math.min(w, h) * 0.34);
        ctx.strokeStyle = this._rgba(glow, 0.38);
        ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.07);
        ctx.stroke();
        ctx.restore();
    }

    _drawStatus(ctx, cW, cH, sX, sY, font) {
        const y = cH * 0.67;
        const w = Math.min(560 * sX, cW - 56 * sX);
        const h = 62 * sY;
        const x = (cW - w) / 2;
        const sl = 26 * sX;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x + sl, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - sl, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        ctx.fillStyle = 'rgba(2,5,14,0.92)';
        ctx.fill();
        ctx.strokeStyle = '#FF003C';
        ctx.lineWidth = 2 * sX;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 148 * sX, y);
        ctx.lineTo(x + 120 * sX, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        ctx.fillStyle = '#FF003C';
        ctx.fill();

        ctx.textAlign = 'center';
        ctx.font = 'bold ' + Math.round(24 * sX) + 'px ' + font;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(this.status, cW / 2, y + 30 * sY);

        ctx.font = Math.round(9 * sX) + 'px monospace';
        ctx.fillStyle = 'rgba(0,240,255,0.82)';
        ctx.fillText(this.detail || 'Synchronizing route', cW / 2, y + 48 * sY);
        ctx.restore();
    }

    _drawFactPanel(ctx, cW, cH, sX, sY, font) {
        const w = Math.min(900 * sX, cW - 58 * sX);
        const h = 70 * sY;
        const x = (cW - w) / 2;
        const y = cH - 154 * sY;
        const sl = 22 * sX;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x + sl, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - sl, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        ctx.fillStyle = 'rgba(3,7,20,0.88)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,240,255,0.72)';
        ctx.lineWidth = 1.5 * sX;
        ctx.stroke();

        ctx.fillStyle = '#FFE600';
        ctx.beginPath();
        ctx.moveTo(x + 18 * sX, y);
        ctx.lineTo(x + 158 * sX, y);
        ctx.lineTo(x + 134 * sX, y + 28 * sY);
        ctx.lineTo(x + 18 * sX, y + 28 * sY);
        ctx.closePath();
        ctx.fill();

        ctx.font = 'bold ' + Math.round(9 * sX) + 'px monospace';
        ctx.fillStyle = '#101010';
        ctx.textAlign = 'left';
        ctx.fillText('SUBNET TIP', x + 32 * sX, y + 18 * sY);

        ctx.font = Math.round(13 * sX) + 'px ' + font;
        ctx.fillStyle = '#DAEEFF';
        const lines = this._wrapText(ctx, this.fact, w - 54 * sX);
        for (let i = 0; i < lines.length && i < 2; i++) {
            ctx.fillText(lines[i], x + 28 * sX, y + (45 + i * 16) * sY);
        }
        ctx.restore();
    }

    _drawLoadingLine(ctx, cW, cH, sX, sY, font) {
        const w = Math.min(620 * sX, cW - 80 * sX);
        const x = (cW - w) / 2;
        const y = cH - 54 * sY;
        const h = Math.max(4 * sY, 3);
        const progressW = w * this.progress;
        const tick = this.animTick || 0;

        ctx.save();
        ctx.font = Math.round(9 * sX) + 'px monospace';
        ctx.fillStyle = 'rgba(0,240,255,0.76)';
        ctx.textAlign = 'left';
        ctx.fillText('LOADING LINE', x, y - 12 * sY);
        ctx.textAlign = 'right';
        ctx.fillText(String(Math.floor(this.progress * 100)).padStart(3, '0') + '%', x + w, y - 12 * sY);

        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#00F0FF';
        ctx.shadowColor = '#00F0FF';
        ctx.shadowBlur = 10 * sX;
        ctx.fillRect(x, y, progressW, h);
        ctx.shadowBlur = 0;

        const markerX = x + progressW;
        ctx.fillStyle = '#FFE600';
        ctx.fillRect(markerX - 4 * sX, y - 5 * sY, 8 * sX, h + 10 * sY);

        ctx.strokeStyle = 'rgba(255,0,60,0.55)';
        ctx.lineWidth = 1 * sX;
        for (let i = 0; i <= 12; i++) {
            const tx = x + (w / 12) * i;
            ctx.beginPath();
            ctx.moveTo(tx, y + 11 * sY + Math.sin(tick * 0.08 + i) * 2 * sY);
            ctx.lineTo(tx + 10 * sX, y + 11 * sY);
            ctx.stroke();
        }
        ctx.restore();
    }

    _drawShutterTransition(ctx, cW, cH, sX, sY) {
        const cover = this._transitionCover();
        if (cover <= 0.001) return;

        const cx = cW / 2;
        const cy = cH / 2;
        const maxRadius = Math.hypot(cW, cH) * 0.58;
        const radius = maxRadius * (1 - cover);
        const unit = Math.min(sX, sY);
        const tick = this.animTick || 0;

        ctx.save();
        if (radius <= 8 * unit) {
            ctx.fillStyle = '#02030A';
            ctx.fillRect(0, 0, cW, cH);
            this._drawShutterSlashes(ctx, cW, cH, sX, sY, 1);
            ctx.restore();
            return;
        }

        ctx.beginPath();
        ctx.rect(0, 0, cW, cH);
        ctx.arc(cx, cy, radius, 0, Math.PI * 2, true);
        ctx.fillStyle = 'rgba(1,3,10,0.96)';
        ctx.fill('evenodd');

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.34 + cover * 0.72 + Math.sin(tick * 0.025) * 0.015);

        const blades = 7;
        const step = Math.PI * 2 / blades;
        const outerR = radius * 1.22;
        const innerR = radius * Math.max(0.10, 0.9 - cover * 0.78);
        for (let i = 0; i < blades; i++) {
            const a0 = i * step;
            const a1 = a0 + step * 0.96;
            const i0 = a0 + step * 0.22;
            const i1 = a1 - step * 0.18;
            const grad = ctx.createLinearGradient(
                Math.cos(a0) * outerR,
                Math.sin(a0) * outerR,
                Math.cos(i1) * innerR,
                Math.sin(i1) * innerR
            );
            grad.addColorStop(0, 'rgba(2,4,12,0.98)');
            grad.addColorStop(0.56, 'rgba(22,26,36,0.95)');
            grad.addColorStop(1, 'rgba(0,0,0,0.86)');

            ctx.beginPath();
            ctx.moveTo(Math.cos(a0) * outerR, Math.sin(a0) * outerR);
            ctx.lineTo(Math.cos(a1) * outerR, Math.sin(a1) * outerR);
            ctx.lineTo(Math.cos(i1) * innerR, Math.sin(i1) * innerR);
            ctx.lineTo(Math.cos(i0) * innerR, Math.sin(i0) * innerR);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.strokeStyle = i % 2 === 0 ? 'rgba(0,240,255,0.30)' : 'rgba(255,0,60,0.24)';
            ctx.lineWidth = 1.2 * unit;
            ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,240,255,' + (0.18 + cover * 0.28) + ')';
        ctx.lineWidth = 2 * unit;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.97, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,230,0,' + (0.12 + cover * 0.22) + ')';
        ctx.lineWidth = 1 * unit;
        ctx.stroke();
        ctx.restore();

        this._drawShutterSlashes(ctx, cW, cH, sX, sY, cover);
        ctx.restore();
    }

    _drawShutterSlashes(ctx, cW, cH, sX, sY, cover) {
        const alpha = Math.min(1, cover * 1.25);
        const tick = this.animTick || 0;
        const slashes = [
            { x: 0.06, y: 0.15, w: 180, h: 18, color: '#FF003C', dir: 1 },
            { x: 0.73, y: 0.18, w: 220, h: 16, color: '#FFE600', dir: -1 },
            { x: 0.10, y: 0.82, w: 260, h: 14, color: '#00F0FF', dir: -1 },
            { x: 0.70, y: 0.78, w: 210, h: 18, color: '#FF003C', dir: 1 },
        ];

        ctx.save();
        for (let i = 0; i < slashes.length; i++) {
            const s = slashes[i];
            const x = cW * s.x + Math.sin(tick * 0.05 + i) * 9 * sX;
            const y = cH * s.y;
            const w = s.w * sX;
            const h = s.h * sY;
            const skew = s.dir * 30 * sX;

            ctx.globalAlpha = alpha * (0.36 + i * 0.07);
            ctx.beginPath();
            ctx.moveTo(x + skew, y);
            ctx.lineTo(x + w + skew, y);
            ctx.lineTo(x + w - skew, y + h);
            ctx.lineTo(x - skew, y + h);
            ctx.closePath();
            ctx.fillStyle = s.color;
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    _transitionCover() {
        const p = Math.max(0, Math.min(1, this.progress || 0));
        if (p < this.transitionInRatio) {
            return 1 - this._easeOutCubic(p / this.transitionInRatio);
        }

        const outStart = 1 - this.transitionOutRatio;
        if (p > outStart) {
            return this._easeInOutCubic((p - outStart) / this.transitionOutRatio);
        }

        return 0;
    }

    _drawSoftFade(ctx, cW, cH) {
        const alpha = this._softFadeAlpha();
        if (alpha <= 0.001) return;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, cW, cH);
        ctx.restore();
    }

    _softFadeAlpha() {
        const p = Math.max(0, Math.min(1, this.progress || 0));
        if (p < this.fadeInRatio) {
            return 1 - this._easeOutCubic(p / this.fadeInRatio);
        }

        const outStart = 1 - this.fadeOutRatio;
        if (p > outStart) {
            return this._easeInOutCubic((p - outStart) / this.fadeOutRatio);
        }

        return 0;
    }

    _easeOutCubic(t) {
        return 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
    }

    _easeInOutCubic(t) {
        const x = Math.max(0, Math.min(1, t));
        return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    }

    _poly(ctx, x, y, radius, sides, fill, stroke, lineWidth) {
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const a = -Math.PI / 2 + i * Math.PI * 2 / sides;
            const px = x + Math.cos(a) * radius;
            const py = y + Math.sin(a) * radius;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
    }

    _rgba(hex, alpha) {
        if (hex === '#FF003C') return 'rgba(255,0,60,' + alpha + ')';
        if (hex === '#FFE600') return 'rgba(255,230,0,' + alpha + ')';
        return 'rgba(0,240,255,' + alpha + ')';
    }

    _wrapText(ctx, text, maxW) {
        const words = String(text || '').split(' ');
        const lines = [];
        let line = '';
        for (let i = 0; i < words.length; i++) {
            const test = line ? line + ' ' + words[i] : words[i];
            if (line && ctx.measureText(test).width > maxW) {
                lines.push(line);
                line = words[i];
            } else {
                line = test;
            }
        }
        if (line) lines.push(line);
        return lines;
    }

    _randomFact() {
        if (!this._factPool || this._factPool.length === 0) return 'CIDR tells you how many network bits are locked in the mask.';
        return this._factPool[Math.floor(Math.random() * this._factPool.length)];
    }

    _createSubnetFacts() {
        return [
            'Class A addresses start with 1-126 in the first octet and default to /8.',
            'Class B addresses start with 128-191 in the first octet and default to /16.',
            'Class C addresses start with 192-223 in the first octet and default to /24.',
            'To find a block size, subtract the interesting mask octet from 256.',
            'CIDR host bits are 32 minus the prefix length; /27 leaves 5 host bits.',
            'Usable host count is usually 2 to the host bits, minus network and broadcast.',
            '/30 gives 4 total addresses and 2 usable hosts, perfect for point-to-point links.',
            '/24 has 256 total addresses; with classic rules, 254 are usable hosts.',
            'A /26 splits a /24 into 4 subnets with 64 addresses each.',
            'A /28 creates blocks of 16 addresses; usable host range is usually 14.',
            'The wildcard mask is the inverse of the subnet mask: 255.255.255.0 becomes 0.0.0.255.',
            'Private IPv4 ranges are 10.0.0.0/8, 172.16.0.0/12, and 192.168.0.0/16.',
            'The first address in a subnet is the network ID; the last is usually broadcast.',
            'If the mask octet is 240, the block size is 16 because 256 - 240 = 16.',
            'A quick CIDR ladder: /25=128, /26=64, /27=32, /28=16, /29=8, /30=4.',
        ];
    }

    static show(options) {
        const opts = options || {};
        if (opts.fadeMusicOnStart && IP2Live.MusicManager) {
            const fadeMs = typeof opts.musicFadeDurationMs === 'number' ? opts.musicFadeDurationMs : 2200;
            if (typeof IP2Live.MusicManager.fadeOutForTransition === 'function') {
                IP2Live.MusicManager.fadeOutForTransition(fadeMs);
            } else if (typeof IP2Live.MusicManager.stop === 'function') {
                IP2Live.MusicManager.stop(fadeMs);
            }
        }

        const scene = new IP2LiveLoadingScreen(opts);
        const mode = opts.mode || 'push';
        if (mode === 'replace') {
            Manager.Stack.replace(scene);
        } else if (mode === 'reset') {
            Manager.Stack.popAll();
            Manager.Stack.push(scene);
        } else {
            Manager.Stack.push(scene);
        }
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        return scene;
    }
}

IP2Live.LoadingScreen = IP2LiveLoadingScreen;
window.IP2LiveLoadingScreen = IP2LiveLoadingScreen;

console.log('[IP2Live] loading-screen.js loaded.');
