/**
 * IP2Live - World Title Overlay
 * Intercepts map loads, displays a title card, and applies a hacker glitch transition.
 */

class IP2LiveWorldTitle {
    constructor() {
        this._active = false;
        this._mapId = 0;
        this._stageName = '';
        this._levelName = '';
        this._animTick = 0;
        this._glitchOffset = 0;
        this._finishedEmitted = false;
        
        this._creepChars = '0123456789ABCDEF!@#$%^&*()<>{}[]';
        this._creepNodes = [];
        this._networkNodes = [];
        this._packetTraces = [];
        this._glitchSlices = [];
        this._statusLabels = [];
        this._palette = this._ominousPalette();
    }

    start(mapId) {
        this._active = true;
        this._animTick = 0;
        this._finishedEmitted = false;
        
        let actualMapId = mapId;
        if (!actualMapId && typeof Core !== 'undefined' && Core.Game && Core.Game.current) {
            actualMapId = Core.Game.current.currentMapID;
        }
        this._mapId = actualMapId;
        
        // Resolve names
        const mapManager = IP2Live.MapManager;
        const stage = mapManager ? mapManager.stageFor(actualMapId) : null;
        
        if (stage && stage.tutorial) {
            const playerName = (typeof Core !== 'undefined' && Core.Game && Core.Game.current) 
                ? Core.Game.current.infiltratorName 
                : 'INFILTRATOR';
            this._stageName = 'TUTORIAL STAGE';
            this._levelName = 'WELCOME ' + (playerName ? playerName.toUpperCase() : 'INFILTRATOR');
        } else if (stage) {
            this._stageName = 'STAGE ' + stage.stage;
            this._levelName = 'LEVEL ' + stage.level;
        } else {
            this._stageName = 'UNKNOWN STAGE';
            this._levelName = 'LEVEL X';
        }

        this._seedVisualState(actualMapId, stage);

        if (IP2Live.GameManager && typeof IP2Live.GameManager.handleWorldTitleStarted === 'function') {
            IP2Live.GameManager.handleWorldTitleStarted(actualMapId, {
                source: 'WorldTitleOverlay.start',
                overlay: this,
            });
        }
    }

    isActive() {
        return this._active;
    }

    update() {
        if (!this._active) return;
        this._animTick++;

        if (this._animTick > 230) {
            this._active = false;
            if (!this._finishedEmitted) {
                this._finishedEmitted = true;
                if (IP2Live.GameManager && typeof IP2Live.GameManager.handleWorldTitleFinished === 'function') {
                    IP2Live.GameManager.handleWorldTitleFinished(this._mapId, {
                        source: 'WorldTitleOverlay.update',
                        overlay: this,
                    });
                }
            }
        }
    }

    drawHUD(ctx) {
        if (!this._active) return;

        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const sX = cW / Common.ScreenResolution.SCREEN_X;
        const sY = cH / Common.ScreenResolution.SCREEN_Y;
        const tick = this._animTick;

        ctx.save();
        this._drawBackdrop(ctx, cW, cH, sX, sY, tick);
        this._drawNetworkMotif(ctx, cW, cH, sX, sY, tick);
        this._drawHeaderRails(ctx, cW, cH, sX, sY, tick);
        this._drawTitleBlock(ctx, cW, cH, sX, sY, tick);
        this._drawGlitchPass(ctx, cW, cH, sX, sY, tick);
        this._drawExitWipe(ctx, cW, cH, sX, sY, tick);
        ctx.restore();
    }

    _seedVisualState(mapId, stage) {
        const seed = Math.max(1, Number(mapId) || 1);
        const rand = this._makeRand(seed * 7919 + 17);
        const p = this._palette;

        this._creepNodes = [];
        for (let i = 0; i < 54; i++) {
            this._creepNodes.push({
                xRatio: rand(),
                yRatio: rand(),
                char: this._creepChars[Math.floor(rand() * this._creepChars.length)],
                color: rand() > 0.76 ? p.creepGreen : (rand() > 0.52 ? p.creepTeal : p.creepRed),
                size: 0.75 + rand() * 1.35,
                drift: 0.35 + rand() * 0.7,
                phase: rand() * Math.PI * 2,
                isLeft: (i % 2 === 0),
                isTop: (Math.floor(i / 2) % 2 === 0)
            });
        }

        this._networkNodes = [];
        for (let i = 0; i < 24; i++) {
            this._networkNodes.push({
                x: rand(),
                y: rand(),
                r: 1.7 + rand() * 2.8,
                phase: rand() * Math.PI * 2,
                group: i % 4,
            });
        }

        this._packetTraces = [];
        for (let i = 0; i < 12; i++) {
            const from = Math.floor(rand() * this._networkNodes.length);
            let to = Math.floor(rand() * this._networkNodes.length);
            if (to === from) to = (to + 5) % this._networkNodes.length;
            this._packetTraces.push({
                from,
                to,
                speed: 0.006 + rand() * 0.014,
                phase: rand(),
                color: rand() > 0.5 ? p.packetTeal : p.packetGreen,
            });
        }

        this._glitchSlices = [];
        for (let i = 0; i < 11; i++) {
            this._glitchSlices.push({
                y: 0.24 + rand() * 0.52,
                h: 0.012 + rand() * 0.045,
                dx: (rand() - 0.5) * 70,
                delay: Math.floor(rand() * 34),
            });
        }

        const stageLabel = stage && stage.tutorial ? 'TUTORIAL_ROUTE' : 'STAGE_ROUTE';
        this._statusLabels = [
            'ROUTE ESTABLISHED',
            'NODE AUTH // OK',
            'MAP ' + String(mapId || 0).padStart(4, '0'),
            stageLabel,
        ];
    }

    _makeRand(seed) {
        let s = seed >>> 0;
        return function () {
            s = (s * 1664525 + 1013904223) >>> 0;
            return s / 4294967296;
        };
    }

    _titleFont() {
        if (IP2Live.Assets && IP2Live.Assets.astronomousLoaded) return 'Astronomous';
        if (IP2Live.Assets && IP2Live.Assets.abnesLoaded) return 'Abnes';
        return 'Arial Black';
    }

    _titleNumberFont() {
        if (IP2Live.Assets && IP2Live.Assets.abnesLoaded) return 'Abnes';
        if (IP2Live.Assets && IP2Live.Assets.neuropolLoaded) return 'Neuropol';
        if (IP2Live.Assets && IP2Live.Assets.nebulaLoaded) return 'Nebula-Regular';
        return 'Arial Black';
    }

    _bodyFont() {
        if (IP2Live.Assets && IP2Live.Assets.neuropolLoaded) return 'Neuropol';
        if (IP2Live.Assets && IP2Live.Assets.nebulaLoaded) return 'Nebula-Regular';
        return 'monospace';
    }

    _ominousPalette() {
        return {
            void: '#000000',
            ink: '#010509',
            panel: '#030C10',
            panelDeep: '#02070A',
            text: '#E6FFF4',
            textDim: 'rgba(175,214,202,0.78)',
            glass: 'rgba(4,13,17,0.86)',
            stroke: 'rgba(122,177,164,0.62)',
            railTeal: 'rgba(43,128,119,0.66)',
            railGreen: 'rgba(68,158,111,0.58)',
            warning: '#7A1222',
            warningSoft: 'rgba(122,18,34,0.62)',
            deadAmber: '#6F6330',
            teal: '#2A9A8D',
            tealSoft: 'rgba(42,154,141,0.48)',
            green: '#4FA66B',
            greenSoft: 'rgba(79,166,107,0.52)',
            packetTeal: '#3AAFA0',
            packetGreen: '#68B878',
            creepTeal: '#2E8F83',
            creepGreen: '#5FAE74',
            creepRed: '#711529',
            titleGlow: 'rgba(67,174,119,0.55)',
            titleRed: '#8A1A2E',
            titleTeal: '#3AAFA0',
            pixelGreen: 'rgba(76,160,104,0.35)',
            pixelTeal: 'rgba(50,142,132,0.32)',
            pixelRed: 'rgba(116,20,36,0.28)',
        };
    }

    _easeOutCubic(t) {
        const x = Math.max(0, Math.min(1, t));
        return 1 - Math.pow(1 - x, 3);
    }

    _easeInOutCubic(t) {
        const x = Math.max(0, Math.min(1, t));
        return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    }

    _introProgress(tick) {
        return this._easeOutCubic(Math.min(1, tick / 30));
    }

    _exitProgress(tick) {
        return this._easeInOutCubic(Math.max(0, Math.min(1, (tick - 170) / 60)));
    }

    _drawBackdrop(ctx, cW, cH, sX, sY, tick) {
        const intro = this._introProgress(tick);
        const exit = this._exitProgress(tick);
        const veil = Math.max(0, intro * (1 - exit * 0.88));
        const p = this._palette;

        ctx.save();
        ctx.globalAlpha = veil;
        const bg = ctx.createLinearGradient(0, 0, cW, cH);
        bg.addColorStop(0, 'rgba(0,1,3,0.94)');
        bg.addColorStop(0.45, 'rgba(2,13,16,0.78)');
        bg.addColorStop(1, 'rgba(0,0,0,0.92)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, cW, cH);

        const sweep = ctx.createLinearGradient(0, cH * 0.18, cW, cH * 0.82);
        sweep.addColorStop(0, 'rgba(72,12,26,0.16)');
        sweep.addColorStop(0.42, 'rgba(21,88,74,0.16)');
        sweep.addColorStop(0.72, 'rgba(42,95,52,0.10)');
        sweep.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sweep;
        this._slantedRect(ctx, -80 * sX, cH * 0.10, cW * 0.76, cH * 0.82, 110 * sX);
        ctx.fill();

        const vignette = ctx.createRadialGradient(cW * 0.52, cH * 0.50, cH * 0.12, cW * 0.52, cH * 0.50, cH * 0.85);
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.58)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, cW, cH);

        ctx.globalAlpha = veil * 0.18;
        ctx.fillStyle = p.void;
        for (let y = (tick * 0.8 % (5 * sY)); y < cH; y += 5 * sY) {
            ctx.fillRect(0, y, cW, Math.max(1, 1.35 * sY));
        }
        ctx.restore();
    }

    _drawNetworkMotif(ctx, cW, cH, sX, sY, tick) {
        const intro = this._introProgress(tick);
        const exit = this._exitProgress(tick);
        const alpha = intro * (1 - exit * 0.8);
        const p = this._palette;
        if (alpha <= 0) return;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.lineWidth = Math.max(1, 1.2 * sX);

        for (let i = 0; i < this._networkNodes.length; i++) {
            const a = this._nodePoint(this._networkNodes[i], cW, cH, tick);
            for (let j = i + 1; j < this._networkNodes.length; j++) {
                const bNode = this._networkNodes[j];
                if (bNode.group !== this._networkNodes[i].group && Math.abs(i - j) > 4) continue;
                const b = this._nodePoint(bNode, cW, cH, tick);
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > cW * 0.28) continue;
                ctx.globalAlpha = alpha * Math.max(0.06, 0.24 - dist / cW);
                ctx.strokeStyle = p.tealSoft;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
            }
        }

        ctx.globalAlpha = alpha;
        for (let i = 0; i < this._packetTraces.length; i++) {
            const trace = this._packetTraces[i];
            const from = this._nodePoint(this._networkNodes[trace.from], cW, cH, tick);
            const to = this._nodePoint(this._networkNodes[trace.to], cW, cH, tick);
            const progress = (trace.phase + tick * trace.speed) % 1;
            const x = from.x + (to.x - from.x) * progress;
            const y = from.y + (to.y - from.y) * progress;
            ctx.fillStyle = trace.color;
            ctx.shadowColor = trace.color;
            ctx.shadowBlur = 8 * sX;
            ctx.fillRect(x - 2 * sX, y - 2 * sY, 4 * sX, 4 * sY);
        }
        ctx.shadowBlur = 0;

        for (let i = 0; i < this._networkNodes.length; i++) {
            const node = this._networkNodes[i];
            const point = this._nodePoint(node, cW, cH, tick);
            const pulse = 0.5 + 0.5 * Math.sin(tick * 0.08 + node.phase);
            ctx.globalAlpha = alpha * (0.45 + pulse * 0.45);
            ctx.fillStyle = node.group % 3 === 0 ? p.warning : p.teal;
            ctx.beginPath();
            ctx.arc(point.x, point.y, node.r * sX, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = alpha * 0.55;
        ctx.font = 'bold ' + Math.round(11 * sX) + 'px monospace';
        ctx.textAlign = 'center';
        for (let i = 0; i < this._creepNodes.length; i++) {
            const node = this._creepNodes[i];
            const nx = (node.isLeft ? node.xRatio * 0.22 : 0.78 + node.xRatio * 0.22) * cW;
            const nyBase = (node.isTop ? node.yRatio * 0.24 : 0.74 + node.yRatio * 0.24) * cH;
            const ny = nyBase + Math.sin(tick * 0.02 * node.drift + node.phase) * 7 * sY;
            ctx.fillStyle = node.color;
            ctx.fillText(node.char, nx, ny);
        }

        ctx.restore();
    }

    _nodePoint(node, cW, cH, tick) {
        return {
            x: node.x * cW + Math.sin(tick * 0.012 + node.phase) * 10,
            y: node.y * cH + Math.cos(tick * 0.010 + node.phase) * 8,
        };
    }

    _drawHeaderRails(ctx, cW, cH, sX, sY, tick) {
        const intro = this._introProgress(tick);
        const exit = this._exitProgress(tick);
        const alpha = intro * (1 - exit);
        const slide = (1 - intro) * -70 * sX + exit * 120 * sX;
        const p = this._palette;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(slide, 0);

        ctx.lineWidth = Math.max(1, 2 * sX);
        ctx.strokeStyle = p.railTeal;
        ctx.beginPath();
        ctx.moveTo(34 * sX, 46 * sY);
        ctx.lineTo(cW * 0.42, 46 * sY);
        ctx.lineTo(cW * 0.48, 70 * sY);
        ctx.lineTo(cW - 56 * sX, 70 * sY);
        ctx.stroke();

        ctx.strokeStyle = p.warningSoft;
        ctx.beginPath();
        ctx.moveTo(54 * sX, cH - 64 * sY);
        ctx.lineTo(cW * 0.52, cH - 64 * sY);
        ctx.lineTo(cW * 0.58, cH - 88 * sY);
        ctx.lineTo(cW - 34 * sX, cH - 88 * sY);
        ctx.stroke();

        ctx.fillStyle = p.green;
        ctx.fillRect(44 * sX, 54 * sY, 76 * sX, 6 * sY);
        ctx.fillStyle = p.warning;
        ctx.fillRect(cW - 152 * sX, cH - 78 * sY, 108 * sX, 6 * sY);

        const bodyFont = this._bodyFont();
        ctx.font = 'bold ' + Math.round(9 * sX) + 'px ' + bodyFont;
        ctx.textAlign = 'left';
        ctx.fillStyle = p.textDim;
        ctx.fillText(this._statusLabels[0], 132 * sX, 58 * sY);
        ctx.fillText(this._statusLabels[1], 60 * sX, cH - 100 * sY);
        ctx.textAlign = 'right';
        ctx.fillStyle = p.teal;
        ctx.fillText(this._statusLabels[2], cW - 62 * sX, 58 * sY);
        ctx.fillStyle = p.green;
        ctx.fillText(this._statusLabels[3], cW - 52 * sX, cH - 104 * sY);
        ctx.restore();
    }

    _drawTitleBlock(ctx, cW, cH, sX, sY, tick) {
        const intro = this._introProgress(tick);
        const exit = this._exitProgress(tick);
        const glitch = tick >= 130 && tick < 170 ? Math.sin((tick - 130) / 40 * Math.PI) : 0;
        const pulse = 0.5 + 0.5 * Math.sin(tick * 0.075);
        const p = this._palette;
        const x = cW * 0.5 + (1 - intro) * -220 * sX + exit * 260 * sX;
        const y = cH * 0.48 + (1 - intro) * 36 * sY - exit * 28 * sY;
        const w = Math.min(cW * 0.78, 760 * sX);
        const h = 124 * sY;
        const skew = 62 * sX;
        const jitterX = glitch > 0 ? Math.sin(tick * 2.7) * 7 * sX * glitch : 0;
        const jitterY = glitch > 0 ? Math.cos(tick * 2.1) * 3 * sY * glitch : 0;
        const alpha = intro * (1 - exit * 0.96);

        if (alpha <= 0) return;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x + jitterX, y + jitterY);
        ctx.rotate((-4 + exit * 2) * Math.PI / 180);

        ctx.fillStyle = 'rgba(0,0,0,0.76)';
        this._slantedRect(ctx, -w / 2 + 18 * sX, -h / 2 + 18 * sY, w, h, skew);
        ctx.fill();

        const band = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
        band.addColorStop(0, 'rgba(92,16,30,0.78)');
        band.addColorStop(0.13, 'rgba(53,102,69,0.64)');
        band.addColorStop(0.30, 'rgba(3,13,16,0.98)');
        band.addColorStop(1, 'rgba(1,7,10,0.86)');
        ctx.fillStyle = band;
        this._slantedRect(ctx, -w / 2, -h / 2, w, h, skew);
        ctx.fill();

        ctx.strokeStyle = p.stroke;
        ctx.lineWidth = Math.max(1, 2.2 * sX);
        this._slantedRect(ctx, -w / 2, -h / 2, w, h, skew);
        ctx.stroke();

        ctx.save();
        this._slantedRect(ctx, -w / 2, -h / 2, w, h, skew);
        ctx.clip();
        for (let gy = -h / 2 + ((tick * 0.9) % (8 * sY)); gy < h / 2; gy += 8 * sY) {
            ctx.fillStyle = 'rgba(116,178,151,0.045)';
            ctx.fillRect(-w / 2, gy, w, Math.max(1, 1.3 * sY));
        }
        const scanX = -w + ((tick * 7) % (w * 1.5));
        ctx.fillStyle = 'rgba(105,177,131,' + (0.08 + pulse * 0.05) + ')';
        ctx.transform(1, 0, -0.30, 1, 0, 0);
        ctx.fillRect(scanX, -h, 44 * sX, h * 2.2);
        ctx.restore();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const titleFont = this._titleFont();
        const titleNumberFont = this._titleNumberFont();
        const titleSize = this._fitMixedTitleFontSize(ctx, this._stageName, titleFont, titleNumberFont, Math.round(62 * sX), w * 0.78);

        ctx.shadowColor = 'rgba(0,0,0,0.92)';
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(0,0,0,0.88)';
        this._drawMixedTitleText(ctx, this._stageName, 7 * sX, -7 * sY, titleSize, titleFont, titleNumberFont);

        if (glitch > 0) {
            ctx.save();
            ctx.globalAlpha = glitch * 0.72;
            ctx.fillStyle = p.titleRed;
            this._drawMixedTitleText(ctx, this._stageName, 10 * sX, -2 * sY, titleSize, titleFont, titleNumberFont);
            ctx.fillStyle = p.titleTeal;
            this._drawMixedTitleText(ctx, this._stageName, -10 * sX, 2 * sY, titleSize, titleFont, titleNumberFont);
            ctx.restore();
        }

        ctx.shadowColor = p.titleGlow;
        ctx.shadowBlur = 12 * sX;
        ctx.fillStyle = p.text;
        this._drawMixedTitleText(ctx, this._stageName, 0, -3 * sY, titleSize, titleFont, titleNumberFont);
        ctx.shadowBlur = 0;

        const subW = Math.min(w * 0.58, 480 * sX);
        const subH = 40 * sY;
        const subX = -subW / 2 + 26 * sX;
        const subY = h / 2 - 8 * sY;
        ctx.fillStyle = 'rgba(44,124,111,0.86)';
        this._slantedRect(ctx, subX, subY, subW, subH, 22 * sX);
        ctx.fill();
        ctx.fillStyle = '#03100B';
        ctx.font = 'bold ' + Math.round(20 * sX) + 'px ' + this._bodyFont();
        ctx.fillText(this._levelName, subX + subW / 2, subY + subH / 2 + 1 * sY);

        ctx.fillStyle = p.deadAmber;
        ctx.fillRect(-w / 2 + 20 * sX, -h / 2 + 14 * sY, 92 * sX, 8 * sY);
        ctx.fillStyle = p.warning;
        ctx.fillRect(w / 2 - 132 * sX, h / 2 - 20 * sY, 112 * sX, 8 * sY);

        ctx.restore();
    }

    _drawGlitchPass(ctx, cW, cH, sX, sY, tick) {
        if (tick < 130 || tick >= 170) return;
        const intensity = Math.sin((tick - 130) / 40 * Math.PI);
        const p = this._palette;
        if (intensity <= 0) return;

        ctx.save();
        for (let i = 0; i < this._glitchSlices.length; i++) {
            const slice = this._glitchSlices[i];
            if (((tick + slice.delay) % 7) > 3) continue;
            const y = slice.y * cH;
            const h = Math.max(2, slice.h * cH);
            const dx = slice.dx * sX * intensity;
            ctx.globalAlpha = 0.22 * intensity;
            ctx.drawImage(ctx.canvas, 0, y, cW, h, dx, y, cW, h);
            ctx.globalCompositeOperation = 'screen';
            ctx.fillStyle = i % 2 === 0 ? p.pixelRed : p.pixelTeal;
            ctx.fillRect(Math.min(0, dx), y, cW + Math.abs(dx), h);
            ctx.globalCompositeOperation = 'source-over';
        }

        this._drawPixelFragments(ctx, cW, cH, sX, sY, tick, intensity, 'title');

        ctx.globalAlpha = 0.26 * intensity;
        ctx.strokeStyle = p.green;
        ctx.lineWidth = Math.max(1, 2 * sX);
        for (let i = 0; i < 5; i++) {
            const y = cH * (0.28 + i * 0.09) + Math.sin(tick + i) * 8 * sY;
            ctx.beginPath();
            ctx.moveTo(cW * 0.18, y);
            ctx.lineTo(cW * 0.82, y - 28 * sY);
            ctx.stroke();
        }
        ctx.restore();
    }

    _drawExitWipe(ctx, cW, cH, sX, sY, tick) {
        if (tick < 170) return;
        const exit = this._exitProgress(tick);
        const p = this._palette;
        if (exit <= 0) return;

        ctx.save();
        const wipeW = cW * (0.18 + exit * 1.18);
        const x = -cW * 0.15 + exit * cW * 1.15;
        ctx.globalAlpha = Math.min(1, exit * 1.2);

        const wipe = ctx.createLinearGradient(x - wipeW, 0, x + wipeW, 0);
        wipe.addColorStop(0, 'rgba(0,0,0,0)');
        wipe.addColorStop(0.25, 'rgba(1,8,10,0.82)');
        wipe.addColorStop(0.44, 'rgba(22,86,70,0.58)');
        wipe.addColorStop(0.60, 'rgba(104,18,34,0.34)');
        wipe.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = wipe;
        this._slantedRect(ctx, x - wipeW, -40 * sY, wipeW * 1.3, cH + 80 * sY, 180 * sX);
        ctx.fill();

        this._drawPixelFragments(ctx, cW, cH, sX, sY, tick, exit, 'exit');

        ctx.globalAlpha = Math.max(0, (exit - 0.48) * 1.4);
        ctx.fillStyle = p.void;
        ctx.fillRect(0, 0, cW, cH);
        ctx.restore();
    }

    _drawPixelFragments(ctx, cW, cH, sX, sY, tick, intensity, mode) {
        const p = this._palette;
        const clamped = Math.max(0, Math.min(1, intensity));
        const count = mode === 'exit' ? 28 : 18;
        const yMin = mode === 'exit' ? 0.08 : 0.30;
        const yRange = mode === 'exit' ? 0.84 : 0.38;

        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (let i = 0; i < count; i++) {
            const gate = (tick * (i + 3) + i * 19) % 47;
            if (gate > 20 + clamped * 18) continue;

            const x = (((i * 83 + tick * (mode === 'exit' ? 13 : 9)) % 1000) / 1000) * cW;
            const y = (yMin + (((i * 137 + tick * 5) % 1000) / 1000) * yRange) * cH;
            const w = (8 + (i % 5) * 11) * sX * (0.7 + clamped * 0.8);
            const h = (3 + (i % 3) * 4) * sY;
            const palette = i % 5 === 0 ? p.pixelRed : (i % 2 === 0 ? p.pixelGreen : p.pixelTeal);

            ctx.globalAlpha = (0.16 + clamped * 0.28) * (mode === 'exit' ? 1.15 : 1);
            ctx.fillStyle = palette;
            ctx.fillRect(x, y, w, h);

            if (i % 4 === 0) {
                ctx.globalAlpha *= 0.55;
                ctx.fillRect(x - 18 * sX, y + 7 * sY, w * 0.55, Math.max(1, h * 0.55));
            }
        }
        ctx.restore();
    }

    _slantedRect(ctx, x, y, w, h, skew) {
        ctx.beginPath();
        ctx.moveTo(x + skew, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - skew, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
    }

    _titleGlyphFont(ch, titleFont, numberFont) {
        return /[0-9]/.test(ch) ? numberFont : titleFont;
    }

    _setTitleGlyphFont(ctx, size, font) {
        ctx.font = 'bold ' + Math.round(size) + 'px ' + font;
    }

    _measureMixedTitle(ctx, text, titleFont, numberFont, size) {
        let width = 0;
        for (let i = 0; i < text.length; i++) {
            this._setTitleGlyphFont(ctx, size, this._titleGlyphFont(text[i], titleFont, numberFont));
            width += ctx.measureText(text[i]).width;
        }
        return width;
    }

    _fitMixedTitleFontSize(ctx, text, titleFont, numberFont, size, maxWidth) {
        let next = Math.max(18, Number(size) || 48);
        while (next > 18) {
            if (this._measureMixedTitle(ctx, text, titleFont, numberFont, next) <= maxWidth) break;
            next -= 2;
        }
        return Math.round(next);
    }

    _drawMixedTitleText(ctx, text, x, y, size, titleFont, numberFont) {
        const oldAlign = ctx.textAlign;
        const totalWidth = this._measureMixedTitle(ctx, text, titleFont, numberFont, size);
        let cursor = x - totalWidth / 2;

        ctx.textAlign = 'left';
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            this._setTitleGlyphFont(ctx, size, this._titleGlyphFont(ch, titleFont, numberFont));
            ctx.fillText(ch, cursor, y);
            cursor += ctx.measureText(ch).width;
        }
        ctx.textAlign = oldAlign;
    }

    _fitFontSize(ctx, text, font, size, maxWidth) {
        let next = Math.max(18, Number(size) || 48);
        while (next > 18) {
            ctx.font = 'bold ' + Math.round(next) + 'px ' + font;
            if (ctx.measureText(text).width <= maxWidth) break;
            next -= 2;
        }
        return Math.round(next);
    }
}

// Global instance
IP2Live.WorldTitleOverlay = new IP2LiveWorldTitle();

if (!Scene.Map.prototype._ip2liveWorldTitleInjected) {
    Scene.Map.prototype._ip2liveWorldTitleInjected = true;

    // Hook into Scene.Map.prototype.initialize to start the title screen
    const originalMapInit = Scene.Map.prototype.initialize;
    Scene.Map.prototype.initialize = function (mapID) {
        originalMapInit.call(this, mapID);
        const resolvedMapId = Number(mapID) || Number(this && (this.id || this.mapID)) || 0;
        if (this._ip2liveWorldTitleStartedForMapId === resolvedMapId) return;
        this._ip2liveWorldTitleStartedForMapId = resolvedMapId;

        if (IP2Live.GameManager && typeof IP2Live.GameManager.startWorldTitleForMap === 'function') {
            IP2Live.GameManager.startWorldTitleForMap(resolvedMapId, { scene: this });
        } else if (IP2Live.WorldTitleOverlay) {
            IP2Live.WorldTitleOverlay.start(resolvedMapId);
        }
    };

    // Hook into Scene.Map.prototype.drawHUD to render the title screen
    const originalMapDrawHUD = Scene.Map.prototype.drawHUD;
    Scene.Map.prototype.drawHUD = function () {
        originalMapDrawHUD.call(this);
        if (IP2Live.WorldTitleOverlay && IP2Live.WorldTitleOverlay.isActive()) {
            IP2Live.WorldTitleOverlay.drawHUD(Common.Platform.ctx);
        }
    };

    // Hook into Scene.Map.prototype.update to tick the title screen
    const originalMapUpdateWT = Scene.Map.prototype.update;
    Scene.Map.prototype.update = function () {
        if (IP2Live.WorldTitleOverlay && IP2Live.WorldTitleOverlay.isActive()) {
            IP2Live.WorldTitleOverlay.update();
        }
        originalMapUpdateWT.call(this);
    };
}

console.log('[IP2Live] world-title.js loaded.');
