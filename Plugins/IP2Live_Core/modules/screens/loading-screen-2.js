/**
 * IP2Live - Loading Screen 2
 * A simpler cyberpunk / Matrix-inspired bridge tailored for gameplay / tutorial transitions.
 * Features a creeping code effect instead of a central 3D object.
 *
 * Loaded via fetch + new Function() by code.js. Do not use import/export.
 */

class IP2LiveLoadingScreen2 extends Scene.Base {
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
        this.status = 'Loading Stage';
        this.detail = 'Connecting to instance';
        this.onComplete = null;
        this._actionStarted = false;
        this._actionError = null;
        this._factPool = this._createSubnetFacts();
        this.fact = this._randomFact();
        this.particles = [];
        this.shards = [];

        // Pre-generate random offsets for the code creep transition so it's consistent across frames
        this._creepOffsetsH = Array.from({ length: 250 }, () => Math.random());
        this._creepOffsetsV = Array.from({ length: 250 }, () => Math.random());
        this._creepChars = ['0', '1', 'X', 'A', 'F', 'C', 'E', '@', '#', '%', '&', 'SYS', 'NET'];

        this._configure(this._pendingOptions || {});
    }

    _configure(options) {
        const opts = options || {};
        this.status = opts.status || opts.label || this.status || 'Loading Stage';
        this.detail = opts.detail || opts.substatus || this.detail || '';
        this.onComplete = typeof opts.onComplete === 'function' ? opts.onComplete : null;
        this.durationMs = typeof opts.durationMs === 'number'
            ? Math.max(300, opts.durationMs)
            : this._randomDurationMs();
        if (opts.fact) this.fact = opts.fact;
    }

    _randomDurationMs() {
        return 4500 + Math.floor(Math.random() * 1500); // Extremely slow and dramatic transition
    }

    async load() {
        if (IP2Live.Assets && typeof IP2Live.Assets.loadAll === 'function' && !IP2Live.Assets.nebulaLoaded) {
            try {
                await IP2Live.Assets.loadAll();
            } catch (e) {
                console.warn('[IP2Live] Loading screen 2 asset warmup failed:', e);
            }
        }

        const ctx = Common.Platform.ctx;
        const cW = ctx && ctx.canvas ? ctx.canvas.width : Common.ScreenResolution.SCREEN_X;
        const cH = ctx && ctx.canvas ? ctx.canvas.height : Common.ScreenResolution.SCREEN_Y;
        this._seedParticles(cW, cH);
        this.startedAt = Date.now();
        this.loading = false;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    _seedParticles(cW, cH) {
        // Less particles than the main loading screen for a simpler look
        const chars = ['0', '1', '255', 'NET', 'SYS'];
        this.particles = [];
        for (let i = 0; i < 40; i++) {
            this.particles.push({
                x: Math.random() * cW,
                y: Math.random() * cH,
                vx: (Math.random() - 0.5) * 0.25,
                vy: 0.25 + Math.random() * 0.75,
                size: 8 + Math.random() * 8,
                alpha: 0.02 + Math.random() * 0.12,
                char: chars[Math.floor(Math.random() * chars.length)],
                flip: 24 + Math.floor(Math.random() * 90),
                cW,
                cH,
            });
        }
    }

    update() {
        this.animTick++;
        this.scanlineOffset = (this.scanlineOffset + 0.55) % 4;

        if (!this.startedAt) this.startedAt = Date.now();
        const elapsed = Date.now() - this.startedAt;
        this.progress = Math.min(1, elapsed / this.durationMs);

        const chars = ['0', '1', '255', '128', '64', '32', 'HOST', 'NODE'];
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
                    console.warn('[IP2Live] Loading 2 transition failed:', e);
                });
            }
        } catch (e) {
            this._actionError = e;
            console.warn('[IP2Live] Loading 2 transition failed:', e);
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
        
        // No central rotating object here for a simpler look.
        
        this._drawStatus(ctx, cW, cH, sX, sY, font);
        this._drawFactPanel(ctx, cW, cH, sX, sY, font);
        this._drawLoadingLine(ctx, cW, cH, sX, sY, font);
        
        // New Creeping Code Transition instead of camera shutter
        this._drawCodeCreepTransition(ctx, cW, cH, sX, sY);
        
        this._drawSoftFade(ctx, cW, cH);
        ctx.restore();
    }

    _drawBackground(ctx, cW, cH, sX, sY) {
        const bg = ctx.createLinearGradient(0, 0, 0, cH);
        bg.addColorStop(0, '#020308');
        bg.addColorStop(0.5, '#050710');
        bg.addColorStop(1, '#080a14');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, cW, cH);

        ctx.save();
        ctx.globalAlpha = 0.6;
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = i % 2 === 0 ? '#FFE600' : '#00F0FF';
            ctx.font = Math.round(p.size * sX) + 'px monospace';
            ctx.fillText(p.char, p.x, p.y);
        }
        ctx.restore();

        ctx.globalAlpha = 0.05;
        ctx.fillStyle = '#000000';
        for (let y = this.scanlineOffset * sY; y < cH; y += 4 * sY) {
            ctx.fillRect(0, y, cW, Math.max(1, 1.5 * sY));
        }
        ctx.globalAlpha = 1;
        
        // Simpler corner accents instead of large blocks
        ctx.fillStyle = 'rgba(0,240,255,0.7)';
        ctx.fillRect(0, 0, 120 * sX, 4 * sY);
        ctx.fillRect(0, 0, 4 * sX, 60 * sY);
        
        ctx.fillStyle = 'rgba(255,0,60,0.7)';
        ctx.fillRect(cW - 120 * sX, cH - 4 * sY, 120 * sX, 4 * sY);
        ctx.fillRect(cW - 4 * sX, cH - 60 * sY, 4 * sX, 60 * sY);
    }

    _drawTitle(ctx, cW, sX, sY, titleFont) {
        const y = 60 * sY;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = 'bold ' + Math.round(38 * sX) + 'px ' + titleFont;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('IP2LIVE SYSTEM', cW / 2, y);

        ctx.font = Math.round(10 * sX) + 'px monospace';
        ctx.fillStyle = 'rgba(0,240,255,0.72)';
        ctx.fillText('STAGE TRANSITION_BRIDGE // ACTIVE', cW / 2, y + 22 * sY);
        ctx.restore();
    }

    _drawStatus(ctx, cW, cH, sX, sY, font) {
        const y = cH * 0.45; // Moved up slightly due to lack of center object
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = 'bold ' + Math.round(22 * sX) + 'px ' + font;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(this.status, cW / 2, y);

        ctx.font = Math.round(11 * sX) + 'px monospace';
        ctx.fillStyle = 'rgba(0,240,255,0.82)';
        ctx.fillText(this.detail || 'Loading assets...', cW / 2, y + 24 * sY);
        ctx.restore();
    }

    _drawFactPanel(ctx, cW, cH, sX, sY, font) {
        const w = Math.min(800 * sX, cW - 40 * sX);
        const h = 60 * sY;
        const x = (cW - w) / 2;
        const y = cH - 140 * sY;

        ctx.save();
        ctx.fillStyle = 'rgba(3,7,20,0.88)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(0,240,255,0.4)';
        ctx.lineWidth = 1 * sX;
        ctx.strokeRect(x, y, w, h);

        ctx.fillStyle = '#FFE600';
        ctx.fillRect(x, y, 6 * sX, h); // Yellow left border

        ctx.font = 'bold ' + Math.round(10 * sX) + 'px monospace';
        ctx.fillStyle = 'rgba(0,240,255,0.9)';
        ctx.textAlign = 'left';
        ctx.fillText('SUBNET TIP //', x + 20 * sX, y + 18 * sY);

        ctx.font = Math.round(13 * sX) + 'px ' + font;
        ctx.fillStyle = '#DAEEFF';
        const lines = this._wrapText(ctx, this.fact, w - 40 * sX);
        for (let i = 0; i < lines.length && i < 2; i++) {
            ctx.fillText(lines[i], x + 20 * sX, y + (40 + i * 16) * sY);
        }
        ctx.restore();
    }

    _drawLoadingLine(ctx, cW, cH, sX, sY, font) {
        const w = Math.min(620 * sX, cW - 80 * sX);
        const x = (cW - w) / 2;
        const y = cH - 44 * sY;
        const h = Math.max(3 * sY, 2);
        const progressW = w * this.progress;

        ctx.save();
        ctx.font = Math.round(10 * sX) + 'px monospace';
        ctx.fillStyle = 'rgba(0,240,255,0.76)';
        ctx.textAlign = 'left';
        ctx.fillText('SYSTEM PROGRESS', x, y - 10 * sY);
        ctx.textAlign = 'right';
        ctx.fillText(String(Math.floor(this.progress * 100)).padStart(3, '0') + '%', x + w, y - 10 * sY);

        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#00F0FF';
        ctx.shadowColor = '#00F0FF';
        ctx.shadowBlur = 8 * sX;
        ctx.fillRect(x, y, progressW, h);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#FF003C';
        ctx.fillRect(x + progressW - 2 * sX, y - 3 * sY, 4 * sX, h + 6 * sY);
        ctx.restore();
    }

    _drawCodeCreepTransition(ctx, cW, cH, sX, sY) {
        const cover = this._transitionCover();
        if (cover <= 0.001) return;
        
        if (cover >= 0.999) {
            ctx.fillStyle = '#010206';
            ctx.fillRect(0, 0, cW, cH);
            return;
        }

        ctx.save();
        
        const tick = this.animTick || 0;
        const cx = cW / 2;
        const cy = cH / 2;
        
        // Calculate the maximum radius needed to cover the corners of the screen
        const maxRadius = Math.sqrt(cx * cx + cy * cy);
        // The hole shrinks towards the center
        const currentRadius = maxRadius * (1 - cover);

        // 1) Draw solid dark background outside the current radius
        ctx.fillStyle = '#010206';
        ctx.beginPath();
        ctx.rect(0, 0, cW, cH);
        ctx.arc(cx, cy, currentRadius, 0, Math.PI * 2, true); // Counter-clockwise to cut a hole
        ctx.fill();

        // 2) Fill the covered area with random numbers
        const cellSize = 16 * sX; // Smaller cells = much higher density of numbers
        const cols = Math.ceil(cW / cellSize);
        const rows = Math.ceil(cH / cellSize);
        
        ctx.font = 'bold ' + Math.round(14 * sX) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (let i = 0; i < cols; i++) {
            for (let j = 0; j < rows; j++) {
                const x = i * cellSize + cellSize / 2;
                const y = j * cellSize + cellSize / 2;
                
                const dx = x - cx;
                const dy = y - cy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                // Add a tiny bit of random jitter to the edge
                if (dist > currentRadius - (Math.random() * 15 * sX)) {
                    // Pseudo-random value that changes every 3 frames to avoid seizure-inducing flicker
                    const seed = Math.abs(Math.sin(i * 12.9898 + j * 78.233 + Math.floor(tick / 3)) * 43758.5453);
                    const rand = seed - Math.floor(seed);
                    
                    // 85% chance to draw a number in this cell, making it extremely populated
                    if (rand > 0.15) {
                        if (rand > 0.92) ctx.fillStyle = '#00F0FF';
                        else if (rand > 0.84) ctx.fillStyle = '#FF003C';
                        else if (rand > 0.76) ctx.fillStyle = '#FFE600';
                        else ctx.fillStyle = '#3A4B5C'; // Dimmer tech-blue for the bulk of numbers
                        
                        ctx.globalAlpha = 0.4 + (rand * 0.6);
                        
                        const char = Math.floor(rand * 100) % 10;
                        ctx.fillText(char.toString(), x, y);
                    }
                }
            }
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
            const fadeMs = typeof opts.musicFadeDurationMs === 'number' ? opts.musicFadeDurationMs : 1500;
            if (typeof IP2Live.MusicManager.fadeOutForTransition === 'function') {
                IP2Live.MusicManager.fadeOutForTransition(fadeMs);
            } else if (typeof IP2Live.MusicManager.stop === 'function') {
                IP2Live.MusicManager.stop(fadeMs);
            }
        }

        const scene = new IP2LiveLoadingScreen2(opts);
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

IP2Live.LoadingScreen2 = IP2LiveLoadingScreen2;
window.IP2LiveLoadingScreen2 = IP2LiveLoadingScreen2;

console.log('[IP2Live] loading-screen-2.js loaded.');
