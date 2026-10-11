/** Campaign dialogue hooks for Gameplay 6: Subnet Blaster. */
const IPCIDRQuarantineMatrixTutorial = {
    VERSION: 'subnet-blaster-tutorial-20261011-06',
    _dialogueSerial: 0,
    showIntro(context, onComplete) {
        return this._show('intro', 'SUBNET BLASTER', [[
            'Welcome to {{highlight:Subnet Blaster}}! Build a formula to uncover a subnet\'s missing address.',
            'Let\'s solve this first question together. The game pauses while you read.',
        ]], onComplete, [['console']]);
    },
    showPreparationGuide(context, onComplete) {
        const p = context;
        const given = p.asked === 'broadcast' ? 'network' : 'broadcast';
        const count = p.blockSize.toLocaleString('en-US');
        const bits = p.givenBits === 'borrowed'
            ? 'Here: Class ' + p.ipClass + ' leaves ' + p.availableBits + ' default host bits. {{highlight:' + p.availableBits + ' - ' + p.borrowedBits + ' = ' + p.hostBits + ' host bits}}.'
            : 'Here, {{highlight:host bits are already given: h = ' + p.hostBits + '}}. Use them directly; no subtraction is needed.';
        return this._show('preparation', 'READ THE GIVEN', [[
            'Given: {{highlight:Class ' + p.ipClass + '}}, ' + given + ' {{highlight:' + p.givenAddress + '}}. The answer screen asks for {{highlight:' + p.asked + '}}.',
            'Values vary: Classes A/B/C, either address, and {{highlight:borrowed bits or host bits}}. Read the labels each round.',
        ], [
            'A subnet is an address range. {{highlight:Network = first address}}; {{highlight:broadcast = last address}}.',
            'Device addresses lie between them. A broadcast reaches all devices in that subnet.',
        ], [
            'Recall Gameplay 5: {{highlight:h = default host bits - borrowed bits}}. Defaults: A = 24, B = 16, C = 8.',
            bits,
        ], [
            'Recall Gameplay 4.5: {{highlight:block size = 2^h total addresses}}, including network and broadcast.',
            'Here: {{highlight:2^' + p.hostBits + ' = ' + count + '}}. Do not subtract 2; that would give usable hosts.',
        ], [
            '{{highlight:Broadcast = network + block - 1}}. {{highlight:Network = broadcast - block + 1}}.',
            'We need ' + p.asked + ': {{highlight:' + p.givenAddress + ' ' + p.operator + ' ' + count + ' ' + p.correction + ' = ?}}. The bar already includes ' + p.correction + ' to stay inside the range.',
        ], [
            'Use {{highlight:one minute}} to plan. {{highlight:C}} opens your familiar calculator and pauses the timer.',
            'Ready? Use the {{highlight:Skip icon}} or Enter. Only two choices follow: {{highlight:operator, then block size}}.',
        ]], onComplete, [
            ['given', 'answer'], ['range'], ['class', 'bits'], ['bits', 'blockSize'],
            ['formula'], ['preparation', 'skip', 'calculator'],
        ]);
    },
    showPhaseGuide(phase, context, onComplete) {
        const p = context;
        const lessons = {
            operator: {
                title: 'CHOOSE THE OPERATOR',
                slides: [[
                    p.asked === 'broadcast'
                        ? 'We start at the network and need the last address. Choose {{highlight:+}} to move forward by the block.'
                        : 'We start at the broadcast and need the first address. Choose {{highlight:-}} to move back by the block.',
                    'Aim with {{highlight:A/D or the mouse}}. Auto-fire breaks a barrier in {{highlight:10 hits}}; its symbol floats into the first slot.',
                ]], focus: [['barriers', 'operator']],
            },
            blockSize: {
                title: 'LOAD THE BLOCK SIZE',
                slides: [[
                    'You found h = ' + p.hostBits + '. Choose {{highlight:2^' + p.hostBits + ' = ' + p.blockSize.toLocaleString('en-US') + ' total addresses}} for the second slot.',
                    'Aim at that number. The bar already supplies {{highlight:' + p.correction + '}}; no third choice is needed.',
                ]], focus: [['barriers', 'blockSize', 'correction']],
            },
            boss: {
                title: 'TEST YOUR FORMULA',
                slides: [[
                    '{{highlight:Five auto-fire hits}} let APEX test both choices in your assembled formula.',
                    'Correct: APEX loses {{highlight:one HP segment}} and drops the address. Watch it float into the {{highlight:answer field}}.',
                ], [
                    'You have {{highlight:three hearts}}. A wrong formula makes APEX attack: lose one heart, then face a new question.',
                    'Clear {{highlight:all three boss HP segments}} before losing your hearts. Later questions use different values.',
                ]], focus: [['boss', 'bossHP', 'formula'], ['hearts', 'bossHP']],
            },
        };
        const lesson = lessons[phase];
        if (!lesson) return false;
        return this._show('phase.' + phase, lesson.title, lesson.slides, onComplete, lesson.focus);
    },
    showComplete(onComplete) {
        return this._show('complete', 'SECTOR SECURED', [[
            'APEX defeated. Remember: host bits -> 2^h total addresses -> endpoint.',
            'The same familiar steps will help you place subnets in VLSM.',
        ]], onComplete);
    },
    showRecovery(context, onComplete) {
        return this._show('recovery', 'RECALIBRATE', [[
            'Try again: h = default host bits - borrowed bits, or use the given h.',
            'Block size = 2^h total addresses. Keep the network and broadcast addresses.',
            'Broadcast = network + block - 1. Network = broadcast - block + 1.',
        ]], onComplete);
    },
    showRollback(onComplete) {
        return this._show('rollback', 'TRACE COMPROMISED', [[
            'Pulling back one sector to protect the relay.',
            'Review host bits and total address counts before returning to APEX.',
        ]], onComplete);
    },
    _show(kind, title, slides, onComplete, focusTargets) {
        const dm = IP2Live.DialogueManager;
        if (!dm || !dm.registerDialogue || !dm.start) {
            if (typeof onComplete === 'function') onComplete();
            return false;
        }
        const id = 'stage3.subnetblaster.' + kind + '.' + (++this._dialogueSerial);
        const during = kind === 'preparation' || kind.startsWith('phase.');
        dm.registerDialogue(id, { title, speaker: 'SYSTEM', slides, timing: kind === 'intro' ? 'before' : during ? 'during' : 'after',
            bindings: { mapId: 13, gameplayId: 'ip_cidr_quarantine_matrix', trigger: 'tutorial.' + kind },
            hideQuestPanel: true, lockMovement: true, onComplete: onComplete || null });
        return dm.start(id, { source: 'IPCIDRQuarantineMatrixTutorial',
            gameplayFocus: focusTargets || [], compactPanel: true });
    },
};
IP2Live.IPCIDRQuarantineMatrixTutorial = IPCIDRQuarantineMatrixTutorial;
window.IP2LiveIPCIDRQuarantineMatrixTutorial = IPCIDRQuarantineMatrixTutorial;
