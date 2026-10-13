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
        this.busy = false;
        this.closed = false;
        this.statusLine = 'Select a control, then press a key. Esc cancels assignment.';
        this.justBoundKey = null;

        const kbGraphics = Data.Keyboards.getCommandsGraphics();
        this.kbItems = kbGraphics.map(g => g.kb);

        this.scrollY = 0;
        this.maxVisible = 6;
        this.bgFx = IP2Live.BgFx.create();
        this.scramble = null; // initialised in load() once kbItems count is known
    }

    async load() {
        if (!IP2Live.Assets.bgImage) await IP2Live.Assets.loadAll();
        if (this.closed) return;
        const cW = Common.Platform.ctx.canvas.width;
        const cH = Common.Platform.ctx.canvas.height;
        this.bgFx.seed(cW, cH);
        // kbItems.length + 2 footer buttons (RESET DEFAULTS, BACK)
        this.scramble = IP2Live.TextScramble.create(this.kbItems.length + 2);
        this.loading = false;
        Manager.Stack.requestPaintHUD = true;
    }

    onKeyPressed(key) {
        if (this.closed) return true;
        const value = String(key?.key ?? key);
        if (!this.listeningMode) this.justBoundKey = null;
        if (this.listeningMode) {
            if (value.toUpperCase() === 'ESCAPE') {
                this.listeningMode = false;
                this.statusLine = 'Assignment cancelled.';
                IP2Live.InputGuard?.reset();
                Data.Systems.soundCancel.playSound();
                Manager.Stack.requestPaintHUD = true;
                return true;
            }
            const kb = this.kbItems[this.selectedIndex];
            const conflict = this._bindingConflict(kb, value);
            if (conflict) {
                this.statusLine = conflict;
                Data.Systems.soundImpossible.playSound();
                Manager.Stack.requestPaintHUD = true;
                return true;
            }
            this.listeningMode = false;
            this.justBoundKey = value.toUpperCase();
            this._applyBindings([{ kb, sc: [[value]] }], 'Binding updated.');
            Data.Systems.soundConfirmation.playSound();
            Manager.Stack.requestPaintHUD = true;
            return true;
        }

        // Escape always provides a way out, even if a saved binding conflicts.
        if (value.toUpperCase() === 'ESCAPE' || Data.Keyboards.checkCancelMenu(key)) {
            this._goBack();
        } else if (!this.busy && Data.Keyboards.checkActionMenu(key)) {
            this._confirmSelection();
        }
        return true;
    }

    onKeyPressedAndRepeat(key) {
        if (this.closed || this.busy || this.listeningMode || String(key).toUpperCase() === this.justBoundKey) return true;

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

    onKeyReleased(key) {
        if (String(key).toUpperCase() === this.justBoundKey) this.justBoundKey = null;
    }

    onMouseMove(x, y) {
        if (this.closed || this.listeningMode || this.busy) return;
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
        if (this.closed) return;
        const idx = this._getButtonAt(x, y);
        if (idx === this.kbItems.length + 1) { this._goBack(); return; }
        if (this.listeningMode || this.busy) return;
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
        if (this.closed) return;
        if (this.selectedIndex === this.kbItems.length + 1) { this._goBack(); return; }
        if (this.busy || this.listeningMode) return;
        if (this.selectedIndex < this.kbItems.length) {
            Data.Systems.soundConfirmation.playSound();
            this.listeningMode = true;
            this.statusLine = 'Press a new key. Esc cancels assignment.';
            Manager.Stack.requestPaintHUD = true;
        } else if (this.selectedIndex === this.kbItems.length) {
            this._resetToDefault();
        }
    }

    _bindingConflict(kb, key) {
        const value = key.toUpperCase(), name = item => typeof item.name === 'function' ? item.name() : item.name;
        if (value === 'F4') return 'F4 is reserved for fullscreen. Choose another key.';
        const families = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10]];
        const menus = [11, 12, 13];
        for (const other of this.kbItems) {
            if (other.id === kb.id || !other.sc?.some(group => group.length === 1 && String(group[0]).toUpperCase() === value)) continue;
            const sharedCancel = [12, 13].includes(kb.id) && [12, 13].includes(other.id);
            if (!sharedCancel && (menus.includes(kb.id) || menus.includes(other.id) || families.some(ids => ids.includes(kb.id) && ids.includes(other.id)))) {
                return 'Already used by ' + name(other) + '. Choose another key.';
            }
        }
        return '';
    }

    async _applyBindings(changes, success) {
        this.busy = true;
        // Keep the engine's keyboard models in place: movement/menu controls
        // hold references to these same models.
        for (const { kb, sc } of changes) kb.sc = sc.map(group => group.slice());
        IP2Live.InputGuard?.bindingsChanged?.();
        this.statusLine = 'Saving controls...';
        Manager.Stack.requestPaintHUD = true;
        const settings = Data.Settings;
        const persist = async () => {
            if (settings?.kb && typeof settings.kb.set === 'function' && typeof settings.save === 'function') {
                for (const { kb, sc } of changes) settings.kb.set(kb.id, sc.map(group => group.slice()));
                await settings.save();
            } else if (settings?.updateKeyboard) {
                // Older engines expose only single-binding writes. Serialize
                // them so an earlier settings snapshot cannot overwrite a later one.
                for (const { kb, sc } of changes) await settings.updateKeyboard(kb.id, sc.map(group => group.slice()));
            }
        };
        const task = (IP2LiveKeyboardMenu._writeQueue || Promise.resolve()).catch(() => {}).then(persist);
        IP2LiveKeyboardMenu._writeQueue = task;
        try {
            await task;
            if (!this.closed) this.statusLine = success;
        } catch (error) {
            console.warn('[IP2Live] Could not save controls:', error);
            if (!this.closed) this.statusLine = 'Controls work for this session. Could not save settings; try again.';
        } finally {
            if (IP2LiveKeyboardMenu._writeQueue === task) IP2LiveKeyboardMenu._writeQueue = null;
            this.busy = false;
            if (!this.closed) Manager.Stack.requestPaintHUD = true;
        }
    }

    async _resetToDefault() {
        if (this.closed || this.busy || this.listeningMode) return false;
        this.busy = true;
        this.statusLine = 'Restoring default controls...';
        Manager.Stack.requestPaintHUD = true;
        Data.Systems.soundConfirmation.playSound();
        try {
            const path = Common.Paths?.FILE_KEYBOARD || Common.Platform.ROOT_DIRECTORY + 'keyboard.json';
            let data;
            if (Common.Platform.parseFileJSON) data = await Common.Platform.parseFileJSON(path);
            else {
                const response = await fetch(path, { cache: 'no-store' });
                if (!response.ok) throw new Error('Keyboard defaults unavailable');
                data = await response.json();
            }
            if (this.closed) return false;
            const defaults = new Map((data?.list || []).map(def => [def.id, def.sc]));
            const changes = this.kbItems.map(kb => ({ kb, sc: defaults.get(kb.id) }));
            if (!changes.length || changes.some(({ sc }) => !Array.isArray(sc) || !sc.length || sc.some(group =>
                !Array.isArray(group) || !group.length || group.some(key => typeof key !== 'string' || !key.length)))) {
                throw new Error('Incomplete keyboard defaults');
            }
            await this._applyBindings(changes, 'Default controls restored.');
            return true;
        } catch (error) {
            console.warn('[IP2Live] Failed to reset controls:', error);
            if (!this.closed) this.statusLine = 'Could not restore defaults. Your controls are unchanged; try again.';
            return false;
        } finally {
            this.busy = false;
            if (!this.closed) Manager.Stack.requestPaintHUD = true;
        }
    }

    _goBack() {
        if (this.closed || (Manager.Stack.top && Manager.Stack.top !== this)) return;
        Data.Systems.soundCancel.playSound();
        Manager.Stack.pop();
    }

    close() {
        this.closed = true;
        this.listeningMode = false;
        this.justBoundKey = null;
        IP2Live.InputGuard?.reset();
        this.backdrop = null;
        if (super.close) super.close();
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
        ctx.font='11px Oxanium-Medium, sans-serif'; ctx.textAlign='center'; ctx.fillStyle='#a9bdc5';
        ctx.fillText(this.statusLine,l.x+l.w/2,l.y+l.h-64,l.w-56);
        ['RESET DEFAULTS','BACK'].forEach((label,i)=>chrome.button(ctx,l.cells[this.kbItems.length+i],1,1,label,'Oxanium-Medium',this.selectedIndex===this.kbItems.length+i?1:0,this.animTick,i===1));
        ctx.restore();
    }
}
window.IP2LiveKeyboardMenu = IP2LiveKeyboardMenu;
