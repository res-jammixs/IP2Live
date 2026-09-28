/** Five-column practice library, shared by guided lessons and free practice. */
class IP2LivePracticeGrid extends Scene.Base {
    constructor(kind) {
        super(true);
        this.kind = kind === 'gameplay' ? 'gameplay' : 'tutorial';
    }
    initialize() {
        this.selectedIndex = 0;
        this.notice = '';
        this.tick = 0;
        this.folderOpen = IP2Live.PracticeMode.entries.map(() => 0);
        this.pointerMode = false;
        this.hoveredIndex = -1;
        this._animationTime = Date.now();
    }
    async load() {
        await IP2Live.Assets.loadAll();
        this.loading = false;
        Manager.Stack.requestPaintHUD = true;
    }
    update() {
        this.tick++;
        const now = Date.now(), dt = Math.min(50, Math.max(0, now - this._animationTime));
        this._animationTime = now;
        const focus = this.pointerMode ? this.hoveredIndex : this.selectedIndex;
        this.folderOpen.forEach((value, index) => {
            const target = index === focus ? 1 : 0;
            this.folderOpen[index] = value + (target - value) * (1 - Math.exp(-dt / 95));
        });
        Manager.Stack.requestPaintHUD = true;
    }
    _layout() {
        const sw = Common.ScreenResolution.SCREEN_X, sh = Common.ScreenResolution.SCREEN_Y;
        const margin = 42, gap = 14, w = (sw - margin * 2 - gap * 4) / 5;
        const h = Math.min(158, (sh - 226) / 3);
        const cells = IP2Live.PracticeMode.entries.map((entry, index) => {
            const harder = index >= 9, column = harder ? index - 9 : index % 5;
            const row = harder ? 2 : Math.floor(index / 5);
            return { x: margin + column * (w + gap), y: 118 + row * (h + gap) + (harder ? 29 : 0), w, h, row };
        });
        return { sw, sh, cells, harderY: cells[9].y - 14,
            back: { x: margin, y: sh - 53, w: 128, h: 34, row: 3 } };
    }
    _back() {
        if (IP2Live.PracticeMode.active || (IP2Live.MenuTransition && IP2Live.MenuTransition.active)) return;
        if (IP2Live.MenuTransition) IP2Live.MenuTransition.back();
        else Manager.Stack.pop();
    }
    _activate() {
        if (IP2Live.PracticeMode.active || (IP2Live.MenuTransition && IP2Live.MenuTransition.active)) return;
        if (this.selectedIndex === IP2Live.PracticeMode.entries.length) return this._back();
        const entry = IP2Live.PracticeMode.entries[this.selectedIndex];
        if (!entry) return;
        if (!IP2Live.PracticeMode.isUnlocked(entry.id)) {
            this.notice = 'Complete the ' + entry.name + ' tutorial in Story Mode to unlock this exercise.';
            if (Data.Systems.soundImpossible) Data.Systems.soundImpossible.playSound();
            return;
        }
        this.notice = '';
        Data.Systems.soundConfirmation.playSound();
        const launch = () => IP2Live.PracticeMode.launch(entry.id, this.kind, this);
        if (IP2Live.MenuTransition && typeof IP2Live.MenuTransition.launch === 'function') IP2Live.MenuTransition.launch(launch);
        else launch();
    }
    onKeyPressed(key) {
        if (Data.Keyboards.checkCancelMenu(key)) this._back();
        else if (Data.Keyboards.checkActionMenu(key)) this._activate();
        return true;
    }
    onKeyPressedAndRepeat(key) {
        const controls = Data.Keyboards.menuControls, equal = (name) => Data.Keyboards.isKeyEqual(key, controls[name]);
        const l = this._layout(), cells = [...l.cells, l.back], count = cells.length;
        if (equal('Left')) this.selectedIndex = (this.selectedIndex + count - 1) % count;
        else if (equal('Right')) this.selectedIndex = (this.selectedIndex + 1) % count;
        else if (equal('Up') || equal('Down')) {
            const current = cells[this.selectedIndex], row = (current.row + (equal('Down') ? 1 : 3)) % 4;
            let best = Infinity;
            cells.forEach((cell, index) => {
                const distance = Math.abs(cell.x - current.x);
                if (cell.row === row && distance < best) { best = distance; this.selectedIndex = index; }
            });
        } else return true;
        this.pointerMode = false;
        this.notice = '';
        Data.Systems.soundCursor.playSound();
        return true;
    }
    _at(x, y) {
        const ctx = Common.Platform.ctx, l = this._layout();
        x *= l.sw / ctx.canvas.width; y *= l.sh / ctx.canvas.height;
        return [...l.cells, l.back].findIndex(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    }
    onMouseMove(x, y) {
        const index = this._at(x, y);
        this.pointerMode = true;
        this.hoveredIndex = index;
        if (index >= 0 && index !== this.selectedIndex) { this.selectedIndex = index; this.notice = ''; }
    }
    onMouseUp(x, y) {
        const index = this._at(x, y);
        this.pointerMode = true;
        this.hoveredIndex = index;
        if (index >= 0) { this.selectedIndex = index; this._activate(); }
    }
    draw3D() { if (Manager.GL && Manager.GL.renderer) Manager.GL.renderer.clear(); }
    _wrap(ctx, text, width) {
        const rows = []; let line = '';
        for (const word of text.split(' ')) {
            const next = line ? line + ' ' + word : word;
            if (line && ctx.measureText(next).width > width) { rows.push(line); line = word; }
            else line = next;
        }
        if (line) rows.push(line);
        return rows;
    }
    _icon(ctx, type, x, y, color) {
        ctx.save(); ctx.translate(x, y); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (type === 'wires' || type === 'patch') {
            for (let i = 0; i < 3; i++) {
                const yy = -12 + i * 12;
                ctx.moveTo(-20, yy); ctx.lineTo(-6, yy); ctx.lineTo(6, -yy); ctx.lineTo(20, -yy);
                ctx.rect(-24, yy - 2, 4, 4); ctx.rect(20, yy - 2, 4, 4);
            }
        } else if (type === 'binary' || type === 'matrix' || type === 'vlsm') {
            for (let row = 0; row < 2; row++) for (let col = 0; col < 4; col++) {
                ctx.rect(-22 + col * 12, -13 + row * 15, 8, 10);
                if ((row + col) % 3 === 0) ctx.fillRect(-20 + col * 12, -11 + row * 15, 4, 6);
            }
        } else if (type === 'reactor') {
            ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.moveTo(4, -14); ctx.lineTo(-7, 2);
            ctx.lineTo(4, 2); ctx.lineTo(-3, 15);
        } else if (type === 'repair') {
            ctx.rect(-22, -16, 44, 29); ctx.moveTo(0, 13); ctx.lineTo(0, 20);
            ctx.moveTo(-12, 20); ctx.lineTo(12, 20); ctx.moveTo(-7, 0); ctx.lineTo(-1, 6); ctx.lineTo(10, -7);
        } else if (type === 'quarantine') {
            ctx.moveTo(0, -22); ctx.lineTo(20, -13); ctx.lineTo(17, 7);
            ctx.lineTo(0, 22); ctx.lineTo(-17, 7); ctx.lineTo(-20, -13); ctx.closePath();
            ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.moveTo(0, -9); ctx.lineTo(0, 9);
        } else {
            ctx.rect(-7, -20, 14, 12); ctx.moveTo(0, -8); ctx.lineTo(0, 3);
            ctx.moveTo(-19, 3); ctx.lineTo(19, 3);
            for (const xx of [-19, 0, 19]) { ctx.moveTo(xx, 3); ctx.lineTo(xx, 10); ctx.rect(xx - 5, 10, 10, 10); }
        }
        ctx.stroke(); ctx.restore();
    }
    _panel(ctx, x, y, w, h, cut = 10) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w - cut, y);
        ctx.lineTo(x + w, y + cut); ctx.lineTo(x + w, y + h);
        ctx.lineTo(x + cut, y + h); ctx.lineTo(x, y + h - cut); ctx.closePath();
    }
    _folder(ctx, x, y, w, h, tab = true) {
        ctx.beginPath(); ctx.moveTo(x, y + 9); ctx.lineTo(x + 9, y);
        if (tab) { ctx.lineTo(x + w * 0.34, y); ctx.lineTo(x + w * 0.34 + 9, y + 8); }
        ctx.lineTo(x + w - 10, y + (tab ? 8 : 0)); ctx.lineTo(x + w, y + (tab ? 18 : 10));
        ctx.lineTo(x + w, y + h - 10); ctx.lineTo(x + w - 10, y + h);
        ctx.lineTo(x + w * 0.72, y + h); ctx.lineTo(x + w * 0.72 - 5, y + h - 5);
        ctx.lineTo(x + w * 0.25, y + h - 5); ctx.lineTo(x + w * 0.25 - 5, y + h);
        ctx.lineTo(x + 8, y + h); ctx.lineTo(x, y + h - 8); ctx.closePath();
    }
    _backdrop(ctx, l) {
        ctx.fillStyle = '#050910'; ctx.fillRect(0, 0, l.sw, l.sh);
        const glow = ctx.createRadialGradient(l.sw * 0.72, l.sh * 0.35, 0, l.sw * 0.72, l.sh * 0.35, l.sw * 0.7);
        glow.addColorStop(0, '#102b364d'); glow.addColorStop(1, '#05091000');
        ctx.fillStyle = glow; ctx.fillRect(0, 0, l.sw, l.sh);
        ctx.lineWidth = 1; ctx.strokeStyle = '#20434e20'; ctx.beginPath();
        for (let x = -l.sh; x < l.sw; x += 64) {
            ctx.moveTo(x, 0); ctx.lineTo(x + l.sh, l.sh);
        }
        for (let y = 0; y < l.sh; y += 48) { ctx.moveTo(0, y); ctx.lineTo(l.sw, y); }
        ctx.stroke();
        // Quiet circuit paths with moving packets, visible around the library panels.
        for (let i = 0; i < 7; i++) {
            const x = l.sw * 0.43 + i * 76, y = l.sh - 95 - i * 13;
            ctx.strokeStyle = '#2a667533'; ctx.beginPath();
            ctx.moveTo(x, l.sh); ctx.lineTo(x, y + 30); ctx.lineTo(x + 30, y);
            ctx.lineTo(l.sw, y); ctx.stroke();
            const packet = (this.tick * 0.45 + i * 91) % Math.max(1, l.sw - x - 30);
            ctx.fillStyle = '#64bcc45c'; ctx.fillRect(x + 30 + packet, y - 1, 4, 2);
        }
        for (let i = 0; i < 40; i++) {
            const x = (i * 197.3 + this.tick * (0.03 + i % 3 * 0.015)) % l.sw;
            const y = (i * 83.7 - this.tick * 0.075 % l.sh + l.sh) % l.sh;
            ctx.fillStyle = i % 5 === 0 ? '#d9ba5855' : '#67c2ce33';
            ctx.fillRect(x, y, 1.5, 1.5);
        }
        ctx.fillStyle = '#35c4ce'; ctx.fillRect(18, 26, 3, 44);
        ctx.fillStyle = '#35c4ce25'; ctx.fillRect(18, 76, 3, l.sh - 112);
    }
    _card(ctx, entry, r, index, font) {
        const unlocked = IP2Live.PracticeMode.isUnlocked(entry.id), selected = index === this.selectedIndex;
        const open = this.folderOpen[index] || 0;
        const accent = entry.harder ? '#ff627e' : '#83e6b0';
        const edge = selected ? (unlocked ? accent : '#94a9b8') : (entry.harder ? '#643342' : '#304855');
        ctx.save();
        // Stationary tab/back shell, with document edges exposed as the cover opens.
        this._folder(ctx, r.x, r.y, r.w, r.h);
        ctx.fillStyle = entry.harder ? '#20121d' : '#101f21'; ctx.fill();
        ctx.strokeStyle = edge; ctx.lineWidth = selected ? 1.5 : 1;
        if (selected && unlocked) { ctx.shadowColor = accent + '44'; ctx.shadowBlur = 10; }
        ctx.stroke(); ctx.shadowBlur = 0;
        ctx.fillStyle = unlocked ? accent + '66' : '#627c8655';
        for (let i = 0; i < 5; i++) ctx.fillRect(r.x + 13 + i * 6, r.y + 5, 3, 2);
        for (let i = 0; i < 2; i++) {
            this._panel(ctx, r.x + 10 + i * 4, r.y + 27 - open * (8 - i * 3), r.w - 20 - i * 8, r.h - 38, 5);
            ctx.fillStyle = entry.harder ? '#301d2c' : '#1c3432'; ctx.fill();
            ctx.strokeStyle = unlocked ? accent + '50' : '#405362'; ctx.stroke();
        }
        ctx.font = '8px ' + font; ctx.textAlign = 'right';
        ctx.fillStyle = entry.harder ? '#f38ca0' : '#77958a';
        if (entry.harder) ctx.fillText('HARDER', r.x + r.w - 15, r.y + 18);
        ctx.textAlign = 'left';
        // The front cover tilts outward around its bottom edge without moving the hit area.
        const frontY = r.y + 26 + open * 6;
        ctx.save();
        ctx.translate(r.x + r.w / 2, r.y + r.h);
        ctx.transform(1 + open * 0.015, 0, -open * 0.012, 1, 0, 0);
        ctx.translate(-r.x - r.w / 2, -r.y - r.h);
        this._folder(ctx, r.x + 2, frontY, r.w - 4, r.y + r.h - frontY - 2, false);
        const surface = ctx.createLinearGradient(r.x, frontY, r.x + r.w, r.y + r.h);
        surface.addColorStop(0, selected ? (entry.harder ? '#301d29' : '#1c332d') : (entry.harder ? '#1c141f' : '#13232a'));
        surface.addColorStop(1, '#080f17');
        ctx.fillStyle = surface; ctx.fill(); ctx.strokeStyle = edge; ctx.stroke();
        ctx.save(); ctx.clip();
        ctx.fillStyle = '#a8c9c609';
        for (let yy = r.y + 2; yy < r.y + r.h; yy += 3) ctx.fillRect(r.x, yy, r.w, 1);
        // Deterministic grain and etched diagonal traces, kept beneath the copy.
        for (let i = 0; i < 90; i++) {
            const xx = r.x + ((i * 67 + index * 23) % 223) / 223 * r.w;
            const yy = frontY + ((i * 41 + index * 17) % 127) / 127 * (r.y + r.h - frontY);
            ctx.fillStyle = i % 3 ? '#a6cebd0d' : '#00000032';
            ctx.fillRect(xx, yy, i % 4 === 0 ? 5 : 1, 1);
        }
        ctx.strokeStyle = accent + '0c'; ctx.lineWidth = 1; ctx.beginPath();
        for (let i = 0; i < 7; i++) {
            const xx = r.x + r.w - 74 + i * 12;
            ctx.moveTo(xx, frontY); ctx.lineTo(xx - 28, frontY + 28); ctx.lineTo(xx - 28, frontY + 40);
        }
        ctx.stroke();
        const shade = ctx.createLinearGradient(0, r.y + r.h - 35, 0, r.y + r.h);
        shade.addColorStop(0, '#03091000'); shade.addColorStop(1, '#030910b0');
        ctx.fillStyle = shade; ctx.fillRect(r.x, r.y + r.h - 35, r.w, 35);
        ctx.restore();
        ctx.fillStyle = unlocked ? accent : (entry.harder ? '#974f63' : '#526b7d');
        ctx.fillRect(r.x + 2, frontY + 10, 2, 20);
        ctx.fillRect(r.x + 12, frontY, selected ? 52 : 24, 1);
        for (let i = 0; i < 3; i++) ctx.fillRect(r.x + r.w - 30 + i * 6, r.y + r.h - 5, 3, 2);
        const nameFont = IP2Live.Assets.reliduxLoaded ? 'Relidux' : font;
        const name = entry.name.toUpperCase();
        let size = 13, names;
        do {
            ctx.font = size + 'px ' + nameFont;
            names = this._wrap(ctx, name, r.w - 28);
            if (names.length <= 2 && names.every(line => ctx.measureText(line).width <= r.w - 28)) break;
            size -= 0.5;
        } while (size > 9);
        ctx.fillStyle = unlocked ? '#effbf5' : '#abbac4';
        names.forEach((line, i) => ctx.fillText(line, r.x + 14, r.y + 79 + open * 2 - (names.length - 1 - i) * 15));
        ctx.font = '11px ' + font; ctx.fillStyle = unlocked ? '#aebfca' : '#8091a3';
        this._wrap(ctx, entry.description, r.w - 28).forEach((line, i) => ctx.fillText(line, r.x + 14, r.y + 98 + open * 2 + i * 13));
        if (!unlocked) {
            ctx.font = '8px ' + font; ctx.fillStyle = '#8396a4';
            ctx.fillText('LOCKED / STORY TUTORIAL', r.x + 14, r.y + r.h - 14);
        }
        ctx.font = '26px ' + nameFont; ctx.textAlign = 'right';
        ctx.fillStyle = entry.harder ? '#ff829b30' : '#a9e3c732';
        ctx.fillText(entry.number.padStart(2, '0'), r.x + r.w - 13, r.y + r.h - 13);
        ctx.textAlign = 'left';
        ctx.restore(); // front cover
        ctx.restore();
    }
    drawHUD() {
        const ctx = Common.Platform.ctx, l = this._layout(), practice = IP2Live.PracticeMode;
        const font = IP2Live.Assets.oxaniumMediumLoaded ? 'Oxanium-Medium' : 'sans-serif';
        ctx.save(); ctx.scale(ctx.canvas.width / l.sw, ctx.canvas.height / l.sh);
        this._backdrop(ctx, l);
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        const titleFont = IP2Live.Assets.reliduxLoaded ? 'Relidux' : font;
        ctx.font = '28px ' + titleFont;
        const titleInk = ctx.createLinearGradient(0, 35, 0, 65);
        titleInk.addColorStop(0, '#f1fff8'); titleInk.addColorStop(1, '#91bbae');
        ctx.fillStyle = titleInk;
        ctx.fillText(this.kind === 'tutorial' ? 'TUTORIAL LIBRARY' : 'GAMEPLAY LIBRARY', 42, 62);
        ctx.fillStyle = '#83e6b0'; ctx.fillRect(42, 28, 32, 2);
        ctx.fillStyle = '#83e6b035'; ctx.fillRect(80, 28, 64, 2);
        ctx.font = '12px ' + font; ctx.fillStyle = '#8395a7';
        ctx.fillText(this.kind === 'tutorial' ? 'Revisit the lesson. Start fresh every time.' : 'Unlimited attempts. Keep learning at your own pace.', 42, 86);
        const unlockedCount = practice.entries.filter(e => practice.isUnlocked(e.id)).length;
        ctx.textAlign = 'right'; ctx.fillStyle = '#b9d1dc';
        ctx.fillText(unlockedCount + ' / ' + practice.entries.length + ' UNLOCKED', l.sw - 42, 60);
        for (let i = 0; i < practice.entries.length; i++) {
            ctx.fillStyle = practice.isUnlocked(practice.entries[i].id) ? (practice.entries[i].harder ? '#ff627e' : '#f4d45a') : '#29414e';
            ctx.fillRect(l.sw - 42 - (practice.entries.length - i) * 14, 73, 10, 4);
        }
        ctx.strokeStyle = '#32515f'; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(42, 104); ctx.lineTo(l.sw - 64, 104); ctx.lineTo(l.sw - 42, 82); ctx.stroke();
        ctx.fillStyle = '#42d4df'; ctx.fillRect(42, 103, 70, 2);
        ctx.textAlign = 'left'; ctx.font = 'bold 11px ' + font; ctx.fillStyle = '#ff5877';
        ctx.fillText('HARDER VERSIONS  /  ADAPTIVE CHALLENGES', 42, l.harderY);
        ctx.strokeStyle = '#633045'; ctx.beginPath(); ctx.moveTo(358, l.harderY - 4);
        ctx.lineTo(l.sw - 55, l.harderY - 4); ctx.lineTo(l.sw - 42, l.harderY - 17); ctx.stroke();
        practice.entries.forEach((entry, index) => {
            this._card(ctx, entry, l.cells[index], index, font);
        });
        this._panel(ctx, l.back.x, l.back.y, l.back.w, l.back.h, 9);
        ctx.fillStyle = this.selectedIndex === practice.entries.length ? '#f5df5818' : '#0a1620'; ctx.fill();
        ctx.strokeStyle = this.selectedIndex === practice.entries.length ? '#f5df58' : '#3b5367';
        ctx.stroke();
        ctx.font = 'bold 12px ' + font; ctx.fillStyle = '#d7e4ef';
        ctx.fillText('<  BACK', l.back.x + 22, l.back.y + 22);
        const selected = practice.entries[this.selectedIndex];
        const hint = this.notice || (selected && !practice.isUnlocked(selected.id)
            ? 'Complete this variant’s tutorial in Story Mode to unlock Tutorial and Gameplay practice.'
            : 'Arrow keys to browse  •  Enter to select  •  Esc to go back');
        ctx.font = '11px ' + font; ctx.fillStyle = '#98a8b9';
        ctx.fillText(hint, l.back.x + l.back.w + 24, l.back.y + 22);
        ctx.restore();
    }
}
IP2Live.PracticeGrid = IP2LivePracticeGrid;
