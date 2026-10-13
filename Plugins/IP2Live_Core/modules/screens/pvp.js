/** Local lobby and engine-race presentation; all puzzles remain the real games. */
(function () {
    'use strict';
    const Rules = IP2Live.PVPRules, mode = IP2Live.PVPMode;
    const C = { bg: '#050914', panel: '#0b1523', cyan: '#67f5e0', pink: '#ff789f', text: '#e8f7fa', muted: '#8ba4b8', gold: '#ffe091' };
    const BODY_FONT = '"Oxanium-Medium", "Segoe UI", sans-serif';
    const BODY_LEADING = 1.6;
    const DISPLAY_FONT = '"Nebula-Regular", "Ethnocentric", sans-serif';
    const reducedMotion = !!(typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const inside = (x, y, r) => x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;
    const text = (ctx, value, x, y, size = 18, color = C.text, align = 'left', width) => {
        const lines = String(value).split('\n');
        ctx.font = size + 'px ' + BODY_FONT;
        const measured = width ? Math.max(...lines.map(line => ctx.measureText(line).width)) : 0;
        if (width && measured > width) ctx.font = (size * width / measured) + 'px ' + BODY_FONT;
        ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
        lines.forEach((line, i) => {
            const baseline = y + (i - (lines.length - 1) / 2) * size * BODY_LEADING;
            if (width) ctx.fillText(line, x, baseline, width); else ctx.fillText(line, x, baseline);
        });
    };
    const heading = (ctx, value, x, y, size, color = C.text, width, align = 'center') => {
        ctx.font = size + 'px ' + DISPLAY_FONT;
        if (width && ctx.measureText(String(value)).width > width) ctx.font = (size * width / ctx.measureText(String(value)).width) + 'px ' + DISPLAY_FONT;
        ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
        if (width) ctx.fillText(value, x, y, width); else ctx.fillText(value, x, y);
    };
    const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
    let weave, arenaBackdrop;
    function trace(ctx, points, color, width = 1) {
        ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    }
    function energy(ctx, points, color, intensity = 1) {
        ctx.save(); ctx.lineJoin = 'bevel'; ctx.lineCap = 'square'; ctx.globalAlpha *= intensity;
        ctx.shadowColor = color; ctx.shadowBlur = 14;
        trace(ctx, points, color + '20', 12); trace(ctx, points, color + 'b0', 3);
        ctx.shadowBlur = 0; trace(ctx, points, '#e8fff5', 0.9); ctx.restore();
    }
    function versusMark(ctx, x, y, size = 66) {
        ctx.save(); ctx.translate(x, y);
        const ink = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
        ink.addColorStop(0, '#ffffff'); ink.addColorStop(0.48, '#d7fff4'); ink.addColorStop(0.5, '#83c6c5'); ink.addColorStop(1, '#b5e3db');
        ctx.font = size + 'px ' + BODY_FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineJoin = 'bevel'; ctx.shadowColor = '#00040b'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 6;
        ctx.strokeStyle = '#06141f'; ctx.lineWidth = 10; ctx.strokeText('VS', 0, 0);
        ctx.shadowOffsetY = 0; ctx.shadowBlur = 12; ctx.shadowColor = C.cyan;
        ctx.strokeStyle = '#67f5e080'; ctx.lineWidth = 2; ctx.strokeText('VS', 0, 0);
        ctx.shadowBlur = 0; ctx.fillStyle = ink; ctx.fillText('VS', 0, 0); ctx.restore();
    }
    function fabric(ctx, x, y, w, h) {
        if (!weave && typeof document !== 'undefined') {
            const tile = document.createElement('canvas'); tile.width = tile.height = 32;
            const grain = tile.getContext('2d');
            for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
                const gx = column * 8, gy = row * 8, vertical = (row + column) % 2;
                grain.fillStyle = '#01060b38'; grain.fillRect(gx, gy, 8, 8);
                grain.fillStyle = '#a9c7e00a'; grain.fillRect(gx + 1, gy + 1, vertical ? 5 : 7, vertical ? 7 : 5);
                grain.fillStyle = '#bbdcf008';
                for (let strand = 0; strand < 3; strand++) grain.fillRect(gx + 1 + (vertical ? strand * 2 : 0), gy + 1 + (vertical ? 0 : strand * 2), vertical ? 0.6 : 6, vertical ? 6 : 0.6);
            }
            weave = ctx.createPattern(tile, 'repeat');
        }
        if (weave) { ctx.save(); ctx.globalAlpha *= 0.42; ctx.fillStyle = weave; ctx.fillRect(x, y, w, h); ctx.restore(); }
    }
    function shape(ctx, x, y, w, h, cut = 10) {
        ctx.beginPath(); ctx.moveTo(x + cut, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - cut);
        ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + cut); ctx.closePath();
    }
    function panel(ctx, x, y, w, h, accent = '#365263', slim = false) {
        ctx.save(); shape(ctx, x, y, w, h, slim ? 6 : 10);
        const gradient = ctx.createLinearGradient(x, y, x + w * 0.5, y + h);
        gradient.addColorStop(0, '#172939'); gradient.addColorStop(0.2, '#0c1725'); gradient.addColorStop(1, '#080e19');
        ctx.fillStyle = gradient; ctx.fill(); ctx.strokeStyle = accent; ctx.lineWidth = 1; ctx.stroke(); ctx.clip();
        if (slim) {
            ctx.strokeStyle = '#a6e5ed06';
            for (let row = y + 9; row < y + h; row += 9) { ctx.beginPath(); ctx.moveTo(x, row); ctx.lineTo(x + w, row); ctx.stroke(); }
            ctx.fillStyle = '#a6e5ed03';
            for (let dx = x - h; dx < x + w; dx += 70) { ctx.beginPath(); ctx.moveTo(dx, y); ctx.lineTo(dx + 20, y); ctx.lineTo(dx + h + 20, y + h); ctx.lineTo(dx + h, y + h); ctx.fill(); }
        } else {
            fabric(ctx, x, y, w, h);
            const sheen = ctx.createRadialGradient(x + w * 0.25, y, 0, x + w * 0.25, y, Math.max(w, h));
            sheen.addColorStop(0, '#94c6e80b'); sheen.addColorStop(1, '#94c6e800'); ctx.fillStyle = sheen; ctx.fillRect(x, y, w, h);
            ctx.fillStyle = '#cee9ff12'; ctx.fillRect(x + 14, y + 1, w - 28, 1);
            ctx.fillStyle = '#00060b80'; ctx.fillRect(x + 5, y + h - 6, w - 10, 3);
        }
        const inset = slim ? 2 : 4, rail = slim ? 1 : 3;
        ctx.strokeStyle = slim ? '#99d4e119' : '#99d4e12b'; ctx.strokeRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
        ctx.fillStyle = accent; ctx.fillRect(x + 13, y, slim ? 28 : 42, rail); ctx.fillRect(x + w - (slim ? 41 : 55), y + h - rail, slim ? 28 : 42, rail);
        for (const dx of [x + 9, x + w - 10]) for (const dy of [y + 10, y + h - 10]) { ctx.fillStyle = '#030711'; ctx.fillRect(dx - 2, dy - 2, slim ? 3 : 5, slim ? 3 : 5); ctx.fillStyle = '#6b8995'; ctx.fillRect(dx, dy, slim ? 1 : 2, slim ? 1 : 2); }
        ctx.restore();
    }
    function button(ctx, label, r, active, disabled = false, slim = false, accent = C.cyan) {
        panel(ctx, r.x, r.y, r.w, r.h, disabled ? '#273444' : active ? accent : '#385461', slim);
        if (active && !disabled) { ctx.fillStyle = accent + '13'; ctx.fillRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8); }
        text(ctx, label, r.x + r.w / 2, r.y + r.h / 2, slim ? 13 : 16, disabled ? '#536779' : active ? accent : C.text, 'center', r.w - 26);
    }
    function paintBackground(ctx) {
        ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 1280, 720);
        fabric(ctx, 0, 0, 1280, 720);
        panel(ctx, 26, 22, 1228, 676, '#375766');
        ctx.save(); shape(ctx, 32, 28, 1216, 664, 8); ctx.clip();
        for (const [x, color] of [[170, '#3edbc322'], [1110, '#ff487a1c']]) {
            const glow = ctx.createRadialGradient(x, 260, 0, x, 260, 660);
            glow.addColorStop(0, color); glow.addColorStop(1, '#05091400'); ctx.fillStyle = glow; ctx.fillRect(32, 28, 1216, 664);
        }
        const vignette = ctx.createRadialGradient(640, 320, 180, 640, 320, 720);
        vignette.addColorStop(0, '#00040b00'); vignette.addColorStop(1, '#00040ba0'); ctx.fillStyle = vignette; ctx.fillRect(32, 28, 1216, 664);
        ctx.restore();
        for (const side of [-1, 1]) {
            const color = side < 0 ? C.cyan : C.pink, edge = side < 0 ? 43 : 1237;
            const route = [[640 + side * 72, 34], [edge - side * 26, 34], [edge, 60], [edge, 660], [edge - side * 26, 686], [640 + side * 72, 686]];
            trace(ctx, route, '#020711', 10); trace(ctx, route, color + '36', 5);
            trace(ctx, route, color + 'b0', 1.2);
            for (const y of [70, 648]) {
                trace(ctx, [[edge - side * 6, y], [edge - side * 6, y + 22], [edge - side * 25, y + 22]], '#c7e5ed50');
                for (let i = 0; i < 6; i++) { ctx.fillStyle = i < 3 ? color + '90' : '#355563'; ctx.fillRect(edge - side * (35 + i * 9), y + 8, 5, 2); }
            }
            for (let i = 0; i < 11; i++) {
                const y = 200 + i * 28;
                trace(ctx, [[edge + side * 3, y], [edge + side * 7, y + 4], [edge + side * 7, y + 12]], color + '50');
            }
        }
        for (const x of [49, 1215]) for (let i = 0; i < 5; i++) {
            ctx.fillStyle = '#6e98aa38'; ctx.fillRect(x, 49 + i * 4, 16, 1);
            ctx.fillRect(x, 654 + i * 4, 16, 1);
        }
    }
    function background(ctx) {
        const density = Math.min(2, Math.max(1, Math.min(ctx.canvas.width / 1280, ctx.canvas.height / 720)));
        if (!arenaBackdrop || arenaBackdrop.density !== density) {
            const canvas = document.createElement('canvas'); canvas.width = Math.round(1280 * density); canvas.height = Math.round(720 * density);
            const paint = canvas.getContext('2d'); paint.setTransform(density, 0, 0, density, 0, 0); paintBackground(paint);
            arenaBackdrop = { canvas, density };
        }
        ctx.drawImage(arenaBackdrop.canvas, 0, 0, 1280, 720);
    }
    function circle(ctx, x, y, radius) { ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); }
    function rounded(ctx, x, y, w, h, radius) {
        ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.lineTo(x + w - radius, y); ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h - radius); ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        ctx.lineTo(x + radius, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius); ctx.quadraticCurveTo(x, y, x + radius, y); ctx.closePath();
    }
    function bolt(ctx, x, y, radius = 2) {
        circle(ctx, x, y, radius + 0.8); ctx.fillStyle = '#020711'; ctx.fill();
        const metal = ctx.createLinearGradient(x, y - radius, x, y + radius);
        metal.addColorStop(0, '#b1c2ca'); metal.addColorStop(0.45, '#607782'); metal.addColorStop(1, '#263945');
        circle(ctx, x, y, radius); ctx.fillStyle = metal; ctx.fill();
        ctx.strokeStyle = '#12222d'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(x - radius * 0.55, y + 0.4); ctx.lineTo(x + radius * 0.55, y - 0.4); ctx.stroke();
    }
    function inputWell(ctx, r, focused, key) {
        ctx.save();
        const rim = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
        rim.addColorStop(0, '#66828f'); rim.addColorStop(0.12, '#2b4353'); rim.addColorStop(0.8, '#152635'); rim.addColorStop(1, '#4f6979');
        shape(ctx, r.x, r.y, r.w, r.h, 5); ctx.fillStyle = rim; ctx.shadowColor = '#00040b'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 3; ctx.fill();
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        if (focused) { ctx.strokeStyle = C.cyan + 'a0'; ctx.shadowColor = C.cyan; ctx.shadowBlur = 6; ctx.lineWidth = 1; ctx.stroke(); ctx.shadowBlur = 0; }
        ctx.fillStyle = '#01060c'; ctx.fillRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
        const display = ctx.createLinearGradient(r.x, r.y + 6, r.x, r.y + r.h - 6);
        display.addColorStop(0, '#07111e'); display.addColorStop(1, '#101e2e');
        ctx.fillStyle = display; ctx.fillRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12);
        ctx.fillStyle = '#c2e5f307';
        for (let row = r.y + 9; row < r.y + r.h - 7; row += 3) ctx.fillRect(r.x + 7, row, r.w - 14, 0.5);
        ctx.fillStyle = '#d1f7ff12'; ctx.fillRect(r.x + 7, r.y + r.h - 7, r.w - 14, 1);
        ctx.fillStyle = focused ? C.cyan : '#7aadb7'; ctx.fillRect(r.x + 2, r.y + 13, 2, r.h - 26);
        ctx.fillStyle = '#769cba26'; ctx.fillRect(r.x + 38, r.y + 12, 1, r.h - 24);
        const cx = r.x + 23, cy = r.y + r.h / 2;
        ctx.strokeStyle = focused ? C.cyan : '#93afc3'; ctx.lineWidth = 1.2;
        if (key === 'pilot') {
            circle(ctx, cx, cy - 4, 3.5); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx - 6, cy + 8); ctx.lineTo(cx - 6, cy + 5);
            ctx.quadraticCurveTo(cx, cy - 1, cx + 6, cy + 5); ctx.lineTo(cx + 6, cy + 8); ctx.stroke();
        } else {
            ctx.strokeRect(cx - 3, cy - 8, 6, 5); ctx.strokeRect(cx - 8, cy + 4, 5, 4); ctx.strokeRect(cx + 3, cy + 4, 5, 4);
            ctx.beginPath(); ctx.moveTo(cx, cy - 3); ctx.lineTo(cx, cy + 1); ctx.moveTo(cx - 5, cy + 4);
            ctx.lineTo(cx - 5, cy + 1); ctx.lineTo(cx + 5, cy + 1); ctx.lineTo(cx + 5, cy + 4); ctx.stroke();
        }
        for (const x of [r.x + 10, r.x + r.w - 10]) { ctx.fillStyle = '#91a9bc47'; ctx.fillRect(x, r.y + 2, 4, 1); ctx.fillRect(x, r.y + r.h - 3, 4, 1); }
        ctx.restore();
    }
    function engine(ctx, x, y, charge, now, angle = now / 1800 * (0.1 + charge * 2)) {
        charge = Math.max(0, Math.min(1, charge));
        ctx.save(); ctx.translate(x, y);
        const glow = ctx.createRadialGradient(0, 0, 28, 0, 0, 94);
        glow.addColorStop(0, '#67f5e0' + (charge > 0 ? '27' : '08')); glow.addColorStop(1, '#67f5e000');
        ctx.fillStyle = glow; ctx.fillRect(-94, -94, 188, 188);
        // Faceted mounting plate and the deep, circular turbine recess.
        const housing = ctx.createLinearGradient(-40, -64, 44, 64);
        housing.addColorStop(0, '#8aa5b3'); housing.addColorStop(0.16, '#405768'); housing.addColorStop(0.45, '#1a2b39'); housing.addColorStop(0.83, '#0b1420'); housing.addColorStop(1, '#526d7b');
        ctx.beginPath();
        for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; const xx = Math.cos(a) * 70, yy = Math.sin(a) * 70; if (i) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
        ctx.closePath(); ctx.fillStyle = housing; ctx.fill(); ctx.strokeStyle = '#07111d'; ctx.lineWidth = 2; ctx.stroke();
        ctx.strokeStyle = '#b5e7ee4a'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-63, -25); ctx.lineTo(-26, -63); ctx.lineTo(25, -63); ctx.stroke();
        circle(ctx, 0, 0, 59); ctx.fillStyle = '#050c16'; ctx.fill(); ctx.strokeStyle = '#7b99a85c'; ctx.lineWidth = 1; ctx.stroke();
        const rim = ctx.createLinearGradient(-46, -53, 46, 53);
        rim.addColorStop(0, '#9badb7'); rim.addColorStop(0.24, '#354a59'); rim.addColorStop(0.5, '#14232f'); rim.addColorStop(0.78, '#0a1520'); rim.addColorStop(1, '#607e8e');
        circle(ctx, 0, 0, 50); ctx.strokeStyle = rim; ctx.lineWidth = 6; ctx.stroke();
        const recess = ctx.createRadialGradient(-12, -14, 2, 0, 0, 47);
        recess.addColorStop(0, '#243b49'); recess.addColorStop(0.62, '#08131f'); recess.addColorStop(1, '#01040a');
        circle(ctx, 0, 0, 47); ctx.fillStyle = recess; ctx.fill();
        ctx.save(); circle(ctx, 0, 0, 46); ctx.clip(); ctx.rotate(angle);
        for (let i = 0; i < 7; i++) {
            ctx.save(); ctx.rotate(i * Math.PI * 2 / 7);
            const blade = ctx.createLinearGradient(8, 7, 37, -34);
            blade.addColorStop(0, '#253d4b'); blade.addColorStop(0.33, '#718e9c'); blade.addColorStop(0.52, '#c2d5da'); blade.addColorStop(0.65, '#7a9ba8'); blade.addColorStop(1, '#344e60');
            ctx.beginPath(); ctx.moveTo(8, -4); ctx.bezierCurveTo(19, -12, 17, -28, 32, -36);
            ctx.bezierCurveTo(39, -31, 43, -25, 44, -18); ctx.bezierCurveTo(32, -21, 24, -7, 13, 6); ctx.closePath();
            ctx.shadowColor = '#00040b'; ctx.shadowBlur = 4; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 2;
            ctx.fillStyle = blade; ctx.fill(); ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
            ctx.strokeStyle = '#c5eff239'; ctx.lineWidth = 0.8; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(13, -3); ctx.bezierCurveTo(25, -14, 25, -27, 34, -33);
            ctx.strokeStyle = '#e8ffff85'; ctx.lineWidth = 0.7; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(15, 2); ctx.bezierCurveTo(27, -8, 34, -21, 43, -18);
            ctx.strokeStyle = '#152a39b0'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
        }
        ctx.restore();
        // Stationary safety struts sit above the spinning blades.
        for (let i = 0; i < 3; i++) {
            const a = -Math.PI / 2 + i * Math.PI * 2 / 3;
            ctx.beginPath(); ctx.moveTo(Math.cos(a) * 13, Math.sin(a) * 13); ctx.lineTo(Math.cos(a) * 47, Math.sin(a) * 47);
            ctx.strokeStyle = '#07111db8'; ctx.lineWidth = 3; ctx.stroke(); ctx.strokeStyle = '#b2d5df32'; ctx.lineWidth = 0.7; ctx.stroke();
        }
        const hub = ctx.createRadialGradient(-5, -6, 1, 0, 0, 15);
        hub.addColorStop(0, '#c4dce3'); hub.addColorStop(0.38, '#6b8d9c'); hub.addColorStop(0.75, '#263d4c'); hub.addColorStop(1, '#06101b');
        circle(ctx, 0, 0, 15); ctx.fillStyle = hub; ctx.fill(); ctx.strokeStyle = '#adcdd857'; ctx.lineWidth = 0.8; ctx.stroke();
        circle(ctx, 0, 0, 9); ctx.fillStyle = '#06121e'; ctx.fill();
        circle(ctx, 0, 0, 6.5); ctx.fillStyle = charge > 0.95 ? C.gold : C.cyan; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8 + charge * 5; ctx.fill(); ctx.shadowBlur = 0;
        circle(ctx, -1.5, -2, 2); ctx.fillStyle = '#efffffbd'; ctx.fill();
        for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; bolt(ctx, Math.cos(a) * 62, Math.sin(a) * 62, 2.5); }
        for (let i = 0; i < 40; i++) {
            const a = -Math.PI / 2 + i * Math.PI / 20;
            ctx.strokeStyle = i / 40 < charge ? '#a4fff5b0' : '#637f914a'; ctx.lineWidth = i % 5 ? 0.7 : 1.2;
            ctx.beginPath(); ctx.moveTo(Math.cos(a) * 55, Math.sin(a) * 55); ctx.lineTo(Math.cos(a) * (i % 5 ? 56.5 : 58), Math.sin(a) * (i % 5 ? 56.5 : 58)); ctx.stroke();
        }
        ctx.strokeStyle = '#02101c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 52.5, 0, Math.PI * 2); ctx.stroke();
        if (charge > 0) {
            ctx.strokeStyle = charge > 0.95 ? C.gold : C.cyan; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 5; ctx.lineWidth = 2;
            if (charge === 1) circle(ctx, 0, 0, 52.5);
            else { ctx.beginPath(); ctx.arc(0, 0, 52.5, -Math.PI / 2, -Math.PI / 2 + charge * Math.PI * 2); }
            ctx.stroke(); ctx.shadowBlur = 0;
        }
        ctx.strokeStyle = '#e9ffff35'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, 44, -2.7, -1.1); ctx.stroke();
        for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
            ctx.fillStyle = '#020911'; ctx.fillRect(side * 63 - 2, -10 + i * 7, 4, 3);
            ctx.fillStyle = charge > i / 3 ? C.cyan + 'a0' : '#3a566b'; ctx.fillRect(side * 63 - 1.5, -9.5 + i * 7, 2, 1);
        }
        ctx.restore();
    }
    function tank(ctx, x, y, w, h, level, color, now) {
        level = Math.max(0, Math.min(1, level));
        ctx.save(); panel(ctx, x, y, w, h, '#587180', true);
        const left = x + 8, top = y + 17, innerW = w - 16, innerH = h - 34, bottom = top + innerH, surface = bottom - innerH * level;
        const metal = ctx.createLinearGradient(x, y, x + w, y);
        metal.addColorStop(0, '#111e2c'); metal.addColorStop(0.07, '#92a9b3'); metal.addColorStop(0.12, '#344c5a');
        metal.addColorStop(0.35, '#5c7683'); metal.addColorStop(0.7, '#263e4d'); metal.addColorStop(0.9, '#718f9d'); metal.addColorStop(1, '#101d2a');
        for (const capY of [y + 3, y + h - 15]) {
            rounded(ctx, x + 3, capY, w - 6, 12, 3); ctx.fillStyle = metal; ctx.fill(); ctx.strokeStyle = '#bad7df35'; ctx.lineWidth = 0.8; ctx.stroke();
            ctx.fillStyle = '#030b1699'; ctx.fillRect(x + 12, capY + 4, w - 24, 4);
            ctx.fillStyle = color + 'ac'; ctx.fillRect(x + w / 2 - 8, capY + 5, 16, 1.5);
            bolt(ctx, x + 8, capY + 6, 1.7); bolt(ctx, x + w - 8, capY + 6, 1.7);
        }
        ctx.fillStyle = '#091321'; ctx.fillRect(x + w / 2 - 7, y - 2, 14, 5); ctx.fillRect(x + w / 2 - 7, y + h - 3, 14, 5);
        ctx.fillStyle = '#607f8e'; ctx.fillRect(x + w / 2 - 5, y - 1, 10, 1); ctx.fillRect(x + w / 2 - 5, y + h, 10, 1);
        rounded(ctx, left, top, innerW, innerH, 8); ctx.fillStyle = '#020711'; ctx.fill(); ctx.strokeStyle = '#829ba65e'; ctx.lineWidth = 1; ctx.stroke();
        ctx.save(); ctx.clip();
        const chamber = ctx.createLinearGradient(left, top, left + innerW, top);
        chamber.addColorStop(0, '#01040a'); chamber.addColorStop(0.18, '#0b1a28'); chamber.addColorStop(0.5, '#102231'); chamber.addColorStop(0.83, '#08131f'); chamber.addColorStop(1, '#01040a');
        ctx.fillStyle = chamber; ctx.fillRect(left, top, innerW, innerH);
        const amplitude = Math.min(1, level * 18, (1 - level) * 18) * 1.7;
        const waveY = (dx, back = false) => surface + (back ? -1.8 : 0) + amplitude * (Math.sin(dx / 18 + now / 440 + (back ? 2 : 0)) + 0.5 * Math.sin(dx / 9 - now / 680));
        const liquidPath = (back = false) => {
            ctx.beginPath(); ctx.moveTo(left, bottom + 1); ctx.lineTo(left, waveY(0, back));
            for (let dx = 0; dx < innerW; dx += 2) ctx.lineTo(left + dx, waveY(dx, back));
            ctx.lineTo(left + innerW, waveY(innerW, back)); ctx.lineTo(left + innerW, bottom + 1); ctx.closePath();
        };
        if (level > 0) {
            liquidPath(true); ctx.fillStyle = color + '42'; ctx.fill(); liquidPath();
            const liquid = ctx.createLinearGradient(left, surface, left, bottom);
            liquid.addColorStop(0, color + 'e8'); liquid.addColorStop(0.08, color + 'be'); liquid.addColorStop(0.65, color + '8c'); liquid.addColorStop(1, color + '5c');
            ctx.fillStyle = liquid; ctx.fill(); ctx.save(); ctx.clip();
            const volume = ctx.createLinearGradient(left, top, left + innerW, top);
            volume.addColorStop(0, '#001019b0'); volume.addColorStop(0.19, '#00101920'); volume.addColorStop(0.48, color + '28'); volume.addColorStop(0.76, '#00101910'); volume.addColorStop(1, '#000710af');
            ctx.fillStyle = volume; ctx.fillRect(left, surface - 5, innerW, innerH + 5);
            for (let i = 0; i < 3; i++) {
                const xx = left + innerW * (0.25 + i * 0.25), sway = Math.sin(now / 1200 + i * 2) * 6;
                ctx.beginPath(); ctx.moveTo(xx, bottom); ctx.bezierCurveTo(xx - sway, bottom - innerH * level * 0.3, xx + sway, surface + innerH * level * 0.2, xx, surface);
                ctx.strokeStyle = '#e5fff910'; ctx.lineWidth = 1.2; ctx.stroke();
            }
            for (let i = 0; i < 13; i++) {
                const rise = (now / (2500 + i % 4 * 650) + i * 0.173) % 1;
                const xx = left + 10 + ((i * 31) % (innerW - 20)) + Math.sin(now / 900 + i) * 2;
                const yy = bottom - rise * innerH * level, radius = 1 + i % 3 * 0.65;
                if (yy < surface + 5 || yy > bottom - 3) continue;
                const bubble = ctx.createRadialGradient(xx - 0.4, yy - 0.6, 0, xx, yy, radius);
                bubble.addColorStop(0, '#e6ffff47'); bubble.addColorStop(0.55, color + '04'); bubble.addColorStop(1, '#dbfff973');
                circle(ctx, xx, yy, radius); ctx.fillStyle = bubble; ctx.fill();
                circle(ctx, xx - radius * 0.3, yy - radius * 0.4, radius * 0.23); ctx.fillStyle = '#eaffff8a'; ctx.fill();
            }
            const baseGlow = ctx.createRadialGradient(left + innerW * 0.5, bottom + 4, 1, left + innerW * 0.5, bottom + 4, innerW * 0.7);
            baseGlow.addColorStop(0, color + '5c'); baseGlow.addColorStop(1, color + '00'); ctx.fillStyle = baseGlow; ctx.fillRect(left, bottom - 40, innerW, 40);
            ctx.restore();
            ctx.beginPath(); ctx.moveTo(left, waveY(0));
            for (let dx = 0; dx < innerW; dx += 2) ctx.lineTo(left + dx, waveY(dx));
            ctx.lineTo(left + innerW, waveY(innerW)); ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.shadowColor = color; ctx.shadowBlur = 5; ctx.stroke(); ctx.shadowBlur = 0;
            ctx.strokeStyle = '#edffff70'; ctx.lineWidth = 0.5; ctx.stroke();
        }
        // Reflections stay in front of both the air pocket and the moving fluid.
        const glass = ctx.createLinearGradient(left, top, left + innerW, top);
        glass.addColorStop(0, '#c4f7ff00'); glass.addColorStop(0.07, '#c4f7ff22'); glass.addColorStop(0.12, '#efffff36'); glass.addColorStop(0.19, '#efffff0c');
        glass.addColorStop(0.52, '#ffffff00'); glass.addColorStop(0.87, '#c4f7ff04'); glass.addColorStop(0.94, '#e4ffff28'); glass.addColorStop(1, '#00051060');
        ctx.fillStyle = glass; ctx.fillRect(left, top, innerW, innerH);
        ctx.fillStyle = '#deffff06'; ctx.beginPath(); ctx.moveTo(left, top + 24); ctx.lineTo(left + innerW, top + 5); ctx.lineTo(left + innerW, top + 24); ctx.lineTo(left, top + 43); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#e4ffff3c'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(left + 4, top + 8); ctx.lineTo(left + 4, bottom - 9); ctx.stroke();
        for (let i = 1; i < 10; i++) {
            const yy = bottom - i * innerH / 10;
            ctx.strokeStyle = i === 5 ? '#ecffff85' : '#b0d5df4a'; ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(left + innerW - (i === 5 ? 11 : 6), yy); ctx.lineTo(left + innerW - 1, yy); ctx.stroke();
        }
        ctx.restore();
        for (const railX of [x + 4, x + w - 5]) {
            ctx.fillStyle = '#7297a32e'; ctx.fillRect(railX, top + 2, 1, innerH - 4);
            for (let i = 0; i < 4; i++) { ctx.fillStyle = '#020914'; ctx.fillRect(railX - 1, top + 25 + i * 55, 3, 7); ctx.fillStyle = '#79949d5c'; ctx.fillRect(railX - 1, top + 25 + i * 55, 1, 5); }
        }
        const indicatorY = Math.max(top + 3, Math.min(bottom - 3, surface));
        ctx.beginPath(); ctx.moveTo(x + w - 2, indicatorY - 3); ctx.lineTo(x + w - 6, indicatorY); ctx.lineTo(x + w - 2, indicatorY + 3); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
        ctx.restore();
    }
    function conduits(ctx, layout, pilots, now) {
        ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        for (let i = 0; i < pilots.length; i++) {
            const r = layout.tanks[i], side = i ? 1 : -1, edge = i ? r.x + r.w + 2 : r.x - 2;
            const path = () => { ctx.beginPath(); ctx.moveTo(layout.sideCenter + side * 42, 183); ctx.lineTo(layout.sideCenter + side * 42, 205); ctx.lineTo(edge, 205); ctx.lineTo(edge, 280); ctx.lineTo(i ? r.x + r.w - 4 : r.x + 4, 280); };
            path(); ctx.strokeStyle = '#030a13'; ctx.lineWidth = 5; ctx.stroke();
            path(); ctx.strokeStyle = '#4c65726b'; ctx.lineWidth = 3; ctx.stroke();
            path(); ctx.strokeStyle = pilots[i].color + '3a'; ctx.lineWidth = 1; ctx.stroke();
            for (const yy of [215, 264]) { ctx.fillStyle = '#58717e'; ctx.fillRect(edge - 2.5, yy, 5, 2); }
            circle(ctx, edge, 205, 3); ctx.fillStyle = '#132b39'; ctx.fill(); ctx.strokeStyle = '#78949f91'; ctx.lineWidth = 1; ctx.stroke();
            const dotY = 213 + (now / 35 + i * 25) % 48;
            ctx.fillStyle = pilots[i].color + '94'; ctx.fillRect(edge - 0.6, dotY, 1.2, 3);
        }
        ctx.restore();
    }
    function hoodedPortrait(ctx, x, y, color) {
        ctx.save(); ctx.translate(x, y);
        const halo = ctx.createRadialGradient(0, -10, 10, 0, -10, 156);
        halo.addColorStop(0, color + '28'); halo.addColorStop(1, color + '00'); ctx.fillStyle = halo; ctx.fillRect(-158, -164, 316, 310);
        ctx.strokeStyle = color + '28'; ctx.lineWidth = 1;
        for (const radius of [105, 118]) { circle(ctx, 0, -10, radius); ctx.stroke(); }
        for (let i = 0; i < 32; i++) {
            const a = i * Math.PI / 16; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 123, -10 + Math.sin(a) * 123);
            ctx.lineTo(Math.cos(a) * (i % 4 ? 126 : 132), -10 + Math.sin(a) * (i % 4 ? 126 : 132)); ctx.stroke();
        }
        const cloak = ctx.createLinearGradient(-95, -115, 75, 115);
        cloak.addColorStop(0, '#5a7181'); cloak.addColorStop(0.25, '#293c50'); cloak.addColorStop(0.5, '#182534'); cloak.addColorStop(0.78, '#0c1421'); cloak.addColorStop(1, '#344a5b');
        ctx.beginPath(); ctx.moveTo(0, -127); ctx.bezierCurveTo(-43, -119, -79, -83, -83, -20);
        ctx.lineTo(-111, 34); ctx.quadraticCurveTo(-138, 67, -150, 119); ctx.lineTo(150, 119);
        ctx.quadraticCurveTo(138, 67, 111, 34); ctx.lineTo(83, -20); ctx.bezierCurveTo(79, -83, 43, -119, 0, -127); ctx.closePath();
        ctx.fillStyle = cloak; ctx.shadowColor = '#00050b'; ctx.shadowBlur = 15; ctx.shadowOffsetY = 8; ctx.fill(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.strokeStyle = color + '74'; ctx.lineWidth = 1.3; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -115); ctx.quadraticCurveTo(-65, -85, -68, -12); ctx.lineTo(-37, 53); ctx.lineTo(-83, -20); ctx.quadraticCurveTo(-75, -91, 0, -127); ctx.closePath();
        ctx.fillStyle = '#76909d35'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, -115); ctx.quadraticCurveTo(65, -85, 68, -12); ctx.lineTo(37, 53); ctx.lineTo(83, -20); ctx.quadraticCurveTo(75, -91, 0, -127); ctx.closePath();
        ctx.fillStyle = '#040c1770'; ctx.fill();
        const voidShade = ctx.createRadialGradient(0, -35, 6, 0, -35, 76);
        voidShade.addColorStop(0, '#01040a'); voidShade.addColorStop(0.72, '#030812'); voidShade.addColorStop(1, '#14212f');
        ctx.beginPath(); ctx.moveTo(0, -102); ctx.bezierCurveTo(-34, -86, -55, -54, -56, -12);
        ctx.quadraticCurveTo(-50, 23, 0, 55); ctx.quadraticCurveTo(50, 23, 56, -12); ctx.bezierCurveTo(55, -54, 34, -86, 0, -102); ctx.closePath();
        ctx.fillStyle = voidShade; ctx.fill(); ctx.strokeStyle = '#8fa5b333'; ctx.lineWidth = 1; ctx.stroke();
        for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(side * 80, -14); ctx.lineTo(side * 37, 53); ctx.lineTo(side * 69, 119); ctx.lineTo(side * 111, 34); ctx.closePath();
            ctx.fillStyle = side < 0 ? '#455d6d5c' : '#0208125c'; ctx.fill();
            ctx.beginPath(); ctx.moveTo(side * 101, 39); ctx.lineTo(side * 70, 107); ctx.moveTo(side * 118, 62); ctx.lineTo(side * 98, 119);
            ctx.strokeStyle = '#a3bdc02e'; ctx.lineWidth = 1; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(side * 8, -116); ctx.quadraticCurveTo(side * 70, -82, side * 73, -20);
            ctx.strokeStyle = color + '6b'; ctx.lineWidth = 1.3; ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(-37, 53); ctx.lineTo(0, 73); ctx.lineTo(37, 53); ctx.lineTo(21, 119); ctx.lineTo(-21, 119); ctx.closePath(); ctx.fillStyle = '#050d17'; ctx.fill();
        ctx.strokeStyle = '#647d8e49'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 78); ctx.lineTo(0, 119); ctx.stroke();
        ctx.restore();
    }
    const UI = {
        layout() {
            const gameW = 1280 * mode.GAMEPLAY_FRACTION, sideW = 1280 - gameW;
            const tankW = (sideW - 50) / 2, center = gameW / 2;
            return { gameW, center, sideW, sideCenter: gameW + sideW / 2,
                frame: { x: gameW + 5, y: 9, w: sideW - 12, h: 702 },
                tanks: [gameW + 18, gameW + 32 + tankW].map(x => ({ x, y: 274, w: tankW, h: 267, cx: x + tankW / 2 })),
                leave: { x: gameW + 26, y: 656, w: sideW - 52, h: 30 },
                modal: { x: center - 370, y: 232, w: 740, h: 250 },
                primary: { x: center - 215, y: 385, w: 430, h: 48 },
                confirm: { x: center - 228, y: 385, w: 220, h: 48 },
                cancel: { x: center + 8, y: 385, w: 220, h: 48 } };
        },
        leaveLayout() {
            const center = this.layout().center;
            return { modal: { x: center - 230, y: 254, w: 460, h: 212 },
                leave: { x: center - 206, y: 393, w: 202, h: 40 },
                stay: { x: center + 4, y: 393, w: 202, h: 40 } };
        },
        leavePopup(ctx, state) {
            const progress = state.leavePopupProgress();
            if (progress <= 0) return;
            const l = this.leaveLayout(), r = l.modal, center = r.x + r.w / 2;
            ctx.save(); ctx.globalAlpha *= progress;
            ctx.fillStyle = '#020711b8'; ctx.fillRect(0, 0, this.layout().gameW, 720);
            if (!reducedMotion) {
                ctx.translate(center, r.y + r.h / 2 + (1 - progress) * 12);
                ctx.scale(0.95 + progress * 0.05, 0.95 + progress * 0.05);
                ctx.translate(-center, -r.y - r.h / 2);
            }
            ctx.shadowColor = '#00040b'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
            panel(ctx, r.x, r.y, r.w, r.h, '#668c99'); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
            trace(ctx, [[r.x + 15, r.y + 1], [r.x + 92, r.y + 1]], C.pink, 2);
            trace(ctx, [[r.x + r.w - 92, r.y + r.h - 1], [r.x + r.w - 15, r.y + r.h - 1]], C.cyan, 2);
            const iconX = r.x + 34, iconY = r.y + 27;
            ctx.beginPath(); ctx.moveTo(iconX, iconY - 10); ctx.lineTo(iconX + 11, iconY + 8); ctx.lineTo(iconX - 11, iconY + 8); ctx.closePath();
            ctx.fillStyle = '#ff789f18'; ctx.fill(); ctx.strokeStyle = C.pink; ctx.lineWidth = 1; ctx.stroke();
            text(ctx, '!', iconX, iconY + 1, 12, C.pink, 'center');
            text(ctx, 'FORFEIT CONFIRMATION', r.x + 56, r.y + 27, 10, C.muted);
            heading(ctx, 'LEAVE RACE?', center, r.y + 62, 23, C.text, r.w - 48);
            text(ctx, 'Your opponent will win.\nThe race continues while this is open.', center, r.y + 102, 14, C.muted, 'center', r.w - 48);
            button(ctx, 'LEAVE RACE', l.leave, state.leavePopup.selected === 'leave', false, true, C.pink);
            button(ctx, 'KEEP PLAYING', l.stay, state.leavePopup.selected === 'stay', false, true);
            text(ctx, '← → SELECT     ENTER CONFIRM     ESC BACK', center, r.y + 194, 9, C.muted, 'center', r.w - 48);
            ctx.restore();
        },
        hoverLeave(ctx, state, x, y) {
            if (!state.confirmLeave) return;
            x *= 1280 / ctx.canvas.width; y *= 720 / ctx.canvas.height;
            const l = this.leaveLayout();
            if (inside(x, y, l.leave)) state.leavePopup.selected = 'leave';
            else if (inside(x, y, l.stay)) state.leavePopup.selected = 'stay';
        },
        intro(ctx, state) {
            const remaining = Math.max(0, state.match.startsAt - state.serverNow()), age = Math.max(0, 3000 - remaining);
            const arrive = reducedMotion ? 1 : 1 - Math.pow(1 - Math.min(1, age / 600), 3), exit = smooth((age - 2520) / 480);
            const players = state.match.players || [state.me, state.opponent];
            background(ctx);
            const wash = ctx.createLinearGradient(80, 0, 1200, 0);
            wash.addColorStop(0, '#67f5e010'); wash.addColorStop(0.49, '#67f5e000'); wash.addColorStop(0.51, '#ff789f00'); wash.addColorStop(1, '#ff789f10');
            ctx.fillStyle = wash; ctx.fillRect(28, 24, 1224, 672);
            heading(ctx, 'PVP', 640, 72, 40);
            text(ctx, state.ai ? 'ENGINE RACE / VS AI' : 'ENGINE RACE / LOCAL DUEL', 640, 110, 12, C.muted, 'center', 440);
            // Arcade energy radiates into the armour instead of flashing the picture.
            const pulse = reducedMotion ? 0 : Math.floor(age / 150);
            for (const side of [-1, 1]) for (const vertical of [-1, 1]) {
                const color = side < 0 ? C.cyan : C.pink, points = [];
                for (let i = 0; i < 9; i++) {
                    const t = i / 8, jitter = i === 0 || i === 8 ? 0 : Math.sin(i * 5.7 + pulse) * 12;
                    points.push([640 + side * (65 + t * 515), 358 + vertical * (25 + t * 240) + jitter]);
                }
                energy(ctx, points, color, 0.75);
                for (let i = 0; i < 7; i++) {
                    const d = 92 + i * 18, yy = 358 + vertical * (20 + i * 18);
                    trace(ctx, [[640 + side * d, yy], [640 + side * (d + 25), yy + vertical * 17]], color + (i % 2 ? '64' : '24'), i % 2 ? 2 : 1);
                }
            }
            for (let i = 0; i < 2; i++) {
                const side = i ? 1 : -1, color = i ? C.pink : C.cyan, x = (i ? 726 : 82) + (reducedMotion ? 0 : side * ((1 - arrive) * 230 + exit * 40));
                ctx.save(); ctx.globalAlpha = arrive * (1 - exit * 0.6);
                panel(ctx, x, 143, 472, 432, color + '80');
                ctx.fillStyle = color + '08'; shape(ctx, x + 8, 151, 456, 416, 8); ctx.fill();
                trace(ctx, [[x + 12, 192], [x + 12, 160], [x + 44, 160]], color, 2);
                trace(ctx, [[x + 460, 526], [x + 460, 558], [x + 428, 558]], color, 2);
                ctx.fillStyle = color + '18'; shape(ctx, x + 158, 157, 156, 35, 6); ctx.fill();
                text(ctx, 'PLAYER ' + (i + 1), x + 236, 175, 14, color, 'center', 140);
                text(ctx, i ? state.ai ? 'CIRCUIT INTELLIGENCE' : 'REMOTE CHALLENGER' : 'LOCAL INFILTRATOR', x + 236, 209, 11, C.muted, 'center', 300);
                hoodedPortrait(ctx, x + 236, 355, color);
                ctx.fillStyle = '#030a14b0'; shape(ctx, x + 22, 496, 428, 61, 8); ctx.fill();
                trace(ctx, [[x + 22, 496], [x + 450, 496]], color + '70');
                text(ctx, players[i].name, x + 236, 527, 24, C.text, 'center', 390);
                ctx.fillStyle = color; ctx.fillRect(x + 206, 553, 60, 2);
                ctx.restore();
            }
            // Deterministic jagged branches animate without flashing the whole screen.
            const flash = reducedMotion ? 0 : Math.floor(age / 150), points = Array.from({ length: 15 }, (_, i) => ({
                x: 640 + (i === 0 || i === 14 ? 0 : Math.sin(i * 8.73 + flash * 2.19) * 24), y: 130 + i * 33.5,
            }));
            const lightning = () => { ctx.beginPath(); points.forEach((p, i) => { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); };
            ctx.save(); ctx.lineJoin = 'round'; ctx.shadowColor = C.cyan; ctx.shadowBlur = 20;
            lightning(); ctx.strokeStyle = '#67f5e026'; ctx.lineWidth = 12; ctx.stroke();
            lightning(); ctx.strokeStyle = '#8bf4ff92'; ctx.lineWidth = 4; ctx.stroke();
            lightning(); ctx.strokeStyle = '#efffff'; ctx.lineWidth = 1.3; ctx.stroke();
            for (const i of [4, 10]) {
                const p = points[i], side = i === 4 ? -1 : 1; ctx.beginPath(); ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x + side * 38, p.y + 16); ctx.lineTo(p.x + side * 25, p.y + 31); ctx.lineTo(p.x + side * 61, p.y + 57);
                ctx.strokeStyle = '#b6fbff8a'; ctx.lineWidth = 1; ctx.stroke();
            }
            ctx.restore();
            const coreGlow = ctx.createRadialGradient(640, 358, 4, 640, 358, 120);
            coreGlow.addColorStop(0, '#67f5e035'); coreGlow.addColorStop(0.5, '#ff789f0c'); coreGlow.addColorStop(1, '#05091400');
            ctx.fillStyle = coreGlow; ctx.fillRect(520, 238, 240, 240);
            ctx.save(); ctx.translate(640, 358); const zoom = 0.8 + arrive * 0.2; ctx.scale(zoom, zoom);
            versusMark(ctx, 0, 0, 66); ctx.restore();
            text(ctx, 'CHARGE  /  OUTPLAY  /  IGNITE', 640, 598, 11, C.muted, 'center', 480);
            text(ctx, remaining > 0 ? 'STARTING IN ' + Math.ceil(remaining / 1000) : 'ENTERING ARENA', 640, 630, 14, C.text, 'center', 460);
            for (let i = 0; i < 3; i++) { ctx.fillStyle = age >= (i + 1) * 900 ? C.cyan : '#314859'; shape(ctx, 589 + i * 37, 652, 28, 4, 1); ctx.fill(); }
            // Both effects fit inside the host's countdown; no extra local start delay.
            this.fade(ctx, Math.max(1 - smooth(age / 420), exit));
        },
        fade(ctx, opacity) {
            if (opacity <= 0) return;
            ctx.save(); ctx.globalAlpha *= Math.min(1, opacity); ctx.fillStyle = '#030710'; ctx.fillRect(0, 0, 1280, 720); ctx.restore();
        },
        circuitTransition(ctx, state) {
            const closing = state.gameplayRevealAt === null;
            const amount = closing ? smooth((Date.now() - state.roundTransitionAt) / mode.ROUND_CLOSE_MS)
                : 1 - smooth((Date.now() - state.gameplayRevealAt) / mode.ROUND_OPEN_MS);
            if (amount <= 0) return;
            const w = this.layout().gameW, cover = w * amount / 2;
            ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, 720); ctx.clip();
            for (const side of [-1, 1]) {
                const x = side < 0 ? 0 : w - cover, edge = side < 0 ? cover : w - cover;
                const shade = ctx.createLinearGradient(x, 0, x + cover, 720);
                shade.addColorStop(0, '#07131e'); shade.addColorStop(1, '#02060c');
                ctx.fillStyle = shade; ctx.fillRect(x, 0, cover, 720);
                if (amount < 0.99) {
                    ctx.shadowColor = side < 0 ? C.cyan : C.pink; ctx.shadowBlur = 8;
                    ctx.fillStyle = ctx.shadowColor; ctx.fillRect(edge - 1, 0, 2, 720);
                }
            }
            ctx.restore();
        },
        race(ctx, state) {
            if (!state.match || !state.me || !state.opponent) return;
            ctx.save(); ctx.setTransform(ctx.canvas.width / 1280, 0, 0, ctx.canvas.height / 720, 0, 0);
            if (state.match.status === 'countdown' && !state.error) {
                this.intro(ctx, state);
                if (state.isLeavePopupVisible()) this.leavePopup(ctx, state);
                ctx.restore(); return;
            }
            const now = Date.now(), me = state.me, other = state.opponent, match = state.match, l = this.layout(), f = l.frame;
            ctx.fillStyle = C.bg; ctx.fillRect(l.gameW, 0, l.sideW, 720); panel(ctx, f.x, f.y, f.w, f.h, '#496573', true);
            trace(ctx, [[f.x + 8, 182], [f.x + 8, 27], [f.x + 23, 12], [l.sideCenter - 12, 12]], C.cyan + '80', 1.4);
            trace(ctx, [[f.x + f.w - 8, 182], [f.x + f.w - 8, 27], [f.x + f.w - 23, 12], [l.sideCenter + 12, 12]], C.pink + '80', 1.4);
            heading(ctx, 'ENGINE RACE', l.sideCenter, 35, 17, C.text, f.w - 30);
            text(ctx, 'FIRST TO ' + match.target + ' CHARGE', l.sideCenter, 64, 11, C.muted, 'center', f.w - 28);
            const elapsed = Math.min(80, Math.max(1, now - (state.levelAt || now))); state.levelAt = now;
            for (const p of [me, other]) {
                let target = p.progress;
                for (const bomb of state.animations) if (bomb.to === p.id && now - bomb.startedAt < 760) target = Math.min(match.target, target + bomb.damage);
                const before = state.levels[p.id] === undefined ? target : state.levels[p.id];
                state.levels[p.id] = before + (target - before) * (1 - Math.exp(-elapsed / 240));
            }
            const pilots = [{ p: me, r: l.tanks[0], color: C.cyan, tag: 'YOU' }, { p: other, r: l.tanks[1], color: C.pink, tag: state.ai ? 'AI' : 'RIVAL' }];
            conduits(ctx, l, pilots, now);
            const charge = Math.max(0, Math.min(1, state.levels[me.id] / match.target));
            state.rotorAngle = ((state.rotorAngle || 0) + elapsed * (0.00035 + charge * 0.003)) % (Math.PI * 2);
            ctx.save(); ctx.translate(l.sideCenter, 142); ctx.scale(0.88, 0.88);
            engine(ctx, 0, 0, charge, now, state.rotorAngle); ctx.restore();
            for (const { p, r, color, tag } of pilots) {
                ctx.fillStyle = color + '15'; shape(ctx, r.x + 4, 214, r.w - 8, 25, 4); ctx.fill();
                text(ctx, tag, r.cx, 226, 12, color, 'center', r.w - 12); text(ctx, p.name, r.cx, 253, 14, C.text, 'center', r.w + 4);
                tank(ctx, r.x, r.y, r.w, r.h, state.levels[p.id] / match.target, color, now);
                text(ctx, p.progress + ' / ' + match.target, r.cx, 557, 14, color, 'center', r.w + 4);
                const attacking = state.animations.some(bomb => bomb.from === p.id && now - bomb.startedAt < 760);
                const attackCharge = attacking ? 3 : p.attackCharge || 0;
                for (let i = 0; i < 3; i++) {
                    ctx.fillStyle = i < attackCharge ? color : '#1e2d3b'; shape(ctx, r.cx - 31 + i * 23, 580, 17, 5, 2); ctx.fill();
                }
                text(ctx, attacking ? 'ATTACK!' : attackCharge + ' / 3 ATTACK', r.cx, 600, 11, color, 'center', r.w + 4);
            }
            text(ctx, 'WIN +1 / LOSS −1\n3 WINS → BOMB / −' + match.bombDamage, l.sideCenter, 628.5, 12, C.muted, 'center', f.w - 20);
            button(ctx, 'LEAVE RACE', l.leave, false, false, true);
            ctx.save(); ctx.beginPath(); ctx.rect(l.gameW, 0, l.sideW, 720); ctx.clip();
            for (const bomb of state.animations) {
                const age = now - bomb.startedAt, fromX = l.tanks[bomb.from === me.id ? 0 : 1].cx, toX = l.tanks[bomb.to === me.id ? 0 : 1].cx;
                if (age < 760) {
                    const t = age / 760, x = fromX + (toX - fromX) * t, y = 360 - Math.sin(t * Math.PI) * 92;
                    for (let i = 1; i < 5; i++) { ctx.fillStyle = '#ffe091' + ['b0', '80', '40', '20'][i - 1]; ctx.beginPath(); ctx.arc(x - (toX - fromX) / 18 * i, y + i * 2, 4 - i * 0.5, 0, Math.PI * 2); ctx.fill(); }
                    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 8); ctx.fillStyle = '#172436'; ctx.strokeStyle = C.gold; ctx.lineWidth = 2;
                    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = C.pink; ctx.fillRect(-4, -17, 8, 8); ctx.restore();
                } else {
                    const t = Math.min(1, (age - 760) / 850); ctx.save(); ctx.globalAlpha = 1 - t;
                    ctx.strokeStyle = C.gold; ctx.lineWidth = 4 * (1 - t); ctx.beginPath(); ctx.arc(toX, 360, 8 + t * 64, 0, Math.PI * 2); ctx.stroke();
                    for (let i = 0; i < 18; i++) { const a = i * 2.399, d = t * (38 + i * 3); ctx.fillStyle = i % 2 ? C.pink : C.gold; ctx.fillRect(toX + Math.cos(a) * d, 360 + Math.sin(a) * d + t * t * 30, 4, 4); }
                    text(ctx, '−' + bomb.damage, toX, 360 - t * 40, 26, C.pink, 'center'); ctx.restore();
                }
            }
            ctx.restore();
            if (state.offlineSince) text(ctx, 'RECONNECTING…', l.sideCenter, 697, 10, C.gold, 'center');
            if (state.isLeavePopupVisible()) this.leavePopup(ctx, state);
            else if (state.error) this.overlay(ctx, 'RACE INTERRUPTED', state.error, 'BACK TO PVP / ENTER');
            else if (match.status === 'finished') {
                const won = match.winnerId === me.id;
                this.overlay(ctx, won ? 'ENGINE ONLINE / VICTORY' : 'RIVAL ENGINE ONLINE',
                    match.finishReason === 'opponent-left' ? (won ? 'Your opponent left the race.' : 'You left the race.') : me.wins + ' wins · ' + me.mistakes + ' mistakes · ' + me.progress + ' charge', 'BACK TO PVP / ENTER', false, won ? state : null);
            }
            // Reveal the actual gameplay from the same dark frame used by the intro.
            if (match.status === 'racing' && !state.isLeavePopupVisible() && !state.error) {
                if (state.roundTransitionAt != null) this.circuitTransition(ctx, state);
                else this.fade(ctx, state.gameplayRevealAt == null ? 1 : 1 - smooth((now - state.gameplayRevealAt) / 420));
            }
            ctx.restore();
        },
        overlay(ctx, title, detail, action, cancel = false, certificateState = null) {
            const l = this.layout(), r = l.modal;
            ctx.fillStyle = '#030711e8'; ctx.fillRect(0, 0, l.gameW, 720);
            panel(ctx, r.x, r.y, r.w, r.h, C.cyan, true);
            heading(ctx, title, l.center, 282, 25, C.cyan, 680);
            text(ctx, detail, l.center, 332, 15, C.muted, 'center', 680);
            button(ctx, action, cancel ? l.confirm : certificateState ? l.cancel : l.primary, !certificateState);
            if (cancel) button(ctx, 'KEEP PLAYING / ESC', l.cancel, false);
            if (certificateState) {
                button(ctx, certificateState.certificateBusy ? 'CREATING PDF…' : 'DOWNLOAD CERTIFICATE', l.confirm, true, certificateState.certificateBusy);
                if (certificateState.certificateNotice) text(ctx, certificateState.certificateNotice, l.center, 458, 12, certificateState.certificateError ? C.gold : C.cyan, 'center', r.w - 35);
            }
        },
        click(ctx, state, x, y) {
            if (state.exitTransition || state.closing) return true;
            x *= 1280 / ctx.canvas.width; y *= 720 / ctx.canvas.height;
            const l = this.layout();
            if (state.isLeavePopupVisible()) {
                if (!state.confirmLeave || state.leavePopupProgress() < 0.99) return true;
                const popup = this.leaveLayout();
                if (inside(x, y, popup.leave)) state.requestLeave();
                else if (inside(x, y, popup.stay)) state.setLeaveConfirmation(false);
                return true;
            }
            if (state.match && state.match.status === 'countdown' && !state.confirmLeave && !state.error) return true;
            if (state.confirmLeave || state.error || (state.match && state.match.status === 'finished')) {
                const certificate = !state.confirmLeave && !state.error && state.match.status === 'finished' && state.match.winnerId === state.me.id;
                if (certificate && inside(x, y, l.confirm)) state.downloadCertificate();
                else if (inside(x, y, certificate ? l.cancel : l.primary)) state.requestLeave();
                return true;
            }
            if (inside(x, y, l.leave)) { state.setLeaveConfirmation(true); return true; }
            return false;
        },
    };
    IP2Live.PVPUI = UI;

    class PVPRace extends Scene.Base {
        constructor() { super(true); }
        initialize() {}
        async load() {
            if (IP2Live.Assets && IP2Live.Assets.loadFonts && (!IP2Live.Assets.oxaniumMediumLoaded || !IP2Live.Assets.nebulaLoaded))
                await IP2Live.Assets.loadFonts(Common.Platform.ROOT_DIRECTORY);
            const music = IP2Live.MusicManager;
            if (music && music.ZONE) music.play(music.ZONE.PVP_RACE || music.ZONE.GAMEPLAY_56);
            this.loading = false;
        }
        update() { mode.tick(); }
        draw3D() { if (Manager.GL && Manager.GL.renderer) Manager.GL.renderer.clear(); }
        drawHUD() {
            if (mode.match.status === 'countdown' && !mode.error) { UI.race(Common.Platform.ctx, mode); return; }
            const ctx = Common.Platform.ctx; ctx.save(); ctx.setTransform(ctx.canvas.width / 1280, 0, 0, ctx.canvas.height / 720, 0, 0);
            ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 1280, 720);
            if (mode.transitionFrame) {
                const v = mode.viewport(ctx);
                ctx.drawImage(mode.transitionFrame, v.x * 1280 / ctx.canvas.width, v.y * 720 / ctx.canvas.height,
                    v.w * 1280 / ctx.canvas.width, v.h * 720 / ctx.canvas.height);
            }
            ctx.restore(); UI.race(ctx, mode);
        }
        onKeyPressed(key) {
            if (mode.exitTransition || mode.closing) return true;
            if (mode.isLeavePopupVisible()) return mode.handleLeavePopupKey(key);
            const code = key && typeof key === 'object' ? key.code || key.key : key;
            if ((code === 67 || /^(KeyC|c)$/i.test(String(code))) && !mode.confirmLeave && mode.canDownloadCertificate()) { mode.downloadCertificate(); return true; }
            if (Data.Keyboards.checkCancelMenu(key)) { if (mode.ending || mode.error) mode.requestLeave(); else mode.setLeaveConfirmation(true); }
            else if (Data.Keyboards.checkActionMenu(key) && (mode.error || mode.match.status === 'finished')) mode.requestLeave();
            return true;
        }
        onKeyPressedAndRepeat(key) { if (mode.isLeavePopupVisible()) mode.handleLeavePopupKey(key, true); return true; }
        onMouseMove(x, y) { if (mode.isLeavePopupVisible()) UI.hoverLeave(Common.Platform.ctx, mode, x, y); }
        onMouseUp(x, y) { return UI.click(Common.Platform.ctx, mode, x, y); }
    }

    class PVPExitTransition extends Scene.Base {
        constructor() {
            super(false);
            this.phase = 'out'; this.startedAt = Date.now(); this.duration = reducedMotion ? 160 : 320;
            this.loading = false; this.blackPainted = false; this.cleanupStarted = false; this.closed = false;
            const canvas = Common.Platform.ctx.canvas;
            this.frame = document.createElement('canvas'); this.frame.width = canvas.width; this.frame.height = canvas.height;
            this.frame.getContext('2d').drawImage(canvas, 0, 0);
            this.target = mode.menu;
        }
        update() {
            const elapsed = Date.now() - this.startedAt;
            if (this.phase === 'out' && elapsed >= this.duration) this.phase = 'hold';
            else if (this.phase === 'hold' && this.blackPainted && !this.cleanupStarted) {
                this.cleanupStarted = true;
                mode.leave(this).then(() => {
                    if (this.closed) return;
                    this.phase = 'in'; this.startedAt = Date.now();
                    if (this.target) this.target.openedAt = Date.now() - 360;
                }).catch(error => {
                    console.warn('[IP2Live] Race exit failed:', error);
                    if (!this.closed) { this.phase = 'in'; this.startedAt = Date.now(); this.target = Manager.Stack.subTop; }
                });
            } else if (this.phase === 'in' && elapsed >= this.duration && Manager.Stack.top === this) {
                Manager.Stack.pop(); this.close();
            }
            Manager.Stack.requestPaintHUD = true;
        }
        draw3D() { if (Manager.GL && Manager.GL.renderer) Manager.GL.renderer.clear(); }
        drawHUD() {
            const ctx = Common.Platform.ctx;
            ctx.save(); ctx.setTransform(ctx.canvas.width / 1280, 0, 0, ctx.canvas.height / 720, 0, 0);
            if (this.phase === 'hold') {
                ctx.fillStyle = C.bg; ctx.fillRect(0, 0, 1280, 720); this.blackPainted = true;
            } else {
                if (this.phase === 'in' && this.target) this.target.drawHUD();
                else ctx.drawImage(this.frame, 0, 0, 1280, 720);
                const t = smooth((Date.now() - this.startedAt) / this.duration), cover = this.phase === 'in' ? 1 - t : t;
                if (reducedMotion) UI.fade(ctx, cover);
                else for (const side of [-1, 1]) {
                    const w = 640 * cover, x = side < 0 ? 0 : 1280 - w, edge = side < 0 ? w : x;
                    ctx.fillStyle = '#030911'; ctx.fillRect(x, 0, w, 720);
                    if (cover > 0 && cover < 0.99) {
                        ctx.fillStyle = side < 0 ? C.cyan : C.pink; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
                        ctx.fillRect(edge - 1, 0, 2, 720); ctx.shadowBlur = 0;
                    }
                }
            }
            ctx.restore();
        }
        close() {
            if (this.moving) return;
            this.closed = true;
            if (mode.exitTransition === this) mode.exitTransition = null;
            if (this.frame) { this.frame.width = this.frame.height = 0; this.frame = null; }
        }
        onKeyPressed() { return true; }
        onKeyPressedAndRepeat() { return true; }
        onKeyReleased() { return true; }
        onMouseDown() { return true; }
        onMouseMove() { return true; }
        onMouseUp() { return true; }
    }

    class PVPMenu extends Scene.Base {
        constructor() { super(true); }
        initialize() {
            this.page = 'home'; this.lobbies = []; this.lobby = null; this.notice = ''; this.busy = false; this.selected = 0;
            this.playerId = null; this.nextPoll = 0; this.polling = false; this.closed = false; this.inputs = {};
            this.hovered = -1; this.keyboardFocus = false; this.cardMotion = [0, 0, 0]; this.cardRotor = [0, 0, 0]; this.animationAt = Date.now();
            this.openedAt = Date.now(); this.focusedInput = null;
            this.reportProfile = IP2Live.FeatureTelemetry ? IP2Live.FeatureTelemetry.profile() : null;
            try { this.pilot = localStorage.getItem('ip2live.pvp.pilot') || 'Pilot'; } catch { this.pilot = 'Pilot'; }
            this.address = ''; this.hostAddress = '';
        }
        async load() {
            if (IP2Live.Assets) await IP2Live.Assets.loadAll();
            this.restoreMusic(); this.openedAt = Date.now(); this.loading = false;
        }
        restoreMusic() {
            const music = IP2Live.MusicManager;
            if (music && music.ZONE) music.play(music.ZONE.PVP_MENU || music.ZONE.MAIN_MENU);
        }
        _buttons() {
            const back = this.page === 'home' ? { id: 'back', label: 'BACK', x: 70, y: 74, w: 38, h: 38 }
                : { id: 'back', label: 'BACK TO PVP', x: 70, y: 634, w: 190, h: 42 };
            if (this.page === 'home') return [
                { id: 'create', label: 'CREATE LOBBY', x: 70, y: 266, w: 365, h: 300 },
                { id: 'browse', label: 'JOIN LOBBY', x: 457, y: 266, w: 365, h: 300 },
                { id: 'ai', label: 'VS AI', x: 844, y: 266, w: 365, h: 300 },
                { id: 'tutorials', label: 'GO THROUGH TUTORIALS', x: 460, y: 608, w: 360, h: 36 }, back,
            ];
            if (this.page === 'browse') return [
                { id: 'refresh', label: 'REFRESH', x: 1009, y: 126, w: 200, h: 40 },
                ...this.lobbies.slice(0, 4).map((lobby, i) => ({ id: 'join:' + i, label: lobby.name, x: 70, y: 202 + i * 61, w: 1139, h: 51, disabled: lobby.players >= 2 })),
                { id: 'direct', label: 'JOIN BY ADDRESS', x: 939, y: 510, w: 270, h: 43 }, back,
            ];
            if (this.page === 'lobby') {
                const self = this.lobby.players.find(p => p.id === this.playerId), host = this.lobby.hostId === this.playerId;
                return [{ id: 'ready', label: self && self.ready ? 'READY ✓ / UNREADY' : 'READY UP', x: 676, y: 540, w: 255, h: 52 },
                    { id: 'start', label: host ? 'START RACE' : 'WAITING FOR HOST', x: 954, y: 540, w: 255, h: 52,
                        disabled: !host || this.lobby.players.length !== 2 || !this.lobby.players.every(p => p.ready) }, back];
            }
            return [back];
        }
        async _run(work) {
            if (this.busy || this.closed) return;
            this.busy = true; this.notice = '';
            try { await work(); } catch (error) { if (!this.closed) this.notice = error.message || String(error); }
            finally { this.busy = false; Manager.Stack.requestPaintHUD = true; }
        }
        _activate(id) {
            if (this.busy) return;
            const bridge = mode.bridge(), button = this._buttons().find(b => b.id === id);
            if (button && button.disabled) return;
            this._readInputs();
            try { localStorage.setItem('ip2live.pvp.pilot', this.pilot); } catch {}
            if (id === 'back') {
                if (this.page !== 'home') return this._run(async () => { if (this.lobby && bridge) await bridge.leave(); this.lobby = null; this.page = 'home'; this.selected = 0; this._hideInputs(); });
                this.closed = true; this._hideInputs();
                const music = IP2Live.MusicManager;
                if (music && music.ZONE) music.play(music.ZONE.MAIN_MENU);
                if (IP2Live.MenuTransition) IP2Live.MenuTransition.back(); else Manager.Stack.pop();
                return;
            }
            if (id === 'ai') { this._hideInputs(); mode.startAI(this, this.pilot); return; }
            if (id === 'tutorials') {
                this._hideInputs();
                if (!IP2Live.PracticeMode || !IP2Live.PracticeMode.launchCourse(this)) this.notice = 'The tutorial walkthrough could not be opened. Please try again.';
                return;
            }
            if (!bridge) { this.notice = 'LAN lobbies need the updated IP2Live desktop app. VS AI is available here.'; return; }
            this._run(async () => {
                if (id === 'create') {
                    const joined = await bridge.create({ name: this.pilot }); this.lobby = joined.lobby; this.playerId = joined.playerId; this.hostAddress = ''; this.page = 'lobby'; this.selected = 0; this._hideInputs();
                } else if (id === 'browse' || id === 'refresh') {
                    this.page = 'browse'; this.selected = 0; this.lobbies = await bridge.discover();
                    if (!this.lobbies.length) this.notice = 'No lobbies found. Try the host’s Wi-Fi address below, or refresh.';
                } else if (id.startsWith('join:') || id === 'direct') {
                    const address = id === 'direct' ? this.address.trim() : this.lobbies[Number(id.slice(5))].address;
                    const joined = await bridge.join({ name: this.pilot, address }); this.lobby = joined.lobby; this.playerId = joined.playerId; this.hostAddress = address; this.page = 'lobby'; this.selected = 0; this._hideInputs();
                } else if (id === 'ready') {
                    const self = this.lobby.players.find(p => p.id === this.playerId); this.lobby = await bridge.ready({ ready: !self.ready });
                } else if (id === 'start') { this.lobby = await bridge.start(); this._begin(); }
            });
        }
        _begin() { if (!mode.active && this.lobby && this.lobby.match) { this._hideInputs(); mode.start(this.lobby, this.playerId, this); } }
        update() {
            const now = Date.now();
            const elapsed = Math.min(64, Math.max(0, now - this.animationAt)); this.animationAt = now;
            for (let i = 0; i < 3; i++) {
                const target = !this.busy && (this.hovered === i || this.keyboardFocus && this.selected === i) ? 1 : 0;
                this.cardMotion[i] += (target - this.cardMotion[i]) * (1 - Math.exp(-elapsed / 110));
                this.cardRotor[i] = (this.cardRotor[i] + elapsed * (0.0004 + this.cardMotion[i] * 0.0024)) % (Math.PI * 2);
            }
            if (this.page === 'lobby' && !mode.active && !this.polling && !this.busy && now >= this.nextPoll && !this.closed) {
                this.polling = true; this.nextPoll = now + 600;
                const id = this.lobby.id;
                mode.bridge().poll().then(lobby => {
                    if (this.closed || !this.lobby || this.lobby.id !== id) return;
                    if (Number(lobby.revision) >= Number(this.lobby.revision)) this.lobby = lobby;
                    this.notice = ''; this._begin();
                }).catch(error => { if (!this.closed && this.lobby && this.lobby.id === id) this.notice = 'Lobby connection lost. ' + error.message; })
                    .finally(() => { this.polling = false; });
            }
            Manager.Stack.requestPaintHUD = true;
        }
        _readInputs() { if (this.inputs.pilot) this.pilot = this.inputs.pilot.value.trim().slice(0, 24) || 'Pilot'; if (this.inputs.address) this.address = this.inputs.address.value; }
        _hideInputs() { this._readInputs(); for (const input of Object.values(this.inputs)) input.remove(); this.inputs = {}; this.focusedInput = null; }
        _input(key, rect, placeholder) {
            inputWell(Common.Platform.ctx, rect, this.focusedInput === key, key);
            if (IP2Live.MenuTransition && IP2Live.MenuTransition.active || mode.exitTransition) {
                this._hideInputs();
                text(Common.Platform.ctx, this[key] || placeholder, rect.x + 49, rect.y + rect.h / 2, 17, C.text, 'left', rect.w - 64);
                return;
            }
            if (typeof document === 'undefined' || !document.body) return;
            let input = this.inputs[key];
            if (!input) {
                input = document.createElement('input'); input.type = 'text'; input.value = this[key] || ''; input.maxLength = key === 'pilot' ? 24 : 32;
                input.placeholder = placeholder; input.setAttribute('aria-label', key === 'pilot' ? 'Pilot name' : 'Host local IP address and port'); input.autocomplete = 'off'; input.spellcheck = false;
                Object.assign(input.style, { position: 'fixed', zIndex: '20', boxSizing: 'border-box', background: 'transparent', color: C.text,
                    border: '0', borderRadius: '0', outline: 'none', padding: '0', fontFamily: BODY_FONT,
                    caretColor: C.cyan, textShadow: '0 1px 2px #0008' });
                input.addEventListener('focus', () => { this.focusedInput = key; Manager.Stack.requestPaintHUD = true; });
                input.addEventListener('blur', () => { if (this.focusedInput === key) this.focusedInput = null; Manager.Stack.requestPaintHUD = true; });
                input.addEventListener('input', () => { this[key] = input.value; });
                input.addEventListener('keydown', event => { event.stopPropagation(); if (event.key === 'Enter') { input.blur(); if (key === 'address') this._activate('direct'); } if (event.key === 'Escape') input.blur(); });
                input.addEventListener('keyup', event => event.stopPropagation()); document.body.appendChild(input); this.inputs[key] = input;
            }
            const canvas = Common.Platform.ctx.canvas, bounds = canvas.getBoundingClientRect();
            const fontSize = Math.max(12, 17 * bounds.width / 1280), fieldHeight = (rect.h - 16) * bounds.height / 720;
            Object.assign(input.style, { left: bounds.left + (rect.x + 49) * bounds.width / 1280 + 'px', top: bounds.top + (rect.y + 8) * bounds.height / 720 + 'px',
                width: (rect.w - 64) * bounds.width / 1280 + 'px', height: (rect.h - 16) * bounds.height / 720 + 'px',
                fontSize: fontSize + 'px', lineHeight: Math.min(fieldHeight, fontSize * BODY_LEADING) + 'px', opacity: smooth((Date.now() - this.openedAt) / 360) });
        }
        onKeyPressed(key) {
            if (Data.Keyboards.checkCancelMenu(key)) this._activate('back');
            else if (Data.Keyboards.checkActionMenu(key)) { const b = this._buttons()[this.selected]; if (b) this._activate(b.id); }
            return true;
        }
        onKeyPressedAndRepeat(key) {
            const controls = Data.Keyboards.menuControls;
            this.keyboardFocus = true; this.hovered = -1;
            if (['Left', 'Up'].some(k => Data.Keyboards.isKeyEqual(key, controls[k]))) this.selected = (this.selected + this._buttons().length - 1) % this._buttons().length;
            else if (['Right', 'Down'].some(k => Data.Keyboards.isKeyEqual(key, controls[k]))) this.selected = (this.selected + 1) % this._buttons().length;
            return true;
        }
        onMouseMove(x, y) {
            x *= 1280 / Common.Platform.ctx.canvas.width; y *= 720 / Common.Platform.ctx.canvas.height;
            const i = this._buttons().findIndex(r => inside(x, y, r)); this.hovered = i; this.keyboardFocus = false;
            if (i >= 0) this.selected = i;
        }
        onMouseUp(x, y) { x *= 1280 / Common.Platform.ctx.canvas.width; y *= 720 / Common.Platform.ctx.canvas.height; const b = this._buttons().find(r => inside(x, y, r)); if (b) this._activate(b.id); }
        draw3D() { if (Manager.GL && Manager.GL.renderer) Manager.GL.renderer.clear(); }
        drawHUD() {
            if (mode.active || IP2Live.PracticeMode && IP2Live.PracticeMode.active && IP2Live.PracticeMode.course) { this._hideInputs(); return; }
            const ctx = Common.Platform.ctx; ctx.save(); ctx.setTransform(ctx.canvas.width / 1280, 0, 0, ctx.canvas.height / 720, 0, 0); background(ctx);
            if (this.page === 'home') {
                heading(ctx, 'PVP ARENA', 640, 92, 34, C.text, 900);
                text(ctx, 'ENGINE RACE  /  EVERY CONNECTION COUNTS', 640, 132, 12, C.muted, 'center', 760);
                const light = ctx.createLinearGradient(380, 0, 900, 0);
                light.addColorStop(0, '#67f5e000'); light.addColorStop(0.5, '#9fc6ec80'); light.addColorStop(1, '#ff789f00');
                ctx.fillStyle = light; ctx.fillRect(380, 145, 520, 1);
            } else {
                heading(ctx, 'PVP / ENGINE RACE', 70, 67, 30, C.text, 950, 'left');
                text(ctx, this.page === 'browse' ? 'LOBBY DISCOVERY / SAME WI-FI OR LOCAL NETWORK' : 'TWO-PILOT LOBBY', 70, 104, 12, C.muted);
            }
            if (this.page === 'home' || this.page === 'browse') {
                if (this.page === 'home') {
                    this._input('pilot', { x: 440, y: 158, w: 400, h: 46 }, 'Player name');
                    text(ctx, this.reportProfile ? 'PROGRESS PROFILE: ' + this.reportProfile.infiltratorName + '  /  LOAD YOUR STORY TO CHANGE'
                        : 'START OR LOAD YOUR STORY TO LINK PVP RESULTS TO YOUR LEARNING REPORT', 640, 218, 10, C.muted, 'center', 1040);
                }
                else { text(ctx, 'PILOT NAME', 70, 136, 11, C.cyan); this._input('pilot', { x: 185, y: 115, w: 250, h: 42 }, 'Pilot'); }
                if (this.page !== 'browse' && this.inputs.address) { this.inputs.address.remove(); delete this.inputs.address; }
            }
            const buttons = this._buttons();
            if (this.page === 'home') {
                buttons.slice(0, 3).forEach((b, i) => {
                    const motion = this.cardMotion[i]; ctx.save(); ctx.translate(0, -motion * 9);
                    ctx.save(); ctx.globalAlpha = motion; ctx.shadowColor = C.cyan; ctx.shadowBlur = 18;
                    shape(ctx, b.x, b.y, b.w, b.h); ctx.strokeStyle = C.cyan; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
                    panel(ctx, b.x, b.y, b.w, b.h, motion > 0.05 ? C.cyan : '#3c566a');
                    const accent = i === 2 ? C.pink : C.cyan;
                    text(ctx, '0' + (i + 1), b.x + 23, b.y + 27, 11, accent);
                    text(ctx, ['HOST', 'CONNECT', 'CHALLENGE'][i], b.x + b.w - 23, b.y + 27, 11, C.muted, 'right', 150);
                    trace(ctx, [[b.x + 13, b.y + 60], [b.x + 13, b.y + 13], [b.x + 67, b.y + 13]], accent + 'b0', 1.3);
                    ctx.save(); shape(ctx, b.x + 4, b.y + 4, b.w - 8, b.h - 8, 8); ctx.clip();
                    const shine = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
                    shine.addColorStop(0, '#67f5e000'); shine.addColorStop(0.5, '#67f5e021'); shine.addColorStop(1, '#67f5e000');
                    ctx.globalAlpha = motion; ctx.fillStyle = shine; ctx.fillRect(b.x, b.y, b.w, b.h); ctx.restore();
                    engine(ctx, b.x + b.w / 2, b.y + 110, [0.2, 0.4, 0.75][i] + motion * 0.2, Date.now(), this.cardRotor[i]);
                    text(ctx, b.label, b.x + b.w / 2, b.y + 232, 20, motion > 0.05 ? C.cyan : C.text, 'center', b.w - 36);
                    text(ctx, ['HOST A LOCAL DUEL', 'FIND YOUR RIVAL', 'RACE THE CIRCUIT'][i], b.x + b.w / 2, b.y + 262, 11, C.muted, 'center', b.w - 40);
                    const rail = 28 + motion * (b.w - 98); ctx.fillStyle = motion > 0.05 ? C.cyan : '#365263';
                    ctx.fillRect(b.x + (b.w - rail) / 2, b.y + b.h - 22, rail, 2); ctx.restore();
                });
            } else if (this.page === 'browse') {
                if (!this.lobbies.length) { panel(ctx, 70, 202, 1139, 229); text(ctx, this.busy ? 'SEARCHING THE LOCAL NETWORK…' : 'NO LOBBIES FOUND YET', 639, 290, 22, C.muted, 'center'); text(ctx, 'The host should choose Create Lobby. Both devices must share the same network.', 639, 335, 15, C.muted, 'center'); }
                text(ctx, 'DIRECT CONNECTION / HOST ADDRESS', 70, 477, 12, C.cyan); this._input('address', { x: 70, y: 510, w: 845, h: 43 }, '192.168.1.12:43872');
                text(ctx, 'Use the host’s Wi-Fi or Ethernet address. Include the port shown in their lobby.', 70, 578, 14, C.muted);
            } else if (this.page === 'lobby') {
                text(ctx, this.lobby.name, 70, 148, 24, C.cyan);
                const host = this.lobby.hostId === this.playerId;
                const options = this.lobby.connectionOptions || (this.lobby.addresses || []).map(address => ({ label: 'Local network', address }));
                text(ctx, host ? 'SHARE YOUR LOCAL ADDRESS' + (options[0] ? ' / ' + options[0].label.toUpperCase() : '') : 'CONNECTED TO HOST', 70, 191, 12, C.muted);
                text(ctx, host ? (options[0] && options[0].address || 'Connect this device to Wi-Fi to share a local address.') : this.hostAddress || (options[0] && options[0].address || ''), 70, 220, 21, C.text, 'left', 1130);
                const connectionHint = host && this.lobby.discoveryAvailable === false ? 'Discovery unavailable. The other pilot can join using the address above.'
                    : host && options.length > 1 ? 'Other adapters: ' + options.slice(1).map(option => option.label + ' / ' + option.address).join('   ·   ') : '';
                if (connectionHint) text(ctx, connectionHint, 70, 246, 12, C.muted, 'left', 1130);
                for (let i = 0; i < 2; i++) {
                    const p = this.lobby.players[i], x = 70 + i * 583, color = i ? C.pink : C.cyan;
                    panel(ctx, x, 268, 556, 229, p ? color : '#364755');
                    text(ctx, i ? '02 / CHALLENGER' : '01 / HOST', x + 25, 305, 12, color);
                    text(ctx, p ? p.name : 'WAITING FOR A PILOT', x + 25, 363, 27, p ? C.text : C.muted, 'left', 505);
                    text(ctx, p ? (p.ready ? '● READY' : '○ NOT READY') : 'Your lobby appears on nearby devices.', x + 25, 436, 17, p && p.ready ? C.cyan : C.muted);
                }
                text(ctx, 'Both pilots must be ready. The host starts the race.', 70, 558, 15, C.muted, 'left', 555);
                text(ctx, 'Same local network required. Guest Wi-Fi isolation may prevent connections.', 70, 607, 13, C.muted);
            }
            buttons.forEach((b, i) => {
                if (this.page === 'home' && i < 3) return;
                if (this.page === 'home' && b.id === 'back') {
                    ctx.save(); circle(ctx, b.x + 19, b.y + 19, 18); ctx.fillStyle = '#0b1c2b'; ctx.fill();
                    ctx.strokeStyle = this.hovered === i || this.keyboardFocus && i === this.selected ? C.cyan : '#3c566a'; ctx.lineWidth = 1; ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(b.x + 23, b.y + 11); ctx.lineTo(b.x + 15, b.y + 19); ctx.lineTo(b.x + 23, b.y + 27);
                    ctx.strokeStyle = C.text; ctx.lineWidth = 1.8; ctx.stroke(); ctx.restore(); return;
                }
                button(ctx, b.label, b, i === this.selected, b.disabled || this.busy, this.page === 'home' && b.id === 'tutorials');
                if (b.id.startsWith('join:')) { const lobby = this.lobbies[Number(b.id.slice(5))]; text(ctx, lobby.players + '/2 PILOTS', b.x + b.w - 20, b.y + b.h / 2, 12, lobby.players < 2 ? C.cyan : C.muted, 'right'); }
            });
            if (this.notice) text(ctx, this.notice, 1210, 661, 13, C.gold, 'right', 910);
            else if (this.busy) text(ctx, 'CONNECTING…', 1210, 661, 13, C.cyan, 'right');
            UI.fade(ctx, 1 - smooth((Date.now() - this.openedAt) / 360));
            ctx.restore();
        }
    }
    IP2Live.PVPRace = PVPRace; IP2Live.PVPMenu = PVPMenu; IP2Live.PVPExitTransition = PVPExitTransition;
})();
