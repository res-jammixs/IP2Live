/**
 * IP2Live — Main Menu Screen
 * Fully hardcoded Canvas 2D redesign.
 * No image assets are used for the right-side hero artwork.
 *
 * Drop-in replacement for:
 * Plugins/IP2Live_Core/modules/screens/main-menu.js
 */

class IP2LiveTitleScreenImplementation extends Scene.Base {
    initialize(startAtLoop = false) {
        this.startAtLoop = startAtLoop;
        this._ip2LiveTitleInitialized = true;

        this.selectedIndex = 0;
        this.menuPage = 'main';
        this.menuItems = ['PLAY GAME', 'SETTINGS', 'CREDITS', 'QUIT GAME'];

        this.scanlineOffset = 0;
        this.hoverIndex = -1;
        this.animTick = 0;
        this.btnProgress = Array(this.menuItems.length).fill(0);
        this._buttonEntranceStartedAt = null;

        this.titleTarget = 'IP2LIVE';
        this.titleProgress = 0;
        this.titleDone = false;

        this.particles = [];
        this.dust = [];
        this._heroTexture = null;

        this.shakeX = 0;
        this.shakeY = 0;

        this.fadeOut = 0;
        this.fadeTarget = null;
        this.isFadingIn = false;
        this._waitingForGameData = false;

        this._musicStarted = false;
        this._musicStartPending = false;
        this._musicAttemptToken = 0;
    }

    async load() {
        if (Core && Core.Game) Core.Game.current = null;
        if (Manager.Videos && typeof Manager.Videos.stop === 'function') {
            Manager.Videos.stop();
        }
        if (Manager.Songs && typeof Manager.Songs.stopAll === 'function') {
            Manager.Songs.stopAll();
        }
        if (Manager.GL && Manager.GL.screenTone) {
            Manager.GL.screenTone.set(0, 0, 0, 1);
        }

        Manager.Stack.displayedPictures = [];

        await IP2Live.Assets.loadAll();

        this._seedParticles(48);
        this._seedDust(430);

        this.loading = false;
        this._buttonEntranceStartedAt = Date.now() + 500;

        Manager.Stack.requestPaintHUD = true;
        this._tryStartMusic(false);
    }

    translate() {
        Manager.Stack.requestPaintHUD = true;
    }

    _tryStartMusic(fromUserGesture = false) {
        const music = IP2Live.MusicManager;

        if (!music || !music.ZONE) {
            return Promise.resolve(false);
        }

        if (
            fromUserGesture &&
            typeof music.unlock === 'function'
        ) {
            music.unlock();
        }

        if (this._musicStarted) {
            return Promise.resolve(true);
        }

        if (
            this._musicStartPending &&
            !fromUserGesture
        ) {
            return Promise.resolve(false);
        }

        const attemptToken = ++this._musicAttemptToken;

        this._musicStartPending = true;

        const attempt =
            fromUserGesture &&
            typeof music.retry === 'function'
                ? music.retry()
                : music.play(
                    music.ZONE.MAIN_MENU
                );

        return Promise.resolve(attempt)
            .then((started) => {
                if (
                    attemptToken !==
                    this._musicAttemptToken
                ) {
                    return false;
                }

                const playing =
                    typeof music.isPlaying ===
                    'function'
                        ? music.isPlaying()
                        : started !== false;

                this._musicStarted =
                    started !== false &&
                    playing;

                return this._musicStarted;
            })
            .catch((error) => {
                if (
                    attemptToken !==
                    this._musicAttemptToken
                ) {
                    return false;
                }

                this._musicStarted = false;

                console.warn(
                    '[IP2Live] Main-menu music start failed:',
                    error
                );

                return false;
            })
            .finally(() => {
                if (
                    attemptToken ===
                    this._musicAttemptToken
                ) {
                    this._musicStartPending =
                        false;
                }
            });
    }

    // ============================================================
    // PARTICLES
    // ============================================================

    _seedParticles(count) {
        const chars = ['0', '1', '01', '10', '0x', '//', '::'];
        // Normalized positions keep the field spread across resized windows.
        this.particles = Array.from({ length: count }, () => ({
            x: Math.random(), y: Math.random(),
            vx: (Math.random() - 0.5) * 0.000035,
            vy: 0.00009 + Math.random() * 0.00018,
            size: 7 + Math.random() * 4,
            alpha: 0.045 + Math.random() * 0.075,
            char: chars[Math.floor(Math.random() * chars.length)],
            flipTimer: 90 + Math.floor(Math.random() * 180)
        }));
    }

    _seedDust(count) {
        // The same small, rising red motes used by the game-over backdrop.
        this.dust = Array.from({ length: count }, (_, index) => ({
            x: Math.random(), y: Math.random(),
            menuLayer: index % 5 < 2,
            size: 0.5 + Math.random() * 1.8,
            alpha: 0.14 + Math.random() * 0.30,
            speed: (0.12 + Math.random() * 0.42) / 720,
            drift: (Math.random() - 0.5) * 0.12 / 1280,
            phase: Math.random() * Math.PI * 2
        }));
    }

    // ============================================================
    // MENU LAYOUT
    // ============================================================

    _menuLayout() {
        const SW =
            Common.ScreenResolution
                .SCREEN_X;

        const SH =
            Common.ScreenResolution
                .SCREEN_Y;

        const btnW = 388;
        const btnH = 54;
        const gap = 13;

        const count =
            this.menuItems.length +
            (
                this.menuPage ===
                'main'
                    ? 0
                    : 1
            );

        const stackH =
            count *
                btnH +
            (
                count -
                1
            ) *
                gap;

        const contentTop =
            230;

        const contentBottom =
            SH -
            72;

        return {
            btnX:
                (
                    SW *
                        0.5 -
                    btnW
                ) /
                    2 -
                42,

            btnW,
            btnH,
            gap,

            startY:
                contentTop +
                (
                    contentBottom -
                    contentTop -
                    stackH
                ) /
                    2
        };
    }

    _showMenuPage(page) {
        const pages = {
            main: [
                'PLAY GAME',
                'SETTINGS',
                'CREDITS',
                'QUIT GAME'
            ],

            play: [
                'STORY MODE',
                'ENDLESS MODE',
                'PRACTICE MODE'
            ],

            story: [
                'NEW STORY',
                'AUTOSAVED',
                'LOAD STORY'
            ]
        };

        this.menuPage =
            page;

        this.menuItems =
            pages[page];

        this.selectedIndex =
            0;

        this.hoverIndex =
            -1;

        this.btnProgress =
            Array(
                this.menuItems.length
            ).fill(0);

        this._buttonEntranceStartedAt =
            Date.now();

        Manager.Stack
            .requestPaintHUD =
            true;
    }

    _backMenuPage() {
        if (
            this.menuPage ===
            'main'
        ) {
            return;
        }

        this._showMenuPage(
            this.menuPage ===
                'story'
                ? 'play'
                : 'main'
        );
    }

    _backButtonLayout() {
        const layout =
            this._menuLayout();

        return {
            x:
                layout.btnX,

            y:
                layout.startY +
                this.menuItems.length *
                    (
                        layout.btnH +
                        layout.gap
                    ),

            w:
                layout.btnW,

            h:
                layout.btnH
        };
    }

    // ============================================================
    // INPUT
    // ============================================================

    onKeyPressed(key) {
        this._tryStartMusic(
            true
        );

        if (
            Data.Keyboards
                .checkActionMenu(
                    key
                )
        ) {
            this._confirmSelection();
        } else if (
            Data.Keyboards
                .checkCancelMenu(
                    key
                ) &&
            this.menuPage !==
                'main'
        ) {
            Data.Systems
                .soundCursor
                .playSound();

            this._backMenuPage();
        }
    }

    onKeyPressedAndRepeat(key) {
        const previous =
            this.selectedIndex;

        const count =
            this.menuItems.length +
            (
                this.menuPage ===
                'main'
                    ? 0
                    : 1
            );

        if (
            Data.Keyboards
                .isKeyEqual(
                    key,
                    Data.Keyboards
                        .menuControls
                        .Up
                )
        ) {
            this.selectedIndex =
                (
                    this.selectedIndex -
                    1 +
                    count
                ) %
                count;
        } else if (
            Data.Keyboards
                .isKeyEqual(
                    key,
                    Data.Keyboards
                        .menuControls
                        .Down
                )
        ) {
            this.selectedIndex =
                (
                    this.selectedIndex +
                    1
                ) %
                count;
        }

        if (
            previous !==
            this.selectedIndex
        ) {
            this.hoverIndex =
                -1;

            Data.Systems
                .soundCursor
                .playSound();

            Manager.Stack
                .requestPaintHUD =
                true;
        }

        return true;
    }

    onMouseMove(x, y) {
        const newHover =
            this._getButtonAt(
                x,
                y
            );

        if (
            newHover ===
            this.hoverIndex
        ) {
            return;
        }

        this.hoverIndex =
            newHover;

        if (
            newHover >= 0 &&
            newHover !==
                this.selectedIndex
        ) {
            this.selectedIndex =
                newHover;

            Data.Systems
                .soundCursor
                .playSound();
        }

        Manager.Stack
            .requestPaintHUD =
            true;
    }

    onMouseUp(x, y) {
        this._tryStartMusic(
            true
        );

        const index =
            this._getButtonAt(
                x,
                y
            );

        if (
            index <
            0
        ) {
            return;
        }

        if (
            index !==
            this.selectedIndex
        ) {
            this.selectedIndex =
                index;

            Data.Systems
                .soundCursor
                .playSound();
        }

        this._confirmSelection();
    }

    _getButtonAt(x, y) {
        if (
            this.menuPage !==
            'main'
        ) {
            const back =
                this._backButtonLayout();

            const sx =
                Common.ScreenResolution
                    .getScreenX(
                        back.x
                    );

            const sy =
                Common.ScreenResolution
                    .getScreenY(
                        back.y
                    );

            const sw =
                Common.ScreenResolution
                    .getScreenX(
                        back.w
                    );

            const sh =
                Common.ScreenResolution
                    .getScreenY(
                        back.h
                    );

            if (
                x >= sx &&
                x <=
                    sx +
                    sw &&
                y >= sy &&
                y <=
                    sy +
                    sh
            ) {
                return this
                    .menuItems
                    .length;
            }
        }

        const layout =
            this._menuLayout();

        for (
            let i = 0;
            i <
            this.menuItems.length;
            i++
        ) {
            const y0 =
                layout.startY +
                i *
                    (
                        layout.btnH +
                        layout.gap
                    );

            const sx =
                Common.ScreenResolution
                    .getScreenX(
                        layout.btnX
                    );

            const sy =
                Common.ScreenResolution
                    .getScreenY(
                        y0
                    );

            const sw =
                Common.ScreenResolution
                    .getScreenX(
                        layout.btnW
                    );

            const sh =
                Common.ScreenResolution
                    .getScreenY(
                        layout.btnH
                    );

            if (
                x >= sx &&
                x <=
                    sx +
                    sw &&
                y >= sy &&
                y <=
                    sy +
                    sh
            ) {
                return i;
            }
        }

        return -1;
    }

    // ============================================================
    // ACTIONS
    // ============================================================

    _confirmSelection() {
        if (
            IP2Live.MenuTransition &&
            IP2Live.MenuTransition
                .active
        ) {
            return;
        }

        const index =
            this.selectedIndex;

        Data.Systems
            .soundConfirmation
            .playSound();

        if (
            this.menuPage !==
                'main' &&
            index ===
                this.menuItems
                    .length
        ) {
            this._backMenuPage();

            return;
        }

        const action =
            this.menuItems[
                index
            ];

        if (
            action ===
            'PLAY GAME'
        ) {
            return this
                ._showMenuPage(
                    'play'
                );
        }

        if (
            action ===
            'STORY MODE'
        ) {
            return this
                ._showMenuPage(
                    'story'
                );
        }

        if (
            action ===
            'NEW STORY'
        ) {
            if (
                IP2Live
                    .LoadingScreen &&
                typeof IP2Live
                    .LoadingScreen
                    .show ===
                    'function'
            ) {
                IP2Live
                    .LoadingScreen
                    .show({
                        mode:
                            'push',

                        status:
                            'Loading New Story',

                        detail:
                            'Opening infiltrator profile channel',

                        onComplete:
                            function () {
                                Manager.Stack
                                    .replace(
                                        new IP2LiveNameInputScreen()
                                    );
                            }
                    });
            } else {
                this.fadeTarget =
                    index;
            }

            Manager.Stack
                .requestPaintHUD =
                true;

            return;
        }

        switch (action) {
            case 'ENDLESS MODE':
            case 'PRACTICE MODE':
            case 'AUTOSAVED':
                break;

            case 'LOAD STORY':
                this._openLoadGame();
                break;

            case 'SETTINGS':
                this._openMenu(
                    () =>
                        new IP2LiveSettingsMenu()
                );
                break;

            case 'CREDITS':
                this._openMenu(
                    () =>
                        new IP2LiveCreditsScene()
                );
                break;

            case 'QUIT GAME':
                this._openQuitConfirmation();
                break;
        }
    }

    _openMenu(factory) {
        if (
            IP2Live.MenuTransition
        ) {
            return IP2Live
                .MenuTransition
                .open(
                    factory
                );
        }

        Manager.Stack.push(
            factory()
        );
    }

    _openLoadGame() {
        if (
            IP2Live.MenuTransition
        ) {
            return IP2Live
                .MenuTransition
                .open(
                    async () => {
                        if (
                            Main &&
                            typeof Main
                                .waitForGameData ===
                                'function'
                        ) {
                            await Main
                                .waitForGameData();
                        }

                        return new IP2LiveLoadGameMenu();
                    }
                );
        }

        if (
            this._waitingForGameData
        ) {
            return;
        }

        this._waitingForGameData =
            true;

        this.loading =
            true;

        Manager.Stack
            .requestPaintHUD =
            true;

        const ready =
            Main &&
            typeof Main
                .waitForGameData ===
                'function'
                ? Main
                    .waitForGameData()
                : Promise.resolve();

        Promise.resolve(
            ready
        )
            .then(() => {
                if (
                    Manager.Stack
                        .top ===
                    this
                ) {
                    Manager.Stack
                        .push(
                            new IP2LiveLoadGameMenu()
                        );
                }
            })
            .catch((error) => {
                console.error(
                    '[IP2Live] Unable to open Load Game:',
                    error
                );

                if (
                    Data.Systems
                        .soundImpossible
                ) {
                    Data.Systems
                        .soundImpossible
                        .playSound();
                }
            })
            .finally(() => {
                this.loading =
                    false;

                this._waitingForGameData =
                    false;

                Manager.Stack
                    .requestPaintHUD =
                    true;
            });
    }

    _openQuitConfirmation() {
        if (
            IP2Live.confirPopup &&
            typeof IP2Live
                .confirPopup
                .show ===
                'function'
        ) {
            IP2Live
                .confirPopup
                .show({
                    title:
                        'QUIT GAME?',

                    message:
                        'Close IP2Live?',

                    confirmLabel:
                        'QUIT',

                    cancelLabel:
                        'CANCEL',

                    danger:
                        true,

                    onConfirm:
                        () =>
                            this._quitAfterCheckpoint()
                });

            return;
        }

        this._quitAfterCheckpoint();
    }

    _quitAfterCheckpoint() {
        if (
            IP2Live.MenuTransition
        ) {
            return IP2Live
                .MenuTransition
                .quit(
                    'main_menu_quit'
                );
        }

        const manager =
            IP2Live.GameManager;

        if (
            manager &&
            typeof manager
                .prepareForShutdown ===
                'function'
        ) {
            manager
                .prepareForShutdown(
                    'main_menu_quit'
                )
                .catch(
                    (error) =>
                        console.warn(
                            '[IP2Live] Shutdown flush failed:',
                            error
                        )
                )
                .finally(
                    () =>
                        Common.Platform
                            .quit()
                );
        } else {
            Common.Platform.quit();
        }
    }

    // ============================================================
    // UPDATE
    // ============================================================

    update() {
        this.animTick++;

        this.scanlineOffset =
            (
                this.scanlineOffset +
                0.4
            ) %
            4;

        let animating =
            false;

        for (
            let i = 0;
            i <
            this.menuItems.length;
            i++
        ) {
            if (
                i ===
                    this.selectedIndex ||
                i ===
                    this.hoverIndex
            ) {
                if (
                    this.btnProgress[
                        i
                    ] <
                    this.menuItems[
                        i
                    ].length *
                        3 +
                        10
                ) {
                    this.btnProgress[
                        i
                    ] +=
                        0.55;

                    animating =
                        true;
                }
            } else {
                this.btnProgress[
                    i
                ] = 0;
            }
        }

        if (
            !this.titleDone
        ) {
            this.titleProgress +=
                0.6;

            if (
                this.titleProgress >=
                this.titleTarget
                    .length *
                    3 +
                    10
            ) {
                this.titleDone =
                    true;
            }

            animating =
                true;
        }

        for (const p of this.particles) {
            p.x = (p.x + p.vx + 1) % 1;
            p.y = (p.y - p.vy + 1) % 1;
            if (--p.flipTimer <= 0) {
                p.char = ['0', '1', '01', '10', '0x', '//', '::'][Math.floor(Math.random() * 7)];
                p.flipTimer = 90 + Math.floor(Math.random() * 180);
            }
        }
        for (const d of this.dust) {
            d.x = (d.x + d.drift + 1) % 1;
            d.y = (d.y - d.speed + 1) % 1;
        }

        const t =
            this.animTick *
            0.018;

        this.shakeX =
            Math.sin(
                t *
                    1.3
            ) *
                1.1 +
            Math.cos(
                t *
                    2.1
            ) *
                0.45;

        this.shakeY =
            Math.cos(
                t *
                    0.9
            ) *
                0.8 +
            Math.sin(
                t *
                    2.7
            ) *
                0.35;

        if (
            this.fadeTarget !==
            null
        ) {
            this.fadeOut +=
                0.045;

            if (
                this.fadeOut >=
                1
            ) {
                Manager.Stack
                    .push(
                        new IP2LiveNameInputScreen()
                    );

                this.fadeTarget =
                    null;

                this.fadeOut =
                    0;
            }

            animating =
                true;
        }

        if (
            this.isFadingIn
        ) {
            this.fadeOut -=
                0.045;

            if (
                this.fadeOut <=
                0
            ) {
                this.fadeOut =
                    0;

                this.isFadingIn =
                    false;
            }

            animating =
                true;
        }

        if (
            this.animTick %
                2 ===
                0 ||
            animating
        ) {
            Manager.Stack
                .requestPaintHUD =
                true;
        }
    }

    // ============================================================
    // MAIN RENDER
    // ============================================================

    draw3D() {
        if (
            Manager.GL &&
            Manager.GL.renderer
        ) {
            Manager.GL.renderer
                .clear();
        }
    }

    drawHUD() {
        const ctx =
            Common.Platform.ctx;

        const SW =
            Common.ScreenResolution
                .SCREEN_X;

        const SH =
            Common.ScreenResolution
                .SCREEN_Y;

        const cW =
            Common.ScreenResolution
                .CANVAS_WIDTH;

        const cH =
            Common.ScreenResolution
                .CANVAS_HEIGHT;

        const scaleX =
            cW /
            SW;

        const scaleY =
            cH /
            SH;

        ctx.save();

        ctx.translate(
            this.shakeX *
                0.18,

            this.shakeY *
                0.18
        );

        this._drawBackdrop(
            ctx,
            cW,
            cH,
            scaleX,
            scaleY
        );

        this._drawHeroComposition(
            ctx,
            cW,
            cH
        );

        this._drawMenuVeil(
            ctx,
            cW,
            cH
        );

        this._drawFloatingParticles(ctx, cW, cH);

        this._drawTitle(
            ctx,
            scaleX,
            scaleY
        );

        const layout =
            this._menuLayout();

        if (
            this.menuPage !==
            'main'
        ) {
            this._drawMenuBackButton(
                ctx,
                scaleX,
                scaleY
            );
        }

        for (
            let i = 0;
            i <
            this.menuItems.length;
            i++
        ) {
            const y =
                layout.startY +
                i *
                    (
                        layout.btnH +
                        layout.gap
                    );

            this._drawButton(
                ctx,
                scaleX,
                scaleY,
                layout.btnX,
                y,
                layout.btnW,
                layout.btnH,
                this.menuItems[i],
                i ===
                    this.selectedIndex,
                i ===
                    this.hoverIndex,
                i
            );
        }

        if (
            this.fadeOut >
            0
        ) {
            ctx.globalAlpha =
                Math.min(
                    1,
                    this.fadeOut
                );

            ctx.fillStyle =
                '#000000';

            ctx.fillRect(
                0,
                0,
                cW,
                cH
            );

            ctx.globalAlpha =
                1;
        }

        ctx.restore();

        this._drawGlobalGlitch(
            ctx,
            cW,
            cH,
            scaleX,
            scaleY
        );
    }

    // ============================================================
    // BACKDROP
    // ============================================================

    _drawBackdrop(ctx, cW, cH, scaleX, scaleY) {
        ctx.save();
        ctx.fillStyle = '#030205';
        ctx.fillRect(0, 0, cW, cH);

        const bloom = ctx.createRadialGradient(
            cW * 0.755, cH * 0.46, 0, cW * 0.755, cH * 0.46, cH * 0.65
        );
        bloom.addColorStop(0, 'rgba(103,13,28,0.24)');
        bloom.addColorStop(0.5, 'rgba(57,7,18,0.13)');
        bloom.addColorStop(1, 'rgba(18,2,8,0)');
        ctx.fillStyle = bloom;
        ctx.fillRect(0, 0, cW, cH);
        ctx.restore();
    }

    _drawMenuVeil(ctx, cW, cH) {
        ctx.save();
        const veil = ctx.createLinearGradient(0, 0, cW * 0.57, 0);
        veil.addColorStop(0, 'rgba(0,0,3,0.45)');
        veil.addColorStop(0.7, 'rgba(0,0,3,0.25)');
        veil.addColorStop(1, 'rgba(0,0,3,0)');
        ctx.fillStyle = veil;
        ctx.fillRect(0, 0, cW * 0.57, cH);
        ctx.restore();
    }

    _drawFloatingParticles(ctx, cW, cH) {
        const unit = Math.min(cW / 1280, cH / 720);
        ctx.save();
        // Draw after the menu veil, before the text and buttons.
        for (const d of this.dust) {
            const shimmer = 0.72 + Math.sin(this.animTick * 0.014 + d.phase) * 0.28;
            const size = Math.max(0.65, d.size * unit);
            const x = (d.menuLayer ? 0.025 + d.x * 0.48 : d.x) * cW;
            const y = d.y * cH;
            ctx.globalAlpha = d.alpha * shimmer;
            ctx.fillStyle = d.menuLayer ? '#E98B95' : '#FF657A';
            ctx.fillRect(x, y, size, size);
            if (d.size > 1.9) {
                ctx.globalAlpha *= 0.18;
                ctx.fillRect(x - size, y - size, size * 3, size * 3);
            }
        }
        ctx.textAlign = 'left';
        ctx.fillStyle = '#BF465B';
        for (const p of this.particles) {
            ctx.globalAlpha = p.alpha;
            ctx.font = Math.max(5, p.size * unit) + 'px monospace';
            ctx.fillText(p.char, p.x * cW, p.y * cH);
        }
        ctx.restore();
    }

    _drawHeroTexture(ctx, x, y, width, height, alpha) {
        // Fixed grain, cached once: texture should not flicker like TV static.
        if (!this._heroTexture && typeof document !== 'undefined') {
            const tile = document.createElement('canvas');
            tile.width = tile.height = 256;
            const grain = tile.getContext('2d');
            let seed = 0xA9E317;
            const random = () => {
                seed = (seed * 1664525 + 1013904223) >>> 0;
                return seed / 4294967296;
            };
            for (let i = 0; i < 4200; i++) {
                grain.fillStyle = i % 3 ? 'rgba(173,80,91,0.23)' : 'rgba(0,0,0,0.55)';
                grain.fillRect(random() * 256, random() * 256, 0.5 + random(), 0.5 + random());
            }
            for (let i = 0; i < 65; i++) {
                grain.fillStyle = 'rgba(194,86,100,0.09)';
                grain.fillRect(random() * 256, random() * 256, 2 + random() * 15, 0.5);
            }
            this._heroTexture = ctx.createPattern(tile, 'repeat');
        }
        if (!this._heroTexture) return;
        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.fillStyle = this._heroTexture;
        ctx.fillRect(x, y, width, height);
        ctx.restore();
    }

    // A lone engineer at the threshold of the infrastructure APEX controls.
    // One concealed signal crosses the security layers toward the locked core.
    _drawHeroComposition(ctx, cW, cH) {
        const unit = Math.min(cW * 0.46 / 560, cH / 720);
        const tick = this.animTick;
        const pulse = 0.5 + 0.5 * Math.sin(tick * 0.018);
        ctx.save();
        ctx.translate(cW * 0.755, cH * 0.48);
        ctx.scale(unit, unit);

        // Recessed metal thresholds fade into the surrounding darkness.
        for (let layer = 3; layer >= 0; layer--) {
            const w = 97 + layer * 40;
            const top = -192 - layer * 25;
            const bottom = 186 + layer * 24;
            ctx.strokeStyle = 'rgba(159,37,54,' + (0.35 - layer * 0.065) + ')';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-w, bottom);
            ctx.lineTo(-w, top + 24);
            ctx.lineTo(-w + 24, top);
            ctx.lineTo(w - 24, top);
            ctx.lineTo(w, top + 24);
            ctx.lineTo(w, bottom - 38);
            ctx.stroke();
            for (const side of [-1, 1]) {
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(side * w, top + 24);
                ctx.lineTo(side * (w - 12), top + 32);
                ctx.lineTo(side * (w - 12), bottom - 12);
                ctx.lineTo(side * w, bottom);
                ctx.closePath();
                const metal = ctx.createLinearGradient(side * w, 0, side * (w - 12), 0);
                metal.addColorStop(0, 'rgba(90,26,38,0.22)');
                metal.addColorStop(1, 'rgba(9,4,9,0.05)');
                ctx.fillStyle = metal;
                ctx.fill();
                ctx.clip();
                this._drawHeroTexture(ctx, -230, -280, 460, 560, 0.4);
                ctx.strokeStyle = 'rgba(139,47,60,0.18)';
                for (let joint = top + 84; joint < bottom; joint += 83) {
                    ctx.beginPath();
                    ctx.moveTo(side * w, joint);
                    ctx.lineTo(side * (w - 12), joint + 7);
                    ctx.stroke();
                }
                ctx.restore();
            }
        }

        // The breach: a narrow opening, lit from somewhere deep inside.
        const glow = ctx.createLinearGradient(-100, 0, 100, 0);
        glow.addColorStop(0, 'rgba(125,13,30,0)');
        glow.addColorStop(0.42, 'rgba(168,19,41,0.14)');
        glow.addColorStop(0.5, 'rgba(236,48,69,0.36)');
        glow.addColorStop(0.58, 'rgba(168,19,41,0.14)');
        glow.addColorStop(1, 'rgba(125,13,30,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(-100, -190, 200, 378);
        const door = ctx.createLinearGradient(-88, 0, 88, 0);
        door.addColorStop(0, '#080409');
        door.addColorStop(0.4, '#10060C');
        door.addColorStop(0.5, '#1B0911');
        door.addColorStop(0.6, '#10060C');
        door.addColorStop(1, '#080409');
        ctx.fillStyle = door;
        ctx.fillRect(-88, -182, 78, 361);
        ctx.fillRect(10, -182, 78, 361);
        ctx.save();
        ctx.beginPath();
        ctx.rect(-88, -182, 78, 361);
        ctx.rect(10, -182, 78, 361);
        ctx.clip();
        this._drawHeroTexture(ctx, -88, -182, 176, 361, 0.65);
        ctx.strokeStyle = 'rgba(155,53,68,0.13)';
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(side * 74, 170); ctx.lineTo(side * 74, -151);
            ctx.lineTo(side * 54, -171); ctx.lineTo(side * 22, -171);
            ctx.moveTo(side * 22, -20); ctx.lineTo(side * 53, 11);
            ctx.lineTo(side * 53, 140); ctx.stroke();
            for (let bolt = -144; bolt < 170; bolt += 76) {
                ctx.fillStyle = 'rgba(170,69,83,0.22)';
                ctx.fillRect(side * 80 - 1, bolt, 1.5, 2);
            }
        }
        ctx.restore();

        // Fine breaks in the light suggest an unstable encrypted barrier.
        ctx.fillStyle = 'rgba(18,2,8,0.24)';
        for (let y = -186; y < 182; y += 4) ctx.fillRect(-9, y, 18, 0.6);

        const seam = ctx.createLinearGradient(0, -190, 0, 186);
        seam.addColorStop(0, 'rgba(243,54,74,0.05)');
        seam.addColorStop(0.2, 'rgba(243,54,74,0.65)');
        seam.addColorStop(0.75, 'rgba(243,54,74,0.38)');
        seam.addColorStop(1, 'rgba(243,54,74,0)');
        ctx.strokeStyle = seam;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(-10, -190); ctx.lineTo(-10, 185);
        ctx.moveTo(10, -190); ctx.lineTo(10, 185);
        ctx.stroke();

        // APEX's watchful core, reduced to a single red aperture.
        ctx.save();
        ctx.translate(0, -100);
        ctx.rotate(Math.PI / 4);
        ctx.strokeStyle = 'rgba(191,47,64,0.5)';
        ctx.strokeRect(-13, -13, 26, 26);
        ctx.restore();
        ctx.strokeStyle = 'rgba(240,62,79,0.7)';
        ctx.beginPath();
        ctx.moveTo(-20, -100); ctx.lineTo(20, -100);
        ctx.stroke();
        ctx.shadowColor = '#FF2D4D';
        ctx.shadowBlur = 12 + pulse * 7;
        ctx.fillStyle = '#F77483';
        ctx.fillRect(-2, -102, 4, 4);
        ctx.shadowBlur = 0;

        // Unlabelled circuit branches keep the hacking motif entirely visual.
        for (let index = 0; index < 3; index++) {
            const y = -51 + index * 62;
            ctx.strokeStyle = 'rgba(164,49,63,0.24)';
            ctx.beginPath();
            ctx.moveTo(14, y - 15); ctx.lineTo(42, y - 15);
            ctx.lineTo(57, y); ctx.lineTo(140, y);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(197,64,79,0.48)';
            ctx.strokeRect(140, y - 2, 4, 4);
            ctx.strokeStyle = 'rgba(135,43,58,0.17)';
            ctx.beginPath();
            ctx.moveTo(144, y); ctx.lineTo(165, y);
            ctx.lineTo(177, y - 12); ctx.lineTo(177, y - 32); ctx.stroke();
            ctx.fillStyle = 'rgba(201,65,84,' + (0.18 + pulse * 0.15) + ')';
            ctx.fillRect(175.5, y - 34, 3, 3);
        }

        // A slow packet moves inward along the route, never filling the screen.
        const route = [[-225, 155], [-147, 155], [-115, 123], [-38, 123], [0, 85], [0, -68]];
        ctx.strokeStyle = 'rgba(214,73,88,0.34)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        route.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        ctx.stroke();
        let distance = (tick * 0.58) % 408;
        for (let i = 1; i < route.length; i++) {
            const [ax, ay] = route[i - 1], [bx, by] = route[i];
            const length = Math.hypot(bx - ax, by - ay);
            if (distance <= length) {
                const progress = distance / length;
                ctx.shadowColor = '#FF6B7F';
                ctx.shadowBlur = 9;
                ctx.fillStyle = '#FFD0D5';
                ctx.fillRect(ax + (bx - ax) * progress - 1.5, ay + (by - ay) * progress - 1.5, 3, 3);
                ctx.shadowBlur = 0;
                break;
            }
            distance -= length;
        }

        // Ground haze and a broken reflection anchor the figure in the doorway.
        ctx.save();
        ctx.translate(0, 231); ctx.scale(1, 0.2);
        const floor = ctx.createRadialGradient(0, 0, 1, 0, 0, 160);
        floor.addColorStop(0, 'rgba(164,28,49,0.23)');
        floor.addColorStop(0.45, 'rgba(87,17,32,0.12)');
        floor.addColorStop(1, 'rgba(40,7,15,0)');
        ctx.fillStyle = floor; ctx.fillRect(-160, -160, 320, 320);
        ctx.restore();
        for (let row = 0; row < 18; row++) {
            const spread = 7 + row * 1.6;
            ctx.fillStyle = 'rgba(191,42,65,' + (0.085 * (1 - row / 18)) + ')';
            ctx.fillRect(-spread + Math.sin(row * 7) * 3, 192 + row * 3.5, spread * 2, 0.7);
        }
        ctx.save();
        ctx.translate(-31, 239); ctx.scale(1, 0.15);
        const shadow = ctx.createRadialGradient(0, 0, 4, 0, 0, 50);
        shadow.addColorStop(0, 'rgba(0,0,3,0.8)');
        shadow.addColorStop(1, 'rgba(0,0,3,0)');
        ctx.fillStyle = shadow; ctx.fillRect(-50, -50, 100, 100);
        ctx.restore();

        // Small against the architecture: an infiltrator, not an all-powerful avatar.
        ctx.save();
        ctx.translate(-31, 139);
        const rim = ctx.createLinearGradient(-30, 0, 30, 0);
        rim.addColorStop(0, '#11080D');
        rim.addColorStop(0.7, '#1C0B12');
        rim.addColorStop(1, '#5B1C29');
        ctx.fillStyle = rim;
        ctx.beginPath();
        ctx.moveTo(0, -33);
        ctx.bezierCurveTo(-17, -31, -19, -13, -15, -3);
        ctx.lineTo(-25, 9); ctx.lineTo(-33, 68);
        ctx.quadraticCurveTo(0, 80, 31, 68);
        ctx.lineTo(23, 9); ctx.lineTo(14, -3);
        ctx.bezierCurveTo(19, -16, 14, -31, 0, -33);
        ctx.fill();
        ctx.save();
        ctx.clip();
        this._drawHeroTexture(ctx, -34, -34, 68, 112, 0.75);
        // Folds catch just enough of the red backlight to reveal worn fabric.
        for (const fold of [-19, -9, 5, 17]) {
            ctx.beginPath();
            ctx.moveTo(fold * 0.45, 4);
            ctx.quadraticCurveTo(fold * 0.7, 34, fold * 1.35, 76);
            ctx.strokeStyle = fold > 0 ? 'rgba(121,38,55,0.35)' : 'rgba(0,0,3,0.5)';
            ctx.lineWidth = fold > 0 ? 1 : 3;
            ctx.stroke();
        }
        ctx.restore();
        ctx.strokeStyle = 'rgba(173,56,71,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -33); ctx.quadraticCurveTo(20, -28, 14, -3);
        ctx.lineTo(23, 9); ctx.lineTo(31, 68); ctx.stroke();
        ctx.fillStyle = '#030205';
        ctx.beginPath();
        ctx.ellipse(0, -13, 10, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(107,38,52,0.5)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(0, -29); ctx.quadraticCurveTo(13, -22, 11, -9);
        ctx.moveTo(-13, -2); ctx.quadraticCurveTo(0, 6, 14, -2);
        ctx.stroke();
        ctx.fillStyle = '#080409';
        ctx.fillRect(-15, 69, 10, 30);
        ctx.fillRect(6, 69, 10, 30);
        ctx.restore();

        ctx.restore();
    }

    // ============================================================
    // TITLE
    // ============================================================

    _drawTitle(
        ctx,
        scaleX,
        scaleY
    ) {
        const fontName =
            IP2Live.Assets
                .abnesLoaded
                ? 'Abnes'
                : 'Arial Black';

        const displayTitle =
            this.titleDone
                ? this.titleTarget
                : this._getScrambledText(
                    this.titleTarget,
                    this.titleProgress
                );

        const layout =
            this._menuLayout();

        ctx.textAlign =
            'left';

        ctx.font =
            'bold ' +
            (
                72 *
                scaleX
            ) +
            'px ' +
            fontName;

        ctx.fillStyle =
            '#FFFFFF';

        ctx.shadowBlur =
            0;

        ctx.fillText(
            displayTitle,

            layout.btnX *
                scaleX,

            148 *
                scaleY
        );
    }

    // ============================================================
    // BUTTONS
    // ============================================================

    _drawMenuBackButton(
        ctx,
        scaleX,
        scaleY
    ) {
        const back =
            this._backButtonLayout();

        const index =
            this.menuItems.length;

        this._drawButton(
            ctx,
            scaleX,
            scaleY,
            back.x,
            back.y,
            back.w,
            back.h,
            'BACK',
            this.selectedIndex ===
                index,
            this.hoverIndex ===
                index,
            index
        );
    }

    _drawButton(
        ctx,
        scaleX,
        scaleY,
        bx,
        by,
        bw,
        bh,
        label,
        isSelected,
        isHover,
        index
    ) {
        if (
            this._buttonEntranceStartedAt ==
            null
        ) {
            this._buttonEntranceStartedAt =
                Date.now() +
                500;
        }

        const elapsed =
            Date.now() -
            this._buttonEntranceStartedAt -
            index *
                90;

        const progress =
            Math.max(
                0,
                Math.min(
                    1,
                    elapsed /
                        700
                )
            );

        const eased =
            1 -
            Math.pow(
                1 -
                    progress,
                3
            );

        const active =
            isSelected ||
            isHover;

        const display =
            active &&
            label !==
                'BACK'
                ? this._getScrambledText(
                    label,
                    this.btnProgress[
                        index
                    ]
                )
                : undefined;

        ctx.save();

        ctx.globalAlpha *=
            eased;

        ctx.translate(
            -24 *
                scaleX *
                (
                    1 -
                    eased
                ),
            0
        );

        this._drawPersonaButton(
            ctx,
            scaleX,
            scaleY,
            bx,
            by,
            bw,
            bh,
            label,
            active,
            label ===
                'QUIT GAME',
            display,
            index
        );

        ctx.restore();
    }

    _drawPersonaButton(
        ctx,
        scaleX,
        scaleY,
        bx,
        by,
        bw,
        bh,
        label,
        isActive,
        isDanger,
        displayLabel,
        index
    ) {
        const x =
            bx *
            scaleX;

        const y =
            by *
            scaleY;

        const w =
            bw *
            scaleX;

        const h =
            bh *
            scaleY;

        const slant =
            18 *
            scaleX;

        const tab =
            38 *
            scaleX;

        const fontName =
            IP2Live.Assets
                .nebulaLoaded
                ? 'Nebula-Regular'
                : 'monospace';

        const red =
            isDanger
                ? '#FF335F'
                : '#FF003C';

        const yellow =
            '#FFE600';

        const isBack =
            label ===
            'BACK';

        const active =
            isDanger
                ? red
                : yellow;

        const labelText =
            displayLabel ||
            label;

        const pulse =
            0.55 +
            0.45 *
                Math.sin(
                    this.animTick *
                        0.12
                );

        ctx.save();

        ctx.beginPath();

        ctx.moveTo(
            x +
                slant,
            y
        );

        ctx.lineTo(
            x +
                w -
                slant *
                    0.4,
            y
        );

        ctx.lineTo(
            x +
                w,
            y +
                h *
                    0.22
        );

        ctx.lineTo(
            x +
                w -
                slant,
            y +
                h
        );

        ctx.lineTo(
            x +
                slant *
                    0.7,
            y +
                h
        );

        ctx.lineTo(
            x,
            y +
                h *
                    0.74
        );

        ctx.closePath();

        const grad =
            ctx.createLinearGradient(
                x,
                y,
                x +
                    w,
                y
            );

        if (
            isActive
        ) {
            grad.addColorStop(
                0,
                isDanger
                    ? 'rgba(255,0,60,0.64)'
                    : 'rgba(255,230,0,0.70)'
            );

            grad.addColorStop(
                0.42,
                isDanger
                    ? 'rgba(110,0,28,0.72)'
                    : 'rgba(70,64,0,0.72)'
            );

            grad.addColorStop(
                1,
                'rgba(3,7,20,0.78)'
            );

            ctx.shadowColor =
                active;

            ctx.shadowBlur =
                18 *
                scaleX;
        } else {
            grad.addColorStop(
                0,
                'rgba(3,7,20,0.88)'
            );

            grad.addColorStop(
                1,
                'rgba(3,7,20,0.36)'
            );

            ctx.shadowBlur =
                0;
        }

        ctx.fillStyle =
            grad;

        ctx.fill();

        ctx.shadowBlur =
            0;

        ctx.lineWidth =
            (
                isActive
                    ? 2.4
                    : isBack
                        ? 1.8
                        : 1.1
            ) *
            scaleX;

        ctx.strokeStyle =
            isBack
                ? yellow
                : isActive
                    ? active
                    : isDanger
                        ? 'rgba(255,0,60,0.54)'
                        : 'rgba(0,240,255,0.54)';

        ctx.stroke();

        ctx.save();

        ctx.clip();

        for (
            let sy =
                y +
                (
                    (
                        this.animTick *
                        0.8
                    ) %
                    (
                        6 *
                        scaleY
                    )
                );

            sy <
            y +
                h;

            sy +=
                6 *
                scaleY
        ) {
            ctx.fillStyle =
                isActive
                    ? 'rgba(255,255,255,0.06)'
                    : 'rgba(0,240,255,0.025)';

            ctx.fillRect(
                x,
                sy,
                w,
                1 *
                    scaleY
            );
        }

        if (
            isActive
        ) {
            const scanX =
                x -
                w +
                (
                    (
                        this.animTick *
                        5
                    ) %
                    (
                        w *
                        1.8
                    )
                );

            ctx.fillStyle =
                'rgba(255,255,255,0.22)';

            ctx.transform(
                1,
                0,
                -0.32,
                1,
                0,
                0
            );

            ctx.fillRect(
                scanX,
                y -
                    h,
                34 *
                    scaleX,
                h *
                    3
            );
        }

        ctx.restore();

        ctx.beginPath();

        ctx.moveTo(
            x,
            y
        );

        ctx.lineTo(
            x +
                tab,
            y
        );

        ctx.lineTo(
            x +
                tab -
                12 *
                    scaleX,

            y +
                19 *
                    scaleY
        );

        ctx.lineTo(
            x,
            y +
                24 *
                    scaleY
        );

        ctx.closePath();

        ctx.fillStyle =
            isBack
                ? yellow
                : isActive
                    ? red
                    : 'rgba(0,240,255,0.82)';

        ctx.fill();

        if (
            isActive
        ) {
            ctx.beginPath();

            ctx.moveTo(
                x +
                    w -
                    68 *
                        scaleX,
                y
            );

            ctx.lineTo(
                x +
                    w -
                    12 *
                        scaleX,
                y
            );

            ctx.lineTo(
                x +
                    w -
                    34 *
                        scaleX,
                y +
                    h
            );

            ctx.lineTo(
                x +
                    w -
                    88 *
                        scaleX,
                y +
                    h
            );

            ctx.closePath();

            ctx.fillStyle =
                isDanger
                    ? 'rgba(255,0,60,0.32)'
                    : 'rgba(255,230,0,0.35)';

            ctx.fill();
        }

        ctx.font =
            Math.round(
                8 *
                scaleX
            ) +
            'px monospace';

        ctx.fillStyle =
            isActive
                ? '#080808'
                : '#00141A';

        ctx.textAlign =
            'left';

        ctx.fillText(
            '0' +
                (
                    index +
                    1
                ),

            x +
                10 *
                    scaleX,

            y +
                15 *
                    scaleY
        );

        ctx.font =
            'bold ' +
            Math.round(
                (
                    isActive
                        ? 21
                        : 19
                ) *
                scaleX
            ) +
            'px ' +
            fontName;

        ctx.fillStyle =
            isActive
                ? isDanger
                    ? '#FFFFFF'
                    : '#111111'
                : '#FFFFFF';

        ctx.shadowColor =
            isActive
                ? 'rgba(255,255,255,' +
                  (
                      0.35 +
                      pulse *
                          0.25
                  ) +
                  ')'
                : 'transparent';

        ctx.shadowBlur =
            isActive
                ? 3 *
                    scaleX
                : 0;

        ctx.textAlign =
            'left';

        ctx.fillText(
            labelText,

            x +
                34 *
                    scaleX,

            y +
                h *
                    0.64
        );

        if (
            isActive
        ) {
            ctx.shadowBlur =
                0;

            ctx.font =
                'bold ' +
                Math.round(
                    13 *
                    scaleX
                ) +
                'px monospace';

            ctx.fillStyle =
                isDanger
                    ? '#FFFFFF'
                    : '#111111';

            ctx.textAlign =
                'right';

            ctx.fillText(
                '>>',

                x +
                    w -
                    42 *
                        scaleX,

                y +
                    h *
                        0.64
            );
        }

        ctx.restore();
    }

    // ============================================================
    // FULL SCREEN GLITCH
    // ============================================================

    _drawGlobalGlitch(
        ctx,
        cW,
        cH,
        scaleX,
        scaleY
    ) {
        if (
            Math.random() >
            0.030
        ) {
            return;
        }

        const slices =
            1 +
            Math.floor(
                Math.random() *
                    2
            );

        ctx.save();

        for (
            let i = 0;
            i <
            slices;
            i++
        ) {
            const h =
                (
                    4 +
                    Math.random() *
                        9
                ) *
                scaleY;

            const y =
                Math.random() *
                (
                    cH -
                    h
                );

            const dx =
                (
                    Math.random() -
                    0.5
                ) *
                8 *
                scaleX;

            ctx.drawImage(
                ctx.canvas,
                0,
                y,
                cW,
                h,
                dx,
                y,
                cW,
                h
            );

            ctx.globalCompositeOperation =
                'screen';

            ctx.fillStyle =
                i %
                    2
                    ? 'rgba(0,240,255,0.04)'
                    : 'rgba(255,0,60,0.04)';

            ctx.fillRect(
                0,
                y,
                cW,
                h
            );

            ctx.globalCompositeOperation =
                'source-over';
        }

        ctx.restore();
    }

    _rgba(
        hex,
        alpha
    ) {
        const value =
            hex.replace(
                '#',
                ''
            );

        const r =
            parseInt(
                value.slice(
                    0,
                    2
                ),
                16
            );

        const g =
            parseInt(
                value.slice(
                    2,
                    4
                ),
                16
            );

        const b =
            parseInt(
                value.slice(
                    4,
                    6
                ),
                16
            );

        return (
            'rgba(' +
            r +
            ',' +
            g +
            ',' +
            b +
            ',' +
            alpha +
            ')'
        );
    }

    _getScrambledText(
        target,
        progress
    ) {
        if (
            progress >=
            target.length *
                3 +
                10
        ) {
            return target;
        }

        let result =
            '';

        for (
            let i = 0;
            i <
            target.length;
            i++
        ) {
            if (
                target[i] ===
                ' '
            ) {
                result +=
                    ' ';

                continue;
            }

            const charStart =
                i *
                2;

            if (
                progress <
                charStart
            ) {
                result +=
                    String.fromCharCode(
                        65 +
                        Math.floor(
                            Math.random() *
                                26
                        )
                    );
            } else {
                const charProgress =
                    progress -
                    charStart;

                if (
                    charProgress >
                    6
                ) {
                    result +=
                        target[i];
                } else {
                    const code =
                        target
                            .toUpperCase()
                            .charCodeAt(
                                i
                            );

                    if (
                        code >=
                            65 &&
                        code <=
                            90
                    ) {
                        const step =
                            Math.floor(
                                (
                                    code -
                                    65
                                ) *
                                (
                                    charProgress /
                                    6
                                )
                            );

                        result +=
                            String.fromCharCode(
                                65 +
                                step
                            );
                    } else {
                        result +=
                            target[i];
                    }
                }
            }
        }

        return result;
    }
}

/**
 * Install directly into Paper Maker's engine-owned title screen.
 */
function installIP2LiveTitleScreen() {
    const target =
        Scene.TitleScreen &&
        Scene.TitleScreen
            .prototype;

    const source =
        IP2LiveTitleScreenImplementation
            .prototype;

    if (
        !target
    ) {
        throw new Error(
            'Scene.TitleScreen is unavailable.'
        );
    }

    for (
        const name of
        Object.getOwnPropertyNames(
            source
        )
    ) {
        if (
            name ===
            'constructor'
        ) {
            continue;
        }

        Object.defineProperty(
            target,
            name,
            Object.getOwnPropertyDescriptor(
                source,
                name
            )
        );
    }

    Object.defineProperty(
        target,
        '_ip2LiveTitleInstalled',
        {
            value:
                true,
            configurable:
                true,
            writable:
                true
        }
    );

    window.IP2LiveMainMenu =
        Scene.TitleScreen;

    const activeScene =
        Manager.Stack.top;

    if (
        activeScene instanceof
            Scene.TitleScreen &&
        !activeScene
            ._ip2LiveTitleInitialized
    ) {
        const startAtLoop =
            Boolean(
                activeScene
                    .startAtLoop
            );

        activeScene.loading =
            true;

        activeScene.initialize(
            startAtLoop
        );

        Promise.resolve(
            activeScene.load()
        ).catch(
            (error) => {
                activeScene.loading =
                    false;

                Manager.Stack
                    .requestPaintHUD =
                    true;

                console.error(
                    '[IP2Live] Failed to activate the default title scene:',
                    error
                );
            }
        );
    }

    Manager.Stack
        .requestPaintHUD =
        true;
}

installIP2LiveTitleScreen();

console.log(
    '[IP2Live] fully hardcoded cinematic main-menu.js loaded into Scene.TitleScreen.'
);
