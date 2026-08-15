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
            this.mouse = { x: -9999, y: -9999 };
            this.sparks = [];
            this.failedWires = [];
            this.failFlash = 0;
            this.verdictTimer = 0;
            this.pendingMistakeDialogue = null;
            this.pendingFailureExit = null;
            this.randomizingWires = {};
            this.randomizeTimer = 0;
            this.randomizeDuration = 0;
            this._deferredFailureExit = null;
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
            if (this.randomizeTimer > 0) {
                this.randomizeTimer--;
                if (this.randomizeTimer === 0) this._commitHarderReroll();
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
            if (this.completed || this.verdictTimer > 0 || this.randomizeTimer > 0 || (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive())) return true;
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
                if (this._isSourceHit(x, y, p)) {
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
            if (!this.dragging || this.completed || this.verdictTimer > 0 || this.randomizeTimer > 0) return true;

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
            this._drawRerollOverlay(ctx, layout, font);
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
            const harder = this._isHarderMode();
            const accent = harder ? '#FF315F' : '#00F0FF';
            const tick = this.animTick || 0;
            ctx.save();

            ctx.shadowColor = 'rgba(0,0,0,0.88)';
            ctx.shadowBlur = 30 * layout.sX;
            ctx.shadowOffsetY = 16 * layout.sY;
            this._panelPath(ctx, p, sl, 0);
            const shell = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
            shell.addColorStop(0, '#151C25');
            shell.addColorStop(0.36, '#080B11');
            shell.addColorStop(0.72, '#111722');
            shell.addColorStop(1, '#05070B');
            ctx.fillStyle = shell;
            ctx.fill();
            ctx.shadowColor = 'transparent';

            this._panelPath(ctx, p, 27 * layout.sX, 8 * layout.sX);
            ctx.strokeStyle = 'rgba(204,229,244,0.12)';
            ctx.lineWidth = 1 * layout.sX;
            ctx.stroke();

            ctx.save();
            this._panelPath(ctx, p, sl, 2 * layout.sX);
            ctx.clip();
            ctx.globalAlpha = 0.09;
            ctx.strokeStyle = '#A8C4D4';
            ctx.lineWidth = Math.max(1, layout.sX * 0.7);
            const textureGap = 22 * layout.sX;
            for (let x = p.x - p.h; x < p.x + p.w + p.h; x += textureGap) {
                ctx.beginPath();
                ctx.moveTo(x, p.y);
                ctx.lineTo(x + p.h * 0.34, p.y + p.h);
                ctx.stroke();
            }
            ctx.globalAlpha = 0.055;
            ctx.fillStyle = '#FFFFFF';
            for (let y = p.y + 6 * layout.sY; y < p.y + p.h; y += 6 * layout.sY) {
                ctx.fillRect(p.x, y, p.w, Math.max(1, 0.7 * layout.sY));
            }
            ctx.restore();

            const railW = 18 * layout.sX;
            const railTop = p.y + 76 * layout.sY;
            const railH = p.h - 102 * layout.sY;
            const leftRail = ctx.createLinearGradient(p.x, 0, p.x + railW, 0);
            leftRail.addColorStop(0, '#05070A');
            leftRail.addColorStop(0.46, '#52606C');
            leftRail.addColorStop(0.54, '#19212A');
            leftRail.addColorStop(1, '#030407');
            ctx.fillStyle = leftRail;
            ctx.fillRect(p.x + 5 * layout.sX, railTop, railW, railH);
            const rightRail = ctx.createLinearGradient(p.x + p.w - railW, 0, p.x + p.w, 0);
            rightRail.addColorStop(0, '#030407');
            rightRail.addColorStop(0.46, '#19212A');
            rightRail.addColorStop(0.54, '#52606C');
            rightRail.addColorStop(1, '#05070A');
            ctx.fillStyle = rightRail;
            ctx.fillRect(p.x + p.w - 23 * layout.sX, railTop, railW, railH);

            this._drawBankFrame(ctx, layout.leftBank, 'SOURCE BUS // IP', '#00F0FF', layout);
            this._drawBankFrame(ctx, layout.rightBank, harder ? 'STRICT CLASS MATRIX' : 'CLASS MATRIX', harder ? '#FF315F' : '#FFE600', layout);

            const fieldX = layout.leftBank.x + layout.leftBank.w + 12 * layout.sX;
            const fieldRight = layout.rightBank.x - 12 * layout.sX;
            const fieldY = layout.leftBank.y + 16 * layout.sY;
            const fieldH = layout.leftBank.h - 30 * layout.sY;
            if (fieldRight > fieldX) {
                const fieldGradient = ctx.createLinearGradient(fieldX, 0, fieldRight, 0);
                fieldGradient.addColorStop(0, 'rgba(0,240,255,0.035)');
                fieldGradient.addColorStop(0.5, 'rgba(0,0,0,0.44)');
                fieldGradient.addColorStop(1, harder ? 'rgba(255,49,95,0.04)' : 'rgba(255,230,0,0.035)');
                ctx.fillStyle = fieldGradient;
                this._angularRectPath(ctx, fieldX, fieldY, fieldRight - fieldX, fieldH, 10 * layout.sX);
                ctx.fill();
                ctx.setLineDash([7 * layout.sX, 11 * layout.sX]);
                ctx.strokeStyle = 'rgba(124,154,172,0.12)';
                ctx.lineWidth = 1 * layout.sX;
                ctx.stroke();
                ctx.setLineDash([]);
            }

            const midX = p.x + p.w / 2;
            const troughW = 26 * layout.sX;
            const troughGradient = ctx.createLinearGradient(midX - troughW / 2, 0, midX + troughW / 2, 0);
            troughGradient.addColorStop(0, '#020305');
            troughGradient.addColorStop(0.36, '#27313A');
            troughGradient.addColorStop(0.5, '#050608');
            troughGradient.addColorStop(0.64, '#27313A');
            troughGradient.addColorStop(1, '#020305');
            ctx.fillStyle = troughGradient;
            ctx.fillRect(midX - troughW / 2, p.y + 112 * layout.sY, troughW, p.h - 188 * layout.sY);
            ctx.strokeStyle = 'rgba(0,240,255,0.13)';
            ctx.strokeRect(midX - troughW / 2, p.y + 112 * layout.sY, troughW, p.h - 188 * layout.sY);
            for (let y = p.y + 126 * layout.sY; y < p.y + p.h - 88 * layout.sY; y += 22 * layout.sY) {
                ctx.fillStyle = (Math.floor(y / (22 * layout.sY)) % 2) ? 'rgba(255,230,0,0.18)' : 'rgba(0,240,255,0.15)';
                ctx.fillRect(midX - 5 * layout.sX, y, 10 * layout.sX, 3 * layout.sY);
            }

            this._drawPanelTitle(ctx, layout, font, titleFont, harder);

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

            const signalX = p.x + p.w - 180 * layout.sX;
            const signalY = p.y + 64 * layout.sY;
            for (let i = 0; i < 6; i++) {
                const lit = i <= Math.floor(((tick * 0.055) + 2) % 7);
                ctx.fillStyle = lit ? (harder && i > 3 ? '#FF315F' : '#00F0FF') : 'rgba(79,102,114,0.24)';
                ctx.fillRect(signalX + i * 15 * layout.sX, signalY, 10 * layout.sX, 3 * layout.sY);
            }

            const busY = p.y + p.h - 51 * layout.sY;
            ctx.fillStyle = 'rgba(2,4,8,0.88)';
            this._angularRectPath(ctx, p.x + 38 * layout.sX, busY, p.w - 76 * layout.sX, 28 * layout.sY, 7 * layout.sX);
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,240,255,0.20)';
            ctx.stroke();
            ctx.font = Math.round(8 * layout.sX) + 'px monospace';
            ctx.textAlign = 'left';
            ctx.fillStyle = 'rgba(218,238,255,0.76)';
            ctx.fillText('01 // HOLD TERMINAL     02 // DRAG RIGHT     03 // PATCH CLASS INPUT', p.x + 56 * layout.sX, busY + 18 * layout.sY);
            ctx.textAlign = 'right';
            ctx.fillStyle = accent;
            ctx.fillText(harder ? 'ICE::STRICT' : 'LINK::READY', p.x + p.w - 54 * layout.sX, busY + 18 * layout.sY);

            const boltYs = [p.y + 92 * layout.sY, p.y + p.h * 0.5, p.y + p.h - 78 * layout.sY];
            for (let i = 0; i < boltYs.length; i++) {
                this._drawFastener(ctx, p.x + 14 * layout.sX, boltYs[i], 5 * layout.sX, layout);
                this._drawFastener(ctx, p.x + p.w - 14 * layout.sX, boltYs[i], 5 * layout.sX, layout);
            }
            ctx.restore();
        }

        _drawPanelTitle(ctx, layout, font, titleFont, harder) {
            const p = layout.panel;
            const sX = layout.sX;
            const sY = layout.sY;
            const x = p.x + 22 * sX;
            const y = p.y + 12 * sY;
            const w = 408 * sX;
            const h = 54 * sY;
            const modeColor = harder ? '#FFE600' : '#00F0FF';

            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.82)';
            ctx.shadowBlur = 12 * sX;
            ctx.shadowOffsetY = 5 * sY;
            this._angularRectPath(ctx, x, y, w, h, 11 * sX);
            const plate = ctx.createLinearGradient(x, y, x + w, y + h);
            plate.addColorStop(0, '#202A34');
            plate.addColorStop(0.18, '#090D13');
            plate.addColorStop(0.74, '#111821');
            plate.addColorStop(1, '#030508');
            ctx.fillStyle = plate;
            ctx.fill();
            ctx.shadowColor = 'transparent';
            ctx.strokeStyle = 'rgba(180,205,217,0.24)';
            ctx.lineWidth = 1 * sX;
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(x, y + 8 * sY);
            ctx.lineTo(x + 70 * sX, y);
            ctx.lineTo(x + 62 * sX, y + h);
            ctx.lineTo(x, y + h - 8 * sY);
            ctx.closePath();
            const badge = ctx.createLinearGradient(x, y, x + 70 * sX, y + h);
            badge.addColorStop(0, '#FF315F');
            badge.addColorStop(0.62, '#B50032');
            badge.addColorStop(1, '#4A071C');
            ctx.fillStyle = badge;
            ctx.fill();

            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold ' + Math.round(7 * sX) + 'px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('IP2', x + 28 * sX, y + 19 * sY);
            ctx.fillStyle = '#FFE600';
            ctx.fillText(harder ? 'S-01' : 'P-01', x + 28 * sX, y + 34 * sY);

            const titleX = x + 82 * sX;
            const titleY = y + 31 * sY;
            ctx.font = 'bold ' + Math.round(21 * sX) + 'px ' + titleFont;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#F7FCFF';
            ctx.shadowColor = 'rgba(0,240,255,0.22)';
            ctx.shadowBlur = 5 * sX;
            ctx.fillText('NETWORK', titleX, titleY);
            const networkW = ctx.measureText('NETWORK').width;
            ctx.shadowColor = 'transparent';
            ctx.fillStyle = modeColor;
            ctx.fillText('PATCH', titleX + networkW + 13 * sX, titleY);

            ctx.font = 'bold ' + Math.round(6.3 * sX) + 'px monospace';
            ctx.fillStyle = 'rgba(190,211,222,0.68)';
            ctx.fillText(
                harder ? 'PHYSICAL ROUTING // STRICT SECURITY BUS' : 'PHYSICAL ROUTING // MANUAL LINK INTERFACE',
                titleX,
                y + 46 * sY
            );

            ctx.fillStyle = '#FF315F';
            ctx.fillRect(x + 75 * sX, y + 6 * sY, 28 * sX, 2 * sY);
            ctx.fillStyle = modeColor;
            ctx.fillRect(x + 106 * sX, y + 6 * sY, 72 * sX, 2 * sY);
            ctx.fillStyle = 'rgba(210,228,237,0.26)';
            for (let i = 0; i < 5; i++) {
                ctx.fillRect(x + w - (48 - i * 8) * sX, y + 8 * sY, 5 * sX, 2 * sY);
            }
            ctx.restore();
        }

        _panelPath(ctx, panel, slant, inset) {
            const i = Math.max(0, inset || 0);
            const x = panel.x + i;
            const y = panel.y + i;
            const w = Math.max(1, panel.w - i * 2);
            const h = Math.max(1, panel.h - i * 2);
            const sl = Math.max(8, slant - i * 0.4);
            ctx.beginPath();
            ctx.moveTo(x + sl, y);
            ctx.lineTo(x + w, y);
            ctx.lineTo(x + w - sl, y + h);
            ctx.lineTo(x, y + h);
            ctx.lineTo(x, y + sl);
            ctx.closePath();
        }

        _angularRectPath(ctx, x, y, w, h, cut) {
            const c = Math.max(2, Math.min(cut || 8, Math.min(w, h) * 0.35));
            ctx.beginPath();
            ctx.moveTo(x + c, y);
            ctx.lineTo(x + w - c, y);
            ctx.lineTo(x + w, y + c);
            ctx.lineTo(x + w, y + h - c);
            ctx.lineTo(x + w - c, y + h);
            ctx.lineTo(x + c, y + h);
            ctx.lineTo(x, y + h - c);
            ctx.lineTo(x, y + c);
            ctx.closePath();
        }

        _drawBankFrame(ctx, bank, label, color, layout) {
            if (!bank) return;
            ctx.save();
            const edge = ctx.createLinearGradient(bank.x, bank.y, bank.x, bank.y + bank.h);
            edge.addColorStop(0, 'rgba(50,64,76,0.72)');
            edge.addColorStop(0.1, 'rgba(5,8,12,0.91)');
            edge.addColorStop(1, 'rgba(2,4,7,0.72)');
            this._angularRectPath(ctx, bank.x, bank.y, bank.w, bank.h, 12 * layout.sX);
            ctx.fillStyle = edge;
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.28;
            ctx.lineWidth = 1.5 * layout.sX;
            ctx.stroke();
            ctx.globalAlpha = 1;

            const tabW = Math.min(bank.w - 26 * layout.sX, 164 * layout.sX);
            const tabX = bank.x + 8 * layout.sX;
            const tabY = bank.y - 29 * layout.sY;
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.88;
            this._angularRectPath(ctx, tabX, tabY, tabW, 22 * layout.sY, 5 * layout.sX);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(tabX + 16 * layout.sX, tabY + 22 * layout.sY);
            ctx.lineTo(tabX + 27 * layout.sX, tabY + 22 * layout.sY);
            ctx.lineTo(tabX + 19 * layout.sX, bank.y);
            ctx.closePath();
            ctx.fill();
            ctx.font = 'bold ' + Math.round(8 * layout.sX) + 'px monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#020509';
            ctx.fillText(label, tabX + 12 * layout.sX, tabY + 11 * layout.sY);

            ctx.strokeStyle = 'rgba(171,198,212,0.11)';
            ctx.lineWidth = Math.max(1, layout.sX * 0.7);
            for (let y = bank.y + 14 * layout.sY; y < bank.y + bank.h - 10 * layout.sY; y += 18 * layout.sY) {
                ctx.beginPath();
                ctx.moveTo(bank.x + 10 * layout.sX, y);
                ctx.lineTo(bank.x + bank.w - 10 * layout.sX, y);
                ctx.stroke();
            }
            ctx.restore();
        }

        _drawFastener(ctx, x, y, radius, layout) {
            const metal = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.35, radius * 0.1, x, y, radius);
            metal.addColorStop(0, '#C7D6DD');
            metal.addColorStop(0.38, '#56636B');
            metal.addColorStop(1, '#080B0E');
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = metal;
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.8)';
            ctx.lineWidth = Math.max(1, layout.sX);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(5,8,10,0.82)';
            ctx.lineWidth = Math.max(1, 1.2 * layout.sX);
            ctx.beginPath();
            ctx.moveTo(x - radius * 0.55, y);
            ctx.lineTo(x + radius * 0.55, y);
            ctx.stroke();
            ctx.restore();
        }

        _drawTerminals(ctx, layout, font) {
            const showClassRangeHints = !this._isHarderMode();
            const expectedSourceId = IP2Live.IPWiresTutorial && typeof IP2Live.IPWiresTutorial.expectedGuidedSourceId === 'function'
                ? IP2Live.IPWiresTutorial.expectedGuidedSourceId(this)
                : null;
            let firstAvailableId = null;
            for (let i = 0; i < this.leftItems.length; i++) {
                const candidate = this.leftItems[i];
                if (!this.lockedCorrect[candidate.id] && !this.connections[candidate.id]) {
                    firstAvailableId = candidate.id;
                    break;
                }
            }
            for (let i = 0; i < this.leftItems.length; i++) {
                const item = this.leftItems[i];
                const p = layout.leftPoints[item.id];
                const patched = !!this.connections[item.id];
                const verified = !!this.lockedCorrect[item.id];
                const rerollState = this.randomizingWires && this.randomizingWires[item.id]
                    ? this.randomizingWires[item.id]
                    : null;
                const hover = this._distance(this.mouse.x, this.mouse.y, p.x, p.y) <= p.r * 2.4;
                this._drawTerminal(ctx, p, rerollState ? this._rerollDisplayText(rerollState) : item.ip, item.color, font, false, verified, null, {
                    id: item.id,
                    index: i,
                    total: this.leftItems.length,
                    locked: verified,
                    pending: patched && !verified,
                    rekeying: !!rerollState,
                    showGuide: !patched && !rerollState && !this.completed && (!expectedSourceId || expectedSourceId === item.id),
                    guideEmphasis: expectedSourceId === item.id || hover || (!expectedSourceId && firstAvailableId === item.id),
                });
            }
            for (let i = 0; i < this.rightItems.length; i++) {
                const item = this.rightItems[i];
                const p = layout.rightPoints[item.className];
                const sourceIds = Object.keys(this.connections || {});
                let linkedCount = 0;
                for (let n = 0; n < sourceIds.length; n++) {
                    if (this.lockedCorrect[sourceIds[n]] && this.connections[sourceIds[n]] === item.className) linkedCount++;
                }
                this._drawTerminal(ctx, p, 'Class ' + item.className, item.color, font, true, linkedCount > 0, showClassRangeHints ? item.shortRange : null, {
                    index: i,
                    total: this.rightItems.length,
                    linkedCount: linkedCount,
                });
            }
        }

        _drawTerminal(ctx, point, label, color, font, rightSide, connected, subLabel, meta) {
            const info = meta || {};
            const geometry = this._terminalGeometry(point, rightSide);
            const sX = point.sX;
            const sY = point.sY;
            const activeColor = connected ? color : '#83909B';
            const pulse = 0.5 + 0.5 * Math.sin((this.animTick || 0) * 0.13 + Number(info.index || 0) * 0.72);
            const cut = 8 * sX;
            const textShift = rightSide ? -10 * sX : 10 * sX;

            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.88)';
            ctx.shadowBlur = 10 * sX;
            ctx.shadowOffsetY = 6 * sY;
            this._angularRectPath(ctx, geometry.tagX - 3 * sX, geometry.tagY - 3 * sY, geometry.tagW + 6 * sX, geometry.tagH + 6 * sY, cut + 2 * sX);
            ctx.fillStyle = '#020407';
            ctx.fill();
            ctx.shadowColor = 'transparent';

            const housing = ctx.createLinearGradient(geometry.tagX, geometry.tagY, geometry.tagX, geometry.tagY + geometry.tagH);
            housing.addColorStop(0, '#65727D');
            housing.addColorStop(0.08, '#28313A');
            housing.addColorStop(0.48, '#0B0F15');
            housing.addColorStop(0.9, '#202933');
            housing.addColorStop(1, '#05070A');
            this._angularRectPath(ctx, geometry.tagX, geometry.tagY, geometry.tagW, geometry.tagH, cut);
            ctx.fillStyle = housing;
            ctx.fill();
            ctx.strokeStyle = connected ? color : 'rgba(173,195,207,0.34)';
            ctx.lineWidth = connected ? 1.8 * sX : 1.2 * sX;
            ctx.stroke();

            const inset = 5 * sX;
            const face = ctx.createLinearGradient(geometry.tagX, 0, geometry.tagX + geometry.tagW, 0);
            face.addColorStop(0, 'rgba(17,23,31,0.98)');
            face.addColorStop(0.48, 'rgba(28,34,43,0.97)');
            face.addColorStop(1, 'rgba(7,11,17,0.99)');
            this._angularRectPath(
                ctx,
                geometry.tagX + inset,
                geometry.tagY + 5 * sY,
                geometry.tagW - inset * 2,
                geometry.tagH - 10 * sY,
                5 * sX
            );
            ctx.fillStyle = face;
            ctx.fill();

            ctx.save();
            this._angularRectPath(ctx, geometry.tagX + inset, geometry.tagY + 5 * sY, geometry.tagW - inset * 2, geometry.tagH - 10 * sY, 5 * sX);
            ctx.clip();
            ctx.strokeStyle = 'rgba(193,218,231,0.075)';
            ctx.lineWidth = Math.max(1, 0.65 * sX);
            for (let x = geometry.tagX - geometry.tagH; x < geometry.tagX + geometry.tagW + geometry.tagH; x += 12 * sX) {
                ctx.beginPath();
                ctx.moveTo(x, geometry.tagY);
                ctx.lineTo(x + geometry.tagH * 0.48, geometry.tagY + geometry.tagH);
                ctx.stroke();
            }
            ctx.restore();

            const capX = rightSide ? geometry.tagX + geometry.tagW - geometry.capW : geometry.tagX;
            const capGradient = ctx.createLinearGradient(capX, geometry.tagY, capX + geometry.capW, geometry.tagY + geometry.tagH);
            capGradient.addColorStop(0, connected ? color : '#75828D');
            capGradient.addColorStop(0.46, connected ? color : '#303B45');
            capGradient.addColorStop(1, '#090C11');
            ctx.fillStyle = capGradient;
            if (rightSide) {
                ctx.beginPath();
                ctx.moveTo(capX, geometry.tagY);
                ctx.lineTo(geometry.tagX + geometry.tagW - cut, geometry.tagY);
                ctx.lineTo(geometry.tagX + geometry.tagW, geometry.tagY + cut);
                ctx.lineTo(geometry.tagX + geometry.tagW, geometry.tagY + geometry.tagH - cut);
                ctx.lineTo(geometry.tagX + geometry.tagW - cut, geometry.tagY + geometry.tagH);
                ctx.lineTo(capX, geometry.tagY + geometry.tagH);
                ctx.closePath();
            } else {
                ctx.beginPath();
                ctx.moveTo(geometry.tagX + cut, geometry.tagY);
                ctx.lineTo(geometry.tagX + geometry.capW, geometry.tagY);
                ctx.lineTo(geometry.tagX + geometry.capW, geometry.tagY + geometry.tagH);
                ctx.lineTo(geometry.tagX + cut, geometry.tagY + geometry.tagH);
                ctx.lineTo(geometry.tagX, geometry.tagY + geometry.tagH - cut);
                ctx.lineTo(geometry.tagX, geometry.tagY + cut);
                ctx.closePath();
            }
            ctx.globalAlpha = connected ? 0.88 : 0.72;
            ctx.fill();
            ctx.globalAlpha = 1;

            ctx.fillStyle = connected ? color : 'rgba(0,240,255,0.46)';
            const stripeX = rightSide ? geometry.tagX + 7 * sX : geometry.tagX + geometry.tagW - 10 * sX;
            ctx.fillRect(stripeX, geometry.tagY + 8 * sY, 3 * sX, geometry.tagH - 16 * sY);

            const rowNumber = String(Number(info.index || 0) + 1).padStart(2, '0');
            ctx.font = 'bold ' + Math.round(7 * sX) + 'px monospace';
            ctx.fillStyle = connected ? '#020407' : '#D5E2E8';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(rowNumber, capX + geometry.capW / 2, point.y);

            ctx.font = 'bold ' + Math.round((geometry.isVeryDense ? 11 : 12.5) * sX) + 'px ' + font;
            ctx.fillStyle = '#F7FCFF';
            ctx.shadowColor = 'rgba(0,0,0,0.85)';
            ctx.shadowBlur = 3 * sX;
            ctx.textAlign = 'center';
            ctx.fillText(label, geometry.tagX + geometry.tagW / 2 + textShift, point.y - (subLabel ? 6 * sY : 0));
            ctx.shadowColor = 'transparent';
            if (subLabel) {
                ctx.font = Math.round((geometry.isVeryDense ? 6.5 : 7.5) * sX) + 'px monospace';
                ctx.fillStyle = 'rgba(218,238,255,0.78)';
                ctx.fillText('RANGE::' + subLabel, geometry.tagX + geometry.tagW / 2 + textShift, point.y + 10 * sY);
            }
            if (Number(info.linkedCount || 0) > 1) {
                ctx.font = 'bold ' + Math.round(7 * sX) + 'px monospace';
                ctx.fillStyle = '#020407';
                ctx.fillRect(geometry.tagX + 10 * sX, geometry.tagY - 5 * sY, 38 * sX, 12 * sY);
                ctx.fillStyle = color;
                ctx.fillText('x' + info.linkedCount + ' LINK', geometry.tagX + 29 * sX, geometry.tagY + 1 * sY);
            }

            this._drawTerminalBoot(ctx, point, geometry, rightSide, connected ? color : '#64717C');
            this._drawSplicedEnd(ctx, point, rightSide, activeColor, connected, pulse);
            if (!rightSide && info.showGuide) {
                this._drawDragGuide(ctx, point, color, !!info.guideEmphasis, Number(info.index || 0));
            }
            if (!rightSide && info.rekeying) {
                this._drawTerminalRekey(ctx, point, geometry, Number(info.index || 0));
            }
            ctx.restore();
        }

        _terminalGeometry(point, rightSide) {
            const sX = point.sX;
            const sY = point.sY;
            const density = Number(point.density || 0);
            const isDense = density >= 1;
            const isVeryDense = density >= 2;
            const tagW = rightSide ? (isVeryDense ? 194 * sX : 206 * sX) : (isVeryDense ? 224 * sX : 238 * sX);
            const tagH = (isVeryDense ? 40 : (isDense ? 42 : 46)) * sY;
            const gap = 28 * sX;
            const tagX = rightSide ? point.x + gap : point.x - tagW - gap;
            return {
                tagX: tagX,
                tagY: point.y - tagH / 2,
                tagW: tagW,
                tagH: tagH,
                capW: 38 * sX,
                isDense: isDense,
                isVeryDense: isVeryDense,
            };
        }

        _drawTerminalBoot(ctx, point, geometry, rightSide, color) {
            const sX = point.sX;
            const sY = point.sY;
            const mountDirection = rightSide ? 1 : -1;
            const portEdge = point.x + mountDirection * (point.r + 1 * sX);
            const cardEdge = rightSide ? geometry.tagX : geometry.tagX + geometry.tagW;
            const topAtPort = point.y - 7 * sY;
            const topAtCard = point.y - 10 * sY;
            const boot = ctx.createLinearGradient(Math.min(portEdge, cardEdge), point.y, Math.max(portEdge, cardEdge), point.y);
            boot.addColorStop(0, '#07090C');
            boot.addColorStop(0.48, '#4D5962');
            boot.addColorStop(0.68, '#11161B');
            boot.addColorStop(1, '#020305');
            ctx.beginPath();
            ctx.moveTo(portEdge, topAtPort);
            ctx.lineTo(cardEdge, topAtCard);
            ctx.lineTo(cardEdge, point.y + 10 * sY);
            ctx.lineTo(portEdge, point.y + 7 * sY);
            ctx.closePath();
            ctx.fillStyle = boot;
            ctx.fill();
            ctx.strokeStyle = 'rgba(188,210,221,0.22)';
            ctx.lineWidth = Math.max(1, sX);
            ctx.stroke();

            const gap = Math.abs(cardEdge - portEdge);
            const direction = cardEdge >= portEdge ? 1 : -1;
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.32;
            ctx.lineWidth = 1.5 * sX;
            for (let n = 1; n <= 3; n++) {
                const x = portEdge + direction * gap * (n / 4);
                ctx.beginPath();
                ctx.moveTo(x, point.y - 7.5 * sY);
                ctx.lineTo(x, point.y + 7.5 * sY);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }

        _drawSplicedEnd(ctx, point, rightSide, activeColor, connected, pulse) {
            const sX = point.sX;
            const sY = point.sY;
            const strandDir = rightSide ? -1 : 1;
            const copper = ['#6E2F16', '#C76A2B', '#FFB14A', '#8E3D1C', '#E78631', '#FFD078', '#A94A1E'];
            ctx.save();
            ctx.lineCap = 'round';
            for (let i = -3; i <= 3; i++) {
                const startX = point.x + strandDir * point.r * 0.42;
                const endX = point.x + strandDir * (point.r + (20 + Math.abs(i) * 2.5) * sX);
                const startY = point.y + i * 1.45 * sY;
                const endY = point.y + i * 3.5 * sY + Math.sin(i * 2.1) * 1.4 * sY;
                ctx.beginPath();
                ctx.moveTo(startX, startY);
                ctx.bezierCurveTo(
                    point.x + strandDir * (point.r + 5 * sX),
                    startY,
                    point.x + strandDir * (point.r + 13 * sX),
                    endY,
                    endX,
                    endY
                );
                ctx.strokeStyle = copper[i + 3];
                ctx.lineWidth = (i === 0 ? 2.1 : 1.45) * sX;
                ctx.shadowColor = i === 0 ? 'rgba(255,177,74,0.55)' : 'transparent';
                ctx.shadowBlur = 4 * sX;
                ctx.stroke();
            }
            ctx.shadowColor = 'transparent';

            const outerR = point.r + 4 * sX;
            const ring = ctx.createRadialGradient(
                point.x - outerR * 0.35,
                point.y - outerR * 0.35,
                outerR * 0.08,
                point.x,
                point.y,
                outerR
            );
            ring.addColorStop(0, '#D8E2E7');
            ring.addColorStop(0.28, '#687680');
            ring.addColorStop(0.58, '#10151A');
            ring.addColorStop(0.78, connected ? activeColor : '#3D4952');
            ring.addColorStop(1, '#020305');
            ctx.beginPath();
            ctx.arc(point.x, point.y, outerR, 0, Math.PI * 2);
            ctx.fillStyle = ring;
            ctx.fill();
            ctx.strokeStyle = connected ? activeColor : 'rgba(181,201,211,0.52)';
            ctx.lineWidth = 1.5 * sX;
            ctx.shadowColor = connected ? activeColor : 'transparent';
            ctx.shadowBlur = connected ? (8 + pulse * 8) * sX : 0;
            ctx.stroke();

            const well = ctx.createRadialGradient(point.x - point.r * 0.22, point.y - point.r * 0.22, 1, point.x, point.y, point.r * 0.72);
            well.addColorStop(0, connected ? '#FFFFFF' : '#7F8A91');
            well.addColorStop(0.18, connected ? activeColor : '#3D464C');
            well.addColorStop(0.54, '#0A0D10');
            well.addColorStop(1, '#000000');
            ctx.beginPath();
            ctx.arc(point.x, point.y, point.r * 0.7, 0, Math.PI * 2);
            ctx.fillStyle = well;
            ctx.fill();

            ctx.strokeStyle = 'rgba(255,255,255,0.36)';
            ctx.lineWidth = Math.max(1, 1.2 * sX);
            ctx.beginPath();
            ctx.arc(point.x, point.y, outerR * 0.78, Math.PI * 1.06, Math.PI * 1.68);
            ctx.stroke();
            ctx.restore();
        }

        _drawDragGuide(ctx, point, color, emphasized, rowIndex) {
            const sX = point.sX;
            const sY = point.sY;
            const tick = this.animTick || 0;
            const pulse = 0.5 + 0.5 * Math.sin(tick * 0.18 - rowIndex * 0.58);
            const guideColor = emphasized ? '#FFE600' : '#00F0FF';
            const baseX = point.x + point.r + 33 * sX;
            ctx.save();
            ctx.globalAlpha = emphasized ? (0.66 + pulse * 0.34) : (0.28 + pulse * 0.32);
            ctx.strokeStyle = guideColor;
            ctx.fillStyle = guideColor;
            ctx.shadowColor = guideColor;
            ctx.shadowBlur = (emphasized ? 10 + pulse * 10 : 5 + pulse * 6) * sX;
            ctx.lineWidth = (emphasized ? 2.2 : 1.5) * sX;

            ctx.beginPath();
            ctx.arc(baseX - 7 * sX, point.y, 2.5 * sX, 0, Math.PI * 2);
            ctx.fill();
            for (let i = 0; i < 3; i++) {
                const x = baseX + i * 9 * sX + pulse * 2.5 * sX;
                ctx.beginPath();
                ctx.moveTo(x, point.y - 6 * sY);
                ctx.lineTo(x + 6 * sX, point.y);
                ctx.lineTo(x, point.y + 6 * sY);
                ctx.stroke();
            }
            if (emphasized) {
                ctx.shadowBlur = 4 * sX;
                ctx.font = 'bold ' + Math.round(6.5 * sX) + 'px monospace';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'bottom';
                ctx.fillText('HOLD + DRAG', baseX - 7 * sX, point.y - 9 * sY);
            }
            ctx.restore();
        }

        _rerollDisplayText(state) {
            const target = state && state.next && state.next.ip ? String(state.next.ip) : '0.0.0.0';
            const timer = Math.max(0, Number(this.randomizeTimer || 0));
            const revealFrames = 20;
            const seedBase = (this.animTick || 0) * 17 + Number((state && state.rowIndex) || 0) * 97;
            if (timer > revealFrames) {
                const octets = [];
                for (let i = 0; i < 4; i++) {
                    const wave = Math.sin((seedBase + i * 31) * 12.9898) * 43758.5453;
                    octets.push(Math.floor(Math.abs(wave - Math.floor(wave)) * 256));
                }
                return octets.join('.');
            }

            const progress = Math.max(0, Math.min(1, (revealFrames - timer) / revealFrames));
            const revealCount = Math.floor(target.length * progress);
            let output = '';
            for (let i = 0; i < target.length; i++) {
                const char = target[i];
                if (char === '.' || i < revealCount) {
                    output += char;
                } else {
                    const wave = Math.sin((seedBase + i * 19) * 7.2345) * 19531.743;
                    output += String(Math.floor(Math.abs(wave - Math.floor(wave)) * 10));
                }
            }
            return output;
        }

        _drawTerminalRekey(ctx, point, geometry, rowIndex) {
            const sX = point.sX;
            const sY = point.sY;
            const pulse = 0.5 + 0.5 * Math.sin((this.animTick || 0) * 0.7 + rowIndex);
            const scanX = geometry.tagX + ((this.animTick || 0) * 9 * sX % Math.max(1, geometry.tagW));
            ctx.save();
            this._angularRectPath(ctx, geometry.tagX - 4 * sX, geometry.tagY - 4 * sY, geometry.tagW + 8 * sX, geometry.tagH + 8 * sY, 10 * sX);
            ctx.strokeStyle = 'rgba(255,49,95,' + (0.56 + pulse * 0.4) + ')';
            ctx.lineWidth = 2 * sX;
            ctx.shadowColor = '#FF315F';
            ctx.shadowBlur = (8 + pulse * 9) * sX;
            ctx.stroke();

            const scan = ctx.createLinearGradient(scanX - 15 * sX, 0, scanX + 15 * sX, 0);
            scan.addColorStop(0, 'rgba(255,49,95,0)');
            scan.addColorStop(0.5, 'rgba(255,230,0,0.25)');
            scan.addColorStop(1, 'rgba(255,49,95,0)');
            ctx.fillStyle = scan;
            ctx.fillRect(scanX - 15 * sX, geometry.tagY + 3 * sY, 30 * sX, geometry.tagH - 6 * sY);

            ctx.shadowBlur = 4 * sX;
            ctx.fillStyle = '#FF315F';
            this._angularRectPath(ctx, geometry.tagX + 9 * sX, geometry.tagY - 7 * sY, 48 * sX, 12 * sY, 3 * sX);
            ctx.fill();
            ctx.font = 'bold ' + Math.round(6.2 * sX) + 'px monospace';
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('RE-KEYING', geometry.tagX + 33 * sX, geometry.tagY - 1 * sY);
            ctx.restore();
        }

        _drawRerollOverlay(ctx, layout, font) {
            if (!this.randomizeTimer || !this.randomizingWires || !Object.keys(this.randomizingWires).length) return;
            const p = layout.panel;
            const sX = layout.sX;
            const sY = layout.sY;
            const duration = Math.max(1, Number(this.randomizeDuration || 1));
            const remaining = Math.max(0, Number(this.randomizeTimer || 0));
            const progress = 1 - remaining / duration;
            const countdown = Math.max(1, Math.ceil(remaining / (duration / 3)));
            const w = 286 * sX;
            const h = 34 * sY;
            const x = p.x + p.w / 2 - w / 2;
            const y = p.y + 78 * sY;
            const affected = Object.keys(this.randomizingWires).length;

            ctx.save();
            ctx.shadowColor = '#FF315F';
            ctx.shadowBlur = 14 * sX;
            this._angularRectPath(ctx, x, y, w, h, 8 * sX);
            const bg = ctx.createLinearGradient(x, y, x + w, y + h);
            bg.addColorStop(0, 'rgba(86,0,28,0.96)');
            bg.addColorStop(0.48, 'rgba(12,8,16,0.98)');
            bg.addColorStop(1, 'rgba(38,18,0,0.96)');
            ctx.fillStyle = bg;
            ctx.fill();
            ctx.strokeStyle = '#FF315F';
            ctx.lineWidth = 1.5 * sX;
            ctx.stroke();
            ctx.shadowColor = 'transparent';

            ctx.fillStyle = '#FFE600';
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 46 * sX, y);
            ctx.lineTo(x + 35 * sX, y + h);
            ctx.lineTo(x, y + h);
            ctx.closePath();
            ctx.fill();

            ctx.font = 'bold ' + Math.round(15 * sX) + 'px ' + font;
            ctx.fillStyle = '#05070A';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(countdown).padStart(2, '0'), x + 20 * sX, y + h / 2);

            ctx.font = 'bold ' + Math.round(8 * sX) + 'px monospace';
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'left';
            ctx.fillText('APEX ADAPTIVE RE-KEY', x + 57 * sX, y + 13 * sY);
            ctx.font = Math.round(6.2 * sX) + 'px monospace';
            ctx.fillStyle = 'rgba(217,234,242,0.74)';
            ctx.fillText(affected + ' REJECTED LEAD' + (affected === 1 ? '' : 'S') + ' // SHIFTING IP TOKENS', x + 57 * sX, y + 24 * sY);

            const barX = x + 57 * sX;
            const barY = y + 29 * sY;
            const barW = w - 68 * sX;
            ctx.fillStyle = 'rgba(89,103,113,0.26)';
            ctx.fillRect(barX, barY, barW, 2 * sY);
            ctx.fillStyle = progress > 0.7 ? '#FFE600' : '#FF315F';
            ctx.fillRect(barX, barY, barW * progress, 2 * sY);

            ctx.globalAlpha = 0.35 + 0.3 * Math.sin((this.animTick || 0) * 0.9);
            for (let i = 0; i < 5; i++) {
                const glitchW = (18 + (i * 13) % 44) * sX;
                const glitchX = x + ((this.animTick || 0) * (7 + i) + i * 41) % Math.max(1, w - glitchW);
                ctx.fillStyle = i % 2 ? '#00F0FF' : '#FF315F';
                ctx.fillRect(glitchX, y + (4 + i * 6) * sY, glitchW, Math.max(1, 1.2 * sY));
            }
            ctx.restore();
        }

        _terminalBounds(point, rightSide, includeGuide) {
            const g = this._terminalGeometry(point, rightSide);
            const sX = point.sX;
            const sY = point.sY;
            const minX = rightSide ? point.x - point.r - 30 * sX : g.tagX - 4 * sX;
            const maxX = rightSide
                ? g.tagX + g.tagW + 4 * sX
                : point.x + point.r + (includeGuide ? 74 : 30) * sX;
            return {
                x: minX,
                y: g.tagY - 9 * sY,
                w: maxX - minX,
                h: g.tagH + 18 * sY,
            };
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
                    this._drawWire(ctx, from.x, from.y, to.x, to.y, '#7D8791', 7 * layout.sX, false);
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
                this._drawGradientWire(ctx, fail.fromX, fail.fromY, toX, toY, width, ratio, ['#6B747D', '#AEB7C2']);
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

            const leftX = panel.x + Math.max(286 * sX, panel.w * 0.263);
            const rightX = panel.x + panel.w - Math.max(260 * sX, panel.w * 0.25);
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

            const bankY = panel.y + 102 * sY;
            const bankH = panel.h - 170 * sY;
            const leftBank = {
                x: panel.x + 25 * sX,
                y: bankY,
                w: leftX - panel.x + 88 * sX - 25 * sX,
                h: bankH,
            };
            const rightBank = {
                x: rightX - 54 * sX,
                y: bankY,
                w: panel.x + panel.w - 25 * sX - (rightX - 54 * sX),
                h: bankH,
            };
            return {
                cW, cH, sX, sY, panel, leftX, rightX, topY, bottomY,
                leftPoints, rightPoints, leftBank, rightBank,
            };
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

            if (this._isHarderMode() && this.options && this.options.adaptiveReroll !== false) {
                const deferredFailure = this.pendingFailureExit;
                this.pendingFailureExit = null;
                this._beginHarderReroll(mistakes, deferredFailure);
                return;
            }

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

        _beginHarderReroll(mistakes, deferredFailure) {
            const list = Array.isArray(mistakes) ? mistakes : [];
            const sourceIds = list.map((mistake) => mistake && mistake.sourceId).filter(Boolean);
            const planned = this._buildHarderRerollPlan(sourceIds);
            const plannedIds = Object.keys(planned);
            this.pendingMistakeDialogue = null;
            this._deferredFailureExit = deferredFailure || null;

            if (!plannedIds.length) {
                const failure = this._deferredFailureExit;
                this._deferredFailureExit = null;
                if (failure) this._failOut(failure);
                return false;
            }

            this.randomizingWires = planned;
            this.randomizeDuration = 84;
            this.randomizeTimer = this.randomizeDuration;

            if (this.options && this.options.strictTutorial) {
                const tutorial = IP2Live.IPWiresTutorial;
                if (tutorial && typeof tutorial.setGuidedHighlight === 'function') {
                    tutorial.setGuidedHighlight(this, 'reroll', {
                        sourceIds: plannedIds,
                        label: 'APEX RE-KEY // REJECTED SOURCES',
                    });
                }
            }

            try {
                if (IP2Live.SoundFX && typeof IP2Live.SoundFX.playGlitch === 'function') IP2Live.SoundFX.playGlitch();
            } catch (e) {}

            if (IP2Live.GameManager && typeof IP2Live.GameManager.handleGameplayMistake === 'function') {
                IP2Live.GameManager.handleGameplayMistake(this.gameplayId, {
                    mapId: this.options.mapId || 5,
                    questId: this.options.questId,
                    objectiveId: this.options.objectiveId,
                    mistakes: list,
                    attemptsRemaining: Math.max(0, this.maxAttempts - this.attemptsUsed),
                    rerollSourceIds: plannedIds.slice(),
                    adaptiveReroll: true,
                    screen: this,
                });
            }

            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            return true;
        }

        _buildHarderRerollPlan(sourceIds) {
            const requested = {};
            const ids = Array.isArray(sourceIds) ? sourceIds : [];
            for (let i = 0; i < ids.length; i++) requested[String(ids[i])] = true;
            const rerollItems = [];
            const fixedClasses = [];
            const fixedSet = {};

            for (let i = 0; i < this.leftItems.length; i++) {
                const item = this.leftItems[i];
                if (requested[item.id] && !this.lockedCorrect[item.id]) {
                    rerollItems.push({ item: item, rowIndex: i });
                } else if (this.lockedCorrect[item.id] && !fixedSet[item.className]) {
                    fixedSet[item.className] = true;
                    fixedClasses.push(item.className);
                }
            }
            if (!rerollItems.length) return {};

            const availableClasses = orderedClassSpecs(this.classSpecs).map((entry) => entry.className).filter(Boolean);
            const minimumDistinct = Math.min(3, availableClasses.length, this.leftItems.length);
            const minimumTarget = Math.max(minimumDistinct, fixedClasses.length);
            const maximumTarget = Math.min(5, availableClasses.length, fixedClasses.length + rerollItems.length, this.leftItems.length);
            const low = Math.min(minimumTarget, maximumTarget);
            const high = Math.max(low, maximumTarget);
            const desiredDistinct = low + Math.floor(Math.random() * (high - low + 1));
            const chosen = fixedClasses.slice();
            const chosenSet = Object.assign({}, fixedSet);
            const unselected = shuffle(availableClasses.filter((className) => !chosenSet[className]));

            while (chosen.length < desiredDistinct && unselected.length) {
                const className = unselected.shift();
                chosen.push(className);
                chosenSet[className] = true;
            }

            const assignments = chosen.filter((className) => !fixedSet[className]);
            while (assignments.length < rerollItems.length) {
                assignments.push(chosen[Math.floor(Math.random() * chosen.length)] || availableClasses[0] || 'A');
            }
            const randomizedAssignments = shuffle(assignments.slice(0, rerollItems.length));
            const output = {};

            for (let i = 0; i < rerollItems.length; i++) {
                const row = rerollItems[i];
                const className = randomizedAssignments[i] || availableClasses[0] || 'A';
                let generated = this._fallbackGeneratedForClass(className);
                for (let retry = 0; retry < 4 && generated && generated.ip === row.item.ip; retry++) {
                    generated = this._fallbackGeneratedForClass(className);
                }
                output[row.item.id] = {
                    sourceId: row.item.id,
                    rowIndex: row.rowIndex,
                    previous: {
                        ip: row.item.ip,
                        className: row.item.className,
                        color: row.item.color,
                    },
                    next: {
                        ip: generated && generated.ip ? generated.ip : row.item.ip,
                        className: generated && generated.className ? generated.className : className,
                        color: generated && generated.color ? generated.color : this._classColor(className),
                    },
                };
            }
            return output;
        }

        _commitHarderReroll() {
            const states = this.randomizingWires || {};
            const sourceIds = Object.keys(states);
            const changed = [];
            for (let i = 0; i < sourceIds.length; i++) {
                const state = states[sourceIds[i]];
                const item = this._itemById(this.leftItems, sourceIds[i]);
                if (!item || !state || !state.next) continue;
                item.ip = state.next.ip;
                item.className = state.next.className;
                item.color = state.next.color;
                changed.push({
                    sourceId: item.id,
                    rowIndex: state.rowIndex,
                    previousIP: state.previous.ip,
                    previousClass: state.previous.className,
                    ip: item.ip,
                    className: item.className,
                });
            }

            this.randomizingWires = {};
            this.randomizeTimer = 0;
            this.randomizeDuration = 0;
            const deferredFailure = this._deferredFailureExit;
            this._deferredFailureExit = null;

            const finish = () => {
                const tutorial = IP2Live.IPWiresTutorial;
                if (tutorial && typeof tutorial.clearGuidedHighlight === 'function') tutorial.clearGuidedHighlight(this);
                if (deferredFailure) this._failOut(deferredFailure);
                if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            };

            if (
                this.options && this.options.strictTutorial &&
                IP2Live.IPWiresHarderTutorial &&
                typeof IP2Live.IPWiresHarderTutorial.showMismatchShift === 'function'
            ) {
                IP2Live.IPWiresHarderTutorial.showMismatchShift(
                    this,
                    changed,
                    Math.max(0, this.maxAttempts - this.attemptsUsed),
                    finish
                );
                return;
            }
            finish();
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
                    color: '#AEB7C2',
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

        _isSourceHit(x, y, point) {
            if (!point) return false;
            if (this._distance(x, y, point.x, point.y) <= point.r * 1.55) return true;
            const guideLeft = point.x + point.r * 0.25;
            const guideRight = point.x + point.r + 73 * point.sX;
            return x >= guideLeft && x <= guideRight && Math.abs(y - point.y) <= 16 * point.sY;
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
        VERSION: 'ip-wires-gameplay-manager-20260815-04',
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
            if (IP2Live.QuestMinimap) {
                if (!IP2Live.QuestMinimap.isActive()) IP2Live.QuestMinimap.create();
                else IP2Live.QuestMinimap.update();
            }
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
