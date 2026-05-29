/**
 * IP2Live â€” Main Menu Screen
 * @file Plugins/IP2Live_Core/modules/screens/main-menu.js
 * Loaded via fetch + new Function() by code.js â€” all engine globals are
 * injected as function parameters (Common, Core, Data, Graphic, Manager,
 * Scene, Model, Main, THREE, IP2Live).
 *
 * NOTE: This file must be loaded LAST among screen modules because it
 * references IP2LiveNameInputScreen, IP2LiveLoadGameMenu,
 * IP2LiveSettingsMenu, and IP2LiveCreditsScene.
 */

class IP2LiveMainMenu extends Scene.Base {
    constructor() { super(true); }

    initialize() {
        this.selectedIndex = 0;
        this.menuItems = ["NEW GAME", "LOAD GAME", "SETTINGS", "CREDITS", "QUIT GAME"];
        this.scanlineOffset = 0;
        this.glitchTimer = 0;
        this.glitchActive = false;
        this.hoverIndex = -1;
        this.animTick = 0;
        this.btnProgress = Array(this.menuItems.length).fill(0);
        this.deckNodes = [];

        // Title decrypt animation
        this.titleTarget   = 'IP2LIVE';
        this.titleProgress = 0;
        this.titleDone     = false;

        // Floating binary / hacker particles
        this.particles = [];

        // Background shake — constant sine-wave breathing
        this.shakeX = 0;
        this.shakeY = 0;

        // Fade-out transition (for New Game)
        this.fadeOut       = 0;   // 0..1, opacity of black overlay
        this.fadeTarget    = null; // null or 0 (New Game case index)

        // Music guard — ensure we only call play() once per session
        this._musicStarted = false;
        this.networkBackdrop = (window.IP2LiveBackgroundScreen)
            ? new window.IP2LiveBackgroundScreen()
            : null;
    }

    async load() {
        await IP2Live.Assets.loadAll();
        this._seedParticles(80);
        this._seedDeckNodes(28);
        this.loading = false;
        Manager.Stack.requestPaintHUD = true;
        // Attempt to start music immediately — works if autoplay is allowed.
        // If blocked, the MusicManager will queue it for first user interaction.
        if (IP2Live.MusicManager) {
            IP2Live.MusicManager.play(IP2Live.MusicManager.ZONE.MAIN_MENU);
        }
        this._musicStarted = true;
    }

    // Ensures music starts on the very first user key interaction if
    // autoplay was blocked by the browser.
    _tryStartMusic() {
        if (this._musicStarted) return;
        if (IP2Live.MusicManager) {
            IP2Live.MusicManager.play(IP2Live.MusicManager.ZONE.MAIN_MENU);
        }
        this._musicStarted = true;
    }

    _seedParticles(count) {
        const CHARS = ['0','1','01','10','0x','FF','>>','{}','//','::','$_','&&','!=','<>','10','01'];
        const cW = Common.ScreenResolution.CANVAS_WIDTH  || Common.ScreenResolution.SCREEN_X;
        const cH = Common.ScreenResolution.CANVAS_HEIGHT || Common.ScreenResolution.SCREEN_Y;
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x:     Math.random() * cW,
                y:     Math.random() * cH,
                vy:    0.3 + Math.random() * 0.7,
                vx:    (Math.random() - 0.5) * 0.3,
                size:  7 + Math.random() * 8,
                alpha: 0.04 + Math.random() * 0.18,
                char:  CHARS[Math.floor(Math.random() * CHARS.length)],
                flipTimer: Math.floor(Math.random() * 90),
                cW, cH
            });
        }
    }

    _seedDeckNodes(count) {
        this.deckNodes = [];
        for (let i = 0; i < count; i++) {
            this.deckNodes.push({
                angle: Math.random() * Math.PI * 2,
                radius: 54 + Math.random() * 210,
                speed: 0.0018 + Math.random() * 0.005,
                phase: Math.random() * Math.PI * 2,
                size: 2 + Math.random() * 4,
                color: Math.random() > 0.68 ? '#FFE600' : (Math.random() > 0.28 ? '#00F0FF' : '#FF003C')
            });
        }
    }

    _menuLayout() {
        const SH = Common.ScreenResolution.SCREEN_Y;
        const btnW = 388;
        const btnH = 54;
        const gap = 13;
        return {
            btnX: 82,
            btnW,
            btnH,
            gap,
            startY: SH - 82 - this.menuItems.length * (btnH + gap)
        };
    }

    // â”€â”€ Input â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    onKeyPressed(key) {
        // First key press = confirmed user interaction → safe to start audio
        this._tryStartMusic();
        if (Data.Keyboards.checkActionMenu(key)) {
            this._confirmSelection();
        } else if (Data.Keyboards.checkCancelMenu(key)) {
            // no-op on main menu
        }
    }

    onKeyPressedAndRepeat(key) {
        const prev = this.selectedIndex;
        if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Up)) {
            this.selectedIndex = (this.selectedIndex - 1 + this.menuItems.length) % this.menuItems.length;
        } else if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Down)) {
            this.selectedIndex = (this.selectedIndex + 1) % this.menuItems.length;
        }
        if (this.selectedIndex !== prev) {
            this.hoverIndex = -1;   // keyboard took over — clear mouse hover
            Data.Systems.soundCursor.playSound();
            Manager.Stack.requestPaintHUD = true;
        }
        return true;
    }

    onMouseMove(x, y) {
        const newHover = this._getButtonAt(x, y);
        if (newHover !== this.hoverIndex) {
            this.hoverIndex = newHover;
            if (newHover >= 0 && newHover !== this.selectedIndex) {
                this.selectedIndex = newHover;  // mouse hover drives selection
                Data.Systems.soundCursor.playSound();
            }
            Manager.Stack.requestPaintHUD = true;
        }
    }

    onMouseUp(x, y) {
        const idx = this._getButtonAt(x, y);
        if (idx >= 0) {
            if (idx !== this.selectedIndex) {
                this.selectedIndex = idx;
                Data.Systems.soundCursor.playSound();
            }
            this._confirmSelection();
        }
    }

    _getButtonAt(x, y) {
        const layout = this._menuLayout();
        for (let i = 0; i < this.menuItems.length; i++) {
            const by = layout.startY + i * (layout.btnH + layout.gap);
            const sx = Common.ScreenResolution.getScreenX(layout.btnX);
            const sy = Common.ScreenResolution.getScreenY(by);
            const sw = Common.ScreenResolution.getScreenX(layout.btnW);
            const sh = Common.ScreenResolution.getScreenY(layout.btnH);
            if (x >= sx && x <= sx + sw && y >= sy && y <= sy + sh) return i;
        }
        return -1;
    }

    _confirmSelection() {
        const idx = this.selectedIndex;
        Data.Systems.soundConfirmation.playSound();

        if (idx === 0) {
            // New Game bridge into profile entry.
            if (IP2Live.LoadingScreen && typeof IP2Live.LoadingScreen.show === 'function') {
                IP2Live.LoadingScreen.show({
                    mode: 'push',
                    status: 'Loading New Game',
                    detail: 'Opening infiltrator profile channel',
                    onComplete: function () {
                        Manager.Stack.replace(new IP2LiveNameInputScreen());
                    },
                });
            } else {
                this.fadeTarget = idx;
            }
            Manager.Stack.requestPaintHUD = true;
        } else {
            this.glitchActive = true;
            this.glitchTimer = 8;
            Manager.Stack.requestPaintHUD = true;
            setTimeout(() => {
                switch (idx) {
                    case 1: Manager.Stack.push(new IP2LiveLoadGameMenu());    break;
                    case 2: Manager.Stack.push(new IP2LiveSettingsMenu());    break;
                    case 3: Manager.Stack.push(new IP2LiveCreditsScene());    break;
                    case 4: Common.Platform.quit();                           break;
                }
            }, 120);
        }
    }

    // â”€â”€ Update â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    update() {
        this.animTick++;
        this.scanlineOffset = (this.scanlineOffset + 0.4) % 4;
        if (this.glitchTimer > 0) {
            this.glitchTimer--;
            this.glitchActive = this.glitchTimer > 0;
        }

        // ── Typing scramble (slower) ──────────────────────────────
        let animatingProgress = false;
        for (let i = 0; i < this.menuItems.length; i++) {
            if (i === this.selectedIndex || i === this.hoverIndex) {
                if (this.btnProgress[i] < this.menuItems[i].length * 3 + 10) {
                    this.btnProgress[i] += 0.55;   // was 1.5 — slower reveal
                    animatingProgress = true;
                }
            } else {
                this.btnProgress[i] = 0;
            }
        }

        // ── Title decrypt on boot ─────────────────────────────────
        if (!this.titleDone) {
            this.titleProgress += 0.6;
            if (this.titleProgress >= this.titleTarget.length * 3 + 10) this.titleDone = true;
            animatingProgress = true;
        }

        // ── Floating particles ────────────────────────────────────
        const CHARS = ['0','1','01','10','0x','FF','>>','{}','//','::','$_','&&','!=','<>'];
        for (const p of this.particles) {
            p.y += p.vy;
            p.x += p.vx;
            p.flipTimer--;
            if (p.flipTimer <= 0) {
                p.char = CHARS[Math.floor(Math.random() * CHARS.length)];
                p.flipTimer = 40 + Math.floor(Math.random() * 80);
            }
            if (p.y > p.cH + 20)  { p.y = -20; p.x = Math.random() * p.cW; }
            if (p.x < -20)        { p.x = p.cW + 10; }
            if (p.x > p.cW + 20)  { p.x = -10; }
        }

        // ── Constant sine-wave background breathing ───────────────
        const t = this.animTick * 0.018;  // slow frequency
        this.shakeX = Math.sin(t * 1.3) * 1.8 + Math.cos(t * 2.1) * 0.9;
        this.shakeY = Math.cos(t * 0.9) * 1.4 + Math.sin(t * 2.7) * 0.6;
        // Small random micro-jolt layered on top
        if (Math.random() < 0.012) {
            this.shakeX += (Math.random() - 0.5) * 5;
            this.shakeY += (Math.random() - 0.5) * 5;
        }

        // ── Fade-out transition ───────────────────────────────────
        if (this.fadeTarget !== null) {
            this.fadeOut += 0.045;   // ~22 frames to full black (~0.37s)
            if (this.fadeOut >= 1) {
                Manager.Stack.push(new IP2LiveNameInputScreen());
                this.fadeTarget = null;
                this.fadeOut = 0; // Reset so it's not black when we pop back
            }
            animatingProgress = true;
        }

        // ── Fade-in transition (Returning from Name Input) ────────
        if (this.isFadingIn) {
            this.fadeOut -= 0.045;
            if (this.fadeOut <= 0) {
                this.fadeOut = 0;
                this.isFadingIn = false;
            }
            animatingProgress = true;
        }

        if (this.animTick % 2 === 0 || animatingProgress) Manager.Stack.requestPaintHUD = true;
    }

    // â”€â”€ Rendering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    draw3D() { Manager.GL.renderer.clear(); }

    drawHUD() {
        const ctx = Common.Platform.ctx;
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const cW = Common.ScreenResolution.CANVAS_WIDTH;
        const cH = Common.ScreenResolution.CANVAS_HEIGHT;
        const scaleX = cW / SW;
        const scaleY = cH / SH;

        ctx.save();
        // Light full-canvas shake to keep UI organized and readable.
        ctx.translate(this.shakeX * 0.25, this.shakeY * 0.25);

        if (this.networkBackdrop && typeof this.networkBackdrop.draw === 'function') {
            this.networkBackdrop.draw(ctx, cW, cH, this.animTick, 0, 0);
        } else {
            ctx.fillStyle = '#0a0a1a';
            ctx.fillRect(0, 0, cW, cH);
        }

        // ── Floating binary / hacker particles ─────────────────────
        ctx.save();
        for (const p of this.particles) {
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = '#00FFFF';
            ctx.font = Math.round(p.size * scaleX) + 'px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(p.char, p.x, p.y);
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        const panelW = cW * 0.55;
        const grad = ctx.createLinearGradient(0, 0, panelW, 0);
        grad.addColorStop(0, 'rgba(0,0,8,0.92)');
        grad.addColorStop(0.75, 'rgba(0,0,8,0.75)');
        grad.addColorStop(1, 'rgba(0,0,8,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, panelW, cH);

        ctx.globalAlpha = 0.04;
        ctx.fillStyle = '#000';
        for (let y = this.scanlineOffset * scaleY; y < cH; y += 4 * scaleY) {
            ctx.fillRect(0, y, panelW, 1.5 * scaleY);
        }
        ctx.globalAlpha = 1;

        const lineX = 4 * scaleX;
        ctx.strokeStyle = '#00FFFF';
        ctx.lineWidth = 2 * scaleX;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(lineX, cH * 0.08);
        ctx.lineTo(lineX, cH * 0.92);
        ctx.stroke();

        this._drawTitle(ctx, scaleX, scaleY, cW, cH);

        ctx.font = (10 * scaleX) + 'px ' + (IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace');
        ctx.fillStyle = '#00FFFF';
        ctx.globalAlpha = 0.7;
        ctx.textAlign = 'left';
        ctx.fillText('// INFILTRATION PROTOCOL v1.0', 25 * scaleX, 195 * scaleY);
        ctx.globalAlpha = 1;

        const layout = this._menuLayout();

        for (let i = 0; i < this.menuItems.length; i++) {
            const by = layout.startY + i * (layout.btnH + layout.gap);
            this._drawButton(ctx, scaleX, scaleY, layout.btnX, by, layout.btnW, layout.btnH,
                this.menuItems[i], i === this.selectedIndex, i === this.hoverIndex, i);
        }

        this._drawCornerDeco(ctx, scaleX, scaleY, cH);

        // Black fade-out overlay for New Game transition
        if (this.fadeOut > 0) {
            ctx.globalAlpha = Math.min(this.fadeOut, 1);
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, cW, cH);
            ctx.globalAlpha = 1;
        }

        ctx.restore();

        // Draw rare full-screen glitch slices above all menu UI.
        this._drawGlobalGlitch(ctx, cW, cH, scaleX, scaleY);
    }

    _drawTitle(ctx, scaleX, scaleY, cW, cH) {
        const fontName = IP2Live.Assets.abnesLoaded ? 'Abnes' : 'Arial Black';
        const target   = this.titleTarget;
        const displayTitle = this.titleDone
            ? target
            : this._getScrambledText(target, this.titleProgress);
        ctx.textAlign = 'left';
        ctx.font = 'bold ' + (72 * scaleX) + 'px ' + fontName;
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowBlur = 0;
        ctx.fillText(displayTitle, 25 * scaleX, 148 * scaleY);
        ctx.globalAlpha = 1;
    }

    _drawButton(ctx, scaleX, scaleY, bx, by, bw, bh, label, isSelected, isHover, index) {
        const isActive = isSelected || isHover;
        const scrambleText = isActive ? this._getScrambledText(label, this.btnProgress[index]) : undefined;
        this._drawPersonaButton(ctx, scaleX, scaleY, bx, by, bw, bh, label, isActive, label === 'QUIT GAME', scrambleText, index);
    }

    _drawPersonaButton(ctx, scaleX, scaleY, bx, by, bw, bh, label, isActive, isDanger, displayLabel, index) {
        const x = bx * scaleX;
        const y = by * scaleY;
        const w = bw * scaleX;
        const h = bh * scaleY;
        const slant = 18 * scaleX;
        const tab = 38 * scaleX;
        const fontName = IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace';
        const red = isDanger ? '#FF335F' : '#FF003C';
        const cyan = '#00F0FF';
        const yellow = '#FFE600';
        const active = isDanger ? red : yellow;
        const labelText = displayLabel || label;
        const pulse = 0.55 + 0.45 * Math.sin(this.animTick * 0.12);

        ctx.save();
        ctx.translate(isActive ? 12 * scaleX : 0, 0);

        ctx.beginPath();
        ctx.moveTo(x + slant, y);
        ctx.lineTo(x + w - slant * 0.4, y);
        ctx.lineTo(x + w, y + h * 0.22);
        ctx.lineTo(x + w - slant, y + h);
        ctx.lineTo(x + slant * 0.7, y + h);
        ctx.lineTo(x, y + h * 0.74);
        ctx.closePath();

        const grad = ctx.createLinearGradient(x, y, x + w, y);
        if (isActive) {
            grad.addColorStop(0, isDanger ? 'rgba(255,0,60,0.64)' : 'rgba(255,230,0,0.70)');
            grad.addColorStop(0.42, isDanger ? 'rgba(110,0,28,0.72)' : 'rgba(70,64,0,0.72)');
            grad.addColorStop(1, 'rgba(3,7,20,0.78)');
            ctx.shadowColor = active;
            ctx.shadowBlur = 18 * scaleX;
        } else {
            grad.addColorStop(0, 'rgba(3,7,20,0.88)');
            grad.addColorStop(1, 'rgba(3,7,20,0.36)');
            ctx.shadowBlur = 0;
        }
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.lineWidth = (isActive ? 2.4 : 1.1) * scaleX;
        ctx.strokeStyle = isActive ? active : (isDanger ? 'rgba(255,0,60,0.54)' : 'rgba(0,240,255,0.54)');
        ctx.stroke();

        ctx.save();
        ctx.clip();
        for (let sy = y + ((this.animTick * 0.8) % (6 * scaleY)); sy < y + h; sy += 6 * scaleY) {
            ctx.fillStyle = isActive ? 'rgba(255,255,255,0.06)' : 'rgba(0,240,255,0.025)';
            ctx.fillRect(x, sy, w, 1 * scaleY);
        }
        if (isActive) {
            const scanX = x - w + ((this.animTick * 5) % (w * 1.8));
            ctx.fillStyle = 'rgba(255,255,255,0.22)';
            ctx.transform(1, 0, -0.32, 1, 0, 0);
            ctx.fillRect(scanX, y - h, 34 * scaleX, h * 3);
        }
        ctx.restore();

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + tab, y);
        ctx.lineTo(x + tab - 12 * scaleX, y + 19 * scaleY);
        ctx.lineTo(x, y + 24 * scaleY);
        ctx.closePath();
        ctx.fillStyle = isActive ? red : 'rgba(0,240,255,0.82)';
        ctx.fill();

        if (isActive) {
            ctx.beginPath();
            ctx.moveTo(x + w - 68 * scaleX, y);
            ctx.lineTo(x + w - 12 * scaleX, y);
            ctx.lineTo(x + w - 34 * scaleX, y + h);
            ctx.lineTo(x + w - 88 * scaleX, y + h);
            ctx.closePath();
            ctx.fillStyle = isDanger ? 'rgba(255,0,60,0.32)' : 'rgba(255,230,0,0.35)';
            ctx.fill();
        }

        ctx.font = Math.round(8 * scaleX) + 'px monospace';
        ctx.fillStyle = isActive ? '#080808' : '#00141A';
        ctx.textAlign = 'left';
        ctx.fillText('0' + (index + 1), x + 10 * scaleX, y + 15 * scaleY);

        ctx.font = 'bold ' + Math.round((isActive ? 21 : 19) * scaleX) + 'px ' + fontName;
        ctx.fillStyle = isActive ? (isDanger ? '#FFFFFF' : '#111111') : '#FFFFFF';
        ctx.shadowColor = isActive ? 'rgba(255,255,255,' + (0.35 + pulse * 0.25) + ')' : 'transparent';
        ctx.shadowBlur = isActive ? 3 * scaleX : 0;
        ctx.textAlign = 'left';
        ctx.fillText(labelText, x + 34 * scaleX, y + h * 0.64);

        if (isActive) {
            ctx.shadowBlur = 0;
            ctx.font = 'bold ' + Math.round(13 * scaleX) + 'px monospace';
            ctx.fillStyle = isDanger ? '#FFFFFF' : '#111111';
            ctx.textAlign = 'right';
            ctx.fillText('>>', x + w - 42 * scaleX, y + h * 0.64);
        }

        ctx.restore();
    }

    _drawRightHackDeck(ctx, scaleX, scaleY, cW, cH) {
        const tick = this.animTick || 0;
        // Keep icon centered in the middle of the right half.
        const cx = cW * 0.75;
        const cy = cH * 0.50;
        const unit = Math.min(cW, cH) / 1080;

        ctx.save();
        ctx.globalAlpha = 0.97;

        const halo = ctx.createRadialGradient(cx, cy, 10 * unit, cx, cy, 360 * unit);
        halo.addColorStop(0, 'rgba(0,240,255,0.20)');
        halo.addColorStop(0.5, 'rgba(255,0,60,0.16)');
        halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(cx - 400 * unit, cy - 310 * unit, 800 * unit, 620 * unit);

        this._drawAerialOrbits(ctx, cx, cy, unit, tick);
        this._drawShardField(ctx, cx, cy, unit, tick);
        this._drawNeuralTerminal(ctx, cx, cy, unit, tick);
        this._drawHUDTabs(ctx, cx, cy, unit, tick);

        ctx.restore();
    }

    _drawAerialOrbits(ctx, cx, cy, unit, tick) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.14);

        // A single skewed HUD slab (new layout, no floating side widgets).
        const slab = [
            [-278, -190], [236, -176], [314, -34], [224, 186], [-292, 168], [-346, -30]
        ];
        ctx.beginPath();
        for (let i = 0; i < slab.length; i++) {
            const p = slab[i];
            const px = p[0] * unit;
            const py = p[1] * unit;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        const slabGrad = ctx.createLinearGradient(-320 * unit, -200 * unit, 300 * unit, 180 * unit);
        slabGrad.addColorStop(0, 'rgba(255,0,60,0.16)');
        slabGrad.addColorStop(0.3, 'rgba(3,7,20,0.86)');
        slabGrad.addColorStop(0.78, 'rgba(2,6,18,0.92)');
        slabGrad.addColorStop(1, 'rgba(0,240,255,0.18)');
        ctx.fillStyle = slabGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,240,255,0.52)';
        ctx.lineWidth = 2.1 * unit;
        ctx.stroke();

        // Horizontal data lanes clipped to slab.
        ctx.save();
        ctx.clip();
        ctx.lineWidth = 1.1 * unit;
        for (let y = -188 * unit; y <= 178 * unit; y += 12 * unit) {
            const laneGlow = 0.13 + 0.10 * Math.sin(tick * 0.03 + y * 0.02);
            ctx.strokeStyle = 'rgba(0,240,255,' + laneGlow.toFixed(3) + ')';
            ctx.beginPath();
            ctx.moveTo(-354 * unit, y);
            ctx.lineTo(338 * unit, y);
            ctx.stroke();
        }
        for (let i = -8; i <= 8; i++) {
            const x = i * 40 * unit + ((tick * 0.8) % (40 * unit));
            ctx.strokeStyle = i % 2 ? 'rgba(255,230,0,0.13)' : 'rgba(255,0,60,0.10)';
            ctx.beginPath();
            ctx.moveTo(x - 140 * unit, -220 * unit);
            ctx.lineTo(x + 140 * unit, 220 * unit);
            ctx.stroke();
        }
        ctx.restore();

        // CIDR / subnet labels pinned to slab edges.
        ctx.font = 'bold ' + Math.round(11 * unit) + 'px monospace';
        ctx.fillStyle = 'rgba(0,240,255,0.72)';
        ctx.fillText('ROUTE TABLE /24', -256 * unit, -158 * unit);
        ctx.fillText('VLAN SEGMENT /27', -240 * unit, 150 * unit);
        ctx.fillStyle = 'rgba(255,230,0,0.62)';
        ctx.fillText('IP://10.72.14.' + ((Math.floor(tick / 9) % 140) + 24), 98 * unit, 146 * unit);

        ctx.restore();
    }

    _drawShardField(ctx, cx, cy, unit, tick) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.14);

        // Network node graph inside slab.
        const nodes = [
            [-210, -84], [-132, -124], [-44, -98], [52, -120], [144, -88],
            [-188, -18], [-94, -36], [4, -24], [102, -42], [196, -16],
            [-156, 48], [-62, 36], [34, 56], [132, 42], [226, 64]
        ];
        ctx.lineWidth = 1.6 * unit;
        for (let i = 0; i < nodes.length; i++) {
            const a = nodes[i];
            const b = nodes[(i + 1) % nodes.length];
            if (i % 2 === 0 || i % 5 === 0) {
                ctx.strokeStyle = i % 4 === 0 ? 'rgba(255,0,60,0.30)' : 'rgba(0,240,255,0.32)';
                ctx.beginPath();
                ctx.moveTo(a[0] * unit, a[1] * unit);
                ctx.lineTo(b[0] * unit, b[1] * unit);
                ctx.stroke();
            }
        }
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            const pulse = 0.5 + 0.5 * Math.sin(tick * 0.09 + i * 0.8);
            const r = (2.2 + (i % 3) * 0.9) * unit;
            ctx.fillStyle = i % 5 === 0 ? 'rgba(255,230,0,' + (0.6 + pulse * 0.3).toFixed(3) + ')' :
                (i % 2 === 0 ? 'rgba(0,240,255,' + (0.45 + pulse * 0.4).toFixed(3) + ')' : 'rgba(255,0,60,' + (0.40 + pulse * 0.4).toFixed(3) + ')');
            ctx.beginPath();
            ctx.arc(n[0] * unit, n[1] * unit, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Traversing packets.
        for (let i = 0; i < 5; i++) {
            const p = (tick * 0.014 + i * 0.19) % 1;
            const sx = -236 + p * 472;
            const sy = -106 + Math.sin((p * Math.PI * 2) + i) * 16;
            ctx.fillStyle = i % 2 ? 'rgba(255,0,60,0.85)' : 'rgba(0,240,255,0.88)';
            ctx.fillRect((sx - 7) * unit, (sy - 2) * unit, 14 * unit, 4 * unit);
        }
        ctx.restore();
    }

    _drawNeuralTerminal(ctx, cx, cy, unit, tick) {
        const lean = -0.10 + Math.sin(tick * 0.014) * 0.012;
        const bob = Math.sin(tick * 0.018) * 2 * unit;
        const red = '#FF003C';
        const cyan = '#00F0FF';
        const yellow = '#FFE600';
        const pulse = 0.55 + 0.45 * Math.sin(tick * 0.09);
        ctx.save();
        ctx.translate(cx, cy + bob);
        ctx.rotate(lean);

        // New central concept: aggressive chevron + shield core.
        ctx.save();
        const wingL = [
            [-188, -26], [-88, -72], [6, -54], [-86, 2], [-176, 20]
        ];
        const wingR = [
            [188, 26], [90, 70], [-6, 54], [88, -2], [178, -22]
        ];
        const drawWing = (pts, colA, colB) => {
            ctx.beginPath();
            for (let i = 0; i < pts.length; i++) {
                const p = pts[i];
                const x = p[0] * unit;
                const y = p[1] * unit;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.closePath();
            const g = ctx.createLinearGradient(-180 * unit, -80 * unit, 180 * unit, 80 * unit);
            g.addColorStop(0, colA);
            g.addColorStop(1, colB);
            ctx.fillStyle = g;
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.22)';
            ctx.lineWidth = 1.2 * unit;
            ctx.stroke();
        };
        drawWing(wingL, 'rgba(255,0,60,0.72)', 'rgba(64,0,30,0.35)');
        drawWing(wingR, 'rgba(0,240,255,0.30)', 'rgba(0,240,255,0.72)');
        ctx.restore();

        // Shield core.
        ctx.shadowColor = cyan;
        ctx.shadowBlur = 22 * unit;
        ctx.save();
        ctx.rotate(tick * 0.004);
        const shield = [
            [0, -80], [66, -40], [50, 54], [0, 92], [-50, 54], [-66, -40]
        ];
        ctx.beginPath();
        for (let i = 0; i < shield.length; i++) {
            const p = shield[i];
            if (i === 0) ctx.moveTo(p[0] * unit, p[1] * unit);
            else ctx.lineTo(p[0] * unit, p[1] * unit);
        }
        ctx.closePath();
        const coreGrad = ctx.createLinearGradient(-70 * unit, -84 * unit, 70 * unit, 96 * unit);
        coreGrad.addColorStop(0, 'rgba(255,0,60,0.52)');
        coreGrad.addColorStop(0.45, 'rgba(4,10,28,0.95)');
        coreGrad.addColorStop(1, 'rgba(0,240,255,0.50)');
        ctx.fillStyle = coreGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,240,255,0.94)';
        ctx.lineWidth = 2.8 * unit;
        ctx.stroke();
        ctx.restore();
        ctx.shadowBlur = 0;

        // Infiltrator glyph inside core.
        ctx.save();
        ctx.rotate(-0.56 + Math.sin(tick * 0.01) * 0.04);
        ctx.lineWidth = 4.2 * unit;
        ctx.strokeStyle = 'rgba(255,230,0,0.92)';
        ctx.beginPath();
        ctx.moveTo(-26 * unit, -18 * unit);
        ctx.lineTo(8 * unit, -18 * unit);
        ctx.lineTo(28 * unit, -38 * unit);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,240,255,0.96)';
        ctx.beginPath();
        ctx.moveTo(-24 * unit, 10 * unit);
        ctx.lineTo(12 * unit, 10 * unit);
        ctx.lineTo(38 * unit, 34 * unit);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,0,60,0.95)';
        ctx.beginPath();
        ctx.arc(-34 * unit, -18 * unit, 4.0 * unit, 0, Math.PI * 2);
        ctx.arc(-30 * unit, 10 * unit, 3.8 * unit, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Support struts.
        for (let i = 0; i < 3; i++) {
            const a = -0.8 + i * 0.8 + Math.sin(tick * 0.006 + i) * 0.02;
            const sx = Math.cos(a) * 166 * unit;
            const sy = Math.sin(a) * 70 * unit;
            this._drawMenuCoreBlade(
                ctx, sx, sy,
                (i === 1 ? 46 : 34) * unit,
                (i === 1 ? 14 : 28) * unit,
                i === 0 ? red : (i === 1 ? yellow : cyan),
                tick + i * 9
            );
        }

        // Subnet/IP telemetry labels.
        ctx.textAlign = 'center';
        ctx.font = 'bold ' + Math.round(14 * unit) + 'px monospace';
        ctx.fillStyle = '#FFFFFF';
        const subnetPct = ((Math.floor(tick * 0.72) % 41) + 58);
        ctx.fillText(subnetPct + '%', 0, 2 * unit);

        ctx.font = Math.round(10 * unit) + 'px monospace';
        ctx.fillStyle = 'rgba(0,240,255,0.7)';
        ctx.fillText('INTRUSION VECTOR', 0, 112 * unit);
        ctx.fillStyle = 'rgba(255,230,0,0.70)';
        const subnetTail = 20 + (Math.floor(tick / 8) % 176);
        ctx.fillText('172.19.' + ((Math.floor(tick / 11) % 48) + 4) + '.' + subnetTail + '/27', 0, 127 * unit);

        ctx.restore();
    }

    _drawHUDTabs(ctx, cx, cy, unit, tick) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-0.14);

        // Top command ribbon integrated into same slab.
        const ribbon = [
            [-302, -202], [-42, -196], [-10, -164], [-272, -170]
        ];
        ctx.beginPath();
        for (let i = 0; i < ribbon.length; i++) {
            const p = ribbon[i];
            if (i === 0) ctx.moveTo(p[0] * unit, p[1] * unit);
            else ctx.lineTo(p[0] * unit, p[1] * unit);
        }
        ctx.closePath();
        const rGrad = ctx.createLinearGradient(-302 * unit, -202 * unit, -10 * unit, -164 * unit);
        rGrad.addColorStop(0, 'rgba(255,0,60,0.74)');
        rGrad.addColorStop(1, 'rgba(70,0,34,0.36)');
        ctx.fillStyle = rGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,0,60,0.52)';
        ctx.lineWidth = 1.4 * unit;
        ctx.stroke();

        ctx.font = 'bold ' + Math.round(11 * unit) + 'px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.textAlign = 'left';
        ctx.fillText('// GHOST_TUNNEL :: ACTIVE', -286 * unit, -178 * unit);

        // Bottom command ribbon.
        const ribbon2 = [
            [26, 170], [304, 178], [274, 206], [2, 196]
        ];
        ctx.beginPath();
        for (let i = 0; i < ribbon2.length; i++) {
            const p = ribbon2[i];
            if (i === 0) ctx.moveTo(p[0] * unit, p[1] * unit);
            else ctx.lineTo(p[0] * unit, p[1] * unit);
        }
        ctx.closePath();
        const yGrad = ctx.createLinearGradient(2 * unit, 170 * unit, 304 * unit, 206 * unit);
        yGrad.addColorStop(0, 'rgba(255,230,0,0.74)');
        yGrad.addColorStop(1, 'rgba(80,74,0,0.35)');
        ctx.fillStyle = yGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,230,0,0.56)';
        ctx.lineWidth = 1.4 * unit;
        ctx.stroke();

        ctx.fillStyle = 'rgba(16,16,16,0.85)';
        ctx.textAlign = 'right';
        ctx.fillText('TARGET: APEX_GATEWAY', 286 * unit, 194 * unit);

        // Right-side compact stats block (not floating panel; attached coordinates to slab zone).
        ctx.fillStyle = 'rgba(0,240,255,0.78)';
        ctx.textAlign = 'left';
        ctx.font = 'bold ' + Math.round(10 * unit) + 'px monospace';
        ctx.fillText('PING  09ms', 168 * unit, -132 * unit);
        ctx.fillText('LOSS  00.2%', 168 * unit, -116 * unit);
        ctx.fillText('AUTH  SSH-T', 168 * unit, -100 * unit);

        // Progress notches.
        const notchX = 158 * unit;
        const notchY = -82 * unit;
        for (let i = 0; i < 6; i++) {
            ctx.fillStyle = i <= ((Math.floor(tick / 8) % 6)) ? 'rgba(255,0,60,0.90)' : 'rgba(0,240,255,0.24)';
            ctx.fillRect(notchX + i * 14 * unit, notchY, 10 * unit, 3 * unit);
        }
        ctx.restore();
    }

    _drawMenuCoreBlade(ctx, x, y, w, h, color, tick) {
        ctx.save();
        ctx.translate(x, y);
        const light = color === '#FFE600' ? 'rgba(255,244,120,0.96)' : (color === '#FF003C' ? 'rgba(255,82,128,0.95)' : 'rgba(120,250,255,0.95)');
        const dark = color === '#FFE600' ? 'rgba(140,120,0,0.95)' : (color === '#FF003C' ? 'rgba(120,0,42,0.95)' : 'rgba(0,88,120,0.95)');
        const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
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

        ctx.strokeStyle = 'rgba(255,255,255,0.42)';
        ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.08);
        ctx.stroke();

        ctx.globalAlpha = 0.22 + 0.18 * Math.sin(tick * 0.1);
        ctx.fillStyle = '#FFFFFF';
        if (w > h) ctx.fillRect(-w * 0.18, -h * 0.22, w * 0.34, h * 0.18);
        else ctx.fillRect(-w * 0.20, -h * 0.18, w * 0.26, h * 0.34);
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    _drawGlobalGlitch(ctx, cW, cH, scaleX, scaleY) {
        if (Math.random() > 0.035) return;
        const slices = 1 + Math.floor(Math.random() * 2);
        ctx.save();
        for (let i = 0; i < slices; i++) {
            const h = (4 + Math.random() * 10) * scaleY;
            const y = Math.random() * (cH - h);
            const dx = (Math.random() - 0.5) * 10 * scaleX;
            ctx.drawImage(ctx.canvas, 0, y, cW, h, dx, y, cW, h);

            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = i % 2 ? 'rgba(0,240,255,0.05)' : 'rgba(255,0,60,0.05)';
            ctx.fillRect(0, y, cW, h);
            ctx.globalCompositeOperation = 'source-over';
        }
        ctx.restore();
    }

    _poly(ctx, x, y, radius, sides, fill, stroke, lineWidth) {
        if (!ctx || sides < 3 || radius <= 0) return;
        ctx.beginPath();
        for (let i = 0; i < sides; i++) {
            const a = -Math.PI / 2 + i * (Math.PI * 2 / sides);
            const px = x + Math.cos(a) * radius;
            const py = y + Math.sin(a) * radius;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        if (fill) {
            ctx.fillStyle = fill;
            ctx.fill();
        }
        if (stroke && lineWidth > 0) {
            ctx.strokeStyle = stroke;
            ctx.lineWidth = lineWidth;
            ctx.stroke();
        }
    }


    _drawCornerDeco(ctx, scaleX, scaleY, cH) {
        ctx.strokeStyle = 'rgba(0,255,255,0.3)';
        ctx.lineWidth = 1 * scaleX;
        ctx.shadowBlur = 0;
        const bx = 25 * scaleX, by = cH - 40 * scaleY;
        ctx.beginPath();
        ctx.moveTo(bx, by); ctx.lineTo(bx + 60 * scaleX, by);
        ctx.moveTo(bx, by); ctx.lineTo(bx, by + 20 * scaleY);
        ctx.stroke();
        ctx.font = (8 * scaleX) + 'px monospace';
        ctx.fillStyle = 'rgba(0,255,255,0.4)';
        ctx.textAlign = 'left';
        ctx.fillText('SYS::CONNECTED', 25 * scaleX, cH - 20 * scaleY);
    }

    _getScrambledText(target, progress) {
        if (progress >= target.length * 3 + 10) return target;
        let result = '';
        for (let i = 0; i < target.length; i++) {
            if (target[i] === ' ') {
                result += ' ';
                continue;
            }
            const charStart = i * 2;
            if (progress < charStart) {
                // Not started revealing yet - random flicker
                result += String.fromCharCode(65 + Math.floor(Math.random() * 26)); 
            } else {
                const charProgress = progress - charStart;
                if (charProgress > 6) {
                    result += target[i];
                } else {
                    // Start from 'A' and step towards target[i]
                    const targetCode = target.toUpperCase().charCodeAt(i);
                    const isLetter = targetCode >= 65 && targetCode <= 90;
                    if (isLetter) {
                        const step = Math.floor((targetCode - 65) * (charProgress / 6));
                        result += String.fromCharCode(65 + step);
                    } else {
                        result += target[i];
                    }
                }
            }
        }
        return result;
    }
}
window.IP2LiveMainMenu = IP2LiveMainMenu;

// Override the engine's title screen entry point so our menu loads on boot
Manager.Stack.pushTitleScreen = function () {
    const scene = new IP2LiveMainMenu();
    Manager.Stack.push(scene);
    return scene;
};

console.log('[IP2Live] main-menu.js loaded.');

