/**
 * IP2Live - Reusable confirmation popup.
 *
 * The component name intentionally follows the requested public API:
 * IP2Live.confirPopup.show(options).
 *
 * Loaded through code.js with the standard Paper Maker plugin globals.
 */

// Shared, restrained holographic treatment for confirmation and name entry.
IP2Live.PopupChrome = {
    // All menu popups share the confirmation dialog's short, soft overshoot.
    animate(ctx, rect, progress) {
        const t = Math.max(0, Math.min(1, progress));
        const ease = 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
        const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
        ctx.translate(cx, cy); ctx.scale(0.88 + ease * 0.12, 0.88 + ease * 0.12); ctx.translate(-cx, -cy);
        ctx.globalAlpha *= Math.min(1, t * 1.8);
    },
    capture() {
        const active = IP2Live.MenuTransition && IP2Live.MenuTransition.active;
        const canvas = document.createElement('canvas'), source = active ? active.frame : Common.Platform.ctx.canvas;
        canvas.width = source.width; canvas.height = source.height;
        const ctx = canvas.getContext('2d');
        const renderer = Manager.GL && Manager.GL.renderer;
        if (renderer && renderer.domElement) ctx.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);
        ctx.drawImage(source, 0, 0); return canvas;
    },
    backdrop(ctx, frame, progress = 1) {
        if (frame) ctx.drawImage(frame, 0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'rgba(1,5,10,' + (0.78 * Math.min(1, progress)) + ')'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    },
    heading(ctx, label, x, y, w) {
        ctx.font = 'bold 23px Oxanium-Medium, sans-serif'; ctx.fillStyle = '#edf5f6'; ctx.textBaseline = 'alphabetic';
        this.text(ctx, label, x + w / 2, y + 38, 1.6);
        ctx.fillStyle = 'rgba(117,200,208,0.23)'; ctx.fillRect(x + 30, y + 54, w - 60, 1);
    },
    row(ctx, x, y, w, h, active) {
        ctx.fillStyle = active ? 'rgba(109,185,191,0.12)' : 'rgba(3,12,19,0.65)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = active ? '#8ccbd0' : 'rgba(117,200,208,0.18)'; ctx.lineWidth = 1;
        ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
        ctx.fillStyle = active ? '#e5d779' : '#47767d'; ctx.fillRect(x, y + 9, 2, h - 18);
    },
    textWidth(ctx, text, tracking = 0) {
        const glyphs = Array.from(String(text));
        return glyphs.reduce((width, glyph) => width + ctx.measureText(glyph).width, 0) + Math.max(0, glyphs.length - 1) * tracking;
    },
    text(ctx, text, centerX, y, tracking = 0) {
        ctx.save(); ctx.textAlign = 'left';
        let x = centerX - this.textWidth(ctx, text, tracking) / 2;
        for (const glyph of Array.from(String(text))) {
            ctx.fillText(glyph, x, y);
            x += ctx.measureText(glyph).width + tracking;
        }
        ctx.restore();
    },
    path(ctx, x, y, w, h, cut) {
        ctx.beginPath(); ctx.moveTo(x + cut, y); ctx.lineTo(x + w - cut, y);
        ctx.lineTo(x + w, y + cut); ctx.lineTo(x + w, y + h - cut);
        ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x + cut, y + h);
        ctx.lineTo(x, y + h - cut); ctx.lineTo(x, y + cut); ctx.closePath();
    },
    panel(ctx, x, y, w, h, sx, sy, danger, tick = 0) {
        const unit = Math.min(sx, sy), accent = danger ? '#e86b85' : '#75c8d0';
        ctx.save();
        this.path(ctx, x + 6 * sx, y + 5 * sy, w - 12 * sx, h - 10 * sy, 2 * unit);
        const ink = ctx.createLinearGradient(x, y, x + w, y + h);
        ink.addColorStop(0, danger ? '#191119' : '#101c26'); ink.addColorStop(1, '#090e17');
        ctx.fillStyle = ink; ctx.shadowColor = '#000000aa'; ctx.shadowBlur = 24 * unit; ctx.fill();
        ctx.shadowBlur = 0; ctx.strokeStyle = accent + '18'; ctx.lineWidth = unit; ctx.stroke();
        ctx.save(); ctx.clip(); ctx.fillStyle = '#bed7e005';
        for (let yy = y + 3 * sy; yy < y + h; yy += 4 * sy) ctx.fillRect(x, yy, w, Math.max(0.5, sy * 0.5));
        ctx.restore();
        // Small illuminated corner brackets and gold registration marks echo the HUD frame.
        ctx.strokeStyle = accent; ctx.lineWidth = 1.5 * unit;
        ctx.shadowColor = accent; ctx.shadowBlur = 4 * unit;
        for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
            ctx.beginPath(); ctx.moveTo(cx, cy + dy * 17 * sy);
            ctx.lineTo(cx, cy); ctx.lineTo(cx + dx * 33 * sx, cy); ctx.stroke();
            ctx.shadowBlur = 0; ctx.strokeStyle = accent + '70'; ctx.lineWidth = unit;
            ctx.beginPath(); ctx.moveTo(cx + dx * 4 * sx, cy + dy * 11 * sy);
            ctx.lineTo(cx + dx * 4 * sx, cy + dy * 4 * sy);
            ctx.lineTo(cx + dx * 12 * sx, cy + dy * 4 * sy); ctx.stroke();
            ctx.fillStyle = accent; ctx.fillRect(cx - sx, cy - sy, 3 * sx, 3 * sy);
            ctx.strokeStyle = accent; ctx.lineWidth = 1.5 * unit; ctx.shadowBlur = 4 * unit;
        }
        ctx.shadowBlur = 0; ctx.fillStyle = '#e3cd72';
        for (const yy of [y, y + h]) {
            ctx.beginPath(); ctx.moveTo(x + 35 * sx, yy); ctx.lineTo(x + 40 * sx, yy);
            ctx.lineTo(x + 37 * sx, yy + (yy === y ? 2 : -2) * sy); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(x + w - 35 * sx, yy); ctx.lineTo(x + w - 40 * sx, yy);
            ctx.lineTo(x + w - 37 * sx, yy + (yy === y ? 2 : -2) * sy); ctx.closePath(); ctx.fill();
        }
        // Fixed edge chips with sparse fragments drifting away from the frame.
        // Seed positions by index so the wear stays stable rather than flickering.
        for (let i = 0; i < 24; i++) {
            const side = i % 4, along = 0.12 + ((i * 37) % 79) / 100;
            const horizontal = side < 2;
            const nx = side === 2 ? -1 : side === 3 ? 1 : 0;
            const ny = side === 0 ? -1 : side === 1 ? 1 : 0;
            const ex = horizontal ? x + along * w : x + (side === 2 ? 6 * sx : w - 6 * sx);
            const ey = horizontal ? y + (side === 0 ? 5 * sy : h - 5 * sy) : y + along * h;
            const chipW = (horizontal ? 3 + i % 5 : 2) * sx;
            const chipH = (horizontal ? 2 : 3 + i % 4) * sy;
            ctx.fillStyle = '#03070bd9';
            ctx.fillRect(Math.round(ex - chipW / 2), Math.round(ey - chipH / 2), chipW, chipH);
            ctx.fillStyle = accent + '42';
            ctx.fillRect(Math.round(ex - nx * 2 * sx), Math.round(ey - ny * 2 * sy), sx, sy);
            if (i % 3 === 1) continue;
            const phase = (tick * 0.0025 + i * 0.137) % 1;
            const drift = 4 + phase * 11;
            const tangent = Math.sin(tick * 0.012 + i) * 2;
            ctx.save(); ctx.globalAlpha *= Math.sin(phase * Math.PI) * 0.5;
            ctx.fillStyle = i % 6 === 0 ? '#d4ba6e' : accent;
            const size = 1 + i % 3;
            ctx.fillRect(Math.round(ex + (nx * drift + (horizontal ? tangent : 0)) * sx),
                Math.round(ey + (ny * drift + (horizontal ? 0 : tangent)) * sy), size * sx, (i % 4 === 0 ? 1 : 2) * sy);
            ctx.restore();
        }
        ctx.restore();
    },
    button(ctx, rect, sx, sy, label, font, mix, tick, danger) {
        // Match Game Over's borderless wash, feathered rails and moving focus light.
        ctx.save(); ctx.scale(sx, sy);
        const { x, y, w, h } = rect;
        const rgb = danger ? '231,105,143' : '117,206,215';
        const wash = ctx.createLinearGradient(x, 0, x + w, 0);
        wash.addColorStop(0, 'transparent'); wash.addColorStop(0.3, 'rgba(' + rgb + ',' + (0.04 + mix * 0.12) + ')');
        wash.addColorStop(0.7, 'rgba(' + rgb + ',' + (0.04 + mix * 0.12) + ')'); wash.addColorStop(1, 'transparent');
        ctx.fillStyle = wash; ctx.fillRect(x, y, w, h);
        const rail = ctx.createLinearGradient(x, 0, x + w, 0);
        rail.addColorStop(0, 'transparent'); rail.addColorStop(0.5, 'rgba(' + rgb + ',' + (0.25 + mix * 0.5) + ')'); rail.addColorStop(1, 'transparent');
        ctx.fillStyle = rail; ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h, w, 1);
        let size = 13;
        ctx.font = 'bold ' + size + 'px ' + font;
        while (ctx.measureText(label).width > w - 24 && size > 9) ctx.font = 'bold ' + (--size) + 'px ' + font;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = mix > 0.15 ? '#f5f7fc' : '#b4bfcb';
        ctx.shadowColor = danger ? '#d96b8c' : '#7cc9d2'; ctx.shadowBlur = 2 + mix * 5;
        ctx.fillText(label, x + w / 2, y + h / 2); ctx.shadowBlur = 0;
        const sweepX = x + (0.5 + Math.sin(tick * 0.022) * 0.5) * (w - 54);
        const sweep = ctx.createLinearGradient(sweepX, 0, sweepX + 54, 0);
        sweep.addColorStop(0, 'transparent'); sweep.addColorStop(0.5, '#eefaff'); sweep.addColorStop(1, 'transparent');
        ctx.globalAlpha *= mix * 0.55; ctx.fillStyle = sweep; ctx.fillRect(sweepX, y + h, 54, 1);
        ctx.restore();
    },
};

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
        this.onDismiss = null;
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
        this.onDismiss = typeof options.onDismiss === 'function' ? options.onDismiss : null;
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
            this._resolve(false, true);
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

    _resolve(confirmed, dismissed = false) {
        if (this.resolved) return;
        this.resolved = true;

        if (confirmed) Data.Systems.soundConfirmation.playSound();
        else Data.Systems.soundCancel.playSound();

        if (Manager.Stack.top === this) Manager.Stack.pop();
        Manager.Stack.requestPaintHUD = true;

        const callback = dismissed && this.onDismiss ? this.onDismiss : (confirmed ? this.onConfirm : this.onCancel);
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
        let panelH = this.value ? 248 : 192;
        // Keep longer, tracked copy clear of the buttons, including save-slot confirmations.
        const ctx = Common.Platform.ctx;
        if (typeof ctx.measureText === 'function') {
            const font = IP2Live.Assets && IP2Live.Assets.oxaniumMediumLoaded ? 'Oxanium-Medium' : 'sans-serif';
            ctx.save(); ctx.font = '13px ' + font;
            const messageRows = this._wrapText(ctx, this.message, panelW - 72, 0.45).length;
            ctx.font = '11px ' + font;
            const detailRows = this._wrapText(ctx, this.detail, panelW - 72, 0.35).length;
            panelH = Math.max(panelH, 131 + messageRows * 16 + (this.value ? 64 : 0) + (detailRows ? 4 + detailRows * 15 : 0));
            ctx.restore();
        }
        const panelX = (SW - panelW) / 2;
        const panelY = (SH - panelH) / 2;
        const buttonW = 172;
        const buttonH = 42;
        const buttonGap = 20;
        const buttonY = panelY + panelH - 58;
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

        const font = IP2Live.Assets && IP2Live.Assets.oxaniumMediumLoaded
            ? 'Oxanium-Medium'
            : 'sans-serif';

        ctx.save();
        this._drawScreenVeil(ctx, cW, cH, scaleX, scaleY);

        IP2Live.PopupChrome.animate(ctx, {x:layout.panelX*scaleX,y:layout.panelY*scaleY,w:layout.panelW*scaleX,h:layout.panelH*scaleY}, this.openProgress);

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
        const x = layout.panelX * scaleX, y = layout.panelY * scaleY;
        const w = layout.panelW * scaleX, h = layout.panelH * scaleY;
        IP2Live.PopupChrome.panel(ctx, x, y, w, h, scaleX, scaleY, this.danger, this.animTick);
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.font = (13 * scaleX) + 'px ' + font;
        const messages = this._wrapText(ctx, this.message, w - 72 * scaleX, 0.45 * scaleX);
        ctx.font = (11 * scaleX) + 'px ' + font;
        const details = this._wrapText(ctx, this.detail, w - 72 * scaleX, 0.35 * scaleX);
        const bodyH = messages.length * 16 + (this.value ? 64 : 0) + (details.length ? 4 + details.length * 15 : 0);
        const contentTop = 18 + Math.max(0, (layout.panelH - 92 - 35 - bodyH) / 2);
        let titleSize = 21;
        ctx.font = 'bold ' + (titleSize * scaleX) + 'px ' + font;
        while (IP2Live.PopupChrome.textWidth(ctx, this.title, 1.6 * scaleX) > w - 72 * scaleX && titleSize > 12) {
            ctx.font = 'bold ' + (--titleSize * scaleX) + 'px ' + font;
        }
        ctx.fillStyle = '#f1f5fa';
        IP2Live.PopupChrome.text(ctx, this.title, x + w / 2, y + (contentTop + 14) * scaleY, 1.6 * scaleX);
        const divider = ctx.createLinearGradient(x + 48 * scaleX, 0, x + w - 48 * scaleX, 0);
        divider.addColorStop(0, 'transparent'); divider.addColorStop(0.5, this.danger ? '#b4627866' : '#75c8d060'); divider.addColorStop(1, 'transparent');
        ctx.fillStyle = divider; ctx.fillRect(x + 48 * scaleX, y + (contentTop + 27) * scaleY, w - 96 * scaleX, scaleY);
        let baseline = y + (contentTop + 48) * scaleY;
        ctx.font = (13 * scaleX) + 'px ' + font; ctx.fillStyle = '#c8d4df';
        for (const line of messages) { IP2Live.PopupChrome.text(ctx, line, x + w / 2, baseline, 0.45 * scaleX); baseline += 16 * scaleY; }
        if (this.value) {
            this._drawValueDeck(ctx, x, baseline + 2 * scaleY, w, scaleX, scaleY, font);
            baseline += 64 * scaleY;
        }
        if (details.length) {
            baseline += 4 * scaleY;
            ctx.font = (11 * scaleX) + 'px ' + font;
            ctx.fillStyle = this.danger ? '#dba4b1' : '#93b1bf';
            for (const line of details) { IP2Live.PopupChrome.text(ctx, line, x + w / 2, baseline, 0.35 * scaleX); baseline += 15 * scaleY; }
        }
        this._drawButton(ctx, layout.cancel, scaleX, scaleY, this.cancelLabel, 0, font);
        this._drawButton(ctx, layout.confirm, scaleX, scaleY, this.confirmLabel, 1, font);
    }

    _drawValueDeck(ctx, x, y, w, sx, sy, font) {
        ctx.save();
        ctx.fillStyle = '#040a1280'; ctx.fillRect(x + 36 * sx, y, w - 72 * sx, 48 * sy);
        ctx.textAlign = 'center'; ctx.font = (9 * sx) + 'px ' + font; ctx.fillStyle = '#89a9b6';
        IP2Live.PopupChrome.text(ctx, this.valueLabel, x + w / 2, y + 17 * sy, 0.7 * sx);
        ctx.font = 'bold ' + (16 * sx) + 'px ' + font; ctx.fillStyle = '#eef6fa';
        ctx.fillText(this.value, x + w / 2, y + 36 * sy, w - 104 * sx);
        ctx.restore();
    }

    _drawButton(ctx, rect, sx, sy, label, index, font) {
        const mix = this.buttonMix ? this.buttonMix[index] : (this.selectedIndex === index ? 1 : 0);
        IP2Live.PopupChrome.button(ctx, rect, sx, sy, label, font, mix, this.animTick, this.danger);
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

    _wrapText(ctx, text, maxWidth, tracking = 0) {
        const words = String(text || '').split(/\s+/);
        const lines = [];
        let line = '';
        for (const word of words) {
            const candidate = line ? line + ' ' + word : word;
            if (line && IP2Live.PopupChrome.textWidth(ctx, candidate, tracking) > maxWidth) {
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
