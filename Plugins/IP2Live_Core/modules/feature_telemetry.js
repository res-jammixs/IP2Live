/** Optional learning activities share the durable journal, never campaign attempts. */
(function () {
    const PROFILE_KEY = 'ip2live.learning.profile.v1';
    const tracker = {
        VERSION: 'feature-telemetry-v1',
        rememberProfile(game) {
            if (!game) return;
            const name = String(game.infiltratorName || game._ip2liveProfileName || '').trim();
            if (!name || name.toUpperCase() === 'UNKNOWN') return;
            this._profile = { infiltratorName: name, profileId: game._ip2liveProfileId || game.profileId || null };
            try { localStorage.setItem(PROFILE_KEY, JSON.stringify(this._profile)); } catch (_) {}
        },
        profile() {
            const game = typeof Core !== 'undefined' && Core.Game && Core.Game.current;
            if (game) this.rememberProfile(game);
            if (!this._profile) {
                try { this._profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch (_) {}
            }
            return this._profile && this._profile.infiltratorName ? Object.assign({}, this._profile) : null;
        },
        _id(kind) {
            const gm = IP2Live.GameManager;
            return gm && gm._newEventId ? gm._newEventId(kind) : kind + '-' + Date.now() + '-' + Math.random().toString(36).slice(2);
        },
        _write(session, type, data) {
            if (!session || !session.identity) return;
            const row = Object.assign({ telemetryVersion: this.VERSION, eventId: this._id('feature-event'),
                eventType: type, timestamp: Date.now(), sessionId: session.id,
            }, session.identity, data || {});
            row.payload = Object.assign({}, row.payload, { featureMode: session.mode, featureSessionId: session.id, activityKind: session.kind });
            try {
                const save = () => IP2Live.ReportManager ? IP2Live.ReportManager.logTelemetryRecord(row) : false;
                const write = !IP2Live.ReportManager && IP2Live.ReportManagerReady
                    ? Promise.resolve(IP2Live.ReportManagerReady).then(save) : save();
                if (IP2Live.GameManager && IP2Live.GameManager._trackTelemetryWrite) IP2Live.GameManager._trackTelemetryWrite(write);
                else Promise.resolve(write).catch(error => console.warn('[IP2Live] Activity telemetry failed:', error));
            } catch (error) { console.warn('[IP2Live] Activity telemetry failed:', error); }
        },
        startSession(mode, kind, identity) {
            if (!['practice', 'endless', 'pvp_ai', 'pvp_lan'].includes(mode)) return null;
            const session = { id: this._id('feature-session'), identity: identity ? Object.assign({}, identity) : this.profile(), mode,
                kind: kind === 'tutorial' ? 'tutorial' : 'gameplay', startedAt: Date.now(), ended: false };
            this._write(session, 'feature_session_start', { startedAt: session.startedAt });
            return session;
        },
        startRound(session, gameplayId, options) {
            if (!session || session.ended) return null;
            const spec = options.spec || {}, gm = IP2Live.GameManager;
            const round = { id: options.questId || this._id('feature-round'), startedAt: Date.now(), gameplayId,
                mapId: options.mapId || spec.mapId || 0, tutorial: session.kind === 'tutorial',
                spec: gm._clonePlain(spec), ended: false,
                gameplayDefinition: gm.getGameplayDefinition ? gm.getGameplayDefinition(gameplayId) : null };
            this._write(session, 'feature_round_start', { attemptId: round.id, gameplayId, mapId: round.mapId,
                gameplayDefinition: round.gameplayDefinition, definitionVersion: round.gameplayDefinition && round.gameplayDefinition.definitionVersion,
                gameplayLabel: round.gameplayDefinition && round.gameplayDefinition.label,
                gameplayVersion: round.gameplayDefinition && round.gameplayDefinition.gameplayVersion,
                tutorial: round.tutorial, startedAt: round.startedAt, payload: { spec: round.spec } });
            return round;
        },
        endRound(session, round, outcome, result) {
            if (!session || !round || round.ended) return false;
            round.ended = true;
            const gm = IP2Live.GameManager, end = Date.now();
            const normalizedOutcome = outcome === 'completed' ? (round.tutorial ? 'completed' : 'passed') : outcome === 'failed' ? 'failed'
                : outcome === 'unavailable' ? 'unavailable' : 'cancelled';
            const passed = normalizedOutcome === 'passed';
            const metrics = gm._extractGameplayMetrics(round.gameplayId, result || {}, passed);
            this._write(session, 'feature_round_end', {
                attemptId: round.id, gameplayId: round.gameplayId, mapId: round.mapId, tutorial: round.tutorial,
                startedAt: round.startedAt, endedAt: end, durationMs: Math.max(0, end - round.startedAt),
                outcome: normalizedOutcome, passed: ['passed', 'failed'].includes(normalizedOutcome) ? passed : null,
                accuracy: metrics.accuracy, accuracyKnown: metrics.accuracy !== null,
                correctDecisions: metrics.correctDecisions, totalDecisions: metrics.totalDecisions,
                activeDurationMs: metrics.activeDurationMs, durationMethod: metrics.durationMethod,
                gameplayDefinition: round.gameplayDefinition, definitionVersion: round.gameplayDefinition && round.gameplayDefinition.definitionVersion,
                gameplayLabel: round.gameplayDefinition && round.gameplayDefinition.label,
                competencyKey: round.gameplayDefinition && round.gameplayDefinition.competencyKey,
                competencyLabel: round.gameplayDefinition && round.gameplayDefinition.competencyLabel,
                gameplayVersion: result && result.gameplayVersion || metrics.payload.gameplayVersion || round.gameplayDefinition && round.gameplayDefinition.gameplayVersion || null,
                payload: Object.assign({}, metrics.payload, { spec: round.spec, result: gm._clonePlain(result || {}) }),
            });
            return true;
        },
        endSession(session, reason = 'exited', summary = {}) {
            if (!session || session.ended) return;
            session.ended = true;
            this._write(session, 'feature_session_end', { startedAt: session.startedAt, endedAt: Date.now(), payload: Object.assign({}, summary, { reason }) });
        },
    };
    IP2Live.FeatureTelemetry = tracker;
})();
