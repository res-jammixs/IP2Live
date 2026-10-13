/** Endless lobby and results share the Story award's textured command-deck materials. */
(function () {
    const colors = { text: '#edf6f7', muted: '#98afbd', cyan: '#79f4dc', gold: '#ecd598' };
    const family = '"Oxanium-Medium", "Segoe UI", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    function text(ctx, value, x, y, size = 16, color = colors.text, width = 460, align = 'left') {
        ctx.font = size + 'px ' + family; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
        const measured = ctx.measureText(String(value)).width;
        if (measured > width) ctx.font = (size * width / measured) + 'px ' + family;
        ctx.fillText(String(value), x, y, width);
    }
    const duration = ms => Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0');
    function polygon(ctx, points, fill, stroke, width = 1) {
        ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
        if (fill) { ctx.fillStyle = fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
    }
    function line(ctx, points, color, width = 1) {
        ctx.beginPath(); points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    }
    function gradient(ctx, x, y, w, h, colors) {
        const g = ctx.createLinearGradient(x, y, x + w, y + h);
        colors.forEach((color, i) => g.addColorStop(i / (colors.length - 1), color)); return g;
    }
    function plate(ctx, x, y, w, h, accent = '#6b9a9b') {
        const shape = inset => [[x + 9 + inset, y + inset], [x + w - inset, y + inset], [x + w - inset, y + h - 9 - inset],
            [x + w - 9 - inset, y + h - inset], [x + inset, y + h - inset], [x + inset, y + 9 + inset]];
        polygon(ctx, shape(0), '#020a1090', '#3d5964');
        polygon(ctx, shape(2), gradient(ctx, x, y, w, h, ['#29414c80', '#0a1823', '#132935']), '#9ac0c11a');
        line(ctx, [[x + 13, y + 2], [x + 58, y + 2]], accent, 2);
        line(ctx, [[x + w - 54, y + h - 2], [x + w - 13, y + h - 2]], '#9dc2c029');
        for (let i = 0; i < 5; i++) line(ctx, [[x + w - 48 + i * 9, y + 3], [x + w - 70 + i * 9, y + h - 3]], '#a5d5cf08');
    }
    function heading(ctx, value, x, y, size, width) {
        ctx.font = size + 'px "Nebula-Regular", sans-serif';
        const measured = ctx.measureText(value).width;
        if (measured > width) ctx.font = (size * width / measured) + 'px "Nebula-Regular", sans-serif';
        ctx.fillStyle = colors.text; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(value, x, y);
    }
    class EndlessScreen extends IP2Live.StoryEndingScreen {
        constructor() {
            super(null, { certificateOnly: true });
            this.channelLabel = 'ENDLESS'; this.awardLabel = 'THE CHALLENGE'; this.formatLabel = 'RANDOMIZED GAMEPLAYS'; this.footerLabel = 'IP2 / ENDLESS';
            this.footerRight = 'ARROWS  SELECT   /   ENTER  CONFIRM   /   ESC  BACK'; this.hideActionNumbers = true;
            this.players = []; this.playerIndex = 0; this.loadingPlayers = true; this.busy = true; this.view = 'lobby';
            this._coreArt = null;
        }
        async load() {
            try {
                await IP2Live.Assets?.loadPauseFonts?.();
                const players = await IP2Live.EndlessMode.players();
                if (this.closed) return;
                this.players = players;
                const profile = IP2Live.FeatureTelemetry?.profile();
                const preferred = players.findIndex(r => profile?.profileId ? r.profileId === profile.profileId : r.name === profile?.infiltratorName);
                this.playerIndex = Math.max(0, preferred);
                this.notice = players.length ? '' : 'Finish Story Mode to unlock Endless Mode for your player.';
            } catch (error) { this.notice = 'Could not read Story completion. Go back and reopen Endless Mode to retry.'; this.noticeError = true; }
            finally { this.loadingPlayers = false; this.busy = false; this.loading = false; this._paint(); }
        }
        _actions() {
            if (this.view === 'result') return [
                { id: 'pdf', label: this.busy ? 'PLEASE WAIT...' : 'DOWNLOAD CERTIFICATE', x: 80, y: 606, w: 330, h: 50 },
                { id: 'again', label: 'PLAY AGAIN', x: 430, y: 606, w: 224, h: 50 },
                { id: 'menu', label: 'MAIN MENU', x: 974, y: 606, w: 226, h: 50 },
            ];
            return [
                ...(this.players.length ? [{ id: 'start', label: this.busy ? 'PLEASE WAIT...' : 'START ENDLESS', x: 80, y: 606, w: 270, h: 50 }] : []),
                ...(this.players.length > 1 ? [{ id: 'player', label: 'CHANGE PLAYER', x: 370, y: 606, w: 220, h: 50 }] : []),
                ...(IP2Live.EndlessMode.lastResult(this.players[this.playerIndex] || {}) ? [{ id: 'last', label: 'LAST CERTIFICATE', x: 610, y: 606, w: 246, h: 50 }] : []),
                { id: 'menu', label: 'BACK', x: 974, y: 606, w: 226, h: 50 },
            ];
        }
        async _activate(id) {
            if (this.busy || this.closed || Date.now() < this.readyAt || IP2Live.EndlessMode.active) return;
            if (id === 'player') { this.playerIndex = (this.playerIndex + 1) % this.players.length; this._paint(); return; }
            if (id === 'last') { const record = IP2Live.EndlessMode.lastResult(this.players[this.playerIndex]); if (record) this.showResult(record); return; }
            if (id === 'again') {
                this.view = 'lobby'; this.record = null; this.preview = null; this.notice = ''; this.selected = 0;
                this.awardLabel = 'THE CHALLENGE'; this.formatLabel = 'RANDOMIZED GAMEPLAYS'; this._backdrops.clear(); this._paint(); return;
            }
            if (id === 'start') {
                this.busy = true; this.notice = ''; this._paint();
                try {
                    const launch = () => IP2Live.EndlessMode.start(this.players[this.playerIndex], this);
                    const opened = await launch();
                    if (!opened) this.notice = 'Could not start this run. Choose a player who has completed Story Mode and try again.';
                } catch (error) { this.notice = 'Could not start Endless Mode. Please try again.'; console.warn('[IP2Live] Endless launch:', error); }
                finally { this.busy = false; this._paint(); }
                return;
            }
            if (id === 'pdf') {
                this.busy = true; this.notice = ''; this._paint();
                try {
                    await IP2Live.EndlessCertificate.download(IP2Live.EndlessCertificate.create(this.record));
                    this.notice = 'Certificate download started.'; this.noticeError = false;
                } catch (error) { this.notice = 'Could not download your certificate. Please try again.'; this.noticeError = true; }
                finally { this.busy = false; this._paint(); }
                return;
            }
            if (id === 'menu') {
                if (this.view === 'result') Manager.Stack.subTop?._showMenuPage?.('main');
                this.closed = true;
                if (IP2Live.MenuTransition) IP2Live.MenuTransition.back(); else Manager.Stack.pop();
            }
        }
        showResult(record) {
            this.record = record; this.view = 'result'; this.preview = null; this.selected = 0; this.busy = false;
            this.awardLabel = 'YOUR CERTIFICATE'; this.formatLabel = 'LANDSCAPE PDF'; this._backdrops.clear();
            this.readyAt = Date.now() + 300; this.notice = ''; this.noticeError = false; this._paint();
        }
        _drawComplete(ctx) {
            if (this.view === 'lobby') return this._drawLobby(ctx);
            const r = this.record;
            const reasons = { time_expired: 'TIME LIMIT REACHED', retired: 'RUN RETIRED', unavailable: 'GAMEPLAY UNAVAILABLE', failed: 'CHALLENGE FAILED' };
            text(ctx, reasons[r.reason] || 'CHALLENGE FAILED', 86, 160, 10, colors.cyan);
            heading(ctx, 'RUN ENDED', 86, 210, 28, 460);
            text(ctx, r.name, 86, 248, 19, colors.muted);
            text(ctx, Number(r.score).toLocaleString() + ' PTS', 86, 298, 46, colors.gold);
            text(ctx, 'GAMEPLAYS SOLVED', 100, 351, 10, colors.muted, 202);
            text(ctx, String(r.completedRounds), 100, 381, 26, colors.cyan, 202);
            text(ctx, 'ACTIVE TIME', 338, 351, 10, colors.muted, 220);
            text(ctx, duration(r.activeElapsedMs), 338, 381, 26, colors.cyan, 220);
            const recent = (r.rounds || []).filter(round => round.outcome === 'completed').slice(-3);
            if (recent.length) text(ctx, 'RECENT SOLVES', 86, 422, 10, colors.cyan, 220);
            text(ctx, r.mistakes + ' MISTAKES', 550, 422, 11, colors.muted, 200, 'right');
            recent.forEach((round, i) => {
                text(ctx, round.number, 102, 454 + i * 25, 10, colors.cyan, 38, 'center');
                text(ctx, round.name, 128, 454 + i * 25, 11, colors.text, 310);
                text(ctx, '+' + round.points, 550, 454 + i * 25, 13, colors.gold, 96, 'right');
            });
            if (!recent.length) text(ctx, r.completedRounds ? 'Round evidence is available in Export Report.' : 'Every attempt is a chance to improve.', 86, 473, 14, colors.muted);
            text(ctx, 'Accuracy and timing are saved in Export Report.', 86, 532, 11, colors.muted);
            if (!this.preview) {
                this.preview = document.createElement('canvas'); this.preview.width = 1684; this.preview.height = 1190;
                IP2Live.EndlessCertificate.draw(this.preview.getContext('2d'), r);
            }
            ctx.fillStyle = '#00000060'; ctx.fillRect(648, 179, 552, 552 * 595 / 842);
            ctx.drawImage(this.preview, 640, 171, 552, 552 * 595 / 842);
        }
        _drawLobby(ctx) {
            const config = IP2Live.EndlessRules?.config || { initialSeconds: 180, graceMs: 300000 };
            const accessLabel = this.players[this.playerIndex]?.developerTest ? 'DEVELOPER TEST / UNLOCKED'
                : this.players.length ? 'STORY COMPLETE / UNLOCKED' : 'STORY COMPLETION REQUIRED';
            text(ctx, accessLabel, 86, 160, 10, colors.cyan);
            heading(ctx, 'ENDLESS', 86, 214, 38, 466);
            text(ctx, 'Keep the network alive.', 86, 253, 16, colors.muted);
            text(ctx, this.loadingPlayers ? 'READING COMPLETIONS...' : 'PLAYING AS', 100, 302, 10, colors.cyan);
            text(ctx, this.players[this.playerIndex]?.name || 'No completed Story found', 100, 336, 26, colors.gold, 460);
            text(ctx, duration(config.initialSeconds * 1000).padStart(5, '0'), 100, 412, 36, colors.text, 202);
            text(ctx, 'ROUND LIMIT', 100, 444, 10, colors.muted, 202);
            text(ctx, duration(config.graceMs).padStart(5, '0'), 338, 412, 36, colors.text, 220);
            text(ctx, 'PRESSURE STARTS', 338, 444, 10, colors.muted, 220);
            text(ctx, 'Faster solves and fewer mistakes earn more points.', 86, 489, 12, colors.muted);
            text(ctx, 'A failed challenge ends your run.', 86, 519, 13, colors.text);
            this._drawCore(ctx);
            ['1', '2', '3', '4', '4.5', '5', '6'].forEach((n, i) => {
                text(ctx, n, 680 + i * 80, 447, 19, i === 2 || i === 3 ? colors.gold : colors.cyan, 54, 'center');
            });
            text(ctx, 'Gameplay 3 and 4 share the same subnet mask.', 922, 498, 13, colors.text, 520, 'center');
            text(ctx, 'Round limits shrink as you play. Harder games get more time.', 922, 543, 11, colors.muted, 520, 'center');
        }
        _buildBackdrop(ctx) {
            super._buildBackdrop(ctx);
            if (this.view === 'lobby') {
                plate(ctx, 82, 283, 498, 79, '#ecd598');
                plate(ctx, 82, 382, 230, 80); plate(ctx, 320, 382, 260, 80);
                for (let i = 0; i < 7; i++) plate(ctx, 650 + i * 80, 420, 60, 53, i === 2 || i === 3 ? '#ecd598' : '#69b7ac');
                line(ctx, [[836, 480], [836, 485], [924, 485], [924, 480]], '#c5b07770');
            } else {
                plate(ctx, 82, 334, 230, 70); plate(ctx, 320, 334, 260, 70);
                const count = Math.min(3, (this.record?.rounds || []).filter(round => round.outcome === 'completed').length);
                for (let i = 0; i < count; i++) {
                    polygon(ctx, [[86, 446 + i * 25], [98, 439 + i * 25], [118, 439 + i * 25], [118, 462 + i * 25], [86, 462 + i * 25]], '#31545b55', '#5c83864a');
                    line(ctx, [[128, 465 + i * 25], [554, 465 + i * 25]], '#829d9b1c');
                }
            }
        }
        _drawCore(ctx) {
            if (!this._coreArt) {
                const surface = document.createElement('canvas'); surface.width = 1200; surface.height = 520;
                const p = surface.getContext('2d'); p.scale(2, 2); p.translate(300, 118);
                const glow = p.createRadialGradient(0, -16, 5, 0, -16, 180);
                glow.addColorStop(0, '#8cf5d526'); glow.addColorStop(1, '#07121d00'); p.fillStyle = glow; p.fillRect(-300, -118, 600, 260);
                // Projected chassis with multiple material faces and inset circuit paths.
                polygon(p, [[-173, 57], [0, 17], [173, 57], [173, 77], [0, 123], [-173, 77]], '#07151f', '#365660');
                polygon(p, [[-173, 57], [0, 17], [173, 57], [0, 103]], gradient(p, -160, 20, 340, 90, ['#42606a', '#112936', '#213e49']), '#6d959a');
                polygon(p, [[0, 103], [173, 57], [173, 77], [0, 123]], '#0b202c', '#345661');
                polygon(p, [[-173, 57], [0, 103], [0, 123], [-173, 77]], '#142e3a', '#345661');
                for (let i = 0; i < 4; i++) {
                    const d = i * 11;
                    line(p, [[-146 + d, 58], [0, 93 - d * .35], [146 - d, 58]], i === 0 ? '#79f4dc99' : '#84afad30');
                }
                const hull = [[-94, -70], [-75, -94], [76, -94], [95, -70], [95, 47], [0, 78], [-94, 47]];
                polygon(p, hull, gradient(p, -94, -94, 189, 170, ['#63808a', '#233e4c', '#0c1d2a', '#1a3a45']), '#91b1ae');
                polygon(p, [[-94, -70], [-75, -94], [-66, -84], [-82, -64], [-82, 39], [0, 66], [0, 78], [-94, 47]], '#839e9d3b', '#afc4b82b');
                polygon(p, [[76, -94], [95, -70], [95, 47], [0, 78], [0, 66], [82, 39], [82, -64], [67, -84]], '#04121d73', '#afc4b82b');
                const face = [[-66, -83], [67, -83], [82, -64], [82, 39], [0, 66], [-82, 39], [-82, -64]];
                polygon(p, face, gradient(p, -82, -83, 164, 149, ['#173945', '#061622', '#0f2835']), '#97bdad70');
                p.save(); p.beginPath(); face.forEach(([x, y], i) => i ? p.lineTo(x, y) : p.moveTo(x, y)); p.closePath(); p.clip();
                let seed = 419;
                for (let i = 0; i < 1300; i++) {
                    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const x = seed % 164 - 82;
                    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const y = seed % 150 - 83;
                    p.fillStyle = i % 3 ? '#9bc7c710' : '#00091340'; p.fillRect(x, y, i % 5 ? 1 : 5, .5);
                }
                for (let y = -80; y < 67; y += 5) line(p, [[-82, y], [82, y - 22]], '#9abeb708', .6);
                p.restore();
                // A luminous infinity ribbon is recessed into the machined core.
                const ribbon = [];
                for (let i = 0; i <= 160; i++) {
                    const t = i / 160 * Math.PI * 2, d = 1 + Math.cos(t) ** 2;
                    ribbon.push([68 * Math.sin(t) / d, -19 + 63 * Math.sin(t) * Math.cos(t) / d]);
                }
                line(p, ribbon, '#03111b', 15); line(p, ribbon, '#8cedcf12', 16); line(p, ribbon, '#8cedcf25', 11);
                line(p, ribbon, '#4bbaa9', 6); line(p, ribbon, '#bbffe0', 2);
                line(p, [[-56, 29], [-39, 29], [-35, 34], [35, 34], [39, 29], [56, 29]], '#c9b777', 1.2);
                for (const [x, y] of [[-74, -65], [74, -65], [-73, 34], [73, 34]]) {
                    const bolt = Array.from({ length: 6 }, (_, i) => [x + Math.cos(i * Math.PI / 3) * 3, y + Math.sin(i * Math.PI / 3) * 3]);
                    polygon(p, bolt, '#0a1a25', '#719594', .7); line(p, [[x - 1.5, y], [x + 1.5, y]], '#a3b9b1', .6);
                }
                for (const side of [-1, 1]) {
                    line(p, [[side * 95, -36], [side * 161, -36], [side * 194, -65], [side * 247, -65]], '#6b9e9e6b');
                    line(p, [[side * 95, -30], [side * 164, -30], [side * 197, -59], [side * 247, -59]], '#314d596b');
                    for (let i = 0; i < 5; i++) polygon(p, [[side * (134 + i * 10), 5], [side * (140 + i * 10), 5], [side * (136 + i * 10), 11], [side * (130 + i * 10), 11]], '#679da533');
                }
                this._coreArt = surface;
            }
            ctx.drawImage(this._coreArt, 622, 160, 600, 260);
        }
        close() {
            // The scene remains below each puzzle until its run finishes.
            if (IP2Live.EndlessMode.active && IP2Live.EndlessMode.screen === this) {
                const replay = IP2Live.TutorialReplay.session;
                if (replay?.endless) IP2Live.TutorialReplay.finishScreen(replay.screen);
                else IP2Live.EndlessMode._end('retired');
            }
            this.closed = true; this.preview = null; this._coreArt = null; this._backdrops.clear(); this._buttonSkins.clear();
            if (Scene.Base.prototype.close) Scene.Base.prototype.close.call(this);
        }
    }
    IP2Live.EndlessScreen = EndlessScreen;
})();
