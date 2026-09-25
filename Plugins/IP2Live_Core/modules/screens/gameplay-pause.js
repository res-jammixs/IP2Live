/**
 * IP2Live - Shared Gameplay Pause and Durable Session State
 *
 * Installs one pause button/input contract across every gameplay screen and
 * stores JSON-safe gameplay state inside Core.Game.current.ip2liveGameStates.
 */

(function () {
    const GameplayPause = {
        VERSION: 'gameplay-pause-20260920-ui04',
        STORAGE_KEY: 'gameplaySessions',
        activeScreen: null,
        menuOpen: false,
        _screenFallbackIds: new WeakMap(),

        _screenDefinitions() {
            return [
                ['WiresGameplayScreen', 'ip_class_wires'],
                ['PatchPanelGameplayScreen', 'ip_patch_panel_classes'],
                ['CIDRPanelGameplayScreen', 'ip_cidr_binary_panel'],
                ['CIDRPanelHarderGameplayScreen', 'ip_cidr_binary_panel_harder'],
                ['SubnetSimulatorGameplayScreen', 'ip_subnet_simulator'],
                ['HostPowerReactorGameplayScreen', 'ip_host_power_reactor'],
                ['CIDRQuarantineGameplayScreen', 'ip_cidr_quarantine'],
                ['CIDRQuarantineMatrixGameplayScreen', 'ip_cidr_quarantine_matrix'],
                ['NetworkRepairGameplayScreen', 'ip_network_repair'],
                ['VLSMAllocatorGameplayScreen', 'ip_vlsm_allocator'],
            ];
        },

        install() {
            const definitions = this._screenDefinitions();

            for (let i = 0; i < definitions.length; i++) {
                const ScreenClass = IP2Live[definitions[i][0]];

                if (ScreenClass && ScreenClass.prototype) {
                    this._installOnPrototype(
                        ScreenClass.prototype,
                        definitions[i][1]
                    );
                }
            }

            return true;
        },

        _installOnPrototype(proto, fallbackGameplayId) {
            if (!proto || proto._ip2liveGameplayPauseInstalled) {
                return false;
            }

            Object.defineProperty(
                proto,
                '_ip2liveGameplayPauseInstalled',
                {
                    value: true,
                    configurable: true,
                }
            );

            const system = this;

            const originalInitialize = proto.initialize;

            proto.initialize = function () {
                const result =
                    typeof originalInitialize === 'function'
                        ? originalInitialize.apply(this, arguments)
                        : undefined;

                system._registerScreen(
                    this,
                    fallbackGameplayId
                );

                system._restoreIntoScreen(
                    this,
                    fallbackGameplayId
                );

                return result;
            };

            const originalLoad = proto.load;

            proto.load = async function () {
                const result =
                    typeof originalLoad === 'function'
                        ? await originalLoad.apply(this, arguments)
                        : undefined;

                system._registerScreen(
                    this,
                    fallbackGameplayId
                );

                system._restoreIntoScreen(
                    this,
                    fallbackGameplayId
                );

                return result;
            };

            const originalUpdate = proto.update;

            proto.update = function () {
                system._registerScreen(
                    this,
                    fallbackGameplayId
                );

                return typeof originalUpdate === 'function'
                    ? originalUpdate.apply(this, arguments)
                    : undefined;
            };

            const originalDrawHUD = proto.drawHUD;

            proto.drawHUD = function () {
                const result =
                    typeof originalDrawHUD === 'function'
                        ? originalDrawHUD.apply(this, arguments)
                        : undefined;

                system._registerScreen(
                    this,
                    fallbackGameplayId
                );

                system.drawPauseButton(this);

                return result;
            };

            const originalOnKeyPressed = proto.onKeyPressed;

            proto.onKeyPressed = function (key) {
                if (system._isCancelKey(key)) {
                    system.open(
                        this,
                        fallbackGameplayId
                    );

                    return true;
                }

                return typeof originalOnKeyPressed === 'function'
                    ? originalOnKeyPressed.apply(this, arguments)
                    : true;
            };

            const originalOnMouseDown = proto.onMouseDown;

            proto.onMouseDown = function (x, y) {
                if (
                    system._isPauseButtonAt(
                        this,
                        x,
                        y
                    )
                ) {
                    this._ip2livePausePointerCaptured =
                        true;

                    system.open(
                        this,
                        fallbackGameplayId
                    );

                    return true;
                }

                return typeof originalOnMouseDown === 'function'
                    ? originalOnMouseDown.apply(this, arguments)
                    : true;
            };

            const originalOnMouseUp = proto.onMouseUp;

            proto.onMouseUp = function (x, y) {
                if (
                    this._ip2livePausePointerCaptured
                ) {
                    this._ip2livePausePointerCaptured =
                        false;

                    return true;
                }

                if (
                    system._isPauseButtonAt(
                        this,
                        x,
                        y
                    )
                ) {
                    system.open(
                        this,
                        fallbackGameplayId
                    );

                    return true;
                }

                return typeof originalOnMouseUp === 'function'
                    ? originalOnMouseUp.apply(this, arguments)
                    : true;
            };

            return true;
        },

        _isCancelKey(key) {
            try {
                return !!(
                    Data &&
                    Data.Keyboards &&
                    Data.Keyboards.checkCancelMenu &&
                    Data.Keyboards.checkCancelMenu(key)
                );
            } catch (error) {
                const value =
                    key &&
                    (
                        key.name ||
                        key.code ||
                        key
                    );

                return String(
                    value ||
                    ''
                ).toUpperCase() === 'ESCAPE';
            }
        },

        _registerScreen(
            screen,
            fallbackGameplayId
        ) {
            if (
                !screen ||
                screen._ip2liveGameplayExited
            ) {
                return false;
            }

            this.activeScreen = screen;

            if (fallbackGameplayId) {
                this._screenFallbackIds.set(
                    screen,
                    fallbackGameplayId
                );
            }

            return true;
        },

        _canPauseScreen(screen) {
            if (
                !screen ||
                screen._ip2liveGameplayExited ||
                screen.finished ||
                screen.completed
            ) {
                return false;
            }

            const phase =
                String(
                    screen.phase ||
                    ''
                ).toLowerCase();

            if (
                phase === 'success' ||
                phase === 'complete' ||
                phase === 'completed'
            ) {
                return false;
            }

            return true;
        },

        _game() {
            return Core && Core.Game
                ? Core.Game.current
                : null;
        },

        _sessions(create) {
            const game =
                this._game();

            if (!game) {
                return null;
            }

            if (
                !game.ip2liveGameStates ||
                typeof game.ip2liveGameStates !== 'object'
            ) {
                if (!create) {
                    return null;
                }

                game.ip2liveGameStates = {};
            }

            if (
                !game.ip2liveGameStates[this.STORAGE_KEY] ||
                typeof game.ip2liveGameStates[this.STORAGE_KEY] !== 'object'
            ) {
                if (!create) {
                    return null;
                }

                game.ip2liveGameStates[
                    this.STORAGE_KEY
                ] = {};
            }

            return game.ip2liveGameStates[
                this.STORAGE_KEY
            ];
        },

        _descriptorFromScreen(
            screen,
            fallbackGameplayId
        ) {
            const options =
                screen &&
                screen.options &&
                typeof screen.options === 'object'
                    ? screen.options
                    : {};

            const spec =
                options.spec &&
                typeof options.spec === 'object'
                    ? options.spec
                    : {};

            return {
                gameplayId: String(
                    (
                        screen &&
                        screen.gameplayId
                    ) ||
                    options.gameplayId ||
                    fallbackGameplayId ||
                    ''
                ).trim(),

                mapId:
                    Number(
                        options.mapId ||
                        spec.mapId ||
                        (
                            this._game() &&
                            this._game().currentMapID
                        ) ||
                        0
                    ) || 0,

                questId: String(
                    options.questId ||
                    spec.id ||
                    ''
                ).trim(),

                objectiveId: String(
                    options.objectiveId ||
                    spec.objectiveId ||
                    ''
                ).trim(),
            };
        },

        _descriptorFromPayload(
            gameplayId,
            payload
        ) {
            const data =
                payload || {};

            const spec =
                data.spec || {};

            return {
                gameplayId: String(
                    gameplayId ||
                    data.gameplayId ||
                    data.nodeId ||
                    ''
                ).trim(),

                mapId:
                    Number(
                        data.mapId ||
                        spec.mapId ||
                        (
                            this._game() &&
                            this._game().currentMapID
                        ) ||
                        0
                    ) || 0,

                questId: String(
                    data.questId ||
                    spec.id ||
                    ''
                ).trim(),

                objectiveId: String(
                    data.objectiveId ||
                    spec.objectiveId ||
                    ''
                ).trim(),
            };
        },

        _sessionKey(descriptor) {
            const d =
                descriptor || {};

            return [
                d.gameplayId ||
                    'gameplay',

                d.mapId ||
                    0,

                d.questId ||
                    'quest',

                d.objectiveId ||
                    'objective',
            ].join('::');
        },

        findSession(
            gameplayId,
            payload
        ) {
            if (payload && (payload.tutorialReplay || (payload.spec && payload.spec.tutorialReplay))) return null;
            const sessions =
                this._sessions(false);

            if (!sessions) {
                return null;
            }

            const descriptor =
                this._descriptorFromPayload(
                    gameplayId,
                    payload
                );

            const exact =
                sessions[
                    this._sessionKey(
                        descriptor
                    )
                ];

            if (
                exact &&
                exact.state &&
                !exact.completed
            ) {
                return exact;
            }

            const keys =
                Object.keys(
                    sessions
                );

            for (
                let i = 0;
                i < keys.length;
                i++
            ) {
                const candidate =
                    sessions[
                        keys[i]
                    ];

                if (
                    !candidate ||
                    !candidate.state ||
                    candidate.completed
                ) {
                    continue;
                }

                if (
                    descriptor.gameplayId &&
                    candidate.gameplayId !==
                        descriptor.gameplayId
                ) {
                    continue;
                }

                if (
                    descriptor.questId &&
                    candidate.questId !==
                        descriptor.questId
                ) {
                    continue;
                }

                if (
                    descriptor.objectiveId &&
                    candidate.objectiveId !==
                        descriptor.objectiveId
                ) {
                    continue;
                }

                if (
                    descriptor.mapId &&
                    Number(
                        candidate.mapId
                    ) !==
                        descriptor.mapId
                ) {
                    continue;
                }

                return candidate;
            }

            return null;
        },

        hasSession(
            gameplayId,
            payload
        ) {
            return !!this.findSession(
                gameplayId,
                payload
            );
        },

        captureActiveSession(reason) {
            const screen =
                this.activeScreen;

            if (
                !screen ||
                screen._ip2liveGameplayExited
            ) {
                return null;
            }

            return this.captureScreen(
                screen,
                reason ||
                    'checkpoint'
            );
        },

        captureScreen(
            screen,
            reason
        ) {
            if (screen && screen.options && screen.options.tutorialReplay) return null;
            if (
                !screen ||
                screen._ip2liveGameplayExited
            ) {
                return null;
            }

            const fallback =
                this._screenFallbackIds.get(
                    screen
                ) ||
                '';

            const descriptor =
                this._descriptorFromScreen(
                    screen,
                    fallback
                );

            if (
                !descriptor.gameplayId
            ) {
                return null;
            }

            const state =
                this._captureScreenState(
                    screen
                );

            const capturedAt =
                Date.now();

            const session =
                Object.assign(
                    {
                        version:
                            this.VERSION,

                        capturedAt,

                        reason:
                            reason ||
                            'gameplay_pause',

                        state,

                        completed:
                            false,
                    },
                    descriptor
                );

            const sessions =
                this._sessions(true);

            if (!sessions) {
                return null;
            }

            sessions[
                this._sessionKey(
                    descriptor
                )
            ] = session;

            screen._ip2liveSessionKey =
                this._sessionKey(
                    descriptor
                );

            return session;
        },

        _captureScreenState(screen) {
            const state = {};

            const excluded = {
                options: true,
                loading: true,
                dragging: true,
                mouse: true,
                particles: true,
                sparks: true,
                fxBursts: true,
                routeShocks: true,
                tutorialSpotlightComplete: true,
                pendingMistakeDialogue: true,
                pendingFailureExit: true,
                _deferredFailureExit: true,
                _ip2livePauseButtonRect: true,
                _ip2livePausePointerCaptured: true,
            };

            const keys =
                Object.keys(
                    screen
                );

            const seen =
                new WeakSet();

            for (
                let i = 0;
                i < keys.length;
                i++
            ) {
                const key =
                    keys[i];

                if (
                    excluded[key] ||
                    /^_ip2live/.test(
                        key
                    ) ||
                    /Rects?$/.test(
                        key
                    )
                ) {
                    continue;
                }

                const cloned =
                    this._cloneSerializable(
                        screen[key],
                        seen,
                        0
                    );

                if (
                    cloned !==
                    undefined
                ) {
                    state[key] =
                        cloned;
                }
            }

            return state;
        },

        _cloneSerializable(
            value,
            seen,
            depth
        ) {
            if (
                value === null ||
                typeof value === 'string' ||
                typeof value === 'boolean'
            ) {
                return value;
            }

            if (
                typeof value === 'number'
            ) {
                return Number.isFinite(
                    value
                )
                    ? value
                    : null;
            }

            if (
                typeof value === 'undefined' ||
                typeof value === 'function' ||
                typeof value === 'symbol'
            ) {
                return undefined;
            }

            if (
                depth > 12 ||
                !value ||
                typeof value !== 'object'
            ) {
                return undefined;
            }

            if (
                seen.has(
                    value
                )
            ) {
                return undefined;
            }

            seen.add(
                value
            );

            if (
                Array.isArray(
                    value
                )
            ) {
                const output = [];

                for (
                    let i = 0;
                    i < value.length;
                    i++
                ) {
                    const item =
                        this._cloneSerializable(
                            value[i],
                            seen,
                            depth + 1
                        );

                    output.push(
                        item === undefined
                            ? null
                            : item
                    );
                }

                seen.delete(
                    value
                );

                return output;
            }

            const proto =
                Object.getPrototypeOf(
                    value
                );

            if (
                proto !== Object.prototype &&
                proto !== null
            ) {
                seen.delete(
                    value
                );

                return undefined;
            }

            const output = {};

            const keys =
                Object.keys(
                    value
                );

            for (
                let i = 0;
                i < keys.length;
                i++
            ) {
                const item =
                    this._cloneSerializable(
                        value[
                            keys[i]
                        ],
                        seen,
                        depth + 1
                    );

                if (
                    item !==
                    undefined
                ) {
                    output[
                        keys[i]
                    ] =
                        item;
                }
            }

            seen.delete(
                value
            );

            return output;
        },

        _restoreIntoScreen(
            screen,
            fallbackGameplayId
        ) {
            if (
                !screen ||
                screen._ip2liveSessionRestoreChecked
            ) {
                return false;
            }

            const options =
                screen.options &&
                typeof screen.options === 'object'
                    ? screen.options
                    : null;

            const spec =
                options &&
                options.spec &&
                typeof options.spec === 'object'
                    ? options.spec
                    : {};

            if (
                !options ||
                !(
                    options.questId ||
                    options.objectiveId ||
                    spec.id ||
                    spec.objectiveId
                )
            ) {
                return false;
            }

            const descriptor =
                this._descriptorFromScreen(
                    screen,
                    fallbackGameplayId
                );

            const session =
                this.findSession(
                    descriptor.gameplayId,
                    descriptor
                );

            screen._ip2liveSessionRestoreChecked =
                true;

            if (
                !session ||
                !session.state
            ) {
                return false;
            }

            const restored =
                this._cloneSerializable(
                    session.state,
                    new WeakSet(),
                    0
                ) || {};

            this._shiftWallClockFields(
                restored,
                Math.max(
                    0,
                    Date.now() -
                    Number(
                        session.capturedAt ||
                        Date.now()
                    )
                )
            );

            this._normalizeTutorialState(
                restored
            );

            const liveOptions =
                screen.options;

            const keys =
                Object.keys(
                    restored
                );

            for (
                let i = 0;
                i < keys.length;
                i++
            ) {
                screen[
                    keys[i]
                ] =
                    restored[
                        keys[i]
                    ];
            }

            screen.options =
                liveOptions;

            screen.dragging =
                null;

            screen.mouse = {
                x: -9999,
                y: -9999,
            };

            screen._ip2liveRestoredSession =
                true;

            screen._ip2liveSessionKey =
                this._sessionKey(
                    descriptor
                );

            this._registerScreen(
                screen,
                fallbackGameplayId
            );

            if (
                screen._ipGuide &&
                screen._ipGuide.active &&
                !screen._ipGuide.expectedSourceId &&
                IP2Live.IPWiresTutorial &&
                typeof IP2Live.IPWiresTutorial._startGuidedStep === 'function'
            ) {
                setTimeout(
                    function () {
                        if (
                            !screen._ip2liveGameplayExited
                        ) {
                            IP2Live.IPWiresTutorial._startGuidedStep(
                                screen
                            );
                        }
                    },
                    0
                );
            }

            return true;
        },

        _shiftWallClockFields(
            value,
            delta
        ) {
            if (
                !delta ||
                !value ||
                typeof value !== 'object'
            ) {
                return;
            }

            const timestampKeys = {
                startedAt: true,
                endsAt: true,
                stabilizeStartedAt: true,
                completedAt: true,
                _completionVisibleAt: true,
                hitFlashUntil: true,
            };

            const keys =
                Object.keys(
                    value
                );

            for (
                let i = 0;
                i < keys.length;
                i++
            ) {
                const key =
                    keys[i];

                if (
                    timestampKeys[key] &&
                    Number(
                        value[key]
                    ) >
                        0
                ) {
                    value[key] =
                        Number(
                            value[key]
                        ) +
                        delta;
                } else if (
                    value[key] &&
                    typeof value[key] === 'object'
                ) {
                    this._shiftWallClockFields(
                        value[key],
                        delta
                    );
                }
            }
        },

        _normalizeTutorialState(
            state
        ) {
            if (
                !state ||
                typeof state !== 'object'
            ) {
                return;
            }

            state.tutorialDialogueOpen =
                false;

            state.tutorialSpotlightTimer =
                0;

            state.tutorialSpotlightComplete =
                null;

            state.tutorialHighlight =
                null;

            const step =
                String(
                    state.tutorialStep ||
                    ''
                );

            if (
                /_dialogue$/.test(
                    step
                )
            ) {
                if (
                    step === 'training_dialogue' ||
                    step === 'independent_dialogue'
                ) {
                    state.tutorialStep =
                        'training_wait';
                } else {
                    state.tutorialStep =
                        step.replace(
                            /_dialogue$/,
                            '_intro'
                        );
                }

                state.tutorialPaused =
                    false;
            }
        },

        clearSession(
            gameplayId,
            payload
        ) {
            const sessions =
                this._sessions(
                    false
                );

            const released =
                this.releaseActiveScreen(
                    gameplayId,
                    payload
                );

            if (!sessions) {
                return released;
            }

            const descriptor =
                this._descriptorFromPayload(
                    gameplayId,
                    payload
                );

            const exactKey =
                this._sessionKey(
                    descriptor
                );

            let cleared =
                false;

            if (
                sessions[
                    exactKey
                ]
            ) {
                delete sessions[
                    exactKey
                ];

                cleared =
                    true;
            }

            const keys =
                Object.keys(
                    sessions
                );

            for (
                let i = 0;
                i < keys.length;
                i++
            ) {
                const candidate =
                    sessions[
                        keys[i]
                    ];

                if (
                    !candidate
                ) {
                    continue;
                }

                if (
                    descriptor.gameplayId &&
                    candidate.gameplayId !==
                        descriptor.gameplayId
                ) {
                    continue;
                }

                if (
                    descriptor.questId &&
                    candidate.questId !==
                        descriptor.questId
                ) {
                    continue;
                }

                if (
                    descriptor.objectiveId &&
                    candidate.objectiveId !==
                        descriptor.objectiveId
                ) {
                    continue;
                }

                delete sessions[
                    keys[i]
                ];

                cleared =
                    true;
            }

            return cleared ||
                released;
        },

        releaseActiveScreen(
            gameplayId,
            payload
        ) {
            const screen =
                this.activeScreen;

            if (!screen) {
                return false;
            }

            const active =
                this._descriptorFromScreen(
                    screen,
                    this._screenFallbackIds.get(
                        screen
                    ) ||
                    ''
                );

            const expected =
                this._descriptorFromPayload(
                    gameplayId,
                    payload
                );

            if (
                expected.gameplayId &&
                active.gameplayId !==
                    expected.gameplayId
            ) {
                return false;
            }

            if (
                expected.questId &&
                active.questId !==
                    expected.questId
            ) {
                return false;
            }

            if (
                expected.objectiveId &&
                active.objectiveId !==
                    expected.objectiveId
            ) {
                return false;
            }

            screen._ip2liveGameplayExited =
                true;

            this.activeScreen =
                null;

            return true;
        },

        clearSessionsForObjective(
            payload
        ) {
            const data =
                payload || {};

            if (
                !data.gameplayId &&
                !data.questId &&
                !data.objectiveId
            ) {
                return false;
            }

            return this.clearSession(
                data.gameplayId,
                data
            );
        },

        _capturePauseBackdrop() {
            try {
                const ctx =
                    Common &&
                    Common.Platform
                        ? Common.Platform.ctx
                        : null;

                if (
                    !ctx ||
                    !ctx.canvas
                ) {
                    return null;
                }

                const source =
                    ctx.canvas;

                const snapshot =
                    document.createElement(
                        'canvas'
                    );

                snapshot.width =
                    source.width;

                snapshot.height =
                    source.height;

                const snapshotCtx =
                    snapshot.getContext(
                        '2d'
                    );

                if (
                    !snapshotCtx
                ) {
                    return null;
                }

                snapshotCtx.drawImage(
                    source,
                    0,
                    0,
                    source.width,
                    source.height
                );

                return snapshot;
            } catch (error) {
                console.warn(
                    '[IP2Live] Unable to capture pause backdrop:',
                    error
                );

                return null;
            }
        },

        open(
            screen,
            fallbackGameplayId
        ) {
            if (
                this.menuOpen ||
                !this._canPauseScreen(
                    screen
                )
            ) {
                return false;
            }

            this._registerScreen(
                screen,
                fallbackGameplayId
            );

            this.captureScreen(
                screen,
                'pause_opened'
            );

            /*
             * Capture the exact rendered
             * gameplay frame before opening
             * the pause scene.
             */
            const pauseBackdrop =
                this._capturePauseBackdrop();

            this.menuOpen =
                true;

            try {
                if (
                    Data.Systems.soundConfirmation
                ) {
                    Data.Systems.soundConfirmation.playSound();
                }
            } catch (error) {}

            if (
                !Manager ||
                !Manager.Stack ||
                typeof Manager.Stack.push !== 'function'
            ) {
                this.menuOpen =
                    false;

                return false;
            }

            Manager.Stack.push(
                new IP2LiveGameplayPauseMenu(
                    screen,
                    pauseBackdrop
                )
            );

            const gameManager =
                IP2Live.GameManager;

            if (
                gameManager &&
                !(screen.options && screen.options.tutorialReplay) &&
                typeof gameManager.saveProgressToActiveSlot === 'function'
            ) {
                Promise.resolve(
                    gameManager.saveProgressToActiveSlot(
                        null,
                        null,
                        {
                            checkpointReason:
                                'gameplay_paused',
                        }
                    )
                ).catch(
                    function () {}
                );
            }

            return true;
        },

        closeMenu() {
            this.menuOpen =
                false;

            if (
                Manager &&
                Manager.Stack
            ) {
                Manager.Stack.requestPaintHUD =
                    true;
            }
        },

        async exitQuest(screen) {
            if (screen && screen.options && screen.options.tutorialReplay && IP2Live.TutorialReplay) {
                const replay = IP2Live.TutorialReplay.session;
                if (!replay || replay.screen !== screen) return { saved: false, reason: 'no-active-tutorial' };
                if (Manager.Stack.top && Manager.Stack.top.sourceScreen === screen) Manager.Stack.pop();
                this.closeMenu();
                return { saved: false, reason: 'tutorial-finished', finished: IP2Live.TutorialReplay.finishScreen(screen) };
            }
            if (
                !screen ||
                screen._ip2liveGameplayExited
            ) {
                return {
                    saved:
                        false,

                    reason:
                        'no-active-gameplay',
                };
            }

            this.captureScreen(
                screen,
                'exit_quest'
            );

            let saveResult = {
                saved:
                    false,

                reason:
                    'no-active-save-slot',
            };

            const gameManager =
                IP2Live.GameManager;

            if (
                gameManager &&
                typeof gameManager.saveProgressToActiveSlot === 'function'
            ) {
                try {
                    saveResult =
                        await gameManager.saveProgressToActiveSlot(
                            null,
                            null,
                            {
                                checkpointReason:
                                    'gameplay_exit_quest',
                            }
                        );
                } catch (error) {
                    saveResult = {
                        saved:
                            false,

                        reason:
                            'checkpoint-failed',

                        error:
                            String(
                                error &&
                                error.message ||
                                error
                            ),
                    };
                }
            }

            if (
                IP2Live.DialogueManager &&
                typeof IP2Live.DialogueManager.discardActive === 'function'
            ) {
                IP2Live.DialogueManager.discardActive();
            }

            if (
                Manager &&
                Manager.Stack &&
                typeof Manager.Stack.pop === 'function'
            ) {
                Manager.Stack.pop();
            }

            this.closeMenu();

            screen._ip2liveGameplayExited =
                true;

            if (
                this.activeScreen ===
                screen
            ) {
                this.activeScreen =
                    null;
            }

            setTimeout(
                function () {
                    if (
                        typeof screen._cancel === 'function'
                    ) {
                        screen._cancel(
                            false
                        );
                    } else if (
                        screen.options &&
                        typeof screen.options.onCancel === 'function'
                    ) {
                        screen.options.onCancel();
                    }
                },
                0
            );

            return saveResult;
        },

        drawPauseButton(screen) {
            const ctx =
                Common &&
                Common.Platform
                    ? Common.Platform.ctx
                    : null;

            if (
                !ctx ||
                !ctx.canvas ||
                this.menuOpen ||
                !this._canPauseScreen(
                    screen
                )
            ) {
                return false;
            }

            const scale =
                Math.max(
                    0.72,
                    Math.min(
                        ctx.canvas.width /
                            1280,

                        ctx.canvas.height /
                            720
                    )
                );

            const w =
                154 *
                scale;

            const h =
                34 *
                scale;

            const x =
                (
                    ctx.canvas.width -
                    w
                ) /
                2;

            const y =
                0;

            screen._ip2livePauseButtonRect = {
                x,
                y,
                w,
                h,
            };

            ctx.save();

            ctx.shadowColor =
                'rgba(0,240,255,0.42)';

            ctx.shadowBlur =
                10 *
                scale;

            ctx.beginPath();

            ctx.moveTo(
                x +
                12 *
                scale,
                y
            );

            ctx.lineTo(
                x +
                w -
                12 *
                scale,
                y
            );

            ctx.lineTo(
                x +
                w,
                y +
                h -
                8 *
                scale
            );

            ctx.lineTo(
                x +
                w -
                8 *
                scale,
                y +
                h
            );

            ctx.lineTo(
                x +
                8 *
                scale,
                y +
                h
            );

            ctx.lineTo(
                x,
                y +
                h -
                8 *
                scale
            );

            ctx.closePath();

            const grad =
                ctx.createLinearGradient(
                    x,
                    y,
                    x,
                    y + h
                );

            grad.addColorStop(
                0,
                'rgba(17,32,43,0.98)'
            );

            grad.addColorStop(
                0.58,
                'rgba(4,12,19,0.96)'
            );

            grad.addColorStop(
                1,
                'rgba(1,5,10,0.98)'
            );

            ctx.fillStyle =
                grad;

            ctx.fill();

            ctx.shadowBlur =
                0;

            ctx.strokeStyle =
                '#00F0FF';

            ctx.lineWidth =
                Math.max(
                    1,
                    1.3 *
                    scale
                );

            ctx.stroke();

            ctx.fillStyle =
                '#FFE600';

            ctx.fillRect(
                x +
                12 *
                scale,

                y +
                h -
                3 *
                scale,

                w -
                24 *
                scale,

                2 *
                scale
            );

            ctx.font =
                'bold ' +
                Math.round(
                    12 *
                    scale
                ) +
                'px ' +
                (
                    IP2Live.Assets &&
                    IP2Live.Assets.oxaniumMediumLoaded
                        ? 'Oxanium-Medium'
                        : 'monospace'
                );

            ctx.textAlign =
                'center';

            ctx.textBaseline =
                'middle';

            ctx.fillStyle =
                '#EAFBFF';

            ctx.fillText(
                'Ⅱ  PAUSE',

                x +
                w /
                2,

                y +
                h /
                2 +
                scale
            );

            ctx.restore();

            return true;
        },

        _isPauseButtonAt(
            screen,
            x,
            y
        ) {
            const r =
                screen &&
                screen._ip2livePauseButtonRect;

            return !!(
                r &&
                x >= r.x &&
                x <=
                    r.x +
                    r.w &&
                y >= r.y &&
                y <=
                    r.y +
                    r.h
            );
        },
    };

    class IP2LiveGameplayPauseMenu extends Scene.Base {
        constructor(
            sourceScreen,
            pauseBackdrop
        ) {
            super(true);

            this.sourceScreen =
                sourceScreen ||
                GameplayPause.activeScreen;

            this.pauseBackdrop =
                pauseBackdrop ||
                null;
        }

        initialize() {
            this.sourceScreen =
                this.sourceScreen ||
                GameplayPause.activeScreen;

            const replay = !!(this.sourceScreen && this.sourceScreen.options && this.sourceScreen.options.tutorialReplay);

            this.menuItems = [
                {
                    title:
                        'RESUME',

                    subtitle:
                        replay ? 'RETURN TO TUTORIAL' : 'RETURN TO ACTIVE QUEST',

                    danger:
                        false,
                },
                {
                    title:
                        'SETTINGS',

                    subtitle:
                        'AUDIO DISPLAY CONTROLS',

                    danger:
                        false,
                },
                {
                    title:
                        replay ? 'FINISH TUTORIAL' : 'EXIT QUEST',

                    subtitle:
                        replay ? 'RETURN TO CURRENT QUEST' : 'SAVE STATE & LEAVE QUEST',

                    danger:
                        true,
                },
            ];

            this.selectedIndex =
                0;

            this.animTick =
                0;

            this.pending =
                false;

            this.fadeIn =
                0;

            this.buttonRects =
                [];

            this.selectionMix = [
                1,
                0,
                0,
            ];
        }

        async load() {
            this.loading =
                false;

            if (
                Manager &&
                Manager.Stack
            ) {
                Manager.Stack.requestPaintHUD =
                    true;
            }
        }

        update() {
            this.animTick++;

            this.fadeIn =
                Math.min(
                    1,
                    this.fadeIn +
                    0.07
                );

            for (
                let i = 0;
                i < this.selectionMix.length;
                i++
            ) {
                const target =
                    !this.pending &&
                    i ===
                        this.selectedIndex
                        ? 1
                        : 0;

                this.selectionMix[i] +=
                    (
                        target -
                        this.selectionMix[i]
                    ) *
                    0.22;

                if (
                    Math.abs(
                        target -
                        this.selectionMix[i]
                    ) <
                    0.004
                ) {
                    this.selectionMix[i] =
                        target;
                }
            }

            if (
                Manager &&
                Manager.Stack
            ) {
                Manager.Stack.requestPaintHUD =
                    true;
            }
        }

        draw3D() {}

        onKeyPressed(key) {
            if (
                this.pending
            ) {
                return true;
            }

            if (
                GameplayPause._isCancelKey(
                    key
                )
            ) {
                this._resume();

                return true;
            }

            if (
                Data.Keyboards.checkActionMenu &&
                Data.Keyboards.checkActionMenu(
                    key
                )
            ) {
                this._activate();

                return true;
            }

            return true;
        }

        onKeyPressedAndRepeat(
            key
        ) {
            if (
                this.pending
            ) {
                return true;
            }

            const previous =
                this.selectedIndex;

            if (
                Data.Keyboards.isKeyEqual(
                    key,
                    Data.Keyboards.menuControls.Up
                )
            ) {
                this.selectedIndex =
                    (
                        this.selectedIndex -
                        1 +
                        this.menuItems.length
                    ) %
                    this.menuItems.length;
            } else if (
                Data.Keyboards.isKeyEqual(
                    key,
                    Data.Keyboards.menuControls.Down
                )
            ) {
                this.selectedIndex =
                    (
                        this.selectedIndex +
                        1
                    ) %
                    this.menuItems.length;
            }

            if (
                previous !==
                this.selectedIndex
            ) {
                try {
                    if (
                        Data.Systems.soundCursor
                    ) {
                        Data.Systems.soundCursor.playSound();
                    }
                } catch (error) {}
            }

            return true;
        }

        onMouseMove(
            x,
            y
        ) {
            if (
                this.pending
            ) {
                return true;
            }

            const index =
                this._buttonAt(
                    x,
                    y
                );

            if (
                index >= 0 &&
                index !==
                    this.selectedIndex
            ) {
                this.selectedIndex =
                    index;

                try {
                    if (
                        Data.Systems.soundCursor
                    ) {
                        Data.Systems.soundCursor.playSound();
                    }
                } catch (error) {}
            }

            return true;
        }

        onMouseUp(
            x,
            y
        ) {
            if (
                this.pending
            ) {
                return true;
            }

            const index =
                this._buttonAt(
                    x,
                    y
                );

            if (
                index >= 0
            ) {
                this.selectedIndex =
                    index;

                this._activate();
            }

            return true;
        }

        _buttonAt(
            x,
            y
        ) {
            for (
                let i = 0;
                i < this.buttonRects.length;
                i++
            ) {
                const r =
                    this.buttonRects[
                        i
                    ];

                if (
                    x >= r.x &&
                    x <=
                        r.x +
                        r.w &&
                    y >= r.y &&
                    y <=
                        r.y +
                        r.h
                ) {
                    return i;
                }
            }

            return -1;
        }

        _activate() {
            try {
                if (
                    Data.Systems.soundConfirmation
                ) {
                    Data.Systems.soundConfirmation.playSound();
                }
            } catch (error) {}

            if (
                this.selectedIndex ===
                0
            ) {
                this._resume();
            } else if (
                this.selectedIndex ===
                1
            ) {
                this._settings();
            } else if (
                this.selectedIndex ===
                2
            ) {
                this._exitQuest();
            }
        }

        _resume() {
            if (
                this.pending
            ) {
                return false;
            }

            try {
                if (
                    Data.Systems.soundCancel
                ) {
                    Data.Systems.soundCancel.playSound();
                }
            } catch (error) {}

            GameplayPause.closeMenu();

            if (
                Manager &&
                Manager.Stack &&
                typeof Manager.Stack.pop === 'function'
            ) {
                Manager.Stack.pop();
            }

            return true;
        }

        _settings() {
            if (
                !window.IP2LiveSettingsMenu ||
                !Manager ||
                !Manager.Stack ||
                typeof Manager.Stack.push !== 'function'
            ) {
                return false;
            }

            if (IP2Live.MenuTransition) {
                return IP2Live.MenuTransition.open(() => new IP2LiveSettingsMenu());
            }
            Manager.Stack.push(new IP2LiveSettingsMenu());

            return true;
        }

        async _exitQuest() {
            if (
                this.pending
            ) {
                return false;
            }

            this.pending =
                true;

            if (
                Manager &&
                Manager.Stack
            ) {
                Manager.Stack.requestPaintHUD =
                    true;
            }

            await GameplayPause.exitQuest(
                this.sourceScreen
            );

            return true;
        }

        _easeOutCubic(t) {
            return 1 -
                Math.pow(
                    1 -
                    Math.max(
                        0,
                        Math.min(
                            1,
                            t
                        )
                    ),
                    3
                );
        }

        _traceBeveledRect(
            ctx,
            x,
            y,
            w,
            h,
            cut
        ) {
            ctx.beginPath();

            ctx.moveTo(
                x + cut,
                y
            );

            ctx.lineTo(
                x +
                w -
                cut,
                y
            );

            ctx.lineTo(
                x +
                w,
                y +
                cut
            );

            ctx.lineTo(
                x +
                w,
                y +
                h -
                cut
            );

            ctx.lineTo(
                x +
                w -
                cut,
                y +
                h
            );

            ctx.lineTo(
                x +
                cut,
                y +
                h
            );

            ctx.lineTo(
                x,
                y +
                h -
                cut
            );

            ctx.lineTo(
                x,
                y +
                cut
            );

            ctx.closePath();
        }

        _drawBevelFacets(
            ctx,
            x,
            y,
            w,
            h,
            cut,
            depth,
            accent
        ) {
            const isDanger =
                accent ===
                '#FF003C';

            const bright =
                isDanger
                    ? 'rgba(255,112,151,0.38)'
                    : 'rgba(157,251,255,0.42)';

            const face =
                isDanger
                    ? 'rgba(255,0,60,0.24)'
                    : 'rgba(0,240,255,0.22)';

            const side =
                isDanger
                    ? 'rgba(106,0,35,0.44)'
                    : 'rgba(0,75,104,0.44)';

            const shadow =
                isDanger
                    ? 'rgba(38,0,17,0.72)'
                    : 'rgba(0,12,25,0.78)';

            const d =
                Math.max(
                    1,
                    Math.min(
                        depth,
                        cut *
                            0.48,
                        h *
                            0.18
                    )
                );

            ctx.save();

            const topFace =
                ctx.createLinearGradient(
                    0,
                    y,
                    0,
                    y + d
                );

            topFace.addColorStop(
                0,
                bright
            );

            topFace.addColorStop(
                0.36,
                face
            );

            topFace.addColorStop(
                1,
                'rgba(0,0,0,0.08)'
            );

            ctx.beginPath();

            ctx.moveTo(
                x +
                cut,
                y
            );

            ctx.lineTo(
                x +
                w -
                cut,
                y
            );

            ctx.lineTo(
                x +
                w -
                cut -
                d,
                y +
                d
            );

            ctx.lineTo(
                x +
                cut +
                d,
                y +
                d
            );

            ctx.closePath();

            ctx.fillStyle =
                topFace;

            ctx.fill();

            ctx.beginPath();

            ctx.moveTo(
                x +
                w -
                cut,
                y
            );

            ctx.lineTo(
                x +
                w,
                y +
                cut
            );

            ctx.lineTo(
                x +
                w,
                y +
                h -
                cut
            );

            ctx.lineTo(
                x +
                w -
                cut,
                y +
                h
            );

            ctx.lineTo(
                x +
                w -
                cut -
                d,
                y +
                h -
                d
            );

            ctx.lineTo(
                x +
                w -
                d,
                y +
                h -
                cut -
                d
            );

            ctx.lineTo(
                x +
                w -
                d,
                y +
                cut +
                d
            );

            ctx.lineTo(
                x +
                w -
                cut -
                d,
                y +
                d
            );

            ctx.closePath();

            const rightFace =
                ctx.createLinearGradient(
                    x +
                    w -
                    d,
                    0,
                    x +
                    w,
                    0
                );

            rightFace.addColorStop(
                0,
                face
            );

            rightFace.addColorStop(
                1,
                side
            );

            ctx.fillStyle =
                rightFace;

            ctx.fill();

            ctx.beginPath();

            ctx.moveTo(
                x +
                w -
                cut,
                y +
                h
            );

            ctx.lineTo(
                x +
                cut,
                y +
                h
            );

            ctx.lineTo(
                x +
                cut +
                d,
                y +
                h -
                d
            );

            ctx.lineTo(
                x +
                w -
                cut -
                d,
                y +
                h -
                d
            );

            ctx.closePath();

            const bottomFace =
                ctx.createLinearGradient(
                    0,
                    y +
                    h -
                    d,
                    0,
                    y +
                    h
                );

            bottomFace.addColorStop(
                0,
                side
            );

            bottomFace.addColorStop(
                1,
                shadow
            );

            ctx.fillStyle =
                bottomFace;

            ctx.fill();

            ctx.beginPath();

            ctx.moveTo(
                x +
                cut,
                y +
                h
            );

            ctx.lineTo(
                x,
                y +
                h -
                cut
            );

            ctx.lineTo(
                x,
                y +
                cut
            );

            ctx.lineTo(
                x +
                cut,
                y
            );

            ctx.lineTo(
                x +
                cut +
                d,
                y +
                d
            );

            ctx.lineTo(
                x +
                d,
                y +
                cut +
                d
            );

            ctx.lineTo(
                x +
                d,
                y +
                h -
                cut -
                d
            );

            ctx.lineTo(
                x +
                cut +
                d,
                y +
                h -
                d
            );

            ctx.closePath();

            const leftFace =
                ctx.createLinearGradient(
                    x,
                    0,
                    x + d,
                    0
                );

            leftFace.addColorStop(
                0,
                side
            );

            leftFace.addColorStop(
                1,
                'rgba(255,255,255,0.035)'
            );

            ctx.fillStyle =
                leftFace;

            ctx.fill();

            this._traceBeveledRect(
                ctx,

                x +
                d,

                y +
                d,

                w -
                d *
                2,

                h -
                d *
                2,

                Math.max(
                    2,
                    cut -
                    d
                )
            );

            ctx.strokeStyle =
                isDanger
                    ? 'rgba(255,169,190,0.15)'
                    : 'rgba(198,252,255,0.17)';

            ctx.lineWidth =
                Math.max(
                    1,
                    d *
                    0.2
                );

            ctx.stroke();

            ctx.restore();
        }

        _drawEdgePlate(
            ctx,
            x,
            y,
            w,
            h,
            slant,
            accent
        ) {
            const isDanger =
                accent ===
                '#FF003C';

            const isWarning =
                accent ===
                '#FFE600';

            const bright =
                isDanger
                    ? 'rgba(255,72,119,0.96)'
                    : (
                        isWarning
                            ? 'rgba(255,250,116,0.98)'
                            : 'rgba(82,250,255,0.96)'
                    );

            const mid =
                isDanger
                    ? 'rgba(255,0,60,0.82)'
                    : (
                        isWarning
                            ? 'rgba(255,224,0,0.9)'
                            : 'rgba(0,184,211,0.84)'
                    );

            const dark =
                isDanger
                    ? 'rgba(74,0,31,0.96)'
                    : (
                        isWarning
                            ? 'rgba(91,72,0,0.96)'
                            : 'rgba(0,52,77,0.96)'
                    );

            const skew =
                Math.min(
                    slant,
                    w *
                    0.2
                );

            ctx.save();

            ctx.beginPath();

            ctx.moveTo(
                x +
                skew +
                2,
                y +
                2
            );

            ctx.lineTo(
                x +
                w +
                2,
                y +
                2
            );

            ctx.lineTo(
                x +
                w -
                skew +
                2,
                y +
                h +
                2
            );

            ctx.lineTo(
                x +
                2,
                y +
                h +
                2
            );

            ctx.closePath();

            ctx.fillStyle =
                'rgba(0,0,8,0.76)';

            ctx.fill();

            ctx.beginPath();

            ctx.moveTo(
                x +
                skew,
                y
            );

            ctx.lineTo(
                x +
                w,
                y
            );

            ctx.lineTo(
                x +
                w -
                skew,
                y +
                h
            );

            ctx.lineTo(
                x,
                y +
                h
            );

            ctx.closePath();

            const plateGrad =
                ctx.createLinearGradient(
                    x,
                    y,
                    x + w,
                    y + h
                );

            plateGrad.addColorStop(
                0,
                bright
            );

            plateGrad.addColorStop(
                0.36,
                mid
            );

            plateGrad.addColorStop(
                1,
                dark
            );

            ctx.fillStyle =
                plateGrad;

            ctx.fill();

            ctx.strokeStyle =
                'rgba(255,255,255,0.28)';

            ctx.lineWidth =
                0.65;

            ctx.stroke();

            ctx.restore();
        }

        _drawSectionRail(
            ctx,
            x,
            y,
            w,
            h,
            s
        ) {
            this._drawEdgePlate(
                ctx,
                x,
                y,
                w,
                h,
                7 * s,
                '#00F0FF'
            );

            this._drawEdgePlate(
                ctx,
                x,
                y -
                0.4 *
                s,
                w *
                0.16,
                h *
                0.66,
                5 * s,
                '#FF003C'
            );

            this._drawEdgePlate(
                ctx,
                x +
                w *
                0.58,
                y -
                0.5 *
                s,
                w *
                0.10,
                h *
                0.72,
                4 * s,
                '#00F0FF'
            );
        }

        _drawPanel(
            ctx,
            x,
            y,
            w,
            h,
            s
        ) {
            const cut =
                14 *
                s;

            const tick =
                this.animTick ||
                0;

            // Rear magenta chassis.
            this._traceBeveledRect(
                ctx,

                x +
                7 *
                s,

                y +
                9 *
                s,

                w,
                h,
                cut
            );

            ctx.fillStyle =
                'rgba(0,0,8,0.76)';

            ctx.shadowColor =
                'rgba(0,0,0,0.95)';

            ctx.shadowBlur =
                26 *
                s;

            ctx.fill();

            ctx.shadowBlur =
                0;

            ctx.strokeStyle =
                'rgba(255,0,60,0.30)';

            ctx.lineWidth =
                Math.max(
                    1,
                    1.1 *
                    s
                );

            ctx.stroke();

            // Cyan offset chassis.
            this._traceBeveledRect(
                ctx,

                x -
                5 *
                s,

                y +
                4 *
                s,

                w,
                h,
                cut
            );

            ctx.fillStyle =
                'rgba(1,18,31,0.46)';

            ctx.fill();

            ctx.strokeStyle =
                'rgba(0,240,255,0.20)';

            ctx.stroke();

            // Main face.
            this._traceBeveledRect(
                ctx,
                x,
                y,
                w,
                h,
                cut
            );

            const shellGrad =
                ctx.createLinearGradient(
                    x,
                    y,
                    x + w,
                    y + h
                );

            shellGrad.addColorStop(
                0,
                'rgba(5,24,43,0.992)'
            );

            shellGrad.addColorStop(
                0.46,
                'rgba(2,10,25,0.992)'
            );

            shellGrad.addColorStop(
                0.79,
                'rgba(3,12,27,0.992)'
            );

            shellGrad.addColorStop(
                1,
                'rgba(26,3,24,0.975)'
            );

            ctx.fillStyle =
                shellGrad;

            ctx.shadowColor =
                'rgba(0,240,255,0.42)';

            ctx.shadowBlur =
                16 *
                s;

            ctx.fill();

            ctx.shadowBlur =
                0;

            ctx.save();

            this._traceBeveledRect(
                ctx,
                x,
                y,
                w,
                h,
                cut
            );

            ctx.clip();

            for (
                let sy =
                    y +
                    3 *
                    s;

                sy <
                    y +
                    h;

                sy +=
                    5 *
                    s
            ) {
                ctx.fillStyle =
                    'rgba(177,238,255,0.018)';

                ctx.fillRect(
                    x,
                    sy,
                    w,
                    Math.max(
                        1,
                        0.55 *
                        s
                    )
                );
            }

            for (
                let gx =
                    x +
                    22 *
                    s;

                gx <
                    x +
                    w;

                gx +=
                    32 *
                    s
            ) {
                ctx.strokeStyle =
                    'rgba(0,240,255,0.028)';

                ctx.lineWidth =
                    Math.max(
                        1,
                        0.5 *
                        s
                    );

                ctx.beginPath();

                ctx.moveTo(
                    gx,
                    y
                );

                ctx.lineTo(
                    gx -
                    26 *
                    s,

                    y +
                    h
                );

                ctx.stroke();
            }

            const scanY =
                y -
                25 *
                s +
                (
                    (
                        tick *
                        1.1
                    ) %
                    (
                        h +
                        50 *
                        s
                    )
                );

            const scanGrad =
                ctx.createLinearGradient(
                    0,
                    scanY -
                    16 *
                    s,

                    0,
                    scanY +
                    16 *
                    s
                );

            scanGrad.addColorStop(
                0,
                'rgba(0,240,255,0)'
            );

            scanGrad.addColorStop(
                0.5,
                'rgba(0,240,255,0.052)'
            );

            scanGrad.addColorStop(
                1,
                'rgba(0,240,255,0)'
            );

            ctx.fillStyle =
                scanGrad;

            ctx.fillRect(
                x,
                scanY -
                16 *
                s,

                w,

                32 *
                s
            );

            ctx.restore();

            this._traceBeveledRect(
                ctx,
                x,
                y,
                w,
                h,
                cut
            );

            ctx.strokeStyle =
                'rgba(0,240,255,0.88)';

            ctx.lineWidth =
                Math.max(
                    1,
                    1.25 *
                    s
                );

            ctx.shadowColor =
                'rgba(0,240,255,0.54)';

            ctx.shadowBlur =
                8 *
                s;

            ctx.stroke();

            ctx.shadowBlur =
                0;

            this._drawBevelFacets(
                ctx,
                x,
                y,
                w,
                h,
                cut,
                4.8 *
                s,
                '#00F0FF'
            );

            this._traceBeveledRect(
                ctx,

                x +
                5 *
                s,

                y +
                5 *
                s,

                w -
                10 *
                s,

                h -
                10 *
                s,

                Math.max(
                    3 *
                    s,
                    cut -
                    4 *
                    s
                )
            );

            ctx.strokeStyle =
                'rgba(166,239,255,0.12)';

            ctx.lineWidth =
                Math.max(
                    1,
                    0.7 *
                    s
                );

            ctx.stroke();

            // Fitted armor rails.
            this._drawEdgePlate(
                ctx,

                x +
                34 *
                s,

                y -
                1.5 *
                s,

                58 *
                s,

                3.2 *
                s,

                5 *
                s,

                '#00F0FF'
            );

            this._drawEdgePlate(
                ctx,

                x +
                w *
                0.34,

                y -
                1.5 *
                s,

                w *
                0.30,

                3.2 *
                s,

                6 *
                s,

                '#00F0FF'
            );

            this._drawEdgePlate(
                ctx,

                x +
                w -
                90 *
                s,

                y -
                1.5 *
                s,

                54 *
                s,

                3.2 *
                s,

                5 *
                s,

                '#00F0FF'
            );

            this._drawEdgePlate(
                ctx,

                x +
                32 *
                s,

                y +
                h -
                1.5 *
                s,

                64 *
                s,

                3.4 *
                s,

                5 *
                s,

                '#FF003C'
            );

            this._drawEdgePlate(
                ctx,

                x +
                w *
                0.33,

                y +
                h -
                1.5 *
                s,

                w *
                0.40,

                3.4 *
                s,

                7 *
                s,

                '#00F0FF'
            );
        }

        _drawMenuButton(
            ctx,
            index,
            x,
            y,
            w,
            h,
            s,
            font
        ) {
            const item =
                this.menuItems[
                    index
                ];

            const mix =
                Math.max(
                    0,
                    Math.min(
                        1,
                        this.selectionMix[
                            index
                        ] ||
                        0
                    )
                );

            const eased =
                this._easeOutCubic(
                    mix
                );

            const accent =
                item.danger
                    ? '#FF003C'
                    : '#00F0FF';

            const cut =
                10 *
                s;

            this.buttonRects.push({
                x,
                y,
                w,
                h,
            });

            ctx.save();

            // Rear depth.
            this._traceBeveledRect(
                ctx,

                x +
                4 *
                s,

                y +
                5 *
                s,

                w,
                h,
                cut
            );

            ctx.fillStyle =
                'rgba(0,0,7,0.74)';

            ctx.fill();

            ctx.strokeStyle =
                item.danger
                    ? 'rgba(255,0,60,0.20)'
                    : 'rgba(0,240,255,0.18)';

            ctx.lineWidth =
                Math.max(
                    1,
                    0.8 *
                    s
                );

            ctx.stroke();

            this._traceBeveledRect(
                ctx,
                x,
                y,
                w,
                h,
                cut
            );

            const baseGrad =
                ctx.createLinearGradient(
                    x,
                    y,
                    x + w,
                    y + h
                );

            if (
                item.danger
            ) {
                baseGrad.addColorStop(
                    0,
                    'rgba(' +
                    Math.round(
                        13 +
                        15 *
                        eased
                    ) +
                    ',5,14,0.99)'
                );

                baseGrad.addColorStop(
                    0.58,
                    'rgba(5,8,18,0.99)'
                );

                baseGrad.addColorStop(
                    1,
                    'rgba(19,2,14,0.99)'
                );
            } else {
                baseGrad.addColorStop(
                    0,
                    'rgba(3,' +
                    Math.round(
                        13 +
                        13 *
                        eased
                    ) +
                    ',' +
                    Math.round(
                        25 +
                        16 *
                        eased
                    ) +
                    ',0.99)'
                );

                baseGrad.addColorStop(
                    0.58,
                    'rgba(4,9,20,0.99)'
                );

                baseGrad.addColorStop(
                    1,
                    'rgba(1,14,23,0.99)'
                );
            }

            ctx.fillStyle =
                baseGrad;

            ctx.fill();

            // Selected energy fill.
            if (
                eased >
                0.002
            ) {
                ctx.save();

                this._traceBeveledRect(
                    ctx,
                    x,
                    y,
                    w,
                    h,
                    cut
                );

                ctx.clip();

                const energyW =
                    w *
                    (
                        0.20 +
                        eased *
                        0.80
                    );

                const charge =
                    ctx.createLinearGradient(
                        x,
                        y,
                        x +
                        energyW,
                        y
                    );

                if (
                    item.danger
                ) {
                    charge.addColorStop(
                        0,
                        'rgba(255,0,60,0.04)'
                    );

                    charge.addColorStop(
                        0.56,
                        'rgba(255,0,60,' +
                        (
                            0.08 +
                            eased *
                            0.13
                        ).toFixed(
                            3
                        ) +
                        ')'
                    );

                    charge.addColorStop(
                        1,
                        'rgba(255,90,130,' +
                        (
                            0.04 +
                            eased *
                            0.10
                        ).toFixed(
                            3
                        ) +
                        ')'
                    );
                } else {
                    charge.addColorStop(
                        0,
                        'rgba(0,240,255,0.03)'
                    );

                    charge.addColorStop(
                        0.56,
                        'rgba(0,240,255,' +
                        (
                            0.07 +
                            eased *
                            0.11
                        ).toFixed(
                            3
                        ) +
                        ')'
                    );

                    charge.addColorStop(
                        1,
                        'rgba(190,255,255,' +
                        (
                            0.03 +
                            eased *
                            0.09
                        ).toFixed(
                            3
                        ) +
                        ')'
                    );
                }

                ctx.fillStyle =
                    charge;

                ctx.fillRect(
                    x,
                    y,
                    energyW,
                    h
                );

                const sweepX =
                    x -
                    42 *
                    s +
                    (
                        (
                            this.animTick *
                            2.7 +
                            index *
                            75
                        ) %
                        (
                            w +
                            84 *
                            s
                        )
                    );

                ctx.globalAlpha =
                    eased *
                    0.24;

                ctx.fillStyle =
                    '#FFFFFF';

                ctx.translate(
                    sweepX +
                    5 *
                    s,
                    y
                );

                ctx.transform(
                    1,
                    0,
                    -0.30,
                    1,
                    0,
                    0
                );

                ctx.fillRect(
                    -5 *
                    s,
                    0,
                    10 *
                    s,
                    h
                );

                ctx.restore();
            }

            this._traceBeveledRect(
                ctx,
                x,
                y,
                w,
                h,
                cut
            );

            ctx.strokeStyle =
                accent;

            ctx.globalAlpha =
                item.danger
                    ? (
                        0.28 +
                        eased *
                        0.72
                    )
                    : (
                        0.38 +
                        eased *
                        0.62
                    );

            ctx.lineWidth =
                Math.max(
                    1,
                    (
                        1.0 +
                        eased *
                        0.9
                    ) *
                    s
                );

            ctx.shadowColor =
                accent;

            ctx.shadowBlur =
                (
                    3 +
                    eased *
                    10
                ) *
                s;

            ctx.stroke();

            ctx.shadowBlur =
                0;

            ctx.globalAlpha =
                1;

            this._drawBevelFacets(
                ctx,
                x,
                y,
                w,
                h,
                cut,
                (
                    2.6 +
                    eased *
                    1.2
                ) *
                s,
                accent
            );

            // Active side accent.
            if (
                eased >
                0.02
            ) {
                const bladeAccent =
                    item.danger
                        ? '#FF003C'
                        : '#FFE600';

                ctx.globalAlpha =
                    0.40 +
                    eased *
                    0.60;

                this._drawEdgePlate(
                    ctx,

                    x -
                    5 *
                    s,

                    y +
                    7 *
                    s,

                    12 *
                    s,

                    h -
                    14 *
                    s,

                    3 *
                    s,

                    bladeAccent
                );

                ctx.globalAlpha =
                    1;
            }

            const railAccent =
                eased >
                    0.55 &&
                !item.danger
                    ? '#FFE600'
                    : accent;

            const railInset =
                (
                    20 -
                    eased *
                    10
                ) *
                s;

            this._drawEdgePlate(
                ctx,

                x +
                railInset,

                y +
                h -
                (
                    3.8 +
                    eased
                ) *
                s,

                w -
                railInset *
                2,

                (
                    2.2 +
                    eased *
                    0.7
                ) *
                s,

                4 *
                s,

                railAccent
            );

            ctx.textAlign =
                'left';

            ctx.textBaseline =
                'middle';

            ctx.font =
                'bold ' +
                Math.round(
                    16 *
                    s
                ) +
                'px ' +
                font;

            ctx.fillStyle =
                '#FFFFFF';

            ctx.shadowColor =
                eased >
                    0.05
                    ? accent
                    : 'transparent';

            ctx.shadowBlur =
                eased *
                5 *
                s;

            ctx.fillText(
                item.title,

                x +
                28 *
                s,

                y +
                h *
                0.40
            );

            ctx.shadowBlur =
                0;

            ctx.font =
                Math.round(
                    8 *
                    s
                ) +
                'px ' +
                font;

            ctx.fillStyle =
                item.danger
                    ? (
                        'rgba(255,137,169,' +
                        (
                            0.58 +
                            eased *
                            0.35
                        ).toFixed(
                            3
                        ) +
                        ')'
                    )
                    : (
                        'rgba(168,231,241,' +
                        (
                            0.52 +
                            eased *
                            0.38
                        ).toFixed(
                            3
                        ) +
                        ')'
                    );

            ctx.fillText(
                item.subtitle,

                x +
                28 *
                s,

                y +
                h *
                0.69
            );

            ctx.restore();
        }

        drawHUD() {
            const ctx =
                Common &&
                Common.Platform
                    ? Common.Platform.ctx
                    : null;

            if (
                !ctx ||
                !ctx.canvas
            ) {
                return;
            }

            const cW =
                ctx.canvas.width;

            const cH =
                ctx.canvas.height;

            const s =
                Math.max(
                    0.72,
                    Math.min(
                        cW /
                        1280,

                        cH /
                        720
                    )
                );

            const font =
                IP2Live.Assets &&
                IP2Live.Assets.oxaniumMediumLoaded
                    ? 'Oxanium-Medium'
                    : 'monospace';

            const easeIn =
                this._easeOutCubic(
                    this.fadeIn
                );

            const panelW =
                500 *
                s;

            const panelH =
                352 *
                s;

            const x =
                (
                    cW -
                    panelW
                ) /
                2;

            const baseY =
                (
                    cH -
                    panelH
                ) /
                2;

            const y =
                baseY +
                (
                    1 -
                    easeIn
                ) *
                20 *
                s;

            ctx.save();

            /*
             * ==========================================
             * FROZEN GAMEPLAY BACKDROP
             * ==========================================
             *
             * The frame that was visible when Pause
             * was pressed is redrawn behind the menu.
             */
            if (
                this.pauseBackdrop
            ) {
                ctx.save();

                /*
                 * Mild blur only.
                 * Gameplay remains recognizable.
                 */
                const blurAmount =
                    Math.max(
                        2,
                        3.5 *
                        s
                    );

                /*
                 * Extend the image slightly beyond
                 * the canvas because blur can expose
                 * transparent edge pixels.
                 */
                const overscan =
                    Math.max(
                        6,
                        8 *
                        s
                    );

                if (
                    'filter' in
                    ctx
                ) {
                    ctx.filter =
                        'blur(' +
                        blurAmount +
                        'px)';
                }

                ctx.globalAlpha =
                    0.96;

                ctx.drawImage(
                    this.pauseBackdrop,

                    0,
                    0,

                    this.pauseBackdrop.width,
                    this.pauseBackdrop.height,

                    -overscan,
                    -overscan,

                    cW +
                    overscan *
                    2,

                    cH +
                    overscan *
                    2
                );

                ctx.filter =
                    'none';

                ctx.globalAlpha =
                    1;

                ctx.restore();
            } else {
                /*
                 * Fallback only if the screenshot
                 * cannot be created.
                 */
                ctx.fillStyle =
                    '#020711';

                ctx.fillRect(
                    0,
                    0,
                    cW,
                    cH
                );
            }

            /*
             * Dark transparent overlay.
             *
             * Lower this value if you want the
             * gameplay to appear brighter.
             */
            ctx.fillStyle =
                'rgba(0,5,12,0.44)';

            ctx.fillRect(
                0,
                0,
                cW,
                cH
            );

            /*
             * Gentle vignette darkens the outer
             * edges without covering the game.
             */
            const pauseVignette =
                ctx.createRadialGradient(
                    cW /
                    2,

                    cH /
                    2,

                    40 *
                    s,

                    cW /
                    2,

                    cH /
                    2,

                    Math.max(
                        cW,
                        cH
                    ) *
                    0.72
                );

            pauseVignette.addColorStop(
                0,
                'rgba(0,8,16,0.01)'
            );

            pauseVignette.addColorStop(
                0.56,
                'rgba(0,5,12,0.07)'
            );

            pauseVignette.addColorStop(
                1,
                'rgba(0,2,8,0.32)'
            );

            ctx.fillStyle =
                pauseVignette;

            ctx.fillRect(
                0,
                0,
                cW,
                cH
            );

            ctx.globalAlpha =
                easeIn;

            this._drawPanel(
                ctx,
                x,
                y,
                panelW,
                panelH,
                s
            );

            // Main title.
            ctx.textAlign =
                'center';

            ctx.textBaseline =
                'middle';

            ctx.font =
                'bold ' +
                Math.round(
                    23 *
                    s
                ) +
                'px ' +
                font;

            ctx.fillStyle =
                '#FFFFFF';

            ctx.shadowColor =
                'rgba(0,240,255,0.24)';

            ctx.shadowBlur =
                5 *
                s;

            ctx.fillText(
                'GAMEPLAY PAUSED',

                x +
                panelW /
                2,

                y +
                42 *
                s
            );

            ctx.shadowBlur =
                0;

            // Decorative rail.
            this._drawSectionRail(
                ctx,

                x +
                34 *
                s,

                y +
                61 *
                s,

                panelW -
                68 *
                s,

                4 *
                s,

                s
            );

            this.buttonRects =
                [];

            const buttonX =
                x +
                30 *
                s;

            const buttonW =
                panelW -
                60 *
                s;

            const buttonH =
                68 *
                s;

            const startY =
                y +
                87 *
                s;

            const gap =
                13 *
                s;

            for (
                let i = 0;
                i < this.menuItems.length;
                i++
            ) {
                this._drawMenuButton(
                    ctx,

                    i,

                    buttonX,

                    startY +
                    i *
                    (
                        buttonH +
                        gap
                    ),

                    buttonW,
                    buttonH,
                    s,
                    font
                );
            }

            ctx.restore();
        }
    }

    IP2Live.GameplayPause =
        GameplayPause;

    window.IP2LiveGameplayPause =
        GameplayPause;

    window.IP2LiveGameplayPauseMenu =
        IP2LiveGameplayPauseMenu;

    GameplayPause.install();

    console.log(
        '[IP2Live] gameplay-pause.js loaded.'
    );
}());
