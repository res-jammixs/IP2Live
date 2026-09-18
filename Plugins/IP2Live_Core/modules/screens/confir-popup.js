/**
 * IP2Live - Reusable confirmation popup.
 *
 * The component name intentionally follows the requested public API:
 * IP2Live.confirPopup.show(options).
 *
 * Loaded through code.js with the standard Paper Maker plugin globals.
 */

class confirPopup extends Scene.Base {
    constructor(options) {
        super(false);
        this._configure(options || {});
        this.loading = false;
    }

    initialize() {
        this.parentScene = null;
        this.title = 'CONFIRM OPERATION';
        this.message = 'Authorize the selected operation?';
        this.detail = '';
        this.value = '';
        this.valueLabel = 'TARGET';
        this.confirmLabel = 'CONFIRM';
        this.cancelLabel = 'CANCEL';
        this.danger = false;
        this.selectedIndex = 0;
        this.hoverIndex = -1;
        this.buttonMix = [1, 0];
        this.animTick = 0;
        this.openProgress = 0;
        this.resolved = false;
        this.onConfirm = null;
        this.onCancel = null;
        this.signalBars = [];
        this._seedSignalBars();
    }

    _configure(options) {
        this.parentScene = options.parentScene || this.parentScene || null;
        this.title = String(options.title || this.title);
        this.message = String(options.message || this.message);
        this.detail = String(options.detail || '');
        this.value = options.value === undefined || options.value === null
            ? ''
            : String(options.value);
        this.valueLabel = String(options.valueLabel || this.valueLabel);
        this.confirmLabel = String(options.confirmLabel || this.confirmLabel);
        this.cancelLabel = String(options.cancelLabel || this.cancelLabel);
        this.danger = Boolean(options.danger);
        this.selectedIndex = options.defaultConfirm ? 1 : 0;
        this.buttonMix = this.selectedIndex === 1 ? [0, 1] : [1, 0];
        this.onConfirm = typeof options.onConfirm === 'function' ? options.onConfirm : null;
        this.onCancel = typeof options.onCancel === 'function' ? options.onCancel : null;
    }

    _seedSignalBars() {
        this.signalBars = [];
        for (let i = 0; i < 18; i++) {
            this.signalBars.push({
                x: Math.random(),
                y: Math.random(),
                w: 12 + Math.random() * 72,
                speed: 0.0015 + Math.random() * 0.004,
                color: i % 3,
            });
        }
    }

    static show(options) {
        const config = Object.assign({}, options || {}, {
            parentScene: (options && options.parentScene) || Manager.Stack.top,
        });
        const popup = new confirPopup(config);
        Manager.Stack.push(popup);
        Manager.Stack.requestPaintHUD = true;
        return popup;
    }

    onKeyPressed(key) {
        if (this.resolved) return;
        if (Data.Keyboards.checkActionMenu(key)) {
            this._activateSelection();
        } else if (Data.Keyboards.checkCancelMenu(key)) {
            this._resolve(false);
        }
    }

    onKeyPressedAndRepeat(key) {
        if (this.resolved) return true;
        const previous = this.selectedIndex;
        if (
            Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Left) ||
            Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Up)
        ) {
            this.selectedIndex = 0;
        } else if (
            Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Right) ||
            Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Down)
        ) {
            this.selectedIndex = 1;
        }
        if (previous !== this.selectedIndex) {
            this.hoverIndex = -1;
            Data.Systems.soundCursor.playSound();
            Manager.Stack.requestPaintHUD = true;
        }
        return true;
    }

    onMouseMove(x, y) {
        if (this.resolved) return;
        const next = this._buttonAt(x, y);
        if (next !== this.hoverIndex) {
            this.hoverIndex = next;
            if (next >= 0 && next !== this.selectedIndex) {
                this.selectedIndex = next;
                Data.Systems.soundCursor.playSound();
            }
            Manager.Stack.requestPaintHUD = true;
        }
    }

    onMouseUp(x, y) {
        if (this.resolved) return;
        const index = this._buttonAt(x, y);
        if (index < 0) return;
        this.selectedIndex = index;
        this._activateSelection();
    }

    _activateSelection() {
        this._resolve(this.selectedIndex === 1);
    }

    _resolve(confirmed) {
        if (this.resolved) return;
        this.resolved = true;

        if (confirmed) Data.Systems.soundConfirmation.playSound();
        else Data.Systems.soundCancel.playSound();

        if (Manager.Stack.top === this) Manager.Stack.pop();
        Manager.Stack.requestPaintHUD = true;

        const callback = confirmed ? this.onConfirm : this.onCancel;
        if (!callback) return;
        try {
            const result = callback();
            if (result && typeof result.then === 'function') {
                result.catch((error) => {
                    console.error('[IP2Live] Confirmation action failed:', error);
                });
            }
        } catch (error) {
            console.error('[IP2Live] Confirmation action failed:', error);
        }
    }

    _layout() {
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const panelW = 560;
        const panelH = this.value ? 286 : 232;
        const panelX = (SW - panelW) / 2;
        const panelY = (SH - panelH) / 2;
        const buttonW = 172;
        const buttonH = 42;
        const buttonGap = 20;
        const buttonY = panelY + panelH - 64;
        const buttonStartX = panelX + (panelW - buttonW * 2 - buttonGap) / 2;
        return {
            SW,
            SH,
            panelX,
            panelY,
            panelW,
            panelH,
            cancel: { x: buttonStartX, y: buttonY, w: buttonW, h: buttonH },
            confirm: { x: buttonStartX + buttonW + buttonGap, y: buttonY, w: buttonW, h: buttonH },
        };
    }

    _buttonAt(x, y) {
        const layout = this._layout();
        const ctx = Common.Platform.ctx;
        const scaleX = ctx.canvas.width / layout.SW;
        const scaleY = ctx.canvas.height / layout.SH;
        const buttons = [layout.cancel, layout.confirm];
        for (let i = 0; i < buttons.length; i++) {
            const rect = buttons[i];
            if (
                x >= rect.x * scaleX && x <= (rect.x + rect.w) * scaleX &&
                y >= rect.y * scaleY && y <= (rect.y + rect.h) * scaleY
            ) return i;
        }
        return -1;
    }

    update() {
        this.animTick++;
        this.openProgress = Math.min(1, this.openProgress + 0.085);
        for (let i = 0; i < this.buttonMix.length; i++) {
            const target = this.selectedIndex === i ? 1 : 0;
            const next = this.buttonMix[i] + (target - this.buttonMix[i]) * 0.2;
            this.buttonMix[i] = Math.abs(target - next) < 0.008 ? target : next;
        }
        for (const bar of this.signalBars) {
            bar.x += bar.speed;
            if (bar.x > 1.1) bar.x = -0.15;
        }
        Manager.Stack.requestPaintHUD = true;
    }

    draw3D() {
        if (this.parentScene && typeof this.parentScene.draw3D === 'function') {
            this.parentScene.draw3D();
        } else if (Manager.GL && Manager.GL.renderer) {
            Manager.GL.renderer.clear();
        }
    }

    drawHUD() {
        if (this.parentScene && typeof this.parentScene.drawHUD === 'function') {
            this.parentScene.drawHUD();
        }

        const ctx = Common.Platform.ctx;
        const layout = this._layout();
        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const scaleX = cW / layout.SW;
        const scaleY = cH / layout.SH;
        const progress = this._easeOutBack(this.openProgress);
        const font = IP2Live.Assets && IP2Live.Assets.oxaniumMediumLoaded
            ? 'Oxanium-Medium'
            : 'sans-serif';

        ctx.save();
        this._drawScreenVeil(ctx, cW, cH, scaleX, scaleY);

        const panelCenterX = (layout.panelX + layout.panelW / 2) * scaleX;
        const panelCenterY = (layout.panelY + layout.panelH / 2) * scaleY;
        ctx.translate(panelCenterX, panelCenterY);
        ctx.scale(0.88 + progress * 0.12, 0.88 + progress * 0.12);
        ctx.translate(-panelCenterX, -panelCenterY);
        ctx.globalAlpha = Math.min(1, this.openProgress * 1.8);

        this._drawPanel(ctx, layout, scaleX, scaleY, font);
        ctx.restore();
    }

    _drawScreenVeil(ctx, cW, cH, scaleX, scaleY) {
        const alpha = Math.min(0.84, this.openProgress * 0.84);
        const veil = ctx.createLinearGradient(0, 0, cW, cH);
        veil.addColorStop(0, 'rgba(0,0,8,' + alpha + ')');
        veil.addColorStop(0.58, 'rgba(2,3,14,' + Math.min(0.88, alpha + 0.04) + ')');
        veil.addColorStop(1, 'rgba(12,0,12,' + alpha + ')');
        ctx.fillStyle = veil;
        ctx.fillRect(0, 0, cW, cH);

        ctx.globalAlpha = 0.11 * this.openProgress;
        for (let y = (this.animTick * 0.7) % (5 * scaleY); y < cH; y += 5 * scaleY) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, y, cW, Math.max(1, 1.2 * scaleY));
        }

        for (const bar of this.signalBars) {
            const colors = ['#00F0FF', '#FF003C', '#FFE600'];
            ctx.globalAlpha = 0.08 + ((bar.y * 10) % 0.12);
            ctx.fillStyle = colors[bar.color];
            ctx.fillRect(bar.x * cW, bar.y * cH, bar.w * scaleX, 2 * scaleY);
        }
        ctx.globalAlpha = 1;
    }

    _drawPanel(ctx, layout, scaleX, scaleY, font) {
        const x = layout.panelX * scaleX;
        const y = layout.panelY * scaleY;
        const w = layout.panelW * scaleX;
        const h = layout.panelH * scaleY;
        const unit = Math.min(scaleX, scaleY);
        const cut = 14 * unit;
        const frameAccent = this.danger ? '#FF003C' : '#00F0FF';
        const confirmAccent = this.danger ? '#FF003C' : '#FFE600';
        const cancelAccent = this.danger ? '#FF3B64' : '#00F0FF';
        const pulse = 0.55 + Math.sin(this.animTick * 0.12) * 0.25;

        this._traceBeveledRect(ctx, x + 8 * scaleX, y + 9 * scaleY, w, h, cut);
        ctx.fillStyle = this.danger ? 'rgba(43,0,17,0.68)' : 'rgba(0,16,29,0.72)';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 24 * unit;
        ctx.fill();
        ctx.shadowBlur = 0;

        this._traceBeveledRect(ctx, x - 4 * scaleX, y + 4 * scaleY, w, h, cut);
        ctx.fillStyle = this.danger ? 'rgba(80,0,28,0.24)' : 'rgba(0,87,108,0.24)';
        ctx.fill();

        this._traceBeveledRect(ctx, x, y, w, h, cut);
        const panelGradient = ctx.createLinearGradient(x, y, x + w, y + h);
        panelGradient.addColorStop(0, this.danger ? 'rgba(28,4,15,0.985)' : 'rgba(5,24,43,0.985)');
        panelGradient.addColorStop(0.48, 'rgba(2,9,22,0.99)');
        panelGradient.addColorStop(1, this.danger ? 'rgba(31,2,13,0.98)' : 'rgba(16,7,25,0.98)');
        ctx.fillStyle = panelGradient;
        ctx.shadowColor = frameAccent;
        ctx.shadowBlur = 14 * unit;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.save();
        this._traceBeveledRect(ctx, x, y, w, h, cut);
        ctx.clip();
        for (let sy = y + 3 * scaleY; sy < y + h; sy += 5 * scaleY) {
            ctx.fillStyle = this.danger ? 'rgba(255,104,137,0.018)' : 'rgba(177,238,255,0.018)';
            ctx.fillRect(x, sy, w, Math.max(1, 0.55 * scaleY));
        }
        for (let sx = x + 24 * scaleX; sx < x + w; sx += 36 * scaleX) {
            ctx.strokeStyle = this.danger ? 'rgba(255,0,60,0.035)' : 'rgba(0,240,255,0.035)';
            ctx.lineWidth = Math.max(1, 0.5 * unit);
            ctx.beginPath();
            ctx.moveTo(sx, y);
            ctx.lineTo(sx - 24 * scaleX, y + h);
            ctx.stroke();
        }
        const scanY = y - 24 * scaleY + ((this.animTick * 1.1) % (h + 48 * scaleY));
        const scan = ctx.createLinearGradient(0, scanY - 14 * scaleY, 0, scanY + 14 * scaleY);
        scan.addColorStop(0, 'rgba(255,255,255,0)');
        scan.addColorStop(0.5, this.danger ? 'rgba(255,0,60,0.065)' : 'rgba(0,240,255,0.07)');
        scan.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = scan;
        ctx.fillRect(x, scanY - 14 * scaleY, w, 28 * scaleY);
        ctx.restore();

        this._traceBeveledRect(ctx, x, y, w, h, cut);
        ctx.strokeStyle = frameAccent;
        ctx.lineWidth = 1.3 * unit;
        ctx.shadowColor = frameAccent;
        ctx.shadowBlur = 8 * unit;
        ctx.stroke();
        ctx.shadowBlur = 0;
        this._drawBevelFacets(ctx, x, y, w, h, cut, 5 * unit, frameAccent);

        this._traceBeveledRect(ctx, x + 5 * scaleX, y + 5 * scaleY, w - 10 * scaleX, h - 10 * scaleY, Math.max(3 * unit, cut - 4 * unit));
        ctx.strokeStyle = this.danger ? 'rgba(255,168,190,0.13)' : 'rgba(174,242,255,0.14)';
        ctx.lineWidth = Math.max(1, 0.7 * unit);
        ctx.stroke();

        this._drawCornerArmor(ctx, x + cut, y, 1, 1, unit, frameAccent);
        this._drawCornerArmor(ctx, x + w - cut, y, -1, 1, unit, frameAccent);
        this._drawCornerArmor(ctx, x + cut, y + h, 1, -1, unit, this.danger ? '#FF003C' : '#FFE600');
        this._drawCornerArmor(ctx, x + w - cut, y + h, -1, -1, unit, frameAccent);
        this._drawEdgePlate(ctx, x + 34 * scaleX, y - 1.5 * scaleY, 62 * scaleX, 3.5 * scaleY, 5 * unit, frameAccent);
        this._drawEdgePlate(ctx, x + w * 0.36, y - 1.5 * scaleY, w * 0.28, 3.5 * scaleY, 6 * unit, frameAccent);
        this._drawEdgePlate(ctx, x + w - 96 * scaleX, y - 1.5 * scaleY, 62 * scaleX, 3.5 * scaleY, 5 * unit, frameAccent);

        ctx.font = 'bold ' + Math.round(21 * scaleX) + 'px ' + font;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.shadowColor = frameAccent;
        ctx.shadowBlur = 7 * scaleX;
        ctx.fillText(this.title, x + w / 2, y + 38 * scaleY);
        ctx.shadowBlur = 0;

        this._drawSectionRail(ctx, x + 34 * scaleX, y + 49 * scaleY, w - 68 * scaleX, 4 * scaleY, scaleX, scaleY, frameAccent);

        ctx.font = Math.round(11 * scaleX) + 'px ' + font;
        ctx.fillStyle = 'rgba(225,242,251,0.88)';
        const messageLines = this._wrapText(ctx, this.message, w - 88 * scaleX);
        for (let i = 0; i < Math.min(2, messageLines.length); i++) {
            ctx.fillText(messageLines[i], x + w / 2, y + (77 + i * 16) * scaleY);
        }

        if (this.value) {
            this._drawValueDeck(ctx, x, y, w, scaleX, scaleY, font, confirmAccent, pulse);
        }

        if (this.detail) {
            ctx.font = Math.round(9 * scaleX) + 'px ' + font;
            ctx.fillStyle = this.danger ? 'rgba(255,142,165,0.86)' : 'rgba(156,226,241,0.74)';
            ctx.fillText(this.detail, x + w / 2, y + (this.value ? 184 : 124) * scaleY);
        }

        this._drawButton(ctx, layout.cancel, scaleX, scaleY, this.cancelLabel, 0, cancelAccent, font);
        this._drawButton(ctx, layout.confirm, scaleX, scaleY, this.confirmLabel, 1, confirmAccent, font);
    }

    _drawValueDeck(ctx, x, y, w, scaleX, scaleY, font, accent, pulse) {
        const deckX = x + 54 * scaleX;
        const deckY = y + 104 * scaleY;
        const deckW = w - 108 * scaleX;
        const deckH = 58 * scaleY;
        const cut = 9 * Math.min(scaleX, scaleY);

        this._traceBeveledRect(ctx, deckX + 3 * scaleX, deckY + 5 * scaleY, deckW, deckH, cut);
        ctx.fillStyle = this.danger ? 'rgba(75,0,29,0.72)' : 'rgba(0,60,78,0.68)';
        ctx.fill();

        this._traceBeveledRect(ctx, deckX, deckY, deckW, deckH, cut);
        const gradient = ctx.createLinearGradient(deckX, deckY, deckX + deckW, deckY);
        gradient.addColorStop(0, this.danger ? 'rgba(255,0,60,0.15)' : 'rgba(0,240,255,0.14)');
        gradient.addColorStop(0.58, 'rgba(5,12,25,0.96)');
        gradient.addColorStop(1, this.danger ? 'rgba(255,0,60,0.11)' : 'rgba(255,230,0,0.13)');
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.2 * scaleX;
        ctx.shadowColor = accent;
        ctx.shadowBlur = (4 + pulse * 4) * scaleX;
        ctx.stroke();
        ctx.shadowBlur = 0;
        this._drawBevelFacets(ctx, deckX, deckY, deckW, deckH, cut, 3 * Math.min(scaleX, scaleY), accent);

        ctx.textAlign = 'left';
        ctx.font = 'bold ' + Math.round(8 * scaleX) + 'px ' + font;
        ctx.fillStyle = this.danger ? 'rgba(255,151,176,0.8)' : 'rgba(113,231,246,0.8)';
        ctx.fillText(this.valueLabel, deckX + 15 * scaleX, deckY + 18 * scaleY);

        ctx.textAlign = 'center';
        ctx.font = 'bold ' + Math.round(16 * scaleX) + 'px ' + font;
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = accent;
        ctx.shadowBlur = (4 + pulse * 4) * scaleX;
        const maxValue = this.value.length > 42 ? this.value.slice(0, 39) + '...' : this.value;
        ctx.fillText(maxValue, deckX + deckW / 2, deckY + 43 * scaleY);
        ctx.shadowBlur = 0;

        this._drawEdgePlate(ctx, deckX + 13 * scaleX, deckY + deckH - 4 * scaleY, 48 * scaleX, 3 * scaleY, 4 * scaleX, this.danger ? '#FF003C' : '#00F0FF');
        this._drawEdgePlate(ctx, deckX + deckW - 43 * scaleX, deckY + deckH - 4 * scaleY, 28 * scaleX, 3 * scaleY, 3 * scaleX, accent);
    }

    _drawButton(ctx, rect, scaleX, scaleY, label, index, accent, font) {
        const x = rect.x * scaleX;
        const y = rect.y * scaleY;
        const w = rect.w * scaleX;
        const h = rect.h * scaleY;
        const unit = Math.min(scaleX, scaleY);
        const cut = 8 * unit;
        const mix = this.buttonMix ? this.buttonMix[index] : (this.selectedIndex === index ? 1 : 0);
        const activeMix = 1 - Math.pow(1 - mix, 3);
        const isYellow = accent === '#FFE600';
        const isRed = accent === '#FF003C' || accent === '#FF3B64';
        const soft = isYellow ? 'rgba(255,230,0,0.34)' : (isRed ? 'rgba(255,0,60,0.3)' : 'rgba(0,240,255,0.3)');

        this._traceBeveledRect(ctx, x + 4 * scaleX, y + 5 * scaleY, w, h, cut);
        ctx.fillStyle = 'rgba(0,0,6,0.76)';
        ctx.fill();
        ctx.strokeStyle = isRed ? 'rgba(255,0,60,0.24)' : 'rgba(0,240,255,0.2)';
        ctx.lineWidth = 1 * scaleX;
        ctx.stroke();

        this._traceBeveledRect(ctx, x, y, w, h, cut);
        const buttonGradient = ctx.createLinearGradient(x, y, x + w, y + h);
        buttonGradient.addColorStop(0, activeMix > 0.01 ? soft : 'rgba(7,12,24,0.98)');
        buttonGradient.addColorStop(0.58, 'rgba(4,9,20,0.99)');
        buttonGradient.addColorStop(1, isRed ? 'rgba(24,2,13,0.99)' : 'rgba(1,14,23,0.99)');
        ctx.fillStyle = buttonGradient;
        ctx.fill();

        ctx.save();
        this._traceBeveledRect(ctx, x, y, w, h, cut);
        ctx.clip();
        ctx.globalAlpha = activeMix;
        const energyWidth = w * (0.18 + activeMix * 0.82);
        const energy = ctx.createLinearGradient(x, y, x + energyWidth, y);
        energy.addColorStop(0, 'rgba(255,255,255,0.035)');
        energy.addColorStop(0.6, soft);
        energy.addColorStop(1, 'rgba(255,255,255,0.15)');
        ctx.fillStyle = energy;
        ctx.fillRect(x, y, energyWidth, h);
        const sweepX = x - 34 * scaleX + ((this.animTick * 3) % (w + 68 * scaleX));
        ctx.globalAlpha = activeMix * 0.36;
        ctx.translate(sweepX + 5 * scaleX, y);
        ctx.transform(1, 0, -0.3, 1, 0, 0);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(-5 * scaleX, 0, 10 * scaleX, h);
        ctx.restore();

        this._traceBeveledRect(ctx, x, y, w, h, cut);
        ctx.strokeStyle = accent;
        ctx.lineWidth = (1.1 + activeMix * 0.8) * scaleX;
        ctx.shadowColor = accent;
        ctx.shadowBlur = (4 + activeMix * 10) * scaleX;
        ctx.stroke();
        ctx.shadowBlur = 0;
        this._drawBevelFacets(ctx, x, y, w, h, cut, (2.6 + activeMix) * unit, accent);

        const railInset = (18 - activeMix * 9) * scaleX;
        this._drawEdgePlate(ctx, x + railInset, y + h - (3.8 + activeMix) * scaleY, w - railInset * 2, (2.6 + activeMix * 0.6) * scaleY, 4 * unit, accent);
        this._drawEdgePlate(ctx, x + 8 * scaleX, y + 6 * scaleY, (7 + activeMix * 10) * scaleX, 3 * scaleY, 2.5 * unit, activeMix > 0.55 && !this.danger ? '#FFE600' : accent);

        ctx.font = 'bold ' + Math.round(12 * scaleX) + 'px ' + font;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.shadowColor = activeMix > 0.02 ? accent : 'transparent';
        ctx.shadowBlur = activeMix * 8 * scaleX;
        ctx.fillText(this._getButtonTransitionLabel(label, mix, index), x + w / 2, y + h / 2 + 4 * scaleY);
        ctx.shadowBlur = 0;
    }

    _getButtonTransitionLabel(label, mix, seed) {
        if (mix <= 0.015 || mix >= 0.985) return label;
        const glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$<>/';
        const intensity = Math.sin(mix * Math.PI);
        let result = '';
        for (let i = 0; i < label.length; i++) {
            const scramble = ((i * 31 + Math.floor(this.animTick / 2) * 17 + seed * 29) % 100) < intensity * 68;
            const glyphIndex = (i * 13 + Math.floor(this.animTick / 2) * 7 + seed * 11) % glyphs.length;
            result += scramble ? glyphs[glyphIndex] : label[i];
        }
        return result;
    }

    _traceBeveledRect(ctx, x, y, w, h, cut) {
        ctx.beginPath();
        ctx.moveTo(x + cut, y);
        ctx.lineTo(x + w - cut, y);
        ctx.lineTo(x + w, y + cut);
        ctx.lineTo(x + w, y + h - cut);
        ctx.lineTo(x + w - cut, y + h);
        ctx.lineTo(x + cut, y + h);
        ctx.lineTo(x, y + h - cut);
        ctx.lineTo(x, y + cut);
        ctx.closePath();
    }

    _drawBevelFacets(ctx, x, y, w, h, cut, depth, accent) {
        const isRed = accent === '#FF003C' || accent === '#FF3B64';
        const isYellow = accent === '#FFE600';
        const bright = isRed ? 'rgba(255,112,151,0.42)' : (isYellow ? 'rgba(255,251,156,0.48)' : 'rgba(157,251,255,0.46)');
        const face = isRed ? 'rgba(255,0,60,0.27)' : (isYellow ? 'rgba(255,230,0,0.28)' : 'rgba(0,240,255,0.25)');
        const side = isRed ? 'rgba(106,0,35,0.48)' : (isYellow ? 'rgba(102,82,0,0.5)' : 'rgba(0,75,104,0.48)');
        const shadow = isRed ? 'rgba(38,0,17,0.72)' : 'rgba(0,12,25,0.78)';
        const d = Math.max(1, Math.min(depth, cut * 0.48, h * 0.18));

        ctx.save();
        const topFace = ctx.createLinearGradient(0, y, 0, y + d);
        topFace.addColorStop(0, bright);
        topFace.addColorStop(0.36, face);
        topFace.addColorStop(1, 'rgba(0,0,0,0.08)');
        ctx.beginPath();
        ctx.moveTo(x + cut, y);
        ctx.lineTo(x + w - cut, y);
        ctx.lineTo(x + w - cut - d, y + d);
        ctx.lineTo(x + cut + d, y + d);
        ctx.closePath();
        ctx.fillStyle = topFace;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(x + w - cut, y);
        ctx.lineTo(x + w, y + cut);
        ctx.lineTo(x + w, y + h - cut);
        ctx.lineTo(x + w - cut, y + h);
        ctx.lineTo(x + w - cut - d, y + h - d);
        ctx.lineTo(x + w - d, y + h - cut - d);
        ctx.lineTo(x + w - d, y + cut + d);
        ctx.lineTo(x + w - cut - d, y + d);
        ctx.closePath();
        const rightFace = ctx.createLinearGradient(x + w - d, 0, x + w, 0);
        rightFace.addColorStop(0, face);
        rightFace.addColorStop(1, side);
        ctx.fillStyle = rightFace;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(x + w - cut, y + h);
        ctx.lineTo(x + cut, y + h);
        ctx.lineTo(x + cut + d, y + h - d);
        ctx.lineTo(x + w - cut - d, y + h - d);
        ctx.closePath();
        const bottomFace = ctx.createLinearGradient(0, y + h - d, 0, y + h);
        bottomFace.addColorStop(0, side);
        bottomFace.addColorStop(1, shadow);
        ctx.fillStyle = bottomFace;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(x + cut, y + h);
        ctx.lineTo(x, y + h - cut);
        ctx.lineTo(x, y + cut);
        ctx.lineTo(x + cut, y);
        ctx.lineTo(x + cut + d, y + d);
        ctx.lineTo(x + d, y + cut + d);
        ctx.lineTo(x + d, y + h - cut - d);
        ctx.lineTo(x + cut + d, y + h - d);
        ctx.closePath();
        ctx.fillStyle = side;
        ctx.fill();

        this._traceBeveledRect(ctx, x + d, y + d, w - d * 2, h - d * 2, Math.max(2, cut - d));
        ctx.strokeStyle = isRed ? 'rgba(255,169,190,0.18)' : 'rgba(220,253,255,0.2)';
        ctx.lineWidth = Math.max(1, d * 0.24);
        ctx.stroke();
        ctx.restore();
    }

    _drawEdgePlate(ctx, x, y, w, h, slant, accent) {
        const isRed = accent === '#FF003C' || accent === '#FF3B64';
        const isYellow = accent === '#FFE600';
        const bright = isRed ? 'rgba(255,72,119,0.96)' : (isYellow ? 'rgba(255,250,116,0.98)' : 'rgba(82,250,255,0.96)');
        const mid = isRed ? 'rgba(255,0,60,0.82)' : (isYellow ? 'rgba(255,224,0,0.9)' : 'rgba(0,184,211,0.84)');
        const dark = isRed ? 'rgba(74,0,31,0.96)' : (isYellow ? 'rgba(91,72,0,0.96)' : 'rgba(0,52,77,0.96)');
        const skew = Math.min(slant, w * 0.2);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x + skew + 2, y + 2);
        ctx.lineTo(x + w + 2, y + 2);
        ctx.lineTo(x + w - skew + 2, y + h + 2);
        ctx.lineTo(x + 2, y + h + 2);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,8,0.76)';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(x + skew, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - skew, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        const plate = ctx.createLinearGradient(x, y, x + w, y + h);
        plate.addColorStop(0, bright);
        plate.addColorStop(0.36, mid);
        plate.addColorStop(1, dark);
        ctx.fillStyle = plate;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.34)';
        ctx.lineWidth = 0.65;
        ctx.stroke();
        ctx.restore();
    }

    _drawSectionRail(ctx, x, y, w, h, scaleX, scaleY, accent) {
        const unit = Math.min(scaleX, scaleY);
        this._drawEdgePlate(ctx, x, y, w, h, 7 * unit, accent);
        ctx.beginPath();
        ctx.moveTo(x + 9 * unit, y + h * 0.28);
        ctx.lineTo(x + w - 13 * unit, y + h * 0.28);
        ctx.lineTo(x + w - 18 * unit, y + h * 0.72);
        ctx.lineTo(x + 5 * unit, y + h * 0.72);
        ctx.closePath();
        ctx.fillStyle = 'rgba(1,8,20,0.76)';
        ctx.fill();
        this._drawEdgePlate(ctx, x, y - 0.4 * scaleY, w * 0.17, h * 0.65, 5 * unit, this.danger ? '#FF003C' : '#FFE600');
        this._drawEdgePlate(ctx, x + w * 0.56, y - 0.5 * scaleY, w * 0.09, h * 0.72, 4 * unit, accent);
    }

    _drawCornerArmor(ctx, x, y, flipX, flipY, unit, accent) {
        const isRed = accent === '#FF003C' || accent === '#FF3B64';
        const isYellow = accent === '#FFE600';
        const points = [[0, 0], [28, 0], [22, 4], [8, 4], [8, 13], [3, 20], [0, 20]];
        ctx.save();
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const px = x + points[i][0] * flipX * unit;
            const py = y + points[i][1] * flipY * unit;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        const cap = ctx.createLinearGradient(x, y, x + 24 * flipX * unit, y + 16 * flipY * unit);
        cap.addColorStop(0, 'rgba(232,254,255,0.72)');
        cap.addColorStop(0.28, isRed ? 'rgba(255,24,86,0.9)' : (isYellow ? 'rgba(255,230,0,0.92)' : 'rgba(0,240,255,0.9)'));
        cap.addColorStop(1, isRed ? 'rgba(71,0,31,0.92)' : (isYellow ? 'rgba(86,67,0,0.94)' : 'rgba(0,48,77,0.94)'));
        ctx.fillStyle = cap;
        ctx.shadowColor = accent;
        ctx.shadowBlur = 6 * unit;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(218,252,255,0.58)';
        ctx.lineWidth = Math.max(1, 0.8 * unit);
        ctx.stroke();
        ctx.restore();
    }

    _wrapText(ctx, text, maxWidth) {
        const words = String(text || '').split(/\s+/);
        const lines = [];
        let line = '';
        for (const word of words) {
            const candidate = line ? line + ' ' + word : word;
            if (line && ctx.measureText(candidate).width > maxWidth) {
                lines.push(line);
                line = word;
            } else {
                line = candidate;
            }
        }
        if (line) lines.push(line);
        return lines;
    }

    _easeOutBack(t) {
        const x = Math.max(0, Math.min(1, t));
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }
}

IP2Live.confirPopup = confirPopup;
IP2Live.ConfirmPopup = confirPopup;
window.confirPopup = confirPopup;
window.IP2LiveConfirmPopup = confirPopup;

console.log('[IP2Live] confirPopup component loaded.');
