/**
 * IP2Live - Neural Life Force Game Over overlay.
 * APEX has reached the infiltrator; acknowledgement returns to the title
 * screen without deleting the player's existing save slots.
 */

class IP2LiveNeuralLifeForceGameOverScreen extends Scene.Base {
    constructor(options) {
        super(true);
        this.options = options || {};
        this.tick = 0;
        this._finished = false;
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
        if (upper === 'ENTER' || upper === 'SPACE' || upper === 'SPACEBAR' || upper === 'ESCAPE') this._finish();
        return true;
    }

    onMouseDown() {
        this._finish();
        return true;
    }

    _finish() {
        if (this._finished) return;
        this._finished = true;
        if (IP2Live.QuestManager && typeof IP2Live.QuestManager.hideQuest === 'function') {
            IP2Live.QuestManager.hideQuest();
        }
        if (Manager && Manager.Stack) {
            if (typeof Manager.Stack.popAll === 'function') Manager.Stack.popAll();
            if (typeof Manager.Stack.pushTitleScreen === 'function') Manager.Stack.pushTitleScreen(true);
            Manager.Stack.requestPaintHUD = true;
        }
        if (IP2Live.MusicManager && IP2Live.MusicManager.ZONE && typeof IP2Live.MusicManager.play === 'function') {
            IP2Live.MusicManager.play(IP2Live.MusicManager.ZONE.MAIN_MENU);
        }
    }

    draw3D() {
        if (Manager && Manager.GL && Manager.GL.renderer) Manager.GL.renderer.clear();
    }

    // Helper: Chamfered cyberpunk polygon path
    _drawCyberPlate(ctx, x, y, w, h, cut) {
        const c = cut || 12;
        ctx.beginPath();
        ctx.moveTo(x + c, y);
        ctx.lineTo(x + w - c, y);
        ctx.lineTo(x + w, y + c);
        ctx.lineTo(x + w, y + h - c);
        ctx.lineTo(x + w - c, y + h);
        ctx.lineTo(x + c, y + h);
        ctx.lineTo(x, y + h - c);
        ctx.lineTo(x, y + c);
        ctx.closePath();
    }

    // Helper: Pulsing APEX Breach Failure Crest
    _drawApexFailureInsignia(ctx, cx, cy, radius, sX, sY, pulse) {
        ctx.save();
        ctx.shadowColor = 'rgba(255, 0, 60, 0.8)';
        ctx.shadowBlur = (12 + pulse * 8) * sX;

        // Rotating outer warning ring
        const rot = this.tick * 0.02;
        ctx.strokeStyle = '#FF003C';
        ctx.lineWidth = 1.6 * sX;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 1.15, rot, rot + Math.PI * 1.4);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 1.15, rot + Math.PI, rot + Math.PI * 2.4);
        ctx.stroke();

        // Hex hazard core
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 6;
            const px = cx + radius * 0.85 * Math.cos(angle);
            const py = cy + radius * 0.85 * Math.sin(angle);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(35, 2, 12, 0.95)';
        ctx.fill();
        ctx.strokeStyle = '#FF244E';
        ctx.lineWidth = 2 * sX;
        ctx.stroke();

        // Central skull / exclamation glyph
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#FFE5EC';
        ctx.font = '900 ' + Math.round(18 * sY) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', cx, cy - 1 * sY);

        ctx.restore();
    }

    drawHUD() {
        const ctx = Common && Common.Platform ? Common.Platform.ctx : null;
        if (!ctx || !ctx.canvas) return;

        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const sX = cW / 1280;
        const sY = cH / 720;
        const pulse = 0.5 + 0.5 * Math.sin(this.tick * 0.14);
        const glitchFlicker = Math.sin(this.tick * 0.8) > 0.92;

        const panelW = Math.min(880 * sX, cW - 60 * sX);
        const panelH = Math.min(480 * sY, cH - 80 * sY);
        const x = (cW - panelW) * 0.5;
        const y = (cH - panelH) * 0.5;

        ctx.save();

        // 1. Digital Noise & Screen Dimmer Backdrop
        const bgGradient = ctx.createRadialGradient(cW / 2, cH / 2, 50 * sX, cW / 2, cH / 2, cW * 0.7);
        bgGradient.addColorStop(0, 'rgba(25, 0, 10, 0.88)');
        bgGradient.addColorStop(1, 'rgba(4, 0, 4, 0.98)');
        ctx.fillStyle = bgGradient;
        ctx.fillRect(0, 0, cW, cH);

        // Animated scanlines
        ctx.fillStyle = 'rgba(255, 0, 60, 0.06)';
        const scanOffset = (this.tick * 1.5 * sY) % (10 * sY);
        for (let yy = scanOffset; yy < cH; yy += 8 * sY) {
            ctx.fillRect(0, yy, cW, 1.2 * sY);
        }

        // 2. Main Cyber Chassis Plate
        this._drawCyberPlate(ctx, x, y, panelW, panelH, 16 * sX);
        const chassisGrad = ctx.createLinearGradient(x, y, x + panelW, y + panelH);
        chassisGrad.addColorStop(0, 'rgba(30, 2, 12, 0.97)');
        chassisGrad.addColorStop(0.5, 'rgba(15, 1, 8, 0.99)');
        chassisGrad.addColorStop(1, 'rgba(22, 2, 10, 0.97)');
        ctx.fillStyle = chassisGrad;
        ctx.fill();

        // Glowing Double Neon Border
        ctx.strokeStyle = '#FF003C';
        ctx.lineWidth = 2.5 * sX;
        ctx.shadowColor = '#FF003C';
        ctx.shadowBlur = (16 + pulse * 12) * sX;
        ctx.stroke();

        ctx.shadowBlur = 0;
        this._drawCyberPlate(ctx, x + 4 * sX, y + 4 * sY, panelW - 8 * sX, panelH - 8 * sY, 14 * sX);
        ctx.strokeStyle = 'rgba(255, 60, 100, 0.35)';
        ctx.lineWidth = 1 * sX;
        ctx.stroke();

        // 3. Header Banner Plate
        const headerH = 64 * sY;
        ctx.save();
        this._drawCyberPlate(ctx, x, y, panelW, headerH, 16 * sX);
        ctx.clip();

        const bannerGrad = ctx.createLinearGradient(x, y, x + panelW, y);
        bannerGrad.addColorStop(0, '#7A001C');
        bannerGrad.addColorStop(0.5, '#D40032');
        bannerGrad.addColorStop(1, '#7A001C');
        ctx.fillStyle = bannerGrad;
        ctx.fillRect(x, y, panelW, headerH);

        // Header warning hazard stripes
        ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
        for (let stripeX = x - 40 * sX; stripeX < x + panelW + 40 * sX; stripeX += 28 * sX) {
            ctx.beginPath();
            ctx.moveTo(stripeX, y);
            ctx.lineTo(stripeX + 14 * sX, y);
            ctx.lineTo(stripeX - 6 * sX, y + headerH);
            ctx.lineTo(stripeX - 20 * sX, y + headerH);
            ctx.closePath();
            ctx.fill();
        }

        // Subheader Tag
        ctx.font = '900 ' + Math.round(9 * sY) + 'px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFE600';
        ctx.fillText('SYS::ALERT // APEX LOCKDOWN PROTOCOL ACTIVATED', x + panelW * 0.5, y + 18 * sY);

        // Main Title (With subtle glitch offset)
        const glitchX = glitchFlicker ? (Math.random() - 0.5) * 4 * sX : 0;
        ctx.font = '900 ' + Math.round(22 * sY) + 'px "Courier New", monospace';
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
        ctx.shadowBlur = 6 * sX;
        ctx.fillText('NEURAL LINK TERMINATED', x + panelW * 0.5 + glitchX, y + 46 * sY);
        ctx.restore();

        // 4. Central Insignia
        const insigniaY = y + headerH + 52 * sY;
        this._drawApexFailureInsignia(ctx, x + panelW * 0.5, insigniaY, 28 * sY, sX, sY, pulse);

        // 5. Narrative & Diagnostic Telemetry Block
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';

        // Critical Status Line
        ctx.font = 'bold ' + Math.round(14 * sY) + 'px "Courier New", monospace';
        ctx.fillStyle = '#FF758F';
        ctx.fillText('CRITICAL OVERRIDE // APEX COUNTERMEASURE COMPLETE', x + panelW * 0.5, y + headerH + 104 * sY);

        // Primary Reason
        ctx.font = 'bold ' + Math.round(18 * sY) + 'px monospace';
        ctx.fillStyle = '#FFE5EC';
        ctx.fillText('LIFE FORCE COLLAPSED (000 / 100)', x + panelW * 0.5, y + headerH + 134 * sY);

        // Narrative details inside a cyber text console
        const consoleW = panelW - 90 * sX;
        const consoleH = 74 * sY;
        const consoleX = x + 45 * sX;
        const consoleY = y + headerH + 152 * sY;

        this._drawCyberPlate(ctx, consoleX, consoleY, consoleW, consoleH, 8 * sX);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 0, 60, 0.3)';
        ctx.lineWidth = 1 * sX;
        ctx.stroke();

        ctx.font = Math.round(13 * sY) + 'px monospace';
        ctx.fillStyle = '#E8D5DA';
        ctx.fillText('The active subnet route collapsed before infiltrator extraction.', x + panelW * 0.5, consoleY + 28 * sY);
        ctx.fillText('APEX has intercepted the terminal signature and secured the node.', x + panelW * 0.5, consoleY + 52 * sY);

        // 6. Action Button / Return Plate
        const btnW = Math.min(480 * sX, panelW - 80 * sX);
        const btnH = 46 * sY;
        const btnX = x + (panelW - btnW) * 0.5;
        const btnY = y + panelH - 68 * sY;

        this._drawCyberPlate(ctx, btnX, btnY, btnW, btnH, 8 * sX);
        const btnGrad = ctx.createLinearGradient(btnX, btnY, btnX + btnW, btnY);
        btnGrad.addColorStop(0, 'rgba(255, 0, 60, 0.22)');
        btnGrad.addColorStop(0.5, 'rgba(255, 0, 60, 0.45)');
        btnGrad.addColorStop(1, 'rgba(255, 0, 60, 0.22)');
        ctx.fillStyle = btnGrad;
        ctx.fill();

        ctx.strokeStyle = pulse > 0.5 ? '#FF003C' : '#FF6685';
        ctx.lineWidth = 1.6 * sX;
        ctx.stroke();

        // Button Tech Chevrons & Label
        ctx.font = '900 ' + Math.round(12 * sY) + 'px "Courier New", monospace';
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowColor = 'rgba(255, 0, 60, 0.8)';
        ctx.shadowBlur = 6 * sX;
        ctx.fillText('>> PRESS ENTER / CLICK TO RETURN TO TITLE <<', x + panelW * 0.5, btnY + 28 * sY);

        // Bottom Corner Tech Metadata
        ctx.shadowBlur = 0;
        ctx.font = 'bold ' + Math.round(8 * sY) + 'px monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
        ctx.fillText('SYS::IP2LIVE // TERMINAL REBOOT READY', x + 20 * sX, y + panelH - 12 * sY);

        ctx.textAlign = 'right';
        ctx.fillText('STATUS: DECK OFFLINE', x + panelW - 20 * sX, y + panelH - 12 * sY);

        ctx.restore();
    }

    static show(options) {
        const scene = new IP2LiveNeuralLifeForceGameOverScreen(options || {});
        if (Manager && Manager.Stack && typeof Manager.Stack.push === 'function') {
            Manager.Stack.push(scene);
            Manager.Stack.requestPaintHUD = true;
            return true;
        }
        return false;
    }
}

IP2Live.NeuralLifeForceGameOver = IP2LiveNeuralLifeForceGameOverScreen;
window.IP2LiveNeuralLifeForceGameOver = IP2LiveNeuralLifeForceGameOverScreen;
console.log('[IP2Live] neural-life-force-game-over.js loaded.');