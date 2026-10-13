/** Isolated runs: no campaign saves, HP loss, quest advancement or inherited CIDR data. */
(function () {
    const KEY = 'ip2live.endless.results.v1';
    const mode = {
        active: false, run: null, telemetrySession: null,
        async players() {
            const records = await IP2Live.StoryCompletion.list(), seen = new Set();
            const players = records.filter(r => {
                if (!IP2Live.StoryCompletion.isRecord(r)) return false;
                const key = r.profileId || r.name;
                if (seen.has(key)) return false; seen.add(key); return true;
            });
            if (!players.length && IP2Live.GameManager?.unlockPracticeAndEndlessForTesting === true) {
                const profile = IP2Live.FeatureTelemetry?.profile();
                players.push({ id: 'developer-endless-test', developerTest: true,
                    name: profile?.infiltratorName || 'DEVELOPER', profileId: profile?.profileId || null });
            }
            return players;
        },
        async start(player, screen) {
            if (this.active || IP2Live.TutorialReplay.session || IP2Live.GameManager._activeGameplayNode ||
                (IP2Live.PracticeMode && IP2Live.PracticeMode.active) || (IP2Live.PVPMode && IP2Live.PVPMode.active)) return false;
            // Revalidate earned access or the live developer switch, never the menu cache.
            const eligible = (await this.players()).find(r => r.id === player?.id && r.name === player.name && r.profileId === player.profileId);
            if (!eligible || this.active || IP2Live.TutorialReplay.session || IP2Live.GameManager._activeGameplayNode || screen.closed ||
                IP2Live.PracticeMode?.active || IP2Live.PVPMode?.active) return false;
            const gm = IP2Live.GameManager;
            this.savedGame = Core.Game.current; this.savedState = gm.state; this.screen = screen;
            this.run = { version: 1, rulesVersion: IP2Live.EndlessRules.VERSION, id: 'endless-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10),
                mode: 'endless', status: 'playing', name: eligible.name, profileId: eligible.profileId || null,
                storyCompletionId: eligible.developerTest ? null : eligible.id, developerTest: eligible.developerTest === true,
                startedAt: Date.now(), seed: Math.floor(Math.random() * 0x100000000),
                score: 0, completedRounds: 0, activeElapsedMs: 0, mistakes: 0, rounds: [], index: 0 };
            this.active = true;
            this.telemetrySession = IP2Live.FeatureTelemetry?.startSession('endless', 'gameplay',
                { infiltratorName: this.run.name, profileId: this.run.profileId });
            Core.Game.current = null;
            IP2Live.QuestMinimap?.destroy();
            const dialogue = IP2Live.DialogueManager;
            dialogue?.resetTransitionState?.({ stopActive: true, discardActive: true });
            this._openRound(); return true;
        },
        _openRound() {
            if (!this.active) return false;
            // The CRT bridge covers puzzle loading and keeps the timer suspended
            // until its reveal is complete. No inter-round information page.
            const transition = IP2Live.MenuTransition;
            if (Manager.Stack.top === this.screen && transition?.launch && !transition.active &&
                transition.launch(() => this._launchRound(), { freezeTarget: true })) return true;
            return this._launchRound();
        },
        _launchRound() {
            if (!this.active) return false;
            const run = this.run, rules = IP2Live.EndlessRules;
            const game = rules.sequence(run.seed, Math.floor(run.index / 7))[run.index % 7];
            if (game.number === '3') { this.cidrState = null; this.handoffKey = run.id + '-cidr-' + run.index; }
            if (game.number === '4' && !this.cidrState?.handoffs?.[this.handoffKey]) {
                this._end('unavailable'); return false;
            }
            this.round = { gameplayId: game.id, number: game.number, name: game.name, index: run.index,
                timeLimitSeconds: rules.budget(game.id, run.activeElapsedMs), pressureLevel: rules.pressure(run.activeElapsedMs),
                elapsedMs: 0, lastAt: null, wasRunning: false, ended: false };
            const opened = IP2Live.TutorialReplay.launch(game.id, { endlessMode: true, practiceGameplay: true,
                round: run.index + 1, timeLimitSeconds: this.round.timeLimitSeconds,
                handoffKey: this.handoffKey, cidrState: game.number === '4' ? this.cidrState : null });
            if (!opened && this.active) this._end('unavailable');
            return opened;
        },
        configureScreen(screen) {
            if (!this.active || !screen.options?.endlessMode || screen._endlessClockOwned) return;
            screen._endlessClockOwned = true; screen._ip2liveSessionRestoreChecked = true;
            const mode = this, round = this.round;
            const update = screen.update, draw = screen.drawHUD;
            screen.update = function () {
                if (!mode.tick(this, round)) return;
                if (!IP2Live.GameplayTimer.available(this)) {
                    this._endlessSuspended = true;
                    if (this.learningTelemetryClock) this.learningTelemetryClock.lastFrameAt = Date.now();
                    return;
                }
                if (this._endlessSuspended) {
                    if (this.learningTelemetryClock) this.learningTelemetryClock.lastFrameAt = Date.now();
                    this._endlessSuspended = false;
                }
                return update?.apply(this, arguments);
            };
            screen.drawHUD = function () {
                const result = draw?.apply(this, arguments);
                if (mode.active && mode.round === round) mode.drawHUD(this);
                return result;
            };
            for (const key of ['onKeyPressed', 'onKeyPressedAndRepeat', 'onMouseDown', 'onMouseUp']) {
                const original = screen[key];
                if (original) screen[key] = function () {
                    return mode.tick(this, round) && IP2Live.GameplayTimer.available(this) ? original.apply(this, arguments) : true;
                };
            }
            this._syncClock(screen, round);
        },
        _running(screen) {
            const timer = IP2Live.GameplayTimer;
            if (!timer.available(screen) || !timer.running(screen)) return false;
            if (/success|complete|failure|failed|timeout|shutdown|icon_|intro|tracing|diagnostic|stabilizing|overflow/.test(screen.phase || screen.roundState || '')) return false;
            if (screen.roundState && !['active', 'ready'].includes(screen.roundState)) return false;
            if (screen._classUnlockActive?.() || screen._classFormationActive?.()) return false;
            // Subnet Blaster's drop/arrival effects are automatic; preparation and combat count.
            if (this.round.gameplayId === 'ip_cidr_quarantine_matrix' && !['think', 'barriers', 'boss'].includes(screen.phase)) return false;
            return true;
        },
        tick(screen, round = this.round) {
            if (!this.active || round !== this.round || round.ended || screen._ip2liveGameplayExited) return false;
            const now = Date.now(), running = this._running(screen), delta = now - round.lastAt;
            if (running && round.wasRunning && delta > 0 && delta <= 1000) {
                const consumed = Math.min(delta, round.timeLimitSeconds * 1000 - round.elapsedMs);
                round.elapsedMs += consumed; this.run.activeElapsedMs += consumed;
            }
            round.lastAt = now; round.wasRunning = running;
            this._syncClock(screen, round);
            if (round.elapsedMs >= round.timeLimitSeconds * 1000) {
                IP2Live.TutorialReplay.finish(round.gameplayId, IP2Live.TutorialReplay.session?.options, 'failed',
                    Object.assign(this._partialResult(screen), { reason: 'time_expired' }));
                return false;
            }
            return true;
        },
        _syncClock(screen, round) {
            const remaining = Math.max(0, round.timeLimitSeconds * 1000 - round.elapsedMs);
            if (screen.gameplayTimer) Object.assign(screen.gameplayTimer, { elapsedMs: round.elapsedMs, remainingMs: remaining, expired: remaining === 0 });
            if ('solveTimerTicks' in screen) screen.solveTimerTicks = remaining * 0.06;
            if ('questElapsedMs' in screen) screen.questElapsedMs = round.elapsedMs;
            if ('roundRemainingMs' in screen) { screen.roundRemainingMs = remaining; screen.endsAt = Date.now() + remaining; }
        },
        _partialResult(screen) {
            try {
                if (screen._assessmentResult) return screen._assessmentResult();
                if (screen._baseResult && screen._pathStats) return screen._baseResult(screen._pathStats());
                if (screen._result) return screen._result(false);
            } catch (error) { console.warn('[IP2Live] Endless partial evidence:', error); }
            return {};
        },
        prepareResult(gameplayId, outcome, result, screen) {
            if (!this.active || !this.round || this.round.ended || this.round.gameplayId !== gameplayId) return result;
            const round = this.round, gm = IP2Live.GameManager;
            result = Object.assign({}, this._partialResult(screen), result || {});
            const metrics = gm._extractGameplayMetrics(gameplayId, result, outcome === 'completed');
            const score = IP2Live.EndlessRules.reward(gameplayId, metrics, round.elapsedMs, round.timeLimitSeconds);
            round.ended = true;
            Object.assign(round, { outcome, points: outcome === 'completed' ? score.points : 0,
                mistakes: score.mistakes, correctDecisions: metrics.correctDecisions, totalDecisions: metrics.totalDecisions,
                reason: result.reason || (outcome === 'completed' ? 'solved' : ['finished', 'cancelled'].includes(outcome) ? 'retired' : outcome) });
            this.run.score += round.points; this.run.mistakes += round.mistakes;
            if (outcome === 'completed') this.run.completedRounds++;
            this.run.rounds.push(Object.assign({}, round));
            return Object.assign(result, { endlessMode: true, featureMode: 'endless', endlessRunId: this.run.id,
                endlessRound: round.index + 1, endlessScore: this.run.score, endlessPoints: round.points,
                endlessScoring: score, pressureLevel: round.pressureLevel, rulesVersion: this.run.rulesVersion,
                timerEnabled: true, timeLimitSeconds: round.timeLimitSeconds, timerElapsedMs: round.elapsedMs,
                timeRemainingMs: Math.max(0, round.timeLimitSeconds * 1000 - round.elapsedMs), runActiveElapsedMs: this.run.activeElapsedMs });
        },
        onRoundFinished(gameplayId, outcome, result, cidrState) {
            if (!this.active) return;
            if (outcome === 'completed') {
                if (this.round.number === '3') this.cidrState = cidrState;
                this.run.index++;
                const run = this.run;
                // Managers may still be unwinding their completion callback.
                Promise.resolve().then(() => { if (this.active && this.run === run) this._openRound(); });
            } else this._end(result?.reason || (['finished', 'cancelled'].includes(outcome) ? 'retired' : outcome));
        },
        _end(reason) {
            if (!this.active) return;
            this.active = false;
            const record = Object.assign({}, this.run, { status: 'finished', reason, completedAt: Date.now() });
            this.run = record;
            IP2Live.FeatureTelemetry?.endSession(this.telemetrySession, reason, { endlessRunId: record.id,
                score: record.score, completedRounds: record.completedRounds, mistakes: record.mistakes,
                activeElapsedMs: record.activeElapsedMs, rulesVersion: record.rulesVersion });
            this.telemetrySession = null; this.cidrState = null; this.handoffKey = null;
            Core.Game.current = this.savedGame; IP2Live.GameManager.state = this.savedState;
            IP2Live.GameplayPause?.closeMenu?.();
            IP2Live.MusicManager?.play('MAIN_MENU');
            this._archive(record);
            this.screen.showResult(record);
            Manager.Stack.requestPaintHUD = true;
        },
        lastResult(player) {
            try { return JSON.parse(localStorage.getItem(KEY) || '[]').find(r => r.mode === 'endless' && r.status === 'finished' &&
                (player.profileId ? r.profileId === player.profileId : r.name === player.name)) || null; }
            catch (_) { return null; }
        },
        _archive(record) {
            try {
                let records; try { records = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (_) { records = []; }
                if (!Array.isArray(records)) records = [];
                // Certificates need the summary only; the durable telemetry journal owns round evidence.
                const summary = Object.assign({}, record); delete summary.rounds;
                localStorage.setItem(KEY, JSON.stringify([summary].concat(records.filter(r => r.id !== record.id)).slice(0, 50)));
            } catch (error) { console.warn('[IP2Live] Endless certificate archive unavailable:', error); }
        },
        drawHUD(screen) {
            const ctx = Common.Platform.ctx, scale = Math.min(ctx.canvas.width / 1280, ctx.canvas.height / 720);
            if (!this._hudSkin) {
                const surface = document.createElement('canvas'); surface.width = 600; surface.height = 60;
                const p = surface.getContext('2d'); p.scale(2, 2);
                const g = p.createLinearGradient(0, 0, 300, 30); g.addColorStop(0, '#29414c'); g.addColorStop(.5, '#0a1823'); g.addColorStop(1, '#16313a');
                p.beginPath(); [[7, .5], [299.5, .5], [299.5, 23], [293, 29.5], [.5, 29.5], [.5, 7]].forEach(([x, y], i) => i ? p.lineTo(x, y) : p.moveTo(x, y));
                p.closePath(); p.fillStyle = g; p.fill(); p.strokeStyle = '#628c8b'; p.stroke(); p.save(); p.clip();
                for (let x = 0; x < 320; x += 8) { p.beginPath(); p.moveTo(x, 0); p.lineTo(x - 30, 30); p.strokeStyle = '#a6d5d00a'; p.stroke(); }
                p.fillStyle = '#8fbcad0c'; for (let y = 4; y < 30; y += 4) p.fillRect(0, y, 300, .5);
                p.fillStyle = '#ecd598'; p.fillRect(8, 1, 37, 1); p.fillStyle = '#79f4dc'; p.fillRect(258, 28, 34, 1); p.restore(); this._hudSkin = surface;
            }
            ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(scale, scale);
            ctx.drawImage(this._hudSkin, 16, 2, 300, 30);
            ctx.font = '12px Oxanium-Medium, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ecd598';
            ctx.fillText('ENDLESS  /  ' + this.run.score.toLocaleString() + ' PTS', 28, 17);
            ctx.fillStyle = '#79f4dc'; ctx.textAlign = 'right'; ctx.fillText('ROUND ' + (this.run.index + 1), 303, 17); ctx.restore();
        },
    };
    IP2Live.EndlessMode = mode;
})();
