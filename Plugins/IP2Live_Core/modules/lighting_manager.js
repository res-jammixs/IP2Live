/**
 * IP2Live - Lighting Manager Module
 *
 * Central place for map ambience presets, Three.js lights, and a light
 * gameplay dim overlay. Loaded by code.js via fetch() + new Function().
 * Do not use import/export.
 */

class IP2LiveLightingManager {
    constructor() {
        this.VERSION = 'lighting-manager-20260518-02';

        this.presets = {};
        this.activeMapId = null;
        this.activePreset = null;
        this._sceneRef = null;
        this._heroLight = null;
        this._managedLights = [];
        this._dimmedLights = [];
        this._appliedThreeScene = null;
        this._originalFog = undefined;
        this._fogScene = null;
        this._lastHeroRef = null;
        this._lastRendererClear = null;
        this._overlayAlpha = 0;
        this._overlayColor = '8, 14, 26';
        this._tick = 0;

        this._registerDefaultPresets();
        this._injectMapHooks();
    }

    _registerDefaultPresets() {
        this.registerPreset(1, {
            name: 'Tutorial Stage - Dim Glow',
            enabled: true,
            dimOverlay: 0.26,
            overlayColor: '5, 9, 18',
            sceneLightMultiplier: 0.42,
            clearColor: 0x050914,
            clearAlpha: 1,
            fog: {
                color: 0x050914,
                near: 520,
                far: 1550,
            },
            ambient: {
                color: 0x8fa6c9,
                intensity: 0.18,
            },
            hemisphere: {
                skyColor: 0x9fb9ff,
                groundColor: 0x070b12,
                intensity: 0.22,
            },
            directional: {
                color: 0xb8d6ff,
                intensity: 0.18,
                position: { x: -180, y: 420, z: 240 },
            },
            heroGlow: {
                enabled: true,
                color: 0x8fe8ff,
                intensity: 0.78,
                distance: 185,
                decay: 2,
                height: 24,
                pulse: 0.08,
            },
        });
    }

    registerPreset(mapId, preset) {
        const key = Number(mapId);
        if (!key || !preset) return false;
        this.presets[key] = Object.assign({}, preset);
        return true;
    }

    setPreset(mapId, preset) {
        return this.registerPreset(mapId, preset);
    }

    clearPreset(mapId) {
        const key = Number(mapId);
        if (!key) return false;
        delete this.presets[key];
        if (this.activeMapId === key) this.clearLighting();
        return true;
    }

    update(scene) {
        this._tick++;
        const currentScene = scene || (Scene.Map && Scene.Map.current) || null;
        const mapId = this._getMapId(currentScene);
        if (!mapId) {
            this._updateHeroGlow(currentScene);
            return;
        }

        this._sceneRef = currentScene;
        const threeScene = this._getThreeScene(currentScene);
        if (this.activeMapId !== mapId ||
            (threeScene && threeScene !== this._appliedThreeScene)) {
            this.applyPreset(mapId, currentScene);
        }

        this._updateHeroGlow(currentScene);
    }

    applyPreset(mapId, scene) {
        const key = Number(mapId);
        const preset = this.presets[key] || null;
        const threeScene = this._getThreeScene(scene);

        this._removeManagedLights();
        this._restoreSceneLights();
        this._restoreFog();
        this._restoreRendererClear();
        this._appliedThreeScene = null;

        this.activeMapId = key || null;
        this.activePreset = preset;
        this._sceneRef = scene || this._sceneRef;

        if (!preset || preset.enabled === false) {
            this._overlayAlpha = 0;
            return false;
        }

        this._sceneRef = scene || this._sceneRef;
        this._overlayAlpha = this._clampNumber(preset.dimOverlay, 0, 0.8, 0);
        this._overlayColor = preset.overlayColor || '5, 9, 18';
        if (threeScene) {
            this._appliedThreeScene = threeScene;
        }
        if (threeScene && THREE) {
            this._saveFog(threeScene);
            this._applyRendererClear(preset);
            this._applyFog(threeScene, preset.fog);
            this._dimSceneLights(threeScene, preset.sceneLightMultiplier);
            this._addAmbientLights(threeScene, preset);
            this._createHeroGlow(threeScene, preset.heroGlow);
        }

        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        console.log('[IP2Live] LightingManager: applied preset for map ' + key + (threeScene ? '' : ' (HUD dim only; waiting for 3D scene)'));
        return true;
    }

    clearLighting() {
        this._removeManagedLights();
        this._restoreSceneLights();
        this._restoreFog();
        this._restoreRendererClear();
        this.activeMapId = null;
        this.activePreset = null;
        this._appliedThreeScene = null;
        this._overlayAlpha = 0;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    refresh(scene) {
        this.activeMapId = null;
        this.update(scene || (Scene.Map && Scene.Map.current) || null);
    }

    debugState(scene) {
        const currentScene = scene || this._sceneRef || (Scene.Map && Scene.Map.current) || null;
        const threeScene = this._getThreeScene(currentScene);
        const state = {
            version: this.VERSION,
            mapId: this._getMapId(currentScene),
            activeMapId: this.activeMapId,
            presetName: this.activePreset && this.activePreset.name,
            overlayAlpha: this._overlayAlpha,
            hasThreeScene: !!threeScene,
            hasHeroLight: !!this._heroLight,
            managedLights: this._managedLights.length,
            dimmedSceneLights: this._dimmedLights.length,
        };
        console.log('[IP2Live] LightingManager debug state:', state);
        return state;
    }

    setOverlay(alpha, color) {
        this._overlayAlpha = this._clampNumber(alpha, 0, 0.8, this._overlayAlpha);
        if (color) this._overlayColor = color;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    drawHUD(ctx) {
        if (!ctx || this._overlayAlpha <= 0) return;
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(' + this._overlayColor + ', ' + this._overlayAlpha.toFixed(3) + ')';
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
    }

    _injectMapHooks() {
        if (!Scene || !Scene.Map || !Scene.Map.prototype) return;
        if (Scene.Map.prototype._ip2liveLightingManagerInjected) return;
        Scene.Map.prototype._ip2liveLightingManagerInjected = true;

        const manager = this;
        const originalUpdate = Scene.Map.prototype.update;
        Scene.Map.prototype.update = function () {
            originalUpdate.call(this);
            manager.update(this);
        };

        const originalDrawHUD = Scene.Map.prototype.drawHUD;
        Scene.Map.prototype.drawHUD = function () {
            originalDrawHUD.call(this);
            manager.drawHUD(Common.Platform.ctx);
        };
    }

    _activeThreeScene() {
        return this._getThreeScene(this._sceneRef);
    }

    _getThreeScene(scene) {
        const candidates = [
            scene && scene.scene,
            scene && scene.threeScene,
            scene && scene.mapScene,
            scene && scene.currentScene,
            scene && scene.currentMap && scene.currentMap.scene,
            scene && scene.currentMap && scene.currentMap.threeScene,
            scene && scene.currentMap && scene.currentMap.mapScene,
            Manager && Manager.GL && Manager.GL.scene,
            Manager && Manager.GL && Manager.GL.currentScene,
        ];
        for (let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i];
            if (candidate && candidate.add && candidate.remove) return candidate;
        }
        return null;
    }

    _getMapId(scene) {
        const current = scene || this._sceneRef || (Scene.Map && Scene.Map.current) || null;
        const mapId = current && (
            current.id ||
            current.mapID ||
            (current.currentMap && current.currentMap.id) ||
            (Core.Game.current && Core.Game.current.currentMapID)
        );
        const numericMapId = Number(mapId) || 0;
        if (numericMapId) return numericMapId;

        if (IP2Live.Tutorial &&
            typeof IP2Live.Tutorial._isTutorialMap === 'function' &&
            IP2Live.Tutorial._isTutorialMap(current)) {
            if (IP2Live.MapManager && typeof IP2Live.MapManager.getInitialMapId === 'function') {
                return Number(IP2Live.MapManager.getInitialMapId()) || 1;
            }
            return 1;
        }
        return 0;
    }

    _addAmbientLights(threeScene, preset) {
        if (!THREE) return;
        if (preset.ambient && THREE.AmbientLight) {
            this._addLight(threeScene, new THREE.AmbientLight(
                preset.ambient.color || 0xffffff,
                this._clampNumber(preset.ambient.intensity, 0, 4, 0.2)
            ));
        }

        if (preset.hemisphere && THREE.HemisphereLight) {
            this._addLight(threeScene, new THREE.HemisphereLight(
                preset.hemisphere.skyColor || 0xffffff,
                preset.hemisphere.groundColor || 0x000000,
                this._clampNumber(preset.hemisphere.intensity, 0, 4, 0.2)
            ));
        }

        if (preset.directional && THREE.DirectionalLight) {
            const light = new THREE.DirectionalLight(
                preset.directional.color || 0xffffff,
                this._clampNumber(preset.directional.intensity, 0, 4, 0.2)
            );
            this._setPosition(light, preset.directional.position || { x: 0, y: 300, z: 160 });
            this._addLight(threeScene, light);
        }
    }

    _addLight(threeScene, light) {
        if (!threeScene || !light) return;
        light.name = 'IP2Live_Lighting_' + this._managedLights.length;
        threeScene.add(light);
        this._managedLights.push(light);
    }

    _createHeroGlow(threeScene, config) {
        if (!config || config.enabled === false || !THREE || !THREE.PointLight) return;
        const light = new THREE.PointLight(
            config.color || 0x8fe8ff,
            this._clampNumber(config.intensity, 0, 4, 0.65),
            this._clampNumber(config.distance, 0, 2000, 180),
            this._clampNumber(config.decay, 0, 4, 2)
        );
        light.name = 'IP2Live_HeroGlow';
        threeScene.add(light);
        this._managedLights.push(light);
        this._heroLight = light;
        this._updateHeroGlow(this._sceneRef);
    }

    _updateHeroGlow(scene) {
        if (!this._heroLight || !this.activePreset) return;
        const config = this.activePreset.heroGlow || {};
        const hero = this._questHero(scene);
        if (!hero || !hero.position) {
            this._heroLight.visible = false;
            return;
        }

        const pos = this._heroWorldPosition(hero);
        if (!pos) {
            this._heroLight.visible = false;
            return;
        }

        const height = this._clampNumber(config.height, -200, 400, 24);
        this._heroLight.visible = true;
        this._heroLight.position.set(pos.x, pos.y + height, pos.z);

        if (typeof config.pulse === 'number') {
            const base = this._clampNumber(config.intensity, 0, 4, 0.65);
            const pulse = Math.sin(this._tick * 0.065) * config.pulse;
            this._heroLight.intensity = Math.max(0, base + pulse);
        }
    }

    _removeManagedLights() {
        for (let i = 0; i < this._managedLights.length; i++) {
            const light = this._managedLights[i];
            if (light && light.parent && light.parent.remove) {
                light.parent.remove(light);
            }
        }
        this._managedLights = [];
        this._heroLight = null;
    }

    _dimSceneLights(threeScene, multiplier) {
        const value = this._clampNumber(multiplier, 0, 4, 1);
        if (!threeScene || value === 1) return;

        const visit = (object) => {
            if (!object) return;
            if (this._isExternalLight(object)) {
                const original = Number(object.intensity);
                if (Number.isFinite(original)) {
                    this._dimmedLights.push({ light: object, intensity: original });
                    object.intensity = original * value;
                }
            }
            const children = object.children || [];
            for (let i = 0; i < children.length; i++) visit(children[i]);
        };

        visit(threeScene);
    }

    _restoreSceneLights() {
        for (let i = 0; i < this._dimmedLights.length; i++) {
            const entry = this._dimmedLights[i];
            if (entry && entry.light && typeof entry.light.intensity === 'number') {
                entry.light.intensity = entry.intensity;
            }
        }
        this._dimmedLights = [];
    }

    _isExternalLight(object) {
        if (!object || (object.name && String(object.name).indexOf('IP2Live_') === 0)) return false;
        if (object.isLight) return true;
        return typeof object.intensity === 'number' &&
            object.type &&
            String(object.type).indexOf('Light') !== -1;
    }

    _saveFog(threeScene) {
        if (this._originalFog === undefined) {
            this._originalFog = threeScene ? threeScene.fog || null : null;
            this._fogScene = threeScene || null;
        }
    }

    _applyFog(threeScene, fog) {
        if (!threeScene || !fog || !THREE || !THREE.Fog) return;
        threeScene.fog = new THREE.Fog(
            fog.color || 0x050914,
            this._clampNumber(fog.near, 0, 100000, 400),
            this._clampNumber(fog.far, 1, 100000, 1600)
        );
    }

    _restoreFog() {
        const threeScene = this._fogScene || this._activeThreeScene();
        if (!threeScene || this._originalFog === undefined) return;
        threeScene.fog = this._originalFog;
        this._originalFog = undefined;
        this._fogScene = null;
    }

    _applyRendererClear(preset) {
        const renderer = Manager && Manager.GL && Manager.GL.renderer;
        if (!renderer || !renderer.setClearColor || preset.clearColor === undefined) return;

        if (!this._lastRendererClear && renderer.getClearColor && THREE && THREE.Color) {
            const color = new THREE.Color();
            renderer.getClearColor(color);
            this._lastRendererClear = {
                color: color.getHex(),
                alpha: renderer.getClearAlpha ? renderer.getClearAlpha() : 1,
            };
        }

        renderer.setClearColor(preset.clearColor, preset.clearAlpha !== undefined ? preset.clearAlpha : 1);
    }

    _restoreRendererClear() {
        const renderer = Manager && Manager.GL && Manager.GL.renderer;
        if (!renderer || !renderer.setClearColor || !this._lastRendererClear) return;
        renderer.setClearColor(this._lastRendererClear.color, this._lastRendererClear.alpha);
        this._lastRendererClear = null;
    }

    _questHero(scene) {
        const current = scene || this._sceneRef || (Scene.Map && Scene.Map.current) || null;
        const candidates = [
            current && current.heroMapObject,
            Scene.Map.current && Scene.Map.current.heroMapObject,
            current && current.mapObjects && current.mapObjects[0],
            Scene.Map.current && Scene.Map.current.mapObjects && Scene.Map.current.mapObjects[0],
            Core.Game.current && Core.Game.current.heroMapObject,
            current && current.hero,
            current && current.player,
            Core.Game.current && Core.Game.current.hero,
            Core.Game.current && Core.Game.current.player,
        ];
        for (let i = 0; i < candidates.length; i++) {
            if (this._hasPosition(candidates[i])) {
                this._lastHeroRef = candidates[i];
                return candidates[i];
            }
        }
        return this._lastHeroRef || null;
    }

    _hasPosition(obj) {
        return obj &&
            !(obj.name && String(obj.name).indexOf('IP2Live_') === 0) &&
            obj.position &&
            typeof obj.position.x === 'number' &&
            typeof obj.position.z === 'number';
    }

    _heroWorldPosition(hero) {
        if (!hero || !hero.position) return null;
        const p = hero.position;
        if (typeof p.x !== 'number' || typeof p.z !== 'number') return null;
        const pos = {
            x: p.x,
            y: typeof p.y === 'number' ? p.y : 0,
            z: p.z,
        };
        if (!this._positionUsesEditorUnits(pos)) return pos;

        const tileSize = this._tileSize();
        return {
            x: pos.x * tileSize,
            y: pos.y * tileSize,
            z: pos.z * tileSize,
        };
    }

    _positionUsesEditorUnits(position) {
        if (!position || typeof position.x !== 'number' || typeof position.z !== 'number') return false;
        const scene = this._sceneRef || (Scene.Map && Scene.Map.current) || null;
        const map = scene && scene.currentMap;
        const props = map && map.mapProperties;
        if (props && props.length && props.width) {
            return Math.abs(position.x) <= props.length + 4 &&
                Math.abs(position.z) <= props.width + 4;
        }
        return Math.abs(position.x) < 96 && Math.abs(position.z) < 96;
    }

    _tileSize() {
        return (Common && Common.Datas && Common.Datas.Systems && Common.Datas.Systems.SQUARE_SIZE) ||
            (Data && Data.Systems && Data.Systems.SQUARE_SIZE) ||
            16;
    }

    _setPosition(object3d, position) {
        if (!object3d || !object3d.position || !position) return;
        object3d.position.set(
            Number(position.x) || 0,
            Number(position.y) || 0,
            Number(position.z) || 0
        );
    }

    _clampNumber(value, min, max, fallback) {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.max(min, Math.min(max, number));
    }
}

const LightingManager = new IP2LiveLightingManager();
IP2Live.LightingManager = LightingManager;
window.IP2LiveLightingManager = LightingManager;

console.log('[IP2Live] lighting_manager.js module loaded.');
