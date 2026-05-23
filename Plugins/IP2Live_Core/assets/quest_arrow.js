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
            const labelW = panel ? Math.min(292, panel.w) : 180;
            const labelH = 48;
            const lx = panel ? panel.x : Math.max(10, Math.min(cW - labelW - 10, ax - labelW / 2));
            const preferredY = panel ? panel.y + panel.h + 8 : Math.max(10, ay - 92);
            const ly = Math.max(8, Math.min(cH - labelH - 8, preferredY));
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
                distTiles === null ? 'DIST: --' : 'DIST: ' + distTiles.toFixed(1) + ' tiles',
                lx + labelW / 2,
                ly + 35
            );
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
        let routeTiles = objective && objective.routeTiles && objective.routeTiles.length
            ? objective.routeTiles
            : null;

        if (!routeTiles && IP2Live.QuestPathfinder && typeof IP2Live.QuestPathfinder.pathForObjective === 'function') {
            const smartRoute = IP2Live.QuestPathfinder.pathForObjective(objective, ctx);
            if (smartRoute && smartRoute.length > 1) routeTiles = smartRoute;
        }

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

    _drawScreenFallback(ctx, cW, cH, context) {
        const data = context || {};
        const target = this._targetTile(this.objective);
        const distTiles = typeof data.distanceTiles === 'number' ? data.distanceTiles : null;

        const panel = data.panelRect || null;
        const labelW = panel ? Math.min(292, panel.w) : 292;
        const labelH = 62;
        const lx = panel ? panel.x : 18;
        const preferredY = panel ? panel.y + panel.h + 8 : Math.max(76, cH * 0.18);
        const ly = Math.max(8, Math.min(cH - labelH - 8, preferredY));
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
        ctx.fillText('TARGET TILE  X:' + target.x + '  Y:' + target.y + '  Z:' + target.z, lx + labelW / 2, ly + 20);
        ctx.fillStyle = '#DAEEFF';
        ctx.font = '12px monospace';
        ctx.fillText(
            distTiles === null ? 'DISTANCE: CALCULATING' : 'DISTANCE: ' + distTiles.toFixed(1) + ' tiles',
            lx + labelW / 2,
            ly + 39
        );
        ctx.fillStyle = 'rgba(255,230,0,0.85)';
        ctx.font = '10px monospace';
        ctx.fillText('ROTATE CAMERA UNTIL THE 3D TILE MARKER IS VISIBLE', lx + labelW / 2, ly + 54);
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
        ctx.fillText('TARGET TILE  X:' + target.x + '  Y:' + target.y + '  Z:' + target.z, cx, ly + 24);
        ctx.fillStyle = '#DAEEFF';
        ctx.font = '11px monospace';
        ctx.fillText('PLAYER REF MISSING', cx, ly + 45);
        ctx.restore();
    }
}

IP2Live.QuestArrowAsset = {
    create() {
        return new IP2LiveQuestArrowGuide();
    },
    Guide: IP2LiveQuestArrowGuide,
};
window.IP2LiveQuestArrowAsset = IP2Live.QuestArrowAsset;

console.log('[IP2Live] quest_arrow.js asset loaded.');
