/**
 * IP2Live - Quest Pathfinder Asset
 *
 * Read-only helper for quest guide routing. It reads RPG Paper Maker map
 * chunk data and builds a small walkability grid for visual path lines only.
 * It does not alter or replace engine collision.
 */

const IP2LiveQuestPathfinder = {
    VERSION: 'quest-pathfinder-20260523-01',
    CHUNK_SIZE: 16,
    _cache: {},
    _loading: {},

    pathForObjective(objective, context) {
        const ctx = context || {};
        const mapId = this._mapId(ctx);
        const start = this._heroTile(ctx);
        const target = this._targetTile(objective);

        if (!mapId || !start || !target) return null;

        const map = this._cache[mapId];
        if (!map) {
            this.ensureMapLoaded(mapId);
            return null;
        }

        return this._findPath(map, start, target);
    },

    ensureMapLoaded(mapId) {
        const id = Number(mapId) || 0;
        if (!id || this._cache[id] || this._loading[id]) return false;

        this._loading[id] = this._loadMap(id)
            .then((map) => {
                this._cache[id] = map;
                delete this._loading[id];
                if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
                console.log('[IP2Live] QuestPathfinder loaded map grid:', id);
            })
            .catch((error) => {
                delete this._loading[id];
                console.warn('[IP2Live] QuestPathfinder could not load map grid:', id, error);
            });
        return true;
    },

    async _loadMap(mapId) {
        const root = Common && Common.Platform && Common.Platform.ROOT_DIRECTORY
            ? Common.Platform.ROOT_DIRECTORY
            : '';
        const mapDir = root + 'Maps/MAP' + String(mapId).padStart(4, '0') + '/';
        const infoResponse = await fetch(mapDir + 'infos.json', { cache: 'no-store' });
        if (!infoResponse.ok) throw new Error('HTTP ' + infoResponse.status + ' infos.json');
        const info = await infoResponse.json();
        const width = Number(info.l) || 0;
        const height = Number(info.w) || 0;
        if (width <= 0 || height <= 0) throw new Error('Invalid map size');

        const blocked = new Uint8Array(width * height);
        const chunkXCount = Math.max(1, Math.ceil(width / this.CHUNK_SIZE));
        const chunkZCount = Math.max(1, Math.ceil(height / this.CHUNK_SIZE));
        const chunkPromises = [];

        for (let cx = 0; cx < chunkXCount; cx++) {
            for (let cz = 0; cz < chunkZCount; cz++) {
                chunkPromises.push(this._loadChunk(mapDir, cx, cz));
            }
        }

        const chunks = await Promise.all(chunkPromises);
        for (let i = 0; i < chunks.length; i++) {
            if (!chunks[i]) continue;
            this._markEntries(blocked, width, height, chunks[i].walls);
            this._markEntries(blocked, width, height, chunks[i].moun);
            this._markEntries(blocked, width, height, chunks[i].objs3d);
            this._markEntries(blocked, width, height, chunks[i].objs);
            this._markEntries(blocked, width, height, chunks[i].sprites);
        }

        return {
            id: mapId,
            width,
            height,
            blocked,
        };
    },

    async _loadChunk(mapDir, cx, cz) {
        const src = mapDir + cx + '_0_' + cz + '.json';
        const response = await fetch(src, { cache: 'no-store' });
        if (!response.ok) return null;
        return response.json();
    },

    _markEntries(blocked, width, height, entries) {
        if (!Array.isArray(entries)) return;

        for (let i = 0; i < entries.length; i++) {
            const key = entries[i] && entries[i].k;
            if (!Array.isArray(key) || key.length < 4) continue;
            const x = Math.floor(Number(key[0]));
            const z = Math.floor(Number(key[3]));
            if (x < 0 || z < 0 || x >= width || z >= height) continue;
            blocked[z * width + x] = 1;
        }
    },

    _findPath(map, start, target) {
        const width = map.width;
        const height = map.height;
        const total = width * height;
        const sx = this._clamp(Math.floor(start.x), 0, width - 1);
        const sz = this._clamp(Math.floor(start.z), 0, height - 1);
        const tx = this._clamp(Math.floor(target.x), 0, width - 1);
        const tz = this._clamp(Math.floor(target.z), 0, height - 1);
        const startIndex = sz * width + sx;
        const targetIndex = tz * width + tx;

        if (startIndex === targetIndex) {
            return [
                { x: sx, y: target.y || 0, z: sz },
                { x: tx, y: target.y || 0, z: tz },
            ];
        }

        const open = [startIndex];
        const openSet = new Uint8Array(total);
        const closed = new Uint8Array(total);
        const cameFrom = new Int32Array(total);
        const gScore = new Float32Array(total);
        const fScore = new Float32Array(total);

        for (let i = 0; i < total; i++) {
            cameFrom[i] = -1;
            gScore[i] = Infinity;
            fScore[i] = Infinity;
        }

        gScore[startIndex] = 0;
        fScore[startIndex] = this._heuristic(sx, sz, tx, tz);
        openSet[startIndex] = 1;

        while (open.length > 0) {
            let bestOpenIndex = 0;
            let current = open[0];
            for (let i = 1; i < open.length; i++) {
                if (fScore[open[i]] < fScore[current]) {
                    current = open[i];
                    bestOpenIndex = i;
                }
            }

            open.splice(bestOpenIndex, 1);
            openSet[current] = 0;
            if (current === targetIndex) {
                return this._reconstructPath(cameFrom, current, width, target.y || 0);
            }

            closed[current] = 1;
            const cx = current % width;
            const cz = Math.floor(current / width);
            const neighbors = [
                { x: cx + 1, z: cz },
                { x: cx - 1, z: cz },
                { x: cx, z: cz + 1 },
                { x: cx, z: cz - 1 },
            ];

            for (let i = 0; i < neighbors.length; i++) {
                const n = neighbors[i];
                if (n.x < 0 || n.z < 0 || n.x >= width || n.z >= height) continue;
                const ni = n.z * width + n.x;
                if (closed[ni]) continue;
                if (ni !== targetIndex && ni !== startIndex && map.blocked[ni]) continue;

                const tentativeG = gScore[current] + 1;
                if (!openSet[ni]) {
                    open.push(ni);
                    openSet[ni] = 1;
                } else if (tentativeG >= gScore[ni]) {
                    continue;
                }

                cameFrom[ni] = current;
                gScore[ni] = tentativeG;
                fScore[ni] = tentativeG + this._heuristic(n.x, n.z, tx, tz);
            }
        }

        return null;
    },

    _reconstructPath(cameFrom, current, width, y) {
        const reversed = [];
        let index = current;
        while (index >= 0) {
            reversed.push({
                x: index % width,
                y,
                z: Math.floor(index / width),
            });
            index = cameFrom[index];
        }
        reversed.reverse();
        return this._compressPath(reversed);
    },

    _compressPath(path) {
        if (!path || path.length <= 2) return path || null;
        const output = [path[0]];
        let lastDx = path[1].x - path[0].x;
        let lastDz = path[1].z - path[0].z;

        for (let i = 2; i < path.length; i++) {
            const prev = path[i - 1];
            const current = path[i];
            const dx = current.x - prev.x;
            const dz = current.z - prev.z;
            if (dx !== lastDx || dz !== lastDz) {
                output.push(prev);
                lastDx = dx;
                lastDz = dz;
            }
        }

        output.push(path[path.length - 1]);
        return output;
    },

    _heuristic(x1, z1, x2, z2) {
        return Math.abs(x1 - x2) + Math.abs(z1 - z2);
    },

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
    },

    _targetTile(objective) {
        const tile = objective && objective.targetTile ? objective.targetTile : null;
        if (!tile) return null;
        return {
            x: Number(tile.x) || 0,
            y: Number(tile.y) || 0,
            z: Number(tile.z) || 0,
        };
    },

    _heroTile(context) {
        const ctx = context || {};
        const hero = ctx.hero || null;
        const position = hero && hero.position;
        if (!position || typeof position.x !== 'number' || typeof position.z !== 'number') return null;

        if (typeof ctx.positionUsesEditorUnits === 'function' && ctx.positionUsesEditorUnits(position)) {
            return {
                x: Math.floor(position.x),
                y: Math.floor(position.y || 0),
                z: Math.floor(position.z),
            };
        }

        const tileSize = ctx.tileSize ||
            (Common && Common.Datas && Common.Datas.Systems && Common.Datas.Systems.SQUARE_SIZE) ||
            (Data && Data.Systems && Data.Systems.SQUARE_SIZE) ||
            16;
        return {
            x: Math.floor(position.x / tileSize),
            y: Math.floor((position.y || 0) / tileSize),
            z: Math.floor(position.z / tileSize),
        };
    },

    _clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    },
};

IP2Live.QuestPathfinder = IP2LiveQuestPathfinder;
window.IP2LiveQuestPathfinder = IP2LiveQuestPathfinder;

console.log('[IP2Live] quest_pathfinder.js asset loaded.');
