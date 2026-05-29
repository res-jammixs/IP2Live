/**
 * IP2Live - Report Manager
 *
 * Unified telemetry logger + report aggregation + PDF/Excel export.
 * Offline-only. No external dependencies.
 */

const IP2LiveReportManager = {
    VERSION: 'report-manager-20260529-01',

    async boot() {
        return true;
    },

    async logTelemetryRecord(record) {
        if (!record || !IP2Live.DBManager || typeof IP2Live.DBManager.saveRecord !== 'function') return false;
        try {
            await IP2Live.DBManager.saveRecord('telemetry', record);
            return true;
        } catch (e) {
            console.warn('[IP2Live] ReportManager telemetry save failed:', e);
            return false;
        }
    },

    async export(options) {
        const opts = options || {};
        const profileName = String(opts.infiltratorName || 'UNKNOWN').trim() || 'UNKNOWN';
        const scopeDays = Math.max(1, Number(opts.scopeDays || 30) || 30);
        const format = String(opts.format || 'both').toLowerCase();
        const baseName = String(opts.filenameBase || '').trim() || this._defaultFileBase(profileName);
        const catalog = Array.isArray(opts.gameplayCatalog) ? opts.gameplayCatalog : [];

        const now = Date.now();
        const since = now - scopeDays * 24 * 60 * 60 * 1000;
        const telemetry = await this._queryTelemetry(profileName, since);
        const dto = this._buildReportDTO({
            infiltratorName: profileName,
            scopeDays: scopeDays,
            generatedAt: now,
            telemetry: telemetry,
            gameplayCatalog: catalog,
        });

        const exported = [];
        if (format === 'pdf' || format === 'both') {
            const pdfBlob = await this._buildPdfBlob(dto);
            this._downloadBlob(pdfBlob, baseName + '.pdf');
            exported.push('pdf');
        }
        if (format === 'excel' || format === 'both' || format === 'xlsx') {
            const xlsBlob = this._buildExcelXmlBlob(dto);
            this._downloadBlob(xlsBlob, baseName + '.xls');
            exported.push('excel');
        }
        if (!exported.length) {
            const fallback = this._buildExcelXmlBlob(dto);
            this._downloadBlob(fallback, baseName + '.xls');
            exported.push('excel');
        }
        return {
            ok: true,
            exported: exported,
            report: dto,
        };
    },

    async _queryTelemetry(infiltratorName, sinceTs) {
        if (!IP2Live.DBManager) return [];
        let rows = [];
        try {
            if (typeof IP2Live.DBManager.getRecordsByIndex === 'function') {
                rows = await IP2Live.DBManager.getRecordsByIndex('telemetry', 'infiltratorName', infiltratorName);
            } else if (typeof IP2Live.DBManager.getRecordsByFilter === 'function') {
                rows = await IP2Live.DBManager.getRecordsByFilter('telemetry', function (r) {
                    return r && r.infiltratorName === infiltratorName;
                });
            } else if (typeof IP2Live.DBManager.getAllRecords === 'function') {
                rows = await IP2Live.DBManager.getAllRecords('telemetry');
                rows = rows.filter(function (r) { return r && r.infiltratorName === infiltratorName; });
            }
        } catch (e) {
            console.warn('[IP2Live] ReportManager telemetry query failed:', e);
            rows = [];
        }
        const minTs = Number(sinceTs || 0) || 0;
        rows = rows.filter(function (r) {
            const t = Number(r && r.timestamp) || 0;
            return t >= minTs;
        });
        rows.sort(function (a, b) { return (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0); });
        return rows;
    },

    _buildReportDTO(input) {
        const telemetry = Array.isArray(input.telemetry) ? input.telemetry : [];
        const catalog = Array.isArray(input.gameplayCatalog) ? input.gameplayCatalog : [];
        const catalogByGameplay = this._catalogByGameplayId(catalog);
        const attempts = this._attemptRows(telemetry);
        const sessionsCount = this._uniqueCount(attempts.map(function (a) { return a.sessionId || null; }).filter(Boolean));
        const totalActiveMs = attempts.reduce(function (sum, a) { return sum + Math.max(0, Number(a.durationMs || 0) || 0); }, 0);
        const passedCount = attempts.filter(function (a) { return !!a.passed; }).length;
        const failedCount = attempts.filter(function (a) { return a.passed === false; }).length;
        const attemptsCount = attempts.length;
        const completionRate = attemptsCount > 0 ? passedCount / attemptsCount : 0;

        let accuracyWeight = 0;
        let accuracyWeightedSum = 0;
        for (let i = 0; i < attempts.length; i++) {
            const a = attempts[i];
            const w = Math.max(1, Number(a.attemptsUsed || 0) || 1);
            const acc = this._clamp01(Number(a.accuracy || 0) || 0);
            accuracyWeightedSum += acc * w;
            accuracyWeight += w;
        }
        const overallAccuracy = accuracyWeight > 0 ? accuracyWeightedSum / accuracyWeight : 0;
        const clearTimes = attempts.map(function (a) { return Number(a.durationMs || 0) || 0; }).filter(function (n) { return n > 0; });
        const avgClearMs = this._avg(clearTimes);
        const medianClearMs = this._median(clearTimes);
        const bestClearMs = clearTimes.length ? Math.min.apply(null, clearTimes) : 0;
        const consistencyStdMs = this._stddev(clearTimes);

        const perGameplay = this._perGameplayMetrics(attempts, catalogByGameplay);
        const daily = this._dailyRollups(attempts, catalogByGameplay);
        const mastery = this._computeMastery({
            attempts: attempts,
            overallAccuracy: overallAccuracy,
            completionRate: completionRate,
            perGameplay: perGameplay,
            daily: daily,
            catalogByGameplay: catalogByGameplay,
        });
        const competencies = this._competencyMetrics(attempts, catalogByGameplay);
        const attemptSummary = this._attemptSummary(attempts, catalogByGameplay);
        const stats = this._derivePerformanceStats({
            attempts: attempts,
            catalogByGameplay: catalogByGameplay,
            perGameplay: perGameplay,
            attemptSummary: attemptSummary,
            daily: daily,
            mastery: mastery,
        });
        const performanceSummary = this._generatePerformanceSummary(stats);

        return {
            version: 'report-dto-20260529-01',
            summary: {
                infiltratorName: input.infiltratorName,
                generatedAt: Number(input.generatedAt) || Date.now(),
                scopeDays: Number(input.scopeDays) || 30,
                sessionsCount: sessionsCount,
                totalActivePlayMs: totalActiveMs,
            },
            kpi: {
                attempts: attemptsCount,
                completedAttempts: passedCount,
                failedAttempts: failedCount,
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
            attemptSummary: attemptSummary,
            stats: stats,
            performanceSummary: performanceSummary,
            attemptsRaw: attempts,
        };
    },

    _derivePerformanceStats(input) {
        const attempts = Array.isArray(input.attempts) ? input.attempts.slice() : [];
        const catalogByGameplay = input.catalogByGameplay || {};
        const mastery = input.mastery || {};

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
            const isTutorial = this._isTutorialGameplay(gameplayId);
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
                    gameplayAttempts: 0,
                    gameplayPassed: 0,
                    gameplayFailed: 0,
                    gameplayDurationMs: 0,
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
            } else {
                moduleRow.gameplayAttempts++;
                if (a.passed) moduleRow.gameplayPassed++;
                else moduleRow.gameplayFailed++;
                moduleRow.gameplayDurationMs += Math.max(0, Number(a.durationMs || 0) || 0);
            }

            if (!pairByKey[pairKey]) {
                pairByKey[pairKey] = {
                    stageId: stageId,
                    gameplayId: gameplayId,
                    gameplayLabel: moduleLabel,
                    attempts: 0,
                    passed: 0,
                    failed: 0,
                    longestFailureStreak: 0,
                    currentFailureStreak: 0,
                    lastAttemptTs: 0,
                };
            }
            const pair = pairByKey[pairKey];
            pair.attempts++;
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
            const accuracy = row.attempts > 0 ? row.passed / row.attempts : 0;
            return {
                sessionId: row.sessionId,
                startTs: row.startTs,
                endTs: row.endTs,
                attempts: row.attempts,
                passed: row.passed,
                failed: row.failed,
                accuracyRate: accuracy,
                completionRate: accuracy,
                timeOnTaskMs: row.attempts > 0 ? row.totalDurationMs / row.attempts : 0,
                activeWindowMs: Math.max(0, row.endTs - row.startTs),
                stageCount: Object.keys(row.stageIds).length,
                gameplayCount: Object.keys(row.gameplayIds).length,
            };
        }).sort(function (a, b) { return a.startTs - b.startTs; });

        const gameplayRows = Object.keys(gameplayById).map(function (gameplayId) {
            const row = gameplayById[gameplayId];
            const accuracy = row.attempts > 0 ? row.passed / row.attempts : 0;
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
                completionRate: accuracy,
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
            const accuracy = row.attempts > 0 ? row.passed / row.attempts : 0;
            return {
                stageId: row.stageId,
                attempts: row.attempts,
                correctAttempts: row.passed,
                incorrectAttempts: row.failed,
                accuracyRate: accuracy,
                completionRate: accuracy,
                avgTimeOnTaskMs: row.attempts > 0 ? row.totalDurationMs / row.attempts : 0,
                gameplayCount: Object.keys(row.gameplayIds).length,
            };
        }).sort(function (a, b) { return a.stageId - b.stageId; });

        const moduleRows = Object.keys(moduleByKey).map(function (moduleKey) {
            const row = moduleByKey[moduleKey];
            const tutorialAccuracy = row.tutorialAttempts > 0 ? row.tutorialPassed / row.tutorialAttempts : 0;
            const gameplayAccuracy = row.gameplayAttempts > 0 ? row.gameplayPassed / row.gameplayAttempts : 0;
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
            const accuracy = row.attempts > 0 ? row.passed / row.attempts : 0;
            return {
                stageId: row.stageId,
                gameplayId: row.gameplayId,
                gameplayLabel: row.gameplayLabel,
                attempts: row.attempts,
                passed: row.passed,
                failed: row.failed,
                accuracyRate: accuracy,
                completionRate: accuracy,
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
                accuracyRate: attempts.length > 0 ? attempts.filter(function (a) { return !!a.passed; }).length / attempts.length : 0,
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
            strongestGameplay: gameplaySorted.length ? gameplaySorted[0] : null,
            weakestGameplay: gameplayWorst.length ? gameplayWorst[0] : null,
        };
    },

    _generatePerformanceSummary(stats) {
        const overall = stats && stats.overall ? stats.overall : {};
        const strongest = stats && stats.strongestGameplay ? stats.strongestGameplay : null;
        const weakest = stats && stats.weakestGameplay ? stats.weakestGameplay : null;
        const errors = stats && Array.isArray(stats.errorPatterns) ? stats.errorPatterns : [];
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
        return 'Overall performance is ' + level + '. ' + strongestName + ' is the strongest area, while ' + weakestName + ' needs the most attention. ' + errorText + ' ' + trendText + ' Focus on ' + recommendationTarget + ' before advancing to the next stage.';
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
            ip_patch_panel_classes: 'IP Patch Panel',
            ip_cidr_binary_panel: 'CIDR Binary Panel',
            ip_subnet_simulator: 'Subnet Simulator',
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
        for (let i = 0; i < telemetry.length; i++) {
            const row = telemetry[i] || {};
            if (row.eventType !== 'attempt_end') continue;
            out.push({
                timestamp: Number(row.timestamp || 0) || 0,
                sessionId: row.sessionId || null,
                attemptId: row.attemptId || null,
                gameplayId: row.gameplayId || 'unknown_gameplay',
                gameplayLabel: row.gameplayLabel || row.gameplayId || 'Unknown Gameplay',
                competencyKey: row.competencyKey || null,
                competencyLabel: row.competencyLabel || null,
                stageId: Number(row.stageId || 0) || 0,
                levelId: Number(row.levelId || 0) || 0,
                mapId: Number(row.mapId || 0) || 0,
                questId: row.questId || null,
                objectiveId: row.objectiveId || null,
                passed: row.passed === null || row.passed === undefined ? false : !!row.passed,
                durationMs: Number(row.durationMs || 0) || 0,
                attemptsUsed: Number(row.attemptsUsed || 0) || 0,
                maxAttempts: Number(row.maxAttempts || 0) || 0,
                retries: Number(row.retries || 0) || 0,
                mistakeCount: Number(row.mistakeCount || 0) || 0,
                mistakeRate: Number(row.mistakeRate || 0) || 0,
                accuracy: this._clamp01(Number(row.accuracy || 0) || 0),
                payload: row.payload || {},
            });
        }
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
                    passed: 0,
                    failed: 0,
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
            if (a.passed) r.passed++;
            else r.failed++;
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
            const related = attempts.filter(function (a) { return a.gameplayId === id; });
            row.avgAccuracy = this._avg(related.map(function (a) { return Number(a.accuracy || 0) || 0; }));
            row.avgClearMs = this._avg(related.map(function (a) { return Number(a.durationMs || 0) || 0; }).filter(function (n) { return n > 0; }));
            row.medianClearMs = this._median(related.map(function (a) { return Number(a.durationMs || 0) || 0; }).filter(function (n) { return n > 0; }));
        }
        return out;
    },

    _dailyRollups(attempts, catalogByGameplay) {
        const byDay = {};
        for (let i = 0; i < attempts.length; i++) {
            const a = attempts[i];
            const day = this._dayKey(a.timestamp);
            if (!byDay[day]) {
                byDay[day] = {
                    day: day,
                    attempts: 0,
                    passed: 0,
                    failed: 0,
                    accuracyValues: [],
                    clearValues: [],
                    mistakesByGameplay: {},
                };
            }
            const d = byDay[day];
            d.attempts++;
            if (a.passed) d.passed++;
            else d.failed++;
            d.accuracyValues.push(Number(a.accuracy || 0) || 0);
            if (a.durationMs > 0) d.clearValues.push(Number(a.durationMs));
            const gk = a.gameplayId || 'unknown_gameplay';
            d.mistakesByGameplay[gk] = (d.mistakesByGameplay[gk] || 0) + (Number(a.mistakeCount || 0) || 0);
        }

        const rows = Object.keys(byDay).sort().map(function (day) { return byDay[day]; });
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            r.completionRate = r.attempts > 0 ? r.passed / r.attempts : 0;
            r.accuracy = this._avg(r.accuracyValues);
            r.avgClearMs = this._avg(r.clearValues);
        }
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
                    wins: 0,
                    wrongs: 0,
                    mistakes: 0,
                    retries: 0,
                    accuracyValues: [],
                    clearValues: [],
                    lastAttemptTs: 0,
                };
            }
            const row = byKey[key];
            row.attempts++;
            if (a.passed) row.wins++;
            else row.wrongs++;
            row.mistakes += Number(a.mistakeCount || 0) || 0;
            row.retries += Number(a.retries || 0) || 0;
            row.accuracyValues.push(Number(a.accuracy || 0) || 0);
            if (a.durationMs > 0) row.clearValues.push(Number(a.durationMs || 0) || 0);
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
                wins: r.wins,
                wrongs: r.wrongs,
                mistakes: r.mistakes,
                retries: r.retries,
                accuracy: IP2LiveReportManager._avg(r.accuracyValues),
                avgClearMs: IP2LiveReportManager._avg(r.clearValues),
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

        this._pdfStartPage(ctx, { title: 'Attempts Raw' });
        this._pdfRenderAttemptsRawSection(ctx);

        this._pdfStartPage(ctx, { title: 'Attempts By Stage' });
        this._pdfRenderAttemptsByStageSection(ctx);

        return writer.blob();
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
        const pg = Array.isArray(report.perGameplay) ? report.perGameplay : [];
        for (let i = 0; i < pg.length; i++) {
            const g = pg[i];
            const mapping = g.wrongClassMappings || {};
            const keys = Object.keys(mapping);
            for (let j = 0; j < keys.length; j++) rows.push({ gameplayId: g.gameplayId, issue: keys[j], count: mapping[keys[j]] });
            const slots = g.slotWrongFrequency || {};
            const slotKeys = Object.keys(slots);
            for (let k = 0; k < slotKeys.length; k++) rows.push({ gameplayId: g.gameplayId, issue: 'slot:' + slotKeys[k], count: slots[slotKeys[k]] });
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

    /** @private Render a branded table with colored rows, truncated cells, and compact column layout. */
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
        const pageHeight = Number(config && config.pageHeight !== undefined ? config.pageHeight : 842) || 842;
        const bottomLimit = Number(config && config.bottomLimit !== undefined ? config.bottomLimit : 52) || 52;
        const headerHeight = 16;
        const rowHeight = Number(config && config.rowHeight !== undefined ? config.rowHeight : 16) || 16;
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

        const drawRow = function (row, index) {
            let currentX = x;
            const bg = typeof rowColor === 'function'
                ? rowColor(row, index)
                : (Array.isArray(rowColor) ? rowColor : (index % 2 === 0 ? [0.98, 0.99, 1, 1] : [1, 1, 1, 1]));
            writer.rect(x, cursorY - rowHeight + 2, width, rowHeight, { fill: bg, stroke: gridColor, lineWidth: 0.2 });
            for (let c = 0; c < columns.length; c++) {
                const column = columns[c] || {};
                const colWidth = colWidths[c] || 0;
                const rawValue = row && column.key ? row[column.key] : '';
                const formatted = typeof column.formatter === 'function' ? column.formatter(rawValue, row, column) : rawValue;
                const text = this._fitPdfTextToWidth(formatted === null || formatted === undefined ? '' : formatted, Math.max(10, colWidth - 6), 7.2);
                const textX = currentX + 3;
                const textY = cursorY - 8;
                const align = String(column.align || 'left').toLowerCase();
                if (align === 'right') {
                    const estimatedWidth = Math.max(8, String(text).length * 2.5);
                    writer.text(Math.max(currentX + 3, currentX + colWidth - 3 - estimatedWidth), textY, 7.2, text, { font: 'F1', color: bodyText });
                } else if (align === 'center') {
                    const estimatedWidth = Math.max(8, String(text).length * 1.4);
                    writer.text(Math.max(currentX + 3, currentX + (colWidth / 2) - (estimatedWidth / 2)), textY, 7.2, text, { font: 'F1', color: bodyText });
                } else {
                    writer.text(textX, textY, 7.2, text, { font: 'F1', color: bodyText });
                }
                writer.rect(currentX, cursorY - rowHeight + 2, colWidth, rowHeight, { stroke: gridColor, lineWidth: 0.2 });
                currentX += colWidth;
            }
            cursorY -= rowHeight;
        }.bind(this);

        drawHeader();
        for (let i = 0; i < rows.length; i++) {
            if (cursorY - rowHeight < bottomLimit) break;
            drawRow(rows[i], i);
        }
        return Math.max(cursorY, pageHeight - bottomLimit);
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
        const strongest = report.stats && report.stats.strongestGameplay ? report.stats.strongestGameplay : null;
        const weakest = report.stats && report.stats.weakestGameplay ? report.stats.weakestGameplay : null;
        const trend = report.stats && report.stats.progressionTrend ? report.stats.progressionTrend : null;
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

        const gameplayRows = [['GameplayId', 'GameplayLabel', 'ModuleKey', 'Type', 'Attempts', 'Correct', 'Incorrect', 'AccuracyRate', 'CompletionRate', 'AvgTimeOnTaskMs', 'SessionCount', 'StageCount']];
        const gameplayStats = report.stats && Array.isArray(report.stats.byGameplay) ? report.stats.byGameplay : [];
        for (let i = 0; i < gameplayStats.length; i++) {
            const g = gameplayStats[i];
            gameplayRows.push([g.gameplayId, g.gameplayLabel, g.moduleKey, g.isTutorial ? 'tutorial' : 'gameplay', g.attempts, g.correctAttempts, g.incorrectAttempts, g.accuracyRate, g.completionRate, g.avgTimeOnTaskMs, g.sessionCount, g.stageCount]);
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

        const dailyRows = [['Day', 'Attempts', 'Passed', 'Failed', 'CompletionRate', 'Accuracy', 'AvgClearMs']];
        for (let i = 0; i < report.daily.length; i++) {
            const d = report.daily[i];
            dailyRows.push([d.day, d.attempts, d.passed, d.failed, d.completionRate, d.accuracy, d.avgClearMs]);
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

    _spreadsheetXml(sheets) {
        const esc = this._xmlEscape;
        const header = '<?xml version="1.0"?>'
            + '<?mso-application progid="Excel.Sheet"?>'
            + '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"'
            + ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">';
        let body = '';
        for (let i = 0; i < sheets.length; i++) {
            const s = sheets[i];
            body += '<Worksheet ss:Name="' + esc(s.name || ('Sheet' + (i + 1))) + '"><Table>';
            const rows = Array.isArray(s.rows) ? s.rows : [];
            for (let r = 0; r < rows.length; r++) {
                body += '<Row>';
                const cols = Array.isArray(rows[r]) ? rows[r] : [rows[r]];
                for (let c = 0; c < cols.length; c++) {
                    const v = cols[c];
                    const isNum = typeof v === 'number' && Number.isFinite(v);
                    body += '<Cell><Data ss:Type="' + (isNum ? 'Number' : 'String') + '">' + esc(v === null || v === undefined ? '' : v) + '</Data></Cell>';
                }
                body += '</Row>';
            }
            body += '</Table></Worksheet>';
        }
        return header + body + '</Workbook>';
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
