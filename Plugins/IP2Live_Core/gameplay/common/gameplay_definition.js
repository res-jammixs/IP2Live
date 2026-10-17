/** Shared registration entry point, available before gameplay modules load. */
(function () {
    const definitions = {
        pending: new Map(), sources: Object.create(null), loadingSource: null,
        // A content revision marker, not a security checksum.
        hash(text) {
            let value = 2166136261;
            for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
            return (value >>> 0).toString(16).padStart(8, '0');
        },
        register(definition) {
            if (!definition || typeof definition !== 'object') throw new TypeError('A gameplay definition is required.');
            const id = String(definition.gameplayId || definition.id || '');
            if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(id) || ['constructor', 'prototype', '__proto__'].includes(id)) {
                throw new TypeError('Use a stable gameplayId containing letters, numbers, dots, underscores or hyphens.');
            }
            const next = Object.assign({}, this.pending.get(id), definition, { gameplayId: id });
            if (this.loadingSource) next.source = Object.assign({}, this.loadingSource);
            if (IP2Live.GameManager) return IP2Live.GameManager.registerGameplay(next);
            this.pending.set(id, next);
            return id;
        },
        beginModule(path, code) {
            this.loadingSource = { path, revision: 'source-' + this.hash(code) };
            return new Map(Object.keys(IP2Live).map(key => [key, IP2Live[key]]));
        },
        endModule(before) {
            const source = this.loadingSource;
            if (source) Object.keys(IP2Live).forEach(key => {
                if (!before.has(key) || before.get(key) !== IP2Live[key]) this.sources[key] = Object.assign({}, source);
            });
            this.loadingSource = null;
        },
        flush() {
            if (!IP2Live.GameManager) return;
            for (const [id, definition] of this.pending) {
                IP2Live.GameManager.registerGameplay(definition); this.pending.delete(id);
            }
        },
    };
    IP2Live.GameplayDefinitions = definitions;
    IP2Live.registerGameplay = definition => definitions.register(definition);
}());
