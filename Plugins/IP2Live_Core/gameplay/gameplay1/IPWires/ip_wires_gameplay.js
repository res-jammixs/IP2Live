/**
 * IP2Live - Gameplay1 IP Wires
 *
 * Stage 1 Level 1 IP class wires gameplay with guided tutorial support.
 */

(function () {
    const core = IP2Live.IPWiresCore || {};

    function classSpecs() {
        return typeof core.cloneClassSpecs === 'function' ? core.cloneClassSpecs() : [];
    }

    function classSpec(className) {
        if (typeof core.specByClassName === 'function') return core.specByClassName(className);
        const specs = classSpecs();
        for (let i = 0; i < specs.length; i++) if (specs[i].className === className) return specs[i];
        return null;
    }

    function shuffle(items) {
        return typeof core.shuffle === 'function' ? core.shuffle(items) : (Array.isArray(items) ? items.slice() : []);
    }

    function orderedClassSpecs(items) {
        return (Array.isArray(items) ? items.slice() : []).sort(function (a, b) {
            const left = String((a && a.className) || '');
            const right = String((b && b.className) || '');
            if (left < right) return -1;
            if (left > right) return 1;
            return 0;
        });
    }

    class IP2LiveWiresGameplayScreen extends Scene.Base {
        constructor(options) {
            super(true);
            this.options = options || {};
            this.maxAttempts = Math.max(1, Number(this.options.maxAttempts) || 3);
            this.allowDuplicateTargets = !!this.options.allowDuplicateTargets;
            this.mode = this.options.mode || 'default';
            this.gameplayId = this.options.gameplayId || 'ip_class_wires';
            this.classSpecs = classSpecs();
            this._ensurePuzzleReady();
        }

        initialize() {
            this.options = this.options || {};
            if (!Array.isArray(this.classSpecs) || !this.classSpecs.length) this.classSpecs = classSpecs();
            if (!this.mode) this.mode = this.options.mode || 'default';
            if (!this.gameplayId) this.gameplayId = this.options.gameplayId || 'ip_class_wires';
            this._resetPuzzleState();
        }

        _resetPuzzleState() {
            this.options = this.options || {};
            if (!Array.isArray(this.classSpecs) || !this.classSpecs.length) this.classSpecs = classSpecs();
            if (!this.mode) this.mode = this.options.mode || 'default';
            if (!this.gameplayId) this.gameplayId = this.options.gameplayId || 'ip_class_wires';
            this.animTick = 0;
            this.scanlineOffset = 0;
            this.connections = {};
            this.lockedCorrect = {};
            this.wrongConnections = {};
            this.dragging = null;
            this.sparks = [];
            this.failedWires = [];
            this.failFlash = 0;
            this.verdictTimer = 0;
            this.pendingMistakeDialogue = null;
            this.pendingFailureExit = null;
            this.attemptsUsed = 0;
            this.maxAttempts = Math.max(1, Number(this.options.maxAttempts) || 3);
            this.completed = false;
            this.completedAt = 0;
            this._finished = false;

            const puzzle = this._generatePuzzle();
            this.leftItems = shuffle(puzzle.map((entry) => Object.assign({}, entry)));
            this.rightItems = this._buildRightConnectors();
            this.leftCount = this.leftItems.length;
            this.rightCount = this.rightItems.length;
        }

        _ensurePuzzleReady() {
            if (!Array.isArray(this.leftItems) || !this.leftItems.length || !Array.isArray(this.rightItems) || !this.rightItems.length) {
                this._resetPuzzleState();
            }
        }

        async load() {
            if (IP2Live.Assets && typeof IP2Live.Assets.loadAll === 'function' && !IP2Live.Assets.nebulaLoaded) {
                try {
                    await IP2Live.Assets.loadAll();
                } catch (e) {
                    console.warn('[IP2Live] Wires gameplay asset warmup failed:', e);
                }
            }
            this.loading = false;
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        }

        update() {
            this.animTick++;
            this.scanlineOffset = (this.scanlineOffset + 0.55) % 4;
            for (let i = this.sparks.length - 1; i >= 0; i--) {
                this.sparks[i].life--;
                if (this.sparks[i].life <= 0) this.sparks.splice(i, 1);
            }
            for (let i = this.failedWires.length - 1; i >= 0; i--) {
                this.failedWires[i].life--;
                if (this.failedWires[i].life <= 0) this.failedWires.splice(i, 1);
            }
            if (this.failFlash > 0) this.failFlash--;
            if (this.verdictTimer > 0) {
                this.verdictTimer--;
                if (this.verdictTimer === 0) this._resolveFailedVerdict();
            }
            const dialogueActive = IP2Live.DialogueManager && IP2Live.DialogueManager.isActive && IP2Live.DialogueManager.isActive();
            if (this.completed && this.completedAt && Date.now() - this.completedAt > 650 && !dialogueActive) {
                this._finish();
            }
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        }

        draw3D() {
            if (Manager && Manager.GL && Manager.GL.renderer) Manager.GL.renderer.clear();
        }

        onKeyPressed(key) {
            if (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive()) return true;
            if (Data.Keyboards.checkCancelMenu && Data.Keyboards.checkCancelMenu(key)) {
                this._cancel();
                return true;
            }
            return true;
        }

        onMouseDown(x, y) {
            if (this.completed || this.verdictTimer > 0 || (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive())) return true;
            this._ensurePuzzleReady();
            this.mouse = { x, y };
            const layout = this._layout();
            const expectedSourceId = IP2Live.IPWiresTutorial && typeof IP2Live.IPWiresTutorial.expectedGuidedSourceId === 'function'
                ? IP2Live.IPWiresTutorial.expectedGuidedSourceId(this)
                : null;
            for (let i = 0; i < this.leftItems.length; i++) {
                const item = this.leftItems[i];
                if (this.lockedCorrect[item.id]) continue;
                if (expectedSourceId && item.id !== expectedSourceId) continue;
                const p = layout.leftPoints[item.id];
                if (this._distance(x, y, p.x, p.y) <= p.r * 1.35) {
                    delete this.connections[item.id];
                    this.dragging = { sourceId: item.id, from: p };
                    this._playCursor();
                    if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
                    return true;
                }
            }
            return true;
        }

        onMouseMove(x, y) {
            this.mouse = { x, y };
            if (this.dragging && Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            return true;
        }

        onMouseUp(x, y) {
            this.mouse = { x, y };
            this._ensurePuzzleReady();
            if (!this.dragging || this.completed || this.verdictTimer > 0) return true;

            const sourceId = this.dragging.sourceId;
            const sourceItem = this._itemById(this.leftItems, sourceId);
            if (!sourceItem) {
                this.dragging = null;
                return true;
            }

            const layout = this._layout();
            let targetClass = null;

            for (let i = 0; i < this.rightItems.length; i++) {
                const candidate = this.rightItems[i];
                const p = layout.rightPoints[candidate.className];
                if (this._distance(x, y, p.x, p.y) <= p.r * 1.45) {
                    targetClass = candidate.className;
                    break;
                }
            }

            if (!targetClass) {
                this.dragging = null;
                this._playCancel();
                return true;
            }

            const expectedClass = IP2Live.IPWiresTutorial && typeof IP2Live.IPWiresTutorial.expectedGuidedClass === 'function'
                ? IP2Live.IPWiresTutorial.expectedGuidedClass(this)
                : null;
            if (expectedClass && sourceItem.className !== expectedClass) {
                this.dragging = null;
                this._playCancel();
                return true;
            }
            if (expectedClass && targetClass !== expectedClass) {
                if (IP2Live.IPWiresTutorial && typeof IP2Live.IPWiresTutorial.onGuidedWrongTarget === 'function') {
                    IP2Live.IPWiresTutorial.onGuidedWrongTarget(this, sourceItem, targetClass);
                }
                this.dragging = null;
                this._playCancel();
                return true;
            }

            if (!this.allowDuplicateTargets) this._clearTargetConnection(targetClass);
            this.connections[sourceId] = targetClass;
            this._playConfirm();

            if (sourceItem.className === targetClass && expectedClass && IP2Live.IPWiresTutorial && typeof IP2Live.IPWiresTutorial.onGuidedCorrectConnection === 'function') {
                IP2Live.IPWiresTutorial.onGuidedCorrectConnection(this, sourceItem);
            }

            if (this._allConnected()) this._evaluateConnections();

            this.dragging = null;
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            return true;
        }

        drawHUD() {
            const ctx = Common.Platform.ctx;
            if (!ctx) return;

            this._ensurePuzzleReady();
            const layout = this._layout();
            const cW = ctx.canvas.width;
            const cH = ctx.canvas.height;
            const sX = layout.sX;
            const sY = layout.sY;
            const font = IP2Live.Assets && IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace';
            const titleFont = IP2Live.Assets && IP2Live.Assets.abnesLoaded ? 'Abnes' : 'Arial Black';

            ctx.save();
            if (this.failFlash > 0) {
                const shake = Math.sin(this.animTick * 2.7) * this.failFlash * 0.55 * sX;
                ctx.translate(shake, -shake * 0.45);
            }
            this._drawBackground(ctx, cW, cH, sX, sY);
            this._drawPanel(ctx, layout, font, titleFont);
            this._drawConnections(ctx, layout);
            this._drawFailedWire(ctx, layout);
            this._drawDragWire(ctx, layout);
            this._drawTerminals(ctx, layout, font);
            for (let i = 0; i < this.sparks.length; i++) this._drawSpark(ctx, this.sparks[i], sX);
            if (IP2Live.IPWiresTutorial && typeof IP2Live.IPWiresTutorial.drawGuidedHighlight === 'function') {
                IP2Live.IPWiresTutorial.drawGuidedHighlight(ctx, layout, this);
            }
            if (this.completed) this._drawCompleteOverlay(ctx, layout, font);
            ctx.restore();
            this._drawFailureOverlay(ctx, cW, cH);
            if (IP2Live.DialogueManager && typeof IP2Live.DialogueManager.drawOverlay === 'function') {
                IP2Live.DialogueManager.drawOverlay(ctx);
            }
        }

        _drawBackground(ctx, cW, cH, sX, sY) {
            const tick = this.animTick || 0;
            const bg = ctx.createLinearGradient(0, 0, cW, cH);
            bg.addColorStop(0, '#05070D');
            bg.addColorStop(0.45, '#101217');
            bg.addColorStop(1, '#05070D');
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, cW, cH);

            ctx.globalAlpha = 0.07;
            ctx.strokeStyle = '#00F0FF';
            ctx.lineWidth = Math.max(1, sX);
            const gap = 44 * sX;
            for (let x = -gap + ((tick * 0.3) % gap); x < cW + gap; x += gap) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x + cH * 0.28, cH);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;

            ctx.globalAlpha = 0.08;
            ctx.fillStyle = '#000000';
            for (let y = this.scanlineOffset * sY; y < cH; y += 4 * sY) {
                ctx.fillRect(0, y, cW, Math.max(1, 1.4 * sY));
            }
            ctx.globalAlpha = 1;
        }

        _drawPanel(ctx, layout, font, titleFont) {
            const p = layout.panel;
            const sl = 34 * layout.sX;
            ctx.save();

            ctx.beginPath();
            ctx.moveTo(p.x + sl, p.y);
            ctx.lineTo(p.x + p.w, p.y);
            ctx.lineTo(p.x + p.w - sl, p.y + p.h);
            ctx.lineTo(p.x, p.y + p.h);
            ctx.lineTo(p.x, p.y + sl);
            ctx.closePath();
            ctx.fillStyle = 'rgba(8,10,14,0.96)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,240,255,0.54)';
            ctx.lineWidth = 2 * layout.sX;
            ctx.stroke();

            const midX = p.x + p.w / 2;
            ctx.fillStyle = 'rgba(0,0,0,0.38)';
            ctx.fillRect(midX - 10 * layout.sX, p.y + 90 * layout.sY, 20 * layout.sX, p.h - 120 * layout.sY);

            ctx.fillStyle = '#FF003C';
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x + 250 * layout.sX, p.y);
            ctx.lineTo(p.x + 212 * layout.sX, p.y + 46 * layout.sY);
            ctx.lineTo(p.x, p.y + 60 * layout.sY);
            ctx.closePath();
            ctx.fill();

            ctx.font = 'bold ' + Math.round(24 * layout.sX) + 'px ' + titleFont;
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'left';
            const modeText = this.mode === 'harder' ? 'NETWORK PATCH // HARDER' : 'NETWORK PATCH';
            ctx.fillText(modeText, p.x + 24 * layout.sX, p.y + 37 * layout.sY);

            ctx.font = Math.round(9 * layout.sX) + 'px monospace';
            ctx.fillStyle = 'rgba(0,240,255,0.78)';
            ctx.textAlign = 'right';
            ctx.fillText('SYS::IP_CLASS_ROUTER // LIVE', p.x + p.w - 26 * layout.sX, p.y + 30 * layout.sY);
            ctx.fillStyle = this.attemptsUsed > 0 ? '#FFE600' : 'rgba(218,238,255,0.70)';
            ctx.fillText(
                'CHANCES ' + Math.max(0, this.maxAttempts - this.attemptsUsed) + '/' + this.maxAttempts,
                p.x + p.w - 26 * layout.sX,
                p.y + 48 * layout.sY
            );

            ctx.font = 'bold ' + Math.round(12 * layout.sX) + 'px ' + font;
            ctx.fillStyle = '#DAEEFF';
            ctx.textAlign = 'left';
            ctx.fillText('IP ADDRESSES', p.x + 32 * layout.sX, p.y + 86 * layout.sY);
            ctx.textAlign = 'right';
            ctx.fillText('CLASS CONNECTORS', p.x + p.w - 32 * layout.sX, p.y + 86 * layout.sY);
            ctx.restore();
        }

        _drawTerminals(ctx, layout, font) {
            const showClassRangeHints = !!(this.options && this.options.guidedTutorial);
            for (let i = 0; i < this.leftItems.length; i++) {
                const item = this.leftItems[i];
                const p = layout.leftPoints[item.id];
                this._drawTerminal(ctx, p, item.ip, item.color, font, false, !!this.lockedCorrect[item.id], null);
            }
            for (let i = 0; i < this.rightItems.length; i++) {
                const item = this.rightItems[i];
                const p = layout.rightPoints[item.className];
                this._drawTerminal(ctx, p, 'Class ' + item.className, item.color, font, true, false, showClassRangeHints ? item.shortRange : null);
            }
        }

        _drawTerminal(ctx, point, label, color, font, rightSide, connected, subLabel) {
            const sX = point.sX;
            const sY = point.sY;
            const activeColor = connected ? color : '#8B96A3';
            const density = Number(point.density || 0);
            const isDense = density >= 1;
            const isVeryDense = density >= 2;
            const tagW = rightSide ? (isVeryDense ? 194 * sX : 206 * sX) : (isVeryDense ? 224 * sX : 238 * sX);
            const tagH = (isVeryDense ? 40 : (isDense ? 42 : 46)) * sY;
            const tagX = rightSide ? point.x + 22 * sX : point.x - tagW - 22 * sX;
            const tagY = point.y - tagH / 2;
            const capW = 34 * sX;

            ctx.save();
            ctx.shadowColor = connected ? color : 'transparent';
            ctx.shadowBlur = connected ? 14 * sX : 0;
            ctx.fillStyle = 'rgba(0,0,0,0.42)';
            ctx.fillRect(tagX + (rightSide ? 4 * sX : -4 * sX), tagY + 5 * sY, tagW, tagH);

            ctx.fillStyle = 'rgba(25,28,34,0.96)';
            ctx.fillRect(tagX, tagY, tagW, tagH);
            ctx.strokeStyle = connected ? color : 'rgba(255,255,255,0.22)';
            ctx.lineWidth = 1.5 * sX;
            ctx.strokeRect(tagX, tagY, tagW, tagH);

            ctx.fillStyle = connected ? color : 'rgba(126,137,149,0.72)';
            if (rightSide) ctx.fillRect(tagX + tagW - capW, tagY, capW, tagH);
            else ctx.fillRect(tagX, tagY, capW, tagH);

            ctx.font = 'bold ' + Math.round((isVeryDense ? 11.5 : 13) * sX) + 'px ' + font;
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, tagX + tagW / 2, point.y - (subLabel ? 6 * sY : 0));
            if (subLabel) {
                ctx.font = Math.round((isVeryDense ? 7 : 8) * sX) + 'px monospace';
                ctx.fillStyle = 'rgba(218,238,255,0.76)';
                ctx.fillText('Range: ' + subLabel, tagX + tagW / 2, point.y + 10 * sY);
            }

            ctx.beginPath();
            ctx.arc(point.x, point.y, point.r, 0, Math.PI * 2);
            ctx.fillStyle = '#0B0D11';
            ctx.fill();
            ctx.strokeStyle = activeColor;
            ctx.lineWidth = 4 * sX;
            ctx.stroke();

            ctx.strokeStyle = 'rgba(190,104,48,0.95)';
            ctx.lineWidth = 2 * sX;
            const strandDir = rightSide ? -1 : 1;
            for (let i = -2; i <= 2; i++) {
                ctx.beginPath();
                ctx.moveTo(point.x + strandDir * point.r * 0.72, point.y + i * 2.4 * sY);
                ctx.lineTo(point.x + strandDir * (point.r + 15 * sX), point.y + i * 4.2 * sY);
                ctx.stroke();
            }

            ctx.beginPath();
            ctx.arc(point.x, point.y, Math.max(3 * sX, point.r * 0.36), 0, Math.PI * 2);
            ctx.fillStyle = connected ? color : 'rgba(255,255,255,0.30)';
            ctx.fill();
            ctx.restore();
        }

        _drawConnections(ctx, layout) {
            for (let i = 0; i < this.leftItems.length; i++) {
                const source = this.leftItems[i];
                const targetClass = this.connections[source.id];
                if (!targetClass) continue;
                const from = layout.leftPoints[source.id];
                const to = layout.rightPoints[targetClass];
                if (!to) continue;
                if (this.wrongConnections[source.id]) {
                    this._drawGradientWire(ctx, from.x, from.y, to.x, to.y, 8 * layout.sX, 1, [source.color, this._classColor(targetClass)]);
                } else if (this.lockedCorrect[source.id]) {
                    this._drawWire(ctx, from.x, from.y, to.x, to.y, source.color, 7 * layout.sX, true);
                } else {
                    this._drawWire(ctx, from.x, from.y, to.x, to.y, '#AEB7C2', 6 * layout.sX, false);
                }
            }
        }

        _drawDragWire(ctx, layout) {
            if (!this.dragging) return;
            const source = this._itemById(this.leftItems, this.dragging.sourceId);
            if (!source) return;
            const from = layout.leftPoints[source.id];
            this._drawWire(ctx, from.x, from.y, this.mouse.x, this.mouse.y, '#AEB7C2', 7 * layout.sX, false);
        }

        _drawFailedWire(ctx, layout) {
            if (!this.failedWires || this.failedWires.length === 0) return;
            for (let i = 0; i < this.failedWires.length; i++) {
                const fail = this.failedWires[i];
                const ratio = Math.max(0, fail.life / fail.maxLife);
                const pullBack = 1 - ratio;
                const toX = fail.toX + (fail.fromX - fail.toX) * pullBack * 0.45;
                const toY = fail.toY + (fail.fromY - fail.toY) * pullBack * 0.45;
                const width = 9 * layout.sX * (0.6 + ratio * 0.5);
                this._drawGradientWire(ctx, fail.fromX, fail.fromY, toX, toY, width, ratio, fail.colors);
            }
        }

        _drawWire(ctx, x1, y1, x2, y2, color, width, energized) {
            const dx = Math.abs(x2 - x1);
            const c1x = x1 + dx * 0.46;
            const c2x = x2 - dx * 0.46;
            const sag = Math.min(80, dx * 0.08);

            ctx.save();
            ctx.lineCap = 'round';
            ctx.shadowColor = energized ? color : 'transparent';
            ctx.shadowBlur = energized ? width * 1.2 : 0;
            ctx.strokeStyle = 'rgba(0,0,0,0.68)';
            ctx.lineWidth = width + 5;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.bezierCurveTo(c1x, y1 + sag, c2x, y2 + sag, x2, y2);
            ctx.stroke();

            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.bezierCurveTo(c1x, y1 + sag, c2x, y2 + sag, x2, y2);
            ctx.stroke();
            ctx.restore();
        }

        _drawGradientWire(ctx, x1, y1, x2, y2, width, alpha, colorPair) {
            const dx = Math.abs(x2 - x1);
            const c1x = x1 + dx * 0.46;
            const c2x = x2 - dx * 0.46;
            const sag = Math.min(80, dx * 0.08);
            const pair = colorPair && colorPair.length ? colorPair : ['#FFE600', '#2455FF'];
            ctx.save();
            ctx.globalAlpha = Math.max(0.15, alpha);
            ctx.lineCap = 'round';
            ctx.strokeStyle = 'rgba(0,0,0,0.76)';
            ctx.lineWidth = width + 7;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.bezierCurveTo(c1x, y1 + sag, c2x, y2 + sag, x2, y2);
            ctx.stroke();

            const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
            gradient.addColorStop(0, pair[0]);
            gradient.addColorStop(1, pair[1] || pair[0]);
            ctx.strokeStyle = gradient;
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.bezierCurveTo(c1x, y1 + sag, c2x, y2 + sag, x2, y2);
            ctx.stroke();
            ctx.restore();
        }

        _drawSpark(ctx, spark, sX) {
            const lifeRatio = Math.max(0, spark.life / 24);
            const rays = 14;
            ctx.save();
            ctx.translate(spark.x, spark.y);
            ctx.globalAlpha = lifeRatio;
            ctx.lineWidth = 2 * sX;
            ctx.shadowColor = spark.color || '#FF003C';
            ctx.shadowBlur = 18 * sX;
            for (let i = 0; i < rays; i++) {
                const a = i * Math.PI * 2 / rays + this.animTick * 0.18;
                const r1 = 4 * sX;
                const r2 = (16 + (i % 4) * 8) * sX * (1.15 - lifeRatio * 0.25);
                ctx.strokeStyle = i % 2 === 0 ? '#FFE600' : (spark.color || '#FF003C');
                ctx.beginPath();
                ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
                ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
                ctx.stroke();
            }
            ctx.restore();
        }

        _drawFailureOverlay(ctx, cW, cH) {
            if (this.failFlash <= 0) return;
            const alpha = Math.min(0.26, this.failFlash / 18 * 0.26);
            ctx.save();
            ctx.fillStyle = 'rgba(255,0,60,' + alpha + ')';
            ctx.fillRect(0, 0, cW, cH);
            ctx.strokeStyle = 'rgba(255,0,60,' + Math.min(0.8, alpha * 3) + ')';
            ctx.lineWidth = 8;
            ctx.strokeRect(4, 4, cW - 8, cH - 8);
            ctx.restore();
        }

        _drawCompleteOverlay(ctx, layout, font) {
            const p = layout.panel;
            const tick = this.animTick || 0;
            const pulse = 0.5 + 0.5 * Math.sin(tick * 0.14);
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.30)';
            ctx.fillRect(p.x, p.y, p.w, p.h);
            ctx.textAlign = 'center';
            ctx.font = 'bold ' + Math.round(30 * layout.sX) + 'px ' + font;
            ctx.fillStyle = '#00F0FF';
            ctx.shadowColor = '#00F0FF';
            ctx.shadowBlur = 12 + pulse * 10;
            ctx.fillText('PATCH COMPLETE', p.x + p.w / 2, p.y + p.h - 48 * layout.sY);
            ctx.restore();
        }

        _layout() {
            const ctx = Common.Platform.ctx;
            const cW = ctx.canvas.width;
            const cH = ctx.canvas.height;
            const SW = Common.ScreenResolution.SCREEN_X;
            const SH = Common.ScreenResolution.SCREEN_Y;
            const sX = cW / SW;
            const sY = cH / SH;
            const panel = {
                x: Math.max(22 * sX, cW * 0.06),
                y: Math.max(18 * sY, cH * 0.06),
                w: Math.min(cW * 0.9, 1160 * sX),
                h: Math.min(cH * 0.88, 680 * sY),
            };
            panel.x = (cW - panel.w) / 2;
            panel.y = (cH - panel.h) / 2;

            const leftX = panel.x + Math.max(245 * sX, panel.w * 0.23);
            const rightX = panel.x + panel.w - Math.max(235 * sX, panel.w * 0.23);
            const rowCount = Math.max(this.leftCount || 0, this.rightCount || 0);
            const density = rowCount >= 8 ? 2 : (rowCount >= 7 ? 1 : 0);
            const topPad = density >= 1 ? 132 : 146;
            const bottomPad = density >= 1 ? 94 : 104;
            const topY = panel.y + topPad * sY;
            const bottomY = panel.y + panel.h - bottomPad * sY;
            const leftPoints = {};
            const rightPoints = {};
            const leftGap = this.leftCount > 1 ? (bottomY - topY) / (this.leftCount - 1) : 0;
            const rightGap = this.rightCount > 1 ? (bottomY - topY) / (this.rightCount - 1) : 0;
            const radius = Math.max((density >= 2 ? 9 : 11) * sX, density >= 2 ? 8 : 10);

            for (let i = 0; i < this.leftItems.length; i++) {
                leftPoints[this.leftItems[i].id] = {
                    x: leftX,
                    y: topY + leftGap * i,
                    r: radius,
                    sX: sX,
                    sY: sY,
                    density: density,
                };
            }
            for (let i = 0; i < this.rightItems.length; i++) {
                rightPoints[this.rightItems[i].className] = {
                    x: rightX,
                    y: topY + rightGap * i,
                    r: radius,
                    sX: sX,
                    sY: sY,
                    density: density,
                };
            }

            return { cW, cH, sX, sY, panel, leftX, rightX, topY, bottomY, leftPoints, rightPoints };
        }

        _isHarderMode() {
            return String(this.mode || '').toLowerCase() === 'harder';
        }

        _resolveWireCount() {
            if (!this._isHarderMode()) return 5;
            if (typeof core.clampWireCount === 'function') return core.clampWireCount(this.options.wireCount, 8);
            const raw = Number(this.options.wireCount);
            const normalized = Number.isFinite(raw) ? raw : 8;
            return Math.max(5, Math.min(8, Math.round(normalized)));
        }

        _buildRightConnectors() {
            const base = orderedClassSpecs(this.classSpecs).map(function (entry) {
                return Object.assign({}, entry);
            });
            if (this._isHarderMode()) return base;
            return shuffle(base);
        }

        _hasClassDuplicate(items) {
            const counts = {};
            const list = Array.isArray(items) ? items : [];
            for (let i = 0; i < list.length; i++) {
                const className = list[i] && list[i].className ? String(list[i].className) : '';
                if (!className) continue;
                counts[className] = (counts[className] || 0) + 1;
                if (counts[className] >= 2) return true;
            }
            return false;
        }

        _fallbackGeneratedForClass(className) {
            const spec = classSpec(className) || { className: className || 'A' };
            if (typeof core.generateIPForClass === 'function') {
                const generated = core.generateIPForClass(spec.className);
                if (generated) return generated;
            }
            return {
                className: spec.className,
                color: spec.color || this._classColor(spec.className),
                ip: '1.1.1.1',
            };
        }

        _normalizeGeneratedPuzzle(generated, mode) {
            const list = Array.isArray(generated) ? generated.slice() : [];
            const isHarder = String(mode || '').toLowerCase() === 'harder';
            const desiredCount = isHarder ? this._resolveWireCount() : 5;

            while (list.length > desiredCount) list.pop();
            while (list.length < desiredCount) {
                const sourceClass = this.classSpecs.length
                    ? this.classSpecs[Math.floor(Math.random() * this.classSpecs.length)].className
                    : 'A';
                list.push(this._fallbackGeneratedForClass(sourceClass));
            }

            if (isHarder && !this._hasClassDuplicate(list) && list.length >= 2) {
                const pivotClass = list[0] && list[0].className ? list[0].className : 'A';
                list[list.length - 1] = this._fallbackGeneratedForClass(pivotClass);
            }
            return list;
        }

        _generatePuzzle() {
            const mode = String(this.mode || 'default').toLowerCase();
            let generated = [];
            if (mode === 'harder' && typeof core.generateHarderPuzzle === 'function') {
                generated = core.generateHarderPuzzle(this._resolveWireCount());
            } else if (typeof core.generateDefaultPuzzle === 'function') {
                generated = core.generateDefaultPuzzle();
            }
            generated = this._normalizeGeneratedPuzzle(generated, mode);
            const output = [];
            for (let i = 0; i < generated.length; i++) {
                const item = generated[i];
                output.push({
                    id: 'src_' + i + '_' + item.className + '_' + Date.now() + '_' + Math.floor(Math.random() * 100000),
                    className: item.className,
                    color: item.color || this._classColor(item.className),
                    ip: item.ip,
                });
            }
            return output;
        }

        _classColor(className) {
            const spec = classSpec(className);
            return spec ? spec.color : '#AEB7C2';
        }

        _classRangeLabel(className) {
            const spec = classSpec(className);
            return spec ? spec.shortRange : '???';
        }

        _clearTargetConnection(targetClass) {
            const sourceIds = Object.keys(this.connections || {});
            for (let i = 0; i < sourceIds.length; i++) {
                const sourceId = sourceIds[i];
                if (this.connections[sourceId] === targetClass) delete this.connections[sourceId];
            }
        }

        _evaluateConnections() {
            if (this.verdictTimer > 0 || this.completed) return;

            const mistakes = [];
            this.wrongConnections = {};

            for (let i = 0; i < this.leftItems.length; i++) {
                const source = this.leftItems[i];
                const targetClass = this.connections[source.id];
                if (targetClass === source.className) {
                    this.lockedCorrect[source.id] = true;
                } else {
                    this.wrongConnections[source.id] = true;
                    mistakes.push(this._mistakeFor(source.id, targetClass));
                }
            }

            if (mistakes.length === 0) {
                this._playConfirm();
                this.completed = true;
                this.completedAt = Date.now();
                return;
            }

            this.attemptsUsed++;
            this.failFlash = 34;
            this.verdictTimer = 58;
            this.pendingMistakeDialogue = mistakes;
            this.pendingFailureExit = this.attemptsUsed >= this.maxAttempts ? mistakes : null;
            this._spawnMistakeSparks(mistakes);
            this._playCancel();
        }

        _resolveFailedVerdict() {
            const layout = this._layout();
            const mistakes = this.pendingMistakeDialogue || [];

            for (let i = 0; i < mistakes.length; i++) {
                const mistake = mistakes[i];
                const from = layout.leftPoints[mistake.sourceId];
                const to = layout.rightPoints[mistake.targetClass];
                if (from && to) {
                    this.failedWires.push({
                        fromX: from.x,
                        fromY: from.y,
                        toX: to.x,
                        toY: to.y,
                        colors: [mistake.sourceColor, this._classColor(mistake.targetClass)],
                        life: 34,
                        maxLife: 34,
                    });
                }
                delete this.connections[mistake.sourceId];
            }

            this.wrongConnections = {};

            if (this.pendingFailureExit) {
                this._failOut(this.pendingFailureExit);
                return;
            }

            const feedbackEnabled = this.options && this.options.tutorialFeedback;
            if (feedbackEnabled && IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayMistake === 'function') {
                const remaining = Math.max(0, this.maxAttempts - this.attemptsUsed);
                IP2Live.GameManager.handleGameplayMistake(this.gameplayId, {
                    mapId: this.options.mapId || 3,
                    questId: this.options.questId,
                    objectiveId: this.options.objectiveId,
                    mistakes: mistakes,
                    attemptsRemaining: remaining,
                    screen: this,
                });
            } else if (feedbackEnabled && IP2Live.IPWiresTutorial && typeof IP2Live.IPWiresTutorial.showMistakeAnalysis === 'function') {
                const remaining = Math.max(0, this.maxAttempts - this.attemptsUsed);
                IP2Live.IPWiresTutorial.showMistakeAnalysis(mistakes, remaining);
            }

            this.pendingMistakeDialogue = null;
        }

        _mistakeFor(sourceId, targetClass) {
            const source = this._itemById(this.leftItems, sourceId) || {};
            return {
                sourceId: sourceId,
                sourceClass: source.className || '?',
                sourceColor: source.color || '#AEB7C2',
                targetClass: targetClass || '?',
                leftLabel: source.ip || source.className || sourceId,
            };
        }

        _itemById(items, id) {
            for (let i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
            return null;
        }

        _spawnMistakeSparks(mistakes) {
            const layout = this._layout();
            for (let i = 0; i < mistakes.length; i++) {
                const targetClass = mistakes[i].targetClass;
                const p = layout.rightPoints[targetClass] || layout.leftPoints[mistakes[i].sourceId];
                if (!p) continue;
                this.sparks.push({
                    x: p.x,
                    y: p.y,
                    color: mistakes[i].sourceColor,
                    life: 26,
                });
            }
        }

        _allConnected() {
            for (let i = 0; i < this.leftItems.length; i++) {
                if (!this.connections[this.leftItems[i].id]) return false;
            }
            return true;
        }

        _distance(x1, y1, x2, y2) {
            const dx = x1 - x2;
            const dy = y1 - y2;
            return Math.sqrt(dx * dx + dy * dy);
        }

        _finish() {
            if (this._finished) return;
            this._finished = true;
            if (typeof this.options.onComplete === 'function') {
                this.options.onComplete({
                    gameplayId: this.gameplayId,
                    connections: Object.assign({}, this.connections),
                    attemptsUsed: this.attemptsUsed,
                    wireCount: this.leftItems.length,
                });
            }
        }

        _failOut(mistakes) {
            if (this._finished) return;
            this._finished = true;
            if (typeof this.options.onFailed === 'function') {
                this.options.onFailed({
                    gameplayId: this.gameplayId,
                    reason: 'attempts_exhausted',
                    attemptsUsed: this.attemptsUsed,
                    maxAttempts: this.maxAttempts,
                    mistakes: mistakes || [],
                    wireCount: this.leftItems.length,
                });
            }
        }

        _cancel() {
            if (typeof this.options.onCancel === 'function') this.options.onCancel();
        }

        _playCursor() {
            try { if (Data.Systems.soundCursor) Data.Systems.soundCursor.playSound(); } catch (e) {}
        }

        _playConfirm() {
            try { if (Data.Systems.soundConfirmation) Data.Systems.soundConfirmation.playSound(); } catch (e) {}
        }

        _playCancel() {
            try { if (Data.Systems.soundCancel) Data.Systems.soundCancel.playSound(); } catch (e) {}
        }
    }

    const GameplayManager = {
        VERSION: 'ip-wires-gameplay-manager-20260530-01',
        WIRE_QUEST_ID: 'stage.3.ip_wires.01.tutorial',
        WIRE_OBJECTIVE_ID: 'repair_ip_wires_01',
    _activeAttempt: null,
    _registeredQuestIds: {},
    _triggerLocks: {},
    _musicRestoreTimer: null,

        WIRE_QUESTS: [
            {
                id: 'stage.3.ip_wires.01.tutorial',
                objectiveId: 'repair_ip_wires_01',
                title: 'REPAIR IP WIRES 01',
                label: 'Lever 01',
                targetTile: { x: 6, y: 0, z: 21 },
                tutorial: true,
            },
            {
                id: 'stage.3.ip_wires.02',
                objectiveId: 'repair_ip_wires_02',
                title: 'REPAIR IP WIRES 02',
                label: 'Lever 02',
                targetTile: { x: 27, y: 0, z: 10 },
            },
            {
                id: 'stage.3.ip_wires.03',
                objectiveId: 'repair_ip_wires_03',
                title: 'REPAIR IP WIRES 03',
                label: 'Lever 03',
                targetTile: { x: 13, y: 0, z: 6 },
            },
            {
                id: 'stage.3.ip_wires.04',
                objectiveId: 'repair_ip_wires_04',
                title: 'REPAIR IP WIRES 04',
                label: 'Lever 04',
                targetTile: { x: 19, y: 0, z: 27 },
            },
        ],

        _questSpecs() {
            if (IP2Live.GameManager && typeof IP2Live.GameManager.getGameplayQuestSpecs === 'function') {
                const specs = IP2Live.GameManager.getGameplayQuestSpecs('ip_class_wires');
                if (Array.isArray(specs) && specs.length) return specs;
            }
            return this.WIRE_QUESTS;
        },

        _defaultQuestSpec() {
            const specs = this._questSpecs();
            return specs[0] || this.WIRE_QUESTS[0];
        },

        registerStageGameplayQuests(questManager, mapManager, stage) {
            const qm = questManager || IP2Live.QuestManager;
            if (!qm || !stage || Number(stage.id) !== 3) return [];

            const questIds = [];
            const specs = this._questSpecs();
            for (let i = 0; i < specs.length; i++) {
                const spec = specs[i];
                questIds.push(spec.id);
                if (this._registeredQuestIds[spec.id] && qm.quests && qm.quests[spec.id]) continue;

                const target = Object.assign({}, spec.targetTile);
                qm.registerQuest({
                    id: spec.id,
                    title: 'QUEST AREA',
                    stageMapId: stage.id,
                    resetOnMapEnter: true,
                    objectives: [{
                        id: spec.objectiveId,
                        title: spec.title,
                        detail: 'TARGET TILE  X:' + target.x + '  Y:' + (target.y || 0) + '  Z:' + target.z,
                        targetTile: target,
                        completionRadiusTiles: 0.55,
                        isComplete: (context, activeQuestManager) => GameplayManager._handleWireObjective(spec, context, activeQuestManager),
                    }],
                });
                this._registeredQuestIds[spec.id] = true;
            }
            return questIds;
        },

        _handleWireObjective(spec, context, questManager) {
            const qm = questManager || IP2Live.QuestManager;
            if (!qm || !qm.currentObjective || !qm.distanceToObjective) return false;

            const objective = qm.currentObjective();
            if (!objective || objective.id !== spec.objectiveId) return false;
            const dist = qm.distanceToObjective(objective, context && context.hero);
            const radius = typeof objective.completionRadiusTiles === 'number' ? objective.completionRadiusTiles : 0.55;

            this._refreshTriggerLock(spec, dist, radius);
            if (dist === null || dist > radius) return false;
            if (this._triggerLocks[spec.objectiveId]) return false;

            const attemptKey = spec.id + ':' + spec.objectiveId;
            if (this._activeAttempt === attemptKey) return false;

            if (IP2Live.GameManager && typeof IP2Live.GameManager.startGameplayNode === 'function') {
                this._activeAttempt = attemptKey;
                IP2Live.GameManager.startGameplayNode('ip_class_wires', {
                    spec: spec,
                    questId: spec.id,
                    objectiveId: spec.objectiveId,
                    mapId: context && context.mapId,
                    tutorialFeedback: !!spec.tutorial,
                    skipBeforeDialogues: !!spec.tutorial,
                });
                return false;
            }

            this.launchWireGameplay({
                spec: spec,
                questId: spec.id,
                objectiveId: spec.objectiveId,
                mapId: context && context.mapId,
                tutorialFeedback: !!spec.tutorial,
                skipBeforeDialogues: !!spec.tutorial,
            });
            return false;
        },

        _refreshTriggerLock(spec, distance, radius) {
            if (!this._triggerLocks[spec.objectiveId]) return;
            if (distance === null || distance > radius + 0.35) delete this._triggerLocks[spec.objectiveId];
        },

        _lockUntilStepOff(spec) {
            if (spec && spec.objectiveId) this._triggerLocks[spec.objectiveId] = true;
        },

        _playMusicZone(zoneName) {
            const music = IP2Live.MusicManager;
            if (!music || !music.ZONE || !music.ZONE[zoneName] || typeof music.play !== 'function') return false;
            music.play(music.ZONE[zoneName]);
            return true;
        },

        _restoreStageMusic() {
            const music = IP2Live.MusicManager;
            if (!music) return false;
            if (this._musicRestoreTimer) {
                clearTimeout(this._musicRestoreTimer);
                this._musicRestoreTimer = null;
            }
            if (typeof music.stop === 'function') music.stop(120);
            this._musicRestoreTimer = setTimeout(() => {
                this._musicRestoreTimer = null;
                this._playMusicZone('STAGE_1');
            }, 150);
            return true;
        },

        launchWireGameplay(options) {
            const opts = options || {};
            const spec = opts.spec || this._defaultQuestSpec();
            const attemptKey = (opts.questId || spec.id) + ':' + (opts.objectiveId || spec.objectiveId);
            const isReservedAttempt = opts._fromGameManager && opts._reservedAttempt === attemptKey;
            if (this._activeAttempt === attemptKey && !isReservedAttempt) return false;
            this._activeAttempt = attemptKey;

            const createScreen = () => new IP2LiveWiresGameplayScreen({
                mode: 'default',
                gameplayId: 'ip_class_wires',
                maxAttempts: 3,
                allowDuplicateTargets: false,
                tutorialFeedback: !!opts.tutorialFeedback,
                guidedTutorial: !!spec.tutorial,
                questLabel: spec.label,
                questId: opts.questId || spec.id,
                objectiveId: opts.objectiveId || spec.objectiveId,
                mapId: opts.mapId || 3,
                onComplete: (result) => this._completeWireGameplay(opts, result),
                onFailed: (result) => this._failWireGameplay(opts, result),
                onCancel: () => {
                    this._activeAttempt = null;
                    this._lockUntilStepOff(spec);
                    if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayCancelled === 'function') {
                        IP2Live.GameManager.handleGameplayCancelled('ip_class_wires', {
                            spec: spec,
                            questId: opts.questId || spec.id,
                            objectiveId: opts.objectiveId || spec.objectiveId,
                            mapId: opts.mapId || 3,
                            result: { cancelled: true },
                        });
                    }
                    Manager.Stack.pop();
                    this._restoreStageMusic();
                    if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
                },
            });

            const openGameplay = () => {
                this._playMusicZone('GAMEPLAY_1');
                const screen = createScreen();
                Manager.Stack.replace(screen);
                if (spec.tutorial && IP2Live.IPWiresTutorial && typeof IP2Live.IPWiresTutorial.activateGuidedSession === 'function') {
                    setTimeout(() => {
                        IP2Live.IPWiresTutorial.activateGuidedSession(screen);
                    }, 0);
                }
            };

            const ScreenClass = IP2Live.LoadingScreen2 || IP2Live.LoadingScreen;
            if (ScreenClass && typeof ScreenClass.show === 'function') {
                ScreenClass.show({
                    mode: 'push',
                    status: 'Loading Gameplay',
                    detail: 'Opening ' + (spec.label || 'IP class wire panel'),
                    onComplete: openGameplay,
                });
            } else {
                this._playMusicZone('GAMEPLAY_1');
                Manager.Stack.push(createScreen());
            }
            return true;
        },

        _completeWireGameplay(options, result) {
            const opts = options || {};
            const spec = opts.spec || this._defaultQuestSpec();
            this._activeAttempt = null;
            delete this._triggerLocks[spec.objectiveId];
            Manager.Stack.pop();
            this._restoreStageMusic();

            if (
                IP2Live.QuestManager &&
                IP2Live.QuestManager.activeQuestId === (opts.questId || spec.id) &&
                IP2Live.QuestManager.activeObjectiveId === (opts.objectiveId || spec.objectiveId)
            ) {
                IP2Live.QuestManager.completeObjective(opts.objectiveId || spec.objectiveId);
            }

            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayCompleted === 'function') {
                IP2Live.GameManager.handleGameplayCompleted('ip_class_wires', {
                    spec: spec,
                    questId: opts.questId || spec.id,
                    objectiveId: opts.objectiveId || spec.objectiveId,
                    mapId: opts.mapId || 3,
                    result: result,
                });
            }
            return result;
        },

        _failWireGameplay(options, result) {
            const opts = options || {};
            const spec = opts.spec || this._defaultQuestSpec();
            this._activeAttempt = null;
            this._lockUntilStepOff(spec);
            Manager.Stack.pop();
            this._restoreStageMusic();

            if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayFailed === 'function') {
                IP2Live.GameManager.handleGameplayFailed('ip_class_wires', {
                    spec: spec,
                    questId: opts.questId || spec.id,
                    objectiveId: opts.objectiveId || spec.objectiveId,
                    mapId: opts.mapId || 3,
                    result: result,
                });
                if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
                return result;
            }

            if (spec.tutorial) {
                if (IP2Live.IPWiresTutorial && typeof IP2Live.IPWiresTutorial.showPacketsShifted === 'function') {
                    setTimeout(() => IP2Live.IPWiresTutorial.showPacketsShifted(), 220);
                }
            } else {
                this._sendStageBackToFirstWire(spec);
            }

            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            return result;
        },

        _sendStageBackToFirstWire(failedSpec) {
            const qm = IP2Live.QuestManager;
            const first = this._defaultQuestSpec();
            if (qm) {
                if (!qm.completedObjectives[first.id]) qm.completedObjectives[first.id] = {};
                qm.completedObjectives[first.id] = {};
                if (failedSpec && failedSpec.id) qm.completedObjectives[failedSpec.id] = {};
                qm.startQuest(first.id, {
                    mapId: 3,
                    mapQuestMode: true,
                    keepLastCompletion: true,
                    visible: true,
                    preview: false,
                    guideActive: true,
                    allowCompletion: true,
                });
            }

            if (IP2Live.IPWiresTutorial && typeof IP2Live.IPWiresTutorial.showStageRepairReset === 'function') {
                setTimeout(() => IP2Live.IPWiresTutorial.showStageRepairReset(failedSpec && failedSpec.label), 220);
            }
        },
    };

    IP2Live.GameplayManager = GameplayManager;
    IP2Live.WiresGameplayScreen = IP2LiveWiresGameplayScreen;
    window.IP2LiveGameplayManager = GameplayManager;
    window.IP2LiveWiresGameplayScreen = IP2LiveWiresGameplayScreen;
    console.log('[IP2Live] ip_wires_gameplay.js module loaded.');
}());
