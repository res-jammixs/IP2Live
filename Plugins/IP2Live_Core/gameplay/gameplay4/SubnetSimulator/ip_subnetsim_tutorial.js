/**
 * IP2Live - Subnet Simulator Tutorial Dialogue Helpers
 *
 * Gameplay Four assistance dialogue.
 */

const IPSubnetSimulatorTutorial = {
    VERSION: 'ip-subnetsim-tutorial-20260816-03',
    _dialogueSerial: 0,

    showIntro(context, onComplete) {
        return this.showCarriedReference(context, onComplete);
    },

    showCarriedReference(context, onComplete) {
        const c = context || {};
        const bits = c.bitsBinary || '11100000';
        const mask = c.mask || 'the previous subnet mask';
        return this._startDynamicDialogue('stage2.ipsubnetsim.carried.', {
            title: 'CARRIED OCTET DETECTED',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                mapId: 8,
                gameplayId: 'ip_subnet_simulator',
                objectiveId: 'solve_cidr_chain_01_subnet',
                trigger: 'gameplay.during',
            },
            slides: [[
                'Notice the blinking lamp row in the CARRIED OCTET display: ' + bits + '.',
                'This is the interesting octet you solved in the previous CIDR panel for ' + mask + '.',
                '',
                'APEX retained it as the reference key for this second security layer. Every answer in this simulator is derived from that same ON/OFF pattern.',
            ]],
            onComplete,
        });
    },

    showPowerGuide(context, onComplete) {
        const c = context || {};
        const onBits = Math.max(0, Number(c.borrowedBits) || 0);
        const offBits = Math.max(0, Number(c.hostBits) || 0);
        const totalSubnets = Math.max(0, Number(c.totalSubnets) || Math.pow(2, onBits));
        const totalHosts = Math.max(0, Number(c.totalHosts) || Math.pow(2, offBits));
        return this._startDynamicDialogue('stage2.ipsubnetsim.powers.', {
            title: 'POWER-OF-TWO CIPHER',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                mapId: 8,
                gameplayId: 'ip_subnet_simulator',
                objectiveId: 'solve_cidr_chain_01_subnet',
                trigger: 'gameplay.during',
            },
            slides: [[
                'Count the lamps that are ON. There are ' + onBits + '; these are the borrowed subnet bits.',
                'Put 2 to that power: 2^' + onBits + ' = ' + totalSubnets + ' TOTAL SUBNETS.',
                '',
                'Now count the lamps that are OFF. There are ' + offBits + '; these are the host bits.',
                'Put 2 to that power: 2^' + offBits + ' = ' + totalHosts + ' TOTAL HOST ADDRESSES.',
            ]],
            onComplete,
        });
    },

    showUsableGuide(context, onComplete) {
        const c = context || {};
        const totalSubnets = Math.max(0, Number(c.totalSubnets) || 0);
        const usableSubnets = Math.max(0, Number(c.usableSubnets) || 0);
        const totalHosts = Math.max(0, Number(c.totalHosts) || 0);
        const usableHosts = Math.max(0, Number(c.usableHosts) || 0);
        return this._startDynamicDialogue('stage2.ipsubnetsim.usable.', {
            title: 'RESERVED ADDRESS PROTOCOL',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                mapId: 8,
                gameplayId: 'ip_subnet_simulator',
                objectiveId: 'solve_cidr_chain_01_subnet',
                trigger: 'gameplay.during',
            },
            slides: [[
                'A standard IPv4 host pool keeps two addresses unavailable to ordinary devices: the all-zero host pattern identifies the network, and the all-one host pattern is the broadcast address.',
                'That makes USABLE HOSTS: ' + totalHosts + ' - 2 = ' + usableHosts + '.',
                '',
                'This APEX console also enforces the legacy zero-subnet and all-ones-subnet reservation, so USABLE SUBNETS are ' + totalSubnets + ' - 2 = ' + usableSubnets + '.',
                'Drag the red -2 node onto the appropriate completed totals to create both usable values.',
            ]],
            onComplete,
        });
    },

    showDuplicateGuide(context, onComplete) {
        const c = context || {};
        const totalHosts = Math.max(0, Number(c.totalHosts) || 128);
        const usableHosts = Math.max(0, Number(c.usableHosts) || Math.max(0, totalHosts - 2));
        const uses = Math.max(1, Number(c.duplicateUsesLeft) || 3);
        return this._startDynamicDialogue('stage2.ipsubnetsim.duplicate.', {
            title: 'APEX MERGE-FIELD TACTIC',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                mapId: 8,
                gameplayId: 'ip_subnet_simulator',
                objectiveId: 'solve_cidr_chain_01_subnet',
                trigger: 'gameplay.during',
            },
            slides: [[
                'Drag equal number nodes together to double them: 2 + 2 = 4, 4 + 4 = 8, and continue until you reach each target.',
                '',
                'Tip: when ' + totalHosts + ' is needed for TOTAL HOSTS and ' + usableHosts + ' is needed for USABLE HOSTS, do not build two separate ' + totalHosts + ' chains. Build one, use the green DUPLICATE node, then apply -2 to the copy.',
                'The duplicate node has only ' + uses + ' charges and the field allows only ten live number nodes. Spend copies wisely or APEX can trap the board with no room to finish.',
                'Drop the four answers into their labeled bays, then press the yellow validation shield.',
            ]],
            onComplete,
        });
    },

    showAttemptReset(onComplete) {
        return this._startDynamicDialogue('stage2.ipsubnetsim.retry_reset.', {
            title: 'SIMULATOR TRAINING RECALIBRATION',
            speaker: 'SYSTEM',
            timing: 'after',
            bindings: {
                mapId: 8,
                gameplayId: 'ip_subnet_simulator',
                trigger: 'gameplay.failed',
            },
            slides: [[
                'Three subnet-capacity validations were rejected.',
                '',
                'Return to the first guided simulator console. Recheck the carried lamp row, the powers of two, and the reserved-address subtraction before continuing.',
                'Your completed CIDR panel remains secured, so the same solved Class C mask is waiting at the tutorial simulator.',
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
        return dm.start(id, { source: 'IPSubnetSimulatorTutorial' });
    },
};

IP2Live.IPSubnetSimulatorTutorial = IPSubnetSimulatorTutorial;
window.IP2LiveIPSubnetSimulatorTutorial = IPSubnetSimulatorTutorial;

console.log('[IP2Live] ip_subnetsim_tutorial.js loaded.');
