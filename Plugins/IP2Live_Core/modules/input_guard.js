/** Owns transient engine input across scene changes; never edits keyboard bindings. */
(function () {
    'use strict';
    if (IP2Live.InputGuard) return;
    const guard = IP2Live.InputGuard = {
        _direction: null,
        _fallbackBindings: null,
        _stores() {
            return [Common.Inputs, Manager.Events].filter(store => store && store.keysPressed);
        },
        _clear(collection) {
            if (!collection) return;
            if (typeof collection.clear === 'function') collection.clear();
            else if (Array.isArray(collection)) collection.length = 0;
        },
        reset() {
            this._direction = null;
            for (const store of this._stores()) {
                this._clear(store.keysPressed);
                this._clear(store.lockedKeys);
                store.mouseLeftPressed = false;
                store.mouseRightPressed = false;
            }
        },
        bindingsChanged() {
            this._fallbackBindings = null;
            this.reset();
        },
        _bindings() {
            const keyboards = Data.Keyboards;
            if (!keyboards) return [];
            // Read models, not Graphic.Keyboard wrappers. Read current assignments
            // so changing controls does not leave an obsolete movement-key cache.
            if (keyboards.controls) {
                const controls = keyboards.controls;
                const models = [controls.UpHero, controls.DownHero, controls.LeftHero, controls.RightHero].filter(Boolean);
                if (models.length === 4) return models;
            }
            if (keyboards.get) {
                try { return [1, 2, 3, 4].map(id => keyboards.get(id)); } catch (_) {}
            }
            if (!this._fallbackBindings && keyboards.getCommandsGraphics) {
                this._fallbackBindings = keyboards.getCommandsGraphics().map(command => command.kb || command)
                    .filter(command => command.id >= 1 && command.id <= 4);
            }
            return this._fallbackBindings || [];
        },
        isMovementKey(key) {
            const value = key && (key.name || key.code) || key;
            const bindings = this._bindings();
            for (const binding of bindings) {
                if (Data.Keyboards.isKeyEqual && Data.Keyboards.isKeyEqual(value, binding)) return true;
            }
            return !bindings.length && /^(Key[WASD]|[wasd])$/i.test(String(value));
        },
        movementBlocked(scene) {
            if (Manager.Stack.top && Manager.Stack.top !== scene) return true;
            if (scene.loading) return true;
            const dialogue = IP2Live.DialogueManager, title = IP2Live.WorldTitleOverlay;
            return !!((dialogue && dialogue.locksMovement()) || (title && title.isActive()));
        },
        allowKey(scene, key) {
            if (!this.isMovementKey(key)) return true;
            if (this.movementBlocked(scene)) { this._direction = null; return false; }
            const store = this._stores()[0];
            const held = store ? Array.from(store.keysPressed) : [key];
            const directions = held.filter(value => this.isMovementKey(value));
            if (!directions.includes(this._direction)) this._direction = directions[0] || key;
            // Filter dispatch only: held secondary keys must survive until released
            // and take over immediately when the first direction is released.
            return key === this._direction;
        },
        release(event) {
            const names = [event.key, event.code].filter(Boolean).map(value => String(value).toUpperCase());
            for (const store of this._stores()) {
                for (const collection of [store.keysPressed, store.lockedKeys]) {
                    if (!collection) continue;
                    const keys = Array.isArray(collection) ? collection.slice() : Array.from(collection.keys());
                    for (const key of keys) {
                        const value = String(key && (key.name || key.code) || key).toUpperCase();
                        if (!names.includes(value)) continue;
                        if (Array.isArray(collection)) {
                            const index = collection.indexOf(key);
                            if (index >= 0) collection.splice(index, 1);
                        } else collection.delete(key);
                    }
                }
            }
        },
    };
    for (const method of ['push', 'pop', 'popAll', 'replace']) {
        const original = Manager.Stack[method];
        if (typeof original !== 'function') continue;
        Manager.Stack[method] = function (...args) {
            const before = this.top;
            try { return original.apply(this, args); }
            finally { if (this.top !== before) guard.reset(); }
        };
    }
    for (const method of ['onKeyPressed', 'onKeyPressedRepeat', 'onKeyPressedAndRepeat']) {
        const original = Scene.Map.prototype[method];
        if (typeof original !== 'function') continue;
        Scene.Map.prototype[method] = function (key, ...args) {
            if (!guard.allowKey(this, key)) return true;
            return original.call(this, key, ...args);
        };
    }
    if (typeof document !== 'undefined' && document.addEventListener) {
        // Capture release even when a DOM field or an overlay stops propagation.
        document.addEventListener('keyup', event => guard.release(event), true);
        document.addEventListener('visibilitychange', () => { if (document.hidden) guard.reset(); });
    }
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('blur', () => guard.reset());
}());
