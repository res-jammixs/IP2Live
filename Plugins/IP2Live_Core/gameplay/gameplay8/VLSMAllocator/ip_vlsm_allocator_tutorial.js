/**
 * IP2Live - VLSM Allocator Tutorial Dialogue Helpers
 *
 * Gameplay Eight assistance dialogue for Stage 4 Level 3 VLSM infiltration.
 */

const IPVLSMAllocatorTutorial = {
    VERSION: 'ip-vlsm-allocator-tutorial-20260602-01',
    _dialogueSerial: 0,

    showIntro(context, onComplete) {
        const c = context || {};
        const parent = c.parentCIDR || '172.30.32.0/20';
        return this._startDynamicDialogue('stage4.ipvlsm.intro.', {
            title: 'VLSM INFILTRATION BRIEF',
            speaker: 'SYSTEM',
            timing: 'before',
            bindings: {
                mapId: 17,
                gameplayId: 'ip_vlsm_allocator',
                trigger: 'gameplay.before',
            },
            slides: [
                [
                    'Stage 4 Level 3 is locked behind a corporate routing grid.',
                    '',
                    'Parent block: ' + parent,
                    'Each branch terminal must receive a valid subnet before the core gate opens.',
                ],
                [
                    'This is not a quiz. You are carving address space.',
                    '',
                    'Think like an infiltrator: largest host demand first, smallest fitting CIDR,',
                    'then a clean aligned network address with no overlaps.',
                ],
                [
                    'At each branch terminal, adjust the CIDR dial and block selector.',
                    'The scanner will flag capacity leaks, misalignment, overlaps, and out-of-range blocks.',
                    '',
                    'When every branch is stable, return to the core gateway and commit the route table.',
                ],
            ],
            onComplete,
        });
    },

    showCorrection(mistake, onComplete) {
        const m = mistake || {};
        const detail = m.detail || 'The route table rejected this allocation.';
        const hint = m.hint || 'Check capacity, alignment, containment, and overlap before committing.';
        return this._startDynamicDialogue('stage4.ipvlsm.fix.', {
            title: 'VLSM DIAGNOSTIC',
            speaker: 'SYSTEM',
            timing: 'during',
            bindings: {
                mapId: 17,
                gameplayId: 'ip_vlsm_allocator',
                trigger: 'gameplay.mistake',
            },
            slides: [
                [
                    detail,
                    '',
                    hint,
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
        return dm.start(id, { source: 'IPVLSMAllocatorTutorial' });
    },
};

IP2Live.IPVLSMAllocatorTutorial = IPVLSMAllocatorTutorial;
window.IP2LiveIPVLSMAllocatorTutorial = IPVLSMAllocatorTutorial;

console.log('[IP2Live] gameplay8 VLSMAllocator tutorial.js loaded.');
