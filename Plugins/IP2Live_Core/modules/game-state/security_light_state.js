/**
 * IP2Live - Security Light Game State
 *
 * Full-screen breach alarm used after five exhausted IP Wires quests on
 * Stage 1 Level 2. The visual warning runs first, then a blocking dialogue
 * returns the player to a freshly reset Stage 1 Level 1.
 */

(function () {
    const STATE_NAME = 'securityLight';
    const LEVEL_ONE_MAP_ID = 3;
    const LEVEL_TWO_MAP_ID = 4;
    const ALERT_DURATION_MS = 2500;
    const DIALOGUE_ID = 'stage1.level2.security.breached';
    const RETURN_DIALOGUE_ID = 'stage1.level1.security.return';

    const SecurityLightState = {
        VERSION: 'security-light-state-20260817-02',
        name: STATE_NAME,
        active: false,
        startedAt: 0,
        mapId: LEVEL_TWO_MAP_ID,
        strikeCount: 0,
        dialogueStarted: false,
        transitionStarted: false,
        previousQuestState: null,
        previousSkipEnabled: null,

        activate(manager, options) {
            const opts = options || {};
            this.active = true;
            this.startedAt = Date.now();
            this.mapId = Number(opts.mapId) || LEVEL_TWO_MAP_ID;
            this.strikeCount = Math.max(0, Number(opts.strikeCount) || 0);
            this.dialogueStarted = false;
            this.transitionStarted = false;
            this._suspendMapUI();
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            return true;
        },

        clear(manager, options) {
            const opts = options || {};
            this.active = false;
            this.startedAt = 0;
            if (!opts.preserveLifecycle) {
                this.dialogueStarted = false;
                this.transitionStarted = false;
            }
            if (!opts.keepUISuspended) this._restoreMapUI();
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            return true;
        },

        update(manager) {
            if (!this.active) return;
            const dm = IP2Live.DialogueManager;
            if (dm && typeof dm._stripMovementInputs === 'function') dm._stripMovementInputs();
            if (this.dialogueStarted) {
                if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
                return;
            }
            const elapsed = Date.now() - this.startedAt;
            if (elapsed < ALERT_DURATION_MS) {
                if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
                return;
            }

            this.dialogueStarted = true;
            this._showBreachDialogue(manager);
        },

        drawHUD(ctx) {
            if (!this.active || !ctx || !ctx.canvas) return;
            const elapsed = Math.max(0, Date.now() - this.startedAt);
            const wave = (Math.sin(elapsed / 72) + 1) * 0.5;
            const hardBlink = Math.floor(elapsed / 180) % 2 === 0 ? 1 : 0.42;
            const alpha = this.dialogueStarted
                ? 0.055 + wave * 0.075 + hardBlink * 0.035
                : 0.22 + wave * 0.28 + hardBlink * 0.16;
            const width = ctx.canvas.width;
            const height = ctx.canvas.height;
            const scale = Math.max(0.65, Math.min(width / 1280, height / 720));
            const titleFont = this._titleFont();
            const uiFont = this._uiFont();
            const techFont = this._techFont();

            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = 'rgba(175, 0, 20, ' + Math.min(0.78, alpha).toFixed(3) + ')';
            ctx.fillRect(0, 0, width, height);

            ctx.strokeStyle = 'rgba(255, 38, 60, ' + (0.7 + wave * 0.3).toFixed(3) + ')';
            ctx.lineWidth = Math.max(8, 16 * scale);
            ctx.strokeRect(8 * scale, 8 * scale, width - 16 * scale, height - 16 * scale);

            this._drawCornerBrackets(ctx, width, height, scale, wave);
            if (this.dialogueStarted) {
                this._drawDialogueAlarmBar(ctx, width, scale, wave, titleFont, uiFont, techFont);
            } else {
                this._drawBreachPanel(ctx, width, height, scale, wave, titleFont, uiFont, techFont);
            }
            ctx.restore();
        },

        _drawBreachPanel(ctx, width, height, scale, wave, titleFont, uiFont, techFont) {
            const panelW = Math.min(width - 90 * scale, 850 * scale);
            const panelH = 274 * scale;
            const panelX = (width - panelW) * 0.5;
            const panelY = (height - panelH) * 0.5;
            const cut = 22 * scale;

            ctx.save();
            ctx.shadowColor = '#FF001F';
            ctx.shadowBlur = (22 + wave * 20) * scale;
            this._panelPath(ctx, panelX, panelY, panelW, panelH, cut);
            ctx.fillStyle = 'rgba(7, 3, 8, 0.91)';
            ctx.fill();
            ctx.strokeStyle = '#FF315F';
            ctx.lineWidth = 3 * scale;
            ctx.stroke();
            ctx.shadowBlur = 0;

            ctx.fillStyle = '#FF1744';
            this._panelPath(ctx, panelX, panelY, panelW, 39 * scale, 10 * scale);
            ctx.fill();
            ctx.fillStyle = '#0B0306';
            ctx.font = 'bold ' + Math.round(12 * scale) + 'px ' + techFont;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText('APEX COUNTERINTRUSION // TRACE LOCK', panelX + 22 * scale, panelY + 20 * scale);
            ctx.textAlign = 'right';
            ctx.fillText('ALERT 05', panelX + panelW - 22 * scale, panelY + 20 * scale);

            const iconX = panelX + 88 * scale;
            const iconY = panelY + 139 * scale;
            ctx.strokeStyle = '#FF315F';
            ctx.lineWidth = 4 * scale;
            ctx.beginPath();
            ctx.arc(iconX, iconY, (38 + wave * 5) * scale, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.75)';
            ctx.lineWidth = 1.5 * scale;
            ctx.beginPath();
            ctx.arc(iconX, iconY, 26 * scale, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = '#FFF4F5';
            ctx.font = 'bold ' + Math.round(46 * scale) + 'px ' + titleFont;
            ctx.textAlign = 'center';
            ctx.fillText('!', iconX, iconY + 2 * scale);

            const textX = panelX + 155 * scale;
            ctx.textAlign = 'left';
            ctx.shadowColor = '#FF001F';
            ctx.shadowBlur = 18 * scale;
            ctx.fillStyle = '#FFF4F5';
            ctx.font = 'bold ' + Math.round(42 * scale) + 'px ' + titleFont;
            ctx.fillText('LOCATION BREACHED', textX, panelY + 104 * scale);
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#FFB7C2';
            ctx.font = 'bold ' + Math.round(17 * scale) + 'px ' + uiFont;
            ctx.fillText('APEX SECURITY HAS DETECTED US', textX, panelY + 144 * scale);

            ctx.fillStyle = 'rgba(255,255,255,0.88)';
            ctx.font = 'bold ' + Math.round(10 * scale) + 'px ' + techFont;
            ctx.fillText('TRACE CONFIDENCE', textX, panelY + 185 * scale);
            const meterX = textX + 145 * scale;
            const meterY = panelY + 176 * scale;
            const meterW = panelX + panelW - 27 * scale - meterX;
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.fillRect(meterX, meterY, meterW, 12 * scale);
            ctx.fillStyle = '#FF1744';
            ctx.fillRect(meterX, meterY, meterW, 12 * scale);

            ctx.fillStyle = '#FF315F';
            ctx.font = 'bold ' + Math.round(11 * scale) + 'px ' + uiFont;
            ctx.fillText('SECURITY STRIKES  ' + String(this.strikeCount).padStart(2, '0') + ' / 05', textX, panelY + 225 * scale);
            ctx.fillStyle = 'rgba(255,255,255,0.68)';
            ctx.font = Math.round(9 * scale) + 'px ' + techFont;
            ctx.fillText('EMERGENCY ROUTE PROTOCOL ARMED', textX, panelY + 247 * scale);
            ctx.restore();
        },

        _drawDialogueAlarmBar(ctx, width, scale, wave, titleFont, uiFont, techFont) {
            const barW = Math.min(width - 78 * scale, 850 * scale);
            const barH = 104 * scale;
            const barX = (width - barW) * 0.5;
            const barY = 25 * scale;

            ctx.save();
            ctx.shadowColor = '#FF001F';
            ctx.shadowBlur = (12 + wave * 13) * scale;
            this._panelPath(ctx, barX, barY, barW, barH, 15 * scale);
            ctx.fillStyle = 'rgba(6, 2, 7, 0.93)';
            ctx.fill();
            ctx.strokeStyle = '#FF315F';
            ctx.lineWidth = 2.5 * scale;
            ctx.stroke();
            ctx.shadowBlur = 0;

            ctx.fillStyle = '#FF1744';
            ctx.fillRect(barX + 13 * scale, barY + 13 * scale, 8 * scale, barH - 26 * scale);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#FFF4F5';
            ctx.font = 'bold ' + Math.round(26 * scale) + 'px ' + titleFont;
            ctx.fillText('LOCATION BREACHED', barX + 42 * scale, barY + 40 * scale);
            ctx.fillStyle = '#FF9EAD';
            ctx.font = 'bold ' + Math.round(12 * scale) + 'px ' + uiFont;
            ctx.fillText('LIVE TRACE // APEX RESPONSE INBOUND', barX + 43 * scale, barY + 72 * scale);

            ctx.textAlign = 'right';
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold ' + Math.round(10 * scale) + 'px ' + techFont;
            ctx.fillText('ALARM ACTIVE', barX + barW - 27 * scale, barY + 34 * scale);
            ctx.fillStyle = wave > 0.5 ? '#FF1744' : '#7A1428';
            ctx.beginPath();
            ctx.arc(barX + barW - 43 * scale, barY + 70 * scale, (7 + wave * 3) * scale, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        },

        _drawCornerBrackets(ctx, width, height, scale, wave) {
            const pad = 28 * scale;
            const length = 48 * scale;
            ctx.save();
            ctx.strokeStyle = 'rgba(255,255,255,' + (0.48 + wave * 0.42).toFixed(3) + ')';
            ctx.lineWidth = 3 * scale;
            const corners = [
                [pad, pad, 1, 1],
                [width - pad, pad, -1, 1],
                [pad, height - pad, 1, -1],
                [width - pad, height - pad, -1, -1],
            ];
            for (let i = 0; i < corners.length; i++) {
                const c = corners[i];
                ctx.beginPath();
                ctx.moveTo(c[0] + c[2] * length, c[1]);
                ctx.lineTo(c[0], c[1]);
                ctx.lineTo(c[0], c[1] + c[3] * length);
                ctx.stroke();
            }
            ctx.restore();
        },

        _panelPath(ctx, x, y, w, h, cut) {
            const c = Math.max(0, Math.min(Number(cut) || 0, Math.min(w, h) * 0.3));
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
        },

        _titleFont() {
            if (IP2Live.Assets && IP2Live.Assets.abnesLoaded) return 'Abnes';
            if (IP2Live.Assets && IP2Live.Assets.astronomousLoaded) return 'Astronomous';
            return 'Arial Black';
        },

        _uiFont() {
            if (IP2Live.Assets && IP2Live.Assets.nebulaLoaded) return 'Nebula-Regular';
            return 'monospace';
        },

        _techFont() {
            if (IP2Live.Assets && IP2Live.Assets.neuropolLoaded) return 'Neuropol';
            return this._uiFont();
        },

        _showBreachDialogue(manager) {
            const dm = IP2Live.DialogueManager;
            const finish = () => this._returnToLevelOne(manager);
            if (!dm || typeof dm.startById !== 'function') {
                finish();
                return false;
            }

            if ((!dm.getDialogue || !dm.getDialogue(DIALOGUE_ID)) && typeof dm.registerDialogue === 'function') {
                dm.registerDialogue(DIALOGUE_ID, {
                    title: 'SECURITY BREACH',
                    speaker: 'SYSTEM',
                    lockMovement: true,
                    hideQuestPanel: true,
                    slides: [[
                        'LOCATION BREACHED. APEX security has detected our position.',
                        '',
                        'Five exhausted wire repairs created a traceable pattern in the facility network.',
                    ], [
                        'We cannot continue from this location.',
                        'Falling back to Stage 1 Level 1. Rebuild the breach route and try again.',
                    ]],
                });
            }

            const started = dm.startById(DIALOGUE_ID, {
                mapId: this.mapId,
                trigger: 'security.breached',
                source: 'SecurityLightState',
                onComplete: finish,
            });
            if (!started) finish();
            return started;
        },

        _returnToLevelOne(manager) {
            if (this.transitionStarted) return false;
            this.transitionStarted = true;

            const gsm = manager || IP2Live.GameStateManager;
            if (gsm) {
                if (typeof gsm.clear === 'function') {
                    gsm.clear(STATE_NAME, { preserveLifecycle: true, mapId: this.mapId });
                } else {
                    this.active = false;
                    this._restoreMapUI();
                }
                if (typeof gsm.resetSecurityState === 'function') gsm.resetSecurityState(LEVEL_TWO_MAP_ID);
                if (typeof gsm.resetDarklightsProgress === 'function') {
                    gsm.resetDarklightsProgress(LEVEL_TWO_MAP_ID, 'security-breach-reset');
                    gsm.resetDarklightsProgress(LEVEL_ONE_MAP_ID, 'security-breach-return');
                }
            }
            if (IP2Live.PatchPanelGameplayManager) IP2Live.PatchPanelGameplayManager._introShown = false;

            const gameManager = IP2Live.GameManager;
            if (gameManager && typeof gameManager.startMapFlow === 'function') {
                return gameManager.startMapFlow(LEVEL_ONE_MAP_ID, null, {
                    mode: 'stage',
                    status: 'Security Breach',
                    detail: 'Returning to Stage 1 Level 1',
                    source: 'SecurityLightState',
                    securityBreachReturn: true,
                    skipStageIntro: true,
                    returnDialogueId: RETURN_DIALOGUE_ID,
                    cleanMapSession: true,
                    discardDialogue: true,
                });
            }
            if (IP2Live.MapManager && typeof IP2Live.MapManager.goTo === 'function') {
                IP2Live.MapManager.goTo(LEVEL_ONE_MAP_ID, { useLoading: true });
                return true;
            }
            return false;
        },

        _suspendMapUI() {
            const qm = IP2Live.QuestManager;
            if (qm) {
                this.previousQuestState = {
                    visible: !!qm.visible,
                    preview: !!qm.preview,
                    guideActive: !!qm.guideActive,
                    allowCompletion: !!qm.allowCompletion,
                };
                if (typeof qm.setQuestState === 'function') {
                    qm.setQuestState({ visible: false, preview: false, guideActive: false, allowCompletion: false });
                } else {
                    qm.visible = false;
                    qm.preview = false;
                    qm.guideActive = false;
                    qm.allowCompletion = false;
                }
            }

            const gm = IP2Live.GameManager;
            if (gm && this.previousSkipEnabled === null) {
                this.previousSkipEnabled = gm.enableQuestSkipButton !== false;
                gm.enableQuestSkipButton = false;
            }
        },

        _restoreMapUI() {
            const gm = IP2Live.GameManager;
            if (gm && this.previousSkipEnabled !== null) gm.enableQuestSkipButton = this.previousSkipEnabled;
            this.previousSkipEnabled = null;

            const qm = IP2Live.QuestManager;
            if (qm && this.previousQuestState) {
                if (typeof qm.setQuestState === 'function') qm.setQuestState(this.previousQuestState);
                else Object.assign(qm, this.previousQuestState);
            }
            this.previousQuestState = null;
        },
    };

    if (IP2Live.GameStateManager && typeof IP2Live.GameStateManager.registerState === 'function') {
        IP2Live.GameStateManager.registerState(STATE_NAME, SecurityLightState);
    }

    IP2Live.SecurityLightState = SecurityLightState;
    window.IP2LiveSecurityLightState = SecurityLightState;
    console.log('[IP2Live] security_light_state.js module loaded.');
}());
