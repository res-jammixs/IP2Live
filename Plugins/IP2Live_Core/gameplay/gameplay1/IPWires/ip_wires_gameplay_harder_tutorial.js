/**
 * IP2Live - IP Wires Harder Tutorial Helpers
 */

(function () {
    const IPWiresHarderTutorial = {
        VERSION: 'ip-wires-harder-tutorial-20260815-04',
        _dialogueSerial: 0,

        showIntro(screen, onComplete) {
            if (typeof screen === 'function') {
                onComplete = screen;
                screen = null;
            }
            const setFocus = (side, details) => {
                const tutorial = IP2Live.IPWiresTutorial;
                if (tutorial && typeof tutorial.setGuidedHighlight === 'function') {
                    tutorial.setGuidedHighlight(screen, side, details);
                }
            };
            const clearFocus = () => {
                const tutorial = IP2Live.IPWiresTutorial;
                if (tutorial && typeof tutorial.clearGuidedHighlight === 'function') {
                    tutorial.clearGuidedHighlight(screen);
                }
            };

            setFocus('panel', { label: 'APEX ADAPTIVE SECURITY // BRIEFING' });
            return this._startDynamicDialogue('stage1.ipwires.harder.intro.', {
                title: 'ADAPTIVE SECURITY',
                speaker: 'SYSTEM',
                timing: 'during',
                bindings: {
                    mapId: 5,
                    gameplayId: 'ip_class_wires_harder',
                    objectiveId: 'repair_ip_wires_harder_01_tutorial',
                    trigger: 'gameplay.before',
                },
                slides: [[
                    'Congratulations, Hacker. Reaching this level means you have mastered the fundamentals of IP classification.',
                    '',
                    'But the deeper we explore, the more aggressively APEX protects its network.',
                    'This patch chassis now runs an adaptive re-key protocol designed to stop infiltrators like you.',
                ]],
                onComplete: () => {
                    setFocus('left', { label: 'SCAN // ADAPTIVE SOURCE LEADS' });
                    this._startDynamicDialogue('stage1.ipwires.harder.sources.', {
                        title: 'ADAPTIVE SECURITY',
                        speaker: 'SYSTEM',
                        timing: 'during',
                        bindings: {
                            mapId: 5,
                            gameplayId: 'ip_class_wires_harder',
                            objectiveId: 'repair_ip_wires_harder_01_tutorial',
                            trigger: 'gameplay.before',
                        },
                        slides: [[
                            'Every board activates a random set of three to five IP Classes.',
                            '',
                            'All five Classes may be live, or some Class ports may be decoys.',
                            'The number of leads assigned to each active Class changes every time.',
                            'Read every first octet carefully. Strict mode does not display Class range hints.',
                        ]],
                        onComplete: () => {
                            setFocus('right', { label: 'STRICT MODE // CLASS MATRIX' });
                            this._startDynamicDialogue('stage1.ipwires.harder.targets.', {
                                title: 'ADAPTIVE SECURITY',
                                speaker: 'SYSTEM',
                                timing: 'during',
                                bindings: {
                                    mapId: 5,
                                    gameplayId: 'ip_class_wires_harder',
                                    objectiveId: 'repair_ip_wires_harder_01_tutorial',
                                    trigger: 'gameplay.before',
                                },
                                slides: [[
                                    'A Class input may accept several leads, while another input may receive none.',
                                    '',
                                    'A correct lead remains verified, connected, and unchanged.',
                                    'A mismatched lead is rejected and automatically receives a new IP identity.',
                                    'You must classify that changed lead again before your next patch attempt.',
                                ]],
                                onComplete: () => {
                                    const firstItem = screen && Array.isArray(screen.leftItems) ? screen.leftItems[0] : null;
                                    setFocus('route', firstItem ? {
                                        sourceId: firstItem.id,
                                        className: firstItem.className,
                                        label: 'BRIEFING ROUTE // HOLD + DRAG',
                                    } : { label: 'BRIEFING ROUTE // HOLD + DRAG' });
                                    this._startDynamicDialogue('stage1.ipwires.harder.route.', {
                                        title: 'ADAPTIVE SECURITY',
                                        speaker: 'SYSTEM',
                                        timing: 'during',
                                        bindings: {
                                            mapId: 5,
                                            gameplayId: 'ip_class_wires_harder',
                                            objectiveId: 'repair_ip_wires_harder_01_tutorial',
                                            trigger: 'gameplay.before',
                                        },
                                        slides: [[
                                            'Hold an exposed source terminal, then drag it to the Class input that accepts its first octet.',
                                            '',
                                            'The briefing route is highlighted only for this demonstration.',
                                            'Once control returns, analyze every remaining lead without range indicators.',
                                        ]],
                                        onComplete: () => {
                                            clearFocus();
                                            if (typeof onComplete === 'function') onComplete();
                                        },
                                    });
                                },
                            });
                        },
                    });
                },
            });
        },

        showMismatchShift(screen, changedItems, attemptsRemaining, onComplete) {
            const changed = Array.isArray(changedItems) ? changedItems : [];
            const sourceIds = changed.map((item) => item && item.sourceId).filter(Boolean);
            const tutorial = IP2Live.IPWiresTutorial;
            if (tutorial && typeof tutorial.setGuidedHighlight === 'function') {
                tutorial.setGuidedHighlight(screen, 'reroll', {
                    sourceIds: sourceIds,
                    label: 'ALERT // REJECTED LEADS RE-KEYED',
                });
            }

            const leadCount = changed.length;
            const remaining = Math.max(0, Number(attemptsRemaining) || 0);
            return this._startDynamicDialogue('stage1.ipwires.harder.mismatch.', {
                title: 'ADAPTIVE RE-KEY',
                speaker: 'APEX SECURITY',
                timing: 'during',
                bindings: {
                    mapId: 5,
                    gameplayId: 'ip_class_wires_harder',
                    objectiveId: 'repair_ip_wires_harder_01_tutorial',
                    trigger: 'gameplay.mistake',
                },
                slides: [[
                    'Mismatch detected. APEX rejected ' + leadCount + ' unstable lead' + (leadCount === 1 ? '' : 's') + '.',
                    '',
                    'The highlighted IP ' + (leadCount === 1 ? 'address has' : 'addresses have') + ' been randomized and may now belong to different Classes.',
                    'Every verified connection stayed locked and kept its original identity.',
                    'Reclassify only the changed leads. Attempts remaining: ' + remaining + '.',
                ]],
                onComplete: () => {
                    if (tutorial && typeof tutorial.clearGuidedHighlight === 'function') {
                        tutorial.clearGuidedHighlight(screen);
                    }
                    if (typeof onComplete === 'function') onComplete();
                },
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
                    'The adaptive circuit exhausted its retry budget.',
                    '',
                    'Return to the briefing lever and stabilize the re-key protocol before continuing deeper.',
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
                    'Adaptive retry limit reached.',
                    '',
                    'APEX rebuilt the entire source layout. Re-enter the briefing node and classify the new leads.',
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
