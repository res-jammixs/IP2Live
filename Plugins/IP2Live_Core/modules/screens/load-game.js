/**
 * IP2Live â€” Load Game Menu Screen
 * @file Plugins/IP2Live_Core/modules/screens/load-game.js
 * Loaded via fetch + new Function() by code.js â€” all engine globals are
 * injected as function parameters (Common, Core, Data, Graphic, Manager,
 * Scene, Model, Main, THREE, IP2Live).
 */

class IP2LiveLoadGameMenu extends Scene.Base {
    constructor(options) {
        super(true);
        this.options = options || {};
        this._applyModeOptions();
    }

    initialize() {
        this.options = this.options || {};
        this._applyModeOptions();
        this.selectedIndex = 0;
        this.hoverIndex = -1;
        this.animTick = 0;
        this.scanlineOffset = 0;
        this.gamesData = [];
        this.slotMetaByIndex = {};
        this.scrollY = 0;
        this.maxVisible = 4;
        this.saveNameDialog = null;
        this.savingInProgress = false;
        this._spaceStars = null;

    }

    _applyModeOptions() {
        this.saveMode = !!(this.options && this.options.saveMode);
        this.titleText = this.saveMode ? 'SAVE GAME' : 'LOAD GAME';
        this.panelTitle = this.saveMode ? 'SYS::SAVE_ARCHIVE_WRITE' : 'SYS::SAVE_ARCHIVE';
        this.onSaved = this.options && typeof this.options.onSaved === 'function' ? this.options.onSaved : null;
    }

    _getLayout(SW, SH) {
        const panelW = Math.min(920, SW - 56);
        const panelH = Math.min(552, SH - 48);
        const panelX = (SW - panelW) / 2, panelY = (SH - panelH) / 2;
        const rightW = Math.min(252, panelW * 0.3);
        const listX = panelX + 28, listW = panelW - rightW - 80;
        const listStartY = panelY + 112, itemGap = 12;
        this.maxVisible = Math.max(1, Math.min(4, Math.floor((panelH - 196) / 84)));
        const itemH = (panelH - 208 - itemGap * (this.maxVisible - 1)) / this.maxVisible;
        const rightX = listX + listW + 24;
        return { panelW, panelH, panelX, panelY, listX, listW, listStartY, itemH, itemGap, rightX, rightW };
    }

    async load() {
        // Re-apply in case Scene.Base initialization happened before constructor options were attached.
        this._applyModeOptions();

        // Paper Maker 3.2 makes the title available before the remaining game
        // database is ready. Core.Game construction below requires modelHero
        // and battle-system data, so every caller must cross this readiness
        // boundary before save slots are enumerated.
        if (Main && typeof Main.waitForGameData === 'function') {
            await Main.waitForGameData();
        }

        if (!IP2Live.Assets.oxaniumMediumLoaded) await IP2Live.Assets.loadAll();

        const currentGame = Core.Game.current;
        try {
            let currentName = currentGame && currentGame.infiltratorName ? currentGame.infiltratorName : null;
            for (let i = 1; i <= Data.Systems.saveSlots; i++) {
                this.gamesData.push(null);
                const newGame = new Core.Game(i);
                Core.Game.current = newGame;
                await newGame.load();
                newGame._ip2liveSaveSlot = i;
                if (!currentName && newGame && newGame.infiltratorName) currentName = newGame.infiltratorName;
                this.gamesData[i - 1] = newGame;
            }
            await this._loadSlotMetadata(currentName);
        } finally {
            Core.Game.current = currentGame;
        }

        this.loading = false;
        Manager.Stack.requestPaintHUD = true;
    }

    async _loadSlotMetadata(infiltratorName) {
        this.slotMetaByIndex = {};
        const name = infiltratorName || (Core.Game.current && Core.Game.current.infiltratorName) || null;

        if (IP2Live.GameManager && typeof IP2Live.GameManager.getSlotProgressSnapshot === 'function') {
            for (let i = 1; i <= Data.Systems.saveSlots; i++) {
                this.slotMetaByIndex[i - 1] = await IP2Live.GameManager.getSlotProgressSnapshot(i, {
                    loadedGame: this.gamesData[i - 1],
                });
            }
            return;
        }

        if (!name && IP2Live.DBManager && typeof IP2Live.DBManager.getAllRecords === 'function') {
            try {
                const profiles = await IP2Live.DBManager.getAllRecords('profiles');
                const slotMap = {};
                if (Array.isArray(profiles)) {
                    for (let p = 0; p < profiles.length; p++) {
                        const profile = profiles[p] || {};
                        const progress = profile.progressBySlot && typeof profile.progressBySlot === 'object'
                            ? profile.progressBySlot
                            : null;
                        if (!progress) continue;
                        for (let i = 1; i <= Data.Systems.saveSlots; i++) {
                            const snapshot = progress[String(i)];
                            if (!snapshot || typeof snapshot !== 'object') continue;
                            if (!snapshot.profileName && profile.infiltratorName) {
                                snapshot.profileName = profile.infiltratorName;
                            }
                            const existing = slotMap[i];
                            const savedAt = Number(snapshot.savedAt) || Number(profile.updatedAt) || Number(profile.createdAt) || 0;
                            const existingAt = existing ? (Number(existing.savedAt) || 0) : -1;
                            if (!existing || savedAt >= existingAt) slotMap[i] = snapshot;
                        }
                    }
                }
                for (let i = 1; i <= Data.Systems.saveSlots; i++) {
                    if (slotMap[i]) this.slotMetaByIndex[i - 1] = slotMap[i];
                }
                return;
            } catch (e) {
                console.warn('[IP2Live] LoadGame: failed reading profiles for slot metadata', e);
            }
        }

        if (!name || !IP2Live.DBManager || typeof IP2Live.DBManager.getRecord !== 'function') return;
        try {
            const profile = await IP2Live.DBManager.getRecord('profiles', name);
            const map = profile && profile.progressBySlot ? profile.progressBySlot : null;
            if (!map) return;
            for (let i = 1; i <= Data.Systems.saveSlots; i++) {
                this.slotMetaByIndex[i - 1] = map[String(i)] || null;
            }
        } catch (e) {
            console.warn('[IP2Live] LoadGame: failed reading slot metadata', e);
        }
    }

    _slotMeta(slotIndex) {
        if (!this.slotMetaByIndex) return null;
        return this.slotMetaByIndex[slotIndex] || null;
    }

    _defaultSaveName(slotNumber) {
        const meta = this._slotMeta(slotNumber - 1);
        if (meta && meta.saveName) return String(meta.saveName);
        return 'SAVE SLOT ' + String(slotNumber).padStart(2, '0');
    }

    async _refreshSavedSlot(slotNumber) {
        const current = Core.Game.current;
        const slot = Number(slotNumber);
        if (!Number.isInteger(slot) || slot <= 0) return;
        const game = new Core.Game(slot);
        try {
            Core.Game.current = game;
            await game.load();
            game._ip2liveSaveSlot = slot;
            this.gamesData[slot - 1] = game;
        } finally {
            Core.Game.current = current;
        }
    }

    async _saveToSelectedSlot(slotNumber, saveName) {
        const slot = Number(slotNumber);
        const gm = IP2Live.GameManager;
        if (!gm || typeof gm.saveProgressToActiveSlot !== 'function') {
            Data.Systems.soundImpossible.playSound();
            return false;
        }
        const resolvedName = String(saveName || '').trim();
        if (!resolvedName) {
            Data.Systems.soundImpossible.playSound();
            return false;
        }

        const result = await gm.saveProgressToActiveSlot(slot, resolvedName);
        if (!result || !result.saved) {
            Data.Systems.soundImpossible.playSound();
            return false;
        }

        await this._refreshSavedSlot(slot);
        this.slotMetaByIndex[slot - 1] = result.snapshot || this.slotMetaByIndex[slot - 1] || null;
        Data.Systems.soundConfirmation.playSound();
        if (this.onSaved) this.onSaved(result);
        else Manager.Stack.pop();
        return true;
    }

    _openSaveNameDialog(slotNumber) {
        const defaultName = this._defaultSaveName(slotNumber);
        const existingGame = this.gamesData && this.gamesData[slotNumber - 1] ? this.gamesData[slotNumber - 1] : null;
        const hasExistingSave = !!(existingGame && !existingGame.isEmpty);
        const existingDisplayName = hasExistingSave ? this._slotDetails(slotNumber - 1).name : '';
        this.saveNameDialog = {
            slotNumber: slotNumber,
            text: String(defaultName || ''),
            hasExistingSave: hasExistingSave,
            existingDisplayName: existingDisplayName,
            blink: 0,
            error: '',
            errorTimer: 0,
        };
        this.hoverIndex = -1;
        this.savingInProgress = false;
        Data.Systems.soundCursor.playSound();
        Manager.Stack.requestPaintHUD = true;
    }

    _closeSaveNameDialog() {
        this.saveNameDialog = null;
        this.savingInProgress = false;
        Manager.Stack.requestPaintHUD = true;
    }

    _dialogLayout(scaleX, scaleY) {
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const w = 500;
        const h = 224;
        const x = (SW - w) * 0.5;
        const y = (SH - h) * 0.5;
        const input = { x: x + 26, y: y + 76, w: w - 52, h: 34 };
        const btnW = 150;
        const btnH = 38;
        const saveBtn = { x: x + w - 26 - btnW, y: y + h - 54, w: btnW, h: btnH };
        const cancelBtn = { x: saveBtn.x - 12 - btnW, y: saveBtn.y, w: btnW, h: btnH };
        return { x, y, w, h, input, saveBtn, cancelBtn };
    }

    _pointInRect(x, y, rect) {
        return !!rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
    }

    _keyToken(key) {
        if (!key) return '';
        const raw = key.name || key.code || key.key || key.character || key;
        return String(raw || '');
    }

    _charFromKeyToken(key) {
        const raw = this._keyToken(key);
        const upper = raw.toUpperCase();
        if (upper === 'SPACE' || upper === 'SPACEBAR') return ' ';
        if (upper.length === 1) {
            const ch = upper;
            if ((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch === ' ' || ch === '-' || ch === '_' || ch === '.') return ch;
        }
        if (upper.indexOf('DIGIT') === 0 && upper.length === 6) return upper[5];
        if (upper.indexOf('NUMPAD') === 0 && upper.length === 7) return upper[6];
        return null;
    }

    async _confirmSaveNameDialog() {
        if (!this.saveNameDialog || this.savingInProgress) return;
        const name = String(this.saveNameDialog.text || '').trim();
        if (!name) {
            this.saveNameDialog.error = 'SAVE NAME IS REQUIRED.';
            this.saveNameDialog.errorTimer = 120;
            Data.Systems.soundImpossible.playSound();
            return;
        }
        this.savingInProgress = true;
        const ok = await this._saveToSelectedSlot(this.saveNameDialog.slotNumber, name);
        this.savingInProgress = false;
        if (ok) {
            this._closeSaveNameDialog();
            return;
        }
        this.saveNameDialog.error = 'SAVE FAILED. TRY AGAIN.';
        this.saveNameDialog.errorTimer = 120;
    }

    onKeyPressed(key) {
        if (this.saveNameDialog) {
            const token = this._keyToken(key).toUpperCase();
            if (Data.Keyboards.checkActionMenu(key) || token === 'ENTER') {
                this._confirmSaveNameDialog();
                return true;
            }
            if (Data.Keyboards.checkCancelMenu(key)) {
                Data.Systems.soundCancel.playSound();
                this._closeSaveNameDialog();
                return true;
            }
            if (token === 'BACKSPACE') {
                this.saveNameDialog.text = this.saveNameDialog.text.slice(0, -1);
                Data.Systems.soundCursor.playSound();
                return true;
            }
            const ch = this._charFromKeyToken(key);
            if (ch !== null && this.saveNameDialog.text.length < 28) {
                this.saveNameDialog.text += ch;
                Data.Systems.soundCursor.playSound();
                return true;
            }
            return true;
        }
        if (Data.Keyboards.checkActionMenu(key)) {
            this._confirmSelection();
        } else if (Data.Keyboards.checkCancelMenu(key)) {
            this._return();
        }
    }

    onKeyPressedAndRepeat(key) {
        if (this.saveNameDialog) return true;
        const totalItems = this.gamesData.length + 1;
        const prev = this.selectedIndex;

        if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Up)) {
            this.selectedIndex = (this.selectedIndex - 1 + totalItems) % totalItems;
        } else if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Down)) {
            this.selectedIndex = (this.selectedIndex + 1) % totalItems;
        }

        if (this.selectedIndex !== prev) {
            this.hoverIndex = -1;
            if (this.selectedIndex < this.gamesData.length) {
                if (this.selectedIndex < this.scrollY) this.scrollY = this.selectedIndex;
                if (this.selectedIndex >= this.scrollY + this.maxVisible) {
                    this.scrollY = this.selectedIndex - this.maxVisible + 1;
                }
            }
            Data.Systems.soundCursor.playSound();
            Manager.Stack.requestPaintHUD = true;
        }
        return true;
    }

    onMouseMove(x, y) {
        if (this.saveNameDialog) return;
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
        if (this.saveNameDialog) {
            const SW = Common.ScreenResolution.SCREEN_X;
            const SH = Common.ScreenResolution.SCREEN_Y;
            const cW = Common.Platform.ctx.canvas.width;
            const cH = Common.Platform.ctx.canvas.height;
            const scaleX = cW / SW;
            const scaleY = cH / SH;
            const d = this._dialogLayout(scaleX, scaleY);
            const sx = x / scaleX;
            const sy = y / scaleY;
            if (this._pointInRect(sx, sy, d.saveBtn)) {
                this._confirmSaveNameDialog();
                return;
            }
            if (this._pointInRect(sx, sy, d.cancelBtn)) {
                Data.Systems.soundCancel.playSound();
                this._closeSaveNameDialog();
                return;
            }
            return;
        }
        const idx = this._getButtonAt(x, y);
        if (idx >= 0) {
            if (idx !== this.selectedIndex) {
                this.selectedIndex = idx;
                Data.Systems.soundCursor.playSound();
            }
            this._confirmSelection();
        }
    }

    _return() {
        Data.Systems.soundCancel.playSound();
        if (IP2Live.MenuTransition) IP2Live.MenuTransition.back();
        else Manager.Stack.pop();
    }

    _getButtonAt(x, y) {
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const cW = Common.Platform.ctx.canvas.width;
        const cH = Common.Platform.ctx.canvas.height;
        const scaleX = cW / SW;
        const scaleY = cH / SH;
        const layout = this._getLayout(SW, SH);

        for (let i = 0; i < this.maxVisible; i++) {
            const dataIdx = this.scrollY + i;
            if (dataIdx >= this.gamesData.length) break;
            const bx = layout.listX;
            const by = layout.listStartY + i * (layout.itemH + layout.itemGap);
            const bw = layout.listW;
            if (x >= bx * scaleX && x <= (bx + bw) * scaleX &&
                y >= by * scaleY && y <= (by + layout.itemH) * scaleY) {
                return dataIdx;
            }
        }

        const btnW = 160, btnH = 40;
        const btnY = layout.panelY + layout.panelH - 60;
        const btnX = layout.panelX + layout.panelW - 30 - btnW;

        if (x >= btnX * scaleX && x <= (btnX + btnW) * scaleX &&
            y >= btnY * scaleY && y <= (btnY + btnH) * scaleY) {
            return this.gamesData.length;
        }

        return -1;
    }

    _confirmSelection() {
        if (this.selectedIndex < this.gamesData.length) {
            if (this.saveMode) {
                this._openSaveNameDialog(this.selectedIndex + 1);
                return;
            }
            const game = this.gamesData[this.selectedIndex];
            const meta = this._slotMeta(this.selectedIndex);
            if (game && meta && meta.profileName) {
                game._ip2liveProfileName = String(meta.profileName);
                game.infiltratorName = String(meta.profileName);
            }
            const isEmptySlot = !game || game.isEmpty;
            if (isEmptySlot) {
                Data.Systems.soundImpossible.playSound();
            } else {
                Data.Systems.soundConfirmation.playSound();
                const slotLabel = 'S' + String(this.selectedIndex + 1).padStart(2, '0');
                const selectedSlot = this.selectedIndex + 1;
                const details = this._slotDetails(this.selectedIndex);
                const saveName = details.name;
                const detail = details.location + '  |  Play time ' + this._getPlayTimeStr(details.playTimeMs);

                if (IP2Live.confirPopup && typeof IP2Live.confirPopup.show === 'function') {
                    IP2Live.confirPopup.show({
                        title: 'LOAD SAVE?',
                        message: 'Replace the current session with this save?',
                        detail,
                        value: slotLabel + ' - ' + saveName,
                        valueLabel: 'SELECTED SAVE',
                        confirmLabel: 'LOAD',
                        cancelLabel: 'BACK',
                        onConfirm: () => this._loadSelectedGame(game, selectedSlot, slotLabel),
                    });
                } else {
                    this._loadSelectedGame(game, selectedSlot, slotLabel).catch((error) => {
                        console.error('[IP2Live] Load Game failed:', error);
                    });
                }
            }
        } else if (this.selectedIndex === this.gamesData.length) {
            this._return();
        }
    }

    async _loadSelectedGame(game, selectedSlot, slotLabel) {
        if (IP2Live.LoadingScreen && typeof IP2Live.LoadingScreen.show === 'function') {
            IP2Live.LoadingScreen.show({
                mode: 'replace',
                status: 'Loading Next Level',
                detail: 'Restoring save slot ' + slotLabel,
                fadeMusicOnStart: true,
                musicFadeDurationMs: 2200,
                onComplete: async function () {
                    Core.Game.current = game;
                    if (IP2Live.GameManager && typeof IP2Live.GameManager.setActiveSaveSlot === 'function') {
                        IP2Live.GameManager.setActiveSaveSlot(selectedSlot);
                    }
                    if (Data.TitlescreenGameover.isTitleBackgroundVideo) Manager.Videos.stop();
                    await Core.Game.current.loadPositions();
                    Core.Game.current.hero.initializeProperties();
                    if (IP2Live.GameManager && typeof IP2Live.GameManager.restoreProgressFromSlot === 'function') {
                        await IP2Live.GameManager.restoreProgressFromSlot(selectedSlot, Core.Game.current);
                    }

                    Manager.Stack.popAll();
                    const restoredScene = new Scene.Map(Core.Game.current.currentMapID);
                    if (IP2Live.GameManager && typeof IP2Live.GameManager.prepareLoadedMapScene === 'function') {
                        IP2Live.GameManager.prepareLoadedMapScene(restoredScene, Core.Game.current.currentMapID);
                    }
                    Manager.Stack.push(restoredScene);
                    Manager.Stack.clearHUD();
                    if (Manager.Stack) Manager.Stack.requestPaintHUD = true;
                },
            });
            return;
        }

        this.loading = true;
        Manager.Stack.requestPaintHUD = true;
        try {
            Core.Game.current = game;
            if (IP2Live.GameManager && typeof IP2Live.GameManager.setActiveSaveSlot === 'function') {
                IP2Live.GameManager.setActiveSaveSlot(selectedSlot);
            }
            if (Data.TitlescreenGameover.isTitleBackgroundVideo) Manager.Videos.stop();
            await Core.Game.current.loadPositions();
            Core.Game.current.hero.initializeProperties();
            if (IP2Live.GameManager && typeof IP2Live.GameManager.restoreProgressFromSlot === 'function') {
                await IP2Live.GameManager.restoreProgressFromSlot(selectedSlot, Core.Game.current);
            }

            Manager.Stack.pop();
            const restoredScene = new Scene.Map(Core.Game.current.currentMapID);
            if (IP2Live.GameManager && typeof IP2Live.GameManager.prepareLoadedMapScene === 'function') {
                IP2Live.GameManager.prepareLoadedMapScene(restoredScene, Core.Game.current.currentMapID);
            }
            Manager.Stack.replace(restoredScene);
            Manager.Stack.clearHUD();
        } finally {
            this.loading = false;
            Manager.Stack.requestPaintHUD = true;
        }
    }

    update() {
        this.animTick++;
        this.scanlineOffset = (this.scanlineOffset + 0.5) % 4;
        if (this.saveNameDialog) {
            this.saveNameDialog.blink = (this.saveNameDialog.blink + 1) % 60;
            this.saveNameDialog.errorTimer = Math.max(0, (this.saveNameDialog.errorTimer || 0) - 1);
        }

        if (this.animTick % 2 === 0) Manager.Stack.requestPaintHUD = true;
    }

    draw3D() { Manager.GL.renderer.clear(); }

    _font() { return 'Oxanium-Medium, sans-serif'; }

    _text(ctx, text, x, y, size, color, maxWidth) {
        ctx.font = size + 'px ' + this._font();
        ctx.fillStyle = color;
        let label = String(text);
        if (maxWidth && ctx.measureText(label).width > maxWidth) {
            while (label.length && ctx.measureText(label + '\u2026').width > maxWidth) label = label.slice(0, -1);
            label += '\u2026';
        }
        ctx.fillText(label, x, y);
    }

    _bevelPath(ctx, x, y, w, h, cut) {
        ctx.beginPath(); ctx.moveTo(x + cut, y); ctx.lineTo(x + w - cut, y);
        ctx.lineTo(x + w, y + cut); ctx.lineTo(x + w, y + h - cut);
        ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x + cut, y + h);
        ctx.lineTo(x, y + h - cut); ctx.lineTo(x, y + cut); ctx.closePath();
    }

    _drawArchiveFrame(ctx, layout) {
        const { panelX: x, panelY: y, panelW: w, panelH: h } = layout;
        ctx.save();
        // Offset chassis, inset glass, and segmented edge rails echo Settings.
        this._bevelPath(ctx, x + 7, y + 7, w, h, 18);
        ctx.fillStyle = '#06070D'; ctx.fill();
        ctx.strokeStyle = 'rgba(200,45,78,0.42)'; ctx.lineWidth = 1; ctx.stroke();
        this._bevelPath(ctx, x - 4, y + 3, w, h, 18);
        ctx.strokeStyle = 'rgba(72,183,202,0.24)'; ctx.stroke();
        this._holoPanel(ctx, x, y, w, h, false);
        this._bevelPath(ctx, x + 5, y + 5, w - 10, h - 10, 13);
        ctx.strokeStyle = 'rgba(127,158,177,0.19)'; ctx.stroke();
        for (const railY of [y, y + h - 2]) {
            for (let i = 0; i < 4; i++) {
                const railX = x + 34 + i * (w - 68) / 4;
                const railW = (w - 100) / 4;
                ctx.beginPath(); ctx.moveTo(railX + 5, railY); ctx.lineTo(railX + railW, railY);
                ctx.lineTo(railX + railW - 5, railY + 3); ctx.lineTo(railX, railY + 3); ctx.closePath();
                ctx.fillStyle = i === 0 ? '#E94067' : (i === 2 ? '#65A8B8' : '#723249'); ctx.fill();
            }
        }
        ctx.restore();
    }

    _holoPanel(ctx, x, y, w, h, selected) {
        ctx.save();
        const cut = Math.min(13, h * 0.17);
        this._bevelPath(ctx, x + 3, y + 4, w, h, cut);
        ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fill();
        ctx.strokeStyle = selected ? 'rgba(242,187,86,0.30)' : 'rgba(79,127,149,0.16)';
        ctx.lineWidth = 1; ctx.stroke();
        this._bevelPath(ctx, x, y, w, h, cut);
        const glass = ctx.createLinearGradient(x, y, x + w, y + h);
        glass.addColorStop(0, selected ? 'rgba(63,36,28,0.98)' : 'rgba(21,18,28,0.98)');
        glass.addColorStop(0.3, 'rgba(12,13,20,0.98)');
        glass.addColorStop(1, 'rgba(7,9,15,0.98)');
        ctx.fillStyle = glass; ctx.fill();
        ctx.strokeStyle = selected ? '#EEC479' : 'rgba(164,81,107,0.58)';
        ctx.shadowColor = selected ? 'rgba(241,178,61,0.3)' : 'rgba(198,43,83,0.12)';
        ctx.shadowBlur = selected ? 10 : 4; ctx.stroke(); ctx.shadowBlur = 0;
        ctx.clip();
        this._bevelPath(ctx, x + 3, y + 3, w - 6, h - 6, Math.max(2, cut - 2));
        ctx.strokeStyle = selected ? 'rgba(255,211,132,0.22)' : 'rgba(86,155,178,0.17)'; ctx.stroke();
        ctx.fillStyle = 'rgba(176,197,217,0.018)';
        for (let row = y + 5; row < y + h; row += 5) ctx.fillRect(x, row, w, 1);
        ctx.fillStyle = selected ? 'rgba(243,191,99,0.1)' : 'rgba(174,103,126,0.065)';
        for (let dx = x + w - Math.min(72, w * 0.16); dx < x + w; dx += 8) {
            for (let dy = y + 10; dy < y + h; dy += 8) ctx.fillRect(dx, dy, 1, 1);
        }
        ctx.fillStyle = selected ? '#EBC277' : '#90405A';
        ctx.fillRect(x + 1, y + cut, selected ? 4 : 2, Math.max(0, h - cut * 2));
        const rail = ctx.createLinearGradient(x, 0, x + w, 0);
        rail.addColorStop(0, selected ? '#F4DDA2' : '#6A9FAC');
        rail.addColorStop(0.4, selected ? '#94693C' : '#283B50');
        rail.addColorStop(1, 'rgba(30,28,41,0)');
        ctx.fillStyle = rail; ctx.fillRect(x + cut + 5, y + h - 3, w - cut * 2 - 10, 2);
        ctx.restore();
    }

    _archiveIcon(ctx, x, y, size, empty) {
        ctx.save();
        ctx.strokeStyle = empty ? '#655661' : '#EF8297'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x, y + size * 0.16); ctx.lineTo(x + size * 0.72, y + size * 0.16);
        ctx.lineTo(x + size, y + size * 0.42); ctx.lineTo(x + size, y + size);
        ctx.lineTo(x, y + size); ctx.closePath(); ctx.stroke();
        ctx.strokeRect(x + size * 0.2, y + size * 0.16, size * 0.44, size * 0.28);
        ctx.strokeRect(x + size * 0.2, y + size * 0.65, size * 0.6, size * 0.35);
        ctx.restore();
    }

    _drawSpaceBackground(ctx, w, h) {
        ctx.fillStyle = '#030205'; ctx.fillRect(0, 0, w, h);
        const haze = ctx.createRadialGradient(w * 0.65, h * 0.4, 0, w * 0.5, h * 0.5, w * 0.7);
        haze.addColorStop(0, 'rgba(87,12,31,0.24)');
        haze.addColorStop(0.6, 'rgba(33,6,19,0.18)');
        haze.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = haze; ctx.fillRect(0, 0, w, h);
        if (!this._spaceStars) {
            let seed = 0xA93F17;
            const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
            this._spaceStars = Array.from({ length: 100 }, () => ({ x: random(), y: random(), r: 0.5 + random(), phase: random() * 6.28 }));
        }
        for (const star of this._spaceStars) {
            const alpha = 0.15 + 0.12 * (0.5 + 0.5 * Math.sin(this.animTick * 0.018 + star.phase));
            ctx.fillStyle = 'rgba(229,168,185,' + alpha + ')';
            ctx.fillRect(star.x * w, ((star.y + this.animTick * 0.000012) % 1) * h, star.r, star.r);
        }
        ctx.strokeStyle = 'rgba(173,73,102,0.025)'; ctx.lineWidth = 1;
        for (let x = -h; x < w; x += 44) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + h, h); ctx.stroke();
        }
    }

    drawHUD() {
        const ctx = Common.Platform.ctx;
        const SW = Common.ScreenResolution.SCREEN_X, SH = Common.ScreenResolution.SCREEN_Y;
        const layout = this._getLayout(SW, SH);
        ctx.save();
        ctx.scale(ctx.canvas.width / SW, ctx.canvas.height / SH);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        this._drawSpaceBackground(ctx, SW, SH);
        this._drawArchiveFrame(ctx, layout);
        const x = layout.panelX + 28;
        const headerGlow = ctx.createLinearGradient(x, 0, layout.panelX + layout.panelW, 0);
        headerGlow.addColorStop(0, 'rgba(161,24,54,0.18)'); headerGlow.addColorStop(1, 'rgba(161,24,54,0)');
        ctx.fillStyle = headerGlow; ctx.fillRect(layout.panelX + 1, layout.panelY + 1, layout.panelW - 2, 96);
        this._archiveIcon(ctx, x + 2, layout.panelY + 28, 30, false);
        this._text(ctx, 'SAVE ARCHIVE', x + 52, layout.panelY + 28, 10, '#F1859B');
        this._text(ctx, this.titleText, x + 50, layout.panelY + 61, 28, '#FFF0F3');
        this._text(ctx, this.saveMode ? 'Choose a slot to preserve your progress.' : 'Your mission. Ready to resume.', x + 52, layout.panelY + 82, 11, '#AC929E', layout.listW - 52);
        const used = this.gamesData.filter(game => game && !game.isEmpty).length;
        const capacityX = layout.rightX, capacityW = layout.rightW;
        ctx.textAlign = 'right';
        this._text(ctx, used + ' / ' + this.gamesData.length + ' SAVED SESSIONS', capacityX + capacityW, layout.panelY + 38, 10, '#C5A3B0', capacityW);
        ctx.textAlign = 'left';
        const cellW = Math.min(30, (capacityW - 5 * (this.gamesData.length - 1)) / Math.max(1, this.gamesData.length));
        const capacityStart = capacityX + capacityW - this.gamesData.length * (cellW + 5) + 5;
        this.gamesData.forEach((game, index) => {
            ctx.fillStyle = game && !game.isEmpty ? '#D94464' : '#2A2029';
            ctx.fillRect(capacityStart + index * (cellW + 5), layout.panelY + 52, cellW, 5);
        });
        ctx.fillStyle = 'rgba(148,82,104,0.22)';
        ctx.fillRect(x, layout.panelY + 97, layout.panelW - 56, 1);
        for (let i = 0; i < this.maxVisible; i++) {
            const index = this.scrollY + i;
            if (index >= this.gamesData.length) break;
            this._drawSlot(ctx, 1, 1, layout.listX, layout.listStartY + i * (layout.itemH + layout.itemGap), layout.listW, layout.itemH, this.gamesData[index], this.selectedIndex === index, index + 1);
        }
        this._drawRightInfoDeck(ctx, 1, 1, layout);
        const footerY = layout.panelY + layout.panelH - 60;
        this._text(ctx, 'SLOTS ' + (this.scrollY + 1) + ' - ' + Math.min(this.scrollY + this.maxVisible, this.gamesData.length) + ' / ' + this.gamesData.length, x, footerY + 12, 10, '#C099A8');
        this._text(ctx, 'Select a session to view its saved details.', x, footerY + 33, 10, '#8F7C89', layout.listW);
        this._drawButton(ctx, 1, 1, layout.panelX + layout.panelW - 190, footerY, 160, 40, 'BACK', this.selectedIndex === this.gamesData.length, this.gamesData.length);
        if (this.saveNameDialog) this._drawSaveNameDialog(ctx, 1, 1);
        ctx.restore();
    }

    _drawSaveNameDialog(ctx, scaleX, scaleY) {
        const d = this._dialogLayout(scaleX, scaleY);
        const cx = d.x * scaleX;
        const cy = d.y * scaleY;
        const cw = d.w * scaleX;
        const ch = d.h * scaleY;

        ctx.fillStyle = 'rgba(0,0,0,0.62)';
        ctx.fillRect(0, 0, Common.ScreenResolution.SCREEN_X, Common.ScreenResolution.SCREEN_Y);

        this._holoPanel(ctx, cx, cy, cw, ch, true);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + Math.round(16 * scaleX) + 'px ' + this._font();
        ctx.textAlign = 'left';
        ctx.fillText('NAME SAVE SLOT S' + String(this.saveNameDialog.slotNumber).padStart(2, '0'), (d.x + 20) * scaleX, (d.y + 30) * scaleY);

        const input = d.input;
        ctx.fillStyle = 'rgba(12,7,13,0.95)';
        ctx.fillRect(input.x * scaleX, input.y * scaleY, input.w * scaleX, input.h * scaleY);
        ctx.strokeStyle = 'rgba(220,80,111,0.72)';
        ctx.lineWidth = 1.2 * scaleX;
        ctx.strokeRect(input.x * scaleX, input.y * scaleY, input.w * scaleX, input.h * scaleY);

        const text = String(this.saveNameDialog.text || '');
        const caret = (this.saveNameDialog.blink < 30) ? '_' : ' ';
        ctx.fillStyle = '#FFEAF0';
        ctx.font = Math.round(12 * scaleX) + 'px ' + this._font();
        ctx.fillText(text + caret, (input.x + 10) * scaleX, (input.y + 22) * scaleY);

        if (this.saveNameDialog.hasExistingSave) {
            const overwriteName = String(this.saveNameDialog.existingDisplayName || 'EXISTING SAVE');
            ctx.fillStyle = 'rgba(255,170,80,0.95)';
            ctx.font = Math.round(10 * scaleX) + 'px ' + this._font();
            ctx.fillText('WARNING: THIS WILL OVERWRITE SLOT S' + String(this.saveNameDialog.slotNumber).padStart(2, '0'), (d.x + 20) * scaleX, (d.y + 130) * scaleY);
            ctx.fillStyle = 'rgba(255,220,180,0.92)';
            this._text(ctx, 'CURRENT SAVE: ' + overwriteName, (d.x + 20) * scaleX, (d.y + 146) * scaleY, 10 * scaleX, '#DDC5AF', (d.w - 40) * scaleX);
        } else {
            ctx.fillStyle = 'rgba(233,154,174,0.85)';
            ctx.font = Math.round(10 * scaleX) + 'px ' + this._font();
            ctx.fillText('NEW SAVE WILL BE CREATED IN SLOT S' + String(this.saveNameDialog.slotNumber).padStart(2, '0'), (d.x + 20) * scaleX, (d.y + 136) * scaleY);
        }

        if ((this.saveNameDialog.errorTimer || 0) > 0 && this.saveNameDialog.error) {
            ctx.fillStyle = '#FF8BA1';
            ctx.font = Math.round(10 * scaleX) + 'px ' + this._font();
            ctx.fillText(this.saveNameDialog.error, (d.x + 20) * scaleX, (d.y + 164) * scaleY);
        }

        this._drawButton(ctx, scaleX, scaleY, d.cancelBtn.x, d.cancelBtn.y, d.cancelBtn.w, d.cancelBtn.h, 'CANCEL', false, -101);
        const actionLabel = this.savingInProgress
            ? 'SAVING...'
            : (this.saveNameDialog.hasExistingSave ? 'OVERWRITE' : 'SAVE');
        this._drawButton(ctx, scaleX, scaleY, d.saveBtn.x, d.saveBtn.y, d.saveBtn.w, d.saveBtn.h, actionLabel, false, -102);
    }

    _slotDetails(index) {
        const game = this.gamesData[index];
        const meta = this._slotMeta(index) || {};
        if (!game || game.isEmpty) return { empty: true };
        const timer = game.playTime && typeof game.playTime === 'object' ? game.playTime.time : game.playTime;
        const numericTime = timer === null || timer === undefined ? NaN : Number(timer);
        const metadataTime = meta.playTimeMs === null || meta.playTimeMs === undefined ? NaN : Number(meta.playTimeMs);
        const playTimeMs = Number.isFinite(numericTime) && numericTime >= 0 ? numericTime
            : (Number.isFinite(metadataTime) && metadataTime >= 0 ? metadataTime : null);
        const mapId = Number(game.currentMapID) || Number(meta.mapId) || 0;
        const mm = IP2Live.MapManager;
        const stage = mm && typeof mm.stageFor === 'function' ? mm.stageFor(mapId) : null;
        const location = stage ? (stage.tutorial ? 'TUTORIAL' : 'STAGE ' + stage.stage + ' / LEVEL ' + stage.level) : (mapId ? 'MAP ' + mapId : 'Location unavailable');
        // Engine character names describe the RPG actor, not the saved player.
        // Never substitute a hero name or the currently running profile here.
        const operative = [meta.profileName, game.infiltratorName, game._ip2liveProfileName]
            .find(value => typeof value === 'string' && value.trim())?.trim() || null;
        const savedAt = Number(meta.savedAt);
        const date = new Date(savedAt);
        const saved = savedAt > 0 && Number.isFinite(date.getTime()) ? date.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not recorded';
        const neural = (game.ip2liveGameStates && game.ip2liveGameStates.neuralLifeForce) || (meta.gameStates && meta.gameStates.neuralLifeForce);
        const lifeForce = neural && neural.lifeForce !== null && neural.lifeForce !== undefined && Number.isFinite(Number(neural.lifeForce))
            ? Math.max(0, Number(neural.lifeForce)) : null;
        const settings = IP2Live.NeuralLifeForce && IP2Live.NeuralLifeForce.SETTINGS;
        const lifeForceMax = settings && Number(settings.maxLifeForce) > 0 ? Number(settings.maxLifeForce) : null;
        const name = typeof meta.saveName === 'string' && meta.saveName.trim() ? meta.saveName.trim()
            : (operative || 'Save slot ' + String(index + 1).padStart(2, '0'));
        return { empty: false, name, operative, mapId, location, playTimeMs, saved, lifeForce, lifeForceMax };
    }

    _drawRightInfoDeck(ctx, scaleX, scaleY, layout) {
        const x = layout.rightX, y = layout.listStartY, w = layout.rightW;
        const h = this.maxVisible * layout.itemH + (this.maxVisible - 1) * layout.itemGap;
        const unit = Math.min(1, h / 350);
        this._holoPanel(ctx, x, y, w, h, false);
        ctx.save(); ctx.beginPath(); ctx.rect(x + 12, y + 12, w - 24, h - 24); ctx.clip();
        const index = this.selectedIndex < this.gamesData.length ? this.selectedIndex : -1;
        const data = this._slotDetails(index);
        this._text(ctx, 'SESSION DOSSIER', x + 20, y + 25 * unit, 9, '#D17A90');
        this._text(ctx, index < 0 ? 'Archive overview' : 'SLOT ' + String(index + 1).padStart(2, '0'), x + 20, y + 54 * unit, 22 * unit, '#FAE8EF', w - 70);
        this._archiveIcon(ctx, x + w - 44, y + 29 * unit, 21 * unit, data.empty);
        if (data.empty) {
            this._archiveIcon(ctx, x + w / 2 - 23, y + 120 * unit, 46, true);
            ctx.textAlign = 'center';
            this._text(ctx, index < 0 ? 'Select a save slot' : 'Empty archive', x + w / 2, y + 222 * unit, 15, '#C4A6B3', w - 40);
            this._text(ctx, this.saveMode ? 'Ready for your next checkpoint.' : 'No session is stored in this slot.', x + w / 2, y + 249 * unit, 10, '#917B8A', w - 40);
        } else {
            const clockY = y + 72 * unit;
            this._holoPanel(ctx, x + 16, clockY, w - 32, 64 * unit, true);
            this._text(ctx, 'TIME PLAYED', x + 28, clockY + 18 * unit, 9, '#D58B9C');
            this._text(ctx, this._getPlayTimeStr(data.playTimeMs), x + 28, clockY + 47 * unit, 25 * unit, '#FFE3EB', w - 56);
            const rows = [['OPERATIVE', data.operative || 'Not recorded'], ['LOCATION', data.location], ['LAST SAVED', data.saved]];
            rows.forEach(([label, value], i) => {
                const rowY = y + (158 + i * 49) * unit;
                this._text(ctx, label, x + 20, rowY, 9, '#927887');
                this._text(ctx, value, x + 20, rowY + 18 * unit, Math.max(10, 13 * unit), '#DDCCD6', w - 40);
                ctx.fillStyle = 'rgba(167,109,130,0.12)';
                ctx.fillRect(x + 20, rowY + 28 * unit, w - 40, 1);
            });
            const meterY = y + 309 * unit;
            this._text(ctx, 'LIFE FORCE', x + 20, meterY, 9, '#927887');
            ctx.textAlign = 'right';
            this._text(ctx, data.lifeForce === null ? 'Not recorded' : String(data.lifeForce) + (data.lifeForceMax ? ' / ' + data.lifeForceMax : ''), x + w - 20, meterY, 10, '#E1A4B5');
            ctx.textAlign = 'left';
            if (data.lifeForce !== null && data.lifeForceMax) {
                const ratio = Math.min(1, data.lifeForce / data.lifeForceMax);
                ctx.fillStyle = '#27161E'; ctx.fillRect(x + 20, meterY + 12 * unit, w - 40, 4);
                ctx.fillStyle = '#E34E72'; ctx.fillRect(x + 20, meterY + 12 * unit, (w - 40) * ratio, 4);
            }
        }
        ctx.restore();
    }

    _getPlayTimeStr(playTime) {
        if (playTime === null || playTime === undefined) return 'Not recorded';
        const value = playTime && typeof playTime === 'object' ? playTime.time : playTime;
        const milliseconds = Number(value);
        if (value === null || value === undefined || !Number.isFinite(milliseconds) || milliseconds < 0) return 'Not recorded';
        const total = Math.floor(milliseconds / 1000);
        return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60].map(part => String(part).padStart(2, '0')).join(':');
    }

    _drawSlot(ctx, scaleX, scaleY, x, y, w, h, game, selected, slotNumber) {
        const data = this._slotDetails(slotNumber - 1);
        this._holoPanel(ctx, x, y, w, h, selected);
        ctx.save(); ctx.beginPath(); ctx.rect(x + 8, y + 6, w - 16, h - 12); ctx.clip();
        const badgeY = y + (h - 46) / 2;
        ctx.fillStyle = selected ? 'rgba(233,173,67,0.12)' : 'rgba(123,80,101,0.08)';
        ctx.fillRect(x + 14, badgeY, 40, 46);
        ctx.strokeStyle = selected ? 'rgba(243,202,126,0.40)' : 'rgba(164,112,136,0.18)';
        ctx.strokeRect(x + 14, badgeY, 40, 46);
        ctx.textAlign = 'center';
        this._text(ctx, String(slotNumber).padStart(2, '0'), x + 34, badgeY + 30, 21, selected ? '#F7D898' : '#9295AC');
        ctx.textAlign = 'left';
        const textX = x + 70, textW = w - 92;
        const statusW = w > 440 ? 68 : 0;
        this._text(ctx, data.empty ? 'Empty slot' : data.name, textX, y + 26, 17, data.empty ? '#9C8997' : '#F8E9F0', textW - statusW);
        if (statusW) {
            ctx.textAlign = 'right';
            this._text(ctx, data.empty ? 'EMPTY' : 'SAVED', x + w - 20, y + 24, 8, data.empty ? '#786270' : '#E78DA5');
            ctx.textAlign = 'left';
        }
        this._text(ctx, data.empty ? (this.saveMode ? 'Create a new checkpoint' : 'No saved progress') : data.location + '    /    ' + this._getPlayTimeStr(data.playTimeMs), textX, y + 47, 11, data.empty ? '#84717F' : '#C799AA', textW);
        if (!data.empty) this._text(ctx, data.saved === 'Not recorded' ? 'Save date not recorded' : 'Saved ' + data.saved, textX, y + 65, 10, '#9A8190', textW);
        else {
            ctx.strokeStyle = 'rgba(138,83,108,0.20)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(textX, y + 61); ctx.lineTo(x + w - 28, y + 61); ctx.stroke();
        }
        ctx.restore();
    }

    _drawButton(ctx, scaleX, scaleY, bx, by, bw, bh, label, isSelected, index) {
        const active = isSelected || this.hoverIndex === index;
        this._holoPanel(ctx, bx * scaleX, by * scaleY, bw * scaleX, bh * scaleY, active);
        ctx.save(); ctx.textAlign = 'center';
        this._text(ctx, label, (bx + bw / 2) * scaleX, (by + bh / 2 + 5) * scaleY, 13 * scaleX, active ? '#FFE2EB' : '#C4A2B2', (bw - 20) * scaleX);
        ctx.restore();
    }

}
window.IP2LiveLoadGameMenu = IP2LiveLoadGameMenu;
console.log('[IP2Live] load-game.js loaded.');
