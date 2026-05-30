/**
 * IP2Live - Stage 3 Level 2 dual-pair connector tutorial dialogue helpers.
 */

const IPCIDRQuarantineMatrixTutorial = {
    VERSION: 'ip-cidr-quarantine-matrix-tutorial-20260530-dual-connector-01',
    _dialogueSerial: 0,

    showIntro(context, onComplete) {
        const c = context || {};
        return this._startDynamicDialogue('stage3.cidrmatrix.intro.', {
            title: 'MATRIX QUARANTINE',
            speaker: 'SYSTEM',
            timing: 'before',
            slides: [
                [
                    'CIDR QUARANTINE MATRIX - Your Mission',
                    'APEX split the relay into two unstable node pairs.',
                    'Draw two clean connector paths:',
                    '  Pair 1: A1 to B1.',
                    '  Pair 2: A2 to B2.',
                    'Each route must match its CIDR movement-bit target.',
                    'Red virus nodes are traps. Do not route through them.',
                ],
                [
                    'THE INTERFACE',
                    'GRID: blue nodes are endpoints, red nodes are viruses.',
                    'YELLOW route = Pair 1. CYAN route = Pair 2.',
                    '',
                    'Click a pair card or press TAB to switch active pair.',
                    'Drag or click adjacent tiles to extend the active route.',
                    'UNDO removes one tile. CLEAR resets the active pair.',
                    'SUBMIT validates both connectors together.',
                ],
                [
                    'YOUR GOAL - Two routes, one matrix',
                    (c.pairLabel || 'Pair 1') + ': ' + (c.ipAddress || '?') + '/' + (c.originalCIDR || '?'),
                    '',
                    'Move weights: R=+1, L=+2, U=+3, D=+4.',
                    'Target CIDR for the active pair: /' + (c.targetCIDR || '?'),
                    'Connect both pairs, avoid viruses, then confirm.',
                    'Press ENTER or click to begin Pair 1.',
                ],
            ],
            onComplete,
        });
    },

    showStep(step, context, onComplete) {
        const c = context || {};
        const pair = Number(c.pairIndex || 0) + 1;
        const total = Number(c.totalPairs || 2);
        const slides = step === 'submit' ? [[
            'BOTH PAIRS LINKED - Submit now',
            'Final check:',
            '  Pair 1 reaches B1.',
            '  Pair 2 reaches B2.',
            '  No route touches a virus.',
            '  Both routes match their CIDR targets.',
            '',
            'Press SUBMIT or ENTER to run the matrix simulation.',
        ]] : [[
            'PAIR ' + pair + ' of ' + total + ' - Build this connector',
            'Select Pair ' + pair + ' on the right or press TAB.',
            '',
            'Start at ' + (c.startLabel || 'A') + ' and reach ' + (c.endLabel || 'B') + '.',
            'Target: /' + (c.originalCIDR || '?') + ' +' + (c.targetAddedBits || '?') + ' = /' + (c.targetCIDR || '?') + '.',
            'Use turns to route around red virus nodes.',
            '',
            'I will advance after this pair is linked.',
        ]];

        return this._startDynamicDialogue('stage3.cidrmatrix.step.', {
            title: 'GUIDED MATRIX',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: { mapId: 12, gameplayId: 'ip_cidr_quarantine_matrix', trigger: 'tutorial.step' },
            slides,
            onComplete,
        });
    },

    showFeedback(reason, context, onComplete) {
        const c = context || {};
        const pair = Number(c.pairIndex || 0) + 1;
        const text = {
            selectZone: [
                'Wrong pair selected.',
                'Click Pair ' + pair + ' on the right panel,',
                'or press TAB until Pair ' + pair + ' is highlighted.',
            ],
            prefix: [
                'Pair ' + pair + ' has the wrong movement-bit total.',
                'Adjust the connector route until it reaches /' + (c.targetCIDR || '?') + '.',
                'Remember: R=+1, L=+2, U=+3, D=+4.',
            ],
            offset: [
                'Pair ' + pair + ' has not reached the correct endpoint.',
                'Continue the route from ' + (c.startLabel || 'A') + ' to ' + (c.endLabel || 'B') + '.',
                'Avoid red virus nodes.',
            ],
            submitEarly: [
                'Not ready to submit yet.',
                'Both node pairs must be linked first.',
                'Finish Pair ' + pair + ', then the matrix can validate.',
            ],
            submitWrong: [
                'Simulation rejected the dual connector layout.',
                'Check for a virus hit, wrong endpoint, path overlap, or wrong CIDR bits.',
                'Pair ' + pair + ' target: /' + (c.targetCIDR || '?'),
            ],
            submitReady: [
                'Both pairs are linked - press SUBMIT now.',
                'Do not adjust the routes further.',
                'Press SUBMIT or ENTER to validate.',
            ],
        };

        return this._startDynamicDialogue('stage3.cidrmatrix.feedback.', {
            title: 'MATRIX FEEDBACK',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: { mapId: 12, gameplayId: 'ip_cidr_quarantine_matrix', trigger: 'tutorial.feedback' },
            slides: [text[reason] || text.offset],
            onComplete,
        });
    },

    showComplete(onComplete) {
        return this._startDynamicDialogue('stage3.cidrmatrix.complete.', {
            title: 'MATRIX STABLE',
            speaker: 'SYSTEM',
            timing: 'after',
            bindings: { mapId: 12, gameplayId: 'ip_cidr_quarantine_matrix', trigger: 'tutorial.completed' },
            slides: [[
                'Matrix quarantine successful.',
                'Pair 1 linked.',
                'Pair 2 linked.',
                'Virus nodes avoided.',
                '',
                'Future nodes randomize formations, routes, and virus blockers.',
                'TAB=pair  Z=undo  R=clear  ENTER=submit.',
                'Proceeding to next objective.',
            ]],
            onComplete,
        });
    },

    showRecovery(context, onComplete) {
        return this._startDynamicDialogue('stage3.cidrmatrix.recovery.', {
            title: 'MATRIX RECOVERY',
            speaker: 'SYSTEM',
            timing: 'after',
            bindings: { mapId: 12, gameplayId: 'ip_cidr_quarantine_matrix', trigger: 'gameplay.failed' },
            slides: [[
                'Matrix collapsed. All attempts used.',
                'Routing back to tutorial node.',
                '',
                'Common mistakes:',
                '  One pair unfinished, wrong movement bits,',
                '  paths overlapping, or a virus node touched.',
                'Work one pair at a time. Link both before submitting.',
            ]],
            onComplete,
        });
    },

    showRollback(onComplete) {
        return this._startDynamicDialogue('stage3.cidrmatrix.rollback.', {
            title: 'TRACE COMPROMISED',
            speaker: 'SYSTEM',
            timing: 'after',
            bindings: { mapId: 12, gameplayId: 'ip_cidr_quarantine_matrix', trigger: 'gameplay.failed' },
            slides: [[
                'Trace compromised. APEX has our signal.',
                'Pulling back one sector to protect the relay.',
                '',
                'Rules to remember:',
                '  Connect each A node to its matching B node.',
                '  Routes cannot touch viruses or overlap each other.',
                'Rebuild from the previous level. Cold signal this time.',
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
        return dm.start(id, { source: 'IPCIDRQuarantineMatrixTutorial' });
    },
};

IP2Live.IPCIDRQuarantineMatrixTutorial = IPCIDRQuarantineMatrixTutorial;
window.IP2LiveIPCIDRQuarantineMatrixTutorial = IPCIDRQuarantineMatrixTutorial;

console.log('[IP2Live] ip_cidr_quarantine_matrix_tutorial.js loaded.');
