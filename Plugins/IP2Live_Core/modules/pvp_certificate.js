/** Offline landscape victory certificates, independent of assessed learning reports. */
(function () {
    'use strict';
    const WIDTH = 842, HEIGHT = 595;
    const ink = '#132b39', teal = '#197b80', gold = '#a27f3e', muted = '#5c717a';
    function label(ctx, value, x, y, size, color = ink, align = 'center', font = '"Segoe UI", sans-serif', width = 710) {
        ctx.font = size + 'px ' + font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
        ctx.fillText(String(value), x, y, width);
    }
    function line(ctx, x1, y1, x2, y2, color, width = 1) {
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    function details(match, playerId, options = {}) {
        if (!match || match.status !== 'finished' || match.winnerId !== playerId) throw new Error('A certificate is available only to the winner of a finished race.');
        const winner = match.players.find(p => p.id === playerId), opponent = match.players.find(p => p.id !== playerId);
        if (!winner || !opponent) throw new Error('The match result is incomplete.');
        return { name: winner.name, opponent: opponent.name, wins: winner.wins, mistakes: winner.mistakes, charge: winner.progress,
            target: match.target, matchId: match.id, ai: !!options.ai, forfeit: match.finishReason === 'opponent-left',
            completedAt: options.completedAt || Date.now() };
    }
    function draw(ctx, result) {
        ctx.save(); ctx.setTransform(ctx.canvas.width / WIDTH, 0, 0, ctx.canvas.height / HEIGHT, 0, 0);
        ctx.fillStyle = '#f8f7f1'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.strokeStyle = '#197b8008'; ctx.lineWidth = 0.6;
        for (let x = -HEIGHT; x < WIDTH; x += 28) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + HEIGHT, HEIGHT); ctx.stroke(); }
        ctx.fillStyle = ink; ctx.fillRect(22, 22, WIDTH - 44, 6); ctx.fillRect(22, HEIGHT - 28, WIDTH - 44, 6);
        ctx.strokeStyle = '#1c495c'; ctx.lineWidth = 1; ctx.strokeRect(22.5, 28.5, WIDTH - 45, HEIGHT - 57);
        ctx.strokeStyle = '#b6c7c8'; ctx.lineWidth = 0.6; ctx.strokeRect(32.5, 38.5, WIDTH - 65, HEIGHT - 77);
        for (const x of [22, WIDTH - 22]) for (const y of [22, HEIGHT - 22]) {
            const dx = x < WIDTH / 2 ? 1 : -1, dy = y < HEIGHT / 2 ? 1 : -1;
            line(ctx, x, y + dy * 28, x, y, teal, 3); line(ctx, x, y, x + dx * 56, y, teal, 3);
            ctx.fillStyle = gold; ctx.fillRect(x + dx * 63 - 2, y - 2, 4, 4);
        }
        label(ctx, 'IP2LIVE', 62, 65, 17, ink, 'left', '"Neuropol", sans-serif');
        label(ctx, result.ai ? 'PVP / VS AI' : 'PLAYER VS PLAYER', 780, 65, 10, teal, 'right');
        line(ctx, 62, 86, 780, 86, '#c1cecd', 0.7);
        label(ctx, 'CERTIFICATE', 421, 133, 34, ink, 'center', '"Neuropol", sans-serif');
        label(ctx, 'O F   V I C T O R Y', 421, 172, 13, teal);
        label(ctx, 'Awarded to', 421, 219, 12, muted);
        label(ctx, result.name, 421, 262, 38, ink, 'center', '"Oxanium-Medium", "Segoe UI", sans-serif', 670);
        line(ctx, 167, 293, 675, 293, '#b3c5c5', 0.8);
        label(ctx, result.ai ? 'Winner of an IP2Live Engine Race against AI' : 'Winner of an IP2Live local Player vs Player Engine Race', 421, 322, 14);
        label(ctx, 'Opponent: ' + result.opponent, 421, 348, 12, muted, 'center', '"Segoe UI", sans-serif', 670);
        label(ctx, result.forfeit ? 'Victory by opponent forfeit' : 'Engine powered. Race complete.', 421, 375, 11, teal);
        const stats = [[result.wins, 'GAMEPLAYS WON'], [result.mistakes, 'RECORDED MISTAKES'], [result.charge + ' / ' + result.target, 'ENGINE CHARGE']];
        stats.forEach(([value, title], i) => {
            const x = 181 + i * 240;
            if (i) line(ctx, x - 120, 407, x - 120, 453, '#c8d3d1', 0.7);
            label(ctx, value, x, 422, 21, ink, 'center', '"Oxanium-Medium", sans-serif', 210);
            label(ctx, title, x, 448, 8, muted);
        });
        const date = new Date(result.completedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        label(ctx, 'DATE OF VICTORY', 62, 500, 8, muted, 'left'); label(ctx, date, 62, 520, 12, ink, 'left');
        const cx = 724, cy = 513;
        ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2); ctx.strokeStyle = gold; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, 29, 0, Math.PI * 2); ctx.strokeStyle = '#a27f3e55'; ctx.lineWidth = 0.7; ctx.stroke();
        for (let i = 0; i < 24; i++) {
            const angle = i * Math.PI / 12;
            line(ctx, cx + Math.cos(angle) * 36, cy + Math.sin(angle) * 36, cx + Math.cos(angle) * 38, cy + Math.sin(angle) * 38, gold, 0.6);
        }
        label(ctx, 'RACE', cx, cy - 7, 9, gold); label(ctx, 'WINNER', cx, cy + 7, 10, gold);
        label(ctx, 'MATCH ' + result.matchId, 421, 554, 7, muted, 'center', 'monospace', 650);
        ctx.restore();
    }
    function create(match, playerId, options) {
        const result = details(match, playerId, options), canvas = document.createElement('canvas'); canvas.width = WIDTH * 3; canvas.height = HEIGHT * 3;
        const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('The certificate could not be rendered.');
        draw(ctx, result);
        const safe = value => String(value || '').replace(/[^a-z0-9_-]/gi, '_').slice(0, 48) || 'Winner';
        return { blob: IP2Live.CertificatePDF.create(canvas, { title: 'IP2Live - Certificate of Victory', subject: result.name + ' | ' + result.matchId }), filename: 'IP2Live_PVP_Victory_' + safe(result.name) + '_' + safe(result.matchId) + '.pdf', details: result };
    }
    IP2Live.PVPCertificate = { details, draw, create, download: certificate => IP2Live.CertificatePDF.download(certificate) };
})();
