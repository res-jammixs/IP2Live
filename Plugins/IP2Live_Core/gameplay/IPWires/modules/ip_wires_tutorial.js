/**
 * IP2Live - IP Wires Tutorial Dialogue Helpers
 *
 * Dynamic dialogue content for the first Stage 1 Level 1 wire gameplay.
 * Loaded before ip_wires_gameplay.js.
 */

const IPWiresTutorial = {
    VERSION: 'ip-wires-tutorial-20260523-01',
    _dialogueSerial: 0,

    classRanges: {
        A: '1 to 126',
        B: '128 to 191',
        C: '192 to 223',
        D: '224 to 239',
    },

    showMistakeAnalysis(mistakes, attemptsRemaining, onComplete) {
        const dm = IP2Live.DialogueManager;
        if (!dm || typeof dm.registerDialogue !== 'function' || typeof dm.start !== 'function') {
            if (typeof onComplete === 'function') onComplete();
            return false;
        }

        const list = Array.isArray(mistakes) ? mistakes : [];
        const slides = [
            [
                'REAL-TIME PACKET ANALYSIS COMPLETE.',
                '',
                'I found ' + list.length + ' unstable wire' + (list.length === 1 ? '' : 's') + ' in that patch.',
                'Correct wires are stable. The wrong wires have been disconnected.',
            ],
        ];

        for (let i = 0; i < list.length; i += 2) {
            const slide = [];
            for (let j = i; j < list.length && j < i + 2; j++) {
                const mistake = list[j];
                slide.push(
                    mistake.leftLabel + ' belongs to Class ' + mistake.sourceClass +
                    ', but you connected it to Class ' + mistake.targetClass + '.'
                );
                slide.push(
                    'Remember: Class ' + mistake.sourceClass +
                    ' uses first-octet values from ' + this.classRanges[mistake.sourceClass] + '.'
                );
                if (j < list.length - 1 && j < i + 1) slide.push('');
            }
            slides.push(slide);
        }

        slides.push([
            'Try it again, Infiltrator.',
            'You have ' + attemptsRemaining + ' chance' + (attemptsRemaining === 1 ? '' : 's') + ' left before the packets shift.',
            '',
            'The APEX defense layer keeps rearranging these packets to stop intruders.',
            'You can do it.',
        ]);

        return this._startDynamicDialogue('stage1.ipwires.tutorial.analysis.', {
            title: 'WIRE ANALYSIS',
            speaker: 'SYSTEM',
            slides,
            onComplete,
        });
    },

    showPacketsShifted(onComplete) {
        return this._startDynamicDialogue('stage1.ipwires.tutorial.shifted.', {
            title: 'PACKET SHIFT',
            speaker: 'SYSTEM',
            slides: [
                [
                    'Oh no!',
                    'They noticed us and shifted the packets again.',
                    '',
                    'Step back onto the wire node when you are ready.',
                    'The next panel will be a fresh randomized packet set.',
                ],
            ],
            onComplete,
        });
    },

    showStageRepairReset(failedLabel, onComplete) {
        const label = failedLabel || 'the active wire node';
        return this._startDynamicDialogue('stage1.ipwires.recovery.reset.', {
            title: 'LEVEL INSTABILITY',
            speaker: 'SYSTEM',
            slides: [
                [
                    'Oh no!',
                    'Too many packet errors tripped the APEX rollback circuit.',
                    '',
                    'The first Level 1 lever repair is broken again and needs fixing.',
                ],
                [
                    'Repair the first lever again.',
                    'After it stabilizes, I will route you back to ' + label + '.',
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
            hideQuestPanel: true,
            lockMovement: true,
            onComplete: definition.onComplete || null,
        });
        return dm.start(id, { source: 'IPWiresTutorial' });
    },
};

IP2Live.IPWiresTutorial = IPWiresTutorial;
window.IP2LiveIPWiresTutorial = IPWiresTutorial;

console.log('[IP2Live] ip_wires_tutorial.js loaded.');
