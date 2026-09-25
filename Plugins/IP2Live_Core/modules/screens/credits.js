/**
 * IP2Live — Credits Screen
 * @file Plugins/IP2Live_Core/modules/screens/credits.js
 *
 * Loaded via fetch + new Function() by code.js. Engine globals such as
 * Common, Core, Data, Manager, Scene and IP2Live are injected by the loader.
 */

const IP2LiveCreditsVisuals = {
    roundRect(ctx, x, y, w, h, r) {
        const radius = Math.min(r, w / 2, h / 2);

        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        ctx.lineTo(x + radius, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    },

    easeOutCubic(t) {
        const n = Math.max(0, Math.min(1, t));
        return 1 - Math.pow(1 - n, 3);
    },

    wrapText(ctx, text, maxWidth) {
        const words = String(text || '').split(/\s+/);
        const lines = [];
        let line = '';

        for (let i = 0; i < words.length; i++) {
            const test = line ? line + ' ' + words[i] : words[i];
            if (!line || ctx.measureText(test).width <= maxWidth) {
                line = test;
            } else {
                lines.push(line);
                line = words[i];
            }
        }

        if (line) lines.push(line);
        return lines;
    },

    drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
        const lines = this.wrapText(ctx, text, maxWidth);
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], x, y + i * lineHeight);
        }
        return lines.length * lineHeight;
    },

    drawBackground(ctx, cW, cH, bgFx, s, sparkles, floatingBits, tick) {
        if (bgFx && IP2Live.Assets && IP2Live.Assets.bgImage) {
            bgFx.drawBg(ctx, IP2Live.Assets.bgImage, cW, cH);
            if (typeof bgFx.drawParticles === 'function') {
                bgFx.drawParticles(ctx, s);
            }
        } else {
            ctx.fillStyle = '#030918';
            ctx.fillRect(0, 0, cW, cH);
        }

        const wash = ctx.createLinearGradient(0, 0, 0, cH);
        wash.addColorStop(0, 'rgba(8,18,45,0.58)');
        wash.addColorStop(0.46, 'rgba(4,10,27,0.72)');
        wash.addColorStop(1, 'rgba(2,4,15,0.90)');
        ctx.fillStyle = wash;
        ctx.fillRect(0, 0, cW, cH);

        const centerGlow = ctx.createRadialGradient(
            cW * 0.5,
            cH * 0.43,
            20 * s,
            cW * 0.5,
            cH * 0.43,
            Math.max(cW, cH) * 0.58
        );
        centerGlow.addColorStop(0, 'rgba(63,164,197,0.12)');
        centerGlow.addColorStop(0.42, 'rgba(27,84,117,0.06)');
        centerGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = centerGlow;
        ctx.fillRect(0, 0, cW, cH);

        const vignette = ctx.createRadialGradient(
            cW * 0.5,
            cH * 0.48,
            Math.min(cW, cH) * 0.20,
            cW * 0.5,
            cH * 0.48,
            Math.max(cW, cH) * 0.75
        );
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(0.62, 'rgba(0,0,0,0.08)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.62)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, cW, cH);

        /*
         * Subtle grid / UI traces in the background.
         */
        ctx.save();
        ctx.globalAlpha = 0.08;

        for (let y = 0; y < cH; y += 36 * s) {
            ctx.fillStyle = 'rgba(125,225,255,0.22)';
            ctx.fillRect(0, y, cW, Math.max(1, 1 * s));
        }

        for (let x = 0; x < cW; x += 52 * s) {
            ctx.fillStyle = 'rgba(125,225,255,0.09)';
            ctx.fillRect(x, 0, Math.max(1, 1 * s), cH);
        }
        ctx.restore();

        /*
         * Background small diagonal traces.
         */
        ctx.save();
        ctx.lineWidth = Math.max(1, 1.2 * s);
        for (let i = 0; i < 8; i++) {
            const x = (120 + i * 200) * s;
            const y = (80 + (i % 3) * 170) * s;
            ctx.strokeStyle = i % 2 === 0
                ? 'rgba(255,140,180,0.12)'
                : 'rgba(130,235,255,0.11)';
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 42 * s, y - 28 * s);
            ctx.stroke();
        }
        ctx.restore();

        /*
         * Soft stars / dots.
         */
        if (Array.isArray(sparkles)) {
            ctx.save();
            for (let i = 0; i < sparkles.length; i++) {
                const p = sparkles[i];
                const pulse = 0.56 + 0.44 * Math.sin((tick || 0) * p.twinkleSpeed + p.phase);

                ctx.globalAlpha = p.alpha * pulse;
                ctx.fillStyle = p.color;
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 7 * s;

                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size * s, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        /*
         * Floating accent pieces.
         */
        if (Array.isArray(floatingBits)) {
            ctx.save();
            for (let i = 0; i < floatingBits.length; i++) {
                const bit = floatingBits[i];
                ctx.save();
                ctx.translate(bit.x, bit.y);
                ctx.rotate(bit.rotation);

                ctx.globalAlpha = bit.alpha;
                ctx.fillStyle = bit.color;
                ctx.shadowColor = bit.color;
                ctx.shadowBlur = 6 * s;

                if (bit.kind === 'bar') {
                    ctx.fillRect(-bit.w / 2, -bit.h / 2, bit.w, bit.h);
                } else if (bit.kind === 'diamond') {
                    ctx.beginPath();
                    ctx.moveTo(0, -bit.h / 2);
                    ctx.lineTo(bit.w / 2, 0);
                    ctx.lineTo(0, bit.h / 2);
                    ctx.lineTo(-bit.w / 2, 0);
                    ctx.closePath();
                    ctx.fill();
                } else {
                    ctx.beginPath();
                    ctx.arc(0, 0, bit.w * 0.28, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.restore();
            }
            ctx.restore();
        }
    },

    drawGlassCard(ctx, x, y, w, h, s, tick) {
        ctx.save();

        this.roundRect(ctx, x + 8 * s, y + 10 * s, w, h, 22 * s);
        ctx.fillStyle = 'rgba(0,0,7,0.62)';
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 32 * s;
        ctx.fill();
        ctx.shadowBlur = 0;

        const body = ctx.createLinearGradient(x, y, x + w, y + h);
        body.addColorStop(0, 'rgba(11,30,54,0.93)');
        body.addColorStop(0.48, 'rgba(5,14,29,0.97)');
        body.addColorStop(1, 'rgba(18,8,29,0.96)');

        this.roundRect(ctx, x, y, w, h, 22 * s);
        ctx.fillStyle = body;
        ctx.fill();

        this.roundRect(ctx, x, y, w, h, 22 * s);
        ctx.strokeStyle = 'rgba(139,233,250,0.32)';
        ctx.lineWidth = Math.max(1, 1.2 * s);
        ctx.stroke();

        this.roundRect(ctx, x + 6 * s, y + 6 * s, w - 12 * s, h - 12 * s, 17 * s);
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = Math.max(1, 0.7 * s);
        ctx.stroke();

        ctx.save();
        this.roundRect(ctx, x, y, w, h, 22 * s);
        ctx.clip();

        for (let py = y + 4 * s; py < y + h; py += 6 * s) {
            ctx.fillStyle = 'rgba(218,247,255,0.014)';
            ctx.fillRect(x, py, w, Math.max(1, 0.55 * s));
        }

        const scanY = y - 40 * s + (((tick || 0) * 0.9) % (h + 80 * s));
        const scan = ctx.createLinearGradient(0, scanY - 24 * s, 0, scanY + 24 * s);
        scan.addColorStop(0, 'rgba(126,238,255,0)');
        scan.addColorStop(0.5, 'rgba(126,238,255,0.035)');
        scan.addColorStop(1, 'rgba(126,238,255,0)');
        ctx.fillStyle = scan;
        ctx.fillRect(x, scanY - 24 * s, w, 48 * s);

        ctx.restore();

        ctx.fillStyle = '#79E8FF';
        ctx.fillRect(x + 26 * s, y - 1 * s, 116 * s, 3 * s);

        ctx.fillStyle = '#FF83A6';
        ctx.fillRect(x + 150 * s, y - 1 * s, 48 * s, 3 * s);

        ctx.fillStyle = '#FFE6A7';
        ctx.fillRect(x + w - 116 * s, y + h - 2 * s, 90 * s, 3 * s);

        ctx.restore();
    }
};


/* =========================================================
 * MAIN CREDITS SCREEN
 * ========================================================= */

class IP2LiveCreditsScene extends Scene.Base {
    constructor() {
        super(true);
    }

    initialize() {
        this.animTick = 0;
        this.fadeIn = 0;
        this.bgFx = IP2Live.BgFx.create();
        this.sparkles = [];
        this.floatingBits = [];

        this.members = [
            'Canonigo, Johndaniel A.',
            'Garbo, Melody Ann M.',
            'Maturan, Frances Aaliyah S.',
            'Salonga, Andre D.',
            'Siton, James Michael R.',
        ];
    }

    async load() {
        if (!IP2Live.Assets.bgImage) {
            await IP2Live.Assets.loadAll();
        }

        const ctx = Common.Platform.ctx;

        this.bgFx.seed(ctx.canvas.width, ctx.canvas.height);
        this._seedSparkles(ctx.canvas.width, ctx.canvas.height);
        this._seedFloatingBits(ctx.canvas.width, ctx.canvas.height);

        this.loading = false;

        if (Manager && Manager.Stack) {
            Manager.Stack.requestPaintHUD = true;
        }
    }

    onKeyPressed(key) {
        this._return();
        return true;
    }

    onMouseUp(x, y) {
        this._return();
        return true;
    }

    onKeyPressedAndRepeat(key) {
        return true;
    }

    draw3D() {
        Manager.GL.renderer.clear();
    }

    update() {
        this.animTick++;
        this.fadeIn = Math.min(1, this.fadeIn + 0.035);

        if (this.bgFx && typeof this.bgFx.update === 'function') {
            this.bgFx.update(this.animTick);
        }

        for (let i = 0; i < this.sparkles.length; i++) {
            const p = this.sparkles[i];
            p.y -= p.speed;
            p.x += Math.sin((this.animTick + p.phase) * 0.018) * p.drift;

            if (p.y < -20) {
                p.y = p.cH + 20;
                p.x = Math.random() * p.cW;
            }
        }

        for (let i = 0; i < this.floatingBits.length; i++) {
            const b = this.floatingBits[i];
            b.y += b.vy;
            b.x += Math.sin((this.animTick + b.phase) * b.waveSpeed) * b.waveAmount;
            b.rotation += b.rotationSpeed;

            if (b.y > b.cH + 30) {
                b.y = -30;
                b.x = Math.random() * b.cW;
            }
        }

        if (Manager && Manager.Stack && (this.animTick % 2 === 0 || this.fadeIn < 1)) {
            Manager.Stack.requestPaintHUD = true;
        }
    }

    _return() {
        try {
            if (Data.Systems.soundCancel) {
                Data.Systems.soundCancel.playSound();
            }
        } catch (error) {}

        if (Manager && Manager.Stack) {
            if (IP2Live.MenuTransition) IP2Live.MenuTransition.back();
            else Manager.Stack.pop();
        }
    }

    _seedSparkles(cW, cH) {
        this.sparkles = [];
        for (let i = 0; i < 48; i++) {
            this.sparkles.push({
                x: Math.random() * cW,
                y: Math.random() * cH,
                cW,
                cH,
                size: 0.75 + Math.random() * 1.8,
                alpha: 0.08 + Math.random() * 0.28,
                speed: 0.05 + Math.random() * 0.16,
                drift: 0.035 + Math.random() * 0.09,
                phase: Math.random() * Math.PI * 2,
                twinkleSpeed: 0.018 + Math.random() * 0.022,
                color: Math.random() > 0.78 ? '#FFE6A7' : '#A9ECFF',
            });
        }
    }

    _seedFloatingBits(cW, cH) {
        this.floatingBits = [];

        for (let i = 0; i < 14; i++) {
            const cyanChance = Math.random();
            this.floatingBits.push({
                x: Math.random() * cW,
                y: Math.random() * cH,
                cW,
                cH,
                w: (10 + Math.random() * 18),
                h: (2 + Math.random() * 6),
                alpha: 0.10 + Math.random() * 0.18,
                vy: 0.08 + Math.random() * 0.12,
                phase: Math.random() * Math.PI * 2,
                waveSpeed: 0.012 + Math.random() * 0.014,
                waveAmount: 0.08 + Math.random() * 0.12,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: -0.002 + Math.random() * 0.004,
                color: cyanChance > 0.7
                    ? '#FFE6A7'
                    : (cyanChance > 0.35 ? '#7BEAFF' : '#FF88AF'),
                kind: i % 3 === 0 ? 'diamond' : (i % 4 === 0 ? 'dot' : 'bar'),
            });
        }
    }

    _drawHeader(ctx, x, y, w, s, titleFont, bodyFont) {
        const pulse = 0.55 + 0.45 * Math.sin(this.animTick * 0.04);

        ctx.save();

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        ctx.font = 'bold ' + Math.round(42 * s) + 'px ' + titleFont;
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(107,226,255,0.26)';
        ctx.shadowBlur = 10 * s;
        ctx.fillText('IP2LIVE', x, y);
        ctx.shadowBlur = 0;

        ctx.font = Math.round(10 * s) + 'px ' + bodyFont;
        ctx.fillStyle = 'rgba(185,231,242,0.78)';
        ctx.fillText(
            'BUILT TOGETHER  •  LEARNED TOGETHER  •  FINISHED TOGETHER',
            x + 2 * s,
            y + 34 * s
        );

        const railY = y + 58 * s;
        ctx.fillStyle = 'rgba(112,228,248,0.42)';
        ctx.fillRect(x, railY, w, Math.max(1, 1 * s));

        ctx.fillStyle = 'rgba(255,230,167,' + (0.44 + pulse * 0.24).toFixed(3) + ')';
        ctx.fillRect(x, railY, w * 0.19, Math.max(1, 2 * s));

        ctx.restore();
    }

    _drawTeam(ctx, x, y, w, s, bodyFont) {
        ctx.save();

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        ctx.font = 'bold ' + Math.round(16 * s) + 'px ' + bodyFont;
        ctx.fillStyle = '#8FEFFF';
        ctx.fillText('THE TEAM', x, y);

        ctx.font = Math.round(11 * s) + 'px ' + bodyFont;
        ctx.fillStyle = 'rgba(178,218,230,0.62)';
        ctx.fillText('Five members, one shared build.', x, y + 27 * s);

        const listY = y + 72 * s;
        const rowH = 58 * s;
        const lineX = x + 15 * s;

        ctx.strokeStyle = 'rgba(118,220,238,0.18)';
        ctx.lineWidth = Math.max(1, 1 * s);

        ctx.beginPath();
        ctx.moveTo(lineX, listY + 9 * s);
        ctx.lineTo(lineX, listY + rowH * (this.members.length - 1) + 9 * s);
        ctx.stroke();

        for (let i = 0; i < this.members.length; i++) {
            const entrance = IP2LiveCreditsVisuals.easeOutCubic(
                Math.max(0, Math.min(1, this.fadeIn * 1.55 - i * 0.08))
            );

            const rowY = listY + rowH * i;
            const dotY = rowY + 9 * s;
            const textX = x + 39 * s + (1 - entrance) * 18 * s;

            ctx.globalAlpha = entrance;

            ctx.fillStyle = i === this.members.length - 1 ? '#FFE6A7' : '#7BEAFF';
            ctx.shadowColor = ctx.fillStyle;
            ctx.shadowBlur = 9 * s;
            ctx.beginPath();
            ctx.arc(lineX, dotY, 3.7 * s, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            ctx.font = 'bold ' + Math.round(15.3 * s) + 'px ' + bodyFont;
            ctx.fillStyle = '#F7FCFF';
            ctx.fillText(this.members[i], textX, rowY + 7 * s);

            ctx.fillStyle = 'rgba(124,216,232,0.14)';
            ctx.fillRect(textX, rowY + 31 * s, w - (textX - x), Math.max(1, 1 * s));
        }

        ctx.globalAlpha = 1;
        ctx.restore();
    }

    _drawGratitude(ctx, x, y, w, s, bodyFont) {
        ctx.save();

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        ctx.font = 'bold ' + Math.round(16 * s) + 'px ' + bodyFont;
        ctx.fillStyle = '#FFE6A7';
        ctx.fillText('WITH GRATITUDE', x, y);

        let cursorY = y + 40 * s;
        const lineHeight = 24 * s;

        ctx.font = Math.round(12.4 * s) + 'px ' + bodyFont;
        ctx.fillStyle = 'rgba(226,240,246,0.90)';

        cursorY += IP2LiveCreditsVisuals.drawWrappedText(
            ctx,
            'What started as ideas on paper, long discussions, broken builds, revisions, and small wins eventually became something we could finally call our own. IP2Live carries a piece of every member who kept creating, testing, learning, and pushing the project forward.',
            x,
            cursorY,
            w,
            lineHeight
        );

        cursorY += 20 * s;

        cursorY += IP2LiveCreditsVisuals.drawWrappedText(
            ctx,
            "This project would not have been possible without the guidance and support of our instructor, Ma'am Erica Jean S. Abadinas.",
            x,
            cursorY,
            w,
            lineHeight
        );

        cursorY += 16 * s;

        ctx.font = 'bold ' + Math.round(14.2 * s) + 'px ' + bodyFont;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText("Ma'am Erica Jean S. Abadinas", x, cursorY);

        cursorY += 30 * s;

        ctx.font = Math.round(12.1 * s) + 'px ' + bodyFont;
        ctx.fillStyle = 'rgba(181,224,235,0.78)';

        IP2LiveCreditsVisuals.drawWrappedText(
            ctx,
            'Thank you for giving us the space to learn, make mistakes, improve, and turn an ambitious idea into something real. The lessons behind this project will stay with us long after the final build.',
            x,
            cursorY,
            w,
            lineHeight
        );

        ctx.restore();
    }

    drawHUD() {
        const ctx = Common.Platform.ctx;
        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;

        const s = Math.max(0.72, Math.min(cW / 1280, cH / 720));

        /*
         * Requested font: Oxanium-Medium
         */
        const bodyFont = IP2Live.Assets.oxaniumMediumLoaded
            ? 'Oxanium-Medium'
            : 'monospace';

        const titleFont = bodyFont;

        const fade = IP2LiveCreditsVisuals.easeOutCubic(this.fadeIn);

        const panelW = Math.min(1030 * s, cW - 72 * s);
        const panelH = Math.min(570 * s, cH - 72 * s);
        const panelX = (cW - panelW) / 2;
        const panelY = (cH - panelH) / 2 + (1 - fade) * 18 * s;

        ctx.save();

        IP2LiveCreditsVisuals.drawBackground(
            ctx,
            cW,
            cH,
            this.bgFx,
            s,
            this.sparkles,
            this.floatingBits,
            this.animTick
        );

        ctx.globalAlpha = fade;

        IP2LiveCreditsVisuals.drawGlassCard(
            ctx,
            panelX,
            panelY,
            panelW,
            panelH,
            s,
            this.animTick
        );

        const contentX = panelX + 46 * s;
        const contentW = panelW - 92 * s;

        this._drawHeader(
            ctx,
            contentX,
            panelY + 56 * s,
            contentW,
            s,
            titleFont,
            bodyFont
        );

        const dividerX = panelX + panelW * 0.455;
        const sectionTop = panelY + 150 * s;
        const dividerBottom = panelY + panelH - 103 * s;

        ctx.strokeStyle = 'rgba(130,219,235,0.15)';
        ctx.lineWidth = Math.max(1, 1 * s);
        ctx.beginPath();
        ctx.moveTo(dividerX, panelY + 132 * s);
        ctx.lineTo(dividerX, dividerBottom);
        ctx.stroke();

        this._drawTeam(
            ctx,
            contentX,
            sectionTop,
            dividerX - contentX - 29 * s,
            s,
            bodyFont
        );

        const rightX = dividerX + 31 * s;
        const rightW = panelX + panelW - 46 * s - rightX;

        this._drawGratitude(
            ctx,
            rightX,
            sectionTop,
            rightW,
            s,
            bodyFont
        );

        const quoteY = panelY + panelH - 65 * s;
        const pulse = 0.55 + 0.45 * Math.sin(this.animTick * 0.045);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.font = 'italic ' + Math.round(12.2 * s) + 'px ' + bodyFont;
        ctx.fillStyle = 'rgba(226,246,250,0.88)';
        ctx.fillText(
            '“Every finished project remembers the people who refused to give up on it.”',
            panelX + panelW / 2,
            quoteY
        );

        ctx.font = Math.round(9.5 * s) + 'px ' + bodyFont;
        ctx.fillStyle = 'rgba(135,222,237,' + (0.48 + pulse * 0.26).toFixed(3) + ')';
        ctx.fillText(
            'PRESS ANY KEY OR CLICK TO RETURN',
            panelX + panelW / 2,
            quoteY + 34 * s
        );

        ctx.restore();
    }
}


/* =========================================================
 * END / CAMPAIGN COMPLETION SCREEN
 * ========================================================= */

class IP2LiveEndCreditsScene extends Scene.Base {
    constructor(payload) {
        super(true);
        this.payload = payload || {};
    }

    initialize() {
        this.animTick = 0;
        this.selectedIndex = 0;
        this.hoverIndex = -1;
        this.menuItems = ['RETRY GAME', 'MAIN MENU', 'EXPORT REPORT'];
        this.statusLine = 'RUN COMPLETE';
        this.bgFx = IP2Live.BgFx.create();
        this.particles = [];
    }

    async load() {
        if (!IP2Live.Assets.bgImage) {
            await IP2Live.Assets.loadAll();
        }

        const ctx = Common.Platform.ctx;

        this.bgFx.seed(ctx.canvas.width, ctx.canvas.height);
        this._seedParticles(ctx.canvas.width, ctx.canvas.height);
        this.loading = false;

        if (IP2Live.MusicManager) {
            IP2Live.MusicManager.play(IP2Live.MusicManager.ZONE.MAIN_MENU);
        }

        if (Manager && Manager.Stack) {
            Manager.Stack.requestPaintHUD = true;
        }
    }

    onKeyPressed(key) {
        if (Data.Keyboards.checkActionMenu(key)) {
            this._confirmSelection();
        } else if (Data.Keyboards.checkCancelMenu(key)) {
            this._goMainMenu();
        }

        return true;
    }

    onKeyPressedAndRepeat(key) {
        const previous = this.selectedIndex;

        if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Up)) {
            this.selectedIndex = (this.selectedIndex - 1 + this.menuItems.length) % this.menuItems.length;
        } else if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Down)) {
            this.selectedIndex = (this.selectedIndex + 1) % this.menuItems.length;
        }

        if (previous !== this.selectedIndex) {
            this.hoverIndex = -1;

            try {
                Data.Systems.soundCursor.playSound();
            } catch (error) {}

            if (Manager && Manager.Stack) {
                Manager.Stack.requestPaintHUD = true;
            }
        }

        return true;
    }

    onMouseMove(x, y) {
        const idx = this._buttonAt(x, y);

        if (idx !== this.hoverIndex) {
            this.hoverIndex = idx;

            if (idx >= 0 && idx !== this.selectedIndex) {
                this.selectedIndex = idx;

                try {
                    Data.Systems.soundCursor.playSound();
                } catch (error) {}
            }

            if (Manager && Manager.Stack) {
                Manager.Stack.requestPaintHUD = true;
            }
        }
    }

    onMouseUp(x, y) {
        const idx = this._buttonAt(x, y);

        if (idx < 0) {
            return true;
        }

        this.selectedIndex = idx;
        this._confirmSelection();
        return true;
    }

    draw3D() {
        Manager.GL.renderer.clear();
    }

    update() {
        this.animTick++;

        if (this.bgFx && typeof this.bgFx.update === 'function') {
            this.bgFx.update(this.animTick);
        }

        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];

            p.x += p.vx;
            p.y += p.vy;
            p.flip--;

            if (p.flip <= 0) {
                p.flip = 40 + Math.floor(Math.random() * 80);
                p.text = this._particleText();
            }

            if (p.y > p.cH + 24) {
                p.y = -24;
                p.x = Math.random() * p.cW;
            }
        }

        if (this.animTick % 2 === 0 && Manager && Manager.Stack) {
            Manager.Stack.requestPaintHUD = true;
        }
    }

    drawHUD() {
        const ctx = Common.Platform.ctx;
        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const s = Math.max(0.72, Math.min(cW / 1280, cH / 720));

        const font = IP2Live.Assets.oxaniumMediumLoaded
            ? 'Oxanium-Medium'
            : 'monospace';

        const tick = this.animTick || 0;

        ctx.save();

        IP2LiveCreditsVisuals.drawBackground(
            ctx,
            cW,
            cH,
            this.bgFx,
            s,
            null,
            null,
            tick
        );

        this._drawParticles(ctx, s);
        this._drawSlashes(ctx, cW, cH, s, tick);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + Math.round(44 * s) + 'px ' + font;
        ctx.fillText('IP2LIVE', cW / 2, 78 * s);

        ctx.font = 'bold ' + Math.round(11 * s) + 'px ' + font;
        ctx.fillStyle = '#8FEFFF';
        ctx.fillText('CAMPAIGN COMPLETE', cW / 2, 111 * s);

        const panelW = Math.min(950 * s, cW - 92 * s);
        const panelH = 345 * s;
        const panelX = (cW - panelW) / 2;
        const panelY = 145 * s;

        this._drawCompletionPanel(ctx, panelX, panelY, panelW, panelH, s, font, tick);

        const buttons = this._buttonLayout();
        for (let i = 0; i < this.menuItems.length; i++) {
            const active = i === this.selectedIndex || i === this.hoverIndex;
            this._drawButton(ctx, buttons[i], this.menuItems[i], i, active, s, font, tick);
        }

        ctx.font = 'bold ' + Math.round(8 * s) + 'px ' + font;
        ctx.fillStyle = 'rgba(143,239,255,0.64)';
        ctx.textAlign = 'center';
        ctx.fillText(this.statusLine, cW / 2, cH - 20 * s);

        ctx.restore();
    }

    _drawCompletionPanel(ctx, x, y, w, h, s, font, tick) {
        const stage = this.payload.stage || {};
        const stageName = stage.name || 'FINAL WORLD';
        const playerName = Core.Game.current && Core.Game.current.infiltratorName
            ? Core.Game.current.infiltratorName
            : 'INFILTRATOR';

        ctx.save();

        IP2LiveCreditsVisuals.drawGlassCard(ctx, x, y, w, h, s, tick);

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        ctx.font = 'bold ' + Math.round(11 * s) + 'px ' + font;
        ctx.fillStyle = '#FF8CAA';
        ctx.fillText('FINAL ACCESS GRANTED', x + 35 * s, y + 40 * s);

        ctx.font = 'bold ' + Math.round(34 * s) + 'px ' + font;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('MISSION COMPLETE', x + 35 * s, y + 103 * s);

        ctx.font = Math.round(13 * s) + 'px ' + font;
        ctx.fillStyle = '#D9EEFA';

        const lines = [
            'Congratulations, ' + playerName + '.',
            'You reached the final exit node and completed IP2Live.',
            stageName + ' has been verified as the final active world in this route.',
            'You can retry the game, return to the main menu, or export your run report.',
        ];

        let textY = y + 155 * s;
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], x + 38 * s, textY);
            textY += 27 * s;
        }

        ctx.font = 'italic ' + Math.round(10 * s) + 'px ' + font;
        ctx.fillStyle = 'rgba(255,230,167,0.82)';
        ctx.fillText(
            'The route ends here, but what you learned comes with you.',
            x + 38 * s,
            y + h - 37 * s
        );

        ctx.restore();
    }

    _drawButton(ctx, rect, label, index, active, s, font, tick) {
        const x = rect.x;
        const y = rect.y;
        const w = rect.w;
        const h = rect.h;
        const slant = 18 * s;

        const activeColor = index === 0
            ? '#FFE6A7'
            : (index === 1 ? '#FF6E98' : '#77E9FF');

        ctx.save();
        ctx.translate(active ? 7 * s : 0, 0);

        ctx.beginPath();
        ctx.moveTo(x + slant, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - slant, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x + slant * 0.42, y + h * 0.24);
        ctx.closePath();

        const grad = ctx.createLinearGradient(x, y, x + w, y);
        if (active) {
            grad.addColorStop(0, index === 0 ? 'rgba(255,230,167,0.82)' : 'rgba(67,19,48,0.90)');
            grad.addColorStop(1, 'rgba(4,10,23,0.90)');
            ctx.shadowColor = activeColor;
            ctx.shadowBlur = 14 * s;
        } else {
            grad.addColorStop(0, 'rgba(5,15,29,0.93)');
            grad.addColorStop(1, 'rgba(4,9,20,0.72)');
            ctx.shadowBlur = 0;
        }

        ctx.fillStyle = grad;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = active ? activeColor : 'rgba(105,228,248,0.46)';
        ctx.lineWidth = Math.max(1, (active ? 1.8 : 1) * s);
        ctx.stroke();

        ctx.font = 'bold ' + Math.round(15 * s) + 'px ' + font;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = active && index === 0 ? '#101217' : '#FFFFFF';
        ctx.fillText(label, x + w / 2, y + h / 2 + s);

        if (active) {
            ctx.globalAlpha = 0.18 + 0.12 * Math.sin(tick * 0.12);
            ctx.fillStyle = '#FFFFFF';
            ctx.transform(1, 0, -0.35, 1, 0, 0);
            ctx.fillRect(x + w * 0.54, y - h, 20 * s, h * 3);
        }

        ctx.restore();
    }

    _drawSlashes(ctx, cW, cH, s, tick) {
        ctx.save();

        ctx.fillStyle = 'rgba(255,80,125,0.72)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(250 * s, 0);
        ctx.lineTo(180 * s, 80 * s);
        ctx.lineTo(0, 110 * s);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(255,230,167,0.75)';
        ctx.beginPath();
        ctx.moveTo(cW - 300 * s, cH);
        ctx.lineTo(cW, cH - 70 * s);
        ctx.lineTo(cW, cH);
        ctx.closePath();
        ctx.fill();

        for (let i = 0; i < 8; i++) {
            const py = (138 + i * 49 + Math.sin(tick * 0.04 + i) * 8) * s;

            ctx.fillStyle = i % 3 === 0
                ? 'rgba(255,92,133,0.38)'
                : (i % 2 === 0 ? 'rgba(255,230,167,0.32)' : 'rgba(111,232,255,0.32)');

            ctx.fillRect((86 + i * 150) * s, py, (70 + i * 7) * s, 3 * s);
        }

        ctx.restore();
    }

    _drawParticles(ctx, s) {
        ctx.save();

        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];

            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.font = Math.round(p.size * s) + 'px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(p.text, p.x, p.y);
        }

        ctx.restore();
    }

    _buttonLayout() {
        const ctx = Common.Platform.ctx;
        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const s = Math.max(0.72, Math.min(cW / 1280, cH / 720));

        const w = 284 * s;
        const h = 52 * s;
        const gap = 17 * s;
        const totalW = w * 3 + gap * 2;
        const y = cH - 102 * s;
        const startX = (cW - totalW) / 2;

        return [
            { x: startX, y, w, h },
            { x: startX + w + gap, y, w, h },
            { x: startX + (w + gap) * 2, y, w, h },
        ];
    }

    _buttonAt(x, y) {
        const buttons = this._buttonLayout();

        for (let i = 0; i < buttons.length; i++) {
            const b = buttons[i];
            if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
                return i;
            }
        }

        return -1;
    }

    _confirmSelection() {
        try {
            Data.Systems.soundConfirmation.playSound();
        } catch (error) {}

        if (this.selectedIndex === 0) {
            this._retryGame();
        } else if (this.selectedIndex === 1) {
            this._goMainMenu();
        } else {
            this._exportReport();
        }
    }

    _retryGame() {
        if (IP2Live.MapManager) {
            IP2Live.MapManager._stageRouteLocked = false;
        }

        this._resetGameState();

        if (IP2Live.LoadingScreen && IP2Live.MapManager) {
            IP2Live.LoadingScreen.show({
                mode: 'reset',
                status: 'Loading New Game',
                detail: 'Rebooting infiltration route',
                fadeMusicOnStart: true,
                musicFadeDurationMs: 2200,
                onComplete: function () {
                    IP2Live.MapManager.goToTutorial({ useLoading: false });
                },
            });
            return;
        }

        if (IP2Live.MapManager) {
            IP2Live.MapManager.goToTutorial({ useLoading: false });
        }
    }

    _goMainMenu() {
        if (IP2Live.MapManager) {
            IP2Live.MapManager._stageRouteLocked = false;
        }

        if (IP2Live.LoadingScreen) {
            IP2Live.LoadingScreen.show({
                mode: 'reset',
                status: 'Loading Main Menu',
                detail: 'Closing final route session',
                onComplete: function () {
                    Manager.Stack.popAll();
                    Manager.Stack.pushTitleScreen(true);

                    if (IP2Live.MusicManager) {
                        IP2Live.MusicManager.play(IP2Live.MusicManager.ZONE.MAIN_MENU);
                    }
                },
            });
            return;
        }

        Manager.Stack.popAll();
        Manager.Stack.pushTitleScreen(true);
    }

    _resetGameState() {
        if (!Core || !Core.Game) {
            return;
        }

        const oldGame = Core.Game.current || null;
        const name = oldGame && oldGame.infiltratorName ? oldGame.infiltratorName : null;

        if (IP2Live.GameManager && typeof IP2Live.GameManager.clearActiveSaveSlot === 'function') {
            IP2Live.GameManager.clearActiveSaveSlot(oldGame);
        }

        const newGame = new Core.Game();
        newGame.initializeDefault();

        if (name) {
            newGame.infiltratorName = name;
        }

        Core.Game.current = newGame;
    }

    _exportReport() {
        if (window.IP2LiveExportReportMenu) {
            Manager.Stack.push(new IP2LiveExportReportMenu());
            return;
        }

        if (IP2Live.GameManager && typeof IP2Live.GameManager.exportProgressReport === 'function') {
            IP2Live.GameManager.exportProgressReport({
                scopeDays: 30,
                format: 'both',
            })
            .then(() => {
                this.statusLine = 'REPORT EXPORTED';
                if (Manager && Manager.Stack) {
                    Manager.Stack.requestPaintHUD = true;
                }
            })
            .catch(() => {
                this.statusLine = 'REPORT EXPORT FAILED';
                if (Manager && Manager.Stack) {
                    Manager.Stack.requestPaintHUD = true;
                }
            });

            return;
        }

        this.statusLine = 'REPORT SYSTEM UNAVAILABLE';

        if (Manager && Manager.Stack) {
            Manager.Stack.requestPaintHUD = true;
        }
    }

    _buildReport() {
        const playerName = Core.Game.current && Core.Game.current.infiltratorName
            ? Core.Game.current.infiltratorName
            : 'UNKNOWN';

        const stage = this.payload.stage || {};
        const stages = this.payload.stages || [];

        const lines = [
            'IP2Live Infiltration Report',
            '===========================',
            'Infiltrator: ' + playerName,
            'Status: Campaign Complete',
            'Final world: ' + (stage.name || 'FINAL WORLD'),
            'Completed at: ' + (this.payload.completedAt || new Date().toISOString()),
            '',
            'Verified route:',
        ];

        for (let i = 0; i < stages.length; i++) {
            lines.push('- ' + stages[i].name + ' (Map ' + stages[i].id + ')');
        }

        lines.push('');
        lines.push('Default spawn: X:6 Y:0 Z:17');
        lines.push('Default exit node: X:16 Y:0 Z:4');

        return lines.join('\n');
    }

    _seedParticles(cW, cH) {
        this.particles = [];

        for (let i = 0; i < 70; i++) {
            this.particles.push({
                x: Math.random() * cW,
                y: Math.random() * cH,
                vx: (Math.random() - 0.5) * 0.22,
                vy: 0.24 + Math.random() * 0.58,
                size: 8 + Math.random() * 8,
                alpha: 0.05 + Math.random() * 0.18,
                color: Math.random() > 0.72 ? '#FFE6A7' : '#8FEFFF',
                text: this._particleText(),
                flip: 20 + Math.floor(Math.random() * 90),
                cW,
                cH,
            });
        }
    }

    _particleText() {
        const chars = [
            '0',
            '1',
            '/24',
            '/30',
            'CIDR',
            'NET',
            'ARP',
            '64',
            '128',
            '255',
            'TRACE',
        ];

        return chars[Math.floor(Math.random() * chars.length)];
    }
}


/* =========================================================
 * EXPOSE SCENES
 * ========================================================= */

window.IP2LiveCreditsScene = IP2LiveCreditsScene;
window.IP2LiveEndCreditsScene = IP2LiveEndCreditsScene;

console.log('[IP2Live] credits.js loaded.');