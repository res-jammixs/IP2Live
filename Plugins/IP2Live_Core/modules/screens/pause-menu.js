/**
 * IP2Live â€” Pause Menu Screen
 * @file Plugins/IP2Live_Core/modules/screens/pause-menu.js
 * Loaded via fetch + new Function() by code.js â€” all engine globals are
 * injected as function parameters (Common, Core, Data, Graphic, Manager,
 * Scene, Model, Main, THREE, IP2Live).
 */

class IP2LivePauseMenu extends Scene.Base {
    constructor(pauseBackdrop = null) {
        super(true);
        this.pauseBackdrop = pauseBackdrop;
        this._pauseMusicManager = IP2Live.MusicManager;
        if (this._pauseMusicManager && this._pauseMusicManager.setPaused) {
            this._pauseMusicManager.setPaused(true, this);
        }
    }

    close() {
        this._closed = true;
        this._cancelPendingAction();
        if (this._pauseMusicManager && this._pauseMusicManager.setPaused) {
            this._pauseMusicManager.setPaused(false, this);
        }
        this._pauseMusicManager = null;
        if (super.close) super.close();
    }

    initialize() {
        this.selectedIndex = 0;
        this.menuItems = this._getMenuItems();
        this.hoverIndex = -1;
        this.settingsHover = false;
        this.gameplayTestHover = false;
        this.animTick = 0;
        this.glitchActive = false;
        this.glitchTimer = 0;
        this.pendingAction = null;
        this.popupProgress = 0;
        this.closing = false;
        this.scanlineOffset = 0;
        this.scramble = IP2Live.TextScramble.create(this.menuItems.length);
        this.debugMode = false;
        this.debugIndex = 0;
        this.debugStages = this._buildDebugStages();
        this.debugItemRects = [];
        this.gameplayTestMode = false;
        this.gameplayTestIndex = 0;
        this.gameplayTests = this._buildGameplayTests();
        this.gameplayTestItemRects = [];
        this.gameplayTestNavRects = [];
    }

    _getMenuItems() {
        const items = ["RESUME", "SAVE STORY", "EXPORT REPORT"];
        const gameManager = IP2Live.GameManager;
        if (!gameManager || gameManager.enableDebugMapJumpButton !== false) {
            items.push("DEBUG MAP JUMP");
        }
        items.push("MAIN MENU", "QUIT GAME");
        return items;
    }

    _getLayout(SW, SH) {
        const panelW = 440;
        const panelH = Math.max(360, 184 + this.menuItems.length * 56);
        const panelX = (SW - panelW) / 2;
        const panelY = (SH - panelH) / 2;
        const btnW = 320;
        const btnH = 46;
        const btnGap = 10;
        const bx = panelX + (panelW - btnW) / 2;
        const buttonGroupH = this.menuItems.length * btnH + Math.max(0, this.menuItems.length - 1) * btnGap;
        const startY = panelY + (panelH - buttonGroupH) / 2;
        return { panelW, panelH, panelX, panelY, btnW, btnH, btnGap, bx, startY };
    }

    async load() {
        this.loading = false;
        // Opening Pause must never wait for unrelated fonts or a background image.
        if (IP2Live.Assets.loadPauseFonts) IP2Live.Assets.loadPauseFonts().then(() => {
            Manager.Stack.requestPaintHUD = true;
        });
        Manager.Stack.requestPaintHUD = true;
    }

    onKeyPressed(key) {
        if (this.closing || this._closed || this._actionRunning) return;
        if (this.gameplayTestMode) {
            if (Data.Keyboards.checkActionMenu(key)) {
                this._launchGameplayTest();
            } else if (Data.Keyboards.checkCancelMenu(key)) {
                this._exitGameplayTestMode();
            }
            return;
        }
        if (this.debugMode) {
            if (Data.Keyboards.checkActionMenu(key)) {
                this._jumpToDebugStage();
            } else if (Data.Keyboards.checkCancelMenu(key)) {
                this._exitDebugMode();
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
        if (this.closing || this._closed || this._actionRunning) return true;
        if (this.gameplayTestMode) {
            const prev = this.gameplayTestIndex;
            const count = Math.max(1, this.gameplayTests.length);
            const canvas = Common.Platform.ctx.canvas;
            const columns = this._gameplayTestGridLayout(canvas.width, canvas.height).columns;
            if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Up)) {
                this.gameplayTestIndex = Math.max(0, this.gameplayTestIndex - columns);
            } else if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Down)) {
                this.gameplayTestIndex = Math.min(count - 1, this.gameplayTestIndex + columns);
            } else if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Left)) {
                this.gameplayTestIndex = (this.gameplayTestIndex - 1 + count) % count;
            } else if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Right)) {
                this.gameplayTestIndex = (this.gameplayTestIndex + 1) % count;
            }
            if (this.gameplayTestIndex !== prev) {
                Data.Systems.soundCursor.playSound();
                Manager.Stack.requestPaintHUD = true;
            }
            return true;
        }
        if (this.debugMode) {
            const prev = this.debugIndex;
            if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Up)) {
                this.debugIndex = (this.debugIndex - 1 + this.debugStages.length) % Math.max(1, this.debugStages.length);
            } else if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Down)) {
                this.debugIndex = (this.debugIndex + 1) % Math.max(1, this.debugStages.length);
            }
            if (this.debugIndex !== prev) {
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
            this.hoverIndex = -1;  // keyboard took over
            Data.Systems.soundCursor.playSound();
            Manager.Stack.requestPaintHUD = true;
        }
        return true;
    }

    onMouseMove(x, y) {
        if (this.closing || this._closed || this._actionRunning || this.popupProgress < 1) return;
        if (this.gameplayTestMode) {
            const idx = this._getGameplayTestItemAt(x, y);
            if (idx >= 0 && idx !== this.gameplayTestIndex) {
                this.gameplayTestIndex = idx;
                Data.Systems.soundCursor.playSound();
                Manager.Stack.requestPaintHUD = true;
            }
            return;
        }
        if (this.debugMode) {
            const idx = this._getDebugItemAt(x, y);
            if (idx >= 0 && idx !== this.debugIndex) {
                this.debugIndex = idx;
                Data.Systems.soundCursor.playSound();
                Manager.Stack.requestPaintHUD = true;
            }
            return;
        }
        const isSettingsHover = this._isSettingsButtonAt(x, y);
        if (isSettingsHover !== this.settingsHover) {
            this.settingsHover = isSettingsHover;
            if (isSettingsHover) {
                this.hoverIndex = -1;
                this.gameplayTestHover = false;
            }
            Manager.Stack.requestPaintHUD = true;
        }
        if (isSettingsHover) return;
        const isGameplayTestHover = this._isGameplayTestButtonAt(x, y);
        if (isGameplayTestHover !== this.gameplayTestHover) {
            this.gameplayTestHover = isGameplayTestHover;
            if (isGameplayTestHover) this.hoverIndex = -1;
            Manager.Stack.requestPaintHUD = true;
        }
        if (isGameplayTestHover) return;
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
        if (this.closing || this._closed || this._actionRunning || this.popupProgress < 1) return;
        if (this.gameplayTestMode) {
            const nav = (this.gameplayTestNavRects || []).find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
            if (nav) {
                if (nav.action === 'back') this._exitGameplayTestMode();
                else {
                    const canvas = Common.Platform.ctx.canvas;
                    const layout = this._gameplayTestGridLayout(canvas.width, canvas.height);
                    const pages = Math.max(1, Math.ceil(this.gameplayTests.length / layout.pageSize));
                    const page = Math.floor(this.gameplayTestIndex / layout.pageSize);
                    this.gameplayTestIndex = ((page + nav.step + pages) % pages) * layout.pageSize;
                }
                Data.Systems.soundCursor.playSound();
                Manager.Stack.requestPaintHUD = true;
                return;
            }
            const idx = this._getGameplayTestItemAt(x, y);
            if (idx >= 0) {
                this.gameplayTestIndex = idx;
                Data.Systems.soundConfirmation.playSound();
                this._launchGameplayTest();
            }
            return;
        }
        if (this.debugMode) {
            const idx = this._getDebugItemAt(x, y);
            if (idx >= 0) {
                this.debugIndex = idx;
                Data.Systems.soundConfirmation.playSound();
                this._jumpToDebugStage();
            }
            return;
        }
        if (this._isSettingsButtonAt(x, y)) {
            this._openSettings();
            return;
        }
        if (this._isGameplayTestButtonAt(x, y)) {
            this._enterGameplayTestMode();
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
        const { SW, SH, scaleX, scaleY } = IP2Live.PauseUI.viewport(Common.Platform.ctx.canvas);
        const layout = this._getLayout(SW, SH);
        for (let i = 0; i < this.menuItems.length; i++) {
            const by = layout.startY + i * (layout.btnH + layout.btnGap);
            if (x >= layout.bx * scaleX && x <= (layout.bx + layout.btnW) * scaleX &&
                y >= by * scaleY && y <= (by + layout.btnH) * scaleY) return i;
        }
        return -1;
    }

    _settingsButtonLayout(SW, SH) {
        const layout = this._getLayout(SW, SH);
        return {
            x: layout.panelX + layout.panelW - 48,
            y: layout.panelY + 16,
            w: 28,
            h: 28,
        };
    }

    _gameplayTestButtonLayout(SW, SH) {
        const layout = this._getLayout(SW, SH);
        return {
            x: layout.panelX + 20,
            y: layout.panelY + 16,
            w: 70,
            h: 28,
        };
    }

    _isSettingsButtonAt(x, y) {
        const { SW, SH, scaleX, scaleY } = IP2Live.PauseUI.viewport(Common.Platform.ctx.canvas);
        const r = this._settingsButtonLayout(SW, SH);
        return x >= r.x * scaleX && x <= (r.x + r.w) * scaleX &&
            y >= r.y * scaleY && y <= (r.y + r.h) * scaleY;
    }

    _isGameplayTestButtonAt(x, y) {
        const gameManager = IP2Live.GameManager;
        if (gameManager && gameManager.enableGameplayTestingButton === false) return false;
        const { SW, SH, scaleX, scaleY } = IP2Live.PauseUI.viewport(Common.Platform.ctx.canvas);
        const r = this._gameplayTestButtonLayout(SW, SH);
        return x >= r.x * scaleX && x <= (r.x + r.w) * scaleX &&
            y >= r.y * scaleY && y <= (r.y + r.h) * scaleY;
    }

    _openSettings() {
        if (!window.IP2LiveSettingsMenu) {
            Data.Systems.soundImpossible.playSound();
            return;
        }
        Data.Systems.soundConfirmation.playSound();
        Manager.Stack.push(new IP2LiveSettingsMenu({ popupTransition: true }));
        Manager.Stack.requestPaintHUD = true;
    }

    _confirmSelection() {
        if (this.closing || this._closed || this._actionTimer || this._actionRunning) return;
        Data.Systems.soundConfirmation.playSound();
        this.glitchActive = true;
        this.glitchTimer = 6;
        this.pendingAction = this.selectedIndex;
        Manager.Stack.requestPaintHUD = true;
        const selectedIndex = this.selectedIndex;
        this._actionTimer = setTimeout(() => {
            this._actionTimer = null;
            if (this._closed || this.closing || Manager.Stack.top !== this) { this.pendingAction = null; return; }
            this._actionRunning = true;
            Promise.resolve().then(() => this._executeAction(selectedIndex)).catch((e) => {
                console.warn('[IP2Live] PauseMenu action failed:', e);
            }).finally(() => { this._actionRunning = false; this.pendingAction = null; });
        }, 100);
    }

    _cancelPendingAction() {
        if (this._actionTimer) clearTimeout(this._actionTimer);
        this._actionTimer = null;
        this.pendingAction = null;
    }

    _resume() {
        // Input handlers reject competing actions. The selected Resume action
        // must be allowed to close the menu while its own dispatch is running.
        if (this.closing || this._closed) return;
        this._cancelPendingAction();
        Data.Systems.soundCancel.playSound();
        this.closing = true;
        Manager.Stack.requestPaintHUD = true;
    }

    _openQuitConfirmation() {
        if (IP2Live.confirPopup && typeof IP2Live.confirPopup.show === 'function') {
            IP2Live.confirPopup.show({
                title: 'QUIT GAME?',
                message: 'Please save your game progress before quitting.',
                detail: 'Unsaved changes will be lost. Quit to desktop?',
                confirmLabel: 'QUIT',
                cancelLabel: 'CANCEL',
                danger: true,
                onConfirm: () => this._quitAfterCheckpoint(),
            });
            return;
        }
        this._quitAfterCheckpoint();
    }

    _quitAfterCheckpoint() {
        if (IP2Live.MenuTransition) return IP2Live.MenuTransition.quit('pause_menu_quit');
        if (this._quitInProgress) return;
        this._quitInProgress = true;
        const manager = IP2Live.GameManager;
        if (manager && typeof manager.prepareForShutdown === 'function') {
            Promise.resolve(manager.prepareForShutdown('pause_menu_quit'))
                .catch(function (error) {
                    console.warn('[IP2Live] PauseMenu shutdown checkpoint failed:', error);
                })
                .finally(function () { Common.Platform.quit(); });
            return;
        }
        Common.Platform.quit();
    }

    async _executeAction(idx) {
        switch (this.menuItems[idx]) {
            case "RESUME":
                this._resume();
                break;
            case "SAVE STORY":
                await this._saveGameProgress();
                break;
            case "EXPORT REPORT":
                if (window.IP2LiveExportReportMenu) {
                    Manager.Stack.push(new IP2LiveExportReportMenu());
                } else if (IP2Live.GameManager && typeof IP2Live.GameManager.exportProgressReport === 'function') {
                    await IP2Live.GameManager.exportProgressReport({ scopeDays: 30, format: 'both' });
                    if (!this._closed && Manager.Stack.top === this) Manager.Stack.pop();
                } else {
                    Data.Systems.soundImpossible.playSound();
                }
                break;
            case "DEBUG MAP JUMP":
                this._enterDebugMode();
                break;
            case "MAIN MENU":
                if (IP2Live.LoadingScreen && typeof IP2Live.LoadingScreen.show === 'function') {
                    IP2Live.LoadingScreen.show({
                        mode: 'replace',
                        status: 'Loading Main Menu',
                        detail: 'Closing active field session',
                        onComplete: function () {
                            Manager.Stack.popAll();
                            Manager.Stack.pushTitleScreen(true);
                        },
                    });
                } else {
                    Manager.Stack.popAll();
                    Manager.Stack.pushTitleScreen(true);
                }
                break;
            case "QUIT GAME":
                this._openQuitConfirmation();
                break;
        }
    }

    _buildDebugStages() {
        const mapManager = IP2Live.MapManager;
        const stages = mapManager && Array.isArray(mapManager.stages) ? mapManager.stages : [];
        const output = [];
        for (let i = 0; i < stages.length; i++) {
            const stage = stages[i];
            if (!stage || !stage.id) continue;
            output.push({
                id: Number(stage.id) || 0,
                name: stage.name || ('Map ' + String(stage.id).padStart(4, '0')),
                stage: typeof stage.stage === 'number' ? stage.stage : null,
                level: typeof stage.level === 'number' ? stage.level : null,
                tutorial: !!stage.tutorial,
            });
        }
        output.sort((a, b) => {
            if (a.tutorial !== b.tutorial) return a.tutorial ? -1 : 1;
            if (a.stage !== b.stage) return (a.stage || 0) - (b.stage || 0);
            if (a.level !== b.level) return (a.level || 0) - (b.level || 0);
            return a.id - b.id;
        });
        return output;
    }

    _buildGameplayTests() {
        const gameManager = IP2Live.GameManager;
        if (!gameManager || typeof gameManager.getGameplayTestCatalog !== 'function') return [];
        return gameManager.getGameplayTestCatalog();
    }

    _enterGameplayTestMode() {
        const gameManager = IP2Live.GameManager;
        if (gameManager && gameManager.enableGameplayTestingButton === false) return;
        this.gameplayTests = this._buildGameplayTests();
        this.gameplayTestIndex = Math.min(this.gameplayTestIndex, Math.max(0, this.gameplayTests.length - 1));
        this.gameplayTestMode = true;
        this.debugMode = false;
        this.hoverIndex = -1;
        this.gameplayTestHover = false;
        Data.Systems.soundConfirmation.playSound();
        Manager.Stack.requestPaintHUD = true;
    }

    _exitGameplayTestMode() {
        this.gameplayTestMode = false;
        this.gameplayTestItemRects = [];
        this.gameplayTestNavRects = [];
        Manager.Stack.requestPaintHUD = true;
    }

    _launchGameplayTest() {
        const entry = this.gameplayTests[this.gameplayTestIndex];
        const gameManager = IP2Live.GameManager;
        if (!entry || !gameManager || typeof gameManager.launchGameplayTest !== 'function') {
            Data.Systems.soundImpossible.playSound();
            return false;
        }
        const launched = gameManager.launchGameplayTest(entry.id);
        if (!launched) Data.Systems.soundImpossible.playSound();
        return launched;
    }

    _enterDebugMode() {
        if (IP2Live.GameManager && IP2Live.GameManager.enableDebugMapJumpButton === false) return;
        this.debugStages = this._buildDebugStages();
        this.debugIndex = Math.min(this.debugIndex, Math.max(0, this.debugStages.length - 1));
        this.debugMode = true;
        this.hoverIndex = -1;
        Manager.Stack.requestPaintHUD = true;
    }

    _exitDebugMode() {
        this.debugMode = false;
        this.debugItemRects = [];
        Manager.Stack.requestPaintHUD = true;
    }

    _jumpToDebugStage() {
        const entry = this.debugStages[this.debugIndex];
        if (!entry || !entry.id) return;
        const mapId = Number(entry.id) || 0;
        if (!mapId) return;
        const detail = entry.name || ('Map ' + String(mapId).padStart(4, '0'));
        const mode = entry.tutorial ? 'tutorial' : 'stage';

        this._exitDebugMode();
        Manager.Stack.pop();

        if (IP2Live.GameManager && typeof IP2Live.GameManager.startMapFlow === 'function') {
            IP2Live.GameManager.startMapFlow(mapId, null, {
                mode,
                useLoading: true,
                status: 'Debug Jump',
                detail,
                source: 'PauseMenu.debugJump',
                cleanMapSession: true,
                discardDialogue: true,
            });
            return;
        }
        if (IP2Live.MapManager && typeof IP2Live.MapManager.goTo === 'function') {
            this._clearDebugJumpCarryover(mapId, mode);
            IP2Live.MapManager.goTo(mapId, { status: 'Debug Jump', detail });
        }
    }

    _clearDebugJumpCarryover(mapId, mode) {
        if (IP2Live.Tutorial && typeof IP2Live.Tutorial.forceResetState === 'function') {
            IP2Live.Tutorial.forceResetState({ hideQuest: true });
        }
        if (IP2Live.DialogueManager && typeof IP2Live.DialogueManager.resetTransitionState === 'function') {
            IP2Live.DialogueManager.resetTransitionState({ stopActive: true, discardActive: true });
        }
        if (IP2Live.QuestManager && typeof IP2Live.QuestManager.resetTransitionState === 'function') {
            IP2Live.QuestManager.resetTransitionState({ clearPendingRestore: true, targetMapId: mapId });
        } else if (IP2Live.QuestManager) {
            if (typeof IP2Live.QuestManager.hideQuest === 'function') IP2Live.QuestManager.hideQuest();
            if (typeof IP2Live.QuestManager.clearGuide === 'function') IP2Live.QuestManager.clearGuide();
            IP2Live.QuestManager.activeQuestId = null;
            IP2Live.QuestManager.activeObjectiveId = null;
            IP2Live.QuestManager.activeMapId = null;
        }
        if (IP2Live.QuestMinimap && typeof IP2Live.QuestMinimap.destroy === 'function') {
            IP2Live.QuestMinimap.destroy();
        }
        return true;
    }

    _debugListLayout(cW, cH) {
        const scale = Math.max(0.72, Math.min(cW / 1280, cH / 720));
        const panelW = Math.min(820 * scale, cW * 0.86);
        const panelH = Math.min(558 * scale, cH * 0.84);
        const panelX = (cW - panelW) / 2;
        const panelY = (cH - panelH) / 2;
        const headerH = 76 * scale;
        const footerH = 58 * scale;
        const padX = 24 * scale;
        const listY = panelY + headerH + 15 * scale;
        const listH = panelH - headerH - footerH - 28 * scale;
        const rowH = 45 * scale;
        return { panelW, panelH, panelX, panelY, headerH, footerH, padX, listY, listH, rowH, scale };
    }

    _traceDebugPanelPath(ctx, x, y, w, h, cut) {
        const c = Math.max(6, Math.min(cut || 16, w * 0.12, h * 0.12));
        ctx.beginPath();
        ctx.moveTo(x + c, y);
        ctx.lineTo(x + w - c * 0.55, y);
        ctx.lineTo(x + w, y + c * 0.72);
        ctx.lineTo(x + w, y + h - c);
        ctx.lineTo(x + w - c, y + h);
        ctx.lineTo(x + c * 0.45, y + h);
        ctx.lineTo(x, y + h - c * 0.55);
        ctx.lineTo(x, y + c);
        ctx.closePath();
    }

    _traceDebugRowPath(ctx, x, y, w, h, cut) {
        const c = Math.max(4, Math.min(cut || 10, h * 0.34));
        ctx.beginPath();
        ctx.moveTo(x + c, y);
        ctx.lineTo(x + w - c * 1.5, y);
        ctx.lineTo(x + w, y + h * 0.5);
        ctx.lineTo(x + w - c * 1.5, y + h);
        ctx.lineTo(x + c * 0.55, y + h);
        ctx.lineTo(x, y + h - c * 0.6);
        ctx.lineTo(x, y + c);
        ctx.closePath();
    }

    _getDebugItemAt(x, y) {
        for (let i = 0; i < this.debugItemRects.length; i++) {
            const r = this.debugItemRects[i];
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.index;
        }
        return -1;
    }

    _getGameplayTestItemAt(x, y) {
        for (let i = 0; i < this.gameplayTestItemRects.length; i++) {
            const r = this.gameplayTestItemRects[i];
            if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.index;
        }
        return -1;
    }

    _gameplayTestGridLayout(cW, cH) {
        const scale = Math.min(cW / 1280, cH / 720);
        const panelW = Math.min(cW - 40 * scale, 1080 * scale);
        const panelH = Math.min(cH - 40 * scale, 620 * scale);
        const columns = cW / cH < 1.4 ? 3 : 4;
        const rows = 4;
        const gap = 12 * scale;
        const pad = 24 * scale;
        return { scale, panelW, panelH, panelX: (cW - panelW) / 2, panelY: (cH - panelH) / 2,
            columns, rows, pageSize: columns * rows, gap, pad,
            tileW: (panelW - 2 * pad - (columns - 1) * gap) / columns,
            tileH: (panelH - 170 * scale - (rows - 1) * gap) / rows };
    }

    _drawGameplayTestOverlay(ctx, cW, cH) {
        const g = this._gameplayTestGridLayout(cW, cH);
        const s = g.scale, x = g.panelX, y = g.panelY;
        const tests = this.gameplayTests || [];
        const pages = Math.max(1, Math.ceil(tests.length / g.pageSize));
        const page = Math.min(pages - 1, Math.floor(this.gameplayTestIndex / g.pageSize));
        const start = page * g.pageSize;
        const uiFont = IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace';
        this.gameplayTestItemRects = [];
        this.gameplayTestNavRects = [];
        ctx.save();
        ctx.fillStyle = 'rgba(0,2,10,0.84)'; ctx.fillRect(0, 0, cW, cH);
        this._traceDebugPanelPath(ctx, x, y, g.panelW, g.panelH, 18 * s);
        const shell = ctx.createLinearGradient(x, y, x + g.panelW, y + g.panelH);
        shell.addColorStop(0, '#0C2431'); shell.addColorStop(0.5, '#060F1B'); shell.addColorStop(1, '#21152F');
        ctx.fillStyle = shell; ctx.fill(); ctx.strokeStyle = '#478B9B'; ctx.lineWidth = s; ctx.stroke();
        ctx.fillStyle = 'rgba(120,200,222,0.025)';
        for (let sy = y + 8 * s; sy < y + g.panelH - 8 * s; sy += 5 * s) ctx.fillRect(x + 8 * s, sy, g.panelW - 16 * s, s * 0.5);
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#86C7D5'; ctx.font = 'bold ' + 9 * s + 'px monospace';
        ctx.fillText('SYS // TEST HARNESS', x + g.pad, y + 26 * s);
        ctx.fillStyle = '#E4F8FF'; ctx.font = 'bold ' + 21 * s + 'px ' + uiFont;
        ctx.fillText('GAMEPLAY TESTING', x + g.pad, y + 54 * s);
        ctx.fillStyle = '#8EA9BC'; ctx.font = 10 * s + 'px ' + uiFont;
        ctx.fillText('Choose a fresh gameplay or guided tutorial instance', x + g.pad, y + 78 * s);
        for (let i = start; i < Math.min(tests.length, start + g.pageSize); i++) {
            const entry = tests[i], slot = i - start;
            const tx = x + g.pad + (slot % g.columns) * (g.tileW + g.gap);
            const ty = y + 104 * s + Math.floor(slot / g.columns) * (g.tileH + g.gap);
            const active = i === this.gameplayTestIndex;
            const accent = entry.tutorial ? '#DAC279' : '#73C9DE';
            this._traceDebugRowPath(ctx, tx, ty, g.tileW, g.tileH, 7 * s);
            ctx.fillStyle = active ? '#183546' : 'rgba(4,14,25,0.85)'; ctx.fill();
            ctx.strokeStyle = active ? accent : 'rgba(102,156,182,0.35)'; ctx.lineWidth = (active ? 1.6 : 0.8) * s; ctx.stroke();
            ctx.fillStyle = accent; ctx.fillRect(tx + 12 * s, ty, 30 * s, 2 * s);
            ctx.font = 'bold ' + 9 * s + 'px monospace'; ctx.fillText(String(i + 1).padStart(2, '0'), tx + 14 * s, ty + 17 * s);
            ctx.textAlign = 'right'; ctx.fillText(entry.tutorial ? 'TUTORIAL' : 'GAMEPLAY', tx + g.tileW - 14 * s, ty + 17 * s);
            ctx.textAlign = 'left'; ctx.fillStyle = '#E2EFF6'; ctx.font = 'bold ' + 12 * s + 'px ' + uiFont;
            ctx.fillText(entry.name.toUpperCase(), tx + 14 * s, ty + g.tileH * 0.52, g.tileW - 28 * s);
            ctx.fillStyle = '#7F9BAB'; ctx.font = 9 * s + 'px ' + uiFont;
            ctx.fillText((entry.gameplayLabel || entry.gameplayId).toUpperCase(), tx + 14 * s, ty + g.tileH - 16 * s, g.tileW - 28 * s);
            this.gameplayTestItemRects.push({ index: i, x: tx, y: ty, w: g.tileW, h: g.tileH });
        }
        const footerY = y + g.panelH - 44 * s;
        ctx.fillStyle = '#83A8BA'; ctx.font = 9 * s + 'px monospace';
        ctx.fillText('ARROWS SELECT  /  ENTER OPEN  /  ESC BACK', x + g.pad, footerY + 15 * s);
        ctx.textAlign = 'center'; ctx.fillText('PAGE ' + (page + 1) + ' / ' + pages, x + g.panelW * 0.63, footerY + 15 * s);
        const navs = [{ action: 'back', label: 'BACK', offset: 256 }];
        if (pages > 1) navs.push({ action: 'page', step: -1, label: '< PREV', offset: 172 }, { action: 'page', step: 1, label: 'NEXT >', offset: 88 });
        for (const nav of navs) {
            const nx = x + g.panelW - nav.offset * s;
            this._traceDebugRowPath(ctx, nx, footerY, 72 * s, 30 * s, 4 * s);
            ctx.fillStyle = '#102737'; ctx.fill(); ctx.strokeStyle = '#518A9C'; ctx.lineWidth = s; ctx.stroke();
            ctx.fillStyle = '#C6E8F2'; ctx.fillText(nav.label, nx + 36 * s, footerY + 15 * s);
            this.gameplayTestNavRects.push({ ...nav, x: nx, y: footerY, w: 72 * s, h: 30 * s });
        }
        if (!tests.length) { ctx.fillStyle = '#DAC279'; ctx.fillText('NO GAMEPLAYS AVAILABLE', x + g.panelW / 2, y + g.panelH / 2); }
        ctx.restore();
    }
    _drawDebugJumpOverlay(ctx, cW, cH) {
        const layout = this._debugListLayout(cW, cH);
        const panelX = layout.panelX;
        const panelY = layout.panelY;
        const panelW = layout.panelW;
        const panelH = layout.panelH;
        const s = layout.scale;
        const listX = panelX + layout.padX;
        const listY = layout.listY;
        const listW = panelW - layout.padX * 2;
        const rowH = layout.rowH;
        const maxRows = Math.max(1, Math.floor(layout.listH / rowH));
        const stages = this.debugStages || [];
        const selectedEntry = stages[this.debugIndex] || null;
        const titleFont = IP2Live.Assets.abnesLoaded ? 'Abnes' : 'Arial Black';
        const uiFont = IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace';
        const currentMapId = Core.Game.current ? Number(Core.Game.current.currentMapID) || 0 : 0;
        const tick = this.animTick || 0;

        this.debugItemRects = [];

        ctx.save();
        ctx.fillStyle = 'rgba(0, 2, 10, 0.70)';
        ctx.fillRect(0, 0, cW, cH);

        ctx.save();
        ctx.translate(12 * s, 12 * s);
        this._traceDebugPanelPath(ctx, panelX, panelY, panelW, panelH, 20 * s);
        ctx.fillStyle = 'rgba(0,0,0,0.62)';
        ctx.fill();
        ctx.restore();

        this._traceDebugPanelPath(ctx, panelX, panelY, panelW, panelH, 20 * s);
        const shell = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY + panelH);
        shell.addColorStop(0, 'rgba(8,20,27,0.985)');
        shell.addColorStop(0.42, 'rgba(2,7,13,0.985)');
        shell.addColorStop(0.82, 'rgba(7,6,17,0.99)');
        shell.addColorStop(1, 'rgba(18,4,13,0.99)');
        ctx.fillStyle = shell;
        ctx.fill();
        ctx.shadowColor = '#00D9E7';
        ctx.shadowBlur = 12 * s;
        ctx.strokeStyle = 'rgba(0,224,236,0.86)';
        ctx.lineWidth = 1.5 * s;
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.save();
        this._traceDebugPanelPath(ctx, panelX + 7 * s, panelY + 7 * s, panelW - 14 * s, panelH - 14 * s, 15 * s);
        ctx.clip();
        const headerGlow = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY);
        headerGlow.addColorStop(0, 'rgba(255,0,60,0.22)');
        headerGlow.addColorStop(0.34, 'rgba(0,240,255,0.08)');
        headerGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = headerGlow;
        ctx.fillRect(panelX, panelY, panelW, layout.headerH + 16 * s);
        for (let sy = panelY + ((tick * 0.42) % (7 * s)); sy < panelY + panelH; sy += 7 * s) {
            ctx.fillStyle = 'rgba(0,220,230,0.028)';
            ctx.fillRect(panelX, sy, panelW, Math.max(1, s * 0.75));
        }
        ctx.restore();

        const tagW = 118 * s;
        this._traceDebugRowPath(ctx, panelX + 1 * s, panelY + 1 * s, tagW, 36 * s, 9 * s);
        ctx.fillStyle = '#FF0040';
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + (8 * s).toFixed(1) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('SYS // DEV ROUTE', panelX + tagW * 0.5, panelY + 18 * s);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#F5FAFF';
        ctx.font = 'bold ' + (23 * s).toFixed(1) + 'px ' + titleFont;
        ctx.fillText('MAP ROUTER', panelX + 28 * s, panelY + 54 * s);
        ctx.fillStyle = '#00E6F0';
        ctx.font = 'bold ' + (7.5 * s).toFixed(1) + 'px ' + uiFont;
        ctx.fillText('DEBUG TRANSIT CONTROL // ISOLATED DESTINATION LOAD', panelX + 29 * s, panelY + 69 * s);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#FFE600';
        ctx.font = 'bold ' + (8 * s).toFixed(1) + 'px monospace';
        ctx.fillText(
            'DEST::' + String(selectedEntry ? selectedEntry.id : 0).padStart(4, '0') + '  //  CLEAN SESSION',
            panelX + panelW - 25 * s,
            panelY + 31 * s
        );
        ctx.fillStyle = '#718B96';
        ctx.font = 'bold ' + (6.8 * s).toFixed(1) + 'px monospace';
        ctx.fillText('CURRENT MAP::' + String(currentMapId).padStart(4, '0'), panelX + panelW - 25 * s, panelY + 49 * s);

        ctx.strokeStyle = 'rgba(0,230,240,0.34)';
        ctx.lineWidth = 1 * s;
        ctx.beginPath();
        ctx.moveTo(panelX + 25 * s, panelY + layout.headerH + 2 * s);
        ctx.lineTo(panelX + panelW * 0.47, panelY + layout.headerH + 2 * s);
        ctx.lineTo(panelX + panelW * 0.52, panelY + layout.headerH + 9 * s);
        ctx.lineTo(panelX + panelW - 25 * s, panelY + layout.headerH + 9 * s);
        ctx.stroke();

        if (!stages.length) {
            ctx.fillStyle = '#FFE600';
            ctx.font = 'bold ' + (12 * s).toFixed(1) + 'px monospace';
            ctx.textAlign = 'left';
            ctx.fillText('NO STAGE ROUTES DISCOVERED', listX, listY + 28 * s);
            ctx.restore();
            return;
        }

        const start = Math.max(0, Math.min(
            Math.max(0, stages.length - maxRows),
            Math.min(stages.length - 1, this.debugIndex) - Math.floor(maxRows / 2)
        ));
        const end = Math.min(stages.length, start + maxRows);
        let row = 0;
        for (let i = start; i < end; i++) {
            const entry = stages[i];
            const y = listY + row * rowH;
            const isSelected = i === this.debugIndex;
            const label = entry.name || ('Map ' + String(entry.id).padStart(4, '0'));
            const suffix = entry.tutorial
                ? 'TRAINING ENVIRONMENT // FOUNDATION PROTOCOL'
                : 'STAGE ' + String(entry.stage || 0).padStart(2, '0') + ' // LEVEL ' + String(entry.level || 0).padStart(2, '0');
            const rowX = listX;
            const rowY = y + 2 * s;
            const rowW = listW - 10 * s;
            const rowDrawH = rowH - 5 * s;

            ctx.save();
            this._traceDebugRowPath(ctx, rowX, rowY, rowW, rowDrawH, 10 * s);
            if (isSelected) {
                const active = ctx.createLinearGradient(rowX, rowY, rowX + rowW, rowY);
                active.addColorStop(0, '#FFE600');
                active.addColorStop(0.18, 'rgba(255,230,0,0.92)');
                active.addColorStop(0.19, 'rgba(20,25,25,0.98)');
                active.addColorStop(1, 'rgba(5,9,14,0.98)');
                ctx.fillStyle = active;
                ctx.shadowColor = '#FFE600';
                const selectionPulse = Math.sin(tick * 0.12);
                ctx.shadowBlur = (8 + 5 * selectionPulse * selectionPulse) * s;
            } else {
                const idle = ctx.createLinearGradient(rowX, rowY, rowX + rowW, rowY);
                idle.addColorStop(0, 'rgba(10,28,34,0.86)');
                idle.addColorStop(0.20, 'rgba(4,10,16,0.90)');
                idle.addColorStop(1, 'rgba(2,5,11,0.88)');
                ctx.fillStyle = idle;
            }
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = isSelected ? '#FFE600' : 'rgba(0,207,220,0.28)';
            ctx.lineWidth = (isSelected ? 1.7 : 1) * s;
            ctx.stroke();

            ctx.fillStyle = isSelected ? '#05070A' : '#00D9E7';
            ctx.font = 'bold ' + (8 * s).toFixed(1) + 'px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(String(i + 1).padStart(2, '0'), rowX + 43 * s, rowY + rowDrawH * 0.5);

            ctx.textAlign = 'left';
            ctx.fillStyle = '#F4F8FF';
            ctx.font = 'bold ' + (11 * s).toFixed(1) + 'px ' + uiFont;
            ctx.fillText(label.toUpperCase(), rowX + 82 * s, rowY + 14 * s);
            ctx.fillStyle = isSelected ? '#FFE600' : '#6E9BA7';
            ctx.font = 'bold ' + (6.5 * s).toFixed(1) + 'px monospace';
            ctx.fillText(suffix, rowX + 82 * s, rowY + 29 * s);

            ctx.textAlign = 'right';
            ctx.fillStyle = isSelected ? '#FFFFFF' : '#587681';
            ctx.font = 'bold ' + (7.2 * s).toFixed(1) + 'px monospace';
            ctx.fillText('MAP::' + String(entry.id).padStart(4, '0'), rowX + rowW - 25 * s, rowY + rowDrawH * 0.5);
            ctx.restore();

            this.debugItemRects.push({ index: i, x: rowX, y: rowY, w: rowW, h: rowDrawH });
            row++;
        }

        if (stages.length > maxRows) {
            const railX = panelX + panelW - 20 * s;
            const railY = listY + 3 * s;
            const railH = Math.min(layout.listH, maxRows * rowH) - 8 * s;
            const thumbH = Math.max(22 * s, railH * (maxRows / stages.length));
            const thumbTravel = Math.max(0, railH - thumbH);
            const thumbP = stages.length <= 1 ? 0 : this.debugIndex / (stages.length - 1);
            ctx.fillStyle = 'rgba(48,78,87,0.55)';
            ctx.fillRect(railX, railY, 3 * s, railH);
            ctx.fillStyle = '#00E0EC';
            ctx.fillRect(railX - 1 * s, railY + thumbTravel * thumbP, 5 * s, thumbH);
        }

        const footerY = panelY + panelH - layout.footerH;
        ctx.fillStyle = 'rgba(1,6,11,0.94)';
        ctx.fillRect(panelX + 8 * s, footerY, panelW - 16 * s, layout.footerH - 8 * s);
        ctx.strokeStyle = 'rgba(0,225,235,0.28)';
        ctx.beginPath();
        ctx.moveTo(panelX + 20 * s, footerY);
        ctx.lineTo(panelX + panelW - 20 * s, footerY);
        ctx.stroke();

        const controls = [
            ['UP/DOWN', 'SELECT'],
            ['ENTER', 'CLEAN JUMP'],
            ['ESC', 'BACK'],
        ];
        let controlX = panelX + 26 * s;
        for (let i = 0; i < controls.length; i++) {
            ctx.fillStyle = i === 1 ? '#FFE600' : '#00D9E7';
            ctx.font = 'bold ' + (7.2 * s).toFixed(1) + 'px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(controls[i][0], controlX, footerY + 21 * s);
            ctx.fillStyle = '#7896A0';
            ctx.font = 'bold ' + (6.2 * s).toFixed(1) + 'px monospace';
            ctx.fillText(controls[i][1], controlX, footerY + 36 * s);
            controlX += (i === 0 ? 108 : 124) * s;
        }

        ctx.textAlign = 'right';
        ctx.fillStyle = '#FF6D88';
        ctx.font = 'bold ' + (6.4 * s).toFixed(1) + 'px monospace';
        ctx.fillText('PREVIOUS MAP DIALOGUE + QUEST GUIDES WILL BE DISCARDED', panelX + panelW - 25 * s, footerY + 23 * s);
        ctx.fillStyle = '#66838D';
        ctx.fillText('DESTINATION OBJECTIVES INITIALIZE ON ARRIVAL', panelX + panelW - 25 * s, footerY + 38 * s);

        ctx.restore();
    }

    async _saveGameProgress() {
        if (!window.IP2LiveLoadGameMenu) {
            Data.Systems.soundImpossible.playSound();
            console.warn('[IP2Live] Save failed: Save menu screen is not available.');
            return;
        }
        const makeMenu = () => new window.IP2LiveLoadGameMenu({
            saveMode: true,
            onSaved: function () {
                Manager.Stack.popAll();
                Manager.Stack.pushTitleScreen(true);
            },
        });
        if (IP2Live.MenuTransition) IP2Live.MenuTransition.open(makeMenu);
        else Manager.Stack.push(makeMenu());
    }

    update() {
        if (this.closing) {
            this.popupProgress = Math.max(0, this.popupProgress - 0.085);
            if (this.popupProgress === 0) {
                if (Manager.Stack.top === this) Manager.Stack.pop();
                Manager.Stack.requestPaintHUD = true;
                return;
            }
        } else {
            this.popupProgress = Math.min(1, this.popupProgress + 0.085);
        }
        this.animTick++;
        this.scanlineOffset = (this.scanlineOffset + 0.5) % 4;
        if (this.glitchTimer > 0) {
            this.glitchTimer--;
            this.glitchActive = this.glitchTimer > 0;
        }
        this.scramble.update(this.selectedIndex, this.hoverIndex);
        if (this.animTick % 2 === 0) Manager.Stack.requestPaintHUD = true;
    }

    draw3D() { Manager.GL.renderer.clear(); }

    drawHUD() {
        const ctx = Common.Platform.ctx;
        this.buttonRects = IP2Live.PauseUI.draw(this, ctx, this.popupProgress, true);
        if (this.debugMode) this._drawDebugJumpOverlay(ctx, ctx.canvas.width, ctx.canvas.height);
        else if (this.gameplayTestMode) this._drawGameplayTestOverlay(ctx, ctx.canvas.width, ctx.canvas.height);
    }

    _drawPauseContainer(ctx, x, y, w, h, scaleX, scaleY) {
        const tick = this.animTick || 0;
        const cut = 22 * scaleX;
        const pulse = 0.5 + 0.5 * Math.sin(tick * 0.055);

        ctx.save();

        ctx.save();
        ctx.translate(11 * scaleX, 10 * scaleY);
        this._drawPausePanelPath(ctx, x, y, w, h, cut, scaleX, scaleY);
        ctx.fillStyle = 'rgba(0,0,0,0.46)';
        ctx.fill();
        ctx.restore();

        this._drawPausePanelPath(ctx, x, y, w, h, cut, scaleX, scaleY);
        const panelGrad = ctx.createLinearGradient(x, y, x + w, y + h);
        panelGrad.addColorStop(0, 'rgba(1,7,13,0.97)');
        panelGrad.addColorStop(0.42, 'rgba(2,12,18,0.94)');
        panelGrad.addColorStop(0.70, 'rgba(5,6,17,0.95)');
        panelGrad.addColorStop(1, 'rgba(0,3,9,0.98)');
        ctx.fillStyle = panelGrad;
        ctx.fill();

        ctx.save();
        this._drawPausePanelPath(ctx, x, y, w, h, cut, scaleX, scaleY);
        ctx.clip();

        const headerGrad = ctx.createLinearGradient(x, y, x + w, y + 92 * scaleY);
        headerGrad.addColorStop(0, 'rgba(89,15,31,0.16)');
        headerGrad.addColorStop(0.42, 'rgba(16,93,82,0.10)');
        headerGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = headerGrad;
        ctx.fillRect(x, y, w, 96 * scaleY);

        for (let yy = y + ((tick * 0.45) % (7 * scaleY)); yy < y + h; yy += 7 * scaleY) {
            ctx.fillStyle = 'rgba(108,178,151,0.035)';
            ctx.fillRect(x, yy, w, Math.max(1, 1.1 * scaleY));
        }

        this._drawPausePanelNetwork(ctx, x, y, w, h, scaleX, scaleY, tick);
        this._drawPausePixelFragments(ctx, x, y, w, h, scaleX, scaleY, tick);
        ctx.restore();

        ctx.shadowColor = 'rgba(32,156,145,0.34)';
        ctx.shadowBlur = 10 * scaleX;
        this._drawPausePanelPath(ctx, x, y, w, h, cut, scaleX, scaleY);
        ctx.strokeStyle = 'rgba(41,189,174,0.76)';
        ctx.lineWidth = 1.35 * scaleX;
        ctx.stroke();
        ctx.shadowBlur = 0;

        this._drawPausePanelPath(ctx, x + 6 * scaleX, y + 6 * scaleY, w - 12 * scaleX, h - 12 * scaleY, cut * 0.75, scaleX, scaleY);
        ctx.strokeStyle = 'rgba(93,170,135,' + (0.17 + pulse * 0.08).toFixed(3) + ')';
        ctx.lineWidth = 1 * scaleX;
        ctx.stroke();

        this._drawPauseContainerAccents(ctx, x, y, w, h, scaleX, scaleY, tick);

        ctx.restore();
    }

    _drawPausePanelPath(ctx, x, y, w, h, cut, scaleX, scaleY) {
        ctx.beginPath();
        ctx.moveTo(x + cut, y);
        ctx.lineTo(x + w - 10 * scaleX, y);
        ctx.lineTo(x + w, y + 16 * scaleY);
        ctx.lineTo(x + w, y + h - cut * 0.55);
        ctx.lineTo(x + w - cut * 0.75, y + h);
        ctx.lineTo(x + 8 * scaleX, y + h);
        ctx.lineTo(x, y + h - 12 * scaleY);
        ctx.lineTo(x, y + cut * 0.85);
        ctx.closePath();
    }

    _drawPauseContainerAccents(ctx, x, y, w, h, scaleX, scaleY, tick) {
        const pulse = 0.5 + 0.5 * Math.sin(tick * 0.08);
        const red = 'rgba(122,18,34,0.66)';
        const green = 'rgba(79,166,107,0.72)';
        const teal = 'rgba(42,154,141,0.64)';
        const amber = 'rgba(111,99,48,0.84)';

        ctx.save();

        ctx.fillStyle = 'rgba(122,18,34,0.20)';
        ctx.beginPath();
        ctx.moveTo(x + w - 112 * scaleX, y - 2 * scaleY);
        ctx.lineTo(x + w - 34 * scaleX, y - 2 * scaleY);
        ctx.lineTo(x + w - 58 * scaleX, y + 24 * scaleY);
        ctx.lineTo(x + w - 132 * scaleX, y + 24 * scaleY);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = teal;
        ctx.lineWidth = 1.2 * scaleX;
        ctx.beginPath();
        ctx.moveTo(x + 24 * scaleX, y + 66 * scaleY);
        ctx.lineTo(x + w * 0.36, y + 66 * scaleY);
        ctx.lineTo(x + w * 0.43, y + 78 * scaleY);
        ctx.lineTo(x + w - 28 * scaleX, y + 78 * scaleY);
        ctx.stroke();

        ctx.strokeStyle = red;
        ctx.beginPath();
        ctx.moveTo(x + 18 * scaleX, y + h - 58 * scaleY);
        ctx.lineTo(x + w * 0.30, y + h - 58 * scaleY);
        ctx.lineTo(x + w * 0.38, y + h - 42 * scaleY);
        ctx.lineTo(x + w - 36 * scaleX, y + h - 42 * scaleY);
        ctx.stroke();

        ctx.strokeStyle = amber;
        ctx.lineWidth = 2 * scaleX;
        ctx.beginPath();
        ctx.moveTo(x, y + 18 * scaleY);
        ctx.lineTo(x, y);
        ctx.lineTo(x + 20 * scaleX, y);
        ctx.moveTo(x + w - 20 * scaleX, y + h);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x + w, y + h - 20 * scaleY);
        ctx.stroke();

        ctx.fillStyle = green;
        ctx.fillRect(x + 12 * scaleX, y + 16 * scaleY, 34 * scaleX, 4 * scaleY);
        ctx.fillStyle = red;
        ctx.fillRect(x + w - 82 * scaleX, y + h - 28 * scaleY, 54 * scaleX, 4 * scaleY);

        ctx.font = 'bold ' + Math.round(8 * scaleX) + 'px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(175,214,202,' + (0.34 + pulse * 0.18).toFixed(3) + ')';
        ctx.fillText('INFILTRATION_TERMINAL', x + 22 * scaleX, y + h - 24 * scaleY);
        ctx.textAlign = 'right';
        ctx.fillText('NET::PAUSE_LOCK', x + w - 22 * scaleX, y + 20 * scaleY);

        ctx.restore();
    }

    _drawPausePanelNetwork(ctx, x, y, w, h, scaleX, scaleY, tick) {
        const nodes = [
            [0.18, 0.18], [0.36, 0.22], [0.68, 0.18], [0.84, 0.30],
            [0.22, 0.48], [0.50, 0.44], [0.76, 0.52],
            [0.30, 0.76], [0.58, 0.72], [0.86, 0.82]
        ];

        ctx.save();
        ctx.lineWidth = 1 * scaleX;
        for (let i = 0; i < nodes.length - 1; i++) {
            const a = nodes[i];
            const b = nodes[(i + 2) % nodes.length];
            const ax = x + a[0] * w + Math.sin(tick * 0.012 + i) * 3 * scaleX;
            const ay = y + a[1] * h + Math.cos(tick * 0.010 + i) * 3 * scaleY;
            const bx = x + b[0] * w + Math.sin(tick * 0.013 + i) * 3 * scaleX;
            const by = y + b[1] * h + Math.cos(tick * 0.011 + i) * 3 * scaleY;
            ctx.strokeStyle = i % 3 === 0 ? 'rgba(122,18,34,0.13)' : 'rgba(42,154,141,0.14)';
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
        }

        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            const pulse = 0.45 + 0.55 * Math.sin(tick * 0.075 + i * 0.7);
            const nx = x + n[0] * w + Math.sin(tick * 0.012 + i) * 3 * scaleX;
            const ny = y + n[1] * h + Math.cos(tick * 0.010 + i) * 3 * scaleY;
            ctx.fillStyle = i % 4 === 0
                ? 'rgba(122,18,34,' + (0.20 + pulse * 0.18).toFixed(3) + ')'
                : 'rgba(67,174,119,' + (0.18 + pulse * 0.20).toFixed(3) + ')';
            ctx.fillRect(nx - 2 * scaleX, ny - 2 * scaleY, 4 * scaleX, 4 * scaleY);
        }

        for (let i = 0; i < 4; i++) {
            const from = nodes[i + 1];
            const to = nodes[i + 5];
            const p = (tick * (0.006 + i * 0.0015) + i * 0.21) % 1;
            const px = x + (from[0] + (to[0] - from[0]) * p) * w;
            const py = y + (from[1] + (to[1] - from[1]) * p) * h;
            ctx.fillStyle = i % 2 === 0 ? 'rgba(76,160,104,0.46)' : 'rgba(50,142,132,0.42)';
            ctx.fillRect(px - 5 * scaleX, py - 1.5 * scaleY, 10 * scaleX, 3 * scaleY);
        }
        ctx.restore();
    }

    _drawPausePixelFragments(ctx, x, y, w, h, scaleX, scaleY, tick) {
        ctx.save();
        for (let i = 0; i < 20; i++) {
            const gate = (tick * (i + 5) + i * 29) % 61;
            if (gate > 26) continue;

            const px = x + (((i * 97 + tick * 7) % 1000) / 1000) * w;
            const py = y + (((i * 151 + tick * 3) % 1000) / 1000) * h;
            const bw = (4 + (i % 4) * 7) * scaleX;
            const bh = (2 + (i % 3) * 2) * scaleY;
            ctx.fillStyle = i % 6 === 0
                ? 'rgba(122,18,34,0.20)'
                : (i % 2 === 0 ? 'rgba(76,160,104,0.20)' : 'rgba(50,142,132,0.18)');
            ctx.fillRect(px, py, bw, bh);
        }
        ctx.restore();
    }

    _drawPausedTitle(ctx, scaleX, scaleY, SW, SH, panelX, panelY, panelW) {
        const fontName = IP2Live.Assets.abnesLoaded ? 'Abnes' : 'Arial Black';
        const cx = (panelX + panelW / 2) * scaleX;
        const ty = (panelY + 48) * scaleY;
        ctx.textAlign = 'center';
        ctx.font = 'bold ' + (28 * scaleX) + 'px ' + fontName;
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowBlur = 0;
        ctx.fillText('PAUSED', cx, ty);
        ctx.textAlign = 'left';
    }

    _drawPauseSettingsIcon(ctx, scaleX, scaleY, SW, SH) {
        const r = this._settingsButtonLayout(SW, SH);
        const x = r.x * scaleX;
        const y = r.y * scaleY;
        const w = r.w * scaleX;
        const h = r.h * scaleY;
        const cx = x + w / 2;
        const cy = y + h / 2;
        const radius = Math.min(w, h) * 0.28;

        ctx.save();
        ctx.fillStyle = this.settingsHover ? 'rgba(0,229,244,0.20)' : 'rgba(0,20,28,0.72)';
        ctx.strokeStyle = this.settingsHover ? '#FFE600' : 'rgba(0,230,241,0.75)';
        ctx.lineWidth = 1.2 * scaleX;
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.fill();
        ctx.stroke();

        ctx.strokeStyle = this.settingsHover ? '#FFE600' : '#00E5F4';
        ctx.lineWidth = 1.8 * scaleX;
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 * i) / 8;
            const inner = radius * 1.15;
            const outer = radius * 1.55;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
            ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 0.34, 0, Math.PI * 2);
        ctx.fillStyle = this.settingsHover ? '#FFE600' : '#00E5F4';
        ctx.fill();
        ctx.restore();
    }

    _drawGameplayTestButton(ctx, scaleX, scaleY, SW, SH) {
        const gameManager = IP2Live.GameManager;
        if (gameManager && gameManager.enableGameplayTestingButton === false) return;
        const r = this._gameplayTestButtonLayout(SW, SH);
        const x = r.x * scaleX;
        const y = r.y * scaleY;
        const w = r.w * scaleX;
        const h = r.h * scaleY;
        const activeColor = this.gameplayTestHover ? '#FFE600' : '#00E5F4';

        ctx.save();
        ctx.fillStyle = this.gameplayTestHover ? 'rgba(255,230,0,0.14)' : 'rgba(0,20,28,0.72)';
        ctx.strokeStyle = this.gameplayTestHover ? '#FFE600' : 'rgba(0,230,241,0.75)';
        ctx.lineWidth = 1.2 * scaleX;
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.fill();
        ctx.stroke();

        const iconX = x + 12 * scaleX;
        const iconY = y + h * 0.5;
        ctx.fillStyle = activeColor;
        ctx.beginPath();
        ctx.moveTo(iconX - 3 * scaleX, iconY - 5 * scaleY);
        ctx.lineTo(iconX + 6 * scaleX, iconY);
        ctx.lineTo(iconX - 3 * scaleX, iconY + 5 * scaleY);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = activeColor;
        ctx.font = 'bold ' + (7.5 * scaleX) + 'px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('TEST', x + 27 * scaleX, iconY);
        ctx.restore();
    }

    _drawButton(ctx, scaleX, scaleY, bx, by, bw, bh, label, isSelected, isHover, index, danger = false) {
        const isActive = isSelected || isHover;
        const isDanger = danger || label === 'QUIT GAME';
        const fontName = IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace';
        const baseSize = isActive ? 19 : 17;
        const metricKey = scaleX + ':' + fontName;
        if (this._pauseMetricKey !== metricKey) { this._pauseMetricKey = metricKey; this._pauseLabelMetrics = new Map(); }
        const labelKey = baseSize + ':' + bw + ':' + label;
        let labelFontSize = this._pauseLabelMetrics.get(labelKey);
        if (labelFontSize === undefined) {
            ctx.font = 'bold ' + (baseSize * scaleX) + 'px ' + fontName;
            labelFontSize = Math.min(baseSize, baseSize * (bw - 62) * scaleX / Math.max(1, ctx.measureText(label).width));
            this._pauseLabelMetrics.set(labelKey, labelFontSize);
        }
        
        IP2Live.PauseUI.drawButton({
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
            labelFontSize,
            scrambleText: isActive && this.scramble && typeof this.scramble.getText === 'function' ? this.scramble.getText(index, label) : undefined,
            animTick: this.animTick
        });
    }
}
window.IP2LivePauseMenu = IP2LivePauseMenu;

/** One pause skin for the world, puzzles and standalone guided lessons. */
IP2Live.PauseUI = {
    _frameCache: new Map(),
    _buttonCache: new Map(),

    viewport(canvas) {
        const scale = Math.min(canvas.width / 1280, canvas.height / 720);
        return { SW: canvas.width / scale, SH: canvas.height / scale, scaleX: scale, scaleY: scale };
    },

    _surface(width, height) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.ceil(width)); canvas.height = Math.max(1, Math.ceil(height));
            const ctx = canvas.getContext('2d');
            return ctx && ctx.canvas === canvas ? { canvas, ctx } : null;
        } catch (error) { return null; }
    },

    _backdropFor(width, height) {
        // One bounded texture, shared by both pause screens, even on a 4K display.
        const ratio = Math.min(1, 1280 / width, 720 / height);
        const w = Math.round(width * ratio), h = Math.round(height * ratio);
        if (this._backdrop && this._backdrop.canvas.width === w && this._backdrop.canvas.height === h) return this._backdrop;
        const surface = this._surface(w, h);
        if (surface) this._drawBackdropArt(surface.ctx, w, h);
        this._backdrop = surface;
        return surface;
    },

    _drawBackdropArt(ctx, width, height) {
        const s = Math.min(width / 1280, height / 720);
        const sample = (index, salt) => { const n = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453; return n - Math.floor(n); };
        ctx.save();
        const base = ctx.createLinearGradient(0, 0, width, height);
        base.addColorStop(0, '#02050a'); base.addColorStop(0.5, '#08121b'); base.addColorStop(1, '#03060d');
        ctx.fillStyle = base; ctx.fillRect(0, 0, width, height);
        for (const [x, y, color] of [[0.17, 0.43, 'rgba(30,113,127,0.14)'], [0.83, 0.38, 'rgba(96,58,145,0.13)']]) {
            const light = ctx.createRadialGradient(width * x, height * y, 0, width * x, height * y, width * 0.45);
            light.addColorStop(0, color); light.addColorStop(1, 'rgba(2,5,10,0)');
            ctx.fillStyle = light; ctx.fillRect(0, 0, width, height);
        }
        // Recessed, lightly brushed side plates give depth without a busy map.
        for (let side = 0; side < 2; side++) {
            ctx.save();
            if (side) { ctx.translate(width, 0); ctx.scale(-1, 1); }
            ctx.beginPath(); ctx.moveTo(0, height * 0.12); ctx.lineTo(width * 0.20, height * 0.06);
            ctx.lineTo(width * 0.30, height * 0.25); ctx.lineTo(width * 0.23, height * 0.80);
            ctx.lineTo(0, height * 0.95); ctx.closePath();
            const metal = ctx.createLinearGradient(0, 0, width * 0.31, height);
            metal.addColorStop(0, 'rgba(32,49,63,0.20)'); metal.addColorStop(0.45, 'rgba(8,15,24,0.30)');
            metal.addColorStop(1, 'rgba(29,46,60,0.09)');
            ctx.fillStyle = metal; ctx.fill(); ctx.strokeStyle = 'rgba(97,143,164,0.09)'; ctx.lineWidth = s; ctx.stroke();
            ctx.clip();
            for (let y = 0; y < height; y += 6 * s) {
                ctx.fillStyle = 'rgba(137,173,190,0.018)'; ctx.fillRect(0, y, width * 0.32, s * 0.5);
            }
            for (let i = 0; i < 110; i++) {
                ctx.fillStyle = 'rgba(125,170,186,0.055)';
                ctx.fillRect(sample(i, 1) * width * 0.31, sample(i, 2) * height, s, s);
            }
            ctx.restore();
        }
        // Sparse fixed texture; no new randomness or allocations per particle.
        ctx.fillStyle = 'rgba(135,167,187,0.028)';
        for (let i = 0; i < 260; i++) ctx.fillRect(sample(i, 3) * width, sample(i, 4) * height, s, s);
        const vignette = ctx.createRadialGradient(width * 0.5, height * 0.48, height * 0.2, width * 0.5, height * 0.48, Math.max(width, height) * 0.65);
        vignette.addColorStop(0, 'rgba(0,0,0,0)'); vignette.addColorStop(1, 'rgba(0,2,7,0.72)');
        ctx.fillStyle = vignette; ctx.fillRect(0, 0, width, height);
        ctx.restore();
    },

    _prepareParticles() {
        if (this._particles) return;
        const sample = (index, salt) => { const n = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453; return n - Math.floor(n); };
        this._particles = Array.from({ length: 90 }, (_, index) => {
            const layer = Math.floor(index / 30), depth = 0.45 + layer * 0.4;
            return { x: sample(index, 5), y: sample(index, 6), depth,
                speed: (0.10 + sample(index, 7) * 0.22) * depth,
                size: (0.65 + sample(index, 8) * 1.25) * depth,
                alpha: 0.12 + layer * 0.08, chip: index % 30 % 7 === 0, purple: index % 30 % 5 === 0 };
        });
        // Soft sprites replace Canvas filter blur, which can create a screen-sized
        // intermediate bitmap for every particle on some desktop GPUs.
        this._particleAtlas = this._surface(128, 32);
        if (!this._particleAtlas) return;
        const ctx = this._particleAtlas.ctx;
        for (let i = 0; i < 4; i++) {
            const x = i * 32 + 16, color = i % 2 ? '178,143,216' : '111,207,213';
            const glow = ctx.createRadialGradient(x, 16, 0, x, 16, 12);
            glow.addColorStop(0, 'rgba(' + color + ',1)'); glow.addColorStop(0.3, 'rgba(' + color + ',0.65)');
            glow.addColorStop(1, 'rgba(' + color + ',0)'); ctx.fillStyle = glow;
            ctx.fillRect(i * 32, 0, 32, 32);
            if (i >= 2) { ctx.fillStyle = 'rgb(' + color + ')'; ctx.fillRect(x - 6, 15, 12, 2); }
        }
    },

    drawBackdrop(ctx, width, height, tick) {
        const backdrop = this._backdropFor(width, height);
        if (backdrop) ctx.drawImage(backdrop.canvas, 0, 0, width, height);
        else this._drawBackdropArt(ctx, width, height);
        this._prepareParticles();
        const s = Math.min(width / 1280, height / 720);
        ctx.save();
        for (let i = 0; i < this._particles.length; i++) {
            const p = this._particles[i];
            const x = p.x * width + Math.sin(tick * 0.004 + i) * 10 * s * p.depth;
            const y = ((p.y * height - tick * p.speed * s) % height + height) % height;
            const size = p.size * s;
            ctx.globalAlpha = p.alpha * (0.65 + 0.35 * Math.sin(tick * 0.012 + i));
            if (this._particleAtlas) {
                const sprite = (p.chip ? 2 : 0) + (p.purple ? 1 : 0);
                ctx.drawImage(this._particleAtlas.canvas, sprite * 32, 0, 32, 32, x - size * 3, y - size * 3, size * 6, size * 6);
            } else {
                ctx.fillStyle = p.purple ? '#b28fd8' : '#6fcfd5';
                if (p.chip) ctx.fillRect(x, y, size * 2.8, Math.max(s * 0.6, size * 0.6));
                else { ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill(); }
            }
        }
        ctx.restore();
    },

    _drawFrame(skin, ctx, panel, scale) {
        const unit = Math.min(scale, 1.5), padding = 24 * unit;
        const w = panel.w / scale * unit, h = panel.h / scale * unit;
        const key = w + ':' + h + ':' + unit;
        let frame = this._frameCache.get(key);
        if (!frame) {
            frame = this._surface(w + padding * 2, h + padding * 2);
            if (!frame) { skin._drawPauseContainer(ctx, panel.x, panel.y, panel.w, panel.h, scale, scale); return; }
            const tick = skin.animTick; skin.animTick = 0;
            skin._drawPauseContainer(frame.ctx, padding, padding, w, h, unit, unit);
            skin.animTick = tick;
            // World/gameplay panels are reused. Resize never grows an unbounded cache.
            if (this._frameCache.size >= 2) this._frameCache.delete(this._frameCache.keys().next().value);
            this._frameCache.set(key, frame);
        }
        ctx.drawImage(frame.canvas, panel.x - padding * scale / unit, panel.y - padding * scale / unit,
            frame.canvas.width * scale / unit, frame.canvas.height * scale / unit);
    },

    drawButton(options) {
        const { ctx, x, y, w, h, scaleX, scaleY, isActive, isDanger } = options;
        const unit = Math.min(scaleX, 1.5), ratio = unit / scaleX, padding = 32 * unit;
        const key = w * ratio + ':' + h * ratio + ':' + unit + ':' + !!isActive + ':' + !!isDanger;
        let chrome = this._buttonCache.get(key);
        if (!chrome) {
            chrome = this._surface(w * ratio + padding * 2, h * ratio + padding * 2);
            if (!chrome) { IP2Live.UI.drawCyberButton(options); return; }
            IP2Live.UI.drawCyberButton({ ...options, ctx: chrome.ctx, x: padding, y: padding,
                w: w * ratio, h: h * ratio, scaleX: unit, scaleY: scaleY * ratio,
                paintLabel: false, animTick: undefined });
            if (this._buttonCache.size >= 12) this._buttonCache.delete(this._buttonCache.keys().next().value);
            this._buttonCache.set(key, chrome);
        }
        ctx.drawImage(chrome.canvas, x - padding / ratio, y - padding / ratio,
            chrome.canvas.width / ratio, chrome.canvas.height / ratio);
        // Only the small moving scan and label are live; the expensive shadow,
        // border, fill and gradient are all in the reusable button texture.
        IP2Live.UI.drawCyberButton({ ...options, paintChrome: false });
    },

    captureBackdrop(includeWorld = false) {
        const source = Common.Platform.ctx.canvas;
        const ratio = Math.min(1, 1280 / source.width, 720 / source.height);
        const surface = this._surface(source.width * ratio, source.height * ratio);
        if (!surface) return null;
        const renderer = Manager.GL && Manager.GL.renderer;
        if (includeWorld && renderer && renderer.domElement) surface.ctx.drawImage(renderer.domElement, 0, 0, surface.canvas.width, surface.canvas.height);
        surface.ctx.drawImage(source, 0, 0, surface.canvas.width, surface.canvas.height);
        return surface.canvas;
    },

    scheduleWarmup() {
        if (this._warmupScheduled || typeof document === 'undefined') return;
        this._warmupScheduled = true;
        const warm = () => {
            const canvas = Common.Platform.ctx && Common.Platform.ctx.canvas;
            if (!canvas) return;
            this._backdropFor(canvas.width, canvas.height); this._prepareParticles();
            const skin = Object.create(IP2LivePauseMenu.prototype);
            const { SW, SH, scaleX } = this.viewport(canvas);
            for (const count of [3, 6]) {
                skin.menuItems = Array(count).fill('');
                const layout = skin._getLayout(SW, SH);
                // Populate the frame cache offscreen before the first pause click.
                const target = this._surface(1, 1);
                if (target) this._drawFrame(skin, target.ctx, { x: 0, y: 0, w: layout.panelW * scaleX, h: layout.panelH * scaleX }, scaleX);
            }
            const buttons = this._surface(1, 1);
            if (buttons) for (const isActive of [false, true]) for (const isDanger of [false, true]) {
                this.drawButton({ ctx: buttons.ctx, x: 0, y: 0, w: 320 * scaleX, h: 46 * scaleX,
                    scaleX, scaleY: scaleX, isActive, isDanger, paintLabel: false });
            }
            if (IP2Live.Assets.loadPauseFonts) IP2Live.Assets.loadPauseFonts().then(() => {
                const text = this._surface(512, 96);
                if (!text) return;
                text.ctx.font = 'bold 42px Abnes'; text.ctx.fillText('PAUSED', 0, 42);
                text.ctx.font = 'bold 28px Nebula-Regular'; text.ctx.fillText('RESUME SETTINGS EXIT QUEST', 0, 80);
            });
        };
        if (window.requestIdleCallback) window.requestIdleCallback(warm, { timeout: 2000 });
        else if (typeof setTimeout === 'function') setTimeout(warm, 250);
    },

    draw(scene, ctx, progress, headerActions = false) {
        const { width, height } = ctx.canvas;
        const { SW, SH, scaleX, scaleY } = this.viewport(ctx.canvas);
        const skin = scene instanceof IP2LivePauseMenu ? scene
            : (scene._pauseSkin || (scene._pauseSkin = Object.create(IP2LivePauseMenu.prototype)));
        skin.menuItems = scene.menuItems.map(item => typeof item === 'string' ? item : item.title);
        skin.animTick = scene.animTick; skin.selectedIndex = scene.selectedIndex; skin.hoverIndex = scene.hoverIndex;
        const layout = skin._getLayout(SW, SH);
        if (scene._pauseReducedMotion === undefined) scene._pauseReducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        ctx.save();
        this.drawBackdrop(ctx, width, height, scene._pauseReducedMotion ? 0 : scene.animTick || 0);
        // The frozen source is only blended during entrance/exit; no live
        // gameplay update or screen-sized blur runs behind the pause panel.
        if (scene.pauseBackdrop && progress < 1) {
            ctx.globalAlpha = 1 - progress; ctx.drawImage(scene.pauseBackdrop, 0, 0, width, height); ctx.globalAlpha = 1;
        }
        const panel = { x: layout.panelX * scaleX, y: layout.panelY * scaleY, w: layout.panelW * scaleX, h: layout.panelH * scaleY };
        ctx.save();
        if (IP2Live.PopupChrome && typeof IP2Live.PopupChrome.animate === 'function') IP2Live.PopupChrome.animate(ctx, panel, progress);
        else ctx.globalAlpha = progress;
        this._drawFrame(skin, ctx, panel, scaleX);
        skin._drawPausedTitle(ctx, scaleX, scaleY, SW, SH, layout.panelX, layout.panelY, layout.panelW);
        if (headerActions) {
            skin._drawGameplayTestButton(ctx, scaleX, scaleY, SW, SH);
            skin._drawPauseSettingsIcon(ctx, scaleX, scaleY, SW, SH);
        }
        const rects = [];
        for (let i = 0; i < skin.menuItems.length; i++) {
            const y = layout.startY + i * (layout.btnH + layout.btnGap);
            const item = scene.menuItems[i];
            skin._drawButton(ctx, scaleX, scaleY, layout.bx, y, layout.btnW, layout.btnH, skin.menuItems[i],
                i === scene.selectedIndex && !scene.pending, i === scene.hoverIndex, i, !!item.danger);
            rects.push({ x: layout.bx * scaleX, y: y * scaleY, w: layout.btnW * scaleX, h: layout.btnH * scaleY });
        }
        ctx.font = (8 * scaleX) + 'px monospace'; ctx.fillStyle = 'rgba(100,202,204,0.44)';
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        ctx.fillText('[ GAME PAUSED - SYS::STANDBY ]', width / 2, (layout.panelY + layout.panelH - 14) * scaleY);
        ctx.restore(); ctx.restore();
        return rects;
    },
};
IP2Live.PauseUI.scheduleWarmup();

// Intercept ESC in Scene.Map to open the pause menu
inject(Scene.Map, 'onKeyPressed', function (key) {
    if (Data.Keyboards.checkCancelMenu(key)) {
        if (IP2Live.MenuTransition && IP2Live.MenuTransition.active) return;
        Data.Systems.soundConfirmation.playSound();
        let pauseBackdrop = null;
        try {
            pauseBackdrop = IP2Live.PauseUI.captureBackdrop(true);
        } catch (error) {}
        const menu = new IP2LivePauseMenu(pauseBackdrop);
        try {
            Manager.Stack.push(menu);
        } catch (error) {
            menu.close();
            throw error;
        }
        Manager.Stack.requestPaintHUD = true;
    } else {
        this.super(key);
    }
}, false, true, false);

console.log('[IP2Live] pause-menu.js loaded.');

