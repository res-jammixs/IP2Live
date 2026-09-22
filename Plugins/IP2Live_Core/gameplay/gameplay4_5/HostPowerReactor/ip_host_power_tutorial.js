/**
 * IP2Live - Gameplay 4.5 Host-Power Reactor Tutorial
 *
 * Guided tutorial for the analytical host-capacity bridge.
 *
 * Learning sequence:
 *   1. Connect Gameplay 4's repeated-doubling idea to 2^h.
 *   2. Read HOSTS NEEDED.
 *   3. Understand the engine and the "smallest valid h" objective.
 *   4. Catch positive energy cells with the collector tether.
 *   5. Use broken red cells to reduce h after an overshoot.
 *   6. Watch COLLECTED ENERGY to track the current exponent.
 *   7. Calculate 2^h - 2 and interpret the result.
 *   8. Press CALCULATE again whenever h changes.
 *   9. Read the bubbling side-fluid columns as the APEX trace timer.
 *
 * Important dialogue terms use {{highlight:...}} so the Dialogue Manager
 * can emphasize the concepts the learner should remember.
 */

(function () {
    function highlight(value) {
        return '{{highlight:' + String(value == null ? '' : value) + '}}';
    }

    function safeNumber(value, fallback) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function plural(value, singular, pluralValue) {
        return Number(value) === 1 ? singular : (pluralValue || singular + 's');
    }

    function formatDuration(seconds) {
        const total = Math.max(1, Math.round(safeNumber(seconds, 120)));
        const minutes = Math.floor(total / 60);
        const remaining = total % 60;

        if (remaining === 0) {
            return minutes + ' ' + plural(minutes, 'minute');
        }

        if (minutes <= 0) {
            return remaining + ' ' + plural(remaining, 'second');
        }

        return minutes + ':' + String(remaining).padStart(2, '0');
    }

    const IPHostPowerReactorTutorial = {
        VERSION: 'ip-host-power-reactor-tutorial-20260921-10',

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
                    candidate.gameplayId === 'ip_host_power_reactor' ||
                    (
                        window.IP2LiveHostPowerReactorGameplayScreen &&
                        candidate instanceof window.IP2LiveHostPowerReactorGameplayScreen
                    )
                ) {
                    this._screen = candidate;
                    return candidate;
                }
            }

            return null;
        },

        contextForScreen(screen) {
            const target = screen || this.activeScreen();
            const scenario = target && target.scenario
                ? target.scenario
                : {};

            return Object.assign({}, scenario, {
                durationSeconds:
                    target && Number(target.durationSeconds)
                        ? Number(target.durationSeconds)
                        : 120,

                currentExponent:
                    target
                        ? Math.max(0, Number(target.exponent) || 0)
                        : 0,

                calculatedEvaluation:
                    target && target.calculatedEvaluation
                        ? Object.assign({}, target.calculatedEvaluation)
                        : null,
            });
        },

        /**
         * ============================================================
         * STORY INTRO
         * ============================================================
         *
         * This normally appears before the gameplay screen opens, so it
         * deliberately focuses on narrative continuity and the learning goal.
         */
        showIntro(context, onComplete) {
            return this._startDynamicDialogue('stage.hostpower.intro.', {
                title: 'APEX ENGINE SECTOR',
                speaker: 'SYSTEM',
                timing: 'before',

                bindings: {
                    gameplayId: 'ip_host_power_reactor',
                    trigger: 'gameplay.before',
                },

                slides: [
                    [
                        'Good work, Infiltrator. We have reached another protected section of the APEX network.',

                        'APEX has installed ' +
                        highlight('BYPASS ENGINES') +
                        ' throughout this sector to control access deeper into the system.',
                    ],

                    [
                        'To move forward without being detected, we need to ' +
                        highlight('STABILIZE THE ENGINE') +
                        ' before APEX finishes tracing our connection.',

                        'I will guide you through the reactor once we access its console.',
                    ],
                ],

                onComplete,
            });
        },

        /**
         * ============================================================
         * 01 — HOSTS NEEDED
         * ============================================================
         */
        showTargetGuide(context, onComplete) {
            const c = context || {};
            const requiredHosts = Math.max(1, safeNumber(c.requiredHosts, 50));

            return this._startDynamicDialogue('stage.hostpower.guided.target.', {
                title: '01 // HOSTS NEEDED',
                speaker: 'SYSTEM',
                timing: 'during',

                bindings: {
                    gameplayId: 'ip_host_power_reactor',
                    trigger: 'gameplay.during',
                },

                slides: [[
                    'The highlighted plaque shows the ' +
                    highlight('HOSTS NEEDED') +
                    '. Find the smallest h where ' +
                    highlight('2^h - 2 >= ' + requiredHosts) +
                    '.',
                ]],

                onComplete,
            });
        },

        /**
         * Compatibility alias for older gameplay versions.
         */
        showReactorGuide(context, onComplete) {
            return this.showTargetGuide(context, onComplete);
        },

        /**
         * ============================================================
         * 02 — ENGINE CHAMBER
         * ============================================================
         */
        showEngineGuide(context, onComplete) {
            return this._startDynamicDialogue('stage.hostpower.guided.engine.', {
                title: '02 // BYPASS ENGINE',
                speaker: 'SYSTEM',
                timing: 'during',

                bindings: {
                    gameplayId: 'ip_host_power_reactor',
                    trigger: 'gameplay.during',
                },

                slides: [[
                    'The highlighted chamber is the ' +
                    highlight('BYPASS ENGINE') +
                    '; power it with the correct h without underpowering or overloading it.',
                ]],

                onComplete,
            });
        },

        /**
         * ============================================================
         * 03 — ENERGY INTAKE
         * ============================================================
         */
        showIntakeGuide(context, onComplete) {
            return this._startDynamicDialogue('stage.hostpower.guided.intake.', {
                title: '03 // ENERGY INTAKE',
                speaker: 'SYSTEM',
                timing: 'during',

                bindings: {
                    gameplayId: 'ip_host_power_reactor',
                    trigger: 'gameplay.during',
                },

                slides: [[
                    'Energy cells fall through ' +
                    highlight('5 LANES') +
                    '; normal cells add their number to h, while red broken cells subtract from h.',
                ]],

                onComplete,
            });
        },

        /**
         * ============================================================
         * 04 — ENERGY CELL / BROKEN CELL
         * ============================================================
         */
        showShellGuide(context, onComplete) {
            return this._startDynamicDialogue('stage.hostpower.guided.cells.', {
                title: '04 // ENERGY CELLS',
                speaker: 'SYSTEM',
                timing: 'during',

                bindings: {
                    gameplayId: 'ip_host_power_reactor',
                    trigger: 'gameplay.during',
                },

                slides: [[
                    'Colored cells ' +
                    highlight('ADD ENERGY') +
                    '; red broken cells ' +
                    highlight('REMOVE ENERGY') +
                    ' when you need to correct h.',
                ]],

                onComplete,
            });
        },

        /**
         * ============================================================
         * 05 — COLLECTOR
         * ============================================================
         */
        showControlsGuide(context, onComplete) {
            return this._startDynamicDialogue('stage.hostpower.guided.controls.', {
                title: '05 // COLLECTOR',
                speaker: 'SYSTEM',
                timing: 'during',

                bindings: {
                    gameplayId: 'ip_host_power_reactor',
                    trigger: 'gameplay.during',
                },

                slides: [[
                    'Move with ' +
                    highlight('A / D') +
                    ' or ' +
                    highlight('LEFT / RIGHT') +
                    ', then press ' +
                    highlight('SPACE') +
                    ' to grab the cell above your collector.',
                ]],

                onComplete,
            });
        },

        /**
         * ============================================================
         * 06 — COLLECTED ENERGY DISPLAY
         * ============================================================
         */
        showCollectedEnergyGuide(context, onComplete) {
            const c = context || {};
            const currentExponent = Math.max(0, safeNumber(c.currentExponent, 0));

            return this._startDynamicDialogue('stage.hostpower.guided.energy_display.', {
                title: '06 // COLLECTED ENERGY',
                speaker: 'SYSTEM',
                timing: 'during',

                bindings: {
                    gameplayId: 'ip_host_power_reactor',
                    trigger: 'gameplay.during',
                },

                slides: [[
                    'This display shows your current exponent ' +
                    highlight('h = ' + currentExponent) +
                    '; h is the power used in ' +
                    highlight('2^h') +
                    ', not the host count.',
                ]],

                onComplete,
            });
        },

        /**
         * ============================================================
         * 07 — CALCULATION / OUTPUT
         * ============================================================
         */
        showFormulaGuide(context, onComplete) {
            const c = context || {};
            const requiredHosts = Math.max(1, safeNumber(c.requiredHosts, 50));

            return this._startDynamicDialogue('stage.hostpower.guided.formula.', {
                title: '07 // CALCULATED OUTPUT',
                speaker: 'SYSTEM',
                timing: 'during',

                bindings: {
                    gameplayId: 'ip_host_power_reactor',
                    trigger: 'gameplay.during',
                },

                slides: [[
                    'The output checks ' +
                    highlight('2^h - 2') +
                    ' and compares the usable hosts with ' +
                    highlight(requiredHosts + ' HOSTS NEEDED') +
                    '.',
                ]],

                onComplete,
            });
        },

        /**
         * ============================================================
         * 08 — CALCULATE BUTTON
         * ============================================================
         */
        showCalculateGuide(context, onComplete) {
            return this._startDynamicDialogue('stage.hostpower.guided.calculate.', {
                title: '08 // CALCULATE',
                speaker: 'SYSTEM',
                timing: 'during',

                bindings: {
                    gameplayId: 'ip_host_power_reactor',
                    trigger: 'gameplay.during',
                },

                slides: [
                    [
                        'Press ' +
                        highlight('CALCULATE') +
                        ' to verify your current h and update the engine.',
                    ],

                    [
                        'If you catch or remove energy afterward, press ' +
                        highlight('CALCULATE AGAIN') +
                        ' because the previous result stays as the last verified value.',
                    ],
                ],

                onComplete,
            });
        },

        /**
         * ============================================================
         * 09 — TIMER / TRACE FLUID
         * ============================================================
         */
        showTimerGuide(context, onComplete) {
            const c = context || {};
            const durationSeconds = Math.max(10, safeNumber(c.durationSeconds, 120));
            const durationText = formatDuration(durationSeconds);

            return this._startDynamicDialogue('stage.hostpower.guided.timer.', {
                title: '09 // APEX TRACE',
                speaker: 'SYSTEM',
                timing: 'during',

                bindings: {
                    gameplayId: 'ip_host_power_reactor',
                    trigger: 'gameplay.during',
                },

                slides: [
                    [
                        'The bubbling side tubes are the ' +
                        highlight('APEX TRACE TIMER') +
                        '; the fluid rises bottom-to-top until time runs out.',
                    ],

                    [
                        'You have ' +
                        highlight(durationText) +
                        '. Build the smallest valid h, calculate it, and stabilize the engine before the trace completes.',
                    ],
                ],

                onComplete,
            });
        },

        /**
         * ============================================================
         * TOOL MODE
         * ============================================================
         */
        showToolIntro(context, onComplete) {
            const c = context || {};
            const requiredHosts = Math.max(1, safeNumber(c.requiredHosts, 50));

            return this._startDynamicDialogue('stage.hostpower.tool.', {
                title: 'HOST-BIT CALCULATOR TOOL',
                speaker: 'SYSTEM',
                timing: 'before',

                bindings: {
                    gameplayId: 'ip_host_power_tool',
                    trigger: 'tool.before',
                },

                slides: [[
                    'Build h for ' +
                    highlight(requiredHosts + ' HOSTS') +
                    ' and verify the smallest value where ' +
                    highlight('2^h - 2') +
                    ' is enough.',
                ]],

                onComplete,
            });
        },

        /**
         * ============================================================
         * TIMEOUT
         * ============================================================
         */
        showTimeout(context, onComplete) {
            const c = context || {};
            const requiredHosts = Math.max(1, safeNumber(c.requiredHosts, 1));

            return this._startDynamicDialogue('stage.hostpower.timeout.', {
                title: 'REACTOR POWER LOST',
                speaker: 'SYSTEM',
                timing: 'during',

                bindings: {
                    gameplayId: 'ip_host_power_reactor',
                    trigger: 'gameplay.failed',
                },

                slides: [[
                    'APEX completed the trace. Rebuild the smallest h where ' +
                    highlight('2^h - 2 >= ' + requiredHosts) +
                    ', then calculate again.',
                ]],

                onComplete,
            });
        },

        /**
         * ============================================================
         * WRONG CALCULATION
         * ============================================================
         */
        showCorrection(context, onComplete) {
            const c = context || {};
            const currentExponent = Math.max(0, safeNumber(c.currentExponent, 0));
            const targetExponent = Math.max(1, safeNumber(c.targetExponent, 1));

            let instruction;
            if (currentExponent < targetExponent) {
                instruction = 'Collect ' + (targetExponent - currentExponent) + ' more energy.';
            } else if (currentExponent > targetExponent) {
                instruction = 'Use broken energy to reduce h by ' + (currentExponent - targetExponent) + '.';
            } else {
                instruction = 'h is correct; press CALCULATE again if the displayed result is old.';
            }

            return this._startDynamicDialogue('stage.hostpower.correct.', {
                title: 'CAPACITY DIAGNOSTIC',
                speaker: 'SYSTEM',
                timing: 'during',

                bindings: {
                    gameplayId: 'ip_host_power_reactor',
                    trigger: 'gameplay.mistake',
                },

                slides: [[
                    highlight('h = ' + currentExponent) +
                    ' is not the current verified answer. ' +
                    instruction,
                ]],

                onComplete,
            });
        },

        /**
         * ============================================================
         * DIALOGUE REGISTRATION
         * ============================================================
         */
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
                source: 'IPHostPowerReactorTutorial',
            });
        },

        /**
         * ============================================================
         * GAMEPLAY INTEGRATION
         * ============================================================
         *
         * Adds a more detailed guided sequence and several precise highlight
         * targets without requiring the main Gameplay 4.5 file to be rewritten.
         */
        installGameplayIntegration() {
            const ScreenClass =
                IP2Live.HostPowerReactorGameplayScreen ||
                window.IP2LiveHostPowerReactorGameplayScreen;

            if (
                !ScreenClass ||
                !ScreenClass.prototype
            ) {
                return false;
            }

            const proto = ScreenClass.prototype;

            if (proto._ip2liveHostPowerTutorialEnhanced) {
                this._integrationInstalled = true;
                return true;
            }

            Object.defineProperty(
                proto,
                '_ip2liveHostPowerTutorialEnhanced',
                {
                    value: true,
                    configurable: true,
                }
            );

            const tutorial = this;

            /**
             * Pass a richer context to the tutorial instead of only the static
             * scenario. This lets the dialogue know the configured timer and
             * current collected h.
             */
            proto._showGuidedDialogue = function (
                methodName,
                highlightState,
                nextStep,
                spotlightFrames
            ) {
                tutorial.attachScreen(this);

                this.tutorialPaused = true;
                this.tutorialDialogueOpen = true;
                this.tutorialHighlight = Object.assign({}, highlightState || {});

                let completed = false;

                const done = () => {
                    if (completed) return;
                    completed = true;

                    this.tutorialDialogueOpen = false;

                    this._showTutorialSpotlight(
                        highlightState,
                        spotlightFrames,
                        () => {
                            this.tutorialStep = nextStep;

                            if (nextStep === 'done') {
                                this._finishGuidedTutorial();
                            }
                        }
                    );
                };

                const context =
                    tutorial.contextForScreen(this);

                if (
                    tutorial &&
                    typeof tutorial[methodName] === 'function'
                ) {
                    const shown =
                        tutorial[methodName](
                            context,
                            done
                        );

                    if (shown !== false) {
                        return true;
                    }
                }

                done();
                return false;
            };

            /**
             * Expanded guided sequence.
             */
            proto._updateGuidedTutorial = function () {
                if (
                    !this.tutorialActive ||
                    this.tutorialComplete
                ) {
                    return;
                }

                tutorial.attachScreen(this);

                if (this.tutorialSpotlightTimer > 0) {
                    this.tutorialSpotlightTimer--;

                    if (this.tutorialSpotlightTimer <= 0) {
                        const complete =
                            this.tutorialSpotlightComplete;

                        this.tutorialSpotlightComplete =
                            null;

                        this.tutorialHighlight =
                            null;

                        if (
                            typeof complete === 'function'
                        ) {
                            complete();
                        }
                    }

                    return;
                }

                if (
                    this.tutorialDialogueOpen ||
                    this._dialogueActive()
                ) {
                    return;
                }

                if (this.tutorialStep === 'reactor_intro') {
                    this._showGuidedDialogue(
                        'showTargetGuide',
                        {
                            type:
                                'needed_hosts',

                            label:
                                '01 // HOSTS NEEDED',
                        },
                        'engine_intro',
                        95
                    );

                    return;
                }

                if (this.tutorialStep === 'engine_intro') {
                    this._showGuidedDialogue(
                        'showEngineGuide',
                        {
                            type:
                                'engine_chamber',

                            label:
                                '02 // APEX BYPASS ENGINE',
                        },
                        'intake_intro',
                        105
                    );

                    return;
                }

                if (this.tutorialStep === 'intake_intro') {
                    this._showGuidedDialogue(
                        'showIntakeGuide',
                        {
                            type:
                                'intake',

                            label:
                                '03 // FIVE-LANE ENERGY INTAKE',
                        },
                        'shell_intro',
                        105
                    );

                    return;
                }

                if (this.tutorialStep === 'shell_intro') {
                    this._showGuidedDialogue(
                        'showShellGuide',
                        {
                            type:
                                'shell',

                            label:
                                '04 // ENERGY CELLS // BROKEN CELLS',
                        },
                        'controls_intro',
                        110
                    );

                    return;
                }

                if (this.tutorialStep === 'controls_intro') {
                    this._showGuidedDialogue(
                        'showControlsGuide',
                        {
                            type:
                                'controls',

                            label:
                                '05 // MOVE LANES // SPACE TO GRAB',
                        },
                        'collected_intro',
                        110
                    );

                    return;
                }

                if (this.tutorialStep === 'collected_intro') {
                    this._showGuidedDialogue(
                        'showCollectedEnergyGuide',
                        {
                            type:
                                'collected_energy',

                            label:
                                '06 // CURRENT HOST-BIT ENERGY',
                        },
                        'formula_intro',
                        105
                    );

                    return;
                }

                if (this.tutorialStep === 'formula_intro') {
                    this._showGuidedDialogue(
                        'showFormulaGuide',
                        {
                            type:
                                'calculated_output',

                            label:
                                '07 // 2^H - 2 HOST CAPACITY',
                        },
                        'calculate_intro',
                        115
                    );

                    return;
                }

                if (this.tutorialStep === 'calculate_intro') {
                    this._showGuidedDialogue(
                        'showCalculateGuide',
                        {
                            type:
                                'calculate_button',

                            label:
                                '08 // PRESS TO VERIFY CURRENT h',
                        },
                        'timer_intro',
                        110
                    );

                    return;
                }

                if (this.tutorialStep === 'timer_intro') {
                    this._showGuidedDialogue(
                        'showTimerGuide',
                        {
                            type:
                                'timer',

                            label:
                                '09 // RISING APEX TRACE FLUID',
                        },
                        'done',
                        120
                    );

                    return;
                }

                if (this.tutorialStep === 'done') {
                    this._finishGuidedTutorial();
                }
            };

            /**
             * Add precise focus rectangles for the new tutorial stages.
             */
            const originalHighlightRects =
                proto._tutorialHighlightRects;

            proto._tutorialHighlightRects = function (m) {
                const highlightState =
                    this.tutorialHighlight ||
                    {};

                const type =
                    highlightState.type;

                const pad =
                    7 *
                    m.scale;

                const clamp = (rect) => {
                    const minX =
                        m.x +
                        14 *
                        m.scale;

                    const minY =
                        m.y +
                        62 *
                        m.scale;

                    const maxX =
                        m.x +
                        m.w -
                        14 *
                        m.scale;

                    const maxY =
                        m.y +
                        m.h -
                        14 *
                        m.scale;

                    const x =
                        Math.max(
                            minX,
                            rect.x -
                            pad
                        );

                    const y =
                        Math.max(
                            minY,
                            rect.y -
                            pad
                        );

                    return {
                        x,
                        y,

                        w:
                            Math.max(
                                24 *
                                m.scale,

                                Math.min(
                                    maxX,
                                    rect.x +
                                    rect.w +
                                    pad
                                ) -
                                x
                            ),

                        h:
                            Math.max(
                                24 *
                                m.scale,

                                Math.min(
                                    maxY,
                                    rect.y +
                                    rect.h +
                                    pad
                                ) -
                                y
                            ),
                    };
                };

                const layout =
                    this._rightPanelLayout(m);

                const result = {
                    label:
                        highlightState.label ||
                        '',

                    rects:
                        [],
                };

                if (type === 'needed_hosts') {
                    result.rects.push(
                        clamp(
                            layout.needed
                        )
                    );

                    return result;
                }

                if (type === 'engine_chamber') {
                    result.rects.push(
                        clamp(
                            layout.glass
                        )
                    );

                    result.rects.push(
                        clamp(
                            layout.needed
                        )
                    );

                    return result;
                }

                if (type === 'collected_energy') {
                    const controls =
                        layout.controls;

                    result.rects.push(
                        clamp({
                            x:
                                controls.x +
                                12 *
                                m.scale,

                            y:
                                controls.y +
                                9 *
                                m.scale,

                            w:
                                controls.w *
                                0.315,

                            h:
                                controls.h -
                                18 *
                                m.scale,
                        })
                    );

                    return result;
                }

                if (type === 'calculated_output') {
                    const controls =
                        layout.controls;

                    const button =
                        this._calculateButtonRect(
                            m
                        );

                    const left =
                        controls.x +
                        controls.w *
                        0.335;

                    result.rects.push(
                        clamp({
                            x:
                                left,

                            y:
                                controls.y +
                                9 *
                                m.scale,

                            w:
                                Math.max(
                                    120 *
                                    m.scale,

                                    button.x -
                                    left -
                                    15 *
                                    m.scale
                                ),

                            h:
                                controls.h -
                                18 *
                                m.scale,
                        })
                    );

                    return result;
                }

                if (type === 'calculate_button') {
                    const button =
                        this._calculateButtonRect(
                            m
                        );

                    result.rects.push(
                        clamp({
                            x:
                                button.x -
                                4 *
                                m.scale,

                            y:
                                button.y -
                                4 *
                                m.scale,

                            w:
                                button.w +
                                8 *
                                m.scale,

                            h:
                                button.h +
                                8 *
                                m.scale,
                        })
                    );

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

                return null;
            };

            this._integrationInstalled = true;

            console.log(
                '[IP2Live] enhanced Host-Power Reactor tutorial integration installed.'
            );

            return true;
        },

        /**
         * The tutorial module can load before Gameplay 4.5, so retry until
         * the screen class becomes available.
         */
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
                typeof setTimeout === 'function'
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

    IP2Live.IPHostPowerReactorTutorial =
        IPHostPowerReactorTutorial;

    window.IP2LiveIPHostPowerReactorTutorial =
        IPHostPowerReactorTutorial;

    window.startHostPowerTutorialFourPointFive =
        function (options) {
            const manager =
                IP2Live.HostPowerReactorGameplayManager;

            if (
                !manager ||
                typeof manager.launchHostPowerReactorGameplay !==
                    'function'
            ) {
                return false;
            }

            return manager.launchHostPowerReactorGameplay(
                Object.assign(
                    {},
                    options || {},
                    {
                        guidedTutorial:
                            true,

                        showIntro:
                            true,
                    }
                )
            );
        };

    IPHostPowerReactorTutorial.scheduleGameplayIntegration();

    console.log(
        '[IP2Live] ip_host_power_tutorial.js loaded.'
    );
}());
