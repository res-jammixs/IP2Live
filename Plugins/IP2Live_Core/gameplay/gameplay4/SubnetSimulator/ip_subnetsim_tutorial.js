/**
 * IP2Live - Subnet Simulator Tutorial Dialogue Helpers
 *
 * Gameplay Four guided assistance.
 *
 * The lesson is deliberately staged:
 *
 *   1. Recall the carried octet from the CIDR panel.
 *   2. Learn TOTAL SUBNETS and USABLE SUBNETS.
 *   3. Solve those two subnet answers first.
 *   4. Unlock the host section.
 *   5. Learn TOTAL HOSTS and USABLE HOSTS.
 *   6. Solve those two host answers.
 *   7. Validate the completed simulation.
 *
 * Important terms use the DialogueManager highlight syntax:
 * {{highlight:important text}}
 */

(function () {
    function highlight(value) {
        return '{{highlight:' + String(value == null ? '' : value) + '}}';
    }

    function safeNumber(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function powerText(exponent, result) {
        return '2^' + exponent + ' = ' + result;
    }

    const IPSubnetSimulatorTutorial = {
        VERSION: 'ip-subnetsim-tutorial-20260921-09',

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

            if (
                pause &&
                pause.activeScreen &&
                !pause.activeScreen.finished
            ) {
                const candidate = pause.activeScreen;

                if (
                    candidate.gameplayId === 'ip_subnet_simulator' ||
                    (
                        window.IP2LiveSubnetSimulatorGameplayScreen &&
                        candidate instanceof window.IP2LiveSubnetSimulatorGameplayScreen
                    )
                ) {
                    this._screen = candidate;
                    return candidate;
                }
            }

            return null;
        },

        setGameplayHighlight(type, label, details) {
            const screen = this.activeScreen();
            if (!screen) return false;

            screen.tutorialHighlight = Object.assign(
                {
                    type,
                    label: label || 'SYSTEM FOCUS',
                },
                details || {}
            );

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

        showIntro(context, onComplete) {
            return this.showCarriedReference(context, onComplete);
        },

        /**
         * ---------------------------------------------------------
         * STEP 1 — CARRIED OCTET
         * ---------------------------------------------------------
         */
        showCarriedReference(context, onComplete) {
            const c = context || {};
            const bits = c.bitsBinary || '11100000';
            const mask = c.mask || 'the subnet mask you solved previously';

            this.setGameplayHighlight(
                'carried_reference',
                '01 // CARRIED OCTET FROM GAMEPLAY 3'
            );

            return this._startDynamicDialogue(
                'stage2.ipsubnetsim.carried.',
                {
                    title: 'CARRIED OCTET DETECTED',
                    speaker: 'SYSTEM',
                    timing: 'during',

                    bindings: {
                        mapId: 8,
                        gameplayId: 'ip_subnet_simulator',
                        objectiveId: 'solve_cidr_chain_01_subnet',
                        trigger: 'gameplay.during',
                    },

                    slides: [
                        [
                            'Good work, Infiltrator. The CIDR panel from the previous security layer has been accepted.',

                            '',

                            'Look at the ' +
                            highlight('CARRIED OCTET') +
                            ' display. This is not a new pattern—it is the same interesting octet you solved in Gameplay 3 for ' +
                            highlight(mask) +
                            '.',
                        ],

                        [
                            'The carried binary pattern is ' +
                            highlight(bits) +
                            '.',

                            'Each glowing bulb is a binary ' +
                            highlight('1') +
                            ', while each dark bulb is a binary ' +
                            highlight('0') +
                            '.',

                            '',

                            'This simulator will use those same bits to calculate how many subnets and host addresses the network can contain.',
                        ],

                        [
                            'For this level, remember two rules:',

                            highlight('ON BULBS = BORROWED SUBNET BITS'),

                            highlight('OFF BULBS = HOST BITS'),

                            '',

                            'We will solve the subnet values first. The host answer bays will stay locked until the subnet calculation is correct.',
                        ],
                    ],

                    onComplete,
                }
            );
        },

        /**
         * ---------------------------------------------------------
         * STAGE 1 — SUBNETS
         * ---------------------------------------------------------
         */
        showSubnetStageGuide(context, onComplete) {
            const c = context || {};

            return this.showSubnetPowerGuide(c, () => {
                this.showUsableSubnetsGuide(c, () => {
                    this.showSubnetSolvePrompt(c, onComplete);
                });
            });
        },

        showSubnetPowerGuide(context, onComplete) {
            const c = context || {};

            const onBits = Math.max(
                0,
                safeNumber(c.borrowedBits, 0)
            );

            const totalSubnets = Math.max(
                0,
                safeNumber(
                    c.totalSubnets,
                    Math.pow(2, onBits)
                )
            );

            this.setGameplayHighlight(
                'subnet_power',
                '02 // ON BULBS -> TOTAL SUBNETS'
            );

            return this._startDynamicDialogue(
                'stage2.ipsubnetsim.subnet_power.',
                {
                    title: 'CALCULATE TOTAL SUBNETS',
                    speaker: 'SYSTEM',
                    timing: 'during',

                    bindings: {
                        mapId: 8,
                        gameplayId: 'ip_subnet_simulator',
                        objectiveId: 'solve_cidr_chain_01_subnet',
                        trigger: 'gameplay.during',
                    },

                    slides: [
                        [
                            'Start by counting only the bulbs that are ' +
                            highlight('ON') +
                            ' in the carried octet.',

                            'There are ' +
                            highlight(onBits) +
                            ' glowing bulbs, so the mask contains ' +
                            highlight(onBits + ' borrowed subnet bits') +
                            '.',
                        ],

                        [
                            'The subnet formula is:',

                            highlight('TOTAL SUBNETS = 2^(borrowed bits)'),

                            '',

                            'For this panel:',

                            highlight(
                                powerText(
                                    onBits,
                                    totalSubnets
                                )
                            ),

                            'Therefore ' +
                            highlight('TOTAL SUBNETS = ' + totalSubnets) +
                            '.',
                        ],

                        [
                            'The merge field represents that same power-of-two process.',

                            highlight('2 + 2 = 4'),
                            highlight('4 + 4 = 8'),
                            highlight('8 + 8 = 16'),

                            '',

                            'Every equal merge doubles the value. Keep doubling until you reach ' +
                            highlight(totalSubnets) +
                            '.',
                        ],
                    ],

                    onComplete,
                }
            );
        },

        showUsableSubnetsGuide(context, onComplete) {
            const c = context || {};

            const totalSubnets = Math.max(
                0,
                safeNumber(c.totalSubnets, 0)
            );

            const usableSubnets = Math.max(
                0,
                safeNumber(
                    c.usableSubnets,
                    Math.max(0, totalSubnets - 2)
                )
            );

            this.setGameplayHighlight(
                'usable_subnets',
                '02B // TOTAL SUBNETS - 2 = USABLE SUBNETS'
            );

            return this._startDynamicDialogue(
                'stage2.ipsubnetsim.usable_subnets.',
                {
                    title: 'CALCULATE USABLE SUBNETS',
                    speaker: 'SYSTEM',
                    timing: 'during',

                    bindings: {
                        mapId: 8,
                        gameplayId: 'ip_subnet_simulator',
                        objectiveId: 'solve_cidr_chain_01_subnet',
                        trigger: 'gameplay.during',
                    },

                    slides: [
                        [
                            'Next, calculate the value for ' +
                            highlight('USABLE SUBNETS') +
                            '.',

                            'This training console uses the legacy subnetting rule that reserves the first and last subnet values.',

                            '',

                            'So for this level:',

                            highlight(
                                totalSubnets +
                                ' - 2 = ' +
                                usableSubnets
                            ),
                        ],

                        [
                            'You do not need to build the usable value from zero.',

                            'Once you create ' +
                            highlight(totalSubnets) +
                            ', use ' +
                            highlight('DUPLICATE') +
                            ' to make a copy.',

                            'Keep one copy as ' +
                            highlight('TOTAL SUBNETS') +
                            ', then drag the ' +
                            highlight('-2') +
                            ' tool onto the other copy to make ' +
                            highlight(usableSubnets + ' USABLE SUBNETS') +
                            '.',
                        ],

                        [
                            'Real networking note: modern IPv4 networks normally allow subnet-zero and the all-ones subnet.',

                            'The ' +
                            highlight('subnets - 2') +
                            ' rule is intentionally used here as a legacy training convention. The host -2 rule you will see later has a different purpose.',
                        ],
                    ],

                    onComplete,
                }
            );
        },

        showSubnetSolvePrompt(context, onComplete) {
            const c = context || {};

            const totalSubnets = Math.max(
                0,
                safeNumber(c.totalSubnets, 0)
            );

            const usableSubnets = Math.max(
                0,
                safeNumber(c.usableSubnets, Math.max(0, totalSubnets - 2))
            );

            const uses = Math.max(
                0,
                safeNumber(c.duplicateUsesLeft, 3)
            );

            this.setGameplayHighlight(
                'subnet_solve',
                '02C // SOLVE THE TWO SUBNET BAYS FIRST'
            );

            const slides = [
                [
                    'Your first task is now active.',

                    '',

                    'Build and place these two answers first:',

                    highlight('TOTAL SUBNETS = ' + totalSubnets),

                    highlight('USABLE SUBNETS = ' + usableSubnets),

                    '',

                    'The two HOST bays remain ' +
                    highlight('LOCKED') +
                    ' until both subnet answers are correct.',
                ],

                [
                    'Efficient route:',

                    highlight('1. Merge equal numbers until you reach ' + totalSubnets + '.'),

                    highlight('2. DUPLICATE the completed total.'),

                    highlight('3. Keep one copy in TOTAL SUBNETS.'),

                    highlight('4. Apply -2 to the copy and place it in USABLE SUBNETS.'),

                    '',

                    'DUPLICATE currently has ' +
                    highlight(uses + ' charges') +
                    ', while the -2 tool can be reused.',
                ],
            ];

            if (totalSubnets === 64) {
                slides.push([
                    'Shortcut detected for ' +
                    highlight('64') +
                    ':',

                    'When you reach ' +
                    highlight('32') +
                    ', DUPLICATE the 32 and merge the pair:',

                    highlight('32 + 32 = 64'),

                    '',

                    'That saves you from building another complete 32 chain manually.',
                ]);
            }

            slides.push([
                highlight('Solve the SUBNET values now.'),

                'Do not place anything in TOTAL HOSTS or USABLE HOSTS yet. If you try, APEX will reject the transfer and remind you to finish this stage first.',
            ]);

            return this._startDynamicDialogue(
                'stage2.ipsubnetsim.subnet_solve.',
                {
                    title: 'SUBNET PHASE UNLOCKED',
                    speaker: 'SYSTEM',
                    timing: 'during',

                    bindings: {
                        mapId: 8,
                        gameplayId: 'ip_subnet_simulator',
                        objectiveId: 'solve_cidr_chain_01_subnet',
                        trigger: 'gameplay.during',
                    },

                    slides,
                    onComplete,
                }
            );
        },

        /**
         * This is triggered if the player tries to use a host bay before the
         * two subnet answers are complete.
         */
        showHostsLockedReminder(context, onComplete) {
            const c = context || {};

            const totalSubnets = Math.max(
                0,
                safeNumber(c.totalSubnets, 0)
            );

            const usableSubnets = Math.max(
                0,
                safeNumber(c.usableSubnets, Math.max(0, totalSubnets - 2))
            );

            this.setGameplayHighlight(
                'subnet_solve',
                'HOST SECTION LOCKED // FINISH SUBNETS FIRST'
            );

            return this._startDynamicDialogue(
                'stage2.ipsubnetsim.host_locked.',
                {
                    title: 'HOST SECTION LOCKED',
                    speaker: 'SYSTEM',
                    timing: 'during',

                    bindings: {
                        mapId: 8,
                        gameplayId: 'ip_subnet_simulator',
                        objectiveId: 'solve_cidr_chain_01_subnet',
                        trigger: 'gameplay.during',
                    },

                    slides: [[
                        'Not yet, Infiltrator. Finish the subnet calculation before moving to hosts.',

                        '',

                        'Secure these first:',

                        highlight('TOTAL SUBNETS = ' + totalSubnets),

                        highlight('USABLE SUBNETS = ' + usableSubnets),

                        '',

                        'Remember: ' +
                        highlight('ON bulbs -> 2^borrowed bits') +
                        ', then duplicate the total and use ' +
                        highlight('-2') +
                        ' for the usable value.',
                    ]],

                    onComplete,
                }
            );
        },

        /**
         * ---------------------------------------------------------
         * STAGE 2 — HOSTS
         * ---------------------------------------------------------
         */
        showHostStageGuide(context, onComplete) {
            const c = context || {};

            return this.showHostPowerGuide(c, () => {
                this.showUsableHostsGuide(c, () => {
                    this.showHostSolvePrompt(c, onComplete);
                });
            });
        },

        showHostPowerGuide(context, onComplete) {
            const c = context || {};

            const offBits = Math.max(
                0,
                safeNumber(c.hostBits, 0)
            );

            const totalHosts = Math.max(
                0,
                safeNumber(
                    c.totalHosts,
                    Math.pow(2, offBits)
                )
            );

            this.setGameplayHighlight(
                'host_power',
                '03 // OFF BULBS -> TOTAL HOST ADDRESSES'
            );

            return this._startDynamicDialogue(
                'stage2.ipsubnetsim.host_power.',
                {
                    title: 'SUBNET VALUES SECURED',
                    speaker: 'SYSTEM',
                    timing: 'during',

                    bindings: {
                        mapId: 8,
                        gameplayId: 'ip_subnet_simulator',
                        objectiveId: 'solve_cidr_chain_01_subnet',
                        trigger: 'gameplay.during',
                    },

                    slides: [
                        [
                            'Subnet values confirmed. The HOST section is now ready.',

                            '',

                            'This time count the bulbs that are ' +
                            highlight('OFF') +
                            '.',

                            'There are ' +
                            highlight(offBits) +
                            ' dark bulbs, which means ' +
                            highlight(offBits + ' host bits') +
                            '.',
                        ],

                        [
                            'The host formula is:',

                            highlight('TOTAL HOST ADDRESSES = 2^(host bits)'),

                            '',

                            'For this panel:',

                            highlight(
                                powerText(
                                    offBits,
                                    totalHosts
                                )
                            ),

                            'Therefore ' +
                            highlight('TOTAL HOSTS = ' + totalHosts) +
                            '.',
                        ],

                        [
                            'This is the same reasoning used in manual subnetting:',

                            highlight('borrowed 1-bits -> subnet count'),

                            highlight('remaining 0-bits -> addresses per subnet'),

                            '',

                            'The game simply lets you physically build the powers of two by merging equal values.',
                        ],
                    ],

                    onComplete,
                }
            );
        },

        showUsableHostsGuide(context, onComplete) {
            const c = context || {};

            const totalHosts = Math.max(
                0,
                safeNumber(c.totalHosts, 0)
            );

            const usableHosts = Math.max(
                0,
                safeNumber(
                    c.usableHosts,
                    Math.max(0, totalHosts - 2)
                )
            );

            this.setGameplayHighlight(
                'usable_hosts',
                '03B // TOTAL HOSTS - 2 = USABLE HOSTS'
            );

            return this._startDynamicDialogue(
                'stage2.ipsubnetsim.usable_hosts.',
                {
                    title: 'CALCULATE USABLE HOSTS',
                    speaker: 'SYSTEM',
                    timing: 'during',

                    bindings: {
                        mapId: 8,
                        gameplayId: 'ip_subnet_simulator',
                        objectiveId: 'solve_cidr_chain_01_subnet',
                        trigger: 'gameplay.during',
                    },

                    slides: [
                        [
                            'For ordinary IPv4 subnets in this lesson, two addresses cannot be assigned to devices:',

                            highlight('NETWORK ADDRESS'),

                            'and',

                            highlight('BROADCAST ADDRESS'),

                            '',

                            'So calculate:',
                        ],

                        [
                            highlight(
                                totalHosts +
                                ' - 2 = ' +
                                usableHosts
                            ),

                            '',

                            'Therefore ' +
                            highlight('USABLE HOSTS = ' + usableHosts) +
                            '.',

                            'Again, the fast method is to duplicate the TOTAL value and apply ' +
                            highlight('-2') +
                            ' to the copy.',
                        ],
                    ],

                    onComplete,
                }
            );
        },

        showHostSolvePrompt(context, onComplete) {
            const c = context || {};

            const totalSubnets = Math.max(
                0,
                safeNumber(c.totalSubnets, 0)
            );

            const totalHosts = Math.max(
                0,
                safeNumber(c.totalHosts, 0)
            );

            const usableHosts = Math.max(
                0,
                safeNumber(c.usableHosts, Math.max(0, totalHosts - 2))
            );

            this.setGameplayHighlight(
                'host_solve',
                '03C // SOLVE TOTAL HOSTS + USABLE HOSTS'
            );

            const largerTarget =
                totalHosts >= totalSubnets
                    ? totalHosts
                    : totalSubnets;

            const largerType =
                totalHosts >= totalSubnets
                    ? 'HOST'
                    : 'SUBNET';

            const slides = [
                [
                    'Now solve the host pair:',

                    highlight('TOTAL HOSTS = ' + totalHosts),

                    highlight('USABLE HOSTS = ' + usableHosts),

                    '',

                    'Build the total, duplicate it, and use -2 on the copy just as you did with the subnet values.',
                ],

                [
                    'Whenever one required total is larger than another, save work by keeping useful intermediate values.',

                    'In this panel the larger power-of-two target is the ' +
                    highlight(largerType + ' total: ' + largerTarget) +
                    '.',

                    'If you pass through another value you still need, use ' +
                    highlight('DUPLICATE') +
                    ' before merging upward.',
                ],
            ];

            if (totalHosts === 64) {
                slides.push([
                    'Host shortcut for ' +
                    highlight('64') +
                    ':',

                    'As soon as you create ' +
                    highlight('32') +
                    ', DUPLICATE it.',

                    'Then merge:',

                    highlight('32 + 32 = 64'),

                    '',

                    'Keep or duplicate the completed 64 as needed, then apply -2 to a copy for ' +
                    highlight('62 usable hosts') +
                    '.',
                ]);
            }

            slides.push([
                highlight('Solve the HOST values now.'),

                'Once both host bays are correct, APEX will unlock the final validation step.',
            ]);

            return this._startDynamicDialogue(
                'stage2.ipsubnetsim.host_solve.',
                {
                    title: 'HOST PHASE UNLOCKED',
                    speaker: 'SYSTEM',
                    timing: 'during',

                    bindings: {
                        mapId: 8,
                        gameplayId: 'ip_subnet_simulator',
                        objectiveId: 'solve_cidr_chain_01_subnet',
                        trigger: 'gameplay.during',
                    },

                    slides,
                    onComplete,
                }
            );
        },

        showValidationLockedReminder(context, onComplete) {
            const c = context || {};

            const totalHosts = Math.max(
                0,
                safeNumber(c.totalHosts, 0)
            );

            const usableHosts = Math.max(
                0,
                safeNumber(c.usableHosts, Math.max(0, totalHosts - 2))
            );

            this.setGameplayHighlight(
                'host_solve',
                'VALIDATION LOCKED // FINISH HOSTS FIRST'
            );

            return this._startDynamicDialogue(
                'stage2.ipsubnetsim.validation_locked.',
                {
                    title: 'VALIDATION LOCKED',
                    speaker: 'SYSTEM',
                    timing: 'during',

                    bindings: {
                        mapId: 8,
                        gameplayId: 'ip_subnet_simulator',
                        objectiveId: 'solve_cidr_chain_01_subnet',
                        trigger: 'gameplay.during',
                    },

                    slides: [[
                        'The simulation is not ready to validate yet.',

                        '',

                        'Complete the remaining host values first:',

                        highlight('TOTAL HOSTS = ' + totalHosts),

                        highlight('USABLE HOSTS = ' + usableHosts),

                        '',

                        'Then the validation shield will accept the completed calculation.',
                    ]],

                    onComplete,
                }
            );
        },

        /**
         * ---------------------------------------------------------
         * FINAL RECAP
         * ---------------------------------------------------------
         */
        showFinalGuide(context, onComplete) {
            const c = context || {};

            const totalSubnets = Math.max(0, safeNumber(c.totalSubnets, 0));
            const usableSubnets = Math.max(0, safeNumber(c.usableSubnets, 0));
            const totalHosts = Math.max(0, safeNumber(c.totalHosts, 0));
            const usableHosts = Math.max(0, safeNumber(c.usableHosts, 0));

            this.setGameplayHighlight(
                'validation_ready',
                '04 // ALL FOUR VALUES COMPLETE'
            );

            return this._startDynamicDialogue(
                'stage2.ipsubnetsim.validation_ready.',
                {
                    title: 'SUBNET CAPACITY RESOLVED',
                    speaker: 'SYSTEM',
                    timing: 'during',

                    bindings: {
                        mapId: 8,
                        gameplayId: 'ip_subnet_simulator',
                        objectiveId: 'solve_cidr_chain_01_subnet',
                        trigger: 'gameplay.during',
                    },

                    slides: [
                        [
                            'Excellent. All four calculations are now secured.',

                            highlight('TOTAL SUBNETS = ' + totalSubnets),
                            highlight('USABLE SUBNETS = ' + usableSubnets),
                            highlight('TOTAL HOSTS = ' + totalHosts),
                            highlight('USABLE HOSTS = ' + usableHosts),
                        ],

                        [
                            'You have now practiced the same core reasoning used when solving subnet capacity manually:',

                            highlight('ON / borrowed bits -> 2^n subnets'),

                            highlight('OFF / host bits -> 2^n addresses'),

                            highlight('subtract reserved values where the exercise requires it'),

                            '',

                            'The numbers you merged are simply the powers of two you would normally calculate on paper.',
                        ],

                        [
                            'Press the ' +
                            highlight('YELLOW VALIDATION SHIELD') +
                            ' to submit the completed simulation.',

                            'APEX will compare all four values before opening the next route.',
                        ],
                    ],

                    onComplete,
                }
            );
        },

        showAttemptReset(onComplete) {
            return this._startDynamicDialogue(
                'stage2.ipsubnetsim.retry_reset.',
                {
                    title: 'SIMULATOR TRAINING RECALIBRATION',
                    speaker: 'SYSTEM',
                    timing: 'after',

                    bindings: {
                        mapId: 8,
                        gameplayId: 'ip_subnet_simulator',
                        trigger: 'gameplay.failed',
                    },

                    slides: [[
                        'Three subnet-capacity validations were rejected.',

                        '',

                        'Rebuild the calculation in order:',

                        highlight('1. ON bulbs -> TOTAL SUBNETS'),

                        highlight('2. duplicate total -> -2 -> USABLE SUBNETS'),

                        highlight('3. OFF bulbs -> TOTAL HOSTS'),

                        highlight('4. duplicate total -> -2 -> USABLE HOSTS'),

                        '',

                        'Your previous CIDR solution remains secured, so the same carried octet will be waiting for you.',
                    ]],

                    onComplete,
                }
            );
        },

        _startDynamicDialogue(prefix, definition) {
            const dm = IP2Live.DialogueManager;

            if (
                !dm ||
                typeof dm.registerDialogue !== 'function' ||
                typeof dm.start !== 'function'
            ) {
                if (
                    definition &&
                    typeof definition.onComplete === 'function'
                ) {
                    definition.onComplete();
                }

                return false;
            }

            const screen = this.activeScreen();

            if (screen) {
                screen.tutorialPaused = true;
            }

            const id =
                prefix +
                (++this._dialogueSerial);

            dm.registerDialogue(
                id,
                {
                    title:
                        definition.title ||
                        'TRANSMISSION',

                    speaker:
                        definition.speaker ||
                        'SYSTEM',

                    slides:
                        definition.slides ||
                        [],

                    timing:
                        definition.timing ||
                        'during',

                    bindings:
                        Object.assign(
                            {},
                            definition.bindings ||
                            {}
                        ),

                    hideQuestPanel:
                        true,

                    lockMovement:
                        true,

                    onComplete:
                        definition.onComplete ||
                        null,
                }
            );

            return dm.start(
                id,
                {
                    source:
                        'IPSubnetSimulatorTutorial',
                }
            );
        },

        /**
         * ---------------------------------------------------------
         * VISUAL FOCUS INTEGRATION
         * ---------------------------------------------------------
         *
         * The gameplay owns the tutorial state machine. This patch only adds
         * the extra highlight targets required by the staged lesson.
         */
        installGameplayIntegration() {
            const ScreenClass =
                IP2Live.SubnetSimulatorGameplayScreen ||
                window.IP2LiveSubnetSimulatorGameplayScreen;

            if (
                !ScreenClass ||
                !ScreenClass.prototype
            ) {
                return false;
            }

            const proto = ScreenClass.prototype;

            if (proto._ip2liveSubnetTutorialEnhancedV2) {
                this._integrationInstalled = true;
                return true;
            }

            Object.defineProperty(
                proto,
                '_ip2liveSubnetTutorialEnhancedV2',
                {
                    value: true,
                    configurable: true,
                }
            );

            const originalHighlightRects =
                proto._tutorialHighlightRects;

            proto._tutorialHighlightRects = function (m) {
                const h = this.tutorialHighlight || {};
                const type = h.type;

                const clampRect = (rect) => {
                    const padX = 8 * m.sX;
                    const padY = 8 * m.sY;

                    const x = Math.max(padX, rect.x);
                    const y = Math.max(padY, rect.y);

                    return {
                        x,
                        y,

                        w:
                            Math.max(
                                18 * m.sX,
                                Math.min(
                                    rect.x + rect.w,
                                    m.cW - padX
                                ) - x
                            ),

                        h:
                            Math.max(
                                18 * m.sY,
                                Math.min(
                                    rect.y + rect.h,
                                    m.cH - padY
                                ) - y
                            ),
                    };
                };

                const slotRect = (slotKey) => {
                    const slot =
                        typeof this._slotByKey === 'function'
                            ? this._slotByKey(slotKey)
                            : null;

                    if (!slot) return null;

                    const w =
                        slot.bayW ||
                        210 * m.sX;

                    const height =
                        slot.bayH ||
                        100 * m.sY;

                    const y =
                        Number.isFinite(slot.bayY)
                            ? slot.bayY
                            : slot.y - height * 0.5;

                    return clampRect({
                        x:
                            slot.x -
                            w * 0.5 -
                            5 * m.sX,

                        y:
                            y -
                            10 * m.sY,

                        w:
                            w +
                            10 * m.sX,

                        h:
                            height +
                            15 * m.sY,
                    });
                };

                const ballRect = (ball) => {
                    if (!ball) return null;

                    const padding =
                        13 * m.sX;

                    return clampRect({
                        x:
                            ball.x -
                            ball.r -
                            padding,

                        y:
                            ball.y -
                            ball.r -
                            padding,

                        w:
                            (
                                ball.r +
                                padding
                            ) *
                            2,

                        h:
                            (
                                ball.r +
                                padding
                            ) *
                            2,
                    });
                };

                const carriedRect = () => {
                    const widgetW =
                        286 * m.sX;

                    const widgetH =
                        54 * m.sY;

                    const widgetX =
                        m.panelX +
                        m.panelW -
                        widgetW -
                        24 * m.sX;

                    const widgetY =
                        m.panelY +
                        12 * m.sY;

                    return clampRect({
                        x:
                            widgetX -
                            8 * m.sX,

                        y:
                            widgetY -
                            8 * m.sY,

                        w:
                            widgetW +
                            16 * m.sX,

                        h:
                            widgetH +
                            16 * m.sY,
                    });
                };

                const arenaRect = () => {
                    return clampRect({
                        x:
                            m.arenaX +
                            8 * m.sX,

                        y:
                            m.arenaY +
                            18 * m.sY,

                        w:
                            m.arenaW -
                            16 * m.sX,

                        h:
                            m.arenaH -
                            28 * m.sY,
                    });
                };

                const result = {
                    rects: [],
                    label:
                        h.label ||
                        '',
                };

                const add = (rect) => {
                    if (rect) result.rects.push(rect);
                };

                if (type === 'carried_reference') {
                    add(
                        carriedRect()
                    );

                    return result;
                }

                if (type === 'subnet_power') {
                    add(
                        carriedRect()
                    );

                    add(
                        slotRect(
                            'totalSubnets'
                        )
                    );

                    add(
                        arenaRect()
                    );

                    return result;
                }

                if (type === 'usable_subnets') {
                    add(
                        slotRect(
                            'totalSubnets'
                        )
                    );

                    add(
                        slotRect(
                            'usableSubnets'
                        )
                    );

                    add(
                        ballRect(
                            typeof this._minusBall === 'function'
                                ? this._minusBall()
                                : null
                        )
                    );

                    add(
                        ballRect(
                            typeof this._duplicateBall === 'function'
                                ? this._duplicateBall()
                                : null
                        )
                    );

                    return result;
                }

                if (type === 'subnet_solve') {
                    add(
                        slotRect(
                            'totalSubnets'
                        )
                    );

                    add(
                        slotRect(
                            'usableSubnets'
                        )
                    );

                    add(
                        ballRect(
                            typeof this._duplicateBall === 'function'
                                ? this._duplicateBall()
                                : null
                        )
                    );

                    add(
                        ballRect(
                            typeof this._minusBall === 'function'
                                ? this._minusBall()
                                : null
                        )
                    );

                    add(
                        arenaRect()
                    );

                    return result;
                }

                if (type === 'host_power') {
                    add(
                        carriedRect()
                    );

                    add(
                        slotRect(
                            'totalHosts'
                        )
                    );

                    add(
                        arenaRect()
                    );

                    return result;
                }

                if (type === 'usable_hosts') {
                    add(
                        slotRect(
                            'totalHosts'
                        )
                    );

                    add(
                        slotRect(
                            'usableHosts'
                        )
                    );

                    add(
                        ballRect(
                            typeof this._minusBall === 'function'
                                ? this._minusBall()
                                : null
                        )
                    );

                    add(
                        ballRect(
                            typeof this._duplicateBall === 'function'
                                ? this._duplicateBall()
                                : null
                        )
                    );

                    return result;
                }

                if (type === 'host_solve') {
                    add(
                        slotRect(
                            'totalHosts'
                        )
                    );

                    add(
                        slotRect(
                            'usableHosts'
                        )
                    );

                    add(
                        ballRect(
                            typeof this._duplicateBall === 'function'
                                ? this._duplicateBall()
                                : null
                        )
                    );

                    add(
                        ballRect(
                            typeof this._minusBall === 'function'
                                ? this._minusBall()
                                : null
                        )
                    );

                    add(
                        arenaRect()
                    );

                    return result;
                }

                if (type === 'validation_ready') {
                    add(
                        slotRect(
                            'totalSubnets'
                        )
                    );

                    add(
                        slotRect(
                            'usableSubnets'
                        )
                    );

                    add(
                        slotRect(
                            'totalHosts'
                        )
                    );

                    add(
                        slotRect(
                            'usableHosts'
                        )
                    );

                    if (this.submitRect) {
                        add(
                            clampRect({
                                x:
                                    this.submitRect.x -
                                    7 * m.sX,

                                y:
                                    this.submitRect.y -
                                    7 * m.sY,

                                w:
                                    this.submitRect.w +
                                    14 * m.sX,

                                h:
                                    this.submitRect.h +
                                    14 * m.sY,
                            })
                        );
                    }

                    return result;
                }

                if (
                    typeof originalHighlightRects ===
                    'function'
                ) {
                    return originalHighlightRects.call(
                        this,
                        m
                    );
                }

                return result;
            };

            this._integrationInstalled = true;

            console.log(
                '[IP2Live] staged Subnet Simulator tutorial integration installed.'
            );

            return true;
        },

        scheduleGameplayIntegration() {
            if (
                this.installGameplayIntegration()
            ) {
                return true;
            }

            if (
                this._integrationAttempts >=
                100
            ) {
                return false;
            }

            this._integrationAttempts++;

            if (
                typeof setTimeout ===
                'function'
            ) {
                setTimeout(
                    () =>
                        this.scheduleGameplayIntegration(),
                    100
                );
            }

            return false;
        },
    };

    IP2Live.IPSubnetSimulatorTutorial =
        IPSubnetSimulatorTutorial;

    window.IP2LiveIPSubnetSimulatorTutorial =
        IPSubnetSimulatorTutorial;

    IPSubnetSimulatorTutorial.scheduleGameplayIntegration();

    console.log(
        '[IP2Live] ip_subnetsim_tutorial.js loaded.'
    );
}());
