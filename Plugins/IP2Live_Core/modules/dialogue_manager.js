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
        this.VERSION = 'dialogue-manager-20260518-01';

        this.EVENT = {
            MAP_ENTER: 'map:enter',
            TUTORIAL_START: 'tutorial:start',
            ITEM_INTERACT: 'item:interact',
        };

        this.dialogues = this._createDialogueRegistry();
        this.tutorialSteps = this._createTutorialSteps();
        this.mapTriggers = this._createMapTriggers();
        this.itemTriggers = this._createItemTriggers();

        this._active = null;
        this._booted = false;
        this._keyRef = null;
        this._clickRef = null;
        this._seenTriggers = {};
        this._pendingTriggers = {};
        this._lastMapEnterKey = null;
        this._sceneSerial = 0;
        this._questPanelSuppressed = false;

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
            hideQuestPanel: dialogue.hideQuestPanel !== false,
            context: context || {},
            onComplete: dialogue.onComplete || null,
            animTick: 0,
            typeChars: 0,
            typeTimer: 0,
            typeSpeed: dialogue.typeSpeed || 1,
            lastText: '',
        };

        if (this._active.hideQuestPanel) this._setQuestPanelSuppressed(true);
        if (Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
        return true;
    }

    stop() {
        if (!this._active) return;
        const done = this._active;
        this._active = null;
        if (done.hideQuestPanel) this._setQuestPanelSuppressed(false);
        if (typeof done.onComplete === 'function') {
            try {
                done.onComplete(done.context, this);
            } catch (e) {
                console.warn('[IP2Live] DialogueManager onComplete failed:', e);
            }
        }
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
        return !!(this._active && this._active.lockMovement);
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

        const panelW = cW - 52 * sX;
        const panelH = Math.min(230 * sY, cH * 0.32);
        const panelX = 26 * sX;
        const panelY = cH - panelH - 24 * sY;
        const cut = 26 * sX;
        const headerH = 42 * sY;

        ctx.save();

        ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
        ctx.fillRect(0, 0, cW, cH);

        ctx.beginPath();
        ctx.moveTo(panelX + cut, panelY);
        ctx.lineTo(panelX + panelW, panelY);
        ctx.lineTo(panelX + panelW - 12 * sX, panelY + panelH);
        ctx.lineTo(panelX, panelY + panelH);
        ctx.lineTo(panelX, panelY + 32 * sY);
        ctx.closePath();
        ctx.fillStyle = 'rgba(3, 7, 20, 0.96)';
        ctx.fill();

        ctx.save();
        ctx.clip();
        for (let y = panelY; y < panelY + panelH; y += 5 * sY) {
            ctx.fillStyle = 'rgba(255,255,255,0.03)';
            ctx.fillRect(panelX, y, panelW, Math.max(1, sY));
        }
        ctx.fillStyle = 'rgba(0,240,255,0.06)';
        ctx.fillRect(panelX, panelY + ((tick * 1.1) % panelH), panelW, 7 * sY);
        ctx.restore();

        ctx.shadowColor = '#00F0FF';
        ctx.shadowBlur = 8 + pulse * 10;
        ctx.strokeStyle = 'rgba(0,240,255,' + (0.62 + pulse * 0.22) + ')';
        ctx.lineWidth = 1.5 * sX;
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.beginPath();
        ctx.moveTo(panelX, panelY);
        ctx.lineTo(panelX + 360 * sX, panelY);
        ctx.lineTo(panelX + 395 * sX, panelY + headerH);
        ctx.lineTo(panelX, panelY + headerH);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,0,60,0.94)';
        ctx.fill();

        ctx.font = 'bold ' + Math.round(10 * sX) + 'px monospace';
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'left';
        ctx.fillText('// ' + active.title + ' //', panelX + 20 * sX, panelY + 27 * sY);

        ctx.font = 'bold ' + Math.round(8 * sX) + 'px monospace';
        ctx.fillStyle = 'rgba(0,255,255,0.76)';
        ctx.textAlign = 'right';
        ctx.fillText(active.speaker, panelX + panelW - 24 * sX, panelY + 27 * sY);

        const slide = active.slides[active.slideIndex] || [];
        const fullText = slide.join('\n');
        const displayed = this._typedText(fullText);
        const textX = panelX + 30 * sX;
        const textY = panelY + headerH + 38 * sY;
        const textW = panelW - 60 * sX;
        const lineH = 20 * sY;

        ctx.font = Math.round(15 * sX) + 'px ' + font;
        ctx.fillStyle = '#DAEEFF';
        ctx.textAlign = 'left';
        const lines = this._wrapText(ctx, displayed, textW);
        let y = textY;
        for (let i = 0; i < lines.length && y < panelY + panelH - 42 * sY; i++) {
            if (!lines[i]) {
                y += 10 * sY;
                continue;
            }
            ctx.fillText(lines[i], textX, y);
            y += lineH;
        }

        if (active.typeChars >= fullText.length) {
            const blink = Math.floor(tick / 24) % 2 === 0;
            ctx.font = Math.round(8 * sX) + 'px monospace';
            ctx.fillStyle = blink ? '#00FFFF' : 'rgba(0,255,255,0.42)';
            ctx.textAlign = 'center';
            ctx.fillText('ENTER / CLICK TO CONTINUE', panelX + panelW / 2, panelY + panelH - 18 * sY);
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

        const manager = this;
        const originalUpdate = Scene.Map.prototype.update;
        Scene.Map.prototype.update = function () {
            if (manager.locksMovement()) manager._stripMovementInputs();
            originalUpdate.call(this);
            manager.triggerMapEnter(this);
            if (manager.isActive() && Manager && Manager.Stack) Manager.Stack.requestPaintHUD = true;
            if (manager.locksMovement()) manager._stripMovementInputs();
        };

        const originalDrawHUD = Scene.Map.prototype.drawHUD;
        Scene.Map.prototype.drawHUD = function () {
            originalDrawHUD.call(this);
            manager.drawOverlay(Common.Platform.ctx);
        };
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
