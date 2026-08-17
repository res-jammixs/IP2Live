/**
 * IP2Live - CIDR Panel Tutorial Dialogue Helpers
 *
 * Dynamic dialogue content for the Stage 2 Level 1 CIDR light-panel gameplay.
 * Loaded before ip_cidrpanel_gameplay.js.
 */

const IPCIDRPanelTutorial = {
    VERSION: 'ip-cidrpanel-tutorial-20260816-06',
    _dialogueSerial: 0,

    showIntro(targetMask, onComplete) {
        return this.showTargetMaskGuide(targetMask, onComplete);
    },

    showTargetMaskGuide(targetMask, onComplete) {
        const mask = targetMask || '255.255.255.224';
        return this._startDynamicDialogue('stage2.ipcidrpanel.target.', {
            title: 'TARGET SUBNET MASK',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                mapId: 7,
                gameplayId: 'ip_cidr_binary_panel',
                trigger: 'gameplay.during',
            },
            slides: [[
                'First, look at the SUBNET MASK // TARGET display.',
                'The mask you must reproduce is ' + mask + '.',
                '',
                'Each dotted-decimal octet maps to one row of the panel. Build all four rows so their values match this target exactly.',
            ]],
            onComplete,
        });
    },

    showLampArrayGuide(onComplete) {
        return this._startDynamicDialogue('stage2.ipcidrpanel.lamps.', {
            title: 'BINARY LAMP ARRAY',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                mapId: 7,
                gameplayId: 'ip_cidr_binary_panel',
                trigger: 'gameplay.during',
            },
            slides: [[
                'This is the BINARY LAMP ARRAY. Its four rows represent the four subnet-mask octets.',
                'From left to right, the lamps are worth 128, 64, 32, 16, 8, 4, 2, and 1.',
                '',
                'A lit bulb is a binary 1. An unlit bulb is a binary 0. Add the lit values in each row to produce that octet.',
            ]],
            onComplete,
        });
    },

    showLampControlsGuide(onComplete) {
        return this._startDynamicDialogue('stage2.ipcidrpanel.controls.', {
            title: 'LAMP CONTROLS',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                mapId: 7,
                gameplayId: 'ip_cidr_binary_panel',
                trigger: 'gameplay.during',
            },
            slides: [[
                'Click any bulb to turn that single binary bit ON or OFF.',
                'Use the switch at the right of a row to turn ALL of its bulbs ON. When the row is full, the same switch turns them ALL OFF.',
                '',
                'Match every row to the target subnet mask, then press VERIFY MATCH.',
            ]],
            onComplete,
        });
    },

    showCIDRGuide(targetMask, onComplete) {
        const mask = targetMask || 'the target mask';
        return this._startDynamicDialogue('stage2.ipcidrpanel.cidr.', {
            title: 'CALCULATE THE CIDR PREFIX',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                mapId: 7,
                gameplayId: 'ip_cidr_binary_panel',
                trigger: 'gameplay.during',
            },
            slides: [[
                'Subnet mask matched: ' + mask + '.',
                'Now calculate its CIDR prefix by counting every bulb that is ON across all four rows.',
                '',
                'Enter that total as /number in the unlocked CIDR field, then press VERIFY MATCH again. Once the prefix is accepted, this calibration is complete.',
            ]],
            onComplete,
        });
    },

    showCorrection(targetMask, bits, cidr, onComplete) {
        const mask = targetMask || '255.255.255.224';
        const binary = bits || '11100000';
        return this._startDynamicDialogue('stage1.ipcidrpanel.fix.', {
            title: 'CIDR CORRECTION',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                mapId: 7,
                gameplayId: 'ip_cidr_binary_panel',
                trigger: 'gameplay.mistake',
            },
            slides: [
                [
                    'That mask pattern is unstable.',
                    'Target mask: ' + mask,
                    '',
                    'Interesting octet binary should be: ' + binary,
                ],
                [
                    'Borrowed bits are ON (1). Unused bits are OFF (0).',
                    'Example: 11100000 means 3 borrowed bits and 5 host bits.',
                    'After matching bulbs, count all ON bits and type the CIDR prefix.',
                    '',
                    'Try again. Align every octet row with the target mask.',
                ],
            ],
            onComplete,
        });
    },

    showAttemptReset(failedLabel, onComplete) {
        const label = failedLabel || 'the active CIDR panel';
        return this._startDynamicDialogue('stage2.ipcidrpanel.retry_reset.', {
            title: 'CIDR TRAINING RECALIBRATION',
            speaker: 'SYSTEM',
            timing: 'after',
            bindings: {
                mapId: 7,
                gameplayId: 'ip_cidr_binary_panel',
                trigger: 'gameplay.failed',
            },
            slides: [[
                'Three verification attempts were spent at ' + label + '.',
                '',
                'APEX is exploiting uncertainty in the mask conversion. Return to the first CIDR training relay and replay the guided lamp-array lesson.',
                'Your completed relays remain secured. Once the tutorial relay is stable again, the route will return you to the unfinished panel.',
            ]],
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
        return dm.start(id, { source: 'IPCIDRPanelTutorial' });
    },
};

IP2Live.IPCIDRPanelTutorial = IPCIDRPanelTutorial;
window.IP2LiveIPCIDRPanelTutorial = IPCIDRPanelTutorial;

console.log('[IP2Live] ip_cidrpanel_tutorial.js loaded.');
