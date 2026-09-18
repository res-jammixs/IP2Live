/**
 * IP2Live - Loading Screen
 * A short cyberpunk / Persona-inspired bridge for map and menu transitions.
 *
 * Loaded via fetch + new Function() by code.js. Do not use import/export.
 */

IP2Live.LoadingUIComponents = IP2Live.LoadingUIComponents || (function () {
    function traceNotchedPanel(ctx, x, y, w, h, cut) {
        const c = Math.max(3, cut || 10);
        ctx.beginPath();
        ctx.moveTo(x + c, y);
        ctx.lineTo(x + w - c, y);
        ctx.lineTo(x + w, y + c);
        ctx.lineTo(x + w, y + h - c);
        ctx.lineTo(x + w - c, y + h);
        ctx.lineTo(x + c * 0.55, y + h);
        ctx.lineTo(x, y + h - c * 0.55);
        ctx.lineTo(x, y + c);
        ctx.closePath();
    }

    function measureTrackedText(ctx, text, tracking) {
        const value = String(text || '');
        return ctx.measureText(value).width + Math.max(0, value.length - 1) * (tracking || 0);
    }

    function drawTrackedText(ctx, text, x, y, tracking, align) {
        const value = String(text || '');
        const spacing = tracking || 0;
        if (!value || spacing <= 0) {
            ctx.fillText(value, x, y);
            return;
        }
        const width = measureTrackedText(ctx, value, spacing);
        let cursor = align === 'center' ? x - width / 2 : (align === 'right' ? x - width : x);
        const previousAlign = ctx.textAlign;
        ctx.textAlign = 'left';
        for (let i = 0; i < value.length; i++) {
            const character = value.charAt(i);
            ctx.fillText(character, cursor, y);
            cursor += ctx.measureText(character).width + spacing;
        }
        ctx.textAlign = previousAlign;
    }

    function fitFont(ctx, text, maxWidth, startSize, minSize, sX, font, weight, tracking) {
        let size = startSize;
        do {
            ctx.font = (weight || '') + Math.round(size * sX) + 'px ' + font;
            if (measureTrackedText(ctx, text, tracking) <= maxWidth) break;
            size--;
        } while (size >= minSize);
        return size;
    }

    function wrapText(ctx, text, maxWidth) {
        const words = String(text || '').split(/\s+/);
        const lines = [];
        let line = '';
        for (let i = 0; i < words.length; i++) {
            const candidate = line ? line + ' ' + words[i] : words[i];
            if (line && ctx.measureText(candidate).width > maxWidth) {
                lines.push(line);
                line = words[i];
            } else {
                line = candidate;
            }
        }
        if (line) lines.push(line);
        return lines;
    }

    function drawStatusModule(ctx, options) {
        const o = options;
        const unit = Math.min(o.sX, o.sY);
        const centerX = o.x + o.w / 2;
        const maxTextWidth = o.w - 88 * o.sX;
        const title = String(o.title || 'LOADING').toUpperCase();
        const tracking = 1.35 * o.sX;
        const topPadding = (o.topPadding || 0) * o.sY;
        const titleY = o.y + 31 * o.sY + topPadding;

        ctx.save();
        ctx.textAlign = 'center';
        fitFont(ctx, title, maxTextWidth, 27, 16, o.sX, o.font, 'bold ', tracking);
        const titleWidth = measureTrackedText(ctx, title, tracking);

        ctx.globalAlpha = 0.34;
        ctx.fillStyle = '#FF164D';
        drawTrackedText(ctx, title, centerX - 2 * unit, titleY + unit, tracking, 'center');
        ctx.fillStyle = '#00F0FF';
        drawTrackedText(ctx, title, centerX + 2 * unit, titleY - unit, tracking, 'center');
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#F4FAFF';
        ctx.shadowColor = 'rgba(0,240,255,0.36)';
        ctx.shadowBlur = 7 * unit;
        drawTrackedText(ctx, title, centerX, titleY, tracking, 'center');
        ctx.shadowBlur = 0;

        const accentY = o.y + 46 * o.sY + topPadding;
        const accentHalf = Math.min(o.w * 0.39, titleWidth * 0.62 + 42 * o.sX);
        const accentStart = centerX - accentHalf;
        const accentEnd = centerX + accentHalf;
        const splitGap = Math.max(10 * o.sX, titleWidth * 0.035);
        const leftRail = ctx.createLinearGradient(accentStart, accentY, centerX, accentY);
        leftRail.addColorStop(0, 'rgba(255,22,77,0)');
        leftRail.addColorStop(1, 'rgba(255,22,77,0.9)');
        ctx.fillStyle = leftRail;
        ctx.fillRect(accentStart, accentY, accentHalf - splitGap, Math.max(1, 1.5 * unit));
        const rightRail = ctx.createLinearGradient(centerX, accentY, accentEnd, accentY);
        rightRail.addColorStop(0, 'rgba(0,240,255,0.9)');
        rightRail.addColorStop(1, 'rgba(0,240,255,0)');
        ctx.fillStyle = rightRail;
        ctx.fillRect(centerX + splitGap, accentY, accentHalf - splitGap, Math.max(1, 1.5 * unit));

        ctx.save();
        ctx.fillStyle = '#FFE600';
        ctx.shadowColor = '#FFE600';
        ctx.shadowBlur = 7 * unit;
        ctx.beginPath();
        ctx.arc(centerX, accentY + unit * 0.7, 3.2 * unit, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(centerX, accentY + unit * 0.7, 1.1 * unit, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.restore();
    }

    function drawInfoCard(ctx, options) {
        const o = options;
        const label = String(o.label || 'Subnet Tip') + ':';
        const text = String(o.text || '');
        const labelTracking = 0.85 * o.sX;
        const bodyTracking = 0.35 * o.sX;
        const baseline = o.y + 20 * o.sY;
        const centerX = o.x + o.w / 2;
        const gap = 11 * o.sX;

        ctx.save();
        ctx.font = 'bold ' + Math.round(10 * o.sX) + 'px ' + o.font;
        const labelWidth = measureTrackedText(ctx, label, labelTracking);

        ctx.font = Math.round(12 * o.sX) + 'px ' + o.font;
        const fullBodyWidth = measureTrackedText(ctx, text, bodyTracking);
        const fullLineWidth = labelWidth + gap + fullBodyWidth;
        let firstLine = text;
        let splitIndex = text.split(/\s+/).length;
        const words = text.split(/\s+/);
        if (fullLineWidth > o.w) {
            const firstLineWidth = Math.max(80 * o.sX, o.w - labelWidth - gap);
            firstLine = '';
            splitIndex = words.length;
            for (let i = 0; i < words.length; i++) {
                const candidate = firstLine ? firstLine + ' ' + words[i] : words[i];
                if (firstLine && measureTrackedText(ctx, candidate, bodyTracking) > firstLineWidth) {
                    splitIndex = i;
                    break;
                }
                firstLine = candidate;
            }
        }
        const firstBodyWidth = measureTrackedText(ctx, firstLine, bodyTracking);
        const firstGroupWidth = labelWidth + gap + firstBodyWidth;
        const firstX = centerX - firstGroupWidth / 2;

        ctx.font = 'bold ' + Math.round(10 * o.sX) + 'px ' + o.font;
        ctx.fillStyle = '#FFE95A';
        ctx.textAlign = 'left';
        drawTrackedText(ctx, label, firstX, baseline, labelTracking, 'left');

        ctx.font = Math.round(12 * o.sX) + 'px ' + o.font;
        ctx.fillStyle = '#DAEEFF';
        drawTrackedText(ctx, firstLine, firstX + labelWidth + gap, baseline, bodyTracking, 'left');

        if (splitIndex < words.length) {
            const secondLine = words.slice(splitIndex).join(' ');
            drawTrackedText(ctx, secondLine, centerX, baseline + 16 * o.sY, bodyTracking, 'center');
        }
        ctx.restore();
    }

    function drawProgressTrack(ctx, options) {
        const o = options;
        const unit = Math.min(o.sX, o.sY);
        const ratio = Math.max(0, Math.min(1, o.progress || 0));
        const trackY = o.y;
        const trackH = Math.max(10 * o.sY, 7);
        const inset = Math.max(3 * unit, 2);
        const innerX = o.x + inset;
        const innerY = trackY + inset;
        const innerW = Math.max(0, o.w - inset * 2);
        const innerH = Math.max(2, trackH - inset * 2);
        const progressW = innerW * ratio;

        ctx.save();
        ctx.font = Math.round(9 * o.sX) + 'px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(0,240,255,0.76)';
        ctx.fillText(o.label || 'ROUTE TRANSFER', o.x, trackY - 12 * o.sY);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#EAFBFF';
        ctx.fillText(String(Math.floor(ratio * 100)).padStart(3, '0') + '%', o.x + o.w, trackY - 12 * o.sY);

        traceNotchedPanel(ctx, o.x, trackY, o.w, trackH, 4 * unit);
        const shell = ctx.createLinearGradient(o.x, trackY, o.x, trackY + trackH);
        shell.addColorStop(0, 'rgba(36,54,69,0.98)');
        shell.addColorStop(0.5, 'rgba(6,12,24,0.98)');
        shell.addColorStop(1, 'rgba(1,4,12,0.98)');
        ctx.fillStyle = shell;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,240,255,0.42)';
        ctx.lineWidth = Math.max(1, unit);
        ctx.stroke();

        ctx.save();
        ctx.beginPath();
        ctx.rect(innerX, innerY, innerW, innerH);
        ctx.clip();
        if (progressW > 0) {
            const progressFill = ctx.createLinearGradient(innerX, innerY, innerX + innerW, innerY);
            progressFill.addColorStop(0, '#008EAD');
            progressFill.addColorStop(0.62, '#00F0FF');
            progressFill.addColorStop(1, '#FFE600');
            ctx.fillStyle = progressFill;
            ctx.shadowColor = '#00F0FF';
            ctx.shadowBlur = 10 * unit;
            ctx.fillRect(innerX, innerY, progressW, innerH);
            ctx.shadowBlur = 0;

            const sweepWidth = 52 * o.sX;
            const sweepX = innerX - sweepWidth + (((o.tick || 0) * 3 * unit) % Math.max(sweepWidth, progressW + sweepWidth));
            const sweep = ctx.createLinearGradient(sweepX, innerY, sweepX + sweepWidth, innerY);
            sweep.addColorStop(0, 'rgba(255,255,255,0)');
            sweep.addColorStop(0.5, 'rgba(255,255,255,0.58)');
            sweep.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = sweep;
            ctx.fillRect(sweepX, innerY, sweepWidth, innerH);
        }

        const segmentCount = 18;
        for (let i = 1; i < segmentCount; i++) {
            const sx = innerX + (innerW / segmentCount) * i;
            ctx.fillStyle = 'rgba(1,5,14,0.58)';
            ctx.fillRect(sx, innerY, Math.max(1, unit), innerH);
        }
        ctx.restore();

        const markerX = innerX + progressW;
        if (ratio > 0) {
            ctx.save();
            ctx.translate(markerX, trackY + trackH / 2);
            ctx.rotate(Math.PI / 4);
            ctx.fillStyle = '#FFE600';
            ctx.shadowColor = '#FFE600';
            ctx.shadowBlur = 9 * unit;
            const markerSize = 5 * unit;
            ctx.fillRect(-markerSize / 2, -markerSize / 2, markerSize, markerSize);
            ctx.restore();
        }

        ctx.fillStyle = 'rgba(255,22,77,0.5)';
        ctx.fillRect(o.x, trackY + trackH + 6 * o.sY, o.w * 0.16, Math.max(1, o.sY));
        ctx.fillStyle = 'rgba(0,240,255,0.35)';
        ctx.fillRect(o.x + o.w * 0.18, trackY + trackH + 6 * o.sY, o.w * 0.08, Math.max(1, o.sY));
        ctx.restore();
    }

    return {
        drawStatusModule,
        drawInfoCard,
        drawProgressTrack,
    };
})();

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
        if (
            IP2Live.Assets && typeof IP2Live.Assets.loadAll === 'function' &&
            (!IP2Live.Assets.nebulaLoaded || !IP2Live.Assets.oxaniumMediumLoaded)
        ) {
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
        const font = IP2Live.Assets && IP2Live.Assets.oxaniumMediumLoaded ? 'Oxanium-Medium' : 'sans-serif';
        const titleFont = IP2Live.Assets && IP2Live.Assets.abnesLoaded ? 'Abnes' : 'Arial Black';

        ctx.save();
        this._drawBackground(ctx, cW, cH, sX, sY);
        this._drawTitle(ctx, cW, sX, sY, titleFont);
        this._drawCenterObject(ctx, cW / 2, cH * 0.44, Math.min(cW, cH) / 720);
        this._drawStatus(ctx, cW, cH, sX, sY, font);
        this._drawFactPanel(ctx, cW, cH, sX, sY, font);
        this._drawForegroundCorner(ctx, cW, cH, sX, sY);
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

        this._drawTexturedCorner(ctx, [
            { x: 0, y: 0 },
            { x: 286 * sX, y: 0 },
            { x: 210 * sX, y: 72 * sY },
            { x: 0, y: 112 * sY },
        ], '#FF164D', '#700027', sX, sY, false);

    }

    _drawForegroundCorner(ctx, cW, cH, sX, sY) {
        this._drawTexturedCorner(ctx, [
            { x: cW, y: cH },
            { x: cW - 340 * sX, y: cH },
            { x: cW - 250 * sX, y: cH - 76 * sY },
            { x: cW, y: cH - 136 * sY },
        ], '#FFF21A', '#C78D00', sX, sY, true);
    }

    _drawTexturedCorner(ctx, points, colorStart, colorEnd, sX, sY, reverse) {
        const xs = points.map(function (point) { return point.x; });
        const ys = points.map(function (point) { return point.y; });
        const minX = Math.min.apply(Math, xs);
        const maxX = Math.max.apply(Math, xs);
        const minY = Math.min.apply(Math, ys);
        const maxY = Math.max.apply(Math, ys);
        const trace = function () {
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
            ctx.closePath();
        };

        ctx.save();
        ctx.shadowColor = this._rgba(colorStart, 0.28);
        ctx.shadowBlur = 16 * sX;
        trace();
        const gradient = ctx.createLinearGradient(minX, minY, maxX, maxY);
        gradient.addColorStop(0, colorStart);
        gradient.addColorStop(0.58, colorStart);
        gradient.addColorStop(1, colorEnd);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.shadowBlur = 0;

        trace();
        ctx.clip();
        const diagonal = 20 * sX;
        for (let hx = minX - (maxY - minY); hx < maxX + (maxY - minY); hx += diagonal) {
            ctx.strokeStyle = reverse ? 'rgba(72,42,0,0.11)' : 'rgba(255,255,255,0.075)';
            ctx.lineWidth = Math.max(1, 4 * sX);
            ctx.beginPath();
            ctx.moveTo(hx, maxY);
            ctx.lineTo(hx + (reverse ? -1 : 1) * 70 * sX, minY);
            ctx.stroke();
        }
        for (let hy = minY + 7 * sY; hy < maxY; hy += 7 * sY) {
            ctx.fillStyle = reverse ? 'rgba(35,20,0,0.055)' : 'rgba(12,0,18,0.065)';
            ctx.fillRect(minX, hy, maxX - minX, Math.max(1, sY));
        }
        const sheen = ctx.createLinearGradient(minX, minY, maxX, minY);
        sheen.addColorStop(0, 'rgba(255,255,255,0.18)');
        sheen.addColorStop(0.35, 'rgba(255,255,255,0.02)');
        sheen.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sheen;
        ctx.fillRect(minX, minY, maxX - minX, 7 * sY);
        ctx.restore();

        ctx.save();
        trace();
        ctx.strokeStyle = reverse ? 'rgba(255,248,112,0.82)' : 'rgba(255,92,132,0.78)';
        ctx.lineWidth = Math.max(1, 1.2 * sX);
        ctx.stroke();
        ctx.restore();
    }

    _drawTitle(ctx, cW, sX, sY, titleFont) {
        const y = 84 * sY;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = 'bold ' + Math.round(54 * sX) + 'px ' + titleFont;
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('IP2LIVE', cW / 2, y);

        const slashW = 118 * sX;
        const slashY = y + 22 * sY;
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
        const w = Math.min(620 * sX, cW - 64 * sX);
        IP2Live.LoadingUIComponents.drawStatusModule(ctx, {
            x: (cW - w) / 2,
            y: cH * 0.665,
            w,
            h: 52 * sY,
            title: this.status,
            topPadding: 14,
            font,
            sX,
            sY,
            tick: this.animTick,
        });
    }

    _drawFactPanel(ctx, cW, cH, sX, sY, font) {
        const w = Math.min(820 * sX, cW - 80 * sX);
        IP2Live.LoadingUIComponents.drawInfoCard(ctx, {
            x: (cW - w) / 2,
            y: cH * 0.665 + 58 * sY,
            w,
            h: 42 * sY,
            label: 'Subnet Tip',
            text: this.fact,
            font,
            sX,
            sY,
        });
    }

    _drawLoadingLine(ctx, cW, cH, sX, sY, font) {
        const w = Math.min(620 * sX, cW - 80 * sX);
        IP2Live.LoadingUIComponents.drawProgressTrack(ctx, {
            x: (cW - w) / 2,
            y: cH - 48 * sY,
            w,
            progress: this.progress,
            label: 'ROUTE TRANSFER',
            sX,
            sY,
            tick: this.animTick,
        });
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
        const ranges = IP2Live.IPClassRanges;
        const classFacts = ranges && typeof ranges.loadingTip === 'function'
            ? ['A', 'B', 'C'].map(function (className) { return ranges.loadingTip(className); })
            : [];
        return classFacts.concat([
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
        ]);
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
