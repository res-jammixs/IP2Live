/**
 * IP2Live - Stage 3 Level 1 CIDR Quarantine tutorial dialogue helpers.
 *
 * Tutorial flow:
 *   showIntro  → 3 slides: game concept, UI layout, your goal
 *   showStep 1 → set the PREFIX
 *   showStep 2 → move the OFFSET
 *   showStep 3 → press SUBMIT
 *   showFeedback(reason) → contextual correction
 *   showComplete → success + what comes next
 *   showRecovery → route back after hard fail
 */

const IPCIDRQuarantineTutorial = {
    VERSION: 'ip-cidr-quarantine-tutorial-20260530-03',
    _dialogueSerial: 0,

    // ─── INTRO ────────────────────────────────────────────────────────────────

    showIntro(context, onComplete) {
        const c = context || {};
        return this._startDynamicDialogue('stage3.cidrquarantine.intro.', {
            title: 'QUARANTINE BRIEF',
            speaker: 'SYSTEM',
            timing: 'before',
            slides: [
                // Slide 1 – What is this game
                [
                    'CIDR QUARANTINE — Your Mission',
                    'A rogue AI is hiding inside a network segment.',
                    'Draw a CIDR cage (a block of IP addresses) that traps',
                    'all infected addresses without capturing protected nodes.',
                    '',
                    'Too small = AI escapes. Too large = you hit friendly nodes.',
                    'Find the tightest block that covers the rogue span exactly.',
                ],
                // Slide 2 – UI overview
                [
                    'THE INTERFACE',
                    'GRID (left): each cell = one address in the relay.',
                    '  RED   = rogue AI  (must be INSIDE your cage)',
                    '  CYAN  = protected (must stay OUTSIDE your cage)',
                    '  YELLOW = your current quarantine zone',
                    '',
                    'CONTROLS (right):',
                    '  OFFSET  [ <  > ] — slide zone left / right',
                    '  PREFIX  [ /+  /- ] — make zone larger / smaller',
                    '  SUBMIT — lock and validate your cage',
                ],
                // Slide 3 – Goal for this puzzle
                [
                    'YOUR GOAL — 3 Steps',
                    'Relay: ' + (c.baseCIDR || '?') + '   Demand: ' + (c.hostDemand || '?') + ' hosts',
                    '',
                    'Step 1 — Set PREFIX to the right block size.',
                    'Step 2 — Move OFFSET so cage covers the red span.',
                    'Step 3 — Press SUBMIT to validate.',
                    '',
                    'I will guide you and correct mistakes in real time.',
                    'Press ENTER or click to begin Step 1.',
                ],
            ],
            onComplete,
        });
    },

    // ─── STEPS ────────────────────────────────────────────────────────────────

    showStep(step, context, onComplete) {
        const c = context || {};
        const n = Number(step) || 1;

        const slidesByStep = {
            1: [
                [
                    'STEP 1 of 3 — Set the PREFIX (block size)',
                    'Host demand: ' + (c.hostDemand || '?') + '  |  Target prefix: /' + (c.solutionPrefix || '?'),
                    '',
                    '  /+  makes the block LARGER (lower prefix number)',
                    '  /-  makes the block SMALLER (higher prefix number)',
                    '',
                    'Press /+ or /- until SELECTED ZONE ends with',
                    '/' + (c.solutionPrefix || '?') + '.  Watch "Usable hosts" — it must',
                    'be >= host demand but as tight as possible.',
                ],
            ],
            2: [
                [
                    'STEP 2 of 3 — Move the OFFSET (zone position)',
                    'Block size is correct. Now position it.',
                    '',
                    '  <  slides zone LEFT     >  slides zone RIGHT',
                    '  Or CLICK the red area on the grid directly.',
                    '',
                    'Target CIDR: ' + (c.solutionCIDR || '?'),
                    'Move until SELECTED ZONE reads: ' + (c.solutionCIDR || '?'),
                ],
            ],
            3: [
                [
                    'STEP 3 of 3 — Submit',
                    'Quick check before you submit:',
                    '  ✓ Yellow zone covers all RED cells.',
                    '  ✓ No CYAN cells are inside the yellow zone.',
                    '  ✓ SELECTED ZONE = ' + (c.solutionCIDR || '?'),
                    '',
                    'Press SUBMIT (or ENTER) to run the simulation.',
                ],
            ],
        };

        return this._startDynamicDialogue('stage3.cidrquarantine.step.', {
            title: 'GUIDED QUARANTINE',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: { mapId: 11, gameplayId: 'ip_cidr_quarantine', trigger: 'tutorial.step' },
            slides: slidesByStep[n] || slidesByStep[1],
            onComplete,
        });
    },

    // ─── FEEDBACK ─────────────────────────────────────────────────────────────

    showFeedback(reason, context, onComplete) {
        const c = context || {};
        const text = {
            prefixTooSmall: [
                'Block too LARGE — prefix is too low.',
                'Press  /-  to shrink the block.',
                'Target prefix: /' + (c.solutionPrefix || '?'),
            ],
            prefixTooLarge: [
                'Block too SMALL — cannot fit ' + (c.hostDemand || '?') + ' hosts.',
                'Press  /+  to widen the block.',
                'Target prefix: /' + (c.solutionPrefix || '?'),
            ],
            offset: [
                'Zone is the right size but not over the rogue span.',
                'Use  <  >  or click the red cells on the grid.',
                'Target CIDR: ' + (c.solutionCIDR || '?'),
            ],
            submitEarly: [
                'Not ready to submit yet.',
                'Complete the current step first:',
                '  Step 1 → prefix /' + (c.solutionPrefix || '?'),
                '  Step 2 → position the cage over the red span.',
                'I will tell you when to submit.',
            ],
            submitWrong: [
                'Simulation rejected. Zone does not match solution.',
                'Reset to: ' + (c.solutionCIDR || '?'),
                'Use /+ /- to fix size, then < > to fix position.',
            ],
            prefixFirst: [
                'Set PREFIX first before moving the zone.',
                'Press /+ or /- until zone reads /' + (c.solutionPrefix || '?') + '.',
                'Then you can position it.',
            ],
            submitReady: [
                'Zone is already aligned — submit now!',
                'Do not adjust PREFIX or OFFSET further.',
                'Press SUBMIT (or ENTER) to validate.',
            ],
        };

        return this._startDynamicDialogue('stage3.cidrquarantine.feedback.', {
            title: 'TUTORIAL FEEDBACK',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: { mapId: 11, gameplayId: 'ip_cidr_quarantine', trigger: 'tutorial.feedback' },
            slides: [text[reason] || text.offset],
            onComplete,
        });
    },

    // ─── COMPLETE ─────────────────────────────────────────────────────────────

    showComplete(onComplete) {
        return this._startDynamicDialogue('stage3.cidrquarantine.complete.', {
            title: 'QUARANTINE STABLE',
            speaker: 'SYSTEM',
            timing: 'after',
            bindings: { mapId: 11, gameplayId: 'ip_cidr_quarantine', trigger: 'tutorial.completed' },
            slides: [
                [
                    'Quarantine successful.',
                    '✓ Sized cage with correct PREFIX.',
                    '✓ Positioned cage over the rogue span.',
                    '✓ No protected nodes captured.',
                    '',
                    'Future nodes randomize their givens.',
                    'Read demand → resize → position → submit.',
                    'Proceeding to next objective.',
                ],
            ],
            onComplete,
        });
    },

    // ─── RECOVERY ─────────────────────────────────────────────────────────────

    showRecovery(context, onComplete) {
        return this._startDynamicDialogue('stage3.cidrquarantine.recovery.', {
            title: 'ROUTE RECOVERY',
            speaker: 'SYSTEM',
            timing: 'after',
            bindings: { mapId: 11, gameplayId: 'ip_cidr_quarantine', trigger: 'gameplay.failed' },
            slides: [
                [
                    'Quarantine collapsed. All attempts used.',
                    'Routing back to tutorial node.',
                    '',
                    'Recap:',
                    '  1. PREFIX — resize until usable hosts >= demand.',
                    '  2. OFFSET — cover all red cells, avoid cyan.',
                    '  3. SUBMIT.',
                    'Good luck on your next run.',
                ],
            ],
            onComplete,
        });
    },

    // ─── INTERNAL ─────────────────────────────────────────────────────────────

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
