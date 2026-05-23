/**
 * IP2Live Core Plugin â€” code.js
 * @author James Michael Restauro Siton  @version 1.0.0
 * NOTE: No import/export â€” loaded via Interpreter.evaluate() â†’ new Function(...)
 * Injected context: Common, Core, Data, Graphic, Manager, Scene, Model, Main, THREE
 */

const pluginName = "IP2Live_Core";
const inject = Manager.Plugins.inject;

// ================================================================
//  Â§ 1  IndexedDB MANAGER (inlined)
// ================================================================
const IP2Live = {};

IP2Live.DBManager = {
    dbName: 'IP2Live_Database', dbVersion: 1, db: null,
    initDB() {
        return new Promise((resolve, reject) => {
            const request = window.indexedDB.open(this.dbName, this.dbVersion);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('profiles'))
                    db.createObjectStore('profiles', { keyPath: 'infiltratorName' });
                if (!db.objectStoreNames.contains('telemetry')) {
                    const s = db.createObjectStore('telemetry', { keyPath: 'id', autoIncrement: true });
                    s.createIndex('infiltratorName', 'infiltratorName', { unique: false });
                    s.createIndex('stageId', 'stageId', { unique: false });
                }
            };
            request.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
            request.onerror = (e) => reject(e.target.error);
        });
    },
    async saveRecord(storeName, data) {
        if (!this.db) await this.initDB();
        return new Promise((resolve, reject) => {
            const req = this.db.transaction([storeName], 'readwrite').objectStore(storeName).put(data);
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e.target.error);
        });
    },
    async getRecord(storeName, key) {
        if (!this.db) await this.initDB();
        return new Promise((resolve, reject) => {
            const req = this.db.transaction([storeName], 'readonly').objectStore(storeName).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e.target.error);
        });
    }
};
window.IP2Live = IP2Live;

// ================================================================
//  § 1.5 DISABLE CLICK-TO-MOVE ON MAP
//  Prevents the character from moving toward the mouse when clicking.
// ================================================================
(function() {
    // 1. Override the mouse handlers on the Map to prevent manual pathfinding triggers
    inject(Scene.Map, 'onMouseDown', function(x, y) {
        if (!this.loading) Scene.Base.prototype.onMouseDown.call(this, x, y);
    }, false, true);

    inject(Scene.Map, 'onMouseMove', function(x, y) {
        if (!this.loading) Scene.Base.prototype.onMouseMove.call(this, x, y);
    }, false, true);

    inject(Scene.Map, 'onMouseUp', function(x, y) {
        if (!this.loading) Scene.Base.prototype.onMouseUp.call(this, x, y);
    }, false, true);

    // 2. Intercept the core event dispatcher to block continuous "Mouse Left Pressed" 
    //    events (which Scene.Map.update spams to trigger click-to-move pathfinding).
    //    eventID 5: MouseDown, 6: MouseUp, 7: MouseMove (when isSystem is true)
    inject(Manager.Events, 'sendEvent', function(sender, targetKind, targetID, isSystem, eventID, parameters, senderNoReceiver, onlyTheClosest) {
        if (isSystem && (eventID === 5 || eventID === 6 || eventID === 7)) {
            return; // Drop the event entirely
        }
        return this.super(sender, targetKind, targetID, isSystem, eventID, parameters, senderNoReceiver, onlyTheClosest);
    }, true, true);
})();

// ================================================================
//  § 1.6 DISABLE DIAGONAL MOVEMENT
//  Filters out multiple directional keys to force 4-way movement.
// ================================================================
(function() {
    let activeDirKey = null;
    let cachedDirShortcuts = null;

    inject(Scene.Map, 'update', function() {
        if (Manager.Events.keysPressed && Data.Keyboards.getCommandsGraphics) {
            
            // 1. Cache the movement shortcuts once so we don't kill performance
            if (!cachedDirShortcuts) {
                cachedDirShortcuts = [];
                const commands = Data.Keyboards.getCommandsGraphics();
                for (let i = 0; i < commands.length; i++) {
                    // IDs 1, 2, 3, 4 are the Hero Movement actions in RPG Paper Maker
                    if (commands[i].id >= 1 && commands[i].id <= 4 && commands[i].sc) {
                        for (let j = 0; j < commands[i].sc.length; j++) {
                            cachedDirShortcuts.push(commands[i].sc[j]);
                        }
                    }
                }
            }

            let pressedDirs = [];
            
            // 2. Identify which keys currently pressed are movement keys
            for (let i = 0; i < Manager.Events.keysPressed.length; i++) {
                const k = Manager.Events.keysPressed[i];
                let isDir = false;
                for (let s = 0; s < cachedDirShortcuts.length; s++) {
                    if (Data.Keyboards.isKeyEqual(k, cachedDirShortcuts[s])) {
                        isDir = true;
                        break;
                    }
                }
                if (isDir) pressedDirs.push(k);
            }

            // 3. Maintain the active priority key
            if (activeDirKey !== null && !pressedDirs.includes(activeDirKey)) {
                activeDirKey = null;
            }
            if (activeDirKey === null && pressedDirs.length > 0) {
                activeDirKey = pressedDirs[0];
            }

            // 4. Strip any secondary direction inputs from the global array
            if (activeDirKey !== null) {
                for (let i = Manager.Events.keysPressed.length - 1; i >= 0; i--) {
                    const k = Manager.Events.keysPressed[i];
                    if (pressedDirs.includes(k) && k !== activeDirKey) {
                        Manager.Events.keysPressed.splice(i, 1);
                    }
                }
            }
        }
        this.super();
    }, true, true);
})();

(function() {
    let dumped = false;
    inject(Scene.Map, 'update', function() {
        this.super();
        try {
            if (!dumped && Manager && Manager.Camera) {
                let keys = Object.keys(Manager.Camera).join(',');
                document.title = "IP2_DEBUG: " + keys;
                dumped = true;
            }
        } catch(e) {}
    }, false, true);
})();

// ================================================================
//  § 1.7 AUTO CAMERA PANNING (Map Edge Correction)
//
//  When the character is near a wall and the camera ends up
//  outside the map, this system automatically and smoothly pans the
//  camera back inside the room.
// ================================================================
(function() {
    const PAN_SPEED = 3.0; // Degrees to rotate per frame when auto-panning
    const MARGIN_TILES = 1; // Tolerance before panning triggers

    inject(Scene.Map, 'update', function() {
        this.super();

        try {
            const map = this.currentMap;
            if (!map || !map.mapProperties) return;

            const hero = this.heroMapObject || (this.mapObjects && this.mapObjects[0]);
            if (!hero || !hero.position) return;

            // RPG Paper Maker stores the active camera object directly on the scene
            const cam = this.camera;
            if (!cam || !cam.getThreeCamera) return;

            const cam3 = cam.getThreeCamera(); // Gets the underlying Three.js camera
            if (!cam3) return;

            const ss = (Common.Datas && Common.Datas.Systems && Common.Datas.Systems.SQUARE_SIZE) || 16;
            const mapW = (map.mapProperties.length || 0) * ss;
            const mapH = (map.mapProperties.width || 0) * ss;
            if (mapW <= 0 || mapH <= 0) return;

            // Camera world bounds check
            const cx = cam3.position.x;
            const cz = cam3.position.z;
            const limitMargin = MARGIN_TILES * ss;

            const isOutLeft   = cx < -limitMargin;
            const isOutRight  = cx > mapW + limitMargin;
            const isOutTop    = cz < -limitMargin;
            const isOutBottom = cz > mapH + limitMargin;

            // If the camera is outside the boundaries, auto-pan it
            if (isOutLeft || isOutRight || isOutTop || isOutBottom) {
                // Determine direction based on which wall we clip through
                const panAmount = (isOutLeft || isOutTop) ? PAN_SPEED : -PAN_SPEED;
                
                // RPM Camera properties
                if (typeof cam.addHorizontalAngle === 'function') {
                    cam.addHorizontalAngle(panAmount);
                } else if (cam.horizontalAngle !== undefined) {
                    cam.horizontalAngle += panAmount;
                }
                
                // Force engine to recalculate camera matrices
                if (typeof cam.update === 'function') {
                    cam.update();
                } else if (typeof cam.updateAngles === 'function') {
                    cam.updateAngles();
                }
            }
        } catch (e) {}
    }, false, true);
})();



(function() {
    // ── Tuning constants ─────────────────────────────────────────
    // How many EXTRA tile-lengths of margin to leave beyond the camera
    // position itself (accounts for the visible frustum width).
    // Increase if you still see clipping; decrease if locks feel too early.
    const FRUSTUM_MARGIN_TILES = 5;

    // Estimate of how many radians RPM rotates the camera per key press.
    // Made intentionally larger than the real step so the check acts as a
    // lookahead buffer — blocks a little BEFORE the clip actually happens.
    const ROT_STEP_RAD = 0.18; // ≈ 10° per tick lookahead

    // Fallback: tile distance from edge that triggers the proximity lock
    const BORDER_THRESHOLD = 5;

    // ── Camera shortcut cache ────────────────────────────────────
    let camLeftSC = [], camRightSC = [];
    let shortcutsReady = false;

    function loadShortcuts() {
        if (shortcutsReady) return;
        try {
            const cmds = Data.Keyboards.getCommandsGraphics();
            for (let i = 0; i < cmds.length; i++) {
                if (cmds[i].id === 9  && cmds[i].sc) camLeftSC  = cmds[i].sc;
                if (cmds[i].id === 10 && cmds[i].sc) camRightSC = cmds[i].sc;
            }
            shortcutsReady = true;
        } catch(e) {}
    }

    function isLeftCam(key) {
        for (let i = 0; i < camLeftSC.length;  i++) if (Data.Keyboards.isKeyEqual(key, camLeftSC[i]))  return true;
        return false;
    }
    function isRightCam(key) {
        for (let i = 0; i < camRightSC.length; i++) if (Data.Keyboards.isKeyEqual(key, camRightSC[i])) return true;
        return false;
    }

    // ── Scene context helper ─────────────────────────────────────
    function getCtx(scene) {
        try {
            const hero = scene.heroMapObject
                || (scene.mapObjects && scene.mapObjects[0])
                || null;
            if (!hero || !hero.position) return null;

            const map = scene.currentMap;
            if (!map || !map.mapProperties) return null;

            const ss   = (Common.Datas && Common.Datas.Systems && Common.Datas.Systems.SQUARE_SIZE) || 16;
            const mapW = (map.mapProperties.length || 0) * ss;
            const mapH = (map.mapProperties.width  || 0) * ss;
            if (mapW <= 0 || mapH <= 0) return null;

            // Three.js camera
            const cam3 = Manager.Camera && Manager.Camera.camera;

            return { heroPos: hero.position, mapW, mapH, ss, cam3 };
        } catch(e) { return null; }
    }

    // ── Primary check: predict camera position after rotation ────
    // Returns true if rotating in `direction` (+1 = right, -1 = left)
    // would push the camera outside the map bounds.
    function predictWouldClip(ctx, direction) {
        try {
            if (!ctx.cam3) return false; // skip — let fallback handle it

            const heroPos  = ctx.heroPos;
            const cam3     = ctx.cam3;

            // Current camera offset from hero in the XZ plane
            const dx = cam3.position.x - heroPos.x;
            const dz = cam3.position.z - heroPos.z;
            const distance   = Math.sqrt(dx * dx + dz * dz);
            if (distance < 0.01) return false;

            const currentAngle = Math.atan2(dx, dz);
            const newAngle     = currentAngle + direction * ROT_STEP_RAD;

            // Projected camera position after rotation
            const newCamX = heroPos.x + distance * Math.sin(newAngle);
            const newCamZ = heroPos.z + distance * Math.cos(newAngle);

            // Frustum margin — derived from the actual camera FOV if available,
            // otherwise fall back to the tile-count constant.
            let margin = FRUSTUM_MARGIN_TILES * ctx.ss;
            try {
                const fovRad  = (cam3.fov || 45) * (Math.PI / 180);
                const aspect  = cam3.aspect || (16 / 9);
                margin = Math.max(margin, distance * Math.tan(fovRad / 2) * aspect);
            } catch(e) {}

            return (
                newCamX - margin < 0          ||
                newCamX + margin > ctx.mapW   ||
                newCamZ - margin < 0          ||
                newCamZ + margin > ctx.mapH
            );
        } catch(e) { return false; }
    }

    // ── Fallback check: hero tile proximity ──────────────────────
    function heroNearBorder(ctx) {
        try {
            const tx = ctx.heroPos.x / ctx.ss;
            const tz = ctx.heroPos.z / ctx.ss;
            const mW = ctx.mapW / ctx.ss;
            const mH = ctx.mapH / ctx.ss;
            return (tx < BORDER_THRESHOLD || tx > mW - BORDER_THRESHOLD ||
                    tz < BORDER_THRESHOLD || tz > mH - BORDER_THRESHOLD);
        } catch(e) { return false; }
    }

    // ── Key intercept ────────────────────────────────────────────
    inject(Scene.Map, 'onKeyPressedAndRepeat', function(key) {
        loadShortcuts();

        const left  = isLeftCam(key);
        const right = isRightCam(key);

        if (left || right) {
            const ctx = getCtx(this);
            if (ctx) {
                const direction = left ? -1 : 1;

                if (ctx.cam3) {
                    // Primary: precise per-direction predictive check
                    if (predictWouldClip(ctx, direction)) return true;
                } else {
                    // Fallback: block all rotation when hero is near any edge
                    if (heroNearBorder(ctx)) return true;
                }
            }
        }

        return this.super(key);
    }, true, true);
})();



// ================================================================
//  § 1.5  GLOBAL CSS OVERRIDES (Font Anti-Aliasing)
//  Injects CSS to force hard edges on fonts for a crisper, pixel-
//  perfect look, disabling the default browser blurring.
// ================================================================
(function() {
    const style = document.createElement('style');
    style.innerHTML = `
        * {
            -webkit-font-smoothing: none !important;
            font-smooth: never !important;
            text-rendering: geometricPrecision !important;
        }
        canvas {
            image-rendering: -moz-crisp-edges !important;
            image-rendering: -webkit-crisp-edges !important;
            image-rendering: pixelated !important;
            image-rendering: crisp-edges !important;
        }
    `;
    document.head.appendChild(style);

    // ── Force context anti-aliasing off ──────────────────────────
    // The engine's canvas context might get reset, so we aggressively
    // force imageSmoothingEnabled to false every frame.
    function forceCrispContext() {
        if (typeof Common !== 'undefined' && Common.Platform && Common.Platform.ctx) {
            const ctx = Common.Platform.ctx;
            ctx.imageSmoothingEnabled = false;
            ctx.webkitImageSmoothingEnabled = false;
            ctx.mozImageSmoothingEnabled = false;
            ctx.msImageSmoothingEnabled = false;
        }
        requestAnimationFrame(forceCrispContext);
    }
    requestAnimationFrame(forceCrispContext);
})();

// ================================================================
//  § 2  ASSET LOADER (font + background image)
// ================================================================
IP2Live.Assets = {
    bgImage: null,
    abnesLoaded: false,
    nebulaLoaded: false,

    async loadAll() {
        const root = Common.Platform.ROOT_DIRECTORY;
        await this.loadFonts(root);
        await this.loadBackground(root);
    },

    async loadFonts(root) {
        try {
            const abnesFace = new FontFace('Abnes', 'url("' + root + 'Fonts/abnes.ttf")');
            const loadedAbnes = await abnesFace.load();
            document.fonts.add(loadedAbnes);
            this.abnesLoaded = true;
            console.log('[IP2Live] Abnes font loaded.');
        } catch (e) {
            console.warn('[IP2Live] Abnes font load failed, falling back.', e);
        }

        try {
            const nebulaFace = new FontFace('Nebula-Regular', 'url("' + root + 'Fonts/Nebula-Regular.otf")');
            const loadedNebula = await nebulaFace.load();
            document.fonts.add(loadedNebula);
            this.nebulaLoaded = true;
            console.log('[IP2Live] Nebula-Regular font loaded.');
        } catch (e) {
            console.warn('[IP2Live] Nebula-Regular font load failed, falling back.', e);
        }
    },

    async loadBackground(root) {
        return new Promise((resolve) => {
            const img = new Image();
            const path = root + 'Scripts/src/assets/screens/main_menu/backgroundscreen01.png';
            img.onload = () => { this.bgImage = img; console.log('[IP2Live] Background loaded.'); resolve(); };
            img.onerror = () => { console.warn('[IP2Live] Background image not found:', path); resolve(); };
            img.src = path;
        });
    },

    drawCoverImage(ctx, img, x, y, w, h, zoom = 1.15) {
        const imgRatio = img.width / img.height;
        const canvasRatio = w / h;
        let drawW, drawH, drawX, drawY;

        if (imgRatio > canvasRatio) {
            drawH = h;
            drawW = img.width * (h / img.height);
        } else {
            drawW = w;
            drawH = img.height * (w / img.width);
        }

        // Apply zoom and recenter
        drawW *= zoom;
        drawH *= zoom;
        drawX = x + (w - drawW) / 2;
        drawY = y + (h - drawH) / 2;

        ctx.drawImage(img, drawX, drawY, drawW, drawH);
    }
};

// ================================================================
//  § 2.2  BG FX FACTORY
//  Shared animated background system: floating binary particles,
//  constant sine-wave camera shake, and occasional big jolts.
//  Usage:
//    this.bgFx = IP2Live.BgFx.create();
//    this.bgFx.seed(cW, cH);          // call once after load
//    this.bgFx.update(animTick);      // call every update()
//    this.bgFx.drawBg(ctx, bgImage, cW, cH);   // before UI
//    this.bgFx.drawParticles(ctx, scaleX);      // after bg, before UI
// ================================================================
IP2Live.BgFx = {
    CHARS: ['0','1','01','10','0x','FF','>>','{}','//','::','$_','&&','!=','<>','10','01','NUL','EOF','0xFF','1337'],

    create() {
        return {
            particles:  [],
            shakeX: 0,
            shakeY: 0,
            _bigShakeTimer:     0,
            _bigShakeIntensity: 0,

            seed(cW, cH, count) {
                count = count || 80;
                this.particles = [];
                const CHARS = IP2Live.BgFx.CHARS;
                for (let i = 0; i < count; i++) {
                    this.particles.push({
                        x:         Math.random() * cW,
                        y:         Math.random() * cH,
                        vy:        0.25 + Math.random() * 0.65,
                        vx:        (Math.random() - 0.5) * 0.25,
                        size:      7 + Math.random() * 8,
                        alpha:     0.04 + Math.random() * 0.16,
                        char:      CHARS[Math.floor(Math.random() * CHARS.length)],
                        flipTimer: Math.floor(Math.random() * 90),
                        cW, cH
                    });
                }
            },

            update(tick) {
                const CHARS = IP2Live.BgFx.CHARS;

                // floating particles
                for (const p of this.particles) {
                    p.y += p.vy;
                    p.x += p.vx;
                    p.flipTimer--;
                    if (p.flipTimer <= 0) {
                        p.char = CHARS[Math.floor(Math.random() * CHARS.length)];
                        p.flipTimer = 40 + Math.floor(Math.random() * 80);
                    }
                    if (p.y > p.cH + 20)  { p.y = -20; p.x = Math.random() * p.cW; }
                    if (p.x < -20)        { p.x = p.cW + 10; }
                    if (p.x > p.cW + 20)  { p.x = -10; }
                }

                // constant sine-wave breathing
                const t = tick * 0.018;
                this.shakeX = Math.sin(t * 1.3) * 1.8 + Math.cos(t * 2.1) * 0.9;
                this.shakeY = Math.cos(t * 0.9) * 1.4 + Math.sin(t * 2.7) * 0.6;

                // occasional micro-jolt
                if (Math.random() < 0.012) {
                    this.shakeX += (Math.random() - 0.5) * 5;
                    this.shakeY += (Math.random() - 0.5) * 5;
                }

                // big shake burst (~every 5–15 s)
                if (this._bigShakeTimer > 0) {
                    this._bigShakeTimer--;
                    this.shakeX += (Math.random() - 0.5) * this._bigShakeIntensity * 2;
                    this.shakeY += (Math.random() - 0.5) * this._bigShakeIntensity * 2;
                    this._bigShakeIntensity *= 0.82;
                } else if (Math.random() < 0.003) {
                    this._bigShakeIntensity = 9;
                    this._bigShakeTimer     = 10;
                }
            },

            drawBg(ctx, bgImage, cW, cH) {
                if (bgImage) {
                    ctx.save();
                    ctx.translate(this.shakeX, this.shakeY);
                    IP2Live.Assets.drawCoverImage(ctx, bgImage, 0, 0, cW, cH);
                    // horizontal slice glitch
                    if (Math.random() < 0.05) {
                        const sliceY = Math.random() * cH;
                        const sliceH = 10 + Math.random() * 50;
                        const offX   = (Math.random() - 0.5) * 45;
                        ctx.drawImage(ctx.canvas, 0, sliceY, cW, sliceH, offX, sliceY, cW, sliceH);
                        ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,255,255,0.14)' : 'rgba(255,0,255,0.14)';
                        ctx.globalCompositeOperation = 'screen';
                        ctx.fillRect(0, sliceY, cW, sliceH);
                        ctx.globalCompositeOperation = 'source-over';
                    }
                    ctx.restore();
                } else {
                    ctx.fillStyle = '#050510';
                    ctx.fillRect(0, 0, cW, cH);
                }
            },

            drawParticles(ctx, scaleX) {
                ctx.save();
                for (const p of this.particles) {
                    ctx.globalAlpha = p.alpha;
                    ctx.fillStyle   = '#00FFFF';
                    ctx.font        = Math.round(p.size * scaleX) + 'px monospace';
                    ctx.textAlign   = 'left';
                    ctx.fillText(p.char, p.x, p.y);
                }
                ctx.globalAlpha = 1;
                ctx.restore();
            }
        };
    }
};

// ================================================================
//  § 2.3  TEXT SCRAMBLE FACTORY
//  Reusable per-button "data decrypt" typing effect.
//  Usage:
//    this.scramble = IP2Live.TextScramble.create(this.menuItems.length);
//    // in update():
//    this.scramble.update(this.selectedIndex, this.hoverIndex);
//    // when drawing a button label:
//    const displayText = this.scramble.getText(index, label);
// ================================================================
IP2Live.TextScramble = {
    create(count) {
        return {
            progress: new Array(count).fill(0),

            update(selectedIndex, hoverIndex) {
                for (let i = 0; i < this.progress.length; i++) {
                    if (i === selectedIndex || i === hoverIndex) {
                        // Advance — cap is set high enough that short labels always finish
                        if (this.progress[i] < 60) this.progress[i] += 0.55;
                    } else {
                        this.progress[i] = 0;
                    }
                }
            },

            getText(index, label) {
                const p = this.progress[index] || 0;
                if (p <= 0) return label;

                let result = '';
                for (let i = 0; i < label.length; i++) {
                    const ch = label[i];
                    if (ch === ' ') { result += ' '; continue; }

                    const charStart = i * 2;
                    const charProgress = p - charStart;

                    if (charProgress <= 0) {
                        // Not reached yet — random flicker
                        result += String.fromCharCode(65 + Math.floor(Math.random() * 26));
                    } else if (charProgress >= 6) {
                        // Locked in
                        result += ch;
                    } else {
                        // Rolling toward target
                        const targetCode = label.toUpperCase().charCodeAt(i);
                        if (targetCode >= 65 && targetCode <= 90) {
                            const step = Math.floor((targetCode - 65) * (charProgress / 6));
                            result += String.fromCharCode(65 + step);
                        } else {
                            result += ch;
                        }
                    }
                }
                return result;
            }
        };
    }
};

// ================================================================
//  § 2.4  UI FACTORY (High-Fidelity Cyberpunk Elements)
//  Unified, elevated drawing logic for buttons across all screens.
// ================================================================
IP2Live.UI = {
    drawCyberPanel(options) {
        const { ctx, x, y, w, h, scaleX, accent = '#00F0FF', title } = options;
        const sl = 20 * scaleX;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x + sl, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - sl * 0.65, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + sl);
        ctx.closePath();
        ctx.fillStyle = 'rgba(3,7,20,0.94)';
        ctx.fill();

        ctx.save();
        ctx.clip();
        for (let yy = y; yy < y + h; yy += 5 * scaleX) {
            ctx.fillStyle = 'rgba(255,255,255,0.028)';
            ctx.fillRect(x, yy, w, 1 * scaleX);
        }
        ctx.restore();

        ctx.shadowColor = accent;
        ctx.shadowBlur = 12 * scaleX;
        ctx.lineWidth = 1.5 * scaleX;
        ctx.strokeStyle = accent;
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = '#FFE600';
        ctx.lineWidth = 2 * scaleX;
        const c = 16 * scaleX;
        ctx.beginPath();
        ctx.moveTo(x, y + c); ctx.lineTo(x, y); ctx.lineTo(x + c, y);
        ctx.moveTo(x + w - c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - 4 * scaleX, y + c);
        ctx.moveTo(x + w - c, y + h); ctx.lineTo(x + w - 4 * scaleX, y + h); ctx.lineTo(x + w, y + h - c);
        ctx.moveTo(x, y + h - c); ctx.lineTo(x, y + h); ctx.lineTo(x + c, y + h);
        ctx.stroke();

        if (title) {
            ctx.font = 'bold ' + Math.round(10 * scaleX) + 'px monospace';
            ctx.fillStyle = accent;
            ctx.textAlign = 'left';
            ctx.fillText(title, x + 18 * scaleX, y + 22 * scaleX);
        }

        ctx.restore();
    },

    drawCyberButton(options) {
        const {
            ctx, x, y, w, h, scaleX, scaleY,
            label, numberLabel,
            isActive, isDanger,
            scrambleText, animTick
        } = options;

        const accent = isDanger ? '#FF335F' : '#00F0FF';
        const activeColor = isActive ? (isDanger ? '#FF335F' : '#FFE600') : accent;
        const fontName = IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace';
        const slant = 16 * scaleX;
        const pulse = 0.55 + 0.45 * Math.sin((animTick || 0) * 0.12);

        ctx.save();

        ctx.translate(isActive ? 8 * scaleX : 0, 0);
        ctx.beginPath();
        ctx.moveTo(x + slant, y);
        ctx.lineTo(x + w - slant * 0.4, y);
        ctx.lineTo(x + w, y + h * 0.23);
        ctx.lineTo(x + w - slant, y + h);
        ctx.lineTo(x + slant * 0.7, y + h);
        ctx.lineTo(x, y + h * 0.75);
        ctx.closePath();

        const grad = ctx.createLinearGradient(x, y, x + w, y);
        if (isActive) {
            ctx.shadowColor = activeColor;
            ctx.shadowBlur = 15 * scaleX;
            grad.addColorStop(0, isDanger ? 'rgba(255,0,60,0.58)' : 'rgba(255,230,0,0.66)');
            grad.addColorStop(0.46, isDanger ? 'rgba(80,0,25,0.72)' : 'rgba(72,66,0,0.72)');
            grad.addColorStop(1, 'rgba(3,7,20,0.78)');
        } else {
            grad.addColorStop(0, 'rgba(3,7,20,0.88)');
            grad.addColorStop(1, 'rgba(3,7,20,0.42)');
        }
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.lineWidth = (isActive ? 2.2 : 1.1) * scaleX;
        ctx.strokeStyle = activeColor;
        ctx.globalAlpha = isActive ? 1 : 0.62;
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 42 * scaleX, y);
        ctx.lineTo(x + 30 * scaleX, y + 22 * scaleY);
        ctx.lineTo(x, y + 28 * scaleY);
        ctx.closePath();
        ctx.fillStyle = isActive ? '#FF003C' : '#00F0FF';
        ctx.fill();

        if (isActive && animTick !== undefined) {
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(x + slant, y);
            ctx.lineTo(x + w - slant * 0.4, y);
            ctx.lineTo(x + w, y + h * 0.23);
            ctx.lineTo(x + w - slant, y + h);
            ctx.lineTo(x + slant * 0.7, y + h);
            ctx.lineTo(x, y + h * 0.75);
            ctx.closePath();
            ctx.clip();

            for (let sy = y + ((animTick * 0.8) % (6 * scaleY)); sy < y + h; sy += 6 * scaleY) {
                ctx.fillStyle = 'rgba(255,255,255,0.055)';
                ctx.fillRect(x, sy, w, 1 * scaleY);
            }
            const scanX = x - w + ((animTick * 4.5) % (w * 1.8));
            ctx.fillStyle = 'rgba(255,255,255,0.20)';
            ctx.transform(1, 0, -0.32, 1, 0, 0);
            ctx.fillRect(scanX, y - h, 34 * scaleX, h * 3);
            ctx.restore();
        }

        if (numberLabel) {
            ctx.font = Math.round(8 * scaleX) + 'px monospace';
            ctx.fillStyle = isActive ? '#080808' : '#00141A';
            ctx.textAlign = 'left';
            ctx.fillText(numberLabel, x + 10 * scaleX, y + 15 * scaleY);
        }

        let displayLabel = label;
        if (isActive && scrambleText !== undefined) displayLabel = scrambleText;

        ctx.font = 'bold ' + Math.round((isActive ? 19 : 17) * scaleX) + 'px ' + fontName;
        ctx.fillStyle = isActive ? (isDanger ? '#FFFFFF' : '#111111') : '#FFFFFF';
        ctx.shadowColor = isActive ? `rgba(255,255,255,${0.28 + pulse * 0.22})` : 'transparent';
        ctx.shadowBlur = isActive ? 3 * scaleX : 0;
        ctx.textAlign = 'left';
        ctx.fillText(displayLabel, x + 24 * scaleX, y + h * 0.62);

        if (isActive) {
            ctx.shadowBlur = 0;
            ctx.font = 'bold ' + Math.round(13 * scaleX) + 'px monospace';
            ctx.textAlign = 'right';
            ctx.fillStyle = isDanger ? '#FFFFFF' : '#111111';
            ctx.fillText('>>', x + w - 16 * scaleX, y + h * 0.62);
        }

        ctx.restore();
    }
};

// ================================================================
//  Section 2.5  DIALOGUE MANAGER LOADER
//  Dialogue registry and map/item dialogue triggers live in
//  modules/dialogue_manager.js.
// ================================================================
IP2Live.DialogueManagerReady = (async function () {
    const root = Common.Platform.ROOT_DIRECTORY;
    const src  = root + 'Plugins/IP2Live_Core/modules/dialogue_manager.js';
    try {
        const versionedSrc = src + '?v=20260518_dialogue_manager_01_' + Date.now();
        let resp = await fetch(versionedSrc, { cache: 'no-store' });
        if (!resp.ok) {
            console.warn('[IP2Live] Versioned dialogue manager fetch failed, retrying plain path:', versionedSrc);
            resp = await fetch(src, { cache: 'no-store' });
        }
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const code = await resp.text();
        new Function(
            'Common', 'Core', 'Data', 'Graphic',
            'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'inject',
            code
        )(Common, Core, Data, Graphic, Manager, Scene, Model, Main, THREE, IP2Live, inject);
        console.log('[IP2Live] Dialogue manager loaded from:', resp.url || src);
    } catch (e) {
        console.error('[IP2Live] Failed to load dialogue manager:', src, e);
    }
}());

// ================================================================
//  Section 2.5.1  LIGHTING MANAGER LOADER
//  Map ambience presets and player glow live in modules/lighting_manager.js.
// ================================================================
IP2Live.LightingManagerReady = (async function () {
    if (IP2Live.DialogueManagerReady) await IP2Live.DialogueManagerReady;
    const root = Common.Platform.ROOT_DIRECTORY;
    const src  = root + 'Plugins/IP2Live_Core/modules/lighting_manager.js';
    try {
        const versionedSrc = src + '?v=20260518_lighting_manager_02_' + Date.now();
        let resp = await fetch(versionedSrc, { cache: 'no-store' });
        if (!resp.ok) {
            console.warn('[IP2Live] Versioned lighting manager fetch failed, retrying plain path:', versionedSrc);
            resp = await fetch(src, { cache: 'no-store' });
        }
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const code = await resp.text();
        new Function(
            'Common', 'Core', 'Data', 'Graphic',
            'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'inject',
            code
        )(Common, Core, Data, Graphic, Manager, Scene, Model, Main, THREE, IP2Live, inject);
        console.log('[IP2Live] Lighting manager loaded from:', resp.url || src);
    } catch (e) {
        console.error('[IP2Live] Failed to load lighting manager:', src, e);
    }
}());

// ================================================================
//  Section 2.5.2  QUEST ARROW ASSET LOADER
//  Reusable world arrow/path marker lives in the plugin assets folder.
// ================================================================
IP2Live.QuestArrowAssetReady = (async function () {
    const root = Common.Platform.ROOT_DIRECTORY;
    const src  = root + 'Plugins/IP2Live_Core/assets/quest_arrow.js';
    try {
        const versionedSrc = src + '?v=20260518_quest_arrow_02_' + Date.now();
        let resp = await fetch(versionedSrc, { cache: 'no-store' });
        if (!resp.ok) {
            console.warn('[IP2Live] Versioned quest arrow asset fetch failed, retrying plain path:', versionedSrc);
            resp = await fetch(src, { cache: 'no-store' });
        }
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const code = await resp.text();
        new Function(
            'Common', 'Core', 'Data', 'Graphic',
            'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'inject',
            code
        )(Common, Core, Data, Graphic, Manager, Scene, Model, Main, THREE, IP2Live, inject);
        console.log('[IP2Live] Quest arrow asset loaded from:', resp.url || src);
    } catch (e) {
        console.error('[IP2Live] Failed to load quest arrow asset:', src, e);
    }
}());

// ================================================================
//  Section 2.5.3  QUEST MANAGER LOADER
//  Objective queues, completion state, and the upper-left quest panel.
// ================================================================
IP2Live.QuestManagerReady = (async function () {
    if (IP2Live.LightingManagerReady) await IP2Live.LightingManagerReady;
    if (IP2Live.QuestArrowAssetReady) await IP2Live.QuestArrowAssetReady;
    const root = Common.Platform.ROOT_DIRECTORY;
    const src  = root + 'Plugins/IP2Live_Core/modules/quest_manager.js';
    try {
        const versionedSrc = src + '?v=20260518_quest_manager_03_' + Date.now();
        let resp = await fetch(versionedSrc, { cache: 'no-store' });
        if (!resp.ok) {
            console.warn('[IP2Live] Versioned quest manager fetch failed, retrying plain path:', versionedSrc);
            resp = await fetch(src, { cache: 'no-store' });
        }
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const code = await resp.text();
        new Function(
            'Common', 'Core', 'Data', 'Graphic',
            'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'inject',
            code
        )(Common, Core, Data, Graphic, Manager, Scene, Model, Main, THREE, IP2Live, inject);
        console.log('[IP2Live] Quest manager loaded from:', resp.url || src);
    } catch (e) {
        console.error('[IP2Live] Failed to load quest manager:', src, e);
    }
}());

// ================================================================
//  § 2.5  MAP MANAGER LOADER
//  Map routing and door connections are now managed in modules/map_manager.js
// ================================================================
IP2Live.MapManagerReady = (async function () {
    if (IP2Live.DialogueManagerReady) await IP2Live.DialogueManagerReady;
    const root = Common.Platform.ROOT_DIRECTORY;
    const src  = root + 'Plugins/IP2Live_Core/modules/map_manager.js';
    try {
        const versionedSrc = src + '?v=20260518_map_route_04_' + Date.now();
        let resp = await fetch(versionedSrc, { cache: 'no-store' });
        if (!resp.ok) {
            console.warn('[IP2Live] Versioned map manager fetch failed, retrying plain path:', versionedSrc);
            resp = await fetch(src, { cache: 'no-store' });
        }
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const code = await resp.text();
        new Function(
            'Common', 'Core', 'Data', 'Graphic',
            'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'inject',
            code
        )(Common, Core, Data, Graphic, Manager, Scene, Model, Main, THREE, IP2Live, inject);
        console.log('[IP2Live] Map manager loaded from:', resp.url || src);
    } catch (e) {
        console.error('[IP2Live] Failed to load map manager:', src, e);
    }
}());

// ================================================================
//  § 2.5.1  RESTART MANAGER
//  Safely flushes and re-initializes map states while keeping core
//  profile data intact (like Infiltrator Name).
// ================================================================
IP2Live.RestartManager = {
    restartCurrentLevel() {
        const mapId = (Scene.Map.current && Scene.Map.current.id)
            ? Scene.Map.current.id
            : Data.Systems.ID_MAP_START_HERO;
            
        // Cache persistent data
        const currentName = Core.Game.current ? Core.Game.current.infiltratorName : 'UNKNOWN';
        
        // Wipe all scenes from stack (Pause Menu, Map, etc)
        Manager.Stack.popAll();
        
        // Reboot the entire game state to flush items, map switches, HP, etc.
        const newGame = new Core.Game();
        newGame.initializeDefault();
        newGame.infiltratorName = currentName; // Restore profile name
        Core.Game.current = newGame;
        
        // Teleport back to the start of the map
        Manager.Stack.push(new Scene.Map(mapId));
        Manager.Stack.clearHUD();
        if (IP2Live.LightingManager) {
            IP2Live.LightingManager.refresh(Scene.Map.current);
        }
        
        // Check if we are restarting Stage 1 to re-trigger tutorial
        if (IP2Live.MapManager && IP2Live.MapManager.stages.length > 0 && mapId === IP2Live.MapManager.stages[0].id) {
            // Restart tutorial music
            if (IP2Live.MusicManager) {
                IP2Live.MusicManager.play(IP2Live.MusicManager.ZONE.TUTORIAL);
            }
            setTimeout(() => {
                if (IP2Live.LightingManager) {
                    IP2Live.LightingManager.refresh(Scene.Map.current);
                }
                if (IP2Live.DialogueManager) {
                    const handled = IP2Live.DialogueManager.triggerMapEvent(
                        mapId,
                        IP2Live.DialogueManager.EVENT.TUTORIAL_START,
                        { source: 'RestartManager.restartCurrentLevel', scene: Scene.Map.current }
                    );
                    if (handled) return;
                }
                if (IP2Live.Tutorial) IP2Live.Tutorial.activate();
            }, 1800);
        }
        
        console.log(`[IP2Live] RestartManager: Reloaded Stage MapID ${mapId}`);
    }
};
window.IP2LiveRestartManager = IP2Live.RestartManager;

// ================================================================
//  § 2.5  MUSIC MANAGER LOADER
//  music_manager.js is loaded before tutorial + screens so that
//  IP2Live.MusicManager is available to all other modules.
// ================================================================
IP2Live.MusicManagerReady = (async function () {
    const root = Common.Platform.ROOT_DIRECTORY;
    const src  = root + 'Plugins/IP2Live_Core/modules/music_manager.js';
    try {
        const resp = await fetch(src);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const code = await resp.text();
        new Function(
            'Common', 'Core', 'Data', 'Graphic',
            'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'inject',
            code
        )(Common, Core, Data, Graphic, Manager, Scene, Model, Main, THREE, IP2Live, inject);
        console.log('[IP2Live] Music manager loaded from:', src);
    } catch (e) {
        console.error('[IP2Live] Failed to load music manager:', src, e);
    }
}());

// ================================================================
//  Â§ 2.6  TUTORIAL MODULE LOADER
//  tutorial.js is fetched and evaluated via new Function() so it
//  inherits the exact same injected-variable scope as code.js
//  (Common, Core, Data, Graphic, Manager, Scene, Model, Main, THREE).
// ================================================================
IP2Live.TutorialReady = (async function () {
    if (IP2Live.DialogueManagerReady) await IP2Live.DialogueManagerReady;
    if (IP2Live.LightingManagerReady) await IP2Live.LightingManagerReady;
    if (IP2Live.QuestManagerReady) await IP2Live.QuestManagerReady;
    if (IP2Live.MusicManagerReady) await IP2Live.MusicManagerReady;
    if (IP2Live.MapManagerReady) await IP2Live.MapManagerReady;
    const root = Common.Platform.ROOT_DIRECTORY;
    const src  = root + 'Plugins/IP2Live_Core/modules/tutorial.js';
    try {
        const versionedSrc = src + '?v=20260518_tutorial_ui_13_' + Date.now();
        let resp = await fetch(versionedSrc, { cache: 'no-store' });
        if (!resp.ok) {
            console.warn('[IP2Live] Versioned tutorial fetch failed, retrying plain path:', versionedSrc);
            resp = await fetch(src, { cache: 'no-store' });
        }
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        const code = await resp.text();
        // Pass the same engine variables that the plugin runner injects
        const fn = new Function(
            'Common', 'Core', 'Data', 'Graphic',
            'Manager', 'Scene', 'Model', 'Main', 'THREE', 'IP2Live', 'inject',
            code
        );
        fn(Common, Core, Data, Graphic, Manager, Scene, Model, Main, THREE, IP2Live, inject);
        console.log('[IP2Live] Tutorial module loaded from:', resp.url || src);
    } catch (e) {
        console.error('[IP2Live] Failed to load tutorial module:', src, e);
    }
}());

// ================================================================
//  Â§ 3  SCREEN MODULE LOADER
//  All custom screens live in modules/screens/*.js and are loaded
//  sequentially so that dependency order is guaranteed:
//    loading-screen, credits, keyboard-menu, load-game, name-input
//    â†’ settings (needs keyboard-menu)
//    â†’ pause-menu (needs main-menu ref only at call time)
//    â†’ main-menu (needs all others, loaded last)
//
//  Each file is fetched as text then executed via new Function() with
//  the same engine-injected variables as code.js itself.
// ================================================================
IP2Live.ScreenModulesReady = (async function () {
    if (IP2Live.DialogueManagerReady) await IP2Live.DialogueManagerReady;
    if (IP2Live.LightingManagerReady) await IP2Live.LightingManagerReady;
    if (IP2Live.QuestManagerReady) await IP2Live.QuestManagerReady;
    if (IP2Live.MapManagerReady) await IP2Live.MapManagerReady;
    if (IP2Live.MusicManagerReady) await IP2Live.MusicManagerReady;
    if (IP2Live.TutorialReady) await IP2Live.TutorialReady;
    const root    = Common.Platform.ROOT_DIRECTORY;
    const baseDir = root + 'Plugins/IP2Live_Core/modules/screens/';

    // Load order matters: leaf screens first, main-menu last
    const screens = [
        'loading-screen.js',
        'credits.js',
        'keyboard-menu.js',
        'load-game.js',
        'name-input.js',
        'settings.js',
        'pause-menu.js',
        'main-menu.js',
    ];

    const PARAMS = ['Common','Core','Data','Graphic','Manager','Scene','Model','Main','THREE','IP2Live','inject'];
    const ARGS   = [ Common,  Core,  Data,  Graphic,  Manager,  Scene,  Model,  Main,  THREE,  IP2Live, inject];

    for (const file of screens) {
        const src = baseDir + file;
        try {
            const versionedSrc = src + '?v=20260518_system_ui_03_' + Date.now();
            let resp = await fetch(versionedSrc, { cache: 'no-store' });
            if (!resp.ok) {
                console.warn('[IP2Live] Versioned screen fetch failed, retrying plain path:', versionedSrc);
                resp = await fetch(src, { cache: 'no-store' });
            }
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const code = await resp.text();
            new Function(...PARAMS, code)(...ARGS);
        } catch (e) {
            console.error('[IP2Live] Failed to load screen module:', src, e);
        }
    }

    // â”€â”€ Â§ 6  DB INIT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Fired after screens are registered so the DB is online before
    // any screen tries to read from it.
    IP2Live.DBManager.initDB()
        .then(() => console.log('[IP2Live] Core Online. Database ready.'))
        .catch((e) => console.error('[IP2Live] DB init failed:', e));

    console.log('[IP2Live] All screen modules loaded.');
}());

console.log('[IP2Live] IP2Live_Core plugin loaded.');
