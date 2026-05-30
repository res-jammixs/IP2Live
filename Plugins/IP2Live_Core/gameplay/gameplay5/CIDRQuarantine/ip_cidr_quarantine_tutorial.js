/**
 * IP2Live - Stage 3 Level 1 path connector tutorial dialogue helpers.
 *
 * Tutorial flow:
 *   showIntro -> 3 slides: concept, UI, goal
 *   showStep 1 -> start drawing the connector
 *   showStep 2 -> reach the second node and watch CIDR capacity
 *   showStep 3 -> confirm and watch animated calculation
 *   showFeedback(reason) -> contextual correction
 *   showComplete -> success + what comes next
 *   showRecovery -> route back after hard fail
 */

const IPCIDRQuarantineTutorial = {
    VERSION: 'ip-cidr-quarantine-path-tutorial-20260530-02',
    _dialogueSerial: 0,

    showIntro(context, onComplete) {
        const c = context || {};
        return this._startDynamicDialogue('stage3.cidrquarantine.intro.', {
            title: 'PATH QUARANTINE BRIEF',
            speaker: 'SYSTEM',
            timing: 'before',
            slides: [
                [
                    'CIDR QUARANTINE - Path Connector',
                    'Two blue network nodes must be linked by a clean wire.',
                    'Red virus nodes are rogue AI traps. Do not route through them.',
                    '',
                    'Every tile movement adds bits to the original CIDR.',
                    'The final block must fit the requested hosts efficiently.',
                ],
                [
                    'THE INTERFACE',
                    'GRID: drag or click adjacent tiles to preview a connector.',
                    'BLUE NODES: start and destination.',
                    'RED VIRUS: blocked tiles that corrupt the route.',
                    'YELLOW LINE: your preview path.',
                    '',
                    'Use UNDO, CLEAR, or click a previous tile to rewind.',
                ],
                [
                    'YOUR GOAL',
                    'Relay: ' + (c.ipAddress || '?') + '/' + (c.originalCIDR || '?') + '   Class ' + (c.ipClass || '?'),
                    'Needed hosts: ' + (c.requiredHosts || '?'),
                    '',
                    'Right adds 1, Left adds 2, Up adds 3, Down adds 4.',
                    'Find the CIDR that gives the smallest larger power-of-two capacity.',
                    'Press ENTER or click to begin.',
                ],
            ],
            onComplete,
        });
    },

    showStep(step, context, onComplete) {
        const c = context || {};
        const n = Number(step) || 1;
        const slidesByStep = {
            1: [
                [
                    'STEP 1 of 3 - Start the path',
                    'Drag from blue node A or click adjacent tiles.',
                    '',
                    'The preview panel updates live:',
                    'path bits, new CIDR, host bits, and host capacity.',
                    '',
                    'Make your first move without touching a red virus node.',
                ],
            ],
            2: [
                [
                    'STEP 2 of 3 - Reach blue node B',
                    'Continue the connector until it reaches the second blue node.',
                    '',
                    'Needed hosts: ' + (c.requiredHosts || '?'),
                    'Current CIDR: /' + (c.currentCIDR || c.originalCIDR || '?'),
                    'Current capacity: 2^' + (c.currentHostBits || '?') + ' = ' + (c.currentCapacity || '?'),
                    '',
                    'Connected is not enough. Extra capacity still exposes signal space.',
                ],
            ],
            3: [
                [
                    'STEP 3 of 3 - Confirm path',
                    'Confirm when both blue nodes are connected.',
                    '',
                    'The connector will replay tile by tile.',
                    'Watch the animated calculation:',
                    'path bits become a new CIDR, then host bits become capacity.',
                    '',
                    'Press CONFIRM PATH or ENTER.',
                ],
            ],
        };

        return this._startDynamicDialogue('stage3.cidrquarantine.step.', {
            title: 'GUIDED PATH QUARANTINE',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: { mapId: 11, gameplayId: 'ip_cidr_quarantine', trigger: 'tutorial.step' },
            slides: slidesByStep[n] || slidesByStep[1],
            onComplete,
        });
    },

    showFeedback(reason, context, onComplete) {
        const c = context || {};
        const text = {
            submitEarly: [
                'Not ready to confirm.',
                'Build the connector until it reaches the second blue node.',
                'Use adjacent tiles only and avoid red virus nodes.',
            ],
            submitWrong: [
                'Simulation rejected.',
                'The path connected, but the CIDR block was not optimized.',
                'Needed hosts: ' + (c.requiredHosts || '?'),
                'Current /' + (c.currentCIDR || '?') + ' gives ' + (c.currentCapacity || '?') + ' hosts.',
                'Use UNDO or click an earlier tile to rewind.',
            ],
            submitReady: [
                'Path is connected.',
                'Check the CIDR preview before confirming.',
                'Needed hosts: ' + (c.requiredHosts || '?'),
                'Current /' + (c.currentCIDR || '?') + ' gives ' + (c.currentCapacity || '?') + ' hosts.',
            ],
            virus: [
                'Virus tile blocked.',
                'Route around red nodes. They are rogue AI detection points.',
            ],
        };

        return this._startDynamicDialogue('stage3.cidrquarantine.feedback.', {
            title: 'TUTORIAL FEEDBACK',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: { mapId: 11, gameplayId: 'ip_cidr_quarantine', trigger: 'tutorial.feedback' },
            slides: [text[reason] || text.submitWrong],
            onComplete,
        });
    },

    showComplete(onComplete) {
        return this._startDynamicDialogue('stage3.cidrquarantine.complete.', {
            title: 'PATH QUARANTINE STABLE',
            speaker: 'SYSTEM',
            timing: 'after',
            bindings: { mapId: 11, gameplayId: 'ip_cidr_quarantine', trigger: 'tutorial.completed' },
            slides: [
                [
                    'Quarantine successful.',
                    'Blue nodes connected.',
                    'Virus nodes avoided.',
                    'Animated CIDR calculation reached the optimized capacity.',
                    '',
                    'Future nodes change layout, IP class, and host demand.',
                    'Preview first, then confirm only when the route is optimized.',
                ],
            ],
            onComplete,
        });
    },

    showRecovery(context, onComplete) {
        return this._startDynamicDialogue('stage3.cidrquarantine.recovery.', {
            title: 'ROUTE RECOVERY',
            speaker: 'SYSTEM',
            timing: 'after',
            bindings: { mapId: 11, gameplayId: 'ip_cidr_quarantine', trigger: 'gameplay.failed' },
            slides: [
                [
                    'Connector collapsed. All attempts used.',
                    'Routing back to tutorial node.',
                    '',
                    'Recap:',
                    '1. Connect blue node A to blue node B.',
                    '2. Avoid red virus nodes.',
                    '3. Add the CIDR bits that create the smallest fitting host block.',
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
        return dm.start(id, { source: 'IPCIDRQuarantineTutorial' });
    },
};

IP2Live.IPCIDRQuarantineTutorial = IPCIDRQuarantineTutorial;
window.IP2LiveIPCIDRQuarantineTutorial = IPCIDRQuarantineTutorial;

console.log('[IP2Live] ip_cidr_quarantine_tutorial.js loaded.');
