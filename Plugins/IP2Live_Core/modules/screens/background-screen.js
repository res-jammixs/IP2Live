/**
 * IP2Live - Background Screen Renderer
 * @file Plugins/IP2Live_Core/modules/screens/background-screen.js
 *
 * Minimal, structured cyber-network background for menu screens.
 */

class IP2LiveBackgroundScreen {
    constructor() {
        this._lastW = 0;
        this._lastH = 0;
        this._packetLines = [];
        this._noisePoints = [];
        this._wireBundles = [];
        this._rightTags = [];
        this._rightShards = [];
        this._subnetNodes = [];
        this._subnetLinks = [];
        this._telemetryCards = [];
        this._seeded = false;
    }

    _ensureSeed(width, height) {
        if (this._seeded && this._lastW === width && this._lastH === height) return;
        this._seeded = true;
        this._lastW = width;
        this._lastH = height;
        this._packetLines = [];
        this._noisePoints = [];
        this._wireBundles = [];
        this._rightTags = [];
        this._rightShards = [];
        this._subnetNodes = [];
        this._subnetLinks = [];
        this._telemetryCards = [];

        // Global diagonal lanes (reduced count for cleaner look).
        for (let i = 0; i < 10; i++) {
            const y0 = (height * 0.14) + i * (height * 0.068);
            const skew = (i % 2 === 0 ? 1 : -1) * (10 + i * 2);
            this._packetLines.push({
                x1: -width * 0.08,
                y1: y0 + skew,
                x2: width * 1.04,
                y2: y0 - (height * 0.18) - skew * 0.45,
                speed: 0.002 + (i % 4) * 0.00055,
                phase: Math.random()
            });
        }

        // Sparse atmospheric data points.
        for (let i = 0; i < 84; i++) {
            this._noisePoints.push({
                x: Math.random() * width,
                y: Math.random() * height,
                a: 0.03 + Math.random() * 0.13,
                s: 0.6 + Math.random() * 1.0,
                p: Math.random() * Math.PI * 2
            });
        }

        // Structured right-side cable bundles.
        for (let i = 0; i < 8; i++) {
            const baseY = height * (0.20 + i * 0.075);
            const jitter = (Math.random() - 0.5) * (height * 0.045);
            this._wireBundles.push({
                sx: width * (0.62 + Math.random() * 0.04),
                sy: baseY,
                c1x: width * (0.72 + Math.random() * 0.04),
                c1y: baseY + jitter,
                c2x: width * (0.84 + Math.random() * 0.04),
                c2y: baseY - jitter,
                ex: width * (0.96 + Math.random() * 0.02),
                ey: baseY + (Math.random() - 0.5) * (height * 0.05),
                color: i % 3 === 0 ? '255,0,60' : (i % 3 === 1 ? '0,240,255' : '255,230,0'),
                speed: 0.0016 + Math.random() * 0.0018,
                phase: Math.random()
            });
        }

        // Right-side labels pinned to organized lanes.
        const labels = [
            'IP 10.72.14.24/24', 'CIDR /27', 'SSH TUNNEL',
            'PORT 443 OPEN', 'RX 12.8KB', 'TX 9.4KB',
            'ROUTE HOP_09', 'VLAN 07', 'NAT MAP', 'IP TRACE'
        ];
        for (let i = 0; i < 12; i++) {
            this._rightTags.push({
                x: width * (0.70 + (i % 3) * 0.09),
                y: height * (0.16 + i * 0.06),
                baseY: height * (0.16 + i * 0.06),
                drift: 0.04 + Math.random() * 0.07,
                a: 0.22 + Math.random() * 0.20,
                s: 9 + Math.random() * 2.5,
                p: Math.random() * Math.PI * 2,
                text: labels[i % labels.length],
                color: i % 4 === 0 ? '#FFE600' : (i % 2 === 0 ? '#00E8FF' : '#FF2A66')
            });
        }

        // Persona-inspired angular shards on the right side.
        for (let i = 0; i < 8; i++) {
            this._rightShards.push({
                cx: width * (0.66 + Math.random() * 0.28),
                cy: height * (0.14 + i * 0.10 + Math.random() * 0.03),
                w: width * (0.04 + Math.random() * 0.08),
                h: height * (0.02 + Math.random() * 0.06),
                skew: (Math.random() - 0.5) * 28,
                rot: -0.30 + Math.random() * 0.55,
                pulse: 0.2 + Math.random() * 0.28,
                speed: 0.010 + Math.random() * 0.015,
                phase: Math.random() * Math.PI * 2
            });
        }

        // Subnet graph nodes and links.
        const nodeGrid = [
            [0.66, 0.24], [0.74, 0.20], [0.83, 0.24], [0.90, 0.20],
            [0.69, 0.35], [0.77, 0.33], [0.85, 0.35], [0.93, 0.32],
            [0.67, 0.45], [0.75, 0.46], [0.84, 0.46], [0.92, 0.44],
            [0.70, 0.58], [0.79, 0.56], [0.88, 0.58]
        ];
        for (let i = 0; i < nodeGrid.length; i++) {
            this._subnetNodes.push({
                x: width * nodeGrid[i][0],
                y: height * nodeGrid[i][1],
                r: 1.6 + (i % 3) * 0.7,
                p: Math.random() * Math.PI * 2
            });
        }
        this._subnetLinks = [
            [0, 1], [1, 2], [2, 3],
            [0, 4], [1, 5], [2, 6], [3, 7],
            [4, 5], [5, 6], [6, 7],
            [4, 8], [5, 9], [6, 10], [7, 11],
            [8, 9], [9, 10], [10, 11],
            [8, 12], [9, 13], [10, 14],
            [12, 13], [13, 14], [2, 5], [6, 9], [10, 13]
        ];

        // Right-side themed cards.
        const cardDefs = [
            ['IT CORE', 'SYS HEALTH 98%', 0.71, 0.66, '#00E8FF'],
            ['HACKING', 'EXPLOIT QUEUE 03', 0.79, 0.70, '#FF2A66'],
            ['INFILTRATOR ENG', 'MASK PROFILE_09', 0.67, 0.79, '#FFE600'],
            ['SUBNETTING', 'CIDR MAP /27', 0.83, 0.82, '#00E8FF'],
            ['NETWORKING', 'LATENCY 09MS', 0.75, 0.90, '#FF2A66']
        ];
        for (let i = 0; i < cardDefs.length; i++) {
            this._telemetryCards.push({
                title: cardDefs[i][0],
                body: cardDefs[i][1],
                x: width * cardDefs[i][2],
                y: height * cardDefs[i][3],
                color: cardDefs[i][4],
                w: width * 0.16,
                h: height * 0.060,
                drift: 2 + Math.random() * 3.2,
                p: Math.random() * Math.PI * 2
            });
        }
    }

    _drawPoly(ctx, points, fillStyle, strokeStyle, lineWidth) {
        if (!points || points.length < 3) return;
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            if (i === 0) ctx.moveTo(p[0], p[1]);
            else ctx.lineTo(p[0], p[1]);
        }
        ctx.closePath();
        if (fillStyle) {
            ctx.fillStyle = fillStyle;
            ctx.fill();
        }
        if (strokeStyle && lineWidth > 0) {
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = lineWidth;
            ctx.stroke();
        }
    }

    _drawRightTechDeck(ctx, width, height, tick) {
        const centerX = width * 0.78;
        const centerY = height * 0.50;

        ctx.save();

        // Large angular slab to anchor the right side.
        const slab = [
            [width * 0.60, height * 0.11],
            [width * 0.96, height * 0.08],
            [width * 0.98, height * 0.86],
            [width * 0.67, height * 0.93],
            [width * 0.56, height * 0.56]
        ];
        const slabGrad = ctx.createLinearGradient(width * 0.57, height * 0.10, width * 0.98, height * 0.92);
        slabGrad.addColorStop(0, 'rgba(255,0,60,0.13)');
        slabGrad.addColorStop(0.35, 'rgba(8,14,30,0.75)');
        slabGrad.addColorStop(0.75, 'rgba(4,14,28,0.88)');
        slabGrad.addColorStop(1, 'rgba(0,240,255,0.14)');
        this._drawPoly(ctx, slab, slabGrad, 'rgba(0,240,255,0.28)', 1.4);

        // Irregular shards and slashes.
        for (let i = 0; i < this._rightShards.length; i++) {
            const shard = this._rightShards[i];
            const bob = Math.sin(tick * shard.speed + shard.phase) * shard.pulse * 6;
            ctx.save();
            ctx.translate(shard.cx, shard.cy + bob);
            ctx.rotate(shard.rot + Math.sin(tick * 0.005 + shard.phase) * 0.08);
            const skew = shard.skew;
            const pts = [
                [-shard.w * 0.5, -shard.h * 0.5],
                [shard.w * 0.38, -shard.h * 0.48],
                [shard.w * 0.5, -shard.h * 0.08],
                [shard.w * 0.08, shard.h * 0.50],
                [-shard.w * 0.52, shard.h * 0.34]
            ];
            for (let p = 0; p < pts.length; p++) {
                pts[p][0] += (p % 2 === 0 ? -1 : 1) * skew * 0.1;
            }
            const alpha = 0.10 + 0.12 * (0.5 + 0.5 * Math.sin(tick * 0.018 + shard.phase));
            const fill = i % 3 === 0 ? 'rgba(255,0,60,' + alpha.toFixed(3) + ')' :
                (i % 3 === 1 ? 'rgba(0,240,255,' + (alpha + 0.03).toFixed(3) + ')' : 'rgba(255,230,0,' + (alpha - 0.01).toFixed(3) + ')');
            this._drawPoly(ctx, pts, fill, 'rgba(255,255,255,0.10)', 1.0);
            ctx.restore();
        }

        // Pulsing ring and subnet grid core.
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(-0.21);
        ctx.strokeStyle = 'rgba(0,240,255,0.26)';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.ellipse(0, 0, width * 0.13, height * 0.09, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255,0,60,0.20)';
        ctx.beginPath();
        ctx.ellipse(0, 0, width * 0.09, height * 0.06, 0, 0, Math.PI * 2);
        ctx.stroke();

        for (let i = -3; i <= 3; i++) {
            ctx.strokeStyle = i % 2 === 0 ? 'rgba(0,240,255,0.13)' : 'rgba(255,230,0,0.10)';
            ctx.beginPath();
            ctx.moveTo(-width * 0.14, i * height * 0.018);
            ctx.lineTo(width * 0.14, i * height * 0.018);
            ctx.stroke();
        }
        ctx.restore();

        // Subnet links and nodes.
        for (let i = 0; i < this._subnetLinks.length; i++) {
            const lk = this._subnetLinks[i];
            const a = this._subnetNodes[lk[0]];
            const b = this._subnetNodes[lk[1]];
            if (!a || !b) continue;
            const pulse = 0.16 + 0.16 * (0.5 + 0.5 * Math.sin(tick * 0.026 + i * 0.9));
            ctx.strokeStyle = i % 3 === 0 ? 'rgba(255,0,60,' + pulse.toFixed(3) + ')' : 'rgba(0,240,255,' + pulse.toFixed(3) + ')';
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
        for (let i = 0; i < this._subnetNodes.length; i++) {
            const n = this._subnetNodes[i];
            const pulse = 0.46 + 0.54 * Math.sin(tick * 0.04 + n.p);
            const r = n.r + pulse * 1.2;
            ctx.fillStyle = i % 5 === 0 ? 'rgba(255,230,0,0.80)' : (i % 2 === 0 ? 'rgba(0,240,255,0.72)' : 'rgba(255,0,60,0.70)');
            ctx.beginPath();
            ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Moving packet beams across the right side.
        for (let i = 0; i < 6; i++) {
            const laneY = height * (0.18 + i * 0.10);
            const travel = (tick * (0.9 + i * 0.12) + i * 92) % (width * 0.34);
            const x = width * 0.62 + travel;
            ctx.fillStyle = i % 2 === 0 ? 'rgba(0,240,255,0.74)' : 'rgba(255,0,60,0.70)';
            ctx.fillRect(x - 7, laneY - 1.4, 14, 2.8);
            ctx.strokeStyle = 'rgba(255,230,0,0.18)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(width * 0.62, laneY);
            ctx.lineTo(width * 0.96, laneY - height * 0.03);
            ctx.stroke();
        }

        // Right-side thematic cards.
        ctx.textAlign = 'left';
        for (let i = 0; i < this._telemetryCards.length; i++) {
            const card = this._telemetryCards[i];
            const bob = Math.sin(tick * 0.018 + card.p) * card.drift;
            const x = card.x;
            const y = card.y + bob;
            const w = card.w;
            const h = card.h;
            const poly = [
                [x, y],
                [x + w * 0.88, y],
                [x + w, y + h * 0.35],
                [x + w * 0.92, y + h],
                [x + w * 0.04, y + h],
                [x - w * 0.04, y + h * 0.42]
            ];

            const cGrad = ctx.createLinearGradient(x - w * 0.04, y, x + w, y + h);
            cGrad.addColorStop(0, 'rgba(3,10,22,0.84)');
            cGrad.addColorStop(1, 'rgba(7,18,32,0.58)');
            this._drawPoly(ctx, poly, cGrad, 'rgba(255,255,255,0.16)', 1.0);

            ctx.fillStyle = card.color;
            ctx.fillRect(x + w * 0.02, y + h * 0.14, w * 0.015, h * 0.72);

            ctx.font = 'bold ' + Math.round(height * 0.013) + 'px monospace';
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(card.title, x + w * 0.06, y + h * 0.42);

            ctx.font = Math.round(height * 0.010) + 'px monospace';
            ctx.fillStyle = 'rgba(0,240,255,0.86)';
            ctx.fillText(card.body, x + w * 0.06, y + h * 0.72);

            const meterW = w * 0.26;
            const meterX = x + w * 0.66;
            const meterY = y + h * 0.56;
            for (let b = 0; b < 4; b++) {
                const active = ((Math.floor(tick / 6) + b + i) % 4);
                ctx.fillStyle = b <= active ? 'rgba(255,230,0,0.88)' : 'rgba(255,230,0,0.22)';
                ctx.fillRect(meterX + b * (meterW * 0.27), meterY, meterW * 0.18, h * 0.13);
            }
        }

        // Anchor header for right composition.
        ctx.font = 'bold ' + Math.round(height * 0.016) + 'px monospace';
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillText('INFILTRATOR NETWORK DECK', width * 0.645, height * 0.12);
        ctx.font = Math.round(height * 0.010) + 'px monospace';
        ctx.fillStyle = 'rgba(0,240,255,0.74)';
        ctx.fillText('IT // HACKING // ENGINEERING // SUBNETTING', width * 0.645, height * 0.145);

        ctx.restore();
    }

    _drawRightHUDModules(ctx, width, height, tick) {
        // Corner accents (sleek brackets).
        ctx.strokeStyle = 'rgba(0,240,255,0.75)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(width - 128, 26); ctx.lineTo(width - 28, 26);
        ctx.moveTo(width - 28, 26); ctx.lineTo(width - 28, 82);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255,230,0,0.70)';
        ctx.beginPath();
        ctx.moveTo(width - 168, height - 26); ctx.lineTo(width - 28, height - 26);
        ctx.moveTo(width - 28, height - 26); ctx.lineTo(width - 28, height - 96);
        ctx.stroke();
    }

    draw(ctx, width, height, tick, shakeX, shakeY) {
        this._ensureSeed(width, height);
        const t = tick || 0;
        const sx = shakeX || 0;
        const sy = shakeY || 0;

        ctx.save();
        ctx.translate(sx * 0.20, sy * 0.20);

        // Base atmosphere with depth.
        const bg = ctx.createLinearGradient(0, 0, width, height);
        bg.addColorStop(0, '#050A1D');
        bg.addColorStop(0.52, '#040E26');
        bg.addColorStop(1, '#0A0620');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);

        // Controlled bloom.
        const glow = ctx.createRadialGradient(
            width * 0.72, height * 0.48, width * 0.05,
            width * 0.72, height * 0.48, width * 0.42
        );
        glow.addColorStop(0, 'rgba(0,240,255,0.16)');
        glow.addColorStop(0.45, 'rgba(255,0,60,0.09)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, width, height);

        // Intersecting field lines (lower noise).
        ctx.lineWidth = 1;
        for (let i = -16; i <= 20; i++) {
            const x = i * (width * 0.058);
            ctx.strokeStyle = (i % 3 === 0) ? 'rgba(0,240,255,0.12)' : 'rgba(0,240,255,0.06)';
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + width * 0.34, height);
            ctx.stroke();
        }
        for (let j = -8; j <= 12; j++) {
            const y = j * (height * 0.095);
            ctx.strokeStyle = (j % 2 === 0) ? 'rgba(255,0,60,0.08)' : 'rgba(255,230,0,0.05)';
            ctx.beginPath();
            ctx.moveTo(0, y + height * 0.20);
            ctx.lineTo(width, y - height * 0.08);
            ctx.stroke();
        }

        // Main packet lanes.
        for (let i = 0; i < this._packetLines.length; i++) {
            const ln = this._packetLines[i];
            const color = i % 3 === 0 ? 'rgba(255,0,60,0.20)' : (i % 3 === 1 ? 'rgba(0,240,255,0.25)' : 'rgba(255,230,0,0.16)');
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.moveTo(ln.x1, ln.y1);
            ctx.lineTo(ln.x2, ln.y2);
            ctx.stroke();

            const p = (ln.phase + t * ln.speed) % 1;
            const q = (p + 0.44) % 1;
            const rx1 = ln.x1 + (ln.x2 - ln.x1) * p;
            const ry1 = ln.y1 + (ln.y2 - ln.y1) * p;
            const rx2 = ln.x1 + (ln.x2 - ln.x1) * q;
            const ry2 = ln.y1 + (ln.y2 - ln.y1) * q;

            ctx.fillStyle = i % 2 === 0 ? 'rgba(0,240,255,0.80)' : 'rgba(255,0,60,0.76)';
            ctx.fillRect(rx1 - 4, ry1 - 1.4, 8, 2.8);
            ctx.fillStyle = 'rgba(255,230,0,0.74)';
            ctx.fillRect(rx2 - 3, ry2 - 1.2, 6, 2.4);
        }

        // Right structured wire bundles.
        for (let i = 0; i < this._wireBundles.length; i++) {
            const w = this._wireBundles[i];
            const pulse = 0.16 + 0.12 * Math.sin(t * 0.02 + w.phase * Math.PI * 2);
            ctx.strokeStyle = 'rgba(' + w.color + ',' + pulse.toFixed(3) + ')';
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(w.sx, w.sy);
            ctx.bezierCurveTo(w.c1x, w.c1y, w.c2x, w.c2y, w.ex, w.ey);
            ctx.stroke();

            const p = (w.phase + t * w.speed) % 1;
            const uu = 1 - p;
            const x = (uu * uu * uu * w.sx) +
                (3 * uu * uu * p * w.c1x) +
                (3 * uu * p * p * w.c2x) +
                (p * p * p * w.ex);
            const y = (uu * uu * uu * w.sy) +
                (3 * uu * uu * p * w.c1y) +
                (3 * uu * p * p * w.c2y) +
                (p * p * p * w.ey);
            ctx.fillStyle = 'rgba(255,230,0,0.78)';
            ctx.fillRect(x - 2.8, y - 1.1, 5.6, 2.2);
        }

        // Organized right-side labels.
        ctx.textAlign = 'left';
        for (let i = 0; i < this._rightTags.length; i++) {
            const tag = this._rightTags[i];
            tag.y = tag.baseY + Math.sin(t * 0.01 + tag.p) * (tag.drift * 12);
            const flicker = 0.75 + 0.25 * Math.sin(t * 0.02 + tag.p + i * 0.19);
            ctx.globalAlpha = tag.a * flicker;
            ctx.font = Math.round(tag.s) + 'px monospace';
            ctx.fillStyle = tag.color;
            ctx.fillText(tag.text, tag.x, tag.y);
        }
        ctx.globalAlpha = 1;

        // Sparse background numerics.
        const codeBits = ['0', '1', '/24', '/27', 'IP', 'TX', 'RX', 'SSH'];
        for (let i = 0; i < this._noisePoints.length; i++) {
            const n = this._noisePoints[i];
            const flicker = 0.5 + 0.5 * Math.sin(t * 0.018 + n.p);
            ctx.globalAlpha = n.a * flicker;
            ctx.fillStyle = i % 6 === 0 ? '#FFE600' : '#00E8FF';
            ctx.font = (8 + n.s) + 'px monospace';
            if (i % 9 === 0) {
                const label = codeBits[(i + Math.floor(t / 24)) % codeBits.length];
                ctx.fillText(label, n.x, n.y);
            } else {
                ctx.fillRect(n.x, n.y, n.s, n.s);
            }
        }
        ctx.globalAlpha = 1;

        this._drawRightTechDeck(ctx, width, height, t);
        this._drawRightHUDModules(ctx, width, height, t);

        // Left vignette for menu readability.
        const vg = ctx.createLinearGradient(0, 0, width * 0.50, 0);
        vg.addColorStop(0, 'rgba(0,0,0,0.54)');
        vg.addColorStop(0.70, 'rgba(0,0,0,0.24)');
        vg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, width, height);

        ctx.restore();
    }
}

window.IP2LiveBackgroundScreen = IP2LiveBackgroundScreen;
console.log('[IP2Live] background-screen.js loaded.');
