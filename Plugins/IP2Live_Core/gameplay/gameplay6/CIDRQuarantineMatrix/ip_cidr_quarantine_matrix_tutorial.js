/**
 * IP2Live - Stage 3 Level 2 CIDR Quarantine Matrix tutorial dialogue helpers.
 *
 * Tutorial flow:
 *   showIntro    → 3 slides: multi-zone concept, UI, rules
 *   showStep     → per-zone instructions + final submit
 *   showFeedback → contextual correction
 *   showComplete → success + next steps
 *   showRecovery → route back after hard fail
 *   showRollback → trace compromised, go back one level
 */

const IPCIDRQuarantineMatrixTutorial = {
    VERSION: 'ip-cidr-quarantine-matrix-tutorial-20260530-03',
    _dialogueSerial: 0,

    // ─── INTRO ────────────────────────────────────────────────────────────────

    showIntro(context, onComplete) {
        const c = context || {};
        return this._startDynamicDialogue('stage3.cidrmatrix.intro.', {
            title: 'MATRIX QUARANTINE',
            speaker: 'SYSTEM',
            timing: 'before',
            slides: [
                // Slide 1 – What is the Matrix game
                [
                    'CIDR QUARANTINE MATRIX — Your Mission',
                    'APEX split the rogue AI into multiple SHARDS.',
                    'Build one CIDR cage per shard so that:',
                    '  ✓ Every red shard is fully inside one cage.',
                    '  ✗ Cages must NOT overlap each other.',
                    '  ✗ No cyan protected nodes inside any cage.',
                    'Tune all zones, then submit the full matrix.',
                ],
                // Slide 2 – UI overview
                [
                    'THE INTERFACE',
                    'GRID: RED = AI shard, CYAN = protected,',
                    '  YELLOW = active zone, BLUE = other zones.',
                    '',
                    'ZONE SLOTS (right): click a slot to select it.',
                    'OFFSET [ < > ] — slide active zone left/right.',
                    'PREFIX [ /+ /- ] — resize active zone.',
                    'TAB — switch to next zone.  SUBMIT — validate all.',
                ],
                // Slide 3 – Goal
                [
                    'YOUR GOAL — One zone at a time',
                    'Relay: ' + (c.baseCIDR || '?'),
                    '',
                    'For each zone:',
                    '  A. Select the zone slot.',
                    '  B. Set PREFIX to correct size.',
                    '  C. Move OFFSET to cover the shard.',
                    'When all zones are set, I will tell you to submit.',
                    'Press ENTER or click to begin Zone 1.',
                ],
            ],
            onComplete,
        });
    },

    // ─── STEPS ────────────────────────────────────────────────────────────────

    showStep(step, context, onComplete) {
        const c = context || {};
        const zone = Number(c.zoneIndex || 0) + 1;
        const total = Number(c.totalZones || 2);

        const slidesByStep = {
            zone: [
                [
                    'ZONE ' + zone + ' of ' + total + ' — Tune this zone',
                    'Select ZONE ' + zone + ' slot on the right (or press TAB).',
                    '',
                    'A. PREFIX: press /+ or /- until zone ends with',
                    '   /' + (c.solutionPrefix || '?'),
                    'B. OFFSET: use < > or click grid until zone reads',
                    '   ' + (c.solutionCIDR || '?'),
                    '',
                    'I will advance you to the next zone automatically.',
                ],
            ],
            submit: [
                [
                    'ALL ZONES ALIGNED — Submit now',
                    'Final check:',
                    '  ✓ All red shards covered by a zone.',
                    '  ✓ No cyan nodes inside any zone.',
                    '  ✓ Zones do not overlap.',
                    '',
                    'Press SUBMIT (or ENTER) to run the matrix simulation.',
                ],
            ],
        };

        const slides = step === 'submit' ? slidesByStep.submit : slidesByStep.zone;
        return this._startDynamicDialogue('stage3.cidrmatrix.step.', {
            title: 'GUIDED MATRIX',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: { mapId: 12, gameplayId: 'ip_cidr_quarantine_matrix', trigger: 'tutorial.step' },
            slides,
            onComplete,
        });
    },

    // ─── FEEDBACK ─────────────────────────────────────────────────────────────

    showFeedback(reason, context, onComplete) {
        const c = context || {};
        const zone = Number(c.zoneIndex || 0) + 1;

        const text = {
            selectZone: [
                'Wrong zone selected.',
                'Click ZONE ' + zone + ' slot on the right panel,',
                'or press TAB until ZONE ' + zone + ' is highlighted.',
            ],
            prefix: [
                'ZONE ' + zone + ' has the wrong size.',
                'Press /+ or /- to adjust the PREFIX.',
                'Target: ' + (c.solutionCIDR || '?'),
            ],
            offset: [
                'ZONE ' + zone + ' is the right size but wrong position.',
                'Use < > or click the red shard on the grid.',
                'Target: ' + (c.solutionCIDR || '?'),
            ],
            submitEarly: [
                'Not ready to submit — still tuning ZONE ' + zone + '.',
                'Finish each zone first.',
                'I will tell you when to submit.',
            ],
            submitWrong: [
                'Simulation rejected the matrix layout.',
                'Check each zone slot — at least one is incorrect.',
                'ZONE ' + zone + ' target: ' + (c.solutionCIDR || '?'),
            ],
            submitReady: [
                'All zones set — press SUBMIT now.',
                'Do not adjust any zone further.',
                'Press SUBMIT (or ENTER) to validate.',
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

    // ─── COMPLETE ─────────────────────────────────────────────────────────────

    showComplete(onComplete) {
        return this._startDynamicDialogue('stage3.cidrmatrix.complete.', {
            title: 'MATRIX STABLE',
            speaker: 'SYSTEM',
            timing: 'after',
            bindings: { mapId: 12, gameplayId: 'ip_cidr_quarantine_matrix', trigger: 'tutorial.completed' },
            slides: [
                [
                    'Matrix quarantine successful.',
                    '✓ All shards contained.',
                    '✓ No overlaps between zones.',
                    '✓ No protected nodes captured.',
                    '',
                    'Future nodes randomize shards and protected positions.',
                    'TAB=zone  /+/-=size  < >=move  ENTER=submit.',
                    'Proceeding to next objective.',
                ],
            ],
            onComplete,
        });
    },

    // ─── RECOVERY ─────────────────────────────────────────────────────────────

    showRecovery(context, onComplete) {
        return this._startDynamicDialogue('stage3.cidrmatrix.recovery.', {
            title: 'MATRIX RECOVERY',
            speaker: 'SYSTEM',
            timing: 'after',
            bindings: { mapId: 12, gameplayId: 'ip_cidr_quarantine_matrix', trigger: 'gameplay.failed' },
            slides: [
                [
                    'Matrix collapsed. All attempts used.',
                    'Routing back to tutorial node.',
                    '',
                    'Common mistakes:',
                    '  Wrong PREFIX, wrong OFFSET, zones overlapping,',
                    '  or cyan node inside a cage.',
                    'Work one zone at a time. Select → Resize → Position.',
                    'Submit only when I confirm all zones are aligned.',
                ],
            ],
            onComplete,
        });
    },

    // ─── ROLLBACK ─────────────────────────────────────────────────────────────

    showRollback(onComplete) {
        return this._startDynamicDialogue('stage3.cidrmatrix.rollback.', {
            title: 'TRACE COMPROMISED',
            speaker: 'SYSTEM',
            timing: 'after',
            bindings: { mapId: 12, gameplayId: 'ip_cidr_quarantine_matrix', trigger: 'gameplay.failed' },
            slides: [
                [
                    'Trace compromised. APEX has our signal.',
                    'Pulling back one sector to protect the relay.',
                    '',
                    'Rules to remember:',
                    '  Each cage must cover exactly its assigned shard.',
                    '  Cages cannot overlap. Cyan = off limits.',
                    'Rebuild from the previous level. Cold signal this time.',
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
        return dm.start(id, { source: 'IPCIDRQuarantineMatrixTutorial' });
    },
};

IP2Live.IPCIDRQuarantineMatrixTutorial = IPCIDRQuarantineMatrixTutorial;
window.IP2LiveIPCIDRQuarantineMatrixTutorial = IPCIDRQuarantineMatrixTutorial;

console.log('[IP2Live] ip_cidr_quarantine_matrix_tutorial.js loaded.');
