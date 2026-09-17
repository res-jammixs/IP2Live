/**
 * IP2Live - Quest Arrow Asset
 *
 * Reusable world-space target marker, path dots, and 2D fallback arrow.
 * This file intentionally lives in the plugin assets folder because it is
 * a reusable visual implementation rather than a game-flow manager.
 *
 * Loaded by code.js via fetch() + new Function(). Do not use import/export.
 */

class IP2LiveQuestArrowGuide {
    constructor() {
        this.objective = null;
        this._guideGroup = null;
        this._pathGroup = null;
        this._arrowMesh = null;
        this._dots = [];
        this._scene = null;
        this._tilePulseMesh = null;
        this._beaconMesh = null;
        this._targetRingMesh = null;
        this._targetHighRingMesh = null;
        this._guideEditorUnits = null;
        this._objectiveKey = null;
        this._smartRouteCacheKey = null;
        this._smartRouteCache = null;
    }

    setObjective(objective) {
        const key = objective && objective.id ? objective.id : null;
        if (this._objectiveKey !== key) {
            this.clear();
            this._objectiveKey = key;
        }
        this.objective = objective || null;
    }

    clear() {
        if (this._guideGroup && this._guideGroup.parent) {
            this._guideGroup.parent.remove(this._guideGroup);
        }
        this._guideGroup = null;
        this._pathGroup = null;
        this._arrowMesh = null;
        this._dots = [];
        this._scene = null;
        this._tilePulseMesh = null;
        this._beaconMesh = null;
        this._targetRingMesh = null;
        this._targetHighRingMesh = null;
        this._guideEditorUnits = null;
        this._smartRouteCacheKey = null;
        this._smartRouteCache = null;
    }

    update(context) {
        const ctx = context || {};
        if (!this.objective || !ctx.guideActive || !THREE) {
            this.clear();
            return false;
        }

        this._ensureWorldGuide(ctx);
        if (!this._guideGroup) return false;

        const hero = ctx.hero || null;
        const editorUnits = this._positionUsesEditorUnits(hero && hero.position, ctx);
        if (this._guideEditorUnits !== editorUnits) {
            this.clear();
            this._ensureWorldGuide(ctx);
            if (!this._guideGroup) return false;
        }

        const tileSize = this._tileSize(ctx);
        const visualScale = editorUnits ? 1 / tileSize : 1;
        const target = this._targetWorld(this.objective, ctx);

        if (this._arrowMesh) {
            this._arrowMesh.position.set(target.x, target.y, target.z);
            this._arrowMesh.rotation.set(0, 0, 0);
        }
        if (this._tilePulseMesh) {
            this._tilePulseMesh.position.set(target.x, target.y + 0.22 * visualScale, target.z);
            this._tilePulseMesh.scale.set(1, 1, 1);
        }
        if (this._beaconMesh) {
            this._beaconMesh.position.set(target.x, target.y + 26 * visualScale, target.z);
            this._beaconMesh.scale.set(1, 1, 1);
        }
        if (this._targetRingMesh) this._targetRingMesh.rotation.z = 0;
        if (this._targetHighRingMesh) {
            this._targetHighRingMesh.position.set(target.x, target.y + 10 * visualScale, target.z);
            this._targetHighRingMesh.rotation.z = 0;
        }

        const path = this._pathPoints(this.objective, ctx, 10);
        for (let i = 0; i < this._dots.length; i++) {
            const dot = this._dots[i];
            const idx = Math.floor(i * 1.4);
            const p = path[idx];
            if (!p) {
                dot.visible = false;
                continue;
            }
            const pulse = 0.75 + Math.sin((ctx.tick || 0) * 0.18 + i) * 0.22;
            dot.visible = true;
            dot.position.set(p.x, p.y, p.z);
            dot.scale.set(pulse, pulse, pulse);
        }

        return true;
    }

    draw2D(ctx, cW, cH, context) {
        const data = context || {};
        if (!this.objective || !data.guideActive || !ctx) return false;

        const target = this._targetWorld(this.objective, data);
        const hero = data.hero || null;
        if (!hero) {
            this._drawNoHeroFallback(ctx, cW, cH, data);
            return true;
        }

        const editorUnits = this._positionUsesEditorUnits(hero && hero.position, data);
        const visualScale = editorUnits ? 1 / this._tileSize(data) : 1;
        const hy = target.y + 2 * visualScale;
        const cam = this._activeCamera(data);

        const to2D = (x, y, z) => {
            if (!cam || !THREE || !THREE.Vector3) return null;
            const vec = new THREE.Vector3(x, y, z);
            vec.project(cam);
            if (vec.z > 1) return null;
            return {
                x: (vec.x * 0.5 + 0.5) * cW,
                y: (-vec.y * 0.5 + 0.5) * cH,
            };
        };

        const isVisible2D = (p) => p &&
            p.x >= -40 && p.x <= cW + 40 &&
            p.y >= -40 && p.y <= cH + 40;

        const projectedTarget2D = to2D(target.x, hy, target.z);
        const target2D = isVisible2D(projectedTarget2D) ? projectedTarget2D : null;
        const pathPoints = this._pathPoints(this.objective, data, 9);

        ctx.save();
        ctx.shadowBlur = 0;

        if (target2D && pathPoints.length > 0) {
            for (let i = 0; i < pathPoints.length; i += 4) {
                const p2 = to2D(pathPoints[i].x, pathPoints[i].y, pathPoints[i].z);
                if (!isVisible2D(p2)) continue;
                const r = 4.2 + Math.sin((data.tick || 0) * 0.16 + i) * 1.1;
                ctx.beginPath();
                ctx.fillStyle = 'rgba(255, 0, 60, 0.94)';
                ctx.arc(p2.x, p2.y, r, 0, Math.PI * 2);
                ctx.fill();
            }
        } else {
            this._drawScreenFallback(ctx, cW, cH, data);
        }

        if (target2D) {
            const ax = target2D.x;
            const ay = target2D.y - 40;
            const distTiles = typeof data.distanceTiles === 'number' ? data.distanceTiles : null;

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

            const panel = data.panelRect || null;
            const labelW = panel ? Math.min(340, panel.w) : 300;
            const labelH = 72;
            const lx = panel ? panel.x : Math.max(10, Math.min(cW - labelW - 10, ax - labelW / 2));
            const preferredY = panel ? panel.y + panel.h + 8 : Math.max(10, ay - 92);
            const ly = Math.max(8, Math.min(cH - labelH - 8, preferredY));
            this._drawDistancePanel(ctx, {
                x: lx,
                y: ly,
                w: labelW,
                h: labelH,
                target: this._targetTile(this.objective),
                distanceTiles: distTiles,
                tick: data.tick || 0,
                footer: 'TARGET IN VIEW // FOLLOW THE MARKER',
            });
        }

        ctx.restore();
        return true;
    }

    _ensureWorldGuide(context) {
        const scene = this._questScene(context);
        if (!scene) return;

        if (this._guideGroup && this._scene !== scene) this.clear();
        if (this._guideGroup) return;

        const ctx = context || {};
        const hero = ctx.hero || null;
        const editorUnits = this._positionUsesEditorUnits(hero && hero.position, ctx);
        const tileSize = this._tileSize(ctx);
        const visualScale = editorUnits ? 1 / tileSize : 1;
        const target = this._targetWorld(this.objective, ctx);
        const group = THREE.Group ? new THREE.Group() : new THREE.Object3D();
        group.name = 'IP2Live_QuestArrowGuide';

        const redMat = new THREE.MeshBasicMaterial({ color: 0xff003c, transparent: true, opacity: 0.92 });
        const redHotMat = new THREE.MeshBasicMaterial({ color: 0xff2b2b, transparent: true, opacity: 1 });
        const redGhostMat = new THREE.MeshBasicMaterial({ color: 0xff003c, transparent: true, opacity: 0.28 });
        const yellowMat = new THREE.MeshBasicMaterial({ color: 0xffe600, transparent: true, opacity: 0.98 });
        const cyanMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.42 });

        if (THREE.CylinderGeometry) {
            const tilePulse = new THREE.Mesh(
                new THREE.CylinderGeometry(10.5 * visualScale, 10.5 * visualScale, 0.65 * visualScale, 40),
                redGhostMat
            );
            tilePulse.name = 'IP2Live_TargetTileMarker';
            tilePulse.position.set(target.x, target.y + 0.2 * visualScale, target.z);
            group.add(tilePulse);

            const beacon = new THREE.Mesh(
                new THREE.CylinderGeometry(1.5 * visualScale, 1.5 * visualScale, 52 * visualScale, 12),
                redGhostMat
            );
            beacon.name = 'IP2Live_TargetBeacon';
            beacon.position.set(target.x, target.y + 26 * visualScale, target.z);
            group.add(beacon);

            this._tilePulseMesh = tilePulse;
            this._beaconMesh = beacon;
        }

        if (THREE.TorusGeometry) {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(9 * visualScale, 1.4 * visualScale, 8, 36), cyanMat);
            ring.rotation.x = Math.PI / 2;
            ring.position.set(target.x, target.y + 0.35 * visualScale, target.z);
            group.add(ring);
            this._targetRingMesh = ring;

            const highRing = new THREE.Mesh(new THREE.TorusGeometry(6.5 * visualScale, 0.8 * visualScale, 8, 30), yellowMat);
            highRing.rotation.x = Math.PI / 2;
            highRing.position.set(target.x, target.y + 10 * visualScale, target.z);
            group.add(highRing);
            this._targetHighRingMesh = highRing;
        }

        const arrow = THREE.Group ? new THREE.Group() : new THREE.Object3D();
        arrow.name = 'IP2Live_TargetArrow';

        if (THREE.ConeGeometry) {
            const cone = new THREE.Mesh(new THREE.ConeGeometry(6.5 * visualScale, 15 * visualScale, 4), yellowMat);
            cone.rotation.x = Math.PI;
            cone.position.set(0, 19 * visualScale, 0);
            arrow.add(cone);
        }

        if (THREE.CylinderGeometry) {
            const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.2 * visualScale, 2.2 * visualScale, 16 * visualScale, 8), redHotMat);
            shaft.position.set(0, 32 * visualScale, 0);
            arrow.add(shaft);
        }

        arrow.position.set(target.x, target.y, target.z);
        group.add(arrow);

        if (THREE.SphereGeometry) {
            const dotGeo = new THREE.SphereGeometry(2.4 * visualScale, 8, 8);
            for (let i = 0; i < 48; i++) {
                const dot = new THREE.Mesh(dotGeo, redMat);
                dot.visible = false;
                group.add(dot);
                this._dots.push(dot);
            }
        }

        this._arrowMesh = arrow;
        this._pathGroup = group;
        this._guideGroup = group;
        this._scene = scene;
        this._guideEditorUnits = editorUnits;
        scene.add(group);
    }

    _pathPoints(objective, context, step) {
        const ctx = context || {};
        const hero = ctx.hero || null;
        const tileUnits = this._positionUsesEditorUnits(hero && hero.position, ctx);
        const tileSize = this._tileSize(ctx);
        const scale = tileUnits ? 1 : tileSize;
        const center = tileUnits ? 0.5 : scale / 2;
        const spacing = tileUnits && step > 2 ? step / tileSize : step;
        const targetTile = this._targetTile(objective);
        const y = targetTile.y * scale + (tileUnits ? 0.12 : 1.8);
        const points = [];
        let routeTiles = this._resolveRouteTiles(objective, ctx, hero, targetTile);

        if (!routeTiles) {
            const heroPos = this._heroEditorPosition(hero, ctx);
            routeTiles = heroPos
                ? [{ x: Math.floor(heroPos.x), y: targetTile.y, z: Math.floor(heroPos.z) }, targetTile]
                : [targetTile];
        }

        const toWorld = (tile) => ({
            x: tile.x * scale + center,
            y,
            z: tile.z * scale + center,
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
                    z: a.z + dz * t,
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
    }

    _resolveRouteTiles(objective, context, hero, targetTile) {
        const ctx = context || {};
        const smartRoute = this._smartRoute(objective, ctx, hero, targetTile);
        if (smartRoute && smartRoute.length > 1) return smartRoute;
        if (objective && objective.routeTiles && objective.routeTiles.length > 1) return objective.routeTiles;
        return null;
    }

    _smartRoute(objective, context, hero, targetTile) {
        if (!IP2Live.QuestPathfinder || typeof IP2Live.QuestPathfinder.pathForObjective !== 'function') return null;
        const ctx = context || {};
        const heroPos = this._heroEditorPosition(hero, ctx);
        if (!heroPos) return null;

        const mapId = this._mapId(ctx);
        if (!mapId) return null;
        const sx = Math.floor(heroPos.x);
        const sz = Math.floor(heroPos.z);
        const tx = Math.floor(targetTile.x);
        const tz = Math.floor(targetTile.z);
        const key = [
            mapId,
            sx,
            sz,
            tx,
            tz,
            objective && objective.id ? objective.id : 'objective',
        ].join(':');

        if (this._smartRouteCacheKey === key && this._smartRouteCache && this._smartRouteCache.length > 1) {
            return this._smartRouteCache;
        }

        const smartRoute = IP2Live.QuestPathfinder.pathForObjective(objective, ctx);
        if (smartRoute && smartRoute.length > 1) {
            this._smartRouteCacheKey = key;
            this._smartRouteCache = smartRoute;
            return smartRoute;
        }

        this._smartRouteCacheKey = key;
        this._smartRouteCache = null;
        return null;
    }

    _targetTile(objective) {
        const tile = objective && objective.targetTile ? objective.targetTile : { x: 0, y: 0, z: 0 };
        return {
            x: Number(tile.x) || 0,
            y: Number(tile.y) || 0,
            z: Number(tile.z) || 0,
        };
    }

    _targetWorld(objective, context) {
        const ctx = context || {};
        const hero = ctx.hero || null;
        const tile = this._targetTile(objective);
        const tileUnits = this._positionUsesEditorUnits(hero && hero.position, ctx);
        const scale = tileUnits ? 1 : this._tileSize(ctx);
        const center = tileUnits ? 0.5 : scale / 2;
        return {
            x: tile.x * scale + center,
            y: tile.y * scale,
            z: tile.z * scale + center,
        };
    }

    _tileSize(context) {
        const ctx = context || {};
        return ctx.tileSize ||
            (Common && Common.Datas && Common.Datas.Systems && Common.Datas.Systems.SQUARE_SIZE) ||
            (Data && Data.Systems && Data.Systems.SQUARE_SIZE) ||
            16;
    }

    _positionUsesEditorUnits(position, context) {
        const ctx = context || {};
        if (typeof ctx.positionUsesEditorUnits === 'function') {
            return !!ctx.positionUsesEditorUnits(position);
        }
        if (!position || typeof position.x !== 'number' || typeof position.z !== 'number') return false;

        const scene = ctx.scene || (Scene.Map && Scene.Map.current) || null;
        const map = scene && scene.currentMap;
        const props = map && map.mapProperties;
        if (props && props.length && props.width) {
            return Math.abs(position.x) <= props.length + 4 &&
                Math.abs(position.z) <= props.width + 4;
        }
        return Math.abs(position.x) < 96 && Math.abs(position.z) < 96;
    }

    _heroWorldPosition(hero) {
        if (!hero || !hero.position) return null;
        const p = hero.position;
        if (typeof p.x !== 'number' || typeof p.z !== 'number') return null;
        return { x: p.x, y: typeof p.y === 'number' ? p.y : 0, z: p.z };
    }

    _heroEditorPosition(hero, context) {
        const pos = this._heroWorldPosition(hero);
        if (!pos) return null;
        if (this._positionUsesEditorUnits(pos, context)) return pos;
        const tileSize = this._tileSize(context);
        return {
            x: pos.x / tileSize,
            y: pos.y / tileSize,
            z: pos.z / tileSize,
        };
    }

    _mapId(context) {
        const ctx = context || {};
        const scene = ctx.scene || (Scene && Scene.Map && Scene.Map.current) || null;
        const mapId = scene && (
            scene.id ||
            scene.mapID ||
            (scene.currentMap && scene.currentMap.id) ||
            (Core.Game.current && Core.Game.current.currentMapID)
        );
        return Number(mapId) || (Core.Game.current && Number(Core.Game.current.currentMapID)) || 0;
    }

    _questScene(context) {
        const ctx = context || {};
        const current = ctx.scene || (Scene.Map && Scene.Map.current) || null;
        const candidates = [
            ctx.threeScene,
            current && current.scene,
            current && current.threeScene,
            current && current.mapScene,
            current && current.currentMap && current.currentMap.scene,
            current && current.currentMap && current.currentMap.threeScene,
            Manager && Manager.GL && Manager.GL.scene,
            Manager && Manager.GL && Manager.GL.currentScene,
        ];

        for (let i = 0; i < candidates.length; i++) {
            if (candidates[i] && typeof candidates[i].add === 'function') return candidates[i];
        }
        return null;
    }

    _activeCamera(context) {
        const ctx = context || {};
        const current = ctx.scene || (Scene.Map && Scene.Map.current) || null;
        if (ctx.camera) return ctx.camera;
        if (current && current.camera) {
            if (typeof current.camera.getThreeCamera === 'function') return current.camera.getThreeCamera();
            if (current.camera.threeCamera) return current.camera.threeCamera;
        }
        if (Manager && Manager.GL && Manager.GL.camera) return Manager.GL.camera;
        if (Manager && Manager.Camera && Manager.Camera.camera) return Manager.Camera.camera;
        return null;
    }

    _measureTrackedText(ctx, value, tracking) {
        const text = String(value || '');
        const gap = Math.max(0, Number(tracking) || 0);
        let width = 0;
        for (let i = 0; i < text.length; i++) width += ctx.measureText(text[i]).width;
        return width + Math.max(0, text.length - 1) * gap;
    }

    _drawTrackedText(ctx, value, x, y, tracking) {
        const text = String(value || '');
        if (!text) return 0;
        const gap = Math.max(0, Number(tracking) || 0);
        const width = this._measureTrackedText(ctx, text, gap);
        const oldAlign = ctx.textAlign || 'left';
        let cursorX = x;
        if (oldAlign === 'center') cursorX -= width / 2;
        else if (oldAlign === 'right' || oldAlign === 'end') cursorX -= width;
        ctx.textAlign = 'left';
        for (let i = 0; i < text.length; i++) {
            const glyph = text[i];
            ctx.fillText(glyph, cursorX, y);
            cursorX += ctx.measureText(glyph).width + gap;
        }
        ctx.textAlign = oldAlign;
        return width;
    }

    _traceDistancePanel(ctx, x, y, w, h) {
        ctx.beginPath();
        ctx.moveTo(x + 12, y);
        ctx.lineTo(x + w - 9, y);
        ctx.lineTo(x + w, y + 9);
        ctx.lineTo(x + w - 8, y + h);
        ctx.lineTo(x + 7, y + h);
        ctx.lineTo(x, y + h - 8);
        ctx.lineTo(x, y + 11);
        ctx.closePath();
    }

    _drawDistancePanel(ctx, options) {
        const o = options;
        const x = o.x;
        const y = o.y;
        const w = o.w;
        const h = o.h;
        const target = o.target || { x: 0, y: 0, z: 0 };
        const pulse = 0.5 + 0.5 * Math.sin((o.tick || 0) * 0.1);
        const panelFont = IP2Live.Assets && IP2Live.Assets.oxaniumMediumLoaded
            ? 'Oxanium-Medium'
            : 'sans-serif';

        ctx.save();

        // Thick offset extrusion and a second under-plate replace the old flat box.
        this._traceDistancePanel(ctx, x + 5, y + 6, w, h);
        ctx.fillStyle = 'rgba(0,2,7,0.9)';
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + 20, y + h + 2);
        ctx.lineTo(x + w - 20, y + h + 2);
        ctx.lineTo(x + w - 29, y + h + 7);
        ctx.lineTo(x + 11, y + h + 7);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,0,60,0.26)';
        ctx.fill();

        this._traceDistancePanel(ctx, x, y, w, h);
        const panelGrad = ctx.createLinearGradient(x, y, x + w, y + h);
        panelGrad.addColorStop(0, 'rgba(34,4,20,0.98)');
        panelGrad.addColorStop(0.24, 'rgba(8,20,31,0.985)');
        panelGrad.addColorStop(0.75, 'rgba(3,9,18,0.99)');
        panelGrad.addColorStop(1, 'rgba(17,8,17,0.99)');
        ctx.fillStyle = panelGrad;
        ctx.fill();

        ctx.save();
        this._traceDistancePanel(ctx, x, y, w, h);
        ctx.clip();
        for (let sy = y + 3; sy < y + h; sy += 4) {
            ctx.fillStyle = 'rgba(235,250,255,0.026)';
            ctx.fillRect(x, sy, w, 0.7);
        }
        ctx.strokeStyle = 'rgba(255,0,60,0.09)';
        ctx.lineWidth = 4;
        for (let hx = x - 20; hx < x + w * 0.44; hx += 12) {
            ctx.beginPath();
            ctx.moveTo(hx, y + h);
            ctx.lineTo(hx + 36, y);
            ctx.stroke();
        }
        const sweepX = x + ((o.tick || 0) * 1.7 % (w + 40)) - 40;
        const sweepGrad = ctx.createLinearGradient(sweepX, y, sweepX + 40, y);
        sweepGrad.addColorStop(0, 'rgba(0,240,255,0)');
        sweepGrad.addColorStop(0.5, 'rgba(0,240,255,0.07)');
        sweepGrad.addColorStop(1, 'rgba(0,240,255,0)');
        ctx.fillStyle = sweepGrad;
        ctx.fillRect(sweepX, y, 40, h);
        ctx.restore();

        this._traceDistancePanel(ctx, x, y, w, h);
        ctx.strokeStyle = '#FF174D';
        ctx.lineWidth = 1.7;
        ctx.shadowColor = '#FF003C';
        ctx.shadowBlur = 6 + pulse * 4;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Machined top rails and asymmetric Persona-style corner blocks.
        ctx.fillStyle = '#FF003C';
        ctx.beginPath();
        ctx.moveTo(x + 13, y + 3);
        ctx.lineTo(x + w * 0.55, y + 3);
        ctx.lineTo(x + w * 0.55 - 8, y + 7);
        ctx.lineTo(x + 9, y + 7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#FFE600';
        ctx.beginPath();
        ctx.moveTo(x + w * 0.55 + 2, y + 3);
        ctx.lineTo(x + w - 18, y + 3);
        ctx.lineTo(x + w - 23, y + 7);
        ctx.lineTo(x + w * 0.55 - 3, y + 7);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#00F0FF';
        ctx.fillRect(x + w - 7, y + 18, 2, h - 32);

        // Layered navigation core.
        const iconX = x + 22;
        const iconY = y + 40;
        ctx.beginPath();
        ctx.moveTo(iconX, iconY - 14);
        ctx.lineTo(iconX + 12, iconY - 5);
        ctx.lineTo(iconX + 9, iconY + 10);
        ctx.lineTo(iconX, iconY + 15);
        ctx.lineTo(iconX - 9, iconY + 10);
        ctx.lineTo(iconX - 12, iconY - 5);
        ctx.closePath();
        const iconGrad = ctx.createLinearGradient(iconX - 12, iconY - 14, iconX + 12, iconY + 15);
        iconGrad.addColorStop(0, '#FF315F');
        iconGrad.addColorStop(0.45, '#3B0920');
        iconGrad.addColorStop(1, '#00DDEB');
        ctx.fillStyle = iconGrad;
        ctx.fill();
        ctx.strokeStyle = '#FFE600';
        ctx.lineWidth = 1.1;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(iconX, iconY - 7);
        ctx.lineTo(iconX + 6, iconY);
        ctx.lineTo(iconX, iconY + 7);
        ctx.lineTo(iconX - 6, iconY);
        ctx.closePath();
        ctx.fillStyle = '#06131C';
        ctx.fill();
        ctx.strokeStyle = '#67F7FF';
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.font = 'bold 8px ' + panelFont;
        ctx.fillStyle = '#FF6E92';
        this._drawTrackedText(ctx, 'TARGET TILE', x + 42, y + 19, 0.65);

        ctx.textAlign = 'right';
        ctx.font = 'bold 10px ' + panelFont;
        ctx.fillStyle = '#FFE600';
        this._drawTrackedText(ctx, 'X:' + target.x + '  Y:' + target.y + '  Z:' + target.z, x + w - 16, y + 20, 0.55);

        const distanceLabel = o.distanceLabel || (
            typeof o.distanceTiles === 'number'
                ? 'DISTANCE // ' + o.distanceTiles.toFixed(1) + ' TILES'
                : 'DISTANCE // CALCULATING'
        );
        ctx.textAlign = 'left';
        ctx.font = 'bold 12px ' + panelFont;
        ctx.fillStyle = '#E6F8FF';
        this._drawTrackedText(ctx, distanceLabel, x + 42, y + 43, 0.7);

        ctx.font = 'bold 8px ' + panelFont;
        ctx.fillStyle = 'rgba(0,240,255,0.82)';
        this._drawTrackedText(ctx, o.footer || 'NAVIGATION LINK ACTIVE', x + 42, y + 61, 0.5);

        ctx.restore();
    }

    _drawScreenFallback(ctx, cW, cH, context) {
        const data = context || {};
        const target = this._targetTile(this.objective);
        const distTiles = typeof data.distanceTiles === 'number' ? data.distanceTiles : null;

        const panel = data.panelRect || null;
        const labelW = panel ? Math.min(340, panel.w) : 320;
        const labelH = 72;
        const lx = panel ? panel.x : 18;
        const preferredY = panel ? panel.y + panel.h + 8 : Math.max(76, cH * 0.18);
        const ly = Math.max(8, Math.min(cH - labelH - 8, preferredY));
        this._drawDistancePanel(ctx, {
            x: lx,
            y: ly,
            w: labelW,
            h: labelH,
            target,
            distanceTiles: distTiles,
            tick: data.tick || 0,
            footer: 'ROTATE CAMERA UNTIL THE 3D TILE MARKER IS VISIBLE',
        });
    }

    _drawNoHeroFallback(ctx, cW, cH, context) {
        const data = context || {};
        const target = this._targetTile(this.objective);
        const tick = data.tick || 0;
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

        const labelW = 320;
        const labelH = 72;
        const lx = cx - labelW / 2;
        const ly = cy + 34;
        ctx.shadowBlur = 0;
        this._drawDistancePanel(ctx, {
            x: lx,
            y: ly,
            w: labelW,
            h: labelH,
            target,
            distanceTiles: null,
            tick,
            distanceLabel: 'PLAYER REF MISSING',
            footer: 'REACQUIRING NAVIGATION SIGNAL',
        });
        ctx.restore();
    }
}

IP2Live.QuestArrowAsset = {
    create() {
        return new IP2LiveQuestArrowGuide();
    },
    drawDistancePanel(ctx, options) {
        const renderer = new IP2LiveQuestArrowGuide();
        renderer._drawDistancePanel(ctx, options || {});
    },
    Guide: IP2LiveQuestArrowGuide,
};
window.IP2LiveQuestArrowAsset = IP2Live.QuestArrowAsset;

console.log('[IP2Live] quest_arrow.js asset loaded.');
