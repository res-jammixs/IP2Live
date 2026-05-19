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

        if (IP2Live.Assets.bgImage) {
            // Shake offset applied to background only
            ctx.save();
            ctx.translate(this.shakeX, this.shakeY);
            IP2Live.Assets.drawCoverImage(ctx, IP2Live.Assets.bgImage, 0, 0, cW, cH);

            // Horizontal slice glitch
            if (Math.random() < 0.06) {
                const sliceY = Math.random() * cH;
                const sliceH = Math.random() * 60 + 10;
                const offsetX = (Math.random() - 0.5) * 50;
                ctx.drawImage(ctx.canvas, 0, sliceY, cW, sliceH, offsetX, sliceY, cW, sliceH);
                // Chromatic color separation
                ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,255,255,0.15)' : 'rgba(255,0,255,0.15)';
                ctx.globalCompositeOperation = 'screen';
                ctx.fillRect(0, sliceY, cW, sliceH);
                ctx.globalCompositeOperation = 'source-over';
            }
            ctx.restore();
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

        this._drawRightHackDeck(ctx, scaleX, scaleY, cW, cH);

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
        const cx = cW * 0.735;
        const cy = cH * 0.425;
        const unit = Math.min(cW, cH) / 1080;
        const red = '#FF003C';
        const cyan = '#00F0FF';
        const yellow = '#FFE600';

        ctx.save();
        ctx.globalAlpha = 0.96;

        const halo = ctx.createRadialGradient(cx, cy, 20 * unit, cx, cy, 360 * unit);
        halo.addColorStop(0, 'rgba(0,240,255,0.20)');
        halo.addColorStop(0.42, 'rgba(255,0,60,0.10)');
        halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(cx - 390 * unit, cy - 310 * unit, 780 * unit, 620 * unit);

        this._drawSignalRings(ctx, cx, cy, unit, tick, cyan, red, yellow);
        this._drawDataConstellation(ctx, cx, cy, unit, tick);
        this._drawCyberDeckDevice(ctx, cx, cy, unit, tick);
        this._drawDeckPanels(ctx, cx, cy, unit, tick);

        ctx.restore();
    }

    _drawSignalRings(ctx, cx, cy, unit, tick, cyan, red, yellow) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.sin(tick * 0.012) * 0.06);
        for (let i = 0; i < 4; i++) {
            const r = (94 + i * 46 + Math.sin(tick * 0.018 + i) * 4) * unit;
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 1.55, r * 0.56, -0.2, Math.PI * 0.12, Math.PI * (1.55 + i * 0.08));
            ctx.strokeStyle = i % 2 === 0 ? 'rgba(0,240,255,0.32)' : 'rgba(255,0,60,0.26)';
            ctx.lineWidth = (1.2 + i * 0.28) * unit;
            ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,230,0,0.84)';
        ctx.fillRect(-185 * unit, -3 * unit, 36 * unit, 5 * unit);
        ctx.fillStyle = 'rgba(255,0,60,0.88)';
        ctx.fillRect(142 * unit, 54 * unit, 56 * unit, 5 * unit);
        ctx.fillStyle = 'rgba(0,240,255,0.80)';
        ctx.fillRect(96 * unit, -102 * unit, 44 * unit, 4 * unit);
        ctx.restore();
    }

    _drawDataConstellation(ctx, cx, cy, unit, tick) {
        ctx.save();
        ctx.lineWidth = 1 * unit;
        for (let i = 0; i < this.deckNodes.length; i++) {
            const n = this.deckNodes[i];
            const a = n.angle + tick * n.speed;
            const x = cx + Math.cos(a) * n.radius * unit * 1.38;
            const y = cy + Math.sin(a + n.phase * 0.12) * n.radius * unit * 0.52;
            const pulse = 0.55 + 0.45 * Math.sin(tick * 0.06 + n.phase);
            ctx.globalAlpha = 0.28 + pulse * 0.55;
            ctx.fillStyle = n.color;
            ctx.beginPath();
            ctx.arc(x, y, n.size * unit, 0, Math.PI * 2);
            ctx.fill();
            if (i % 4 === 0) {
                ctx.strokeStyle = n.color.replace(')', ',0.22)');
                ctx.globalAlpha = 0.16;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(x, y);
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    }

    _drawCyberDeckDevice(ctx, cx, cy, unit, tick) {
        const lean = Math.sin(tick * 0.018) * 0.075;
        const bob = Math.sin(tick * 0.025) * 7 * unit;
        ctx.save();
        ctx.translate(cx, cy + bob);
        ctx.rotate(lean);

        ctx.shadowColor = '#00F0FF';
        ctx.shadowBlur = 22 * unit;
        ctx.beginPath();
        ctx.moveTo(-170 * unit, -92 * unit);
        ctx.lineTo(122 * unit, -122 * unit);
        ctx.lineTo(174 * unit, 42 * unit);
        ctx.lineTo(-116 * unit, 72 * unit);
        ctx.closePath();
        ctx.fillStyle = 'rgba(4,10,22,0.90)';
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(0,240,255,0.78)';
        ctx.lineWidth = 2 * unit;
        ctx.stroke();

        const screenGrad = ctx.createLinearGradient(-130 * unit, -80 * unit, 145 * unit, 48 * unit);
        screenGrad.addColorStop(0, 'rgba(0,240,255,0.12)');
        screenGrad.addColorStop(0.56, 'rgba(6,15,32,0.94)');
        screenGrad.addColorStop(1, 'rgba(255,0,60,0.14)');
        ctx.beginPath();
        ctx.moveTo(-126 * unit, -70 * unit);
        ctx.lineTo(93 * unit, -92 * unit);
        ctx.lineTo(132 * unit, 26 * unit);
        ctx.lineTo(-86 * unit, 48 * unit);
        ctx.closePath();
        ctx.fillStyle = screenGrad;
        ctx.fill();

        for (let i = 0; i < 12; i++) {
            const yy = (-57 + i * 9) * unit;
            const xx = (-105 + ((tick * 1.2 + i * 19) % 150)) * unit;
            ctx.fillStyle = i % 3 === 0 ? 'rgba(255,230,0,0.74)' : (i % 2 === 0 ? 'rgba(255,0,60,0.62)' : 'rgba(0,240,255,0.68)');
            ctx.fillRect(xx, yy, (28 + (i % 4) * 13) * unit, 3 * unit);
        }

        ctx.beginPath();
        ctx.moveTo(-196 * unit, 82 * unit);
        ctx.lineTo(168 * unit, 44 * unit);
        ctx.lineTo(248 * unit, 116 * unit);
        ctx.lineTo(-124 * unit, 158 * unit);
        ctx.closePath();
        ctx.fillStyle = 'rgba(5,8,18,0.94)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,230,0,0.82)';
        ctx.lineWidth = 2 * unit;
        ctx.stroke();

        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 10; col++) {
                const x = (-138 + col * 27 + row * 7) * unit;
                const y = (94 + row * 12) * unit;
                ctx.fillStyle = (row + col + Math.floor(tick / 12)) % 5 === 0 ? 'rgba(255,0,60,0.86)' : 'rgba(0,240,255,0.23)';
                ctx.fillRect(x, y, 18 * unit, 5 * unit);
            }
        }

        ctx.fillStyle = '#FF003C';
        ctx.beginPath();
        ctx.moveTo(-222 * unit, 75 * unit);
        ctx.lineTo(-162 * unit, 65 * unit);
        ctx.lineTo(-190 * unit, 112 * unit);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#FFE600';
        ctx.beginPath();
        ctx.moveTo(174 * unit, 42 * unit);
        ctx.lineTo(226 * unit, 52 * unit);
        ctx.lineTo(194 * unit, 84 * unit);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    _drawDeckPanels(ctx, cx, cy, unit, tick) {
        const font = IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace';
        ctx.save();
        const panels = [
            { x: cx - 330 * unit, y: cy - 160 * unit, w: 174 * unit, h: 54 * unit, title: 'ROOT', color: '#00F0FF' },
            { x: cx + 208 * unit, y: cy - 122 * unit, w: 190 * unit, h: 58 * unit, title: 'TRACE', color: '#FF003C' },
            { x: cx + 132 * unit, y: cy + 166 * unit, w: 218 * unit, h: 56 * unit, title: 'ACCESS', color: '#FFE600' }
        ];

        for (let i = 0; i < panels.length; i++) {
            const p = panels[i];
            const sl = 12 * unit;
            ctx.beginPath();
            ctx.moveTo(p.x + sl, p.y);
            ctx.lineTo(p.x + p.w, p.y);
            ctx.lineTo(p.x + p.w - sl, p.y + p.h);
            ctx.lineTo(p.x, p.y + p.h);
            ctx.closePath();
            ctx.fillStyle = 'rgba(3,7,20,0.72)';
            ctx.fill();
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 1.4 * unit;
            ctx.stroke();

            ctx.font = 'bold ' + Math.round(12 * unit) + 'px ' + font;
            ctx.fillStyle = p.color;
            ctx.textAlign = 'left';
            ctx.fillText(p.title, p.x + 16 * unit, p.y + 20 * unit);

            const bars = 4;
            for (let b = 0; b < bars; b++) {
                const bw = (42 + ((tick + b * 17 + i * 23) % 74)) * unit;
                ctx.fillStyle = b % 2 ? 'rgba(0,240,255,0.38)' : 'rgba(255,255,255,0.18)';
                ctx.fillRect(p.x + 16 * unit, p.y + (29 + b * 5) * unit, bw, 2 * unit);
            }
        }

        ctx.restore();
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

