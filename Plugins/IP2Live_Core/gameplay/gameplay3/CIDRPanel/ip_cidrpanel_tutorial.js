/**
 * IP2Live - CIDR Panel Tutorial Dialogue Helpers
 *
 * Guided tutorial content for the CIDR binary light-panel gameplay.
 * Loaded before ip_cidrpanel_gameplay.js.
 *
 * This version adds:
 * - Storytelling bridge from IP Class mastery into deeper subnet-mask learning
 * - Dialogue text highlighting with {{highlight:...}}
 * - A clearer octet -> binary -> subnet mask -> CIDR learning sequence
 * - Visual gameplay focus for the timer, target mask, one octet row, bulbs and CIDR field
 * - A guaranteed 3-minute training timer for the guided tutorial
 * - Timer pause while tutorial dialogue / guided spotlight is active
 * - A final "basics learned" message after the correct CIDR is submitted
 */

(function () {
    const BINARY_WEIGHTS = [128, 64, 32, 16, 8, 4, 2, 1];

    function highlighted(value) {
        return '{{highlight:' + String(value == null ? '' : value) + '}}';
    }

    function parseMask(mask) {
        const parts = String(mask || '').split('.').map((part) => Number(part));

        if (parts.length !== 4) {
            return [255, 255, 255, 224];
        }

        for (let i = 0; i < parts.length; i++) {
            if (!Number.isInteger(parts[i]) || parts[i] < 0 || parts[i] > 255) {
                return [255, 255, 255, 224];
            }
        }

        return parts;
    }

    function octetToBits(value) {
        const n = Math.max(0, Math.min(255, Number(value) || 0));
        return BINARY_WEIGHTS.map((weight) => (n & weight) !== 0);
    }

    function octetToBinary(value) {
        return octetToBits(value).map((on) => on ? '1' : '0').join('');
    }

    function cidrFromMask(mask) {
        const octets = parseMask(mask);
        let count = 0;

        for (let i = 0; i < octets.length; i++) {
            const bits = octetToBits(octets[i]);
            for (let j = 0; j < bits.length; j++) {
                if (bits[j]) count++;
            }
        }

        return count;
    }

    function interestingOctetIndex(mask) {
        const octets = parseMask(mask);

        for (let i = 0; i < octets.length; i++) {
            if (octets[i] !== 255 && octets[i] !== 0) {
                return i;
            }
        }

        for (let i = 0; i < octets.length; i++) {
            if (octets[i] !== 255) {
                return i;
            }
        }

        return 3;
    }

    function sumExpressionForOctet(value) {
        const bits = octetToBits(value);
        const used = [];

        for (let i = 0; i < bits.length; i++) {
            if (bits[i]) used.push(BINARY_WEIGHTS[i]);
        }

        return used.length ? used.join(' + ') : '0';
    }

    function formatTime(seconds) {
        const total = Math.max(0, Math.round(Number(seconds) || 0));
        const minutes = Math.floor(total / 60);
        const remainder = total % 60;

        return String(minutes).padStart(2, '0') + ':' + String(remainder).padStart(2, '0');
    }

    const IPCIDRPanelTutorial = {
        VERSION: 'ip-cidrpanel-tutorial-20260921-11',
        _dialogueSerial: 0,
        _screen: null,
        _integrationInstalled: false,
        _integrationAttempts: 0,

        attachScreen(screen) {
            if (screen) this._screen = screen;
            return this._screen;
        },

        activeScreen() {
            if (this._screen && !this._screen.finished) {
                return this._screen;
            }

            const pause = IP2Live.GameplayPause;

            if (pause && pause.activeScreen && !pause.activeScreen.finished) {
                const candidate = pause.activeScreen;

                if (
                    candidate.gameplayId === 'ip_cidr_binary_panel' ||
                    (
                        window.IP2LiveCIDRPanelGameplayScreen &&
                        candidate instanceof window.IP2LiveCIDRPanelGameplayScreen
                    )
                ) {
                    this._screen = candidate;
                    return candidate;
                }
            }

            return null;
        },

        prepareTutorialTimer(screen) {
            const target = this.attachScreen(screen);

            if (!target || !target.tutorialMode || !target.guidedTutorial) {
                return false;
            }

            // The guided training panel always gives the learner the full 3 minutes.
            target.solveTimeSeconds = 180;
            target.solveTimerMaxTicks = 180 * 60;
            target.solveTimerTicks = 180 * 60;

            // Corruption pacing for the 3-minute training run.
            target.glitchStartElapsedSeconds = 120;
            target.glitchHeavyElapsedSeconds = 160;
            target.timerExpired = false;
            target.timeoutFailureCommitted = false;

            return true;
        },

        setGameplayHighlight(type, label, details) {
            const screen = this.activeScreen();
            if (!screen) return false;

            screen.tutorialHighlight = Object.assign({
                type,
                label: label || 'SYSTEM FOCUS',
            }, details || {});

            // Pause player interaction and the solve timer while the tutorial is focusing something.
            screen.tutorialPaused = true;

            if (Manager && Manager.Stack) {
                Manager.Stack.requestPaintHUD = true;
            }

            return true;
        },

        clearGameplayHighlight() {
            const screen = this.activeScreen();
            if (!screen) return false;

            screen.tutorialHighlight = null;

            if (Manager && Manager.Stack) {
                Manager.Stack.requestPaintHUD = true;
            }

            return true;
        },

        /* =================================================
         * COMPLETE INTRO
         * ================================================= */

        showIntro(targetMask, onComplete) {
            const mask = targetMask || '255.255.255.224';

            return this.showStoryIntro(() => {
                this.showOctetBasicsGuide(mask, () => {
                    this.showTimerGuide(180, () => {
                        this.showTargetMaskGuide(mask, onComplete);
                    });
                });
            });
        },

        /* =================================================
         * STORY BRIDGE
         * ================================================= */

        showStoryIntro(onComplete) {
            this.setGameplayHighlight(
                'panel',
                'INCOMING TRANSMISSION // CIDR TRAINING'
            );

            return this._startDynamicDialogue('stage2.ipcidrpanel.story_intro.', {
                title: 'INCOMING TRANSMISSION',
                speaker: 'SYSTEM',
                timing: 'during',
                bindings: {
                    mapId: 7,
                    gameplayId: 'ip_cidr_binary_panel',
                    trigger: 'gameplay.before',
                },
                slides: [
                    [
                        'Excellent work, Infiltrator.',
                        '',
                        'You have successfully mastered the different ' +
                            highlighted('IP ADDRESS CLASSES') +
                            ' and learned how to recognize where an address belongs.',
                        '',
                        'That knowledge allowed us to move deeper into the APEX network.',
                    ],
                    [
                        'You have also encountered ' +
                            highlighted('SUBNET MASKS') +
                            ' before.',
                        '',
                        'Until now, you only needed their basic relationship with the different network classes and their default network boundaries.',
                        '',
                        'That was enough to identify the network from the outside.',
                        'But we are no longer staying outside.',
                    ],
                    [
                        'APEX has placed another security layer between us and the next section of the network.',
                        '',
                        'This system does not only check whether you recognize a subnet mask.',
                        '',
                        'It expects you to understand ' +
                            highlighted('HOW THE SUBNET MASK IS BUILT') +
                            '.',
                    ],
                    [
                        'This time, we are going deeper into subnetting.',
                        '',
                        'You will learn how a subnet mask is represented using ' +
                            highlighted('BINARY BITS') +
                            ', how those bits create each ' +
                            highlighted('OCTET') +
                            ', and how the completed mask becomes a ' +
                            highlighted('CIDR PREFIX') +
                            '.',
                        '',
                        'Once you understand this, the mask will stop looking like four random numbers.',
                    ],
                    [
                        'Think of this panel as an intercepted APEX subnet console.',
                        '',
                        'We need to reconstruct the correct binary mask before the security system finishes tracing our connection.',
                        '',
                        'I will guide you through the first calibration.',
                        'After that, future panels will give you ' +
                            highlighted('LESS TIME') +
                            ' and expect you to solve them on your own.',
                        '',
                        highlighted('Let us begin with the structure of a subnet mask.'),
                    ],
                ],
                onComplete,
            });
        },

        /* =================================================
         * STEP 1 — OCTETS
         * ================================================= */

        showOctetBasicsGuide(targetMask, onComplete) {
            const mask = targetMask || '255.255.255.224';
            const octets = parseMask(mask);

            this.setGameplayHighlight('octet_mapping', '01 // ONE OCTET = ONE PANEL ROW', {
                octetIndex: 0,
            });

            return this._startDynamicDialogue('stage2.ipcidrpanel.octets.', {
                title: 'INSIDE THE SUBNET MASK',
                speaker: 'SYSTEM',
                timing: 'during',
                bindings: {
                    mapId: 7,
                    gameplayId: 'ip_cidr_binary_panel',
                    trigger: 'gameplay.before',
                },
                slides: [
                    [
                        'Let us start by breaking the subnet mask apart.',
                        '',
                        'A subnet mask contains ' + highlighted('FOUR OCTETS') + ' separated by periods.',
                        'Your current target looks like this:',
                        '',
                        highlighted(mask),
                    ],
                    [
                        'An ' + highlighted('OCTET') + ' is one group of 8 binary bits.',
                        '',
                        'When written in decimal form, one octet can have a value from ' +
                            highlighted('0 to 255') +
                            '.',
                        '',
                        'So this subnet mask contains four separate octet values.',
                    ],
                    [
                        highlighted(String(octets[0])) +
                            '  .  ' +
                            highlighted(String(octets[1])) +
                            '  .  ' +
                            highlighted(String(octets[2])) +
                            '  .  ' +
                            highlighted(String(octets[3])),
                        '',
                        'The ' + highlighted('FIRST NUMBER') + ' is the first octet.',
                        'The second number is the second octet, followed by the third and fourth.',
                    ],
                    [
                        'Look at the four rows of bulbs on the panel.',
                        '',
                        'Each bulb row represents exactly ' + highlighted('ONE OCTET') + '.',
                        '',
                        highlighted('OCTET 1 = ROW 1'),
                        highlighted('OCTET 2 = ROW 2'),
                        highlighted('OCTET 3 = ROW 3'),
                        highlighted('OCTET 4 = ROW 4'),
                        '',
                        'Your job will be to convert each decimal octet into its binary bulb pattern.',
                    ],
                ],
                onComplete,
            });
        },

        /* =================================================
         * STEP 2 — TIMER
         * ================================================= */

        showTimerGuide(timeSeconds, onComplete) {
            const seconds = Math.max(1, Number(timeSeconds) || 180);
            const shownTime = formatTime(seconds);

            this.setGameplayHighlight('timer', '02 // TRAINING TIMER');

            return this._startDynamicDialogue('stage2.ipcidrpanel.timer.', {
                title: 'SOLVE TIMER',
                speaker: 'SYSTEM',
                timing: 'during',
                bindings: {
                    mapId: 7,
                    gameplayId: 'ip_cidr_binary_panel',
                    trigger: 'gameplay.before',
                },
                slides: [[
                    'The countdown is shown in the ' + highlighted('UPPER-RIGHT CORNER') + '.',
                    '',
                    'This guided training panel gives you ' + highlighted(shownTime) +
                        ' to solve the subnet mask and CIDR prefix.',
                    '',
                    'The timer is ' + highlighted('PAUSED WHILE TUTORIAL DIALOGUE IS OPEN') +
                        ', so read each explanation carefully.',
                    '',
                    'Do not rely on the full three minutes later. Future CIDR panels can use ' +
                        highlighted('SHORTER MISSION TIMERS') +
                        '.',
                ]],
                onComplete,
            });
        },

        /* =================================================
         * STEP 3 — TARGET MASK
         * ================================================= */

        showTargetMaskGuide(targetMask, onComplete) {
            const mask = targetMask || '255.255.255.224';

            this.setGameplayHighlight('target_mask', '03 // SUBNET MASK TARGET');

            return this._startDynamicDialogue('stage2.ipcidrpanel.target.', {
                title: 'TARGET SUBNET MASK',
                speaker: 'SYSTEM',
                timing: 'during',
                bindings: {
                    mapId: 7,
                    gameplayId: 'ip_cidr_binary_panel',
                    trigger: 'gameplay.during',
                },
                slides: [[
                    'This is the ' + highlighted('SUBNET MASK // TARGET') + ' display.',
                    'Your current target is ' + highlighted(mask) + '.',
                    '',
                    'Your job is to make the four bulb rows produce these same four octet values.',
                    'Think of the panel as a binary version of the subnet mask shown here.',
                ]],
                onComplete,
            });
        },

        /* =================================================
         * STEP 4 — BINARY BULBS
         * ================================================= */

        showLampArrayGuide(onComplete) {
            this.setGameplayHighlight('lamp_array', '04 // BINARY BULB ARRAY');

            return this._startDynamicDialogue('stage2.ipcidrpanel.lamps.', {
                title: 'BINARY LAMP ARRAY',
                speaker: 'SYSTEM',
                timing: 'during',
                bindings: {
                    mapId: 7,
                    gameplayId: 'ip_cidr_binary_panel',
                    trigger: 'gameplay.during',
                },
                slides: [
                    [
                        'These bulbs represent the ' + highlighted('BINARY FORM') +
                            ' of each subnet-mask octet.',
                        '',
                        'Before any bulb is turned on, one row is:',
                        '',
                        highlighted('00000000'),
                        '',
                        'An unlit bulb means ' + highlighted('0') + '.',
                        'A lit bulb means ' + highlighted('1') + '.',
                    ],
                    [
                        'Each row has eight binary positions.',
                        'From left to right they are worth:',
                        '',
                        highlighted('128, 64, 32, 16, 8, 4, 2, 1'),
                        '',
                        'Add the values of every lit bulb in that row to get the decimal value of that octet.',
                    ],
                    [
                        'If all eight bulbs are ON, the row becomes ' + highlighted('11111111') + '.',
                        '',
                        highlighted('128 + 64 + 32 + 16 + 8 + 4 + 2 + 1 = 255'),
                        '',
                        'So a subnet-mask octet of ' + highlighted('255') +
                            ' means every bulb in that row is ON.',
                    ],
                ],
                onComplete,
            });
        },

        /* =================================================
         * STEP 5 — LEFT-TO-RIGHT CONSTRUCTION
         * ================================================= */

        showLampControlsGuide(onComplete) {
            const screen = this.activeScreen();
            const mask = screen && screen.targetMask ? screen.targetMask : '255.255.255.224';
            const octets = parseMask(mask);
            const octetIndex = interestingOctetIndex(mask);
            const octetValue = octets[octetIndex];
            const binary = octetToBinary(octetValue);
            const expression = sumExpressionForOctet(octetValue);

            this.setGameplayHighlight('row_prefix', '05 // BUILD EACH OCTET LEFT TO RIGHT', {
                row: octetIndex,
                octetIndex,
            });

            return this._startDynamicDialogue('stage2.ipcidrpanel.controls.', {
                title: 'BUILD THE SUBNET MASK',
                speaker: 'SYSTEM',
                timing: 'during',
                bindings: {
                    mapId: 7,
                    gameplayId: 'ip_cidr_binary_panel',
                    trigger: 'gameplay.during',
                },
                slides: [
                    [
                        'Subnet-mask binary is built ' + highlighted('FROM LEFT TO RIGHT') + '.',
                        '',
                        'The 1s must stay together before the 0s. You should not leave gaps such as 10110000.',
                        '',
                        'Clicking an ' + highlighted('OFF BULB') +
                            ' turns it ON and also fills the bulbs to its left in the ' +
                            highlighted('SAME ROW') + '.',
                        '',
                        'Clicking an ' + highlighted('ON BULB') +
                            ' turns it OFF and clears the bulbs to its right in that same row.',
                    ],
                    [
                        'For this mask, octet ' + highlighted(String(octetIndex + 1)) +
                            ' needs to equal ' + highlighted(String(octetValue)) + '.',
                        '',
                        'Its binary pattern is ' + highlighted(binary) + '.',
                        '',
                        octetValue === 0
                            ? 'Because the octet is 0, leave every bulb in that row OFF.'
                            : 'Turn on the values ' + highlighted(expression) +
                                ' so their total becomes ' + highlighted(String(octetValue)) + '.',
                    ],
                    [
                        'Remember the method:',
                        '',
                        highlighted('1. READ ONE TARGET OCTET.'),
                        highlighted('2. TURN ON BULBS FROM LEFT TO RIGHT UNTIL THEIR SUM MATCHES IT.'),
                        highlighted('3. REPEAT FOR ALL FOUR ROWS.'),
                        '',
                        'When all four row totals match the target, press ' + highlighted('VERIFY MATCH') + '.',
                    ],
                ],
                onComplete,
            });
        },

        /* =================================================
         * STEP 6 — CIDR PREFIX
         * ================================================= */

        showCIDRGuide(targetMask, onComplete) {
            const mask = targetMask || '255.255.255.224';
            const cidr = cidrFromMask(mask);

            this.setGameplayHighlight('cidr_count', '06 // COUNT EVERY ON BULB FOR CIDR');

            return this._startDynamicDialogue('stage2.ipcidrpanel.cidr.', {
                title: 'CALCULATE THE CIDR PREFIX',
                speaker: 'SYSTEM',
                timing: 'during',
                bindings: {
                    mapId: 7,
                    gameplayId: 'ip_cidr_binary_panel',
                    trigger: 'gameplay.during',
                },
                slides: [
                    [
                        'Subnet mask matched: ' + highlighted(mask) + '.',
                        '',
                        'Now look across ' + highlighted('ALL FOUR ROWS') +
                            ' and count every bulb that is ON.',
                        '',
                        'Each ON bulb represents one binary ' + highlighted('1') + '.',
                    ],
                    [
                        'The rule is simple:',
                        '',
                        highlighted('CIDR = TOTAL NUMBER OF BULBS TURNED ON'),
                        '',
                        'For this subnet mask, there are ' + highlighted(String(cidr) + ' ON BULBS') + '.',
                        'Therefore its CIDR prefix is ' + highlighted('/' + cidr) + '.',
                    ],
                    [
                        'Enter ' + highlighted('/' + cidr) +
                            ' in the CIDR field and press ' + highlighted('VERIFY CIDR') + '.',
                        '',
                        'When the prefix is accepted, you have completed the full conversion:',
                        '',
                        highlighted('DECIMAL SUBNET MASK -> BINARY BULBS -> CIDR PREFIX'),
                    ],
                ],
                onComplete,
            });
        },

        /* =================================================
         * TUTORIAL COMPLETION
         * ================================================= */

        showTutorialComplete(targetMask, cidr, onComplete) {
            const mask = targetMask || '255.255.255.224';
            const prefix = Number.isInteger(Number(cidr)) ? Number(cidr) : cidrFromMask(mask);

            this.setGameplayHighlight('cidr_entry', 'TRAINING COMPLETE // CIDR BASICS LEARNED');

            return this._startDynamicDialogue('stage2.ipcidrpanel.complete.', {
                title: 'CIDR BASICS LEARNED',
                speaker: 'SYSTEM',
                timing: 'after',
                bindings: {
                    mapId: 7,
                    gameplayId: 'ip_cidr_binary_panel',
                    trigger: 'gameplay.completed',
                },
                slides: [
                    [
                        'Correct. ' + highlighted(mask) + ' is ' + highlighted('/' + prefix) + '.',
                        '',
                        'You have learned the basic CIDR-panel method:',
                        '',
                        highlighted('OCTET -> BINARY BULBS -> DECIMAL SUM -> CIDR'),
                    ],
                    [
                        'This training panel gave you a full ' + highlighted('03:00') +
                            ' so you could learn the process safely.',
                        '',
                        'Future CIDR encounters may use ' + highlighted('SHORTER TIMERS') +
                            ' and stronger signal corruption.',
                        '',
                        'Use the same method, but work faster: read each octet, build its binary row from left to right, then count every ON bulb for the CIDR.',
                        '',
                        'The deeper we move into APEX, the less time its security system will give us.',
                    ],
                ],
                onComplete,
            });
        },

        /* =================================================
         * MISTAKE CORRECTION
         * ================================================= */

        showCorrection(targetMask, bits, cidr, onComplete) {
            const mask = targetMask || '255.255.255.224';
            const binary = bits || '11100000';
            const prefix = Number.isInteger(Number(cidr)) ? Number(cidr) : cidrFromMask(mask);

            this.setGameplayHighlight('row_prefix', 'CIDR CORRECTION // CHECK BINARY ORDER');

            return this._startDynamicDialogue('stage1.ipcidrpanel.fix.', {
                title: 'CIDR CORRECTION',
                speaker: 'SYSTEM',
                timing: 'during',
                bindings: {
                    mapId: 7,
                    gameplayId: 'ip_cidr_binary_panel',
                    trigger: 'gameplay.mistake',
                },
                slides: [
                    [
                        'That mask pattern does not match the target.',
                        'Target mask: ' + highlighted(mask),
                        '',
                        'The important octet should contain the binary pattern ' + highlighted(binary) + '.',
                    ],
                    [
                        'Remember: subnet-mask 1s are ' + highlighted('CONTINUOUS FROM THE LEFT') + '.',
                        'Do not create gaps between ON bulbs.',
                        '',
                        'After all four octets match, count every ON bulb across the panel.',
                        'The correct CIDR for this target is ' + highlighted('/' + prefix) + '.',
                        '',
                        'Try again.',
                    ],
                ],
                onComplete,
            });
        },

        /* =================================================
         * ATTEMPT RESET
         * ================================================= */

        showAttemptReset(failedLabel, onComplete) {
            const label = failedLabel || 'the active CIDR panel';

            return this._startDynamicDialogue('stage2.ipcidrpanel.retry_reset.', {
                title: 'CIDR TRAINING RECALIBRATION',
                speaker: 'SYSTEM',
                timing: 'after',
                bindings: {
                    mapId: 7,
                    gameplayId: 'ip_cidr_binary_panel',
                    trigger: 'gameplay.failed',
                },
                slides: [[
                    'Three verification attempts were spent at ' + highlighted(label) + '.',
                    '',
                    'Return to the first CIDR training relay and rebuild the method from the basics:',
                    '',
                    highlighted('READ OCTET -> BUILD BINARY ROW -> MATCH DECIMAL SUM -> COUNT ON BULBS FOR CIDR'),
                    '',
                    'Your completed relays remain secured. Once the training relay is stable again, the route will return you to the unfinished panel.',
                ]],
                onComplete,
            });
        },

        /* =================================================
         * DIALOGUE REGISTRATION
         * ================================================= */

        _startDynamicDialogue(prefix, definition) {
            const dm = IP2Live.DialogueManager;

            if (!dm || typeof dm.registerDialogue !== 'function' || typeof dm.start !== 'function') {
                if (definition && typeof definition.onComplete === 'function') {
                    definition.onComplete();
                }

                return false;
            }

            // Explicitly pause CIDR gameplay and its timer while any tutorial transmission is open.
            const screen = this.activeScreen();
            if (screen) {
                screen.tutorialPaused = true;
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

            return dm.start(id, {
                source: 'IPCIDRPanelTutorial',
            });
        },

        /* =================================================
         * CIDR GAMEPLAY INTEGRATION
         * ================================================= */

        installGameplayIntegration() {
            const ScreenClass =
                IP2Live.CIDRPanelGameplayScreen ||
                window.IP2LiveCIDRPanelGameplayScreen;

            if (!ScreenClass || !ScreenClass.prototype) {
                return false;
            }

            const proto = ScreenClass.prototype;

            if (proto._ip2liveCIDRTutorialEnhanced) {
                this._integrationInstalled = true;
                return true;
            }

            Object.defineProperty(proto, '_ip2liveCIDRTutorialEnhanced', {
                value: true,
                configurable: true,
            });

            const tutorial = this;

            /* =================================================
             * TIMER BEHAVIOR
             * ================================================= */

            proto._shouldRunSolveTimer = function () {
                if (this.finished || this.timerExpired || this._isTimeoutSequence()) {
                    return false;
                }

                if (this.tutorialPaused || this._isGuidedDialogueActive()) {
                    return false;
                }

                return this.phase === 'build' || this.phase === 'cidr_entry';
            };

            /* =================================================
             * EXTRA VISUAL HIGHLIGHT TARGETS
             * ================================================= */

            const originalHighlightRects = proto._tutorialHighlightRects;

            proto._tutorialHighlightRects = function (m) {
                const highlight = this.tutorialHighlight || {};
                const type = highlight.type;

                const clampRect = (rect) => {
                    const padX = 8 * m.sX;
                    const padY = 8 * m.sY;
                    const x = Math.max(padX, rect.x);
                    const y = Math.max(padY, rect.y);

                    return {
                        x,
                        y,
                        w: Math.max(
                            18 * m.sX,
                            Math.min(rect.x + rect.w, m.cW - padX) - x
                        ),
                        h: Math.max(
                            18 * m.sY,
                            Math.min(rect.y + rect.h, m.cH - padY) - y
                        ),
                    };
                };

                const boundsOf = (rects, paddingX, paddingY) => {
                    if (!rects || !rects.length) return null;

                    let left = rects[0].x;
                    let top = rects[0].y;
                    let right = rects[0].x + rects[0].w;
                    let bottom = rects[0].y + rects[0].h;

                    for (let i = 1; i < rects.length; i++) {
                        const rect = rects[i];
                        left = Math.min(left, rect.x);
                        top = Math.min(top, rect.y);
                        right = Math.max(right, rect.x + rect.w);
                        bottom = Math.max(bottom, rect.y + rect.h);
                    }

                    const px = Number(paddingX) || 0;
                    const py = Number(paddingY) || 0;

                    return clampRect({
                        x: left - px,
                        y: top - py,
                        w: right - left + px * 2,
                        h: bottom - top + py * 2,
                    });
                };

                const rowRect = (row) => {
                    const layout = this._rowLayout(m);
                    const index = Math.max(0, Math.min(3, Number(row) || 0));
                    const cy = layout.rowBaseY + index * layout.rowGap;

                    return clampRect({
                        x: m.mainX + 17 * m.sX,
                        y: cy - 34 * m.sY,
                        w: m.mainW - 34 * m.sX,
                        h: 68 * m.sY,
                    });
                };

                const targetOctetRect = (octetIndex) => {
                    const terminal = this._cidrTerminalLayout(m);
                    const index = Math.max(0, Math.min(3, Number(octetIndex) || 0));
                    const parts = String(this.targetMask || '255.255.255.224').split('.');
                    const ctx = Common && Common.Platform ? Common.Platform.ctx : null;

                    let textX = terminal.targetX + 22 * m.sX;
                    let width = Math.max(36 * m.sX, terminal.targetW * 0.12);

                    if (ctx) {
                        ctx.save();
                        ctx.font = 'bold ' + (18.2 * m.sY).toFixed(1) + 'px ' + this._uiPrimaryFont();

                        for (let i = 0; i < index; i++) {
                            textX += ctx.measureText((parts[i] || '') + '.').width;
                        }

                        width = Math.max(width, ctx.measureText(parts[index] || '').width);
                        ctx.restore();
                    }

                    return clampRect({
                        x: textX - 5 * m.sX,
                        y: terminal.targetY + 39 * m.sY,
                        w: width + 10 * m.sX,
                        h: 26 * m.sY,
                    });
                };

                if (type === 'panel') {
                    return {
                        label: highlight.label || 'CIDR TRAINING PANEL',
                        rects: [
                            clampRect({
                                x: m.panelX + 8 * m.sX,
                                y: m.panelY + 8 * m.sY,
                                w: m.panelW - 16 * m.sX,
                                h: m.panelH - 16 * m.sY,
                            }),
                        ],
                    };
                }

                if (type === 'timer') {
                    const timerW = 154 * m.sX;
                    const timerH = 34 * m.sY;
                    const timerX = m.panelX + m.panelW - timerW - 23 * m.sX;
                    const timerY = m.panelY + 23 * m.sY;

                    return {
                        label: highlight.label || 'TRAINING TIMER',
                        rects: [
                            clampRect({
                                x: timerX - 7 * m.sX,
                                y: timerY - 7 * m.sY,
                                w: timerW + 14 * m.sX,
                                h: timerH + 14 * m.sY,
                            }),
                        ],
                    };
                }

                if (type === 'octet_mapping') {
                    const index = Math.max(0, Math.min(3, Number(highlight.octetIndex) || 0));

                    return {
                        label: highlight.label || 'ONE OCTET = ONE ROW',
                        rects: [
                            targetOctetRect(index),
                            rowRect(index),
                        ],
                    };
                }

                if (type === 'row_prefix') {
                    const row = Math.max(0, Math.min(3, Number(highlight.row) || 0));
                    const rowBulbs = this.bulbRects.filter((rect) => rect.row === row);
                    const bulbBounds = boundsOf(rowBulbs, 12 * m.sX, 12 * m.sY);
                    const rects = [rowRect(row)];

                    if (bulbBounds) rects.unshift(bulbBounds);

                    return {
                        label: highlight.label || 'BUILD THIS OCTET LEFT TO RIGHT',
                        rects,
                    };
                }

                if (type === 'cidr_count') {
                    const terminal = this._cidrTerminalLayout(m);
                    const allBulbs = boundsOf(this.bulbRects, 14 * m.sX, 14 * m.sY);
                    const rects = [];

                    if (allBulbs) rects.push(allBulbs);

                    rects.push(
                        clampRect({
                            x: terminal.shellX - 8 * m.sX,
                            y: terminal.shellY - 13 * m.sY,
                            w: terminal.shellW + 16 * m.sX,
                            h: terminal.shellH + 21 * m.sY,
                        })
                    );

                    return {
                        label: highlight.label || 'COUNT ON BULBS -> CIDR',
                        rects,
                    };
                }

                if (typeof originalHighlightRects === 'function') {
                    return originalHighlightRects.call(this, m);
                }

                return null;
            };

            /* =================================================
             * GUIDED INTRO SEQUENCE
             * ================================================= */

            proto._showGuidedTargetDialogue = function () {
                tutorial.attachScreen(this);
                tutorial.prepareTutorialTimer(this);
                this._setGuidedDialogueOpen(true);

                const finish = () => {
                    this._setGuidedDialogueOpen(false);

                    this._showTutorialSpotlight(
                        {
                            type: 'target_mask',
                            label: '03 // SUBNET MASK TARGET',
                        },
                        90,
                        () => {
                            this.tutorialStep = 'lamps_intro';
                        }
                    );
                };

                // Story bridge -> octets -> timer -> target mask.
                tutorial.showIntro(this.targetMask, finish);
            };

            /* =================================================
             * BINARY LAMP EXPLANATION
             * ================================================= */

            proto._showGuidedLampDialogue = function () {
                tutorial.attachScreen(this);
                this._setGuidedDialogueOpen(true);

                const done = () => {
                    this._setGuidedDialogueOpen(false);

                    this._showTutorialSpotlight(
                        {
                            type: 'lamp_array',
                            label: '04 // BINARY BULBS REPRESENT ONE OCTET PER ROW',
                        },
                        110,
                        () => {
                            this.tutorialStep = 'controls_intro';
                        }
                    );
                };

                tutorial.showLampArrayGuide(done);
            };

            /* =================================================
             * BULB CONTROL EXPLANATION
             * ================================================= */

            proto._showGuidedControlsDialogue = function () {
                tutorial.attachScreen(this);
                this._setGuidedDialogueOpen(true);

                const row = interestingOctetIndex(this.targetMask);

                const done = () => {
                    this._setGuidedDialogueOpen(false);

                    this._showTutorialSpotlight(
                        {
                            type: 'row_prefix',
                            row,
                            octetIndex: row,
                            label: '05 // TURN BITS ON FROM LEFT TO RIGHT',
                        },
                        120,
                        () => {
                            // All instructional dialogue is finished. Release control and start the 3-minute solve timer.
                            this.tutorialPaused = false;
                            this.tutorialStep = 'wait_cidr';
                        }
                    );
                };

                tutorial.showLampControlsGuide(done);
            };

            /* =================================================
             * CIDR EXPLANATION
             * ================================================= */

            proto._showGuidedCIDRDialogue = function () {
                tutorial.attachScreen(this);
                this._setGuidedDialogueOpen(true);

                const done = () => {
                    this._setGuidedDialogueOpen(false);

                    this._showTutorialSpotlight(
                        {
                            type: 'cidr_count',
                            label: '06 // CIDR = TOTAL NUMBER OF ON BULBS',
                        },
                        120,
                        () => {
                            // Resume the countdown once the learner is back in control.
                            this.tutorialPaused = false;
                            this.tutorialStep = 'wait_cidr_success';
                        }
                    );
                };

                tutorial.showCIDRGuide(this.targetMask, done);
            };

            /* =================================================
             * FINAL MESSAGE AFTER CORRECT CIDR
             * ================================================= */

            const originalVerifyCIDRInput = proto._verifyCIDRInput;

            if (typeof originalVerifyCIDRInput === 'function') {
                proto._verifyCIDRInput = function () {
                    if (this.phase !== 'cidr_entry') {
                        return originalVerifyCIDRInput.call(this);
                    }

                    const enteredCIDR = this._parseCIDRInput(this.cidrInput);
                    const shouldShowCompletion =
                        this.tutorialMode &&
                        this.guidedTutorial &&
                        !this._cidrBasicsCompletionShown &&
                        enteredCIDR === this.targetCIDR;

                    if (!shouldShowCompletion) {
                        return originalVerifyCIDRInput.call(this);
                    }

                    // Correct answer reached. Pause the timer before the final teaching message.
                    this._cidrBasicsCompletionShown = true;
                    this.tutorialPaused = true;
                    this._setGuidedDialogueOpen(true);

                    tutorial.attachScreen(this);

                    const finishTutorial = () => {
                        this._setGuidedDialogueOpen(false);
                        tutorial.clearGameplayHighlight();
                        this.tutorialPaused = false;
                        this.tutorialActive = false;
                        this.tutorialComplete = true;
                        this.tutorialStep = 'done';

                        // Continue the gameplay's normal successful CIDR verification.
                        originalVerifyCIDRInput.call(this);
                    };

                    const started = tutorial.showTutorialComplete(
                        this.targetMask,
                        this.targetCIDR,
                        finishTutorial
                    );

                    if (!started) {
                        finishTutorial();
                    }
                };
            }

            this._integrationInstalled = true;

            console.log('[IP2Live] enhanced CIDR tutorial integration installed.');
            return true;
        },

        /* =================================================
         * LOAD-ORDER HANDLING
         * ================================================= */

        scheduleGameplayIntegration() {
            if (this.installGameplayIntegration()) {
                return true;
            }

            if (this._integrationAttempts >= 80) {
                return false;
            }

            this._integrationAttempts++;

            if (typeof setTimeout === 'function') {
                setTimeout(() => this.scheduleGameplayIntegration(), 100);
            }

            return false;
        },
    };

    IP2Live.IPCIDRPanelTutorial = IPCIDRPanelTutorial;
    window.IP2LiveIPCIDRPanelTutorial = IPCIDRPanelTutorial;

    // This tutorial module loads before the CIDR gameplay class, so keep retrying until it becomes available.
    IPCIDRPanelTutorial.scheduleGameplayIntegration();

    console.log('[IP2Live] ip_cidrpanel_tutorial.js loaded.');
}());
