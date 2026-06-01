/**
 * IP2Live - Network Repair Tutorial Dialogue Helpers (Formula Catcher)
 *
 * Gameplay Seven assistance dialogue for Stage 4 Level 1 PC repairs.
 * Updated for the formula-variable catching mini-game.
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
                    'Falling data packets contain subnet formula variables. Use the',
                    'RECEPTOR to catch the variables needed by the active formula.',
                ],
                [
                    'Move the receptor with LEFT / RIGHT arrows or A / D keys.',
                    'You can also click on a lane to move there instantly.',
                    '',
                    'After catching the required variables the system checks your set.',
                    'Wrong variables cost one of your three chances.',
                ],
                [
                    'Once the correct variables are captured, place them into the',
                    'formula blanks and press SUBMIT to solve the address.',
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

        const correctionSlide = mistakeType === 'wrong_formula'
            ? [
                'The variables you caught are correct, but the formula blanks are wrong.',
                '',
                'Your formula: ' + submitted,
                'Expected formula: ' + expected,
            ]
            : [
                'The variables you caught do not match the target formula.',
                '',
                'Caught set: ' + submitted,
                'Expected variables: ' + expected,
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
                    s.taskHelp || 'Find the block size, then use the network, broadcast, and viable host formulas.',
                    '',
                    'The receptor is reset. Try catching the correct variables again.',
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

console.log('[IP2Live] gameplay7 NetworkRepair tutorial.js loaded (Formula Catcher).');
