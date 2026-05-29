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
        this.bgFx = IP2Live.BgFx.create();
        this.scramble = null; // initialised in load() once slot count is known
        this.networkBackdrop = (window.IP2LiveBackgroundScreen)
            ? new window.IP2LiveBackgroundScreen()
            : null;
    }

    _applyModeOptions() {
        this.saveMode = !!(this.options && this.options.saveMode);
        this.titleText = this.saveMode ? 'SAVE GAME' : 'LOAD GAME';
        this.panelTitle = this.saveMode ? 'SYS::SAVE_ARCHIVE_WRITE' : 'SYS::SAVE_ARCHIVE';
        this.onSaved = this.options && typeof this.options.onSaved === 'function' ? this.options.onSaved : null;
    }

    _getLayout(SW, SH) {
        const panelW = 860;
        const panelH = 520;
        const panelX = (SW - panelW) / 2;
        const panelY = (SH - panelH) / 2;
        const listX = panelX + 28;
        const listW = 520;
        const listStartY = panelY + 74;
        const itemH = 70;
        const itemGap = 12;
        const rightX = panelX + 572;
        const rightW = panelW - (rightX - panelX) - 24;
        return {
            panelW, panelH, panelX, panelY,
            listX, listW, listStartY, itemH, itemGap,
            rightX, rightW
        };
    }

    async load() {
        // Re-apply in case Scene.Base initialization happened before constructor options were attached.
        this._applyModeOptions();
        if (!IP2Live.Assets.bgImage) await IP2Live.Assets.loadAll();

        const currentGame = Core.Game.current;
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
        Core.Game.current = currentGame;

        const cW = Common.Platform.ctx.canvas.width;
        const cH = Common.Platform.ctx.canvas.height;
        this.bgFx.seed(cW, cH);
        this.scramble = IP2Live.TextScramble.create(this.gamesData.length + 1); // slots + BACK

        this.loading = false;
        Manager.Stack.requestPaintHUD = true;
    }

    async _loadSlotMetadata(infiltratorName) {
        this.slotMetaByIndex = {};
        const name = infiltratorName || (Core.Game.current && Core.Game.current.infiltratorName) || null;

        if (IP2Live.GameManager && typeof IP2Live.GameManager.getSlotProgressSnapshot === 'function') {
            for (let i = 1; i <= Data.Systems.saveSlots; i++) {
                this.slotMetaByIndex[i - 1] = await IP2Live.GameManager.getSlotProgressSnapshot(i, {
                    infiltratorName: name,
                });
            }
            return;
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
        Core.Game.current = game;
        await game.load();
        game._ip2liveSaveSlot = slot;
        this.gamesData[slot - 1] = game;
        Core.Game.current = current;
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
        const existingMeta = this._slotMeta(slotNumber - 1);
        const hasExistingSave = !!(existingGame && !existingGame.isEmpty);
        const existingDisplayName = existingMeta && existingMeta.saveName
            ? String(existingMeta.saveName)
            : (function () {
                if (!hasExistingSave) return '';
                if (existingGame.hero && existingGame.hero.character && existingGame.hero.character.name) {
                    return String(existingGame.hero.character.name);
                }
                if (existingGame.hero && existingGame.hero.name) return String(existingGame.hero.name);
                return 'UNKNOWN';
            })();
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
            Data.Systems.soundCancel.playSound();
            Manager.Stack.pop();
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

    async _confirmSelection() {
        if (this.selectedIndex < this.gamesData.length) {
            if (this.saveMode) {
                this._openSaveNameDialog(this.selectedIndex + 1);
                return;
            }
            const game = this.gamesData[this.selectedIndex];
            if (game.isEmpty) {
                Data.Systems.soundImpossible.playSound();
            } else {
                Data.Systems.soundConfirmation.playSound();
                const slotLabel = 'S' + String(this.selectedIndex + 1).padStart(2, '0');
                const selectedSlot = this.selectedIndex + 1;

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
                            Manager.Stack.push(new Scene.Map(Core.Game.current.currentMapID));
                            Manager.Stack.clearHUD();
                            if (Manager.Stack) Manager.Stack.requestPaintHUD = true;
                        },
                    });
                } else {
                    this.loading = true;
                    Manager.Stack.requestPaintHUD = true;

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
                    Manager.Stack.replace(new Scene.Map(Core.Game.current.currentMapID));
                    Manager.Stack.clearHUD();
                    this.loading = false;
                }
            }
        } else if (this.selectedIndex === this.gamesData.length) {
            Data.Systems.soundCancel.playSound();
            Manager.Stack.pop();
        }
    }

    update() {
        this.animTick++;
        this.scanlineOffset = (this.scanlineOffset + 0.5) % 4;
        if (this.saveNameDialog) {
            this.saveNameDialog.blink = (this.saveNameDialog.blink + 1) % 60;
            this.saveNameDialog.errorTimer = Math.max(0, (this.saveNameDialog.errorTimer || 0) - 1);
        }
        this.bgFx.update(this.animTick);
        if (this.scramble) this.scramble.update(this.selectedIndex, this.hoverIndex);
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
        if (this.networkBackdrop && typeof this.networkBackdrop.draw === 'function') {
            ctx.save();
            ctx.globalAlpha = 0.62;
            this.networkBackdrop.draw(ctx, cW, cH, this.animTick, 0, 0);
            ctx.restore();
        }

        const bgVeil = ctx.createLinearGradient(0, 0, cW, cH);
        bgVeil.addColorStop(0, 'rgba(0,0,8,0.70)');
        bgVeil.addColorStop(0.48, 'rgba(0,0,10,0.74)');
        bgVeil.addColorStop(1, 'rgba(0,0,12,0.82)');
        ctx.fillStyle = bgVeil;
        ctx.fillRect(0, 0, cW, cH);

        ctx.globalAlpha = 0.045;
        ctx.fillStyle = '#000';
        for (let ly = this.scanlineOffset * scaleY; ly < cH; ly += 4 * scaleY) {
            ctx.fillRect(0, ly, cW, 1.5 * scaleY);
        }
        ctx.globalAlpha = 1;

        const layout = this._getLayout(SW, SH);
        const px = layout.panelX * scaleX;
        const py = layout.panelY * scaleY;
        const pw = layout.panelW * scaleX;
        const ph = layout.panelH * scaleY;

        IP2Live.UI.drawCyberPanel({
            ctx,
            x: px,
            y: py,
            w: pw,
            h: ph,
            scaleX,
            accent: '#00F0FF',
            title: this.panelTitle
        });

        this._drawPanelAngularFrame(ctx, scaleX, scaleY, layout);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowBlur = 0;
        ctx.font = 'bold ' + (24 * scaleX) + 'px ' + (IP2Live.Assets.abnesLoaded ? 'Abnes' : 'Arial Black');
        ctx.fillText(this.titleText, (layout.panelX + layout.panelW / 2) * scaleX, (layout.panelY + 36) * scaleY);
        ctx.textAlign = 'left';

        const divY = (layout.panelY + 54) * scaleY;
        ctx.strokeStyle = 'rgba(0,255,255,0.25)';
        ctx.lineWidth = 1 * scaleX;
        ctx.beginPath();
        ctx.moveTo((layout.panelX + 20) * scaleX, divY);
        ctx.lineTo((layout.panelX + layout.panelW - 20) * scaleX, divY);
        ctx.stroke();

        this._drawRightInfoDeck(ctx, scaleX, scaleY, layout);
        this._drawOuterRightBackgroundDeck(ctx, cW, cH, scaleX, scaleY);

        for (let i = 0; i < this.maxVisible; i++) {
            const dataIdx = this.scrollY + i;
            if (dataIdx >= this.gamesData.length) break;
            const game = this.gamesData[dataIdx];
            const isSel = (this.selectedIndex === dataIdx);
            const itemY = layout.listStartY + i * (layout.itemH + layout.itemGap);
            this._drawSlot(ctx, scaleX, scaleY, layout.listX, itemY, layout.listW, layout.itemH, game, isSel, dataIdx + 1);
        }

        const btnW = 160, btnH = 40;
        const btnY = layout.panelY + layout.panelH - 60;
        this._drawButton(ctx, scaleX, scaleY,
            layout.panelX + layout.panelW - 30 - btnW, btnY, btnW, btnH, 'BACK',
            this.selectedIndex === this.gamesData.length, this.gamesData.length);

        if (this.saveNameDialog) this._drawSaveNameDialog(ctx, scaleX, scaleY);

        ctx.restore();
    }

    _drawSaveNameDialog(ctx, scaleX, scaleY) {
        const d = this._dialogLayout(scaleX, scaleY);
        const cx = d.x * scaleX;
        const cy = d.y * scaleY;
        const cw = d.w * scaleX;
        const ch = d.h * scaleY;

        ctx.fillStyle = 'rgba(0,0,0,0.62)';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        ctx.fillStyle = 'rgba(4,10,24,0.95)';
        ctx.fillRect(cx, cy, cw, ch);
        ctx.strokeStyle = '#00F0FF';
        ctx.lineWidth = 1.6 * scaleX;
        ctx.strokeRect(cx, cy, cw, ch);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + Math.round(16 * scaleX) + 'px ' + (IP2Live.Assets.abnesLoaded ? 'Abnes' : 'monospace');
        ctx.textAlign = 'left';
        ctx.fillText('NAME SAVE SLOT S' + String(this.saveNameDialog.slotNumber).padStart(2, '0'), (d.x + 20) * scaleX, (d.y + 30) * scaleY);

        const input = d.input;
        ctx.fillStyle = 'rgba(0,12,26,0.95)';
        ctx.fillRect(input.x * scaleX, input.y * scaleY, input.w * scaleX, input.h * scaleY);
        ctx.strokeStyle = 'rgba(0,240,255,0.72)';
        ctx.lineWidth = 1.2 * scaleX;
        ctx.strokeRect(input.x * scaleX, input.y * scaleY, input.w * scaleX, input.h * scaleY);

        const text = String(this.saveNameDialog.text || '');
        const caret = (this.saveNameDialog.blink < 30) ? '_' : ' ';
        ctx.fillStyle = '#DDF7FF';
        ctx.font = Math.round(12 * scaleX) + 'px monospace';
        ctx.fillText(text + caret, (input.x + 10) * scaleX, (input.y + 22) * scaleY);

        if (this.saveNameDialog.hasExistingSave) {
            const overwriteName = String(this.saveNameDialog.existingDisplayName || 'EXISTING SAVE');
            ctx.fillStyle = 'rgba(255,170,80,0.95)';
            ctx.font = Math.round(10 * scaleX) + 'px monospace';
            ctx.fillText('WARNING: THIS WILL OVERWRITE SLOT S' + String(this.saveNameDialog.slotNumber).padStart(2, '0'), (d.x + 20) * scaleX, (d.y + 130) * scaleY);
            ctx.fillStyle = 'rgba(255,220,180,0.92)';
            ctx.fillText('CURRENT SAVE: ' + overwriteName, (d.x + 20) * scaleX, (d.y + 146) * scaleY);
        } else {
            ctx.fillStyle = 'rgba(120,240,255,0.85)';
            ctx.font = Math.round(10 * scaleX) + 'px monospace';
            ctx.fillText('NEW SAVE WILL BE CREATED IN SLOT S' + String(this.saveNameDialog.slotNumber).padStart(2, '0'), (d.x + 20) * scaleX, (d.y + 136) * scaleY);
        }

        if ((this.saveNameDialog.errorTimer || 0) > 0 && this.saveNameDialog.error) {
            ctx.fillStyle = '#FF8BA1';
            ctx.font = Math.round(10 * scaleX) + 'px monospace';
            ctx.fillText(this.saveNameDialog.error, (d.x + 20) * scaleX, (d.y + 164) * scaleY);
        }

        this._drawButton(ctx, scaleX, scaleY, d.cancelBtn.x, d.cancelBtn.y, d.cancelBtn.w, d.cancelBtn.h, 'CANCEL', false, -101);
        const actionLabel = this.savingInProgress
            ? 'SAVING...'
            : (this.saveNameDialog.hasExistingSave ? 'OVERWRITE' : 'SAVE');
        this._drawButton(ctx, scaleX, scaleY, d.saveBtn.x, d.saveBtn.y, d.saveBtn.w, d.saveBtn.h, actionLabel, false, -102);
    }

    _drawPanelAngularFrame(ctx, scaleX, scaleY, layout) {
        const x = layout.panelX * scaleX;
        const y = layout.panelY * scaleY;
        const w = layout.panelW * scaleX;
        const h = layout.panelH * scaleY;
        const sl = 18 * scaleX;
        const drift = Math.sin(this.animTick * 0.03) * 3 * scaleX;
        const ring = [
            [x + sl, y + 6 * scaleY],
            [x + w - 12 * scaleX, y + 6 * scaleY],
            [x + w - sl + drift, y + h - 10 * scaleY],
            [x + 8 * scaleX, y + h - 8 * scaleY]
        ];
        ctx.beginPath();
        for (let i = 0; i < ring.length; i++) {
            const p = ring[i];
            if (i === 0) ctx.moveTo(p[0], p[1]);
            else ctx.lineTo(p[0], p[1]);
        }
        ctx.closePath();
        const stroke = ctx.createLinearGradient(x, y, x + w, y + h);
        stroke.addColorStop(0, 'rgba(255,0,60,0.68)');
        stroke.addColorStop(0.5, 'rgba(0,240,255,0.55)');
        stroke.addColorStop(1, 'rgba(255,230,0,0.60)');
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.2 * scaleX;
        ctx.stroke();

        ctx.globalAlpha = 0.16;
        ctx.fillStyle = 'rgba(255,0,60,0.40)';
        ctx.fillRect(x + w - 176 * scaleX, y + 14 * scaleY, 150 * scaleX, 2 * scaleY);
        ctx.fillStyle = 'rgba(0,240,255,0.50)';
        ctx.fillRect(x + 28 * scaleX, y + h - 24 * scaleY, 180 * scaleX, 2 * scaleY);
        ctx.globalAlpha = 1;
    }

    _drawRightInfoDeck(ctx, scaleX, scaleY, layout) {
        const x = layout.rightX * scaleX;
        const y = (layout.panelY + 74) * scaleY;
        const w = layout.rightW * scaleX;
        const h = 372 * scaleY;
        const sl = 14 * scaleX;
        const t = this.animTick;

        ctx.beginPath();
        ctx.moveTo(x + sl, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - sl, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        const g = ctx.createLinearGradient(x, y, x + w, y + h);
        g.addColorStop(0, 'rgba(255,0,60,0.14)');
        g.addColorStop(0.35, 'rgba(3,10,22,0.86)');
        g.addColorStop(1, 'rgba(0,240,255,0.14)');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,240,255,0.35)';
        ctx.lineWidth = 1.1 * scaleX;
        ctx.stroke();

        ctx.font = 'bold ' + Math.round(10 * scaleX) + 'px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.82)';
        ctx.textAlign = 'left';
        ctx.fillText('NET PROFILE', x + 14 * scaleX, y + 18 * scaleY);

        // Compact theme chips (minimal but still thematic).
        const chips = [
            ['IT', '#00F0FF'],
            ['HACK', '#FF2A66'],
            ['ENG', '#FFE600'],
            ['SUBNET', '#00F0FF'],
            ['NET', '#FF2A66']
        ];
        let chipX = x + 12 * scaleX;
        const chipY = y + 30 * scaleY;
        for (let i = 0; i < chips.length; i++) {
            const cw = (chips[i][0].length * 6 + 22) * scaleX;
            const ch = 16 * scaleY;
            ctx.fillStyle = 'rgba(2,10,20,0.72)';
            ctx.fillRect(chipX, chipY, cw, ch);
            ctx.strokeStyle = 'rgba(255,255,255,0.14)';
            ctx.lineWidth = 1 * scaleX;
            ctx.strokeRect(chipX, chipY, cw, ch);
            ctx.fillStyle = chips[i][1];
            ctx.fillRect(chipX + 3 * scaleX, chipY + 3 * scaleY, 2 * scaleX, 10 * scaleY);
            ctx.font = Math.round(9 * scaleX) + 'px monospace';
            ctx.fillStyle = 'rgba(230,245,255,0.88)';
            ctx.fillText(chips[i][0], chipX + 8 * scaleX, chipY + 11 * scaleY);
            chipX += cw + 6 * scaleX;
        }

        // Single minimalist telemetry waveform.
        const graphX = x + 12 * scaleX;
        const graphY = y + 62 * scaleY;
        const graphW = w - 24 * scaleX;
        const graphH = h - 92 * scaleY;
        const graphSkew = 12 * scaleX;
        ctx.beginPath();
        ctx.moveTo(graphX + graphSkew, graphY);
        ctx.lineTo(graphX + graphW, graphY);
        ctx.lineTo(graphX + graphW - graphSkew, graphY + graphH);
        ctx.lineTo(graphX, graphY + graphH);
        ctx.closePath();
        const graphGrad = ctx.createLinearGradient(graphX, graphY, graphX + graphW, graphY + graphH);
        graphGrad.addColorStop(0, 'rgba(2,10,22,0.65)');
        graphGrad.addColorStop(1, 'rgba(2,14,24,0.42)');
        ctx.fillStyle = graphGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,240,255,0.24)';
        ctx.lineWidth = 1 * scaleX;
        ctx.stroke();

        for (let i = 0; i < 6; i++) {
            const gy = graphY + (i + 1) * (graphH / 7);
            ctx.strokeStyle = i % 2 === 0 ? 'rgba(0,240,255,0.10)' : 'rgba(255,0,60,0.08)';
            ctx.beginPath();
            ctx.moveTo(graphX + 6 * scaleX, gy);
            ctx.lineTo(graphX + graphW - 10 * scaleX, gy - 4 * scaleY);
            ctx.stroke();
        }

        const waveY = graphY + graphH * 0.62;
        ctx.beginPath();
        for (let i = 0; i <= 30; i++) {
            const px = graphX + 8 * scaleX + (i / 30) * (graphW - 20 * scaleX);
            const py = waveY + Math.sin((i * 0.58) + t * 0.08) * (9 + Math.sin(t * 0.02) * 3) * scaleY;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = 'rgba(0,240,255,0.58)';
        ctx.lineWidth = 1.4 * scaleX;
        ctx.stroke();

        ctx.beginPath();
        for (let i = 0; i <= 30; i++) {
            const px = graphX + 8 * scaleX + (i / 30) * (graphW - 20 * scaleX);
            const py = waveY + 18 * scaleY + Math.sin((i * 0.42) + t * 0.06 + 1.4) * 7 * scaleY;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = 'rgba(255,0,60,0.42)';
        ctx.lineWidth = 1.1 * scaleX;
        ctx.stroke();

        ctx.font = Math.round(9 * scaleX) + 'px monospace';
        ctx.fillStyle = 'rgba(255,230,0,0.82)';
        ctx.fillText('CIDR /27  SSH-T  PING 09MS', graphX + 10 * scaleX, graphY + graphH - 10 * scaleY);
    }

    _drawOuterRightBackgroundDeck(ctx, cW, cH, scaleX, scaleY) {
        const t = this.animTick;
        const ax = cW * 0.80;
        const ay = cH * 0.48;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(-0.12);

        const halo = ctx.createRadialGradient(0, 0, 20 * scaleX, 0, 0, 280 * scaleX);
        halo.addColorStop(0, 'rgba(0,240,255,0.14)');
        halo.addColorStop(0.45, 'rgba(255,0,60,0.10)');
        halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(-320 * scaleX, -220 * scaleY, 640 * scaleX, 440 * scaleY);

        for (let i = 0; i < 10; i++) {
            const y = (-180 + i * 34) * scaleY;
            const travel = ((t * (0.7 + i * 0.05)) + i * 27) % (310 * scaleX);
            ctx.strokeStyle = i % 2 ? 'rgba(0,240,255,0.18)' : 'rgba(255,0,60,0.14)';
            ctx.lineWidth = 1 * scaleX;
            ctx.beginPath();
            ctx.moveTo(-150 * scaleX, y);
            ctx.lineTo(180 * scaleX, y - 18 * scaleY);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255,230,0,0.72)';
            ctx.fillRect(-150 * scaleX + travel, y - 2 * scaleY, 12 * scaleX, 3 * scaleY);
        }
        ctx.restore();
    }

    _getPlayTimeStr(playTime) {
        const n = Number(playTime);
        if (!Number.isFinite(n) || n <= 0) return '00:00:00';
        const totalSeconds = Math.floor(n / 1000);
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    }

    _drawSlot(ctx, scaleX, scaleY, bx, by, bw, bh, game, isSelected, slotNumber) {
        const x = bx * scaleX, y = by * scaleY, w = bw * scaleX, h = bh * scaleY;
        const accentColor = isSelected ? '#FFE600' : '#00F0FF';
        const sl = 18 * scaleX;
        const pulse = 0.55 + 0.45 * Math.sin(this.animTick * 0.11 + slotNumber * 0.45);
        const meta = this._slotMeta(slotNumber - 1);

        ctx.beginPath();
        ctx.moveTo(x + sl, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - sl, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        if (isSelected) {
            const selGrad = ctx.createLinearGradient(x, y, x + w, y + h);
            selGrad.addColorStop(0, 'rgba(255,230,0,0.92)');
            selGrad.addColorStop(0.82, 'rgba(240,210,0,0.86)');
            selGrad.addColorStop(1, 'rgba(255,80,120,0.82)');
            ctx.fillStyle = selGrad;
        } else {
            const baseGrad = ctx.createLinearGradient(x, y, x + w, y + h);
            baseGrad.addColorStop(0, 'rgba(3,8,20,0.78)');
            baseGrad.addColorStop(1, 'rgba(3,10,24,0.66)');
            ctx.fillStyle = baseGrad;
        }
        ctx.fill();

        ctx.strokeStyle = accentColor;
        ctx.lineWidth = (isSelected ? 2 : 1) * scaleX;
        ctx.shadowBlur = 0;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 54 * scaleX, y);
        ctx.lineTo(x + 38 * scaleX, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        ctx.fillStyle = isSelected ? '#FF003C' : 'rgba(0,240,255,0.82)';
        ctx.fill();

        ctx.font = Math.round(10 * scaleX) + 'px monospace';
        ctx.fillStyle = isSelected ? '#FFFFFF' : '#00141A';
        ctx.textAlign = 'left';
        ctx.fillText(`S${String(slotNumber).padStart(2, '0')}`, x + 10 * scaleX, y + 19 * scaleY);

        for (let b = 0; b < 4; b++) {
            const active = b <= ((Math.floor(this.animTick / 7) + slotNumber) % 4);
            ctx.fillStyle = active
                ? (isSelected ? 'rgba(30,30,30,0.75)' : 'rgba(255,230,0,0.76)')
                : (isSelected ? 'rgba(34,34,34,0.30)' : 'rgba(0,240,255,0.18)');
            ctx.fillRect(x + 8 * scaleX + b * 10 * scaleX, y + h - 12 * scaleY, 7 * scaleX, 3 * scaleY);
        }

        const fName = IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace';
        const empty = !game || game.isEmpty;

        if (empty) {
            ctx.font = 'bold ' + Math.round(17 * scaleX) + 'px ' + fName;
            ctx.fillStyle = isSelected ? '#111111' : 'rgba(218,238,255,0.52)';
            ctx.fillText('NO DATA', x + 70 * scaleX, y + h * 0.58);
            ctx.font = Math.round(10 * scaleX) + 'px monospace';
            ctx.fillStyle = isSelected ? 'rgba(20,20,20,0.68)' : 'rgba(0,240,255,0.48)';
            ctx.fillText(this.saveMode ? 'READY TO CREATE SAVE' : 'WAITING FOR INTRUSION LOG', x + 70 * scaleX, y + h * 0.82);
        } else {
            ctx.font = 'bold ' + Math.round(17 * scaleX) + 'px ' + fName;
            ctx.fillStyle = isSelected ? '#111111' : '#FFFFFF';
            let heroName = 'UNKNOWN';
            if (game.hero && game.hero.character) heroName = game.hero.character.name;
            else if (game.hero && game.hero.name) heroName = game.hero.name;
            const primaryName = (meta && meta.saveName) ? String(meta.saveName) : heroName;
            ctx.fillText(primaryName, x + 70 * scaleX, y + 25 * scaleY);

            ctx.font = Math.round(11 * scaleX) + 'px monospace';
            ctx.fillStyle = isSelected ? 'rgba(20,20,20,0.84)' : 'rgba(0,240,255,0.76)';
            ctx.fillText(`SESSION: ${this._getPlayTimeStr(game.playTime)}`, x + 70 * scaleX, y + 47 * scaleY);
            ctx.textAlign = 'right';
            ctx.fillText(`NODE:${String(game.currentMapID || 1).padStart(4, '0')}`, x + w - 18 * scaleX, y + 47 * scaleY);
            ctx.textAlign = 'left';

            if (meta && meta.saveName) {
                ctx.font = Math.round(9 * scaleX) + 'px monospace';
                ctx.fillStyle = isSelected ? 'rgba(20,20,20,0.66)' : 'rgba(255,255,255,0.62)';
                ctx.fillText('OPERATIVE: ' + heroName, x + 70 * scaleX, y + 36 * scaleY);
            }

            ctx.font = Math.round(10 * scaleX) + 'px monospace';
            ctx.fillStyle = isSelected ? 'rgba(20,20,20,0.70)' : 'rgba(255,230,0,0.60)';
            const subnetHint = 'CIDR /27  AUTH SSH-T  PING ' + (8 + (slotNumber % 3)) + 'MS';
            ctx.fillText(subnetHint, x + 70 * scaleX, y + 62 * scaleY);
        }

        if (isSelected) {
            ctx.globalAlpha = 0.20 + pulse * 0.14;
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(x + w - 132 * scaleX, y + 5 * scaleY, 98 * scaleX, 2 * scaleY);
            ctx.globalAlpha = 1;
        }
    }

    _drawButton(ctx, scaleX, scaleY, bx, by, bw, bh, label, isSelected, index) {
        const isActive = isSelected || this.hoverIndex === index;
        const scrambleText = (this.scramble && index >= 0)
            ? this.scramble.getText(index, label)
            : label;
        
        IP2Live.UI.drawCyberButton({
            ctx,
            x: bx * scaleX,
            y: by * scaleY,
            w: bw * scaleX,
            h: bh * scaleY,
            scaleX, scaleY,
            label,
            isActive,
            isDanger: true,
            scrambleText: scrambleText,
            animTick: this.animTick
        });
    }
}
window.IP2LiveLoadGameMenu = IP2LiveLoadGameMenu;
console.log('[IP2Live] load-game.js loaded.');
