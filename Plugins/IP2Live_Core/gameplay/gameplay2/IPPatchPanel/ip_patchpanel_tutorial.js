/**
 * IP2Live - IP Patch Panel Tutorial Dialogue Helpers
 *
 * Dynamic dialogue content for the Stage 1 Level 1 patch-panel classifier gameplay.
 * Loaded before ip_patchpanel_gameplay.js.
 */

const IPPatchPanelTutorial = {
    VERSION: 'ip-patchpanel-tutorial-20260528-01',
    _dialogueSerial: 0,

    showIntro(onComplete) {
        return this._startDynamicDialogue('stage1.ippatchpanel.intro.', {
            title: 'PATCH PANEL BRIEFING',
            speaker: 'SYSTEM',
            timing: 'before',
            bindings: {
                mapId: 3,
                gameplayId: 'ip_patch_panel_classes',
                trigger: 'gameplay.before',
            },
            slides: [
                [
                    'Welcome to Patch Panel Classifier v2.',
                    'Packets will travel from LEFT to RIGHT through the panel.',
                    '',
                    'Use A / B / C / D to rotate the class wheel before a packet reaches the center tunnel.',
                ],
                [
                    'The XRAY window reveals packet labels while they pass the core.',
                    'Classify each packet into the correct tunnel class.',
                    '',
                    'Objective: secure at least 10 correct packets out of 15 deliveries.',
                ],
                [
                    'If your score is below 10 after all 15 packets, the round auto-restarts.',
                    'Stay sharp, Infiltrator.',
                ],
            ],
            onComplete,
        });
    },

    showRoundReset(score, target, total, onComplete) {
        const secured = Number(score) || 0;
        const targetScore = Number(target) || 10;
        const delivered = Number(total) || 15;
        return this._startDynamicDialogue('stage1.ippatchpanel.reset.', {
            title: 'ROUND RESET',
            speaker: 'SYSTEM',
            timing: 'after',
            bindings: {
                mapId: 3,
                gameplayId: 'ip_patch_panel_classes',
                trigger: 'gameplay.failed',
            },
            slides: [
                [
                    'Delivery round ended with ' + secured + ' / ' + delivered + ' secured packets.',
                    'Target threshold is ' + targetScore + '.',
                    '',
                    'The defense mesh is re-routing a new packet stream now.',
                ],
            ],
            onComplete,
        });
    },

    showVictory(result, onComplete) {
        const data = result || {};
        const secured = Number(data.score) || 0;
        const total = Number(data.totalPackets) || 15;
        return this._startDynamicDialogue('stage1.ippatchpanel.victory.', {
            title: 'PATCH PANEL STABILIZED',
            speaker: 'SYSTEM',
            timing: 'after',
            bindings: {
                mapId: 3,
                gameplayId: 'ip_patch_panel_classes',
                trigger: 'gameplay.completed',
            },
            slides: [
                [
                    'Outstanding routing discipline.',
                    'You secured ' + secured + ' / ' + total + ' packets through the panel core.',
                    '',
                    'Node integrity has been restored.',
                ],
            ],
            onComplete,
        });
    },

    _startDynamicDialogue(prefix, definition) {
        const dm = IP2Live.DialogueManager;
        if (!dm || typeof dm.registerDialogue !== 'function' || typeof dm.start !== 'function') {
            if (definition && typeof definition.onComplete === 'function') definition.onComplete();
            return false;
        }

        const id = prefix + (++this._dialogueSerial);
        dm.registerDialogue(id, {
            title: definition.title || 'TRANSMISSION',
            speaker: definition.speaker || 'SYSTEM',
            slides: definition.slides || [],
            timing: definition.timing || 'during',
            bindings: Object.assign({}, definition.bindings || {}),
            hideQuestPanel: true,
            lockMovement: true,
            onComplete: definition.onComplete || null,
        });
        return dm.start(id, { source: 'IPPatchPanelTutorial' });
    },
};

IP2Live.IPPatchPanelTutorial = IPPatchPanelTutorial;
window.IP2LiveIPPatchPanelTutorial = IPPatchPanelTutorial;

console.log('[IP2Live] ip_patchpanel_tutorial.js loaded.');
