/**
 * IP2Live â€” Keyboard Bindings Menu Screen
 * @file Plugins/IP2Live_Core/modules/screens/keyboard-menu.js
 * Loaded via fetch + new Function() by code.js â€” all engine globals are
 * injected as function parameters (Common, Core, Data, Graphic, Manager,
 * Scene, Model, Main, THREE, IP2Live).
 */

class IP2LiveKeyboardMenu extends Scene.Base {
    constructor() { super(true); }

    initialize() {
        this.selectedIndex = 0;
        this.hoverIndex = -1;
        this.animTick = 0;
        this.scanlineOffset = 0;
        this.listeningMode = false;

        const kbGraphics = Data.Keyboards.getCommandsGraphics();
        this.kbItems = kbGraphics.map(g => g.kb);

        this.scrollY = 0;
        this.maxVisible = 6;
        this.bgFx = IP2Live.BgFx.create();
        this.scramble = null; // initialised in load() once kbItems count is known
    }

    async load() {
        if (!IP2Live.Assets.bgImage) await IP2Live.Assets.loadAll();
        const cW = Common.Platform.ctx.canvas.width;
        const cH = Common.Platform.ctx.canvas.height;
        this.bgFx.seed(cW, cH);
        // kbItems.length + 2 footer buttons (RESET DEFAULTS, BACK)
        this.scramble = IP2Live.TextScramble.create(this.kbItems.length + 2);
        this.loading = false;
        Manager.Stack.requestPaintHUD = true;
    }

    onKeyPressed(key) {
        if (this.listeningMode) {
            const kb = this.kbItems[this.selectedIndex];
            const newSC = [[key]];
            kb.sc = newSC;

            if (Data.Settings && Data.Settings.updateKeyboard) {
                Data.Settings.updateKeyboard(kb.id, newSC).catch(console.error);
            }

            this.listeningMode = false;
            Data.Systems.soundConfirmation.playSound();
            Manager.Stack.requestPaintHUD = true;
            return;
        }

        if (Data.Keyboards.checkActionMenu(key)) {
            this._confirmSelection();
        } else if (Data.Keyboards.checkCancelMenu(key)) {
            Data.Systems.soundCancel.playSound();
            Manager.Stack.pop();
        }
    }

    onKeyPressedAndRepeat(key) {
        if (this.listeningMode) return true;

        const totalItems = this.kbItems.length + 2;
        const prev = this.selectedIndex;

        if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Up)) {
            this.selectedIndex = (this.selectedIndex - 1 + totalItems) % totalItems;
        } else if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Down)) {
            this.selectedIndex = (this.selectedIndex + 1) % totalItems;
        }

        if (this.selectedIndex !== prev) {
            this.hoverIndex = -1;
            if (this.selectedIndex < this.kbItems.length) {
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
        if (this.listeningMode) return;
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
        if (this.listeningMode) return;
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

        const panelW = 540, panelH = 480;
        const panelX = (SW - panelW) / 2;
        const panelY = (SH - panelH) / 2;

        const listStartY = panelY + 60;
        const itemH = 40;

        for (let i = 0; i < this.maxVisible; i++) {
            const dataIdx = this.scrollY + i;
            if (dataIdx >= this.kbItems.length) break;
            const bx = panelX + 30;
            const by = listStartY + i * (itemH + 5);
            const bw = panelW - 60;
            if (x >= bx * scaleX && x <= (bx + bw) * scaleX &&
                y >= by * scaleY && y <= (by + itemH) * scaleY) {
                return dataIdx;
            }
        }

        const btnW = 200, btnH = 40;
        const btnY = panelY + panelH - 60;

        if (x >= (panelX + 30) * scaleX && x <= (panelX + 30 + btnW) * scaleX &&
            y >= btnY * scaleY && y <= (btnY + btnH) * scaleY) {
            return this.kbItems.length;
        }
        if (x >= (panelX + panelW - 30 - btnW) * scaleX && x <= (panelX + panelW - 30) * scaleX &&
            y >= btnY * scaleY && y <= (btnY + btnH) * scaleY) {
            return this.kbItems.length + 1;
        }

        return -1;
    }

    _confirmSelection() {
        if (this.selectedIndex < this.kbItems.length) {
            Data.Systems.soundConfirmation.playSound();
            this.listeningMode = true;
            Manager.Stack.requestPaintHUD = true;
        } else if (this.selectedIndex === this.kbItems.length) {
            this._resetToDefault();
        } else if (this.selectedIndex === this.kbItems.length + 1) {
            Data.Systems.soundCancel.playSound();
            Manager.Stack.pop();
        }
    }

    _resetToDefault() {
        Data.Systems.soundConfirmation.playSound();
        const root = Common.Platform.ROOT_DIRECTORY;
        fetch(root + 'keyboard.json')
            .then(res => res.json())
            .then(data => {
                if (data && data.list) {
                    for (const def of data.list) {
                        const kb = this.kbItems.find(k => k.id === def.id);
                        if (kb) {
                            kb.sc = def.sc;
                            if (Data.Settings && Data.Settings.updateKeyboard) {
                                Data.Settings.updateKeyboard(kb.id, def.sc).catch(console.error);
                            }
                        }
                    }
                    Manager.Stack.requestPaintHUD = true;
                }
            })
            .catch(e => console.error('Failed to reset keyboards', e));
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

        const panelW = 540, panelH = 480;
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
            title: 'SYS::KEYMAP'
        });

        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowBlur = 0;
        ctx.font = 'bold ' + (24 * scaleX) + 'px ' + (IP2Live.Assets.abnesLoaded ? 'Abnes' : 'Arial Black');
        ctx.fillText('KEY BINDINGS', (panelX + panelW / 2) * scaleX, (panelY + 36) * scaleY);
        ctx.textAlign = 'left';

        const divY = (panelY + 50) * scaleY;
        ctx.strokeStyle = 'rgba(0,255,255,0.25)';
        ctx.lineWidth = 1 * scaleX;
        ctx.beginPath();
        ctx.moveTo((panelX + 20) * scaleX, divY);
        ctx.lineTo((panelX + panelW - 20) * scaleX, divY);
        ctx.stroke();

        const listStartY = panelY + 60;
        const itemH = 40;

        for (let i = 0; i < this.maxVisible; i++) {
            const dataIdx = this.scrollY + i;
            if (dataIdx >= this.kbItems.length) break;
            const kb = this.kbItems[dataIdx];
            const isSel = (this.selectedIndex === dataIdx);
            const itemY = listStartY + i * (itemH + 5);
            this._drawListItem(ctx, scaleX, scaleY, panelX + 30, itemY, panelW - 60, itemH, kb, isSel);
        }

        const btnW = 200, btnH = 40;
        const btnY = panelY + panelH - 60;

        this._drawButton(ctx, scaleX, scaleY, panelX + 30, btnY, btnW, btnH, "RESET DEFAULTS",
            this.selectedIndex === this.kbItems.length, this.kbItems.length);
        this._drawButton(ctx, scaleX, scaleY, panelX + panelW - 30 - btnW, btnY, btnW, btnH, "BACK",
            this.selectedIndex === this.kbItems.length + 1, this.kbItems.length + 1);

        if (this.listeningMode) {
            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            ctx.fillRect(px, py, pw, ph);
            ctx.textAlign = 'center';
            ctx.fillStyle = '#FFE600';
            ctx.shadowBlur = 0;
            ctx.font = 'bold ' + (24 * scaleX) + 'px ' + (IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace');
            ctx.fillText('[ PRESS ANY KEY ]', (panelX + panelW / 2) * scaleX, (panelY + panelH / 2) * scaleY);
            ctx.textAlign = 'left';
        }

        ctx.restore();
    }

    _drawListItem(ctx, scaleX, scaleY, bx, by, bw, bh, kb, isSelected) {
        const x = bx * scaleX, y = by * scaleY, w = bw * scaleX, h = bh * scaleY;
        const accentColor = isSelected ? '#FFE600' : '#00F0FF';
        const sl = 12 * scaleX;

        ctx.beginPath();
        ctx.moveTo(x + sl, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - sl, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        ctx.fillStyle = isSelected ? 'rgba(255,230,0,0.82)' : 'rgba(3,7,20,0.68)';
        ctx.fill();

        ctx.strokeStyle = accentColor;
        ctx.lineWidth = (isSelected ? 2 : 1) * scaleX;
        ctx.shadowBlur = 0;
        ctx.stroke();

        ctx.fillStyle = isSelected ? '#FF003C' : 'rgba(0,240,255,0.82)';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 34 * scaleX, y);
        ctx.lineTo(x + 22 * scaleX, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        ctx.fill();

        const nameStr = typeof kb.name === 'function' ? kb.name() : kb.name;
        ctx.font = (16 * scaleX) + 'px ' + (IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace');
        ctx.fillStyle = isSelected ? '#111111' : '#FFFFFF';
        ctx.fillText(nameStr, (bx + 15) * scaleX, (by + bh * 0.65) * scaleY);

        let scStr = (kb.sc && kb.sc.length > 0)
            ? kb.sc.map(arr => arr.join(' / ')).join(' | ')
            : 'NONE';

        ctx.textAlign = 'right';
        ctx.fillStyle = isSelected ? '#111111' : '#00F0FF';
        ctx.fillText(scStr.toUpperCase(), (bx + bw - 15) * scaleX, (by + bh * 0.65) * scaleY);
        ctx.textAlign = 'left';
    }

    _drawButton(ctx, scaleX, scaleY, bx, by, bw, bh, label, isSelected, index) {
        const isActive = isSelected || this.hoverIndex === index;
        const isDanger = (label === 'RESET DEFAULTS' || label === 'BACK');
        
        IP2Live.UI.drawCyberButton({
            ctx,
            x: bx * scaleX,
            y: by * scaleY,
            w: bw * scaleX,
            h: bh * scaleY,
            scaleX, scaleY,
            label,
            isActive,
            isDanger,
            scrambleText: this.scramble ? this.scramble.getText(index, label) : undefined,
            animTick: this.animTick
        });
    }
}
window.IP2LiveKeyboardMenu = IP2LiveKeyboardMenu;
console.log('[IP2Live] keyboard-menu.js loaded.');

