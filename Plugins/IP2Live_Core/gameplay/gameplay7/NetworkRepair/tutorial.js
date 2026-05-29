/**
 * IP2Live - Network Repair Tutorial Dialogue Helpers (Octet Catcher)
 *
 * Gameplay Seven assistance dialogue for Stage 4 Level 1 PC repairs.
 * Updated for the octet-catching mini-game.
 */

const IPNetworkRepairTutorial = {
    VERSION: 'ip-networkrepair-tutorial-20260530-01',
    _dialogueSerial: 0,

    showIntro(context, onComplete) {
        const c = context || {};
        const pcLabel = c.label || 'PC Repair Node';
        return this._startDynamicDialogue('stage4.ipnetworkrepair.intro.', {
            title: 'NETWORK REPAIR BRIEF',
            speaker: 'SYSTEM',
            timing: 'before',
            bindings: {
                mapId: 15,
                gameplayId: 'ip_network_repair',
                trigger: 'gameplay.before',
            },
            slides: [
                [
                    pcLabel + ' has a corrupted address table.',
                    '',
                    'Falling data packets contain IP octets. Use the RECEPTOR to catch',
                    'the four octets that form the missing address.',
                ],
                [
                    'Move the receptor with LEFT / RIGHT arrows or A / D keys.',
                    'You can also click on a lane to move there instantly.',
                    '',
                    'After catching four octets the system checks your set.',
                    'Wrong octets cost one of your three chances.',
                ],
                [
                    'Once the correct four octets are captured, arrange them',
                    'into the proper IP address order and press SUBMIT.',
                    '',
                    'Good luck, Infiltrator.',
                ],
            ],
            onComplete,
        });
    },

    showQuestOneCorrection(mistake, scenario, onComplete) {
        const m = mistake || {};
        const s = scenario || {};
        const expected = m.expectedText || s.expectedText || 'the calculated subnet value';
        const submitted = m.submittedText || 'blank input';
        const mistakeType = m.mistakeType || 'unknown';

        const correctionSlide = mistakeType === 'wrong_order'
            ? [
                'The octets you caught are correct, but the order is wrong.',
                '',
                'Your arrangement: ' + submitted,
                'Expected address: ' + expected,
            ]
            : [
                'The four octets you caught do not match the target IP.',
                '',
                'Caught set: ' + submitted,
                'Expected octets from: ' + expected,
            ];

        return this._startDynamicDialogue('stage4.ipnetworkrepair.fix.', {
            title: 'REPAIR COACH',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                mapId: 15,
                gameplayId: 'ip_network_repair',
                objectiveId: 'repair_network_pc_01',
                trigger: 'gameplay.mistake',
            },
            slides: [
                correctionSlide,
                [
                    s.taskHelp || 'Split the IP by the CIDR prefix, then calculate the network and broadcast edges.',
                    '',
                    'The receptor is reset. Try catching the correct octets again.',
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
        return dm.start(id, { source: 'IPNetworkRepairTutorial' });
    },
};

IP2Live.IPNetworkRepairTutorial = IPNetworkRepairTutorial;
window.IP2LiveIPNetworkRepairTutorial = IPNetworkRepairTutorial;

console.log('[IP2Live] gameplay7 NetworkRepair tutorial.js loaded (Octet Catcher).');
