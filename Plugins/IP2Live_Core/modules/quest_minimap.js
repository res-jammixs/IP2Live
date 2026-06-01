/**
 * IP2Live - Quest Minimap Module
 *
 * Plain DOM/canvas HUD widget. Uses inline styles only and reads live quest,
 * map, and hero state directly from engine globals every frame.
 */

(function () {
    const QuestMinimap = {
        VERSION: 'quest-minimap-20260601-05',
        DEBUG: false,

        _container: null,
        _fallbackHost: null,
        _canvas: null,
        _ctx: null,
        _stageEl: null,
        _counterEl: null,
        _coordEl: null,
        _debugEl: null,
        _rafId: null,
        _completedCache: new Set(),
        _flashMap: new Map(),
        _lastQuestIdsKey: '',
        _t: 0,
        _debugTick: 0,
        _mapInfoCache: {},
        _mapInfoPending: {},

        create() {
            if (this.isActive()) return;
            if (typeof document === 'undefined') return;

            const dom = this._buildDOM();
            this._container = dom.container;
            this._canvas = dom.canvas;
            this._ctx = dom.canvas.getContext('2d');
            this._stageEl = dom.stageEl;
            this._counterEl = dom.counterEl;
            this._coordEl = dom.coordEl;
            this._debugEl = dom.debugEl;

            this._insertWidget(dom.container);
            this._seedCompletedCache();
            this.update();
            this._loop();
        },

        update() {
            if (!this.isActive()) return false;
            const data = this._readLiveData();
            if (this.DEBUG) this._debugLog(data);
            this._syncVisibility(data);
            this._syncPlacement();
            this._syncCompletedState(data);
            this._updateText(data);
            this._draw(data);
            return true;
        },

        destroy() {
            if (this._rafId !== null) {
                cancelAnimationFrame(this._rafId);
                this._rafId = null;
            }

            if (this._container && this._container.parentNode) {
                this._container.parentNode.removeChild(this._container);
            }
            if (this._fallbackHost && this._fallbackHost.parentNode) {
                this._fallbackHost.parentNode.removeChild(this._fallbackHost);
            }

            this._container = null;
            this._fallbackHost = null;
            this._canvas = null;
            this._ctx = null;
            this._stageEl = null;
            this._counterEl = null;
            this._coordEl = null;
            this._debugEl = null;
            this._completedCache.clear();
            this._flashMap.clear();
            this._lastQuestIdsKey = '';
            this._t = 0;
            this._mapInfoCache = {};
            this._mapInfoPending = {};
        },

        isActive() {
            return !!(this._container && this._container.parentNode);
        },

        _loop() {
            if (!this.isActive()) return;
            this.update();
            this._rafId = requestAnimationFrame(() => this._loop());
        },

        _buildDOM() {
            const container = document.createElement('div');
            this._style(container, {
                background: '#090f1f',
                border: '1.5px solid #e31c3d',
                borderRadius: '3px',
                padding: '7px 8px 8px',
                boxSizing: 'border-box',
                width: '100%',
                fontFamily: 'monospace',
            });

            const topRow = document.createElement('div');
            this._style(topRow, {
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '5px',
            });

            const labelEl = document.createElement('span');
            labelEl.textContent = '■ QUEST MAP';
            this._style(labelEl, {
                color: '#ff3355',
                fontSize: '9px',
                fontFamily: 'monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                fontWeight: '700',
                whiteSpace: 'nowrap',
            });

            const stageEl = document.createElement('span');
            stageEl.textContent = 'STAGE -- · LEVEL --';
            this._style(stageEl, {
                color: '#ff9900',
                fontSize: '9px',
                fontFamily: 'monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                whiteSpace: 'nowrap',
            });

            topRow.appendChild(labelEl);
            topRow.appendChild(stageEl);

            const canvas = document.createElement('canvas');
            canvas.width = 200;
            canvas.height = 200;
            this._style(canvas, {
                width: '100%',
                height: 'auto',
                display: 'block',
                imageRendering: 'pixelated',
                border: '1px solid #1a2535',
                background: '#06090f',
            });

            const bottomRow = document.createElement('div');
            this._style(bottomRow, {
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                marginTop: '5px',
                gap: '4px',
            });

            const metricsRow = document.createElement('div');
            this._style(metricsRow, {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
                minHeight: '11px',
            });

            const coordEl = document.createElement('span');
            coordEl.textContent = 'X:--  Z:--';
            this._style(coordEl, {
                color: '#00cfff',
                fontSize: '9px',
                fontFamily: 'monospace',
                letterSpacing: '0.05em',
                whiteSpace: 'nowrap',
            });

            const counterEl = document.createElement('span');
            counterEl.textContent = 'QUESTS --/--';
            this._style(counterEl, {
                color: '#ff9900',
                fontSize: '9px',
                fontFamily: 'monospace',
                letterSpacing: '0.05em',
                whiteSpace: 'nowrap',
            });

            let debugEl = null;
            if (this.DEBUG) {
                debugEl = document.createElement('span');
                debugEl.textContent = '';
                this._style(debugEl, {
                    color: '#607080',
                    fontSize: '8px',
                    fontFamily: 'monospace',
                    letterSpacing: '0.03em',
                    whiteSpace: 'nowrap',
                    marginLeft: '6px',
                    display: 'inline',
                });
            }

            const legend = document.createElement('div');
            this._style(legend, {
                display: 'flex',
                gap: '7px',
                alignItems: 'center',
                flexWrap: 'wrap',
                justifyContent: 'flex-end',
                width: '100%',
                minHeight: '12px',
            });
            legend.appendChild(this._legendItem('#e31c3d', 'PENDING'));
            legend.appendChild(this._legendItem('#00cc66', 'DONE'));
            legend.appendChild(this._legendItem('#ffcc00', 'EXIT'));
            legend.appendChild(this._legendItem('#00cfff', 'PLAYER'));

            metricsRow.appendChild(coordEl);
            metricsRow.appendChild(counterEl);
            if (debugEl) metricsRow.appendChild(debugEl);
            bottomRow.appendChild(metricsRow);
            bottomRow.appendChild(legend);

            container.appendChild(topRow);
            container.appendChild(canvas);
            container.appendChild(bottomRow);

            return { container, canvas, stageEl, counterEl, coordEl, debugEl };
        },

        _legendItem(color, label) {
            const item = document.createElement('div');
            this._style(item, {
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
            });

            const dot = document.createElement('span');
            this._style(dot, {
                display: 'inline-block',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: color,
                flex: '0 0 auto',
            });

            const text = document.createElement('span');
            text.textContent = label;
            this._style(text, {
                color: '#607080',
                fontSize: '8px',
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
            });

            item.appendChild(dot);
            item.appendChild(text);
            return item;
        },

        _insertWidget(container) {
            const skipButton = this._findSkipQuestDOMButton();
            if (skipButton && skipButton.parentNode) {
                skipButton.parentNode.insertBefore(container, skipButton.nextSibling);
                return;
            }

            const host = document.createElement('div');
            this._fallbackHost = host;
            this._style(host, {
                position: 'fixed',
                top: '68px',
                right: '18px',
                width: '220px',
                zIndex: '2147483000',
                pointerEvents: 'none',
            });
            host.appendChild(container);
            document.body.appendChild(host);
            this._syncPlacement();
        },

        _syncPlacement() {
            const host = this._fallbackHost;
            if (!host || !this._container) return false;

            const rectInfo = this._skipQuestCanvasRect();
            if (!rectInfo) {
                this._style(host, {
                    top: '68px',
                    right: '18px',
                    left: 'auto',
                    width: '220px',
                });
                return false;
            }

            const gap = Math.max(6, Math.round(6 * rectInfo.scaleY));
            const left = Math.round(rectInfo.left);
            const top = Math.round(rectInfo.top + rectInfo.height + gap);
            const width = Math.max(220, Math.round(rectInfo.width));

            this._style(host, {
                position: 'fixed',
                left: left + 'px',
                top: top + 'px',
                right: 'auto',
                width: width + 'px',
                zIndex: '2147483000',
                pointerEvents: 'none',
            });
            return true;
        },

        _skipQuestCanvasRect() {
            const gm = IP2Live.GameManager || IP2LiveGameManager || null;
            const buttonRect = gm && gm._skipQuestButtonRect ? gm._skipQuestButtonRect : null;
            const ctx = Common && Common.Platform ? Common.Platform.ctx : null;
            const canvas = ctx && ctx.canvas ? ctx.canvas : null;
            if (!buttonRect || !canvas || typeof canvas.getBoundingClientRect !== 'function') return null;

            const canvasRect = canvas.getBoundingClientRect();
            const canvasW = Number(canvas.width) || canvasRect.width || 1;
            const canvasH = Number(canvas.height) || canvasRect.height || 1;
            const scaleX = canvasRect.width / canvasW;
            const scaleY = canvasRect.height / canvasH;
            if (!(scaleX > 0) || !(scaleY > 0)) return null;

            return {
                left: canvasRect.left + Number(buttonRect.x || 0) * scaleX,
                top: canvasRect.top + Number(buttonRect.y || 0) * scaleY,
                width: Number(buttonRect.w || 0) * scaleX,
                height: Number(buttonRect.h || 0) * scaleY,
                scaleX,
                scaleY,
            };
        },

        _findSkipQuestDOMButton() {
            const candidates = Array.prototype.slice.call(document.querySelectorAll('button, [role="button"], input[type="button"]'));
            for (let i = 0; i < candidates.length; i++) {
                const el = candidates[i];
                const text = String(el.textContent || el.value || '').toUpperCase();
                if (text.indexOf('SKIP FLOOR QUESTS') !== -1) return el;
            }
            return null;
        },

        _readLiveData() {
            const qm = IP2Live.QuestManager || null;
            const scene = Scene && Scene.Map ? Scene.Map.current : null;
            const mapId = this._mapId(qm, scene);
            const queue = qm && typeof qm._mapQuestQueue === 'function' ? qm._mapQuestQueue(mapId) : null;
            const questIds = queue && Array.isArray(queue.questIds) ? queue.questIds.slice() : [];
            const mapSize = this._mapSize(scene, mapId);
            const hero = this._hero(qm, scene);
            const player = this._playerPosition(qm, hero, scene, mapId);
            const stageInfo = this._stageInfo(mapId);
            const quests = this._buildQuestList(qm, questIds, mapId);
            const questStats = this._questStats(quests);
            const visibleQuests = this._visibleQuests(quests, questStats);
            const spawn = this._spawnForMap(mapId);

            return {
                mapId,
                mapW: mapSize.w,
                mapH: mapSize.h,
                mapSizeSource: mapSize.source,
                quests,
                visibleQuests,
                questStats,
                activeQuestId: qm ? qm.activeQuestId : null,
                player,
                spawn,
                heroFound: !!hero,
                queueCount: questIds.length,
                stage: stageInfo.stage,
                level: stageInfo.level,
            };
        },

        _debugLog(data) {
            this._debugTick += 1;
            if (this._debugTick % 30 !== 0) return;
            const spawn = data.spawn || { x: 0, z: 0 };
            console.log('[IP2Live][QuestMinimap]', {
                mapId: data.mapId,
                mapW: data.mapW,
                mapH: data.mapH,
                heroFound: data.heroFound,
                player: data.player,
                spawn: { x: spawn.x, z: spawn.z },
                questCount: (data.quests || []).length,
                queueCount: data.queueCount,
                activeQuestId: data.activeQuestId,
            });
        },

        _buildQuestList(qm, questIds, mapId) {
            const quests = [];
            const hasQueue = questIds && questIds.length && qm && qm.quests;

            if (hasQueue) {
                for (let i = 0; i < questIds.length; i++) {
                    const id = questIds[i];
                    const q = qm && qm.quests ? qm.quests[id] : null;
                    if (!q || !Array.isArray(q.objectives) || q.objectives.length === 0) continue;

                    const objective = this._firstTargetObjective(q) || q.objectives[0];
                    const tile = this._objectiveTile(objective);
                    quests.push({
                        id,
                        name: q.name || q.title || id,
                        tileX: tile.x,
                        tileY: tile.z,
                        isExit: this._isExitQuest(id, mapId),
                        complete: !!(qm && typeof qm._isQuestFinished === 'function' && qm._isQuestFinished(id)),
                    });
                }
                return quests;
            }

            const specs = this._fallbackQuestSpecsFromGameManager(mapId);
            for (let i = 0; i < specs.length; i++) {
                const spec = specs[i];
                const objectiveList = Array.isArray(spec.objectives) && spec.objectives.length
                    ? spec.objectives
                    : [spec];
                const objective = this._firstTargetObjective({ objectives: objectiveList }) || objectiveList[0];
                const tile = this._objectiveTile(objective);
                const questId = spec.id || spec.questId || spec.objectiveId || spec.title || ('quest-' + i);
                quests.push({
                    id: questId,
                    name: spec.title || spec.label || questId,
                    tileX: tile.x,
                    tileY: tile.z,
                    isExit: this._isExitQuest(questId, mapId),
                    complete: !!(qm && typeof qm._isQuestFinished === 'function' && qm._isQuestFinished(questId)),
                });
            }

            return quests;
        },

        _exitQuestId(mapId) {
            return 'stage.default_exit.' + (Number(mapId) || 0);
        },

        _isExitQuest(questId, mapId) {
            return String(questId || '') === this._exitQuestId(mapId);
        },

        _questStats(quests) {
            const list = quests || [];
            let total = 0;
            let done = 0;
            let exitTotal = 0;
            for (let i = 0; i < list.length; i++) {
                const quest = list[i];
                if (!quest) continue;
                if (quest.isExit) {
                    exitTotal += 1;
                    continue;
                }
                total += 1;
                if (quest.complete) done += 1;
            }
            return {
                total,
                done,
                exitTotal,
                exitUnlocked: total === 0 ? exitTotal > 0 : done >= total,
            };
        },

        _visibleQuests(quests, stats) {
            const list = quests || [];
            const questStats = stats || this._questStats(list);
            const visible = [];
            for (let i = 0; i < list.length; i++) {
                const quest = list[i];
                if (!quest) continue;
                if (quest.isExit && !questStats.exitUnlocked) continue;
                visible.push(quest);
            }
            return visible;
        },

        _fallbackQuestSpecsFromGameManager(mapId) {
            const out = [];
            const gm = IP2Live.GameManager || IP2LiveGameManager || null;
            if (!gm) return out;

            const catalog = typeof gm.getGameplayCatalog === 'function'
                ? gm.getGameplayCatalog()
                : Object.values(gm.gameplayCatalog || {});

            const resolvedMapId = Number(mapId) || 0;
            for (let i = 0; i < catalog.length; i++) {
                const gameplay = catalog[i];
                if (!gameplay) continue;
                const gameplayMapId = Number(gameplay.mapId) || 0;
                const quests = Array.isArray(gameplay.quests) ? gameplay.quests : [];
                for (let q = 0; q < quests.length; q++) {
                    const spec = quests[q];
                    if (!spec) continue;
                    const specMapId = Number(spec.mapId || gameplayMapId) || 0;
                    if (specMapId !== resolvedMapId) continue;
                    out.push(spec);
                }
            }

            return out;
        },

        _spawnForMap(mapId) {
            const gm = IP2Live.GameManager || IP2LiveGameManager || null;
            if (!gm) return null;
            const resolvedMapId = Number(mapId) || 0;
            const activeFlow = gm._activeMapFlow || null;
            if (activeFlow && Number(activeFlow.mapId) === resolvedMapId && activeFlow.spawn) {
                return { x: Number(activeFlow.spawn.x) || 0, z: Number(activeFlow.spawn.z) || 0 };
            }
            const flowMap = gm.flowConfig && gm.flowConfig.maps ? gm.flowConfig.maps[resolvedMapId] : null;
            if (flowMap && flowMap.spawn) {
                return { x: Number(flowMap.spawn.x) || 0, z: Number(flowMap.spawn.z) || 0 };
            }
            return null;
        },

        _mapId(qm, scene) {
            if (qm && typeof qm._getMapId === 'function') {
                const qid = qm._getMapId(scene);
                if (qid) return qid;
            }
            const mapId = scene && (
                scene.id ||
                scene.mapID ||
                (scene.currentMap && scene.currentMap.id) ||
                (Core.Game.current && Core.Game.current.currentMapID)
            );
            return Number(mapId) || (Core.Game.current && Number(Core.Game.current.currentMapID)) || 0;
        },

        _mapSize(scene, mapId) {
            const currentMap = scene && scene.currentMap ? scene.currentMap : null;
            const props = currentMap && currentMap.mapProperties ? currentMap.mapProperties : null;
            const infos = currentMap && currentMap.infos ? currentMap.infos : null;
            const sceneProps = scene && scene.mapProperties ? scene.mapProperties : null;
            const sceneInfos = scene && scene.infos ? scene.infos : null;
            const resolvedMapId = Number(mapId) || 0;

            let w = 0;
            let h = 0;
            let source = 'none';

            const take = (candidate, label) => {
                if (!candidate) return false;
                const cw = Number(candidate.width) || Number(candidate.w) || 0;
                const ch = Number(candidate.length) || Number(candidate.height) || Number(candidate.l) || 0;
                if (cw > 0 && ch > 0) {
                    w = cw;
                    h = ch;
                    source = label;
                    return true;
                }
                return false;
            };

            take(props, 'currentMap.mapProperties') ||
                take(infos, 'currentMap.infos') ||
                take(sceneProps, 'scene.mapProperties') ||
                take(sceneInfos, 'scene.infos');

            if (!(w > 0 && h > 0) && resolvedMapId && this._mapInfoCache[resolvedMapId]) {
                const cached = this._mapInfoCache[resolvedMapId];
                if (cached && cached.w > 0 && cached.h > 0) {
                    w = cached.w;
                    h = cached.h;
                    source = 'cache.infos';
                }
            }

            if (!(w > 0 && h > 0) && Core && Core.Game && Core.Game.current && typeof Core.Game.current.getPlatformMap === 'function') {
                const fallbackMap = Core.Game.current.getPlatformMap(resolvedMapId);
                const fallbackProps = fallbackMap && fallbackMap.properties ? fallbackMap.properties : null;
                const fallbackInfos = fallbackMap && fallbackMap.infos ? fallbackMap.infos : null;
                if (take(fallbackProps, 'platformMap.properties') || take(fallbackInfos, 'platformMap.infos')) {
                    // values set by take
                }
            }

            if (!(w > 0 && h > 0) && resolvedMapId) {
                this._requestMapInfos(resolvedMapId);
            }

            return {
                w: Math.max(1, Number(w) || 1),
                h: Math.max(1, Number(h) || 1),
                source: source,
            };
        },

        _mapFolderName(mapId) {
            const id = Math.max(0, Number(mapId) || 0);
            return 'MAP' + String(id).padStart(4, '0');
        },

        _requestMapInfos(mapId) {
            const id = Number(mapId) || 0;
            if (!id || this._mapInfoCache[id] || this._mapInfoPending[id]) return;
            if (typeof fetch !== 'function') return;

            const root = Common && Common.Platform && Common.Platform.ROOT_DIRECTORY
                ? Common.Platform.ROOT_DIRECTORY
                : '';
            const path = root + 'Maps/' + this._mapFolderName(id) + '/infos.json';
            this._mapInfoPending[id] = true;

            fetch(path, { cache: 'no-store' })
                .then(function (resp) {
                    if (!resp || !resp.ok) throw new Error('HTTP ' + (resp && resp.status));
                    return resp.json();
                })
                .then((info) => {
                    if (!info || typeof info !== 'object') return;
                    const w = Number(info.w || info.width) || 0;
                    const h = Number(info.l || info.length || info.height) || 0;
                    if (w > 0 && h > 0) {
                        this._mapInfoCache[id] = { w: w, h: h };
                    }
                })
                .catch(function () { })
                .finally(() => {
                    this._mapInfoPending[id] = false;
                });
        },

        /**
         * BUG 5 FIX: Correctly read stage and level from MapManager.stageFor().
         * Falls back to 'TUTORIAL' when no valid stage found.
         */
        _stageInfo(mapId) {
            const mm = IP2Live.MapManager || null;
            const stage = mm && typeof mm.stageFor === 'function' ? mm.stageFor(mapId) : null;
            
            if (!stage || stage.tutorial) {
                return { stage: 'TUTORIAL', level: '' };
            }
            
            const s = typeof stage.stage === 'number' ? stage.stage : '--';
            const l = typeof stage.level === 'number' ? stage.level : '--';
            return { stage: s, level: l };
        },

        /**
         * Get the hero object from QuestManager with scene context.
         * Delegates to QuestManager._questHero(scene) which tries multiple lookup paths.
         */
        _hero(qm, scene) {
            if (!qm) return null;
            
            // Delegate to QuestManager's hero lookup with scene context
            if (typeof qm._questHero === 'function') {
                return qm._questHero(scene);
            }
            
            // Fallback: try direct scene access
            if (scene && (scene.heroMapObject || scene.hero || scene.player)) {
                return scene.heroMapObject || scene.hero || scene.player;
            }
            
            return null;
        },

        /**
         * BUG 2 FIX: Get player position using QuestManager's coordinate conversion.
         * Uses scene context to ensure proper hero lookup and position calculation.
         */
        _playerPosition(qm, hero, scene, mapId) {
            const spawn = this._spawnForMap(mapId);
            if (!hero) {
                return spawn || { x: 0, z: 0 };
            }

            // Prefer QuestManager's editor position if available (tile-space, matches objectives)
            if (qm && typeof qm._heroEditorPosition === 'function') {
                try {
                    const editorPos = qm._heroEditorPosition(hero);
                    if (editorPos && typeof editorPos.x === 'number' && typeof editorPos.z === 'number') {
                        return { x: editorPos.x, z: editorPos.z };
                    }
                } catch (e) {
                    // Fall through to world position
                }
            }

            // Fallback to world position conversion
            if (qm && typeof qm._heroWorldPosition === 'function') {
                try {
                    const worldPos = qm._heroWorldPosition(hero);
                    if (worldPos && typeof worldPos.x === 'number' && typeof worldPos.z === 'number') {
                        return { x: worldPos.x, z: worldPos.z };
                    }
                } catch (e) {
                    // Fall through to direct access
                }
            }

            // Last resort: direct property access on hero object
            const p = hero && hero.position;
            const px = Number(p && p.x);
            const pz = Number(p && p.z);
            if (!isNaN(px) && !isNaN(pz)) {
                return { x: px, z: pz };
            }

            return spawn || { x: 0, z: 0 };
        },

        /**
         * Find the primary objective for display on minimap.
         * Searches for objectives with targetTile, targetX/targetZ, or position properties.
         */
        _firstTargetObjective(quest) {
            const objectives = quest && quest.objectives;
            if (!Array.isArray(objectives) || objectives.length === 0) return null;
            
            // Look for objective with explicit targetTile property
            for (let i = 0; i < objectives.length; i++) {
                if (objectives[i] && objectives[i].targetTile) {
                    return objectives[i];
                }
            }
            
            // Look for objective with target coordinates
            for (let i = 0; i < objectives.length; i++) {
                const obj = objectives[i];
                if (obj && (typeof obj.targetX === 'number' || typeof obj.x === 'number')) {
                    return obj;
                }
            }
            
            // Fallback to first objective
            return objectives[0] || null;
        },

        /**
         * BUG 6 FIX: Extract tile coordinates from objective using multiple paths.
         * Tries: targetX/targetZ (preferred), then x/z, then fallback to 0.
         * Objective may contain target coords directly or nested in targetTile property.
         */
        _objectiveTile(objective) {
            const obj = objective || {};
            
            // Try direct target properties first
            if (typeof obj.targetX === 'number' && typeof obj.targetZ === 'number') {
                return { x: obj.targetX, z: obj.targetZ };
            }
            
            // Try targetTile nested object
            if (obj.targetTile && typeof obj.targetTile === 'object') {
                if (typeof obj.targetTile.x === 'number' && typeof obj.targetTile.z === 'number') {
                    return { x: obj.targetTile.x, z: obj.targetTile.z };
                }
            }
            
            // Try direct x/z properties
            if (typeof obj.x === 'number' && typeof obj.z === 'number') {
                return { x: obj.x, z: obj.z };
            }
            
            // Try x/y (world space where y might be Z in editor units)
            if (typeof obj.x === 'number' && typeof obj.y === 'number') {
                return { x: obj.x, z: obj.y };
            }
            
            // Try targetX with targetY/targetZ fallback
            const tileX = typeof obj.targetX === 'number' ? obj.targetX : (typeof obj.x === 'number' ? obj.x : 0);
            const tileZ = typeof obj.targetZ === 'number' ? obj.targetZ : (typeof obj.targetY === 'number' ? obj.targetY : (typeof obj.z === 'number' ? obj.z : 0));
            
            return {
                x: Number(tileX) || 0,
                z: Number(tileZ) || 0,
            };
        },

        /**
         * BUG 3 FIX: Check visibility gating (tutorial/gameplay/pause) in addition to quest list.
         */
        _shouldHide() {
            try {
                const scene = Scene && Scene.Map && Scene.Map.current;
                if (this._isLoadingScreenActive()) return true;
                if (IP2Live.Tutorial && IP2Live.Tutorial.isFadingOut) return true;
                if (!scene) return true;
                if (IP2Live.GameManager) {
                    if (IP2Live.GameManager.state === 'GAMEPLAY_ACTIVE') return true;
                    if (IP2Live.GameManager._activeGameplayNode) return true;
                }
                if (this._isPauseMenuActive()) return true;
                if (!Scene.Map.current) return true;
                return false;
            } catch (e) {
                return false;
            }
        },

        _isLoadingScreenActive() {
            try {
                const stack = Manager && Manager.Stack ? Manager.Stack : null;
                if (!stack) return false;

                const stackList = stack.stack || stack._stack || [];
                const current = stack.top || stack.current || null;
                const toCheck = [];
                if (current) toCheck.push(current);
                if (Array.isArray(stackList)) {
                    for (let i = stackList.length - 1; i >= 0; i--) {
                        toCheck.push(stackList[i]);
                    }
                }

                for (let i = 0; i < toCheck.length; i++) {
                    const scene = toCheck[i];
                    if (!scene) continue;
                    const ctorName = scene.constructor && scene.constructor.name ? scene.constructor.name : '';
                    const sceneName = String(scene.name || scene.type || ctorName || '');
                    if (typeof IP2LiveLoadingScreen2 !== 'undefined' && scene instanceof IP2LiveLoadingScreen2) return true;
                    if (typeof IP2LiveLoadingScreen !== 'undefined' && scene instanceof IP2LiveLoadingScreen) return true;
                    if (sceneName.indexOf('IP2LiveLoadingScreen') !== -1) return true;
                    if (sceneName.indexOf('LoadingScreen') !== -1) return true;
                }
                return false;
            } catch (e) {
                return false;
            }
        },

        _isPauseMenuActive() {
            try {
                const stack = Manager && Manager.Stack ? Manager.Stack : null;
                if (!stack) return false;
                const pauseCtor = typeof IP2LivePauseMenu === 'function' ? IP2LivePauseMenu : null;
                const stackList = stack.stack || stack._stack || [];
                const current = stack.top || stack.current || null;
                const toCheck = [];
                if (current) toCheck.push(current);
                if (Array.isArray(stackList)) {
                    for (let i = stackList.length - 1; i >= 0; i--) {
                        toCheck.push(stackList[i]);
                    }
                }
                for (let i = 0; i < toCheck.length; i++) {
                    const scene = toCheck[i];
                    if (!scene) continue;
                    if (pauseCtor && scene instanceof pauseCtor) return true;
                    if (scene.constructor && scene.constructor.name === 'IP2LivePauseMenu') return true;
                    if (scene.name === 'IP2LivePauseMenu' || scene.type === 'IP2LivePauseMenu') return true;
                }
                return false;
            } catch (e) {
                return false;
            }
        },

        _syncVisibility(data) {
            if (!this._container) return;
            const visibleQuests = data.visibleQuests || data.quests || [];
            const shouldHide = this._shouldHide() || !visibleQuests.length;
            this._container.style.display = shouldHide ? 'none' : 'block';
        },

        _syncCompletedState(data) {
            const quests = data.quests || [];
            const nextKey = quests.map((q) => q.id).join('|');
            if (nextKey !== this._lastQuestIdsKey) {
                this._completedCache.clear();
                for (let i = 0; i < quests.length; i++) {
                    if (quests[i].complete) this._completedCache.add(quests[i].id);
                }
                this._lastQuestIdsKey = nextKey;
                return;
            }

            for (let i = 0; i < quests.length; i++) {
                const quest = quests[i];
                if (!quest.complete || this._completedCache.has(quest.id)) continue;
                this._completedCache.add(quest.id);
                this._flashMap.set(quest.id, Date.now());
                this._logObjectiveComplete(data, quest.id);
            }
        },

        _seedCompletedCache() {
            const data = this._readLiveData();
            this._completedCache.clear();
            for (let i = 0; i < data.quests.length; i++) {
                if (data.quests[i].complete) this._completedCache.add(data.quests[i].id);
            }
            this._lastQuestIdsKey = data.quests.map((q) => q.id).join('|');
        },

        _logObjectiveComplete(data, questId) {
            const report = IP2Live.ReportManager;
            if (!report || typeof report.logObjectiveComplete !== 'function') return;
            try {
                report.logObjectiveComplete({
                    questId,
                    stage: data.stage,
                    level: data.level,
                    timestamp: Date.now(),
                });
            } catch (e) {
                console.warn('[IP2Live] QuestMinimap objective telemetry failed:', e);
            }
        },

        _updateText(data) {
            if (this._stageEl) {
                let stageText = data.stage === 'TUTORIAL' 
                    ? 'TUTORIAL'
                    : 'STAGE ' + data.stage + (data.level ? ' · LEVEL ' + data.level : '');
                this._stageEl.textContent = stageText;
            }
            if (this._coordEl) {
                this._coordEl.textContent = 'X:' + Math.floor(data.player.x) + '  Z:' + Math.floor(data.player.z);
            }
            if (this._counterEl) {
                const stats = data.questStats || { done: 0, total: 0, exitUnlocked: false };
                if (data.stage === 'TUTORIAL') {
                    this._counterEl.style.display = 'none';
                } else {
                    this._counterEl.style.display = 'inline';
                    this._counterEl.textContent = stats.exitUnlocked
                        ? 'QUESTS ' + stats.done + '/' + stats.total + '  EXIT'
                        : 'QUESTS ' + stats.done + '/' + stats.total;
                }
            }
            if (this._debugEl && this.DEBUG) {
                const spawn = data.spawn || { x: 0, z: 0 };
                this._debugEl.textContent =
                    'map:' + data.mapId +
                    ' m:' + data.mapW + 'x' + data.mapH +
                    ' src:' + (data.mapSizeSource || 'none') +
                    ' hero:' + (data.heroFound ? 'Y' : 'N') +
                    ' p:' + Math.floor(data.player.x) + ',' + Math.floor(data.player.z) +
                    ' s:' + Math.floor(spawn.x) + ',' + Math.floor(spawn.z) +
                    ' q:' + (data.quests ? data.quests.length : 0);
            }
        },

        _draw(data) {
            const ctx = this._ctx;
            if (!ctx) return;
            this._t += 0.045;
            ctx.imageSmoothingEnabled = false;
            ctx.clearRect(0, 0, 200, 200);
            this._drawBackground(ctx);
            this._drawGrid(ctx);
            this._drawQuests(ctx, data);
            this._drawPlayer(ctx, data);
        },

        _drawBackground(ctx) {
            ctx.fillStyle = '#06090f';
            ctx.fillRect(0, 0, 200, 200);
        },

        _drawGrid(ctx) {
            ctx.strokeStyle = 'rgba(0,180,255,0.06)';
            ctx.lineWidth = 0.5;
            for (let p = 0; p <= 200; p += 10) {
                const v = Math.floor(p);
                ctx.beginPath();
                ctx.moveTo(v, 0);
                ctx.lineTo(v, 200);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, v);
                ctx.lineTo(200, v);
                ctx.stroke();
            }
        },

        /**
         * BUG 4 FIX: Draw all quest markers with completion flash, then draw active ring on top.
         */
        _drawQuests(ctx, data) {
            const quests = data.visibleQuests || data.quests || [];
            const activeQuestId = data.activeQuestId;
            
            // Draw all markers first (including flash animations)
            for (let i = 0; i < quests.length; i++) {
                const quest = quests[i];
                const cx = this._canvasX(quest.tileX, data.mapW);
                const cy = this._canvasY(quest.tileY, data.mapH);
                const flashStart = this._flashMap.get(quest.id);
                let flashT = -1;
                if (flashStart) {
                    flashT = Math.max(0, Math.min(1, (Date.now() - flashStart) / 600));
                    if (flashT >= 1) this._flashMap.delete(quest.id);
                }

                this._drawQuestMarker(ctx, cx, cy, quest.complete, flashT, quest.isExit);
            }
            
            // Draw active quest ring on top (if one is active)
            if (activeQuestId !== null && activeQuestId !== undefined) {
                for (let i = 0; i < quests.length; i++) {
                    const quest = quests[i];
                    const questId = String(quest.id);
                    const activeId = String(activeQuestId);
                    
                    if (questId === activeId) {
                        const cx = this._canvasX(quest.tileX, data.mapW);
                        const cy = this._canvasY(quest.tileY, data.mapH);
                        this._drawActiveRing(ctx, cx, cy);
                        break;
                    }
                }
            }
        },

        _drawQuestMarker(ctx, cx, cy, complete, flashT, isExit) {
            let radius = 5;
            let fill = isExit ? '#ffcc00' : (complete ? '#00cc66' : '#e31c3d');
            let stroke = isExit ? '#fff066' : (complete ? '#00ff88' : '#ff6680');

            if (flashT >= 0) {
                radius = Math.floor(5 + Math.sin(flashT * Math.PI) * 5);
                fill = isExit ? '#ffcc00' : (flashT < 0.5 ? '#e31c3d' : '#00cc66');
                stroke = isExit ? '#fff066' : (flashT < 0.5 ? '#ff6680' : '#00ff88');
            }

            ctx.beginPath();
            ctx.fillStyle = fill;
            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1;
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            if (isExit) {
                ctx.strokeStyle = '#3a2200';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(Math.floor(cx - 3), Math.floor(cy - 2));
                ctx.lineTo(Math.floor(cx + 3), Math.floor(cy));
                ctx.lineTo(Math.floor(cx - 3), Math.floor(cy + 2));
                ctx.stroke();
            } else if (complete || flashT >= 0.5) {
                ctx.strokeStyle = '#00ff88';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(Math.floor(cx - 3), Math.floor(cy));
                ctx.lineTo(Math.floor(cx - 1), Math.floor(cy + 2.5));
                ctx.lineTo(Math.floor(cx + 3), Math.floor(cy - 2.5));
                ctx.stroke();
            } else {
                ctx.strokeStyle = '#ff6680';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(Math.floor(cx - 3), cy);
                ctx.lineTo(Math.floor(cx + 3), cy);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(cx, Math.floor(cy - 3));
                ctx.lineTo(cx, Math.floor(cy + 3));
                ctx.stroke();
            }
        },

        _drawActiveRing(ctx, cx, cy) {
            ctx.save();
            ctx.globalAlpha = 0.6;
            ctx.beginPath();
            ctx.strokeStyle = '#ffff00';
            ctx.lineWidth = 1;
            ctx.arc(cx, cy, 9, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        },

        _drawPlayer(ctx, data) {
            const cx = this._canvasX(data.player.x, data.mapW);
            const cy = this._canvasY(data.player.z, data.mapH);
            const pulse = 0.5 + 0.5 * Math.sin(this._t * 2);
            const radius = Math.floor(3.5 + 1.5 * pulse);
            ctx.beginPath();
            ctx.fillStyle = '#00cfff';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        },

        _canvasX(tileX, mapW) {
            const w = Math.max(1, Number(mapW) || 1);
            const normalized = (Number(tileX || 0) + 0.5) / w;
            return Math.max(0, Math.min(199, Math.floor(normalized * 200)));
        },

        _canvasY(tileY, mapH) {
            const h = Math.max(1, Number(mapH) || 1);
            const normalized = (Number(tileY || 0) + 0.5) / h;
            return Math.max(0, Math.min(199, Math.floor(normalized * 200)));
        },

        _style(el, styles) {
            for (const key in styles) {
                if (Object.prototype.hasOwnProperty.call(styles, key)) {
                    el.style[key] = styles[key];
                }
            }
        },
    };

    IP2Live.QuestMinimap = QuestMinimap;
    window.IP2LiveQuestMinimap = QuestMinimap;

    console.log('[IP2Live] quest_minimap.js module loaded.');
}());
