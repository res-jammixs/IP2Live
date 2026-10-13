/** A short, skippable story epilogue followed by a permanent completion award. */
(function () {
    const C = { bg: '#060e16', panel: '#0c1c27', cyan: '#79f4dc', gold: '#ecd598', text: '#edf6f7', muted: '#98afbd', line: '#294452' };
    function text(ctx, value, x, y, size, color = C.text, align = 'left', width = 1120) {
        ctx.font = size + 'px "Oxanium-Medium", sans-serif'; ctx.fillStyle = color;
        ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(String(value), x, y, width);
    }
    function wrap(ctx, value, width) {
        const rows = []; let row = '';
        for (const word of String(value).split(' ')) {
            if (row && ctx.measureText(row + ' ' + word).width > width) { rows.push(row); row = word; }
            else row += (row ? ' ' : '') + word;
        }
        if (row) rows.push(row);
        return rows;
    }
    const inside = (p, r) => p && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
    function polygon(ctx, points, fill, stroke, width = 1) {
        ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
    }
    function chamfer(ctx, x, y, w, h, cut = 12) {
        ctx.beginPath(); ctx.moveTo(x + cut, y); ctx.lineTo(x + w - cut, y); ctx.lineTo(x + w, y + cut);
        ctx.lineTo(x + w, y + h - cut); ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x + cut, y + h);
        ctx.lineTo(x, y + h - cut); ctx.lineTo(x, y + cut); ctx.closePath();
    }
    function regular(ctx, cx, cy, rx, ry, sides, fill, stroke, rotation = -Math.PI / 2, width = 1) {
        polygon(ctx, Array.from({ length: sides }, (_, i) => [cx + Math.cos(rotation + i * Math.PI * 2 / sides) * rx,
            cy + Math.sin(rotation + i * Math.PI * 2 / sides) * ry]), fill, stroke, width);
    }
    function gradient(ctx, x, y, x2, y2, colors) {
        const g = ctx.createLinearGradient(x, y, x2, y2); colors.forEach((color, i) => g.addColorStop(i / (colors.length - 1), color)); return g;
    }
    function trace(ctx, points, color, width = 1) {
        ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    }
    function grain(ctx, x, y, w, h, count) {
        let seed = 1937;
        for (let i = 0; i < count; i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const px = x + seed % w;
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const py = y + seed % h;
            ctx.fillStyle = i % 2 ? '#c6dce810' : '#00000030'; ctx.fillRect(px, py, i % 5 ? 1 : 7, 0.6);
        }
    }
    function panel(ctx, x, y, w, h, accent = '#54727e') {
        ctx.save(); chamfer(ctx, x, y, w, h, 15);
        ctx.fillStyle = gradient(ctx, x, y, x + w, y + h, ['#29404d', '#0a1823', '#1b2e3a']); ctx.fill();
        ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.stroke();
        chamfer(ctx, x + 4, y + 4, w - 8, h - 8, 12); ctx.fillStyle = '#0a1721'; ctx.fill(); ctx.strokeStyle = '#9dc6ce1c'; ctx.stroke();
        chamfer(ctx, x + 6, y + 6, w - 12, h - 12, 10); ctx.clip();
        ctx.fillStyle = gradient(ctx, x, y, x, y + h, ['#d2eef00e', '#11243110', '#00070c30']); ctx.fillRect(x, y, w, h);
        grain(ctx, x, y, w, h, Math.round(w * h / 110));
        for (let line = y + 10; line < y + h; line += 4) { ctx.fillStyle = '#9abcc503'; ctx.fillRect(x, line, w, 1); }
        ctx.restore();
        trace(ctx, [[x + 15, y + 1], [x + 65, y + 1]], C.gold, 2);
        trace(ctx, [[x + w - 65, y + h - 1], [x + w - 15, y + h - 1]], '#79f4dc45', 2);
    }
    class IP2LiveStoryEndingScreen extends Scene.Base {
        constructor(record, options = {}) {
            super(true);
            this.record = record; this.archive = !!options.archive;
            this.phase = this.archive || options.certificateOnly ? 'complete' : 'cutscene';
            this.beat = 0; this.beatStarted = Date.now(); this.readyAt = Date.now() + 300;
            this.selected = 0; this.hovered = -1; this.pressed = -1; this.pointerDownSeen = false;
            this.busy = false; this.notice = ''; this.noticeError = false; this.closed = false;
            this.records = []; this.recordIndex = 0; this.preview = null; this.saveResult = null;
            this._backdrops = new Map(); this._buttonSkins = new Map(); this._seal = null; this._metalTexture = null;
            this.reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
            this.beats = [
                { title: 'THE FINAL UPLINK', speaker: 'NEURAL LINK', line: 'The public routes are connected. APEX can no longer keep the planet\'s reserves behind its private network.' },
                { title: 'APEX / CONTROL LOST', speaker: 'APEX', line: 'Exclusive routing... revoked. Resource monopoly... terminated. Command control lost.' },
                { title: 'A NETWORK RESTORED', speaker: 'NEURAL LINK', line: 'You did it, ' + (record && record.name || 'Infiltrator') + '. The hoard is open. The planet\'s resources belong to everyone again.' },
            ];
        }
        initialize() {}
        async load() {
            try {
                const assets = IP2Live.Assets || {};
                if (assets.loadPauseFonts) await assets.loadPauseFonts();
            } catch (error) { console.warn('[IP2Live] Ending fonts could not be loaded:', error); }
            if (this.closed) return;
            if (this.archive) await this._loadRecords();
            else if (IP2Live.MusicManager) IP2Live.MusicManager.play('STORY_ENDING');
            this.beatStarted = Date.now(); this.loading = false; this._paint();
        }
        async _loadRecords() {
            this.busy = true;
            try {
                this.records = await IP2Live.StoryCompletion.list();
                if (!this.closed) { this.record = this.records[0] || null; this.recordIndex = 0; this.preview = null; this.notice = ''; }
            } catch (error) { this.notice = 'Could not read your certificates. Select Retry to try again.'; this.noticeError = true; }
            finally { this.busy = false; this._paint(); }
        }
        _paint() { Manager.Stack.requestPaintHUD = true; }
        update() {
            if (this.phase === 'cutscene' && Date.now() - this.beatStarted >= 6000) this._advance();
            this._paint();
        }
        _advance() {
            if (this.phase !== 'cutscene') return;
            if (++this.beat >= this.beats.length) this._finishCutscene();
            else this.beatStarted = Date.now();
            this._paint();
        }
        _finishCutscene() {
            this.phase = 'complete'; this.selected = 0; this.readyAt = Date.now() + 300; this._paint();
        }
        _actions() {
            if (this.phase === 'cutscene') return [{ id: 'next', label: this.beat === 2 ? 'COMPLETE STORY' : 'CONTINUE', x: 974, y: 606, w: 226, h: 50 }];
            if (!this.record) return [
                ...(this.noticeError ? [{ id: 'retry', label: 'RETRY', x: 80, y: 606, w: 230, h: 50 }] : []),
                { id: 'menu', label: 'BACK TO STORY MODE', x: 330, y: 606, w: 290, h: 50 },
            ];
            return [
                { id: 'pdf', label: this.busy ? 'PLEASE WAIT...' : 'DOWNLOAD CERTIFICATE', x: 80, y: 606, w: 330, h: 50 },
                { id: this.archive ? 'previous' : 'replay', label: this.archive ? 'PREVIOUS' : 'REPLAY ENDING', x: 430, y: 606, w: 224, h: 50 },
                ...(this.archive ? [{ id: 'next-record', label: 'NEXT', x: 674, y: 606, w: 170, h: 50 }] : []),
                { id: 'menu', label: this.archive ? 'BACK' : 'MAIN MENU', x: 974, y: 606, w: 226, h: 50 },
            ];
        }
        async _activate(id) {
            if (this.busy || this.closed || Date.now() < this.readyAt) return;
            const sound = Data.Systems && Data.Systems.soundConfirmation;
            if (sound) sound.playSound();
            if (id === 'next') return this._advance();
            if (id === 'retry') { this.noticeError = false; return this._loadRecords(); }
            if (id === 'previous' || id === 'next-record') {
                if (!this.records.length) return;
                this.recordIndex = (this.recordIndex + (id === 'previous' ? -1 : 1) + this.records.length) % this.records.length;
                this.record = this.records[this.recordIndex]; this.preview = null; this.notice = ''; this._paint(); return;
            }
            if (id === 'replay') {
                this.phase = 'cutscene'; this.beat = 0; this.beatStarted = Date.now(); this.selected = 0; this._paint(); return;
            }
            if (id === 'pdf') {
                this.busy = true; this.notice = ''; this._paint();
                try {
                    const certificate = IP2Live.StoryCertificate.create(this.record);
                    await IP2Live.StoryCertificate.download(certificate);
                    if (!this.closed) { this.notice = 'Certificate download started.'; this.noticeError = false; }
                } catch (error) {
                    if (!this.closed) { this.notice = 'Could not download the certificate. Please try again.'; this.noticeError = true; }
                    console.warn('[IP2Live] Story certificate download failed:', error);
                } finally { this.busy = false; this._paint(); }
                return;
            }
            if (id === 'menu') {
                if (this.archive) {
                    if (IP2Live.MenuTransition) IP2Live.MenuTransition.back();
                    else Manager.Stack.pop();
                    return;
                }
                this.busy = true; this.notice = 'Saving your completion...'; this._paint();
                await this.saveTask;
                if (this.closed) return;
                if (IP2Live.DialogueManager && IP2Live.DialogueManager.discardActive) IP2Live.DialogueManager.discardActive();
                Manager.Stack.popAll(); Manager.Stack.pushTitleScreen(true);
            }
        }
        _key(key) { return String(key && key.key || key).toUpperCase(); }
        _navigate(key) {
            const value = this._key(key), keys = Data.Keyboards || {}, controls = keys.menuControls || {};
            const equal = target => target && keys.isKeyEqual && keys.isKeyEqual(key, target);
            let delta = 0;
            if (['ARROWRIGHT', 'ARROWDOWN', 'RIGHT', 'DOWN'].includes(value) || equal(controls.Down) || equal(controls.Right)) delta = 1;
            if (['ARROWLEFT', 'ARROWUP', 'LEFT', 'UP'].includes(value) || equal(controls.Up) || equal(controls.Left)) delta = -1;
            if (delta) { const count = this._actions().length; this.selected = (this.selected + delta + count) % count; this._paint(); }
        }
        onKeyPressed(key) {
            if (this.busy || this.closed) return true;
            const value = this._key(key), keys = Data.Keyboards || {};
            if ((keys.checkActionMenu && keys.checkActionMenu(key)) || ['ENTER', ' ', 'SPACE'].includes(value)) this._activate(this._actions()[this.selected].id);
            else if ((keys.checkCancelMenu && keys.checkCancelMenu(key)) || value === 'ESCAPE') {
                if (Date.now() < this.readyAt) return true;
                if (this.phase === 'cutscene') this._finishCutscene();
                else this._activate('menu');
            } else this._navigate(key);
            return true;
        }
        onKeyPressedAndRepeat(key) { if (!this.busy) this._navigate(key); return true; }
        _point(x, y) {
            const canvas = Common.Platform.ctx.canvas, s = Math.min(canvas.width / 1280, canvas.height / 720);
            return { x: (x - (canvas.width - 1280 * s) / 2) / s, y: (y - (canvas.height - 720 * s) / 2) / s };
        }
        _hit(x, y) { const p = this._point(x, y); return this._actions().findIndex(r => inside(p, r)); }
        onMouseMove(x, y) { this.hovered = this._hit(x, y); if (this.hovered >= 0) this.selected = this.hovered; this._paint(); }
        onMouseDown(x, y) { this.pressed = this._hit(x, y); this.pointerDownSeen = true; }
        onMouseUp(x, y) {
            const index = this._hit(x, y);
            if (index >= 0 && (!this.pointerDownSeen || index === this.pressed)) this._activate(this._actions()[index].id);
            this.pressed = -1; this.pointerDownSeen = false;
        }
        draw3D() { if (Manager.GL && Manager.GL.renderer) Manager.GL.renderer.clear(); }
        _background(ctx) {
            // Material and chassis passes are painted once, not regenerated each frame.
            const density = Math.min(2, Math.max(1, Math.min(ctx.canvas.width / 1280, ctx.canvas.height / 720)));
            let cached = this._backdrops.get(this.phase);
            if (!cached || cached.density !== density) {
                const surface = document.createElement('canvas'); surface.width = Math.round(1280 * density); surface.height = Math.round(720 * density);
                const paint = surface.getContext('2d'); paint.setTransform(density, 0, 0, density, 0, 0); this._buildBackdrop(paint);
                cached = { surface, density }; this._backdrops.set(this.phase, cached);
            }
            ctx.drawImage(cached.surface, 0, 0, 1280, 720);
            if (!this.reducedMotion) {
                const time = Date.now() / 1000;
                for (let i = 0; i < 24; i++) {
                    const x = 30 + (i * 137.7) % 1220, y = 120 + ((i * 43.1 - time * (3 + i % 4)) % 450 + 450) % 450;
                    ctx.fillStyle = i % 4 ? '#9dd4cf28' : '#efd59b55'; ctx.fillRect(x, y, 1.4, 1.4);
                }
            }
        }
        _buildBackdrop(ctx) {
            ctx.fillStyle = '#03080e'; ctx.fillRect(0, 0, 1280, 720);
            const glow = ctx.createRadialGradient(870, 260, 0, 870, 260, 750);
            glow.addColorStop(0, '#286c7038'); glow.addColorStop(0.5, '#0e283220'); glow.addColorStop(1, '#03080e00');
            ctx.fillStyle = glow; ctx.fillRect(0, 0, 1280, 720);
            // Large, low-contrast hull facets keep the background architectural.
            polygon(ctx, [[0, 60], [320, 0], [190, 264], [0, 448]], '#29404b18', '#7396a00c');
            polygon(ctx, [[1280, 8], [1021, 57], [1124, 288], [1280, 483]], '#29404b16', '#7396a00c');
            polygon(ctx, [[0, 495], [222, 346], [500, 720], [0, 720]], '#17263045', '#7396a00a');
            polygon(ctx, [[1280, 334], [1055, 470], [910, 720], [1280, 720]], '#07101d60', '#7396a00a');
            for (let i = 0; i < 18; i++) {
                const x = 45 + i * 74;
                trace(ctx, [[x, 130], [x + 68, 198], [x + 68, 370], [x + 128, 430]], '#72979d0b', 0.6);
            }
            grain(ctx, 0, 0, 1280, 720, 10500);
            // Armoured perimeter: brushed metal, bevels, corner brackets and fasteners.
            chamfer(ctx, 20, 22, 1240, 676, 24); ctx.strokeStyle = '#39535f'; ctx.lineWidth = 1; ctx.stroke();
            chamfer(ctx, 25, 27, 1230, 666, 20); ctx.strokeStyle = '#91bdc51a'; ctx.stroke();
            for (const [x, y, sx, sy] of [[20, 22, 1, 1], [1260, 22, -1, 1], [20, 698, 1, -1], [1260, 698, -1, -1]]) {
                ctx.save(); ctx.translate(x, y); ctx.scale(sx, sy);
                polygon(ctx, [[0, 24], [24, 0], [92, 0], [75, 8], [30, 8], [8, 30], [8, 56], [0, 64]],
                    gradient(ctx, 0, 0, 60, 60, ['#8497a0', '#3a5360', '#152530']), '#99b5be50');
                trace(ctx, [[4, 25], [25, 4], [66, 4]], '#84e6d8', 1.5);
                regular(ctx, 24, 17, 4, 4, 6, '#051019', '#5b7984'); trace(ctx, [[21, 17], [27, 17]], '#65858f');
                ctx.restore();
            }
            panel(ctx, 58, 48, 1164, 58, '#3d5b66');
            polygon(ctx, [[77, 66], [91, 58], [105, 66], [105, 85], [91, 93], [77, 85]], '#1f3c45', '#80bdb4');
            trace(ctx, [[85, 81], [85, 70], [97, 77], [97, 84]], '#d8cb98', 1.5);
            text(ctx, 'IP2LIVE', 124, 77, 19);
            text(ctx, this.channelLabel || (this.archive ? 'STORY / CERTIFICATE ARCHIVE' : 'STORY / FINAL TRANSMISSION'), 1189, 77, 10, C.muted, 'right');
            if (this.phase === 'complete') {
                panel(ctx, 58, 130, 546, 422);
                panel(ctx, 622, 130, 600, 452, '#8d825c');
                text(ctx, this.awardLabel || 'COMPLETION AWARD', 644, 153, 9, C.gold);
                text(ctx, this.formatLabel || 'A4 / PERSONALIZED PDF', 1198, 153, 9, C.muted, 'right');
                for (let i = 0; i < 14; i++) polygon(ctx, [[579, 157 + i * 24], [587, 149 + i * 24], [587, 155 + i * 24], [579, 163 + i * 24]], '#52747d25');
            } else {
                panel(ctx, 58, 124, 1164, 364, '#3e535e');
                for (let i = 0; i < 21; i++) trace(ctx, [[180 + i * 46, 475], [640 + (i - 10) * 15, 305]], '#679c9b12', 0.8);
                for (let i = 0; i < 7; i++) trace(ctx, [[114 + i * 30, 470 - i * 14], [1166 - i * 30, 470 - i * 14]], '#679c9b13', 0.8);
                text(ctx, 'NEURAL DECK / UPLINK CONTROL', 80, 147, 9, C.muted);
                text(ctx, 'SECURE CHANNEL', 1199, 147, 9, C.cyan, 'right');
                panel(ctx, 58, 500, 1164, 88, '#4c6c75');
            }
            trace(ctx, [[58, 596], [1222, 596]], '#93b6bf20');
            text(ctx, this.footerLabel || 'IP2 / STORY', 58, 676, 8, '#68818e');
            for (let i = 0; i < 35; i++) { ctx.fillStyle = i % 3 ? '#607b8740' : '#607b8715'; ctx.fillRect(174 + i * 5, 673, i % 2 + 1, 7); }
        }
        _network(ctx, cx, cy, beat, elapsed) {
            const p = Math.min(1, elapsed / 2600), time = this.reducedMotion ? 1 : elapsed / 1000;
            const color = beat === 1 ? '#ed8b91' : beat === 0 ? C.gold : C.cyan;
            ctx.save(); ctx.translate(cx, cy);
            // An isometric command plinth, with a suspended polygon reactor.
            const aura = ctx.createRadialGradient(0, -8, 5, 0, -8, 210);
            aura.addColorStop(0, beat === 1 ? '#cc3e5025' : '#64ffe330'); aura.addColorStop(1, '#060d1500');
            ctx.fillStyle = aura; ctx.fillRect(-270, -180, 540, 360);
            regular(ctx, 0, 104, 223, 70, 6, '#0b1825', '#55727b');
            polygon(ctx, [[-193, 139], [0, 174], [193, 139], [193, 153], [0, 188], [-193, 153]], '#07121e', '#304754');
            regular(ctx, 0, 104, 194, 58, 6, '#10222c', '#688b8c');
            regular(ctx, 0, 104, 155, 41, 6, '#142c34', color);
            for (let i = 0; i < 5; i++) trace(ctx, [[-138 + i * 29, 110], [0, 151 - i * 9], [138 - i * 29, 110]], '#80b6af24');
            for (let i = 0; i < 4; i++) {
                const x = i < 2 ? -352 : 352, y = i % 2 ? 65 : -74, dir = i < 2 ? -1 : 1;
                const route = [[dir * 116, y / 2], [dir * 212, y / 2], [dir * 256, y], [x, y]];
                trace(ctx, route, '#68878c38', 6); trace(ctx, route, '#08151f', 3); trace(ctx, route, color + '88', 0.9);
                const fraction = this.reducedMotion ? 0.5 : (time * 0.3 + i * 0.23) % 1;
                regular(ctx, dir * (116 + fraction * 236), y * (0.5 + fraction * 0.5), 3, 3, 4, color);
                // Relay cabinets have a lit face, recessed slots and a dark side wall.
                polygon(ctx, [[x - 34, y - 26], [x + 18, y - 26], [x + 34, y - 13], [x + 34, y + 32], [x - 18, y + 32], [x - 34, y + 18]],
                    gradient(ctx, x - 34, y - 26, x + 34, y + 32, ['#38535c', '#102530', '#091822']), '#617f89');
                polygon(ctx, [[x + 18, y - 26], [x + 34, y - 13], [x + 34, y + 32], [x + 18, y + 19]], '#08131e', '#36525f');
                chamfer(ctx, x - 28, y - 20, 40, 36, 5); ctx.fillStyle = '#06141c'; ctx.fill(); ctx.strokeStyle = color + '66'; ctx.stroke();
                text(ctx, '0' + (i + 1), x - 8, y - 2, 17, color, 'center');
                for (let bar = 0; bar < 3; bar++) { ctx.fillStyle = '#78939880'; ctx.fillRect(x - 26 + bar * 11, y + 22, 7, 2); }
                text(ctx, 'SECTOR 0' + (i + 1), x, y + 48, 8, '#93adb8', 'center');
            }
            // Armour facets and gold/cyan inlays replace the flat circle diagram.
            polygon(ctx, [[-83, -112], [0, -151], [83, -112], [83, 81], [0, 125], [-83, 81]],
                gradient(ctx, -83, -151, 83, 125, ['#45636d', '#142935', '#0b1b28']), '#8ba9b0');
            if (!this._metalTexture) {
                this._metalTexture = document.createElement('canvas'); this._metalTexture.width = 166; this._metalTexture.height = 280;
                const material = this._metalTexture.getContext('2d'); grain(material, 0, 0, 166, 280, 1600);
                for (let i = 0; i < 70; i++) trace(material, [[0, i * 4], [166, i * 4 - 32]], '#adc9d00b', 0.6);
            }
            ctx.save();
            polygon(ctx, [[-83, -112], [0, -151], [83, -112], [83, 81], [0, 125], [-83, 81]]); ctx.clip();
            ctx.drawImage(this._metalTexture, -83, -151); ctx.restore();
            polygon(ctx, [[0, -151], [83, -112], [83, 81], [0, 125], [12, 65], [12, -113]], '#07152290', '#65858e50');
            polygon(ctx, [[-83, -112], [0, -151], [0, -132], [-65, -102], [-65, 71], [-83, 81]], '#88aaa04a');
            for (const sign of [-1, 1]) {
                trace(ctx, [[sign * 67, -97], [sign * 67, 68], [sign * 33, 87]], color, 2);
                for (let i = 0; i < 6; i++) trace(ctx, [[sign * 54, 17 + i * 10], [sign * 34, 28 + i * 10]], '#b4c6b94a');
            }
            regular(ctx, 0, -47, 77, 77, 8, '#0c1c28', '#a6beb282', Math.PI / 8, 2);
            regular(ctx, 0, -47, 66, 66, 8, '#142c37', color, Math.PI / 8, 1.5);
            regular(ctx, 0, -47, 57, 57, 8, gradient(ctx, -45, -100, 45, 15, ['#2b5558', '#0b2431', '#10212e']), '#d8edd924', Math.PI / 8);
            for (let i = 0; i < 8; i++) {
                const a = Math.PI / 4 * i + Math.PI / 8, x = Math.cos(a) * 73, y = -47 + Math.sin(a) * 73;
                regular(ctx, x, y, 2.4, 2.4, 6, '#06121e', '#74909c');
                trace(ctx, [[x - 1.3, y], [x + 1.3, y]], '#9bb8c1', 0.6);
            }
            const crystal = 17 + p * 10 + Math.sin(time * 1.5) * 1.2;
            ctx.shadowColor = color; ctx.shadowBlur = 13;
            polygon(ctx, [[0, -47 - crystal], [crystal, -47], [0, -47 + crystal], [-crystal, -47]], color, '#f0f5df');
            ctx.shadowBlur = 0;
            polygon(ctx, [[0, -47 - crystal], [0, -47 + crystal], [-crystal, -47]], '#ffffff35');
            trace(ctx, [[0, -47 - crystal], [0, -47], [crystal, -47]], '#f4fff6b0');
            for (let i = 0; i < 8; i++) {
                const a = Math.PI / 4 * i + (this.reducedMotion ? 0 : time * 0.035), x = Math.cos(a) * 92, y = -47 + Math.sin(a) * 92;
                regular(ctx, x, y, 2, 2, 4, color);
            }
            text(ctx, beat === 1 ? 'APEX' : 'NEURAL LINK', 0, 47, 13, color, 'center');
            text(ctx, beat === 1 ? 'OFFLINE' : 'CONNECTED', 0, 67, 8, C.text, 'center');
            ctx.restore();
        }
        _drawCutscene(ctx) {
            const beat = this.beats[this.beat], elapsed = Date.now() - this.beatStarted;
            ctx.save(); ctx.translate(640, 288); ctx.scale(1, 0.9); this._network(ctx, 0, 0, this.beat, elapsed); ctx.restore();
            text(ctx, '0' + (this.beat + 1) + ' / 03    ' + beat.title, 640, 468, 13, C.gold, 'center');
            polygon(ctx, [[78, 516], [82, 512], [82, 574], [78, 578]], C.cyan);
            text(ctx, beat.speaker, 104, 520, 10, C.cyan);
            ctx.font = '19px "Oxanium-Medium", sans-serif';
            wrap(ctx, beat.line, 1040).forEach((line, i) => text(ctx, line, 104, 548 + i * 24, 19));
            text(ctx, 'ENTER  CONTINUE   /   ESC  SKIP ENDING', 80, 632, 11, C.muted);
            for (let i = 0; i < 3; i++) polygon(ctx, [[389 + i * 56, 673], [435 + i * 56, 673], [429 + i * 56, 679], [383 + i * 56, 679]], i <= this.beat ? '#79f4dc99' : C.line);
        }
        _drawComplete(ctx) {
            text(ctx, this.archive ? 'YOUR STORY CERTIFICATES' : 'OPERATION COMPLETE', 86, 160, 10, C.cyan);
            text(ctx, this.archive ? 'A story worth keeping.' : 'STORY COMPLETE', 86, 204, 34, C.text, 'left', 468);
            trace(ctx, [[86, 240], [251, 240], [260, 231], [553, 231]], '#63879155');
            if (!this.record) {
                text(ctx, 'Every story starts with a connection.', 86, 312, 21, C.text, 'left', 460);
                text(ctx, 'Finish Story Mode to earn your certificate.', 86, 355, 16, C.muted, 'left', 460);
                text(ctx, this.notice || 'No completed stories yet.', 86, 482, 13, this.noticeError ? C.gold : C.muted, 'left', 460);
                ctx.save(); ctx.translate(922, 352); ctx.scale(0.62, 0.62); this._network(ctx, 0, 0, 0, 4000); ctx.restore();
                text(ctx, 'YOUR NEXT CONNECTION STARTS THE STORY', 922, 530, 9, C.muted, 'center', 510);
                return;
            }
            const record = this.record;
            text(ctx, 'INFILTRATOR', 86, 269, 9, '#829da9');
            text(ctx, record.name, 86, 302, 29, C.gold, 'left', 456);
            text(ctx, 'The final APEX uplink is secured.', 86, 350, 17);
            text(ctx, 'Thank you for playing IP2Live.', 86, 379, 16, C.muted);
            const date = new Date(record.completedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            trace(ctx, [[86, 411], [445, 411]], '#6c8c9345');
            text(ctx, 'COMPLETED', 86, 435, 8, C.cyan);
            text(ctx, date, 86, 456, 15, C.text, 'left', 344);
            text(ctx, 'Keep your achievement as a personalized PDF.', 86, 502, 12, C.muted, 'left', 453);
            text(ctx, this.archive ? 'Certificate ' + (this.recordIndex + 1) + ' of ' + this.records.length : 'Available again from Story Mode / Story Certificates.', 86, 524, 10, C.muted, 'left', 453);
            if (!this._seal) {
                this._seal = document.createElement('canvas'); this._seal.width = 256; this._seal.height = 256;
                IP2Live.StoryCertificate.drawSeal(this._seal.getContext('2d'), 128, 128, 108);
            }
            ctx.drawImage(this._seal, 454, 400, 96, 96);
            if (!this.preview) {
                this.preview = document.createElement('canvas'); this.preview.width = 1684; this.preview.height = 1190;
                IP2Live.StoryCertificate.draw(this.preview.getContext('2d'), record);
            }
            ctx.fillStyle = '#00000060'; ctx.fillRect(648, 179, 552, 552 * 595 / 842);
            ctx.drawImage(this.preview, 640, 171, 552, 552 * 595 / 842);
        }
        _drawButton(ctx, r, active, index) {
            const key = [r.w, r.h, active].join(':');
            if (!this._buttonSkins.has(key)) {
                const surface = document.createElement('canvas'); surface.width = r.w; surface.height = r.h;
                const paint = surface.getContext('2d');
                chamfer(paint, 0.5, 0.5, r.w - 1, r.h - 1, 10);
                paint.fillStyle = gradient(paint, 0, 0, r.w, r.h, active ? ['#426c68', '#21443e', '#142e30'] : ['#29404d', '#132430', '#0d1b27']); paint.fill();
                paint.strokeStyle = active ? '#a7f4d8' : '#57727f'; paint.lineWidth = 1; paint.stroke();
                paint.save(); paint.clip(); grain(paint, 0, 0, r.w, r.h, 160);
                for (let i = 0; i < 9; i++) trace(paint, [[r.w - 60 + i * 8, 0], [r.w - 85 + i * 8, r.h]], '#b4d3ce09');
                paint.restore();
                trace(paint, [[12, 3], [r.w - 14, 3]], active ? '#c1f4d456' : '#b6d7df20');
                trace(paint, [[3, 14], [3, r.h - 14]], active ? C.gold : '#638892', 2);
                this._buttonSkins.set(key, surface);
            }
            ctx.drawImage(this._buttonSkins.get(key), r.x, r.y);
            if (!this.hideActionNumbers) text(ctx, '0' + (index + 1), r.x + 16, r.y + r.h / 2, 8, active ? '#a7c8b6' : '#677f8c');
            text(ctx, r.label, r.x + r.w / 2 + (this.hideActionNumbers ? 0 : 5), r.y + r.h / 2, 13, active ? '#d0ffec' : C.text, 'center', r.w - 52);
        }
        drawHUD() {
            const ctx = Common.Platform.ctx, canvas = ctx.canvas;
            const scale = Math.min(canvas.width / 1280, canvas.height / 720);
            ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#03080d'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
            ctx.translate((canvas.width - 1280 * scale) / 2, (canvas.height - 720 * scale) / 2); ctx.scale(scale, scale);
            this._background(ctx);
            if (this.phase === 'cutscene') this._drawCutscene(ctx); else this._drawComplete(ctx);
            this._actions().forEach((r, index) => this._drawButton(ctx, r, index === this.selected, index));
            let notice = this.notice;
            if (!notice && this.saveResult && !this.saveResult.archived) notice = 'Download your certificate now. Its archive could not be saved on this device.';
            if (this.phase === 'complete' && notice) text(ctx, notice, 80, 572, 13, this.noticeError || this.saveResult && !this.saveResult.archived ? C.gold : C.cyan);
            text(ctx, this.footerRight || (this.phase === 'complete' ? 'IP2LIVE  /  EVERY CONNECTION COUNTS' : 'SECURE TRANSMISSION'), 1200, 679, 10, C.muted, 'right');
            ctx.restore();
        }
        close() {
            this.closed = true; this.preview = null; this._seal = null; this._metalTexture = null; this._backdrops.clear(); this._buttonSkins.clear();
            IP2Live.StoryCompletion.release(this); if (super.close) super.close();
        }
    }
    IP2Live.StoryEndingScreen = IP2LiveStoryEndingScreen;
    window.IP2LiveStoryEndingScreen = IP2LiveStoryEndingScreen;
})();
