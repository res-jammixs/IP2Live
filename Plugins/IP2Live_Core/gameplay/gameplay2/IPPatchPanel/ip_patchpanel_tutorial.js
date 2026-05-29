/**
 * IP2Live - IP Patch Panel Tutorial Dialogue Helpers
 *
 * Dynamic dialogue content for the Stage 1 Level 2 patch-panel classifier gameplay.
 * Loaded before ip_patchpanel_gameplay.js.
 */

const IPPatchPanelTutorial = {
    VERSION: 'ip-patchpanel-tutorial-20260530-02',
    _dialogueSerial: 0,

    showIntro(onComplete) {
        return this._startDynamicDialogue('stage1.ippatchpanel.intro.', {
            title: 'PATCH PANEL BRIEFING',
            speaker: 'SYSTEM',
            timing: 'before',
            bindings: {
                mapId: 4,
                gameplayId: 'ip_patch_panel_classes',
                trigger: 'gameplay.before',
            },
            slides: [
                [
                    'There are multiple failing wires in this stage.',
                    'Reroute each packet properly so the connection becomes stable.',
                    '',
                    'Once the patch panel is stable, the door to the next stage can open.',
                ], [
                    'Packets will travel from LEFT to RIGHT through the panel.',
                    'Use the class wheel to send each packet into the right tunnel.',
                    '',
                    'Objective: secure at least 10 correct packets out of 15 deliveries.',
                ],
            ],
            onComplete,
        });
    },

    showPacketGuide(onComplete) {
        return this._startDynamicDialogue('stage1.ippatchpanel.guided.packet.', {
            title: 'PACKET FLOW',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                mapId: 4,
                gameplayId: 'ip_patch_panel_classes',
                trigger: 'gameplay.during',
            },
            slides: [[
                'These are the packets that needs to be redirected properly on the right Class tunnel.',
                '',
                'Watch the packet as it moves toward the classifier core.',
            ]],
            onComplete,
        });
    },

    showXrayGuide(kind, onComplete) {
        const label = String(kind || '').toUpperCase() === 'MASK' ? 'subnet mask' : 'IP address';
        return this._startDynamicDialogue('stage1.ippatchpanel.guided.xray.', {
            title: 'XRAY INSPECTOR',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                mapId: 4,
                gameplayId: 'ip_patch_panel_classes',
                trigger: 'gameplay.during',
            },
            slides: [[
                'This is the ' + label + ' that needs to be classified.',
                '',
                'Read the XRAY signal, then choose the correct Class tunnel before the packet reaches the center.',
            ]],
            onComplete,
        });
    },

    showControlsGuide(onComplete) {
        return this._startDynamicDialogue('stage1.ippatchpanel.guided.controls.', {
            title: 'CLASS CONTROL',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                mapId: 4,
                gameplayId: 'ip_patch_panel_classes',
                trigger: 'gameplay.during',
            },
            slides: [[
                'Use A, B, C, or D on the keyboard to rotate directly to a Class.',
                'You can also use the arrow keys to change direction, or click the Class buttons.',
            ]],
            onComplete,
        });
    },

    showUpcomingGuide(onComplete) {
        return this._startDynamicDialogue('stage1.ippatchpanel.guided.upcoming.', {
            title: 'QUEUE PREVIEW',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                mapId: 4,
                gameplayId: 'ip_patch_panel_classes',
                trigger: 'gameplay.during',
            },
            slides: [[
                'The upcoming packets section gives you a head start.',
                '',
                'Use it to prepare the correct Class before the next packet reaches the tunnel.',
            ]],
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
                mapId: 4,
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
                mapId: 4,
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
