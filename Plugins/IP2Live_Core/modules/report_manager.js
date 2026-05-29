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
            const pdfBlob = this._buildPdfBlob(dto);
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
            attemptsRaw: attempts,
        };
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

    _buildPdfBlob(report) {
        const builder = this._pdfBuilder();
        const W = 595;
        const H = 842;
        const margin = 34;
        let y = H - margin;
        const ensureSpace = (neededHeight) => {
            if (y - neededHeight >= margin) return;
            builder.newPage();
            y = H - margin;
        };

        builder.text(34, y, 16, 'IP2Live Student Progress Report');
        y -= 20;
        builder.text(34, y, 10, 'Student: ' + report.summary.infiltratorName + '   Scope: Last ' + report.summary.scopeDays + ' days');
        y -= 13;
        builder.text(34, y, 10, 'Generated: ' + new Date(report.summary.generatedAt).toLocaleString());
        y -= 18;

        const k = report.kpi;
        builder.text(34, y, 11, 'KPI Summary');
        y -= 12;
        builder.text(34, y, 9, 'Attempts: ' + k.attempts + '   Completion: ' + this._pct(k.completionRate) + '   Accuracy: ' + this._pct(k.accuracy));
        y -= 11;
        builder.text(34, y, 9, 'Clear Time (avg/median/best): ' + this._ms(k.avgClearMs) + ' / ' + this._ms(k.medianClearMs) + ' / ' + this._ms(k.bestClearMs));
        y -= 11;
        builder.text(34, y, 9, 'Consistency(std): ' + this._ms(k.consistencyStdMs) + '   Weighted Mastery: ' + this._num(k.weightedMastery, 1));
        y -= 18;

        const chartRect = { x: 34, y: y - 120, w: 250, h: 110 };
        builder.rect(chartRect.x, chartRect.y, chartRect.w, chartRect.h);
        const masterySeries = report.daily.map(function (d) { return Number(d.accuracy || 0) * 100; });
        this._drawLineSeries(builder, chartRect, masterySeries, 0, 100);
        builder.text(chartRect.x + 6, chartRect.y + chartRect.h + 10, 8, 'Daily Accuracy Trend');

        const chart2 = { x: 308, y: y - 120, w: 250, h: 110 };
        builder.rect(chart2.x, chart2.y, chart2.w, chart2.h);
        const clearSeries = report.daily.map(function (d) { return Number(d.avgClearMs || 0) / 1000; });
        this._drawLineSeries(builder, chart2, clearSeries, 0, Math.max(1, this._max(clearSeries)));
        builder.text(chart2.x + 6, chart2.y + chart2.h + 10, 8, 'Daily Clear Time Trend (seconds)');
        y -= 145;

        builder.text(34, y, 11, 'Competency Classification');
        y -= 12;
        const comps = report.competencies || [];
        for (let i = 0; i < comps.length; i++) {
            const c = comps[i];
            ensureSpace(14);
            builder.text(34, y, 9, c.competencyLabel + ': ' + c.status + ' | Score ' + c.score + ' | Confidence ' + this._pct(c.confidence));
            y -= 10;
        }
        y -= 8;

        ensureSpace(30);
        builder.text(34, y, 11, 'Documented Attempts by Stage / Level / Gameplay');
        y -= 12;
        builder.text(34, y, 8, 'Stage | Level | Gameplay | Attempts | Wins | Wrongs | Mistakes | Avg Clear | Accuracy');
        y -= 9;

        const grouped = Array.isArray(report.attemptSummary) ? report.attemptSummary : [];
        for (let i = 0; i < grouped.length; i++) {
            const g = grouped[i];
            ensureSpace(14);
            const line = [
                'S' + g.stageId,
                'L' + g.levelId,
                (g.gameplayLabel || g.gameplayId || 'Unknown'),
                'A:' + g.attempts,
                'W:' + g.wins,
                'R:' + g.wrongs,
                'M:' + g.mistakes,
                'T:' + this._ms(g.avgClearMs),
                'Acc:' + this._pct(g.accuracy),
            ].join(' | ');
            builder.text(34, y, 8, line);
            y -= 9;
        }

        y -= 8;
        ensureSpace(30);
        builder.text(34, y, 11, 'Attempt Timeline');
        y -= 12;
        builder.text(34, y, 8, 'Time | Stage | Level | Gameplay | Result | Wrongs | Retries | Clear');
        y -= 9;

        const raw = Array.isArray(report.attemptsRaw) ? report.attemptsRaw : [];
        for (let i = 0; i < raw.length; i++) {
            const a = raw[i];
            ensureSpace(14);
            const at = new Date(Number(a.timestamp || 0) || 0).toLocaleString();
            const result = a.passed ? 'WIN' : 'WRONG';
            const line = [
                at,
                'S' + (Number(a.stageId || 0) || 0),
                'L' + (Number(a.levelId || 0) || 0),
                (a.gameplayLabel || a.gameplayId || 'Unknown'),
                result,
                String(Number(a.mistakeCount || 0) || 0),
                String(Number(a.retries || 0) || 0),
                this._ms(Number(a.durationMs || 0) || 0),
            ].join(' | ');
            builder.text(34, y, 8, line);
            y -= 9;
        }

        return builder.blob();
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

        const compRows = [['Competency', 'Status', 'Score', 'Confidence', 'Attempts', 'Accuracy', 'CompletionRate', 'MistakeRate', 'MedianClearMs', 'InterventionHint']];
        for (let i = 0; i < report.competencies.length; i++) {
            const c = report.competencies[i];
            compRows.push([c.competencyLabel, c.status, c.score, c.confidence, c.attempts, c.accuracy, c.completionRate, c.mistakeRate, c.medianClearMs, c.interventionHint]);
        }
        sheets.push({ name: 'Competencies', rows: compRows });

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
