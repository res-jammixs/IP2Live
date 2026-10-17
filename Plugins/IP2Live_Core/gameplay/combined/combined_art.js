/** Canvas artwork matching the game's machined, polygonal terminal panels. */
(function () {
    function polygon(ctx, points, fill, stroke) {
        ctx.beginPath(); ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
        ctx.closePath();
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
    }
    function gradient(ctx, x, y, w, h, colors) {
        const g = ctx.createLinearGradient(x, y, x + w, y + h);
        colors.forEach((color, i) => g.addColorStop(i / (colors.length - 1), color)); return g;
    }
    function chamfer(ctx, x, y, w, h, cut = 12) {
        ctx.beginPath(); ctx.moveTo(x + cut, y); ctx.lineTo(x + w - cut, y);
        ctx.lineTo(x + w, y + cut); ctx.lineTo(x + w, y + h - cut);
        ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x + cut, y + h);
        ctx.lineTo(x, y + h - cut); ctx.lineTo(x, y + cut); ctx.closePath();
    }
    const art = {
        polygon, gradient, chamfer, _toolbox: null, _texture: null,
        texture() {
            if (this._texture) return this._texture;
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
            const ctx = canvas.getContext('2d');
            for (let y = 0; y < 96; y++) {
                ctx.fillStyle = y % 4 === 0 ? 'rgba(142,200,209,0.045)' : 'rgba(0,0,0,0.035)';
                ctx.fillRect(0, y, 96, 1);
                for (let x = 0; x < 96; x += 3) {
                    const grain = ((x * 73856093 ^ y * 19349663) >>> 0) % 37;
                    if (grain < 3) { ctx.fillStyle = 'rgba(205,235,244,0.055)'; ctx.fillRect(x, y, 1, 1); }
                }
            }
            this._texture = canvas; return canvas;
        },
        panel(ctx, r, accent, selected = false, scale = 1) {
            const { x, y, w, h } = r, cut = 12 * scale;
            ctx.save(); ctx.lineWidth = scale;
            // Extruded faces, filled armour plates and inset bevels give the
            // silhouette depth without relying on a rectangular outline.
            chamfer(ctx, x + 4 * scale, y + 6 * scale, w, h, cut);
            ctx.fillStyle = '#02060d'; ctx.fill();
            chamfer(ctx, x, y, w, h, cut);
            ctx.fillStyle = gradient(ctx, x, y, w, h, selected ? ['#50606a', '#1c3d48', '#080f19'] : ['#344653', '#17222d', '#080e17']); ctx.fill();
            chamfer(ctx, x + 3 * scale, y + 3 * scale, w - 6 * scale, h - 6 * scale, cut - scale);
            ctx.fillStyle = gradient(ctx, x, y, 0, h, selected ? ['#183541', '#111e2e', '#091420'] : ['#152432', '#0a1521', '#07101a']); ctx.fill();
            ctx.save(); ctx.clip();
            const pattern = ctx.createPattern(this.texture(), 'repeat');
            if (pattern) { ctx.fillStyle = pattern; ctx.fillRect(x, y, w, h); }
            polygon(ctx, [[x + w * .58, y], [x + w, y], [x + w, y + h * .55], [x + w * .8, y + h]], 'rgba(89,126,144,0.045)');
            for (let i = 0; i < 5; i++) polygon(ctx, [[x + w - (14 + i * 12) * scale, y + h], [x + w - (8 + i * 12) * scale, y + h - 12 * scale], [x + w - (3 + i * 12) * scale, y + h - 12 * scale], [x + w - (9 + i * 12) * scale, y + h]], 'rgba(131,175,193,0.1)');
            ctx.restore();
            polygon(ctx, [[x + cut, y], [x + w * .43, y], [x + w * .43 - 5 * scale, y + 4 * scale], [x + cut - 3 * scale, y + 4 * scale]], accent);
            polygon(ctx, [[x, y + cut], [x + 4 * scale, y + cut - 4 * scale], [x + 4 * scale, y + h - cut], [x, y + h - cut]], selected ? '#ff315f' : '#673044');
            polygon(ctx, [[x + w - cut, y + h], [x + w - 42 * scale, y + h], [x + w - 38 * scale, y + h - 4 * scale], [x + w - cut + 2 * scale, y + h - 4 * scale]], accent);
            for (const [bx, by] of [[x + 10 * scale, y + h - 10 * scale], [x + w - 10 * scale, y + 10 * scale]]) {
                ctx.fillStyle = '#050b11'; ctx.beginPath(); ctx.arc(bx, by, 3 * scale, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = '#46616e'; ctx.beginPath(); ctx.moveTo(bx - scale, by - scale); ctx.lineTo(bx + scale, by + scale); ctx.stroke();
            }
            ctx.restore();
        },
        toolbox(ctx, x, y, size) {
            if (!this._toolbox) {
                const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
                const c = canvas.getContext('2d');
                c.save(); c.translate(128, 124); c.lineWidth = 2;
                // A wrench and insulated driver protrude from the equipment case.
                c.save(); c.translate(-42, -40); c.rotate(-.38);
                polygon(c, [[-9, 24], [-9, -45], [-21, -59], [-21, -76], [-10, -88], [-10, -65], [9, -65], [9, -88], [21, -76], [21, -59], [9, -45], [9, 24]], gradient(c, -20, -90, 35, 110, ['#effaff', '#6e909c', '#1c343e', '#9dc6d0']), '#a8d5dd');
                c.fillStyle = '#142b34'; c.fillRect(-3, -40, 5, 56); c.restore();
                c.save(); c.translate(36, -55); c.rotate(.3);
                polygon(c, [[-5, -68], [5, -68], [7, -48], [5, -16], [-5, -16], [-7, -48]], '#b9d4df', '#e2f6fb');
                polygon(c, [[-12, -17], [12, -17], [17, -7], [17, 34], [9, 44], [-9, 44], [-17, 34], [-17, -7]], gradient(c, -15, -20, 30, 60, ['#ffac9f', '#ed365c', '#6a132c']), '#ff8d98');
                for (let k = 0; k < 4; k++) { c.fillStyle = '#591b2d'; c.fillRect(-10, -1 + k * 9, 20, 3); } c.restore();
                polygon(c, [[-38, -37], [-38, -70], [-26, -82], [29, -82], [40, -70], [40, -37], [26, -37], [26, -64], [-23, -64], [-23, -37]], gradient(c, -38, -80, 70, 35, ['#9fb8c4', '#20313f', '#4b7181']), '#9bbcc8');
                c.shadowColor = '#00eaff'; c.shadowBlur = 15;
                polygon(c, [[-96, -35], [64, -35], [95, -12], [95, 68], [68, 87], [-84, 87], [-103, 69], [-103, -17]], '#041923');
                c.shadowBlur = 0;
                polygon(c, [[-95, -35], [64, -35], [88, -14], [-73, -14], [-103, -17]], gradient(c, -95, -35, 175, 25, ['#a9e2e8', '#426d7b', '#d1eef1']), '#a9ebed');
                polygon(c, [[-103, -17], [-73, -14], [-73, 86], [-88, 84], [-103, 69]], gradient(c, -103, 0, 35, 65, ['#2b5666', '#0b2433', '#183b4a']), '#53818e');
                polygon(c, [[-73, -14], [88, -14], [95, -7], [95, 68], [68, 87], [-73, 87]], gradient(c, -70, -10, 145, 105, ['#315969', '#132f40', '#061623', '#315264']), '#6f9daa');
                polygon(c, [[-66, -5], [82, -5], [82, 15], [-66, 15]], gradient(c, -60, -5, 0, 22, ['#6f9fac', '#203f4d', '#0b1d2c']));
                polygon(c, [[-66, 21], [81, 21], [81, 63], [65, 77], [-66, 77]], gradient(c, -60, 20, 120, 65, ['#184657', '#0b2534', '#102d3a']), '#345b6d');
                for (let k = 0; k < 12; k++) { c.fillStyle = k % 3 ? 'rgba(160,209,220,.055)' : 'rgba(0,0,0,.18)'; c.fillRect(-60, 26 + 4 * k, 130, 1); }
                for (const xx of [-48, 60]) {
                    polygon(c, [[xx - 8, -14], [xx + 8, -14], [xx + 8, 31], [xx - 8, 31]], '#040d15', '#6b8d9b');
                    polygon(c, [[xx - 5, -7], [xx + 5, -7], [xx + 5, 15], [xx - 5, 18]], gradient(c, xx - 5, -7, 10, 25, ['#e2edf0', '#74909d', '#304b5a']), '#b9d9e1');
                    c.fillStyle = '#f4df73'; c.fillRect(xx - 4, 22, 8, 3);
                }
                c.shadowBlur = 11; c.shadowColor = '#00f0ff';
                polygon(c, [[-23, 37], [32, 37], [24, 61], [-31, 61]], '#091922', '#6cefff');
                polygon(c, [[-13, 42], [-3, 42], [-3, 47], [4, 47], [4, 42], [14, 42], [14, 56], [-13, 56]], '#7cf5ef'); c.shadowBlur = 0;
                polygon(c, [[-103, 56], [-97, 61], [-97, 70], [-87, 80], [-73, 80], [-73, 87], [-88, 84], [-103, 69]], '#e84b68');
                polygon(c, [[80, 53], [95, 46], [95, 68], [68, 87], [53, 87], [77, 67]], '#d7c766');
                c.strokeStyle = '#d8ffff'; c.lineWidth = 2; c.beginPath(); c.moveTo(-88, -30); c.lineTo(61, -30); c.lineTo(80, -14); c.stroke();
                for (const [xx, yy] of [[-89, 2], [-88, 65], [83, 5], [70, 69]]) {
                    c.fillStyle = '#91b6c3'; c.beginPath(); c.arc(xx, yy, 3, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#132935'; c.beginPath(); c.moveTo(xx - 2, yy); c.lineTo(xx + 2, yy); c.stroke();
                }
                c.restore(); this._toolbox = canvas;
            }
            ctx.drawImage(this._toolbox, x - size / 2, y - size / 2, size, size);
        },
        emblem(ctx, kind, x, y, size, color, glyph) {
            ctx.save();
            const r = { x: x - size / 2, y: y - size / 2, w: size, h: size };
            this.panel(ctx, r, color, false, size / 52);
            const glow = ctx.createRadialGradient(x, y, 0, x, y, size * .45);
            glow.addColorStop(0, '#214755'); glow.addColorStop(1, '#09131e');
            chamfer(ctx, r.x + size * .12, r.y + size * .12, size * .76, size * .76, size * .12); ctx.fillStyle = glow; ctx.fill();
            glyph(ctx, kind, x, y, size * .57, color);
            ctx.restore();
        },
    };
    IP2Live.CombinedArtwork = art;
})();
