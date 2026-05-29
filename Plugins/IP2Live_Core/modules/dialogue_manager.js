/**
 * IP2Live - Dialogue Manager Module
 *
 * Central place for story/dialogue content and the rules that decide when
 * dialogue starts on a map or when interacting with a map item.
 *
 * Loaded by code.js via fetch() + new Function(). Do not use import/export.
 */

class IP2LiveDialogueManager {
    constructor() {
        this.VERSION = 'dialogue-manager-20260527-02';

        this.EVENT = {
            MAP_ENTER: 'map:enter',
            TUTORIAL_START: 'tutorial:start',
            ITEM_INTERACT: 'item:interact',
        };

        this.dialogues = this._createDialogueRegistry();
        this.tutorialSteps = this._createTutorialSteps();
        this.mapTriggers = this._createMapTriggers();
        this.itemTriggers = this._createItemTriggers();
        this.dialogueLibrary = [];
        this._manualTimingQueue = [];

        this._active = null;
        this._booted = false;
        this._keyRef = null;
        this._clickRef = null;
        this._seenTriggers = {};
        this._pendingTriggers = {};
        this._lastMapEnterKey = null;
        this._sceneSerial = 0;
        this._questPanelSuppressed = false;
        this._queuedStarts = [];

        this.boot();
    }

    _createDialogueRegistry() {
        return {
            'tutorial.intro': {
                title: 'MISSION BRIEF',
                speaker: 'SYSTEM',
                slides: [
                    [
                        'SYSTEM BOOT... NEURAL DECK ONLINE.',
                        'Welcome, Infiltrator.',
                    ],
                    [
                        'The world you knew is gone.',
                        'Neo-Gaia is a fractured civilisation where megacorporations',
                        'known as the APEX ELITES seized control of every critical ',
                        'facility left standing after the collapse.',
                    ],
                    [
                        'Power grids. Water treatment. Medical networks. All locked,',
                        'behind encrypted subnets accessible only to those with the',
                        'proper clearance codes. They have the access. We have nothing.',
                    ],
                    [
                        'You were an engineer before the walls went up. You still know ',
                        'the systems. You still know the protocols. And you are the',
                        'only one left who can break through.',
                    ],
                    [
                        'Your mission:',
                        'Infiltrate the APEX facilities. Crack their subnet protocols.',
                        'Dismantle their infrastructure stage by stage until the world ',
                        'belongs to the people once more.',
                    ],
                    [
                        'This is not just survival.',
                        'This is reclamation.',
                        'The facility is waiting, Infiltrator.',
                        "Let's get you combat-ready.",
                    ],
                ],
            },

            'tutorial.outro': {
                title: 'MISSION BRIEF',
                speaker: 'SYSTEM',
                slides: [
                    [
                        'DESTINATION REACHED.',
                        '',
                        'You are now ready to navigate your way through the world.',
                        'Initiating phase shift to the next world...',
                    ],
                ],
            },

            // Example item dialogues. Call:
            // IP2Live.DialogueManager.triggerItem(3, 'terminal_alpha');
            'stage1.terminal_alpha': {
                title: 'FIELD TERMINAL',
                speaker: 'APEX NODE',
                slides: [
                    [
                        'ACCESS DENIED.',
                        '',
                        'The terminal is locked behind a subnet challenge.',
                    ],
                    [
                        'Find the assigned network tools before attempting this breach.',
                    ],
                ],
            },

            'stage1.junction_box_alpha': {
                title: 'JUNCTION BOX',
                speaker: 'SYSTEM',
                slides: [
                    [
                        'A live junction box hums behind the panel.',
                        '',
                        'Routing data appears unstable. This may become an interaction point later.',
                    ],
                ],
            },
        };
    }

    _createTutorialSteps() {
        return [
            {
                phase: 1,
                header: 'STEP 01  //  NAVIGATION',
                body: 'Press  [ W ]  or  [ S ]  to move Forward and Backward.',
                hint: 'Try it now -- the sensor array is tracking your input...',
                keys: ['KeyW', 'KeyS'],
            },
            {
                phase: 2,
                header: 'STEP 02  //  NAVIGATION',
                body: 'Perfect!   Now press  [ A ]  or  [ D ]  to strafe Left and Right.',
                hint: 'Try it now...',
                keys: ['KeyA', 'KeyD'],
            },
            {
                phase: 3,
                header: 'STEP 03  //  CAMERA CONTROL',
                body: "Great! You're getting the hang of it.   Press the  [ ARROW KEYS ]  to rotate the camera.",
                hint: 'Try it now...',
                keys: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
            },
            {
                phase: 4,
                header: 'STEP 04  //  QUEST AREA',
                body: 'The upper-left panel is your QUEST AREA. These objectives are necessary to unlock the next stage.',
                hint: '[ PRESS ENTER TO ACKNOWLEDGE ]',
                keys: ['Enter', 'Space', 'KeyZ'],
            },
        ];
    }

    _createMapTriggers() {
        return {
            1: [
                {
                    id: 'tutorial_intro_start',
                    event: this.EVENT.TUTORIAL_START,
                    action: 'tutorial.activate',
                    once: false,
                },
            ],

            // Add future automatic map entry dialogues here:
            // 3: [
            //     {
            //         id: 'stage1_arrival',
            //         event: this.EVENT.MAP_ENTER,
            //         dialogueId: 'stage1.arrival',
            //         once: true,
            //         delay: 300,
            //     },
            // ],
            3: [],
        };
    }

    _createItemTriggers() {
        return {
            3: {
                terminal_alpha: {
                    id: 'stage1_terminal_alpha',
                    event: this.EVENT.ITEM_INTERACT,
                    dialogueId: 'stage1.terminal_alpha',
                    once: false,
                },
                junction_box_alpha: {
                    id: 'stage1_junction_box_alpha',
                    event: this.EVENT.ITEM_INTERACT,
                    dialogueId: 'stage1.junction_box_alpha',
                    once: false,
                },
            },
        };
    }

    boot() {
        if (this._booted) return;
        this._booted = true;
        this._attachInputListeners();
        this._injectMapHooks();
    }

    registerDialogue(id, definition) {
        if (!id || !definition) return false;
        this.dialogues[id] = definition;
        return true;
    }

    registerMapTrigger(mapId, trigger) {
        const key = Number(mapId);
        if (!key || !trigger) return false;
        if (!this.mapTriggers[key]) this.mapTriggers[key] = [];
        this.mapTriggers[key].push(Object.assign({ event: this.EVENT.MAP_ENTER }, trigger));
        return true;
    }

    registerItemTrigger(mapId, itemId, trigger) {
        const key = Number(mapId);
        if (!key || !itemId || !trigger) return false;
        if (!this.itemTriggers[key]) this.itemTriggers[key] = {};
        this.itemTriggers[key][itemId] = Object.assign({ event: this.EVENT.ITEM_INTERACT }, trigger);
        return true;
    }

    loadDialogueLibrary(library) {
        const entries = Array.isArray(library) ? library : (library && library.dialogues) || [];
        if (!Array.isArray(entries)) return false;

        this.dialogueLibrary = [];
        for (let i = 0; i < entries.length; i++) {
            const normalized = this._normalizeDialogueDefinition(entries[i]);
            if (!normalized) continue;
            this.dialogues[normalized.id] = normalized;
            this.dialogueLibrary.push(normalized.id);
        }
        return this.dialogueLibrary.length > 0;
    }

    startById(dialogueId, context) {
        return this.start(dialogueId, context || {});
    }

    enqueue(dialogueId, timing, scope) {
        if (!dialogueId || !this.getDialogue(dialogueId)) return false;
        this._manualTimingQueue.push({
            dialogueId,
            timing: timing || (this.getDialogue(dialogueId).timing || 'during'),
            scope: scope || {},
        });
        return true;
    }

    queueByTiming(scope, timing) {
        const resolvedTiming = timing || 'during';
        const resolvedScope = scope || {};
        const output = [];
        const seen = {};

        for (let i = 0; i < this.dialogueLibrary.length; i++) {
            const id = this.dialogueLibrary[i];
            const dialogue = this.getDialogue(id);
            if (!dialogue || !dialogue.timing) continue;
            if (dialogue.timing !== resolvedTiming) continue;
            if (!this._matchesScope(dialogue.bindings || {}, resolvedScope)) continue;
            if (!seen[id]) {
                output.push(id);
                seen[id] = true;
            }
        }

        const remaining = [];
        for (let i = 0; i < this._manualTimingQueue.length; i++) {
            const entry = this._manualTimingQueue[i];
            if (entry.timing === resolvedTiming && this._matchesScope(entry.scope || {}, resolvedScope)) {
                if (!seen[entry.dialogueId]) {
                    output.push(entry.dialogueId);
                    seen[entry.dialogueId] = true;
                }
            } else {
                remaining.push(entry);
            }
        }
        this._manualTimingQueue = remaining;

        return output;
    }

    getDialogue(id) {
        return this.dialogues[id] || null;
    }

    getSlides(id) {
        const dialogue = this.getDialogue(id);
        return dialogue ? this._cloneSlides(dialogue.slides) : [];
    }

    getTutorialSteps() {
        return this.tutorialSteps.map((step) => {
            const copy = Object.assign({}, step);
            copy.keys = Array.isArray(step.keys) ? step.keys.slice() : [];
            return copy;
        });
    }

    getMapId(scene) {
        const current = scene || (Scene && Scene.Map && Scene.Map.current) || null;
        const mapId = current && (
            current.id ||
            current.mapID ||
            (current.currentMap && current.currentMap.id) ||
            (Core.Game.current && Core.Game.current.currentMapID)
        );
        return Number(mapId) || 0;
    }

    triggerMapEnter(scene, context) {
        const mapId = this.getMapId(scene);
        if (!mapId) return false;

        const ctx = Object.assign({}, context || {}, {
            event: this.EVENT.MAP_ENTER,
            mapId,
            scene,
        });
        const sceneKey = this._sceneKey(scene, mapId);

        if (!ctx.force && this._lastMapEnterKey === sceneKey) return false;
        this._lastMapEnterKey = sceneKey;

        return this.triggerMapEvent(mapId, this.EVENT.MAP_ENTER, ctx);
    }

    triggerMapEvent(mapId, eventName, context) {
        const key = Number(mapId);
        const triggers = this.mapTriggers[key] || [];
        let handled = false;

        for (let i = 0; i < triggers.length; i++) {
            const trigger = triggers[i];
            if (trigger.event !== eventName) continue;
            handled = this._runTrigger(trigger, Object.assign({}, context || {}, {
                mapId: key,
                event: eventName,
            })) || handled;
        }

        return handled;
    }

    triggerItem(mapId, itemId, context) {
        let resolvedMapId = Number(mapId);
        let resolvedItemId = itemId;
        let resolvedContext = context || {};

        if (itemId === undefined && typeof mapId === 'string') {
            resolvedItemId = mapId;
            resolvedMapId = this.getMapId();
        }

        if (typeof itemId === 'object' && itemId !== null) {
            resolvedContext = itemId;
            resolvedItemId = mapId;
            resolvedMapId = Number(resolvedContext.mapId) || this.getMapId(resolvedContext.scene);
        }

        if (!resolvedMapId) resolvedMapId = this.getMapId(resolvedContext.scene);
        if (!resolvedMapId || !resolvedItemId) return false;

        const byMap = this.itemTriggers[resolvedMapId] || {};
        const trigger = byMap[resolvedItemId];
        if (!trigger) {
            console.warn('[IP2Live] DialogueManager: no item dialogue for', resolvedMapId, resolvedItemId);
            return false;
        }

        return this._runTrigger(trigger, Object.assign({}, resolvedContext, {
            mapId: resolvedMapId,
            itemId: resolvedItemId,
            event: this.EVENT.ITEM_INTERACT,
        }));
    }

    interactItem(itemId, context) {
        return this.triggerItem(itemId, context || {});
    }

    interactWithItem(itemId, context) {
        return this.interactItem(itemId, context);
    }

    start(dialogueId, context) {
        const ctx = context || {};
        const isTitleActive = typeof IP2Live !== 'undefined' && IP2Live.WorldTitleOverlay && IP2Live.WorldTitleOverlay.isActive();

        if (isTitleActive) {
            return this._queueStart(dialogueId, ctx);
        }

        if (this._active) {
            if (this._active.id === dialogueId) return false;
            return this._queueStart(dialogueId, ctx);
        }

        const dialogue = this.getDialogue(dialogueId);
        if (!dialogue || !dialogue.slides || dialogue.slides.length === 0) {
            console.warn('[IP2Live] DialogueManager: missing dialogue', dialogueId);
            return false;
        }

        if (this._active && this._active.hideQuestPanel) this._setQuestPanelSuppressed(false);

        this._active = {
            id: dialogueId,
            title: dialogue.title || 'TRANSMISSION',
            speaker: dialogue.speaker || 'SYSTEM',
            slides: this._cloneSlides(dialogue.slides),
            slideIndex: 0,
            lockMovement: dialogue.lockMovement !== false,
            allowMovementDuringDialogue: !!(dialogue.allowMovementDuringDialogue || ctx.allowMovementDuringDialogue),
            autoWrapText: dialogue.autoWrapText !== false && ctx.autoWrapText !== false,
            preserveLineBreaks: !!(dialogue.preserveLineBreaks || ctx.preserveLineBreaks),
            hideQuestPanel: dialogue.hideQuestPanel !== false,
            context: ctx,
            onComplete: typeof ctx.onComplete === 'function' ? ctx.onComplete : (dialogue.onComplete || null),
            animTick: 0,
            typeChars: 0,
            typeTimer: 0,
            typeSpeed: dialogue.typeSpeed || 1,
            lastText: '',
        };

        if (this._active.hideQuestPanel) this._setQuestPanelSuppressed(true);
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        if (IP2Live.GameManager && typeof IP2Live.GameManager.emit === 'function') {
            IP2Live.GameManager.emit(IP2Live.GameManager.EVENT.DIALOGUE_STARTED, {
                dialogueId,
                timing: dialogue.timing || ctx.timing || null,
                context: ctx,
            });
        }
        return true;
    }

    stop() {
        if (!this._active) return;
        const done = this._active;
        this._active = null;
        if (done.hideQuestPanel) this._setQuestPanelSuppressed(false);
        if (IP2Live.GameManager && typeof IP2Live.GameManager.emit === 'function') {
            IP2Live.GameManager.emit(IP2Live.GameManager.EVENT.DIALOGUE_FINISHED, {
                dialogueId: done.id,
                timing: done.context && done.context.timing,
                context: done.context || {},
            });
        }
        if (typeof done.onComplete === 'function') {
            try {
                done.onComplete(done.context, this);
            } catch (e) {
                console.warn('[IP2Live] DialogueManager onComplete failed:', e);
            }
        }
        this._startQueuedIfPossible();
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
    }

    advance() {
        if (!this._active) return false;

        const fullText = this._activeFullText();
        if (this._active.typeChars < fullText.length) {
            this._active.typeChars = fullText.length;
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            return true;
        }

        if (this._active.slideIndex < this._active.slides.length - 1) {
            this._active.slideIndex++;
            this._resetTyping();
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            return true;
        }

        this.stop();
        return true;
    }

    isActive() {
        return !!this._active;
    }

    locksMovement() {
        if (!this._active || !this._active.lockMovement) return false;
        if (this._active.allowMovementDuringDialogue) return false;
        if (this._isTutorialControlsTeachingActive()) return false;
        return true;
    }

    _setQuestPanelSuppressed(isSuppressed) {
        this._questPanelSuppressed = !!isSuppressed;
        if (IP2Live.QuestManager && typeof IP2Live.QuestManager.setDialogueSuppressed === 'function') {
            IP2Live.QuestManager.setDialogueSuppressed(this._questPanelSuppressed);
        }
    }

    drawOverlay(ctx) {
        if (!this._active || !ctx) return;

        const active = this._active;
        active.animTick++;

        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const sX = cW / SW;
        const sY = cH / SH;
        const tick = active.animTick;
        const font = IP2Live.Assets && IP2Live.Assets.nebulaLoaded ? 'Nebula-Regular' : 'monospace';
        const pulse = 0.5 + 0.5 * Math.sin(tick * 0.08);
        const blink = Math.floor(tick / 24) % 2 === 0;

        const panelW = cW - 52 * sX;
        const panelH = Math.min(300 * sY, cH * 0.355);
        const panelX = 26 * sX;
        const panelY = cH - panelH - 26 * sY;
        const cut = 32 * sX;
        const headerH = 50 * sY;
        const promptH = 25 * sY;

        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
        ctx.fillRect(0, 0, cW, cH);

        // Main frame
        ctx.beginPath();
        ctx.moveTo(panelX + cut, panelY);
        ctx.lineTo(panelX + panelW, panelY);
        ctx.lineTo(panelX + panelW, panelY + panelH - 22 * sY);
        ctx.lineTo(panelX + panelW - 14 * sX, panelY + panelH);
        ctx.lineTo(panelX, panelY + panelH);
        ctx.lineTo(panelX, panelY + 36 * sY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(3,7,20,0.965)';
        ctx.fill();

        // Body gradient + scanlines
        ctx.save();
        ctx.clip();
        const bodyGrad = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY);
        bodyGrad.addColorStop(0, 'rgba(255,0,60,0.13)');
        bodyGrad.addColorStop(0.18, 'rgba(0,240,255,0.08)');
        bodyGrad.addColorStop(0.72, 'rgba(5,10,28,0.20)');
        bodyGrad.addColorStop(1, 'rgba(255,230,0,0.06)');
        ctx.fillStyle = bodyGrad;
        ctx.fillRect(panelX, panelY, panelW, panelH);
        for (let sy2 = panelY; sy2 < panelY + panelH; sy2 += 4 * sY) {
            ctx.fillStyle = 'rgba(255,255,255,0.025)';
            ctx.fillRect(panelX, sy2, panelW, Math.max(1, 1 * sY));
        }
        const sweepY = panelY + ((tick * 1.35) % panelH);
        ctx.fillStyle = 'rgba(0,240,255,0.05)';
        ctx.fillRect(panelX, sweepY, panelW, 7 * sY);
        ctx.restore();

        ctx.beginPath();
        ctx.moveTo(panelX + cut, panelY);
        ctx.lineTo(panelX + panelW, panelY);
        ctx.lineTo(panelX + panelW, panelY + panelH - 22 * sY);
        ctx.lineTo(panelX + panelW - 14 * sX, panelY + panelH);
        ctx.lineTo(panelX, panelY + panelH);
        ctx.lineTo(panelX, panelY + 36 * sY);
        ctx.closePath();
        ctx.shadowColor = '#00F0FF';
        ctx.shadowBlur = 10 + pulse * 12;
        ctx.strokeStyle = 'rgba(0,240,255,' + (0.62 + pulse * 0.22) + ')';
        ctx.lineWidth = 1.5 * sX;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Header tab
        ctx.beginPath();
        ctx.moveTo(panelX, panelY);
        ctx.lineTo(panelX + Math.min(400 * sX, panelW * 0.36), panelY);
        ctx.lineTo(panelX + Math.min(450 * sX, panelW * 0.42), panelY + headerH);
        ctx.lineTo(panelX, panelY + headerH);
        ctx.closePath();
        const headerGrad = ctx.createLinearGradient(panelX, panelY, panelX + panelW * 0.45, panelY);
        headerGrad.addColorStop(0, 'rgba(255,0,60,0.96)');
        headerGrad.addColorStop(0.68, 'rgba(60,0,28,0.80)');
        headerGrad.addColorStop(1, 'rgba(3,7,20,0.10)');
        ctx.fillStyle = headerGrad;
        ctx.fill();

        const incomingText = '// INCOMING TRANSMISSION //';
        const incomingFont = 'bolder italic ' + Math.round(14 * sX) + 'px monospace';
        ctx.font = incomingFont;
        const incomingTextW = ctx.measureText(incomingText).width;
        const yellowMinX = panelX + 24 * sX + incomingTextW + 26 * sX;
        const yellowX = Math.max(panelX + Math.min(390 * sX, panelW * 0.35), yellowMinX);
        const tagFontPx = Math.round(13 * sX);
        const tagFont = 'bolder italic ' + tagFontPx + 'px monospace';
        const tagText = String(active.title || 'MISSION').toUpperCase();
        ctx.font = tagFont;
        const tagTextW = ctx.measureText(tagText).width;
        const tagPadL = 18 * sX;
        const tagPadR = 40 * sX;
        const yellowTopWDesired = tagPadL + tagTextW + tagPadR;
        const yellowTopW = Math.max(120 * sX, Math.min(yellowTopWDesired, panelX + panelW - 16 * sX - yellowX));
        const yellowBottomW = Math.max(96 * sX, yellowTopW - 36 * sX);
        const yellowBackX = 26 * sX;
        ctx.beginPath();
        ctx.moveTo(yellowX, panelY);
        ctx.lineTo(yellowX + yellowTopW, panelY);
        ctx.lineTo(yellowX + yellowBottomW, panelY + headerH);
        ctx.lineTo(yellowX - yellowBackX, panelY + headerH);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,230,0,0.96)';
        ctx.fill();

        // Header text
        ctx.fillStyle = '#FFFFFF';
        ctx.font = incomingFont;
        ctx.textAlign = 'left';
        ctx.fillText(incomingText, panelX + 24 * sX, panelY + 33 * sY);

        ctx.fillStyle = '#07101C';
        ctx.font = tagFont;
        const tagX = yellowX + tagPadL;
        const tagY = panelY + 33 * sY;
        ctx.fillText(tagText, tagX, tagY);

        ctx.font = Math.round(8.5 * sX) + 'px monospace';
        ctx.fillStyle = 'rgba(0,255,255,0.72)';
        ctx.textAlign = 'right';
        const speakerText = String(active.speaker || 'SYSTEM').toUpperCase();
        ctx.fillText('SIGNAL: ' + speakerText, panelX + panelW - 26 * sX, panelY + 30 * sY);

        // Slide pips
        const totalSlides = Math.max(1, active.slides.length);
        const pipGap = 16 * sX;
        const pipStart = panelX + panelW - 34 * sX - Math.max(0, totalSlides - 1) * pipGap;
        for (let pi = 0; pi < totalSlides; pi++) {
            const isCurrent = pi === active.slideIndex;
            ctx.save();
            ctx.translate(pipStart + pi * pipGap, panelY + headerH + 14 * sY);
            ctx.rotate(Math.PI / 4);
            const ps = (isCurrent ? 5.2 : 3.4) * sX;
            ctx.shadowColor = isCurrent ? '#FFE600' : 'transparent';
            ctx.shadowBlur = isCurrent ? 9 : 0;
            ctx.fillStyle = isCurrent ? '#FFE600' : 'rgba(218,238,255,0.34)';
            ctx.fillRect(-ps, -ps, ps * 2, ps * 2);
            ctx.restore();
        }

        // Info row
        const infoY = panelY + headerH + 25 * sY;
        ctx.fillStyle = blink ? '#00FFFF' : 'rgba(0,255,255,0.42)';
        ctx.shadowColor = '#00FFFF';
        ctx.shadowBlur = blink ? 8 : 2;
        ctx.fillRect(panelX + 25 * sX, infoY - 12 * sY, 5 * sX, 13 * sY);
        ctx.shadowBlur = 0;

        const slideNum = active.slideIndex + 1;
        const sLabel = slideNum < 10 ? '0' + slideNum : '' + slideNum;
        ctx.font = Math.round(8.5 * sX) + 'px monospace';
        ctx.fillStyle = 'rgba(0,255,255,0.68)';
        ctx.textAlign = 'left';
        ctx.fillText('SYS://NEURAL_LINK > ' + tagText.replace(/\s+/g, '_') + ' > SLIDE_' + sLabel, panelX + 39 * sX, infoY);

        ctx.strokeStyle = 'rgba(0,255,255,0.16)';
        ctx.lineWidth = 1 * sX;
        ctx.beginPath();
        ctx.moveTo(panelX + 24 * sX, infoY + 11 * sY);
        ctx.lineTo(panelX + panelW - 24 * sX, infoY + 11 * sY);
        ctx.stroke();

        // Dialogue text
        const slide = active.slides[active.slideIndex] || [];
        const fullText = this._displayTextForSlide(slide, active);
        const displayed = this._typedText(fullText);
        const textX = panelX + 28 * sX;
        const textW = panelW - 56 * sX;
        const textTop = infoY + 43 * sY;
        const promptY = panelY + panelH - promptH - 13 * sY;
        const textBottom = promptY - 18 * sY;
        const lineH = 18 * sY;

        ctx.font = Math.round(24 * sX) + 'px ' + font;
        ctx.fillStyle = '#DAEEFF';
        ctx.textAlign = 'left';
        const lines = this._wrapText(ctx, displayed, textW);
        let ty = textTop;
        for (let li = 0; li < lines.length && ty <= textBottom; li++) {
            if (!lines[li]) {
                ty += 9 * sY;
                continue;
            }
            ctx.fillText(lines[li], textX, ty);
            ty += lineH;
        }

        // Continue prompt
        if (active.typeChars >= fullText.length) {
            const pA = 0.34 + 0.42 * Math.sin(tick * 0.1);
            ctx.beginPath();
            ctx.moveTo(panelX + 28 * sX, promptY);
            ctx.lineTo(panelX + panelW - 28 * sX, promptY);
            ctx.lineTo(panelX + panelW - 38 * sX, promptY + promptH);
            ctx.lineTo(panelX + 38 * sX, promptY + promptH);
            ctx.closePath();
            ctx.fillStyle = 'rgba(0,255,255,' + (0.05 + pA * 0.06) + ')';
            ctx.fill();
            ctx.strokeStyle = 'rgba(0,255,255,' + (0.18 + pA * 0.34) + ')';
            ctx.stroke();
            ctx.font = Math.round(9 * sX) + 'px monospace';
            ctx.fillStyle = 'rgba(0,255,255,' + pA + ')';
            ctx.textAlign = 'center';
            ctx.fillText((blink ? '> ' : '  ') + 'ENTER / CLICK TO CONTINUE' + (blink ? ' <' : '  '), panelX + panelW / 2, promptY + promptH * 0.68);
        }

        // Corner accents
        ctx.strokeStyle = '#FFE600';
        ctx.shadowColor = '#FFE600';
        ctx.shadowBlur = 6;
        ctx.lineWidth = 2 * sX;
        const cr = 14 * sX;
        ctx.beginPath();
        ctx.moveTo(panelX, panelY + cr); ctx.lineTo(panelX, panelY); ctx.lineTo(panelX + cr, panelY);
        ctx.moveTo(panelX + panelW - cr, panelY); ctx.lineTo(panelX + panelW, panelY); ctx.lineTo(panelX + panelW, panelY + cr);
        ctx.moveTo(panelX + panelW, panelY + panelH - cr); ctx.lineTo(panelX + panelW, panelY + panelH); ctx.lineTo(panelX + panelW - cr, panelY + panelH);
        ctx.moveTo(panelX + cr, panelY + panelH); ctx.lineTo(panelX, panelY + panelH); ctx.lineTo(panelX, panelY + panelH - cr);
        ctx.stroke();

        ctx.restore();
    }

    _attachInputListeners() {
        if (typeof document === 'undefined') return;
        this._keyRef = (e) => this._onKey(e);
        this._clickRef = (e) => this._onClick(e);
        document.addEventListener('keydown', this._keyRef, true);
        document.addEventListener('mousedown', this._clickRef, true);
    }

    _injectMapHooks() {
        if (!Scene || !Scene.Map || !Scene.Map.prototype) return;
        if (Scene.Map.prototype._ip2liveDialogueManagerInjected) return;
        Scene.Map.prototype._ip2liveDialogueManagerInjected = true;

        const manager = this;
        const originalUpdate = Scene.Map.prototype.update;
        Scene.Map.prototype.update = function () {
            const isTitleActive = typeof IP2Live !== 'undefined' && IP2Live.WorldTitleOverlay && IP2Live.WorldTitleOverlay.isActive();
            if (manager.locksMovement() || isTitleActive) manager._stripMovementInputs();
            
            originalUpdate.call(this);
            
            if (!isTitleActive) {
                manager._startQueuedIfPossible();
                manager.triggerMapEnter(this);
            }
            
            if ((manager.isActive() || isTitleActive) && Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            if (manager.locksMovement() || isTitleActive) manager._stripMovementInputs();
        };

        const originalDrawHUD = Scene.Map.prototype.drawHUD;
        Scene.Map.prototype.drawHUD = function () {
            originalDrawHUD.call(this);
            manager.drawOverlay(Common.Platform.ctx);
        };
    }

    clearQueuedStarts() {
        this._queuedStarts = [];
        return true;
    }

    resetTransitionState(options) {
        const opts = options || {};
        if (opts.stopActive && this.isActive()) this.stop();
        this.clearQueuedStarts();
        const keys = Object.keys(this._pendingTriggers || {});
        for (let i = 0; i < keys.length; i++) {
            const timer = this._pendingTriggers[keys[i]];
            if (timer) clearTimeout(timer);
        }
        this._pendingTriggers = {};
        this._lastMapEnterKey = null;
        this._setQuestPanelSuppressed(false);
        return true;
    }

    _queueStart(dialogueId, context) {
        if (!dialogueId) return false;
        const ctx = context || {};
        const key = this._startQueueKey(dialogueId, ctx);

        if (this._active && this._startQueueKey(this._active.id, this._active.context || {}) === key) {
            return false;
        }
        for (let i = 0; i < this._queuedStarts.length; i++) {
            if (this._queuedStarts[i].key === key) return false;
        }

        this._queuedStarts.push({ key, dialogueId, context: ctx });
        return true;
    }

    _startQueuedIfPossible() {
        const isTitleActive = typeof IP2Live !== 'undefined' && IP2Live.WorldTitleOverlay && IP2Live.WorldTitleOverlay.isActive();
        if (isTitleActive || this._active || !this._queuedStarts || this._queuedStarts.length === 0) return false;

        const q = this._queuedStarts.shift();
        if (!q) return false;
        return this.start(q.dialogueId, q.context);
    }

    _startQueueKey(dialogueId, context) {
        const ctx = context || {};
        const mapId = Number(ctx.mapId) || this.getMapId(ctx.scene) || 0;
        const trigger = ctx.trigger || '';
        const timing = ctx.timing || '';
        return [dialogueId, mapId, trigger, timing].join(':');
    }

    _onKey(e) {
        if (!this._active) return;

        const code = e.code || e.key;
        if (this.locksMovement() && this._isMovementCode(code)) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        if (['Enter', 'Space', 'KeyZ'].includes(code)) {
            e.preventDefault();
            e.stopPropagation();
            this.advance();
        }
    }

    _onClick(e) {
        if (!this._active) return;
        e.preventDefault();
        e.stopPropagation();
        this.advance();
    }

    _runTrigger(trigger, context) {
        if (!trigger || !this._passesCondition(trigger, context)) return false;

        const key = trigger.onceKey || [
            context.mapId || 'map',
            context.event || 'event',
            context.itemId || '',
            trigger.id || trigger.dialogueId || trigger.action || 'trigger',
        ].join(':');

        if (trigger.once && this._seenTriggers[key]) return false;
        if (this._pendingTriggers[key]) return true;

        const run = () => {
            delete this._pendingTriggers[key];
            if (trigger.once) this._seenTriggers[key] = true;

            if (trigger.action) return this._runAction(trigger.action, context);
            if (trigger.dialogueId) return this.start(trigger.dialogueId, context);
            return false;
        };

        if (trigger.delay && trigger.delay > 0) {
            this._pendingTriggers[key] = setTimeout(run, trigger.delay);
            return true;
        }

        return run();
    }

    _runAction(action, context) {
        if (action === 'tutorial.activate') {
            if (
                IP2Live.GameManager &&
                typeof IP2Live.GameManager.handleTutorialStart === 'function' &&
                IP2Live.GameManager.handleTutorialStart(context || {})
            ) {
                return true;
            }
            if (IP2Live.Tutorial && typeof IP2Live.Tutorial.activate === 'function') {
                IP2Live.Tutorial.activate(context);
                return true;
            }
            console.warn('[IP2Live] DialogueManager: Tutorial is not ready yet.');
            return false;
        }

        if (typeof action === 'function') {
            action(context, this);
            return true;
        }

        console.warn('[IP2Live] DialogueManager: unknown action', action);
        return false;
    }

    _passesCondition(trigger, context) {
        if (!trigger.condition) return true;
        if (typeof trigger.condition === 'function') {
            return !!trigger.condition(context, this);
        }
        if (trigger.condition === 'dialogueClosed') return !this.isActive();
        return true;
    }

    _normalizeDialogueDefinition(entry) {
        if (!entry || typeof entry !== 'object') return null;
        const id = String(entry.id || entry.name || '').trim();
        if (!id) return null;

        return Object.assign({}, entry, {
            id,
            name: entry.name || id,
            title: entry.title || 'TRANSMISSION',
            speaker: entry.speaker || 'SYSTEM',
            timing: entry.timing || null,
            bindings: Object.assign({}, entry.bindings || {}),
            slides: this._cloneSlides(entry.slides || []),
        });
    }

    _matchesScope(bindings, scope) {
        const b = bindings || {};
        const s = scope || {};
        const keys = ['mapId', 'stage', 'level', 'gameplayId', 'nodeId', 'questId', 'objectiveId', 'itemId', 'trigger'];

        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (b[key] === undefined || b[key] === null || b[key] === '') continue;
            if (!this._bindingValueMatches(b[key], s[key], key)) return false;
        }

        return true;
    }

    _bindingValueMatches(expected, actual, key) {
        if (Array.isArray(expected)) {
            for (let i = 0; i < expected.length; i++) {
                if (this._bindingValueMatches(expected[i], actual, key)) return true;
            }
            return false;
        }

        if (actual === undefined || actual === null) return false;
        if (key === 'mapId' || key === 'stage' || key === 'level') {
            return Number(expected) === Number(actual);
        }

        return String(expected) === String(actual);
    }

    _isTutorialControlsTeachingActive() {
        if (typeof IP2Live === 'undefined' || !IP2Live.Tutorial) return false;
        const tutorial = IP2Live.Tutorial;
        if (!tutorial.isActive || !tutorial.PHASE) return false;
        return tutorial.phase === tutorial.PHASE.MOVE_FB ||
            tutorial.phase === tutorial.PHASE.MOVE_LR ||
            tutorial.phase === tutorial.PHASE.CAMERA;
    }

    _typedText(fullText) {
        const active = this._active;
        if (!active) return '';

        if (active.lastText !== fullText) {
            this._resetTyping();
            active.lastText = fullText;
        }

        active.typeTimer++;
        if (active.typeTimer >= active.typeSpeed && active.typeChars < fullText.length) {
            active.typeChars += 2;
            active.typeTimer = 0;
        }

        const revealed = fullText.slice(0, Math.min(active.typeChars, fullText.length));
        if (active.typeChars >= fullText.length) return revealed;

        const chars = '01#$@!?|ABCDEF';
        return revealed + chars[Math.floor(Math.random() * chars.length)];
    }

    _displayTextForSlide(slide, active) {
        const arr = Array.isArray(slide) ? slide : [String(slide || '')];
        const joins = (active && active.preserveLineBreaks) ? '\n' : ' ';
        let text = arr.join(joins);
        if (active && active.autoWrapText && !(active && active.preserveLineBreaks)) {
            text = text.replace(/\s*\n+\s*/g, ' ');
        }
        return text.replace(/\s{2,}/g, ' ').trim();
    }

    _activeFullText() {
        if (!this._active) return '';
        const slide = this._active.slides[this._active.slideIndex] || [];
        return slide.join('\n');
    }

    _resetTyping() {
        if (!this._active) return;
        this._active.typeChars = 0;
        this._active.typeTimer = 0;
        this._active.lastText = '';
    }

    _wrapText(ctx, text, maxW) {
        const output = [];
        const blocks = String(text || '').split('\n');

        for (let bi = 0; bi < blocks.length; bi++) {
            const block = blocks[bi];
            if (!block) {
                output.push('');
                continue;
            }

            const words = block.split(' ');
            let line = '';
            for (let wi = 0; wi < words.length; wi++) {
                const word = words[wi];
                const test = line ? line + ' ' + word : word;
                if (line && ctx.measureText(test).width > maxW) {
                    output.push(line);
                    line = word;
                } else {
                    line = test;
                }
            }
            output.push(line);
        }

        return output;
    }

    _sceneKey(scene, mapId) {
        if (!scene) return mapId + ':unknown';
        if (!scene._ip2liveDialogueSceneId) {
            this._sceneSerial++;
            scene._ip2liveDialogueSceneId = this._sceneSerial;
        }
        return mapId + ':' + scene._ip2liveDialogueSceneId;
    }

    _cloneSlides(slides) {
        return (slides || []).map((slide) => {
            if (Array.isArray(slide)) return slide.slice();
            return [String(slide)];
        });
    }

    _isMovementCode(code) {
        return ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code);
    }

    _isMovementKey(key) {
        if (!key) return false;
        const name = key.name || key.code || key;
        if (this._isMovementCode(name)) return true;

        try {
            const commands = Data.Keyboards.getCommandsGraphics();
            for (let c = 0; c < commands.length; c++) {
                if (commands[c].id >= 1 && commands[c].id <= 4 && commands[c].sc) {
                    for (let s = 0; s < commands[c].sc.length; s++) {
                        if (Data.Keyboards.isKeyEqual(key, commands[c].sc[s])) return true;
                    }
                }
            }
        } catch (e) {}

        return false;
    }

    _stripMovementInputs() {
        if (!Manager || !Manager.Events || !Manager.Events.keysPressed) return;
        for (let i = Manager.Events.keysPressed.length - 1; i >= 0; i--) {
            if (this._isMovementKey(Manager.Events.keysPressed[i])) {
                Manager.Events.keysPressed.splice(i, 1);
            }
        }
    }
}

const DialogueManager = new IP2LiveDialogueManager();
IP2Live.DialogueManager = DialogueManager;
window.IP2LiveDialogueManager = DialogueManager;

console.log('[IP2Live] dialogue_manager.js module loaded.');
