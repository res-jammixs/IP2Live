/**
 * IP2Live - Stage 3 Level 2 multi-pair connector tutorial dialogue helpers.
 */

const IPCIDRQuarantineMatrixTutorial = {
    VERSION: 'ip-cidr-quarantine-matrix-tutorial-20260601-01',
    _dialogueSerial: 0,

    showIntro(context, onComplete) {
        const c = context || {};
        return this._startDynamicDialogue('stage3.cidrmatrix.intro.', {
            title: 'MATRIX QUARANTINE',
            speaker: 'SYSTEM',
            timing: 'before',
            slides: [
                [
                    'STAGE 3 LEVEL 2 - CIDR Quarantine Matrix',
                    'Welcome to the second Stage 3 quarantine sector.',
                    'This sector expands quarantine routing into a multi-connector matrix.',
                    '',
                    'You must connect every A node to its matching B node.',
                    'Each pair has its own IP, host requirement, and live CIDR calculation.',
                    'Red virus nodes are blocked and may mutate while you work.',
                    '',
                    'Retries are unlimited at this calibration node.',
                ],
                [
                    'READ THE RIGHT PANEL',
                    'Each pair card shows whether that connector is open or linked.',
                    'The active-pair detail shows:',
                    '',
                    '1. Movement values for Right, Left, Up, and Down.',
                    '2. Active IP, class, original CIDR, and required hosts.',
                    '3. Live path bits, current CIDR, and current capacity.',
                    '',
                    'The movement values are randomized per quest. Read them every time.',
                ],
                [
                    'HOW TO CONTROL THE MATRIX',
                    'Click a pair card or press TAB to switch the active pair.',
                    'Drag, click adjacent tiles, or use arrow/WASD keys to build the active route.',
                    'Use Z to undo and R to clear the active pair.',
                    '',
                    'Routes cannot touch viruses, endpoints from other pairs, or each other.',
                ],
                [
                    'FIRST PAIR GIVEN',
                    (c.pairLabel || 'Pair 1') + ': ' + (c.ipAddress || '?') + '/' + (c.originalCIDR || '?'),
                    'Class ' + (c.ipClass || '?') + '   Required hosts: ' + (c.requiredHosts || '?'),
                    '',
                    c.moveWeightsLine || 'Read movement values on the right panel.',
                    'Target: /' + (c.originalCIDR || '?') + ' +' + (c.targetAddedBits || '?') + ' = /' + (c.targetCIDR || '?') + '.',
                    '',
                    'Begin with Pair 1. I will guide the next pair after it links.',
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
            'ALL PAIRS LINKED - Submit now',
            'Final check:',
            '1. Every A node reaches its matching B node.',
            '2. No route touches a red virus.',
            '3. Routes do not overlap each other.',
            '4. Every pair matches its optimized CIDR.',
            '',
            'Press SUBMIT or ENTER to run the matrix simulation.',
        ]] : [[
            'PAIR ' + pair + ' of ' + total + ' - Build this connector',
            'Select Pair ' + pair + ' on the right or press TAB.',
            '',
            'Start at ' + (c.startLabel || 'A') + ' and reach ' + (c.endLabel || 'B') + '.',
            'Target: /' + (c.originalCIDR || '?') + ' +' + (c.targetAddedBits || '?') + ' = /' + (c.targetCIDR || '?') + '.',
            'Required hosts: ' + (c.requiredHosts || '?') + '.',
            'Current CIDR: /' + (c.currentCIDR || c.originalCIDR || '?') + ' with ' + (c.currentCapacity || '?') + ' hosts.',
            c.moveWeightsLine || 'Use the movement values shown on the right panel.',
            '',
            'I will advance after Pair ' + pair + ' is linked.',
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
                c.moveWeightsLine || 'Use the movement values shown on the right panel.',
            ],
            offset: [
                'Pair ' + pair + ' has not reached the correct endpoint.',
                'Continue the route from ' + (c.startLabel || 'A') + ' to ' + (c.endLabel || 'B') + '.',
                'Avoid red virus nodes.',
            ],
            submitEarly: [
                'Not ready to submit yet.',
                'All node pairs must be linked first.',
                'Finish Pair ' + pair + ', then the matrix can validate.',
            ],
            submitWrong: [
                'Simulation rejected the connector layout.',
                'Check for a virus hit, wrong endpoint, path overlap, or wrong CIDR bits.',
                'Pair ' + pair + ' target: /' + (c.targetCIDR || '?'),
            ],
            submitReady: [
                'Connector matrix is ready to validate.',
                'All pairs are linked and each route matches its optimized CIDR.',
                'Press SUBMIT or ENTER to validate.',
            ],
            adjacent: [
                'Connector move rejected.',
                'Move one tile at a time: up, down, left, or right.',
                'Diagonal movement and jumps are not allowed.',
            ],
            virus: [
                'Virus tile blocked.',
                'Route around red nodes. They corrupt the active connector.',
            ],
            overlap: [
                'Tile reserved.',
                'A connector cannot pass through another pair endpoint or route.',
                'Use a separate lane for Pair ' + pair + '.',
            ],
            disconnected: [
                'A pair is not connected yet.',
                'Finish the active pair before submitting the whole matrix.',
            ],
            not_optimized: [
                'A pair has the wrong CIDR total.',
                'Current CIDR: /' + (c.currentCIDR || '?') + '.',
                'Target CIDR: /' + (c.targetCIDR || '?') + '.',
                c.moveWeightsLine || 'Use the movement values to change the path-bit total.',
            ],
            too_small: [
                'Host capacity is too small.',
                'This pair needs ' + (c.requiredHosts || '?') + ' hosts.',
                'Add movement bits until the active CIDR can hold the requirement.',
            ],
            too_big: [
                'Host capacity is too large.',
                'Undo or clear the active pair and use fewer movement bits.',
            ],
            virus_overrun: [
                'The virus pressure filled the matrix.',
                'Attempt reset automatically.',
                'Unlimited retries remain available at this calibration node.',
                'Work one pair at a time and submit once all pair cards say LINKED.',
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
                'All node pairs linked.',
                'Virus nodes avoided.',
                '',
                'Future nodes randomize pair count, movement values, formations, and virus blockers.',
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
                'Routing back to the calibration node.',
                '',
                'Common mistakes:',
                '  One pair unfinished, wrong movement bits,',
                '  paths overlapping, or a virus node touched.',
                'Work one pair at a time. Link every pair before submitting.',
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
