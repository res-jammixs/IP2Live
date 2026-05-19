/**
 * IP2Live â€” Load Game Menu Screen
 * @file Plugins/IP2Live_Core/modules/screens/load-game.js
 * Loaded via fetch + new Function() by code.js â€” all engine globals are
 * injected as function parameters (Common, Core, Data, Graphic, Manager,
 * Scene, Model, Main, THREE, IP2Live).
 */

class IP2LiveLoadGameMenu extends Scene.Base {
    constructor() { super(true); }

    initialize() {
        this.selectedIndex = 0;
        this.hoverIndex = -1;
        this.animTick = 0;
        this.scanlineOffset = 0;
        this.gamesData = [];
        this.scrollY = 0;
        this.maxVisible = 4;
        this.bgFx = IP2Live.BgFx.create();
        this.scramble = null; // initialised in load() once slot count is known
    }

    async load() {
        if (!IP2Live.Assets.bgImage) await IP2Live.Assets.loadAll();

        const currentGame = Core.Game.current;
        for (let i = 1; i <= Data.Systems.saveSlots; i++) {
            this.gamesData.push(null);
            const newGame = new Core.Game(i);
            Core.Game.current = newGame;
            await newGame.load();
            this.gamesData[i - 1] = newGame;
        }
        Core.Game.current = currentGame;

        const cW = Common.Platform.ctx.canvas.width;
        const cH = Common.Platform.ctx.canvas.height;
        this.bgFx.seed(cW, cH);
        this.scramble = IP2Live.TextScramble.create(this.gamesData.length + 1); // slots + BACK

        this.loading = false;
        Manager.Stack.requestPaintHUD = true;
    }

    onKeyPressed(key) {
        if (Data.Keyboards.checkActionMenu(key)) {
            this._confirmSelection();
        } else if (Data.Keyboards.checkCancelMenu(key)) {
            Data.Systems.soundCancel.playSound();
            Manager.Stack.pop();
        }
    }

    onKeyPressedAndRepeat(key) {
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

        const panelW = 600, panelH = 500;
        const panelX = (SW - panelW) / 2;
        const panelY = (SH - panelH) / 2;

        const listStartY = panelY + 60;
        const itemH = 64;

        for (let i = 0; i < this.maxVisible; i++) {
            const dataIdx = this.scrollY + i;
            if (dataIdx >= this.gamesData.length) break;
            const bx = panelX + 30;
            const by = listStartY + i * (itemH + 10);
            const bw = panelW - 60;
            if (x >= bx * scaleX && x <= (bx + bw) * scaleX &&
                y >= by * scaleY && y <= (by + itemH) * scaleY) {
                return dataIdx;
            }
        }

        const btnW = 160, btnH = 40;
        const btnY = panelY + panelH - 60;
        const btnX = panelX + panelW - 30 - btnW;

        if (x >= btnX * scaleX && x <= (btnX + btnW) * scaleX &&
            y >= btnY * scaleY && y <= (btnY + btnH) * scaleY) {
            return this.gamesData.length;
        }

        return -1;
    }

    async _confirmSelection() {
        if (this.selectedIndex < this.gamesData.length) {
            const game = this.gamesData[this.selectedIndex];
            if (game.isEmpty) {
                Data.Systems.soundImpossible.playSound();
            } else {
                Data.Systems.soundConfirmation.playSound();
                const slotLabel = 'S' + String(this.selectedIndex + 1).padStart(2, '0');

                if (IP2Live.LoadingScreen && typeof IP2Live.LoadingScreen.show === 'function') {
                    IP2Live.LoadingScreen.show({
                        mode: 'replace',
                        status: 'Loading Next Level',
                        detail: 'Restoring save slot ' + slotLabel,
                        onComplete: async function () {
                            Core.Game.current = game;
                            if (Data.TitlescreenGameover.isTitleBackgroundVideo) Manager.Videos.stop();
                            await Core.Game.current.loadPositions();
                            Core.Game.current.hero.initializeProperties();

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
                    if (Data.TitlescreenGameover.isTitleBackgroundVideo) Manager.Videos.stop();
                    await Core.Game.current.loadPositions();
                    Core.Game.current.hero.initializeProperties();

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

        ctx.fillStyle = 'rgba(0,0,10,0.78)';
        ctx.fillRect(0, 0, cW, cH);

        ctx.globalAlpha = 0.05;
        ctx.fillStyle = '#000';
        for (let ly = this.scanlineOffset * scaleY; ly < cH; ly += 4 * scaleY) {
            ctx.fillRect(0, ly, cW, 1.5 * scaleY);
        }
        ctx.globalAlpha = 1;

        const panelW = 600, panelH = 500;
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
            title: 'SYS::SAVE_ARCHIVE'
        });

        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowBlur = 0;
        ctx.font = 'bold ' + (24 * scaleX) + 'px ' + (IP2Live.Assets.abnesLoaded ? 'Abnes' : 'Arial Black');
        ctx.fillText('LOAD GAME', (panelX + panelW / 2) * scaleX, (panelY + 36) * scaleY);
        ctx.textAlign = 'left';

        const divY = (panelY + 50) * scaleY;
        ctx.strokeStyle = 'rgba(0,255,255,0.25)';
        ctx.lineWidth = 1 * scaleX;
        ctx.beginPath();
        ctx.moveTo((panelX + 20) * scaleX, divY);
        ctx.lineTo((panelX + panelW - 20) * scaleX, divY);
        ctx.stroke();

        const listStartY = panelY + 60;
        const itemH = 64;

        for (let i = 0; i < this.maxVisible; i++) {
            const dataIdx = this.scrollY + i;
            if (dataIdx >= this.gamesData.length) break;
            const game = this.gamesData[dataIdx];
            const isSel = (this.selectedIndex === dataIdx);
            const itemY = listStartY + i * (itemH + 10);
            this._drawSlot(ctx, scaleX, scaleY, panelX + 30, itemY, panelW - 60, itemH, game, isSel, dataIdx + 1);
        }

        const btnW = 160, btnH = 40;
        const btnY = panelY + panelH - 60;
        this._drawButton(ctx, scaleX, scaleY,
            panelX + panelW - 30 - btnW, btnY, btnW, btnH, 'BACK',
            this.selectedIndex === this.gamesData.length, this.gamesData.length);

        ctx.restore();
    }

    _getPlayTimeStr(playTime) {
        if (!playTime) return '00:00:00';
        const totalSeconds = Math.floor(playTime / 1000);
        const h = Math.floor(totalSeconds / 3600);
        const m = Math.floor((totalSeconds % 3600) / 60);
        const s = totalSeconds % 60;
        return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
    }

    _drawSlot(ctx, scaleX, scaleY, bx, by, bw, bh, game, isSelected, slotNumber) {
        const x = bx * scaleX, y = by * scaleY, w = bw * scaleX, h = bh * scaleY;
        const accentColor = isSelected ? '#FFE600' : '#00F0FF';
        const sl = 16 * scaleX;

        ctx.beginPath();
        ctx.moveTo(x + sl, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - sl, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        ctx.fillStyle = isSelected ? 'rgba(255,230,0,0.82)' : 'rgba(3,7,20,0.72)';
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

        const fName = IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace';
        const empty = !game || game.isEmpty;

        if (empty) {
            ctx.font = 'bold ' + Math.round(17 * scaleX) + 'px ' + fName;
            ctx.fillStyle = isSelected ? '#111111' : 'rgba(218,238,255,0.52)';
            ctx.fillText('NO DATA', x + 70 * scaleX, y + h * 0.58);
        } else {
            ctx.font = 'bold ' + Math.round(17 * scaleX) + 'px ' + fName;
            ctx.fillStyle = isSelected ? '#111111' : '#FFFFFF';
            let heroName = 'UNKNOWN';
            if (game.hero && game.hero.character) heroName = game.hero.character.name;
            else if (game.hero && game.hero.name) heroName = game.hero.name;
            ctx.fillText(heroName, x + 70 * scaleX, y + 25 * scaleY);

            ctx.font = Math.round(11 * scaleX) + 'px monospace';
            ctx.fillStyle = isSelected ? 'rgba(20,20,20,0.80)' : 'rgba(0,240,255,0.72)';
            ctx.fillText(`TIME: ${this._getPlayTimeStr(game.playTime)}`, x + 70 * scaleX, y + 49 * scaleY);
            ctx.textAlign = 'right';
            ctx.fillText(`MAP:${String(game.currentMapID || 1).padStart(4, '0')}`, x + w - 18 * scaleX, y + 49 * scaleY);
            ctx.textAlign = 'left';
        }
    }

    _drawButton(ctx, scaleX, scaleY, bx, by, bw, bh, label, isSelected, index) {
        const isActive = isSelected || this.hoverIndex === index;
        
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
            scrambleText: this.scramble ? this.scramble.getText(index, label) : undefined,
            animTick: this.animTick
        });
    }
}
window.IP2LiveLoadGameMenu = IP2LiveLoadGameMenu;
console.log('[IP2Live] load-game.js loaded.');
