/**
 * IP2Live - Report Manager
 *
 * Unified telemetry logger + report aggregation + PDF/Excel export.
 * Offline-only. No external dependencies.
 */

const IP2LiveReportManager = {
    VERSION: 'report-manager-20260821-05',
    _failedTelemetry: [],

    async boot() {
        return true;
    },

    async logTelemetryRecord(record) {
        if (!record) return false;
        let fileSaved = false;
        let databaseSaved = false;
        const desktopStorage = IP2Live.DesktopStorage;
        if (desktopStorage && desktopStorage.enabled && typeof desktopStorage.appendTelemetry === 'function') {
            try {
                const result = await desktopStorage.appendTelemetry(record);
                fileSaved = !!result;
            } catch (e) {
                this._failedTelemetry.push(this._clonePlain(record));
                console.warn('[IP2Live] Durable telemetry journal write failed:', e);
            }
        }
        try {
            if (IP2Live.DBManager && typeof IP2Live.DBManager.saveRecord === 'function') {
                await IP2Live.DBManager.saveRecord('telemetry', record);
                databaseSaved = true;
                if (record.eventType === 'session_start') {
                    const existingRows = typeof IP2Live.DBManager.getRecordsByIndex === 'function'
                        ? await IP2Live.DBManager.getRecordsByIndex('sessions', 'sessionId', record.sessionId)
                        : [];
                    const session = existingRows && existingRows.length ? existingRows[0] : {};
                    await IP2Live.DBManager.saveRecord('sessions', Object.assign({}, session, {
                        sessionId: record.sessionId,
                        profileId: record.profileId || null,
                        infiltratorName: record.infiltratorName,
                        startedAt: record.timestamp,
                        updatedAt: Date.now(),
                    }));
                }
            }
        } catch (e) {
            console.warn('[IP2Live] ReportManager telemetry save failed:', e);
        }
        return fileSaved || databaseSaved;
    },

    async flush() {
        if (IP2Live.GameManager && typeof IP2Live.GameManager.flushTelemetryWrites === 'function') {
            await IP2Live.GameManager.flushTelemetryWrites();
        }
        const desktopStorage = IP2Live.DesktopStorage;
        if (desktopStorage && typeof desktopStorage.flushPendingWrites === 'function') {
            await desktopStorage.flushPendingWrites();
        }
        if (desktopStorage && desktopStorage.enabled && this._failedTelemetry.length) {
            const retry = this._failedTelemetry.splice(0);
            const failedAgain = [];
            for (let i = 0; i < retry.length; i++) {
                try {
                    await desktopStorage.appendTelemetry(retry[i]);
                } catch (error) {
                    failedAgain.push(retry[i]);
                }
            }
            this._failedTelemetry = failedAgain;
            if (failedAgain.length) throw new Error('Some gameplay events could not be committed to local system files.');
        }
        return true;
    },

    async export(options) {
        const opts = options || {};
        const profileName = String(opts.infiltratorName || 'UNKNOWN').trim() || 'UNKNOWN';
        if (profileName.toUpperCase() === 'UNKNOWN') return { ok: false, reason: 'profile-required' };
        const profileId = String(opts.profileId || '').trim() || null;
        const scopeDays = Math.max(1, Number(opts.scopeDays || 90) || 90);
        const format = String(opts.format || 'both').toLowerCase();
        const baseName = this._safeFileBase(String(opts.filenameBase || '').trim() || this._defaultFileBase(profileName));
        const catalog = Array.isArray(opts.gameplayCatalog) ? opts.gameplayCatalog : [];

        await this.flush();
        const now = Date.now();
        const since = now - scopeDays * 24 * 60 * 60 * 1000;
        const telemetry = await this._queryTelemetry(profileName, since, profileId);
        const dto = this._buildReportDTO({
            infiltratorName: profileName,
            scopeDays: scopeDays,
            generatedAt: now,
            telemetry: telemetry,
            gameplayCatalog: catalog,
        });

        const exported = [];
        const archivedPaths = [];
        if (format === 'pdf' || format === 'both') {
            const pdfBlob = await this._buildPdfBlob(dto);
            const archivedPdf = await this._archiveReportBlob(pdfBlob, baseName + '.pdf');
            if (archivedPdf && archivedPdf.path) archivedPaths.push(archivedPdf.path);
            this._downloadBlob(pdfBlob, baseName + '.pdf');
            exported.push('pdf');
        }
        if (format === 'excel' || format === 'both' || format === 'xlsx') {
            const xlsBlob = this._buildExcelXmlBlob(dto);
            const archivedXls = await this._archiveReportBlob(xlsBlob, baseName + '.xls');
            if (archivedXls && archivedXls.path) archivedPaths.push(archivedXls.path);
            this._downloadBlob(xlsBlob, baseName + '.xls');
            exported.push('excel');
        }
        if (!exported.length) {
            const fallback = this._buildExcelXmlBlob(dto);
            const archivedFallback = await this._archiveReportBlob(fallback, baseName + '.xls');
            if (archivedFallback && archivedFallback.path) archivedPaths.push(archivedFallback.path);
            this._downloadBlob(fallback, baseName + '.xls');
            exported.push('excel');
        }
        const evidenceBlob = new Blob([JSON.stringify(dto, null, 2)], { type: 'application/json' });
        const archivedEvidence = await this._archiveReportBlob(evidenceBlob, baseName + '.json');
        if (archivedEvidence && archivedEvidence.path) archivedPaths.push(archivedEvidence.path);
        return {
            ok: true,
            exported: exported,
            archivedPaths: archivedPaths,
            report: dto,
        };
    },

    async _queryTelemetry(infiltratorName, sinceTs, profileId) {
        let rows = [];
        let durableRows = [];
        let databaseError = null;
        try {
            if (IP2Live.DBManager && typeof IP2Live.DBManager.getRecordsByIndex === 'function') {
                rows = await IP2Live.DBManager.getRecordsByIndex('telemetry', 'infiltratorName', infiltratorName);
            } else if (IP2Live.DBManager && typeof IP2Live.DBManager.getRecordsByFilter === 'function') {
                rows = await IP2Live.DBManager.getRecordsByFilter('telemetry', function (r) {
                    return r && r.infiltratorName === infiltratorName;
                });
            } else if (IP2Live.DBManager && typeof IP2Live.DBManager.getAllRecords === 'function') {
                rows = await IP2Live.DBManager.getAllRecords('telemetry');
                rows = rows.filter(function (r) { return r && r.infiltratorName === infiltratorName; });
            }
        } catch (e) {
            console.warn('[IP2Live] ReportManager telemetry query failed:', e);
            databaseError = e;
            rows = [];
        }
        const minTs = Number(sinceTs || 0) || 0;
        const desktopStorage = IP2Live.DesktopStorage;
        if (desktopStorage && desktopStorage.enabled && typeof desktopStorage.readTelemetryRecordsSince === 'function') {
            try {
                const fileRows = await desktopStorage.readTelemetryRecordsSince(minTs, infiltratorName);
                durableRows = Array.isArray(fileRows) ? fileRows : [];
                // Keep the journal rows first and explicitly mark them preferred.
                // The IndexedDB copy is a query mirror; only the filesystem copy
                // carries the host-verified journal integrity envelope.
                rows = durableRows.concat(rows);
            } catch (error) {
                if (databaseError || !rows.length) throw error;
                console.warn('[IP2Live] Local telemetry journal query failed; using IndexedDB mirror:', error);
            }
        } else if (databaseError) {
            throw databaseError;
        }
        const expectedProfileId = String(profileId || '').trim();
        rows = rows.filter(function (r) {
            const t = Number(r && r.timestamp) || 0;
            if (t < minTs || !r || r.infiltratorName !== infiltratorName) return false;
            if (expectedProfileId && r.profileId && String(r.profileId) !== expectedProfileId) return false;
            return true;
        });
        rows = this._deduplicateTelemetry(rows, new Set(durableRows));
        rows.sort(function (a, b) { return (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0); });
        return rows;
    },

    _clonePlain(value) {
        if (value === undefined) return undefined;
        try { return JSON.parse(JSON.stringify(value)); } catch (error) { return null; }
    },

    _safeFileBase(value) {
        let name = String(value || '').trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
        name = name.replace(/^\.+/, '').replace(/[. ]+$/, '').slice(0, 100);
        return name || 'IP2Live_Report';
    },

    _deduplicateTelemetry(rows, preferredRows) {
        const out = [];
        const positions = new Map();
        const preferred = preferredRows instanceof Set ? preferredRows : null;
        const list = Array.isArray(rows) ? rows : [];
        for (let i = 0; i < list.length; i++) {
            const row = list[i];
            if (!row) continue;
            const key = row.eventId
                ? 'event:' + String(row.eventId)
                : 'legacy:' + [
                    row.sessionId || '', row.attemptId || '', row.eventType || '',
                    Number(row.timestamp) || 0, Number(row.sequence) || 0,
                    row.gameplayId || '', row.questId || '',
                ].join('|');
            if (positions.has(key)) {
                const position = positions.get(key);
                if (preferred && preferred.has(row) && !preferred.has(out[position])) {
                    out[position] = row;
                }
                continue;
            }
            positions.set(key, out.length);
            out.push(row);
        }
        return out;
    },

    async _archiveReportBlob(blob, filename) {
        const desktopStorage = IP2Live.DesktopStorage;
        if (!desktopStorage || !desktopStorage.enabled || typeof desktopStorage.saveReportBlob !== 'function') return null;
        const result = await desktopStorage.saveReportBlob(blob, filename);
        if (!result || result.ok === false) throw new Error('The report could not be archived to local system files.');
        return result;
    },

    _buildReportDTO(input) {
        const telemetry = Array.isArray(input.telemetry) ? input.telemetry : [];
        const catalog = Array.isArray(input.gameplayCatalog) ? input.gameplayCatalog : [];
        const catalogByGameplay = this._catalogByGameplayId(catalog);
        const attempts = this._enrichAttemptRows(this._attemptRows(telemetry), catalogByGameplay);
        const assessedAttempts = attempts.filter(function (a) { return !a.cancelled; });
        const attemptMistakes = this._mistakeAttemptRows(telemetry, catalogByGameplay);
        const stepAnalysis = this._stepAnalysisRows(attemptMistakes, assessedAttempts);
        const sessionsCount = this._uniqueCount(telemetry.map(function (row) { return row && row.sessionId || null; }).filter(Boolean));
        const activityTimestamps = telemetry
            .map(function (row) { return Number(row && row.timestamp) || 0; })
            .filter(function (value) { return value > 0; })
            .sort(function (a, b) { return a - b; });
        const totalActiveMs = attempts.reduce(function (sum, a) { return sum + Math.max(0, Number(a.durationMs || 0) || 0); }, 0);
        const passedCount = assessedAttempts.filter(function (a) { return !!a.passed; }).length;
        const failedCount = assessedAttempts.filter(function (a) { return a.passed === false; }).length;
        const cancelledCount = attempts.filter(function (a) { return !!a.cancelled; }).length;
        const repetitionCount = attempts.filter(function (a) { return Number(a.questRepetitionNumber || 1) > 1; }).length;
        const totalRounds = attempts.reduce(function (sum, a) { return sum + Math.max(1, Number(a.roundsUsed || a.attemptsUsed || 1) || 1); }, 0);
        const attemptsCount = attempts.length;
        const assessedCount = assessedAttempts.length;
        const completionRate = assessedCount > 0 ? passedCount / assessedCount : 0;

        let accuracyWeight = 0;
        let accuracyWeightedSum = 0;
        for (let i = 0; i < assessedAttempts.length; i++) {
            const a = assessedAttempts[i];
            const w = Math.max(1, Number(a.attemptsUsed || 0) || 1);
            const acc = this._clamp01(Number(a.accuracy || 0) || 0);
            accuracyWeightedSum += acc * w;
            accuracyWeight += w;
        }
        const overallAccuracy = accuracyWeight > 0 ? accuracyWeightedSum / accuracyWeight : 0;
        const clearTimes = assessedAttempts
            .filter(function (a) { return !!a.passed; })
            .map(function (a) { return Number(a.durationMs || 0) || 0; })
            .filter(function (n) { return n > 0; });
        const avgClearMs = this._avg(clearTimes);
        const medianClearMs = this._median(clearTimes);
        const bestClearMs = clearTimes.length ? Math.min.apply(null, clearTimes) : 0;
        const consistencyStdMs = this._stddev(clearTimes);

        const perGameplay = this._perGameplayMetrics(attempts, catalogByGameplay);
        const daily = this._dailyRollups(attempts, catalogByGameplay);
        const stageLevels = this._stageLevelMetrics(attempts, catalogByGameplay);
        const questRepetitions = this._questRepetitionRows(attempts, catalogByGameplay);
        const mastery = this._computeMastery({
            attempts: assessedAttempts,
            overallAccuracy: overallAccuracy,
            completionRate: completionRate,
            perGameplay: perGameplay,
            daily: daily,
            catalogByGameplay: catalogByGameplay,
        });
        const competencies = this._competencyMetrics(assessedAttempts, catalogByGameplay);
        const attemptSummary = this._attemptSummary(attempts, catalogByGameplay);
        const stats = this._derivePerformanceStats({
            attempts: assessedAttempts,
            catalogByGameplay: catalogByGameplay,
            perGameplay: perGameplay,
            attemptSummary: attemptSummary,
            daily: daily,
            mastery: mastery,
            stepAnalysis: stepAnalysis,
        });
        const performanceSummary = this._generatePerformanceSummary(stats);

        return {
            version: 'report-dto-20260821-03',
            summary: {
                infiltratorName: input.infiltratorName,
                generatedAt: Number(input.generatedAt) || Date.now(),
                scopeDays: Number(input.scopeDays) || 90,
                sessionsCount: sessionsCount,
                totalActivePlayMs: totalActiveMs,
                activeDays: daily.length,
                firstActivityAt: activityTimestamps.length ? activityTimestamps[0] : 0,
                lastActivityAt: activityTimestamps.length ? activityTimestamps[activityTimestamps.length - 1] : 0,
            },
            kpi: {
                attempts: attemptsCount,
                gameplayInstances: attemptsCount,
                assessedAttempts: assessedCount,
                completedAttempts: passedCount,
                failedAttempts: failedCount,
                cancelledAttempts: cancelledCount,
                repetitions: repetitionCount,
                totalRounds: totalRounds,
                completionRate: completionRate,
                accuracy: overallAccuracy,
                avgClearMs: avgClearMs,
                medianClearMs: medianClearMs,
                bestClearMs: bestClearMs,
                consistencyStdMs: consistencyStdMs,
                weightedMastery: mastery.weightedMastery,
                speedScore: mastery.speedScore,
                improvementScore: mastery.improvementScore,
            },
            perGameplay: perGameplay,
            competencies: competencies,
            daily: daily,
            stageLevels: stageLevels,
            questRepetitions: questRepetitions,
            attemptSummary: attemptSummary,
            stepAnalysis: stepAnalysis,
            stats: stats,
            performanceSummary: performanceSummary,
            attemptsRaw: attempts,
            attemptMistakes: attemptMistakes,
            eventAudit: {
                eventCount: telemetry.length,
                interruptedAttemptCount: attempts.filter(function (row) { return row.outcome === 'interrupted'; }).length,
                records: this._clonePlain(telemetry),
            },
        };
    },

    _derivePerformanceStats(input) {
        const attempts = Array.isArray(input.attempts) ? input.attempts.slice() : [];
        const catalogByGameplay = input.catalogByGameplay || {};
        const mastery = input.mastery || {};
        const stepAnalysis = Array.isArray(input.stepAnalysis) ? input.stepAnalysis.slice() : [];

        attempts.sort(function (a, b) { return (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0); });

        const sessionsById = {};
        const gameplayById = {};
        const stageById = {};
        const moduleByKey = {};
        const pairByKey = {};

        for (let i = 0; i < attempts.length; i++) {
            const a = attempts[i];
            const sessionId = a.sessionId || 'sessionless';
            const gameplayId = a.gameplayId || 'unknown_gameplay';
            const stageId = Number(a.stageId || 0) || 0;
            const gameplayCatalog = catalogByGameplay[gameplayId] || {};
            const moduleKey = this._moduleFamilyKey(gameplayId);
            const moduleLabel = this._moduleLabel(gameplayId, gameplayCatalog);
            const isTutorial = !!a.tutorial || this._isTutorialGameplay(gameplayId);
            const pairKey = stageId + '|' + gameplayId;

            if (!sessionsById[sessionId]) {
                sessionsById[sessionId] = {
                    sessionId: sessionId,
                    startTs: Number(a.timestamp) || 0,
                    endTs: Number(a.timestamp) || 0,
                    attempts: 0,
                    passed: 0,
                    failed: 0,
                    totalDurationMs: 0,
                    accuracyValues: [],
                    stageIds: {},
                    gameplayIds: {},
                };
            }
            const session = sessionsById[sessionId];
            session.startTs = Math.min(session.startTs, Number(a.timestamp) || 0);
            session.endTs = Math.max(session.endTs, Number(a.timestamp) || 0);
            session.attempts++;
            if (a.passed) session.passed++;
            else session.failed++;
            session.totalDurationMs += Math.max(0, Number(a.durationMs || 0) || 0);
            session.accuracyValues.push(Number(a.accuracy || 0) || 0);
            session.stageIds[stageId] = true;
            session.gameplayIds[gameplayId] = true;

            if (!gameplayById[gameplayId]) {
                gameplayById[gameplayId] = {
                    gameplayId: gameplayId,
                    gameplayLabel: moduleLabel,
                    moduleKey: moduleKey,
                    isTutorial: isTutorial,
                    attempts: 0,
                    passed: 0,
                    failed: 0,
                    totalDurationMs: 0,
                    accuracyValues: [],
                    sessionIds: {},
                    stageIds: {},
                };
            }
            const gameplay = gameplayById[gameplayId];
            gameplay.attempts++;
            if (a.passed) gameplay.passed++;
            else gameplay.failed++;
            gameplay.totalDurationMs += Math.max(0, Number(a.durationMs || 0) || 0);
            gameplay.accuracyValues.push(Number(a.accuracy || 0) || 0);
            gameplay.sessionIds[sessionId] = true;
            gameplay.stageIds[stageId] = true;

            if (!stageById[stageId]) {
                stageById[stageId] = {
                    stageId: stageId,
                    attempts: 0,
                    passed: 0,
                    failed: 0,
                    totalDurationMs: 0,
                    accuracyValues: [],
                    gameplayIds: {},
                };
            }
            const stage = stageById[stageId];
            stage.attempts++;
            if (a.passed) stage.passed++;
            else stage.failed++;
            stage.totalDurationMs += Math.max(0, Number(a.durationMs || 0) || 0);
            stage.accuracyValues.push(Number(a.accuracy || 0) || 0);
            stage.gameplayIds[gameplayId] = true;

            if (!moduleByKey[moduleKey]) {
                moduleByKey[moduleKey] = {
                    moduleKey: moduleKey,
                    moduleLabel: moduleLabel,
                    tutorialAttempts: 0,
                    tutorialPassed: 0,
                    tutorialFailed: 0,
                    tutorialDurationMs: 0,
                    tutorialAccuracyValues: [],
                    gameplayAttempts: 0,
                    gameplayPassed: 0,
                    gameplayFailed: 0,
                    gameplayDurationMs: 0,
                    gameplayAccuracyValues: [],
                    sessionIds: {},
                    stageIds: {},
                };
            }
            const moduleRow = moduleByKey[moduleKey];
            moduleRow.stageIds[stageId] = true;
            moduleRow.sessionIds[sessionId] = true;
            if (isTutorial) {
                moduleRow.tutorialAttempts++;
                if (a.passed) moduleRow.tutorialPassed++;
                else moduleRow.tutorialFailed++;
                moduleRow.tutorialDurationMs += Math.max(0, Number(a.durationMs || 0) || 0);
                moduleRow.tutorialAccuracyValues.push(Number(a.accuracy || 0) || 0);
            } else {
                moduleRow.gameplayAttempts++;
                if (a.passed) moduleRow.gameplayPassed++;
                else moduleRow.gameplayFailed++;
                moduleRow.gameplayDurationMs += Math.max(0, Number(a.durationMs || 0) || 0);
                moduleRow.gameplayAccuracyValues.push(Number(a.accuracy || 0) || 0);
            }

            if (!pairByKey[pairKey]) {
                pairByKey[pairKey] = {
                    stageId: stageId,
                    gameplayId: gameplayId,
                    gameplayLabel: moduleLabel,
                    attempts: 0,
                    passed: 0,
                    failed: 0,
                    accuracyValues: [],
                    longestFailureStreak: 0,
                    currentFailureStreak: 0,
                    lastAttemptTs: 0,
                };
            }
            const pair = pairByKey[pairKey];
            pair.attempts++;
            pair.accuracyValues.push(Number(a.accuracy || 0) || 0);
            if (a.passed) {
                pair.passed++;
                pair.currentFailureStreak = 0;
            } else {
                pair.failed++;
                pair.currentFailureStreak++;
                pair.longestFailureStreak = Math.max(pair.longestFailureStreak, pair.currentFailureStreak);
            }
            pair.lastAttemptTs = Math.max(pair.lastAttemptTs, Number(a.timestamp || 0) || 0);
        }

        const sessionRows = Object.keys(sessionsById).map(function (sessionId) {
            const row = sessionsById[sessionId];
            const accuracy = IP2LiveReportManager._avg(row.accuracyValues);
            const completion = row.attempts > 0 ? row.passed / row.attempts : 0;
            return {
                sessionId: row.sessionId,
                startTs: row.startTs,
                endTs: row.endTs,
                attempts: row.attempts,
                passed: row.passed,
                failed: row.failed,
                accuracyRate: accuracy,
                completionRate: completion,
                timeOnTaskMs: row.attempts > 0 ? row.totalDurationMs / row.attempts : 0,
                activeWindowMs: Math.max(0, row.endTs - row.startTs),
                stageCount: Object.keys(row.stageIds).length,
                gameplayCount: Object.keys(row.gameplayIds).length,
            };
        }).sort(function (a, b) { return a.startTs - b.startTs; });

        const gameplayRows = Object.keys(gameplayById).map(function (gameplayId) {
            const row = gameplayById[gameplayId];
            const accuracy = IP2LiveReportManager._avg(row.accuracyValues);
            const completion = row.attempts > 0 ? row.passed / row.attempts : 0;
            return {
                gameplayId: row.gameplayId,
                gameplayLabel: row.gameplayLabel,
                moduleKey: row.moduleKey,
                moduleLabel: this._moduleDisplayName(row.moduleKey),
                isTutorial: row.isTutorial,
                attempts: row.attempts,
                correctAttempts: row.passed,
                incorrectAttempts: row.failed,
                accuracyRate: accuracy,
                completionRate: completion,
                avgTimeOnTaskMs: row.attempts > 0 ? row.totalDurationMs / row.attempts : 0,
                sessionCount: Object.keys(row.sessionIds).length,
                stageCount: Object.keys(row.stageIds).length,
            };
        }, this).sort(function (a, b) {
            if (a.moduleLabel !== b.moduleLabel) return String(a.moduleLabel || '').localeCompare(String(b.moduleLabel || ''));
            return String(a.gameplayLabel || '').localeCompare(String(b.gameplayLabel || ''));
        });

        const stageRows = Object.keys(stageById).map(function (stageId) {
            const row = stageById[stageId];
            const accuracy = IP2LiveReportManager._avg(row.accuracyValues);
            const completion = row.attempts > 0 ? row.passed / row.attempts : 0;
            return {
                stageId: row.stageId,
                attempts: row.attempts,
                correctAttempts: row.passed,
                incorrectAttempts: row.failed,
                accuracyRate: accuracy,
                completionRate: completion,
                avgTimeOnTaskMs: row.attempts > 0 ? row.totalDurationMs / row.attempts : 0,
                gameplayCount: Object.keys(row.gameplayIds).length,
            };
        }).sort(function (a, b) { return a.stageId - b.stageId; });

        const moduleRows = Object.keys(moduleByKey).map(function (moduleKey) {
            const row = moduleByKey[moduleKey];
            const tutorialAccuracy = IP2LiveReportManager._avg(row.tutorialAccuracyValues);
            const gameplayAccuracy = IP2LiveReportManager._avg(row.gameplayAccuracyValues);
            const tutorialTime = row.tutorialAttempts > 0 ? row.tutorialDurationMs / row.tutorialAttempts : 0;
            const gameplayTime = row.gameplayAttempts > 0 ? row.gameplayDurationMs / row.gameplayAttempts : 0;
            return {
                moduleKey: row.moduleKey,
                moduleLabel: row.moduleLabel,
                tutorial: {
                    attempts: row.tutorialAttempts,
                    passed: row.tutorialPassed,
                    failed: row.tutorialFailed,
                    accuracyRate: tutorialAccuracy,
                    avgTimeOnTaskMs: tutorialTime,
                },
                gameplay: {
                    attempts: row.gameplayAttempts,
                    passed: row.gameplayPassed,
                    failed: row.gameplayFailed,
                    accuracyRate: gameplayAccuracy,
                    avgTimeOnTaskMs: gameplayTime,
                },
                deltaAccuracyRate: gameplayAccuracy - tutorialAccuracy,
                deltaTimeOnTaskMs: gameplayTime - tutorialTime,
                stageCount: Object.keys(row.stageIds).length,
                sessionCount: Object.keys(row.sessionIds).length,
            };
        }, this).sort(function (a, b) {
            return String(a.moduleLabel || '').localeCompare(String(b.moduleLabel || ''));
        });

        const pairRows = Object.keys(pairByKey).map(function (key) {
            const row = pairByKey[key];
            const accuracy = IP2LiveReportManager._avg(row.accuracyValues);
            const completion = row.attempts > 0 ? row.passed / row.attempts : 0;
            return {
                stageId: row.stageId,
                gameplayId: row.gameplayId,
                gameplayLabel: row.gameplayLabel,
                attempts: row.attempts,
                passed: row.passed,
                failed: row.failed,
                accuracyRate: accuracy,
                completionRate: completion,
                longestFailureStreak: row.longestFailureStreak,
                lastAttemptTs: row.lastAttemptTs,
            };
        }).sort(function (a, b) {
            if (a.stageId !== b.stageId) return a.stageId - b.stageId;
            return String(a.gameplayLabel || '').localeCompare(String(b.gameplayLabel || ''));
        });

        const firstHalfCount = Math.max(1, Math.floor(sessionRows.length / 2));
        const firstHalf = sessionRows.slice(0, firstHalfCount);
        const secondHalf = sessionRows.slice(firstHalfCount);
        const firstAccuracy = this._avg(firstHalf.map(function (row) { return row.accuracyRate; }));
        const secondAccuracy = this._avg(secondHalf.map(function (row) { return row.accuracyRate; }));
        const trendDelta = secondAccuracy - firstAccuracy;
        let trendDirection = 'plateau';
        if (sessionRows.length >= 2) {
            if (trendDelta > 0.05) trendDirection = 'improving';
            else if (trendDelta < -0.05) trendDirection = 'declining';
        }

        const gameplaySorted = gameplayRows.slice().sort(function (a, b) {
            const aScore = (a.accuracyRate * 0.7) + (a.completionRate * 0.3);
            const bScore = (b.accuracyRate * 0.7) + (b.completionRate * 0.3);
            return bScore - aScore;
        });
        const gameplayWorst = gameplayRows.slice().sort(function (a, b) {
            const aScore = (a.accuracyRate * 0.7) + (a.completionRate * 0.3);
            const bScore = (b.accuracyRate * 0.7) + (b.completionRate * 0.3);
            return aScore - bScore;
        });

        const repeatedFailurePatterns = [];
        for (let i = 0; i < pairRows.length; i++) {
            const row = pairRows[i];
            if (row.attempts < 3) continue;
            const failRate = row.failed / row.attempts;
            if (row.longestFailureStreak >= 3 || (failRate >= 0.6 && row.failed >= 2)) {
                repeatedFailurePatterns.push({
                    stageId: row.stageId,
                    gameplayId: row.gameplayId,
                    gameplayLabel: row.gameplayLabel,
                    attempts: row.attempts,
                    failed: row.failed,
                    failRate: failRate,
                    longestFailureStreak: row.longestFailureStreak,
                });
            }
        }
        repeatedFailurePatterns.sort(function (a, b) {
            if (b.longestFailureStreak !== a.longestFailureStreak) return b.longestFailureStreak - a.longestFailureStreak;
            return b.failed - a.failed;
        });

        return {
            overall: {
                attempts: attempts.length,
                sessions: sessionRows.length,
                weightedMastery: Number(mastery.weightedMastery || 0) || 0,
                accuracyRate: this._avg(attempts.map(function (a) { return Number(a.accuracy || 0) || 0; })),
                completionRate: attempts.length > 0 ? attempts.filter(function (a) { return !!a.passed; }).length / attempts.length : 0,
            },
            byGameplay: gameplayRows,
            byStage: stageRows,
            bySession: sessionRows,
            byModule: moduleRows,
            byAttemptPair: pairRows,
            progressionTrend: {
                direction: trendDirection,
                deltaAccuracyRate: trendDelta,
                firstHalfAccuracyRate: firstAccuracy,
                secondHalfAccuracyRate: secondAccuracy,
                sessionCount: sessionRows.length,
                series: sessionRows.map(function (row) { return row.accuracyRate; }),
            },
            errorPatterns: repeatedFailurePatterns,
            stepAnalysis: stepAnalysis,
            strongestSteps: stepAnalysis.slice().sort(function (a, b) {
                if (a.mistakeRate !== b.mistakeRate) return a.mistakeRate - b.mistakeRate;
                return a.totalMistakes - b.totalMistakes;
            }).slice(0, 5),
            weakestSteps: stepAnalysis.slice().sort(function (a, b) {
                if (b.mistakeRate !== a.mistakeRate) return b.mistakeRate - a.mistakeRate;
                return b.totalMistakes - a.totalMistakes;
            }).slice(0, 5),
            strongestGameplay: gameplaySorted.length ? gameplaySorted[0] : null,
            weakestGameplay: gameplayWorst.length ? gameplayWorst[0] : null,
        };
    },

    _generatePerformanceSummary(stats) {
        const overall = stats && stats.overall ? stats.overall : {};
        const strongest = stats && stats.strongestGameplay ? stats.strongestGameplay : null;
        const weakest = stats && stats.weakestGameplay ? stats.weakestGameplay : null;
        const errors = stats && Array.isArray(stats.errorPatterns) ? stats.errorPatterns : [];
        const weakSteps = stats && Array.isArray(stats.weakestSteps) ? stats.weakestSteps : [];
        const trend = stats && stats.progressionTrend ? stats.progressionTrend : { direction: 'plateau', deltaAccuracyRate: 0 };
        const mastery = Math.max(0, Math.min(100, Number(overall.weightedMastery || 0) || 0));

        let level = 'moderate';
        if (mastery >= 75) level = 'strong';
        else if (mastery < 45) level = 'needs improvement';

        const strongestName = strongest ? strongest.gameplayLabel : 'the most consistent module';
        const weakestName = weakest ? weakest.gameplayLabel : 'the lowest-performing module';
        const errorText = errors.length
            ? 'Repeated trouble appears on ' + errors[0].gameplayLabel + ' at stage ' + errors[0].stageId + ', where the failure streak reached ' + errors[0].longestFailureStreak + ' attempts.'
            : 'No major repeated-failure pattern stands out in the current report window.';

        let trendText = 'Performance is holding steady across sessions.';
        if (trend.direction === 'improving') {
            trendText = 'Session-by-session results are improving, with later sessions performing better than earlier ones.';
        } else if (trend.direction === 'declining') {
            trendText = 'Session-by-session results are declining, which suggests the player is losing momentum over time.';
        }

        const recommendationTarget = weakest ? weakest.gameplayLabel : 'the weakest gameplay area';
        const stepText = weakSteps.length
            ? ' The most repeated step-level issue is ' + weakSteps[0].stepLabel + ' in ' + weakSteps[0].gameplayLabel + ', based on ' + weakSteps[0].totalMistakes + ' recorded try-level mistake(s).'
            : ' No repeated step-level mistake pattern is available yet.';
        return 'Overall performance is ' + level + '. ' + strongestName + ' is the strongest area, while ' + weakestName + ' needs the most attention. ' + errorText + ' ' + trendText + stepText + ' Focus on ' + recommendationTarget + ' before advancing to the next stage.';
    },

    _moduleFamilyKey(gameplayId) {
        const id = String(gameplayId || 'unknown_gameplay');
        return id.replace(/_tutorial$/i, '');
    },

    _isTutorialGameplay(gameplayId) {
        return /_tutorial$/i.test(String(gameplayId || ''));
    },

    _moduleDisplayName(moduleKey) {
        const key = String(moduleKey || 'unknown_gameplay');
        const map = {
            ip_class_wires: 'IP Wires',
            ip_class_wires_harder: 'Advanced IP Wires',
            ip_patch_panel_classes: 'IP Patch Panel',
            ip_cidr_binary_panel: 'CIDR Binary Panel',
            ip_cidr_binary_panel_harder: 'Adaptive CIDR Panel',
            ip_subnet_simulator: 'Subnet Simulator',
            ip_network_repair: 'Network Repair PCs',
            ip_vlsm_allocator: 'VLSM Infiltration Grid',
        };
        return map[key] || key;
    },

    _moduleLabel(gameplayId, catalogEntry) {
        if (catalogEntry && catalogEntry.label) return String(catalogEntry.label);
        return this._moduleDisplayName(this._moduleFamilyKey(gameplayId));
    },

    _catalogByGameplayId(catalog) {
        const map = {};
        for (let i = 0; i < catalog.length; i++) {
            const c = catalog[i];
            if (!c || !c.gameplayId) continue;
            map[c.gameplayId] = c;
        }
        return map;
    },

    _attemptRows(telemetry) {
        const out = [];
        const terminalKeys = new Set();
        const attemptKey = function (row) {
            if (row && row.attemptId) return String(row.attemptId);
            return [row && row.sessionId || '', row && row.gameplayId || '', Number(row && row.startedAt) || 0].join('|');
        };
        for (let i = 0; i < telemetry.length; i++) {
            const row = telemetry[i] || {};
            if (row.eventType === 'attempt_end') terminalKeys.add(attemptKey(row));
        }
        for (let i = 0; i < telemetry.length; i++) {
            const row = telemetry[i] || {};
            if (row.eventType !== 'attempt_end') continue;
            const resultPayload = row.payload && row.payload.result ? row.payload.result : {};
            const cancelled = !!(row.cancelled || resultPayload.cancelled || row.outcome === 'cancelled');
            const outcome = cancelled ? 'cancelled' : (row.outcome || (row.passed ? 'passed' : 'failed'));
            out.push({
                timestamp: Number(row.timestamp || 0) || 0,
                startedAt: Number(row.startedAt || 0) || 0,
                endedAt: Number(row.endedAt || row.timestamp || 0) || 0,
                sessionId: row.sessionId || null,
                attemptId: row.attemptId || null,
                gameplayId: row.gameplayId || 'unknown_gameplay',
                gameplayLabel: row.gameplayLabel || row.gameplayId || 'Unknown Gameplay',
                competencyKey: row.competencyKey || null,
                competencyLabel: row.competencyLabel || null,
                stageId: Number(row.stageId || 0) || 0,
                levelId: Number(row.levelId || 0) || 0,
                stageName: row.stageName || null,
                mapId: Number(row.mapId || 0) || 0,
                questId: row.questId || null,
                questLabel: row.questLabel || null,
                questSequence: Number(row.questSequence || 0) || 0,
                objectiveId: row.objectiveId || null,
                tutorial: !!(row.tutorial || /tutorial/i.test(String(row.questId || ''))),
                outcome: outcome,
                cancelled: cancelled,
                failureReason: row.failureReason || resultPayload.reason || null,
                passed: !cancelled && !!row.passed,
                durationMs: Number(row.durationMs || 0) || 0,
                attemptsUsed: Number(row.attemptsUsed || 0) || 0,
                maxAttempts: Number(row.maxAttempts || 0) || 0,
                retries: Number(row.retries || 0) || 0,
                mistakeCount: Number(row.mistakeCount || 0) || 0,
                mistakeRate: Number(row.mistakeRate || 0) || 0,
                accuracy: this._clamp01(Number(row.accuracy || 0) || 0),
                securityStrikeCount: Number(row.securityStrikeCount || 0) || 0,
                securityTriggered: !!row.securityTriggered,
                rollbackQuestId: row.rollbackQuestId || null,
                rollbackObjectiveId: row.rollbackObjectiveId || null,
                darklightsDimmed: !!row.darklightsDimmed,
                recoveryAction: row.recoveryAction || null,
                payload: row.payload || {},
            });
        }
        for (let i = 0; i < telemetry.length; i++) {
            const row = telemetry[i] || {};
            if (row.eventType !== 'attempt_start' || terminalKeys.has(attemptKey(row))) continue;
            out.push({
                timestamp: Number(row.timestamp || row.startedAt || 0) || 0,
                startedAt: Number(row.startedAt || row.timestamp || 0) || 0,
                endedAt: 0,
                sessionId: row.sessionId || null,
                attemptId: row.attemptId || null,
                gameplayId: row.gameplayId || 'unknown_gameplay',
                gameplayLabel: row.gameplayLabel || row.gameplayId || 'Unknown Gameplay',
                competencyKey: row.competencyKey || null,
                competencyLabel: row.competencyLabel || null,
                stageId: Number(row.stageId || 0) || 0,
                levelId: Number(row.levelId || 0) || 0,
                stageName: row.stageName || null,
                mapId: Number(row.mapId || 0) || 0,
                questId: row.questId || null,
                questLabel: row.questLabel || null,
                questSequence: Number(row.questSequence || 0) || 0,
                objectiveId: row.objectiveId || null,
                tutorial: !!(row.tutorial || /tutorial/i.test(String(row.questId || ''))),
                outcome: 'interrupted',
                cancelled: true,
                failureReason: 'attempt_started_without_terminal_event',
                passed: false,
                durationMs: 0,
                attemptsUsed: 0,
                maxAttempts: Number(row.maxAttempts || 0) || 0,
                retries: Number(row.retries || 0) || 0,
                mistakeCount: Number(row.mistakeCount || 0) || 0,
                mistakeRate: Number(row.mistakeRate || 0) || 0,
                accuracy: 0,
                securityStrikeCount: Number(row.securityStrikeCount || 0) || 0,
                securityTriggered: !!row.securityTriggered,
                rollbackQuestId: row.rollbackQuestId || null,
                rollbackObjectiveId: row.rollbackObjectiveId || null,
                darklightsDimmed: !!row.darklightsDimmed,
                recoveryAction: row.recoveryAction || null,
                payload: Object.assign({}, row.payload || {}, { recoveredOrphan: true }),
            });
        }
        return out;
    },

    _enrichAttemptRows(attempts, catalogByGameplay) {
        const rows = Array.isArray(attempts) ? attempts.slice() : [];
        const catalog = catalogByGameplay || {};
        rows.sort(function (a, b) {
            if ((Number(a.timestamp) || 0) !== (Number(b.timestamp) || 0)) return (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0);
            return String(a.attemptId || '').localeCompare(String(b.attemptId || ''));
        });

        const gameplayCounts = {};
        const questCounts = {};
        const dayCounts = {};
        const sessionCounts = {};
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const stage = this._resolveStageMeta(row.mapId, row.stageId, row.levelId, row.stageName);
            const gameplay = catalog[row.gameplayId] || {};
            const timestamp = Number(row.timestamp || row.endedAt || 0) || 0;
            const startedAt = Number(row.startedAt || 0) || Math.max(0, timestamp - (Number(row.durationMs || 0) || 0));
            const day = this._dayKey(timestamp);
            const sessionKey = row.sessionId || 'sessionless';
            const gameplayKey = [stage.stageId, stage.levelId, row.gameplayId || 'unknown_gameplay'].join('|');
            const questKey = [stage.stageId, stage.levelId, row.questId || row.objectiveId || 'unassigned', row.objectiveId || '', row.gameplayId || 'unknown_gameplay'].join('|');

            gameplayCounts[gameplayKey] = (gameplayCounts[gameplayKey] || 0) + 1;
            questCounts[questKey] = (questCounts[questKey] || 0) + 1;
            dayCounts[day] = (dayCounts[day] || 0) + 1;
            sessionCounts[sessionKey] = (sessionCounts[sessionKey] || 0) + 1;

            row.instanceNumber = i + 1;
            row.dayInstanceNumber = dayCounts[day];
            row.sessionInstanceNumber = sessionCounts[sessionKey];
            row.gameplayRepetitionNumber = gameplayCounts[gameplayKey];
            row.questRepetitionNumber = questCounts[questKey];
            row.isRepetition = row.questRepetitionNumber > 1;
            row.startedAt = startedAt;
            row.endedAt = Number(row.endedAt || timestamp) || timestamp;
            row.timestamp = timestamp;
            row.date = day;
            row.time = this._formatLocalTime(timestamp);
            row.dateTime = this._formatLocalDateTime(timestamp);
            row.timestampIso = timestamp ? new Date(timestamp).toISOString() : '';
            row.stageId = stage.stageId;
            row.levelId = stage.levelId;
            row.stageName = stage.name;
            row.stageLevel = stage.stageId > 0
                ? 'Stage ' + stage.stageId + ' Level ' + stage.levelId
                : stage.name;
            row.gameplayLabel = gameplay.label || row.gameplayLabel || row.gameplayId;
            row.questLabel = row.questLabel || row.questId || 'Unassigned quest';
            row.mode = row.tutorial ? 'Guided tutorial' : 'Regular gameplay';
            row.roundsUsed = Math.max(1, Number(row.attemptsUsed || 0) || 1);
            row.retryCount = Math.max(0, Number(row.retries || 0) || 0);
            row.outcome = row.cancelled ? 'cancelled' : (row.passed ? 'passed' : 'failed');
            row.recoveryAction = row.recoveryAction || this._inferRecoveryAction(row);
        }
        return rows;
    },

    _resolveStageMeta(mapId, stageId, levelId, stageName) {
        const resolvedMapId = Number(mapId || 0) || 0;
        let runtime = null;
        if (typeof IP2Live !== 'undefined' && IP2Live.MapManager && typeof IP2Live.MapManager.stageFor === 'function') {
            runtime = IP2Live.MapManager.stageFor(resolvedMapId) || null;
        }
        if (runtime) {
            return {
                stageId: Number(runtime.stage || 0) || 0,
                levelId: Number(runtime.level || 0) || 0,
                name: runtime.name || stageName || 'Tutorial Stage',
            };
        }

        if (resolvedMapId === 1) return { stageId: 0, levelId: 0, name: stageName || 'Tutorial Stage' };
        if (resolvedMapId >= 3 && resolvedMapId <= 18) {
            const derivedStage = Math.floor((resolvedMapId - 3) / 4) + 1;
            const derivedLevel = ((resolvedMapId - 3) % 4) + 1;
            return {
                stageId: derivedStage,
                levelId: derivedLevel,
                name: 'Stage ' + derivedStage + ' Level ' + derivedLevel,
            };
        }
        const safeStage = Number(stageId || 0) || 0;
        const safeLevel = Number(levelId || 0) || 0;
        return {
            stageId: safeStage,
            levelId: safeLevel,
            name: stageName || (safeStage > 0 ? 'Stage ' + safeStage + ' Level ' + safeLevel : 'Unknown stage'),
        };
    },

    _inferRecoveryAction(row) {
        if (!row || row.cancelled || row.passed) return null;
        if (row.securityTriggered) return 'Security alert: returned to Stage 1 Level 1';
        if (Number(row.mapId) === 4 && row.gameplayId === 'ip_class_wires') {
            return row.darklightsDimmed
                ? 'Previous solved IP Wires quest reactivated; lighting dimmed'
                : 'Current IP Wires quest reactivated; lighting unchanged';
        }
        if (Number(row.mapId) === 4 && row.gameplayId === 'ip_patch_panel_classes') {
            return 'Patch Panel tutorial reactivated after two rounds';
        }
        return row.failureReason ? 'Retry required: ' + row.failureReason : 'Retry required';
    },

    _mistakeAttemptRows(telemetry, catalogByGameplay) {
        const out = [];
        const catalog = catalogByGameplay || {};
        for (let i = 0; i < telemetry.length; i++) {
            const row = telemetry[i] || {};
            if (row.eventType !== 'attempt_mistake') continue;
            const gameplayId = row.gameplayId || 'unknown_gameplay';
            const c = catalog[gameplayId] || {};
            const payload = row.payload || {};
            const mistakes = Array.isArray(payload.mistakes) ? payload.mistakes : [];
            const tryNumber = Number(payload.tryNumber || row.mistakeCount || 0) || 0;
            const base = {
                timestamp: Number(row.timestamp || 0) || 0,
                sessionId: row.sessionId || null,
                attemptId: row.attemptId || null,
                gameplayId: gameplayId,
                gameplayLabel: c.label || row.gameplayLabel || gameplayId,
                competencyKey: c.competencyKey || row.competencyKey || null,
                competencyLabel: c.competencyLabel || row.competencyLabel || null,
                stageId: Number(row.stageId || row.mapId || 0) || 0,
                levelId: Number(row.levelId || 0) || 0,
                mapId: Number(row.mapId || 0) || 0,
                questId: row.questId || null,
                objectiveId: row.objectiveId || null,
                tryNumber: tryNumber,
                attemptsRemaining: Number(payload.attemptsRemaining || 0) || 0,
                mistakesThisTry: Number(payload.mistakesThisTry || mistakes.length || 0) || 0,
            };
            if (!mistakes.length) {
                out.push(Object.assign({}, base, this._normalizeMistakeDetail(gameplayId, {}, 0)));
                continue;
            }
            for (let m = 0; m < mistakes.length; m++) {
                out.push(Object.assign({}, base, this._normalizeMistakeDetail(gameplayId, mistakes[m] || {}, m)));
            }
        }
        out.sort(function (a, b) {
            if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
            if (a.tryNumber !== b.tryNumber) return a.tryNumber - b.tryNumber;
            return a.mistakeIndex - b.mistakeIndex;
        });
        return out;
    },

    _normalizeMistakeDetail(gameplayId, mistake, index) {
        const m = mistake || {};
        const stepKey = m.stepKey || m.gameplayStep || this._defaultMistakeStepKey(gameplayId, m);
        const expected = m.expectedText || m.expected || m.correctClass || m.sourceClass || null;
        const submitted = m.submittedText || m.submitted || m.targetClass || m.selectedClass || null;
        const issueType = m.issueType || m.mistakeType || this._defaultMistakeIssueType(gameplayId, m);
        return {
            mistakeIndex: Number(index || 0) || 0,
            stepKey: stepKey,
            stepLabel: m.stepLabel || this._stepDisplayName(stepKey),
            issueType: issueType,
            expected: this._stringifyCell(expected),
            submitted: this._stringifyCell(submitted),
            detail: this._mistakeDetailText(gameplayId, m, expected, submitted, issueType),
        };
    },

    _defaultMistakeStepKey(gameplayId, mistake) {
        const id = String(gameplayId || '');
        const taskType = mistake && mistake.taskType ? String(mistake.taskType) : '';
        if (id === 'ip_network_repair') return taskType || 'network_range_calculation';
        if (id === 'ip_vlsm_allocator') return mistake && mistake.stepKey ? String(mistake.stepKey) : 'vlsm_allocation';
        if (id === 'ip_cidr_binary_panel' || id === 'ip_cidr_binary_panel_harder') return 'cidr_prefix';
        if (id === 'ip_subnet_simulator') return 'subnet_calculation';
        if (id === 'ip_patch_panel_classes') return 'ip_classification_route';
        if (id === 'ip_class_wires' || id === 'ip_class_wires_harder') return 'ip_classification';
        return id || 'unknown_step';
    },

    _defaultMistakeIssueType(gameplayId, mistake) {
        if (mistake && mistake.issueType) return mistake.issueType;
        if (mistake && mistake.mistakeType) return mistake.mistakeType;
        if (gameplayId === 'ip_patch_panel_classes') return 'misroute';
        if (gameplayId === 'ip_class_wires' || gameplayId === 'ip_class_wires_harder') return 'wrong_class_mapping';
        return 'wrong_answer';
    },

    _stepDisplayName(stepKey) {
        const key = String(stepKey || 'unknown_step');
        const map = {
            ip_classification: 'IP class identification',
            ip_classification_route: 'IP class routing',
            subnet_mask_binary: 'Subnet mask binary',
            cidr_prefix: 'CIDR prefix calculation',
            usableSubnets: 'Usable subnets',
            totalSubnets: 'Total subnets',
            totalHosts: 'Total hosts',
            usableHosts: 'Usable hosts',
            networkAddress: 'Network address',
            broadcastAddress: 'Broadcast address',
            gatewayAddress: 'First usable address',
            firstUsable: 'First usable address',
            usableRange: 'Usable range',
            reserveAddress: 'Last usable address',
            lastUsable: 'Last usable address',
            network_range_calculation: 'Network range calculation',
            vlsm_host_to_prefix: 'VLSM host-to-prefix sizing',
            vlsm_block_alignment: 'VLSM block alignment',
            vlsm_overlap_check: 'VLSM overlap analysis',
            vlsm_parent_containment: 'VLSM parent block containment',
            vlsm_final_validation: 'VLSM final route validation',
            vlsm_allocation: 'VLSM subnet allocation',
            subnet_calculation: 'Subnet calculation',
            mask_to_binary: 'Mask to binary',
            binary_to_cidr: 'Binary to CIDR',
        };
        return map[key] || key.replace(/_/g, ' ');
    },

    _mistakeDetailText(gameplayId, mistake, expected, submitted, issueType) {
        const m = mistake || {};
        if (m.detail) return String(m.detail);
        if (m.packetIp) return 'Packet ' + m.packetIp + ' routed as ' + this._stringifyCell(submitted) + '; expected ' + this._stringifyCell(expected) + '.';
        if (m.sourceClass || m.targetClass) return 'Mapped class ' + this._stringifyCell(m.sourceClass) + ' to ' + this._stringifyCell(m.targetClass) + '.';
        if (m.expectedText || m.submittedText) return 'Submitted ' + this._stringifyCell(submitted) + '; expected ' + this._stringifyCell(expected) + '.';
        return String(issueType || 'mistake') + ': submitted ' + this._stringifyCell(submitted) + '; expected ' + this._stringifyCell(expected) + '.';
    },

    _stepAnalysisRows(attemptMistakes, attempts) {
        const byGameplayAttempts = {};
        for (let i = 0; i < attempts.length; i++) {
            const id = attempts[i].gameplayId || 'unknown_gameplay';
            byGameplayAttempts[id] = (byGameplayAttempts[id] || 0) + 1;
        }

        const groups = {};
        for (let i = 0; i < attemptMistakes.length; i++) {
            const m = attemptMistakes[i];
            const key = [m.gameplayId, m.stepKey].join('|');
            if (!groups[key]) {
                groups[key] = {
                    gameplayId: m.gameplayId,
                    gameplayLabel: m.gameplayLabel,
                    competencyKey: m.competencyKey,
                    competencyLabel: m.competencyLabel,
                    stepKey: m.stepKey,
                    stepLabel: m.stepLabel,
                    totalMistakes: 0,
                    affectedAttempts: {},
                    tries: {},
                    issueCounts: {},
                    examples: [],
                };
            }
            const g = groups[key];
            g.totalMistakes++;
            if (m.attemptId) g.affectedAttempts[m.attemptId] = true;
            g.tries[(m.attemptId || 'attempt') + ':' + (m.tryNumber || 0)] = true;
            g.issueCounts[m.issueType || 'wrong_answer'] = (g.issueCounts[m.issueType || 'wrong_answer'] || 0) + 1;
            if (g.examples.length < 3) g.examples.push(m.detail);
        }

        const out = Object.keys(groups).map(function (key) {
            const g = groups[key];
            const attemptsForGameplay = Number(byGameplayAttempts[g.gameplayId] || 0) || 0;
            const affectedAttemptCount = Object.keys(g.affectedAttempts).length;
            const mistakeRate = attemptsForGameplay > 0 ? affectedAttemptCount / attemptsForGameplay : 0;
            const topIssues = Object.keys(g.issueCounts).sort(function (a, b) {
                return g.issueCounts[b] - g.issueCounts[a];
            });
            let status = 'Low';
            if (g.totalMistakes >= 5 || mistakeRate >= 0.6) status = 'High';
            else if (g.totalMistakes >= 2 || mistakeRate >= 0.3) status = 'Moderate';
            return {
                gameplayId: g.gameplayId,
                gameplayLabel: g.gameplayLabel,
                competencyKey: g.competencyKey,
                competencyLabel: g.competencyLabel,
                stepKey: g.stepKey,
                stepLabel: g.stepLabel,
                totalMistakes: g.totalMistakes,
                affectedAttempts: affectedAttemptCount,
                tryEvents: Object.keys(g.tries).length,
                gameplayAttempts: attemptsForGameplay,
                mistakeRate: mistakeRate,
                topIssue: topIssues.length ? topIssues[0] : 'wrong_answer',
                examples: g.examples.join(' | '),
                status: status,
            };
        });
        out.sort(function (a, b) {
            if (b.totalMistakes !== a.totalMistakes) return b.totalMistakes - a.totalMistakes;
            return String(a.stepLabel || '').localeCompare(String(b.stepLabel || ''));
        });
        return out;
    },

    _perGameplayMetrics(attempts, catalogByGameplay) {
        const out = {};
        for (let i = 0; i < attempts.length; i++) {
            const a = attempts[i];
            const key = a.gameplayId || 'unknown_gameplay';
            if (!out[key]) {
                const c = catalogByGameplay[key] || {};
                out[key] = {
                    gameplayId: key,
                    gameplayLabel: c.label || a.gameplayLabel || key,
                    competencyKey: c.competencyKey || a.competencyKey || null,
                    competencyLabel: c.competencyLabel || a.competencyLabel || null,
                    attempts: 0,
                    assessedAttempts: 0,
                    passed: 0,
                    failed: 0,
                    cancelled: 0,
                    repetitions: 0,
                    roundsUsed: 0,
                    avgAccuracy: 0,
                    avgClearMs: 0,
                    medianClearMs: 0,
                    retries: 0,
                    mistakes: 0,
                    wrongClassMappings: {},
                    cidrErrorDistances: [],
                    firstTrySuccessCount: 0,
                    slotWrongFrequency: {
                        usableSubnets: 0,
                        totalSubnets: 0,
                        totalHosts: 0,
                        usableHosts: 0,
                    },
                };
            }
            const r = out[key];
            r.attempts++;
            r.roundsUsed += Math.max(1, Number(a.roundsUsed || a.attemptsUsed || 1) || 1);
            if (a.isRepetition) r.repetitions++;
            if (a.cancelled) r.cancelled++;
            else {
                r.assessedAttempts++;
                if (a.passed) r.passed++;
                else r.failed++;
            }
            r.retries += Number(a.retries || 0) || 0;
            r.mistakes += Number(a.mistakeCount || 0) || 0;

            const payload = a.payload || {};
            if (payload.wrongMappings && Array.isArray(payload.wrongMappings)) {
                for (let w = 0; w < payload.wrongMappings.length; w++) {
                    const m = payload.wrongMappings[w] || {};
                    const pair = String(m.sourceClass || '?') + '->' + String(m.targetClass || '?');
                    r.wrongClassMappings[pair] = (r.wrongClassMappings[pair] || 0) + 1;
                }
            }
            if (payload.cidrErrorDistance !== undefined && payload.cidrErrorDistance !== null && Number.isFinite(Number(payload.cidrErrorDistance))) {
                r.cidrErrorDistances.push(Number(payload.cidrErrorDistance));
            }
            if (payload.firstTrySuccess === true) r.firstTrySuccessCount++;
            if (payload.slotStats && payload.slotStats.wrongSlotFrequency) {
                const f = payload.slotStats.wrongSlotFrequency;
                const keys = ['usableSubnets', 'totalSubnets', 'totalHosts', 'usableHosts'];
                for (let si = 0; si < keys.length; si++) {
                    const sk = keys[si];
                    r.slotWrongFrequency[sk] += Number(f[sk] || 0) || 0;
                }
            }
        }
        const ids = Object.keys(out);
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const row = out[id];
            const related = attempts.filter(function (a) { return a.gameplayId === id && !a.cancelled; });
            row.avgAccuracy = this._avg(related.map(function (a) { return Number(a.accuracy || 0) || 0; }));
            row.avgClearMs = this._avg(related.map(function (a) { return Number(a.durationMs || 0) || 0; }).filter(function (n) { return n > 0; }));
            row.medianClearMs = this._median(related.map(function (a) { return Number(a.durationMs || 0) || 0; }).filter(function (n) { return n > 0; }));
        }
        return out;
    },

    _dailyRollups(attempts, catalogByGameplay) {
        const byDay = {};
        const catalog = catalogByGameplay || {};
        for (let i = 0; i < attempts.length; i++) {
            const a = attempts[i];
            const day = this._dayKey(a.timestamp);
            if (!byDay[day]) {
                byDay[day] = {
                    day: day,
                    attempts: 0,
                    gamingInstances: 0,
                    assessedAttempts: 0,
                    passed: 0,
                    failed: 0,
                    cancelled: 0,
                    repetitions: 0,
                    roundsUsed: 0,
                    retries: 0,
                    mistakes: 0,
                    totalPlayMs: 0,
                    accuracyValues: [],
                    clearValues: [],
                    mistakesByGameplay: {},
                    gameplayCounts: {},
                    sessionIds: {},
                    stageLevels: {},
                    firstActivityAt: 0,
                    lastActivityAt: 0,
                };
            }
            const d = byDay[day];
            d.attempts++;
            d.gamingInstances++;
            d.roundsUsed += Math.max(1, Number(a.roundsUsed || a.attemptsUsed || 1) || 1);
            d.retries += Math.max(0, Number(a.retries || 0) || 0);
            d.mistakes += Math.max(0, Number(a.mistakeCount || 0) || 0);
            d.totalPlayMs += Math.max(0, Number(a.durationMs || 0) || 0);
            if (a.isRepetition) d.repetitions++;
            if (a.cancelled) {
                d.cancelled++;
            } else {
                d.assessedAttempts++;
                if (a.passed) d.passed++;
                else d.failed++;
                d.accuracyValues.push(Number(a.accuracy || 0) || 0);
                if (a.durationMs > 0) d.clearValues.push(Number(a.durationMs));
            }
            const gk = a.gameplayId || 'unknown_gameplay';
            d.mistakesByGameplay[gk] = (d.mistakesByGameplay[gk] || 0) + (Number(a.mistakeCount || 0) || 0);
            d.gameplayCounts[gk] = (d.gameplayCounts[gk] || 0) + 1;
            if (a.sessionId) d.sessionIds[a.sessionId] = true;
            d.stageLevels[a.stageLevel || ('Stage ' + a.stageId + ' Level ' + a.levelId)] = true;
            const ts = Number(a.timestamp || 0) || 0;
            if (!d.firstActivityAt || ts < d.firstActivityAt) d.firstActivityAt = ts;
            if (ts > d.lastActivityAt) d.lastActivityAt = ts;
        }

        const rows = Object.keys(byDay).sort().map(function (day) { return byDay[day]; });
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            r.sessions = Object.keys(r.sessionIds).length;
            r.gameplayCount = Object.keys(r.gameplayCounts).length;
            r.stageLevelCoverage = Object.keys(r.stageLevels).sort().join(', ');
            const gameplayIds = Object.keys(r.gameplayCounts).sort(function (a, b) {
                if (r.gameplayCounts[b] !== r.gameplayCounts[a]) return r.gameplayCounts[b] - r.gameplayCounts[a];
                return a.localeCompare(b);
            });
            const topGameplayId = gameplayIds.length ? gameplayIds[0] : null;
            r.mostPlayedGameplay = topGameplayId
                ? ((catalog[topGameplayId] && catalog[topGameplayId].label) || topGameplayId)
                : 'No gameplay';
            r.mostPlayedCount = topGameplayId ? r.gameplayCounts[topGameplayId] : 0;
            r.completionRate = r.assessedAttempts > 0 ? r.passed / r.assessedAttempts : 0;
            r.accuracy = this._avg(r.accuracyValues);
            r.avgClearMs = this._avg(r.clearValues);
            r.learningScore = (r.accuracy * 0.60) + (r.completionRate * 0.40);
            r.firstActivityTime = this._formatLocalTime(r.firstActivityAt);
            r.lastActivityTime = this._formatLocalTime(r.lastActivityAt);
            const previous = i > 0 ? rows[i - 1] : null;
            r.accuracyDelta = previous ? r.accuracy - previous.accuracy : 0;
            r.completionRateDelta = previous ? r.completionRate - previous.completionRate : 0;
            r.learningScoreDelta = previous ? r.learningScore - previous.learningScore : 0;
            r.avgClearImprovementMs = previous && previous.avgClearMs > 0 && r.avgClearMs > 0
                ? previous.avgClearMs - r.avgClearMs
                : 0;
            r.improvementDirection = 'baseline';
            if (previous) {
                if (r.learningScoreDelta > 0.03) r.improvementDirection = 'improved';
                else if (r.learningScoreDelta < -0.03) r.improvementDirection = 'declined';
                else r.improvementDirection = 'steady';
            }
        }
        return rows;
    },

    _stageLevelMetrics(attempts, catalogByGameplay) {
        const groups = {};
        const catalog = catalogByGameplay || {};
        for (let i = 0; i < attempts.length; i++) {
            const a = attempts[i];
            const key = [a.stageId, a.levelId, a.mapId].join('|');
            if (!groups[key]) {
                groups[key] = {
                    stageId: Number(a.stageId || 0) || 0,
                    levelId: Number(a.levelId || 0) || 0,
                    mapId: Number(a.mapId || 0) || 0,
                    stageName: a.stageName || a.stageLevel || 'Unknown stage',
                    gameplayInstances: 0,
                    assessedAttempts: 0,
                    passed: 0,
                    failed: 0,
                    cancelled: 0,
                    repetitions: 0,
                    roundsUsed: 0,
                    retries: 0,
                    mistakes: 0,
                    totalDurationMs: 0,
                    accuracyValues: [],
                    gameplayIds: {},
                    questIds: {},
                    firstActivityAt: 0,
                    lastActivityAt: 0,
                    securityStrikes: 0,
                    securityAlerts: 0,
                    rollbackEvents: 0,
                };
            }
            const g = groups[key];
            g.gameplayInstances++;
            g.roundsUsed += Math.max(1, Number(a.roundsUsed || a.attemptsUsed || 1) || 1);
            g.retries += Math.max(0, Number(a.retries || 0) || 0);
            g.mistakes += Math.max(0, Number(a.mistakeCount || 0) || 0);
            g.totalDurationMs += Math.max(0, Number(a.durationMs || 0) || 0);
            if (a.isRepetition) g.repetitions++;
            if (a.cancelled) g.cancelled++;
            else {
                g.assessedAttempts++;
                if (a.passed) g.passed++;
                else g.failed++;
                g.accuracyValues.push(Number(a.accuracy || 0) || 0);
            }
            g.gameplayIds[a.gameplayId || 'unknown_gameplay'] = true;
            if (a.questId) g.questIds[a.questId] = true;
            if (Number(a.securityStrikeCount || 0) > 0 && !a.passed && !a.cancelled) g.securityStrikes++;
            if (a.securityTriggered) g.securityAlerts++;
            if (a.rollbackQuestId || a.darklightsDimmed) g.rollbackEvents++;
            const ts = Number(a.timestamp || 0) || 0;
            if (!g.firstActivityAt || ts < g.firstActivityAt) g.firstActivityAt = ts;
            if (ts > g.lastActivityAt) g.lastActivityAt = ts;
        }

        const rows = Object.keys(groups).map(function (key) {
            const g = groups[key];
            const gameplayIds = Object.keys(g.gameplayIds);
            return {
                stageId: g.stageId,
                levelId: g.levelId,
                mapId: g.mapId,
                stageName: g.stageName,
                gameplayInstances: g.gameplayInstances,
                assessedAttempts: g.assessedAttempts,
                passed: g.passed,
                failed: g.failed,
                cancelled: g.cancelled,
                repetitions: g.repetitions,
                roundsUsed: g.roundsUsed,
                retries: g.retries,
                mistakes: g.mistakes,
                completionRate: g.assessedAttempts > 0 ? g.passed / g.assessedAttempts : 0,
                accuracy: IP2LiveReportManager._avg(g.accuracyValues),
                avgTimeOnTaskMs: g.gameplayInstances > 0 ? g.totalDurationMs / g.gameplayInstances : 0,
                totalTimeOnTaskMs: g.totalDurationMs,
                gameplayCount: gameplayIds.length,
                gameplays: gameplayIds.map(function (id) { return (catalog[id] && catalog[id].label) || id; }).join(', '),
                questCount: Object.keys(g.questIds).length,
                securityStrikes: g.securityStrikes,
                securityAlerts: g.securityAlerts,
                rollbackEvents: g.rollbackEvents,
                firstActivityAt: g.firstActivityAt,
                lastActivityAt: g.lastActivityAt,
            };
        });
        rows.sort(function (a, b) {
            if (a.stageId !== b.stageId) return a.stageId - b.stageId;
            if (a.levelId !== b.levelId) return a.levelId - b.levelId;
            return a.mapId - b.mapId;
        });
        return rows;
    },

    _questRepetitionRows(attempts, catalogByGameplay) {
        const groups = {};
        const catalog = catalogByGameplay || {};
        for (let i = 0; i < attempts.length; i++) {
            const a = attempts[i];
            const key = [a.stageId, a.levelId, a.questId || a.objectiveId || 'unassigned', a.objectiveId || '', a.gameplayId].join('|');
            if (!groups[key]) {
                groups[key] = {
                    stageId: a.stageId,
                    levelId: a.levelId,
                    mapId: a.mapId,
                    stageName: a.stageName,
                    questId: a.questId || null,
                    questLabel: a.questLabel || a.questId || 'Unassigned quest',
                    questSequence: a.questSequence || 0,
                    objectiveId: a.objectiveId || null,
                    gameplayId: a.gameplayId,
                    gameplayLabel: (catalog[a.gameplayId] && catalog[a.gameplayId].label) || a.gameplayLabel || a.gameplayId,
                    mode: a.mode,
                    instances: [],
                };
            }
            groups[key].instances.push(a);
        }

        const rows = Object.keys(groups).map(function (key) {
            const g = groups[key];
            const assessed = g.instances.filter(function (a) { return !a.cancelled; });
            const passed = assessed.filter(function (a) { return a.passed; }).length;
            const failed = assessed.length - passed;
            const first = assessed.length ? assessed[0] : g.instances[0];
            const latest = assessed.length ? assessed[assessed.length - 1] : g.instances[g.instances.length - 1];
            let longestFailureStreak = 0;
            let streak = 0;
            for (let i = 0; i < assessed.length; i++) {
                if (assessed[i].passed) streak = 0;
                else {
                    streak++;
                    longestFailureStreak = Math.max(longestFailureStreak, streak);
                }
            }
            const accuracyValues = assessed.map(function (a) { return Number(a.accuracy || 0) || 0; });
            const durations = assessed.map(function (a) { return Number(a.durationMs || 0) || 0; }).filter(function (n) { return n > 0; });
            const accuracyImprovement = first && latest ? (Number(latest.accuracy || 0) || 0) - (Number(first.accuracy || 0) || 0) : 0;
            const timeImprovementMs = first && latest && first.durationMs > 0 && latest.durationMs > 0
                ? Number(first.durationMs) - Number(latest.durationMs)
                : 0;
            let status = 'Needs evidence';
            const avgAccuracy = IP2LiveReportManager._avg(accuracyValues);
            const completionRate = assessed.length ? passed / assessed.length : 0;
            if (assessed.length) {
                if (completionRate >= 0.80 && avgAccuracy >= 0.80) status = 'Demonstrated';
                else if (completionRate >= 0.60 && avgAccuracy >= 0.60) status = 'Developing';
                else status = 'Needs support';
            }
            return {
                stageId: g.stageId,
                levelId: g.levelId,
                mapId: g.mapId,
                stageName: g.stageName,
                questId: g.questId,
                questLabel: g.questLabel,
                questSequence: g.questSequence,
                objectiveId: g.objectiveId,
                gameplayId: g.gameplayId,
                gameplayLabel: g.gameplayLabel,
                mode: g.mode,
                gameplayInstances: g.instances.length,
                repetitions: Math.max(0, g.instances.length - 1),
                assessedAttempts: assessed.length,
                passed: passed,
                failed: failed,
                cancelled: g.instances.length - assessed.length,
                roundsUsed: g.instances.reduce(function (sum, a) { return sum + Math.max(1, Number(a.roundsUsed || 1) || 1); }, 0),
                retries: g.instances.reduce(function (sum, a) { return sum + Math.max(0, Number(a.retries || 0) || 0); }, 0),
                mistakes: g.instances.reduce(function (sum, a) { return sum + Math.max(0, Number(a.mistakeCount || 0) || 0); }, 0),
                completionRate: completionRate,
                averageAccuracy: avgAccuracy,
                averageDurationMs: IP2LiveReportManager._avg(durations),
                firstAccuracy: first ? Number(first.accuracy || 0) || 0 : 0,
                latestAccuracy: latest ? Number(latest.accuracy || 0) || 0 : 0,
                accuracyImprovement: accuracyImprovement,
                timeImprovementMs: timeImprovementMs,
                longestFailureStreak: longestFailureStreak,
                securityStrikes: g.instances.reduce(function (sum, a) { return sum + (Number(a.securityStrikeCount || 0) > 0 && !a.passed ? 1 : 0); }, 0),
                securityAlerts: g.instances.filter(function (a) { return a.securityTriggered; }).length,
                firstAttemptAt: g.instances.length ? g.instances[0].timestamp : 0,
                lastAttemptAt: g.instances.length ? g.instances[g.instances.length - 1].timestamp : 0,
                status: status,
            };
        });
        rows.sort(function (a, b) {
            if (a.stageId !== b.stageId) return a.stageId - b.stageId;
            if (a.levelId !== b.levelId) return a.levelId - b.levelId;
            if (a.questSequence !== b.questSequence) return a.questSequence - b.questSequence;
            return String(a.questId || '').localeCompare(String(b.questId || ''));
        });
        return rows;
    },

    _computeMastery(input) {
        const overallAccuracy = this._clamp01(Number(input.overallAccuracy || 0) || 0);
        const completionRate = this._clamp01(Number(input.completionRate || 0) || 0);
        const attempts = Array.isArray(input.attempts) ? input.attempts : [];
        const catalogByGameplay = input.catalogByGameplay || {};
        const daily = Array.isArray(input.daily) ? input.daily : [];

        let speedSamples = 0;
        let speedScoreSum = 0;
        for (let i = 0; i < attempts.length; i++) {
            const a = attempts[i];
            const c = catalogByGameplay[a.gameplayId] || {};
            const target = Number(c.targetClearMs || 0) || 0;
            const duration = Number(a.durationMs || 0) || 0;
            if (target <= 0 || duration <= 0) continue;
            const score = duration <= target ? 100 : Math.max(0, Math.min(100, (target / duration) * 100));
            speedScoreSum += score;
            speedSamples++;
        }
        const speedScore = speedSamples > 0 ? speedScoreSum / speedSamples : 50;

        const half = Math.max(1, Math.floor(daily.length / 2));
        const first = daily.slice(0, half);
        const second = daily.slice(half);
        const firstAcc = this._avg(first.map(function (d) { return Number(d.accuracy || 0) || 0; }));
        const secondAcc = this._avg(second.map(function (d) { return Number(d.accuracy || 0) || 0; }));
        const delta = secondAcc - firstAcc;
        const improvementScore = Math.max(0, Math.min(100, 50 + delta * 166.67));

        const weightedMastery = (
            0.45 * (overallAccuracy * 100) +
            0.20 * (completionRate * 100) +
            0.15 * speedScore +
            0.20 * improvementScore
        );
        return {
            weightedMastery: Math.max(0, Math.min(100, weightedMastery)),
            speedScore: speedScore,
            improvementScore: improvementScore,
        };
    },

    _competencyMetrics(attempts, catalogByGameplay) {
        const byCompetency = {};
        for (let i = 0; i < attempts.length; i++) {
            const a = attempts[i];
            const c = catalogByGameplay[a.gameplayId] || {};
            const key = c.competencyKey || a.competencyKey || ('competency.' + (a.gameplayId || 'unknown'));
            if (!byCompetency[key]) {
                byCompetency[key] = {
                    competencyKey: key,
                    competencyLabel: c.competencyLabel || a.competencyLabel || key,
                    attempts: 0,
                    passed: 0,
                    retries: 0,
                    mistakeRateValues: [],
                    accuracyValues: [],
                    clearValues: [],
                    issues: {},
                };
            }
            const row = byCompetency[key];
            row.attempts++;
            if (a.passed) row.passed++;
            row.retries += Number(a.retries || 0) || 0;
            row.accuracyValues.push(Number(a.accuracy || 0) || 0);
            row.mistakeRateValues.push(Number(a.mistakeRate || 0) || 0);
            if (a.durationMs > 0) row.clearValues.push(Number(a.durationMs || 0) || 0);
            row.issues[a.gameplayId || 'unknown_gameplay'] = (row.issues[a.gameplayId || 'unknown_gameplay'] || 0) + (Number(a.mistakeCount || 0) || 0);
        }

        const out = [];
        const keys = Object.keys(byCompetency);
        for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            const r = byCompetency[k];
            const accuracy = this._avg(r.accuracyValues);
            const mistakeRate = this._avg(r.mistakeRateValues);
            const medianClear = this._median(r.clearValues);
            const completionRate = r.attempts > 0 ? r.passed / r.attempts : 0;
            const confidence = Math.max(0, Math.min(1, r.attempts / 12));
            const status = this._competencyStatus({
                attempts: r.attempts,
                accuracy: accuracy,
                mistakeRate: mistakeRate,
                medianClear: medianClear,
                retries: r.retries,
            });
            out.push({
                competencyKey: r.competencyKey,
                competencyLabel: r.competencyLabel,
                attempts: r.attempts,
                accuracy: accuracy,
                completionRate: completionRate,
                mistakeRate: mistakeRate,
                medianClearMs: medianClear,
                retries: r.retries,
                status: status.status,
                confidence: confidence,
                score: status.score,
                topIssues: this._topIssueList(r.issues, 3),
                interventionHint: this._interventionHint(status.status, r.competencyLabel),
            });
        }
        out.sort(function (a, b) { return a.competencyLabel.localeCompare(b.competencyLabel); });
        return out;
    },

    _attemptSummary(attempts, catalogByGameplay) {
        const byKey = {};
        for (let i = 0; i < attempts.length; i++) {
            const a = attempts[i];
            const gameplayId = a.gameplayId || 'unknown_gameplay';
            const stageId = Number(a.stageId || 0) || 0;
            const levelId = Number(a.levelId || 0) || 0;
            const key = [stageId, levelId, gameplayId].join('|');
            if (!byKey[key]) {
                const c = catalogByGameplay[gameplayId] || {};
                byKey[key] = {
                    stageId: stageId,
                    levelId: levelId,
                    gameplayId: gameplayId,
                    gameplayLabel: c.label || a.gameplayLabel || gameplayId,
                    attempts: 0,
                    assessedAttempts: 0,
                    wins: 0,
                    wrongs: 0,
                    cancelled: 0,
                    repetitions: 0,
                    roundsUsed: 0,
                    mistakes: 0,
                    retries: 0,
                    accuracyValues: [],
                    clearValues: [],
                    firstAttemptTs: 0,
                    lastAttemptTs: 0,
                };
            }
            const row = byKey[key];
            row.attempts++;
            row.roundsUsed += Math.max(1, Number(a.roundsUsed || a.attemptsUsed || 1) || 1);
            if (a.isRepetition) row.repetitions++;
            if (a.cancelled) row.cancelled++;
            else {
                row.assessedAttempts++;
                if (a.passed) row.wins++;
                else row.wrongs++;
                row.accuracyValues.push(Number(a.accuracy || 0) || 0);
                if (a.durationMs > 0) row.clearValues.push(Number(a.durationMs || 0) || 0);
            }
            row.mistakes += Number(a.mistakeCount || 0) || 0;
            row.retries += Number(a.retries || 0) || 0;
            if (!row.firstAttemptTs || Number(a.timestamp || 0) < row.firstAttemptTs) row.firstAttemptTs = Number(a.timestamp || 0) || 0;
            row.lastAttemptTs = Math.max(row.lastAttemptTs, Number(a.timestamp || 0) || 0);
        }
        const out = Object.keys(byKey).map(function (k) {
            const r = byKey[k];
            return {
                stageId: r.stageId,
                levelId: r.levelId,
                gameplayId: r.gameplayId,
                gameplayLabel: r.gameplayLabel,
                attempts: r.attempts,
                assessedAttempts: r.assessedAttempts,
                wins: r.wins,
                wrongs: r.wrongs,
                cancelled: r.cancelled,
                repetitions: r.repetitions,
                roundsUsed: r.roundsUsed,
                mistakes: r.mistakes,
                retries: r.retries,
                accuracy: IP2LiveReportManager._avg(r.accuracyValues),
                avgClearMs: IP2LiveReportManager._avg(r.clearValues),
                firstAttemptTs: r.firstAttemptTs,
                lastAttemptTs: r.lastAttemptTs,
            };
        });
        out.sort(function (a, b) {
            if (a.stageId !== b.stageId) return a.stageId - b.stageId;
            if (a.levelId !== b.levelId) return a.levelId - b.levelId;
            return String(a.gameplayLabel || '').localeCompare(String(b.gameplayLabel || ''));
        });
        return out;
    },

    _competencyStatus(input) {
        const attempts = Number(input.attempts || 0) || 0;
        const accuracy = this._clamp01(Number(input.accuracy || 0) || 0);
        const mistakeRate = Math.max(0, Number(input.mistakeRate || 0) || 0);
        const retries = Math.max(0, Number(input.retries || 0) || 0);
        if (attempts < 5) {
            return { status: 'Insufficient Data', score: Math.round(accuracy * 100) };
        }
        const repeatedRetries = retries >= Math.ceil(attempts * 0.5);
        if (accuracy >= 0.85 && mistakeRate <= 0.20) {
            return { status: 'Strong', score: Math.round(accuracy * 100) };
        }
        if (accuracy < 0.65 || mistakeRate > 0.40 || repeatedRetries) {
            return { status: 'Weak', score: Math.round(accuracy * 100) };
        }
        return { status: 'Moderate', score: Math.round(accuracy * 100) };
    },

    _interventionHint(status, competencyLabel) {
        if (status === 'Strong') return 'Maintain current pace; introduce advanced mixed-problem drills.';
        if (status === 'Moderate') return 'Practice focused ' + competencyLabel + ' drills with timed sets and immediate correction review.';
        if (status === 'Weak') return 'Revisit fundamentals of ' + competencyLabel + ' with guided examples before timed attempts.';
        return 'Collect more attempts to establish a reliable competency status.';
    },

    _topIssueList(issueMap, limit) {
        const entries = Object.keys(issueMap || {}).map(function (k) { return { key: k, value: issueMap[k] }; });
        entries.sort(function (a, b) { return b.value - a.value; });
        return entries.slice(0, Math.max(1, Number(limit || 3) || 3));
    },

    async _buildPdfBlob(report) {
        const writer = this._createSecurePdfWriter();
        const pageSize = { width: 595, height: 842 };
        const ctx = {
            report: report,
            writer: writer,
            pageSize: pageSize,
            margin: 34,
            headerY: pageSize.height - 28,
            footerY: 18,
            contentTop: pageSize.height - 74,
            contentBottom: 52,
            pageNumber: 0,
        };

        this._activePdfCtx = ctx;
        this._pdfStartPage(ctx, {
            title: 'IP2Live Progress Report',
            subtitle: 'Confidential progress review for ' + report.summary.infiltratorName,
            cover: true,
        });
        this._pdfRenderCoverPage(ctx);

        this._pdfStartPage(ctx, { title: 'Executive Summary' });
        this._pdfRenderExecutiveSummaryPage(ctx);

        this._pdfStartPage(ctx, { title: 'Insights' });
        this._pdfRenderInsightsSection(ctx);

        this._pdfStartPage(ctx, { title: 'Gameplay Performance' });
        this._pdfRenderGameplaySection(ctx);

        this._pdfStartPage(ctx, { title: 'Competency Coverage' });
        this._pdfRenderCompetencySection(ctx);

        this._pdfStartPage(ctx, { title: 'Stage Completion' });
        this._pdfRenderStageSection(ctx);

        this._pdfStartPage(ctx, { title: 'Daily Trends' });
        this._pdfRenderDailySection(ctx);

        this._pdfStartPage(ctx, { title: 'Module Comparison' });
        this._pdfRenderModuleSection(ctx);

        this._pdfStartPage(ctx, { title: 'Gameplay Details' });
        this._pdfRenderGameplayDetailsSection(ctx);

        this._pdfStartPage(ctx, { title: 'Mistake Breakdown' });
        this._pdfRenderMistakeSection(ctx);

        this._pdfStartPage(ctx, { title: 'Try-Level Mistakes' });
        this._pdfRenderTryMistakeSection(ctx);

        this._pdfStartPage(ctx, { title: 'Subnetting Step Analysis' });
        this._pdfRenderStepAnalysisSection(ctx);

        this._pdfStartPage(ctx, { title: 'Attempts Raw' });
        this._pdfRenderAttemptsRawSection(ctx);

        this._pdfStartPage(ctx, { title: 'Attempts By Stage' });
        this._pdfRenderAttemptsByStageSection(ctx);

        const blob = writer.blob();
        this._activePdfCtx = null;
        return blob;
    },

    /** @private Build the cover page with brand styling, metadata, and a compact KPI snapshot. */
    _pdfRenderCoverPage(ctx) {
        const report = ctx.report;
        const writer = ctx.writer;
        const left = ctx.margin;
        const top = ctx.contentTop;

        const brandTop = top - 22;
        writer.rect(left, top - 8, 240, 2, { fill: [0.12, 0.53, 0.82] });
        writer.rect(left, brandTop - 6, 58, 36, { fill: [0.12, 0.53, 0.82] });
        // center the IP2 wordmark inside the blue badge (approximate text width)
        const _logoText = 'IP2';
        const _logoSize = 18;
        const _badgeW = 58;
        const _approxTextWidth = Math.max(6, _logoText.length * _logoSize * 0.55);
        const _logoX = left + (_badgeW / 2) - (_approxTextWidth / 2);
        writer.text(_logoX, brandTop + 11, _logoSize, _logoText, { font: 'F2', color: [1, 1, 1] });
        writer.text(left + 74, brandTop + 10, 20, 'IP2Live', { font: 'F2', color: [0.12, 0.20, 0.31] });
        writer.text(left + 74, brandTop - 5, 8.8, 'Formal telemetry progress report', { font: 'F1', color: [0.35, 0.38, 0.43] });

        writer.text(left, top - 84, 24, 'Progress Report', { font: 'F2', color: [0.08, 0.16, 0.28] });
        writer.text(left, top - 108, 12.5, 'Player: ' + this._sanitizePdfText(report.summary.infiltratorName), { font: 'F1', color: [0.2, 0.2, 0.2] });
        writer.text(left, top - 124, 11.5, 'Generated: ' + this._formatPdfDate(report.summary.generatedAt), { font: 'F1', color: [0.2, 0.2, 0.2] });
        writer.text(left, top - 140, 11.5, 'Scope: Last ' + this._sanitizePdfText(report.summary.scopeDays) + ' days', { font: 'F1', color: [0.2, 0.2, 0.2] });

        const badgeY = top - 202;
        const badgeW = 156;
        const badges = [
            { label: 'Attempts', value: report.kpi.attempts, color: [0.12, 0.53, 0.82] },
            { label: 'Accuracy', value: this._pct(report.kpi.accuracy), color: [0.16, 0.63, 0.37] },
            { label: 'Mastery', value: this._num(report.kpi.weightedMastery, 1), color: [0.82, 0.58, 0.12] },
        ];
        for (let i = 0; i < badges.length; i++) {
            const bx = left + i * (badgeW + 12);
            writer.rect(bx, badgeY, badgeW, 52, { fill: [0.96, 0.97, 0.99], stroke: [0.79, 0.84, 0.90], lineWidth: 0.8 });
            writer.rect(bx, badgeY + 41, badgeW, 4, { fill: badges[i].color });
            writer.text(bx + 12, badgeY + 16, 10, badges[i].label, { font: 'F1', color: [0.34, 0.36, 0.40] });
            writer.text(bx + 12, badgeY + 33, 17, String(badges[i].value), { font: 'F2', color: badges[i].color });
        }

        this._pdfRenderParagraph(writer, left, top - 282, 510, 10.5, report.performanceSummary, { font: 'F1', color: [0.16, 0.18, 0.21] });

        const chartRect = { x: left, y: top - 470, w: 520, h: 130 };
        writer.rect(chartRect.x, chartRect.y, chartRect.w, chartRect.h, { fill: [0.98, 0.99, 1], stroke: [0.79, 0.84, 0.90], lineWidth: 0.9 });
        this._pdfRenderLineChart(writer, chartRect, (report.stats && report.stats.bySession) || [], {
            title: 'Progression Trend Across Sessions',
            valueKey: 'accuracyRate',
            min: 0,
            max: 1,
            labels: function (row, index) { return 'S' + (index + 1); },
            lineColor: [0.12, 0.53, 0.82],
            fillColor: [0.74, 0.86, 0.96],
        });
    },

    /** @private Render the executive summary page with KPI cards, narrative text, and trend cards. */
    _pdfRenderExecutiveSummaryPage(ctx) {
        const report = ctx.report;
        const writer = ctx.writer;
        const left = ctx.margin;
        const top = ctx.contentTop;

        this._pdfRenderSectionHeader(writer, left, top, 520, 'Summary', 'Executive KPI snapshot and interpretive notes');
        this._pdfRenderKpiGrid(writer, left, top - 46, 520, report.kpi);

        const summaryY = top - 126;
        writer.text(left, summaryY, 11, 'Interpretive Summary', { font: 'F2', color: [0.08, 0.16, 0.28] });
        this._pdfRenderParagraph(writer, left, summaryY - 18, 520, 10.3, report.performanceSummary, { font: 'F1', color: [0.16, 0.18, 0.21] });

        const strongest = report.stats && report.stats.strongestGameplay ? report.stats.strongestGameplay : null;
        const weakest = report.stats && report.stats.weakestGameplay ? report.stats.weakestGameplay : null;
        const trend = report.stats && report.stats.progressionTrend ? report.stats.progressionTrend : null;
        const notesY = top - 260;
        const noteWidth = 160;
        const notes = [
            { title: 'Strongest', value: strongest ? strongest.gameplayLabel : 'No gameplay data', detail: strongest ? this._pct(strongest.accuracyRate) : 'n/a', color: [0.16, 0.63, 0.37] },
            { title: 'Weakest', value: weakest ? weakest.gameplayLabel : 'No gameplay data', detail: weakest ? this._pct(weakest.accuracyRate) : 'n/a', color: [0.82, 0.28, 0.20] },
            { title: 'Trend', value: trend ? trend.direction : 'plateau', detail: trend ? this._pct(trend.deltaAccuracyRate) : 'n/a', color: [0.12, 0.53, 0.82] },
        ];
        for (let i = 0; i < notes.length; i++) {
            const boxX = left + i * (noteWidth + 14);
            writer.rect(boxX, notesY, noteWidth, 66, { fill: [0.97, 0.98, 0.99], stroke: [0.83, 0.86, 0.91], lineWidth: 0.8 });
            writer.rect(boxX, notesY + 56, noteWidth, 5, { fill: notes[i].color });
            writer.text(boxX + 10, notesY + 18, 10, notes[i].title, { font: 'F1', color: [0.33, 0.35, 0.40] });
            writer.text(boxX + 10, notesY + 34, 12, this._sanitizePdfText(notes[i].value), { font: 'F2', color: notes[i].color });
            writer.text(boxX + 10, notesY + 49, 10, this._sanitizePdfText(notes[i].detail), { font: 'F1', color: [0.28, 0.30, 0.33] });
        }

        const trendRect = { x: left, y: top - 360, w: 520, h: 108 };
        writer.rect(trendRect.x, trendRect.y, trendRect.w, trendRect.h, { fill: [0.98, 0.99, 1], stroke: [0.79, 0.84, 0.90], lineWidth: 0.8 });
        this._pdfRenderLineChart(writer, trendRect, report.daily || [], {
            title: 'Daily Accuracy Trend',
            valueKey: 'accuracy',
            min: 0,
            max: 1,
            labels: function (row) { return row.day; },
            lineColor: [0.16, 0.63, 0.37],
            fillColor: [0.80, 0.91, 0.84],
        });
    },

    /** @private Render the Insights page to mirror the workbook's summary of strength, weakness, trend, and error pattern. */
    _pdfRenderInsightsSection(ctx) {
        const report = ctx.report;
        const writer = ctx.writer;
        const left = ctx.margin;
        const top = ctx.contentTop;
        const strongest = report.stats && report.stats.strongestGameplay ? report.stats.strongestGameplay : null;
        const weakest = report.stats && report.stats.weakestGameplay ? report.stats.weakestGameplay : null;
        const trend = report.stats && report.stats.progressionTrend ? report.stats.progressionTrend : null;
        const patterns = report.stats && Array.isArray(report.stats.errorPatterns) ? report.stats.errorPatterns : [];

        this._pdfRenderSectionHeader(writer, left, top, 520, 'Insights', 'Workbook insight sheet mirrored into the PDF report');

        const cards = [
            { title: 'Strength', label: strongest ? strongest.gameplayLabel : 'No gameplay data', detail: strongest ? this._pct(strongest.accuracyRate) : 'n/a', color: [0.16, 0.63, 0.37] },
            { title: 'Weakness', label: weakest ? weakest.gameplayLabel : 'No gameplay data', detail: weakest ? this._pct(weakest.accuracyRate) : 'n/a', color: [0.82, 0.28, 0.20] },
            { title: 'Trend', label: trend ? trend.direction : 'plateau', detail: trend ? this._signedPct(trend.deltaAccuracyRate) : 'n/a', color: [0.12, 0.53, 0.82] },
        ];
        // Place stat cards below the section header and ensure all elements are positioned
        const cardWidth = 160;
        const cardHeight = 58;
        const cardGap = 10;
        const cardY = top - 110; // vertical position for cards (below header)
        for (let i = 0; i < cards.length; i++) {
            const x = left + i * (cardWidth + cardGap);
            const cardX = x;
            const cardTop = cardY;
            writer.rect(cardX, cardTop, cardWidth, cardHeight, { fill: [0.97, 0.98, 0.99], stroke: [0.83, 0.86, 0.91], lineWidth: 0.8 });
            // colored accent bar anchored to the bottom of the card
            writer.rect(cardX, cardTop + cardHeight - 4, cardWidth, 4, { fill: cards[i].color });
            writer.text(cardX + 10, cardTop + 14, 10, cards[i].title, { font: 'F1', color: [0.34, 0.36, 0.40] });
            writer.text(cardX + 10, cardTop + 30, 12, this._sanitizePdfText(cards[i].label), { font: 'F2', color: cards[i].color });
            writer.text(cardX + 10, cardTop + 44, 10, this._sanitizePdfText(cards[i].detail), { font: 'F1', color: [0.28, 0.30, 0.33] });
        }

        const insightText = patterns.length
            ? 'Repeated failure appears most strongly in ' + patterns[0].gameplayLabel + ' at stage ' + patterns[0].stageId + ', where the longest streak reached ' + patterns[0].longestFailureStreak + ' attempts.'
            : 'No major repeated-failure pattern stands out in the current report window.';
        // Place the insight paragraph below the cards
        const paraY = cardY - (cardHeight + 12);
        this._pdfRenderParagraph(writer, left, paraY, 520, 10.4, insightText, { font: 'F1', color: [0.16, 0.18, 0.21] });

        const summaryRect = { x: left, y: paraY - 140, w: 520, h: 122 };
        writer.rect(summaryRect.x, summaryRect.y, summaryRect.w, summaryRect.h, { fill: [0.98, 0.99, 1], stroke: [0.79, 0.84, 0.90], lineWidth: 0.8 });
        this._pdfRenderPatternBars(writer, summaryRect, patterns, patterns.map(function (row) {
            return { issue: row.gameplayLabel + ' / stage ' + row.stageId, count: row.longestFailureStreak || 0 };
        }));
    },

    /** @private Render gameplay-level accuracy, completion, and timing summaries. */
    _pdfRenderGameplaySection(ctx) {
        const report = ctx.report;
        const writer = ctx.writer;
        const left = ctx.margin;
        const top = ctx.contentTop;
        const gameplayRows = Array.isArray(report.stats && report.stats.byGameplay) ? report.stats.byGameplay.slice() : [];
        gameplayRows.sort(function (a, b) { return (Number(b.accuracyRate) || 0) - (Number(a.accuracyRate) || 0); });

        this._pdfRenderSectionHeader(writer, left, top, 520, 'Gameplay Stats', 'Accuracy and completion by gameplay module');
        const barRect = { x: left, y: top - 182, w: 520, h: 126 };
        writer.rect(barRect.x, barRect.y, barRect.w, barRect.h, { fill: [0.98, 0.99, 1], stroke: [0.79, 0.84, 0.90], lineWidth: 0.8 });
        this._pdfRenderBarChart(writer, barRect, gameplayRows.slice(0, 8), {
            title: 'Accuracy Rate per Gameplay Module',
            valueKey: 'accuracyRate',
            labelKey: 'gameplayLabel',
            color: [0.12, 0.53, 0.82],
            max: 1,
        });

        this._pdfRenderTable(writer, {
            x: left,
            y: top - 330,
            width: 520,
            title: 'Gameplay Detail Table',
            columns: [
                { key: 'gameplayLabel', label: 'Gameplay', width: 0.34 },
                { key: 'attempts', label: 'Attempts', width: 0.10, align: 'right' },
                { key: 'correctAttempts', label: 'Correct', width: 0.10, align: 'right' },
                { key: 'incorrectAttempts', label: 'Incorrect', width: 0.10, align: 'right' },
                { key: 'accuracyRate', label: 'Accuracy', width: 0.10, align: 'right', formatter: this._pct.bind(this) },
                { key: 'completionRate', label: 'Completion', width: 0.10, align: 'right', formatter: this._pct.bind(this) },
                { key: 'avgTimeOnTaskMs', label: 'Avg Time', width: 0.16, align: 'right', formatter: this._ms.bind(this) },
            ],
            rows: gameplayRows,
            rowColor: function (row, index) {
                return row.accuracyRate >= 0.8 ? [0.90, 0.96, 0.91, index % 2 ? 0.98 : 1] : row.accuracyRate >= 0.55 ? [0.99, 0.95, 0.84, index % 2 ? 0.98 : 1] : [0.96, 0.90, 0.90, index % 2 ? 0.98 : 1];
            },
        });
    },

    /** @private Render the competency coverage radar chart plus a status legend and detailed table. */
    _pdfRenderCompetencySection(ctx) {
        const report = ctx.report;
        const writer = ctx.writer;
        const left = ctx.margin;
        const top = ctx.contentTop;

        this._pdfRenderSectionHeader(writer, left, top, 520, 'Competency Coverage', 'Spider chart and classification table across all competencies');
        const chartRect = { x: left, y: top - 190, w: 260, h: 152 };
        writer.rect(chartRect.x, chartRect.y, chartRect.w, chartRect.h, { fill: [0.98, 0.99, 1], stroke: [0.79, 0.84, 0.90], lineWidth: 0.8 });
        this._pdfRenderRadarChart(writer, chartRect, Array.isArray(report.competencies) ? report.competencies : [], {
            title: 'Overall Competency Coverage',
            valueKey: 'score',
            labelKey: 'competencyLabel',
            color: [0.82, 0.58, 0.12],
        });

        const statusRect = { x: left + 278, y: top - 190, w: 242, h: 152 };
        this._pdfRenderCompetencyLegend(writer, statusRect, report.competencies || []);

        this._pdfRenderTable(writer, {
            x: left,
            y: top - 354,
            width: 520,
            title: 'Competency Table',
            columns: [
                { key: 'competencyLabel', label: 'Competency', width: 0.28 },
                { key: 'status', label: 'Status', width: 0.12 },
                { key: 'score', label: 'Score', width: 0.10, align: 'right' },
                { key: 'confidence', label: 'Confidence', width: 0.10, align: 'right', formatter: this._pct.bind(this) },
                { key: 'attempts', label: 'Attempts', width: 0.10, align: 'right' },
                { key: 'accuracy', label: 'Accuracy', width: 0.10, align: 'right', formatter: this._pct.bind(this) },
                { key: 'completionRate', label: 'Completion', width: 0.10, align: 'right', formatter: this._pct.bind(this) },
                { key: 'interventionHint', label: 'Intervention', width: 0.20 },
            ],
            rows: report.competencies || [],
            rowColor: this._pdfRowColorForCompetency.bind(this),
        });
    },

    /** @private Render stage completion with a synthetic not-started state and a completion histogram. */
    _pdfRenderStageSection(ctx) {
        const report = ctx.report;
        const writer = ctx.writer;
        const left = ctx.margin;
        const top = ctx.contentTop;
        const rows = this._pdfBuildStageStatusRows(report.stats && Array.isArray(report.stats.byStage) ? report.stats.byStage : []);

        this._pdfRenderSectionHeader(writer, left, top, 520, 'Stage Stats', 'Color-coded completion status and attempt quality per stage');
        const chartRect = { x: left, y: top - 160, w: 520, h: 120 };
        writer.rect(chartRect.x, chartRect.y, chartRect.w, chartRect.h, { fill: [0.98, 0.99, 1], stroke: [0.79, 0.84, 0.90], lineWidth: 0.8 });
        this._pdfRenderStageHistogram(writer, chartRect, rows);

        this._pdfRenderTable(writer, {
            x: left,
            y: top - 296,
            width: 520,
            title: 'Stage Completion Table',
            columns: [
                { key: 'stageId', label: 'Stage', width: 0.10, align: 'right' },
                { key: 'status', label: 'Status', width: 0.14 },
                { key: 'attempts', label: 'Attempts', width: 0.10, align: 'right' },
                { key: 'correctAttempts', label: 'Correct', width: 0.10, align: 'right' },
                { key: 'incorrectAttempts', label: 'Incorrect', width: 0.10, align: 'right' },
                { key: 'accuracyRate', label: 'Accuracy', width: 0.10, align: 'right', formatter: this._pct.bind(this) },
                { key: 'completionRate', label: 'Completion', width: 0.10, align: 'right', formatter: this._pct.bind(this) },
                { key: 'avgTimeOnTaskMs', label: 'Avg Time', width: 0.12, align: 'right', formatter: this._ms.bind(this) },
                { key: 'gameplayCount', label: 'Gameplays', width: 0.10, align: 'right' },
            ],
            rows: rows,
            rowColor: function (row) {
                const status = row.status || 'not started';
                if (status === 'completed') return [0.90, 0.96, 0.91, 1];
                if (status === 'in progress') return [0.99, 0.95, 0.84, 1];
                return [0.94, 0.94, 0.94, 1];
            },
        });
    },

    /** @private Render the daily trends table and a second line chart for day-by-day progression. */
    _pdfRenderDailySection(ctx) {
        const report = ctx.report;
        const writer = ctx.writer;
        const left = ctx.margin;
        const top = ctx.contentTop;

        this._pdfRenderSectionHeader(writer, left, top, 520, 'Daily Trends', 'Session progression and daily rollups');
        const trendRect = { x: left, y: top - 168, w: 520, h: 122 };
        writer.rect(trendRect.x, trendRect.y, trendRect.w, trendRect.h, { fill: [0.98, 0.99, 1], stroke: [0.79, 0.84, 0.90], lineWidth: 0.8 });
        this._pdfRenderLineChart(writer, trendRect, report.daily || [], {
            title: 'Progression Across Sessions',
            valueKey: 'accuracy',
            min: 0,
            max: 1,
            labels: function (row) { return row.day; },
            lineColor: [0.12, 0.53, 0.82],
            fillColor: [0.74, 0.86, 0.96],
        });

        this._pdfRenderTable(writer, {
            x: left,
            y: top - 306,
            width: 520,
            title: 'Daily Trends Table',
            columns: [
                { key: 'day', label: 'Day', width: 0.18 },
                { key: 'attempts', label: 'Attempts', width: 0.10, align: 'right' },
                { key: 'passed', label: 'Passed', width: 0.10, align: 'right' },
                { key: 'failed', label: 'Failed', width: 0.10, align: 'right' },
                { key: 'completionRate', label: 'Completion', width: 0.12, align: 'right', formatter: this._pct.bind(this) },
                { key: 'accuracy', label: 'Accuracy', width: 0.12, align: 'right', formatter: this._pct.bind(this) },
                { key: 'avgClearMs', label: 'Avg Clear', width: 0.12, align: 'right', formatter: this._ms.bind(this) },
            ],
            rows: report.daily || [],
            rowColor: function (row, index) { return index % 2 === 0 ? [0.98, 0.99, 1, 1] : [1, 1, 1, 1]; },
        });
    },

    /** @private Render module comparisons with paired bars and a detailed module comparison table. */
    _pdfRenderModuleSection(ctx) {
        const report = ctx.report;
        const writer = ctx.writer;
        const left = ctx.margin;
        const top = ctx.contentTop;
        const rows = Array.isArray(report.stats && report.stats.byModule) ? report.stats.byModule.slice() : [];

        this._pdfRenderSectionHeader(writer, left, top, 520, 'Module Compare', 'Tutorial versus gameplay deltas across modules');
        const chartRect = { x: left, y: top - 170, w: 520, h: 122 };
        writer.rect(chartRect.x, chartRect.y, chartRect.w, chartRect.h, { fill: [0.98, 0.99, 1], stroke: [0.79, 0.84, 0.90], lineWidth: 0.8 });
        this._pdfRenderModuleDeltaChart(writer, chartRect, rows);

        this._pdfRenderTable(writer, {
            x: left,
            y: top - 308,
            width: 520,
            title: 'Module Comparison Table',
            columns: [
                { key: 'moduleLabel', label: 'Module', width: 0.22 },
                { key: 'tutorialAttempts', label: 'Tut Attempts', width: 0.10, align: 'right' },
                { key: 'tutorialAccuracy', label: 'Tut Accuracy', width: 0.10, align: 'right', formatter: this._pct.bind(this) },
                { key: 'tutorialAvgTimeOnTaskMs', label: 'Tut Time', width: 0.10, align: 'right', formatter: this._ms.bind(this) },
                { key: 'gameplayAttempts', label: 'Game Attempts', width: 0.10, align: 'right' },
                { key: 'gameplayAccuracy', label: 'Game Accuracy', width: 0.10, align: 'right', formatter: this._pct.bind(this) },
                { key: 'gameplayAvgTimeOnTaskMs', label: 'Game Time', width: 0.10, align: 'right', formatter: this._ms.bind(this) },
                { key: 'deltaAccuracyRate', label: 'Delta Acc.', width: 0.08, align: 'right', formatter: this._signedPct.bind(this) },
                { key: 'deltaTimeOnTaskMs', label: 'Delta Time', width: 0.10, align: 'right', formatter: this._msSigned.bind(this) },
            ],
            rows: rows.map(function (row) {
                return {
                    moduleLabel: row.moduleLabel,
                    tutorialAttempts: row.tutorial.attempts,
                    tutorialAccuracy: row.tutorial.accuracyRate,
                    tutorialAvgTimeOnTaskMs: row.tutorial.avgTimeOnTaskMs,
                    gameplayAttempts: row.gameplay.attempts,
                    gameplayAccuracy: row.gameplay.accuracyRate,
                    gameplayAvgTimeOnTaskMs: row.gameplay.avgTimeOnTaskMs,
                    deltaAccuracyRate: row.deltaAccuracyRate,
                    deltaTimeOnTaskMs: row.deltaTimeOnTaskMs,
                };
            }),
            rowColor: function (row) { return row.deltaAccuracyRate >= 0 ? [0.90, 0.96, 0.91, 1] : [0.99, 0.95, 0.84, 1]; },
        });
    },

    /** @private Render gameplay details, failure patterns, and attempt summary data. */
    _pdfRenderGameplayDetailsSection(ctx) {
        const report = ctx.report;
        const writer = ctx.writer;
        const left = ctx.margin;
        const top = ctx.contentTop;
        const rows = Array.isArray(report.attemptSummary) ? report.attemptSummary.slice() : [];

        this._pdfRenderSectionHeader(writer, left, top, 520, 'Gameplay Details', 'Per-stage and per-gameplay attempt summary');
        const chartRect = { x: left, y: top - 164, w: 520, h: 116 };
        writer.rect(chartRect.x, chartRect.y, chartRect.w, chartRect.h, { fill: [0.98, 0.99, 1], stroke: [0.79, 0.84, 0.90], lineWidth: 0.8 });
        this._pdfRenderFailureSparkline(writer, chartRect, rows);

        this._pdfRenderTable(writer, {
            x: left,
            y: top - 300,
            width: 520,
            title: 'Gameplay Detail Table',
            columns: [
                { key: 'stageId', label: 'Stage', width: 0.08, align: 'right' },
                { key: 'levelId', label: 'Level', width: 0.08, align: 'right' },
                { key: 'gameplayLabel', label: 'Gameplay', width: 0.22 },
                { key: 'attempts', label: 'Attempts', width: 0.09, align: 'right' },
                { key: 'wins', label: 'Wins', width: 0.08, align: 'right' },
                { key: 'wrongs', label: 'Wrongs', width: 0.08, align: 'right' },
                { key: 'mistakes', label: 'Mistakes', width: 0.09, align: 'right' },
                { key: 'retries', label: 'Retries', width: 0.08, align: 'right' },
                { key: 'accuracy', label: 'Accuracy', width: 0.10, align: 'right', formatter: this._pct.bind(this) },
                { key: 'avgClearMs', label: 'Avg Clear', width: 0.10, align: 'right', formatter: this._ms.bind(this) },
            ],
            rows: rows,
            rowColor: function (row, index) { return index % 2 === 0 ? [0.98, 0.99, 1, 1] : [1, 1, 1, 1]; },
        });
    },

    /** @private Render mistake breakdown rows and a compact top-issue bar diagram. */
    _pdfRenderMistakeSection(ctx) {
        const report = ctx.report;
        const writer = ctx.writer;
        const left = ctx.margin;
        const top = ctx.contentTop;
        const rows = [];
        const perGameplay = report.perGameplay || {};
        const pgKeys = Object.keys(perGameplay);
        for (let i = 0; i < pgKeys.length; i++) {
            const g = perGameplay[pgKeys[i]] || {};
            const mapping = g.wrongClassMappings || {};
            const keys = Object.keys(mapping);
            for (let j = 0; j < keys.length; j++) rows.push({ gameplayId: g.gameplayId, issue: keys[j], count: mapping[keys[j]] });
            const slots = g.slotWrongFrequency || {};
            const slotKeys = Object.keys(slots);
            for (let k = 0; k < slotKeys.length; k++) rows.push({ gameplayId: g.gameplayId, issue: 'slot:' + slotKeys[k], count: slots[slotKeys[k]] });
        }
        const steps = Array.isArray(report.stepAnalysis) ? report.stepAnalysis : [];
        for (let s = 0; s < steps.length; s++) {
            rows.push({
                gameplayId: steps[s].gameplayId,
                issue: 'step:' + steps[s].stepLabel,
                count: steps[s].totalMistakes,
            });
        }

        this._pdfRenderSectionHeader(writer, left, top, 520, 'Mistake Breakdown', 'Error clusters, slot mismatches, and repeated failure streaks');
        const chartRect = { x: left, y: top - 154, w: 520, h: 110 };
        writer.rect(chartRect.x, chartRect.y, chartRect.w, chartRect.h, { fill: [0.98, 0.99, 1], stroke: [0.79, 0.84, 0.90], lineWidth: 0.8 });
        this._pdfRenderPatternBars(writer, chartRect, report.stats && report.stats.errorPatterns ? report.stats.errorPatterns : [], rows);

        this._pdfRenderTable(writer, {
            x: left,
            y: top - 286,
            width: 520,
            title: 'Mistake Breakdown Table',
            columns: [
                { key: 'gameplayId', label: 'Gameplay', width: 0.22 },
                { key: 'issue', label: 'Issue', width: 0.58 },
                { key: 'count', label: 'Count', width: 0.10, align: 'right' },
            ],
            rows: rows,
            rowColor: function (row, index) { return index % 2 === 0 ? [0.98, 0.99, 1, 1] : [1, 1, 1, 1]; },
        });
    },

    _pdfRenderTryMistakeSection(ctx) {
        const report = ctx.report;
        const writer = ctx.writer;
        const left = ctx.margin;
        const top = ctx.contentTop;
        const rows = Array.isArray(report.attemptMistakes) ? report.attemptMistakes.slice(0, 24) : [];

        this._pdfRenderSectionHeader(writer, left, top, 520, 'Try-Level Mistakes', 'Mistakes recorded before final pass/fail, grouped by try number');
        this._pdfRenderTable(writer, {
            x: left,
            y: top - 58,
            width: 520,
            title: 'Recorded Mistakes During Attempts',
            columns: [
                { key: 'timestamp', label: 'Time', width: 0.14, formatter: this._formatPdfTimestamp.bind(this) },
                { key: 'gameplayLabel', label: 'Gameplay', width: 0.18 },
                { key: 'tryNumber', label: 'Try', width: 0.06, align: 'right' },
                { key: 'stepLabel', label: 'Step', width: 0.18 },
                { key: 'issueType', label: 'Issue', width: 0.13 },
                { key: 'submitted', label: 'Submitted', width: 0.14 },
                { key: 'expected', label: 'Expected', width: 0.14 },
            ],
            rows: rows,
            rowColor: function (row, index) { return index % 2 === 0 ? [0.98, 0.99, 1, 1] : [1, 1, 1, 1]; },
        });
    },

    _pdfRenderStepAnalysisSection(ctx) {
        const report = ctx.report;
        const writer = ctx.writer;
        const left = ctx.margin;
        const top = ctx.contentTop;
        const rows = Array.isArray(report.stepAnalysis) ? report.stepAnalysis.slice(0, 22) : [];

        this._pdfRenderSectionHeader(writer, left, top, 520, 'Subnetting Step Analysis', 'Weakness and strength signals from recorded try-level mistakes');
        this._pdfRenderTable(writer, {
            x: left,
            y: top - 58,
            width: 520,
            title: 'Step-Level Weakness Table',
            columns: [
                { key: 'gameplayLabel', label: 'Gameplay', width: 0.18 },
                { key: 'stepLabel', label: 'Step', width: 0.22 },
                { key: 'totalMistakes', label: 'Mistakes', width: 0.08, align: 'right' },
                { key: 'affectedAttempts', label: 'Attempts', width: 0.08, align: 'right' },
                { key: 'tryEvents', label: 'Tries', width: 0.07, align: 'right' },
                { key: 'mistakeRate', label: 'Rate', width: 0.08, align: 'right', formatter: this._pct.bind(this) },
                { key: 'topIssue', label: 'Top Issue', width: 0.15 },
                { key: 'status', label: 'Concern', width: 0.10 },
            ],
            rows: rows,
            rowColor: function (row) {
                if (row.status === 'High') return [0.99, 0.91, 0.89, 1];
                if (row.status === 'Moderate') return [0.99, 0.96, 0.84, 1];
                return [0.90, 0.96, 0.91, 1];
            },
        });
    },

    /** @private Render the raw attempts section with a timeline strip and a detailed table. */
    _pdfRenderAttemptsRawSection(ctx) {
        const report = ctx.report;
        const writer = ctx.writer;
        const left = ctx.margin;
        const top = ctx.contentTop;
        const rows = Array.isArray(report.attemptsRaw) ? report.attemptsRaw.slice() : []; 

        this._pdfRenderSectionHeader(writer, left, top, 520, 'Attempts Raw', 'Chronological telemetry attempts with outcome and timing');
        const chartRect = { x: left, y: top - 150, w: 520, h: 102 };
        writer.rect(chartRect.x, chartRect.y, chartRect.w, chartRect.h, { fill: [0.98, 0.99, 1], stroke: [0.79, 0.84, 0.90], lineWidth: 0.8 });
        this._pdfRenderAttemptTimeline(writer, chartRect, rows);

        this._pdfRenderTable(writer, {
            x: left,
            y: top - 270,
            width: 520,
            title: 'Raw Attempts Table',
            columns: [
                { key: 'timestamp', label: 'Timestamp', width: 0.18, formatter: this._formatPdfTimestamp.bind(this) },
                { key: 'sessionId', label: 'Session', width: 0.11 },
                { key: 'attemptId', label: 'Attempt', width: 0.10 },
                { key: 'gameplayId', label: 'Gameplay', width: 0.20 },
                { key: 'passed', label: 'Pass', width: 0.06, align: 'right', formatter: function (v) { return v ? 'Y' : 'N'; } },
                { key: 'durationMs', label: 'Duration', width: 0.11, align: 'right', formatter: this._ms.bind(this) },
                { key: 'accuracy', label: 'Accuracy', width: 0.09, align: 'right', formatter: this._pct.bind(this) },
                { key: 'mistakeCount', label: 'Mistakes', width: 0.08, align: 'right' },
                { key: 'retries', label: 'Retries', width: 0.07, align: 'right' },
            ],
            rows: rows,
            rowColor: function (row) { return row.passed ? [0.90, 0.96, 0.91, 1] : [0.99, 0.95, 0.84, 1]; },
        });
    },

    /** @private Render the stage grouped appendix with a matrix diagram and summary table. */
    _pdfRenderAttemptsByStageSection(ctx) {
        const report = ctx.report;
        const writer = ctx.writer;
        const left = ctx.margin;
        const top = ctx.contentTop;
        const rows = Array.isArray(report.attemptSummary) ? report.attemptSummary.slice() : [];

        this._pdfRenderSectionHeader(writer, left, top, 520, 'Attempts By Stage', 'Grouped attempts broken out by stage, level, and gameplay');
        const chartRect = { x: left, y: top - 156, w: 520, h: 110 };
        writer.rect(chartRect.x, chartRect.y, chartRect.w, chartRect.h, { fill: [0.98, 0.99, 1], stroke: [0.79, 0.84, 0.90], lineWidth: 0.8 });
        this._pdfRenderStageMatrix(writer, chartRect, rows);

        this._pdfRenderTable(writer, {
            x: left,
            y: top - 286,
            width: 520,
            title: 'Attempts By Stage Table',
            columns: [
                { key: 'stageId', label: 'Stage', width: 0.08, align: 'right' },
                { key: 'levelId', label: 'Level', width: 0.08, align: 'right' },
                { key: 'gameplayLabel', label: 'Gameplay', width: 0.22 },
                { key: 'attempts', label: 'Attempts', width: 0.08, align: 'right' },
                { key: 'wins', label: 'Wins', width: 0.08, align: 'right' },
                { key: 'wrongs', label: 'Wrongs', width: 0.08, align: 'right' },
                { key: 'mistakes', label: 'Mistakes', width: 0.08, align: 'right' },
                { key: 'retries', label: 'Retries', width: 0.08, align: 'right' },
                { key: 'accuracy', label: 'Accuracy', width: 0.10, align: 'right', formatter: this._pct.bind(this) },
                { key: 'avgClearMs', label: 'Avg Clear', width: 0.10, align: 'right', formatter: this._ms.bind(this) },
                { key: 'lastAttemptTs', label: 'Last Attempt', width: 0.10, formatter: this._formatPdfTimestamp.bind(this) },
            ],
            rows: rows,
            rowColor: function (row, index) { return index % 2 === 0 ? [0.98, 0.99, 1, 1] : [1, 1, 1, 1]; },
        });
    },

    /** @private Begin a new page and paint the shared header, footer, and watermark chrome. */
    _pdfStartPage(ctx, options) {
        const writer = ctx.writer;
        ctx.pageNumber += 1;
        writer.newPage(ctx.pageSize.width, ctx.pageSize.height);
        this._pdfRenderWatermark(writer, ctx.pageSize.width, ctx.pageSize.height, 'IP2Live — Confidential');
        writer.rect(0, ctx.pageSize.height - 34, ctx.pageSize.width, 0.8, { fill: [0.80, 0.84, 0.90] });
        if (!(options && options.cover)) {
            writer.text(ctx.margin, ctx.pageSize.height - 20, 10, 'IP2Live Progress Report', { font: 'F2', color: [0.08, 0.16, 0.28] });
            writer.text(ctx.pageSize.width - ctx.margin - 48, ctx.pageSize.height - 20, 10, 'Page ' + ctx.pageNumber, { font: 'F2', color: [0.24, 0.25, 0.28] });
            writer.text(ctx.pageSize.width / 2 - 88, 16, 8.5, 'Confidential — IP2Live Progress Report', { font: 'F1', color: [0.35, 0.35, 0.35] });
            writer.text(ctx.margin, ctx.pageSize.height - 48, 10, this._sanitizePdfText(options && options.title ? options.title : 'Section'), { font: 'F2', color: [0.35, 0.38, 0.43] });
            if (options && options.subtitle) {
                writer.text(ctx.margin, ctx.pageSize.height - 60, 8.2, this._sanitizePdfText(options.subtitle), { font: 'F1', color: [0.42, 0.44, 0.48] });
            }
        } else {
            writer.text(ctx.pageSize.width - ctx.margin - 48, ctx.pageSize.height - 20, 10, 'Page ' + ctx.pageNumber, { font: 'F2', color: [0.24, 0.25, 0.28] });
            writer.text(ctx.pageSize.width / 2 - 88, 16, 8.5, 'Confidential — IP2Live Progress Report', { font: 'F1', color: [0.35, 0.35, 0.35] });
        }
    },

    /** @private Draw the semi-transparent diagonal watermark used on every page. */
    _pdfRenderWatermark(writer, width, height, text) {
        writer.save();
        writer.applyGraphicsState('GS1');
        writer.raw('1 0 0 1 ' + (width / 2).toFixed(2) + ' ' + (height / 2).toFixed(2) + ' cm');
        const angle = 45 * Math.PI / 180;
        const cos = Math.cos(angle).toFixed(4);
        const sin = Math.sin(angle).toFixed(4);
        writer.raw(cos + ' ' + sin + ' ' + (-Math.sin(angle)).toFixed(4) + ' ' + cos + ' 0 0 cm');
        writer.text(-140, 0, 26, this._sanitizePdfText(text), { font: 'F2', color: [0.75, 0.79, 0.84] });
        writer.restore();
    },

    /** @private Draw a branded section heading and a thin accent rule. */
    _pdfRenderSectionHeader(writer, x, y, width, title, subtitle) {
        writer.rect(x, y - 8, width, 0.8, { fill: [0.12, 0.53, 0.82] });
        writer.text(x, y - 24, 15, this._sanitizePdfText(title), { font: 'F2', color: [0.08, 0.16, 0.28] });
        if (subtitle) writer.text(x, y - 36, 8.6, this._sanitizePdfText(subtitle), { font: 'F1', color: [0.42, 0.44, 0.48] });
    },

    /** @private Render a branded table with pagination, wrapped cells, and compact column layout. */
    _pdfRenderTable(writer, config) {
        const x = Number(config && config.x !== undefined ? config.x : 34) || 34;
        const y = Number(config && config.y !== undefined ? config.y : 700) || 700;
        const width = Number(config && config.width !== undefined ? config.width : 520) || 520;
        const title = config && config.title ? this._sanitizePdfText(config.title) : '';
        const columns = Array.isArray(config && config.columns) ? config.columns : [];
        const rows = Array.isArray(config && config.rows) ? config.rows : [];
        const rowColor = config && config.rowColor;
        const titleColor = [0.08, 0.16, 0.28];
        const headerFill = [0.12, 0.53, 0.82];
        const headerText = [1, 1, 1];
        const gridColor = [0.84, 0.86, 0.90];
        const bodyText = [0.18, 0.20, 0.23];
        const ctx = (config && config.ctx) || this._activePdfCtx || null;
        const bottomLimit = Number(config && config.bottomLimit !== undefined ? config.bottomLimit : (ctx ? ctx.contentBottom : 52)) || 52;
        const headerHeight = 16;
        const baseRowHeight = Number(config && config.rowHeight !== undefined ? config.rowHeight : 16) || 16;
        const fontSize = Number(config && config.fontSize !== undefined ? config.fontSize : 7.2) || 7.2;
        const lineHeight = Math.max(7.2, fontSize + 1.5);
        const maxCellLines = Math.max(1, Number(config && config.maxCellLines !== undefined ? config.maxCellLines : 2) || 2);
        const colWidths = [];
        let percentTotal = 0;
        for (let i = 0; i < columns.length; i++) percentTotal += Math.max(0, Number(columns[i].width || 0) || 0);
        if (percentTotal <= 0) percentTotal = columns.length || 1;
        for (let i = 0; i < columns.length; i++) {
            const value = Math.max(0, Number(columns[i].width || 0) || 0);
            colWidths.push(width * (value > 0 ? value / percentTotal : 1 / columns.length));
        }

        let cursorY = y;
        if (title) {
            writer.text(x, cursorY, 11, title, { font: 'F2', color: titleColor });
            cursorY -= 14;
        }

        const drawHeader = function () {
            let currentX = x;
            writer.rect(x, cursorY - headerHeight + 2, width, headerHeight, { fill: headerFill, stroke: headerFill, lineWidth: 0.2 });
            for (let c = 0; c < columns.length; c++) {
                const column = columns[c] || {};
                const colWidth = colWidths[c] || 0;
                writer.rect(currentX, cursorY - headerHeight + 2, colWidth, headerHeight, { stroke: gridColor, lineWidth: 0.2 });
                const headerTextValue = this._fitPdfTextToWidth(column.label || column.key || '', Math.max(10, colWidth - 6), 8);
                writer.text(currentX + 3, cursorY - 8, 8, headerTextValue, { font: 'F2', color: headerText });
                currentX += colWidth;
            }
            cursorY -= headerHeight;
        }.bind(this);

        const cellLinesFor = function (value, colWidth, column) {
            const source = value === null || value === undefined ? '' : String(value);
            if (column && column.wrap === false) {
                return [this._fitPdfTextToWidth(source, Math.max(10, colWidth - 6), fontSize)];
            }
            const maxChars = Math.max(4, Math.floor((colWidth - 6) / Math.max(2.4, fontSize * 0.42)));
            const limit = Math.max(1, Number((column && column.maxLines) || maxCellLines) || maxCellLines);
            const wrapped = this._wrapText(source, maxChars).slice(0, limit);
            if (!wrapped.length) return [''];
            if (this._wrapText(source, maxChars).length > limit) {
                wrapped[wrapped.length - 1] = this._truncatePdfText(wrapped[wrapped.length - 1], Math.max(3, maxChars - 1)) + '.';
            }
            return wrapped.map(function (line) {
                return this._fitPdfTextToWidth(line, Math.max(10, colWidth - 6), fontSize);
            }, this);
        }.bind(this);

        const rowLayout = function (row) {
            const cells = [];
            let maxLines = 1;
            for (let c = 0; c < columns.length; c++) {
                const column = columns[c] || {};
                const colWidth = colWidths[c] || 0;
                const rawValue = row && column.key ? row[column.key] : '';
                const formatted = typeof column.formatter === 'function' ? column.formatter(rawValue, row, column) : rawValue;
                const lines = cellLinesFor(formatted, colWidth, column);
                maxLines = Math.max(maxLines, lines.length);
                cells.push({ column: column, colWidth: colWidth, lines: lines });
            }
            return {
                cells: cells,
                height: Math.max(baseRowHeight, 6 + maxLines * lineHeight),
            };
        };

        const startContinuationPage = function () {
            if (!ctx) return false;
            this._pdfStartPage(ctx, {
                title: title ? title + ' (continued)' : 'Report Table (continued)',
            });
            cursorY = ctx.contentTop - 28;
            if (title) {
                writer.text(x, cursorY, 10.5, title + ' (continued)', { font: 'F2', color: titleColor });
                cursorY -= 14;
            }
            drawHeader();
            return true;
        }.bind(this);

        const drawRow = function (row, index, layout) {
            let currentX = x;
            const bg = typeof rowColor === 'function'
                ? rowColor(row, index)
                : (Array.isArray(rowColor) ? rowColor : (index % 2 === 0 ? [0.98, 0.99, 1, 1] : [1, 1, 1, 1]));
            const rowHeight = layout.height;
            writer.rect(x, cursorY - rowHeight + 2, width, rowHeight, { fill: bg, stroke: gridColor, lineWidth: 0.2 });
            for (let c = 0; c < layout.cells.length; c++) {
                const cell = layout.cells[c];
                const column = cell.column || {};
                const colWidth = cell.colWidth || 0;
                const align = String(column.align || 'left').toLowerCase();
                for (let lineIndex = 0; lineIndex < cell.lines.length; lineIndex++) {
                    const text = cell.lines[lineIndex];
                    const textY = cursorY - 8 - lineIndex * lineHeight;
                    if (align === 'right') {
                        const estimatedWidth = Math.max(8, String(text).length * fontSize * 0.43);
                        writer.text(Math.max(currentX + 3, currentX + colWidth - 3 - estimatedWidth), textY, fontSize, text, { font: 'F1', color: bodyText });
                    } else if (align === 'center') {
                        const estimatedWidth = Math.max(8, String(text).length * fontSize * 0.30);
                        writer.text(Math.max(currentX + 3, currentX + (colWidth / 2) - (estimatedWidth / 2)), textY, fontSize, text, { font: 'F1', color: bodyText });
                    } else {
                        writer.text(currentX + 3, textY, fontSize, text, { font: 'F1', color: bodyText });
                    }
                }
                writer.rect(currentX, cursorY - rowHeight + 2, colWidth, rowHeight, { stroke: gridColor, lineWidth: 0.2 });
                currentX += colWidth;
            }
            cursorY -= rowHeight;
        }.bind(this);

        drawHeader();
        for (let i = 0; i < rows.length; i++) {
            const layout = rowLayout(rows[i]);
            if (cursorY - layout.height < bottomLimit) {
                if (!startContinuationPage()) break;
            }
            drawRow(rows[i], i, layout);
        }
        return cursorY;
    },

    /** @private Draw a fixed KPI card grid for the report summary page. */
    _pdfRenderKpiGrid(writer, x, y, width, kpi) {
        const items = [
            { label: 'Attempts', value: kpi.attempts, color: [0.12, 0.53, 0.82] },
            { label: 'Completion', value: this._pct(kpi.completionRate), color: [0.16, 0.63, 0.37] },
            { label: 'Accuracy', value: this._pct(kpi.accuracy), color: [0.82, 0.58, 0.12] },
            { label: 'Weighted Mastery', value: this._num(kpi.weightedMastery, 1), color: [0.43, 0.31, 0.68] },
            { label: 'Avg Clear', value: this._ms(kpi.avgClearMs), color: [0.42, 0.44, 0.48] },
            { label: 'Consistency', value: this._ms(kpi.consistencyStdMs), color: [0.82, 0.28, 0.20] },
        ];
        const cols = 3;
        const gap = 12;
        const cardW = (width - gap * (cols - 1)) / cols;
        const cardH = 52;
        for (let i = 0; i < items.length; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const cardX = x + col * (cardW + gap);
            const cardY = y - row * (cardH + 10);
            writer.rect(cardX, cardY, cardW, cardH, { fill: [0.97, 0.98, 0.99], stroke: [0.83, 0.86, 0.91], lineWidth: 0.8 });
            writer.rect(cardX, cardY + cardH - 6, cardW, 4, { fill: items[i].color });
            writer.text(cardX + 10, cardY + 16, 9, items[i].label, { font: 'F1', color: [0.34, 0.36, 0.40] });
            writer.text(cardX + 10, cardY + 33, 16, this._sanitizePdfText(items[i].value), { font: 'F2', color: items[i].color });
        }
    },

    /** @private Render wrapped body text using the report's fixed body width and line spacing. */
    _pdfRenderParagraph(writer, x, y, width, fontSize, text, options) {
        const font = options && options.font ? options.font : 'F1';
        const color = options && options.color ? options.color : [0.16, 0.18, 0.21];
        const lines = this._wrapText(this._sanitizePdfText(text), Math.max(28, Math.floor(width / (Number(fontSize || 10) * 0.55))));
        const lineHeight = Number(fontSize || 10) + 2;
        for (let i = 0; i < lines.length; i++) {
            writer.text(x, y - i * lineHeight, fontSize, lines[i], { font: font, color: color });
        }
        return y - lines.length * lineHeight;
    },

    /** @private Render a simple bar chart using rectangle geometry and labeled bars. */
    _pdfRenderBarChart(writer, rect, rows, options) {
        const items = Array.isArray(rows) ? rows.slice(0, 8) : [];
        const title = options && options.title ? options.title : 'Bar Chart';
        const valueKey = options && options.valueKey ? options.valueKey : 'value';
        const labelKey = options && options.labelKey ? options.labelKey : 'label';
        const color = options && options.color ? options.color : [0.12, 0.53, 0.82];
        const max = Number(options && options.max !== undefined ? options.max : 1) || 1;
        const padX = 16;
        const padTop = 22;
        const padBottom = 20;
        const plotX = rect.x + padX;
        const plotY = rect.y + padBottom;
        const plotW = rect.w - padX * 2;
        const plotH = rect.h - padTop - padBottom;
        writer.text(rect.x + 10, rect.y + rect.h - 14, 10, this._sanitizePdfText(title), { font: 'F2', color: [0.08, 0.16, 0.28] });
        for (let i = 0; i <= 4; i++) {
            const gy = plotY + (plotH * i / 4);
            writer.line(plotX, gy, plotX + plotW, gy, { color: [0.88, 0.90, 0.93], lineWidth: 0.5 });
        }
        if (!items.length) return;
        const gap = 8;
        const barW = Math.max(14, (plotW - gap * (items.length - 1)) / items.length);
        for (let i = 0; i < items.length; i++) {
            const row = items[i];
            const value = Math.max(0, Math.min(max, Number(row[valueKey] || 0) || 0));
            const h = plotH * (value / max);
            const x = plotX + i * (barW + gap);
            writer.rect(x, plotY, barW, h, { fill: color, stroke: [0.08, 0.16, 0.28], lineWidth: 0.2 });
            writer.text(x, plotY - 10, 7.4, this._truncatePdfText(row[labelKey], Math.max(8, Math.floor(barW / 3))), { font: 'F1', color: [0.25, 0.27, 0.30] });
            writer.text(x, plotY + h + 2, 7.2, this._pct(value), { font: 'F2', color: color });
        }
    },

    /** @private Render a line chart for session or daily trend data. */
    _pdfRenderLineChart(writer, rect, rows, options) {
        const items = Array.isArray(rows) ? rows : [];
        const valueKey = options && options.valueKey ? options.valueKey : 'value';
        const labels = options && options.labels ? options.labels : null;
        const color = options && options.lineColor ? options.lineColor : [0.12, 0.53, 0.82];
        const fillColor = options && options.fillColor ? options.fillColor : [0.82, 0.90, 0.97];
        const min = Number(options && options.min !== undefined ? options.min : 0) || 0;
        const max = Number(options && options.max !== undefined ? options.max : 1) || 1;
        const title = options && options.title ? options.title : 'Line Chart';
        const plotX = rect.x + 16;
        const plotY = rect.y + 18;
        const plotW = rect.w - 30;
        const plotH = rect.h - 38;
        writer.text(rect.x + 10, rect.y + rect.h - 14, 10, this._sanitizePdfText(title), { font: 'F2', color: [0.08, 0.16, 0.28] });
        for (let i = 0; i <= 4; i++) {
            const gy = plotY + (plotH * i / 4);
            writer.line(plotX, gy, plotX + plotW, gy, { color: [0.88, 0.90, 0.93], lineWidth: 0.5 });
        }
        if (items.length < 2) return;
        const den = Math.max(0.0001, max - min);
        const points = [];
        for (let i = 0; i < items.length; i++) {
            const row = items[i];
            const value = Math.max(min, Math.min(max, Number(row[valueKey] || 0) || 0));
            const px = plotX + (i / (items.length - 1)) * plotW;
            const py = plotY + ((value - min) / den) * plotH;
            points.push({ x: px, y: py, row: row, index: i });
        }
        const baseline = plotY;
        const fillPoints = [{ x: points[0].x, y: baseline }].concat(points).concat([{ x: points[points.length - 1].x, y: baseline }]);
        writer.polygon(fillPoints, { fill: fillColor, stroke: null, close: true, opacity: 0.18 });
        writer.polyline(points, { stroke: color, lineWidth: 1.8 });
        for (let i = 0; i < points.length; i++) {
            writer.circle(points[i].x, points[i].y, 2.1, { fill: color, stroke: color, lineWidth: 0.3 });
            const label = labels ? labels(points[i].row, i) : String(i + 1);
            writer.text(points[i].x - 8, rect.y + 4, 6.9, this._truncatePdfText(label, 9), { font: 'F1', color: [0.25, 0.27, 0.30] });
        }
    },

    /** @private Render the competency radar chart with concentric guides and a filled polygon. */
    _pdfRenderRadarChart(writer, rect, rows, options) {
        const items = Array.isArray(rows) ? rows.slice(0, 8) : [];
        const title = options && options.title ? options.title : 'Radar Chart';
        const valueKey = options && options.valueKey ? options.valueKey : 'value';
        const labelKey = options && options.labelKey ? options.labelKey : 'label';
        const color = options && options.color ? options.color : [0.82, 0.58, 0.12];
        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2 - 2;
        const radius = Math.min(rect.w, rect.h) / 2 - 22;
        writer.text(rect.x + 10, rect.y + rect.h - 14, 10, this._sanitizePdfText(title), { font: 'F2', color: [0.08, 0.16, 0.28] });
        if (!items.length) return;
        for (let ring = 1; ring <= 4; ring++) {
            const ringRadius = radius * ring / 4;
            const ringPoints = this._pdfPolarPoints(cx, cy, ringRadius, items.length);
            writer.polygon(ringPoints, { stroke: [0.88, 0.90, 0.93], lineWidth: 0.5, close: true });
        }
        for (let i = 0; i < items.length; i++) {
            const angle = (-Math.PI / 2) + (i * Math.PI * 2 / items.length);
            const axisX = cx + Math.cos(angle) * radius;
            const axisY = cy + Math.sin(angle) * radius;
            writer.line(cx, cy, axisX, axisY, { color: [0.88, 0.90, 0.93], lineWidth: 0.5 });
            writer.text(axisX + (Math.cos(angle) >= 0 ? 2 : -42), axisY + (Math.sin(angle) >= 0 ? 2 : -8), 6.8, this._truncatePdfText(items[i][labelKey], 11), { font: 'F1', color: [0.25, 0.27, 0.30] });
        }
        const polygon = [];
        for (let i = 0; i < items.length; i++) {
            const angle = (-Math.PI / 2) + (i * Math.PI * 2 / items.length);
            const value = Math.max(0, Math.min(100, Number(items[i][valueKey] || 0) || 0)) / 100;
            polygon.push({ x: cx + Math.cos(angle) * radius * value, y: cy + Math.sin(angle) * radius * value });
        }
        writer.polygon(polygon, { fill: color, stroke: color, lineWidth: 1.2, opacity: 0.18, close: true });
    },

    /** @private Render a status legend and score ladder for competency rows. */
    _pdfRenderCompetencyLegend(writer, rect, rows) {
        writer.rect(rect.x, rect.y, rect.w, rect.h, { fill: [0.98, 0.99, 1], stroke: [0.79, 0.84, 0.90], lineWidth: 0.8 });
        writer.text(rect.x + 10, rect.y + rect.h - 14, 10, 'Status Legend', { font: 'F2', color: [0.08, 0.16, 0.28] });
        const legend = [
            { label: 'Strong', color: [0.16, 0.63, 0.37] },
            { label: 'Moderate', color: [0.82, 0.58, 0.12] },
            { label: 'Weak', color: [0.82, 0.28, 0.20] },
            { label: 'Insufficient Data', color: [0.56, 0.58, 0.60] },
        ];
        for (let i = 0; i < legend.length; i++) {
            const y = rect.y + rect.h - 36 - i * 22;
            writer.rect(rect.x + 10, y, 10, 10, { fill: legend[i].color, stroke: legend[i].color, lineWidth: 0.3 });
            writer.text(rect.x + 26, y + 8, 8.6, legend[i].label, { font: 'F1', color: [0.27, 0.30, 0.33] });
        }
        const top = Array.isArray(rows) ? rows.slice().sort(function (a, b) { return Number(b.score || 0) - Number(a.score || 0); }).slice(0, 4) : [];
        for (let j = 0; j < top.length; j++) {
            const row = top[j];
            const y = rect.y + 16 + j * 18;
            writer.text(rect.x + 10, y, 8.2, this._truncatePdfText(row.competencyLabel, 18), { font: 'F1', color: [0.27, 0.30, 0.33] });
            writer.rect(rect.x + 112, y - 2, 110, 7, { fill: [0.89, 0.91, 0.93], stroke: [0.89, 0.91, 0.93], lineWidth: 0.1 });
            const fillW = 110 * (Math.max(0, Math.min(100, Number(row.score || 0) || 0)) / 100);
            const scoreColor = this._pdfColorForCompetencyStatus(row.status);
            writer.rect(rect.x + 112, y - 2, fillW, 7, { fill: scoreColor, stroke: scoreColor, lineWidth: 0.1 });
        }
    },

    /** @private Render a horizontal completion histogram for stage statuses. */
    _pdfRenderStageHistogram(writer, rect, rows) {
        const items = Array.isArray(rows) ? rows.slice(0, 10) : [];
        writer.text(rect.x + 10, rect.y + rect.h - 14, 10, 'Stage Completion Distribution', { font: 'F2', color: [0.08, 0.16, 0.28] });
        if (!items.length) return;
        const counts = { completed: 0, 'in progress': 0, 'not started': 0 };
        for (let i = 0; i < items.length; i++) counts[items[i].status] = (counts[items[i].status] || 0) + 1;
        const total = items.length;
        const barX = rect.x + 18;
        const barY = rect.y + 40;
        const barW = rect.w - 36;
        writer.text(barX, barY + 40, 8, 'Completed', { font: 'F1', color: [0.27, 0.30, 0.33] });
        writer.text(barX, barY + 24, 8, 'In Progress', { font: 'F1', color: [0.27, 0.30, 0.33] });
        writer.text(barX, barY + 8, 8, 'Not Started', { font: 'F1', color: [0.27, 0.30, 0.33] });
        const stackX = barX + 72;
        const stackW = barW - 72;
        const fill = [
            { key: 'completed', color: [0.16, 0.63, 0.37], y: barY + 36 },
            { key: 'in progress', color: [0.82, 0.58, 0.12], y: barY + 20 },
            { key: 'not started', color: [0.56, 0.58, 0.60], y: barY + 4 },
        ];
        for (let i = 0; i < fill.length; i++) {
            const pct = total > 0 ? (counts[fill[i].key] || 0) / total : 0;
            writer.rect(stackX, fill[i].y, stackW, 8, { fill: [0.91, 0.92, 0.94], stroke: [0.91, 0.92, 0.94], lineWidth: 0.1 });
            writer.rect(stackX, fill[i].y, stackW * pct, 8, { fill: fill[i].color, stroke: fill[i].color, lineWidth: 0.1 });
        }
    },

    /** @private Render the tutorial-versus-gameplay delta bars for module comparison. */
    _pdfRenderModuleDeltaChart(writer, rect, rows) {
        const items = Array.isArray(rows) ? rows.slice(0, 6) : [];
        writer.text(rect.x + 10, rect.y + rect.h - 14, 10, 'Tutorial vs Gameplay Accuracy', { font: 'F2', color: [0.08, 0.16, 0.28] });
        if (!items.length) return;
        const plotX = rect.x + 18;
        const plotY = rect.y + 18;
        const plotH = rect.h - 34;
        const groupW = (rect.w - 38) / items.length;
        for (let i = 0; i < items.length; i++) {
            const row = items[i];
            const baseX = plotX + i * groupW + 2;
            const tut = Math.max(0, Math.min(1, Number(row.tutorial.accuracyRate || 0) || 0));
            const game = Math.max(0, Math.min(1, Number(row.gameplay.accuracyRate || 0) || 0));
            writer.rect(baseX, plotY, groupW - 8, plotH, { fill: [0.91, 0.92, 0.94], stroke: [0.91, 0.92, 0.94], lineWidth: 0.1 });
            writer.rect(baseX + 2, plotY, 10, plotH * tut, { fill: [0.82, 0.58, 0.12], stroke: [0.82, 0.58, 0.12], lineWidth: 0.1 });
            writer.rect(baseX + 16, plotY, 10, plotH * game, { fill: [0.12, 0.53, 0.82], stroke: [0.12, 0.53, 0.82], lineWidth: 0.1 });
            writer.text(baseX - 2, rect.y + 6, 6.9, this._truncatePdfText(row.moduleLabel, 13), { font: 'F1', color: [0.25, 0.27, 0.30] });
        }
    },

    /** @private Render a sparkline-style failure summary for repeated failure streaks. */
    _pdfRenderFailureSparkline(writer, rect, rows) {
        const items = Array.isArray(rows) ? rows.slice(0, 12) : [];
        writer.text(rect.x + 10, rect.y + rect.h - 14, 10, 'Repeated-Failure Diagnostic', { font: 'F2', color: [0.08, 0.16, 0.28] });
        if (!items.length) return;
        const plotX = rect.x + 14;
        const plotY = rect.y + 18;
        const plotW = rect.w - 28;
        const plotH = rect.h - 36;
        const points = [];
        for (let i = 0; i < items.length; i++) {
            const value = Math.max(0, Number(items[i].mistakes || 0) || 0) + Math.max(0, Number(items[i].retries || 0) || 0);
            const x = plotX + (i / Math.max(1, items.length - 1)) * plotW;
            const y = plotY + Math.min(plotH, value * 3);
            points.push({ x: x, y: y });
        }
        writer.line(plotX, plotY, plotX + plotW, plotY, { color: [0.88, 0.90, 0.93], lineWidth: 0.5 });
        writer.polyline(points, { stroke: [0.82, 0.28, 0.20], lineWidth: 1.4 });
        for (let i = 0; i < points.length; i++) writer.circle(points[i].x, points[i].y, 1.9, { fill: [0.82, 0.28, 0.20], stroke: [0.82, 0.28, 0.20], lineWidth: 0.2 });
    },

    /** @private Render a compact timeline strip for raw attempts. */
    _pdfRenderAttemptTimeline(writer, rect, rows) {
        const items = Array.isArray(rows) ? rows.slice(0, 24) : [];
        writer.text(rect.x + 10, rect.y + rect.h - 14, 10, 'Attempt Timeline', { font: 'F2', color: [0.08, 0.16, 0.28] });
        if (!items.length) return;
        const plotX = rect.x + 14;
        const plotY = rect.y + 18;
        const plotW = rect.w - 28;
        const laneH = rect.h - 40;
        for (let i = 0; i < items.length; i++) {
            const x = plotX + (i / Math.max(1, items.length - 1)) * plotW;
            writer.line(x, plotY, x, plotY + laneH, { color: [0.90, 0.92, 0.95], lineWidth: 0.4 });
            writer.circle(x, plotY + laneH / 2, 2.2, { fill: items[i].passed ? [0.16, 0.63, 0.37] : [0.82, 0.28, 0.20], stroke: [1, 1, 1], lineWidth: 0.3 });
        }
    },

    /** @private Render the grouped stage matrix used in the appendix section. */
    _pdfRenderStageMatrix(writer, rect, rows) {
        const items = Array.isArray(rows) ? rows.slice(0, 24) : [];
        writer.text(rect.x + 10, rect.y + rect.h - 14, 10, 'Stage Matrix', { font: 'F2', color: [0.08, 0.16, 0.28] });
        if (!items.length) return;
        const plotX = rect.x + 18;
        const plotY = rect.y + 18;
        const plotW = rect.w - 36;
        const plotH = rect.h - 36;
        for (let i = 0; i < items.length; i++) {
            const row = items[i];
            const x = plotX + (i / Math.max(1, items.length - 1)) * plotW;
            const acc = Math.max(0, Math.min(1, Number(row.accuracy || 0) || 0));
            const y = plotY + acc * (plotH - 8);
            writer.rect(x - 2, plotY, 4, plotH, { fill: [0.93, 0.94, 0.96], stroke: [0.93, 0.94, 0.96], lineWidth: 0.1 });
            writer.circle(x, y, 2.4, { fill: this._pdfColorForStageStatus(row.status), stroke: [1, 1, 1], lineWidth: 0.3 });
        }
    },

    /** @private Render a compact bar chart for the mistake breakdown section. */
    _pdfRenderPatternBars(writer, rect, patterns, rows) {
        const items = Array.isArray(rows) ? rows.slice().sort(function (a, b) { return Number(b.count || 0) - Number(a.count || 0); }).slice(0, 6) : [];
        writer.text(rect.x + 10, rect.y + rect.h - 14, 10, 'Top Mistake Pairs', { font: 'F2', color: [0.08, 0.16, 0.28] });
        if (!items.length) return;
        const max = Math.max.apply(null, items.map(function (r) { return Number(r.count || 0) || 0; }).concat([1]));
        const plotX = rect.x + 14;
        const plotY = rect.y + 18;
        const plotW = rect.w - 28;
        const barH = (rect.h - 40) / items.length - 3;
        for (let i = 0; i < items.length; i++) {
            const row = items[i];
            const y = plotY + i * (barH + 3);
            writer.rect(plotX, y, plotW, barH, { fill: [0.93, 0.94, 0.96], stroke: [0.93, 0.94, 0.96], lineWidth: 0.1 });
            writer.rect(plotX, y, plotW * (Number(row.count || 0) / max), barH, { fill: [0.82, 0.28, 0.20], stroke: [0.82, 0.28, 0.20], lineWidth: 0.1 });
            writer.text(plotX + 4, y + barH - 1, 6.8, this._truncatePdfText(row.issue, 24), { font: 'F1', color: [0.25, 0.27, 0.30] });
        }
    },

    /** @private Build stage rows with synthetic not-started entries so the table can show all states. */
    _pdfBuildStageStatusRows(stageRows) {
        const seen = {};
        let maxStage = 0;
        const out = [];
        for (let i = 0; i < stageRows.length; i++) {
            const row = stageRows[i] || {};
            const stageId = Number(row.stageId || 0) || 0;
            maxStage = Math.max(maxStage, stageId);
            const status = this._stageStatusFromRow(row);
            seen[stageId] = true;
            out.push({
                stageId: stageId,
                status: status,
                attempts: Number(row.attempts || 0) || 0,
                correctAttempts: Number(row.correctAttempts || 0) || 0,
                incorrectAttempts: Number(row.incorrectAttempts || 0) || 0,
                accuracyRate: Number(row.accuracyRate || 0) || 0,
                completionRate: Number(row.completionRate || 0) || 0,
                avgTimeOnTaskMs: Number(row.avgTimeOnTaskMs || 0) || 0,
                gameplayCount: Number(row.gameplayCount || 0) || 0,
            });
        }
        for (let stage = 1; stage <= maxStage; stage++) {
            if (seen[stage]) continue;
            out.push({ stageId: stage, status: 'not started', attempts: 0, correctAttempts: 0, incorrectAttempts: 0, accuracyRate: 0, completionRate: 0, avgTimeOnTaskMs: 0, gameplayCount: 0 });
        }
        out.sort(function (a, b) { return a.stageId - b.stageId; });
        return out;
    },

    /** @private Infer a stage completion state from the stage rollup values. */
    _stageStatusFromRow(row) {
        const attempts = Number(row && row.attempts || 0) || 0;
        const accuracy = Number(row && row.accuracyRate || 0) || 0;
        if (!attempts) return 'not started';
        if (accuracy >= 0.95) return 'completed';
        return 'in progress';
    },

    /** @private Map a competency status to its row tint. */
    _pdfRowColorForCompetency(row) {
        const status = String(row && row.status || '').toLowerCase();
        if (status === 'strong') return [0.90, 0.96, 0.91, 1];
        if (status === 'moderate') return [0.99, 0.95, 0.84, 1];
        if (status === 'weak') return [0.96, 0.90, 0.90, 1];
        return [0.94, 0.94, 0.94, 1];
    },

    /** @private Map a competency status to a report color. */
    _pdfColorForCompetencyStatus(status) {
        const value = String(status || '').toLowerCase();
        if (value === 'strong') return [0.16, 0.63, 0.37];
        if (value === 'moderate') return [0.82, 0.58, 0.12];
        if (value === 'weak') return [0.82, 0.28, 0.20];
        return [0.56, 0.58, 0.60];
    },

    /** @private Map a stage completion state to a report color. */
    _pdfColorForStageStatus(status) {
        const value = String(status || '').toLowerCase();
        if (value === 'completed') return [0.16, 0.63, 0.37];
        if (value === 'in progress') return [0.82, 0.58, 0.12];
        return [0.56, 0.58, 0.60];
    },

    /** @private Format a numeric value as a signed percentage string. */
    _signedPct(n) {
        const v = Math.max(-1, Math.min(1, Number(n || 0) || 0));
        const sign = v > 0 ? '+' : '';
        return sign + (v * 100).toFixed(1) + '%';
    },

    /** @private Format a signed millisecond delta into a labeled string. */
    _msSigned(n) {
        const value = Number(n || 0) || 0;
        const sign = value > 0 ? '+' : '';
        return sign + this._ms(Math.abs(value));
    },

    /** @private Format a report timestamp for display within PDF tables. */
    _formatPdfTimestamp(ts) {
        if (!ts) return '';
        const date = new Date(Number(ts || 0) || 0);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    },

    /** @private Format a report timestamp for the cover page. */
    _formatPdfDate(ts) {
        const date = new Date(Number(ts || 0) || 0);
        if (Number.isNaN(date.getTime())) return '';
        return date.toLocaleString();
    },

    /** @private Build a safe PDF text string by stripping unsupported characters. */
    _sanitizePdfText(text) {
        return String(text === null || text === undefined ? '' : text).replace(/\r?\n/g, ' ').replace(/[^\x20-\x7E]/g, '?').trim();
    },

    /** @private Escape PDF literal text so it can be written safely into a content stream. */
    _escapePdfText(text) {
        return this._sanitizePdfText(text)
            .replace(/\\/g, '\\\\')
            .replace(/\(/g, '\\(')
            .replace(/\)/g, '\\)');
    },

    /** @private Convert an RGB color array into a PDF fill/stroke operator string. */
    _colorOperator(color, fill) {
        const input = Array.isArray(color) ? color : [0, 0, 0];
        const rgb = [
            Math.max(0, Math.min(1, Number(input[0] || 0) || 0)),
            Math.max(0, Math.min(1, Number(input[1] || 0) || 0)),
            Math.max(0, Math.min(1, Number(input[2] || 0) || 0)),
        ];
        return rgb.map(function (v) { return Number(v).toFixed(3); }).join(' ') + (fill ? ' rg' : ' RG');
    },

    /** @private Truncate a text value to a maximum visible length without changing the source value. */
    _truncatePdfText(text, maxLength) {
        const source = this._sanitizePdfText(text);
        const limit = Math.max(6, Number(maxLength || 12) || 12);
        if (source.length <= limit) return source;
        return source.slice(0, Math.max(0, limit - 1)).trimEnd() + '...';
    },

    /** @private Fit a text value into an approximate width budget for the current PDF font size. */
    _fitPdfTextToWidth(text, width, fontSize) {
        const source = this._sanitizePdfText(text);
        const limit = Math.max(4, Math.floor(Number(width || 0) / Math.max(1, Number(fontSize || 7.5) * 0.5)) || 4);
        return this._truncatePdfText(source, limit);
    },

    /** @private Return polar points for a regular polygon used by radar chart guide rings. */
    _pdfPolarPoints(cx, cy, radius, sides) {
        const points = [];
        const count = Math.max(3, Number(sides || 3) || 3);
        for (let i = 0; i < count; i++) {
            const angle = (-Math.PI / 2) + (i * Math.PI * 2 / count);
            points.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius });
        }
        return points;
    },

    /** @private Create a PDF writer with page state, vector primitives, and encrypted blob output. */
    _createSecurePdfWriter() {
        const manager = this;
        const pages = [];
        const state = { currentPage: null, pageWidth: 595, pageHeight: 842 };
        const writer = {
            raw: function (op) { if (state.currentPage) state.currentPage.ops.push(String(op || '')); },
            newPage: function (width, height) { state.pageWidth = Number(width || 595) || 595; state.pageHeight = Number(height || 842) || 842; const page = { ops: [] }; pages.push(page); state.currentPage = page; return page; },
            save: function () { writer.raw('q'); },
            restore: function () { writer.raw('Q'); },
            applyGraphicsState: function (name) { writer.raw('/' + String(name || 'GS1') + ' gs'); },
            line: function (x1, y1, x2, y2, options) { const color = options && options.color ? options.color : null; const lineWidth = options && options.lineWidth !== undefined ? options.lineWidth : 0.8; const parts = []; if (color) parts.push(manager._colorOperator(color, false)); parts.push(Number(lineWidth).toFixed(2) + ' w'); parts.push(Number(x1).toFixed(2) + ' ' + Number(y1).toFixed(2) + ' m ' + Number(x2).toFixed(2) + ' ' + Number(y2).toFixed(2) + ' l S'); writer.raw(parts.join('\n')); },
            rect: function (x, y, w, h, options) { const opts = options || {}; const commands = []; if (opts.fill) commands.push(manager._colorOperator(opts.fill, true)); if (opts.stroke) commands.push(manager._colorOperator(opts.stroke, false)); if (opts.lineWidth !== undefined) commands.push(Number(opts.lineWidth).toFixed(2) + ' w'); commands.push(Number(x).toFixed(2) + ' ' + Number(y).toFixed(2) + ' ' + Number(w).toFixed(2) + ' ' + Number(h).toFixed(2) + ' re ' + (opts.fill && opts.stroke ? 'B' : opts.fill ? 'f' : 'S')); writer.raw(commands.join('\n')); },
            circle: function (cx, cy, radius, options) { const pts = []; const steps = 24; for (let i = 0; i < steps; i++) { const angle = (Math.PI * 2 * i) / steps; pts.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius }); } writer.polygon(pts, options); },
            polyline: function (points, options) { const pts = Array.isArray(points) ? points : []; if (!pts.length) return; const opts = options || {}; const commands = []; if (opts.stroke) commands.push(manager._colorOperator(opts.stroke, false)); if (opts.lineWidth !== undefined) commands.push(Number(opts.lineWidth).toFixed(2) + ' w'); commands.push(Number(pts[0].x).toFixed(2) + ' ' + Number(pts[0].y).toFixed(2) + ' m'); for (let i = 1; i < pts.length; i++) commands.push(Number(pts[i].x).toFixed(2) + ' ' + Number(pts[i].y).toFixed(2) + ' l'); commands.push('S'); writer.raw(commands.join('\n')); },
            polygon: function (points, options) { const pts = Array.isArray(points) ? points : []; if (!pts.length) return; const opts = options || {}; const commands = []; if (opts.fill) commands.push(manager._colorOperator(opts.fill, true)); if (opts.stroke) commands.push(manager._colorOperator(opts.stroke, false)); if (opts.lineWidth !== undefined) commands.push(Number(opts.lineWidth).toFixed(2) + ' w'); commands.push(Number(pts[0].x).toFixed(2) + ' ' + Number(pts[0].y).toFixed(2) + ' m'); for (let i = 1; i < pts.length; i++) commands.push(Number(pts[i].x).toFixed(2) + ' ' + Number(pts[i].y).toFixed(2) + ' l'); commands.push('h'); if (opts.fill && opts.stroke) commands.push('B'); else if (opts.fill) commands.push('f'); else commands.push('S'); writer.raw(commands.join('\n')); },
            text: function (x, y, size, value, options) { const opts = options || {}; const font = opts.font || 'F1'; const color = opts.color || [0, 0, 0]; const text = manager._escapePdfText(value); const commands = ['BT', manager._colorOperator(color, true), '/' + font + ' ' + Number(size || 10).toFixed(2) + ' Tf', Number(x).toFixed(2) + ' ' + Number(y).toFixed(2) + ' Td', '(' + text + ') Tj', 'ET']; writer.raw(commands.join('\n')); },
            blob: function () { const objects = []; const catalogObj = 1; const pagesObj = 2; const gStateObj = 3; const fontRegularObj = 4; const fontBoldObj = 5; const fontMonoObj = 6; const pageStartObj = 7; const pageCount = pages.length; const kidRefs = []; const pageObjects = []; for (let i = 0; i < pageCount; i++) { const pageObj = pageStartObj + i * 2; const contentObj = pageObj + 1; kidRefs.push(pageObj + ' 0 R'); pageObjects.push({ pageObj: pageObj, contentObj: contentObj, page: pages[i] }); } objects.push({ id: catalogObj, text: catalogObj + ' 0 obj << /Type /Catalog /Pages ' + pagesObj + ' 0 R >> endobj' }); objects.push({ id: pagesObj, text: pagesObj + ' 0 obj << /Type /Pages /Kids [' + kidRefs.join(' ') + '] /Count ' + pageCount + ' >> endobj' }); objects.push({ id: gStateObj, text: gStateObj + ' 0 obj << /Type /ExtGState /ca 0.08 /CA 0.08 >> endobj' }); objects.push({ id: fontRegularObj, text: fontRegularObj + ' 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj' }); objects.push({ id: fontBoldObj, text: fontBoldObj + ' 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj' }); objects.push({ id: fontMonoObj, text: fontMonoObj + ' 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Courier >> endobj' }); for (let i = 0; i < pageObjects.length; i++) { const entry = pageObjects[i]; const content = entry.page.ops.join('\n'); const resources = '<< /Font << /F1 ' + fontRegularObj + ' 0 R /F2 ' + fontBoldObj + ' 0 R /F3 ' + fontMonoObj + ' 0 R >> /ExtGState << /GS1 ' + gStateObj + ' 0 R >> >>'; objects.push({ id: entry.pageObj, text: entry.pageObj + ' 0 obj << /Type /Page /Parent ' + pagesObj + ' 0 R /MediaBox [0 0 ' + state.pageWidth + ' ' + state.pageHeight + '] /Resources ' + resources + ' /Contents ' + entry.contentObj + ' 0 R >> endobj' }); objects.push({ id: entry.contentObj, text: entry.contentObj + ' 0 obj << /Length ' + content.length + ' >> stream\n' + content + '\nendstream endobj' }); } objects.sort(function (a, b) { return a.id - b.id; }); let pdf = '%PDF-1.4\n'; const offsets = [0]; for (let i = 0; i < objects.length; i++) { offsets.push(pdf.length); pdf += objects[i].text + '\n'; } const xrefOffset = pdf.length; pdf += 'xref\n0 ' + (objects.length + 1) + '\n'; pdf += '0000000000 65535 f \n'; for (let i = 1; i < offsets.length; i++) pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n'; pdf += 'trailer << /Size ' + (objects.length + 1) + ' /Root ' + catalogObj + ' 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF'; return new Blob([pdf], { type: 'application/pdf' }); },
            _colorOperator: function (color, fill) { const input = Array.isArray(color) ? color : [0, 0, 0]; const rgb = [Math.max(0, Math.min(1, Number(input[0] || 0) || 0)), Math.max(0, Math.min(1, Number(input[1] || 0) || 0)), Math.max(0, Math.min(1, Number(input[2] || 0) || 0))]; return rgb.map(function (v) { return Number(v).toFixed(3); }).join(' ') + (fill ? ' rg' : ' RG'); }.bind(this),
        };
        return writer;
    },

    /** @private Create encryption metadata and keys for a standard-security, owner-password protected PDF. */
    _buildPdfEncryptionContext(options) {
        const ownerPassword = this._sanitizePdfText(options && options.ownerPassword ? options.ownerPassword : '');
        const userPassword = this._sanitizePdfText(options && options.userPassword ? options.userPassword : '');
        const fileId = this._sanitizePdfText(options && options.fileId ? options.fileId : this._randomPdfId());
        const permissions = options && options.permissions ? options.permissions : { print: true, modify: false, copy: false, annotate: false };
        const pValue = this._buildPdfPermissionsValue(permissions);
        const userPad = this._pdfPadPassword(userPassword);
        const ownerPad = this._pdfPadPassword(ownerPassword);
        const ownerKey = this._pdfMd5Bytes(ownerPad).slice(0, 5);
        const oValue = this._pdfRc4(ownerKey, userPad);
        const permissionBytes = this._pdfInt32ToBytes(pValue);
        const fileIdBytes = this._asciiBytes(fileId);
        const keyMaterial = new Uint8Array(userPad.length + oValue.length + permissionBytes.length + fileIdBytes.length);
        keyMaterial.set(userPad, 0);
        keyMaterial.set(oValue, userPad.length);
        keyMaterial.set(permissionBytes, userPad.length + oValue.length);
        keyMaterial.set(fileIdBytes, userPad.length + oValue.length + permissionBytes.length);
        const encryptionKey = this._pdfMd5Bytes(keyMaterial).slice(0, 5);
        const uValue = this._pdfRc4(encryptionKey, this._pdfPasswordPadding());
        return { O: this._bytesToHex(oValue), U: this._bytesToHex(uValue), P: pValue, key: encryptionKey, fileId: fileId };
    },

    /** @private Encrypt a PDF content stream using an object-specific RC4 key. */
    _encryptPdfStream(content, encryption, objectNumber) {
        const bytes = this._asciiBytes(String(content || ''));
        const key = this._pdfObjectKey(encryption.key, objectNumber, 0);
        return this._pdfRc4(key, bytes);
    },

    /** @private Derive an object-specific encryption key from the document key and object number. */
    _pdfObjectKey(documentKey, objectNumber, generationNumber) {
        const key = new Uint8Array(documentKey.length + 5);
        key.set(documentKey, 0);
        key[documentKey.length + 0] = objectNumber & 0xFF;
        key[documentKey.length + 1] = (objectNumber >> 8) & 0xFF;
        key[documentKey.length + 2] = (objectNumber >> 16) & 0xFF;
        key[documentKey.length + 3] = generationNumber & 0xFF;
        key[documentKey.length + 4] = (generationNumber >> 8) & 0xFF;
        return this._pdfMd5Bytes(key).slice(0, Math.min(16, documentKey.length + 5));
    },

    /** @private Convert a permissions object into the signed integer required by the PDF standard security handler. */
    _buildPdfPermissionsValue(permissions) {
        const allowPrint = !permissions || permissions.print !== false;
        const allowModify = !!(permissions && permissions.modify);
        const allowCopy = !!(permissions && permissions.copy);
        const allowAnnotate = !!(permissions && permissions.annotate);
        let value = -64;
        if (allowPrint) value |= 0x0004;
        if (allowModify) value |= 0x0008;
        if (allowCopy) value |= 0x0010;
        if (allowAnnotate) value |= 0x0020;
        return value;
    },

    /** @private Pad or truncate a password to the 32-byte PDF standard padding value. */
    _pdfPadPassword(password) {
        const bytes = this._asciiBytes(String(password || ''));
        const pad = this._pdfPasswordPadding();
        const out = new Uint8Array(32);
        const limit = Math.min(32, bytes.length);
        for (let i = 0; i < limit; i++) out[i] = bytes[i];
        for (let j = limit; j < 32; j++) out[j] = pad[j - limit];
        return out;
    },

    /** @private Return the fixed 32-byte password padding defined by the PDF specification. */
    _pdfPasswordPadding() {
        return new Uint8Array([0x28, 0xBF, 0x4E, 0x5E, 0x4E, 0x75, 0x8A, 0x41, 0x64, 0x00, 0x4E, 0x56, 0xFF, 0xFA, 0x01, 0x08, 0x2E, 0x2E, 0x00, 0xB6, 0xD0, 0x68, 0x3E, 0x80, 0x2F, 0x0C, 0xA9, 0xFE, 0x64, 0x53, 0x69, 0x7A]);
    },

    /** @private Encrypt arbitrary bytes with RC4. */
    _pdfRc4(keyBytes, dataBytes) {
        const key = keyBytes instanceof Uint8Array ? keyBytes : new Uint8Array(keyBytes || []);
        const data = dataBytes instanceof Uint8Array ? dataBytes : new Uint8Array(dataBytes || []);
        const s = new Uint8Array(256);
        for (let i = 0; i < 256; i++) s[i] = i;
        let j = 0;
        for (let i = 0; i < 256; i++) { j = (j + s[i] + key[i % key.length]) & 255; const tmp = s[i]; s[i] = s[j]; s[j] = tmp; }
        const out = new Uint8Array(data.length);
        let i = 0;
        j = 0;
        for (let n = 0; n < data.length; n++) { i = (i + 1) & 255; j = (j + s[i]) & 255; const tmp = s[i]; s[i] = s[j]; s[j] = tmp; const k = s[(s[i] + s[j]) & 255]; out[n] = data[n] ^ k; }
        return out;
    },

    /** @private Convert a 32-bit signed integer into little-endian bytes for PDF encryption key derivation. */
    _pdfInt32ToBytes(value) {
        const out = new Uint8Array(4);
        const n = value | 0;
        out[0] = n & 0xFF;
        out[1] = (n >> 8) & 0xFF;
        out[2] = (n >> 16) & 0xFF;
        out[3] = (n >> 24) & 0xFF;
        return out;
    },

    /** @private Return a random PDF password token suitable for the owner password. */
    _randomPdfPassword() { return this._bytesToHex(this._randomBytes(12)); },

    /** @private Return a random 16-byte file identifier for the PDF trailer. */
    _randomPdfId() { return this._bytesToHex(this._randomBytes(16)); },

    /** @private Return cryptographically strong random bytes when available, otherwise a Math.random fallback. */
    _randomBytes(length) {
        const size = Math.max(1, Number(length || 0) || 0);
        const out = new Uint8Array(size);
        if (typeof crypto !== 'undefined' && crypto && typeof crypto.getRandomValues === 'function') { crypto.getRandomValues(out); return out; }
        if (typeof require === 'function') {
            try {
                const nodeCrypto = require('crypto');
                if (nodeCrypto && typeof nodeCrypto.randomBytes === 'function') return new Uint8Array(nodeCrypto.randomBytes(size));
            } catch (e) {
                // fall through
            }
        }
        for (let i = 0; i < size; i++) out[i] = Math.floor(Math.random() * 256);
        return out;
    },

    /** @private Convert a byte array to a hexadecimal string. */
    _bytesToHex(bytes) { let hex = ''; const list = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []); for (let i = 0; i < list.length; i++) hex += ('0' + list[i].toString(16)).slice(-2); return hex.toUpperCase(); },

    /** @private Convert a byte array to a Latin-1 string for raw PDF stream concatenation. */
    _latin1FromBytes(bytes) { const list = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []); let out = ''; for (let i = 0; i < list.length; i++) out += String.fromCharCode(list[i]); return out; },

    /** @private Convert ASCII text into bytes for PDF serialization and encryption. */
    _asciiBytes(text) { const value = this._sanitizePdfText(text); const out = new Uint8Array(value.length); for (let i = 0; i < value.length; i++) out[i] = value.charCodeAt(i) & 0x7F; return out; },

    /** @private Compute an MD5 digest, using native crypto when available and a small fallback otherwise. */
    _pdfMd5Bytes(bytes) {
        const list = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
        if (typeof require === 'function') {
            try {
                const nodeCrypto = require('crypto');
                if (nodeCrypto && typeof nodeCrypto.createHash === 'function') return new Uint8Array(nodeCrypto.createHash('md5').update(Buffer.from(list)).digest());
            } catch (e) {
                // fall through
            }
        }
        return this._md5Fallback(list);
    },

    /** @private Fallback MD5 implementation used only when the host runtime does not provide crypto hashing. */
    _md5Fallback(bytes) {
        const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
        function toWords(input) { const words = []; for (let i = 0; i < input.length; i++) words[i >> 2] |= input[i] << ((i % 4) * 8); words[input.length >> 2] |= 0x80 << ((input.length % 4) * 8); words[(((input.length + 8) >> 6) << 4) + 14] = input.length * 8; return words; }
        function cmn(q, a, b, x, s, t) { a = (a + q + x + t) | 0; return (((a << s) | (a >>> (32 - s))) + b) | 0; }
        function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
        function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
        function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
        function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
        let a = 0x67452301; let b = 0xEFCDAB89; let c = 0x98BADCFE; let d = 0x10325476; const x = toWords(data);
        for (let i = 0; i < x.length; i += 16) {
            const oa = a; const ob = b; const oc = c; const od = d;
            a = ff(a, b, c, d, x[i + 0] || 0, 7, -680876936); d = ff(d, a, b, c, x[i + 1] || 0, 12, -389564586); c = ff(c, d, a, b, x[i + 2] || 0, 17, 606105819); b = ff(b, c, d, a, x[i + 3] || 0, 22, -1044525330);
            a = ff(a, b, c, d, x[i + 4] || 0, 7, -176418897); d = ff(d, a, b, c, x[i + 5] || 0, 12, 1200080426); c = ff(c, d, a, b, x[i + 6] || 0, 17, -1473231341); b = ff(b, c, d, a, x[i + 7] || 0, 22, -45705983);
            a = ff(a, b, c, d, x[i + 8] || 0, 7, 1770035416); d = ff(d, a, b, c, x[i + 9] || 0, 12, -1958414417); c = ff(c, d, a, b, x[i + 10] || 0, 17, -42063); b = ff(b, c, d, a, x[i + 11] || 0, 22, -1990404162);
            a = ff(a, b, c, d, x[i + 12] || 0, 7, 1804603682); d = ff(d, a, b, c, x[i + 13] || 0, 12, -40341101); c = ff(c, d, a, b, x[i + 14] || 0, 17, -1502002290); b = ff(b, c, d, a, x[i + 15] || 0, 22, 1236535329);
            a = gg(a, b, c, d, x[i + 1] || 0, 5, -165796510); d = gg(d, a, b, c, x[i + 6] || 0, 9, -1069501632); c = gg(c, d, a, b, x[i + 11] || 0, 14, 643717713); b = gg(b, c, d, a, x[i + 0] || 0, 20, -373897302);
            a = gg(a, b, c, d, x[i + 5] || 0, 5, -701558691); d = gg(d, a, b, c, x[i + 10] || 0, 9, 38016083); c = gg(c, d, a, b, x[i + 15] || 0, 14, -660478335); b = gg(b, c, d, a, x[i + 4] || 0, 20, -405537848);
            a = gg(a, b, c, d, x[i + 9] || 0, 5, 568446438); d = gg(d, a, b, c, x[i + 14] || 0, 9, -1019803690); c = gg(c, d, a, b, x[i + 3] || 0, 14, -187363961); b = gg(b, c, d, a, x[i + 8] || 0, 20, 1163531501);
            a = gg(a, b, c, d, x[i + 13] || 0, 5, -1444681467); d = gg(d, a, b, c, x[i + 2] || 0, 9, -51403784); c = gg(c, d, a, b, x[i + 7] || 0, 14, 1735328473); b = gg(b, c, d, a, x[i + 12] || 0, 20, -1926607734);
            a = hh(a, b, c, d, x[i + 5] || 0, 4, -378558); d = hh(d, a, b, c, x[i + 8] || 0, 11, -2022574463); c = hh(c, d, a, b, x[i + 11] || 0, 16, 1839030562); b = hh(b, c, d, a, x[i + 14] || 0, 23, -35309556);
            a = hh(a, b, c, d, x[i + 1] || 0, 4, -1530992060); d = hh(d, a, b, c, x[i + 4] || 0, 11, 1272893353); c = hh(c, d, a, b, x[i + 7] || 0, 16, -155497632); b = hh(b, c, d, a, x[i + 10] || 0, 23, -1094730640);
            a = hh(a, b, c, d, x[i + 13] || 0, 4, 681279174); d = hh(d, a, b, c, x[i + 0] || 0, 11, -358537222); c = hh(c, d, a, b, x[i + 3] || 0, 16, -722521979); b = hh(b, c, d, a, x[i + 6] || 0, 23, 76029189);
            a = hh(a, b, c, d, x[i + 9] || 0, 4, -640364487); d = hh(d, a, b, c, x[i + 12] || 0, 11, -421815835); c = hh(c, d, a, b, x[i + 15] || 0, 16, 530742520); b = hh(b, c, d, a, x[i + 2] || 0, 23, -995338651);
            a = ii(a, b, c, d, x[i + 0] || 0, 6, -198630844); d = ii(d, a, b, c, x[i + 7] || 0, 10, 1126891415); c = ii(c, d, a, b, x[i + 14] || 0, 15, -1416354905); b = ii(b, c, d, a, x[i + 5] || 0, 21, -57434055);
            a = ii(a, b, c, d, x[i + 12] || 0, 6, 1700485571); d = ii(d, a, b, c, x[i + 3] || 0, 10, -1894986606); c = ii(c, d, a, b, x[i + 10] || 0, 15, -1051523); b = ii(b, c, d, a, x[i + 1] || 0, 21, -2054922799);
            a = ii(a, b, c, d, x[i + 8] || 0, 6, 1873313359); d = ii(d, a, b, c, x[i + 15] || 0, 10, -30611744); c = ii(c, d, a, b, x[i + 6] || 0, 15, -1560198380); b = ii(b, c, d, a, x[i + 13] || 0, 21, 1309151649);
            a = ii(a, b, c, d, x[i + 4] || 0, 6, -145523070); d = ii(d, a, b, c, x[i + 11] || 0, 10, -1120210379); c = ii(c, d, a, b, x[i + 2] || 0, 15, 718787259); b = ii(b, c, d, a, x[i + 9] || 0, 21, -343485551);
            a = (a + oa) | 0; b = (b + ob) | 0; c = (c + oc) | 0; d = (d + od) | 0;
        }
        const out = new Uint8Array(16); const values = [a, b, c, d]; for (let i = 0; i < values.length; i++) { out[i * 4 + 0] = values[i] & 0xFF; out[i * 4 + 1] = (values[i] >> 8) & 0xFF; out[i * 4 + 2] = (values[i] >> 16) & 0xFF; out[i * 4 + 3] = (values[i] >> 24) & 0xFF; } return out;
    },

    _drawLineSeries(builder, rect, values, minY, maxY) {
        const series = Array.isArray(values) ? values : [];
        if (series.length < 2) return;
        const min = Number(minY || 0);
        const max = Number(maxY || 1);
        const den = Math.max(0.00001, max - min);
        for (let i = 1; i < series.length; i++) {
            const x1 = rect.x + ((i - 1) / (series.length - 1)) * rect.w;
            const x2 = rect.x + (i / (series.length - 1)) * rect.w;
            const y1 = rect.y + rect.h - ((series[i - 1] - min) / den) * rect.h;
            const y2 = rect.y + rect.h - ((series[i] - min) / den) * rect.h;
            builder.line(x1, y1, x2, y2);
        }
    },

    _pdfBuilder() {
        const pages = [[]];
        const push = function (s) { pages[pages.length - 1].push(s); };
        const esc = function (s) {
            return String(s || '')
                .replace(/\\/g, '\\\\')
                .replace(/\(/g, '\\(')
                .replace(/\)/g, '\\)')
                .replace(/[^\x20-\x7E]/g, '?');
        };

        const api = {
            text: function (x, y, size, value) {
                push('BT /F1 ' + Number(size || 10).toFixed(2) + ' Tf ' + Number(x).toFixed(2) + ' ' + Number(y).toFixed(2) + ' Td (' + esc(value) + ') Tj ET');
            },
            line: function (x1, y1, x2, y2) {
                push(Number(x1).toFixed(2) + ' ' + Number(y1).toFixed(2) + ' m ' + Number(x2).toFixed(2) + ' ' + Number(y2).toFixed(2) + ' l S');
            },
            rect: function (x, y, w, h) {
                push(Number(x).toFixed(2) + ' ' + Number(y).toFixed(2) + ' ' + Number(w).toFixed(2) + ' ' + Number(h).toFixed(2) + ' re S');
            },
            newPage: function () {
                pages.push([]);
            },
            blob: function () {
                const objects = [];
                const pageCount = pages.length;
                const catalogObj = 1;
                const pagesObj = 2;
                const pageStartObj = 3;
                const fontObj = pageStartObj + pageCount * 2;

                const kidRefs = [];
                for (let i = 0; i < pageCount; i++) {
                    kidRefs.push((pageStartObj + i * 2) + ' 0 R');
                }

                objects.push(catalogObj + ' 0 obj << /Type /Catalog /Pages ' + pagesObj + ' 0 R >> endobj');
                objects.push(pagesObj + ' 0 obj << /Type /Pages /Kids [' + kidRefs.join(' ') + '] /Count ' + pageCount + ' >> endobj');

                for (let i = 0; i < pageCount; i++) {
                    const pageObj = pageStartObj + i * 2;
                    const contentObj = pageObj + 1;
                    const content = pages[i].join('\n');
                    objects.push(pageObj + ' 0 obj << /Type /Page /Parent ' + pagesObj + ' 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ' + fontObj + ' 0 R >> >> /Contents ' + contentObj + ' 0 R >> endobj');
                    objects.push(contentObj + ' 0 obj << /Length ' + content.length + ' >> stream\n' + content + '\nendstream endobj');
                }
                objects.push(fontObj + ' 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj');

                let pdf = '%PDF-1.4\n';
                const offsets = [0];
                for (let i = 0; i < objects.length; i++) {
                    offsets.push(pdf.length);
                    pdf += objects[i] + '\n';
                }
                const xrefOffset = pdf.length;
                pdf += 'xref\n0 ' + (objects.length + 1) + '\n';
                pdf += '0000000000 65535 f \n';
                for (let i = 1; i < offsets.length; i++) {
                    const off = String(offsets[i]).padStart(10, '0');
                    pdf += off + ' 00000 n \n';
                }
                pdf += 'trailer << /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF';
                return new Blob([pdf], { type: 'application/pdf' });
            },
        };
        return api;
    },

    _buildExcelXmlBlob(report) {
        const sheets = [];
        const stats = report.stats || {};
        const strongest = stats.strongestGameplay || null;
        const weakest = stats.weakestGameplay || null;
        const trend = stats.progressionTrend || null;
        const weakSteps = Array.isArray(stats.weakestSteps) ? stats.weakestSteps : [];
        const daily = Array.isArray(report.daily) ? report.daily : [];
        const latestDay = daily.length ? daily[daily.length - 1] : null;
        const stageLevels = Array.isArray(report.stageLevels) ? report.stageLevels : [];
        const questRows = Array.isArray(report.questRepetitions) ? report.questRepetitions : [];
        const attempts = Array.isArray(report.attemptsRaw) ? report.attemptsRaw : [];
        const makeRow = function (cells, meta) {
            const row = Array.isArray(cells) ? cells.slice() : [cells];
            if (meta) for (const key in meta) row[key] = meta[key];
            return row;
        };
        const scopeStart = report.summary.firstActivityAt ? this._formatLocalDateTime(report.summary.firstActivityAt) : 'No activity in scope';
        const scopeEnd = report.summary.lastActivityAt ? this._formatLocalDateTime(report.summary.lastActivityAt) : 'No activity in scope';
        const dailyDelta = latestDay ? latestDay.learningScoreDelta : 0;
        const recommendation = Number(report.kpi.weightedMastery || 0) >= 75
            ? 'Ready for extension work.'
            : (Number(report.kpi.weightedMastery || 0) >= 50
                ? 'Continue guided practice and review the priority gameplay below.'
                : 'Re-teach the weakest concepts before the learner advances.');
        const dashboardRows = [
            makeRow(['IP2LIVE // TEACHER LEARNING DASHBOARD'], { __style: 'DashboardTitle', __mergeAcross: 7, __height: 38 }),
            makeRow(['Evidence-based review of mastery, repetitions, accuracy, and daily growth'], { __style: 'DashboardSubtitle', __mergeAcross: 7, __height: 24 }),
            makeRow(['Student', report.summary.infiltratorName, 'Generated', this._formatLocalDateTime(report.summary.generatedAt), 'Window', 'Last ' + report.summary.scopeDays + ' days', 'Active days', report.summary.activeDays], { __cellStyles: ['MetaLabel', 'MetaValue', 'MetaLabel', 'MetaValue', 'MetaLabel', 'MetaValue', 'MetaLabel', 'MetaValue'], __height: 23 }),
            makeRow(['First activity', scopeStart, 'Last activity', scopeEnd, 'Sessions', report.summary.sessionsCount, 'Tracked play time', this._ms(report.summary.totalActivePlayMs)], { __cellStyles: ['MetaLabel', 'MetaValue', 'MetaLabel', 'MetaValue', 'MetaLabel', 'MetaValue', 'MetaLabel', 'MetaValue'], __height: 23 }),
            [],
            makeRow(['LEARNING OVERVIEW'], { __style: 'DashboardSection', __mergeAcross: 7, __height: 25 }),
            makeRow(['Gameplay instances', report.kpi.gameplayInstances, 'Assessed attempts', report.kpi.assessedAttempts, 'Quest repetitions', report.kpi.repetitions, 'Internal rounds', report.kpi.totalRounds], { __cellStyles: ['KpiLabel', 'KpiValueBlue', 'KpiLabel', 'KpiValueGreen', 'KpiLabel', 'KpiValuePurple', 'KpiLabel', 'KpiValueAmber'], __height: 34 }),
            makeRow(['Pass rate', report.kpi.completionRate, 'Average accuracy', report.kpi.accuracy, 'Mastery score', report.kpi.weightedMastery / 100, 'Latest daily change', dailyDelta], { __cellStyles: ['KpiLabel', 'KpiPctBlue', 'KpiLabel', 'KpiPctGreen', 'KpiLabel', 'KpiPctPurple', 'KpiLabel', dailyDelta >= 0 ? 'KpiPctGreen' : 'KpiPctRed'], __height: 34 }),
            makeRow(['Passed', report.kpi.completedAttempts, 'Failed', report.kpi.failedAttempts, 'Cancelled / unassessed', report.kpi.cancelledAttempts, 'Active days', report.summary.activeDays], { __cellStyles: ['KpiLabel', 'KpiValueGreen', 'KpiLabel', 'KpiValueRed', 'KpiLabel', 'KpiValueAmber', 'KpiLabel', 'KpiValueBlue'], __height: 34 }),
            [],
            makeRow(['STAGE 1 AND STAGE 2 EVIDENCE'], { __style: 'DashboardSection', __mergeAcross: 7, __height: 25 }),
            makeRow(['Stage / level', 'Instances', 'Repetitions', 'Rounds', 'Pass rate', 'Accuracy', 'Rollbacks', 'Strikes / alerts'], { __style: 'Header', __height: 28 }),
        ];
        const earlyStageRows = stageLevels.filter(function (s) { return s.stageId === 1 || s.stageId === 2; });
        if (!earlyStageRows.length) dashboardRows.push(makeRow(['No Stage 1 or Stage 2 evidence in this report window'], { __style: 'Definition', __mergeAcross: 7, __height: 25 }));
        for (let i = 0; i < earlyStageRows.length; i++) {
            const s = earlyStageRows[i];
            dashboardRows.push(makeRow([s.stageName, s.gameplayInstances, s.repetitions, s.roundsUsed, s.completionRate, s.accuracy, s.rollbackEvents, s.securityStrikes + ' / ' + s.securityAlerts], {
                __cellStyles: ['Label', 'Integer', 'Integer', 'Integer', 'Pct', 'Pct', s.rollbackEvents > 0 ? 'Warn' : 'Body', s.securityAlerts > 0 ? 'Bad' : (s.securityStrikes > 0 ? 'Warn' : 'Body')],
            }));
        }
        dashboardRows.push([], makeRow(['DAILY IMPROVEMENT // MOST RECENT ACTIVE DAYS'], { __style: 'DashboardSection', __mergeAcross: 7, __height: 25 }));
        dashboardRows.push(makeRow(['Date', 'Instances', 'Repetitions', 'Pass rate', 'Accuracy', 'Accuracy change', 'Time improvement', 'Most played gameplay'], { __style: 'Header', __height: 28 }));
        const recentDays = daily.slice(-7);
        if (!recentDays.length) dashboardRows.push(makeRow(['No daily activity in this report window'], { __style: 'Definition', __mergeAcross: 7, __height: 25 }));
        for (let i = 0; i < recentDays.length; i++) {
            const d = recentDays[i];
            dashboardRows.push(makeRow([d.day, d.gamingInstances, d.repetitions, d.completionRate, d.accuracy, d.accuracyDelta, this._signedDuration(d.avgClearImprovementMs), d.mostPlayedGameplay + (d.mostPlayedCount ? ' (' + d.mostPlayedCount + ')' : '')], {
                __cellStyles: ['Date', 'Integer', 'Integer', 'Pct', 'Pct', d.accuracyDelta >= 0 ? 'DeltaGood' : 'DeltaBad', d.avgClearImprovementMs >= 0 ? 'DeltaGood' : 'DeltaBad', 'Body'],
            }));
        }
        dashboardRows.push([], makeRow(['TEACHER INTERPRETATION'], { __style: 'DashboardSection', __mergeAcross: 7, __height: 25 }));
        dashboardRows.push(makeRow(['Strongest gameplay', strongest ? strongest.gameplayLabel : 'Insufficient evidence', 'Accuracy', strongest ? strongest.accuracyRate : 0, 'Priority gameplay', weakest ? weakest.gameplayLabel : 'Insufficient evidence', 'Accuracy', weakest ? weakest.accuracyRate : 0], { __cellStyles: ['MetaLabel', 'Good', 'MetaLabel', 'Pct', 'MetaLabel', weakest ? 'Warn' : 'Body', 'MetaLabel', 'Pct'], __height: 26 }));
        dashboardRows.push(makeRow(['Overall trend', trend ? trend.direction : 'baseline', 'Session change', trend ? trend.deltaAccuracyRate : 0, 'Most repeated issue', weakSteps.length ? weakSteps[0].stepLabel : 'No repeated issue', 'Mistakes', weakSteps.length ? weakSteps[0].totalMistakes : 0], { __cellStyles: ['MetaLabel', trend && trend.direction === 'improving' ? 'Good' : (trend && trend.direction === 'declining' ? 'Bad' : 'Warn'), 'MetaLabel', trend && trend.deltaAccuracyRate >= 0 ? 'DeltaGood' : 'DeltaBad', 'MetaLabel', weakSteps.length ? 'Warn' : 'Body', 'MetaLabel', 'Integer'], __height: 26 }));
        dashboardRows.push(makeRow(['Teacher recommendation: ' + recommendation], { __style: 'TeacherNote', __mergeAcross: 7, __height: 32 }));
        dashboardRows.push(makeRow([report.performanceSummary || 'No assessed gameplay is available in this report window.'], { __style: 'TeacherNote', __mergeAcross: 7, __height: 58 }));
        dashboardRows.push(makeRow(['Definitions: an instance is one gameplay launch-to-exit event; assessed attempts exclude cancellations; rounds are chances used inside an instance; repetitions are launches after the first launch of the same quest/objective.'], { __style: 'Definition', __mergeAcross: 7, __height: 48 }));
        sheets.push({ name: 'Teacher Dashboard', rows: dashboardRows, widths: [126, 86, 126, 86, 126, 86, 145, 115], frozenRows: 4 });

        sheets.push({
            name: 'Daily Progress',
            frozenRows: 1,
            rows: [['Date', 'First Play', 'Last Play', 'Sessions', 'Gameplay Instances', 'Assessed', 'Passed', 'Failed', 'Cancelled', 'Repetitions', 'Rounds Used', 'Retries', 'Mistakes', 'Pass Rate', 'Accuracy', 'Accuracy Change', 'Learning Change', 'Avg Time', 'Time Improvement', 'Stage / Level Coverage', 'Most Played Gameplay']].concat(daily.map(function (d) {
                return [d.day, d.firstActivityTime, d.lastActivityTime, d.sessions, d.gamingInstances, d.assessedAttempts, d.passed, d.failed, d.cancelled, d.repetitions, d.roundsUsed, d.retries, d.mistakes, d.completionRate, d.accuracy, d.accuracyDelta, d.learningScoreDelta, IP2LiveReportManager._ms(d.avgClearMs), IP2LiveReportManager._signedDuration(d.avgClearImprovementMs), d.stageLevelCoverage, d.mostPlayedGameplay + (d.mostPlayedCount ? ' (' + d.mostPlayedCount + ')' : '')];
            })),
        });

        sheets.push({
            name: 'Attempt History',
            frozenRows: 1,
            rows: [['Instance #', 'Date', 'Time', 'Timestamp ISO', 'Session ID', 'Session Instance #', 'Stage', 'Level', 'Map', 'Stage / Level', 'Quest Order', 'Quest ID', 'Quest Label', 'Objective ID', 'Gameplay ID', 'Gameplay Played', 'Mode', 'Quest Repetition #', 'Gameplay Repetition #', 'Repeated?', 'Outcome', 'Rounds Used', 'Round Limit', 'Retries', 'Mistakes', 'Accuracy', 'Duration', 'Started At', 'Ended At', 'Failure Reason', 'Recovery / Rollback', 'Security Strike', 'Security Alert?', 'Rollback Quest', 'Evidence Payload']].concat(attempts.map(function (a) {
                return [a.instanceNumber, a.date, a.time, a.timestampIso, a.sessionId, a.sessionInstanceNumber, a.stageId, a.levelId, a.mapId, a.stageLevel, a.questSequence, a.questId, a.questLabel, a.objectiveId, a.gameplayId, a.gameplayLabel, a.mode, a.questRepetitionNumber, a.gameplayRepetitionNumber, a.isRepetition ? 'YES' : 'NO', String(a.outcome || '').toUpperCase(), a.roundsUsed, a.maxAttempts, a.retries, a.mistakeCount, a.accuracy, IP2LiveReportManager._ms(a.durationMs), IP2LiveReportManager._formatLocalDateTime(a.startedAt), IP2LiveReportManager._formatLocalDateTime(a.endedAt), a.failureReason || '', a.recoveryAction || '', a.securityStrikeCount, a.securityTriggered ? 'YES' : 'NO', a.rollbackQuestId || '', IP2LiveReportManager._stringifyCell(a.payload || {})];
            })),
        });

        sheets.push({
            name: 'Quest Repetitions',
            frozenRows: 1,
            rows: [['Stage', 'Level', 'Map', 'Stage Name', 'Quest Order', 'Quest ID', 'Quest Label', 'Objective ID', 'Gameplay ID', 'Gameplay Played', 'Mode', 'Gameplay Instances', 'Repetitions', 'Assessed', 'Passed', 'Failed', 'Cancelled', 'Rounds Used', 'Retries', 'Mistakes', 'Pass Rate', 'Average Accuracy', 'First Accuracy', 'Latest Accuracy', 'Accuracy Improvement', 'Average Duration', 'Time Improvement', 'Longest Failure Streak', 'Security Strikes', 'Security Alerts', 'First Attempt', 'Last Attempt', 'Teacher Status']].concat(questRows.map(function (q) {
                return [q.stageId, q.levelId, q.mapId, q.stageName, q.questSequence, q.questId, q.questLabel, q.objectiveId, q.gameplayId, q.gameplayLabel, q.mode, q.gameplayInstances, q.repetitions, q.assessedAttempts, q.passed, q.failed, q.cancelled, q.roundsUsed, q.retries, q.mistakes, q.completionRate, q.averageAccuracy, q.firstAccuracy, q.latestAccuracy, q.accuracyImprovement, IP2LiveReportManager._ms(q.averageDurationMs), IP2LiveReportManager._signedDuration(q.timeImprovementMs), q.longestFailureStreak, q.securityStrikes, q.securityAlerts, IP2LiveReportManager._formatLocalDateTime(q.firstAttemptAt), IP2LiveReportManager._formatLocalDateTime(q.lastAttemptAt), q.status];
            })),
        });

        sheets.push({
            name: 'Stage and Level',
            frozenRows: 1,
            rows: [['Stage', 'Level', 'Map', 'Stage Name', 'Gameplay Instances', 'Assessed', 'Passed', 'Failed', 'Cancelled', 'Repetitions', 'Rounds Used', 'Retries', 'Mistakes', 'Pass Rate', 'Accuracy', 'Average Time', 'Total Time', 'Unique Gameplays', 'Gameplays Played', 'Unique Quests', 'Rollback Events', 'Security Strikes', 'Security Alerts', 'First Activity', 'Last Activity']].concat(stageLevels.map(function (s) {
                return [s.stageId, s.levelId, s.mapId, s.stageName, s.gameplayInstances, s.assessedAttempts, s.passed, s.failed, s.cancelled, s.repetitions, s.roundsUsed, s.retries, s.mistakes, s.completionRate, s.accuracy, IP2LiveReportManager._ms(s.avgTimeOnTaskMs), IP2LiveReportManager._ms(s.totalTimeOnTaskMs), s.gameplayCount, s.gameplays, s.questCount, s.rollbackEvents, s.securityStrikes, s.securityAlerts, IP2LiveReportManager._formatLocalDateTime(s.firstActivityAt), IP2LiveReportManager._formatLocalDateTime(s.lastActivityAt)];
            })),
        });

        const gameplayRows = [['Gameplay ID', 'Gameplay Played', 'Competency', 'Gameplay Instances', 'Assessed', 'Passed', 'Failed', 'Cancelled', 'Repetitions', 'Rounds Used', 'Retries', 'Mistakes', 'Pass Rate', 'Average Accuracy', 'Average Time', 'Median Time']];
        const gameplayIds = Object.keys(report.perGameplay || {});
        for (let i = 0; i < gameplayIds.length; i++) {
            const g = report.perGameplay[gameplayIds[i]];
            gameplayRows.push([g.gameplayId, g.gameplayLabel, g.competencyLabel || '', g.attempts, g.assessedAttempts, g.passed, g.failed, g.cancelled, g.repetitions, g.roundsUsed, g.retries, g.mistakes, g.assessedAttempts ? g.passed / g.assessedAttempts : 0, g.avgAccuracy, this._ms(g.avgClearMs), this._ms(g.medianClearMs)]);
        }
        sheets.push({ name: 'Gameplay Summary', frozenRows: 1, rows: gameplayRows });

        const competencyRows = [['Competency', 'Teacher Status', 'Score', 'Confidence', 'Assessed Attempts', 'Accuracy', 'Pass Rate', 'Mistake Rate', 'Median Time', 'Retries', 'Recommended Intervention']];
        for (let i = 0; i < report.competencies.length; i++) {
            const c = report.competencies[i];
            competencyRows.push([c.competencyLabel, c.status, c.score, c.confidence, c.attempts, c.accuracy, c.completionRate, c.mistakeRate, this._ms(c.medianClearMs), c.retries, c.interventionHint]);
        }
        sheets.push({ name: 'Competency Evidence', frozenRows: 1, rows: competencyRows });

        const stepRows = [['Gameplay ID', 'Gameplay Played', 'Competency', 'Step Key', 'Step / Skill', 'Total Mistakes', 'Affected Attempts', 'Try Events', 'Gameplay Attempts', 'Mistake Rate', 'Top Issue', 'Concern', 'Examples']];
        const stepAnalysis = Array.isArray(report.stepAnalysis) ? report.stepAnalysis : [];
        for (let i = 0; i < stepAnalysis.length; i++) {
            const s = stepAnalysis[i];
            stepRows.push([s.gameplayId, s.gameplayLabel, s.competencyLabel, s.stepKey, s.stepLabel, s.totalMistakes, s.affectedAttempts, s.tryEvents, s.gameplayAttempts, s.mistakeRate, s.topIssue, s.status, s.examples]);
        }
        sheets.push({ name: 'Mistake Analysis', frozenRows: 1, rows: stepRows });

        const tryRows = [['Date', 'Time', 'Session ID', 'Attempt ID', 'Gameplay ID', 'Gameplay Played', 'Try Number', 'Attempts Remaining', 'Step Key', 'Step / Skill', 'Issue Type', 'Submitted', 'Expected', 'Detail', 'Map', 'Stage', 'Level', 'Quest ID', 'Objective ID']];
        const mistakes = Array.isArray(report.attemptMistakes) ? report.attemptMistakes : [];
        for (let i = 0; i < mistakes.length; i++) {
            const m = mistakes[i];
            const meta = this._resolveStageMeta(m.mapId, m.stageId, m.levelId, null);
            tryRows.push([this._dayKey(m.timestamp), this._formatLocalTime(m.timestamp), m.sessionId, m.attemptId, m.gameplayId, m.gameplayLabel, m.tryNumber, m.attemptsRemaining, m.stepKey, m.stepLabel, m.issueType, m.submitted, m.expected, m.detail, m.mapId, meta.stageId, meta.levelId, m.questId, m.objectiveId]);
        }
        sheets.push({ name: 'Try Mistakes', frozenRows: 1, rows: tryRows });

        const auditRows = [[
            'Event ID', 'Timestamp', 'Event Type', 'Profile ID', 'Student', 'Session ID',
            'Attempt ID', 'Sequence', 'Gameplay ID', 'Stage', 'Level', 'Map', 'Quest ID',
            'Objective ID', 'Outcome', 'Passed?', 'Cancelled?', 'Duration', 'Retries',
            'Mistake Count', 'Integrity SHA-256', 'Notes', 'Complete Event JSON'
        ]];
        const auditRecords = report.eventAudit && Array.isArray(report.eventAudit.records)
            ? report.eventAudit.records
            : [];
        for (let i = 0; i < auditRecords.length; i++) {
            const row = auditRecords[i] || {};
            auditRows.push([
                row.eventId || '',
                this._formatLocalDateTime(row.timestamp),
                row.eventType || '',
                row.profileId || '',
                row.infiltratorName || '',
                row.sessionId || '',
                row.attemptId || '',
                Number(row.sequence || 0) || 0,
                row.gameplayId || '',
                Number(row.stageId || 0) || 0,
                Number(row.levelId || 0) || 0,
                Number(row.mapId || 0) || 0,
                row.questId || '',
                row.objectiveId || '',
                row.outcome || '',
                row.passed === null || row.passed === undefined ? '' : (row.passed ? 'YES' : 'NO'),
                row.cancelled ? 'YES' : 'NO',
                this._ms(row.durationMs),
                Number(row.retries || 0) || 0,
                Number(row.mistakeCount || 0) || 0,
                row.integrity && row.integrity.value || '',
                row.notes || '',
                this._stringifyCell(row),
            ]);
        }
        sheets.push({ name: 'Event Audit', frozenRows: 1, rows: auditRows });

        sheets.push({
            name: 'Report Metadata',
            frozenRows: 1,
            rows: [
                ['Field', 'Value', 'Meaning'],
                ['Student', report.summary.infiltratorName, 'Profile included in this workbook'],
                ['Generated', this._formatLocalDateTime(report.summary.generatedAt), 'Local date and time of export'],
                ['Scope', 'Last ' + report.summary.scopeDays + ' days', 'Telemetry window selected during export'],
                ['Gameplay Instances', report.kpi.gameplayInstances, 'Launch-to-exit gameplay events, including cancellations'],
                ['Assessed Attempts', report.kpi.assessedAttempts, 'Passed or failed instances; cancellations are excluded'],
                ['Quest Repetitions', report.kpi.repetitions, 'Instances beyond the first launch of the same stage, level, quest, objective, and gameplay'],
                ['Internal Rounds', report.kpi.totalRounds, 'Total chances or rounds used inside gameplay instances'],
                ['Completion Rate', report.kpi.completionRate, 'Passed assessed attempts divided by all assessed attempts'],
                ['Accuracy', report.kpi.accuracy, 'Gameplay-specific accuracy weighted by rounds used'],
                ['Latest Daily Improvement', dailyDelta, 'Combined accuracy/pass-rate change from the previous active day'],
                ['Workbook Version', report.version, 'Report data contract version'],
            ],
        });

        const xml = this._spreadsheetXml(sheets);
        return new Blob([xml], { type: 'application/vnd.ms-excel' });
    },

    _buildLegacyExcelXmlBlob(report) {
        const sheets = [];
        const dStrongest = report.stats && report.stats.strongestGameplay ? report.stats.strongestGameplay : null;
        const dWeakest = report.stats && report.stats.weakestGameplay ? report.stats.weakestGameplay : null;
        const dTrend = report.stats && report.stats.progressionTrend ? report.stats.progressionTrend : null;
        const dSteps = report.stats && Array.isArray(report.stats.weakestSteps) ? report.stats.weakestSteps : [];
        const makeRow = function (cells, meta) {
            const row = Array.isArray(cells) ? cells.slice() : [cells];
            if (meta) {
                for (const key in meta) row[key] = meta[key];
            }
            return row;
        };
        sheets.push({
            name: 'Dashboard',
            rows: [
                makeRow(['IP2Live Progress Report'], { __style: 'Title', __mergeAcross: 3, __height: 30 }),
                makeRow(['Formal telemetry progress report'], { __style: 'Note', __mergeAcross: 3, __height: 20 }),
                makeRow(['Student', report.summary.infiltratorName, 'Generated', new Date(report.summary.generatedAt).toISOString()], { __style: 'Section', __height: 20 }),
                makeRow(['Scope', 'Last ' + report.summary.scopeDays + ' days', 'Sessions', report.summary.sessionsCount], { __height: 19 }),
                [],
                makeRow(['KPI', 'Value', 'Visual', 'Signal'], { __style: 'Header', __height: 22 }),
                makeRow(['Attempts', report.kpi.attempts, this._excelBar(Math.min(1, Number(report.kpi.attempts || 0) / 20), 1, 18), 'Total completed gameplay attempts'], { __height: 20 }),
                makeRow(['Completion Rate', report.kpi.completionRate, this._excelBar(report.kpi.completionRate, 1, 18), 'Final pass rate'], { __height: 20 }),
                makeRow(['Accuracy', report.kpi.accuracy, this._excelBar(report.kpi.accuracy, 1, 18), 'Weighted by attempts used'], { __height: 20 }),
                makeRow(['Weighted Mastery', report.kpi.weightedMastery, this._excelBar(report.kpi.weightedMastery, 100, 18), 'Overall mastery score'], { __height: 20 }),
                [],
                makeRow(['Insights'], { __style: 'Section', __mergeAcross: 3, __height: 24 }),
                makeRow(['Type', 'Label', 'Value', 'Details'], { __style: 'Header', __height: 22 }),
                makeRow(['Strength', dStrongest ? dStrongest.gameplayLabel : 'No gameplay data', dStrongest ? dStrongest.accuracyRate : '', 'Most consistent gameplay area'], { __height: 20 }),
                makeRow(['Weakness', dWeakest ? dWeakest.gameplayLabel : 'No gameplay data', dWeakest ? dWeakest.accuracyRate : '', 'Lowest-performing gameplay area'], { __height: 20 }),
                makeRow(['Trend', dTrend ? dTrend.direction : 'plateau', dTrend ? dTrend.deltaAccuracyRate : '', 'Accuracy delta across sessions'], { __height: 20 }),
                makeRow(['Top Step Issue', dSteps.length ? dSteps[0].stepLabel : 'No step pattern yet', dSteps.length ? dSteps[0].totalMistakes : '', dSteps.length ? dSteps[0].gameplayLabel : 'Collect more try-level mistakes'], { __height: 20 }),
                [],
                makeRow(['Performance Summary'], { __style: 'Section', __mergeAcross: 3, __height: 24 }),
                makeRow([report.performanceSummary || ''], { __style: 'Note', __mergeAcross: 3, __height: 44 }),
            ],
        });
        sheets.push({
            name: 'Summary',
            rows: [
                ['Student', report.summary.infiltratorName],
                ['GeneratedAt', new Date(report.summary.generatedAt).toISOString()],
                ['ScopeDays', report.summary.scopeDays],
                ['Sessions', report.summary.sessionsCount],
                ['TotalActivePlayMs', report.summary.totalActivePlayMs],
                ['PerformanceSummary', report.performanceSummary || ''],
                ['Attempts', report.kpi.attempts],
                ['CompletionRate', report.kpi.completionRate],
                ['Accuracy', report.kpi.accuracy],
                ['AvgClearMs', report.kpi.avgClearMs],
                ['MedianClearMs', report.kpi.medianClearMs],
                ['BestClearMs', report.kpi.bestClearMs],
                ['ConsistencyStdMs', report.kpi.consistencyStdMs],
                ['WeightedMastery', report.kpi.weightedMastery],
            ],
        });

        const insightRows = [['Type', 'Label', 'Value', 'Details']];
        const strongest = dStrongest;
        const weakest = dWeakest;
        const trend = dTrend;
        const patterns = report.stats && Array.isArray(report.stats.errorPatterns) ? report.stats.errorPatterns : [];
        if (strongest) insightRows.push(['Strength', strongest.gameplayLabel, strongest.accuracyRate, 'Most consistent gameplay area']);
        if (weakest) insightRows.push(['Weakness', weakest.gameplayLabel, weakest.accuracyRate, 'Lowest-performing gameplay area']);
        if (trend) insightRows.push(['Trend', trend.direction, trend.deltaAccuracyRate, 'Accuracy delta between the first and second half of sessions']);
        if (patterns.length) insightRows.push(['ErrorPattern', patterns[0].gameplayLabel, patterns[0].longestFailureStreak, 'Repeated failure on stage ' + patterns[0].stageId]);
        sheets.push({ name: 'Insights', rows: insightRows });

        const compRows = [['Competency', 'Status', 'Score', 'Confidence', 'Attempts', 'Accuracy', 'CompletionRate', 'MistakeRate', 'MedianClearMs', 'InterventionHint']];
        for (let i = 0; i < report.competencies.length; i++) {
            const c = report.competencies[i];
            compRows.push([c.competencyLabel, c.status, c.score, c.confidence, c.attempts, c.accuracy, c.completionRate, c.mistakeRate, c.medianClearMs, c.interventionHint]);
        }
        sheets.push({ name: 'Competencies', rows: compRows });

        const gameplayRows = [['GameplayId', 'GameplayLabel', 'ModuleKey', 'Type', 'Attempts', 'Correct', 'Incorrect', 'AccuracyRate', 'AccuracyBar', 'CompletionRate', 'CompletionBar', 'AvgTimeOnTaskMs', 'SessionCount', 'StageCount']];
        const gameplayStats = report.stats && Array.isArray(report.stats.byGameplay) ? report.stats.byGameplay : [];
        for (let i = 0; i < gameplayStats.length; i++) {
            const g = gameplayStats[i];
            gameplayRows.push([g.gameplayId, g.gameplayLabel, g.moduleKey, g.isTutorial ? 'tutorial' : 'gameplay', g.attempts, g.correctAttempts, g.incorrectAttempts, g.accuracyRate, this._excelBar(g.accuracyRate, 1, 16), g.completionRate, this._excelBar(g.completionRate, 1, 16), g.avgTimeOnTaskMs, g.sessionCount, g.stageCount]);
        }
        sheets.push({ name: 'Gameplay Stats', rows: gameplayRows });

        const stageRows = [['StageId', 'Attempts', 'Correct', 'Incorrect', 'CompletionRate', 'AccuracyRate', 'AvgTimeOnTaskMs', 'GameplayCount']];
        const stageStats = report.stats && Array.isArray(report.stats.byStage) ? report.stats.byStage : [];
        for (let i = 0; i < stageStats.length; i++) {
            const s = stageStats[i];
            stageRows.push([s.stageId, s.attempts, s.correctAttempts, s.incorrectAttempts, s.completionRate, s.accuracyRate, s.avgTimeOnTaskMs, s.gameplayCount]);
        }
        sheets.push({ name: 'Stage Stats', rows: stageRows });

        const moduleRows = [['Module', 'Tutorial Attempts', 'Tutorial Accuracy', 'Tutorial AvgTimeOnTaskMs', 'Gameplay Attempts', 'Gameplay Accuracy', 'Gameplay AvgTimeOnTaskMs', 'Accuracy Delta', 'Time Delta']];
        const moduleStats = report.stats && Array.isArray(report.stats.byModule) ? report.stats.byModule : [];
        for (let i = 0; i < moduleStats.length; i++) {
            const m = moduleStats[i];
            moduleRows.push([m.moduleLabel, m.tutorial.attempts, m.tutorial.accuracyRate, m.tutorial.avgTimeOnTaskMs, m.gameplay.attempts, m.gameplay.accuracyRate, m.gameplay.avgTimeOnTaskMs, m.deltaAccuracyRate, m.deltaTimeOnTaskMs]);
        }
        sheets.push({ name: 'Module Compare', rows: moduleRows });

        const dailyRows = [['Day', 'Attempts', 'Passed', 'Failed', 'CompletionRate', 'Accuracy', 'AccuracyBar', 'AvgClearMs']];
        for (let i = 0; i < report.daily.length; i++) {
            const d = report.daily[i];
            dailyRows.push([d.day, d.attempts, d.passed, d.failed, d.completionRate, d.accuracy, this._excelBar(d.accuracy, 1, 16), d.avgClearMs]);
        }
        sheets.push({ name: 'Daily Trends', rows: dailyRows });

        const pgRows = [['GameplayId', 'GameplayLabel', 'Attempts', 'Passed', 'Failed', 'AvgAccuracy', 'AvgClearMs', 'MedianClearMs', 'Retries', 'Mistakes']];
        const pgKeys = Object.keys(report.perGameplay || {});
        for (let i = 0; i < pgKeys.length; i++) {
            const g = report.perGameplay[pgKeys[i]];
            pgRows.push([g.gameplayId, g.gameplayLabel, g.attempts, g.passed, g.failed, g.avgAccuracy, g.avgClearMs, g.medianClearMs, g.retries, g.mistakes]);
        }
        sheets.push({ name: 'Gameplay Details', rows: pgRows });

        const mistakeRows = [['GameplayId', 'IssueKey', 'Count']];
        for (let i = 0; i < pgKeys.length; i++) {
            const g = report.perGameplay[pgKeys[i]];
            const mapping = g.wrongClassMappings || {};
            const mk = Object.keys(mapping);
            for (let j = 0; j < mk.length; j++) {
                mistakeRows.push([g.gameplayId, mk[j], mapping[mk[j]]]);
            }
            const slots = g.slotWrongFrequency || {};
            const sk = Object.keys(slots);
            for (let s = 0; s < sk.length; s++) {
                mistakeRows.push([g.gameplayId, 'slot:' + sk[s], slots[sk[s]]]);
            }
        }
        sheets.push({ name: 'Mistake Breakdown', rows: mistakeRows });

        const stepRows = [['GameplayId', 'GameplayLabel', 'Competency', 'StepKey', 'StepLabel', 'TotalMistakes', 'MistakeBar', 'AffectedAttempts', 'TryEvents', 'GameplayAttempts', 'MistakeRate', 'TopIssue', 'Concern', 'Examples']];
        const stepAnalysis = Array.isArray(report.stepAnalysis) ? report.stepAnalysis : [];
        const maxStepMistakes = stepAnalysis.reduce(function (max, row) { return Math.max(max, Number(row.totalMistakes || 0) || 0); }, 1);
        for (let i = 0; i < stepAnalysis.length; i++) {
            const s = stepAnalysis[i];
            stepRows.push([s.gameplayId, s.gameplayLabel, s.competencyLabel, s.stepKey, s.stepLabel, s.totalMistakes, this._excelBar(s.totalMistakes, maxStepMistakes, 16), s.affectedAttempts, s.tryEvents, s.gameplayAttempts, s.mistakeRate, s.topIssue, s.status, s.examples]);
        }
        sheets.push({ name: 'Step Analysis', rows: stepRows });

        const tryRows = [['Timestamp', 'SessionId', 'AttemptId', 'GameplayId', 'GameplayLabel', 'TryNumber', 'AttemptsRemaining', 'StepKey', 'StepLabel', 'IssueType', 'Submitted', 'Expected', 'Detail', 'MapId', 'StageId', 'LevelId', 'QuestId', 'ObjectiveId']];
        const attemptMistakes = Array.isArray(report.attemptMistakes) ? report.attemptMistakes : [];
        for (let i = 0; i < attemptMistakes.length; i++) {
            const m = attemptMistakes[i];
            tryRows.push([m.timestamp, m.sessionId, m.attemptId, m.gameplayId, m.gameplayLabel, m.tryNumber, m.attemptsRemaining, m.stepKey, m.stepLabel, m.issueType, m.submitted, m.expected, m.detail, m.mapId, m.stageId, m.levelId, m.questId, m.objectiveId]);
        }
        sheets.push({ name: 'Try Mistakes', rows: tryRows });

        const rawRows = [['Timestamp', 'SessionId', 'AttemptId', 'GameplayId', 'Passed', 'DurationMs', 'Accuracy', 'MistakeCount', 'Retries', 'MapId', 'StageId', 'LevelId']];
        for (let i = 0; i < report.attemptsRaw.length; i++) {
            const a = report.attemptsRaw[i];
            rawRows.push([a.timestamp, a.sessionId, a.attemptId, a.gameplayId, a.passed ? 1 : 0, a.durationMs, a.accuracy, a.mistakeCount, a.retries, a.mapId, a.stageId, a.levelId]);
        }
        sheets.push({ name: 'Attempts Raw', rows: rawRows });

        const groupedRows = [['StageId', 'LevelId', 'GameplayId', 'GameplayLabel', 'Attempts', 'Wins', 'Wrongs', 'Mistakes', 'Retries', 'AvgAccuracy', 'AvgClearMs', 'LastAttemptAt']];
        const grouped = Array.isArray(report.attemptSummary) ? report.attemptSummary : [];
        for (let i = 0; i < grouped.length; i++) {
            const g = grouped[i];
            groupedRows.push([
                g.stageId,
                g.levelId,
                g.gameplayId,
                g.gameplayLabel,
                g.attempts,
                g.wins,
                g.wrongs,
                g.mistakes,
                g.retries,
                g.accuracy,
                g.avgClearMs,
                g.lastAttemptTs,
            ]);
        }
        sheets.push({ name: 'Attempts By Stage', rows: groupedRows });

        const xml = this._spreadsheetXml(sheets);
        return new Blob([xml], { type: 'application/vnd.ms-excel' });
    },

    _excelBar(value, max, width) {
        const resolvedMax = Math.max(0.0001, Number(max || 1) || 1);
        const resolvedWidth = Math.max(6, Number(width || 16) || 16);
        const ratio = Math.max(0, Math.min(1, (Number(value || 0) || 0) / resolvedMax));
        const filled = Math.round(ratio * resolvedWidth);
        return '[' + '#'.repeat(filled) + '.'.repeat(Math.max(0, resolvedWidth - filled)) + ']';
    },

    _spreadsheetXml(sheets) {
        const esc = this._xmlEscape;
        const header = '<?xml version="1.0"?>'
            + '<?mso-application progid="Excel.Sheet"?>'
            + '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"'
            + ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"'
            + ' xmlns:x="urn:schemas-microsoft-com:office:excel">'
            + this._excelWorkbookStyles();
        let body = '';
        for (let i = 0; i < sheets.length; i++) {
            const s = sheets[i];
            body += '<Worksheet ss:Name="' + esc(s.name || ('Sheet' + (i + 1))) + '"><Table>';
            const rows = Array.isArray(s.rows) ? s.rows : [];
            const widths = Array.isArray(s.widths) && s.widths.length ? s.widths : this._excelColumnWidths(rows);
            for (let w = 0; w < widths.length; w++) {
                body += '<Column ss:AutoFitWidth="0" ss:Width="' + widths[w] + '"/>';
            }
            for (let r = 0; r < rows.length; r++) {
                const row = Array.isArray(rows[r]) ? rows[r] : [rows[r]];
                const rowHeight = this._excelRowHeight(row, r, s.name);
                const mergeAcross = Number(row.__mergeAcross || 0) || 0;
                const rowStyle = row.__style || '';
                const cellStyles = Array.isArray(row.__cellStyles) ? row.__cellStyles : [];
                body += '<Row' + (rowHeight ? ' ss:Height="' + rowHeight + '"' : '') + '>';
                if (mergeAcross > 0) {
                    const mergedValue = row[0];
                    const mergedStyle = rowStyle || this._excelStyleForCell(s.name || '', r, 0, mergedValue, rows);
                    const mergedNum = typeof mergedValue === 'number' && Number.isFinite(mergedValue);
                    body += '<Cell ss:StyleID="' + mergedStyle + '" ss:MergeAcross="' + mergeAcross + '"><Data ss:Type="' + (mergedNum ? 'Number' : 'String') + '">' + esc(mergedValue === null || mergedValue === undefined ? '' : mergedValue) + '</Data></Cell>';
                } else {
                    for (let c = 0; c < row.length; c++) {
                        const v = row[c];
                        const isNum = typeof v === 'number' && Number.isFinite(v);
                        const style = cellStyles[c] || this._excelStyleForCell(s.name || '', r, c, v, rows);
                        body += '<Cell ss:StyleID="' + style + '"><Data ss:Type="' + (isNum ? 'Number' : 'String') + '">' + esc(v === null || v === undefined ? '' : v) + '</Data></Cell>';
                    }
                }
                body += '</Row>';
            }
            const frozenRows = Math.max(0, Number(s.frozenRows === undefined ? 1 : s.frozenRows) || 0);
            body += '</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">'
                + (i === 0 ? '<Selected/>' : '')
                + '<PageSetup><Layout x:Orientation="Landscape"/></PageSetup>'
                + '<Zoom>85</Zoom>'
                + (frozenRows > 0 ? '<FreezePanes/><FrozenNoSplit/><SplitHorizontal>' + frozenRows + '</SplitHorizontal><TopRowBottomPane>' + frozenRows + '</TopRowBottomPane>' : '')
                + '<ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios>'
                + '</WorksheetOptions></Worksheet>';
        }
        return header + body + '</Workbook>';
    },

    _excelWorkbookStyles() {
        return '<Styles>'
            + '<Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Aptos" ss:Size="10" ss:Color="#1F2933"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/></Style>'
            + '<Style ss:ID="Title"><Font ss:FontName="Aptos Display" ss:Size="18" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1F87D0" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Left"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#145A8D"/></Borders></Style>'
            + '<Style ss:ID="Section"><Font ss:FontName="Aptos" ss:Size="11" ss:Bold="1" ss:Color="#0B1F33"/><Interior ss:Color="#DCEEFF" ss:Pattern="Solid"/><Alignment ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#7CB8E6"/></Borders></Style>'
            + '<Style ss:ID="Header"><Font ss:FontName="Aptos" ss:Size="10" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0B5FA5" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#084778"/></Borders></Style>'
            + '<Style ss:ID="Label"><Font ss:FontName="Aptos" ss:Size="10" ss:Bold="1" ss:Color="#344054"/><Interior ss:Color="#F3F8FD" ss:Pattern="Solid"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="0.5" ss:Color="#D8E5F3"/></Borders></Style>'
            + '<Style ss:ID="Body"><Font ss:FontName="Aptos" ss:Size="10" ss:Color="#1F2933"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/><Alignment ss:Vertical="Top" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="0.5" ss:Color="#E6EDF5"/></Borders></Style>'
            + '<Style ss:ID="Zebra"><Font ss:FontName="Aptos" ss:Size="10" ss:Color="#1F2933"/><Interior ss:Color="#F7FBFF" ss:Pattern="Solid"/><Alignment ss:Vertical="Top" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="0.5" ss:Color="#E2EBF4"/></Borders></Style>'
            + '<Style ss:ID="Good"><Font ss:FontName="Aptos" ss:Size="10" ss:Bold="1" ss:Color="#14532D"/><Interior ss:Color="#E6F4EA" ss:Pattern="Solid"/><Alignment ss:Vertical="Top" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="0.5" ss:Color="#C5E6CE"/></Borders></Style>'
            + '<Style ss:ID="Warn"><Font ss:FontName="Aptos" ss:Size="10" ss:Bold="1" ss:Color="#7A4A00"/><Interior ss:Color="#FFF4CE" ss:Pattern="Solid"/><Alignment ss:Vertical="Top" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="0.5" ss:Color="#F1D58E"/></Borders></Style>'
            + '<Style ss:ID="Bad"><Font ss:FontName="Aptos" ss:Size="10" ss:Bold="1" ss:Color="#7F1D1D"/><Interior ss:Color="#FDE8E8" ss:Pattern="Solid"/><Alignment ss:Vertical="Top" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="0.5" ss:Color="#F2C0C0"/></Borders></Style>'
            + '<Style ss:ID="Pct"><NumberFormat ss:Format="0.0%"/><Font ss:FontName="Aptos" ss:Size="10" ss:Bold="1" ss:Color="#1F2933"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="0.5" ss:Color="#E6EDF5"/></Borders></Style>'
            + '<Style ss:ID="Note"><Font ss:FontName="Aptos" ss:Size="10" ss:Italic="1" ss:Color="#475467"/><Interior ss:Color="#F9FCFF" ss:Pattern="Solid"/><Alignment ss:Vertical="Top" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="0.5" ss:Color="#DDE7F1"/></Borders></Style>'
            + '<Style ss:ID="DashboardTitle"><Font ss:FontName="Aptos Display" ss:Size="21" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#071C2C" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Left"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="3" ss:Color="#00CFE8"/></Borders></Style>'
            + '<Style ss:ID="DashboardSubtitle"><Font ss:FontName="Aptos" ss:Size="11" ss:Color="#B8F5FF"/><Interior ss:Color="#0B3047" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Left"/></Style>'
            + '<Style ss:ID="DashboardSection"><Font ss:FontName="Aptos" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0B5FA5" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Left"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#00CFE8"/></Borders></Style>'
            + '<Style ss:ID="MetaLabel"><Font ss:FontName="Aptos" ss:Size="9" ss:Bold="1" ss:Color="#52606D"/><Interior ss:Color="#EAF5FB" ss:Pattern="Solid"/><Alignment ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="0.5" ss:Color="#C8E3EF"/></Borders></Style>'
            + '<Style ss:ID="MetaValue"><Font ss:FontName="Aptos" ss:Size="10" ss:Bold="1" ss:Color="#102A43"/><Interior ss:Color="#F7FCFF" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="0.5" ss:Color="#C8E3EF"/></Borders></Style>'
            + '<Style ss:ID="KpiLabel"><Font ss:FontName="Aptos" ss:Size="9" ss:Bold="1" ss:Color="#52606D"/><Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Center" ss:WrapText="1"/><Borders><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D8E2EA"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D8E2EA"/><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D8E2EA"/></Borders></Style>'
            + '<Style ss:ID="KpiValueBlue"><Font ss:FontName="Aptos Display" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1677B8" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Center"/></Style>'
            + '<Style ss:ID="KpiValueGreen"><Font ss:FontName="Aptos Display" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#16876A" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Center"/></Style>'
            + '<Style ss:ID="KpiValuePurple"><Font ss:FontName="Aptos Display" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#6E56A8" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Center"/></Style>'
            + '<Style ss:ID="KpiValueAmber"><Font ss:FontName="Aptos Display" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#B66A12" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Center"/></Style>'
            + '<Style ss:ID="KpiValueRed"><Font ss:FontName="Aptos Display" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#B83A4B" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Center"/></Style>'
            + '<Style ss:ID="KpiPctBlue"><NumberFormat ss:Format="0.0%"/><Font ss:FontName="Aptos Display" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1677B8" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Center"/></Style>'
            + '<Style ss:ID="KpiPctGreen"><NumberFormat ss:Format="0.0%"/><Font ss:FontName="Aptos Display" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#16876A" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Center"/></Style>'
            + '<Style ss:ID="KpiPctPurple"><NumberFormat ss:Format="0.0%"/><Font ss:FontName="Aptos Display" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#6E56A8" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Center"/></Style>'
            + '<Style ss:ID="KpiPctRed"><NumberFormat ss:Format="0.0%"/><Font ss:FontName="Aptos Display" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#B83A4B" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:Horizontal="Center"/></Style>'
            + '<Style ss:ID="Integer"><NumberFormat ss:Format="0"/><Font ss:FontName="Aptos" ss:Size="10" ss:Color="#1F2933"/><Alignment ss:Horizontal="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="0.5" ss:Color="#E6EDF5"/></Borders></Style>'
            + '<Style ss:ID="Date"><Font ss:FontName="Aptos" ss:Size="10" ss:Bold="1" ss:Color="#0B5FA5"/><Interior ss:Color="#F3F8FD" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="0.5" ss:Color="#D8E5F3"/></Borders></Style>'
            + '<Style ss:ID="DeltaGood"><NumberFormat ss:Format="+0.0%;-0.0%;0.0%"/><Font ss:FontName="Aptos" ss:Size="10" ss:Bold="1" ss:Color="#14532D"/><Interior ss:Color="#E6F4EA" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style>'
            + '<Style ss:ID="DeltaBad"><NumberFormat ss:Format="+0.0%;-0.0%;0.0%"/><Font ss:FontName="Aptos" ss:Size="10" ss:Bold="1" ss:Color="#7F1D1D"/><Interior ss:Color="#FDE8E8" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center"/></Style>'
            + '<Style ss:ID="TeacherNote"><Font ss:FontName="Aptos" ss:Size="10" ss:Bold="1" ss:Color="#102A43"/><Interior ss:Color="#E8F7FA" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:WrapText="1"/><Borders><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#00AFC4"/></Borders></Style>'
            + '<Style ss:ID="Definition"><Font ss:FontName="Aptos" ss:Size="9" ss:Italic="1" ss:Color="#52606D"/><Interior ss:Color="#F7F9FB" ss:Pattern="Solid"/><Alignment ss:Vertical="Center" ss:WrapText="1"/><Borders><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="0.5" ss:Color="#D8E2EA"/></Borders></Style>'
            + '</Styles>';
    },

    _excelStyleForCell(sheetName, rowIndex, colIndex, value, rows) {
        const sheet = String(sheetName || '');
        const row = Array.isArray(rows && rows[rowIndex]) ? rows[rowIndex] : [];
        const rowStyle = row.__style || '';
        const first = String(row[0] || '');
        const headerLike = rowIndex === 0 || ['KPI', 'Insight', 'Type', 'Competency', 'GameplayId', 'StageId', 'Module', 'Day', 'Timestamp'].indexOf(first) !== -1;
        if (rowStyle && colIndex === 0) return rowStyle;
        if ((sheet === 'Dashboard' || sheet === 'Teacher Dashboard') && rowIndex === 0) return 'DashboardTitle';
        if (!row.length) return 'Body';
        if (headerLike) return 'Header';
        if (sheet === 'Dashboard' && (first === 'Performance Summary' || colIndex === 3)) return 'Note';
        if (colIndex === 0) return 'Label';
        const text = String(value === null || value === undefined ? '' : value);
        if (/^(Strong|Strength|success|Low|passed|Demonstrated|improved)$/i.test(text)) return 'Good';
        if (/^(Moderate|Trend|plateau|cancelled|Developing|steady|baseline)$/i.test(text)) return 'Warn';
        if (/^(Weak|Weakness|High|ErrorPattern|declining|failed|Needs support)$/i.test(text)) return 'Bad';
        const header = String((rows && rows[0] && rows[0][colIndex]) || '');
        if (/Rate|Accuracy|Completion|Confidence|Delta|Improvement|Change/.test(header) && typeof value === 'number') return 'Pct';
        return rowIndex % 2 === 0 ? 'Zebra' : 'Body';
    },

    _excelColumnWidths(rows) {
        const maxCols = rows.reduce(function (max, row) {
            return Math.max(max, Array.isArray(row) ? row.length : 1);
        }, 1);
        const widths = [];
        for (let c = 0; c < maxCols; c++) {
            let maxLen = 8;
            for (let r = 0; r < rows.length; r++) {
                const row = Array.isArray(rows[r]) ? rows[r] : [rows[r]];
                if (row.__mergeAcross && c > 0) continue;
                const text = row[c] === null || row[c] === undefined ? '' : String(row[c]);
                maxLen = Math.max(maxLen, Math.min(42, text.length));
            }
            widths.push(Math.max(58, Math.min(230, maxLen * 6.5 + 18)).toFixed(0));
        }
        return widths;
    },

    _excelRowHeight(row, rowIndex, sheetName) {
        if (row && row.__height) return Number(row.__height) || 20;
        if (String(sheetName || '') === 'Dashboard' && rowIndex === 0) return 30;
        if (!Array.isArray(row) || !row.length) return 8;
        const maxLen = row.reduce(function (max, cell) {
            return Math.max(max, String(cell === null || cell === undefined ? '' : cell).length);
        }, 0);
        if (maxLen > 120) return 48;
        if (maxLen > 70) return 34;
        return rowIndex === 0 ? 22 : 19;
    },

    _downloadBlob(blob, filename) {
        if (typeof document === 'undefined') return false;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return true;
    },

    _wrapText(text, maxChars) {
        const source = String(text || '').trim();
        const width = Math.max(20, Number(maxChars || 80) || 80);
        if (!source) return [];
        const words = source.split(/\s+/);
        const lines = [];
        let current = '';
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            if (!current) {
                current = word;
                continue;
            }
            if ((current + ' ' + word).length <= width) {
                current += ' ' + word;
            } else {
                lines.push(current);
                current = word;
            }
        }
        if (current) lines.push(current);
        return lines;
    },

    _stringifyCell(value) {
        if (value === null || value === undefined) return '';
        if (typeof value === 'string') return value;
        if (typeof value === 'number' || typeof value === 'boolean') return String(value);
        try {
            return JSON.stringify(value);
        } catch (e) {
            return String(value);
        }
    },

    _defaultFileBase(infiltratorName) {
        const safe = String(infiltratorName || 'UNKNOWN').replace(/[^A-Za-z0-9_\-]+/g, '_');
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        return 'IP2Live_Report_' + safe + '_' + stamp;
    },

    _dayKey(ts) {
        const d = new Date(Number(ts || 0) || Date.now());
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + dd;
    },

    _formatLocalTime(ts) {
        const value = Number(ts || 0) || 0;
        if (!value) return '';
        const d = new Date(value);
        return String(d.getHours()).padStart(2, '0') + ':'
            + String(d.getMinutes()).padStart(2, '0') + ':'
            + String(d.getSeconds()).padStart(2, '0');
    },

    _formatLocalDateTime(ts) {
        const value = Number(ts || 0) || 0;
        if (!value) return '';
        return this._dayKey(value) + ' ' + this._formatLocalTime(value);
    },

    _signedDuration(ms) {
        const value = Number(ms || 0) || 0;
        if (!value) return 'No change';
        if (value > 0) return '+' + this._ms(value) + ' faster';
        return '-' + this._ms(Math.abs(value)) + ' slower';
    },

    _uniqueCount(values) {
        const set = {};
        for (let i = 0; i < values.length; i++) set[values[i]] = true;
        return Object.keys(set).length;
    },

    _avg(list) {
        if (!list || !list.length) return 0;
        let sum = 0;
        for (let i = 0; i < list.length; i++) sum += Number(list[i] || 0) || 0;
        return sum / list.length;
    },

    _median(list) {
        if (!list || !list.length) return 0;
        const arr = list.slice().sort(function (a, b) { return a - b; });
        const mid = Math.floor(arr.length / 2);
        if (arr.length % 2 === 0) return (arr[mid - 1] + arr[mid]) / 2;
        return arr[mid];
    },

    _stddev(list) {
        if (!list || list.length < 2) return 0;
        const mean = this._avg(list);
        let variance = 0;
        for (let i = 0; i < list.length; i++) {
            const d = (Number(list[i] || 0) || 0) - mean;
            variance += d * d;
        }
        variance /= list.length;
        return Math.sqrt(variance);
    },

    _max(list) {
        if (!list || !list.length) return 0;
        let max = list[0];
        for (let i = 1; i < list.length; i++) if (list[i] > max) max = list[i];
        return max;
    },

    _clamp01(n) {
        return Math.max(0, Math.min(1, Number(n || 0) || 0));
    },

    _pct(n) {
        return (this._clamp01(n) * 100).toFixed(1) + '%';
    },

    _num(n, digits) {
        return Number(n || 0).toFixed(Number(digits || 0) || 0);
    },

    _ms(n) {
        const ms = Math.max(0, Number(n || 0) || 0);
        const sec = Math.floor(ms / 1000);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    },

    _xmlEscape(v) {
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    },
};

IP2Live.ReportManager = IP2LiveReportManager;
window.IP2LiveReportManager = IP2LiveReportManager;
console.log('[IP2Live] report_manager.js module loaded.');
