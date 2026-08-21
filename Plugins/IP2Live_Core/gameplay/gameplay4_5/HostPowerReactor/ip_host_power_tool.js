/**
 * IP2Live - Gameplay 4.5 Compact Host-Power Tool
 *
 * One-third-width vertical calculator:
 *   reactor -> needed hosts -> draggable bubbles -> live calculator.
 * Positive bubbles add host bits; -1 and -2 bubbles subtract them.
 */

class IP2LiveHostPowerToolScreen extends Scene.Base {
    constructor(options) {
        super(true);
        this.options = options || {};
        this._configure();
    }

    initialize() {
        this.options = this.options || {};
        this._configure();
    }

    _configure() {
        const rules = IP2Live.HostPowerRules || window.IP2LiveHostPowerRules;
        if (!rules) throw new Error('HostPowerRules must load before the compact tool.');
        this.rules = rules;
        this.scenario = this.options.scenario || rules.createScenario(this.options);
        this.exponent = Math.max(0, Math.min(this.scenario.classConfig.maxHostBits, Number(this.options.startExponent) || 0));
        this.evaluation = rules.evaluate(this.scenario.requiredHosts, this.exponent);
        this.animTick = 0;
        this.loading = false;
        this.draggedBubble = null;
        this.dragX = 0;
        this.dragY = 0;
        this.bubbleRects = [];
        this.buttons = [];
        this.classRects = [];
        this.selectedBubble = 0;
        this.correctReported = false;
        this.lastMetrics = null;
        this.history = [];
    }

    async load() {
        this.loading = false;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    update() {
        this.animTick++;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    _metrics() {
        const ctx = Common.Platform.ctx;
        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const designW = (Common.ScreenResolution && Common.ScreenResolution.SCREEN_X) || 1280;
        const designH = (Common.ScreenResolution && Common.ScreenResolution.SCREEN_Y) || 720;
        const sX = cW / designW;
        const sY = cH / designH;
        const scale = Math.max(0.68, Math.min(1.25, Math.min(sX, sY)));
        const margin = 18 * scale;
        const w = Math.min(cW / 3, 390 * sX);
        const h = Math.min(cH - margin * 2, 680 * sY);
        const x = this.options.align === 'left' ? margin : cW - w - margin;
        const y = (cH - h) * 0.5;
        const innerX = x + 14 * scale;
        const innerW = w - 28 * scale;
        const headerH = 42 * scale;
        const reactorH = h * 0.27;
        const neededH = h * 0.14;
        const bubblesH = h * 0.18;
        const footerH = 54 * scale;
        const calculatorY = y + headerH + reactorH + neededH + bubblesH;
        return {
            cW, cH, sX, sY, scale,
            x, y, w, h, innerX, innerW, headerH, reactorH, neededH, bubblesH, footerH,
            reactor: { x: innerX, y: y + headerH, w: innerW, h: reactorH - 8 * scale },
            needed: { x: innerX, y: y + headerH + reactorH, w: innerW, h: neededH - 8 * scale },
            bubbles: { x: innerX, y: y + headerH + reactorH + neededH, w: innerW, h: bubblesH - 8 * scale },
            calculator: { x: innerX, y: calculatorY, w: innerW, h: y + h - footerH - calculatorY - 8 * scale },
            footer: { x: innerX, y: y + h - footerH, w: innerW, h: footerH - 10 * scale },
        };
    }

    onKeyPressed(key) {
        if (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive()) {
            const valueWhenDialogue = key && (key.name || key.code || key);
            const upperWhenDialogue = String(valueWhenDialogue || '').toUpperCase();
            if (upperWhenDialogue === 'ENTER' || upperWhenDialogue === 'SPACE' || upperWhenDialogue === 'SPACEBAR') {
                IP2Live.DialogueManager.advance();
            }
            return true;
        }
        if (Data.Keyboards.checkCancelMenu && Data.Keyboards.checkCancelMenu(key)) {
            this._close();
            return true;
        }
        const value = key && (key.name || key.code || key);
        const upper = String(value || '').toUpperCase();
        if (upper === 'ARROWLEFT' || upper === 'A' || upper === 'KEYA') {
            this.selectedBubble = (this.selectedBubble + 6) % 7;
            return true;
        }
        if (upper === 'ARROWRIGHT' || upper === 'D' || upper === 'KEYD') {
            this.selectedBubble = (this.selectedBubble + 1) % 7;
            return true;
        }
        if (upper === 'ENTER' || upper === 'SPACE' || upper === 'SPACEBAR') {
            this._applyBubble([1, 2, 3, 4, 5, -1, -2][this.selectedBubble]);
            return true;
        }
        if (upper === 'R' || upper === 'KEYR') {
            this._reset();
            return true;
        }
        if (upper === 'N' || upper === 'KEYN') {
            this._newScenario();
            return true;
        }
        return true;
    }

    onKeyPressedAndRepeat(key) {
        return this.onKeyPressed(key);
    }

    onMouseDown(x, y) {
        if (IP2Live.DialogueManager && IP2Live.DialogueManager.isActive()) {
            IP2Live.DialogueManager.advance();
            return true;
        }
        const m = this.lastMetrics || this._metrics();
        this._buildHitRects(m);
        for (let i = 0; i < this.bubbleRects.length; i++) {
            const bubble = this.bubbleRects[i];
            if (!this._pointInCircle(x, y, bubble)) continue;
            this.draggedBubble = Object.assign({}, bubble);
            this.dragX = x;
            this.dragY = y;
            this.selectedBubble = i;
            this._playCursor();
            return true;
        }
        for (let i = 0; i < this.classRects.length; i++) {
            const rect = this.classRects[i];
            if (!this._pointInRect(x, y, rect)) continue;
            this._newScenario(rect.className);
            return true;
        }
        for (let i = 0; i < this.buttons.length; i++) {
            const button = this.buttons[i];
            if (!this._pointInRect(x, y, button)) continue;
            if (button.action === 'reset') this._reset();
            else if (button.action === 'new') this._newScenario();
            else if (button.action === 'close') this._close();
            return true;
        }
        return true;
    }

    onMouseMove(x, y) {
        if (!this.draggedBubble) return true;
        this.dragX = x;
        this.dragY = y;
        return true;
    }

    onMouseUp(x, y) {
        if (!this.draggedBubble) return true;
        const bubble = this.draggedBubble;
        const m = this.lastMetrics || this._metrics();
        this.draggedBubble = null;
        if (this._pointInRect(x, y, m.calculator)) this._applyBubble(bubble.value);
        else this._playCancel();
        return true;
    }

    _applyBubble(value) {
        const previous = this.exponent;
        this.exponent = Math.max(0, Math.min(this.scenario.classConfig.maxHostBits, this.exponent + Number(value || 0)));
        this.evaluation = this.rules.evaluate(this.scenario.requiredHosts, this.exponent);
        this.history.push({ value: Number(value || 0), previousExponent: previous, exponent: this.exponent });
        this._playConfirm();
        if (this.evaluation.valid && !this.correctReported) {
            this.correctReported = true;
            if (this.options.neutralFeedback !== true && typeof this.options.onCorrect === 'function') {
                this.options.onCorrect({
                    gameplayId: 'ip_host_power_tool',
                    className: this.scenario.className,
                    requiredHosts: this.scenario.requiredHosts,
                    exponent: this.exponent,
                    targetExponent: this.scenario.targetExponent,
                    bitsToBorrow: this.scenario.bitsToBorrow,
                    totalAddresses: this.evaluation.totalAddresses,
                    usableHosts: this.evaluation.usableHosts,
                    history: this.history.slice(),
                });
            }
        } else if (!this.evaluation.valid) {
            this.correctReported = false;
        }
    }

    _reset() {
        this.exponent = 0;
        this.evaluation = this.rules.evaluate(this.scenario.requiredHosts, this.exponent);
        this.history = [];
        this.correctReported = false;
        this._playCursor();
    }

    _newScenario(forcedClass) {
        if (this.options.lockScenario === true) return false;
        const targetClass = forcedClass || this.options.targetClass;
        this.scenario = this.rules.createScenario({
            targetClass,
            targetClasses: this.options.targetClasses || ['A', 'B', 'C'],
        });
        this._reset();
    }

    _close() {
        if (typeof this.options.onClose === 'function') this.options.onClose({
            className: this.scenario.className,
            requiredHosts: this.scenario.requiredHosts,
            exponent: this.exponent,
            evaluation: Object.assign({}, this.evaluation),
        });
    }

    draw3D() {
        const background = this.options.backgroundScene;
        if (background && background !== this && typeof background.draw3D === 'function') {
            background.draw3D();
        }
    }

    drawHUD() {
        const ctx = Common.Platform.ctx;
        const background = this.options.backgroundScene;
        if (this.options.preserveBackground === true && background && background !== this && typeof background.drawHUD === 'function') {
            background.drawHUD();
        }
        const m = this._metrics();
        this.lastMetrics = m;
        this._buildHitRects(m);
        ctx.save();
        if (this.options.preserveBackground !== true) this._drawBackdrop(ctx, m);
        this._drawPanel(ctx, m);
        this._drawHeader(ctx, m);
        this._drawGenerator(ctx, m);
        this._drawNeeded(ctx, m);
        this._drawBubbles(ctx, m);
        this._drawCalculator(ctx, m);
        this._drawFooter(ctx, m);
        if (this.draggedBubble) this._drawBubble(ctx, {
            x: this.dragX,
            y: this.dragY,
            radius: this.draggedBubble.radius * 1.07,
            value: this.draggedBubble.value,
            selected: true,
        }, m);
        ctx.restore();
    }

    _drawBackdrop(ctx, m) {
        ctx.fillStyle = 'rgba(0, 3, 8, 0.42)';
        ctx.fillRect(0, 0, m.cW, m.cH);
    }

    _drawPanel(ctx, m) {
        ctx.save();
        ctx.shadowColor = 'rgba(0, 224, 255, 0.28)';
        ctx.shadowBlur = 18 * m.scale;
        this._chamferPath(ctx, m.x, m.y, m.w, m.h, 14 * m.scale);
        const gradient = ctx.createLinearGradient(m.x, m.y, m.x, m.y + m.h);
        gradient.addColorStop(0, 'rgba(5, 20, 27, 0.99)');
        gradient.addColorStop(0.55, 'rgba(3, 11, 17, 0.99)');
        gradient.addColorStop(1, 'rgba(1, 6, 11, 0.99)');
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = '#258da0';
        ctx.lineWidth = 1.4 * m.scale;
        ctx.stroke();
        ctx.restore();
    }

    _drawHeader(ctx, m) {
        const titleFont = IP2Live.Assets && IP2Live.Assets.abnesLoaded ? 'Abnes' : 'monospace';
        ctx.fillStyle = '#e9fbff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold ' + Math.round(13 * m.scale) + 'px ' + titleFont;
        ctx.fillText('HOST-POWER TOOL', m.innerX, m.y + 17 * m.scale);
        ctx.fillStyle = '#668f98';
        ctx.font = 'bold ' + Math.round(7 * m.scale) + 'px monospace';
        ctx.fillText('DRAG A BUBBLE INTO THE CALCULATOR', m.innerX, m.y + 33 * m.scale);
    }

    _drawGenerator(ctx, m) {
        const b = m.reactor;
        const color = this._statusColor();
        const neutral = this.options.neutralFeedback === true;
        const ratioBase = neutral ? this.scenario.classConfig.maxHostBits : this.scenario.targetExponent;
        const ratio = Math.max(0, Math.min(1.2, this.exponent / Math.max(1, ratioBase)));
        this._section(ctx, b, m, 'MINI REACTOR');
        const cx = b.x + b.w * 0.5;
        const cy = b.y + b.h * 0.57;
        const radius = Math.min(b.w * 0.18, b.h * 0.28);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.animTick * 0.004);
        ctx.strokeStyle = 'rgba(67, 112, 121, 0.54)';
        ctx.lineWidth = 9 * m.scale;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 13 * m.scale;
        ctx.beginPath();
        ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, ratio));
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = '#f4fdff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold ' + Math.round(24 * m.scale) + 'px monospace';
        ctx.fillText(String(this.exponent), cx, cy - 2 * m.scale);
        ctx.fillStyle = color;
        ctx.font = 'bold ' + Math.round(8 * m.scale) + 'px monospace';
        ctx.fillText(neutral ? 'HOST BITS' : (this.evaluation.status === 'under' ? 'LOW' : (this.evaluation.status === 'over' ? 'TOO MUCH' : 'JUST RIGHT')), cx, b.y + b.h - 14 * m.scale);
    }

    _drawNeeded(ctx, m) {
        const b = m.needed;
        this._section(ctx, b, m, 'NEEDED HOSTS');
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold ' + Math.round(20 * m.scale) + 'px monospace';
        ctx.fillText(this._formatNumber(this.scenario.requiredHosts), b.x + 12 * m.scale, b.y + b.h * 0.60);
        ctx.fillStyle = '#ffce66';
        ctx.font = 'bold ' + Math.round(7.5 * m.scale) + 'px monospace';
        ctx.fillText('+2 RESERVED = ' + this._formatNumber(this.scenario.addressDemand) + ' ADDRESSES', b.x + 12 * m.scale, b.y + b.h * 0.83);
        const chipW = 29 * m.scale;
        const chipGap = 5 * m.scale;
        const startX = b.x + b.w - (chipW * 3 + chipGap * 2) - 10 * m.scale;
        for (let i = 0; i < this.classRects.length; i++) {
            const chip = this.classRects[i];
            const active = chip.className === this.scenario.className;
            this._roundedRect(ctx, startX + i * (chipW + chipGap), b.y + 12 * m.scale, chipW, 24 * m.scale, 4 * m.scale);
            ctx.fillStyle = active ? 'rgba(0, 139, 158, 0.92)' : 'rgba(18, 45, 52, 0.92)';
            ctx.fill();
            ctx.strokeStyle = active ? '#5eefff' : '#41656d';
            ctx.stroke();
            ctx.fillStyle = '#effeff';
            ctx.textAlign = 'center';
            ctx.font = 'bold ' + Math.round(9 * m.scale) + 'px monospace';
            ctx.fillText(chip.className, startX + i * (chipW + chipGap) + chipW * 0.5, b.y + 24 * m.scale);
        }
    }

    _drawBubbles(ctx, m) {
        const b = m.bubbles;
        this._section(ctx, b, m, 'POWER BUBBLES  //  REUSABLE');
        for (let i = 0; i < this.bubbleRects.length; i++) {
            const bubble = this.bubbleRects[i];
            this._drawBubble(ctx, Object.assign({}, bubble, { selected: i === this.selectedBubble }), m);
        }
    }

    _drawBubble(ctx, bubble, m) {
        const positive = bubble.value > 0;
        ctx.save();
        ctx.shadowColor = positive ? '#00dfff' : '#ff315f';
        ctx.shadowBlur = bubble.selected ? 12 * m.scale : 6 * m.scale;
        const gradient = ctx.createRadialGradient(
            bubble.x - bubble.radius * 0.28,
            bubble.y - bubble.radius * 0.32,
            bubble.radius * 0.12,
            bubble.x,
            bubble.y,
            bubble.radius
        );
        if (positive) {
            gradient.addColorStop(0, '#b5f6ff');
            gradient.addColorStop(0.25, '#1587a6');
            gradient.addColorStop(1, '#042d45');
        } else {
            gradient.addColorStop(0, '#ffc0cb');
            gradient.addColorStop(0.25, '#a51638');
            gradient.addColorStop(1, '#3a0717');
        }
        ctx.beginPath();
        ctx.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = positive ? '#70edff' : '#ff5d78';
        ctx.lineWidth = bubble.selected ? 2.3 * m.scale : 1.2 * m.scale;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold ' + Math.round(10 * m.scale) + 'px monospace';
        ctx.fillText((positive ? '+' : '') + bubble.value, bubble.x, bubble.y);
        ctx.restore();
    }

    _drawCalculator(ctx, m) {
        const b = m.calculator;
        const color = this._statusColor();
        const neutral = this.options.neutralFeedback === true;
        this._section(ctx, b, m, 'DROP ZONE // CALCULATOR');
        ctx.save();
        ctx.setLineDash([6 * m.scale, 5 * m.scale]);
        this._roundedRect(ctx, b.x + 10 * m.scale, b.y + 31 * m.scale, b.w - 20 * m.scale, b.h - 43 * m.scale, 8 * m.scale);
        ctx.fillStyle = this.draggedBubble ? 'rgba(0, 122, 145, 0.15)' : 'rgba(0, 10, 16, 0.34)';
        ctx.fill();
        ctx.strokeStyle = this.draggedBubble ? '#61efff' : 'rgba(73, 128, 140, 0.54)';
        ctx.lineWidth = 1.2 * m.scale;
        ctx.stroke();
        ctx.restore();

        const centerX = b.x + b.w * 0.5;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#eefcff';
        ctx.font = 'bold ' + Math.round(22 * m.scale) + 'px monospace';
        ctx.fillText('2^' + this.exponent + ' = ' + this._formatNumber(this.evaluation.totalAddresses), centerX, b.y + b.h * 0.46);
        ctx.fillStyle = '#759da7';
        ctx.font = 'bold ' + Math.round(8 * m.scale) + 'px monospace';
        ctx.fillText('TOTAL ADDRESSES - 2 RESERVED', centerX, b.y + b.h * 0.62);
        ctx.fillStyle = color;
        ctx.font = 'bold ' + Math.round(13 * m.scale) + 'px monospace';
        ctx.fillText(this._formatNumber(this.evaluation.usableHosts) + ' USABLE', centerX, b.y + b.h * 0.75);
        ctx.font = 'bold ' + Math.round(8 * m.scale) + 'px monospace';
        const direction = neutral
            ? 'CIDR /' + (32 - this.exponent) + '  //  BORROWED ' + Math.max(0, this.scenario.classConfig.maxHostBits - this.exponent)
            : (this.evaluation.status === 'under'
                ? 'ADD ' + (this.scenario.targetExponent - this.exponent) + ' BIT(S)'
                : (this.evaluation.status === 'over'
                    ? 'REMOVE ' + (this.exponent - this.scenario.targetExponent) + ' BIT(S)'
                    : 'BORROW ' + this.scenario.classConfig.maxHostBits + ' - ' + this.exponent + ' = ' + this.scenario.bitsToBorrow + ' BIT(S)'));
        ctx.fillText(direction, centerX, b.y + b.h * 0.87);
    }

    _drawFooter(ctx, m) {
        for (let i = 0; i < this.buttons.length; i++) {
            const button = this.buttons[i];
            this._roundedRect(ctx, button.x, button.y, button.w, button.h, 4 * m.scale);
            ctx.fillStyle = button.action === 'close' ? 'rgba(75, 18, 31, 0.92)' : 'rgba(8, 64, 76, 0.92)';
            ctx.fill();
            ctx.strokeStyle = button.action === 'close' ? '#ff536f' : '#49dce9';
            ctx.lineWidth = 1 * m.scale;
            ctx.stroke();
            ctx.fillStyle = '#eafdff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold ' + Math.round(7.5 * m.scale) + 'px monospace';
            ctx.fillText(button.label, button.x + button.w * 0.5, button.y + button.h * 0.5);
        }
    }

    _section(ctx, box, m, label) {
        this._roundedRect(ctx, box.x, box.y, box.w, box.h, 7 * m.scale);
        ctx.fillStyle = 'rgba(2, 12, 18, 0.86)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(53, 118, 130, 0.40)';
        ctx.lineWidth = 1 * m.scale;
        ctx.stroke();
        ctx.fillStyle = '#719ba4';
        ctx.font = 'bold ' + Math.round(7.5 * m.scale) + 'px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, box.x + 10 * m.scale, box.y + 14 * m.scale);
    }

    _buildHitRects(m) {
        const values = [1, 2, 3, 4, 5, -1, -2];
        const radius = Math.min(17 * m.scale, m.bubbles.w / 16);
        const available = m.bubbles.w - radius * 2;
        const spacing = available / Math.max(1, values.length - 1);
        const y = m.bubbles.y + m.bubbles.h * 0.62;
        this.bubbleRects = values.map((value, index) => ({
            x: m.bubbles.x + radius + index * spacing,
            y,
            radius,
            value,
        }));

        const chipW = 29 * m.scale;
        const chipGap = 5 * m.scale;
        const startX = m.needed.x + m.needed.w - (chipW * 3 + chipGap * 2) - 10 * m.scale;
        this.classRects = (this.options.lockScenario === true ? [] : ['A', 'B', 'C']).map((className, index) => ({
            x: startX + index * (chipW + chipGap),
            y: m.needed.y + 12 * m.scale,
            w: chipW,
            h: 24 * m.scale,
            className,
        }));

        const buttonGap = 6 * m.scale;
        if (this.options.lockScenario === true) {
            const buttonW = (m.footer.w - buttonGap) / 2;
            this.buttons = [
                { x: m.footer.x, y: m.footer.y, w: buttonW, h: m.footer.h, action: 'reset', label: 'RESET (R)' },
                { x: m.footer.x + buttonW + buttonGap, y: m.footer.y, w: buttonW, h: m.footer.h, action: 'close', label: 'CLOSE' },
            ];
        } else {
            const buttonW = (m.footer.w - buttonGap * 2) / 3;
            this.buttons = [
                { x: m.footer.x, y: m.footer.y, w: buttonW, h: m.footer.h, action: 'reset', label: 'RESET (R)' },
                { x: m.footer.x + buttonW + buttonGap, y: m.footer.y, w: buttonW, h: m.footer.h, action: 'new', label: 'NEW (N)' },
                { x: m.footer.x + (buttonW + buttonGap) * 2, y: m.footer.y, w: buttonW, h: m.footer.h, action: 'close', label: 'CLOSE' },
            ];
        }
    }

    _statusColor() {
        if (this.options.neutralFeedback === true) return '#62e7f4';
        if (this.evaluation.status === 'just-right') return '#52ff8f';
        if (this.evaluation.status === 'over') return '#ff315f';
        return '#f5b942';
    }

    _formatNumber(value) {
        return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('en-US');
    }

    _roundedRect(ctx, x, y, w, h, radius) {
        const r = Math.max(0, Math.min(radius || 0, w * 0.5, h * 0.5));
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    _chamferPath(ctx, x, y, w, h, cut) {
        const c = Math.max(0, Math.min(cut || 0, w * 0.2, h * 0.2));
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

    _pointInRect(x, y, rect) {
        return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    }

    _pointInCircle(x, y, circle) {
        const dx = x - circle.x;
        const dy = y - circle.y;
        return dx * dx + dy * dy <= circle.radius * circle.radius;
    }

    _playCursor() {
        try { if (Data.Systems.soundCursor) Data.Systems.soundCursor.playSound(); } catch (e) { }
    }

    _playConfirm() {
        try { if (Data.Systems.soundConfirmation) Data.Systems.soundConfirmation.playSound(); } catch (e) { }
    }

    _playCancel() {
        try { if (Data.Systems.soundCancel) Data.Systems.soundCancel.playSound(); } catch (e) { }
    }
}

const HostPowerToolManager = {
    VERSION: 'ip-host-power-tool-manager-20260821-01',
    _active: false,

    launchHostPowerTool(options) {
        const opts = options || {};
        if (this._active) return false;
        this._active = true;

        let scenario;
        try {
            scenario = opts.scenario || IP2Live.HostPowerRules.createScenario(opts);
        } catch (error) {
            this._active = false;
            console.warn('[IP2Live] Host-Power Tool scenario rejected:', error);
            return false;
        }

        const openTool = () => {
            const screen = new IP2LiveHostPowerToolScreen(Object.assign({}, opts, {
                scenario,
                onClose: (result) => {
                    this._active = false;
                    if (Manager && Manager.Stack && typeof Manager.Stack.pop === 'function') Manager.Stack.pop();
                    if (typeof opts.onClose === 'function') opts.onClose(result);
                    if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
                },
            }));
            if (Manager && Manager.Stack && typeof Manager.Stack.push === 'function') {
                Manager.Stack.push(screen);
                return true;
            }
            this._active = false;
            return false;
        };

        const tutorial = IP2Live.IPHostPowerReactorTutorial;
        if (opts.showIntro === true && tutorial && typeof tutorial.showToolIntro === 'function') {
            const shown = tutorial.showToolIntro(scenario, openTool);
            if (shown) return true;
        }
        return openTool();
    },

    show(options) {
        return this.launchHostPowerTool(options || {});
    },

    hide() {
        if (!this._active) return false;
        this._active = false;
        if (Manager && Manager.Stack && typeof Manager.Stack.pop === 'function') Manager.Stack.pop();
        return true;
    },

    destroy() {
        return this.hide();
    },
};

IP2Live.HostPowerToolScreen = IP2LiveHostPowerToolScreen;
IP2Live.HostPowerToolManager = HostPowerToolManager;
window.IP2LiveHostPowerToolScreen = IP2LiveHostPowerToolScreen;
window.IP2LiveHostPowerToolManager = HostPowerToolManager;

window.startHostPowerToolFourPointFive = function (options) {
    return HostPowerToolManager.launchHostPowerTool(options || {});
};

console.log('[IP2Live] ip_host_power_tool.js loaded.');
