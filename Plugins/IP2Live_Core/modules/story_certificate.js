/** Named Story Mode completion certificates, rendered offline at print resolution. */
(function () {
    const W = 842, H = 595;
    const family = '"Oxanium-Medium", "Segoe UI", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    function label(ctx, text, x, y, size, color = '#152d3b', align = 'center', maxWidth = 710, fit = false) {
        ctx.font = size + 'px ' + family;
        if (fit) {
            // Shrink both dimensions evenly instead of squeezing long names horizontally.
            const width = ctx.measureText(String(text)).width;
            if (width > maxWidth) ctx.font = (size * maxWidth / width) + 'px ' + family;
        }
        ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
        ctx.fillText(String(text), x, y, maxWidth);
    }
    function polygon(ctx, points, fill, stroke, width = 1) {
        ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
    }
    function regular(ctx, cx, cy, radius, sides, fill, stroke, rotation = -Math.PI / 2) {
        polygon(ctx, Array.from({ length: sides }, (_, i) => [cx + Math.cos(rotation + i * Math.PI * 2 / sides) * radius,
            cy + Math.sin(rotation + i * Math.PI * 2 / sides) * radius]), fill, stroke);
    }
    function gradient(ctx, x, y, x2, y2, colors) {
        const g = ctx.createLinearGradient(x, y, x2, y2); colors.forEach((color, i) => g.addColorStop(i / (colors.length - 1), color)); return g;
    }
    function trace(ctx, points, color, width = 0.8) {
        ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    }
    // Deterministic fibres and etched grain stay identical in the preview and PDF.
    function grain(ctx, x, y, w, h, dark = false) {
        let seed = 731;
        for (let i = 0; i < w * h / 55; i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const px = x + seed % w;
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const py = y + seed % h;
            ctx.fillStyle = dark ? (i % 2 ? '#b7d4df10' : '#00000020') : (i % 2 ? '#ffffff65' : '#5f63440c');
            ctx.fillRect(px, py, i % 4 ? 0.65 : 2.5, 0.5);
        }
    }
    function drawSeal(ctx, x, y, radius = 48, endless = false) {
        ctx.save(); ctx.translate(x, y); ctx.scale(radius / 48, radius / 48);
        // Foil facets, an inset enamel face and laurel leaves create a physical medal.
        const foil = gradient(ctx, -48, -48, 48, 48, ['#e8d7a3', '#9a7336', '#faeac2', '#b48b48', '#ead4a0']);
        const teeth = Array.from({ length: 64 }, (_, i) => {
            const a = i * Math.PI / 32 - Math.PI / 2, r = i % 2 ? 44 : 48;
            return [Math.cos(a) * r, Math.sin(a) * r];
        });
        polygon(ctx, teeth, foil, '#af8b4b', 0.7);
        regular(ctx, 0, 0, 39, 12, '#102a36', '#fae7b4');
        regular(ctx, 0, 0, 34, 12, null, '#aa8b50');
        for (const sign of [-1, 1]) for (let i = 0; i < 7; i++) {
            const a = (30 + i * 17) * Math.PI / 180, cx = sign * Math.sin(a) * 28, cy = Math.cos(a) * 28;
            polygon(ctx, [[cx, cy + 4], [cx + sign * 4, cy], [cx + sign * 2, cy - 7], [cx - sign * 2, cy - 3]], '#d8bd7d');
        }
        trace(ctx, [[-12, 27], [0, 32], [12, 27]], '#c4a767');
        polygon(ctx, [[0, -27], [3, -20], [10, -19], [5, -14], [6, -7], [0, -11], [-6, -7], [-5, -14], [-10, -19], [-3, -20]], '#f0d89d');
        label(ctx, endless ? 'ENDLESS' : 'STORY', 0, 1, 7, '#f6e9c6'); label(ctx, endless ? 'EXPLORER' : 'COMPLETE', 0, 12, 7.3, '#f6e9c6');
        ctx.restore();
    }
    function uplink(ctx) {
        const cx = 116;
        // Projected plinth and an extruded, faceted neural core.
        polygon(ctx, [[46, 363], [116, 331], [187, 363], [116, 398]], '#0a1923', '#668582');
        polygon(ctx, [[46, 363], [116, 398], [116, 409], [46, 375]], '#07131b', '#243d49');
        polygon(ctx, [[116, 398], [187, 363], [187, 375], [116, 409]], '#172d38', '#36525d');
        for (let i = 0; i < 6; i++) trace(ctx, [[60 + i * 8, 363], [116, 389 - i * 4], [172 - i * 8, 363]], '#69958730');
        polygon(ctx, [[76, 228], [116, 205], [156, 228], [156, 335], [116, 360], [76, 335]], '#0d2632', '#89b3a7');
        polygon(ctx, [[76, 228], [116, 253], [116, 360], [76, 335]], gradient(ctx, 76, 228, 116, 335, ['#2e4e5a', '#0c222f']), '#527c80');
        polygon(ctx, [[116, 253], [156, 228], [156, 335], [116, 360]], '#091923', '#284956');
        polygon(ctx, [[76, 228], [116, 205], [156, 228], [116, 253]], gradient(ctx, 76, 205, 156, 253, ['#b9cbbc', '#2f5863']), '#a7c6b7');
        polygon(ctx, [[91, 222], [116, 208], [141, 222], [116, 238]], '#9ce5c7', '#d9f3d8');
        for (let i = 0; i < 5; i++) {
            trace(ctx, [[84, 258 + i * 14], [108, 273 + i * 14]], '#7baf9c', 1.2);
            trace(ctx, [[125, 274 + i * 14], [148, 260 + i * 14]], '#365c66', 1.2);
        }
        for (const [x, y, dir] of [[52, 259, 1], [178, 292, -1]]) {
            trace(ctx, [[x, y - 38], [x, y], [x + dir * 20, y + 12]], '#a99258');
            regular(ctx, x, y - 40, 4, 4, '#dcc586');
        }
        trace(ctx, [[116, 193], [116, 171]], '#bfa56b');
        regular(ctx, 116, 164, 6, 4, '#e4ce95');
    }
    function draw(ctx, record) {
        const endless = record.mode === 'endless';
        ctx.save(); ctx.setTransform(ctx.canvas.width / W, 0, 0, ctx.canvas.height / H, 0, 0);
        ctx.fillStyle = gradient(ctx, 0, 0, W, H, ['#e6e4d9', '#fbfaf3', '#efeee4']); ctx.fillRect(0, 0, W, H);
        grain(ctx, 0, 0, W, H);
        // Low-contrast polygon watermark and engraved circuit corners on the paper.
        for (let i = 0; i < 7; i++) regular(ctx, 526, 280, 115 + i * 19, 6, null, '#708c7e08', Math.PI / 6);
        polygon(ctx, [[640, 0], [W, 0], [W, 167]], '#b5c4b71a');
        polygon(ctx, [[0, 452], [162, H], [0, H]], '#b59b5720');
        polygon(ctx, [[18, 44], [44, 18], [798, 18], [824, 44], [824, 551], [798, 577], [44, 577], [18, 551]], null, '#48636b', 1.2);
        polygon(ctx, [[24, 46], [46, 24], [796, 24], [818, 46], [818, 549], [796, 571], [46, 571], [24, 549]], null, '#baa16b', 0.7);
        // Dark textile/metal spine carries the same uplink emblem as the ending.
        polygon(ctx, [[30, 49], [49, 30], [185, 30], [210, 56], [210, 523], [184, 565], [49, 565], [30, 546]],
            gradient(ctx, 30, 30, 210, 565, ['#233a47', '#0b1b28', '#182e3a']), '#a88e55');
        ctx.save(); ctx.beginPath(); ctx.rect(31, 50, 178, 494); ctx.clip(); grain(ctx, 31, 50, 178, 494, true);
        for (let y = 45; y < 565; y += 5) trace(ctx, [[32, y], [209, y - 67]], '#b7d5db06', 0.5);
        ctx.restore();
        polygon(ctx, [[183, 30], [210, 56], [210, 523], [198, 544], [198, 61], [174, 38]], '#354c554a');
        label(ctx, 'IP2', 116, 80, 31, '#ebdfbb'); label(ctx, 'LIVE', 116, 113, 31, '#ebdfbb');
        label(ctx, 'EVERY CONNECTION', 116, 440, 8, '#a6bebc', 'center', 150);
        label(ctx, 'COUNTS', 116, 456, 11, '#dbca95');
        trace(ctx, [[70, 481], [162, 481]], '#8a794d');
        label(ctx, endless ? 'ENDLESS' : 'STORY', 116, 506, 12, '#e4d5b0'); label(ctx, endless ? 'EXPLORER' : 'COMPLETE', 116, 526, 12, '#e4d5b0');
        uplink(ctx);
        for (const direction of [-1, 1]) {
            const y = direction === -1 ? 42 : 553;
            for (let i = 0; i < 4; i++) trace(ctx, [[638 + i * 22, y], [670 + i * 22, y], [682 + i * 22, y - direction * 12], [798, y - direction * 12]], '#7b9a8c45', 0.6);
            for (let i = 0; i < 8; i++) polygon(ctx, [[246 + i * 11, y - 2], [251 + i * 11, y - 2], [246 + i * 11, y + 3], [241 + i * 11, y + 3]], '#b99a59');
        }
        label(ctx, 'IP2LIVE', 250, 65, 11, '#2c595e', 'left');
        label(ctx, endless ? 'ENDLESS MODE  /  PARTICIPATION AWARD' : 'STORY MODE  /  COMPLETION AWARD', 785, 65, 7.5, '#657b7c', 'right');
        const center = 520;
        label(ctx, 'CERTIFICATE', center, 126, 36, '#173342', 'center', 510);
        label(ctx, endless ? 'O F   P A R T I C I P A T I O N' : 'O F   C O M P L E T I O N', center, 167, 12, '#2e7772', 'center', 490);
        trace(ctx, [[406, 191], [504, 191]], '#bda46f'); trace(ctx, [[536, 191], [634, 191]], '#bda46f');
        regular(ctx, center, 191, 4, 4, '#a58b51');
        label(ctx, 'This certificate is proudly presented to', center, 227, 10.5, '#6a7b7c');
        label(ctx, record.name, center, 270, 34, '#173342', 'center', 510, true);
        trace(ctx, [[292, 306], [748, 306]], '#9bafa6', 0.7);
        polygon(ctx, [[285, 306], [292, 303], [299, 306], [292, 309]], '#ac925a');
        polygon(ctx, [[741, 306], [748, 303], [755, 306], [748, 309]], '#ac925a');
        label(ctx, endless ? 'For participating in IP2Live Endless Mode' : 'For successfully completing IP2Live Story Mode', center, 343, 14.5, '#173342', 'center', 510);
        label(ctx, endless ? Number(record.score).toLocaleString('en-US') + ' POINTS  /  ' + record.completedRounds + ' GAMEPLAYS SOLVED' :
            'From the first connection to the final APEX uplink.', center, 370, endless ? 16 : 11, endless ? '#173342' : '#667a7b', 'center', 500, endless);
        const curriculum = !endless && record.curriculum;
        label(ctx, curriculum ? curriculum.floors + ' FLOORS  /  ' + curriculum.gameplayCount + ' GAMEPLAY TYPES  /  ' + curriculum.completedObjectives + ' OBJECTIVES COMPLETED' :
            'IP addressing  /  CIDR  /  Subnetting  /  Network restoration', center, 405, 8.7, '#2e7772', 'center', 510);
        trace(ctx, [[262, 446], [637, 446]], '#a8b8af', 0.6);
        label(ctx, endless ? 'ENDLESS EXPLORER' : 'STORY COMPLETE', 264, 470, 9, '#8f753e', 'left');
        const date = new Date(record.completedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        label(ctx, endless ? 'DATE OF PARTICIPATION' : 'DATE OF COMPLETION', 264, 497, 7, '#72817d', 'left');
        label(ctx, date, 264, 517, 11, '#173342', 'left', 320);
        polygon(ctx, [[683, 492], [699, 492], [694, 546], [684, 537], [674, 543]], '#c7ae72', '#9e814a', 0.5);
        polygon(ctx, [[713, 492], [729, 492], [739, 543], [728, 537], [717, 546]], '#dac691', '#9e814a', 0.5);
        drawSeal(ctx, 707, 476, 49, endless);
        label(ctx, (endless ? 'PARTICIPATION ' : 'COMPLETION ') + record.id, 520, 550, 6.5, '#74817a', 'center', 510);
        ctx.restore();
    }
    function create(record) {
        if (!IP2Live.StoryCompletion.isRecord(record)) throw new Error('Complete Story Mode to earn a certificate.');
        const canvas = document.createElement('canvas'); canvas.width = W * 3; canvas.height = H * 3;
        const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('The certificate could not be rendered.');
        draw(ctx, record);
        const safe = value => String(value).replace(/[^a-z0-9_-]/gi, '_').slice(0, 60) || 'Infiltrator';
        return { blob: IP2Live.CertificatePDF.create(canvas, { title: 'IP2Live - Certificate of Story Completion', subject: record.name + ' | ' + record.id }),
            filename: 'IP2Live_Story_Completion_' + safe(record.name) + '_' + safe(record.id) + '.pdf', details: { ...record } };
    }
    IP2Live.StoryCertificate = { draw, drawSeal, create, download: certificate => IP2Live.CertificatePDF.download(certificate) };
    IP2Live.EndlessCertificate = {
        draw,
        create(record) {
            if (!record || record.mode !== 'endless' || record.status !== 'finished' || !record.id || !String(record.name || '').trim() ||
                !Number.isSafeInteger(record.score) || record.score < 0 || !Number.isInteger(record.completedRounds) || record.completedRounds < 0 ||
                !Number.isFinite(record.completedAt) || record.completedAt <= 0) throw new Error('Finish an Endless run to receive a participation certificate.');
            const canvas = document.createElement('canvas'); canvas.width = W * 3; canvas.height = H * 3;
            const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('The certificate could not be rendered.');
            draw(ctx, record);
            const safe = value => String(value).replace(/[^a-z0-9_-]/gi, '_').slice(0, 60) || 'Infiltrator';
            return { blob: IP2Live.CertificatePDF.create(canvas, { title: 'IP2Live - Endless Participation Certificate',
                subject: record.name + ' | ' + record.score + ' points | ' + record.id }),
                filename: 'IP2Live_Endless_' + safe(record.name) + '_' + record.score + '_' + safe(record.id) + '.pdf', details: { ...record } };
        },
        download: certificate => IP2Live.CertificatePDF.download(certificate),
    };
})();
