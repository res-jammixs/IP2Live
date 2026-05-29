/**
 * IP2Live - Map Manager Module
 * Manages map spawning, stage routing, and door interactions.
 */

const MapManager = {
    NEXT_STAGE_MAP_ID: 3,
    DEFAULT_WORLD_SPAWN: { x: 6, y: 0, z: 17 },
    DEFAULT_WORLD_EXIT: { x: 16, y: 0, z: 4 },

    // Fallback ordered stage list. Maps named "Stage X Level Y" in treeMaps.json
    // are auto-discovered at runtime and merged into this list.
    stages: [
        { id: 1, name: 'Tutorial Stage', tutorial: true, questEnabled: false },
        { id: 3, name: 'Stage 1 Level 1', stage: 1, level: 1 },
        { id: 4, name: 'Stage 1 Level 2', stage: 1, level: 2 },
        { id: 5, name: 'Stage 1 Level 3', stage: 1, level: 3 },
        { id: 6, name: 'Stage 1 Level 4', stage: 1, level: 4 },
    ],
    _registeredStageQuestIds: {},
    _registeredStageDialogueIds: {},
    _stageDiscoveryStarted: false,
    _stageDiscoveryReady: false,
    _stageRouteLocked: false,

    // Mapping door IDs or connection points to their target maps and coordinates.
    // Format: "sourceMapId_doorId": { targetMapId, targetX, targetY, targetZ }
    doorConnections: {
        "1_door_exit": { targetMapId: 3, targetX: 24, targetY: 0, targetZ: 23 },
        // Add more door connections here
    },

    /**
     * Get the initial map ID to spawn the character in when starting the game.
     * @returns {number} The starting map ID
     */
    getInitialMapId() {
        return this.stages[0].id;
    },

    boot() {
        this._injectMapHooks();
        this.syncStageFoundation();
        this.discoverStageMaps();
    },

    syncStageFoundation() {
        const dialoguesReady = this.registerStageIntroDialogues();
        const questsReady = this.registerStageQuests();
        return !!(dialoguesReady && questsReady);
    },

    discoverStageMaps() {
        if (this._stageDiscoveryStarted) return false;
        this._stageDiscoveryStarted = true;

        if (typeof fetch !== 'function') return false;

        const root = Common && Common.Platform && Common.Platform.ROOT_DIRECTORY
            ? Common.Platform.ROOT_DIRECTORY
            : '';
        const manager = this;

        fetch(root + 'treeMaps.json', { cache: 'no-store' })
            .then(function (response) {
                if (!response || !response.ok) throw new Error('HTTP ' + (response && response.status));
                return response.json();
            })
            .then(function (treeMaps) {
                const discovered = manager._extractStageMaps(treeMaps);
                if (discovered.length === 0) return;

                manager._mergeDiscoveredStages(discovered);
                manager._stageDiscoveryReady = true;
                manager.syncStageFoundation();
                manager._refreshCurrentGameplayStage();
                console.log('[IP2Live] MapManager discovered ' + discovered.length + ' staged map(s).');
            })
            .catch(function (error) {
                console.warn('[IP2Live] MapManager could not auto-discover staged maps:', error);
            });

        return true;
    },

    _extractStageMaps(treeMaps) {
        const output = [];
        const visit = (node) => {
            if (!node) return;

            if (Array.isArray(node)) {
                for (let i = 0; i < node.length; i++) visit(node[i]);
                return;
            }

            if (typeof node !== 'object') return;

            const id = Number(node.id);
            const name = String(node.name || '');
            const match = name.match(/^Stage\s+(\d+)\s+Level\s+(\d+)$/i);
            if (id > 0 && match) {
                output.push({
                    id,
                    name,
                    stage: Number(match[1]),
                    level: Number(match[2]),
                });
            }

            if (node.children) visit(node.children);
            if (node.tree) visit(node.tree);
        };

        visit(treeMaps);
        output.sort(function (a, b) {
            if (a.stage !== b.stage) return a.stage - b.stage;
            if (a.level !== b.level) return a.level - b.level;
            return a.id - b.id;
        });
        return output;
    },

    _mergeDiscoveredStages(discovered) {
        const byId = {};
        for (let i = 0; i < this.stages.length; i++) {
            const stage = this.stages[i];
            if (stage && stage.id) byId[Number(stage.id)] = Object.assign({}, stage);
        }

        for (let i = 0; i < discovered.length; i++) {
            const stage = discovered[i];
            const existing = byId[stage.id] || {};
            byId[stage.id] = Object.assign({}, stage, existing, {
                id: stage.id,
                name: stage.name,
                stage: stage.stage,
                level: stage.level,
                tutorial: false,
            });
        }

        const tutorials = [];
        const gameplay = [];
        const others = [];
        const ids = Object.keys(byId);

        for (let i = 0; i < ids.length; i++) {
            const stage = byId[ids[i]];
            if (stage.tutorial) {
                tutorials.push(stage);
            } else if (typeof stage.stage === 'number' && typeof stage.level === 'number') {
                gameplay.push(stage);
            } else {
                others.push(stage);
            }
        }

        gameplay.sort(function (a, b) {
            if (a.stage !== b.stage) return a.stage - b.stage;
            if (a.level !== b.level) return a.level - b.level;
            return a.id - b.id;
        });

        this.stages = tutorials.concat(gameplay, others);
    },

    _refreshCurrentGameplayStage() {
        const scene = Scene && Scene.Map ? Scene.Map.current : null;
        if (!scene) return false;

        scene._ip2liveStageFoundationSynced = false;
        scene._ip2liveStageQuestEnsured = false;
        return this._ensureGameplayStageReady(scene);
    },

    /**
     * Route the player to a specific map by ID.
     * @param {number} mapId
     */
    goTo(mapId, options) {
        const opts = options || {};
        const targetMapId = Number(mapId) || this.NEXT_STAGE_MAP_ID;

        const isGameplayOrTutorial = this.isGameplayStage(targetMapId) || (this.stageFor(targetMapId) && this.stageFor(targetMapId).tutorial);
        const ScreenClass = (isGameplayOrTutorial && IP2Live.LoadingScreen2) ? IP2Live.LoadingScreen2 : IP2Live.LoadingScreen;

        if (opts.useLoading !== false && ScreenClass && typeof ScreenClass.show === 'function') {
            const manager = this;
            const currentMapId = this._currentMapId();
            ScreenClass.show({
                mode: opts.loadingMode || 'replace',
                status: opts.status || this._loadingStatusFor(targetMapId, currentMapId),
                detail: opts.detail || this._stageName(targetMapId),
                fadeMusicOnStart: opts.fadeMusicOnStart !== false,
                musicFadeDurationMs: opts.musicFadeDurationMs || 2200,
                onComplete: function () {
                    manager._goToImmediate(targetMapId, opts);
                    if (typeof opts.onAfterLoad === 'function') opts.onAfterLoad(targetMapId);
                },
            });
            return;
        }

        this._goToImmediate(targetMapId, opts);
        if (typeof opts.onAfterLoad === 'function') opts.onAfterLoad(targetMapId);
    },

    _goToImmediate(mapId, options) {
        const opts = options || {};
        this.syncStageFoundation();
        if (Data.TitlescreenGameover.isTitleBackgroundVideo) Manager.Videos.stop();
        const targetMapId = Number(mapId) || this.NEXT_STAGE_MAP_ID;
        if (Core.Game.current) Core.Game.current.currentMapID = targetMapId;
        const scene = new Scene.Map(targetMapId);
        if (opts.spawn) scene._ip2liveStageSpawnOverride = this._cloneTile(opts.spawn);
        if (Manager && Manager.Stack) {
            const stack = Manager.Stack;
            if (stack.top) stack.replace(scene);
            else stack.push(scene);
            stack.clearHUD();
            stack.requestPaintHUD = true;
        }
        console.log(`[IP2Live] MapManager.goTo -> Map ${targetMapId}`);
    },

    /**
     * Return the map ID that comes after the supplied map ID,
     * or null if the supplied map is the last stage.
     * @param {number} currentMapId
     * @returns {number|null}
     */
    nextStage(currentMapId) {
        const idx = this.stages.findIndex(s => s.id === currentMapId);
        if (idx === -1 || idx >= this.stages.length - 1) return null;
        return this.stages[idx + 1].id;
    },

    goToNextStage(currentMapId, options) {
        if (this._stageRouteLocked) return false;

        const currentStage = this.stageFor(currentMapId);
        const nextId = this.nextStage(Number(currentMapId));
        if (!nextId) {
            this._stageRouteLocked = true;
            this._showCampaignCompleteScreen(currentStage);
            return false;
        }

        const nextStage = this.stageFor(nextId);
        const manager = this;
        const opts = options || {};
        const userAfterLoad = opts.onAfterLoad;
        this._stageRouteLocked = true;
        if (
            !opts._fromGameManager &&
            IP2Live.GameManager &&
            typeof IP2Live.GameManager.startMapFlow === 'function'
        ) {
            IP2Live.GameManager.startMapFlow(nextId, nextStage && nextStage.spawn, Object.assign({}, opts, {
                mode: 'stage',
                status: 'Loading Next Stage',
                detail: nextStage ? nextStage.name : this._stageName(nextId),
                onAfterLoad: function (targetMapId) {
                    manager._stageRouteLocked = false;
                    if (typeof userAfterLoad === 'function') userAfterLoad(targetMapId);
                },
            }));
            return true;
        }
        this.goTo(nextId, Object.assign({}, opts, {
            status: 'Loading Next Stage',
            detail: nextStage ? nextStage.name : this._stageName(nextId),
            onAfterLoad: function (targetMapId) {
                manager._stageRouteLocked = false;
                if (typeof userAfterLoad === 'function') userAfterLoad(targetMapId);
            },
        }));
        return true;
    },

    stageFor(mapId) {
        const id = Number(mapId);
        for (let i = 0; i < this.stages.length; i++) {
            if (this.stages[i].id === id) return this.stages[i];
        }
        return null;
    },

    isGameplayStage(mapId) {
        const stage = this.stageFor(mapId);
        return !!(stage && !stage.tutorial && stage.questEnabled !== false);
    },

    _currentMapId() {
        const current = Scene.Map && Scene.Map.current;
        const mapId = current && (
            current.id ||
            current.mapID ||
            (current.currentMap && current.currentMap.id) ||
            (Core.Game.current && Core.Game.current.currentMapID)
        );
        return Number(mapId) || (Core.Game.current && Number(Core.Game.current.currentMapID)) || 0;
    },

    _stageName(mapId) {
        const stage = this.stageFor(mapId);
        const id = Number(mapId);
        return stage ? stage.name : 'Map ' + String(id || 0).padStart(4, '0');
    },

    spawnFor(mapId) {
        const stage = this.stageFor(mapId);
        if (!stage || stage.tutorial) return null;
        return this._cloneTile(stage.spawn || this.DEFAULT_WORLD_SPAWN);
    },

    exitFor(mapId) {
        const stage = this.stageFor(mapId);
        if (!stage || stage.tutorial) return null;
        return this._cloneTile(stage.exit || this.DEFAULT_WORLD_EXIT);
    },

    _loadingStatusFor(targetMapId, currentMapId) {
        if (targetMapId === this.getInitialMapId()) return 'Loading Tutorial Stage';

        const targetIndex = this.stages.findIndex(s => s.id === targetMapId);
        const currentIndex = this.stages.findIndex(s => s.id === currentMapId);
        if (targetIndex !== -1 && currentIndex !== -1 && targetIndex > currentIndex) {
            return 'Loading Next Stage';
        }
        return 'Loading Next Level';
    },

    /** Convenience: launch the first stage and queue the tutorial overlay. */
    goToTutorial(options) {
        const opts = options || {};
        if (
            !opts._fromGameManager &&
            IP2Live.GameManager &&
            typeof IP2Live.GameManager.startTutorialFlow === 'function'
        ) {
            this._stageRouteLocked = false;
            return IP2Live.GameManager.startTutorialFlow(opts);
        }

        this._stageRouteLocked = false;
        const tutorialMapId = this.getInitialMapId();
        const afterLoad = () => {
            if (IP2Live.LightingManager) {
                IP2Live.LightingManager.applyPreset(tutorialMapId, Scene.Map.current);
            }
            // Start tutorial music immediately on transition
            if (IP2Live.MusicManager) {
                IP2Live.MusicManager.play(IP2Live.MusicManager.ZONE.TUTORIAL);
            }

            // Allow the map scene to fully initialise before showing the tutorial.
            // DialogueManager owns the trigger so tutorial dialogue routing stays
            // in one place.
            const checkAndStartTutorial = setInterval(() => {
                if (typeof IP2Live !== 'undefined' && IP2Live.WorldTitleOverlay && IP2Live.WorldTitleOverlay.isActive()) return;
                clearInterval(checkAndStartTutorial);
                
                if (IP2Live.LightingManager) {
                    IP2Live.LightingManager.refresh(Scene.Map.current);
                }
                if (IP2Live.DialogueManager) {
                    const handled = IP2Live.DialogueManager.triggerMapEvent(
                        tutorialMapId,
                        IP2Live.DialogueManager.EVENT.TUTORIAL_START,
                        { source: 'MapManager.goToTutorial', scene: Scene.Map.current }
                    );
                    if (handled) return;
                }
                if (IP2Live.Tutorial) IP2Live.Tutorial.activate();
            }, 100);
        };

        const ScreenClass = IP2Live.LoadingScreen2 || IP2Live.LoadingScreen;
        if (opts.useLoading !== false && ScreenClass && typeof ScreenClass.show === 'function') {
            const manager = this;
            ScreenClass.show({
                mode: opts.loadingMode || 'replace',
                status: opts.status || 'Loading Tutorial Stage',
                detail: opts.detail || 'Loading New Game',
                fadeMusicOnStart: opts.fadeMusicOnStart !== false,
                musicFadeDurationMs: opts.musicFadeDurationMs || 2200,
                onComplete: function () {
                    manager.goTo(tutorialMapId, { useLoading: false });
                    afterLoad();
                },
            });
            return;
        }

        this.goTo(tutorialMapId, { useLoading: false });
        afterLoad();
    },

    registerStageQuests(questManager) {
        const qm = questManager || IP2Live.QuestManager;
        if (!qm || typeof qm.registerQuest !== 'function' || typeof qm.registerMapQuests !== 'function') return false;

        for (let i = 0; i < this.stages.length; i++) {
            const stage = this.stages[i];
            if (!this.isGameplayStage(stage.id)) continue;

            let gameplayQuestIds = [];
            if (IP2Live.GameManager && typeof IP2Live.GameManager.registerStageGameplayQuests === 'function') {
                gameplayQuestIds = IP2Live.GameManager.registerStageGameplayQuests(qm, this, stage) || [];
            } else {
                const gameplayQuestManagers = [
                    IP2Live.GameplayManager,
                    IP2Live.PatchPanelGameplayManager,
                    IP2Live.CIDRPanelGameplayManager,
                    IP2Live.SubnetSimulatorGameplayManager,
                ];
                for (let g = 0; g < gameplayQuestManagers.length; g++) {
                    const gameplayManager = gameplayQuestManagers[g];
                    if (!gameplayManager || typeof gameplayManager.registerStageGameplayQuests !== 'function') continue;
                    const ids = gameplayManager.registerStageGameplayQuests(qm, this, stage) || [];
                    for (let j = 0; j < ids.length; j++) gameplayQuestIds.push(ids[j]);
                }
            }

            const questId = this._stageQuestId(stage);
            const existingQuest = qm.quests && qm.quests[questId];
            if (!this._registeredStageQuestIds[questId] || !existingQuest || existingQuest.resetOnMapEnter !== true) {
                const target = this.exitFor(stage.id);
                const spawn = this.spawnFor(stage.id) || this.DEFAULT_WORLD_SPAWN;
                qm.registerQuest({
                    id: questId,
                    title: 'QUEST AREA',
                    stageMapId: stage.id,
                    resetOnMapEnter: true,
                    objectives: [
                        {
                            id: 'reach_stage_exit',
                            title: 'REACH EXIT NODE',
                            detail: this._targetDetail(target),
                            targetTile: target,
                            routeTiles: this._routeTiles(spawn, target),
                            completionRadiusTiles: 0.55,
                            onComplete: function (result) {
                                if (IP2Live.MapManager) {
                                    IP2Live.MapManager.goToNextStage(result.mapId);
                                }
                            },
                        },
                    ],
                });
                this._registeredStageQuestIds[questId] = true;
            }

            const orderedQuestIds = gameplayQuestIds ? gameplayQuestIds.slice() : [];
            if (orderedQuestIds.indexOf(questId) === -1) orderedQuestIds.push(questId);
            qm.registerMapQuests(stage.id, orderedQuestIds, {
                append: false,
                autoStart: true,
                showFinished: false,
            });
        }
        return true;
    },

    registerStageIntroDialogues() {
        const dm = IP2Live.DialogueManager;
        if (!dm || typeof dm.registerDialogue !== 'function' || typeof dm.registerMapTrigger !== 'function') return false;

        for (let i = 0; i < this.stages.length; i++) {
            const stage = this.stages[i];
            if (!this.isGameplayStage(stage.id)) continue;

            const dialogueId = this._stageIntroDialogueId(stage);
            if (!dm.getDialogue || !dm.getDialogue(dialogueId)) {
                dm.registerDialogue(dialogueId, this._stageIntroDialogue(stage));
            }

            const triggerId = 'stage_intro_' + stage.id;
            if (!this._registeredStageDialogueIds[dialogueId] || !this._hasMapTrigger(dm, stage.id, triggerId)) {
                const targetMapId = stage.id;
                dm.registerMapTrigger(stage.id, {
                    id: triggerId,
                    event: dm.EVENT.MAP_ENTER,
                    once: false,
                    delay: 320,
                    action: function (context, manager) {
                        if (IP2Live.GameManager && typeof IP2Live.GameManager.handlesMapIntro === 'function' && IP2Live.GameManager.handlesMapIntro(targetMapId)) {
                            return false;
                        }
                        const scene = context && context.scene;
                        const activeScene = Scene && Scene.Map && Scene.Map.current ? Scene.Map.current : scene;
                        if (scene && scene._ip2liveStageIntroStarted) return false;
                        if (MapManager._getMapIdFromScene(activeScene) !== targetMapId) return false;
                        if (!manager || typeof manager.start !== 'function' || manager.isActive()) return false;

                        if (scene) scene._ip2liveStageIntroStarted = true;
                        return manager.start(dialogueId, context);
                    },
                    condition: function (context, manager) {
                        if (IP2Live.GameManager && typeof IP2Live.GameManager.handlesMapIntro === 'function' && IP2Live.GameManager.handlesMapIntro(targetMapId)) {
                            return false;
                        }
                        const scene = context && context.scene;
                        if (scene && scene._ip2liveStageIntroStarted) return false;
                        if (manager && typeof manager.isActive === 'function' && manager.isActive()) return false;
                        return true;
                    },
                });
                this._registeredStageDialogueIds[dialogueId] = true;
            }
        }
        return true;
    },

    _hasMapTrigger(dialogueManager, mapId, triggerId) {
        const triggers = dialogueManager && dialogueManager.mapTriggers && dialogueManager.mapTriggers[Number(mapId)];
        if (!triggers || !triggers.length) return false;
        for (let i = 0; i < triggers.length; i++) {
            if (triggers[i] && triggers[i].id === triggerId) return true;
        }
        return false;
    },

    _stageQuestId(stage) {
        return 'stage.default_exit.' + stage.id;
    },

    _stageIntroDialogueId(stage) {
        return 'stage.' + stage.id + '.intro';
    },

    _stageIntroDialogue(stage) {
        const exit = this.exitFor(stage.id);
        const lines = stage.introLines || [
            'Welcome to ' + stage.name + '.',
            '',
            'Context placeholder: this subnet sector is still being prepared for its full gameplay layer.',
            'For now, the route beacon is online so you can verify world-to-world connectivity.',
            'Reach the highlighted exit node to advance to the next registered world.',
            this._targetDetail(exit),
        ];
        return {
            title: 'WORLD BRIEF',
            speaker: 'SYSTEM',
            slides: [lines],
        };
    },

    _showCampaignCompleteScreen(stage) {
        const payload = {
            stage: stage || null,
            completedAt: new Date().toISOString(),
            stages: this.stages.filter(function (entry) {
                return entry && !entry.tutorial && entry.questEnabled !== false;
            }),
        };

        if (IP2Live.LoadingScreen && typeof IP2Live.LoadingScreen.show === 'function') {
            IP2Live.LoadingScreen.show({
                mode: 'replace',
                status: 'Saving Progress',
                detail: 'Finalizing infiltration report',
                onComplete: function () {
                    MapManager._openEndCredits(payload);
                },
            });
            return;
        }

        this._openEndCredits(payload);
    },

    _openEndCredits(payload) {
        if (IP2Live.QuestManager) {
            IP2Live.QuestManager.hideQuest();
            IP2Live.QuestManager.setDialogueSuppressed(false);
        }

        const EndCreditsScene = (typeof window !== 'undefined' && window.IP2LiveEndCreditsScene) || null;
        const CreditsScene = (typeof window !== 'undefined' && window.IP2LiveCreditsScene) || null;
        const MainMenuScene = (typeof window !== 'undefined' && window.IP2LiveMainMenu) || null;

        if (typeof EndCreditsScene === 'function') {
            Manager.Stack.replace(new EndCreditsScene(payload));
        } else if (typeof CreditsScene === 'function') {
            Manager.Stack.replace(new CreditsScene());
        } else if (typeof MainMenuScene === 'function') {
            Manager.Stack.popAll();
            Manager.Stack.push(new MainMenuScene());
        }

        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    },

    _routeTiles(fromTile, toTile) {
        if (!fromTile || !toTile) return [];
        const midZ = Math.round((Number(fromTile.z) + Number(toTile.z)) / 2);
        return [
            { x: Number(fromTile.x), y: Number(fromTile.y) || 0, z: Number(fromTile.z) },
            { x: Number(toTile.x), y: Number(toTile.y) || 0, z: midZ },
            { x: Number(toTile.x), y: Number(toTile.y) || 0, z: Number(toTile.z) },
        ];
    },

    _targetDetail(tile) {
        return 'STAND ON TILE  X:' + tile.x + '  Y:' + (tile.y || 0) + '  Z:' + tile.z;
    },

    _cloneTile(tile) {
        return {
            x: Number(tile && tile.x) || 0,
            y: Number(tile && tile.y) || 0,
            z: Number(tile && tile.z) || 0,
        };
    },

    _injectMapHooks() {
        if (!Scene || !Scene.Map || !Scene.Map.prototype) return;
        if (Scene.Map.prototype._ip2liveMapManagerInjected) return;
        Scene.Map.prototype._ip2liveMapManagerInjected = true;

        const manager = this;
        const originalUpdate = Scene.Map.prototype.update;
        Scene.Map.prototype.update = function () {
            manager._markStageSpawnRequired(this);
            manager._applyStageSpawn(this);
            originalUpdate.call(this);
            manager._applyStageSpawn(this);
            manager._ensureGameplayStageReady(this);
        };
    },

    _markStageSpawnRequired(scene) {
        if (!scene || scene._ip2liveStageSpawnApplied || scene._ip2liveStageSpawnBypassed) return false;
        const mapId = this._getMapIdFromScene(scene);
        if (!this.isGameplayStage(mapId)) return false;
        if (scene._ip2liveStageSpawnAttempts === undefined) scene._ip2liveStageSpawnAttempts = 0;
        scene._ip2liveStageSpawnRequired = true;
        return true;
    },

    isStageSpawnPending(scene) {
        if (!scene) return false;
        const mapId = this._getMapIdFromScene(scene);
        if (!this.isGameplayStage(mapId) || scene._ip2liveStageSpawnApplied || scene._ip2liveStageSpawnBypassed) return false;
        return scene._ip2liveStageSpawnRequired && (scene._ip2liveStageSpawnAttempts || 0) <= 30;
    },

    _applyStageSpawn(scene) {
        if (!scene || scene._ip2liveStageSpawnApplied || scene._ip2liveStageSpawnBypassed) return false;
        const mapId = this._getMapIdFromScene(scene);
        if (!this.isGameplayStage(mapId)) return false;

        const game = Core && Core.Game ? Core.Game.current : null;
        const pending = game && game._ip2livePendingHeroPosition ? game._ip2livePendingHeroPosition : null;
        if (pending && this._matchesPendingRestoreMap(mapId, pending)) {
            const heroForRestore = this._heroForScene(scene);
            if (heroForRestore && heroForRestore.position) {
                this._setPosition(heroForRestore.position, pending);
                scene._ip2liveStageSpawnApplied = true;
                scene._ip2liveStageSpawnBypassed = true;
                scene._ip2liveStageSpawnRequired = false;
                delete game._ip2livePendingHeroPosition;
                if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
                console.log('[IP2Live] Applied restored hero position for ' + this._stageName(mapId) + ' at X:' + pending.x + ' Y:' + pending.y + ' Z:' + pending.z);
                return true;
            }
        }

        const spawn = scene._ip2liveStageSpawnOverride || this.spawnFor(mapId);
        if (!spawn) return false;

        scene._ip2liveStageSpawnAttempts = (scene._ip2liveStageSpawnAttempts || 0) + 1;
        const hero = this._heroForScene(scene);
        if (!hero || !hero.position) {
            if (scene._ip2liveStageSpawnAttempts > 30) {
                scene._ip2liveStageSpawnRequired = false;
                scene._ip2liveStageSpawnBypassed = true;
                console.warn('[IP2Live] Stage spawn could not find the hero on ' + this._stageName(mapId) + '; quest completion unblocked.');
            }
            return false;
        }

        this._setPosition(hero.position, spawn);
        scene._ip2liveStageSpawnApplied = true;
        scene._ip2liveStageSpawnRequired = false;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        console.log('[IP2Live] Spawned player for ' + this._stageName(mapId) + ' at X:' + spawn.x + ' Y:' + spawn.y + ' Z:' + spawn.z);
        return true;
    },

    _matchesPendingRestoreMap(mapId, pending) {
        if (!pending) return false;
        const pendingMapId = Number(pending.mapId) || 0;
        if (!pendingMapId) return true;
        return pendingMapId === Number(mapId);
    },

    _ensureGameplayStageReady(scene) {
        if (!scene) return false;
        const mapId = this._getMapIdFromScene(scene);
        if (!this.isGameplayStage(mapId)) return false;

        this._ensureStageMusic(scene, mapId);

        if (!scene._ip2liveStageFoundationSynced) {
            scene._ip2liveStageFoundationSynced = this.syncStageFoundation();
        }

        if (!scene._ip2liveStageQuestEnsured && IP2Live.QuestManager && typeof IP2Live.QuestManager.ensureMapQuestFor === 'function') {
            scene._ip2liveStageQuestEnsured = IP2Live.QuestManager.ensureMapQuestFor(mapId, scene);
        }

        this._ensureStageIntro(scene, mapId);
        return true;
    },

    _ensureStageMusic(scene, mapId) {
        const stage = this.stageFor(mapId);
        const music = IP2Live.MusicManager;
        if (!stage || !music || !music.ZONE || typeof music.play !== 'function') return false;

        let zone = null;
        if (stage.stage === 1) zone = music.ZONE.STAGE_1;
        if (!zone) return false;

        const musicKey = String(mapId) + ':' + zone;
        if (scene._ip2liveMusicZoneKey === musicKey) return true;
        scene._ip2liveMusicZoneKey = musicKey;
        music.play(zone);
        return true;
    },

    _ensureStageIntro(scene, mapId) {
        if (!scene || scene._ip2liveStageIntroStarted || scene._ip2liveStageIntroPending) return false;
        if (IP2Live.GameManager && typeof IP2Live.GameManager.handlesMapIntro === 'function' && IP2Live.GameManager.handlesMapIntro(mapId)) {
            return false;
        }

        const stage = this.stageFor(mapId);
        const dm = IP2Live.DialogueManager;
        if (!stage || !dm || typeof dm.start !== 'function') return false;

        this.registerStageIntroDialogues();
        const dialogueId = this._stageIntroDialogueId(stage);
        if (dm.getDialogue && !dm.getDialogue(dialogueId)) return false;

        scene._ip2liveStageIntroPending = true;
        setTimeout(() => {
            scene._ip2liveStageIntroPending = false;
            if (scene._ip2liveStageIntroStarted) return;
            const activeScene = Scene && Scene.Map && Scene.Map.current ? Scene.Map.current : scene;
            if (this._getMapIdFromScene(activeScene) !== mapId) return;
            if (!IP2Live.DialogueManager || IP2Live.DialogueManager.isActive()) return;

            scene._ip2liveStageIntroStarted = true;
            IP2Live.DialogueManager.start(dialogueId, {
                source: 'MapManager.stageIntro',
                mapId,
                scene,
            });
        }, 420);
        return true;
    },

    _heroForScene(scene) {
        const candidates = [
            scene && scene.heroMapObject,
            Scene.Map.current && Scene.Map.current.heroMapObject,
            scene && scene.hero,
            scene && scene.player,
            Scene.Map.current && Scene.Map.current.hero,
            Scene.Map.current && Scene.Map.current.player,
            Core.Game.current && Core.Game.current.heroMapObject,
            Core.Game.current && Core.Game.current.hero,
            Core.Game.current && Core.Game.current.player,
        ];
        for (let i = 0; i < candidates.length; i++) {
            if (this._hasPosition(candidates[i])) return candidates[i];
        }
        return null;
    },

    _hasPosition(obj) {
        return !!(
            obj &&
            !(obj.name && String(obj.name).indexOf('IP2Live_') === 0) &&
            obj.position &&
            typeof obj.position.x === 'number' &&
            typeof obj.position.z === 'number'
        );
    },

    _setPosition(position, tile) {
        if (typeof position.set === 'function') {
            position.set(tile.x, tile.y || 0, tile.z);
            return;
        }
        position.x = tile.x;
        position.y = tile.y || 0;
        position.z = tile.z;
    },

    _getMapIdFromScene(scene) {
        const current = scene || (Scene.Map && Scene.Map.current) || null;
        const mapId = current && (
            current.id ||
            current.mapID ||
            (current.currentMap && current.currentMap.id) ||
            (Core.Game.current && Core.Game.current.currentMapID)
        );
        return Number(mapId) || 0;
    },

    /**
     * Handles interacting with a door or transition point.
     * @param {number} currentMapId The ID of the map the player is currently on.
     * @param {string} doorId A unique identifier for the door/transition point.
     */
    interactDoor(currentMapId, doorId) {
        const connectionKey = `${currentMapId}_${doorId}`;
        const connection = this.doorConnections[connectionKey];

        if (connection) {
            console.log(`[IP2Live] Redirecting player through door: ${doorId} to Map ${connection.targetMapId}`);

            // Set the player's new spawn coordinates if provided in the connection
            if (Core.Game.current && Core.Game.current.heroMapObject) {
                // In RPG Paper Maker, we could use a custom variable or state to handle exact 3D positioning
                // after the map loads. For now, we update the global hero start position if the engine supports it.
            }

            this.goTo(connection.targetMapId);
        } else {
            console.warn(`[IP2Live] No connection found for door: ${connectionKey}`);
        }
    }
};

// Export to global IP2Live namespace
IP2Live.MapManager = MapManager;
window.IP2LiveMapManager = MapManager;
MapManager.boot();

console.log('[IP2Live] map_manager.js module loaded.');
