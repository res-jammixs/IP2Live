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
        this.systemLabel = 'SYS::CONFIRMATION_GATE';
        this.danger = false;
        this.selectedIndex = 0;
        this.hoverIndex = -1;
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
        this.systemLabel = String(options.systemLabel || this.systemLabel);
        this.danger = Boolean(options.danger);
        this.selectedIndex = options.defaultConfirm ? 1 : 0;
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
        const panelW = 720;
        const panelH = this.value ? 366 : 320;
        const panelX = (SW - panelW) / 2;
        const panelY = (SH - panelH) / 2;
        const buttonW = 246;
        const buttonH = 52;
        const buttonY = panelY + panelH - 78;
        return {
            SW,
            SH,
            panelX,
            panelY,
            panelW,
            panelH,
            cancel: { x: panelX + 54, y: buttonY, w: buttonW, h: buttonH },
            confirm: { x: panelX + panelW - 54 - buttonW, y: buttonY, w: buttonW, h: buttonH },
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
        const font = IP2Live.Assets && IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace';
        const titleFont = IP2Live.Assets && IP2Live.Assets.abnesLoaded ? 'Abnes' : 'Arial Black';

        ctx.save();
        this._drawScreenVeil(ctx, cW, cH, scaleX, scaleY);

        const panelCenterX = (layout.panelX + layout.panelW / 2) * scaleX;
        const panelCenterY = (layout.panelY + layout.panelH / 2) * scaleY;
        ctx.translate(panelCenterX, panelCenterY);
        ctx.scale(0.88 + progress * 0.12, 0.88 + progress * 0.12);
        ctx.translate(-panelCenterX, -panelCenterY);
        ctx.globalAlpha = Math.min(1, this.openProgress * 1.8);

        this._drawPanel(ctx, layout, scaleX, scaleY, font, titleFont);
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

    _drawPanel(ctx, layout, scaleX, scaleY, font, titleFont) {
        const x = layout.panelX * scaleX;
        const y = layout.panelY * scaleY;
        const w = layout.panelW * scaleX;
        const h = layout.panelH * scaleY;
        const slant = 34 * scaleX;
        const pulse = 0.55 + Math.sin(this.animTick * 0.12) * 0.25;
        const confirmColor = this.danger ? '#FF003C' : '#FFE600';

        this._panelPath(ctx, x - 10 * scaleX, y + 12 * scaleY, w, h, slant);
        ctx.fillStyle = 'rgba(255,0,60,0.28)';
        ctx.fill();

        this._panelPath(ctx, x + 12 * scaleX, y - 10 * scaleY, w, h, slant);
        ctx.fillStyle = 'rgba(0,240,255,0.20)';
        ctx.fill();

        this._panelPath(ctx, x, y, w, h, slant);
        const panelGradient = ctx.createLinearGradient(x, y, x + w, y + h);
        panelGradient.addColorStop(0, 'rgba(3,7,20,0.98)');
        panelGradient.addColorStop(0.55, 'rgba(4,8,22,0.97)');
        panelGradient.addColorStop(1, this.danger ? 'rgba(28,3,14,0.98)' : 'rgba(8,12,22,0.98)');
        ctx.fillStyle = panelGradient;
        ctx.shadowColor = this.danger ? '#FF003C' : '#00F0FF';
        ctx.shadowBlur = 24 * scaleX;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(0,240,255,0.94)';
        ctx.lineWidth = 2 * scaleX;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x + slant, y);
        ctx.lineTo(x + 260 * scaleX, y);
        ctx.lineTo(x + 228 * scaleX, y + 34 * scaleY);
        ctx.lineTo(x + 10 * scaleX, y + 34 * scaleY);
        ctx.closePath();
        ctx.fillStyle = this.danger ? '#FF003C' : '#00F0FF';
        ctx.fill();

        ctx.font = 'bold ' + Math.round(10 * scaleX) + 'px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = this.danger ? '#FFFFFF' : '#001018';
        ctx.fillText(this.systemLabel, x + 28 * scaleX, y + 21 * scaleY);

        ctx.fillStyle = confirmColor;
        ctx.fillRect(x + w - 204 * scaleX, y + 8 * scaleY, 160 * scaleX, 3 * scaleY);
        ctx.fillStyle = '#FF003C';
        ctx.fillRect(x + w - 138 * scaleX, y + 17 * scaleY, 94 * scaleX, 2 * scaleY);

        ctx.font = 'bold ' + Math.round(29 * scaleX) + 'px ' + titleFont;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,240,255,0.48)';
        ctx.shadowBlur = 10 * scaleX;
        ctx.fillText(this.title, x + w / 2, y + 84 * scaleY);
        ctx.shadowBlur = 0;

        ctx.font = Math.round(14 * scaleX) + 'px ' + font;
        ctx.fillStyle = 'rgba(218,238,255,0.88)';
        const messageLines = this._wrapText(ctx, this.message, w - 116 * scaleX);
        for (let i = 0; i < Math.min(2, messageLines.length); i++) {
            ctx.fillText(messageLines[i], x + w / 2, y + (119 + i * 21) * scaleY);
        }

        if (this.value) {
            this._drawValueDeck(ctx, x, y, w, scaleX, scaleY, font, confirmColor, pulse);
        }

        if (this.detail) {
            ctx.font = Math.round(10 * scaleX) + 'px monospace';
            ctx.fillStyle = this.danger ? 'rgba(255,120,150,0.86)' : 'rgba(0,240,255,0.72)';
            ctx.fillText(this.detail, x + w / 2, y + (this.value ? 244 : 188) * scaleY);
        }

        this._drawButton(ctx, layout.cancel, scaleX, scaleY, this.cancelLabel, 0, '#00F0FF');
        this._drawButton(ctx, layout.confirm, scaleX, scaleY, this.confirmLabel, 1, confirmColor);

        ctx.font = Math.round(8 * scaleX) + 'px monospace';
        ctx.fillStyle = 'rgba(180,220,235,0.40)';
        ctx.textAlign = 'left';
        ctx.fillText('ESC // ABORT', x + 28 * scaleX, y + h - 14 * scaleY);
        ctx.textAlign = 'right';
        ctx.fillText('ENTER // EXECUTE', x + w - 28 * scaleX, y + h - 14 * scaleY);

        ctx.globalAlpha = 0.26 + pulse * 0.16;
        ctx.fillStyle = confirmColor;
        ctx.fillRect(x + w - 118 * scaleX, y + h - 8 * scaleY, 76 * scaleX, 3 * scaleY);
        ctx.globalAlpha = 1;
    }

    _drawValueDeck(ctx, x, y, w, scaleX, scaleY, font, accent, pulse) {
        const deckX = x + 86 * scaleX;
        const deckY = y + 164 * scaleY;
        const deckW = w - 172 * scaleX;
        const deckH = 62 * scaleY;
        const slant = 15 * scaleX;

        ctx.beginPath();
        ctx.moveTo(deckX + slant, deckY);
        ctx.lineTo(deckX + deckW, deckY);
        ctx.lineTo(deckX + deckW - slant, deckY + deckH);
        ctx.lineTo(deckX, deckY + deckH);
        ctx.closePath();
        const gradient = ctx.createLinearGradient(deckX, deckY, deckX + deckW, deckY);
        gradient.addColorStop(0, this.danger ? 'rgba(255,0,60,0.16)' : 'rgba(0,240,255,0.14)');
        gradient.addColorStop(0.55, 'rgba(6,12,26,0.92)');
        gradient.addColorStop(1, 'rgba(255,230,0,0.12)');
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5 * scaleX;
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.font = Math.round(9 * scaleX) + 'px monospace';
        ctx.fillStyle = 'rgba(0,240,255,0.72)';
        ctx.fillText('// ' + this.valueLabel, deckX + 18 * scaleX, deckY + 18 * scaleY);

        ctx.textAlign = 'center';
        ctx.font = 'bold ' + Math.round(19 * scaleX) + 'px ' + font;
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = accent;
        ctx.shadowBlur = (6 + pulse * 5) * scaleX;
        const maxValue = this.value.length > 42 ? this.value.slice(0, 39) + '...' : this.value;
        ctx.fillText(maxValue, deckX + deckW / 2, deckY + 45 * scaleY);
        ctx.shadowBlur = 0;
    }

    _drawButton(ctx, rect, scaleX, scaleY, label, index, accent) {
        const x = rect.x * scaleX;
        const y = rect.y * scaleY;
        const w = rect.w * scaleX;
        const h = rect.h * scaleY;
        const active = this.selectedIndex === index || this.hoverIndex === index;
        const slant = 17 * scaleX;

        ctx.beginPath();
        ctx.moveTo(x + slant, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - slant, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        const gradient = ctx.createLinearGradient(x, y, x + w, y);
        if (active) {
            gradient.addColorStop(0, accent);
            gradient.addColorStop(0.68, accent);
            gradient.addColorStop(1, 'rgba(255,255,255,0.90)');
            ctx.shadowColor = accent;
            ctx.shadowBlur = 16 * scaleX;
        } else {
            gradient.addColorStop(0, 'rgba(2,8,20,0.92)');
            gradient.addColorStop(1, 'rgba(4,12,26,0.72)');
            ctx.shadowBlur = 0;
        }
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = active ? '#FFFFFF' : accent;
        ctx.lineWidth = (active ? 2 : 1.2) * scaleX;
        ctx.stroke();

        ctx.fillStyle = active ? '#080B12' : accent;
        ctx.font = 'bold ' + Math.round(15 * scaleX) + 'px ' + (IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace');
        ctx.textAlign = 'center';
        ctx.fillText(label, x + w / 2, y + h * 0.64);

        ctx.fillStyle = active ? '#FF003C' : 'rgba(0,240,255,0.38)';
        ctx.fillRect(index === 0 ? x + 10 * scaleX : x + w - 42 * scaleX, y + h - 7 * scaleY, 32 * scaleX, 2 * scaleY);
    }

    _panelPath(ctx, x, y, w, h, slant) {
        ctx.beginPath();
        ctx.moveTo(x + slant, y);
        ctx.lineTo(x + w - slant * 0.45, y);
        ctx.lineTo(x + w, y + slant * 0.8);
        ctx.lineTo(x + w - slant, y + h);
        ctx.lineTo(x + slant * 0.45, y + h);
        ctx.lineTo(x, y + h - slant * 0.8);
        ctx.closePath();
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
