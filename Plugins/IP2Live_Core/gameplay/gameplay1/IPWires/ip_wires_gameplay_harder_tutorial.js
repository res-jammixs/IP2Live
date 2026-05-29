/**
 * IP2Live - IP Wires Harder Tutorial Helpers
 */

(function () {
    const IPWiresHarderTutorial = {
        VERSION: 'ip-wires-harder-tutorial-20260530-02',
        _dialogueSerial: 0,

        showIntro(onComplete) {
            return this._startDynamicDialogue('stage1.ipwires.harder.intro.', {
                title: 'STRICT SECURITY',
                speaker: 'SYSTEM',
                timing: 'during',
                bindings: {
                    mapId: 5,
                    gameplayId: 'ip_class_wires_harder',
                    objectiveId: 'repair_ip_wires_harder_01_tutorial',
                    trigger: 'gameplay.before',
                },
                slides: [[
                    'The security of this floor is now more strict to avoid access from outsiders.',
                    '',
                    'You will not be guided to the answers here.',
                    'Be smart and critical, and apply all your IP address knowledge.',
                    'Every new attempt can randomize the wire layout again.',
                    'There might be trick Class connectors that do not contain any IP connectors at all.',
                    'It is also possible that one Class connector may have more wires connected to it.',
                ]],
                onComplete: onComplete,
            });
        },

        showReturnToTutorial(onComplete) {
            return this._startDynamicDialogue('stage1.ipwires.harder.reset.', {
                title: 'LEVEL INSTABILITY',
                speaker: 'SYSTEM',
                timing: 'after',
                bindings: {
                    mapId: 5,
                    gameplayId: 'ip_class_wires_harder',
                    trigger: 'gameplay.failed',
                },
                slides: [[
                    'Oh no!',
                    'The first lever is destroyed again so you must fix it again.',
                    '',
                    'Return to the tutorial lever and stabilize the strict security wiring.',
                ]],
                onComplete: onComplete,
            });
        },

        showPacketsShifted(onComplete) {
            return this._startDynamicDialogue('stage1.ipwires.harder.shifted.', {
                title: 'PACKET SHIFT',
                speaker: 'SYSTEM',
                timing: 'after',
                bindings: {
                    mapId: 5,
                    gameplayId: 'ip_class_wires_harder',
                    trigger: 'gameplay.failed',
                },
                slides: [[
                    'Security pressure increased.',
                    '',
                    'The packet layout changed again. Try the strict tutorial node once more.',
                ]],
                onComplete: onComplete,
            });
        },

        showEliteEscalation(onComplete) {
            return this._startDynamicDialogue('stage1.ipwires.harder.elites.', {
                title: 'EMERGENCY',
                speaker: 'SYSTEM',
                timing: 'after',
                bindings: {
                    mapId: 5,
                    gameplayId: 'ip_class_wires_harder',
                    trigger: 'gameplay.failed',
                },
                slides: [[
                    'The Elites have figured our location.',
                    'Quick let us go back again to the first floor to hide and relearn everything so we can hack more carefully once we reach this stage again.',
                ]],
                onComplete: onComplete,
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
            return dm.start(id, { source: 'IPWiresHarderTutorial' });
        },
    };

    IP2Live.IPWiresHarderTutorial = IPWiresHarderTutorial;
    window.IP2LiveIPWiresHarderTutorial = IPWiresHarderTutorial;
    console.log('[IP2Live] ip_wires_gameplay_harder_tutorial.js loaded.');
}());
