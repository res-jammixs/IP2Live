/**
 * IP2Live - CIDR Panel Tutorial Dialogue Helpers
 *
 * Dynamic dialogue content for the Stage 1 Level 3 CIDR light-panel gameplay.
 * Loaded before ip_cidrpanel_gameplay.js.
 */

const IPCIDRPanelTutorial = {
    VERSION: 'ip-cidrpanel-tutorial-20260528-01',
    _dialogueSerial: 0,

    showIntro(targetMask, onComplete) {
        const mask = targetMask || '255.255.255.224';
        return this._startDynamicDialogue('stage1.ipcidrpanel.intro.', {
            title: 'CIDR BINARY BRIEFING',
            speaker: 'SYSTEM',
            timing: 'before',
            bindings: {
                mapId: 5,
                gameplayId: 'ip_cidr_binary_panel',
                trigger: 'gameplay.before',
            },
            slides: [
                [
                    'Welcome to CIDR Binary Panel.',
                    'Target subnet mask for this round: ' + mask,
                    '',
                    'Turn ON bulbs to match the binary subnet mask across all four octets.',
                ],
                [
                    'Each row is one octet. Values above bulbs are: 128 64 32 16 8 4 2 1.',
                    'Use row "SWITCH ALL" to quickly set a full 255 octet.',
                    '',
                    'Press CONFIRM to run animated octet sum verification.',
                ],
            ],
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
                mapId: 5,
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
