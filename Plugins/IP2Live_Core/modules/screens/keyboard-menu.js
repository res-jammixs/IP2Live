/**
 * IP2Live â€” Keyboard Bindings Menu Screen
 * @file Plugins/IP2Live_Core/modules/screens/keyboard-menu.js
 * Loaded via fetch + new Function() by code.js â€” all engine globals are
 * injected as function parameters (Common, Core, Data, Graphic, Manager,
 * Scene, Model, Main, THREE, IP2Live).
 */

class IP2LiveKeyboardMenu extends Scene.Base {
    constructor() { super(true); this.backdrop = IP2Live.PopupChrome.capture(); }

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

        const rows = Math.ceil(this.kbItems.length / 2);
        if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Left)) {
            this.selectedIndex = this.selectedIndex >= this.kbItems.length ? this.kbItems.length : Math.max(0, this.selectedIndex - rows);
        } else if (Data.Keyboards.isKeyEqual(key, Data.Keyboards.menuControls.Right)) {
            this.selectedIndex = this.selectedIndex >= this.kbItems.length ? this.kbItems.length + 1 : Math.min(this.kbItems.length - 1, this.selectedIndex + rows);
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

    _layout() {
        const c = Common.Platform.ctx.canvas, scale = Math.min(c.width / 1280, c.height / 720);
        const rows = Math.ceil(this.kbItems.length / 2), w = 880, h = 140 + rows * 46;
        const x = (c.width / scale - w) / 2, y = (c.height / scale - h) / 2;
        const cells = this.kbItems.map((kb, i) => ({ x: x + 28 + Math.floor(i / rows) * 420, y: y + 74 + (i % rows) * 46, w: 404, h: 38 }));
        cells.push({x:x+28,y:y+h-54,w:200,h:38}, {x:x+w-228,y:y+h-54,w:200,h:38});
        return {scale,x,y,w,h,cells,rows};
    }
    _getButtonAt(x, y) {
        const l = this._layout(); x /= l.scale; y /= l.scale;
        return l.cells.findIndex(r => x >= r.x && x <= r.x+r.w && y >= r.y && y <= r.y+r.h);
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
        const ctx = Common.Platform.ctx, l = this._layout(), chrome = IP2Live.PopupChrome;
        ctx.save(); chrome.backdrop(ctx, this.backdrop,this.animTick*0.085); ctx.scale(l.scale,l.scale);
        chrome.animate(ctx,l,this.animTick*0.085);
        chrome.panel(ctx,l.x,l.y,l.w,l.h,1,1,false,this.animTick); chrome.heading(ctx,'KEY BINDINGS',l.x,l.y,l.w);
        this.kbItems.forEach((kb,i) => {
            const r=l.cells[i], active=i===this.selectedIndex;
            chrome.row(ctx,r.x,r.y,r.w,r.h,active);
            ctx.font='14px Oxanium-Medium, sans-serif'; ctx.fillStyle='#dde9ec'; ctx.textAlign='left';
            const name=typeof kb.name==='function'?kb.name():kb.name;
            ctx.fillText(name,r.x+14,r.y+24,250);
            const keys={ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right',Escape:'Esc',' ':'Space'};
            const value=this.listeningMode && active ? 'Press a key...' : [...new Set((kb.sc||[]).map(group=>group.map(k=>keys[k]||String(k).toUpperCase()).join(' + ')))].join(' / ');
            ctx.textAlign='right'; ctx.fillStyle=active?'#e5d779':'#80b8c1'; ctx.fillText(value||'None',r.x+r.w-14,r.y+24,125);
        });
        ['RESET DEFAULTS','BACK'].forEach((label,i)=>chrome.button(ctx,l.cells[this.kbItems.length+i],1,1,label,'Oxanium-Medium',this.selectedIndex===this.kbItems.length+i?1:0,this.animTick,i===1));
        ctx.restore();
    }
}
window.IP2LiveKeyboardMenu = IP2LiveKeyboardMenu;
