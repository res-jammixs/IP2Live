/**
 * IP2Live - Darklights Game State
 *
 * Stage 1 ambience pressure: dark room, soft player vision, and sequential
 * light restoration after IPWires-family objectives.
 * Loaded by code.js via fetch() + new Function(). Do not use import/export.
 */

(function () {
    const DEFAULT_MAP_ID = 3;

    function mapIdFrom(options, manager) {
        const opts = options || {};
        const scene = opts.scene || (Scene && Scene.Map && Scene.Map.current) || null;
        return Number(
            opts.mapId ||
            (scene && (scene.id || scene.mapID)) ||
            (manager && typeof manager._currentMapId === 'function' && manager._currentMapId()) ||
            DEFAULT_MAP_ID
        ) || DEFAULT_MAP_ID;
    }

    const DarklightsState = {
        name: 'darklights',

        activate(manager, options) {
            const gsm = manager || IP2Live.GameStateManager;
            const mapId = mapIdFrom(options, gsm);
            const store = gsm && typeof gsm._darklightsStore === 'function'
                ? gsm._darklightsStore(mapId)
                : { dimLevel: 0, maxBrightnessStep: 5 };
            const maxStep = Math.max(1, Number(store.maxBrightnessStep) || 5);
            const rawStep = store.brightnessStep !== undefined
                ? store.brightnessStep
                : (maxStep - Number(store.dimLevel || 0));
            const step = Math.max(0, Math.min(maxStep, Number(rawStep) || 0));
            const visibility = step / maxStep;
            const darkness = 1 - visibility;
            const scene = (options && options.scene) || (Scene && Scene.Map && Scene.Map.current) || null;
            const lighting = IP2Live.LightingManager;
            if (!lighting || typeof lighting.setPreset !== 'function') return false;

            if (step >= maxStep) {
                lighting.setPreset(mapId, { name: 'Darklights - Clear', enabled: false });
                if (typeof lighting.applyPreset === 'function') lighting.applyPreset(mapId, scene);
                return true;
            }

            const overlayAlpha = 0.2 + darkness * 0.72;
            const radius = 110 + visibility * 70;
            const feather = 24 + visibility * 22;

            lighting.setPreset(mapId, {
                name: 'Darklights - Map ' + mapId,
                enabled: true,
                dimOverlay: overlayAlpha,
                overlayColor: '2, 7, 12',
                sceneLightMultiplier: 0.2 + visibility * 0.64,
                clearColor: 0x02070c,
                clearAlpha: 1,
                fog: {
                    color: 0x02070c,
                    near: 180 + visibility * 260,
                    far: 560 + visibility * 980,
                },
                ambient: {
                    color: 0x3f5c61,
                    intensity: 0.015 + visibility * 0.12,
                },
                hemisphere: {
                    skyColor: 0x345f67,
                    groundColor: 0x010306,
                    intensity: 0.02 + visibility * 0.17,
                },
                directional: {
                    color: 0x5a8b86,
                    intensity: 0.02 + visibility * 0.13,
                    position: { x: -120, y: 300, z: 180 },
                },
                heroGlow: {
                    enabled: true,
                    color: 0x5ed7c7,
                    intensity: 0.8 + darkness * 0.32,
                    distance: 118 + visibility * 78,
                    decay: 2,
                    height: 24,
                    pulse: 0.03,
                },
                visionAperture: {
                    enabled: true,
                    radius,
                    feather,
                    centerGlow: 'rgba(76, 210, 191, ' + (0.008 + visibility * 0.014).toFixed(3) + ')',
                    anchor: 'screen-center',
                    screenX: 0.5,
                    screenY: 0.5,
                    pulse: 0,
                    innerClear: 0.88 + visibility * 0.1,
                    midClear: 0.2 + visibility * 0.52,
                    outerClear: 0.0,
                    innerStop: 0.34,
                    outerStop: 0.62 + visibility * 0.14,
                    farDarkness: Math.max(0, 0.92 - visibility * 0.8),
                    farDarknessStart: 1.1,
                    farDarknessEnd: 2.5,
                },
            });

            if (typeof lighting.applyPreset === 'function') {
                lighting.applyPreset(mapId, scene);
            }
            return true;
        },

        clear(manager, options) {
            const lighting = IP2Live.LightingManager;
            if (!lighting) return false;
            const mapId = Number(
                (options && options.mapId) ||
                (lighting && lighting.activeMapId) ||
                DEFAULT_MAP_ID
            ) || DEFAULT_MAP_ID;
            if (typeof lighting.clearAperture === 'function') lighting.clearAperture();
            if (typeof lighting.clearPreset === 'function') {
                lighting.clearPreset(mapId);
            } else if (typeof lighting.clearLighting === 'function') {
                lighting.clearLighting();
            }
            return true;
        },
    };

    if (IP2Live.GameStateManager && typeof IP2Live.GameStateManager.registerState === 'function') {
        IP2Live.GameStateManager.registerState('darklights', DarklightsState);
    }

    IP2Live.DarklightsState = DarklightsState;
    window.IP2LiveDarklightsState = DarklightsState;

    console.log('[IP2Live] darklights_state.js module loaded.');
}());
