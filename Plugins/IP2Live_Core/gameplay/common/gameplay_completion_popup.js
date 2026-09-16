/**
 * IP2Live - Shared Gameplay Completion Popup
 *
 * Compact, canvas-native success feedback shared by every gameplay screen.
 * Loaded by code.js before the individual gameplay bundles.
 */

(function () {
    const STATE_KEY = '_ip2liveCompletionPopup';

    const GameplayCompletionPopup = {
        VERSION: 'gameplay-completion-popup-20260916-02',
        DEFAULT_DURATION_MS: 950,

        begin(screen, options) {
            if (!screen || screen[STATE_KEY]) return false;
            const config = Object.assign({}, options || {});
            const durationMs = Math.max(650, Math.min(5000, Number(config.durationMs) || this.DEFAULT_DURATION_MS));
            const startedAt = Number(config.startedAt) || Date.now();
            screen[STATE_KEY] = {
                startedAt,
                durationMs,
                config,
                completed: false,
                dialoguePausedAt: this._dialogueIsActive() ? startedAt : null,
            };
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            return true;
        },

        isActive(screen) {
            const state = screen && screen[STATE_KEY];
            return !!(state && !state.completed);
        },

        isDialogueBlocking() {
            return this._dialogueIsActive();
        },

        update(screen, now) {
            const state = screen && screen[STATE_KEY];
            if (!state || state.completed) return false;
            const currentTime = Number(now) || Date.now();
            if (this._syncDialoguePause(state, currentTime)) return true;
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
            const currentTime = Number(now) || Date.now();
            const dialogueActive = this._syncDialoguePause(state, currentTime);
            const effectiveTime = dialogueActive && state.dialoguePausedAt !== null
                ? state.dialoguePausedAt
                : currentTime;
            return this._clamp01((effectiveTime - state.startedAt) / state.durationMs);
        },

        drawFor(screen, ctx, overrides) {
            const state = screen && screen[STATE_KEY];
            if (!state || state.completed) return false;
            if (this._syncDialoguePause(state, Date.now())) return false;
            return this.draw(ctx, Object.assign({}, state.config || {}, overrides || {}, {
                progress: this.progressFor(screen),
            }));
        },

        draw(ctx, options) {
            if (!ctx || !ctx.canvas || this._dialogueIsActive()) return false;
            const config = options || {};
            const cW = Number(ctx.canvas.width) || 1280;
            const cH = Number(ctx.canvas.height) || 720;
            const rawScale = Math.min(cW / 1280, cH / 720);
            const scale = Math.max(0.72, Math.min(1.15, rawScale || 1));
            const cardW = Math.min(cW - 32 * scale, 520 * scale);
            const cardH = Math.min(cH - 28 * scale, 150 * scale);
            const cardX = (cW - cardW) * 0.5;
            const cardY = (cH - cardH) * 0.5;
            const cut = 15 * scale;
            const progress = this._clamp01(config.progress === undefined ? 0.5 : config.progress);
            const tick = Number(config.tick) || 0;
            const pulse = 0.5 + 0.5 * Math.sin(tick * 0.12);
            const title = 'Task Complete';
            const titleFont = IP2Live.Assets && IP2Live.Assets.ethnocentricLoaded
                ? 'Ethnocentric'
                : (IP2Live.Assets && IP2Live.Assets.abnesLoaded ? 'Abnes' : 'sans-serif');

            ctx.save();
            if (typeof ctx.setTransform === 'function') ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = 1;
            const veil = ctx.createLinearGradient(0, 0, 0, cH);
            veil.addColorStop(0, 'rgba(0, 3, 8, 0.34)');
            veil.addColorStop(0.5, 'rgba(0, 5, 12, 0.56)');
            veil.addColorStop(1, 'rgba(0, 3, 8, 0.40)');
            ctx.fillStyle = veil;
            ctx.fillRect(0, 0, cW, cH);

            // Offset extrusion and a stepped shell make the card read as a
            // physical terminal module instead of a flat overlay.
            this._chamferPath(ctx, cardX + 9 * scale, cardY + 10 * scale, cardW, cardH, cut);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.76)';
            ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
            ctx.shadowBlur = 22 * scale;
            ctx.fill();
            ctx.shadowBlur = 0;

            this._chamferPath(ctx, cardX, cardY, cardW, cardH, cut);
            const shell = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
            shell.addColorStop(0, '#12323A');
            shell.addColorStop(0.18, '#07151C');
            shell.addColorStop(0.62, '#02080E');
            shell.addColorStop(1, '#0A2025');
            ctx.fillStyle = shell;
            ctx.shadowColor = 'rgba(0, 240, 255, 0.48)';
            ctx.shadowBlur = 17 * scale;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.92)';
            ctx.lineWidth = Math.max(1, 1.6 * scale);
            ctx.stroke();

            // Clipped diagonal machining marks and scanlines provide texture.
            ctx.save();
            this._chamferPath(ctx, cardX + 2 * scale, cardY + 2 * scale, cardW - 4 * scale, cardH - 4 * scale, cut - 2 * scale);
            ctx.clip();
            ctx.strokeStyle = 'rgba(122, 239, 255, 0.055)';
            ctx.lineWidth = Math.max(1, 1.2 * scale);
            for (let x = cardX - cardH; x < cardX + cardW + cardH; x += 18 * scale) {
                ctx.beginPath();
                ctx.moveTo(x, cardY + cardH);
                ctx.lineTo(x + 64 * scale, cardY);
                ctx.stroke();
            }
            for (let y = cardY + 5 * scale; y < cardY + cardH; y += 5 * scale) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.075)';
                ctx.fillRect(cardX, y, cardW, Math.max(1, 0.8 * scale));
            }
            ctx.restore();

            // Raised inner bevel and asymmetric accent plates.
            this._chamferPath(ctx, cardX + 5 * scale, cardY + 5 * scale, cardW - 10 * scale, cardH - 10 * scale, cut - 4 * scale);
            ctx.strokeStyle = 'rgba(191, 248, 255, 0.20)';
            ctx.lineWidth = Math.max(1, scale);
            ctx.stroke();
            ctx.fillStyle = '#59FF9A';
            ctx.fillRect(cardX, cardY + 22 * scale, 4 * scale, cardH - 44 * scale);
            ctx.fillStyle = '#FF315F';
            ctx.fillRect(cardX + cardW - 58 * scale, cardY, 38 * scale, 3 * scale);
            ctx.fillStyle = '#FFE600';
            ctx.fillRect(cardX + cardW - 18 * scale, cardY, 18 * scale, 3 * scale);
            ctx.strokeStyle = 'rgba(255,255,255,0.42)';
            ctx.lineWidth = Math.max(1, scale);
            ctx.beginPath();
            ctx.moveTo(cardX + cut, cardY + 3 * scale);
            ctx.lineTo(cardX + cardW - 62 * scale, cardY + 3 * scale);
            ctx.stroke();

            const iconX = cardX + 68 * scale;
            const iconY = cardY + 66 * scale;
            const iconR = 29 * scale;
            this._octagonPath(ctx, iconX + 5 * scale, iconY + 6 * scale, iconR + 7 * scale);
            ctx.fillStyle = 'rgba(0,0,0,0.72)';
            ctx.fill();

            this._octagonPath(ctx, iconX, iconY, iconR + 7 * scale);
            const iconPlate = ctx.createLinearGradient(iconX - iconR, iconY - iconR, iconX + iconR, iconY + iconR);
            iconPlate.addColorStop(0, '#16483E');
            iconPlate.addColorStop(0.46, '#061C1B');
            iconPlate.addColorStop(1, '#020A0D');
            ctx.fillStyle = iconPlate;
            ctx.shadowColor = 'rgba(89,255,154,' + (0.30 + pulse * 0.28) + ')';
            ctx.shadowBlur = (8 + pulse * 9) * scale;
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = 'rgba(89,255,154,0.84)';
            ctx.lineWidth = Math.max(1.5, 1.8 * scale);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(iconX, iconY, iconR, 0, Math.PI * 2);
            const iconWell = ctx.createLinearGradient(iconX, iconY - iconR, iconX, iconY + iconR);
            iconWell.addColorStop(0, 'rgba(20,76,65,0.98)');
            iconWell.addColorStop(0.52, 'rgba(2,22,23,0.99)');
            iconWell.addColorStop(1, 'rgba(0,8,12,0.99)');
            ctx.fillStyle = iconWell;
            ctx.fill();
            ctx.strokeStyle = '#59FF9A';
            ctx.lineWidth = Math.max(1.5, 2 * scale);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(iconX, iconY, iconR - 5 * scale, Math.PI * 1.08, Math.PI * 1.88);
            ctx.strokeStyle = 'rgba(222,255,237,0.62)';
            ctx.lineWidth = Math.max(1, scale);
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

            const textX = cardX + 121 * scale;
            const textW = cardW - 151 * scale;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#F4FBFF';
            ctx.shadowColor = 'rgba(0,240,255,0.38)';
            ctx.shadowBlur = 6 * scale;
            this._fitFont(ctx, title, textW, 27 * scale, 17 * scale, titleFont, false);
            ctx.fillText(title, textX, iconY);
            ctx.shadowBlur = 0;

            // Beveled progress rail with segmented fill, moving sheen, and a
            // diamond endpoint. It remains purely visual; no extra copy.
            const railX = cardX + 31 * scale;
            const railY = cardY + cardH - 28 * scale;
            const railW = cardW - 62 * scale;
            const railH = 13 * scale;
            this._chamferPath(ctx, railX + 3 * scale, railY + 4 * scale, railW, railH, 4 * scale);
            ctx.fillStyle = 'rgba(0,0,0,0.72)';
            ctx.fill();
            this._chamferPath(ctx, railX, railY, railW, railH, 4 * scale);
            const railShell = ctx.createLinearGradient(railX, railY, railX, railY + railH);
            railShell.addColorStop(0, '#293B43');
            railShell.addColorStop(0.42, '#071116');
            railShell.addColorStop(1, '#16272D');
            ctx.fillStyle = railShell;
            ctx.fill();
            ctx.strokeStyle = 'rgba(115,206,220,0.42)';
            ctx.lineWidth = Math.max(1, scale);
            ctx.stroke();

            const innerX = railX + 3 * scale;
            const innerY = railY + 3 * scale;
            const innerW = railW - 6 * scale;
            const innerH = railH - 6 * scale;
            const progressW = innerW * progress;
            if (progressW > 0) {
                ctx.save();
                this._chamferPath(ctx, innerX, innerY, innerW, innerH, 2 * scale);
                ctx.clip();
                const fill = ctx.createLinearGradient(innerX, innerY, innerX + innerW, innerY);
                fill.addColorStop(0, '#00B6C8');
                fill.addColorStop(0.58, '#00F0FF');
                fill.addColorStop(1, '#59FF9A');
                ctx.fillStyle = fill;
                ctx.shadowColor = '#00F0FF';
                ctx.shadowBlur = 8 * scale;
                ctx.fillRect(innerX, innerY, progressW, innerH);
                ctx.shadowBlur = 0;
                for (let sx = innerX + 12 * scale; sx < innerX + progressW; sx += 16 * scale) {
                    ctx.fillStyle = 'rgba(0,19,25,0.35)';
                    ctx.fillRect(sx, innerY, 2 * scale, innerH);
                }
                const sweepX = innerX + ((tick * 2.5 * scale) % Math.max(1, progressW));
                const sheen = ctx.createLinearGradient(sweepX - 12 * scale, innerY, sweepX + 12 * scale, innerY);
                sheen.addColorStop(0, 'rgba(255,255,255,0)');
                sheen.addColorStop(0.5, 'rgba(255,255,255,0.55)');
                sheen.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = sheen;
                ctx.fillRect(sweepX - 12 * scale, innerY, 24 * scale, innerH);
                ctx.restore();

                const markerX = Math.min(innerX + innerW - 4 * scale, innerX + progressW);
                const markerY = railY + railH / 2;
                ctx.beginPath();
                ctx.moveTo(markerX, markerY - 5 * scale);
                ctx.lineTo(markerX + 5 * scale, markerY);
                ctx.lineTo(markerX, markerY + 5 * scale);
                ctx.lineTo(markerX - 5 * scale, markerY);
                ctx.closePath();
                ctx.fillStyle = '#E9FFFF';
                ctx.shadowColor = '#00F0FF';
                ctx.shadowBlur = 8 * scale;
                ctx.fill();
                ctx.shadowBlur = 0;
            }
            ctx.restore();

            return {
                x: cardX,
                y: cardY,
                w: cardW,
                h: cardH,
                title,
                progress,
            };
        },

        _dialogueIsActive() {
            return !!(
                IP2Live.DialogueManager &&
                typeof IP2Live.DialogueManager.isActive === 'function' &&
                IP2Live.DialogueManager.isActive()
            );
        },

        _syncDialoguePause(state, now) {
            if (!state) return false;
            const currentTime = Number(now) || Date.now();
            if (this._dialogueIsActive()) {
                if (state.dialoguePausedAt === null || state.dialoguePausedAt === undefined) {
                    state.dialoguePausedAt = currentTime;
                }
                return true;
            }
            if (state.dialoguePausedAt !== null && state.dialoguePausedAt !== undefined) {
                state.startedAt += Math.max(0, currentTime - state.dialoguePausedAt);
                state.dialoguePausedAt = null;
            }
            return false;
        },

        _octagonPath(ctx, cx, cy, radius) {
            const corner = radius * 0.42;
            ctx.beginPath();
            ctx.moveTo(cx - corner, cy - radius);
            ctx.lineTo(cx + corner, cy - radius);
            ctx.lineTo(cx + radius, cy - corner);
            ctx.lineTo(cx + radius, cy + corner);
            ctx.lineTo(cx + corner, cy + radius);
            ctx.lineTo(cx - corner, cy + radius);
            ctx.lineTo(cx - radius, cy + corner);
            ctx.lineTo(cx - radius, cy - corner);
            ctx.closePath();
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
