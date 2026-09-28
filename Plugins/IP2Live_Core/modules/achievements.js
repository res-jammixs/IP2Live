/** A shared, non-blocking achievement queue anchored below the quest minimap. */
(function () {
    const Achievements = {
        queue: [], active: null, _element: null, _progress: null, _frame: null,

        show(achievement) {
            if (!achievement || !achievement.title) return false;
            if (achievement.id && ((this.active && this.active.id === achievement.id) ||
                this.queue.some(item => item.id === achievement.id))) return false;
            this.queue.push(Object.assign({}, achievement));
            this._schedule();
            return true;
        },

        _schedule() {
            if (this._frame !== null || typeof requestAnimationFrame !== 'function') return;
            this._frame = requestAnimationFrame(() => {
                this._frame = null;
                this.update(Date.now());
                if (this.active || this.queue.length) this._schedule();
            });
        },

        update(now) {
            if (!this.active && this.queue.length) {
                this.active = this.queue.shift();
                this.active.startedAt = now;
                this._create();
            }
            if (!this.active) return;
            const elapsed = now - this.active.startedAt;
            if (elapsed >= 4200) {
                if (this._element) this._element.remove();
                this._element = null;
                this._progress = null;
                this.active = null;
                return; // The next notification starts on the following frame.
            }
            const enter = Math.min(1, elapsed / 450);
            const exit = Math.max(0, Math.min(1, (elapsed - 3650) / 450));
            const visible = (1 - Math.pow(1 - enter, 3)) * (1 - exit * exit * exit);
            if (this._element) {
                const minimap = IP2Live.QuestMinimap && IP2Live.QuestMinimap._container;
                const bounds = minimap && minimap.getBoundingClientRect();
                const anchored = bounds && bounds.height > 0 && bounds.width > 0;
                // Use the rendered minimap size, including canvas scaling and letterboxing.
                this._element.style.width = (anchored ? bounds.width : 220) + 'px';
                this._element.style.maxWidth = anchored ? 'none' : 'calc(100vw - 36px)';
                const top = anchored ? bounds.bottom + 12 : 24;
                const height = this._element.getBoundingClientRect().height || 96;
                this._element.style.top = Math.min(top, Math.max(16, window.innerHeight - height - 16)) + 'px';
                this._element.style.right = (anchored ? window.innerWidth - bounds.right : 18) + 'px';
                this._element.style.transform = 'translateX(' + ((1 - visible) * 120) + '%)';
                this._element.style.opacity = String(Math.min(1, visible * 2));
                if (this._progress) this._progress.style.transform = 'scaleX(' + Math.max(0, 1 - elapsed / 4200) + ')';
            }
        },

        _create() {
            if (typeof document === 'undefined' || !document.body) return;
            const box = document.createElement('div');
            box.setAttribute('role', 'status');
            box.setAttribute('aria-live', 'polite');
            const silhouette = 'polygon(8px 0, calc(100% - 15px) 0, 100% 15px, 100% calc(100% - 7px), calc(100% - 7px) 100%, 35px 100%, 29px calc(100% - 6px), 0 calc(100% - 6px), 0 8px)';
            Object.assign(box.style, {
                position: 'fixed', right: '18px', width: '220px', maxWidth: 'calc(100vw - 36px)',
                boxSizing: 'border-box', padding: '9px 12px 15px 42px', zIndex: '10020', pointerEvents: 'none',
                color: '#fff7db', background: 'linear-gradient(110deg, #efd16b, #776636 35%, #b69a4e 85%, #f4d45a)',
                clipPath: silhouette, fontFamily: 'Oxanium-Medium, sans-serif',
                overflowWrap: 'anywhere', isolation: 'isolate',
                transform: 'translateX(120%)', opacity: '0',
            });
            // Inset the same silhouette to keep a continuous hairline around the cut corners.
            const surface = document.createElement('div');
            surface.setAttribute('aria-hidden', 'true');
            Object.assign(surface.style, {
                position: 'absolute', inset: '1px', zIndex: '-1', clipPath: silhouette,
                background: 'repeating-linear-gradient(0deg, transparent 0px, transparent 3px, #e7bb3506 4px), linear-gradient(110deg, #272515, #10151a 40%, #090e15)',
            });
            box.appendChild(surface);
            const diamond = document.createElement('div');
            diamond.setAttribute('aria-hidden', 'true');
            Object.assign(diamond.style, {
                position: 'absolute', left: '12px', top: '23px', width: '17px', height: '17px',
                boxSizing: 'border-box', border: '1px solid #f4d45a', transform: 'rotate(45deg)',
                background: '#e4c34a12', boxShadow: '0 0 10px #f4d45a20, inset 0 0 8px #f4d45a16',
            });
            const core = document.createElement('div');
            Object.assign(core.style, { position: 'absolute', inset: '5px', background: '#f4d45a' });
            diamond.appendChild(core); box.appendChild(diamond);
            const ticks = document.createElement('div');
            ticks.setAttribute('aria-hidden', 'true');
            Object.assign(ticks.style, {
                position: 'absolute', right: '4px', top: '24px', width: '3px', height: '16px',
                background: 'repeating-linear-gradient(0deg, #dbc36b 0px, #dbc36b 2px, transparent 2px, transparent 6px)',
            });
            box.appendChild(ticks);
            const eyebrow = document.createElement('div');
            eyebrow.textContent = 'ACHIEVEMENT UNLOCKED';
            Object.assign(eyebrow.style, { color: '#f4d45a', fontSize: '8px', lineHeight: '1.3', letterSpacing: '0.65px', marginBottom: '4px' });
            const title = document.createElement('div');
            title.textContent = this.active.title;
            Object.assign(title.style, { fontSize: '12px', lineHeight: '1.3', fontWeight: '600' });
            box.appendChild(eyebrow); box.appendChild(title);
            if (this.active.description) {
                const detail = document.createElement('div');
                detail.textContent = this.active.description;
                Object.assign(detail.style, { fontSize: '10px', color: '#b5b7ad', marginTop: '3px', lineHeight: '1.3' });
                box.appendChild(detail);
            }
            const rail = document.createElement('div');
            rail.setAttribute('aria-hidden', 'true');
            Object.assign(rail.style, {
                position: 'absolute', bottom: '6px', left: '43px', right: '14px', height: '3px',
                background: 'repeating-linear-gradient(115deg, #99834460 0px, #99834460 2px, transparent 2px, transparent 5px)',
            });
            const progress = document.createElement('div');
            Object.assign(progress.style, { height: '1px', marginTop: '1px', background: '#f4d45a', transformOrigin: 'left', boxShadow: '0 0 5px #f4d45860' });
            rail.appendChild(progress); box.appendChild(rail);
            this._progress = progress;
            document.body.appendChild(box);
            this._element = box;
        },
    };
    IP2Live.Achievements = Achievements;
})();
