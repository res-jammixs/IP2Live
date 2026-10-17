/** Combined gameplay toolkit. Final-puzzle quest wiring is intentionally deferred. */
(function () {
    const { definitions, Window: ToolWindow, inside } = IP2Live.WindowedGameplay;
    const art = IP2Live.CombinedArtwork;
    const COLORS = ['#64e5e9', '#e8bd77', '#aa9bff', '#78e9af', '#ff9d6c', '#ff7e9c', '#86baff', '#68e1cc', '#e9c48e', '#64e5e9', '#aa9bff'];
    const font = 'Oxanium-Medium, sans-serif';
    const paintText = (ctx, text, x, y, size, color, align = 'left', width) => {
        ctx.font = '600 ' + size + 'px ' + font;
        ctx.fillStyle = color;
        ctx.textAlign = align;
        ctx.textBaseline = 'middle';
        if (width === undefined) ctx.fillText(text, x, y);
        else ctx.fillText(text, x, y, width);
    };
    function badge(ctx, count, x, y, scale = 1) {
        if (!count) return;
        ctx.beginPath(); ctx.arc(x, y, 11 * scale, 0, Math.PI * 2);
        ctx.fillStyle = '#ff5678'; ctx.fill();
        ctx.strokeStyle = '#111b28'; ctx.lineWidth = 2 * scale; ctx.stroke();
        paintText(ctx, count > 99 ? '99+' : String(count), x, y + scale, 10 * scale, '#fff', 'center');
    }
    function icon(ctx, kind, x, y, size, color) {
        ctx.save(); ctx.translate(x, y); ctx.scale(size / 40, size / 40);
        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.7;
        if (kind === 'toolkit') {
            art.toolbox(ctx, 0, 0, 50);
        } else if (kind === 'wires' || kind === 'patch') {
            for (let i = 0; i < 3; i++) {
                const yy = -12 + 12 * i;
                ctx.strokeRect(-18, yy - 3, 6, 6); ctx.strokeRect(12, yy - 3, 6, 6);
                ctx.beginPath(); ctx.moveTo(-12, yy); ctx.bezierCurveTo(0, yy, 0, -yy, 12, -yy); ctx.stroke();
            }
        } else if (kind === 'binary' || kind === 'matrix') {
            for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) {
                const xx = -18 + col * 10, yy = -13 + row * 11;
                if ((row + col) % 3) ctx.strokeRect(xx, yy, 6, 6); else ctx.fillRect(xx, yy, 6, 6);
            }
        } else if (kind === 'reactor') {
            ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(3, -13); ctx.lineTo(-7, 3); ctx.lineTo(1, 3); ctx.lineTo(-2, 14); ctx.lineTo(9, -3); ctx.lineTo(1, -3); ctx.closePath(); ctx.fill();
        } else if (kind === 'quarantine' || kind === 'vlsm') {
            ctx.strokeRect(-17, -16, 34, 32); ctx.beginPath();
            ctx.moveTo(-17, -5); ctx.lineTo(17, -5); ctx.moveTo(-3, -5); ctx.lineTo(-3, 16); ctx.moveTo(-3, 5); ctx.lineTo(17, 5); ctx.stroke();
        } else {
            ctx.strokeRect(-6, -6, 12, 12);
            for (const [xx, yy] of [[-15, -14], [15, -14], [0, 16]]) {
                ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(xx, yy); ctx.stroke(); ctx.fillRect(xx - 3, yy - 3, 6, 6);
            }
        }
        ctx.restore();
    }

    class CombinedDesktop extends Scene.Base {
        constructor(session) {
            super(false);
            this.session = session;
            this.windows = session.windows;
            this.gridOpen = true;
            this.gridOpenedAt = Date.now();
            this.motionPreference = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
            this.selectedIndex = 0;
            this.heldKeys = new Set();
            this.drag = null;
            this.focused = null;
            this.pointer = { x: -1, y: -1 };
            this.background = this.captureBackdrop();
            this.loading = false;
        }
        captureBackdrop() {
            let source = IP2Live.PauseUI && IP2Live.PauseUI.captureBackdrop ? IP2Live.PauseUI.captureBackdrop(true) : null;
            if (!source) {
                const hud = Common.Platform.ctx.canvas, frame = document.createElement('canvas');
                const ratio = Math.min(1, 1280 / hud.width, 720 / hud.height);
                frame.width = Math.round(hud.width * ratio); frame.height = Math.round(hud.height * ratio);
                const ctx = frame.getContext('2d'), renderer = Manager.GL && Manager.GL.renderer;
                if (renderer && renderer.domElement) ctx.drawImage(renderer.domElement, 0, 0, frame.width, frame.height);
                ctx.drawImage(hud, 0, 0, frame.width, frame.height); source = frame;
            }
            // Soften the frozen world once per opening, never during HUD redraws.
            const canvas = document.createElement('canvas');
            canvas.width = source.width; canvas.height = source.height;
            const ctx = canvas.getContext('2d');
            ctx.filter = 'blur(1.2px)';
            ctx.drawImage(source, -3, -3, canvas.width + 6, canvas.height + 6);
            ctx.filter = 'none';
            return canvas;
        }
        gridProgress() {
            if (this.motionPreference && this.motionPreference.matches) return 1;
            const t = Math.max(0, Math.min(1, (Date.now() - this.gridOpenedAt) / 240));
            return 1 - Math.pow(1 - t, 3);
        }
        async load() { this.loading = false; }
        draw3D() { if (Manager.GL && Manager.GL.renderer) Manager.GL.renderer.clear(); }
        update() {
            if (!service.isEnabled(this.session.mapId) || Core.Game.current !== this.session.game || service.mapId() !== this.session.mapId) { this.dismiss(); return; }
            service.tick();
            Manager.Stack.requestPaintHUD = true;
        }
        focus(win) {
            service.cancelAnimation(win);
            if (this.focused !== win && this.focused) this.focused.releaseInput();
            this.focused = win;
            win.minimized = false;
            this.windows.splice(this.windows.indexOf(win), 1); this.windows.push(win);
            this.gridOpen = false;
            this.layout();
        }
        openTool(index, options) {
            const definition = definitions[index];
            if (!definition) return false;
            let win = this.windows.find(item => item.definition.id === definition.id && !item.disposed);
            if (!win) {
                win = new ToolWindow(definition, this, options);
                this.windows.push(win);
                win.load().then(() => service.requestCheckpoint('combined_tool_opened'));
            }
            win.desktop = this;
            this.focus(win);
            return win;
        }
        minimize(win) {
            if (win.minimized || win.disposed) return;
            service.animateWindow(win, 'minimize');
            win.releaseInput(); win.minimized = true;
            if (this.focused === win) this.focused = this.windows.slice().reverse().find(item => !item.minimized && !item.disposed) || null;
            this.drag = null; this.gridOpen = false;
            service.requestCheckpoint('combined_tool_minimized');
            if (!this.focused) this.returnToWorld();
        }
        remove(win) {
            if (win.disposed) return;
            service.animateWindow(win, 'close');
            win.dispose();
            const index = this.windows.indexOf(win);
            if (index >= 0) this.windows.splice(index, 1);
            if (this.focused === win) this.focused = this.windows.slice().reverse().find(item => !item.minimized && !item.disposed) || null;
            this.drag = null;
            service.requestCheckpoint('combined_tool_closed');
            if (!this.focused && !this.gridOpen) this.returnToWorld();
        }
        onResult(win, status, result) {
            // Puzzle callbacks execute with the campaign detached. Use the owning
            // session directly rather than resolving a session from that context.
            if (status === 'solved') {
                const id = win.definition.id;
                this.session.pendingCounts[id] = Math.max(0, (this.session.pendingCounts[id] || 0) - 1);
            }
            this.session.results.push({ gameplayId: win.definition.id, status, result });
            service.requestCheckpoint('combined_tool_' + status);
        }
        toggleGrid() {
            if (this.focused) this.focused.releaseInput();
            this.drag = null;
            this.gridOpen = !this.gridOpen;
            if (this.gridOpen) this.gridOpenedAt = Date.now();
        }
        dismiss(animate = false) {
            if (Manager.Stack.top === this) {
                if (animate && this.gridOpen) service.animateGrid(this);
                Manager.Stack.pop();
            }
        }
        returnToWorld() {
            // Native Cancel callbacks run inside the window's local stack bridge.
            // Leave that bridge before popping the actual Combined scene.
            if (Core.Game.current !== this.session.game) {
                Promise.resolve().then(() => { if (Core.Game.current === this.session.game) this.returnToWorld(); });
                return;
            }
            if (Manager.Stack.top === this) { this.keepTools = true; this.dismiss(); }
        }
        close() {
            for (const win of this.windows.slice()) {
                win.releaseInput();
                if (this.keepTools) win.minimized = true;
                else win.dispose();
            }
            if (!this.keepTools) this.windows.length = 0;
            this.keepTools = false;
            this.focused = null;
            this.heldKeys.clear(); this.drag = null;
            if (service.desktop === this) service.desktop = null;
            service.requestCheckpoint('combined_toolkit_closed');
            if (IP2Live.GameManager && IP2Live.GameManager._ensureQuestMinimap) IP2Live.GameManager._ensureQuestMinimap();
            if (IP2Live.InputGuard && IP2Live.InputGuard.reset) IP2Live.InputGuard.reset();
        }
        layout() {
            const canvas = Common.Platform.ctx.canvas, width = canvas.width, height = canvas.height;
            const scale = Math.min(width / 1280, height / 720);
            this.scale = scale;
            this.toolRect = service.toolRect(Common.Platform.ctx);
            const dock = service.dockLayout(Common.Platform.ctx);
            const bodyW = Math.min(800 * scale, width - 32 * scale, (height - dock.h - 94 * scale) * 16 / 9);
            const titleH = 34 * scale, bodyH = bodyW * 9 / 16;
            for (let i = 0; i < this.windows.length; i++) {
                const win = this.windows[i];
                if (win.x === null) { win.x = (width - bodyW) / 2 + (i % 4) * 18 * scale; win.y = (height - dock.h - bodyH - titleH) / 2 + (i % 4) * 16 * scale; }
                if (win.viewportWidth && (win.viewportWidth !== width || win.viewportHeight !== height)) { win.x *= width / win.viewportWidth; win.y *= height / win.viewportHeight; }
                win.viewportWidth = width; win.viewportHeight = height;
                win.x = Math.max(8 * scale, Math.min(width - bodyW - 8 * scale, win.x));
                win.y = Math.max(8 * scale, Math.min(height - dock.h - bodyH - titleH - 22 * scale, win.y));
                win.bounds = { x: win.x, y: win.y, w: bodyW, h: bodyH + titleH,
                    title: { x: win.x, y: win.y, w: bodyW, h: titleH },
                    body: { x: win.x, y: win.y + titleH, w: bodyW, h: bodyH },
                    minimize: { x: win.x + bodyW - 70 * scale, y: win.y, w: 34 * scale, h: titleH },
                    close: { x: win.x + bodyW - 36 * scale, y: win.y, w: 36 * scale, h: titleH } };
            }
            const gs = this.gridScale = Math.min(scale, (height - dock.h - 38 * scale) / 566);
            const w = 1000 * gs, h = 566 * gs;
            this.grid = { x: (width - w) / 2, y: (height - dock.h - h) / 2 - 6 * scale, w, h };
            this.gridClose = { x: this.grid.x + w - 48 * gs, y: this.grid.y + 12 * gs, w: 32 * gs, h: 32 * gs };
            this.tiles = definitions.map((entry, index) => ({ index,
                x: this.grid.x + (24 + index % 4 * 242) * gs,
                y: this.grid.y + (116 + Math.floor(index / 4) * 130) * gs,
                w: 226 * gs, h: 114 * gs }));
        }
        drawHUD() {
            const ctx = Common.Platform.ctx, canvas = ctx.canvas;
            this.layout();
            ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.fillStyle = '#040a14'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            if (this.background) ctx.drawImage(this.background, 0, 0, canvas.width, canvas.height);
            ctx.fillStyle = 'rgba(3,9,20,0.14)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            for (const win of this.windows) if (!win.minimized) this.drawWindow(ctx, win);
            service.drawToolButton(ctx, this.toolRect, this.gridOpen);
            if (this.gridOpen) this.drawGrid(ctx);
            service.drawDock(ctx);
            service.drawAnimations(ctx);
            if (IP2Live.StoryAutosave) IP2Live.StoryAutosave.drawStatus(ctx);
            if (!this.windows.length) paintText(ctx, 'COMBINED  /  CHOOSE A TOOL', canvas.width / 2, canvas.height - 18 * this.scale, 11 * this.scale, '#aabcca', 'center');
            ctx.restore();
        }
        drawWindow(ctx, win) {
            const r = win.bounds, s = this.scale, active = win === this.focused;
            ctx.save(); ctx.shadowColor = '#000'; ctx.shadowBlur = 24 * s;
            art.panel(ctx, r, active ? '#68e3e6' : '#35515e', active, s); ctx.shadowBlur = 0;
            art.polygon(ctx, [[r.x + 12 * s, r.y + 4 * s], [r.x + r.w - 13 * s, r.y + 4 * s], [r.x + r.w - 4 * s, r.y + 13 * s], [r.x + r.w - 4 * s, r.y + r.title.h], [r.x + 4 * s, r.y + r.title.h], [r.x + 4 * s, r.y + 12 * s]], art.gradient(ctx, r.x, r.y, r.w, r.title.h, ['#254858', '#122c3b', '#102130']));
            art.emblem(ctx, win.definition.icon, r.x + 19 * s, r.y + 18 * s, 24 * s, '#75e5e5', icon);
            paintText(ctx, win.definition.name + '  /  WINDOWED VERSION', r.x + 38 * s, r.y + 18 * s, 12 * s, '#dceef3', 'left', r.w - 130 * s);
            paintText(ctx, '−', r.minimize.x + r.minimize.w / 2, r.y + 18 * s, 22 * s, '#91abb9', 'center');
            paintText(ctx, '×', r.close.x + r.close.w / 2, r.y + 18 * s, 22 * s, '#ff879d', 'center');
            if (win.screen && win.status !== 'loading') ctx.drawImage(win.canvas, r.body.x, r.body.y, r.body.w, r.body.h);
            if (win.status !== 'ready') {
                ctx.fillStyle = 'rgba(3,10,22,0.88)'; ctx.fillRect(r.body.x, r.body.y, r.body.w, r.body.h);
                const label = { loading: 'CONNECTING TOOL…', solved: 'TOOL SOLVED', failed: 'TRY THIS TOOL AGAIN', error: 'TOOL COULD NOT OPEN' }[win.status];
                paintText(ctx, label, r.x + r.w / 2, r.body.y + r.body.h / 2 - 20 * s, 24 * s, win.status === 'solved' ? '#80ecbc' : '#e6c58d', 'center');
                if (win.status !== 'loading') paintText(ctx, 'CLICK TO OPEN A FRESH INSTANCE', r.x + r.w / 2, r.body.y + r.body.h / 2 + 22 * s, 13 * s, '#a9c0cf', 'center');
            }
            ctx.restore();
        }
        drawGrid(ctx) {
            const r = this.grid, s = this.gridScale;
            const progress = this.gridProgress();
            ctx.save(); ctx.globalAlpha *= progress;
            ctx.fillStyle = 'rgba(2,7,15,0.68)'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            const zoom = 0.96 + 0.04 * progress;
            ctx.translate(r.x + r.w / 2, r.y + r.h / 2 + (1 - progress) * 16 * s);
            ctx.scale(zoom, zoom); ctx.translate(-r.x - r.w / 2, -r.y - r.h / 2);
            ctx.save(); ctx.shadowBlur = 35 * s; ctx.shadowColor = '#000';
            art.panel(ctx, r, '#64e7ed', true, s); ctx.shadowBlur = 0;
            art.polygon(ctx, [[r.x + 13 * s, r.y + 9 * s], [r.x + 385 * s, r.y + 9 * s], [r.x + 365 * s, r.y + 77 * s], [r.x + 13 * s, r.y + 77 * s]], art.gradient(ctx, r.x, r.y, 360 * s, 70 * s, ['#77172e', '#250f23', '#101d2b']));
            art.polygon(ctx, [[r.x + 383 * s, r.y + 9 * s], [r.x + r.w - 50 * s, r.y + 9 * s], [r.x + r.w - 70 * s, r.y + 23 * s], [r.x + 379 * s, r.y + 23 * s]], '#233b49');
            art.polygon(ctx, [[r.x + 16 * s, r.y + 79 * s], [r.x + 363 * s, r.y + 79 * s], [r.x + 356 * s, r.y + 83 * s], [r.x + 16 * s, r.y + 83 * s]], '#f52359');
            art.toolbox(ctx, r.x + 53 * s, r.y + 39 * s, 72 * s);
            paintText(ctx, 'COMBINED', r.x + 101 * s, r.y + 32 * s, 25 * s, '#effcff');
            paintText(ctx, 'FIELD EQUIPMENT  //  TOOL ACCESS', r.x + 101 * s, r.y + 57 * s, 10 * s, '#86e4e8');
            paintText(ctx, 'Choose a tool. Minimize to the bottom tabs. Timers stay live.', r.x + 24 * s, r.y + 99 * s, 12 * s, '#b1c9d5');
            paintText(ctx, '×', this.gridClose.x + this.gridClose.w / 2, this.gridClose.y + this.gridClose.h / 2, 25 * s, '#afc6d2', 'center');
            for (const tile of this.tiles) {
                const entry = definitions[tile.index], accent = COLORS[tile.index], hovered = inside(this.pointer.x, this.pointer.y, tile), selected = tile.index === this.selectedIndex;
                const win = this.windows.find(w => w.definition.id === entry.id);
                art.panel(ctx, tile, accent, hovered || selected, s);
                art.emblem(ctx, entry.icon, tile.x + 35 * s, tile.y + 33 * s, 45 * s, accent, icon);
                art.polygon(ctx, [[tile.x + 62 * s, tile.y + 16 * s], [tile.x + 136 * s, tile.y + 16 * s], [tile.x + 131 * s, tile.y + 35 * s], [tile.x + 58 * s, tile.y + 35 * s]], '#070e18');
                paintText(ctx, 'TOOL ' + entry.number, tile.x + 67 * s, tile.y + 26 * s, 10 * s, accent);
                paintText(ctx, entry.name, tile.x + 15 * s, tile.y + 71 * s, 13 * s, '#e3edf5', 'left', tile.w - 30 * s);
                paintText(ctx, win ? (win.status === 'solved' ? 'SOLVED  /  OPEN' : win.minimized ? 'MINIMIZED  //  ' + win.timerLabel() : 'OPEN  //  ' + win.timerLabel()) : 'CONNECT TO TOOL', tile.x + 15 * s, tile.y + 94 * s, 10 * s, '#8da9b9');
                badge(ctx, service.getPendingCount(entry.id), tile.x + tile.w - 14 * s, tile.y + 14 * s, s);
            }
            art.polygon(ctx, [[r.x + 20 * s, r.y + r.h - 44 * s], [r.x + r.w - 20 * s, r.y + r.h - 44 * s], [r.x + r.w - 29 * s, r.y + r.h - 14 * s], [r.x + 20 * s, r.y + r.h - 14 * s]], '#08111c');
            paintText(ctx, this.session.notice || 'INSTANCE ALERTS ACTIVE   /   ARROW KEYS: SELECT   /   ENTER: OPEN', r.x + 33 * s, r.y + r.h - 29 * s, 11 * s, '#9db8c8');
            ctx.restore();
            ctx.restore();
        }
        onMouseDown(x, y) {
            this.layout();
            if (service.dockLayout(Common.Platform.ctx).tabs.some(tab => inside(x, y, tab))) return true;
            if (this.gridOpen || inside(x, y, this.toolRect)) return true;
            const win = this.windows.slice().reverse().find(w => !w.minimized && inside(x, y, w.bounds));
            if (!win) return true;
            this.focus(win);
            if (inside(x, y, win.bounds.close) || inside(x, y, win.bounds.minimize)) return true;
            if (inside(x, y, win.bounds.title)) { win.releaseInput(); this.drag = { win, dx: x - win.x, dy: y - win.y }; return true; }
            win.pointer('onMouseDown', x, y); return true;
        }
        onMouseMove(x, y) {
            this.pointer = { x, y };
            if (this.drag) { this.drag.win.x = x - this.drag.dx; this.drag.win.y = y - this.drag.dy; this.layout(); return true; }
            if (this.gridOpen) {
                if (this.gridProgress() < 1) return true;
                const tile = this.tiles && this.tiles.find(r => inside(x, y, r));
                if (tile) this.selectedIndex = tile.index;
            } else if (this.focused) this.focused.pointer('onMouseMove', x, y);
            return true;
        }
        onMouseUp(x, y) {
            this.layout();
            if (this.drag) { this.drag = null; return true; }
            if (service.onDockUp(Common.Platform.ctx, x, y)) return true;
            if (this.gridOpen) {
                if (this.gridProgress() < 1) return true;
                if (inside(x, y, this.gridClose)) { this.dismiss(true); return true; }
                const tile = this.tiles.find(r => inside(x, y, r));
                if (tile) this.openTool(tile.index);
                return true;
            }
            if (inside(x, y, this.toolRect)) { this.toggleGrid(); return true; }
            const win = this.focused;
            if (!win) return true;
            if (inside(x, y, win.bounds.close)) { this.remove(win); return true; }
            if (inside(x, y, win.bounds.minimize)) { this.minimize(win); return true; }
            if (win.status !== 'ready' && win.status !== 'loading' && inside(x, y, win.bounds.body)) {
                const index = definitions.indexOf(win.definition), options = win.options;
                this.remove(win); this.openTool(index, options); return true;
            }
            win.pointer('onMouseUp', x, y); return true;
        }
        onMouseLeave() {
            if (this.focused) this.focused.releaseInput();
            this.drag = null; this.heldKeys.clear(); return true;
        }
        onKeyPressed(key) {
            if (Data.Keyboards.checkCancelMenu && Data.Keyboards.checkCancelMenu(key)) {
                if (this.gridOpen) this.dismiss(true);
                else if (this.focused) {
                    const win = this.focused;
                    if (win.overlays.length) win.key('onKeyPressed', key);
                    else if (!win.screen || !win.run(() => win.screen._closeGameplayOverlay && win.screen._closeGameplayOverlay())) this.minimize(win);
                } else this.dismiss();
                return true;
            }
            if (this.gridOpen) {
                if (this.gridProgress() < 1) return true;
                if (Data.Keyboards.checkActionMenu && Data.Keyboards.checkActionMenu(key)) this.openTool(this.selectedIndex);
                return true;
            }
            this.heldKeys.add(key);
            if (this.focused) this.focused.key('onKeyPressed', key);
            return true;
        }
        onKeyPressedAndRepeat(key) {
            if (this.gridOpen) {
                const controls = Data.Keyboards.menuControls || {}, equal = (value, fallback) => key === fallback || (value && Data.Keyboards.isKeyEqual && Data.Keyboards.isKeyEqual(key, value));
                const step = equal(controls.Left, 'ArrowLeft') ? -1 : equal(controls.Right, 'ArrowRight') ? 1 : equal(controls.Up, 'ArrowUp') ? -4 : equal(controls.Down, 'ArrowDown') ? 4 : 0;
                this.selectedIndex = Math.max(0, Math.min(definitions.length - 1, this.selectedIndex + step));
            } else if (this.focused) this.focused.key('onKeyPressedAndRepeat', key);
            return true;
        }
        onKeyReleased(key) {
            this.heldKeys.delete(key);
            if (this.focused) this.focused.key('onKeyReleased', key);
            return true;
        }
    }

    const service = {
        id: 'combined', name: 'Combined', desktop: null, session: null,
        mapId() { return Number(IP2Live.GameManager && IP2Live.GameManager._currentMapId()) || 0; },
        isEnabled(mapId = this.mapId()) {
            const config = IP2Live.GameManager && IP2Live.GameManager.flowConfig.maps[mapId];
            return !!(config && config.combinedGameplayEnabled === true);
        },
        ensureSession() {
            const game = Core.Game.current, mapId = this.mapId();
            if (!this.session || this.session.game !== game || this.session.mapId !== mapId) {
                if (this.session && this.session.game === game) this.captureState(game);
                if (this.session) {
                    this.clearAnimations();
                    for (const win of this.session.windows) win.dispose();
                }
                this.session = { game, mapId, windows: [], pendingCounts: {}, results: [], animations: [] };
                const saved = game && game.ip2liveGameStates && game.ip2liveGameStates.combinedGameplayFloors && game.ip2liveGameStates.combinedGameplayFloors[mapId];
                if (saved && saved.version === 1 && this.isEnabled(mapId)) {
                    const session = this.session;
                    session.host = new CombinedDesktop(session);
                    for (const entry of definitions) {
                        const count = Number(saved.pendingCounts && saved.pendingCounts[entry.id]);
                        if (Number.isFinite(count) && count >= 0) session.pendingCounts[entry.id] = Math.floor(count);
                    }
                    session.results = Array.isArray(saved.results) ? saved.results.slice(-64) : [];
                    for (const item of (Array.isArray(saved.windows) ? saved.windows : []).slice(0, definitions.length)) {
                        const definition = definitions.find(entry => entry.id === item.gameplayId);
                        if (!definition || session.windows.some(win => win.definition.id === definition.id) || !item.state) continue;
                        const win = new ToolWindow(definition, session.host, item.options || {});
                        win.restoreData = item; win.minimized = true;
                        session.windows.push(win); win.load();
                    }
                }
            }
            return this.session;
        },
        captureState(game = Core.Game.current) {
            const session = this.session;
            if (!session || !game || session.game !== game || IP2Live.GameManager.flowConfig.maps[session.mapId]?.stage !== 4) return false;
            const states = game.ip2liveGameStates || (game.ip2liveGameStates = {});
            const floors = states.combinedGameplayFloors || (states.combinedGameplayFloors = {});
            floors[session.mapId] = { version: 1, savedAt: Date.now(), pendingCounts: Object.assign({}, session.pendingCounts),
                windows: session.windows.map(win => win.snapshot()).filter(Boolean), results: session.results.slice(-64) };
            return true;
        },
        requestCheckpoint(reason) {
            if (this._checkpointPending) return;
            this._checkpointPending = true;
            const session = this.session;
            Promise.resolve().then(() => {
                this._checkpointPending = false;
                if (!session || this.session !== session || Core.Game.current !== session.game || this.mapId() !== session.mapId) return;
                this.captureState(session.game);
                if (IP2Live.StoryAutosave) IP2Live.StoryAutosave.checkpoint(reason);
            });
        },
        resetRuntime() {
            if (this.desktop && Manager.Stack.top === this.desktop) { this.desktop.keepTools = true; this.desktop.dismiss(); }
            if (this.session) for (const win of this.session.windows) win.dispose();
            this.clearAnimations();
            this.session = null; this.desktop = null;
        },
        tick() {
            const session = this.session, top = Manager.Stack.top;
            if (!session || session.game !== Core.Game.current || session.mapId !== this.mapId() || !this.isEnabled(session.mapId)) return;
            if (top && top !== Scene.Map.current && top !== this.desktop) return;
            for (const win of session.windows.slice()) win.update(!!(this.desktop && !this.desktop.gridOpen && !win.minimized));
            if (session.animations.length) Manager.Stack.requestPaintHUD = true;
        },
        clearAnimations() {
            if (!this.session) return;
            for (const animation of this.session.animations) animation.canvas.width = animation.canvas.height = 0;
            this.session.animations.length = 0;
        },
        cancelAnimation(win) {
            if (!this.session) return;
            this.session.animations = this.session.animations.filter(animation => {
                if (animation.win !== win) return true;
                animation.canvas.width = animation.canvas.height = 0;
                return false;
            });
        },
        captureAnimation(rect, paint, kind, win, viewport, duration) {
            const host = win ? win.desktop : this.desktop;
            if (!this.session || (host && host.motionPreference && host.motionPreference.matches)) return;
            const canvas = document.createElement('canvas');
            const ratio = Math.min(1, 960 / rect.w, 600 / rect.h);
            canvas.width = Math.ceil(rect.w * ratio); canvas.height = Math.ceil(rect.h * ratio);
            const ctx = canvas.getContext('2d');
            ctx.scale(ratio, ratio); ctx.translate(-rect.x, -rect.y);
            paint(ctx);
            this.session.animations.push({ canvas, kind, win, from: { x: rect.x, y: rect.y, w: rect.w, h: rect.h },
                viewportWidth: viewport.width, viewportHeight: viewport.height, startedAt: Date.now(), duration });
            Manager.Stack.requestPaintHUD = true;
        },
        animateWindow(win, kind) {
            if (!this.session || !win.bounds) return;
            this.cancelAnimation(win);
            const actual = Common.Platform.ctx.canvas;
            const viewport = { width: win.viewportWidth || actual.width, height: win.viewportHeight || actual.height };
            const dock = this.dockLayout(Common.Platform.ctx);
            const tab = win.minimized && dock.tabs.find(item => item.win === win);
            const rect = tab || win.bounds;
            // Capture before closing releases the gameplay canvas. The animation
            // owns only pixels; it cannot keep a closed tool or timer alive.
            this.captureAnimation(rect, ctx => {
                if (tab) this.drawDock(ctx, { ...dock, tabs: [tab] });
                else win.desktop.drawWindow(ctx, win);
            }, kind, win, viewport, kind === 'minimize' ? 340 : 190);
        },
        animateGrid(desktop) {
            this.clearAnimations();
            const viewport = Common.Platform.ctx.canvas;
            desktop.layout();
            this.captureAnimation(desktop.grid, ctx => desktop.drawGrid(ctx), 'close', null, viewport, 190);
        },
        drawAnimations(ctx) {
            const session = this.session;
            if (!session || session.game !== Core.Game.current || session.mapId !== this.mapId()) return;
            const now = Date.now(), dock = this.dockLayout(ctx);
            session.animations = session.animations.filter(animation => {
                const t = Math.max(0, Math.min(1, (now - animation.startedAt) / animation.duration));
                if (t >= 1) { animation.canvas.width = animation.canvas.height = 0; return false; }
                const sx = ctx.canvas.width / animation.viewportWidth, sy = ctx.canvas.height / animation.viewportHeight;
                const start = { x: animation.from.x * sx, y: animation.from.y * sy, w: animation.from.w * sx, h: animation.from.h * sy };
                let rect, alpha;
                if (animation.kind === 'minimize') {
                    const tab = dock.tabs.find(item => item.win === animation.win);
                    if (!tab) { animation.canvas.width = animation.canvas.height = 0; return false; }
                    const eased = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
                    rect = {};
                    for (const key of ['x', 'y', 'w', 'h']) rect[key] = start[key] + (tab[key] - start[key]) * eased;
                    alpha = 1 - t * t;
                } else {
                    const eased = 1 - Math.pow(1 - t, 3), scale = 1 - .12 * eased;
                    rect = { x: start.x + start.w * (1 - scale) / 2, y: start.y + start.h * (1 - scale) / 2 + 10 * sy * eased,
                        w: start.w * scale, h: start.h * scale };
                    alpha = 1 - eased;
                }
                ctx.save(); ctx.globalAlpha *= alpha;
                ctx.drawImage(animation.canvas, rect.x, rect.y, rect.w, rect.h); ctx.restore();
                return true;
            });
        },
        setPendingCount(gameplayId, count) {
            if (!definitions.some(entry => entry.id === gameplayId)) return false;
            const numeric = Number(count);
            if (!Number.isFinite(numeric) || numeric < 0) return false;
            this.ensureSession().pendingCounts[gameplayId] = Math.floor(numeric);
            Manager.Stack.requestPaintHUD = true; return true;
        },
        setPendingCounts(counts) {
            for (const [id, count] of Object.entries(counts || {})) this.setPendingCount(id, count);
        },
        getPendingCount(gameplayId) { return this.session && this.session.pendingCounts[gameplayId] || 0; },
        canOpen() {
            return this.isEnabled() && Core.Game.current && !this.desktop &&
                !IP2Live.GameManager._activeGameplayNode &&
                !(IP2Live.DialogueManager && IP2Live.DialogueManager.isActive()) &&
                !(IP2Live.WorldTitleOverlay && IP2Live.WorldTitleOverlay.isActive()) &&
                !(IP2Live.NeuralLifeForce && IP2Live.NeuralLifeForce.isRunOver());
        },
        launch(options = {}) {
            if (!this.canOpen()) return false;
            const session = this.ensureSession();
            const reused = !!session.host;
            this.desktop = session.host || new CombinedDesktop(session);
            session.host = this.desktop;
            if (reused) this.desktop.background = this.desktop.captureBackdrop();
            this.desktop.gridOpen = true;
            this.desktop.gridOpenedAt = Date.now();
            for (const win of session.windows) win.desktop = this.desktop;
            if (IP2Live.QuestMinimap && IP2Live.QuestMinimap.destroy) IP2Live.QuestMinimap.destroy();
            Manager.Stack.push(this.desktop);
            if (options.window && session.windows.includes(options.window)) this.desktop.focus(options.window);
            return true;
        },
        isActiveScreen(screen) {
            const top = Manager.Stack.top;
            return !!(this.session && (top === Scene.Map.current || top === this.desktop) &&
                this.session.windows.some(win => !win.disposed && win.status === 'ready' && win.activeScreen === screen));
        },
        dockLayout(ctx) {
            const s = Math.min(ctx.canvas.width / 1280, ctx.canvas.height / 720);
            const windows = this.session && this.session.game === Core.Game.current && this.session.mapId === this.mapId() ? this.session.windows.filter(win => !win.disposed) : [];
            const columns = 6, gap = 7 * s, tabW = 186 * s, tabH = 44 * s, rows = Math.ceil(windows.length / columns);
            const w = Math.min(columns, windows.length) * (tabW + gap) - gap;
            const x = (ctx.canvas.width - w) / 2, h = rows ? rows * (tabH + gap) + 14 * s : 0;
            const y = ctx.canvas.height - h;
            return { x, y, w, h, scale: s, tabs: windows.map((win, i) => ({ win,
                x: x + i % columns * (tabW + gap), y: y + Math.floor(i / columns) * (tabH + gap), w: tabW, h: tabH,
                close: { x: x + i % columns * (tabW + gap) + tabW - 27 * s, y: y + Math.floor(i / columns) * (tabH + gap) + 3 * s, w: 24 * s, h: tabH - 6 * s } })) };
        },
        drawDock(ctx, dock = this.dockLayout(ctx)) {
            const s = dock.scale;
            if (!dock.tabs.length) return;
            ctx.save();
            for (const tab of dock.tabs) {
                const win = tab.win, accent = COLORS[definitions.indexOf(win.definition)];
                art.panel(ctx, tab, accent, !!(this.desktop && this.desktop.focused === win), s);
                art.emblem(ctx, win.definition.icon, tab.x + 22 * s, tab.y + 22 * s, 29 * s, accent, icon);
                paintText(ctx, win.definition.name, tab.x + 42 * s, tab.y + 14 * s, 10 * s, '#dceef7', 'left', tab.w - 72 * s);
                paintText(ctx, win.timerLabel() + (win.minimized ? '  /  RESTORE' : '  /  OPEN'), tab.x + 42 * s, tab.y + 31 * s, 9 * s, win.status === 'failed' ? '#ff8297' : '#86cbd6');
                paintText(ctx, '×', tab.close.x + tab.close.w / 2, tab.y + 22 * s, 20 * s, '#ff7893', 'center');
            }
            ctx.restore();
        },
        onDockUp(ctx, x, y) {
            const tab = this.dockLayout(ctx).tabs.find(item => inside(x, y, item));
            if (!tab) return false;
            if (inside(x, y, tab.close)) tab.win.desktop.remove(tab.win);
            else if (this.desktop) this.desktop.focus(tab.win);
            else this.launch({ window: tab.win });
            return true;
        },
        toolRect(ctx) {
            const scale = Math.min(ctx.canvas.width / 1280, ctx.canvas.height / 720), qm = IP2Live.QuestManager;
            const panel = qm && qm._questPanelRect ? qm._questPanelRect(ctx) : { x: 18 * scale, y: 88 * scale, h: 126 * scale };
            // The navigation distance bar is 72 canvas pixels tall with an 8px gap.
            return { x: panel.x, y: Math.min(ctx.canvas.height - 110 * scale, panel.y + panel.h + 8 + 72 + 16 * scale), w: 92 * scale, h: 100 * scale };
        },
        drawToolButton(ctx, rect = this.toolRect(ctx), active = false) {
            const s = rect.h / 100;
            ctx.save();
            art.panel(ctx, rect, active ? '#e8db76' : '#6de8ed', active, s);
            // Optical centering accounts for the transparent padding under the case.
            art.toolbox(ctx, rect.x + rect.w / 2 + 3 * s, rect.y + rect.h / 2 + 7 * s, 86 * s);
            const total = definitions.reduce((sum, entry) => sum + this.getPendingCount(entry.id), 0);
            badge(ctx, total, rect.x + rect.w - 7 * s, rect.y + 10 * s, s); ctx.restore();
        },
        installMapHooks() {
            if (!Scene.Map || !Scene.Map.prototype || Scene.Map.prototype._combinedToolkitInstalled) return;
            const proto = Scene.Map.prototype, draw = proto.drawHUD, up = proto.onMouseUp, down = proto.onMouseDown, update = proto.update;
            proto._combinedToolkitInstalled = true;
            proto.update = function () {
                const result = update && update.apply(this, arguments);
                if (service.isEnabled() && Core.Game.current) { service.ensureSession(); service.tick(); }
                return result;
            };
            proto.drawHUD = function () {
                if (draw) draw.apply(this, arguments);
                if (service.isEnabled() && Core.Game.current && !service.desktop &&
                    !(IP2Live.DialogueManager && IP2Live.DialogueManager.isActive()) &&
                    !(IP2Live.WorldTitleOverlay && IP2Live.WorldTitleOverlay.isActive())) {
                    service.ensureSession(); service.drawToolButton(Common.Platform.ctx);
                    service.drawDock(Common.Platform.ctx);
                    service.drawAnimations(Common.Platform.ctx);
                }
            };
            proto.onMouseDown = function (x, y) {
                if (service.isEnabled() && service.dockLayout(Common.Platform.ctx).tabs.some(tab => inside(x, y, tab))) return true;
                if (service.canOpen() && inside(x, y, service.toolRect(Common.Platform.ctx))) return true;
                if (down) return down.apply(this, arguments);
            };
            proto.onMouseUp = function (x, y) {
                if (service.isEnabled() && service.onDockUp(Common.Platform.ctx, x, y)) return true;
                if (service.canOpen() && inside(x, y, service.toolRect(Common.Platform.ctx))) return service.launch();
                if (up) return up.apply(this, arguments);
                return false;
            };
        },
    };
    IP2Live.CombinedGameplay = service;
    IP2Live.CombinedGameplayScreen = CombinedDesktop;
    service.installMapHooks();
})();
