/**
 * IP2Live - World Title Overlay
 * Intercepts map loads, displays a title card, and applies a hacker glitch transition.
 */

class IP2LiveWorldTitle {
    constructor() {
        this._active = false;
        this._mapId = 0;
        this._stageName = '';
        this._levelName = '';
        this._animTick = 0;
        this._glitchOffset = 0;
        this._finishedEmitted = false;
        
        this._creepChars = '0123456789ABCDEF!@#$%^&*()<>{}[]';
        // Generate pseudo-random layout once so it doesn't flicker wildly
        this._creepNodes = [];
    }

    start(mapId) {
        this._active = true;
        this._animTick = 0;
        this._finishedEmitted = false;
        
        let actualMapId = mapId;
        if (!actualMapId && typeof Core !== 'undefined' && Core.Game && Core.Game.current) {
            actualMapId = Core.Game.current.currentMapID;
        }
        this._mapId = actualMapId;
        
        // Resolve names
        const mapManager = IP2Live.MapManager;
        const stage = mapManager ? mapManager.stageFor(actualMapId) : null;
        
        if (stage && stage.tutorial) {
            const playerName = (typeof Core !== 'undefined' && Core.Game && Core.Game.current) 
                ? Core.Game.current.infiltratorName 
                : 'INFILTRATOR';
            this._stageName = 'TUTORIAL STAGE';
            this._levelName = 'WELCOME ' + (playerName ? playerName.toUpperCase() : 'INFILTRATOR');
        } else if (stage) {
            this._stageName = 'STAGE ' + stage.stage;
            this._levelName = 'LEVEL ' + stage.level;
        } else {
            this._stageName = 'UNKNOWN STAGE';
            this._levelName = 'LEVEL X';
        }

        // Prepare the code creep nodes (static layout for creeping code in corners)
        this._creepNodes = [];
        for (let i = 0; i < 40; i++) {
            this._creepNodes.push({
                xRatio: Math.random(),
                yRatio: Math.random(),
                char: this._creepChars[Math.floor(Math.random() * this._creepChars.length)],
                color: Math.random() > 0.8 ? '#00F0FF' : (Math.random() > 0.6 ? '#FF003C' : '#FFFFFF'),
                size: Math.random() * 1.5 + 0.5,
                isLeft: (i % 2 === 0),
                isTop: (Math.floor(i / 2) % 2 === 0)
            });
        }

        if (IP2Live.GameManager && typeof IP2Live.GameManager.handleWorldTitleStarted === 'function') {
            IP2Live.GameManager.handleWorldTitleStarted(actualMapId, {
                source: 'WorldTitleOverlay.start',
                overlay: this,
            });
        }
    }

    isActive() {
        return this._active;
    }

    update() {
        if (!this._active) return;
        this._animTick++;
        
        // Timeline (assumes 60 fps):
        // 0-30: Fade in overlay and text (0.5s)
        // 30-120: Hold text (1.5s)
        // 120-150: Glitch text (0.5s)
        // 150-210: Fade out everything (1s)
        
        if (this._animTick > 210) {
            this._active = false;
            if (!this._finishedEmitted) {
                this._finishedEmitted = true;
                if (IP2Live.GameManager && typeof IP2Live.GameManager.handleWorldTitleFinished === 'function') {
                    IP2Live.GameManager.handleWorldTitleFinished(this._mapId, {
                        source: 'WorldTitleOverlay.update',
                        overlay: this,
                    });
                }
            }
        }
    }

    drawHUD(ctx) {
        if (!this._active) return;
        
        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const sX = cW / Common.ScreenResolution.SCREEN_X;
        const sY = cH / Common.ScreenResolution.SCREEN_Y;
        
        const tick = this._animTick;
        
        ctx.save();
        
        // 1. Calculate overall opacities
        let overlayAlpha = 0.75;
        let textAlpha = 1.0;
        
        if (tick < 30) {
            // Fade in
            overlayAlpha = (tick / 30) * 0.75;
            textAlpha = tick / 30;
        } else if (tick >= 30 && tick < 120) {
            // Hold
        } else if (tick >= 120 && tick < 150) {
            // Glitching
        } else if (tick >= 150) {
            // Fade out
            const fade = 1.0 - ((tick - 150) / 60);
            overlayAlpha = fade * 0.75;
            textAlpha = 0;
            ctx.globalAlpha = Math.max(0, fade);
        }

        // 2. Draw dark background
        ctx.fillStyle = `rgba(1, 2, 6, ${overlayAlpha})`;
        ctx.fillRect(0, 0, cW, cH);
        
        // 3. Draw text (with glitch if applicable)
        if (textAlpha > 0) {
            ctx.globalAlpha = Math.max(0, textAlpha);
            
            let glitchX = 0;
            let glitchY = 0;
            let isGlitching = (tick >= 120 && tick < 150);
            
            if (isGlitching && tick % 3 === 0) {
                glitchX = (Math.random() - 0.5) * 20 * sX;
                glitchY = (Math.random() - 0.5) * 10 * sY;
                
                // RGB split glitch effect
                ctx.fillStyle = 'rgba(255, 0, 60, 0.8)';
                ctx.font = 'bold ' + Math.round(52 * sX) + 'px ' + (IP2Live.Assets.abnesLoaded ? 'Abnes' : 'Arial Black');
                ctx.textAlign = 'center';
                ctx.fillText(this._stageName, cW / 2 + 6 * sX, cH / 2 - 10 * sY);
                
                ctx.fillStyle = 'rgba(0, 240, 255, 0.8)';
                ctx.fillText(this._stageName, cW / 2 - 6 * sX, cH / 2 - 10 * sY);
            }
            
            ctx.fillStyle = '#FFFFFF';
            if (isGlitching && Math.random() > 0.8) ctx.fillStyle = '#FFE600';
            
            ctx.font = 'bold ' + Math.round(52 * sX) + 'px ' + (IP2Live.Assets.abnesLoaded ? 'Abnes' : 'Arial Black');
            ctx.textAlign = 'center';
            ctx.shadowColor = 'rgba(0, 240, 255, 0.5)';
            ctx.shadowBlur = 15 * sX;
            ctx.fillText(this._stageName, cW / 2 + glitchX, cH / 2 - 10 * sY + glitchY);
            
            ctx.font = 'bold ' + Math.round(24 * sX) + 'px ' + (IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace');
            ctx.fillStyle = '#00F0FF';
            ctx.shadowBlur = 0;
            ctx.fillText(this._levelName, cW / 2 + glitchX * 0.5, cH / 2 + 30 * sY + glitchY * 0.5);
            
            // Text slice glitch
            if (isGlitching && tick % 5 === 0) {
                const sliceY = cH / 2 - 40 * sY + Math.random() * 80 * sY;
                const sliceH = 10 * sY + Math.random() * 20 * sY;
                const offX = (Math.random() - 0.5) * 40 * sX;
                ctx.drawImage(ctx.canvas, 0, sliceY, cW, sliceH, offX, sliceY, cW, sliceH);
            }
        }
        
        // 4. Draw creeping codes only in the corners
        if (tick >= 120 && tick < 210) {
            ctx.font = 'bold ' + Math.round(14 * sX) + 'px monospace';
            ctx.textAlign = 'center';
            
            for (let i = 0; i < this._creepNodes.length; i++) {
                const node = this._creepNodes[i];
                
                // Position in corners (0-20% and 80-100%)
                const nx = (node.isLeft ? node.xRatio * 0.2 : 0.8 + node.xRatio * 0.2) * cW;
                const ny = (node.isTop ? node.yRatio * 0.2 : 0.8 + node.yRatio * 0.2) * cH;
                
                ctx.fillStyle = node.color;
                
                // Update characters to flicker
                if (tick % Math.floor(6 + Math.random() * 4) === 0) {
                    node.char = this._creepChars[Math.floor(Math.random() * this._creepChars.length)];
                }
                
                let alpha = 1.0;
                if (tick >= 150) {
                    alpha = Math.max(0, 1.0 - ((tick - 150) / 60));
                }
                ctx.globalAlpha = alpha * 0.6; // Keep them slightly transparent so they don't distract
                ctx.fillText(node.char, nx, ny);
            }
        }
        
        ctx.restore();
    }
}

// Global instance
IP2Live.WorldTitleOverlay = new IP2LiveWorldTitle();

if (!Scene.Map.prototype._ip2liveWorldTitleInjected) {
    Scene.Map.prototype._ip2liveWorldTitleInjected = true;

    // Hook into Scene.Map.prototype.initialize to start the title screen
    const originalMapInit = Scene.Map.prototype.initialize;
    Scene.Map.prototype.initialize = function (mapID) {
        originalMapInit.call(this, mapID);
        const resolvedMapId = Number(mapID) || Number(this && (this.id || this.mapID)) || 0;
        if (this._ip2liveWorldTitleStartedForMapId === resolvedMapId) return;
        this._ip2liveWorldTitleStartedForMapId = resolvedMapId;

        if (IP2Live.GameManager && typeof IP2Live.GameManager.startWorldTitleForMap === 'function') {
            IP2Live.GameManager.startWorldTitleForMap(resolvedMapId, { scene: this });
        } else if (IP2Live.WorldTitleOverlay) {
            IP2Live.WorldTitleOverlay.start(resolvedMapId);
        }
    };

    // Hook into Scene.Map.prototype.drawHUD to render the title screen
    const originalMapDrawHUD = Scene.Map.prototype.drawHUD;
    Scene.Map.prototype.drawHUD = function () {
        originalMapDrawHUD.call(this);
        if (IP2Live.WorldTitleOverlay && IP2Live.WorldTitleOverlay.isActive()) {
            IP2Live.WorldTitleOverlay.drawHUD(Common.Platform.ctx);
        }
    };

    // Hook into Scene.Map.prototype.update to tick the title screen
    const originalMapUpdateWT = Scene.Map.prototype.update;
    Scene.Map.prototype.update = function () {
        if (IP2Live.WorldTitleOverlay && IP2Live.WorldTitleOverlay.isActive()) {
            IP2Live.WorldTitleOverlay.update();
        }
        originalMapUpdateWT.call(this);
    };
}

console.log('[IP2Live] world-title.js loaded.');
