/**
 * IP2Live â€” Settings Menu Screen
 * @file Plugins/IP2Live_Core/modules/screens/settings.js
 * Loaded via fetch + new Function() by code.js â€” all engine globals are
 * injected as function parameters (Common, Core, Data, Graphic, Manager,
 * Scene, Model, Main, THREE, IP2Live).
 */

class IP2LiveSettingsMenu extends Scene.Base {
    constructor() { super(true); }

    initialize() {
        this.selectedIndex = 0;
        this.menuItems = ["KEY BINDINGS", "SFX VOL", "MUSIC VOL", "LANGUAGE [EN]", "BACK"];
        this.hoverIndex = -1;
        this.animTick = 0;
        this.glitchActive = false;
        this.glitchTimer = 0;
        this.pendingAction = null;
        this.scanlineOffset = 0;
        this.adjustingVolumeType = null;
        this.sfxVolume = this._readSfxVolumePercent();
        this.musicVolume = this._readMusicVolumePercent();
        this._applySfxVolumeSetting();
        this._applyMusicVolumeSetting();
        this.bgFx = IP2Live.BgFx.create();
        this.scramble = IP2Live.TextScramble.create(this.menuItems.length);
    }

    async load() {
        if (!IP2Live.Assets.bgImage) await IP2Live.Assets.loadAll();
        const cW = Common.Platform.ctx.canvas.width;
        const cH = Common.Platform.ctx.canvas.height;
        this.bgFx.seed(cW, cH);
        this.loading = false;
        Manager.Stack.requestPaintHUD = true;
    }

    onKeyPressed(key) {
        if (this.adjustingVolumeType) {
            if (Data.Keyboards.checkActionMenu(key) || Data.Keyboards.checkCancelMenu(key)) {
                this.adjustingVolumeType = null;
                Data.Systems.soundConfirmation.playSound();
                Manager.Stack.requestPaintHUD = true;
            }
            return;
        }
        if (Data.Keyboards.checkActionMenu(key)) {
            this._confirmSelection();
        } else if (Data.Keyboards.checkCancelMenu(key)) {
            this._resume();
        }
    }

    onKeyPressedAndRepeat(key) {
        if (this.adjustingVolumeType) {
            const isLeft = (Data.Keyboards.menuControls && Data.Keyboards.menuControls.Left)
                ? Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Left)
                : (key === 37 || key === 65);
            const isRight = (Data.Keyboards.menuControls && Data.Keyboards.menuControls.Right)
                ? Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Right)
                : (key === 39 || key === 68);

            if (isLeft) {
                this._setVolumePercent(this.adjustingVolumeType, this._volumeForType(this.adjustingVolumeType) - 10);
                Data.Systems.soundCursor.playSound();
                Manager.Stack.requestPaintHUD = true;
            } else if (isRight) {
                this._setVolumePercent(this.adjustingVolumeType, this._volumeForType(this.adjustingVolumeType) + 10);
                Data.Systems.soundCursor.playSound();
                Manager.Stack.requestPaintHUD = true;
            }
            return true;
        }

        const prev = this.selectedIndex;
        if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Up)) {
            this.selectedIndex = (this.selectedIndex - 1 + this.menuItems.length) % this.menuItems.length;
        } else if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Down)) {
            this.selectedIndex = (this.selectedIndex + 1) % this.menuItems.length;
        }
        if (this.selectedIndex !== prev) {
            this.hoverIndex = -1;
            Data.Systems.soundCursor.playSound();
            Manager.Stack.requestPaintHUD = true;
        }
        return true;
    }

    onMouseMove(x, y) {
        const newHover = this._getButtonAt(x, y);
        if (newHover !== this.hoverIndex) {
            this.hoverIndex = newHover;
            if (newHover >= 0 && newHover !== this.selectedIndex) {
                this.selectedIndex = newHover;
                Data.Systems.soundCursor.playSound();
            }
            Manager.Stack.requestPaintHUD = true;
        }
    }

    onMouseUp(x, y) {
        const idx = this._getButtonAt(x, y);
        if (idx >= 0) {
            if (idx !== this.selectedIndex) {
                this.selectedIndex = idx;
                Data.Systems.soundCursor.playSound();
            }
            this._confirmSelection();
        }
    }

    _getButtonAt(x, y) {
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const cW = Common.Platform.ctx.canvas.width;
        const cH = Common.Platform.ctx.canvas.height;
        const scaleX = cW / SW;
        const scaleY = cH / SH;
        const btnW = 320, btnH = 46;
        const panelW = 420;
        const panelX = (SW - panelW) / 2;
        const bx = panelX + (panelW - btnW) / 2;
        const startY = SH / 2 - 108;
        for (let i = 0; i < this.menuItems.length; i++) {
            const by = startY + i * (btnH + 10);
            if (x >= bx * scaleX && x <= (bx + btnW) * scaleX &&
                y >= by * scaleY && y <= (by + btnH) * scaleY) return i;
        }
        return -1;
    }

    _confirmSelection() {
        const volumeType = this._volumeTypeForIndex(this.selectedIndex);
        if (volumeType && !this.adjustingVolumeType) {
            Data.Systems.soundConfirmation.playSound();
            this.adjustingVolumeType = volumeType;
            Manager.Stack.requestPaintHUD = true;
            return;
        }
        if (this.selectedIndex === 3) {
            Data.Systems.soundCancel.playSound();
            return;
        }
        Data.Systems.soundConfirmation.playSound();
        this.glitchActive = true;
        this.glitchTimer = 6;
        this.pendingAction = this.selectedIndex;
        Manager.Stack.requestPaintHUD = true;
        const self = this;
        setTimeout(() => { self._executeAction(self.pendingAction); }, 100);
    }

    _resume() {
        Data.Systems.soundCancel.playSound();
        Manager.Stack.pop();
    }

    _executeAction(idx) {
        switch (idx) {
            case 0:
                this.glitchActive = false;
                Manager.Stack.push(new IP2LiveKeyboardMenu());
                break;
            case 4:
                this._resume();
                break;
        }
    }

    _volumeTypeForIndex(index) {
        if (index === 1) return 'sfx';
        if (index === 2) return 'music';
        return null;
    }

    _volumeForType(type) {
        return type === 'music' ? this.musicVolume : this.sfxVolume;
    }

    _readSfxVolumePercent() {
        if (typeof IP2Live !== 'undefined' && typeof IP2Live.sfxVolume === 'number') {
            return Math.round(Math.max(0, Math.min(1, IP2Live.sfxVolume)) * 100);
        }
        if (typeof IP2Live !== 'undefined' && typeof IP2Live.masterVolume === 'number') {
            return Math.round(Math.max(0, Math.min(1, IP2Live.masterVolume)) * 100);
        }
        if (typeof Howler !== 'undefined' && typeof Howler.volume === 'function') {
            return Math.round(Howler.volume() * 100);
        }
        return 100;
    }

    _readMusicVolumePercent() {
        if (typeof IP2Live !== 'undefined' && typeof IP2Live.musicVolume === 'number') {
            return Math.round(Math.max(0, Math.min(1, IP2Live.musicVolume)) * 100);
        }
        if (typeof IP2Live !== 'undefined' && typeof IP2Live.masterVolume === 'number') {
            return Math.round(Math.max(0, Math.min(1, IP2Live.masterVolume)) * 100);
        }
        if (IP2Live.MusicManager && typeof IP2Live.MusicManager.getVolume === 'function') {
            return Math.round(IP2Live.MusicManager.getVolume() * 100);
        }
        return 100;
    }

    _setVolumePercent(type, value) {
        const next = Math.max(0, Math.min(100, Math.round(value)));
        if (type === 'music') {
            this.musicVolume = next;
            this._applyMusicVolumeSetting();
            return;
        }
        this.sfxVolume = next;
        this._applySfxVolumeSetting();
    }

    _applySfxVolumeSetting() {
        const volume = this.sfxVolume / 100;
        IP2Live.sfxVolume = volume;
        if (typeof Howler !== 'undefined' && typeof Howler.volume === 'function') {
            Howler.volume(volume);
        }
        if (IP2Live.SoundFX && typeof IP2Live.SoundFX.setMasterVolume === 'function') {
            IP2Live.SoundFX.setMasterVolume(volume);
        }
    }

    _applyMusicVolumeSetting() {
        const volume = this.musicVolume / 100;
        IP2Live.musicVolume = volume;
        if (IP2Live.MusicManager && typeof IP2Live.MusicManager.setVolume === 'function') {
            IP2Live.MusicManager.setVolume(volume);
        }
    }

    update() {
        this.animTick++;
        this.scanlineOffset = (this.scanlineOffset + 0.5) % 4;
        if (this.glitchTimer > 0) {
            this.glitchTimer--;
            this.glitchActive = this.glitchTimer > 0;
        }
        this.bgFx.update(this.animTick);
        this.scramble.update(this.selectedIndex, this.hoverIndex);
        if (this.animTick % 2 === 0) Manager.Stack.requestPaintHUD = true;
    }

    draw3D() { Manager.GL.renderer.clear(); }

    drawHUD() {
        const ctx = Common.Platform.ctx;
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const scaleX = cW / SW;
        const scaleY = cH / SH;

        ctx.save();

        this.bgFx.drawBg(ctx, IP2Live.Assets.bgImage, cW, cH);
        this.bgFx.drawParticles(ctx, scaleX);

        ctx.fillStyle = 'rgba(0,0,10,0.78)';
        ctx.fillRect(0, 0, cW, cH);

        ctx.globalAlpha = 0.05;
        ctx.fillStyle = '#000';
        for (let ly = this.scanlineOffset * scaleY; ly < cH; ly += 4 * scaleY) {
            ctx.fillRect(0, ly, cW, 1.5 * scaleY);
        }
        ctx.globalAlpha = 1;

        const panelW = 420, panelH = 420;
        const panelX = (SW - panelW) / 2;
        const panelY = (SH - panelH) / 2;
        const px = panelX * scaleX, py = panelY * scaleY;
        const pw = panelW * scaleX, ph = panelH * scaleY;

        IP2Live.UI.drawCyberPanel({
            ctx,
            x: px,
            y: py,
            w: pw,
            h: ph,
            scaleX,
            accent: '#00F0FF',
            title: 'SYS::CONFIG'
        });

        this._drawSettingsTitle(ctx, scaleX, scaleY, SW, SH, panelX, panelY, panelW);

        const divY = (panelY + 68) * scaleY;
        ctx.strokeStyle = 'rgba(0,255,255,0.25)';
        ctx.lineWidth = 1 * scaleX;
        ctx.beginPath();
        ctx.moveTo((panelX + 20) * scaleX, divY);
        ctx.lineTo((panelX + panelW - 20) * scaleX, divY);
        ctx.stroke();

        const btnW = 320, btnH = 46;
        const bx = panelX + (panelW - btnW) / 2;
        const startY = SH / 2 - 108;

        for (let i = 0; i < this.menuItems.length; i++) {
            const by = startY + i * (btnH + 10);
            let labelText = this.menuItems[i];
            this._drawButton(ctx, scaleX, scaleY, bx, by, btnW, btnH, labelText,
                i === this.selectedIndex, i === this.hoverIndex, i);
            const volumeType = this._volumeTypeForIndex(i);
            if (volumeType) {
                this._drawVolumeMeter(
                    ctx,
                    scaleX,
                    scaleY,
                    bx + 164,
                    by + 8,
                    140,
                    30,
                    i === this.selectedIndex,
                    this._volumeForType(volumeType),
                    volumeType === 'music' ? 'MUSIC' : 'SFX',
                    this.adjustingVolumeType === volumeType
                );
            }
        }

        ctx.font = (8 * scaleX) + 'px monospace';
        ctx.fillStyle = 'rgba(0,255,255,0.35)';
        ctx.textAlign = 'center';
        ctx.fillText('[ SYS::CONFIG ]', (SW / 2) * scaleX, (panelY + panelH - 14) * scaleY);
        ctx.textAlign = 'left';

        ctx.restore();
    }

    _drawSettingsTitle(ctx, scaleX, scaleY, SW, SH, panelX, panelY, panelW) {
        const fontName = IP2Live.Assets.abnesLoaded ? 'Abnes' : 'Arial Black';
        const cx = (panelX + panelW / 2) * scaleX;
        const ty = (panelY + 48) * scaleY;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowBlur = 0;
        ctx.font = 'bold ' + (28 * scaleX) + 'px ' + fontName;
        ctx.fillText('SETTINGS', cx, ty);
        ctx.textAlign = 'left';
    }

    _drawButton(ctx, scaleX, scaleY, bx, by, bw, bh, label, isSelected, isHover, index) {
        const isActive = isSelected || isHover;
        const isDanger = (index === 4); // 4=Back
        
        IP2Live.UI.drawCyberButton({
            ctx,
            x: bx * scaleX,
            y: by * scaleY,
            w: bw * scaleX,
            h: bh * scaleY,
            scaleX, scaleY,
            label,
            numberLabel: '0' + (index + 1),
            isActive,
            isDanger,
            scrambleText: isActive ? this.scramble.getText(index, label) : undefined,
            animTick: this.animTick
        });
    }

    _drawVolumeMeter(ctx, scaleX, scaleY, bx, by, bw, bh, isActive, value, meterLabel, isAdjusting) {
        const x = bx * scaleX;
        const y = by * scaleY;
        const w = bw * scaleX;
        const h = bh * scaleY;
        const pct = Math.max(0, Math.min(100, value));
        const pad = 4 * scaleX;
        const pctW = 48 * scaleX;
        const gap = 6 * scaleX;
        const barX = x + pad;
        const barY = y + pad;
        const barW = Math.max(18 * scaleX, w - pctW - gap - pad * 2);
        const barH = h - pad * 2;
        const fillW = barW * pct / 100;
        const pctX = barX + barW + gap;
        const pctY = y + 3 * scaleY;
        const pctH = h - 6 * scaleY;

        ctx.save();
        ctx.fillStyle = isActive ? 'rgba(255,230,0,0.16)' : 'rgba(3,7,20,0.82)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = isAdjusting ? '#FFFFFF' : (isActive ? '#FFE600' : 'rgba(0,240,255,0.64)');
        ctx.lineWidth = 1.5 * scaleX;
        ctx.strokeRect(x, y, w, h);

        const grad = ctx.createLinearGradient(x, y, x + w, y);
        grad.addColorStop(0, '#00F0FF');
        grad.addColorStop(0.72, '#FFE600');
        grad.addColorStop(1, '#FF003C');
        ctx.fillStyle = grad;
        ctx.fillRect(barX, barY, Math.max(0, fillW), barH);

        for (let i = 1; i < 10; i++) {
            const sx = barX + (barW * i / 10);
            ctx.strokeStyle = 'rgba(3,7,20,0.78)';
            ctx.beginPath();
            ctx.moveTo(sx, barY);
            ctx.lineTo(sx, barY + barH);
            ctx.stroke();
        }

        ctx.fillStyle = 'rgba(1,3,10,0.94)';
        ctx.fillRect(pctX, pctY, pctW, pctH);
        ctx.strokeStyle = isActive ? '#FFFFFF' : 'rgba(0,240,255,0.75)';
        ctx.strokeRect(pctX, pctY, pctW, pctH);

        ctx.font = 'bold ' + Math.round(11 * scaleX) + 'px monospace';
        ctx.fillStyle = isActive ? '#FFE600' : '#FFFFFF';
        ctx.textAlign = 'center';
        ctx.fillText(`${pct}%`, pctX + pctW / 2, y + h * 0.65);

        ctx.font = Math.round(6.5 * scaleX) + 'px monospace';
        ctx.fillStyle = isAdjusting ? '#FFFFFF' : (isActive ? 'rgba(255,230,0,0.78)' : 'rgba(0,240,255,0.58)');
        ctx.fillText(isAdjusting ? '< ADJUST >' : meterLabel, barX + barW / 2, y - 3 * scaleY);
        ctx.restore();
    }
}
window.IP2LiveSettingsMenu = IP2LiveSettingsMenu;
console.log('[IP2Live] settings.js loaded.');

