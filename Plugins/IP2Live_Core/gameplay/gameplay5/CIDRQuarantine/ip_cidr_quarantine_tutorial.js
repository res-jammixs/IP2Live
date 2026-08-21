/**
 * IP2Live - Stage 3 Level 2 path connector tutorial dialogue helpers.
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
    VERSION: 'ip-cidr-quarantine-path-tutorial-20260821-02',
    _dialogueSerial: 0,

    showIntro(context, onComplete) {
        const c = context || {};
        return this._startDynamicDialogue('stage3.cidrquarantine.intro.', {
            title: 'PATH QUARANTINE BRIEF',
            speaker: 'SYSTEM',
            timing: 'before',
            slides: [
                [
                    'STAGE 3 LEVEL 2 - CIDR Quarantine',
                    'The Host-Power Reactors prepared you for this first quarantine sector.',
                    'This sector introduces path-based CIDR containment.',
                    'One infected relay must be isolated with a clean connector route.',
                    '',
                    'Blue node A is the start.',
                    'Blue node B is the destination.',
                    'Red virus nodes are blocked and may mutate while you work.',
                    '',
                    'Retries are unlimited at this calibration node.',
                ],
                [
                    'READ THE RIGHT PANEL',
                    'It shows only the clues you need:',
                    '',
                    '1. Movement values for Right, Left, Up, and Down.',
                    '2. Given IP, class, original CIDR, and required hosts.',
                    '3. Live host-power h, derived CIDR, and usable-host capacity.',
                    '',
                    'The movement values are randomized per quest, so always read them first.',
                ],
                [
                    'THIS TUTORIAL GIVEN',
                    'Relay: ' + (c.ipAddress || '?') + '/' + (c.originalCIDR || '?') + '   Class ' + (c.ipClass || '?'),
                    'Needed hosts: ' + (c.requiredHosts || '?'),
                    'Host-power target: h = ' + (c.optimizedHostBits || '?') + ' gives ' + (c.optimizedCapacity || '?') + ' usable hosts.',
                    'Derived prefix: 32 - h = /' + (c.targetCIDR || '?') + '.',
                    '',
                    c.moveWeightsLine || 'Read the movement values on the right panel.',
                    '',
                    'Goal: connect A to B while the movement total equals h.',
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
                    'STEP 1 of 4 - Make the first move',
                    'Start from blue node A at ' + (c.startLabel || '?') + '.',
                    'Drag to an adjacent tile, click an adjacent tile, or use arrow/WASD keys.',
                    '',
                    c.moveWeightsLine || 'Each direction adds a different amount to host power h.',
                    '',
                    'Do not jump over tiles. The connector grows one adjacent tile at a time.',
                ],
            ],
            2: [
                [
                    'STEP 2 of 4 - Watch the live calculation',
                    'Each tile movement adds to host power h.',
                    '',
                    'Current host power: h = ' + (c.currentHostBits || 0),
                    'Derived CIDR: 32 - h = /' + (c.currentCIDR || '?'),
                    'Needed hosts: ' + (c.requiredHosts || '?'),
                    'Usable capacity: 2^' + (c.currentHostBits || 0) + ' - 2 = ' + (c.currentCapacity || 0),
                    '',
                    'Keep routing toward blue node B at ' + (c.endLabel || '?') + '.',
                ],
            ],
            3: [
                [
                    'STEP 3 of 4 - Connect, then optimize',
                    'Reaching B is required, but it is not the whole answer.',
                    '',
                    'Target host power: h = ' + (c.optimizedHostBits || '?'),
                    'Derived target CIDR: /' + (c.targetCIDR || '?'),
                    'Target capacity: ' + (c.optimizedCapacity || '?') + ' hosts.',
                    '',
                    'If usable capacity is too small, add more host-power movement.',
                    'If it is larger than needed, undo and use a smaller total.',
                ],
            ],
            4: [
                [
                    'STEP 4 of 4 - Confirm path',
                    'Confirm only when:',
                    '',
                    '1. Blue node A reaches blue node B.',
                    '2. No red virus tile is touched.',
                    '3. The path total equals h = ' + (c.optimizedHostBits || '?') + '.',
                    '4. 2^h - 2 fits the required hosts without extra waste.',
                    '',
                    'Press CONFIRM PATH or ENTER.',
                ],
            ],
        };

        return this._startDynamicDialogue('stage3.cidrquarantine.step.', {
            title: 'GUIDED PATH QUARANTINE',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: { mapId: 12, gameplayId: 'ip_cidr_quarantine', trigger: 'tutorial.step' },
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
                'The path connected, but one rule is still wrong.',
                'Needed hosts: ' + (c.requiredHosts || '?'),
                'Current h=' + (c.currentHostBits || 0) + ' gives ' + (c.currentCapacity || 0) + ' usable hosts.',
                'Target h=' + (c.optimizedHostBits || '?') + ' gives ' + (c.optimizedCapacity || '?') + ' usable hosts.',
                'Use UNDO or click an earlier tile to rewind.',
            ],
            submitReady: [
                'Connector is ready to validate.',
                'The route reaches the second blue node and matches the optimized CIDR.',
                'Needed hosts: ' + (c.requiredHosts || '?'),
                'Current host power h=' + (c.currentHostBits || 0) + ' gives ' + (c.currentCapacity || 0) + ' usable hosts.',
                'Derived target CIDR: /' + (c.targetCIDR || '?') + '.',
            ],
            virus: [
                'Virus tile blocked.',
                'Route around red nodes. They are rogue AI detection points.',
            ],
            adjacent: [
                'Connector move rejected.',
                'Move one tile at a time: up, down, left, or right.',
                'Diagonal movement and jumps are not allowed.',
            ],
            too_small: [
                'Capacity is too small.',
                'The current h leaves fewer usable hosts than required.',
                'Add movement values until 2^h - 2 can hold ' + (c.requiredHosts || '?') + ' hosts.',
            ],
            too_big: [
                'Capacity is too large.',
                'The route creates extra exposed host space.',
                'Undo or rewind and use a smaller host-power total.',
            ],
            not_optimized: [
                'CIDR is not optimized yet.',
                'Current CIDR: /' + (c.currentCIDR || '?') + '.',
                'Target CIDR: /' + (c.targetCIDR || '?') + '.',
                c.moveWeightsLine || 'Use the movement values to adjust host power h.',
            ],
            virus_overrun: [
                'The virus pressure filled the grid.',
                'Attempt reset automatically.',
                'Unlimited retries remain available at this calibration node.',
                'Try building a cleaner route before the pressure rises.',
            ],
        };

        return this._startDynamicDialogue('stage3.cidrquarantine.feedback.', {
            title: 'ROUTE FEEDBACK',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: { mapId: 12, gameplayId: 'ip_cidr_quarantine', trigger: 'tutorial.feedback' },
            slides: [text[reason] || text.submitWrong],
            onComplete,
        });
    },

    showComplete(onComplete) {
        return this._startDynamicDialogue('stage3.cidrquarantine.complete.', {
            title: 'PATH QUARANTINE STABLE',
            speaker: 'SYSTEM',
            timing: 'after',
            bindings: { mapId: 12, gameplayId: 'ip_cidr_quarantine', trigger: 'tutorial.completed' },
            slides: [
                [
                    'Quarantine successful.',
                    'Blue nodes connected.',
                    'Virus nodes avoided.',
                    'Animated CIDR calculation reached the optimized capacity.',
                    '',
                    'Future nodes change layout, movement values, IP class, and host demand.',
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
            bindings: { mapId: 12, gameplayId: 'ip_cidr_quarantine', trigger: 'gameplay.failed' },
            slides: [
                [
                    'Connector collapsed. All attempts used.',
                    'Routing back to the calibration node.',
                    '',
                    'Recap:',
                    '1. Connect blue node A to blue node B.',
                    '2. Avoid red virus nodes.',
                    '3. Read the randomized movement values.',
                    '4. Make the path total equal the smallest h where 2^h - 2 fits.',
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
