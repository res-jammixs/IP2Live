/**
 * IP2Live - Shared Gameplay Completion Popup
 *
 * Compact, canvas-native success feedback shared by every gameplay screen.
 * Loaded by code.js before the individual gameplay bundles.
 */

(function () {
    const STATE_KEY = '_ip2liveCompletionPopup';

    const GameplayCompletionPopup = {
        VERSION: 'gameplay-completion-popup-20260821-01',
        DEFAULT_DURATION_MS: 950,

        begin(screen, options) {
            if (!screen || screen[STATE_KEY]) return false;
            const config = Object.assign({}, options || {});
            const durationMs = Math.max(650, Math.min(5000, Number(config.durationMs) || this.DEFAULT_DURATION_MS));
            screen[STATE_KEY] = {
                startedAt: Number(config.startedAt) || Date.now(),
                durationMs,
                config,
                completed: false,
            };
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            return true;
        },

        isActive(screen) {
            const state = screen && screen[STATE_KEY];
            return !!(state && !state.completed);
        },

        update(screen, now) {
            const state = screen && screen[STATE_KEY];
            if (!state || state.completed) return false;
            if (
                IP2Live.DialogueManager &&
                typeof IP2Live.DialogueManager.isActive === 'function' &&
                IP2Live.DialogueManager.isActive()
            ) {
                return true;
            }
            const currentTime = Number(now) || Date.now();
            if (currentTime - state.startedAt < state.durationMs) return true;
            return this.complete(screen);
        },

        complete(screen) {
            const state = screen && screen[STATE_KEY];
            if (!state || state.completed) return false;
            state.completed = true;
            const callback = state.config && state.config.onComplete;
            const result = state.config && state.config.result;
            if (typeof callback === 'function') callback(result || {});
            return true;
        },

        progressFor(screen, now) {
            const state = screen && screen[STATE_KEY];
            if (!state) return 0;
            return this._clamp01(((Number(now) || Date.now()) - state.startedAt) / state.durationMs);
        },

        drawFor(screen, ctx, overrides) {
            const state = screen && screen[STATE_KEY];
            if (!state || state.completed) return false;
            return this.draw(ctx, Object.assign({}, state.config || {}, overrides || {}, {
                progress: this.progressFor(screen),
            }));
        },

        draw(ctx, options) {
            if (!ctx || !ctx.canvas) return false;
            const config = options || {};
            const cW = Number(ctx.canvas.width) || 1280;
            const cH = Number(ctx.canvas.height) || 720;
            const rawScale = Math.min(cW / 1280, cH / 720);
            const scale = Math.max(0.72, Math.min(1.15, rawScale || 1));
            const cardW = Math.min(cW - 32 * scale, 500 * scale);
            const cardH = Math.min(cH - 28 * scale, 142 * scale);
            const cardX = (cW - cardW) * 0.5;
            const cardY = (cH - cardH) * 0.5;
            const cut = 12 * scale;
            const progress = this._clamp01(config.progress === undefined ? 0.5 : config.progress);
            const tick = Number(config.tick) || 0;
            const pulse = 0.65 + Math.sin(tick * 0.12) * 0.12;
            const title = this._cleanText(config.title || 'TASK COMPLETE', 42);
            const label = this._cleanText(
                config.label || config.questLabel || 'Gameplay objective verified',
                72
            );
            const footer = this._cleanText(
                config.footer || 'PROGRESS SECURED  //  RETURNING TO MISSION',
                72
            );
            const primaryFont = IP2Live.Assets && IP2Live.Assets.nebulaLoaded
                ? 'Nebula-Regular'
                : 'monospace';
            const titleFont = IP2Live.Assets && IP2Live.Assets.abnesLoaded
                ? 'Abnes'
                : primaryFont;

            ctx.save();
            if (typeof ctx.setTransform === 'function') ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = 1;
            ctx.fillStyle = 'rgba(0, 4, 10, 0.48)';
            ctx.fillRect(0, 0, cW, cH);

            ctx.shadowColor = 'rgba(0, 240, 255, 0.42)';
            ctx.shadowBlur = 15 * scale;
            this._chamferPath(ctx, cardX, cardY, cardW, cardH, cut);
            const shell = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
            shell.addColorStop(0, 'rgba(8, 25, 31, 0.98)');
            shell.addColorStop(0.58, 'rgba(3, 10, 16, 0.99)');
            shell.addColorStop(1, 'rgba(5, 18, 20, 0.99)');
            ctx.fillStyle = shell;
            ctx.fill();
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.88)';
            ctx.lineWidth = Math.max(1, 1.4 * scale);
            ctx.stroke();
            ctx.shadowBlur = 0;

            ctx.fillStyle = '#59FF9A';
            ctx.fillRect(cardX, cardY + 18 * scale, 3 * scale, cardH - 36 * scale);

            const iconX = cardX + 51 * scale;
            const iconY = cardY + cardH * 0.5;
            const iconR = 21 * scale;
            ctx.globalAlpha = pulse;
            ctx.fillStyle = 'rgba(89, 255, 154, 0.12)';
            ctx.beginPath();
            ctx.arc(iconX, iconY, iconR + 7 * scale, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.fillStyle = 'rgba(4, 31, 28, 0.96)';
            ctx.strokeStyle = '#59FF9A';
            ctx.lineWidth = Math.max(1.5, 2 * scale);
            ctx.beginPath();
            ctx.arc(iconX, iconY, iconR, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.strokeStyle = '#E8FFF1';
            ctx.lineWidth = Math.max(2, 3 * scale);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(iconX - 9 * scale, iconY);
            ctx.lineTo(iconX - 2 * scale, iconY + 7 * scale);
            ctx.lineTo(iconX + 11 * scale, iconY - 8 * scale);
            ctx.stroke();

            const textX = cardX + 91 * scale;
            const textW = cardW - 116 * scale;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#59FF9A';
            ctx.font = 'bold ' + Math.round(7.2 * scale) + 'px monospace';
            ctx.fillText('OBJECTIVE VERIFIED', textX, cardY + 31 * scale);

            ctx.fillStyle = '#F4FBFF';
            this._fitFont(ctx, title, textW, 23 * scale, 15 * scale, titleFont, true);
            ctx.fillText(title, textX, cardY + 65 * scale);

            ctx.fillStyle = '#A9C8D2';
            this._fitFont(ctx, label, textW, 10.5 * scale, 7.5 * scale, primaryFont, true);
            ctx.fillText(label, textX, cardY + 88 * scale);

            ctx.fillStyle = 'rgba(126, 173, 184, 0.86)';
            this._fitFont(ctx, footer, textW, 7.2 * scale, 5.8 * scale, 'monospace', true);
            ctx.fillText(footer, textX, cardY + 113 * scale);

            const railX = textX;
            const railY = cardY + 124 * scale;
            const railW = textW;
            const railH = Math.max(2, 3 * scale);
            ctx.fillStyle = 'rgba(55, 86, 94, 0.58)';
            ctx.fillRect(railX, railY, railW, railH);
            ctx.fillStyle = '#00F0FF';
            ctx.fillRect(railX, railY, Math.max(5 * scale, railW * progress), railH);

            ctx.fillStyle = '#FF315F';
            ctx.fillRect(cardX + cardW - 23 * scale, cardY, 23 * scale, 3 * scale);
            ctx.restore();

            return {
                x: cardX,
                y: cardY,
                w: cardW,
                h: cardH,
                title,
                label,
                footer,
                progress,
            };
        },

        _chamferPath(ctx, x, y, w, h, cut) {
            const c = Math.max(0, Math.min(cut, w * 0.2, h * 0.35));
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
        },

        _fitFont(ctx, text, maxWidth, startSize, minSize, family, bold) {
            let size = Math.max(minSize, startSize);
            const weight = bold ? 'bold ' : '';
            ctx.font = weight + Math.round(size) + 'px ' + family;
            if (typeof ctx.measureText !== 'function') return size;
            while (size > minSize && ctx.measureText(text).width > maxWidth) {
                size -= 0.5;
                ctx.font = weight + Math.round(size) + 'px ' + family;
            }
            return size;
        },

        _cleanText(value, limit) {
            const text = String(value || '').replace(/\s+/g, ' ').trim();
            const max = Math.max(1, Number(limit) || 72);
            return text.length <= max ? text : text.slice(0, Math.max(1, max - 1)).trim() + '…';
        },

        _clamp01(value) {
            const number = Number(value);
            if (!Number.isFinite(number)) return 0;
            return Math.max(0, Math.min(1, number));
        },
    };

    IP2Live.GameplayCompletionPopup = GameplayCompletionPopup;
    window.IP2LiveGameplayCompletionPopup = GameplayCompletionPopup;
    console.log('[IP2Live] gameplay_completion_popup.js loaded.');
}());
