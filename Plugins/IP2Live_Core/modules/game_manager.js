/**
 * IP2Live - Game Manager Module
 *
 * Top-level orchestration for map flow, world titles, timed dialogue,
 * tutorial activation, and gameplay node lifecycle events.
 *
 * Loaded by code.js via fetch() + new Function(). Do not use import/export.
 */

const IP2LiveGameManager = {
    VERSION: 'game-manager-20260528-01',

    STATE: {
        BOOT: 'BOOT',
        MAP_LOAD: 'MAP_LOAD',
        WORLD_TITLE: 'WORLD_TITLE',
        DIALOGUE_BEFORE: 'DIALOGUE_BEFORE',
        GAMEPLAY_ACTIVE: 'GAMEPLAY_ACTIVE',
        DIALOGUE_AFTER: 'DIALOGUE_AFTER',
        NEXT_NODE: 'NEXT_NODE',
        NEXT_STAGE: 'NEXT_STAGE',
    },

    EVENT: {
        WORLD_TITLE_STARTED: 'worldTitle.started',
        WORLD_TITLE_FINISHED: 'worldTitle.finished',
        DIALOGUE_STARTED: 'dialogue.started',
        DIALOGUE_FINISHED: 'dialogue.finished',
        GAMEPLAY_STARTED: 'gameplay.started',
        GAMEPLAY_FAILED: 'gameplay.failed',
        GAMEPLAY_COMPLETED: 'gameplay.completed',
        QUEST_OBJECTIVE_COMPLETED: 'quest.objectiveCompleted',
        MAP_ENTERED: 'map.entered',
    },

    state: 'BOOT',
    _listeners: {},
    _flowSerial: 0,
    _activeMapFlow: null,
    _activeGameplayNode: null,
    _lastWorldTitleFinishKey: null,
    _tutorialIntroPending: false,
    _dialogueLibraryReady: false,
    _activeSaveSlot: null,
    _slotSnapshotStorageKey: 'IP2Live_SlotProgress_v1',
    _registeredGameplayQuestIds: {},
    _reportSessionId: null,
    _reportActiveAttempts: {},
    _reportTelemetrySequence: 0,
    enableQuestSkipButton: true,
    _skipQuestButtonRect: null,

    flowConfig: {
        maps: {
            1: {
                id: 1,
                name: 'Tutorial Stage',
                mode: 'tutorial',
                tutorial: true,
                worldTitle: true,
            },
            3: {
                id: 3,
                name: 'Stage 1 Level 1',
                stage: 1,
                level: 1,
                spawn: { x: 6, y: 0, z: 17 },
                worldTitle: true,
                gameplayNodes: ['ip_class_wires'],
            },
            4: {
                id: 4,
                name: 'Stage 1 Level 2',
                stage: 1,
                level: 2,
                spawn: { x: 6, y: 0, z: 17 },
                worldTitle: true,
                gameplayNodes: ['ip_patch_panel_classes'],
            },
            5: {
                id: 5,
                name: 'Stage 1 Level 3',
                stage: 1,
                level: 3,
                spawn: { x: 6, y: 0, z: 17 },
                worldTitle: true,
                gameplayNodes: ['ip_cidr_binary_panel', 'ip_subnet_simulator'],
            },
            11: {
                id: 11,
                name: 'Stage 3 Level 1',
                stage: 3,
                level: 1,
                spawn: { x: 6, y: 0, z: 17 },
                worldTitle: true,
                gameplayNodes: ['ip_cidr_quarantine'],
            },
            12: {
                id: 12,
                name: 'Stage 3 Level 2',
                stage: 3,
                level: 2,
                spawn: { x: 6, y: 0, z: 17 },
                worldTitle: true,
                gameplayNodes: ['ip_cidr_quarantine_matrix'],
            },
        },
        gameplayNodes: {
            ip_class_wires: {
                id: 'ip_class_wires',
                mapId: 3,
                manager: 'GameplayManager',
                method: 'launchWireGameplay',
            },
            ip_patch_panel_classes: {
                id: 'ip_patch_panel_classes',
                mapId: 4,
                manager: 'PatchPanelGameplayManager',
                method: 'launchPatchPanelGameplay',
            },
            ip_cidr_binary_panel: {
                id: 'ip_cidr_binary_panel',
                mapId: 5,
                manager: 'CIDRPanelGameplayManager',
                method: 'launchCIDRGameplay',
            },
            ip_subnet_simulator: {
                id: 'ip_subnet_simulator',
                mapId: 5,
                manager: 'SubnetSimulatorGameplayManager',
                method: 'launchSubnetSimulatorGameplay',
            },
            ip_cidr_quarantine: {
                id: 'ip_cidr_quarantine',
                mapId: 11,
                manager: 'CIDRQuarantineGameplayManager',
                method: 'launchCIDRQuarantineGameplay',
            },
            ip_cidr_quarantine_matrix: {
                id: 'ip_cidr_quarantine_matrix',
                mapId: 12,
                manager: 'CIDRQuarantineMatrixGameplayManager',
                method: 'launchCIDRQuarantineMatrixGameplay',
            },
        },
    },

    gameplayCatalog: {
        ip_class_wires: {
            gameplayId: 'ip_class_wires',
            mapId: 3,
            label: 'IP Class Wires',
            competencyKey: 'ip_classification',
            competencyLabel: 'IP class identification',
            targetClearMs: 120000,
            objectiveHandler: { manager: 'GameplayManager', method: '_handleWireObjective' },
            quests: [
                { id: 'stage.3.ip_wires.01.tutorial', objectiveId: 'repair_ip_wires_01', title: 'REPAIR IP WIRES 01', label: 'Lever 01', targetTile: { x: 6, y: 0, z: 21 }, tutorial: true },
                { id: 'stage.3.ip_wires.02', objectiveId: 'repair_ip_wires_02', title: 'REPAIR IP WIRES 02', label: 'Lever 02', targetTile: { x: 27, y: 0, z: 10 } },
                { id: 'stage.3.ip_wires.03', objectiveId: 'repair_ip_wires_03', title: 'REPAIR IP WIRES 03', label: 'Lever 03', targetTile: { x: 13, y: 0, z: 6 } },
                { id: 'stage.3.ip_wires.04', objectiveId: 'repair_ip_wires_04', title: 'REPAIR IP WIRES 04', label: 'Lever 04', targetTile: { x: 19, y: 0, z: 27 } },
            ],
        },
        ip_patch_panel_classes: {
            gameplayId: 'ip_patch_panel_classes',
            mapId: 4,
            label: 'IP Patch Panel',
            competencyKey: 'mask_ip_classification',
            competencyLabel: 'Subnet mask and IP class classification',
            targetClearMs: 140000,
            objectiveHandler: { manager: 'PatchPanelGameplayManager', method: '_handlePatchObjective' },
            quests: [
                { id: 'stage.4.ip_patch_panel.01', objectiveId: 'route_ip_patch_panel_01', title: 'SECURE PATCH PANEL NODE', label: 'Patch Panel Node', targetTile: { x: 10, y: 0, z: 18 } },
            ],
        },
        ip_cidr_binary_panel: {
            gameplayId: 'ip_cidr_binary_panel',
            mapId: 5,
            label: 'CIDR Binary Panel',
            competencyKey: 'cidr_custom_mask',
            competencyLabel: 'CIDR and custom subnet mask understanding',
            targetClearMs: 120000,
            objectiveHandler: { manager: 'CIDRPanelGameplayManager', method: '_handleCIDRObjective' },
            quests: [
                { id: 'stage.5.ip_cidr_panel.01', objectiveId: 'solve_cidr_panel_01', title: 'SOLVE CIDR BINARY PANEL', label: 'CIDR Binary Panel', targetTile: { x: 16, y: 0, z: 18 } },
            ],
        },
        ip_subnet_simulator: {
            gameplayId: 'ip_subnet_simulator',
            mapId: 5,
            label: 'Subnet Simulator',
            competencyKey: 'hosts_subnets_calculation',
            competencyLabel: 'Hosts and subnets calculation',
            targetClearMs: 150000,
            objectiveHandler: { manager: 'SubnetSimulatorGameplayManager', method: '_handleObjective' },
            quests: [
                { id: 'stage.5.ip_subnetsim.01', objectiveId: 'solve_subnet_sim_01', title: 'SOLVE SUBNET SIMULATOR', label: 'Subnet Simulator', targetTile: { x: 16, y: 0, z: 20 } },
            ],
        },
        ip_cidr_quarantine: {
            gameplayId: 'ip_cidr_quarantine',
            mapId: 11,
            label: 'CIDR Quarantine',
            competencyKey: 'cidr_quarantine_zone',
            competencyLabel: 'CIDR quarantine zone construction',
            targetClearMs: 150000,
            objectiveHandler: { manager: 'CIDRQuarantineGameplayManager', method: '_handleObjective' },
            failureHandler: { manager: 'CIDRQuarantineGameplayManager', method: 'recoverAfterFailure' },
            quests: [
                { id: 'stage.11.cidr_quarantine.01.tutorial', objectiveId: 'solve_cidr_quarantine_01', title: 'CALIBRATE QUARANTINE NODE', label: 'Quarantine Node 01', tutorial: true, targetTile: { x: 13, y: 0, z: 9 }, profile: { index: 1, minHosts: 18, maxHosts: 34 } },
                { id: 'stage.11.cidr_quarantine.02', objectiveId: 'solve_cidr_quarantine_02', title: 'TRAP ROGUE AI CLUSTER', label: 'Quarantine Node 02', targetTile: { x: 25, y: 0, z: 10 }, profile: { index: 2, minHosts: 26, maxHosts: 58 } },
                { id: 'stage.11.cidr_quarantine.03', objectiveId: 'solve_cidr_quarantine_03', title: 'SEAL INFECTED SEGMENT', label: 'Quarantine Node 03', targetTile: { x: 8, y: 0, z: 21 }, profile: { index: 3, minHosts: 42, maxHosts: 92 } },
                { id: 'stage.11.cidr_quarantine.04', objectiveId: 'solve_cidr_quarantine_04', title: 'LOCK APEX RELAY AI', label: 'Quarantine Node 04', targetTile: { x: 23, y: 0, z: 27 }, profile: { index: 4, minHosts: 70, maxHosts: 120 } },
            ],
        },
        ip_cidr_quarantine_matrix: {
            gameplayId: 'ip_cidr_quarantine_matrix',
            mapId: 12,
            label: 'CIDR Quarantine Matrix',
            competencyKey: 'cidr_multi_zone_quarantine',
            competencyLabel: 'Multi-zone CIDR quarantine construction',
            targetClearMs: 180000,
            objectiveHandler: { manager: 'CIDRQuarantineMatrixGameplayManager', method: '_handleObjective' },
            failureHandler: { manager: 'CIDRQuarantineMatrixGameplayManager', method: 'recoverAfterFailure' },
            quests: [
                { id: 'stage.12.cidr_matrix.01.tutorial', objectiveId: 'solve_cidr_matrix_01', title: 'CALIBRATE MATRIX NODE', label: 'Matrix Node 01', tutorial: true, targetTile: { x: 7, y: 0, z: 7 }, profile: { index: 1, zoneCount: 2, parentPrefix: 23 } },
                { id: 'stage.12.cidr_matrix.02', objectiveId: 'solve_cidr_matrix_02', title: 'SPLIT AI QUARANTINE', label: 'Matrix Node 02', targetTile: { x: 20, y: 0, z: 8 }, profile: { index: 2, zoneCount: 2, parentPrefix: 23 } },
                { id: 'stage.12.cidr_matrix.03', objectiveId: 'solve_cidr_matrix_03', title: 'SEAL SHARD TRIAD', label: 'Matrix Node 03', targetTile: { x: 27, y: 0, z: 17 }, profile: { index: 3, zoneCount: 3, parentPrefix: 23 } },
                { id: 'stage.12.cidr_matrix.04', objectiveId: 'solve_cidr_matrix_04', title: 'LOCK RELAY MATRIX', label: 'Matrix Node 04', targetTile: { x: 11, y: 0, z: 25 }, profile: { index: 4, zoneCount: 3, parentPrefix: 22 } },
                { id: 'stage.12.cidr_matrix.05', objectiveId: 'solve_cidr_matrix_05', title: 'FINALIZE AI CONTAINMENT', label: 'Matrix Node 05', targetTile: { x: 24, y: 0, z: 29 }, profile: { index: 5, zoneCount: 3, parentPrefix: 22 } },
            ],
        },
    },

    async boot() {
        this._injectMapHooks();
        this._setState(this.STATE.BOOT, { source: 'GameManager.boot' });
        await this.loadDialogueLibrary();
        this._ensureReportSession();
        return true;
    },

    async loadDialogueLibrary() {
        const dm = IP2Live.DialogueManager;
        if (!dm || typeof dm.loadDialogueLibrary !== 'function') return false;

        const root = Common && Common.Platform && Common.Platform.ROOT_DIRECTORY
            ? Common.Platform.ROOT_DIRECTORY
            : '';
        const src = root + 'Plugins/IP2Live_Core/modules/dialogues.json';

        try {
            const versionedSrc = src + '?v=20260526_dialogues_01_' + Date.now();
            let resp = await fetch(versionedSrc, { cache: 'no-store' });
            if (!resp.ok) {
                console.warn('[IP2Live] Versioned dialogue library fetch failed, retrying plain path:', versionedSrc);
                resp = await fetch(src, { cache: 'no-store' });
            }
            if (!resp.ok) throw new Error('HTTP ' + resp.status);

            const library = await resp.json();
            this._dialogueLibraryReady = dm.loadDialogueLibrary(library);
            console.log('[IP2Live] GameManager dialogue library loaded from:', resp.url || src);
            return this._dialogueLibraryReady;
        } catch (e) {
            console.warn('[IP2Live] GameManager could not load dialogue library:', src, e);
            return false;
        }
    },

    on(eventName, handler) {
        if (!eventName || typeof handler !== 'function') return function () {};
        if (!this._listeners[eventName]) this._listeners[eventName] = [];
        this._listeners[eventName].push(handler);
        return () => this.off(eventName, handler);
    },

    off(eventName, handler) {
        const list = this._listeners[eventName];
        if (!list || !list.length) return false;
        const index = list.indexOf(handler);
        if (index === -1) return false;
        list.splice(index, 1);
        return true;
    },

    emit(eventName, payload) {
        const event = {
            name: eventName,
            payload: payload || {},
            state: this.state,
            at: Date.now(),
        };
        const list = (this._listeners[eventName] || []).slice();
        for (let i = 0; i < list.length; i++) {
            try {
                list[i](event.payload, event);
            } catch (e) {
                console.warn('[IP2Live] GameManager listener failed for ' + eventName + ':', e);
            }
        }
        return event;
    },

    _ensureReportSession() {
        if (this._reportSessionId) return this._reportSessionId;
        const ts = Date.now();
        this._reportSessionId = 'session-' + ts + '-' + Math.floor(Math.random() * 99999);
        this._logTelemetryEvent('session_start', {
            sessionId: this._reportSessionId,
            mapId: this._currentMapId(),
        });
        return this._reportSessionId;
    },

    _nextTelemetrySeq() {
        this._reportTelemetrySequence = (this._reportTelemetrySequence || 0) + 1;
        return this._reportTelemetrySequence;
    },

    _deriveTelemetryProfileName(payload) {
        const game = Core && Core.Game ? Core.Game.current : null;
        const fromPayload = payload && payload.infiltratorName ? String(payload.infiltratorName).trim() : '';
        if (fromPayload && fromPayload.toUpperCase() !== 'UNKNOWN') return fromPayload;
        const fromGame = game && game.infiltratorName ? String(game.infiltratorName).trim() : '';
        if (fromGame && fromGame.toUpperCase() !== 'UNKNOWN') return fromGame;
        return 'UNKNOWN';
    },

    _logTelemetryEvent(eventType, payload) {
        const data = payload || {};
        const catalogEntry = data.gameplayId && this.gameplayCatalog[data.gameplayId]
            ? this.gameplayCatalog[data.gameplayId]
            : null;
        const record = {
            telemetryVersion: 'telemetry-20260529-01',
            sequence: this._nextTelemetrySeq(),
            sessionId: data.sessionId || this._ensureReportSession(),
            eventType: String(eventType || 'unknown'),
            timestamp: Number(data.timestamp) || Date.now(),
            infiltratorName: this._deriveTelemetryProfileName(data),
            gameplayId: data.gameplayId || null,
            gameplayLabel: data.gameplayLabel || (catalogEntry && catalogEntry.label) || null,
            competencyKey: data.competencyKey || (catalogEntry && catalogEntry.competencyKey) || null,
            competencyLabel: data.competencyLabel || (catalogEntry && catalogEntry.competencyLabel) || null,
            stageId: Number(data.stageId || data.mapId || 0) || 0,
            levelId: Number(data.levelId || 0) || 0,
            mapId: Number(data.mapId || 0) || 0,
            attemptId: data.attemptId || null,
            questId: data.questId || null,
            objectiveId: data.objectiveId || null,
            passed: data.passed === undefined ? null : !!data.passed,
            durationMs: Number(data.durationMs || 0) || 0,
            attemptsUsed: Number(data.attemptsUsed || 0) || 0,
            maxAttempts: Number(data.maxAttempts || 0) || 0,
            retries: Number(data.retries || 0) || 0,
            mistakeCount: Number(data.mistakeCount || 0) || 0,
            mistakeRate: Number(data.mistakeRate || 0) || 0,
            accuracy: Number(data.accuracy || 0) || 0,
            payload: this._clonePlain(data.payload || null),
            notes: data.notes || null,
        };

        if (IP2Live.ReportManager && typeof IP2Live.ReportManager.logTelemetryRecord === 'function') {
            IP2Live.ReportManager.logTelemetryRecord(record);
            return;
        }
        if (IP2Live.DBManager && typeof IP2Live.DBManager.saveRecord === 'function') {
            IP2Live.DBManager.saveRecord('telemetry', record).catch(function (e) {
                console.warn('[IP2Live] Telemetry write failed:', e);
            });
        }
    },

    _reportActiveAttempt(gameplayId) {
        if (!gameplayId) return null;
        return this._reportActiveAttempts[gameplayId] || null;
    },

    _openReportAttempt(gameplayId, payload) {
        const data = payload || {};
        const catalog = gameplayId ? this.gameplayCatalog[gameplayId] : null;
        const attempt = {
            attemptId: 'attempt-' + gameplayId + '-' + Date.now() + '-' + Math.floor(Math.random() * 99999),
            startedAt: Date.now(),
            sessionId: this._ensureReportSession(),
            gameplayId: gameplayId,
            gameplayLabel: catalog && catalog.label ? catalog.label : gameplayId,
            competencyKey: catalog && catalog.competencyKey ? catalog.competencyKey : null,
            competencyLabel: catalog && catalog.competencyLabel ? catalog.competencyLabel : null,
            mapId: Number(data.mapId || this._currentMapId() || 0) || 0,
            stageId: Number(data.mapId || this._currentMapId() || 0) || 0,
            levelId: Number((this._stageFor(data.mapId || this._currentMapId()) || {}).level || 0) || 0,
            questId: data.questId || null,
            objectiveId: data.objectiveId || null,
            retries: 0,
            mistakeCount: 0,
            mistakes: [],
        };
        this._reportActiveAttempts[gameplayId] = attempt;
        this._logTelemetryEvent('attempt_start', attempt);
        return attempt;
    },

    _closeReportAttempt(gameplayId, payload, passed) {
        const data = payload || {};
        const open = this._reportActiveAttempt(gameplayId) || this._openReportAttempt(gameplayId, data);
        const endedAt = Date.now();
        const durationMs = Math.max(0, endedAt - Number(open.startedAt || endedAt));
        const metrics = this._extractGameplayMetrics(gameplayId, data.result || data.payload || {});

        const completion = {
            sessionId: open.sessionId,
            attemptId: open.attemptId,
            gameplayId: open.gameplayId,
            gameplayLabel: open.gameplayLabel,
            competencyKey: open.competencyKey,
            competencyLabel: open.competencyLabel,
            mapId: open.mapId,
            stageId: open.stageId,
            levelId: open.levelId,
            questId: open.questId,
            objectiveId: open.objectiveId,
            timestamp: endedAt,
            passed: !!passed,
            durationMs: durationMs,
            retries: open.retries || 0,
            mistakeCount: open.mistakeCount || 0,
            attemptsUsed: Number(metrics.attemptsUsed || 0) || 0,
            maxAttempts: Number(metrics.maxAttempts || 0) || 0,
            mistakeRate: Number(metrics.mistakeRate || 0) || 0,
            accuracy: Number(metrics.accuracy || 0) || 0,
            payload: Object.assign({}, metrics.payload || {}, {
                result: this._clonePlain(data.result || {}),
                mistakes: this._clonePlain(open.mistakes || []),
            }),
            notes: metrics.notes || null,
        };
        delete this._reportActiveAttempts[gameplayId];
        this._logTelemetryEvent('attempt_end', completion);
        return completion;
    },

    _extractGameplayMetrics(gameplayId, result) {
        const r = result || {};
        if (gameplayId === 'ip_class_wires') {
            const mistakes = Array.isArray(r.mistakes) ? r.mistakes : [];
            const attemptsUsed = Number(r.attemptsUsed || mistakes.length || 0) || 0;
            const maxAttempts = Number(r.maxAttempts || 3) || 3;
            const accuracy = maxAttempts > 0 ? Math.max(0, Math.min(1, (maxAttempts - attemptsUsed) / maxAttempts)) : 0;
            return {
                attemptsUsed: attemptsUsed,
                maxAttempts: maxAttempts,
                mistakeRate: maxAttempts > 0 ? attemptsUsed / maxAttempts : 0,
                accuracy: accuracy,
                payload: {
                    wrongMappings: mistakes.map(function (m) {
                        return { sourceClass: m && m.sourceClass, targetClass: m && m.targetClass };
                    }),
                },
            };
        }
        if (gameplayId === 'ip_patch_panel_classes') {
            const delivered = Number(r.delivered || r.totalPackets || 0) || 0;
            const mistakes = Number(r.mistakes || 0) || 0;
            const correct = Math.max(0, delivered - mistakes);
            const accuracy = delivered > 0 ? correct / delivered : 0;
            return {
                attemptsUsed: delivered,
                maxAttempts: Number(r.totalPackets || delivered || 0) || 0,
                retries: Number(r.restarts || 0) || 0,
                mistakeRate: delivered > 0 ? mistakes / delivered : 0,
                accuracy: accuracy,
                payload: {
                    score: Number(r.score || 0) || 0,
                    targetScore: Number(r.targetScore || 0) || 0,
                    misroutes: mistakes,
                    restarts: Number(r.restarts || 0) || 0,
                },
            };
        }
        if (gameplayId === 'ip_cidr_binary_panel') {
            const cidr = Number(r.cidr);
            const entered = Number(r.enteredCIDR);
            const errorDistance = Number.isFinite(cidr) && Number.isFinite(entered) ? Math.abs(cidr - entered) : null;
            return {
                attemptsUsed: 1,
                maxAttempts: 1,
                retries: Number(r.retries || 0) || 0,
                mistakeRate: Number(r.passed) === false ? 1 : 0,
                accuracy: Number.isFinite(errorDistance) ? (errorDistance === 0 ? 1 : 0) : (r.passed ? 1 : 0),
                payload: {
                    expectedCIDR: Number.isFinite(cidr) ? cidr : null,
                    enteredCIDR: Number.isFinite(entered) ? entered : null,
                    cidrErrorDistance: errorDistance,
                    mask: r.mask || null,
                    firstTrySuccess: r.firstTrySuccess === undefined ? null : !!r.firstTrySuccess,
                },
            };
        }
        if (gameplayId === 'ip_subnet_simulator') {
            const slotStats = r.slotStats || {};
            const totalChecks = Number(slotStats.totalChecks || 0) || 0;
            const wrongChecks = Number(slotStats.wrongChecks || 0) || 0;
            const accuracy = totalChecks > 0 ? Math.max(0, Math.min(1, (totalChecks - wrongChecks) / totalChecks)) : (r.passed ? 1 : 0);
            return {
                attemptsUsed: Number(r.validationAttempts || 1) || 1,
                maxAttempts: 0,
                retries: Math.max(0, (Number(r.validationAttempts || 1) || 1) - 1),
                mistakeRate: totalChecks > 0 ? wrongChecks / totalChecks : (r.passed ? 0 : 1),
                accuracy: accuracy,
                payload: {
                    answers: this._clonePlain(r.answers || {}),
                    slotStats: this._clonePlain(slotStats),
                    wrongSlotFrequency: this._clonePlain(slotStats.wrongSlotFrequency || {}),
                },
            };
        }
        if (gameplayId === 'ip_cidr_quarantine' || gameplayId === 'ip_cidr_quarantine_matrix') {
            const attemptsUsed = Number(r.attemptsUsed || 0) || 0;
            const maxAttempts = Number(r.maxAttempts || 3) || 3;
            const passed = r.passed !== false;
            return {
                attemptsUsed: attemptsUsed,
                maxAttempts: maxAttempts,
                retries: Number(r.retries || Math.max(0, attemptsUsed - 1)) || 0,
                mistakeRate: maxAttempts > 0 ? Math.max(0, Math.min(1, passed ? Math.max(0, attemptsUsed - 1) / maxAttempts : attemptsUsed / maxAttempts)) : 0,
                accuracy: passed ? Math.max(0, Math.min(1, (maxAttempts - Math.max(0, attemptsUsed - 1)) / maxAttempts)) : 0,
                payload: {
                    problemId: r.problemId || null,
                    baseCIDR: r.baseCIDR || null,
                    hostDemand: r.hostDemand || null,
                    zoneCount: r.zoneCount || null,
                    selectedCIDR: r.selectedCIDR || null,
                    selectedCIDRs: this._clonePlain(r.selectedCIDRs || []),
                    solutionCIDR: r.solutionCIDR || null,
                    solutionCIDRs: this._clonePlain(r.solutionCIDRs || []),
                    diagnosticReason: r.diagnosticReason || null,
                },
            };
        }
        return {
            attemptsUsed: Number(r.attemptsUsed || 0) || 0,
            maxAttempts: Number(r.maxAttempts || 0) || 0,
            retries: Number(r.retries || 0) || 0,
            mistakeRate: Number(r.mistakeRate || 0) || 0,
            accuracy: Number(r.accuracy || 0) || 0,
            payload: this._clonePlain(r || {}),
        };
    },

    startNewGameFlow(playerName) {
        return this.startTutorialFlow({
            playerName,
            useLoading: false,
            source: 'GameManager.startNewGameFlow',
        });
    },

    startTutorialFlow(options) {
        const opts = options || {};
        const mapManager = IP2Live.MapManager;
        const tutorialMapId = mapManager && typeof mapManager.getInitialMapId === 'function'
            ? mapManager.getInitialMapId()
            : 1;

        this._tutorialIntroPending = false;
        return this.startMapFlow(tutorialMapId, opts.spawn || null, Object.assign({
            mode: 'tutorial',
            status: 'Loading Tutorial Stage',
            detail: 'Loading New Game',
            source: 'GameManager.startTutorialFlow',
        }, opts));
    },

    startMapFlow(mapId, spawn, context) {
        const mapManager = IP2Live.MapManager;
        if (!mapManager || typeof mapManager.goTo !== 'function') return false;

        const opts = context || {};
        const targetMapId = Number(mapId) || 1;
        const stage = this._stageFor(targetMapId);
        const mapConfig = this.flowConfig.maps[targetMapId] || {};
        const flowMode = opts.mode || mapConfig.mode || (stage && stage.tutorial ? 'tutorial' : 'stage');
        const flowId = ++this._flowSerial;
        this._prepareTransitionState(targetMapId, flowMode);

        this._activeMapFlow = {
            id: flowId,
            mapId: targetMapId,
            mode: flowMode,
            spawn: this._cloneTile(spawn || opts.spawn || mapConfig.spawn || (stage && stage.spawn)),
            context: opts,
            titleFinished: false,
        };
        this._setState(this.STATE.MAP_LOAD, { mapId: targetMapId, mode: flowMode });

        mapManager.goTo(targetMapId, {
            _fromGameManager: true,
            useLoading: opts.useLoading,
            loadingMode: opts.loadingMode,
            status: opts.status,
            detail: opts.detail || (stage && stage.name) || mapConfig.name,
            fadeMusicOnStart: opts.fadeMusicOnStart,
            musicFadeDurationMs: opts.musicFadeDurationMs,
            spawn: this._activeMapFlow.spawn,
            onAfterLoad: (loadedMapId) => {
                this._onMapLoaded(loadedMapId, opts);
                if (typeof opts.onAfterLoad === 'function') opts.onAfterLoad(loadedMapId);
            },
        });
        return true;
    },

    startWorldTitleForMap(mapId, context) {
        const overlay = IP2Live.WorldTitleOverlay;
        if (overlay && typeof overlay.start === 'function') {
            this._setState(this.STATE.WORLD_TITLE, { mapId, source: 'GameManager.startWorldTitleForMap' });
            overlay.start(mapId, context || {});
            return true;
        }
        this.handleWorldTitleFinished(mapId, context || {});
        return false;
    },

    handleWorldTitleStarted(mapId, context) {
        const resolvedMapId = Number(mapId) || this._currentMapId();
        this._setState(this.STATE.WORLD_TITLE, { mapId: resolvedMapId });
        this.emit(this.EVENT.WORLD_TITLE_STARTED, Object.assign({}, context || {}, {
            mapId: resolvedMapId,
            scene: this._currentScene(),
        }));
        return true;
    },

    handleWorldTitleFinished(mapId, context) {
        const resolvedMapId = Number(mapId) || this._currentMapId();
        if (!resolvedMapId) return false;

        const scene = this._currentScene();
        const finishKey = this._sceneKey(scene, resolvedMapId);
        if (this._lastWorldTitleFinishKey === finishKey) return false;
        this._lastWorldTitleFinishKey = finishKey;

        if (this._activeMapFlow && this._activeMapFlow.mapId === resolvedMapId) {
            this._activeMapFlow.titleFinished = true;
        }

        const payload = Object.assign({}, context || {}, {
            mapId: resolvedMapId,
            scene,
            trigger: 'worldTitle.finished',
        });
        this.emit(this.EVENT.WORLD_TITLE_FINISHED, payload);
        this._afterWorldTitle(resolvedMapId, payload);
        return true;
    },

    handleTutorialStart(context) {
        const mapId = Number(context && context.mapId) || this._currentMapId();
        const stage = this._stageFor(mapId);
        if (!stage || !stage.tutorial) return false;
        return this._runTutorialIntroThenActivate(Object.assign({
            mapId,
            scene: this._currentScene(),
            trigger: 'worldTitle.finished',
            source: 'GameManager.handleTutorialStart',
        }, context || {}));
    },

    handlesMapIntro(mapId) {
        const resolvedMapId = Number(mapId) || this._currentMapId();
        const stage = this._stageFor(resolvedMapId);
        if (stage && stage.tutorial) return true;

        const scope = this._mapScope(resolvedMapId, {
            trigger: 'worldTitle.finished',
            scene: this._currentScene(),
        });
        return this._dialogueIdsForTiming(scope, 'after').length > 0;
    },

    startGameplayNode(nodeId, context) {
        const node = this.flowConfig.gameplayNodes[nodeId];
        if (!node) return false;

        const opts = context || {};
        const spec = opts.spec || {};
        const objectiveId = opts.objectiveId || spec.objectiveId || null;
        const questId = opts.questId || spec.id || null;
        const attemptKey = nodeId + ':' + (questId || 'quest') + ':' + (objectiveId || 'objective');

        if (this._activeGameplayNode === attemptKey) return false;
        this._activeGameplayNode = attemptKey;

        const payload = Object.assign({}, opts, {
            nodeId,
            gameplayId: node.id,
            mapId: Number(opts.mapId) || node.mapId,
            questId,
            objectiveId,
            trigger: 'gameplay.before',
        });

        const openGameplay = () => {
            this._setState(this.STATE.GAMEPLAY_ACTIVE, payload);
            this.emit(this.EVENT.GAMEPLAY_STARTED, payload);
            this._openReportAttempt(node.id, payload);
            if (node.id === 'ip_class_wires' && IP2Live.GameplayManager && typeof IP2Live.GameplayManager.launchWireGameplay === 'function') {
                return IP2Live.GameplayManager.launchWireGameplay(Object.assign({}, opts, {
                    _fromGameManager: true,
                    _reservedAttempt: (questId || spec.id) + ':' + (objectiveId || spec.objectiveId),
                }));
            }
            if (node.id === 'ip_patch_panel_classes' && IP2Live.PatchPanelGameplayManager && typeof IP2Live.PatchPanelGameplayManager.launchPatchPanelGameplay === 'function') {
                return IP2Live.PatchPanelGameplayManager.launchPatchPanelGameplay(Object.assign({}, opts, {
                    _fromGameManager: true,
                    showIntro: opts.showIntro,
                    mode: 'replace',
                }));
            }
            if (node.id === 'ip_cidr_binary_panel' && IP2Live.CIDRPanelGameplayManager && typeof IP2Live.CIDRPanelGameplayManager.launchCIDRGameplay === 'function') {
                return IP2Live.CIDRPanelGameplayManager.launchCIDRGameplay(Object.assign({}, opts, {
                    _fromGameManager: true,
                    showIntro: opts.showIntro,
                    mode: 'replace',
                }));
            }
            if (node.id === 'ip_subnet_simulator' && IP2Live.SubnetSimulatorGameplayManager && typeof IP2Live.SubnetSimulatorGameplayManager.launchSubnetSimulatorGameplay === 'function') {
                return IP2Live.SubnetSimulatorGameplayManager.launchSubnetSimulatorGameplay(Object.assign({}, opts, {
                    _fromGameManager: true,
                    showIntro: opts.showIntro,
                    mode: 'replace',
                }));
            }
            if (node.id === 'ip_cidr_quarantine' && IP2Live.CIDRQuarantineGameplayManager && typeof IP2Live.CIDRQuarantineGameplayManager.launchCIDRQuarantineGameplay === 'function') {
                return IP2Live.CIDRQuarantineGameplayManager.launchCIDRQuarantineGameplay(Object.assign({}, opts, {
                    _fromGameManager: true,
                    showIntro: opts.showIntro,
                    mode: opts.mode || 'push',
                }));
            }
            if (node.id === 'ip_cidr_quarantine_matrix' && IP2Live.CIDRQuarantineMatrixGameplayManager && typeof IP2Live.CIDRQuarantineMatrixGameplayManager.launchCIDRQuarantineMatrixGameplay === 'function') {
                return IP2Live.CIDRQuarantineMatrixGameplayManager.launchCIDRQuarantineMatrixGameplay(Object.assign({}, opts, {
                    _fromGameManager: true,
                    showIntro: opts.showIntro,
                    mode: opts.mode || 'push',
                }));
            }
            return false;
        };

        this._setState(this.STATE.DIALOGUE_BEFORE, payload);
        const hadDialogue = this._runTimingDialogues(payload, 'before', openGameplay);
        if (!hadDialogue) openGameplay();
        return true;
    },

    handleGameplayMistake(gameplayId, payload) {
        const data = Object.assign({}, payload || {}, {
            gameplayId,
            trigger: 'gameplay.mistake',
        });
        this.emit('gameplay.mistake', data);
        const active = this._reportActiveAttempt(gameplayId) || this._openReportAttempt(gameplayId, data);
        if (active) {
            active.mistakeCount = (active.mistakeCount || 0) + 1;
            if (Array.isArray(data.mistakes) && data.mistakes.length) {
                for (let i = 0; i < data.mistakes.length; i++) active.mistakes.push(this._clonePlain(data.mistakes[i]));
            }
            this._logTelemetryEvent('attempt_mistake', {
                attemptId: active.attemptId,
                sessionId: active.sessionId,
                gameplayId: gameplayId,
                mapId: Number(data.mapId || active.mapId || this._currentMapId() || 0) || 0,
                questId: data.questId || active.questId || null,
                objectiveId: data.objectiveId || active.objectiveId || null,
                mistakeCount: active.mistakeCount,
                payload: {
                    mistakes: this._clonePlain(data.mistakes || []),
                    attemptsRemaining: Number(data.attemptsRemaining || 0) || 0,
                },
            });
        }

        const runDynamicFeedback = () => {
            if (gameplayId === 'ip_class_wires' && IP2Live.IPWiresTutorial && typeof IP2Live.IPWiresTutorial.showMistakeAnalysis === 'function') {
                IP2Live.IPWiresTutorial.showMistakeAnalysis(
                    data.mistakes || [],
                    data.attemptsRemaining || 0,
                    data.onComplete
                );
                return true;
            }
            if (typeof data.onComplete === 'function') data.onComplete();
            return false;
        };

        const hadDialogue = this._runTimingDialogues(data, 'during', runDynamicFeedback);
        if (!hadDialogue) return runDynamicFeedback();
        return true;
    },

    handleGameplayCompleted(gameplayId, payload) {
        const data = Object.assign({}, payload || {}, {
            gameplayId,
            trigger: 'gameplay.completed',
        });
        this._activeGameplayNode = null;
        this.emit(this.EVENT.GAMEPLAY_COMPLETED, data);
        this._closeReportAttempt(gameplayId, data, true);
        this._setState(this.STATE.DIALOGUE_AFTER, data);
        const hadDialogue = this._runTimingDialogues(data, 'after', () => {
            this._setState(this.STATE.NEXT_NODE, data);
        });
        if (!hadDialogue) this._setState(this.STATE.NEXT_NODE, data);
        return true;
    },

    handleGameplayFailed(gameplayId, payload) {
        const data = Object.assign({}, payload || {}, {
            gameplayId,
            trigger: 'gameplay.failed',
        });
        const spec = data.spec || {};
        this._activeGameplayNode = null;
        this.emit(this.EVENT.GAMEPLAY_FAILED, data);
        this._closeReportAttempt(gameplayId, data, false);
        this._setState(this.STATE.DIALOGUE_AFTER, data);

        const catalog = gameplayId && this.gameplayCatalog ? this.gameplayCatalog[gameplayId] : null;
        const failureHandler = catalog && catalog.failureHandler ? catalog.failureHandler : null;
        if (failureHandler) {
            const owner = IP2Live && failureHandler.manager ? IP2Live[failureHandler.manager] : null;
            const methodName = failureHandler.method;
            if (owner && typeof owner[methodName] === 'function') {
                const hadDialogue = this._runTimingDialogues(data, 'after', function () {
                    owner[methodName](spec, data);
                });
                if (!hadDialogue) owner[methodName](spec, data);
                return true;
            }
        }

        if (spec.tutorial) {
            const hadDialogue = this._runTimingDialogues(data, 'after');
            if (!hadDialogue && IP2Live.IPWiresTutorial && typeof IP2Live.IPWiresTutorial.showPacketsShifted === 'function') {
                IP2Live.IPWiresTutorial.showPacketsShifted();
            }
            return true;
        }

        if (IP2Live.GameplayManager && typeof IP2Live.GameplayManager._sendStageBackToFirstWire === 'function') {
            IP2Live.GameplayManager._sendStageBackToFirstWire(spec);
            return true;
        }
        return false;
    },

    handleQuestObjectiveCompleted(result) {
        this.emit(this.EVENT.QUEST_OBJECTIVE_COMPLETED, result || {});
        return true;
    },

    _onMapLoaded(mapId, context) {
        const resolvedMapId = Number(mapId) || this._currentMapId();
        const scene = this._currentScene();
        const stage = this._stageFor(resolvedMapId);

        this._prepareTransitionState(resolvedMapId, stage && stage.tutorial ? 'tutorial' : 'stage', { onLoad: true });

        this.emit(this.EVENT.MAP_ENTERED, {
            mapId: resolvedMapId,
            stage,
            scene,
            context: context || {},
        });

        this._prepareMapAfterLoad(resolvedMapId, scene);

        setTimeout(() => {
            const overlay = IP2Live.WorldTitleOverlay;
            if (!overlay || !overlay.isActive || !overlay.isActive()) {
                this.handleWorldTitleFinished(resolvedMapId, {
                    source: 'GameManager._onMapLoaded.noWorldTitle',
                });
            }
        }, 0);
    },

    _prepareMapAfterLoad(mapId, scene) {
        const stage = this._stageFor(mapId);
        if (stage && stage.tutorial) {
            if (IP2Live.LightingManager && typeof IP2Live.LightingManager.applyPreset === 'function') {
                IP2Live.LightingManager.applyPreset(mapId, scene || this._currentScene());
            }
            if (IP2Live.MusicManager && IP2Live.MusicManager.ZONE) {
                IP2Live.MusicManager.play(IP2Live.MusicManager.ZONE.TUTORIAL);
            }
        }
    },

    _afterWorldTitle(mapId, context) {
        const stage = this._stageFor(mapId);
        const scope = this._mapScope(mapId, context || {});
        this._setState(this.STATE.DIALOGUE_AFTER, scope);

        if (stage && stage.tutorial) {
            this._runTutorialIntroThenActivate(scope);
            return true;
        }

        return this._runTimingDialogues(scope, 'after');
    },

    _runTutorialIntroThenActivate(context) {
        const scene = this._currentScene();
        if (scene && scene._ip2liveGameManagerTutorialActivated) return true;
        if (this._tutorialIntroPending) return true;

        this._tutorialIntroPending = true;
        const scope = this._mapScope(Number(context && context.mapId) || 1, Object.assign({}, context || {}, {
            trigger: 'worldTitle.finished',
        }));

        const activateTutorial = () => {
            this._tutorialIntroPending = false;
            const currentScene = this._currentScene();
            if (currentScene) currentScene._ip2liveGameManagerTutorialActivated = true;
            if (IP2Live.LightingManager && typeof IP2Live.LightingManager.refresh === 'function') {
                IP2Live.LightingManager.refresh(currentScene);
            }
            if (IP2Live.Tutorial && typeof IP2Live.Tutorial.activate === 'function') {
                IP2Live.Tutorial.activate({
                    skipIntro: true,
                    source: 'GameManager.activateTutorial',
                    mapId: scope.mapId,
                    scene: currentScene,
                });
                return true;
            }
            return false;
        };

        const hadDialogue = this._runTimingDialogues(scope, 'after', activateTutorial);
        if (!hadDialogue) activateTutorial();
        return true;
    },

    _runTimingDialogues(scope, timing, onComplete) {
        const ids = this._dialogueIdsForTiming(scope, timing);
        if (!ids.length) {
            return false;
        }

        this._startDialogueSequence(ids, Object.assign({}, scope || {}, { timing }), onComplete);
        return true;
    },

    _startDialogueSequence(dialogueIds, context, onComplete) {
        const dm = IP2Live.DialogueManager;
        if (!dm || typeof dm.startById !== 'function') {
            if (typeof onComplete === 'function') onComplete();
            return false;
        }

        let index = 0;
        const next = () => {
            if (index >= dialogueIds.length) {
                if (typeof onComplete === 'function') onComplete();
                return true;
            }

            const dialogueId = dialogueIds[index++];
            const started = dm.startById(dialogueId, Object.assign({}, context || {}, {
                source: 'GameManager.dialogueSequence',
                onComplete: next,
            }));
            if (!started) return next();
            return true;
        };

        return next();
    },

    _dialogueIdsForTiming(scope, timing) {
        const dm = IP2Live.DialogueManager;
        if (!dm || typeof dm.queueByTiming !== 'function') return [];
        const ids = dm.queueByTiming(scope || {}, timing);
        return Array.isArray(ids) ? ids : [];
    },

    _mapScope(mapId, context) {
        const resolvedMapId = Number(mapId) || this._currentMapId();
        const stage = this._stageFor(resolvedMapId) || {};
        return Object.assign({}, context || {}, {
            mapId: resolvedMapId,
            stage: stage.stage,
            level: stage.level,
            scene: (context && context.scene) || this._currentScene(),
        });
    },

    getGameplayCatalog() {
        const out = [];
        const keys = Object.keys(this.gameplayCatalog || {});
        for (let i = 0; i < keys.length; i++) {
            const item = this.gameplayCatalog[keys[i]];
            if (!item) continue;
            out.push(this._clonePlain(item));
        }
        return out;
    },

    getGameplayQuestSpecs(gameplayId) {
        const key = String(gameplayId || '');
        const entry = this.gameplayCatalog[key];
        if (!entry || !Array.isArray(entry.quests)) return [];
        return this._clonePlain(entry.quests);
    },

    registerStageGameplayQuests(questManager, mapManager, stage) {
        const qm = questManager || IP2Live.QuestManager;
        const st = stage || {};
        const stageId = Number(st.id);
        if (!qm || !stageId || typeof qm.registerQuest !== 'function') return [];

        const registeredQuestIds = [];
        const catalog = this.getGameplayCatalog();
        for (let i = 0; i < catalog.length; i++) {
            const gameplay = catalog[i];
            if (!gameplay || Number(gameplay.mapId) !== stageId) continue;
            const quests = Array.isArray(gameplay.quests) ? gameplay.quests : [];
            for (let q = 0; q < quests.length; q++) {
                const spec = quests[q];
                if (!spec || !spec.id || !spec.objectiveId) continue;
                registeredQuestIds.push(spec.id);
                if (this._registeredGameplayQuestIds[spec.id] && qm.quests && qm.quests[spec.id]) continue;

                const target = this._cloneTile(spec.targetTile || { x: 0, y: 0, z: 0 });
                qm.registerQuest({
                    id: spec.id,
                    title: 'QUEST AREA',
                    stageMapId: stageId,
                    resetOnMapEnter: true,
                    objectives: [
                        {
                            id: spec.objectiveId,
                            title: spec.title || 'SOLVE OBJECTIVE',
                            detail: this._targetDetail(target),
                            targetTile: target,
                            completionRadiusTiles: 0.55,
                            isComplete: (context, activeQuestManager) => {
                                return this._runGameplayObjectiveHandler(gameplay, spec, context, activeQuestManager);
                            },
                        },
                    ],
                });
                this._registeredGameplayQuestIds[spec.id] = true;
            }
        }
        return registeredQuestIds;
    },

    _runGameplayObjectiveHandler(gameplay, spec, context, questManager) {
        if (!gameplay || !gameplay.objectiveHandler) return false;
        const handlerSpec = gameplay.objectiveHandler;
        const managerName = handlerSpec.manager;
        const methodName = handlerSpec.method;
        const owner = IP2Live && managerName ? IP2Live[managerName] : null;
        if (!owner || typeof owner[methodName] !== 'function') return false;
        try {
            return !!owner[methodName](spec, context, questManager);
        } catch (e) {
            console.warn('[IP2Live] GameManager objective handler failed for', gameplay.gameplayId, e);
            return false;
        }
    },

    _targetDetail(tile) {
        return 'TARGET TILE  X:' + tile.x + '  Y:' + (tile.y || 0) + '  Z:' + tile.z;
    },

    _clonePlain(value) {
        try {
            return JSON.parse(JSON.stringify(value || null));
        } catch (e) {
            return value || null;
        }
    },

    _setState(state, payload) {
        this.state = state;
        this.emit('state.changed', Object.assign({ state }, payload || {}));
        return state;
    },

    _stageFor(mapId) {
        return IP2Live.MapManager && typeof IP2Live.MapManager.stageFor === 'function'
            ? IP2Live.MapManager.stageFor(Number(mapId))
            : this.flowConfig.maps[Number(mapId)] || null;
    },

    _currentScene() {
        return Scene && Scene.Map ? Scene.Map.current : null;
    },

    _currentMapId() {
        const scene = this._currentScene();
        const mapId = scene && (
            scene.id ||
            scene.mapID ||
            (scene.currentMap && scene.currentMap.id) ||
            (Core.Game.current && Core.Game.current.currentMapID)
        );
        return Number(mapId) || (Core.Game.current && Number(Core.Game.current.currentMapID)) || 0;
    },

    setActiveSaveSlot(slotId) {
        const slot = Number(slotId);
        if (!Number.isInteger(slot) || slot <= 0) return false;
        this._activeSaveSlot = slot;
        if (Core && Core.Game && Core.Game.current) {
            this._assignSaveSlotToGame(Core.Game.current, slot);
        }
        return true;
    },

    _resolveActiveSaveSlot(preferredSlot) {
        const maxSlots = Math.max(1, Number(Data && Data.Systems && Data.Systems.saveSlots) || 1);
        const preferred = Number(preferredSlot);
        if (Number.isInteger(preferred) && preferred >= 1 && preferred <= maxSlots) return preferred;

        const game = Core && Core.Game ? Core.Game.current : null;
        const candidates = [
            game && game._ip2liveSaveSlot,
            this._activeSaveSlot,
            game && game.currentSlot,
            game && game.slotID,
            game && game.slotId,
            game && game.slot,
        ];
        for (let i = 0; i < candidates.length; i++) {
            const n = Number(candidates[i]);
            if (Number.isInteger(n) && n >= 1 && n <= maxSlots) return n;
        }
        return 1;
    },

    _assignSaveSlotToGame(game, slot) {
        if (!game) return;
        game._ip2liveSaveSlot = slot;
        if (Object.prototype.hasOwnProperty.call(game, 'currentSlot')) game.currentSlot = slot;
        if (Object.prototype.hasOwnProperty.call(game, 'slotID')) game.slotID = slot;
        if (Object.prototype.hasOwnProperty.call(game, 'slotId')) game.slotId = slot;
        if (Object.prototype.hasOwnProperty.call(game, 'slot')) game.slot = slot;
    },

    _resolveProfileName(game) {
        const g = game || (Core && Core.Game ? Core.Game.current : null);
        const candidates = [
            g && g.infiltratorName,
            g && g._ip2liveProfileName,
        ];
        for (let i = 0; i < candidates.length; i++) {
            const value = String(candidates[i] || '').trim();
            if (!value || value.toUpperCase() === 'UNKNOWN') continue;
            return value;
        }
        return null;
    },

    _readSlotSnapshotMap() {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return {};
            const raw = window.localStorage.getItem(this._slotSnapshotStorageKey);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object') ? parsed : {};
        } catch (e) {
            console.warn('[IP2Live] GameManager: failed reading slot snapshot cache', e);
            return {};
        }
    },

    _writeSlotSnapshotMap(map) {
        try {
            if (typeof window === 'undefined' || !window.localStorage) return false;
            const payload = map && typeof map === 'object' ? map : {};
            window.localStorage.setItem(this._slotSnapshotStorageKey, JSON.stringify(payload));
            return true;
        } catch (e) {
            console.warn('[IP2Live] GameManager: failed writing slot snapshot cache', e);
            return false;
        }
    },

    _persistSlotSnapshot(slot, snapshot) {
        const key = String(Number(slot) || 0);
        if (key === '0' || !snapshot) return false;
        const map = this._readSlotSnapshotMap();
        map[key] = Object.assign({}, snapshot, {
            slot: Number(slot) || 0,
            savedAt: Number(snapshot.savedAt) || Date.now(),
        });
        return this._writeSlotSnapshotMap(map);
    },

    _readSlotSnapshot(slot) {
        const key = String(Number(slot) || 0);
        if (key === '0') return null;
        const map = this._readSlotSnapshotMap();
        const snapshot = map[key];
        return snapshot && typeof snapshot === 'object' ? snapshot : null;
    },

    async _readProfileSlotSnapshot(profileName, slot) {
        const name = String(profileName || '').trim();
        if (!name || !IP2Live.DBManager || typeof IP2Live.DBManager.getRecord !== 'function') return null;
        try {
            const profile = await IP2Live.DBManager.getRecord('profiles', name);
            const map = profile && profile.progressBySlot && typeof profile.progressBySlot === 'object'
                ? profile.progressBySlot
                : null;
            if (!map) return null;
            const snapshot = map[String(slot)];
            if (!snapshot || typeof snapshot !== 'object') return null;
            return Object.assign({}, snapshot, {
                profileName: snapshot.profileName || name,
            });
        } catch (e) {
            console.warn('[IP2Live] GameManager: failed reading profile slot snapshot', name, slot, e);
            return null;
        }
    },

    async getSlotProgressSnapshot(slot, options) {
        const resolvedSlot = this._resolveActiveSaveSlot(slot);
        const opts = options || {};
        const profileName = String(opts.infiltratorName || this._resolveProfileName(opts.loadedGame) || '').trim();

        let profileSnapshot = null;
        if (profileName) profileSnapshot = await this._readProfileSlotSnapshot(profileName, resolvedSlot);
        const cachedSnapshot = this._readSlotSnapshot(resolvedSlot);

        if (!profileSnapshot && !cachedSnapshot) return null;
        if (profileSnapshot && !cachedSnapshot) return profileSnapshot;
        if (!profileSnapshot && cachedSnapshot) return cachedSnapshot;

        const pTime = Number(profileSnapshot.savedAt) || 0;
        const cTime = Number(cachedSnapshot.savedAt) || 0;
        return cTime >= pTime ? cachedSnapshot : profileSnapshot;
    },

    async _saveCoreGame(slot) {
        const game = Core && Core.Game ? Core.Game.current : null;
        if (!game || typeof game.save !== 'function') return false;
        this._assignSaveSlotToGame(game, slot);

        try {
            const result = game.save.length > 0 ? game.save(slot) : game.save();
            if (result && typeof result.then === 'function') await result;
            return true;
        } catch (e1) {
            try {
                const retry = game.save();
                if (retry && typeof retry.then === 'function') await retry;
                return true;
            } catch (e2) {
                console.warn('[IP2Live] GameManager: core save failed for slot', slot, e2);
                return false;
            }
        }
    },

    _buildQuestSnapshot() {
        const qm = IP2Live.QuestManager;
        if (!qm) return null;
        if (typeof qm.snapshotProgress === 'function') return qm.snapshotProgress();
        return {
            activeQuestId: qm.activeQuestId || null,
            activeObjectiveId: qm.activeObjectiveId || null,
            activeMapId: qm.activeMapId || null,
            completedObjectives: qm.completedObjectives || {},
            capturedAt: Date.now(),
        };
    },

    _captureHeroPosition(game) {
        const g = game || (Core && Core.Game ? Core.Game.current : null);
        const hero = (g && g.hero) || (IP2Live.QuestManager && typeof IP2Live.QuestManager._questHero === 'function' ? IP2Live.QuestManager._questHero() : null);
        const p = hero && hero.position ? hero.position : null;
        if (!p) return null;
        const x = Number(p.x);
        const y = Number(p.y);
        const z = Number(p.z);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
        return { x: x, y: y, z: z };
    },

    _applyHeroPosition(game, position) {
        const g = game || (Core && Core.Game ? Core.Game.current : null);
        if (!g || !g.hero || !g.hero.position || !position) return false;
        const x = Number(position.x);
        const y = Number(position.y);
        const z = Number(position.z);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
        g.hero.position.x = x;
        g.hero.position.y = y;
        g.hero.position.z = z;
        return true;
    },

    async saveProgressToActiveSlot(preferredSlot, saveName) {
        const slot = this._resolveActiveSaveSlot(preferredSlot);
        const game = Core && Core.Game ? Core.Game.current : null;
        if (!game) return { saved: false, reason: 'no-game' };

        const coreSaved = await this._saveCoreGame(slot);
        if (!coreSaved) return { saved: false, reason: 'core-save-failed', slot: slot };

        this.setActiveSaveSlot(slot);
        const profileName = this._resolveProfileName(game);
        if (profileName) {
            game._ip2liveProfileName = profileName;
            game.infiltratorName = profileName;
        }
        const mapId = Number(game.currentMapID) || this._currentMapId() || 1;
        const stage = this._stageFor(mapId) || {};
        const snapshot = {
            slot: slot,
            saveName: String(saveName || '').trim() || null,
            profileName: profileName || null,
            mapId: mapId,
            stage: stage.stage || null,
            level: stage.level || null,
            heroPosition: this._captureHeroPosition(game),
            questState: this._buildQuestSnapshot(),
            savedAt: Date.now(),
        };
        this._persistSlotSnapshot(slot, snapshot);

        if (profileName && IP2Live.DBManager && typeof IP2Live.DBManager.getRecord === 'function' && typeof IP2Live.DBManager.saveRecord === 'function') {
            try {
                const existing = await IP2Live.DBManager.getRecord('profiles', profileName) || {
                    infiltratorName: profileName,
                    createdAt: Date.now(),
                };
                if (!existing.progressBySlot || typeof existing.progressBySlot !== 'object') existing.progressBySlot = {};
                existing.progressBySlot[String(slot)] = snapshot;
                existing.lastSavedSlot = slot;
                existing.currentMapId = mapId;
                existing.playTime = game.playTime || existing.playTime || 0;
                existing.updatedAt = Date.now();
                await IP2Live.DBManager.saveRecord('profiles', existing);
            } catch (e) {
                console.warn('[IP2Live] GameManager: could not persist profile snapshot for slot', slot, e);
            }
        }
        return { saved: true, slot: slot, mapId: mapId, snapshot: snapshot };
    },

    async restoreProgressFromSlot(slotId, loadedGame) {
        const slot = this._resolveActiveSaveSlot(slotId);
        const game = loadedGame || (Core && Core.Game ? Core.Game.current : null);
        if (!game) return { restored: false, reason: 'no-game' };
        this.setActiveSaveSlot(slot);

        const snapshot = await this.getSlotProgressSnapshot(slot, { loadedGame: game });
        if (!snapshot) return { restored: false, reason: 'no-slot-snapshot' };

        const profileName = String(snapshot.profileName || '').trim();
        if (profileName) {
            game._ip2liveProfileName = profileName;
            game.infiltratorName = profileName;
        }
        if (Number(snapshot.mapId) > 0) {
            game.currentMapID = Number(snapshot.mapId);
        }

        const qm = IP2Live.QuestManager;
        const positionApplied = this._applyHeroPosition(game, snapshot.heroPosition);
        if (snapshot.heroPosition) {
            game._ip2livePendingHeroPosition = {
                x: Number(snapshot.heroPosition.x),
                y: Number(snapshot.heroPosition.y),
                z: Number(snapshot.heroPosition.z),
                mapId: Number(snapshot.mapId) || Number(game.currentMapID) || 0,
                slot: slot,
                restoredAt: Date.now(),
            };
        }

        if (snapshot.questState && qm && typeof qm.restoreProgress === 'function') {
            qm.restoreProgress(snapshot.questState, {
                mapId: Number(game.currentMapID) || snapshot.mapId || this._currentMapId(),
            });
            return { restored: true, slot: slot, snapshot: snapshot, positionApplied: positionApplied };
        }
        return { restored: !!positionApplied, slot: slot, snapshot: snapshot, reason: 'quest-state-missing-or-manager-unavailable' };
    },

    async exportProgressReport(options) {
        const opts = options || {};
        const scopeDays = Number(opts.scopeDays || 30) || 30;
        const format = String(opts.format || 'both').toLowerCase();
        const profileName = this._resolveProfileName((Core && Core.Game) ? Core.Game.current : null) || 'UNKNOWN';
        if (!IP2Live.ReportManager || typeof IP2Live.ReportManager.export !== 'function') {
            return { ok: false, reason: 'report-manager-missing' };
        }
        return IP2Live.ReportManager.export({
            infiltratorName: profileName,
            scopeDays: scopeDays,
            format: format,
            filenameBase: opts.filenameBase || null,
            gameplayCatalog: this.getGameplayCatalog(),
        });
    },

    skipCurrentFloorQuests(mapId) {
        if (!this.enableQuestSkipButton) return false;
        const resolvedMapId = Number(mapId) || this._currentMapId();
        if (!resolvedMapId) return false;

        const questManager = IP2Live.QuestManager;
        if (!questManager || typeof questManager.skipToStageExitQuest !== 'function') return false;

        return !!questManager.skipToStageExitQuest(resolvedMapId, {
            exitQuestId: 'stage.default_exit.' + resolvedMapId,
        });
    },

    _injectMapHooks() {
        if (!Scene || !Scene.Map || !Scene.Map.prototype) return false;
        if (Scene.Map.prototype._ip2liveGameManagerSkipButtonInjected) return false;
        Scene.Map.prototype._ip2liveGameManagerSkipButtonInjected = true;

        const manager = this;
        const originalDrawHUD = Scene.Map.prototype.drawHUD;
        Scene.Map.prototype.drawHUD = function () {
            if (typeof originalDrawHUD === 'function') originalDrawHUD.call(this);
            manager._drawQuestSkipButton(Common && Common.Platform ? Common.Platform.ctx : null, this);
        };

        const originalOnMouseUp = Scene.Map.prototype.onMouseUp;
        Scene.Map.prototype.onMouseUp = function (x, y) {
            if (manager._onMapMouseUp(x, y, this)) return true;
            if (typeof originalOnMouseUp === 'function') return originalOnMouseUp.call(this, x, y);
            return false;
        };
        return true;
    },

    _drawQuestSkipButton(ctx, scene) {
        this._skipQuestButtonRect = null;
        if (!this.enableQuestSkipButton || !ctx || !scene) return false;
        if (!this._isGameplayStageScene(scene)) return false;

        const mapId = this._mapIdFromScene(scene);
        if (!mapId) return false;

        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const sX = cW / SW;
        const sY = cH / SH;
        const w = 220 * sX;
        const h = 46 * sY;
        const x = cW - w - 18 * sX;
        const y = 16 * sY;
        const active = this._hasSkippableFloorQuests(mapId);

        this._skipQuestButtonRect = { x, y, w, h, mapId, active };

        ctx.save();
        ctx.fillStyle = active ? 'rgba(255,0,60,0.92)' : 'rgba(65,72,86,0.86)';
        ctx.strokeStyle = active ? '#FFE600' : 'rgba(218,238,255,0.6)';
        ctx.lineWidth = 2 * sX;

        ctx.beginPath();
        ctx.moveTo(x + 18 * sX, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - 14 * sX, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + 10 * sY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + Math.round(11 * sX) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SKIP FLOOR QUESTS', x + w * 0.52, y + 18 * sY);
        ctx.font = Math.round(8.5 * sX) + 'px monospace';
        ctx.fillStyle = active ? '#FFE600' : 'rgba(218,238,255,0.9)';
        ctx.fillText(
            active ? 'CLICK: KEEP EXIT NODE ONLY' : 'NO SKIPPABLE QUESTS',
            x + w * 0.52,
            y + 34 * sY
        );
        ctx.restore();
        return true;
    },

    _onMapMouseUp(x, y, scene) {
        if (!this.enableQuestSkipButton || !scene || !this._skipQuestButtonRect) return false;
        if (!this._isGameplayStageScene(scene)) return false;
        if (IP2Live.DialogueManager && typeof IP2Live.DialogueManager.isActive === 'function' && IP2Live.DialogueManager.isActive()) {
            return false;
        }

        const rect = this._skipQuestButtonRect;
        const mx = Number(x);
        const my = Number(y);
        const inside = mx >= rect.x && mx <= rect.x + rect.w && my >= rect.y && my <= rect.y + rect.h;
        if (!inside) return false;

        const changed = this.skipCurrentFloorQuests(rect.mapId);
        if (changed) this._playConfirm();
        else this._playCursor();
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        return true;
    },

    _hasSkippableFloorQuests(mapId) {
        const questManager = IP2Live.QuestManager;
        if (!questManager || !questManager.mapQuestQueues || !questManager.quests) return false;

        const resolvedMapId = Number(mapId) || 0;
        if (!resolvedMapId) return false;
        const queue = questManager.mapQuestQueues[resolvedMapId];
        const questIds = queue && Array.isArray(queue.questIds) ? queue.questIds : [];
        if (!questIds.length) return false;

        const exitQuestId = 'stage.default_exit.' + resolvedMapId;
        for (let i = 0; i < questIds.length; i++) {
            const questId = questIds[i];
            if (!questId || questId === exitQuestId) continue;
            const quest = questManager.quests[questId];
            if (!quest || !Array.isArray(quest.objectives)) continue;
            const completed = questManager.completedObjectives[questId] || {};
            for (let o = 0; o < quest.objectives.length; o++) {
                const objectiveId = quest.objectives[o] && quest.objectives[o].id;
                if (objectiveId && !completed[objectiveId]) return true;
            }
        }
        return false;
    },

    _isGameplayStageScene(scene) {
        const mapId = this._mapIdFromScene(scene);
        if (!mapId) return false;
        if (IP2Live.MapManager && typeof IP2Live.MapManager.isGameplayStage === 'function') {
            return !!IP2Live.MapManager.isGameplayStage(mapId);
        }
        const stage = this._stageFor(mapId);
        return !!(stage && !stage.tutorial);
    },

    _mapIdFromScene(scene) {
        const current = scene || this._currentScene();
        const mapId = current && (
            current.id ||
            current.mapID ||
            (current.currentMap && current.currentMap.id) ||
            (Core.Game.current && Core.Game.current.currentMapID)
        );
        return Number(mapId) || (Core.Game.current && Number(Core.Game.current.currentMapID)) || 0;
    },

    _playCursor() {
        try { if (Data.Systems.soundCursor) Data.Systems.soundCursor.playSound(); } catch (e) {}
    },

    _playConfirm() {
        try { if (Data.Systems.soundConfirmation) Data.Systems.soundConfirmation.playSound(); } catch (e) {}
    },

    _sceneKey(scene, mapId) {
        if (!scene) return String(mapId || 0) + ':unknown';
        if (!scene._ip2liveGameManagerSceneId) {
            scene._ip2liveGameManagerSceneId = ++this._flowSerial;
        }
        return String(mapId || 0) + ':' + scene._ip2liveGameManagerSceneId;
    },

    _cloneTile(tile) {
        if (!tile) return null;
        return {
            x: Number(tile.x) || 0,
            y: Number(tile.y) || 0,
            z: Number(tile.z) || 0,
        };
    },

    _prepareTransitionState(mapId, mode, options) {
        const opts = options || {};
        const tutorial = IP2Live.Tutorial;
        if (!opts.onLoad && tutorial) {
            if (typeof tutorial.forceResetState === 'function') {
                tutorial.forceResetState({
                    hideQuest: mode === 'tutorial',
                });
            } else {
                if (tutorial._stepTimeout) {
                    clearTimeout(tutorial._stepTimeout);
                    tutorial._stepTimeout = null;
                }
                if (typeof tutorial._detachListeners === 'function') tutorial._detachListeners();
                if (typeof tutorial._removeQuestWorldGuides === 'function') tutorial._removeQuestWorldGuides();
                if (tutorial.pressedKeys && typeof tutorial.pressedKeys.clear === 'function') tutorial.pressedKeys.clear();
                tutorial.isActive = false;
                tutorial.isFadingOut = false;
                tutorial.fadeMode = null;
                tutorial.fadeAlpha = 0;
                tutorial._teleported = false;
                if (tutorial.PHASE) tutorial.phase = tutorial.PHASE.IDLE;
            }
        }

        const dm = IP2Live.DialogueManager;
        if (dm && typeof dm.resetTransitionState === 'function') {
            dm.resetTransitionState({ stopActive: !opts.onLoad });
        } else if (dm && !opts.onLoad && typeof dm.stop === 'function' && dm.isActive && dm.isActive()) {
            dm.stop();
        }
    },
};

IP2Live.GameManager = IP2LiveGameManager;
window.IP2LiveGameManager = IP2LiveGameManager;

console.log('[IP2Live] game_manager.js module loaded.');
