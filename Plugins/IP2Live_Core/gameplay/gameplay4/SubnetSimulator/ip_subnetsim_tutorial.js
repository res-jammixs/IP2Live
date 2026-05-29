/**
 * IP2Live - Subnet Simulator Tutorial Dialogue Helpers
 *
 * Gameplay Four assistance dialogue.
 */

const IPSubnetSimulatorTutorial = {
    VERSION: 'ip-subnetsim-tutorial-20260529-01',
    _dialogueSerial: 0,

    showIntro(context, onComplete) {
        const c = context || {};
        const bits = c.bitsBinary || '11100000';
        return this._startDynamicDialogue('stage1.ipsubnetsim.intro.', {
            title: 'SUBNET SIMULATOR BRIEF',
            speaker: 'SYSTEM',
            timing: 'before',
            bindings: {
                mapId: 5,
                gameplayId: 'ip_subnet_simulator',
                trigger: 'gameplay.before',
            },
            slides: [
                [
                    'Welcome to Subnet Simulator.',
                    'Use the carried octet widget: ' + bits,
                    '',
                    'Drag circles and match equal values: 1+1=2, 2+2=4, 4+4=8...',
                ],
                [
                    'Fill three targets: USABLE SUBNETS, TOTAL SUBNETS, HOSTS.',
                    'Use the "-2" bubble when a formula needs subtraction.',
                    '',
                    'Submit when all three slots are filled.',
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
        return dm.start(id, { source: 'IPSubnetSimulatorTutorial' });
    },
};

IP2Live.IPSubnetSimulatorTutorial = IPSubnetSimulatorTutorial;
window.IP2LiveIPSubnetSimulatorTutorial = IPSubnetSimulatorTutorial;

console.log('[IP2Live] ip_subnetsim_tutorial.js loaded.');
