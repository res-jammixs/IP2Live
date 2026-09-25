/** Pixelated CRT power-off / power-on bridge for menu navigation. */
class IP2LiveMenuTransitionScene extends Scene.Base {
    constructor(options) {
        super(false);
        this.options = options;
        this.source = Manager.Stack.top;
        this.target = null;
        this.phase = 'out';
        this.startedAt = Date.now();
        this.elapsed = 0;
        this.duration = 520;
        this.loading = false;
        this.actionStarted = false;
        this.blackPainted = false;
        this.moving = false;
        this.frame = document.createElement('canvas');
        const canvas = Common.Platform.ctx.canvas;
        this.frame.width = canvas.width;
        this.frame.height = canvas.height;
        this.frame.getContext('2d').drawImage(canvas, 0, 0);
    }

    update() {
        this.elapsed = Math.max(0, Date.now() - this.startedAt);
        if (this.phase === 'out' && this.elapsed >= this.duration) {
            this.phase = 'hold';
            this.startedAt = Date.now();
            this.elapsed = 0;
        } else if (this.phase === 'hold') {
            if (this.blackPainted && !this.actionStarted) this._startAction();
            if (!this.options.closeOnly && this.target && !this.target.loading && this.elapsed >= 90) {
                this._revealTarget();
            } else if (!this.options.closeOnly && this.elapsed > 15000) {
                this._recover(new Error('Menu did not become ready in time.'));
            }
        } else if (this.phase === 'in') {
            if (this.target && typeof this.target.update === 'function') this.target.update();
            if (this.elapsed >= this.duration && Manager.Stack.top === this) Manager.Stack.pop();
        }
        Manager.Stack.requestPaintHUD = true;
    }

    _startAction() {
        this.actionStarted = true;
        if (this.options.back) {
            this.target = this.options.parent;
            if (!this.target) this._recover(new Error('No parent menu to return to.'));
            return;
        }
        Promise.resolve().then(() => this.options.action()).then(target => {
            if (IP2Live.MenuTransition.active !== this || this.phase !== 'hold') {
                if (target && typeof target.close === 'function') target.close();
                return;
            }
            if (!this.options.closeOnly) {
                if (!target) throw new Error('Menu factory returned no scene.');
                this.target = target;
            }
        }).catch(error => this._recover(error));
    }

    _revealTarget() {
        if (Manager.Stack.top !== this) return;
        this.moving = true;
        Manager.Stack.pop();
        if (this.options.back) Manager.Stack.pop();
        else Manager.Stack.push(this.target);
        Manager.Stack.push(this);
        this.moving = false;
        this.phase = 'in';
        this.duration = 460;
        this.startedAt = Date.now();
        this.elapsed = 0;
    }

    _recover(error) {
        if (IP2Live.MenuTransition.active !== this) return;
        console.error('[IP2Live] Menu transition failed:', error);
        if (this.target && this.target !== this.source && typeof this.target.close === 'function') this.target.close();
        this.target = this.source;
        this.phase = 'in';
        this.startedAt = Date.now();
        this.elapsed = 0;
        if (Data.Systems.soundImpossible) Data.Systems.soundImpossible.playSound();
    }

    close() {
        if (!this.moving && IP2Live.MenuTransition.active === this) IP2Live.MenuTransition.active = null;
    }

    // The overlay owns all input until the full image has returned.
    onKeyPressed() { return true; }
    onKeyReleased() { return true; }
    onKeyPressedRepeat() { return false; }
    onKeyPressedAndRepeat() { return false; }
    onMouseDown() { return true; }
    onMouseUp() { return true; }
    onMouseMove() { return true; }

    draw3D() {
        if (Manager.GL && Manager.GL.renderer) Manager.GL.renderer.clear();
    }

    drawHUD() {
        const ctx = Common.Platform.ctx;
        const w = ctx.canvas.width, h = ctx.canvas.height;
        const progress = Math.min(1, this.elapsed / this.duration);
        if (this.phase === 'in' && this.target) {
            ctx.save();
            this.target.drawHUD();
            ctx.restore();
            if (this.frame.width !== w || this.frame.height !== h) {
                this.frame.width = w; this.frame.height = h;
            }
            const frameContext = this.frame.getContext('2d');
            frameContext.clearRect(0, 0, w, h);
            frameContext.drawImage(ctx.canvas, 0, 0);
        }
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
        if (this.phase === 'hold') {
            this.blackPainted = true;
            ctx.restore();
            return;
        }
        // Reverse the same geometry for power-on: a dot, then a line, then a picture.
        const close = this.phase === 'out' ? progress : 1 - progress;
        // Accelerate each movement into its endpoint instead of slowing to a stop.
        // Reverse the curve as well as the geometry so power-on also ends with a snap.
        const easeToSnap = value => this.phase === 'out'
            ? value * value * value
            : 1 - Math.pow(1 - value, 3);
        const squeeze = Math.min(1, close / 0.76);
        const smooth = easeToSnap(squeeze);
        const apertureH = h * (1 - smooth);
        // The picture closes vertically at full width; only the light contracts sideways.
        const apertureW = w;
        const x = (w - apertureW) / 2, y = (h - apertureH) / 2;
        ctx.imageSmoothingEnabled = false;
        const strength = Math.sin(close * Math.PI);
        const pixel = Math.max(2, Math.round(w / 320));
        ctx.save(); ctx.beginPath(); ctx.rect(x, y, apertureW, apertureH); ctx.clip();
        // Close the visible aperture over the original picture without scaling its contents.
        if (apertureH > 0) ctx.drawImage(this.frame, 0, 0);
        for (let i = 0; i < 80; i++) {
            const seed = (i * 73 + Math.floor(this.elapsed / 34) * 37) % 997;
            const px = x + (seed / 997) * apertureW;
            const py = y + ((i * 41 % 101) / 101) * apertureH;
            ctx.globalAlpha = strength * (0.12 + (i % 4) * 0.08);
            ctx.fillStyle = i % 5 === 0 ? '#9ABDAE' : i % 3 === 0 ? '#BED9CD' : '#E6EEE9';
            ctx.fillRect(Math.floor(px / pixel) * pixel, Math.floor(py / pixel) * pixel, pixel * (2 + i % 7), pixel);
        }
        ctx.restore();
        if (close > 0.35 && close < 1) {
            const lineProgress = Math.max(0, Math.min(1, (close - 0.65) / 0.35));
            const lineEase = easeToSnap(lineProgress);
            const halfWidth = w * (1 - lineEase) / 2;
            const halfHeight = pixel * (0.5 + 5 * Math.sin(lineProgress * Math.PI)) * Math.sqrt(1 - lineProgress);
            ctx.globalAlpha = strength * 0.75;
            ctx.fillStyle = '#EAF4EE';
            ctx.shadowColor = '#A3CDB6'; ctx.shadowBlur = 12 * w / 1280;
            // A tapered CRT flare forms a slim diamond, then disappears at the center.
            ctx.beginPath();
            ctx.moveTo(w / 2 - halfWidth, h / 2);
            ctx.lineTo(w / 2, h / 2 - halfHeight);
            ctx.lineTo(w / 2 + halfWidth, h / 2);
            ctx.lineTo(w / 2, h / 2 + halfHeight);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }
}

IP2Live.MenuTransition = {
    active: null,
    _start(options) {
        if (this.active || !Manager.Stack.top) return false;
        const transition = new IP2LiveMenuTransitionScene(options);
        this.active = transition;
        Manager.Stack.push(transition);
        Manager.Stack.requestPaintHUD = true;
        return true;
    },
    open(factory) { return this._start({ action: factory }); },
    back() {
        if (!Manager.Stack.subTop) return false;
        return this._start({ back: true, parent: Manager.Stack.subTop });
    },
    close(action) { return this._start({ action, closeOnly: true }); },
    quit(reason) {
        return this.close(async () => {
            const manager = IP2Live.GameManager;
            try {
                if (manager && typeof manager.prepareForShutdown === 'function') await manager.prepareForShutdown(reason);
            } catch (error) {
                console.warn('[IP2Live] Shutdown checkpoint failed:', error);
            }
            Common.Platform.quit();
        });
    },
};
