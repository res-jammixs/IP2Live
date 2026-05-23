/**
 * IP2Live â€” Tutorial Manager Module
 * @file    Plugins/IP2Live_Core/modules/tutorial.js
 * @author  James Michael Restauro Siton
 *
 * Loaded by code.js via fetch() + new Function() so that all RPG Paper
 * Maker engine variables (Common, Core, Data, Graphic, Manager, Scene,
 * Model, Main, THREE, IP2Live) are available as local bindings â€” exactly
 * the same scope as code.js itself.
 *
 * DO NOT wrap this file in an IIFE or use window.Manager etc.
 * All engine globals are injected as function parameters by the loader.
 *
 * Public surface (attached to window for cross-module access):
 *   IP2Live.Tutorial.activate()   â€” call after the tutorial map has loaded
 *   IP2Live.Tutorial.deactivate() â€” dismiss the overlay manually
 */

// ================================================================
//  Â§ T-1  TUTORIAL MANAGER
// ================================================================
const Tutorial = {

    VERSION: 'quest-debug-20260518-13',
    isActive: false,

    PHASE: { IDLE: -1, INTRO: 0, MOVE_FB: 1, MOVE_LR: 2, CAMERA: 3, QUEST_INFO: 4, QUEST_ACTIVE: 5, COMPLETE: 6, DONE: 7 },
    phase: -1,
    slideIndex: 0,

    QUEST: {
        tileSize: 16,
        targetTile: { x: 23, y: 0, z: 2 },
        routeTiles: [
            { x: 23, z: 14 },
            { x: 23, z: 10 },
            { x: 23, z: 6 },
            { x: 23, z: 2 }
        ],
        completionRadiusTiles: 0.55
    },

    // Dialogue content lives in modules/dialogue_manager.js.
    introSlides: [],
    steps: [],
    outroSlides: [],

    // â”€ Listener refs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    _keyRef: null,
    _clickRef: null,
    _mouseRef: null,
    mouseX: 0,
    mouseY: 0,

    // â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    _syncDialogueContent() {
        const dm = IP2Live.DialogueManager;
        if (!dm) {
            console.warn('[IP2Live] Tutorial: DialogueManager missing; tutorial text is unavailable.');
            return;
        }

        this.introSlides = dm.getSlides('tutorial.intro');
        this.outroSlides = dm.getSlides('tutorial.outro');
        this.steps = dm.getTutorialSteps();
    },

    _syncQuestManagerState() {
        const qm = IP2Live.QuestManager;
        if (!qm) return false;

        const shouldShow = this.phase === this.PHASE.QUEST_ACTIVE;
        if (!shouldShow) {
            if (
                qm.activeQuestId === 'tutorial.navigation' &&
                (qm.visible || qm.preview || qm.guideActive || qm.allowCompletion)
            ) {
                qm.hideQuest('tutorial.navigation');
            }
            return false;
        }

        qm.startQuest('tutorial.navigation', {
            visible: true,
            preview: false,
            guideActive: true,
            allowCompletion: true,
        });
        qm.update({ scene: this._currentMapScene(), hero: this._questHero() });
        return true;
    },

    _hideQuestManagerState() {
        if (IP2Live.QuestManager) {
            IP2Live.QuestManager.hideQuest('tutorial.navigation');
        }
    },

    _resetQuestManagerState() {
        if (IP2Live.QuestManager) {
            IP2Live.QuestManager.startQuest('tutorial.navigation', {
                restart: true,
                visible: false,
                preview: false,
                guideActive: false,
                allowCompletion: false,
            });
            IP2Live.QuestManager.hideQuest('tutorial.navigation');
        }
    },

    activate() {
        if (this.isActive) return;
        this._syncDialogueContent();
        this._resetQuestManagerState();
        this.isActive = true;
        this.phase = this.PHASE.INTRO;
        this.slideIndex = 0;
        this.pressedKeys = new Set();
        this._stepTimeout = null;
        this.animTick = 0;
        // Typing effect state
        this.typeChars = 0;     // how many chars of body are revealed
        this.typeTimer = 0;     // frame counter for typing speed
        this.typeSpeed = 1;     // frames per char
        // Binary particle pool
        this._binaryParticles = [];
        for (let i = 0; i < 60; i++) this._binaryParticles.push(this._makeBinParticle(1920, 120));

        this._questArrowMesh = null;
        this._questPathMesh = null;
        this._questGuideGroup = null;
        this._questDots = [];
        this._questScene = null;
        this._questTilePulseMesh = null;
        this._questBeaconMesh = null;
        this._questTargetRingMesh = null;
        this._questTargetHighRingMesh = null;
        this._mapSceneRef = null;
        this._lastHeroRef = null;
        this._lastCollisionLogKey = '';
        this._lastCollisionLogTick = 0;
        this.isFadingOut = false;
        this.fadeMode = null;
        this.fadeAlpha = 0;
        this._teleported = false;

        this._attachListeners();
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        console.log('[IP2Live] Tutorial activated.');
        console.log('[IP2Live] Tutorial version:', this.VERSION);
    },

    deactivate() {
        this.isActive = false;
        this.phase = this.PHASE.DONE;
        this.pressedKeys.clear();
        if (this._stepTimeout) clearTimeout(this._stepTimeout);
        this._stepTimeout = null;
        this._removeQuestWorldGuides();

        // Remove key listener but KEEP click listener for the restart button
        if (this._keyRef) {
            document.removeEventListener('keydown', this._keyRef, true);
            this._keyRef = null;
        }

        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        console.log('[IP2Live] Tutorial finished. Showing replay button.');
    },

    // â”€ Event wiring â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    _attachListeners() {
        this._detachListeners();
        this._keyRef = (e) => this._onKey(e);
        this._clickRef = (e) => this._onClick(e);
        this._mouseRef = (e) => { this.mouseX = e.clientX; this.mouseY = e.clientY; };

        document.addEventListener('keydown', this._keyRef, true);
        document.addEventListener('mousedown', this._clickRef, true);
        document.addEventListener('mousemove', this._mouseRef, true);
    },

    _detachListeners() {
        if (this._keyRef) {
            document.removeEventListener('keydown', this._keyRef, true);
            this._keyRef = null;
        }
        if (this._clickRef) {
            document.removeEventListener('mousedown', this._clickRef, true);
            this._clickRef = null;
        }
        if (this._mouseRef) {
            document.removeEventListener('mousemove', this._mouseRef, true);
            this._mouseRef = null;
        }
    },

    // — Input handlers ————————————————————————————————————————————————————

    _onKey(e) {
        if (!this.isActive) return;
        const code = e.code;

        if (this._dialogueLocksMovement() && this._isMovementCode(code)) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        if (this.phase === this.PHASE.INTRO) {
            if (['Enter', 'Space', 'KeyZ'].includes(code)) {
                e.stopPropagation();
                this._advanceIntro();
            }
            return;
        }

        if (this.phase === this.PHASE.MOVE_FB) {
            if (['KeyW', 'KeyS'].includes(code)) {
                this.pressedKeys.add(code);
                if (this.pressedKeys.has('KeyW') && this.pressedKeys.has('KeyS')) this._scheduleNextStep();
            }
            return;
        }
        if (this.phase === this.PHASE.MOVE_LR) {
            if (['KeyA', 'KeyD'].includes(code)) {
                this.pressedKeys.add(code);
                if (this.pressedKeys.has('KeyA') && this.pressedKeys.has('KeyD')) this._scheduleNextStep();
            }
            return;
        }
        if (this.phase === this.PHASE.CAMERA || this.phase === this.PHASE.QUEST_INFO) {
            if (this.phase === this.PHASE.CAMERA && code.startsWith('Arrow')) {
                this.pressedKeys.add(code);
                if (this.pressedKeys.size >= 2) this._scheduleNextStep();
            } else if (this.phase === this.PHASE.QUEST_INFO && ['Enter', 'Space', 'KeyZ'].includes(code)) {
                e.stopPropagation();
                this._nextStep();
            }
            return;
        }
        if (this.phase === this.PHASE.QUEST_ACTIVE) {
            return;
        }
        if (this.phase === this.PHASE.COMPLETE) {
            if (['Enter', 'Space', 'KeyZ'].includes(code)) {
                e.stopPropagation();
                this._advanceOutro();
            }
        }
    },

    _onClick(e) {
        if (this.phase === this.PHASE.DONE) {
            if (this._isClickOnReplay(e)) {
                Data.Systems.soundConfirmation.playSound();
                this.activate();
            }
            return;
        }

        if (!this.isActive) return;
        if (this.phase === this.PHASE.INTRO) { this._advanceIntro(); return; }
        if (this.phase === this.PHASE.QUEST_INFO) { this._nextStep(); return; }
        if (this.phase === this.PHASE.COMPLETE) { this._advanceOutro(); }
    },

    _isClickOnReplay(e) {
        // We calculate if the mouse click is within the replay button bounds.
        const SW = Common.ScreenResolution.SCREEN_X;
        const btnW = 280, btnH = 34;
        const btnX = SW - btnW - 20;
        const btnY = 20;

        const x = Common.ScreenResolution.getScreenX(btnX);
        const y = Common.ScreenResolution.getScreenY(btnY);
        const w = Common.ScreenResolution.getScreenX(btnW);
        const h = Common.ScreenResolution.getScreenY(btnH);

        const mx = e ? e.clientX : this.mouseX;
        const my = e ? e.clientY : this.mouseY;

        return (mx >= x && mx <= x + w && my >= y && my <= y + h);
    },

    _advanceIntro() {
        if (this.slideIndex < this.introSlides.length - 1) {
            this.slideIndex++;
        } else {
            this.phase = this.PHASE.MOVE_FB;
        }
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    },

    _scheduleNextStep() {
        if (this._stepTimeout) return;
        this._stepTimeout = setTimeout(() => {
            this._stepTimeout = null;
            this._nextStep();
        }, 500); // short delay
    },

    _nextStep() {
        this.pressedKeys.clear();
        switch (this.phase) {
            case this.PHASE.MOVE_FB: this.phase = this.PHASE.MOVE_LR; break;
            case this.PHASE.MOVE_LR: this.phase = this.PHASE.CAMERA; break;
            case this.PHASE.CAMERA: this.phase = this.PHASE.QUEST_INFO; break;
            case this.PHASE.QUEST_INFO: this.phase = this.PHASE.QUEST_ACTIVE; break;
            case this.PHASE.QUEST_ACTIVE:
                this.phase = this.PHASE.COMPLETE;
                this.slideIndex = 0;
                this._completeAutoTick = this.animTick || 0;
                this._removeQuestWorldGuides();
                break;
        }
        this._syncQuestManagerState();
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    },

    _advanceOutro() {
        if (this.slideIndex < this.outroSlides.length - 1) {
            this.slideIndex++;
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        } else {
            this.teleportToNextStage();
        }
    },

    teleportToNextStage() {
        this.phase = this.PHASE.DONE;
        this.isFadingOut = true;
        this.fadeMode = 'out';
        this.fadeAlpha = 0;
    },

    _questTargetWorld(hero) {
        const S = this._tileSize();
        const h = hero || this._getLiveHeroObject(this._currentMapScene()) || this._lastHeroRef;
        const tileUnits = this._positionUsesEditorUnits(h && h.position);
        const scale = tileUnits ? 1 : S;
        const center = tileUnits ? 0.5 : S / 2;
        return {
            x: this.QUEST.targetTile.x * scale + center,
            y: this.QUEST.targetTile.y * scale,
            z: this.QUEST.targetTile.z * scale + center
        };
    },

    _tileSize() {
        return (Common && Common.Datas && Common.Datas.Systems && Common.Datas.Systems.SQUARE_SIZE) ||
            (Data && Data.Systems && Data.Systems.SQUARE_SIZE) ||
            this.QUEST.tileSize ||
            16;
    },

    _positionUsesEditorUnits(position) {
        if (!position || typeof position.x !== 'number' || typeof position.z !== 'number') return false;
        const scene = this._currentMapScene();
        const map = scene && scene.currentMap;
        const props = map && map.mapProperties;
        if (props && props.length && props.width) {
            return Math.abs(position.x) <= props.length + 4 &&
                Math.abs(position.z) <= props.width + 4;
        }
        return Math.abs(position.x) < 96 && Math.abs(position.z) < 96;
    },

    _targetEditorCenter() {
        return {
            x: this.QUEST.targetTile.x + 0.5,
            y: this.QUEST.targetTile.y,
            z: this.QUEST.targetTile.z + 0.5
        };
    },

    _setSceneContext(scene) {
        if (!scene) return;
        this._mapSceneRef = scene;
        const hero = this._getLiveHeroObject(scene) || this._findHeroInScene(scene);
        if (hero && hero.position) this._lastHeroRef = hero;
    },

    _currentMapScene() {
        return this._mapSceneRef || Scene.Map.current || null;
    },

    _questHero() {
        const scene = this._currentMapScene();
        const hero = this._getLiveHeroObject(scene) || this._findHeroInScene(scene);
        if (hero && hero.position) {
            this._lastHeroRef = hero;
            return hero;
        }
        return this._lastHeroRef || null;
    },

    _getLiveHeroObject(scene) {
        const current = scene || this._currentMapScene();
        const candidates = [
            current && current.heroMapObject,
            Scene.Map.current && Scene.Map.current.heroMapObject,
            current && current.mapObjects && current.mapObjects[0],
            Scene.Map.current && Scene.Map.current.mapObjects && Scene.Map.current.mapObjects[0],
            Core.Game.current && Core.Game.current.heroMapObject
        ];
        for (let i = 0; i < candidates.length; i++) {
            if (this._hasPosition(candidates[i])) {
                this._lastHeroPath = i === 0 ? 'scene.heroMapObject'
                    : i === 1 ? 'Scene.Map.current.heroMapObject'
                    : i === 2 ? 'scene.mapObjects[0]'
                    : i === 3 ? 'Scene.Map.current.mapObjects[0]'
                    : 'Core.Game.current.heroMapObject';
                return candidates[i];
            }
        }
        return null;
    },

    _hasPosition(obj) {
        return obj &&
            !(obj.name && String(obj.name).indexOf('IP2Live_') === 0) &&
            obj.position &&
            typeof obj.position.x === 'number' &&
            typeof obj.position.z === 'number';
    },

    _looksLikeHero(obj, keyHint) {
        if (!this._hasPosition(obj)) return false;
        const hint = (keyHint || '').toLowerCase();
        if (hint.includes('hero') || hint.includes('player')) return true;
        if (obj === (Core.Game.current && Core.Game.current.hero)) return true;
        if (obj === (Core.Game.current && Core.Game.current.heroMapObject)) return true;
        if (obj.isHero || obj.isPlayer || obj.isCurrentHero) return true;
        if (obj.kind === 'hero' || obj.kind === 'player') return true;
        if (obj.name === 'Hero' || obj.name === 'Player') return true;
        return false;
    },

    _candidateHeroRoots(scene) {
        const roots = [];
        const push = (obj, label) => {
            if (obj) roots.push({ obj, label });
        };

        push(scene, 'scene');
        push(Scene.Map.current, 'Scene.Map.current');
        push(Core.Game.current, 'Core.Game.current');
        push(Manager.Stack, 'Manager.Stack');

        if (scene) {
            push(scene.heroMapObject, 'scene.heroMapObject');
            push(scene.hero, 'scene.hero');
            push(scene.player, 'scene.player');
            push(scene.currentMap, 'scene.currentMap');
            push(scene.map, 'scene.map');
        }
        if (Core.Game.current) {
            push(Core.Game.current.heroMapObject, 'Core.Game.current.heroMapObject');
            push(Core.Game.current.hero, 'Core.Game.current.hero');
            push(Core.Game.current.player, 'Core.Game.current.player');
        }
        if (Manager.Stack) {
            push(Manager.Stack.top, 'Manager.Stack.top');
            push(Manager.Stack.current, 'Manager.Stack.current');
            push(Manager.Stack._current, 'Manager.Stack._current');
            push(Manager.Stack.scenes, 'Manager.Stack.scenes');
            push(Manager.Stack.stack, 'Manager.Stack.stack');
        }
        return roots;
    },

    _findHeroInScene(scene) {
        const direct = [
            scene && scene.heroMapObject,
            Scene.Map.current && Scene.Map.current.heroMapObject,
            scene && scene.mapObjects && scene.mapObjects[0],
            Scene.Map.current && Scene.Map.current.mapObjects && Scene.Map.current.mapObjects[0],
            scene && scene.hero,
            scene && scene.player,
            Scene.Map.current && Scene.Map.current.hero,
            Core.Game.current && Core.Game.current.heroMapObject,
            Core.Game.current && Core.Game.current.hero,
            Core.Game.current && Core.Game.current.player
        ];
        for (let i = 0; i < direct.length; i++) {
            if (this._hasPosition(direct[i])) return direct[i];
        }

        const roots = this._candidateHeroRoots(scene);
        const visited = [];
        const fallback = [];
        const queue = [];
        for (let r = 0; r < roots.length; r++) {
            queue.push({ obj: roots[r].obj, path: roots[r].label, depth: 0 });
        }

        while (queue.length > 0 && visited.length < 900) {
            const entry = queue.shift();
            const obj = entry.obj;
            if (!obj || typeof obj !== 'object') continue;
            if (visited.indexOf(obj) !== -1) continue;
            visited.push(obj);

            if (this._looksLikeHero(obj, entry.path)) {
                this._lastHeroPath = entry.path;
                return obj;
            }
            if (this._hasPosition(obj)) {
                fallback.push({ obj, path: entry.path });
            }
            if (entry.depth >= 4) continue;

            if (Array.isArray(obj)) {
                const max = Math.min(obj.length, 80);
                for (let i = 0; i < max; i++) {
                    queue.push({ obj: obj[i], path: `${entry.path}[${i}]`, depth: entry.depth + 1 });
                }
                continue;
            }

            let keys = [];
            try { keys = Object.keys(obj); } catch(e) { keys = []; }
            for (let i = 0; i < keys.length && i < 90; i++) {
                const key = keys[i];
                if (key === 'parent' || key === 'mesh' || key === 'geometry' || key === 'material') continue;
                let value = null;
                try { value = obj[key]; } catch(e) { value = null; }
                if (value && typeof value === 'object') {
                    queue.push({ obj: value, path: `${entry.path}.${key}`, depth: entry.depth + 1 });
                }
            }
        }

        if (fallback.length > 0) {
            const chosen = this._chooseBestPositionCandidate(fallback, scene);
            this._lastHeroPath = chosen.path;
            return chosen.obj;
        }
        return null;
    },

    _chooseBestPositionCandidate(candidates, scene) {
        const target = this._questTargetWorld();
        const mapLimit = this.QUEST.tileSize * 40;
        const cam = this._getActiveThreeCamera(scene);
        const filtered = [];
        for (let i = 0; i < candidates.length; i++) {
            const p = candidates[i].obj.position;
            if (p.x >= -this.QUEST.tileSize && p.x <= mapLimit && p.z >= -this.QUEST.tileSize && p.z <= mapLimit) {
                filtered.push(candidates[i]);
            }
        }
        const list = filtered.length > 0 ? filtered : candidates;
        let best = list[0];
        let bestScore = Number.POSITIVE_INFINITY;

        for (let i = 0; i < list.length; i++) {
            const c = list[i];
            const path = c.path.toLowerCase();
            const p = c.obj.position;
            let score = cam
                ? Math.hypot(p.x - cam.position.x, p.z - cam.position.z)
                : Math.hypot(p.x - target.x, p.z - target.z);
            if (path.includes('camera')) score += 10000;
            if (path.includes('children')) score += 400;
            if (path.includes('mapobject') || path.includes('object')) score += 60;
            if (path.includes('hero') || path.includes('player')) score -= 10000;
            if (c.obj === this._lastHeroRef) score -= 5000;
            if (score < bestScore) {
                best = c;
                bestScore = score;
            }
        }
        return best;
    },

    _getActiveThreeCamera(scene) {
        const current = scene || this._currentMapScene();
        if (current && current.camera) {
            if (typeof current.camera.getThreeCamera === 'function') return current.camera.getThreeCamera();
            if (current.camera.threeCamera) return current.camera.threeCamera;
        }
        if (Manager && Manager.GL && Manager.GL.camera) return Manager.GL.camera;
        if (Manager && Manager.Camera && Manager.Camera.camera) return Manager.Camera.camera;
        return null;
    },

    _questDistanceTiles(hero) {
        const h = hero || this._questHero();
        if (!h) return null;
        const pos = this._heroEditorPosition(h);
        if (!pos) return null;
        const target = this._targetEditorCenter();
        return Math.hypot(pos.x - target.x, pos.z - target.z);
    },

    _heroWorldPosition(hero) {
        const h = hero || this._questHero();
        if (!h || !h.position) return null;
        const p = h.position;
        if (typeof p.x !== 'number' || typeof p.z !== 'number') return null;
        return { x: p.x, y: typeof p.y === 'number' ? p.y : 0, z: p.z };
    },

    _heroEditorPosition(hero) {
        const pos = this._heroWorldPosition(hero);
        if (!pos) return null;
        if (this._positionUsesEditorUnits(pos)) return pos;
        const S = this._tileSize();
        return {
            x: pos.x / S,
            y: pos.y / S,
            z: pos.z / S
        };
    },

    _heroTile(hero) {
        const pos = this._heroEditorPosition(hero);
        if (!pos) return null;
        return {
            x: Math.floor(pos.x),
            y: Math.floor(pos.y || 0),
            z: Math.floor(pos.z)
        };
    },

    _isHeroOnQuestTarget(hero) {
        const tile = this._heroTile(hero);
        const pos = this._heroEditorPosition(hero);
        if (!tile || !pos) return false;
        const target = this.QUEST.targetTile;
        if (tile.x === target.x && tile.z === target.z) return true;

        const center = this._targetEditorCenter();
        const closeToCenter = Math.abs(pos.x - center.x) <= 0.58 &&
            Math.abs(pos.z - center.z) <= 0.58;
        return closeToCenter;
    },

    _isTutorialMap(scene) {
        const current = scene || this._currentMapScene();
        const mapId = current && (current.id || current.mapID || (current.currentMap && current.currentMap.id));
        const tutorialId = IP2Live.MapManager && IP2Live.MapManager.getInitialMapId
            ? IP2Live.MapManager.getInitialMapId()
            : 1;
        return mapId === tutorialId || (this.isActive && this.phase !== this.PHASE.IDLE);
    },

    _dialogueLocksMovement() {
        return this.isActive && (
            this.phase === this.PHASE.INTRO ||
            this.phase === this.PHASE.COMPLETE ||
            this.isFadingOut
        );
    },

    _isMovementCode(code) {
        return ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code);
    },

    _isMovementKey(key) {
        if (!key) return false;
        const name = key.name || key.code || key;
        if (this._isMovementCode(name)) return true;
        try {
            const commands = Data.Keyboards.getCommandsGraphics();
            for (let c = 0; c < commands.length; c++) {
                if (commands[c].id >= 1 && commands[c].id <= 4 && commands[c].sc) {
                    for (let s = 0; s < commands[c].sc.length; s++) {
                        if (Data.Keyboards.isKeyEqual(key, commands[c].sc[s])) return true;
                    }
                }
            }
        } catch(e) {}
        return false;
    },

    _stripMovementInputs() {
        if (!Manager || !Manager.Events || !Manager.Events.keysPressed) return;
        for (let i = Manager.Events.keysPressed.length - 1; i >= 0; i--) {
            if (this._isMovementKey(Manager.Events.keysPressed[i])) {
                Manager.Events.keysPressed.splice(i, 1);
            }
        }
    },

    _checkQuestCompletion() {
        if (this.phase < this.PHASE.QUEST_ACTIVE || this.phase >= this.PHASE.COMPLETE) return;

        if (IP2Live.QuestManager) {
            this._syncQuestManagerState();
            const consumed = IP2Live.QuestManager.consumeCompletion('tutorial.navigation');
            if (consumed && consumed.completedObjective) {
                this._nextStep();
            }
            return;
        }

        const hero = this._questHero();
        if (!hero) return;

        if (this._isHeroOnQuestTarget(hero)) {
            this._nextStep();
        }
    },

    _getQuestScene() {
        const current = this._currentMapScene();
        const candidates = [
            current && current.scene,
            current && current.threeScene,
            current && current.mapScene,
            current && current.currentMap && current.currentMap.scene,
            current && current.currentMap && current.currentMap.threeScene,
            Manager && Manager.GL && Manager.GL.scene,
            Manager && Manager.GL && Manager.GL.currentScene
        ];
        for (let i = 0; i < candidates.length; i++) {
            if (candidates[i] && typeof candidates[i].add === 'function') return candidates[i];
        }
        return null;
    },

    _removeQuestWorldGuides() {
        this._hideQuestManagerState();
        if (this._questGuideGroup && this._questGuideGroup.parent) {
            this._questGuideGroup.parent.remove(this._questGuideGroup);
        }
        this._questGuideGroup = null;
        this._questPathMesh = null;
        this._questArrowMesh = null;
        this._questDots = [];
        this._questScene = null;
        this._questTilePulseMesh = null;
        this._questBeaconMesh = null;
        this._questTargetRingMesh = null;
        this._questTargetHighRingMesh = null;
        this._questGuideEditorUnits = null;
    },

    _ensureQuestWorldGuides() {
        if (this.phase !== this.PHASE.QUEST_ACTIVE || !THREE) {
            this._removeQuestWorldGuides();
            return;
        }

        const scene = this._getQuestScene();
        if (!scene) return;

        if (this._questGuideGroup && this._questScene !== scene) {
            this._removeQuestWorldGuides();
        }
        if (this._questGuideGroup) return;

        const liveHero = this._getLiveHeroObject(this._currentMapScene()) || this._lastHeroRef;
        const editorUnits = this._positionUsesEditorUnits(liveHero && liveHero.position);
        const visualScale = editorUnits ? 1 / this._tileSize() : 1;
        const target = this._questTargetWorld(liveHero);
        const group = THREE.Group ? new THREE.Group() : new THREE.Object3D();
        group.name = 'IP2Live_TutorialQuestGuide';

        const redMat = new THREE.MeshBasicMaterial({ color: 0xff003c, transparent: true, opacity: 0.92 });
        const redHotMat = new THREE.MeshBasicMaterial({ color: 0xff2b2b, transparent: true, opacity: 1 });
        const redGhostMat = new THREE.MeshBasicMaterial({ color: 0xff003c, transparent: true, opacity: 0.28 });
        const yellowMat = new THREE.MeshBasicMaterial({ color: 0xffe600, transparent: true, opacity: 0.98 });
        const cyanMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.42 });

        if (THREE.CylinderGeometry) {
            const tilePulse = new THREE.Mesh(new THREE.CylinderGeometry(10.5 * visualScale, 10.5 * visualScale, 0.65 * visualScale, 40), redGhostMat);
            tilePulse.name = 'IP2Live_TargetTileMarker';
            tilePulse.position.set(target.x, target.y + 0.2 * visualScale, target.z);
            group.add(tilePulse);

            const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.5 * visualScale, 1.5 * visualScale, 52 * visualScale, 12), redGhostMat);
            beacon.name = 'IP2Live_TargetBeacon';
            beacon.position.set(target.x, target.y + 26 * visualScale, target.z);
            group.add(beacon);

            this._questTilePulseMesh = tilePulse;
            this._questBeaconMesh = beacon;
        }

        if (THREE.TorusGeometry) {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(9 * visualScale, 1.4 * visualScale, 8, 36), cyanMat);
            ring.rotation.x = Math.PI / 2;
            ring.position.set(target.x, target.y + 0.35 * visualScale, target.z);
            group.add(ring);
            this._questTargetRingMesh = ring;

            const highRing = new THREE.Mesh(new THREE.TorusGeometry(6.5 * visualScale, 0.8 * visualScale, 8, 30), yellowMat);
            highRing.rotation.x = Math.PI / 2;
            highRing.position.set(target.x, target.y + 10 * visualScale, target.z);
            group.add(highRing);
            this._questTargetHighRingMesh = highRing;
        }

        const arrow = THREE.Group ? new THREE.Group() : new THREE.Object3D();
        arrow.name = 'IP2Live_TargetArrow';
        const cone = new THREE.Mesh(new THREE.ConeGeometry(6.5 * visualScale, 15 * visualScale, 4), yellowMat);
        cone.rotation.x = Math.PI;
        cone.position.set(0, 19 * visualScale, 0);
        arrow.add(cone);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.2 * visualScale, 2.2 * visualScale, 16 * visualScale, 8), redHotMat);
        shaft.position.set(0, 32 * visualScale, 0);
        arrow.add(shaft);
        arrow.position.set(target.x, target.y, target.z);
        group.add(arrow);

        const dotGeo = new THREE.SphereGeometry(2.4 * visualScale, 8, 8);
        for (let i = 0; i < 48; i++) {
            const dot = new THREE.Mesh(dotGeo, redMat);
            dot.visible = false;
            group.add(dot);
            this._questDots.push(dot);
        }

        this._questArrowMesh = arrow;
        this._questPathMesh = group;
        this._questGuideGroup = group;
        this._questScene = scene;
        this._questGuideEditorUnits = editorUnits;
        scene.add(group);
    },

    _questPathPoints(step) {
        const hero = this._getLiveHeroObject(this._currentMapScene()) || this._lastHeroRef;
        const tileUnits = this._positionUsesEditorUnits(hero && hero.position);
        const scale = tileUnits ? 1 : this._tileSize();
        const center = tileUnits ? 0.5 : scale / 2;
        const spacing = tileUnits && step > 2 ? step / this._tileSize() : step;
        const y = this.QUEST.targetTile.y * scale + (tileUnits ? 0.12 : 1.8);
        const points = [];
        const routeTiles = this.QUEST.routeTiles && this.QUEST.routeTiles.length
            ? this.QUEST.routeTiles
            : [this.QUEST.targetTile];

        const toWorld = (tile) => ({
            x: tile.x * scale + center,
            y,
            z: tile.z * scale + center
        });

        const pushSegment = (a, b) => {
            const dx = b.x - a.x;
            const dz = b.z - a.z;
            const len = Math.hypot(dx, dz);
            if (len < 0.001) return;
            const count = Math.max(1, Math.floor(len / spacing));
            for (let i = 0; i <= count; i++) {
                const t = i / count;
                points.push({
                    x: a.x + dx * t,
                    y,
                    z: a.z + dz * t
                });
            }
        };

        for (let i = 0; i < routeTiles.length - 1; i++) {
            const a = toWorld(routeTiles[i]);
            const b = toWorld(routeTiles[i + 1]);
            const corner = { x: b.x, y, z: a.z };
            pushSegment(a, corner);
            pushSegment(corner, b);
        }
        return points;
    },

    _updateQuestWorldGuides() {
        if (IP2Live.QuestManager) {
            this._syncQuestManagerState();
            return;
        }

        if (this.phase !== this.PHASE.QUEST_ACTIVE) {
            this._removeQuestWorldGuides();
            return;
        }

        this._ensureQuestWorldGuides();
        if (!this._questGuideGroup) return;

        const liveHero = this._getLiveHeroObject(this._currentMapScene()) || this._lastHeroRef;
        const editorUnits = this._positionUsesEditorUnits(liveHero && liveHero.position);
        if (this._questGuideEditorUnits !== editorUnits) {
            this._removeQuestWorldGuides();
            this._ensureQuestWorldGuides();
            if (!this._questGuideGroup) return;
        }
        const visualScale = editorUnits ? 1 / this._tileSize() : 1;
        const target = this._questTargetWorld(liveHero);
        if (this._questArrowMesh) {
            this._questArrowMesh.position.set(target.x, target.y, target.z);
            this._questArrowMesh.rotation.set(0, 0, 0);
        }
        if (this._questTilePulseMesh) {
            this._questTilePulseMesh.position.set(target.x, target.y + 0.22 * visualScale, target.z);
            this._questTilePulseMesh.scale.set(1, 1, 1);
        }
        if (this._questBeaconMesh) {
            this._questBeaconMesh.position.set(target.x, target.y + 26 * visualScale, target.z);
            this._questBeaconMesh.scale.set(1, 1, 1);
        }
        if (this._questTargetRingMesh) {
            this._questTargetRingMesh.rotation.z = 0;
        }
        if (this._questTargetHighRingMesh) {
            this._questTargetHighRingMesh.position.set(target.x, target.y + 10 * visualScale, target.z);
            this._questTargetHighRingMesh.rotation.z = 0;
        }

        const path = this._questPathPoints(10);
        for (let i = 0; i < this._questDots.length; i++) {
            const dot = this._questDots[i];
            const idx = Math.floor(i * 1.4);
            const p = path[idx];
            if (!p) {
                dot.visible = false;
                continue;
            }
            const pulse = 0.75 + Math.sin((this.animTick || 0) * 0.18 + i) * 0.22;
            dot.visible = true;
            dot.position.set(p.x, p.y, p.z);
            dot.scale.set(pulse, pulse, pulse);
        }
    },

    _drawQuestPath2D(ctx, cW, cH) {
        if (IP2Live.QuestManager) return;
        if (this.phase !== this.PHASE.QUEST_ACTIVE) return;

        const target = this._questTargetWorld();
        const hero = this._questHero();
        if (!hero) {
            this._drawQuestNoHeroFallback(ctx, cW, cH);
            return;
        }
        const editorUnits = this._positionUsesEditorUnits(hero && hero.position);
        const visualScale = editorUnits ? 1 / this._tileSize() : 1;
        const hy = target.y + 2 * visualScale;
        const current = this._currentMapScene();

        const cam = this._getActiveThreeCamera(current);

        const to2D = (x, y, z) => {
            if (!cam || !THREE || !THREE.Vector3) return null;
            const vec = new THREE.Vector3(x, y, z);
            vec.project(cam);
            if (vec.z > 1) return null;
            return {
                x: (vec.x * 0.5 + 0.5) * cW,
                y: (-vec.y * 0.5 + 0.5) * cH
            };
        };
        const isVisible2D = (p) => p &&
            p.x >= -40 && p.x <= cW + 40 &&
            p.y >= -40 && p.y <= cH + 40;

        const projectedTarget2D = to2D(target.x, hy, target.z);
        const target2D = isVisible2D(projectedTarget2D) ? projectedTarget2D : null;
        const pathPoints = this._questPathPoints(9);

        ctx.save();
        ctx.shadowBlur = 0;

        if (target2D && pathPoints.length > 0) {
            for (let i = 0; i < pathPoints.length; i += 4) {
                const p2 = to2D(pathPoints[i].x, pathPoints[i].y, pathPoints[i].z);
                if (!isVisible2D(p2)) continue;
                const r = 4.2 + Math.sin((this.animTick || 0) * 0.16 + i) * 1.1;
                ctx.beginPath();
                ctx.fillStyle = 'rgba(255, 0, 60, 0.94)';
                ctx.arc(p2.x, p2.y, r, 0, Math.PI * 2);
                ctx.fill();
            }
        } else {
            this._drawQuestScreenFallback(ctx, cW, cH, hero, target);
        }

        // HUD fallback arrow if the 3D guide cannot attach to the world scene.
        if (target2D) {
            const ax = target2D.x;
            const ay = target2D.y - 40;
            const distTiles = this._questDistanceTiles(hero);

            ctx.fillStyle = '#FFDD00';
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax - 18, ay - 35);
            ctx.lineTo(ax + 18, ay - 35);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
            ctx.stroke();

            const labelW = 180;
            const labelH = 48;
            const lx = Math.max(10, Math.min(cW - labelW - 10, ax - labelW / 2));
            const ly = Math.max(10, ay - 92);
            ctx.fillStyle = 'rgba(3, 7, 20, 0.92)';
            ctx.fillRect(lx, ly, labelW, labelH);
            ctx.strokeStyle = '#FF003C';
            ctx.lineWidth = 2;
            ctx.strokeRect(lx, ly, labelW, labelH);
            ctx.fillStyle = '#FFE600';
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('TARGET TILE', lx + labelW / 2, ly + 18);
            ctx.fillStyle = '#DAEEFF';
            ctx.font = '11px monospace';
            ctx.fillText(
                distTiles === null ? 'DIST: --' : `DIST: ${distTiles.toFixed(1)} tiles`,
                lx + labelW / 2,
                ly + 35
            );
        }

        ctx.restore();
    },

    _drawQuestScreenFallback(ctx, cW, cH, hero, target) {
        const distTiles = this._questDistanceTiles(hero);

        ctx.save();
        const labelW = 292;
        const labelH = 62;
        const lx = Math.max(12, cW - labelW - 28);
        const ly = Math.max(76, cH * 0.18);
        ctx.shadowColor = '#FF003C';
        ctx.shadowBlur = 8;
        ctx.fillStyle = 'rgba(3, 7, 20, 0.94)';
        ctx.fillRect(lx, ly, labelW, labelH);
        ctx.strokeStyle = '#FF003C';
        ctx.lineWidth = 2;
        ctx.strokeRect(lx, ly, labelW, labelH);
        ctx.fillStyle = '#FFE600';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('TARGET TILE  X:23  Y:0  Z:2', lx + labelW / 2, ly + 20);
        ctx.fillStyle = '#DAEEFF';
        ctx.font = '12px monospace';
        ctx.fillText(
            distTiles === null ? 'DISTANCE: CALCULATING' : `DISTANCE: ${distTiles.toFixed(1)} tiles`,
            lx + labelW / 2,
            ly + 39
        );
        ctx.fillStyle = 'rgba(255,230,0,0.85)';
        ctx.font = '10px monospace';
        ctx.fillText('ROTATE CAMERA UNTIL THE 3D TILE MARKER IS VISIBLE', lx + labelW / 2, ly + 54);
        ctx.restore();
    },

    _drawQuestNoHeroFallback(ctx, cW, cH) {
        const tick = this.animTick || 0;
        const cx = cW * 0.5;
        const cy = cH * 0.46 + Math.sin(tick * 0.1) * 10;

        ctx.save();
        ctx.shadowColor = '#FF003C';
        ctx.shadowBlur = 12;
        ctx.fillStyle = '#FFE600';
        ctx.beginPath();
        ctx.moveTo(cx, cy - 44);
        ctx.lineTo(cx - 26, cy + 18);
        ctx.lineTo(cx, cy + 5);
        ctx.lineTo(cx + 26, cy + 18);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#111111';
        ctx.lineWidth = 3;
        ctx.stroke();

        const labelW = 300;
        const labelH = 66;
        const lx = cx - labelW / 2;
        const ly = cy + 34;
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(3, 7, 20, 0.94)';
        ctx.fillRect(lx, ly, labelW, labelH);
        ctx.strokeStyle = '#FF003C';
        ctx.lineWidth = 2;
        ctx.strokeRect(lx, ly, labelW, labelH);
        ctx.fillStyle = '#FFE600';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('TARGET TILE  X:23  Y:0  Z:2', cx, ly + 24);
        ctx.fillStyle = '#DAEEFF';
        ctx.font = '11px monospace';
        ctx.fillText('PLAYER REF MISSING - CHECK VERSION STAMP', cx, ly + 45);
        ctx.restore();
    },

    _currentStep() {
        return this.steps.find(s => s.phase === this.phase) || null;
    },

    // â”€ Rendering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    drawOverlay(ctx, scene) {
        if (!this.isActive && this.phase !== this.PHASE.DONE) return;
        this._setSceneContext(scene || Scene.Map.current);

        this.animTick = (this.animTick || 0) + 1;
        this._checkQuestCompletion();

        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const sX = cW / SW;
        const sY = cH / SH;
        const font = IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace';
        this._updateQuestWorldGuides();

        if (this.isFadingOut) {
            if (this.fadeMode === 'in') {
                this.fadeAlpha -= 0.025;
            } else {
                this.fadeAlpha += 0.025;
            }
            ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(this.fadeAlpha, 1)})`;
            ctx.fillRect(0, 0, cW, cH);
            if (this.fadeMode === 'out' && this.fadeAlpha >= 1 && !this._teleported) {
                this._teleported = true;
                this._removeQuestWorldGuides();
                const nextId = (IP2Live.MapManager && IP2Live.MapManager.NEXT_STAGE_MAP_ID) || 3;
                if (Core.Game.current) Core.Game.current.currentMapID = nextId;
                if (IP2Live.MapManager) {
                    IP2Live.MapManager.goTo(nextId);
                } else {
                    Manager.Stack.replace(new Scene.Map(nextId));
                    Manager.Stack.clearHUD();
                }
                this.fadeMode = 'in';
                this.fadeAlpha = 1;
            } else if (this.fadeMode === 'in' && this.fadeAlpha <= 0) {
                this.isFadingOut = false;
                this.fadeMode = null;
                this.fadeAlpha = 0;
                this.isActive = false;
                this.phase = this.PHASE.IDLE;
            }
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            return;
        }

        ctx.save();
        ctx.shadowBlur = 0;

        if (this.phase === this.PHASE.DONE && !this.isFadingOut) {
            this._drawReplayBtn(ctx, cW, cH, sX, sY, font);
        } else if (this.phase === this.PHASE.INTRO) {
            this._drawIntroBoxV2(ctx, cW, cH, sX, sY, font, this.introSlides);
        } else if (this.phase === this.PHASE.COMPLETE && !this.isFadingOut) {
            this._drawIntroBoxV2(ctx, cW, cH, sX, sY, font, this.outroSlides);
            if ((this.animTick || 0) - (this._completeAutoTick || 0) > 150) {
                this.teleportToNextStage();
            }
        } else if (!this.isFadingOut) {
            if (this.phase < this.PHASE.QUEST_ACTIVE) {
                this._drawStepHUD(ctx, cW, cH, sX, sY, font);
            }
            const dialogueActive = IP2Live.DialogueManager && IP2Live.DialogueManager.isActive();
            if (this.phase >= this.PHASE.QUEST_ACTIVE && !dialogueActive) {
                this._drawQuestPath2D(ctx, cW, cH);
                this._drawQuestTracker(ctx, cW, cH, sX, sY, font);
            }
        }

        ctx.restore();
    },

    _drawQuestTracker(ctx, cW, cH, sX, sY, font) {
        if (IP2Live.QuestManager) return;
        const isPreview = this.phase === this.PHASE.QUEST_INFO;
        const tick = this.animTick || 0;
        const pulse = 0.5 + 0.5 * Math.sin(tick * 0.08);
        const qW = Math.min(430 * sX, cW - 36 * sX);
        const qH = 136 * sY;
        const qX = 18 * sX;
        const qY = (isPreview ? 78 : 18) * sY;
        const slant = 28 * sX;
        const red = '255,0,60';
        const cyan = '0,240,255';

        ctx.save();
        ctx.shadowBlur = 0;

        // Persona-inspired hacked quest placard: sharp angles, loud red tab,
        // cyan terminal details, and a compact objective readout.
        ctx.beginPath();
        ctx.moveTo(qX + slant, qY);
        ctx.lineTo(qX + qW, qY);
        ctx.lineTo(qX + qW - 12 * sX, qY + qH);
        ctx.lineTo(qX, qY + qH);
        ctx.lineTo(qX, qY + 18 * sY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(3, 7, 20, 0.94)';
        ctx.fill();

        ctx.save();
        ctx.clip();
        const scanY = qY + ((tick * 1.35) % qH);
        for (let sy = qY; sy < qY + qH; sy += 4 * sY) {
            ctx.fillStyle = 'rgba(255,255,255,0.035)';
            ctx.fillRect(qX, sy, qW, 1 * sY);
        }
        ctx.fillStyle = 'rgba(0,240,255,0.06)';
        ctx.fillRect(qX, scanY, qW, 7 * sY);
        ctx.restore();

        ctx.shadowColor = '#FF003C';
        ctx.shadowBlur = 12 + pulse * 8;
        ctx.strokeStyle = `rgba(${red},${0.65 + pulse * 0.25})`;
        ctx.lineWidth = 2 * sX;
        ctx.beginPath();
        ctx.moveTo(qX + slant, qY);
        ctx.lineTo(qX + qW, qY);
        ctx.lineTo(qX + qW - 12 * sX, qY + qH);
        ctx.lineTo(qX, qY + qH);
        ctx.lineTo(qX, qY + 18 * sY);
        ctx.closePath();
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(qX, qY + 8 * sY);
        ctx.lineTo(qX + 168 * sX, qY);
        ctx.lineTo(qX + 145 * sX, qY + 37 * sY);
        ctx.lineTo(qX, qY + 45 * sY);
        ctx.closePath();
        ctx.fillStyle = '#FF003C';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(qX + 156 * sX, qY);
        ctx.lineTo(qX + 222 * sX, qY);
        ctx.lineTo(qX + 199 * sX, qY + 37 * sY);
        ctx.lineTo(qX + 140 * sX, qY + 37 * sY);
        ctx.closePath();
        ctx.fillStyle = '#FFE600';
        ctx.fill();

        ctx.font = 'bold ' + Math.round(16 * sX) + 'px ' + font;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.fillText('QUEST AREA', qX + 14 * sX, qY + 27 * sY);

        ctx.font = 'bold ' + Math.round(8 * sX) + 'px monospace';
        ctx.fillStyle = '#111111';
        ctx.fillText('REQUIRED', qX + 154 * sX, qY + 24 * sY);

        ctx.font = Math.round(8 * sX) + 'px monospace';
        ctx.fillStyle = `rgba(${cyan},0.72)`;
        ctx.textAlign = 'right';
        ctx.fillText(isPreview ? 'OBJECTIVE_PREVIEW' : 'LIVE_TRACKING', qX + qW - 18 * sX, qY + 22 * sY);

        const rowX = qX + 18 * sX;
        const rowY = qY + 58 * sY;
        const rowW = qW - 36 * sX;
        const rowH = 46 * sY;
        ctx.fillStyle = 'rgba(255,255,255,0.055)';
        ctx.fillRect(rowX, rowY, rowW, rowH);
        ctx.strokeStyle = 'rgba(0,240,255,0.22)';
        ctx.lineWidth = 1 * sX;
        ctx.strokeRect(rowX, rowY, rowW, rowH);

        const dotPulse = 0.7 + 0.3 * Math.sin(tick * 0.2);
        ctx.beginPath();
        ctx.fillStyle = `rgba(${red},${0.75 + dotPulse * 0.25})`;
        ctx.shadowColor = '#FF003C';
        ctx.shadowBlur = 8;
        ctx.arc(rowX + 18 * sX, rowY + 23 * sY, 6 * sX, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.font = 'bold ' + Math.round(15 * sX) + 'px ' + font;
        ctx.fillStyle = '#DAEEFF';
        ctx.textAlign = 'left';
        ctx.fillText('GO TO THE SPOT', rowX + 36 * sX, rowY + 22 * sY);

        ctx.font = Math.round(8.5 * sX) + 'px monospace';
        ctx.fillStyle = 'rgba(218,238,255,0.68)';
        ctx.fillText('TARGET TILE  X:23  Y:0  Z:2', rowX + 36 * sX, rowY + 38 * sY);

        const hero = this._questHero();
        const dist = this._questDistanceTiles(hero);
        const sceneStatus = this._currentMapScene() ? 'SCENE:OK' : 'SCENE:MISS';
        const heroStatus = hero ? 'HERO:OK' : 'HERO:MISS';

        const meterX = qX + 18 * sX;
        const meterY = qY + 116 * sY;
        const meterW = qW - 36 * sX;
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1 * sX;
        ctx.beginPath();
        ctx.moveTo(meterX, meterY);
        ctx.lineTo(meterX + meterW, meterY);
        ctx.stroke();

        const dashOffset = (tick * 2) % (18 * sX);
        ctx.strokeStyle = `rgba(${red},0.92)`;
        ctx.lineWidth = 3 * sX;
        ctx.setLineDash([10 * sX, 8 * sX]);
        ctx.lineDashOffset = -dashOffset;
        ctx.beginPath();
        ctx.moveTo(meterX, meterY);
        ctx.lineTo(meterX + meterW * 0.58, meterY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.font = Math.round(9 * sX) + 'px monospace';
        ctx.fillStyle = '#00F0FF';
        ctx.textAlign = 'right';
        ctx.fillText(dist === null ? 'DIST: --' : `DIST: ${dist.toFixed(1)} tiles`, qX + qW - 18 * sX, qY + 128 * sY);

        ctx.font = Math.round(7 * sX) + 'px monospace';
        ctx.fillStyle = 'rgba(255,230,0,0.82)';
        ctx.textAlign = 'left';
        const heroPath = this._lastHeroPath ? `  ${this._lastHeroPath.slice(0, 30)}` : '';
        const unitStatus = hero && this._positionUsesEditorUnits(hero.position) ? 'UNIT:EDITOR' : 'UNIT:WORLD';
        ctx.fillText(`${this.VERSION}  ${sceneStatus}  ${heroStatus}  ${unitStatus}${heroPath}`, qX + 18 * sX, qY + 128 * sY);

        const cr = 12 * sX;
        ctx.beginPath();
        ctx.moveTo(qX, qY + cr); ctx.lineTo(qX, qY); ctx.lineTo(qX + cr, qY);
        ctx.moveTo(qX + qW - cr, qY); ctx.lineTo(qX + qW, qY); ctx.lineTo(qX + qW, qY + cr);
        ctx.moveTo(qX + qW, qY + qH - cr); ctx.lineTo(qX + qW, qY + qH); ctx.lineTo(qX + qW - cr, qY + qH);
        ctx.moveTo(qX, qY + qH - cr); ctx.lineTo(qX, qY + qH); ctx.lineTo(qX + cr, qY + qH);
        ctx.strokeStyle = '#FFE600';
        ctx.shadowColor = '#FFE600';
        ctx.shadowBlur = 5;
        ctx.lineWidth = 2 * sX;
        ctx.stroke();

        ctx.restore();
    },

    _drawReplayBtn(ctx, cW, cH, sX, sY, font) {
        const SW = Common.ScreenResolution.SCREEN_X;
        const btnW = 280, btnH = 34;
        const btnX = SW - btnW - 20;
        const btnY = 20;

        // Ensure we pass the mouse position dynamically to highlight on hover
        const mx = this.mouseX;
        const my = this.mouseY;
        const x = Common.ScreenResolution.getScreenX(btnX);
        const y = Common.ScreenResolution.getScreenY(btnY);
        const w = Common.ScreenResolution.getScreenX(btnW);
        const h = Common.ScreenResolution.getScreenY(btnH);

        const isHover = (mx >= x && mx <= x + w && my >= y && my <= y + h);

        IP2Live.UI.drawCyberButton({
            ctx,
            x: btnX * sX,
            y: btnY * sY,
            w: btnW * sX,
            h: btnH * sY,
            scaleX: sX,
            scaleY: sY,
            label: 'RESTART TUTORIAL',
            isActive: isHover,
            isDanger: false
        });

        // Ensure the screen repaints if we are hovering so the glow/scanline updates
        if (isHover && Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    },

    _makeBinParticle(cW, cH) {
        const GLYPHS = '01アイウエオカキクケコ#$%@!><=?/\\|';
        return {
            x: Math.random() * cW,
            y: Math.random() * cH,
            char: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
            alpha: Math.random() * 0.25 + 0.04,
            size: Math.random() * 6 + 7,
            vx: (Math.random() - 0.5) * 0.6,
            vy: (Math.random() - 0.5) * 0.4,
            flipTimer: Math.floor(Math.random() * 60),
            GLYPHS
        };
    },

    _updateBinParticles(cW, cH) {
        if (!this._binaryParticles) return;
        for (const p of this._binaryParticles) {
            p.x += p.vx; p.y += p.vy;
            p.flipTimer--;
            if (p.flipTimer <= 0) {
                p.char = p.GLYPHS[Math.floor(Math.random() * p.GLYPHS.length)];
                p.flipTimer = 20 + Math.floor(Math.random() * 60);
            }
            if (p.x < 0 || p.x > cW) p.vx *= -1;
            if (p.y < 0 || p.y > cH) p.vy *= -1;
        }
    },

    _drawBinParticles(ctx, cW, cH, sX) {
        if (!this._binaryParticles) return;
        ctx.save();
        ctx.textAlign = 'left';
        for (const p of this._binaryParticles) {
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = '#00FFFF';
            ctx.font = Math.round(p.size * sX) + 'px monospace';
            ctx.fillText(p.char, p.x, p.y);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
    },

    _getTypedText(fullText) {
        if (!this._lastTypedText || this._lastTypedText !== fullText) {
            this._lastTypedText = fullText;
            this.typeChars = 0;
            this.typeTimer = 0;

            // ── Fire once per textbox instance ───────────────────
            // Typing sound plays at the start of each new text reveal.
            // Glitch fires randomly — ~25% chance per new textbox,
            // so it's surprising but not guaranteed every slide.
            if (IP2Live.SoundFX) {
                IP2Live.SoundFX.playTyping();
                if (Math.random() < 0.25) {
                    IP2Live.SoundFX.playGlitch();
                }
            }
        }
        this.typeTimer++;
        if (this.typeTimer >= this.typeSpeed && this.typeChars < fullText.length) {
            this.typeChars += 2;
            this.typeTimer = 0;
        }
        const revealed = fullText.slice(0, Math.min(this.typeChars, fullText.length));
        const isDone = this.typeChars >= fullText.length;
        // Scramble suffix
        const CHARS = '01#$@!?|ABCDEFабвгд';
        const scramble = isDone ? '' : CHARS[Math.floor(Math.random() * CHARS.length)];
        return revealed + scramble;
    },


    _wrapTutorialText(ctx, text, maxW) {
        const output = [];
        const blocks = String(text || '').split('\n');
        for (let bi = 0; bi < blocks.length; bi++) {
            const block = blocks[bi];
            if (!block) {
                output.push('');
                continue;
            }
            const words = block.split(' ');
            let line = '';
            for (let wi = 0; wi < words.length; wi++) {
                const word = words[wi];
                const test = line ? line + ' ' + word : word;
                if (line && ctx.measureText(test).width > maxW) {
                    output.push(line);
                    line = word;
                } else {
                    line = test;
                }
            }
            output.push(line);
        }
        return output;
    },

    _drawIntroBoxV2(ctx, cW, cH, sX, sY, font, slideArray) {
        const slides = slideArray || this.introSlides;
        const slide = slides[this.slideIndex];
        if (!slide) return;

        const tick = this.animTick || 0;
        if (this._introSlideLastIdx !== this.slideIndex) {
            this._introSlideLastIdx = this.slideIndex;
            this._introEnterTick = tick;
        }

        const ep = Math.min(1, (tick - (this._introEnterTick || 0)) / 20);
        const ease = 1 - Math.pow(1 - ep, 3);
        const pulse = 0.5 + 0.5 * Math.sin(tick * 0.055);
        const blink = Math.floor(tick / 22) % 2 === 0;

        this._updateBinParticles(cW, cH);
        this._drawBinParticles(ctx, cW, cH, sX);

        const panelX = 26 * sX;
        const panelW = cW - 52 * sX;
        const panelH = Math.min(286 * sY, cH * 0.34);
        const panelY = cH - panelH - 26 * sY + (1 - ease) * 58 * sY;
        const cut = 32 * sX;
        const headerH = 50 * sY;
        const promptH = 25 * sY;

        ctx.save();
        ctx.globalAlpha = ease;

        ctx.beginPath();
        ctx.moveTo(panelX + cut, panelY);
        ctx.lineTo(panelX + panelW, panelY);
        ctx.lineTo(panelX + panelW, panelY + panelH - 22 * sY);
        ctx.lineTo(panelX + panelW - 14 * sX, panelY + panelH);
        ctx.lineTo(panelX, panelY + panelH);
        ctx.lineTo(panelX, panelY + 36 * sY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(3,7,20,0.965)';
        ctx.fill();

        ctx.save();
        ctx.clip();
        const bodyGrad = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY);
        bodyGrad.addColorStop(0, 'rgba(255,0,60,0.13)');
        bodyGrad.addColorStop(0.18, 'rgba(0,240,255,0.08)');
        bodyGrad.addColorStop(0.72, 'rgba(5,10,28,0.20)');
        bodyGrad.addColorStop(1, 'rgba(255,230,0,0.06)');
        ctx.fillStyle = bodyGrad;
        ctx.fillRect(panelX, panelY, panelW, panelH);

        for (let sy2 = panelY; sy2 < panelY + panelH; sy2 += 4 * sY) {
            ctx.fillStyle = 'rgba(255,255,255,0.025)';
            ctx.fillRect(panelX, sy2, panelW, Math.max(1, 1 * sY));
        }

        const sweepY = panelY + ((tick * 1.35) % panelH);
        ctx.fillStyle = 'rgba(0,240,255,0.05)';
        ctx.fillRect(panelX, sweepY, panelW, 7 * sY);
        ctx.restore();

        ctx.beginPath();
        ctx.moveTo(panelX + cut, panelY);
        ctx.lineTo(panelX + panelW, panelY);
        ctx.lineTo(panelX + panelW, panelY + panelH - 22 * sY);
        ctx.lineTo(panelX + panelW - 14 * sX, panelY + panelH);
        ctx.lineTo(panelX, panelY + panelH);
        ctx.lineTo(panelX, panelY + 36 * sY);
        ctx.closePath();
        ctx.shadowColor = '#00F0FF';
        ctx.shadowBlur = 10 + pulse * 12;
        ctx.strokeStyle = 'rgba(0,240,255,' + (0.62 + pulse * 0.22) + ')';
        ctx.lineWidth = 1.5 * sX;
        ctx.stroke();

        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.moveTo(panelX, panelY);
        ctx.lineTo(panelX + Math.min(400 * sX, panelW * 0.36), panelY);
        ctx.lineTo(panelX + Math.min(450 * sX, panelW * 0.42), panelY + headerH);
        ctx.lineTo(panelX, panelY + headerH);
        ctx.closePath();
        const headerGrad = ctx.createLinearGradient(panelX, panelY, panelX + panelW * 0.45, panelY);
        headerGrad.addColorStop(0, 'rgba(255,0,60,0.96)');
        headerGrad.addColorStop(0.68, 'rgba(60,0,28,0.80)');
        headerGrad.addColorStop(1, 'rgba(3,7,20,0.10)');
        ctx.fillStyle = headerGrad;
        ctx.fill();

        const yellowX = panelX + Math.min(390 * sX, panelW * 0.35);
        ctx.beginPath();
        ctx.moveTo(yellowX, panelY);
        ctx.lineTo(yellowX + 120 * sX, panelY);
        ctx.lineTo(yellowX + 84 * sX, panelY + headerH);
        ctx.lineTo(yellowX - 28 * sX, panelY + headerH);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,230,0,0.96)';
        ctx.fill();

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bolder italic ' + Math.round(13 * sX) + 'px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('// INCOMING TRANSMISSION //', panelX + 24 * sX, panelY + 33 * sY);

        ctx.fillStyle = '#07101C';
        ctx.font = 'bolder italic ' + Math.round(13 * sX) + 'px monospace';
        ctx.fillText('MISSION', yellowX + 16 * sX, panelY + 33 * sY);

        ctx.font = Math.round(7.5 * sX) + 'px monospace';
        ctx.fillStyle = 'rgba(0,255,255,0.72)';
        ctx.textAlign = 'right';
        ctx.fillText(blink ? 'AWAITING_ACTION' : 'SIGNAL_LOCKED', panelX + panelW - 26 * sX, panelY + 30 * sY);

        const totalSlides = slides.length;
        const pipGap = 16 * sX;
        const pipStart = panelX + panelW - 34 * sX - Math.max(0, totalSlides - 1) * pipGap;
        for (let pi = 0; pi < totalSlides; pi++) {
            const active = pi === this.slideIndex;
            ctx.save();
            ctx.translate(pipStart + pi * pipGap, panelY + headerH + 14 * sY);
            ctx.rotate(Math.PI / 4);
            const ps = (active ? 5.2 : 3.4) * sX;
            ctx.shadowColor = active ? '#FFE600' : 'transparent';
            ctx.shadowBlur = active ? 9 : 0;
            ctx.fillStyle = active ? '#FFE600' : 'rgba(218,238,255,0.34)';
            ctx.fillRect(-ps, -ps, ps * 2, ps * 2);
            ctx.restore();
        }

        const infoY = panelY + headerH + 25 * sY;
        ctx.fillStyle = blink ? '#00FFFF' : 'rgba(0,255,255,0.42)';
        ctx.shadowColor = '#00FFFF';
        ctx.shadowBlur = blink ? 8 : 2;
        ctx.fillRect(panelX + 25 * sX, infoY - 12 * sY, 5 * sX, 13 * sY);
        ctx.shadowBlur = 0;

        const slideNum = this.slideIndex + 1;
        const sLabel = slideNum < 10 ? '0' + slideNum : '' + slideNum;
        ctx.font = Math.round(7.5 * sX) + 'px monospace';
        ctx.fillStyle = 'rgba(0,255,255,0.68)';
        ctx.textAlign = 'left';
        ctx.fillText('SYS://NEURAL_LINK > MISSION_BRIEF > SLIDE_' + sLabel, panelX + 39 * sX, infoY);

        ctx.strokeStyle = 'rgba(0,255,255,0.16)';
        ctx.lineWidth = 1 * sX;
        ctx.beginPath();
        ctx.moveTo(panelX + 24 * sX, infoY + 11 * sY);
        ctx.lineTo(panelX + panelW - 24 * sX, infoY + 11 * sY);
        ctx.stroke();

        const fullText = slide.join('\n');
        const displayed = this._getTypedText(fullText);
        let textFontSize = Math.round(25 * sX);
        let lineH = 18 * sY;
        const textX = panelX + 28 * sX;
        const textW = panelW - 56 * sX;
        const textTop = infoY + 43 * sY;
        const promptY = panelY + panelH - promptH - 13 * sY;
        const textBottom = promptY - 18 * sY;

        ctx.font = textFontSize + 'px ' + font;
        let lines = this._wrapTutorialText(ctx, displayed, textW);

        ctx.fillStyle = '#DAEEFF';
        ctx.textAlign = 'left';
        let ty = textTop;
        for (let li = 0; li < lines.length && ty <= textBottom; li++) {
            const line = lines[li];
            if (!line) {
                ty += 9 * sY;
                continue;
            }
            ctx.fillText(line, textX, ty);
            ty += lineH;
        }

        const typingDone = this.typeChars >= fullText.length;
        if (typingDone) {
            const pA = 0.34 + 0.42 * Math.sin(tick * 0.1);
            ctx.beginPath();
            ctx.moveTo(panelX + 28 * sX, promptY);
            ctx.lineTo(panelX + panelW - 28 * sX, promptY);
            ctx.lineTo(panelX + panelW - 38 * sX, promptY + promptH);
            ctx.lineTo(panelX + 38 * sX, promptY + promptH);
            ctx.closePath();
            ctx.fillStyle = 'rgba(0,255,255,' + (0.05 + pA * 0.06) + ')';
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,255,255,' + (0.18 + pA * 0.34) + ')';
            ctx.stroke();
            ctx.font = Math.round(8 * sX) + 'px monospace';
            ctx.fillStyle = 'rgba(0,255,255,' + pA + ')';
            ctx.textAlign = 'center';
            ctx.fillText((blink ? '> ' : '  ') + 'ENTER / CLICK TO CONTINUE' + (blink ? ' <' : '  '), panelX + panelW / 2, promptY + promptH * 0.68);
        }

        ctx.strokeStyle = '#FFE600';
        ctx.shadowColor = '#FFE600';
        ctx.shadowBlur = 6;
        ctx.lineWidth = 2 * sX;
        const cr = 14 * sX;
        ctx.beginPath();
        ctx.moveTo(panelX, panelY + cr); ctx.lineTo(panelX, panelY); ctx.lineTo(panelX + cr, panelY);
        ctx.moveTo(panelX + panelW - cr, panelY); ctx.lineTo(panelX + panelW, panelY); ctx.lineTo(panelX + panelW, panelY + cr);
        ctx.moveTo(panelX + panelW, panelY + panelH - cr); ctx.lineTo(panelX + panelW, panelY + panelH); ctx.lineTo(panelX + panelW - cr, panelY + panelH);
        ctx.moveTo(panelX + cr, panelY + panelH); ctx.lineTo(panelX, panelY + panelH); ctx.lineTo(panelX, panelY + panelH - cr);
        ctx.stroke();

        ctx.restore();
    },



    _drawIntroBox(ctx, cW, cH, sX, sY, font, slideArray) {
        const slides = slideArray || this.introSlides;
        const slide = slides[this.slideIndex];
        if (!slide) return;
        const tick = this.animTick || 0;

        // Enter animation: panel slides up from bottom
        if (this._introSlideLastIdx !== this.slideIndex) {
            this._introSlideLastIdx = this.slideIndex;
            this._introEnterTick = tick;
        }
        const ep = Math.min(1, (tick - (this._introEnterTick || 0)) / 20);
        const ease = 1 - Math.pow(1 - ep, 3);

        this._updateBinParticles(cW, cH);
        this._drawBinParticles(ctx, cW, cH, sX);

        const pulse = 0.5 + 0.5 * Math.sin(tick * 0.055);
        const blink = Math.floor(tick / 22) % 2 === 0;

        // ── LAYOUT ──────────────────────────────────────────────────
        const panelH = 210 * sY;
        const panelY = cH - panelH - 18 * sY + (1 - ease) * 55 * sY;
        const panelX = 18 * sX;
        const panelW = cW - 36 * sX;

        // ── FLOATING TAB (right-trapezoid: straight left, flares right at bottom) ─
        const tabH = 38 * sY;    // taller for breathing room
        const tabW = 400 * sX;   // wider
        const tabSlR = 42 * sX;    // right flare
        const tabX = panelX;
        const tabY = panelY - tabH + 8 * sY;  // overlaps panel top by 8px

        ctx.globalAlpha = ease;

        // ── TAB FILL ─────────────────────────────────────────────────
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(tabX, tabY);          // top-left  (vertical)
        ctx.lineTo(tabX + tabW, tabY);          // top-right
        ctx.lineTo(tabX + tabW + tabSlR, tabY + tabH);   // bottom-right (flares RIGHT)
        ctx.lineTo(tabX, tabY + tabH);   // bottom-left (vertical)
        ctx.closePath();
        const tabGrad = ctx.createLinearGradient(tabX, tabY, tabX + tabW + tabSlR, tabY);
        tabGrad.addColorStop(0, 'rgba(255,0,60,0.96)');
        tabGrad.addColorStop(0.58, 'rgba(78,0,28,0.82)');
        tabGrad.addColorStop(1, 'rgba(3,7,20,0.30)');
        ctx.fillStyle = tabGrad;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(tabX + tabW * 0.68, tabY);
        ctx.lineTo(tabX + tabW + 26 * sX, tabY);
        ctx.lineTo(tabX + tabW + tabSlR, tabY + tabH);
        ctx.lineTo(tabX + tabW * 0.60, tabY + tabH);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,230,0,0.95)';
        ctx.fill();

        // ── TAB BORDER (yellow glow) ─────────────────────────────────
        ctx.beginPath();
        ctx.moveTo(tabX, tabY);
        ctx.lineTo(tabX + tabW, tabY);
        ctx.lineTo(tabX + tabW + tabSlR, tabY + tabH);
        ctx.lineTo(tabX, tabY + tabH);
        ctx.closePath();
        ctx.shadowColor = '#00F0FF';
        ctx.shadowBlur = 8 + pulse * 7;
        ctx.strokeStyle = 'rgba(0,240,255,' + (0.70 + pulse * 0.25) + ')';
        ctx.lineWidth = 1.5 * sX;
        ctx.stroke();
        ctx.restore();

        // ── TAB LABEL (vertically centred) ───────────────────────────
        ctx.save();
        ctx.font = 'bold ' + Math.round(9 * sX) + 'px monospace';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.shadowBlur = 0;
        // Canvas text baseline is 'alphabetic'; offset ~0.35em upward centres cap-height
        var tabMidY = tabY + tabH / 2 + Math.round(3 * sY);
        ctx.fillText('// INCOMING  TRANSMISSION //', tabX + 16 * sX, tabMidY);
        ctx.restore();

        // ── TAB PROGRESS DIAMONDS ────────────────────────────────
        var totalSlides = slides.length;
        // Anchor fully inside the solid tab body, well left of the flare
        var dGroupW = (totalSlides - 1) * 16 * sX;  // total diamond row width
        var dBaseX = tabX + tabW - 22 * sX - dGroupW;  // rightmost diamond position
        var dCentreY = tabY + tabH / 2;
        for (var _di = 0; _di < totalSlides; _di++) {
            var isAct = _di === this.slideIndex;
            var dX = dBaseX + _di * 16 * sX;
            ctx.save();
            ctx.translate(dX, dCentreY);
            ctx.rotate(Math.PI / 4);
            var ds = (isAct ? 5.5 : 3.5) * sX;
            if (isAct) { ctx.shadowColor = '#FFE600'; ctx.shadowBlur = 10; }
            ctx.fillStyle = isAct ? '#FFE600' : 'rgba(218,238,255,0.36)';
            ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
            ctx.restore();
        }


        // ── MAIN BODY PANEL (full-width, below/behind tab) ───────────
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(panelX + 18 * sX, panelY);
        ctx.lineTo(panelX + panelW, panelY);
        ctx.lineTo(panelX + panelW - 12 * sX, panelY + panelH);
        ctx.lineTo(panelX, panelY + panelH);
        ctx.lineTo(panelX, panelY + 22 * sY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(3,7,20,0.965)';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(panelX, panelY);
        ctx.lineTo(panelX + 62 * sX, panelY);
        ctx.lineTo(panelX + 44 * sX, panelY + panelH);
        ctx.lineTo(panelX, panelY + panelH);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,240,255,0.18)';
        ctx.fill();

        // Scanlines + glitch sweep clipped inside
        ctx.save();
        ctx.clip();
        for (let sy2 = panelY; sy2 < panelY + panelH; sy2 += 4 * sY) {
            ctx.fillStyle = 'rgba(255,255,255,0.025)';
            ctx.fillRect(panelX, sy2, panelW, sY);
        }
        const gY = panelY + ((tick * 1.4) % panelH);
        ctx.fillStyle = 'rgba(0,240,255,0.035)';
        ctx.fillRect(panelX, gY, panelW, 6 * sY);
        ctx.restore();

        // Neon border
        ctx.beginPath();
        ctx.moveTo(panelX + 18 * sX, panelY);
        ctx.lineTo(panelX + panelW, panelY);
        ctx.lineTo(panelX + panelW - 12 * sX, panelY + panelH);
        ctx.lineTo(panelX, panelY + panelH);
        ctx.lineTo(panelX, panelY + 22 * sY);
        ctx.closePath();
        ctx.shadowColor = '#00FFFF';
        ctx.shadowBlur = 12 + pulse * 14;
        ctx.strokeStyle = 'rgba(0,240,255,' + (0.58 + pulse * 0.30) + ')';
        ctx.lineWidth = 1.5 * sX;
        ctx.stroke();
        ctx.restore();

        // Corner L-brackets (all 4)
        ctx.save();
        ctx.strokeStyle = '#FFE600';
        ctx.shadowColor = '#FFE600';
        ctx.shadowBlur = 5;
        ctx.lineWidth = 2 * sX;
        var cr = 14 * sX;
        ctx.beginPath();
        ctx.moveTo(panelX, panelY + cr); ctx.lineTo(panelX, panelY); ctx.lineTo(panelX + cr, panelY);
        ctx.moveTo(panelX + panelW - cr, panelY); ctx.lineTo(panelX + panelW, panelY); ctx.lineTo(panelX + panelW, panelY + cr);
        ctx.moveTo(panelX + panelW, panelY + panelH - cr); ctx.lineTo(panelX + panelW, panelY + panelH); ctx.lineTo(panelX + panelW - cr, panelY + panelH);
        ctx.moveTo(panelX + cr, panelY + panelH); ctx.lineTo(panelX, panelY + panelH); ctx.lineTo(panelX, panelY + panelH - cr);
        ctx.stroke();
        ctx.restore();

        // ── HEADER ROW inside panel ──────────────────────────────────
        var hdrX = panelX + 18 * sX;
        // Blinking status blip
        ctx.save();
        ctx.fillStyle = blink ? '#00FFFF' : 'rgba(0,255,255,0.35)';
        ctx.shadowColor = '#00FFFF';
        ctx.shadowBlur = blink ? 8 : 2;
        ctx.fillRect(hdrX, panelY + 8 * sY, 5 * sX, 12 * sY);
        ctx.restore();

        ctx.font = Math.round(7.5 * sX) + 'px monospace';
        ctx.fillStyle = 'rgba(0,255,255,0.60)';
        ctx.textAlign = 'left';
        ctx.shadowBlur = 0;
        var slideNum = this.slideIndex + 1;
        var sLabel = slideNum < 10 ? '0' + slideNum : '' + slideNum;
        ctx.fillText('SYS://NEURAL_LINK > MISSION_BRIEF > SLIDE_' + sLabel, hdrX + 9 * sX, panelY + 18 * sY);

        // Divider line
        ctx.strokeStyle = 'rgba(0,255,255,0.14)';
        ctx.lineWidth = 1 * sX;
        ctx.beginPath();
        ctx.moveTo(hdrX, panelY + 25 * sY);
        ctx.lineTo(panelX + panelW - 16 * sX, panelY + 25 * sY);
        ctx.stroke();

        // ── BODY TEXT ────────────────────────────────────────────────
        var fullText = slide.join('\n');
        var displayed = this._getTypedText(fullText);
        var lines = displayed.split('\n');
        var nonEmpty = 0, emptyGap = 0;
        for (var _li = 0; _li < slide.length; _li++) { if (slide[_li]) nonEmpty++; else emptyGap++; }
        var lineH = 22 * sY;
        var totalTH = (nonEmpty * lineH) + (emptyGap * 9 * sY);
        var textAreaY = panelY + 32 * sY;
        var textAreaH = panelH - 32 * sY - 52 * sY;  // 52px bottom reserve (prompt + padding)
        var ty = textAreaY + Math.max(0, (textAreaH - totalTH) / 2);

        for (var _tli = 0; _tli < lines.length; _tli++) {
            var line = lines[_tli];
            if (!line) { ty += 9 * sY; continue; }
            ctx.font = Math.round(13 * sX) + 'px ' + font;
            ctx.fillStyle = '#DAEEFF';
            ctx.shadowBlur = 0;
            ctx.textAlign = 'left';
            ctx.fillText(line, hdrX, ty);
            ty += lineH;
        }

        // ── PROMPT BAR ───────────────────────────────────────────────
        var typingDone = this.typeChars >= fullText.length;
        if (typingDone) {
            var pA = 0.3 + 0.45 * Math.sin(tick * 0.1);
            var pBarH = 22 * sY;
            var pBarY = panelY + panelH - pBarH - 10 * sY;
            var pBarX = hdrX;
            var pBarW = panelW - 36 * sX;
            ctx.save();
            ctx.fillStyle = 'rgba(0,255,255,' + (pA * 0.09) + ')';
            ctx.fillRect(pBarX, pBarY, pBarW, pBarH);
            ctx.strokeStyle = 'rgba(0,255,255,' + (pA * 0.5) + ')';
            ctx.lineWidth = 1 * sX;
            ctx.beginPath();
            ctx.moveTo(pBarX, pBarY); ctx.lineTo(pBarX + pBarW, pBarY);
            ctx.moveTo(pBarX, pBarY + pBarH); ctx.lineTo(pBarX + pBarW, pBarY + pBarH);
            ctx.stroke();
            ctx.font = Math.round(8 * sX) + 'px monospace';
            ctx.fillStyle = 'rgba(0,255,255,' + pA + ')';
            ctx.textAlign = 'center';
            ctx.fillText((blink ? '\u25b6' : ' ') + '  ENTER / CLICK TO CONTINUE  ' + (blink ? '\u25c0' : ' '), pBarX + pBarW / 2, pBarY + pBarH * 0.68);
            ctx.restore();
        }

        ctx.globalAlpha = 1;
    },


    _drawStepHUD(ctx, cW, cH, sX, sY, font) {
        const step = this._currentStep();
        if (!step) return;
        this.animTick = (this.animTick || 0) + 1;
        const tick = this.animTick;
        const isDone = this.phase === this.PHASE.COMPLETE;
        const accent = isDone ? '#FFE600' : '#00FFFF';
        const aRGB = isDone ? '255,230,0' : '0,255,255';
        const blink = Math.floor(tick / 22) % 2 === 0;

        // Phase change slide-in
        if (this._stepLastPhase !== this.phase) {
            this._stepLastPhase = this.phase;
            this._stepEnterTick = tick;
        }
        const ep = Math.min(1, (tick - (this._stepEnterTick || 0)) / 18);
        const ease = 1 - Math.pow(1 - ep, 3);

        this._updateBinParticles(cW, cH);
        this._drawBinParticles(ctx, cW, cH, sX);

        const pulse = 0.5 + 0.5 * Math.sin(tick * 0.07);

        // ── TOP HEADER STRIP ─────────────────────────────────────────
        const barH = 52 * sY;
        const barX = 18 * sX;
        const barW = cW - 36 * sX;
        const barY = 14 * sY + (1 - ease) * -56 * sY;
        const tabW = 280 * sX;
        const slantW = 30 * sX;

        ctx.save();
        ctx.globalAlpha = ease;

        // Slanted command strip.
        ctx.beginPath();
        ctx.moveTo(barX + 18 * sX, barY);
        ctx.lineTo(barX + barW, barY);
        ctx.lineTo(barX + barW - 10 * sX, barY + barH);
        ctx.lineTo(barX, barY + barH);
        ctx.lineTo(barX, barY + 18 * sY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(3,7,20,0.965)';
        ctx.fill();

        // Left Persona-style slash tab.
        ctx.beginPath();
        ctx.moveTo(barX, barY);
        ctx.lineTo(barX + tabW * 0.74, barY);
        ctx.lineTo(barX + tabW * 0.62, barY + barH);
        ctx.lineTo(barX, barY + barH);
        ctx.closePath();
        const tg = ctx.createLinearGradient(barX, barY, barX + tabW, barY);
        tg.addColorStop(0, isDone ? 'rgba(255,230,0,0.72)' : 'rgba(255,0,60,0.82)');
        tg.addColorStop(0.58, isDone ? 'rgba(86,74,0,0.45)' : 'rgba(72,0,28,0.55)');
        tg.addColorStop(1, 'rgba(3,7,20,0)');
        ctx.fillStyle = tg;
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(barX + tabW * 0.62, barY);
        ctx.lineTo(barX + tabW * 0.86, barY);
        ctx.lineTo(barX + tabW * 0.74, barY + barH);
        ctx.lineTo(barX + tabW * 0.52, barY + barH);
        ctx.closePath();
        ctx.fillStyle = '#FFE600';
        ctx.fill();

        // Glowing bottom border line
        ctx.shadowColor = accent;
        ctx.shadowBlur = 10 + pulse * 10;
        ctx.strokeStyle = `rgba(${aRGB},${0.75 + pulse * 0.25})`;
        ctx.lineWidth = 1.5 * sX;
        ctx.beginPath();
        ctx.moveTo(barX, barY + barH);
        ctx.lineTo(barX + barW, barY + barH);
        ctx.stroke();

        ctx.strokeStyle = '#FFE600';
        ctx.shadowColor = '#FFE600';
        ctx.shadowBlur = 4;
        ctx.lineWidth = 1.5 * sX;
        ctx.beginPath();
        ctx.moveTo(barX, barY + 8 * sY);
        ctx.lineTo(barX, barY);
        ctx.lineTo(barX + 12 * sX, barY);
        ctx.moveTo(barX + barW - 12 * sX, barY);
        ctx.lineTo(barX + barW, barY);
        ctx.lineTo(barX + barW, barY + 12 * sY);
        ctx.stroke();

        // Ghost phase number watermark
        ctx.shadowBlur = 0;
        ctx.font = 'bold ' + Math.round(34 * sX) + 'px ' + font;
        ctx.fillStyle = `rgba(${aRGB},0.07)`;
        ctx.textAlign = 'left';
        var phNum = String(this.phase); if (phNum.length < 2) phNum = '0' + phNum;
        ctx.fillText(phNum, barX + 8 * sX, barY + barH - 4 * sY);

        // Phase header label
        ctx.font = 'bold ' + Math.round(13 * sX) + 'px ' + font;
        ctx.fillStyle = accent;
        ctx.shadowColor = accent;
        ctx.shadowBlur = 5;
        ctx.textAlign = 'left';
        ctx.fillText('// ' + step.header, barX + 12 * sX, barY + barH * 0.64);

        // Right-side rotating tag
        const tags = ['SENSOR_ACTIVE', 'TRACKING_INPUT', 'AWAITING_ACTION', 'MONITORING_KEYS'];
        const tag = `● ${tags[Math.floor(tick / 40) % tags.length]}`;
        ctx.font = Math.round(7.5 * sX) + 'px monospace';
        ctx.fillStyle = `rgba(${aRGB},0.4)`;
        ctx.shadowBlur = 0;
        ctx.textAlign = 'right';
        ctx.fillText(tag, barX + barW - 10 * sX, barY + barH * 0.64);

        // Top-right corner bracket
        ctx.strokeStyle = '#FFE600';
        ctx.shadowColor = '#FFE600';
        ctx.shadowBlur = 4;
        ctx.lineWidth = 1.5 * sX;
        const crT = 10 * sX;
        ctx.beginPath();
        ctx.moveTo(barX + barW - crT, barY);
        ctx.lineTo(barX + barW, barY);
        ctx.lineTo(barX + barW, barY + crT);
        ctx.stroke();

        ctx.restore();

        // ── BOTTOM INSTRUCTION BOX ───────────────────────────────────
        const boxH = 104 * sY;
        const boxW = cW - 36 * sX;
        const boxX = 18 * sX;
        const boxY = cH - boxH - 14 * sY + (1 - ease) * 56 * sY;
        const sbW = 8 * sX;

        ctx.save();
        ctx.globalAlpha = ease;

        // Slanted instruction console.
        ctx.beginPath();
        ctx.moveTo(boxX + 18 * sX, boxY);
        ctx.lineTo(boxX + boxW, boxY);
        ctx.lineTo(boxX + boxW - 12 * sX, boxY + boxH);
        ctx.lineTo(boxX, boxY + boxH);
        ctx.lineTo(boxX, boxY + 22 * sY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(3,7,20,0.965)';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(boxX, boxY);
        ctx.lineTo(boxX + 74 * sX, boxY);
        ctx.lineTo(boxX + 54 * sX, boxY + boxH);
        ctx.lineTo(boxX, boxY + boxH);
        ctx.closePath();
        ctx.fillStyle = isDone ? 'rgba(255,230,0,0.24)' : 'rgba(255,0,60,0.22)';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(boxX + boxW - 128 * sX, boxY);
        ctx.lineTo(boxX + boxW - 16 * sX, boxY);
        ctx.lineTo(boxX + boxW - 46 * sX, boxY + 30 * sY);
        ctx.lineTo(boxX + boxW - 156 * sX, boxY + 30 * sY);
        ctx.closePath();
        ctx.fillStyle = '#FFE600';
        ctx.fill();

        // Scanlines + glitch sweep
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(boxX + 18 * sX, boxY);
        ctx.lineTo(boxX + boxW, boxY);
        ctx.lineTo(boxX + boxW - 12 * sX, boxY + boxH);
        ctx.lineTo(boxX, boxY + boxH);
        ctx.lineTo(boxX, boxY + 22 * sY);
        ctx.closePath();
        ctx.clip();
        for (let sy2 = boxY; sy2 < boxY + boxH; sy2 += 4 * sY) {
            ctx.fillStyle = 'rgba(255,255,255,0.026)';
            ctx.fillRect(boxX, sy2, boxW, sY);
        }
        const gY = boxY + ((tick * 1.2) % boxH);
        ctx.fillStyle = `rgba(${aRGB},0.025)`;
        ctx.fillRect(boxX, gY, boxW, 5 * sY);
        ctx.restore();

        // Thick left accent bar
        ctx.fillStyle = accent;
        ctx.shadowColor = accent;
        ctx.shadowBlur = 10 + pulse * 10;
        ctx.fillRect(boxX, boxY, sbW, boxH);
        ctx.shadowBlur = 0;

        // Box borders
        ctx.shadowColor = accent;
        ctx.shadowBlur = 8 + pulse * 8;
        ctx.strokeStyle = `rgba(${aRGB},${0.6 + pulse * 0.3})`;
        ctx.lineWidth = 1.5 * sX;
        ctx.beginPath();
        ctx.moveTo(boxX + 18 * sX, boxY);
        ctx.lineTo(boxX + boxW, boxY);
        ctx.lineTo(boxX + boxW - 12 * sX, boxY + boxH);
        ctx.lineTo(boxX, boxY + boxH);
        ctx.lineTo(boxX, boxY + 22 * sY);
        ctx.closePath();
        ctx.stroke();

        // Corner L-brackets (all four)
        const cr = 12 * sX;
        ctx.shadowBlur = 4;
        ctx.strokeStyle = '#FFE600';
        ctx.shadowColor = '#FFE600';
        ctx.lineWidth = 2 * sX;
        ctx.beginPath();
        // Top-left
        ctx.moveTo(boxX, boxY + cr); ctx.lineTo(boxX, boxY); ctx.lineTo(boxX + cr, boxY);
        // Top-right
        ctx.moveTo(boxX + boxW - cr, boxY); ctx.lineTo(boxX + boxW, boxY); ctx.lineTo(boxX + boxW, boxY + cr);
        // Bottom-right
        ctx.moveTo(boxX + boxW - cr, boxY + boxH); ctx.lineTo(boxX + boxW, boxY + boxH); ctx.lineTo(boxX + boxW, boxY + boxH - cr);
        // Bottom-left
        ctx.moveTo(boxX, boxY + boxH - cr); ctx.lineTo(boxX, boxY + boxH); ctx.lineTo(boxX + cr, boxY + boxH);
        ctx.stroke();

        // Internal thin separator between body text and hint
        const sepY = boxY + boxH - 26 * sY;
        ctx.strokeStyle = `rgba(${aRGB},0.12)`;
        ctx.shadowBlur = 0;
        ctx.lineWidth = 1 * sX;
        ctx.beginPath();
        ctx.moveTo(boxX + sbW + 12 * sX, sepY);
        ctx.lineTo(boxX + boxW - 12 * sX, sepY);
        ctx.stroke();

        ctx.font = Math.round(7.5 * sX) + 'px monospace';
        ctx.fillStyle = isDone ? 'rgba(20,20,20,0.82)' : 'rgba(255,255,255,0.88)';
        ctx.textAlign = 'right';
        ctx.fillText(isDone ? 'PHASE_CLEAR' : 'TRAINING_INPUT', boxX + boxW - 58 * sX, boxY + 20 * sY);

        // Body text (typed)
        const displayed = this._getTypedText(step.body);
        ctx.font = Math.round(14 * sX) + 'px ' + font;
        ctx.fillStyle = '#DAEEFF';
        ctx.shadowBlur = 0;
        ctx.textAlign = 'left';
        ctx.fillText(displayed, boxX + sbW + 16 * sX, boxY + (boxH - 26 * sY) / 2 + 5 * sY);

        // Hint prompt (flashing, shown after typing finishes)
        const typeDone = this.typeChars >= step.body.length;
        const pAlpha = isDone
            ? 0.55 + 0.4 * Math.sin(tick * 0.12)
            : typeDone ? 0.30 + 0.2 * Math.sin(tick * 0.08) : 0;
        if (pAlpha > 0) {
            ctx.font = Math.round(8.5 * sX) + 'px monospace';
            ctx.fillStyle = isDone ? `rgba(255,230,0,${pAlpha})` : `rgba(0,255,255,${pAlpha})`;
            ctx.textAlign = 'left';
            ctx.fillText(
                blink ? `▶  ${step.hint}` : `   ${step.hint}`,
                boxX + sbW + 16 * sX, boxY + boxH - 10 * sY
            );
        }

        ctx.restore();
    },
};

// ================================================================
//  § T-2  ATTACH TO IP2Live NAMESPACE + SCENE.MAP INJECTION
// ================================================================
IP2Live.Tutorial = Tutorial;
window.IP2LiveTutorial = Tutorial;
window.IP2LiveTutorialDebug = function () {
    const scene = Tutorial._currentMapScene();
    const hero = Tutorial._questHero();
    const target = Tutorial._questTargetWorld();
    const dist = Tutorial._questDistanceTiles(hero);
        const state = {
            version: Tutorial.VERSION,
            phase: Tutorial.phase,
            isActive: Tutorial.isActive,
            sceneFound: !!scene,
            sceneId: scene && (scene.id || scene.mapID || (scene.currentMap && scene.currentMap.id)),
            heroFound: !!hero,
            heroPath: Tutorial._lastHeroPath || null,
            heroPosition: Tutorial._heroWorldPosition(hero),
            heroEditorPosition: Tutorial._heroEditorPosition(hero),
            heroTile: Tutorial._heroTile(hero),
            positionUnits: hero && Tutorial._positionUsesEditorUnits(hero.position) ? 'editor' : 'world',
            targetTile: Tutorial.QUEST.targetTile,
            target,
        distanceTiles: dist
    };
    console.log('[IP2Live] Tutorial debug state:', state);
    return state;
};

// Inject the overlay draw call into Scene.Map
const _origDrawHUD = Scene.Map.prototype.drawHUD;
Scene.Map.prototype.drawHUD = function () {
    _origDrawHUD.call(this);
    if (Tutorial.isActive || Tutorial.phase === Tutorial.PHASE.DONE) {
        Tutorial.drawOverlay(Common.Platform.ctx, this);
    }
};

// Inject logic into Map Update for tutorial scene context and dialogue movement locks.
const _origMapUpdate = Scene.Map.prototype.update;
Scene.Map.prototype.update = function () {
    Tutorial._setSceneContext(this);

    const getHero = () => (Scene.Map.current && Scene.Map.current.heroMapObject) ||
        this.heroMapObject ||
        (this.mapObjects && this.mapObjects[0]);

    const hero = getHero();
    if (hero && Tutorial._isTutorialMap(this) && Tutorial._dialogueLocksMovement()) {
        Tutorial._stripMovementInputs();
    }

    _origMapUpdate.call(this);
};

console.log('[IP2Live] tutorial.js module loaded.');
