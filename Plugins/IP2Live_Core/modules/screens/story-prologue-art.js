/** Deterministic Canvas illustrations and a small, separate ambient light pass.
 * Shares the main menu's infiltrator renderer, faceted metal and red/cyan light.
 * Architecture and material grain are painted once into a screen-owned cache.
 */
(function () {
    const TAU = Math.PI * 2;
    const C = { black: '#05070e', steel: '#222636', face: '#343043', red: '#ef3c60', cyan: '#6ce5d2', gold: '#e7c595' };
    const ARRIVAL_FLEET = [
        { x: 810, y: 207, scale: 1.15, large: true, delay: .2, duration: 3.1 },
        { x: 355, y: 156, scale: .24, delay: .45, duration: 2.6 },
        { x: 550, y: 244, scale: .32, delay: .05, duration: 2.9 },
        { x: 1121, y: 288, scale: .29, delay: .65, duration: 3.1 },
        { x: 1050, y: 96, scale: .16, delay: 0, duration: 2.5 },
    ];
    function arrivalShipY(definition, seconds, reducedMotion) {
        if (reducedMotion) return definition.y;
        const t = Math.max(0, Math.min(1, (seconds - definition.delay) / definition.duration));
        if (t === 1) return definition.y;
        const ease = 1 - Math.pow(1 - t, 3), start = -120 - definition.scale * 95;
        return start + (definition.y - start) * ease;
    }
    let textureCanvas;
    let painting;
    const motion = [];
    const wrap = (value, length) => (value % length + length) % length;
    function random(seed) {
        return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    }
    function poly(ctx, points, fill, stroke, width = 1) {
        ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
    }
    function line(ctx, points, color, width = 1) {
        ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    }
    function gradient(ctx, x, y, x2, y2, colors) {
        const g = ctx.createLinearGradient(x, y, x2, y2);
        colors.forEach((color, i) => g.addColorStop(i / (colors.length - 1), color)); return g;
    }
    function glow(ctx, x, y, rx, ry, color) {
        ctx.save(); ctx.translate(x, y); ctx.scale(rx, ry);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, color); g.addColorStop(1, '#00000000');
        ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2); ctx.restore();
    }
    function stencil(ctx, text, x, y, size = 9, color = '#c6d9da', align = 'left') {
        ctx.font = size + 'px "Oxanium-Medium", sans-serif'; ctx.fillStyle = color;
        ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
    }
    function texture(ctx) {
        if (!textureCanvas) {
            textureCanvas = document.createElement('canvas'); textureCanvas.width = textureCanvas.height = 256;
            const p = textureCanvas.getContext('2d'), r = random(87621);
            for (let i = 0; i < 5400; i++) {
                p.fillStyle = i % 3 ? '#b7869348' : '#00040c80';
                p.fillRect(r() * 256, r() * 256, r() * 1.3 + .4, r() * .8 + .4);
            }
            for (let i = 0; i < 120; i++) {
                p.fillStyle = '#b9c7ce12'; p.fillRect(r() * 256, r() * 256, 3 + r() * 32, .6);
            }
        }
        return ctx.createPattern(textureCanvas, 'repeat');
    }
    function material(ctx, points, fill, stroke = '#8b637145') {
        poly(ctx, points, fill, stroke);
        ctx.save(); ctx.clip(); ctx.globalAlpha *= .38;
        ctx.fillStyle = texture(ctx); ctx.fillRect(0, 0, 1280, 720); ctx.restore();
    }
    function sky(ctx, seed, kind) {
        ctx.fillStyle = gradient(ctx, 0, 0, 0, 580, kind === 0 ? ['#060913', '#151b2e', '#533443', '#182330']
            : kind === 3 ? ['#060a15', '#112333', '#20303e', '#090d17'] : ['#070914', '#241425', '#3b2535', '#0b1020']);
        ctx.fillRect(0, 0, 1280, 720);
        const r = random(seed);
        for (let i = 0; i < 210; i++) {
            const x = r() * 1280, y = r() * 330, size = .4 + r() * 1.2;
            ctx.fillStyle = i % 7 ? '#8ca3b13b' : '#edd5b291'; ctx.fillRect(x, y, size, size);
        }
        for (let i = 0; i < 9; i++) glow(ctx, r() * 1280, 110 + r() * 300, 150 + r() * 180, 20 + r() * 25,
            kind === 0 ? '#bd768617' : '#9d344019');
        glow(ctx, kind === 0 ? 680 : 920, 300, 480, 185, kind === 0 ? '#bcb1a62c' : '#f9436320');
        for (let layer = 0; layer < 3; layer++) {
            const points = [[0, 720], [0, 345 + layer * 50]];
            for (let x = 0; x <= 1320; x += 70) points.push([x, 320 + layer * 54 + r() * 65]);
            points.push([1280, 720]); poly(ctx, points, ['#172230', '#111b29', '#0b1321'][layer]);
        }
    }
    function block(ctx, x, base, w, h, depth, lit, r) {
        const roof = base - h, dx = depth, dy = -depth * .55;
        material(ctx, [[x, roof], [x + w, roof], [x + w, base], [x, base]],
            gradient(ctx, x, roof, x + w, base, ['#353443', '#191d2d', '#0e1422']));
        poly(ctx, [[x + w, roof], [x + w + dx, roof + dy], [x + w + dx, base + dy], [x + w, base]], '#0b1220', '#52707929');
        poly(ctx, [[x, roof], [x + dx, roof + dy], [x + w + dx, roof + dy], [x + w, roof]], '#3c3747', '#8f849750');
        line(ctx, [[x + 2, base - 2], [x + 2, roof + 2], [x + w - 1, roof + 2]], '#bd7f8d35');
        for (let yy = roof + 9; yy < base - 5; yy += 11) for (let xx = x + 6; xx < x + w - 4; xx += 8) {
            const on = r() < lit;
            ctx.fillStyle = on ? (r() > .22 ? '#a8d6cd70' : '#f0c69980') : '#030a125c';
            ctx.fillRect(xx, yy, 2.7, 4.5);
            if (on && painting && painting.windows.length < 38 && Math.round(xx * 7 + yy * 3) % 19 === 0) {
                painting.windows.push({ x: xx, y: yy, phase: xx * .17 + yy * .09, alpha: ctx.globalAlpha });
            }
        }
        if (w > 28) for (let i = 0; i < 3; i++) line(ctx, [[x + 5, roof + 4 + i * 3], [x + w - 5, roof + 4 + i * 3]], '#0a111e90');
        if (h > 65 && r() > .6) {
            line(ctx, [[x + w * .5, roof], [x + w * .5, roof - 14]], '#535164', .8);
            ctx.fillStyle = '#dc5a7690'; ctx.fillRect(x + w * .5 - 1, roof - 14, 2, 2);
        }
    }
    function city(ctx, seed, y, lit = .45) {
        const r = random(seed);
        for (let layer = 0; layer < 3; layer++) {
            ctx.save(); ctx.globalAlpha = [.38, .6, .95][layer];
            let x = -30;
            while (x < 1300) {
                const w = 14 + r() * (15 + layer * 10), h = 20 + r() * (55 + layer * 27);
                block(ctx, x, y + layer * 38, w, h, 4 + layer * 3, lit, r); x += w + 3 + r() * 10;
            }
            ctx.restore();
        }
        ctx.fillStyle = gradient(ctx, 0, y - 10, 0, y + 125, ['#677d9210', '#111b2520', '#050b12a0']);
        ctx.fillRect(0, y - 10, 1280, 135);
    }
    function ship(ctx, x, y, scale, large = false) {
        ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
        glow(ctx, 0, 35, 135, 50, '#ff28491c');
        material(ctx, [[-176, 8], [-76, -25], [-24, -55], [100, -43], [188, 10], [76, 47], [-65, 38]],
            gradient(ctx, -100, -50, 100, 50, ['#4f4252', '#292434', '#070e1b']), '#846071');
        poly(ctx, [[-176, 8], [-65, 38], [76, 47], [188, 10], [84, 67], [-65, 55]], '#070c17', '#ac476452');
        poly(ctx, [[-110, 7], [-30, -16], [85, -19], [132, 8], [52, 23], [-76, 18]], '#131625', '#706071');
        poly(ctx, [[-24, -55], [-11, -25], [100, -43], [188, 10], [118, -8]], '#67506644', '#b07c8840');
        line(ctx, [[-147, 18], [-62, 44], [75, 52], [157, 22]], '#f45976', 1.4);
        for (let i = 0; i < 9; i++) {
            line(ctx, [[-90 + i * 23, 12], [-81 + i * 23, 28]], '#b57d8d45');
            ctx.fillStyle = i % 3 ? '#a83e58' : '#ffc0bf'; ctx.fillRect(-90 + i * 22, 43, 8, 1.2);
        }
        for (const cx of [-64, 51]) {
            poly(ctx, [[cx - 11, 32], [cx + 18, 35], [cx + 11, 42], [cx - 17, 39]], '#438a8d', '#88c9c5');
            glow(ctx, cx, 46, 38, 20, '#71f6df35');
            if (painting) painting.emitters.push({ x, y, scale, cx, phase: x * .012 + cx * .03 });
        }
        if (large) {
            const r = random(5578);
            ctx.save(); ctx.globalAlpha = .5;
            for (let i = 0; i < 85; i++) {
                const xx = -100 + r() * 200, yy = -25 + r() * 45;
                line(ctx, [[xx, yy], [xx + 12 + r() * 14, yy]], '#b5959f45', .6);
            }
            ctx.restore();
        }
        ctx.restore();
    }
    function drone(ctx, x, y, scale = 1, beam = false) {
        if (painting) painting.beacons.push({ x, y: y + 5 * scale, scale, phase: x * .007 });
        ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
        if (beam) poly(ctx, [[-2, 8], [2, 8], [90, 170], [18, 174]],
            gradient(ctx, 0, 0, 50, 180, ['#f35c6f25', '#f35c6f00']));
        poly(ctx, [[-24, 0], [-11, -7], [12, -7], [25, 0], [9, 8], [-10, 8]], '#343143', '#91788a');
        line(ctx, [[-28, -2], [-12, -2]], '#ed8a9c', 2); line(ctx, [[12, -2], [28, -2]], '#ed8a9c', 2);
        glow(ctx, 0, 5, 15, 11, '#ff345c60'); ctx.fillStyle = '#ffd1d0'; ctx.fillRect(-2, 3, 4, 3);
        ctx.restore();
    }
    function pipe(ctx, points, width = 14, active = true, flowing = false) {
        ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        line(ctx, points.map(([x, y]) => [x + 3, y + 5]), '#01070cd0', width + 6);
        line(ctx, points, '#15202d', width + 1); line(ctx, points, '#526170', width - 2);
        line(ctx, points.map(([x, y]) => [x, y + width * .17]), '#263344', Math.max(1, width * .67));
        line(ctx, points.map(([x, y]) => [x, y - width * .27]), '#a2b7c071', Math.max(.7, width * .12));
        if (active) line(ctx, points, '#4faba57d', Math.max(1, width * .2));
        for (let i = 1; i < points.length; i++) {
            const [ax, ay] = points[i - 1], [bx, by] = points[i], distance = Math.hypot(bx - ax, by - ay);
            const count = Math.max(1, Math.ceil(distance / 82));
            for (let j = 0; j < count; j++) {
                const t = (j + .35) / count;
                ctx.save(); ctx.translate(ax + (bx - ax) * t, ay + (by - ay) * t); ctx.rotate(Math.atan2(by - ay, bx - ax));
                const ring = gradient(ctx, 0, -width / 2, 0, width / 2, ['#9aa6b1', '#394554', '#0b1521']);
                ctx.fillStyle = '#07111b'; ctx.fillRect(-4, -width / 2 - 2, 8, width + 4);
                ctx.fillStyle = ring; ctx.fillRect(-2.5, -width / 2 - 1, 5, width + 2);
                ctx.fillStyle = '#c2d2d46b'; ctx.fillRect(-1, -width / 2, 1, 2); ctx.restore();
            }
        }
        if (flowing && painting) painting.flows.push({ points, width });
        ctx.restore();
    }
    function valve(ctx, x, y, radius = 11, locked = false) {
        ctx.save(); ctx.translate(x, y);
        ctx.fillStyle = '#050c16'; ctx.beginPath(); ctx.ellipse(2, 4, radius + 4, radius + 2, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = locked ? '#ce6d7c' : '#9bb3b6'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, radius, 0, TAU); ctx.stroke();
        for (let i = 0; i < 6; i++) line(ctx, [[0, 0], [Math.cos(i * TAU / 6) * radius, Math.sin(i * TAU / 6) * radius]], '#657d86', 1.5);
        ctx.fillStyle = '#b8c9cb'; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, TAU); ctx.fill();
        if (locked) { ctx.fillStyle = '#562837'; ctx.fillRect(5, 4, 9, 11); ctx.strokeStyle = '#f18c94'; ctx.strokeRect(5, 4, 9, 11); }
        ctx.restore();
    }
    // City blocks use horizontal front edges and a -0.55 roof-depth slope.
    // Both farm beds and their channel share those same projected world axes.
    function farmPoint(u, v) { return [470 + 440 * u - 142 * v, 444 + 142 * .55 * v]; }
    function irrigationChannel(ctx) {
        const quad = (a, b, c, d) => [farmPoint(a, c), farmPoint(b, c), farmPoint(b, d), farmPoint(a, d)];
        const outer = quad(-.23, -.055, -.05, 1.07);
        const near = [outer[3], outer[2]];
        material(ctx, [near[0], near[1], [near[1][0], near[1][1] + 11], [near[0][0], near[0][1] + 11]], '#192934', '#718891');
        material(ctx, outer, '#53616b', '#a9bbc09c');
        const water = quad(-.207, -.079, -.025, 1.035);
        poly(ctx, water, gradient(ctx, 370, 438, 310, 531, ['#144050', '#2b6a83', '#112d42']), '#a2d8de68');
        ctx.save(); ctx.clip();
        for (let i = 0; i < 20; i++) {
            const v = .01 + i * .05;
            line(ctx, [farmPoint(-.2 + i % 3 * .015, v), farmPoint(-.09, v)], i % 3 ? '#c1f2ed47' : '#e8ffff86', .7);
        }
        const reflection = [farmPoint(-.19, .02), farmPoint(-.16, .02), farmPoint(-.12, 1.03), farmPoint(-.16, 1.03)];
        poly(ctx, reflection, '#c8fff316'); ctx.restore();
        for (const u of [-.23, -.055]) {
            line(ctx, [farmPoint(u, -.05), farmPoint(u, 1.07)], '#c4d6d39c', 2);
            for (const v of [.04, .43, .82]) line(ctx, [farmPoint(u - .009, v), farmPoint(u + .009, v)], '#172b38', 3);
        }
        // A mesh intake, level gauge and cross-feed explain how this is water
        // infrastructure rather than an unlabelled green rectangle.
        for (let i = 0; i < 6; i++) line(ctx, [farmPoint(-.207, .06 + i * .025), farmPoint(-.079, .06 + i * .025)], '#92adb2b0', 1.2);
        const [gx, gy] = farmPoint(-.06, .23);
        material(ctx, [[gx - 3, gy - 21], [gx + 7, gy - 21], [gx + 7, gy + 7], [gx - 3, gy + 7]], '#213c49', '#a7c4c3');
        for (let i = 0; i < 5; i++) line(ctx, [[gx, gy - 16 + i * 4], [gx + 4, gy - 16 + i * 4]], '#cae4db', .8);
        pipe(ctx, [farmPoint(-.14, .3), farmPoint(-.14, .27), farmPoint(-.025, .27)], 5, true);
    }
    function farms(ctx) {
        const point = farmPoint;
        const quad = (a, b, c, d) => [point(a, c), point(b, c), point(b, d), point(a, d)];
        material(ctx, quad(-.025, 1.025, -.06, 1.06), '#3c4141', '#b3b6a87c');
        const foundation = [point(-.025, 1.06), point(1.025, 1.06)];
        material(ctx, [foundation[0], foundation[1], [foundation[1][0], foundation[1][1] + 9], [foundation[0][0], foundation[0][1] + 9]], '#202e36', '#899c9a');
        for (let row = 0; row < 2; row++) for (let column = 0; column < 3; column++) {
            const u = column / 3 + .018, v = row / 2 + .025;
            const bed = quad(u, u + .296, v, v + .4), near = bed.slice(2).reverse();
            poly(ctx, [near[0], near[1], [near[1][0], near[1][1] + 8], [near[0][0], near[0][1] + 8]], '#17212a', '#677670');
            poly(ctx, [bed[1], bed[2], [bed[2][0], bed[2][1] + 8], [bed[1][0], bed[1][1] + 8]], '#15252e', '#657a73');
            material(ctx, bed, row ? '#302c25' : '#3d3528', '#b9b49b');
            // Furrows and individual crops replace the unexplained flat green tiles.
            for (let furrow = 0; furrow < 5; furrow++) {
                const vv = v + .04 + furrow * .07;
                line(ctx, [point(u + .015, vv), point(u + .28, vv)], '#141f1ddd', 2.4);
                for (let crop = 0; crop < 10; crop++) {
                    const [x, y] = point(u + .025 + crop * .026, vv), tall = column !== 1;
                    if (tall) {
                        const h = 5 + row * 3 + crop % 3;
                        line(ctx, [[x, y], [x + 1, y - h]], '#89905f', .75);
                        for (const side of [-1, 1]) poly(ctx, [[x + 1, y - h], [x + side * 2.3, y - h + 2], [x + .5, y - h + 4]], '#c3b982', '#8b916361', .5);
                    } else {
                        poly(ctx, [[x, y + 1], [x - 4, y - 2], [x - 3, y - 6], [x, y - 3], [x + 3, y - 7], [x + 4, y - 3]], '#537962', '#93b58a77', .5);
                    }
                }
            }
            line(ctx, [point(u, v + .4), point(u + .296, v + .4)], '#a8b6aa', 1.4);
        }
        // Low irrigation manifolds connect to the adjacent public water channel.
        pipe(ctx, [point(-.035, .01), point(-.035, 1.03), point(1.02, 1.03)], 4, true);
        for (const u of [.33, .66]) line(ctx, [point(u, -.02), point(u, 1.03)], '#b8c8b36b', 1.2);
        const [sx, sy] = point(.55, 1.13);
        line(ctx, [[sx - 38, sy], [sx - 38, sy + 10]], '#829395', 2); line(ctx, [[sx + 43, sy], [sx + 43, sy + 10]], '#829395', 2);
        material(ctx, [[sx - 48, sy - 7], [sx + 55, sy - 7], [sx + 50, sy + 7], [sx - 52, sy + 7]], '#172f32', '#6da79b');
        stencil(ctx, 'COMMUNITY FARMS', sx, sy, 8, '#c4d7c6', 'center');
    }
    function resourceContainer(ctx, x, top, kind) {
        const w = 108, bottom = 421;
        material(ctx, [[x, top + 17], [x + 17, top], [x + 93, top], [x + w, top + 17], [x + w, bottom], [x, bottom]],
            gradient(ctx, x, top, x + w, bottom, ['#60707e', '#263746', '#152431']), '#a6b5bc99');
        material(ctx, [[x + w, top + 17], [x + 124, top + 6], [x + 124, bottom - 12], [x + w, bottom]], '#0d1928', '#6e7e8e');
        poly(ctx, [[x + 17, top], [x + 32, top - 8], [x + 109, top - 8], [x + 124, top + 6], [x + w, top + 17], [x + 93, top]], '#435062', '#9cabb33d');
        for (let i = 0; i < 6; i++) line(ctx, [[x + 34 + i * 10, top - 4], [x + 42 + i * 10, top + 3]], '#101c2a', 3);
        material(ctx, [[x + 12, top + 33], [x + 97, top + 33], [x + 97, bottom - 23], [x + 12, bottom - 23]], '#071824', '#a0bdc34a');
        stencil(ctx, ['WATER', 'POWER', 'FOOD', 'MEDICINE'][kind], x + 54, top + 21, 9, '#d3e6e6', 'center');
        ctx.save(); ctx.beginPath(); ctx.rect(x + 16, top + 37, 76, bottom - top - 64); ctx.clip();
        const left = x + 22, right = x + 86, cy = top + 95;
        if (kind === 0) {
            ctx.fillStyle = gradient(ctx, left, 0, right, 0, ['#133a4b', '#438894', '#153544']); ctx.fillRect(left, top + 44, 64, 106);
            ctx.fillStyle = '#4cafa68c'; ctx.fillRect(left + 3, top + 64, 58, 80);
            ctx.fillStyle = '#a5ebd791'; ctx.beginPath(); ctx.ellipse(x + 54, top + 64, 29, 5, 0, 0, TAU); ctx.fill();
            for (let i = 0; i < 9; i++) { ctx.strokeStyle = '#b9ffe22d'; ctx.beginPath(); ctx.arc(x + 30 + i * 17 % 49, top + 78 + i * 13 % 56, 1 + i % 3, 0, TAU); ctx.stroke(); }
            line(ctx, [[left + 7, top + 49], [left + 7, top + 139]], '#c4fff247', 3);
            for (let y = top + 54; y < bottom - 25; y += 13) line(ctx, [[right - 6, y], [right - 1, y]], '#c4ddd9', 1);
        } else if (kind === 1) {
            glow(ctx, x + 54, cy, 36, 82, '#6cdbc54d');
            ctx.fillStyle = gradient(ctx, x + 40, 0, x + 68, 0, ['#254d5a', '#8fe5ce', '#244555']); ctx.fillRect(x + 40, top + 47, 28, 119);
            for (let coil = 0; coil < 9; coil++) {
                const y = top + 52 + coil * 12;
                ctx.fillStyle = '#536674'; ctx.beginPath(); ctx.ellipse(x + 54, y, 25, 5, 0, 0, TAU); ctx.fill();
                line(ctx, [[x + 31, y - 1], [x + 73, y - 1]], '#d7c8959e', 1.5);
            }
            for (const xx of [x + 24, x + 82]) { ctx.fillStyle = '#7a9099'; ctx.fillRect(xx, top + 44, 3, 123); }
        } else if (kind === 2) {
            for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
                const xx = x + 21 + col * 34, yy = top + 48 + row * 35;
                material(ctx, [[xx, yy + 3], [xx + 29, yy], [xx + 29, yy + 28], [xx, yy + 31]], '#7a7351', '#b0ad82');
                for (let slat = 0; slat < 4; slat++) line(ctx, [[xx + 3, yy + 7 + slat * 5], [xx + 25, yy + 4 + slat * 5]], '#252f27b0');
                line(ctx, [[xx + 14, yy + 4], [xx + 14, yy + 26]], '#c9c793', 1.2);
                for (let leaf = 0; leaf < 3; leaf++) line(ctx, [[xx + 14, yy + 8 + leaf * 5], [xx + 9, yy + 5 + leaf * 5]], '#d2c895', 1.1);
            }
        } else {
            for (let row = 0; row < 3; row++) {
                const yy = top + 49 + row * 38;
                ctx.fillStyle = '#677d8d'; ctx.fillRect(x + 19, yy + 26, 72, 4);
                for (let col = 0; col < 3; col++) {
                    const xx = x + 25 + col * 22;
                    material(ctx, [[xx, yy], [xx + 15, yy], [xx + 15, yy + 25], [xx, yy + 25]], '#b4c9c5', '#e7f2d18c');
                    ctx.fillStyle = '#376c70'; ctx.fillRect(xx + 3, yy + 4, 9, 2);
                    ctx.fillStyle = '#6ba799'; ctx.fillRect(xx + 6, yy + 10, 3, 10); ctx.fillRect(xx + 3, yy + 13, 9, 3);
                }
            }
        }
        // A glass highlight sits over the stored objects, behind the armoured braces.
        poly(ctx, [[x + 16, top + 37], [x + 48, top + 37], [x + 17, bottom - 27]], '#c5fff411');
        ctx.restore();
        for (const xx of [x + 6, x + 101]) {
            ctx.fillStyle = '#0b1825'; ctx.fillRect(xx - 2, top + 27, 5, bottom - top - 36);
            for (let bolt = 0; bolt < 5; bolt++) { ctx.fillStyle = '#9cabb7'; ctx.fillRect(xx - 1, top + 34 + bolt * 30, 2, 2); }
        }
        for (const yy of [top + 34, bottom - 22]) {
            ctx.fillStyle = '#324957'; ctx.fillRect(x + 9, yy, 91, 5); line(ctx, [[x + 10, yy], [x + 99, yy]], '#acbdc271');
        }
        stencil(ctx, 'APEX', x + 24, bottom - 11, 7, '#b893a7');
        ctx.fillStyle = kind === 2 ? '#c6b472' : '#72cfbd'; ctx.fillRect(x + 77, bottom - 13, 12, 2);
        for (const xx of [x + 9, x + 89]) { ctx.fillStyle = '#172534'; ctx.fillRect(xx, bottom, 10, 14); }
        pipe(ctx, [[x + 54, bottom - 3], [x + 54, 455]], 11, true);
        ctx.strokeStyle = '#9bafb8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x + 54, bottom - 3, 7, 0, TAU); ctx.stroke();
    }
    function publicWater(ctx) {
        // A familiar civic water kiosk, now dry. The APEX valve diverts its supply.
        for (const x of [49, 283]) pipe(ctx, [[x, 474], [x, 310]], 8, false);
        material(ctx, [[37, 302], [62, 286], [275, 286], [298, 304], [281, 320], [47, 320]], '#3e4550', '#a9b8b890');
        material(ctx, [[47, 304], [281, 304], [281, 324], [47, 324]], '#203238', '#647b83');
        stencil(ctx, 'PUBLIC WATER', 165, 314, 12, '#d2dfd5', 'center');
        for (let i = 0; i < 10; i++) line(ctx, [[63 + i * 21, 289], [70 + i * 21, 300]], '#798d8c4d', 2);
        material(ctx, [[139, 348], [153, 336], [207, 336], [218, 350], [218, 432], [139, 432]],
            gradient(ctx, 139, 340, 218, 430, ['#63717c', '#2a3b49', '#182534']), '#a1afb7');
        poly(ctx, [[218, 350], [230, 342], [230, 424], [218, 432]], '#101d2c', '#657e8a');
        ctx.fillStyle = '#0a1722'; ctx.fillRect(151, 351, 56, 31); ctx.strokeStyle = '#b8c7c03b'; ctx.strokeRect(151, 351, 56, 31);
        stencil(ctx, 'SUPPLY CUT', 179, 363, 8, '#e2a2a2', 'center');
        line(ctx, [[160, 374], [197, 374]], '#724551', 2);
        pipe(ctx, [[173, 417], [173, 397], [232, 397], [232, 413]], 10, false);
        valve(ctx, 184, 395, 9, true);
        // Oval masonry basin: thick rim, recessed bowl, drain and empty collector.
        ctx.fillStyle = '#0b1522'; ctx.beginPath(); ctx.ellipse(202, 451, 73, 21, 0, 0, TAU); ctx.fill();
        material(ctx, [[124, 430], [202, 452], [279, 430], [279, 445], [202, 471], [124, 445]], '#283440', '#8f969a');
        ctx.fillStyle = gradient(ctx, 120, 412, 270, 446, ['#819092', '#3a4853', '#97aaa7']);
        ctx.beginPath(); ctx.ellipse(202, 430, 77, 22, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#111e2b'; ctx.beginPath(); ctx.ellipse(202, 429, 65, 15, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#b2c0b06b'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(202, 429, 65, 15, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = '#050b13'; ctx.beginPath(); ctx.ellipse(202, 434, 10, 3, 0, 0, TAU); ctx.fill();
        for (let i = 0; i < 4; i++) line(ctx, [[195 + i * 4, 432], [195 + i * 4, 436]], '#8e9b9766');
        line(ctx, [[145, 443], [163, 451], [159, 457]], '#0b1521', 1.5);
        pipe(ctx, [[158, 456], [158, 478], [352, 478]], 12, false);
        valve(ctx, 350, 478, 12, true);
        stencil(ctx, 'NO PUBLIC SUPPLY', 163, 490, 8, '#c78f9a');
    }
    function hoodedOperator(ctx) {
        // Retain the title-screen pose, coat and working hand; raise its hood
        // and add the woven seams and reflected terminal light in this scene.
        // Layer the touch terminal behind the hand, keeping finger occlusion.
        material(ctx, [[410, 270], [473, 270], [477, 274], [477, 350], [410, 350]], '#102e38d9', '#91e5cf7a');
        poly(ctx, [[477, 274], [482, 278], [482, 354], [477, 350]], '#0b202d', '#669e9b');
        line(ctx, [[411, 285], [411, 271], [424, 271]], '#bdffe5', 1.3);
        line(ctx, [[463, 349], [476, 349], [476, 335]], '#bdffe5', 1.3);
        stencil(ctx, '/26', 441, 344, 7, '#afddcf', 'center');
        for (let i = 0; i < 4; i++) { ctx.fillStyle = i < 3 ? '#76c8b6' : '#8ba0a3'; ctx.fillRect(412, 292 + i * 10, 2, 4); }
        if (IP2Live.MainMenuArt) IP2Live.MainMenuArt.drawInfiltrator(ctx, 313, 264, 2.12);
        else person(ctx, 313, 310, 2.12);
        ctx.save(); ctx.translate(313, 264); ctx.scale(2.12 * 1.08, 2.12 * 1.08);
        const hood = [[-17, 2], [-20, -18], [-15, -33], [-5, -42], [5, -40], [18, -29], [21, -14], [16, 5], [2, 24]];
        material(ctx, hood, gradient(ctx, -20, -23, 22, 4, ['#181b2b', '#3b2e45', '#775064']), '#a76a8391');
        poly(ctx, [[-5, -42], [-1, -27], [-7, -12], [-5, 6], [2, 24], [-17, 2], [-20, -18], [-15, -33]], '#11182790');
        poly(ctx, [[5, -40], [18, -29], [21, -14], [16, 5], [2, 24], [7, -5], [6, -24]], '#7f51664d');
        poly(ctx, [[18, -29], [23, -14], [18, 2], [14, -6], [16, -19]], '#0b1420', '#77c3c16b', .6);
        line(ctx, [[-5, -39], [1, -27], [-2, -8], [2, 19]], '#9a718183', .7);
        line(ctx, [[5, -37], [14, -27], [17, -15], [12, 3]], '#b8e5d77c', .8);
        ctx.strokeStyle = '#0b132359'; ctx.lineWidth = 1.2;
        for (const x of [-13, -7, 9]) {
            ctx.beginPath(); ctx.moveTo(x, -29); ctx.quadraticCurveTo(x + 4, -14, x * .4, 11); ctx.stroke();
        }
        material(ctx, [[-18, 0], [-29, 9], [-16, 21], [0, 32], [17, 21], [24, 10], [16, 2], [2, 24]],
            gradient(ctx, -22, 0, 22, 30, ['#211d30', '#3e2940', '#6b3b53']), '#9462768a');
        line(ctx, [[-26, 10], [-15, 19], [0, 29], [15, 20], [21, 11]], '#be879579', .7);
        for (let i = 0; i < 12; i++) {
            const y = 10 + i * 4.8, x = -22 - i * .42;
            line(ctx, [[x, y], [x + 1.5, y + 1]], '#b68a9450', .5);
        }
        poly(ctx, [[22, 8], [30, 15], [33, 28], [29, 29], [25, 17]], '#99e1cd16');
        // Belting, a utility pouch and small hem joins make the coat tangible.
        line(ctx, [[-23, 46], [-8, 48], [8, 47], [25, 43]], '#111723', 2.4);
        material(ctx, [[-21, 45], [-11, 46], [-11, 57], [-22, 55]], '#202c37', '#73919357');
        ctx.fillStyle = '#879997'; ctx.fillRect(-18, 47, 3, 1);
        for (const x of [-24, -13, 1, 14, 26]) line(ctx, [[x, 71], [x + 1, 74]], '#a6798b60', .6);
        ctx.restore();
    }
    function routeHologram(ctx) {
        // The emitter, controls and upright display form one grounded workstation.
        // Projection light stays above the emitter instead of a diagonal floor beam.
        glow(ctx, 607, 510, 171, 19, '#5abfb818');
        material(ctx, [[502, 456], [783, 456], [760, 468], [438, 468]], '#465760', '#8badae7a');
        material(ctx, [[438, 468], [760, 468], [760, 491], [438, 491]],
            gradient(ctx, 0, 468, 0, 491, ['#263746', '#131d2c']), '#64818b');
        poly(ctx, [[783, 456], [760, 468], [760, 491], [783, 479]], '#101a28', '#506575');
        for (const x of [482, 710]) {
            material(ctx, [[x, 491], [x + 17, 491], [x + 13, 510], [x - 3, 510]], '#1a2835', '#67828b72');
            poly(ctx, [[x - 7, 509], [x + 18, 509], [x + 22, 514], [x - 10, 514]], '#101a27', '#4e626c6e');
        }
        material(ctx, [[516, 456], [731, 456], [737, 459], [510, 459]], '#0a1a27', '#69a99e');
        line(ctx, [[521, 457], [725, 457]], '#b4ffe5', 2);
        poly(ctx, [[521, 456], [725, 456], [756, 440], [480, 440]],
            gradient(ctx, 0, 440, 0, 456, ['#77f5d410', '#77f5d43b']));
        // A structural control arm connects the hand terminal to the same desk.
        line(ctx, [[468, 350], [468, 431], [493, 456]], '#08111c', 7);
        line(ctx, [[468, 350], [468, 431], [493, 456]], '#526f7a', 3);
        line(ctx, [[477, 309], [480, 309]], '#8cf5db', 1.5);
        stencil(ctx, 'SERVICE ACCESS', 472, 480, 8, '#b5c6c6');
        for (let i = 0; i < 7; i++) {
            ctx.fillStyle = '#07111c'; ctx.fillRect(675 + i * 9, 477, 5, 5);
            ctx.fillStyle = '#6c89945c'; ctx.fillRect(675 + i * 9, 477, 5, 1);
        }
        const width = 276, height = 220;
        ctx.save(); ctx.translate(480, 220);
        // All text baselines and glass edges are level; no projection shear.
        material(ctx, [[0, 0], [width, 0], [width, height], [0, height]],
            gradient(ctx, 0, 0, width, height, ['#163640ed', '#0b202de6', '#143339df']), '#9cf3da8f');
        poly(ctx, [[width, 0], [width + 5, 4], [width + 5, height + 4], [width, height]], '#13333ce0', '#6daca277');
        for (let x = 10; x < 181; x += 15) line(ctx, [[x, 50], [x, 183]], '#87d6c60d', .5);
        for (let y = 53; y < 183; y += 15) line(ctx, [[9, y], [180, y]], '#87d6c615', .5);
        poly(ctx, [[0, 0], [width, 0], [width, 33], [0, 33]], '#4bafa314');
        stencil(ctx, 'SUBNET ROUTE', 13, 18, 12, '#c5ffe9');
        stencil(ctx, 'APEX', 261, 18, 8, '#93c9bd', 'right');
        line(ctx, [[12, 33], [264, 33]], '#85d9c24a');
        stencil(ctx, '192.168.10.0 /24', 13, 46, 9, '#94bbb9');
        const nodes = [[25, 157], [56, 117], [95, 117], [126, 79], [166, 79]];
        line(ctx, nodes, '#65dfc8', 2);
        line(ctx, [[56, 117], [37, 98], [37, 76]], '#78b9b83a');
        line(ctx, [[95, 117], [121, 147], [164, 147]], '#78b9b83a');
        for (const [i, [x, y]] of nodes.entries()) {
            glow(ctx, x, y, 12, 12, '#8cffd333');
            poly(ctx, [[x, y - 4], [x + 4, y], [x, y + 4], [x - 4, y]], i === 4 ? C.gold : '#b1ffe6', '#d4ffed');
        }
        stencil(ctx, 'PUBLIC UPLINK', 13, 176, 8, '#b1dad1');
        // The subnet's real netmask is integrated in the same upright glass.
        poly(ctx, [[189, 43], [265, 43], [265, 182], [189, 182]], '#23515125');
        line(ctx, [[189, 43], [189, 182]], '#85d9c233');
        stencil(ctx, 'NETMASK /26', 197, 57, 8, '#bcf3de');
        stencil(ctx, '255.255.255.192', 197, 74, 7.5, '#b2d6cf');
        for (let row = 0; row < 4; row++) for (let bit = 0; bit < 8; bit++) {
            ctx.fillStyle = row < 3 || bit < 2 ? '#75ccb29c' : '#49637460'; ctx.fillRect(198 + bit * 7.5, 91 + row * 12, 5, 7);
        }
        stencil(ctx, '64 ADDRESSES', 197, 153, 7, '#b0d5cc');
        stencil(ctx, '62 HOSTS', 197, 167, 7, '#8fb9b3');
        line(ctx, [[12, 187], [264, 187]], '#85d9c240');
        for (let i = 0; i < 4; i++) {
            ctx.strokeStyle = '#92d9c96b'; ctx.strokeRect(13 + i * 65, 195, 57, 13);
            ctx.fillStyle = i < 3 ? '#74d7bb75' : '#4d677860'; ctx.fillRect(16 + i * 65, 198, 51, 7);
        }
        for (const [x, y, dx, dy] of [[2, 2, 1, 1], [274, 2, -1, 1], [2, 218, 1, -1], [274, 218, -1, -1]]) {
            line(ctx, [[x, y + 12 * dy], [x, y], [x + 12 * dx, y]], '#b7ffe8', 1.5);
        }
        ctx.restore();
        if (painting) painting.hologram = { origin: [480, 220], nodes, scanWidth: 170, touch: [433, 309] };
    }
    function fortress(ctx, x, y, scale = 1, recovered = false) {
        ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
        const accent = recovered ? '#74e8cd' : '#f15070';
        glow(ctx, 0, 200, 260, 270, recovered ? '#2d88762a' : '#ce345c24');
        material(ctx, [[-100, 40], [-44, 0], [75, 0], [116, 52], [168, 398], [-168, 398]],
            gradient(ctx, -150, 0, 150, 400, ['#3c3447', '#252538', '#141929']), '#8c697e');
        material(ctx, [[75, 0], [128, 27], [206, 369], [168, 398], [116, 52]], '#0c1424', '#52647c');
        poly(ctx, [[-44, 0], [75, 0], [128, 27], [4, 26], [-100, 40]], '#4b3e50', '#b497a357');
        for (let floor = 0; floor < 8; floor++) {
            const yy = 77 + floor * 39, spread = 108 + floor * 7;
            material(ctx, [[-spread, yy], [spread + 8, yy], [spread + 12, yy + 23], [-spread - 4, yy + 23]],
                gradient(ctx, -spread, yy, spread, yy + 23, ['#362b3e', '#080f1d', '#242339']), '#91617a45');
            for (let i = 0; i < 15; i++) {
                ctx.fillStyle = i % 4 ? '#7894a826' : recovered ? '#74dbc970' : '#ef647c60';
                ctx.fillRect(-spread + 12 + i * (spread * 2 - 20) / 15, yy + 8, 6, 5);
            }
            line(ctx, [[-spread, yy + 25], [spread + 12, yy + 25]], '#a799a340');
            line(ctx, [[spread + 15, yy + 1], [spread + 53, yy - 16]], '#3c506a');
            if (floor < 7) line(ctx, [[-38, yy + 19], [38, yy + 19]], accent + '9c', 1.2);
        }
        for (const side of [-1, 1]) {
            const xx = side * 81;
            pipe(ctx, [[xx, 49], [xx, 200], [side * 131, 249], [side * 153, 397]], 8, recovered);
            material(ctx, [[side * 132, 180], [side * 148, 188], [side * 197, 395], [side * 162, 399]], '#151b2b', '#5b4561');
            for (let i = 0; i < 8; i++) line(ctx, [[side * (147 + i * 5), 217 + i * 22], [side * (165 + i * 5), 217 + i * 22]], '#9c657b45');
        }
        material(ctx, [[-72, 338], [-45, 310], [45, 310], [72, 338], [72, 398], [-72, 398]], '#0b101e', '#8f5c74');
        for (let i = 0; i < 4; i++) line(ctx, [[-58 + i * 8, 393], [-58 + i * 8, 339 + i * 4], [-42 + i * 8, 324 + i * 4],
            [42 - i * 8, 324 + i * 4], [58 - i * 8, 339 + i * 4], [58 - i * 8, 393]], accent + (i ? '50' : 'c0'), 1.2);
        glow(ctx, 8, 49, 60, 55, recovered ? '#5affd436' : '#ff335957');
        poly(ctx, [[-30, 36], [31, 36], [0, 81]], '#110c1c', accent, 2);
        poly(ctx, [[-19, 43], [20, 43], [0, 71]], accent + '36', '#e1a7b980');
        line(ctx, [[-16, 53], [16, 53]], accent, 2); ctx.fillStyle = '#fff0db'; ctx.fillRect(-2, 51, 4, 4);
        for (let i = 0; i < 6; i++) {
            const yy = 115 + i * 35;
            line(ctx, [[12, yy], [35, yy], [47, yy - 12], [77, yy - 12]], accent + '75', .9);
            ctx.fillStyle = accent; ctx.fillRect(75, yy - 14, 3, 3);
        }
        ctx.restore();
    }
    function person(ctx, x, y, scale = 1) {
        ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
        poly(ctx, [[-8, 0], [-15, 15], [-18, 43], [-5, 45], [-4, 67], [4, 67], [5, 45], [18, 43], [14, 15], [8, 0]], '#101522', '#71607380');
        poly(ctx, [[0, 3], [8, 0], [14, 15], [18, 43], [3, 42]], '#292335');
        ctx.fillStyle = '#312634'; ctx.beginPath(); ctx.ellipse(0, -9, 7, 9, 0, 0, TAU); ctx.fill();
        line(ctx, [[7, -11], [7, -4]], '#b17981', 1); ctx.restore();
    }
    function ground(ctx, color = '#0b0e1c') {
        poly(ctx, [[0, 477], [640, 398], [1280, 453], [1280, 720], [0, 720]], color);
        for (let i = 0; i < 16; i++) line(ctx, [[640, 387], [i * 130 - 340, 720]], '#85697d16');
        for (let i = 0; i < 8; i++) {
            const yy = 435 + i * i * 5; line(ctx, [[0, yy], [1280, yy + 6]], '#aca6b016');
        }
        glow(ctx, 770, 474, 470, 30, '#d83b5a1f');
    }
    function arrival(ctx) {
        sky(ctx, 81, 0);
        ctx.save(); ctx.translate(1002, 161); ctx.scale(1, .54);
        glow(ctx, 0, 0, 155, 155, '#a9689860');
        for (let i = 0; i < 7; i++) {
            const radius = 106 + i * 4; const points = Array.from({ length: 12 }, (_, k) => [Math.cos(k * TAU / 12) * radius, Math.sin(k * TAU / 12) * radius]);
            poly(ctx, points, i ? null : '#140f26', i % 2 ? '#7eb8c96c' : '#e18aac9a', i ? .8 : 2.2);
        }
        ctx.restore();
        city(ctx, 442, 365, .68);
        irrigationChannel(ctx); farms(ctx);
        // Hulls are cached separately and descend over this stationary city.
        if (painting) ARRIVAL_FLEET.forEach((definition, fleetIndex) => {
            for (const cx of [-64, 51]) painting.emitters.push({ ...definition, cx, fleetIndex, phase: definition.x * .012 + cx * .03 });
        });
        material(ctx, [[0, 466], [176, 419], [281, 468], [281, 548], [0, 612]], '#101421', '#7d64702e');
        person(ctx, 146, 415, .9); person(ctx, 184, 428, .65); person(ctx, 120, 435, .48);
        glow(ctx, 730, 326, 460, 55, '#dba39d11');
    }
    function taking(ctx) {
        sky(ctx, 85, 1); city(ctx, 451, 350, .08);
        fortress(ctx, 925, 100, .78);
        ground(ctx);
        material(ctx, [[607, 433], [1133, 433], [1207, 459], [560, 459]], '#35404e', '#9cafb573');
        material(ctx, [[560, 459], [1207, 459], [1207, 482], [560, 482]], '#13202d', '#596e7d');
        for (let i = 0; i < 4; i++) resourceContainer(ctx, 640 + i * 117, 260 - i % 2 * 26, i);
        // The pipes visibly join each protected vault through a common manifold.
        pipe(ctx, [[310, 499], [479, 499], [535, 455], [1160, 455]], 22, true, true);
        valve(ctx, 544, 454, 12);
        for (let i = 0; i < 4; i++) {
            const x = 694 + i * 117; valve(ctx, x, 445, 7);
            ctx.fillStyle = '#adc6bb70'; ctx.fillRect(x - 7, 467, 14, 2);
        }
        // An open security rail preserves the view of the hoarded contents.
        pipe(ctx, [[594, 440], [594, 408], [1184, 408], [1184, 440]], 4, false);
        for (let i = 0; i < 11; i++) {
            const x = 600 + i * 58;
            line(ctx, [[x, 408], [x, 436]], '#5a6b7a', 2);
            ctx.fillStyle = '#d55774'; ctx.fillRect(x - 2, 406, 4, 2);
        }
        publicWater(ctx);
        person(ctx, 307, 393, 1.15); person(ctx, 350, 410, .87); person(ctx, 388, 427, .63);
        person(ctx, 65, 416, .8); person(ctx, 275, 440, .55);
        drone(ctx, 526, 233, .9, true); drone(ctx, 1120, 182, .55, true);
    }
    function guarded(ctx) {
        sky(ctx, 828, 2); city(ctx, 43, 386, .16);
        glow(ctx, 785, 230, 330, 270, '#df3b6225');
        fortress(ctx, 783, 75, 1.04);
        ground(ctx);
        // A long entrance bridge, with extruded balustrades and inset panels.
        material(ctx, [[674, 409], [876, 409], [1138, 552], [383, 552]], '#252032', '#7f566f');
        for (const side of [-1, 1]) {
            const a = side < 0 ? 674 : 876, b = side < 0 ? 383 : 1138;
            material(ctx, [[a, 402], [b, 522], [b, 549], [a, 425]], '#101724', '#a06a81');
            line(ctx, [[a, 402], [b, 522]], '#f06b86', 1.6);
            for (let i = 1; i < 12; i++) {
                const t = i / 12, x = a + (b - a) * t, y = 403 + 120 * t;
                line(ctx, [[x, y], [x, y + 12 + t * 13]], '#5c4a62', 2);
            }
        }
        for (let i = 0; i < 8; i++) line(ctx, [[658 - i * 27, 429 + i * 15], [900 + i * 28, 429 + i * 15]], '#93859725');
        // Massive close service structures frame the distant climb.
        material(ctx, [[0, 139], [94, 87], [179, 123], [179, 505], [0, 553]],
            gradient(ctx, 0, 0, 179, 0, ['#292334', '#121725', '#36263b']), '#796073');
        for (let i = 0; i < 13; i++) line(ctx, [[23, 171 + i * 24], [147, 135 + i * 26]], '#a2839234', 2);
        pipe(ctx, [[41, 504], [41, 191], [94, 162], [94, 85]], 14, false);
        material(ctx, [[1139, 155], [1280, 106], [1280, 551], [1151, 483]], '#111724', '#5f536b');
        pipe(ctx, [[1194, 510], [1194, 197], [1280, 171]], 20, true);
        drone(ctx, 448, 245, .9, true); drone(ctx, 1035, 167, .65, true); drone(ctx, 673, 123, .38);
        // Follow the bridge's perspective centerline toward the APEX gate.
        person(ctx, 770, 456, .48);
    }
    function infiltrationTerrace(ctx, gateX, horizonY) {
        // Every paving seam and approach edge shares the destination's horizon.
        // Lines are clipped to the ground, never extended over the tower facade.
        const at = (slope, y) => [gateX + slope * (y - horizonY), y];
        material(ctx, [[0, 405], [1280, 405], [1280, 720], [0, 720]],
            gradient(ctx, 0, 405, 0, 620, ['#202937', '#151e2c', '#090f1b']), '#56687549');
        // Stop detailed paving beneath the caption rather than letting bright
        // approach edges leak out below the dialogue housing and outer frame.
        ctx.save(); ctx.beginPath(); ctx.rect(0, 405, 1280, 215); ctx.clip();
        ctx.save(); ctx.beginPath(); ctx.rect(0, 414, 1280, 306); ctx.clip();
        for (const slope of [-6, -4.5, -3, -1.18, 0, 1.18, 3]) {
            line(ctx, [at(slope, 414), at(slope, 720)], '#8494a51d', 1);
        }
        for (const y of [424, 445, 474, 515, 570, 643]) {
            line(ctx, [[0, y], [1280, y]], '#97a9b21c', 1);
            line(ctx, [[0, y + 2], [1280, y + 2]], '#02071048', 1);
        }
        ctx.restore();
        // A continuous inset approach meets the final stair tread exactly.
        const left = y => at(-1.18, y), right = y => at(1.18, y), far = 442;
        material(ctx, [left(far), right(far), right(720), left(720)],
            gradient(ctx, 0, far, 0, 680, ['#30303d', '#202332', '#111725']), '#82949838');
        for (const y of [451, 463, 479, 500, 528, 565, 615, 686]) {
            line(ctx, [left(y), right(y)], '#8b9d9e30', 1.1);
            line(ctx, [[left(y)[0], y + 2], [right(y)[0], y + 2]], '#050b144f', 1);
        }
        for (const slope of [-.39, .39]) line(ctx, [at(slope, far), at(slope, 720)], '#a5a8ad18');
        for (const side of [-1, 1]) {
            const edge = y => at(side * 1.18, y), outside = y => at(side * 1.26, y);
            material(ctx, [edge(far), outside(far), outside(720), edge(720)], '#253645', '#69818a70');
            line(ctx, [edge(far), edge(720)], '#80d7ca80', 1.5);
            for (const y of [454, 478, 513, 559, 628]) {
                const [x] = outside(y), height = 2 + (y - far) * .025;
                ctx.fillStyle = '#99e6d491'; ctx.fillRect(x - 1.3, y, 2.6, height);
            }
        }
        ctx.restore();
        // The roof parapet separates the usable terrace from the city beyond it.
        for (const [a, b] of [[0, 790], [1114, 1280]]) {
            material(ctx, [[a, 396], [b, 396], [b, 408], [a, 408]], '#141e2c', '#6479856b');
            line(ctx, [[a, 396], [b, 396]], '#93a2ae75', 1.2);
        }
    }
    function infiltrationFoundation(ctx, gateX, topY) {
        // Support all of the front and receding side of the fortress footprint.
        glow(ctx, gateX, 426, 179, 19, '#02050de0');
        material(ctx, [[gateX - 140, topY], [gateX + 135, topY], [gateX + 170, topY - 22], [gateX - 105, topY - 22]],
            '#3b4050', '#81919b84');
        material(ctx, [[gateX - 140, topY], [gateX + 135, topY], [gateX + 135, topY + 16], [gateX - 140, topY + 16]],
            gradient(ctx, 0, topY, 0, topY + 16, ['#303747', '#111a29']), '#677c8a8a');
        poly(ctx, [[gateX + 135, topY], [gateX + 170, topY - 22], [gateX + 170, topY - 6], [gateX + 135, topY + 16]], '#141f2e', '#677c8a6b');
        for (const side of [-1, 1]) {
            for (let i = 0; i < 4; i++) {
                const x = gateX + side * (87 + i * 12);
                ctx.fillStyle = '#08111d'; ctx.fillRect(x - 3, topY + 5, 6, 5);
                ctx.fillStyle = '#ce627d80'; ctx.fillRect(x - 3, topY + 5, 6, 1);
            }
        }
        glow(ctx, gateX, 433, 84, 25, '#ed466425');
    }
    function infiltrationSteps(ctx, gateX, topY) {
        for (let i = 0; i < 6; i++) {
            const y = topY + i * 6, half = 48 + i * 5;
            material(ctx, [[gateX - half, y], [gateX + half, y], [gateX + half + 5, y + 4], [gateX - half - 5, y + 4]],
                '#3b4653', '#8d9ca361');
            poly(ctx, [[gateX - half - 5, y + 4], [gateX + half + 5, y + 4], [gateX + half + 5, y + 6], [gateX - half - 5, y + 6]],
                '#101a29', '#63758068');
            line(ctx, [[gateX - half - 3, y + 4], [gateX + half + 3, y + 4]], '#b8c2bd59', .7);
        }
    }
    function serviceBayFrame(ctx, gateX, horizonY) {
        const project = ([x, y]) => [gateX + (x - gateX) * .94, horizonY + (y - horizonY) * .94];
        for (const [a, b] of [[[55, 120], [55, 551]], [[1227, 127], [1227, 551]]]) {
            material(ctx, [a, project(a), project(b), b], '#141e2d', '#68748570');
            for (const t of [.22, .48, .74]) {
                const p = [a[0], a[1] + (b[1] - a[1]) * t]; line(ctx, [p, project(p)], '#93a5af3c');
            }
        }
        const rim = [[38, 551], [38, 112], [73, 77], [1200, 77], [1242, 119], [1242, 551],
            [1227, 551], [1227, 127], [1192, 93], [82, 93], [55, 120], [55, 551]];
        material(ctx, rim, gradient(ctx, 0, 77, 0, 551, ['#3a394a', '#24303f', '#111b2b']), '#9ca9b86b');
        line(ctx, [[46, 533], [46, 116], [78, 84], [1197, 84], [1234, 123], [1234, 533]], '#677b8a70', 1.2);
        line(ctx, [[55, 173], [55, 512]], '#78d9c44c', 1.5);
        line(ctx, [[1226, 172], [1226, 512]], '#ed698048', 1.5);
        for (const x of [46, 1234]) for (const y of [171, 292, 418, 534]) {
            ctx.fillStyle = '#060d18'; ctx.fillRect(x - 2, y - 2, 4, 4);
            ctx.fillStyle = '#9ca8b378'; ctx.fillRect(x - 1, y - 2, 2, 1);
        }
    }
    function infiltrator(ctx) {
        const gateX = 938, horizonY = 374, foundationY = 406, towerScale = .72;
        sky(ctx, 155, 3); city(ctx, 62, 387, .14);
        infiltrationTerrace(ctx, gateX, horizonY);
        infiltrationFoundation(ctx, gateX, foundationY);
        // Draw architecture on its foundation after the ground, so the floor can
        // never cut off its feet. The tower's local base is exactly y=398.
        fortress(ctx, gateX, foundationY - 398 * towerScale, towerScale);
        infiltrationSteps(ctx, gateX, foundationY);
        glow(ctx, gateX, 405, 79, 12, '#e74f6d23');
        serviceBayFrame(ctx, gateX, horizonY);
        // Quiet contact shadows anchor boots and desk supports to the terrace.
        glow(ctx, 318, 504, 84, 12, '#01050be8');
        glow(ctx, 607, 513, 172, 12, '#01050bb8');
        glow(ctx, 352, 371, 215, 166, '#37b9b51d');
        routeHologram(ctx); hoodedOperator(ctx);
        // City-window animation must not blink through foreground architecture.
        if (painting) painting.windows = painting.windows.filter(window => window.y < 395 &&
            (window.x < gateX - 173 || window.x > gateX + 175));
    }
    function pathPoint(points, progress) {
        let length = 0;
        for (let i = 1; i < points.length; i++) length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
        let remaining = wrap(progress, 1) * length;
        for (let i = 1; i < points.length; i++) {
            const [ax, ay] = points[i - 1], [bx, by] = points[i], segment = Math.hypot(bx - ax, by - ay);
            if (remaining <= segment) { const f = remaining / Math.max(1, segment); return [ax + (bx - ax) * f, ay + (by - ay) * f, Math.atan2(by - ay, bx - ax)]; }
            remaining -= segment;
        }
        return [...points[points.length - 1], 0];
    }
    IP2Live.PrologueArt = {
        arrivalFleetPose(seconds = 0, options = {}) {
            const time = Math.max(0, Number(seconds) || 0);
            return ARRIVAL_FLEET.map(definition => ({ x: definition.x, y: arrivalShipY(definition, time, options.reducedMotion), scale: definition.scale }));
        },
        createArrivalFleet(density = 1) {
            const resolution = Math.max(1, Math.min(1.5, density));
            return ARRIVAL_FLEET.map(definition => {
                // Tight sprite bounds include hull, engines and their soft glow.
                const x = -200 * definition.scale, y = -76 * definition.scale;
                const w = 412 * definition.scale, h = 172 * definition.scale;
                const surface = document.createElement('canvas'); surface.width = Math.ceil(w * resolution); surface.height = Math.ceil(h * resolution);
                const p = surface.getContext('2d'); p.setTransform(resolution, 0, 0, resolution, -x * resolution, -y * resolution);
                ship(p, 0, 0, definition.scale, definition.large);
                // Match the painting's atmospheric tint while keeping solid
                // hulls opaque, so the portal cannot show through a ship.
                p.globalCompositeOperation = 'source-atop'; p.fillStyle = '#03060a26'; p.fillRect(x, y, w, h);
                p.globalCompositeOperation = 'source-over';
                return { surface, x, y, w, h };
            });
        },
        drawArrivalFleet(ctx, fleet, seconds = 0, options = {}) {
            if (!fleet) return;
            const poses = this.arrivalFleetPose(seconds, options), main = poses[0];
            ctx.save(); ctx.beginPath(); ctx.rect(22, 24, 1236, 530); ctx.clip();
            // The fleet's cloud shadow arrives with it; it is not baked into an empty sky.
            ctx.globalAlpha *= Math.max(0, Math.min(1, (main.y + 20) / 227));
            poly(ctx, [[688, main.y + 43], [847, main.y + 63], [1146, 467], [916, 465]], '#05091327');
            ctx.restore();
            ctx.save(); ctx.beginPath(); ctx.rect(22, 24, 1236, 530); ctx.clip();
            for (let i = 0; i < fleet.length; i++) {
                const sprite = fleet[i], pose = poses[i];
                ctx.drawImage(sprite.surface, pose.x + sprite.x, pose.y + sprite.y, sprite.w, sprite.h);
            }
            ctx.restore();
        },
        paint(ctx, index) {
            const sceneIndex = Math.max(0, Math.min(3, index)), r = random(9001 + sceneIndex * 117);
            const state = { windows: [], emitters: [], beacons: [], flows: [], dust: [], rain: [], hologram: null };
            for (let i = 0; i < 32; i++) state.dust.push({ x: r() * 1280, y: 35 + r() * 500, size: .5 + r() * 1.1, phase: r() * TAU, speed: 1.2 + r() * 2.3 });
            if (sceneIndex === 1 || sceneIndex === 2) for (let i = 0; i < 68; i++) {
                state.rain.push({ x: r() * 1280, y: r() * 540, speed: 27 + r() * 18, length: 7 + r() * 7 });
            }
            painting = motion[sceneIndex] = state;
            ctx.save();
            try { [arrival, taking, guarded, infiltrator][sceneIndex](ctx); }
            finally { painting = null; }
            // Surface grain and atmospheric edge falloff match the title artwork.
            ctx.globalAlpha = .13; ctx.fillStyle = texture(ctx); ctx.fillRect(0, 0, 1280, 720); ctx.globalAlpha = 1;
            ctx.fillStyle = gradient(ctx, 0, 0, 0, 720, ['#03060a85', '#03060a00', '#03060a00', '#03060ad9']);
            ctx.fillRect(0, 0, 1280, 720);
            ctx.fillStyle = gradient(ctx, 0, 0, 1280, 0, ['#03060a99', '#03060a00', '#03060a00', '#03060a80']);
            ctx.fillRect(0, 0, 1280, 720); ctx.restore();
        },
        paintAmbient(ctx, index, seconds = 0, options = {}) {
            const state = motion[index]; if (!state) return;
            const time = options.reducedMotion ? 0 : Math.max(0, Number(seconds) || 0), alpha = ctx.globalAlpha;
            ctx.save(); ctx.beginPath(); ctx.rect(22, 24, 1236, 530); ctx.clip();
            for (const window of state.windows) {
                const light = .5 + .5 * Math.sin(time * .62 + window.phase);
                ctx.globalAlpha = alpha * window.alpha * (.12 + light * .33);
                ctx.fillStyle = light > .3 ? '#cae4cd' : '#0b1421'; ctx.fillRect(window.x, window.y, 2.7, 4.5);
            }
            ctx.globalAlpha = alpha;
            for (const emitter of state.emitters) {
                const { x, y, scale, cx, phase } = emitter, light = .22 + .48 * (.5 + .5 * Math.sin(time * 1.16 + phase));
                const shipY = emitter.fleetIndex === undefined ? y : arrivalShipY(ARRIVAL_FLEET[emitter.fleetIndex], time, options.reducedMotion);
                ctx.save(); ctx.translate(x, shipY); ctx.scale(scale, scale); ctx.globalAlpha *= light;
                poly(ctx, [[cx - 11, 32], [cx + 18, 35], [cx + 11, 42], [cx - 17, 39]], '#a2fff0');
                glow(ctx, cx, 43, 36, 18, '#89ffde7a'); ctx.restore();
            }
            for (const beacon of state.beacons) {
                ctx.globalAlpha = alpha * (.2 + .35 * (.5 + .5 * Math.sin(time * 1.35 + beacon.phase)));
                glow(ctx, beacon.x, beacon.y, 11 * beacon.scale, 8 * beacon.scale, '#ff597c7a');
            }
            for (const flow of state.flows) for (let i = 0; i < 5; i++) {
                const [x, y, angle] = pathPoint(flow.points, time * .024 + i / 5);
                ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.globalAlpha = alpha * .38;
                ctx.fillStyle = '#a5ffe2'; ctx.fillRect(-4, -1, 8, 2); ctx.restore();
            }
            if (state.hologram) {
                const h = state.hologram;
                ctx.save(); ctx.translate(...h.origin);
                const scanY = 38 + wrap(time * 8, 143);
                ctx.globalAlpha = alpha * .13; ctx.fillStyle = '#a6ffe4'; ctx.fillRect(8, scanY, h.scanWidth, .8);
                ctx.globalAlpha = alpha * .85;
                const [x, y] = pathPoint(h.nodes, time * .085);
                glow(ctx, x, y, 8, 8, '#9effdf8a'); ctx.fillStyle = '#d4ffe9'; ctx.fillRect(x - 1.4, y - 1.4, 2.8, 2.8);
                ctx.restore();
                ctx.globalAlpha = alpha * (.28 + Math.sin(time * 1.5) * .1);
                glow(ctx, ...h.touch, 13, 11, '#8bffdda0');
                ctx.strokeStyle = '#a7ffe3'; ctx.lineWidth = .8; ctx.beginPath(); ctx.arc(...h.touch, 6 + Math.sin(time * .9), 0, TAU); ctx.stroke();
            }
            for (const particle of state.dust) {
                const x = wrap(particle.x + time * particle.speed, 1280), y = 32 + wrap(particle.y - time * .8 + Math.sin(time * .23 + particle.phase) * 3, 500);
                ctx.globalAlpha = alpha * (.1 + .08 * Math.sin(time * .45 + particle.phase)) * Math.sin((y - 32) / 500 * Math.PI);
                ctx.fillStyle = index === 3 ? '#b0e3cf' : '#dbc1b5'; ctx.fillRect(x, y, particle.size, particle.size);
            }
            ctx.globalAlpha = alpha * .12;
            for (const drop of state.rain) {
                const y = wrap(drop.y + time * drop.speed, 540), x = wrap(drop.x - time * drop.speed * .2, 1280);
                line(ctx, [[x, y], [x - 2.5, y + drop.length]], '#b5ced8', .55);
            }
            ctx.restore();
        },
    };
}());
