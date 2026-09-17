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
        this.VERSION = 'dialogue-manager-20260918-12';

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
                body: 'Press {{key:W|KeyW}} or {{key:S|KeyS}} to move forward or backward — try it now.',
                hint: '',
                keys: ['KeyW', 'KeyS'],
            },
            {
                phase: 2,
                header: 'STEP 02  //  NAVIGATION',
                body: 'Press {{key:A|KeyA}} or {{key:D|KeyD}} to strafe left or right — try it now.',
                hint: '',
                keys: ['KeyA', 'KeyD'],
            },
            {
                phase: 3,
                header: 'STEP 03  //  CAMERA CONTROL',
                body: 'Press {{key:LEFT|ArrowLeft}} or {{key:RIGHT|ArrowRight}} to rotate the camera left or right — try it now.',
                hint: '',
                keys: ['ArrowLeft', 'ArrowRight'],
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
            manualAdvance: !!(dialogue.manualAdvance || ctx.manualAdvance),
            requiredKeyCount: Number(dialogue.requiredKeyCount || ctx.requiredKeyCount) || 0,
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
            highlightStates: {},
            panelHeight: null,
            panelLayoutKey: '',
            focusTicks: 0,
        };

        this._syncActiveSlidePresentation();
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
        this._setMinimapTutorialHighlight(false);
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

    discardActive(dialogueId) {
        if (!this._active) return false;
        if (dialogueId && this._active.id !== dialogueId) return false;
        const discarded = this._active;
        this._active = null;
        if (discarded.hideQuestPanel) this._setQuestPanelSuppressed(false);
        this._setMinimapTutorialHighlight(false);
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        return true;
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
            this._active.focusTicks = 0;
            this._active.focusAdvanceScheduled = false;
            this._resetTyping();
            this._syncActiveSlidePresentation();
            if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            return true;
        }

        this.stop();
        return true;
    }

    isActive() {
        return !!this._active;
    }

    setHighlightState(tokenId, state) {
        if (!this._active || !tokenId) return false;
        const resolvedState = state === 'confirmed' ? 'confirmed' : 'pending';
        this._active.highlightStates[String(tokenId)] = resolvedState;
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        return true;
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

    _syncActiveSlidePresentation() {
        const active = this._active;
        if (!active) {
            this._setMinimapTutorialHighlight(false);
            return;
        }
        const slide = active.slides[active.slideIndex] || [];
        const focusOnly = this._isFocusSlide(slide);
        this._setQuestPanelSuppressed(!!(active.hideQuestPanel && !focusOnly));
        this._setMinimapTutorialHighlight(focusOnly && slide.focus === 'minimap');
    }

    _setMinimapTutorialHighlight(isHighlighted) {
        const minimap = typeof IP2Live !== 'undefined' ? IP2Live.QuestMinimap : null;
        if (minimap && typeof minimap.setTutorialHighlight === 'function') {
            minimap.setTutorialHighlight(!!isHighlighted);
        }
    }

    drawOverlay(ctx) {
        if (!this._active || !ctx) return;

        const active = this._active;
        active.animTick++;

        const activeSlide = active.slides[active.slideIndex] || [];
        if (this._isFocusSlide(activeSlide)) {
            if (this._hudFocusTopLayerAvailable) return;
            this._drawHudFocusSlide(ctx, activeSlide, active);
            return;
        }

        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const sX = cW / SW;
        const sY = cH / SH;
        const tick = active.animTick;
        const font = IP2Live.Assets && IP2Live.Assets.oxaniumMediumLoaded ? 'Oxanium-Medium' : 'sans-serif';
        const terminalFont = IP2Live.Assets && IP2Live.Assets.ethnocentricLoaded ? 'Ethnocentric' : 'monospace';
        const pulse = 0.5 + 0.5 * Math.sin(tick * 0.08);
        const blink = Math.floor(tick / 24) % 2 === 0;

        const panelW = cW - 52 * sX;
        const panelX = 26 * sX;
        const headerH = 50 * sY;
        const bodyTopPadding = 38 * sY;
        const promptH = 25 * sY;
        const textW = panelW - 56 * sX;
        const lineH = 28 * sY;
        const letterSpacing = 1.25 * sX;
        const bodyFont = Math.round(22 * sX) + 'px ' + font;
        const keyFont = Math.round(12 * sX) + 'px ' + font;
        const slide = activeSlide;
        const markup = this._displayMarkupForSlide(slide, active);
        const richTokens = this._parseRichText(markup);
        const fullText = this._visibleTextForTokens(richTokens);
        ctx.font = bodyFont;
        const richLayout = this._layoutRichText(ctx, richTokens, textW, {
            sX,
            sY,
            lineH,
            blankLineH: 12 * sY,
            letterSpacing,
            bodyFont,
            keyFont,
        });
        const targetPanelH = this._targetPanelHeight(richLayout, cH, sY, promptH, bodyTopPadding);
        active.panelLayoutKey = [active.slideIndex, cW, cH, fullText].join('|');
        if (!Number.isFinite(active.panelHeight)) active.panelHeight = targetPanelH;
        else active.panelHeight += (targetPanelH - active.panelHeight) * 0.22;
        if (Math.abs(targetPanelH - active.panelHeight) < 0.5) active.panelHeight = targetPanelH;
        const panelH = active.panelHeight;
        const panelY = cH - panelH - 26 * sY;
        const cut = 32 * sX;

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

        const tagText = this._sentenceCaseText(active.title || 'Mission');
        const headerBottomY = this._drawDialogueHeader(ctx, {
            active,
            panelX,
            panelY,
            panelW,
            headerH,
            sX,
            sY,
            tick,
            pulse,
            blink,
            terminalFont,
            tagText,
        });

        const displayed = this._typedText(fullText);
        const typingDone = active.typeChars >= fullText.length;
        const revealedChars = Math.min(active.typeChars, fullText.length);
        const scramble = typingDone ? '' : displayed.slice(-1);
        const textX = panelX + 28 * sX;
        const textTop = headerBottomY + bodyTopPadding;
        const promptY = panelY + panelH - promptH - 13 * sY;
        this._drawRichLayout(ctx, richLayout, textX, textTop, {
            active,
            revealedChars,
            scramble,
            sX,
            sY,
            tick,
            pulse,
            bodyFont,
            keyFont,
        });

        // Continue prompt
        if (active.manualAdvance || typingDone) {
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
            let promptText = 'Enter / click to continue';
            if (active.manualAdvance) {
                const keyIds = [];
                for (let ti = 0; ti < richTokens.length; ti++) {
                    const token = richTokens[ti];
                    if (token.type === 'key' && token.tokenId && !keyIds.includes(token.tokenId)) keyIds.push(token.tokenId);
                }
                const confirmed = keyIds.filter((id) => active.highlightStates[id] === 'confirmed').length;
                const required = active.requiredKeyCount || keyIds.length;
                promptText = required <= 0
                    ? 'Awaiting required input'
                    : confirmed >= required
                    ? 'Input confirmed'
                    : 'Training input: ' + Math.min(confirmed, required) + '/' + required + ' confirmed';
            }
            ctx.fillText((blink ? '> ' : '  ') + promptText + (blink ? ' <' : '  '), panelX + panelW / 2, promptY + promptH * 0.68);
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

    _isFocusSlide(slide) {
        return !!(slide && !Array.isArray(slide) && typeof slide === 'object' && slide.focusOnly && slide.focus);
    }

    isHudFocusActive() {
        if (!this._active) return false;
        return this._isFocusSlide(this._active.slides[this._active.slideIndex] || []);
    }

    drawHudFocusOverlay(ctx) {
        if (!ctx || !this.isHudFocusActive()) return false;
        const active = this._active;
        const slide = active.slides[active.slideIndex] || [];
        this._drawHudFocusSlide(ctx, slide, active);
        return true;
    }

    _drawHudFocusSlide(ctx, slide, active) {
        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const sX = cW / SW;
        const sY = cH / SH;
        const tick = active.animTick || 0;
        const pulse = 0.5 + 0.5 * Math.sin(tick * 0.13);
        const focusRect = this._hudFocusRect(ctx, slide.focus);
        const label = this._sentenceCaseText(slide.label || this._hudFocusLabel(slide.focus));

        active.focusTicks = Math.max(0, Number(active.focusTicks) || 0) + 1;
        ctx.save();

        // A restrained veil leaves the actual HUD readable while separating it
        // from the game world. The selected component remains fully legible.
        ctx.fillStyle = 'rgba(0, 2, 8, 0.16)';
        ctx.fillRect(0, 0, cW, cH);

        if (focusRect) {
            const x = focusRect.x;
            const y = focusRect.y;
            const w = focusRect.w;
            const h = focusRect.h;
            const cut = Math.max(8 * sX, Math.min(18 * sX, w * 0.06));

            this._traceFocusFrame(ctx, x, y, w, h, cut);
            ctx.fillStyle = 'rgba(255, 230, 0,' + (0.025 + pulse * 0.035) + ')';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 230, 0,' + (0.7 + pulse * 0.28) + ')';
            ctx.lineWidth = (1.8 + pulse * 0.8) * Math.min(sX, sY);
            ctx.shadowColor = '#FFE600';
            ctx.shadowBlur = (12 + pulse * 18) * Math.min(sX, sY);
            ctx.stroke();
            ctx.shadowBlur = 0;

            this._traceFocusFrame(ctx, x - 5 * sX, y - 5 * sY, w + 10 * sX, h + 10 * sY, cut + 3 * sX);
            ctx.strokeStyle = 'rgba(0, 240, 255,' + (0.18 + pulse * 0.2) + ')';
            ctx.lineWidth = Math.max(1, 0.8 * Math.min(sX, sY));
            ctx.stroke();

            // Persona-inspired corner blades make the focus state distinct from
            // a generic rectangular selection.
            const blade = 18 * sX;
            ctx.strokeStyle = '#FFE600';
            ctx.lineWidth = 3 * Math.min(sX, sY);
            ctx.beginPath();
            ctx.moveTo(x - 4 * sX, y + blade); ctx.lineTo(x - 4 * sX, y - 4 * sY); ctx.lineTo(x + blade, y - 4 * sY);
            ctx.moveTo(x + w - blade, y - 4 * sY); ctx.lineTo(x + w + 4 * sX, y - 4 * sY); ctx.lineTo(x + w + 4 * sX, y + blade);
            ctx.moveTo(x + w + 4 * sX, y + h - blade); ctx.lineTo(x + w + 4 * sX, y + h + 4 * sY); ctx.lineTo(x + w - blade, y + h + 4 * sY);
            ctx.moveTo(x + blade, y + h + 4 * sY); ctx.lineTo(x - 4 * sX, y + h + 4 * sY); ctx.lineTo(x - 4 * sX, y + h - blade);
            ctx.stroke();
        }

        const promptW = Math.min(430 * sX, cW - 40 * sX);
        const promptH = 34 * sY;
        const promptX = (cW - promptW) / 2;
        const promptY = cH - promptH - 22 * sY;
        const promptCut = 12 * sX;
        ctx.beginPath();
        ctx.moveTo(promptX + promptCut, promptY);
        ctx.lineTo(promptX + promptW, promptY);
        ctx.lineTo(promptX + promptW - promptCut, promptY + promptH);
        ctx.lineTo(promptX, promptY + promptH);
        ctx.closePath();
        const promptGrad = ctx.createLinearGradient(promptX, promptY, promptX + promptW, promptY);
        promptGrad.addColorStop(0, 'rgba(255,230,0,0.92)');
        promptGrad.addColorStop(0.55, 'rgba(255,189,0,0.84)');
        promptGrad.addColorStop(1, 'rgba(5,12,18,0.9)');
        ctx.fillStyle = promptGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,246,91,0.92)';
        ctx.lineWidth = Math.max(1, 1.2 * Math.min(sX, sY));
        ctx.stroke();
        ctx.font = 'bold ' + Math.round(11 * sX) + 'px ' + (
            IP2Live.Assets && IP2Live.Assets.oxaniumMediumLoaded ? 'Oxanium-Medium' : 'sans-serif'
        );
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#111018';
        ctx.fillText(label, promptX + promptW * 0.43, promptY + promptH / 2);
        ctx.font = Math.round(8 * sX) + 'px monospace';
        ctx.textAlign = 'right';
        ctx.fillStyle = 'rgba(218,250,255,' + (0.58 + pulse * 0.3) + ')';
        ctx.fillText('Inspecting // click to continue', promptX + promptW - 14 * sX, promptY + promptH / 2);
        ctx.restore();

        const duration = Math.max(30, Number(slide.durationFrames) || 105);
        if (active.focusTicks >= duration && !active.focusAdvanceScheduled) {
            active.focusAdvanceScheduled = true;
            const slideIndex = active.slideIndex;
            setTimeout(() => {
                if (!this._active || this._active !== active || active.slideIndex !== slideIndex) return;
                active.focusAdvanceScheduled = false;
                this.advance();
            }, 0);
        }
    }

    _traceFocusFrame(ctx, x, y, w, h, cut) {
        ctx.beginPath();
        ctx.moveTo(x + cut, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + h - cut);
        ctx.lineTo(x + w - cut, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + cut);
        ctx.closePath();
    }

    _hudFocusRect(ctx, focus) {
        const cW = ctx.canvas.width;
        const cH = ctx.canvas.height;
        const SW = Common.ScreenResolution.SCREEN_X;
        const SH = Common.ScreenResolution.SCREEN_Y;
        const sX = cW / SW;
        const sY = cH / SH;
        const qm = IP2Live.QuestManager;
        const questRect = qm && typeof qm._questPanelRect === 'function'
            ? qm._questPanelRect(ctx)
            : { x: 18 * sX, y: 88 * sY, w: Math.min(430 * sX, cW - 36 * sX), h: 126 * sY };

        if (focus === 'health') {
            const healthY = Math.max(8 * sY, questRect.y - 80 * sY);
            return {
                x: questRect.x - 7 * sX,
                y: healthY - 7 * sY,
                w: Math.min(questRect.w, 460 * sX) + 14 * sX,
                h: 70 * sY + 14 * sY,
            };
        }
        if (focus === 'streak') {
            const healthY = Math.max(8 * sY, questRect.y - 80 * sY);
            const healthW = Math.min(questRect.w, 460 * sX);
            const streakW = Math.min(64 * sX, healthW * 0.18);
            return {
                x: questRect.x + healthW - streakW - 7 * sX,
                y: healthY - 7 * sY,
                w: streakW + 14 * sX,
                h: 70 * sY + 14 * sY,
            };
        }
        if (focus === 'quest') {
            return {
                x: questRect.x - 7 * sX,
                y: questRect.y - 7 * sY,
                w: questRect.w + 14 * sX,
                h: questRect.h + 14 * sY,
            };
        }
        if (focus === 'distance') {
            return {
                x: questRect.x - 6 * sX,
                y: questRect.y + questRect.h + 2 * sY,
                w: Math.min(340, questRect.w) + 12 * sX,
                h: 72 + 12 * sY,
            };
        }
        return null;
    }

    _hudFocusLabel(focus) {
        const labels = {
            health: 'Health bar',
            streak: 'Streak and life force',
            quest: 'Quest area',
            minimap: 'Quest minimap',
            distance: 'Distance tab',
        };
        return labels[focus] || 'HUD guide';
    }

    _drawDialogueHeader(ctx, options) {
        const o = options;
        const active = o.active;
        const panelX = o.panelX;
        const panelY = o.panelY;
        const panelW = o.panelW;
        const headerH = o.headerH;
        const sX = o.sX;
        const sY = o.sY;
        const terminalFont = o.terminalFont;
        const incomingText = 'Incoming transmission';
        const incomingW = Math.min(Math.max(350 * sX, panelW * 0.31), panelW * 0.42);
        const incomingCut = 34 * sX;
        const titleX = panelX + incomingW - 30 * sX;

        ctx.save();

        // Dark extrusions give both plates a raised, offset silhouette.
        ctx.beginPath();
        ctx.moveTo(panelX + 7 * sX, panelY + 7 * sY);
        ctx.lineTo(panelX + incomingW + 7 * sX, panelY + 7 * sY);
        ctx.lineTo(panelX + incomingW - incomingCut + 7 * sX, panelY + headerH + 7 * sY);
        ctx.lineTo(panelX + 7 * sX, panelY + headerH + 7 * sY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,0.72)';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(panelX, panelY);
        ctx.lineTo(panelX + incomingW, panelY);
        ctx.lineTo(panelX + incomingW - incomingCut, panelY + headerH);
        ctx.lineTo(panelX, panelY + headerH);
        ctx.closePath();
        const incomingGradient = ctx.createLinearGradient(panelX, panelY, panelX + incomingW, panelY + headerH);
        incomingGradient.addColorStop(0, '#FF164D');
        incomingGradient.addColorStop(0.42, '#C90042');
        incomingGradient.addColorStop(1, '#47001F');
        ctx.fillStyle = incomingGradient;
        ctx.shadowColor = 'rgba(255,0,60,0.55)';
        ctx.shadowBlur = 12 * sX;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.save();
        ctx.clip();
        for (let hx = panelX - headerH; hx < panelX + incomingW + headerH; hx += 14 * sX) {
            ctx.strokeStyle = 'rgba(255,255,255,0.075)';
            ctx.lineWidth = Math.max(1, 2 * sX);
            ctx.beginPath();
            ctx.moveTo(hx, panelY + headerH);
            ctx.lineTo(hx + 38 * sX, panelY);
            ctx.stroke();
        }
        for (let hy = panelY + 5 * sY; hy < panelY + headerH; hy += 5 * sY) {
            ctx.fillStyle = 'rgba(8,0,18,0.08)';
            ctx.fillRect(panelX, hy, incomingW, Math.max(1, sY));
        }
        ctx.restore();

        ctx.strokeStyle = 'rgba(255,255,255,0.48)';
        ctx.lineWidth = Math.max(1, 1.2 * sX);
        ctx.beginPath();
        ctx.moveTo(panelX + 2 * sX, panelY + 2 * sY);
        ctx.lineTo(panelX + incomingW - 3 * sX, panelY + 2 * sY);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(22,0,14,0.72)';
        ctx.beginPath();
        ctx.moveTo(panelX + 2 * sX, panelY + headerH - 2 * sY);
        ctx.lineTo(panelX + incomingW - incomingCut - 2 * sX, panelY + headerH - 2 * sY);
        ctx.stroke();

        ctx.font = Math.round(11 * sX) + 'px ' + terminalFont;
        const titleTextW = ctx.measureText(o.tagText).width;
        const titleMaxRight = panelX + panelW - 235 * sX;
        const titleW = Math.max(150 * sX, Math.min(titleTextW + 64 * sX, titleMaxRight - titleX));
        const titleCut = 26 * sX;

        ctx.beginPath();
        ctx.moveTo(titleX + 7 * sX, panelY + 8 * sY);
        ctx.lineTo(titleX + titleW + 7 * sX, panelY + 8 * sY);
        ctx.lineTo(titleX + titleW - titleCut + 7 * sX, panelY + headerH + 8 * sY);
        ctx.lineTo(titleX - titleCut + 7 * sX, panelY + headerH + 8 * sY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,0.78)';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(titleX, panelY);
        ctx.lineTo(titleX + titleW, panelY);
        ctx.lineTo(titleX + titleW - titleCut, panelY + headerH);
        ctx.lineTo(titleX - titleCut, panelY + headerH);
        ctx.closePath();
        const titleGradient = ctx.createLinearGradient(titleX, panelY, titleX, panelY + headerH);
        titleGradient.addColorStop(0, '#FFF21A');
        titleGradient.addColorStop(0.58, '#FFD900');
        titleGradient.addColorStop(1, '#D89300');
        ctx.fillStyle = titleGradient;
        ctx.shadowColor = 'rgba(255,230,0,0.42)';
        ctx.shadowBlur = 10 * sX;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.save();
        ctx.clip();
        const stripeStart = titleX + Math.max(titleW - 70 * sX, titleW * 0.58);
        for (let hx = stripeStart; hx < titleX + titleW + 40 * sX; hx += 12 * sX) {
            ctx.strokeStyle = 'rgba(25,13,0,0.14)';
            ctx.lineWidth = 5 * sX;
            ctx.beginPath();
            ctx.moveTo(hx, panelY + headerH);
            ctx.lineTo(hx + 30 * sX, panelY);
            ctx.stroke();
        }
        ctx.restore();

        ctx.strokeStyle = 'rgba(255,255,255,0.78)';
        ctx.lineWidth = Math.max(1, 1.2 * sX);
        ctx.beginPath();
        ctx.moveTo(titleX + 2 * sX, panelY + 2 * sY);
        ctx.lineTo(titleX + titleW - 3 * sX, panelY + 2 * sY);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(82,42,0,0.72)';
        ctx.beginPath();
        ctx.moveTo(titleX - titleCut + 2 * sX, panelY + headerH - 2 * sY);
        ctx.lineTo(titleX + titleW - titleCut - 2 * sX, panelY + headerH - 2 * sY);
        ctx.stroke();

        const slashX = panelX + 22 * sX;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 3 * sX;
        for (let si = 0; si < 3; si++) {
            ctx.beginPath();
            ctx.moveTo(slashX + si * 8 * sX, panelY + 31 * sY);
            ctx.lineTo(slashX + 8 * sX + si * 8 * sX, panelY + 18 * sY);
            ctx.stroke();
        }

        const incomingTextX = panelX + 58 * sX;
        const incomingMaxW = Math.max(70 * sX, incomingW - 105 * sX);
        const incomingFontPx = this._fitDialogueFont(ctx, incomingText, incomingMaxW, 11 * sX, 7 * sX, terminalFont);
        ctx.font = Math.round(incomingFontPx) + 'px ' + terminalFont;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.shadowColor = 'rgba(255,255,255,0.35)';
        ctx.shadowBlur = 4 * sX;
        ctx.fillText(incomingText, incomingTextX, panelY + 32 * sY);
        ctx.shadowBlur = 0;

        const titleFontPx = this._fitDialogueFont(ctx, o.tagText, Math.max(40 * sX, titleW - 54 * sX), 11 * sX, 7 * sX, terminalFont);
        ctx.font = Math.round(titleFontPx) + 'px ' + terminalFont;
        ctx.fillStyle = '#170E00';
        ctx.textAlign = 'left';
        ctx.fillText(o.tagText, titleX + 22 * sX, panelY + 32 * sY);

        // Slide-count diamonds now occupy the clean upper-right header space.
        const totalSlides = Math.max(1, active.slides.length);
        const pipGap = 15 * sX;
        const pipRight = panelX + panelW - 28 * sX;
        const pipStart = pipRight - Math.max(0, totalSlides - 1) * pipGap;
        const pipY = panelY + headerH / 2;
        for (let pi = 0; pi < totalSlides; pi++) {
            const isCurrent = pi === active.slideIndex;
            ctx.save();
            ctx.translate(pipStart + pi * pipGap, pipY);
            ctx.rotate(Math.PI / 4);
            const ps = (isCurrent ? 4.8 : 3.1) * sX;
            ctx.shadowColor = isCurrent ? '#FFE600' : 'transparent';
            ctx.shadowBlur = isCurrent ? 9 * sX : 0;
            ctx.fillStyle = isCurrent ? '#FFE600' : 'rgba(218,238,255,0.30)';
            ctx.fillRect(-ps, -ps, ps * 2, ps * 2);
            ctx.restore();
        }

        ctx.restore();
        return panelY + headerH;
    }

    _fitDialogueFont(ctx, text, maxWidth, preferredPx, minimumPx, family) {
        let size = preferredPx;
        while (size > minimumPx) {
            ctx.font = Math.round(size) + 'px ' + family;
            if (ctx.measureText(text).width <= maxWidth) break;
            size -= 0.5;
        }
        return Math.max(minimumPx, size);
    }

    _truncateDialogueText(ctx, text, maxWidth) {
        const value = String(text || '');
        if (ctx.measureText(value).width <= maxWidth) return value;
        const suffix = '...';
        let output = value;
        while (output.length > 1 && ctx.measureText(output + suffix).width > maxWidth) {
            output = output.slice(0, -1);
        }
        return output + suffix;
    }

    _traceChamferedRect(ctx, x, y, w, h, cut) {
        const c = Math.max(0, Math.min(cut, w / 3, h / 2));
        ctx.beginPath();
        ctx.moveTo(x + c, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w - c, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x + c * 0.35, y + h * 0.52);
        ctx.closePath();
    }

    _drawRichLayout(ctx, layout, x, y, options) {
        const o = options || {};
        const active = o.active;
        const reveal = Number(o.revealedChars) || 0;
        const sX = Number(o.sX) || 1;
        const sY = Number(o.sY) || 1;
        const letterSpacing = layout.letterSpacing || 0;
        let baselineY = y;
        let revealCursor = { x, y };

        for (let li = 0; li < layout.lines.length; li++) {
            const line = layout.lines[li];
            let runX = x;
            if (!line.runs.length) {
                baselineY += line.height;
                continue;
            }

            for (let ri = 0; ri < line.runs.length; ri++) {
                const run = line.runs[ri];
                if (reveal > run.start) {
                    if (run.type === 'key') {
                        this._drawDialogueKeycap(ctx, run, runX, baselineY, o);
                        revealCursor = { x: runX + run.width, y: baselineY };
                    } else {
                        const count = Math.max(0, Math.min(run.text.length, reveal - run.start));
                        const visibleText = run.text.slice(0, count);
                        if (visibleText) {
                            ctx.font = o.bodyFont;
                            const visibleW = this._measureTrackedText(ctx, visibleText, letterSpacing);
                            if (run.type === 'highlight') {
                                const padX = layout.highlightPadX;
                                this._drawDialogueHighlight(ctx, runX, baselineY, visibleW + padX * 2, visibleText, padX, o);
                                revealCursor = { x: runX + padX + visibleW, y: baselineY };
                            } else {
                                ctx.fillStyle = '#DAEEFF';
                                ctx.textAlign = 'left';
                                this._fillTrackedText(ctx, visibleText, runX, baselineY, letterSpacing);
                                revealCursor = { x: runX + visibleW, y: baselineY };
                            }
                        }
                    }
                }
                runX += run.width;
            }
            baselineY += line.height;
        }

        if (o.scramble) {
            ctx.font = o.bodyFont;
            ctx.fillStyle = '#FFE600';
            ctx.textAlign = 'left';
            ctx.fillText(o.scramble, revealCursor.x + 2 * sX, revealCursor.y);
        }
    }

    _drawDialogueHighlight(ctx, x, baselineY, width, text, padX, options) {
        const sX = options.sX;
        const sY = options.sY;
        const height = 27 * sY;
        const top = baselineY - 21 * sY;
        const cut = Math.min(6 * sX, width * 0.18);

        ctx.save();
        this._traceChamferedRect(ctx, x, top, width, height, cut);
        const gradient = ctx.createLinearGradient(x, top, x + width, top + height);
        gradient.addColorStop(0, 'rgba(255,230,0,0.24)');
        gradient.addColorStop(0.55, 'rgba(0,240,255,0.13)');
        gradient.addColorStop(1, 'rgba(255,230,0,0.09)');
        ctx.fillStyle = gradient;
        ctx.shadowColor = 'rgba(255,230,0,0.30)';
        ctx.shadowBlur = 6 * sX;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,230,0,0.58)';
        ctx.lineWidth = Math.max(1, sX);
        ctx.stroke();

        ctx.save();
        this._traceChamferedRect(ctx, x, top, width, height, cut);
        ctx.clip();
        for (let hx = x - height; hx < x + width + height; hx += 16 * sX) {
            ctx.strokeStyle = 'rgba(255,255,255,0.045)';
            ctx.beginPath();
            ctx.moveTo(hx, top + height);
            ctx.lineTo(hx + 24 * sX, top);
            ctx.stroke();
        }
        ctx.restore();

        ctx.font = options.bodyFont;
        ctx.fillStyle = '#FFF8BD';
        ctx.textAlign = 'left';
        this._fillTrackedText(ctx, text, x + padX, baselineY, 1.25 * sX);
        ctx.restore();
    }

    _drawDialogueKeycap(ctx, run, x, baselineY, options) {
        const sX = options.sX;
        const sY = options.sY;
        const active = options.active;
        const confirmed = active && active.highlightStates[run.tokenId] === 'confirmed';
        const pulse = 0.5 + 0.5 * Math.sin((options.tick || 0) * 0.12);
        const height = 25 * sY;
        const top = baselineY - 21 * sY;
        const cut = Math.min(6 * sX, run.width * 0.18);

        ctx.save();
        this._traceChamferedRect(ctx, x + 3 * sX, top + 4 * sY, run.width, height, cut);
        ctx.fillStyle = 'rgba(0,0,0,0.78)';
        ctx.fill();

        this._traceChamferedRect(ctx, x, top, run.width, height, cut);
        const gradient = ctx.createLinearGradient(x, top, x, top + height);
        if (confirmed) {
            gradient.addColorStop(0, '#7FFFFF');
            gradient.addColorStop(1, '#00C7D8');
        } else {
            gradient.addColorStop(0, 'rgba(255,230,0,' + (0.25 + pulse * 0.18) + ')');
            gradient.addColorStop(1, 'rgba(5,17,27,0.96)');
        }
        ctx.fillStyle = gradient;
        ctx.shadowColor = confirmed ? '#00FFFF' : '#FFE600';
        ctx.shadowBlur = (confirmed ? 9 : 5 + pulse * 6) * sX;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = confirmed ? '#C8FFFF' : 'rgba(255,230,0,' + (0.68 + pulse * 0.25) + ')';
        ctx.lineWidth = Math.max(1, 1.4 * sX);
        ctx.stroke();

        ctx.font = options.keyFont;
        ctx.fillStyle = confirmed ? '#03131B' : '#FFF4A3';
        ctx.textAlign = 'center';
        ctx.fillText(run.text, x + run.width / 2, baselineY - 3 * sY);
        if (confirmed) {
            ctx.fillStyle = '#FFE600';
            ctx.fillRect(x + run.width - 6 * sX, top + 2 * sY, 4 * sX, 4 * sY);
        }
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
        if (opts.stopActive && this.isActive()) {
            if (opts.discardActive && typeof this.discardActive === 'function') this.discardActive();
            else this.stop();
        }
        this.clearQueuedStarts();
        const keys = Object.keys(this._pendingTriggers || {});
        for (let i = 0; i < keys.length; i++) {
            const timer = this._pendingTriggers[keys[i]];
            if (timer) clearTimeout(timer);
        }
        this._pendingTriggers = {};
        this._lastMapEnterKey = null;
        this._setQuestPanelSuppressed(false);
        this._setMinimapTutorialHighlight(false);
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
            if (this._active.manualAdvance) return;
            e.preventDefault();
            e.stopPropagation();
            this.advance();
        }
    }

    _onClick(e) {
        if (!this._active) return;
        if (this._active.manualAdvance) return;
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
        const markup = this._displayMarkupForSlide(slide, active);
        return this._visibleTextForTokens(this._parseRichText(markup));
    }

    _displayMarkupForSlide(slide, active) {
        const arr = this._slideLines(slide);
        const joins = (active && active.preserveLineBreaks) ? '\n' : ' ';
        let text = arr.join(joins);
        if (active && active.autoWrapText && !(active && active.preserveLineBreaks)) {
            text = text.replace(/\s*\n+\s*/g, ' ');
        }
        return text.replace(/[ \t]{2,}/g, ' ').trim();
    }

    _slideLines(slide) {
        if (Array.isArray(slide)) return slide;
        if (slide && typeof slide === 'object' && Array.isArray(slide.lines)) return slide.lines;
        return [String(slide || '')];
    }

    _parseRichText(markup) {
        // Authoring syntax is deliberately string-based so it works in both
        // dialogues.json and dynamically registered gameplay dialogue:
        //   {{highlight:a long, freely wrapping important passage}}
        //   {{key:W|KeyW}}
        const source = this._expandClassRangePlaceholders(markup);
        const tokens = [];
        const pattern = /\{\{(key|highlight):([\s\S]*?)\}\}/g;
        let sourceIndex = 0;
        let visibleIndex = 0;
        let groupSerial = 0;

        const addToken = (type, text, tokenId, groupId) => {
            if (!text) return;
            const displayText = type === 'key' ? text : this._sentenceCaseText(text);
            const start = visibleIndex;
            visibleIndex += displayText.length;
            tokens.push({
                type,
                text: displayText,
                tokenId: tokenId || null,
                groupId: groupId || null,
                start,
                end: visibleIndex,
            });
        };

        let match;
        while ((match = pattern.exec(source))) {
            if (match.index > sourceIndex) {
                addToken('text', source.slice(sourceIndex, match.index));
            }

            if (match[1] === 'key') {
                const separator = match[2].indexOf('|');
                const label = (separator >= 0 ? match[2].slice(0, separator) : match[2]).trim();
                const tokenId = (separator >= 0 ? match[2].slice(separator + 1) : label).trim();
                if (label) addToken('key', label, tokenId || label, 'key-' + (++groupSerial));
                else addToken('text', match[0]);
            } else {
                const highlighted = match[2];
                if (highlighted) addToken('highlight', highlighted, null, 'highlight-' + (++groupSerial));
                else addToken('text', match[0]);
            }
            sourceIndex = pattern.lastIndex;
        }

        if (sourceIndex < source.length) addToken('text', source.slice(sourceIndex));
        return tokens;
    }

    _expandClassRangePlaceholders(markup) {
        const source = String(markup || '');
        const ranges = IP2Live.IPClassRanges;
        if (!ranges || typeof ranges.byClassName !== 'function') return source;
        return source.replace(/\[IP_CLASS_([A-E])_(SHORT|FULL)\]/gi, function (match, className, format) {
            const spec = ranges.byClassName(className);
            if (!spec) return match;
            return String(format || '').toUpperCase() === 'FULL' ? spec.rangeText : spec.shortRange;
        });
    }

    _visibleTextForTokens(tokens) {
        return (tokens || []).map((token) => token.text || '').join('');
    }

    _layoutRichText(ctx, tokens, maxW, options) {
        const opts = options || {};
        const sX = Number(opts.sX) || 1;
        const sY = Number(opts.sY) || 1;
        const letterSpacing = Number(opts.letterSpacing) || 0;
        const lineH = Number(opts.lineH) || 28 * sY;
        const blankLineH = Number(opts.blankLineH) || 12 * sY;
        const bodyFont = opts.bodyFont || ctx.font;
        const keyFont = opts.keyFont || bodyFont;
        const highlightPadX = 6 * sX;
        const keyPadX = 10 * sX;
        const keyMinW = 30 * sX;
        const lines = [];
        let line = { runs: [], width: 0, height: lineH };

        const measureBody = (value) => {
            ctx.font = bodyFont;
            return this._measureTrackedText(ctx, value, letterSpacing);
        };
        const measureKey = (value) => {
            ctx.font = keyFont;
            return Math.max(keyMinW, ctx.measureText(value).width + keyPadX * 2);
        };
        const recomputeLineWidth = () => {
            line.width = line.runs.reduce((sum, run) => sum + run.width, 0);
        };
        const trimLineEnd = () => {
            const last = line.runs[line.runs.length - 1];
            if (!last || last.type === 'key' || !/[ \t]+$/.test(last.text)) return;
            last.text = last.text.replace(/[ \t]+$/, '');
            last.end = last.start + last.text.length;
            if (!last.text) line.runs.pop();
            else last.width = measureBody(last.text) + (last.type === 'highlight' ? highlightPadX * 2 : 0);
            recomputeLineWidth();
        };
        const finishLine = (force) => {
            trimLineEnd();
            if (line.runs.length || force) lines.push(line);
            line = { runs: [], width: 0, height: lineH };
        };
        const addTextPiece = (token, piece, start, end) => {
            if (!piece) return;
            const isSpace = /^[ \t]+$/.test(piece);
            if (isSpace && line.runs.length === 0) return;

            const last = line.runs[line.runs.length - 1];
            const canMerge = last && last.type === token.type && last.groupId === token.groupId;
            if (canMerge) {
                const mergedText = last.text + piece;
                const mergedWidth = measureBody(mergedText) + (token.type === 'highlight' ? highlightPadX * 2 : 0);
                const delta = mergedWidth - last.width;
                if (!isSpace && line.runs.length && line.width + delta > maxW) {
                    finishLine(false);
                    return addTextPiece(token, piece, start, end);
                }
                last.text = mergedText;
                last.end = end;
                last.width = mergedWidth;
                line.width += delta;
                return;
            }

            const width = measureBody(piece) + (token.type === 'highlight' ? highlightPadX * 2 : 0);
            if (!isSpace && line.runs.length && line.width + width > maxW) {
                finishLine(false);
                return addTextPiece(token, piece, start, end);
            }
            line.runs.push({
                type: token.type,
                text: piece,
                tokenId: token.tokenId,
                groupId: token.groupId,
                start,
                end,
                width,
            });
            line.width += width;
        };

        for (let ti = 0; ti < (tokens || []).length; ti++) {
            const token = tokens[ti];
            if (token.type === 'key') {
                const width = measureKey(token.text);
                if (line.runs.length && line.width + width > maxW) finishLine(false);
                line.runs.push({
                    type: 'key',
                    text: token.text,
                    tokenId: token.tokenId,
                    groupId: token.groupId,
                    start: token.start,
                    end: token.end,
                    width,
                });
                line.width += width;
                continue;
            }

            const pieces = token.text.match(/\n|[ \t]+|[^\s\n]+/g) || [];
            let localOffset = 0;
            for (let pi = 0; pi < pieces.length; pi++) {
                const piece = pieces[pi];
                const start = token.start + localOffset;
                const end = start + piece.length;
                localOffset += piece.length;
                if (piece === '\n') {
                    finishLine(true);
                    continue;
                }
                addTextPiece(token, piece, start, end);
            }
        }
        finishLine(lines.length === 0);

        let height = 0;
        for (let li = 0; li < lines.length; li++) {
            const blank = lines[li].runs.length === 0;
            lines[li].height = blank ? blankLineH : lineH;
            height += lines[li].height;
        }
        ctx.font = bodyFont;
        return { lines, height, bodyFont, keyFont, letterSpacing, highlightPadX };
    }

    _targetPanelHeight(layout, cH, sY, promptH, bodyTopPadding) {
        const bodyHeight = Math.max(28 * sY, layout && layout.height ? layout.height : 0);
        const headerHeight = 50 * sY;
        const resolvedTopPadding = Number.isFinite(bodyTopPadding) ? bodyTopPadding : 38 * sY;
        const desired = headerHeight + resolvedTopPadding + bodyHeight + 18 * sY + promptH + 13 * sY;
        const minHeight = 205 * sY;
        const maxHeight = Math.max(minHeight, cH - 52 * sY);
        return Math.max(minHeight, Math.min(desired, maxHeight));
    }

    _activeFullText() {
        if (!this._active) return '';
        const slide = this._active.slides[this._active.slideIndex] || [];
        return this._displayTextForSlide(slide, this._active);
    }

    _resetTyping() {
        if (!this._active) return;
        this._active.typeChars = 0;
        this._active.typeTimer = 0;
        this._active.lastText = '';
    }

    _wrapText(ctx, text, maxW, letterSpacing) {
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
                if (line && this._measureTrackedText(ctx, test, letterSpacing) > maxW) {
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

    _measureTrackedText(ctx, text, letterSpacing) {
        const value = String(text || '');
        const spacing = Number(letterSpacing) || 0;
        const characterCount = Array.from(value).length;
        return ctx.measureText(value).width + Math.max(0, characterCount - 1) * spacing;
    }

    _fillTrackedText(ctx, text, x, y, letterSpacing) {
        const value = String(text || '');
        const spacing = Number(letterSpacing) || 0;
        if (!spacing || value.length < 2) {
            ctx.fillText(value, x, y);
            return;
        }

        let cursorX = x;
        for (const character of value) {
            ctx.fillText(character, cursorX, y);
            cursorX += ctx.measureText(character).width + spacing;
        }
    }

    _sentenceCaseText(value) {
        const text = String(value || '');
        if (!/[A-Z]/.test(text)) return text;

        const technicalTerms = {
            APEX: true,
            AR: true,
            CIDR: true,
            DHCP: true,
            DNS: true,
            HUD: true,
            IP: true,
            LAN: true,
            MAC: true,
            TCP: true,
            UDP: true,
            UI: true,
            VLAN: true,
            VLSM: true,
            VPN: true,
            WAN: true,
        };
        const sentenceStartsAt = (offset) => {
            const prefix = text.slice(0, offset).replace(/\s+$/, '');
            return !prefix || /[.!?]\s*$/.test(prefix);
        };
        const formatPhrase = (phrase, offset) => {
            const words = phrase.split(/(\s+)/);
            let shouldCapitalize = sentenceStartsAt(offset);
            return words.map((word) => {
                if (/^\s+$/.test(word)) return word;
                const upper = word.toUpperCase();
                const technicalKey = upper.replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/g, '');
                let formatted;
                if (technicalTerms[technicalKey] || /^[A-Z]$/.test(word)) {
                    formatted = upper;
                } else {
                    const lower = word.toLowerCase();
                    formatted = shouldCapitalize
                        ? lower.replace(/[a-z]/, (letter) => letter.toUpperCase())
                        : lower;
                }
                shouldCapitalize = /[.!?](?:["')\]]*)$/.test(word);
                return formatted;
            }).join('');
        };

        if (!/[a-z]/.test(text)) return formatPhrase(text, 0);
        return text.replace(/\b[A-Z][A-Z0-9-]*(?:\s+[A-Z][A-Z0-9-]*)*\b/g, formatPhrase);
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
            if (slide && typeof slide === 'object') {
                const copy = Object.assign({}, slide);
                copy.lines = Array.isArray(slide.lines) ? slide.lines.slice() : [];
                return copy;
            }
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
