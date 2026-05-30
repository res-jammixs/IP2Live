/**
 * IP2Live - AR Diagnostic Rewind overlay screen.
 * Shows targeted feedback after failed Stage 3 CIDR quarantine submissions.
 */

class IP2LiveARDiagnosticRewindScreen extends Scene.Base {
    constructor(options) {
        super(true);
        this.options = options || {};
        this.tick = 0;
        this.onComplete = this.options.onComplete || null;
        this.title = this.options.title || 'AR DIAGNOSTIC REWIND';
        this.lines = Array.isArray(this.options.lines) && this.options.lines.length
            ? this.options.lines.slice(0, 6)
            : ['SIMULATION FAILED.', 'No diagnostic data was recovered.'];
    }

    initialize() {
        this.tick = 0;
    }

    async load() {
        this.loading = false;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    update() {
        this.tick++;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    onKeyPressed(key) {
        const value = key && (key.name || key.code || key);
        const upper = String(value || '').toUpperCase();
        if (upper === 'ENTER' || upper === 'SPACE' || upper === 'SPACEBAR' || upper === 'ESCAPE') {
            this._finish();
        }
        return true;
    }

    onMouseDown() {
        this._finish();
        return true;
    }

    _finish() {
        if (this._finished) return;
        this._finished = true;
        if (Manager && Manager.Stack && typeof Manager.Stack.pop === 'function') Manager.Stack.pop();
        if (typeof this.onComplete === 'function') this.onComplete();
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    draw3D() {
        if (Manager && Manager.GL && Manager.GL.renderer) Manager.GL.renderer.clear();
    }

    drawHUD() {
        const ctx = Common && Common.Platform ? Common.Platform.ctx : null;
        if (!ctx || !ctx.canvas) return;

        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const sX = cW / 1280;
        const sY = cH / 720;
        const pulse = 0.5 + 0.5 * Math.sin(this.tick * 0.14);

        ctx.save();
        ctx.fillStyle = 'rgba(0, 8, 14, 0.88)';
        ctx.fillRect(0, 0, cW, cH);

        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = '#63F1FF';
        ctx.lineWidth = Math.max(1, 1.2 * sX);
        const gap = 42 * sX;
        for (let x = -gap + ((this.tick * 1.4) % gap); x < cW + gap; x += gap) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + cH * 0.35, cH);
            ctx.stroke();
        }
        for (let y = 0; y < cH; y += 7 * sY) {
            ctx.fillStyle = 'rgba(120,255,255,0.05)';
            ctx.fillRect(0, y, cW, Math.max(1, sY));
        }
        ctx.globalAlpha = 1;

        const panelW = Math.min(820 * sX, cW - 90 * sX);
        const panelH = Math.min(430 * sY, cH - 100 * sY);
        const x = (cW - panelW) * 0.5;
        const y = (cH - panelH) * 0.5;
        const cut = 22 * sX;

        ctx.beginPath();
        ctx.moveTo(x + cut, y);
        ctx.lineTo(x + panelW, y);
        ctx.lineTo(x + panelW - cut, y + panelH);
        ctx.lineTo(x, y + panelH);
        ctx.lineTo(x, y + cut);
        ctx.closePath();
        ctx.fillStyle = 'rgba(4, 18, 28, 0.96)';
        ctx.fill();
        ctx.shadowColor = '#00F0FF';
        ctx.shadowBlur = 18 + pulse * 10;
        ctx.strokeStyle = '#00F0FF';
        ctx.lineWidth = 2.5 * sX;
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#FF003C';
        ctx.beginPath();
        ctx.moveTo(x, y + 10 * sY);
        ctx.lineTo(x + panelW * 0.55, y);
        ctx.lineTo(x + panelW * 0.50, y + 52 * sY);
        ctx.lineTo(x, y + 62 * sY);
        ctx.closePath();
        ctx.fill();

        const titleFont = IP2Live.Assets && IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace';
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold ' + Math.round(22 * sY) + 'px ' + titleFont;
        ctx.textAlign = 'left';
        ctx.fillText(this.title, x + 28 * sX, y + 39 * sY);

        ctx.font = 'bold ' + Math.round(13 * sY) + 'px monospace';
        ctx.fillStyle = '#FFE600';
        ctx.fillText('SIMULATION FAILED :: TARGETED REWIND ACTIVE', x + 34 * sX, y + 96 * sY);

        ctx.font = Math.round(15 * sY) + 'px monospace';
        ctx.fillStyle = '#D8F7FF';
        const lineX = x + 48 * sX;
        let lineY = y + 142 * sY;
        for (let i = 0; i < this.lines.length; i++) {
            const text = String(this.lines[i] || '');
            ctx.fillStyle = i === 0 ? '#FFFFFF' : '#BDEEFF';
            ctx.fillText(text, lineX, lineY);
            lineY += 34 * sY;
        }

        ctx.fillStyle = 'rgba(0,240,255,0.14)';
        ctx.fillRect(x + 42 * sX, y + panelH - 76 * sY, panelW - 84 * sX, 1.5 * sY);
        ctx.font = 'bold ' + Math.round(11 * sY) + 'px monospace';
        ctx.fillStyle = '#8FF8FF';
        ctx.textAlign = 'center';
        ctx.fillText('PRESS ENTER / CLICK TO RESUME QUARANTINE', x + panelW * 0.5, y + panelH - 36 * sY);
        ctx.restore();
    }

    static show(options) {
        const scene = new IP2LiveARDiagnosticRewindScreen(options || {});
        if (Manager && Manager.Stack && typeof Manager.Stack.push === 'function') {
            Manager.Stack.push(scene);
            if (Manager.Stack) Manager.Stack.requestPaintHUD = true;
            return true;
        }
        if (options && typeof options.onComplete === 'function') options.onComplete();
        return false;
    }
}

IP2Live.ARDiagnosticRewind = IP2LiveARDiagnosticRewindScreen;
window.IP2LiveARDiagnosticRewind = IP2LiveARDiagnosticRewindScreen;

console.log('[IP2Live] ar-diagnostic-rewind.js loaded.');
