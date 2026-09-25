/** One continuous neural breach screen, followed by an APEX interception. */
class IP2LiveNeuralLifeForceGameOverScreen extends IP2Live.ARDiagnosticRewind {
    constructor(options) {
        super(Object.assign({}, options || {}, {
            title: 'GAME OVER', danger: true, tutorialSection: false,
            lines: [
                'The security lattice has isolated this intrusion. We have been caught.',
                'THANK YOU FOR YOUR HELP, INFILTRATOR.',
                'Unfortunately, it was not enough.',
                'The Neural Link can no longer conceal us.',
            ],
            actions: [{ id: 'main-menu', label: 'Return to Main Menu' }],
        }));
        this.transitionTick = 0;
        this._messageCompletedAt = null;
        this.buttonMix = [1, 0, 0];
        this.actions = [
            { id: 'main-menu', label: 'Return to Main Menu', onSelect: () => this._returnToMainMenu() },
            { id: 'restart-story', label: 'Restart Story', onSelect: () => this._restartStory() },
            { id: 'load-game', label: 'Load Game', onSelect: () => this._openLoadGame() },
        ];
    }

    async load() {
        this._seedSpaceVisuals();
        const assets = IP2Live.Assets || {};
        if (typeof assets.loadAll === 'function' && (!assets.astronomousLoaded || !assets.oxaniumMediumLoaded)) await assets.loadAll();
        const music = IP2Live.MusicManager;
        if (music && typeof music.fadeOutForTransition === 'function') music.fadeOutForTransition(1800);
        this.loading = false;
        this._paint();
    }

    update() {
        this.transitionTick++;
        this.tick = this.transitionTick;
        if (this._exitTick !== null && ++this._exitTick > 60) {
            this._completeAction(this._pendingAction);
            return;
        }
        this._sequenceState(this._messageTiming());
        this._seedSpaceVisuals();
        for (const particle of this.particles) {
            particle.y -= particle.speed;
            particle.x += particle.drift;
            if (particle.y < -20) particle.y = 760;
        }
        this.buttonMix.forEach((mix, index) => {
            const target = this._menuVisible() && index === this.selectedIndex ? 1 : 0;
            this.buttonMix[index] += (target - mix) * 0.12;
        });
        this._paint();
    }

    _messageTiming() {
        const l = this._layout();
        const ctx = Common.Platform.ctx;
        const font = IP2Live.Assets && IP2Live.Assets.oxaniumMediumLoaded ? 'Oxanium-Medium' : 'sans-serif';
        const fontSize = l.sw < 700 ? 16 : 19, tracking = 0.65;
        const width = Math.min(860, l.sw - 88);
        const cacheKey = [width, font, fontSize].join(':');
        if (!this._messageCache || this._messageCache.key !== cacheKey) {
            ctx.save(); ctx.font = 'bold ' + fontSize + 'px ' + font;
            const rows = this.lines.flatMap(line => this._wrap(ctx, line, width, tracking));
            ctx.restore();
            this._messageCache = { key: cacheKey, rows };
        }
        const rows = this._messageCache.rows;
        const textStart = 208, characterTicks = 2;
        let cursor = textStart;
        const rowStarts = rows.map(row => {
            const start = cursor;
            cursor += Array.from(row).length * characterTicks + 16;
            return start;
        });
        const textEnd = this._warningRevealTick === null ? cursor - 16 : this._warningRevealTick;
        const buttonsStart = textEnd + 24;
        return { rows, rowStarts, font, fontSize, tracking, textStart, characterTicks, textEnd,
            buttonsStart, ready: buttonsStart + 2 * 24 + 60 };
    }

    _sequenceState(timing, now = Date.now()) {
        if (this.transitionTick >= timing.textEnd && this._messageCompletedAt === null) this._messageCompletedAt = now;
        const elapsed = this._messageCompletedAt === null ? 0 : now - this._messageCompletedAt;
        return {
            deleting: elapsed >= 5000 && elapsed < 6600,
            deletion: this._smooth((elapsed - 5000) / 1600),
            apex: elapsed >= 6600,
            apexTime: Math.max(0, elapsed - 6600),
        };
    }

    _menuVisible() { return this.transitionTick >= this._messageTiming().ready && !this._finished; }

    _skipSequence() {
        const timing = this._messageTiming();
        if (this._finished || this.transitionTick < timing.textStart || this.transitionTick >= timing.textEnd) return false;
        this._warningRevealTick = this.transitionTick;
        this._messageCompletedAt = Date.now();
        this._paint();
        return true;
    }

    onKeyPressed(key) {
        if (this._finished) return true;
        const value = this._key(key);
        if (this._engineKey('checkActionMenu', key) || ['ENTER', 'SPACE', 'SPACEBAR', ' '].includes(value)) {
            if (!this._skipSequence() && this._menuVisible()) this._finish(this.selectedIndex);
        } else if (this._menuVisible()) this._navigateKey(key, value);
        return true;
    }

    onKeyPressedAndRepeat(key) {
        if (this._menuVisible()) this._navigateKey(key, this._key(key));
        return true;
    }

    _buttonAt(x, y) { return this._menuVisible() ? super._buttonAt(x, y) : -1; }

    onMouseUp(x, y) {
        if (this._logicalPointer(x, y) && this._skipSequence()) {
            this.pressedIndex = -1; this._pointerDownSeen = false;
            return true;
        }
        return super.onMouseUp(x, y);
    }

    _finish(index) {
        if (!this._menuVisible()) return;
        const action = this.actions[index];
        if (!action) return;
        this._finished = true;
        this._pendingAction = action;
        this._exitTick = 0;
        this._playSound('soundConfirmation');
        this._paint();
    }

    _layout() {
        const resolution = Common.ScreenResolution || {};
        const sw = resolution.SCREEN_X || 1280, sh = resolution.SCREEN_Y || 720;
        const areaW = Math.min(1020, sw - 80), gap = 16;
        const buttonW = (areaW - gap * 2) / 3;
        const buttonH = Math.max(48, Math.min(64, sh * 0.082));
        const y = sh - Math.max(84, sh * 0.125);
        const buttons = this.actions.map((action, index) => ({
            x: (sw - areaW) / 2 + index * (buttonW + gap), y, w: buttonW, h: buttonH,
        }));
        return { sw, sh, x: 0, y: 0, w: sw, h: sh, buttons, areaW };
    }

    _smooth(value) { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); }

    draw3D() {
        if (this.transitionTick < 84 && this.parentScene && typeof this.parentScene.draw3D === 'function') this.parentScene.draw3D();
        else if (Manager && Manager.GL && Manager.GL.renderer) Manager.GL.renderer.clear();
    }

    drawHUD() {
        const ctx = Common && Common.Platform && Common.Platform.ctx;
        if (!ctx || !ctx.canvas) return;
        this.tick = this.transitionTick;
        const l = this._layout(), timing = this._messageTiming();
        const state = this._sequenceState(timing);
        if (this.transitionTick < 84 && this.parentScene && typeof this.parentScene.drawHUD === 'function') this.parentScene.drawHUD();
        ctx.save(); ctx.scale(ctx.canvas.width / l.sw, ctx.canvas.height / l.sh);
        ctx.save(); ctx.globalAlpha = this._smooth(this.transitionTick / 84);
        ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, l.sw, l.sh); ctx.restore();
        this._drawSpaceBackdrop(ctx, l, this._warningFade(84, 72));
        this._drawHeader(ctx, l);
        if (state.apex) this._drawApexTransmission(ctx, l, timing, state.apexTime);
        else this._drawMessage(ctx, l, timing, state);
        this._drawRecovery(ctx, l, timing);
        if (this._exitTick !== null) {
            ctx.save(); ctx.globalAlpha = this._smooth(this._exitTick / 60);
            ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, l.sw, l.sh); ctx.restore();
        }
        ctx.restore();
    }

    _drawHeader(ctx, l) {
        const heading = IP2Live.Assets && IP2Live.Assets.astronomousLoaded ? 'Astronomous' : 'sans-serif';
        const y = l.sh * 0.09, h = Math.min(120, l.sh * 0.17);
        const reveal = this._warningFade(144, 60);
        ctx.save(); ctx.globalAlpha *= reveal;
        ctx.translate(-(1 - reveal) * l.sw * 0.16, 0);
        ctx.save(); ctx.translate(l.sw / 2, y + h / 2); ctx.rotate(-0.018); ctx.translate(-l.sw / 2, -y - h / 2);
        ctx.shadowColor = '#FF003D'; ctx.shadowBlur = 34;
        ctx.fillStyle = 'rgba(255,0,52,0.2)'; ctx.fillRect(-30, y - 8, l.sw + 60, h + 16);
        ctx.shadowBlur = 0;
        ctx.fillStyle = this._linear(ctx, 0, y, l.sw, y,
            [[0, '#35000F'], [0.2, '#E40037'], [0.56, '#FF174D'], [0.82, '#9E0027'], [1, '#240008']], '#C90035');
        ctx.beginPath(); ctx.moveTo(-25, y + 12); ctx.lineTo(l.sw * 0.16, y - 8);
        ctx.lineTo(l.sw + 25, y + 12); ctx.lineTo(l.sw * 0.86, y + h);
        ctx.lineTo(l.sw * 0.12, y + h - 10); ctx.closePath(); ctx.fill(); ctx.restore();
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
        this._fit(ctx, 'GAME OVER', Math.min(900, l.sw - 80), Math.min(96, h * 0.76), heading);
        ctx.shadowColor = '#130009'; ctx.shadowBlur = 10; ctx.fillStyle = '#FFF7F8';
        ctx.fillText('GAME OVER', l.sw / 2, y + h * 0.78);
        ctx.restore();
    }

    _messageRuns(row) {
        if (row === row.toUpperCase()) return [{ text: row, emphasis: true }];
        return row.split(/(it was not enough)/).filter(Boolean).map(text => ({ text, emphasis: text === 'it was not enough' }));
    }

    _drawMessage(ctx, l, timing, state) {
        const lineHeight = timing.fontSize + 12;
        const height = timing.fontSize + (timing.rows.length - 1) * lineHeight;
        const top = l.sh / 2 - height / 2 + timing.fontSize;
        const totalChars = timing.rows.reduce((total, row) => total + Array.from(row).length, 0);
        let remaining = Math.ceil(totalChars * (1 - state.deletion));
        const glitch = state.deleting ? null : this._warningGlitch(timing);
        ctx.save(); ctx.textAlign = 'center';
        ctx.beginPath(); ctx.rect(30, l.sh * 0.29, l.sw - 60, l.buttons[0].y - 60 - l.sh * 0.29); ctx.clip();
        timing.rows.forEach((row, index) => {
            const count = state.deleting ? Math.max(0, Math.min(Array.from(row).length, remaining)) : this._warningVisibleCount(timing, index);
            remaining -= Array.from(row).length;
            const visible = Array.from(row).slice(0, count).join('');
            if (!visible) return;
            const runs = this._messageRuns(row);
            const widths = runs.map(run => {
                ctx.font = (run.emphasis ? 'bold ' : '') + timing.fontSize + 'px ' + timing.font;
                return this._trackedWidth(ctx, run.text, timing.tracking);
            });
            const width = widths.reduce((a, b) => a + b, 0) + (runs.length - 1) * timing.tracking;
            let x = l.sw / 2 - width / 2, left = count;
            const y = top + index * lineHeight;
            ctx.save(); ctx.globalAlpha *= this._warningRevealTick === null ? this._warningFade(timing.rowStarts[index], 18) : 1;
            runs.forEach((run, runIndex) => {
                const fragment = Array.from(run.text).slice(0, Math.max(0, left)).join('');
                left -= Array.from(run.text).length;
                ctx.font = (run.emphasis ? 'bold ' : '') + timing.fontSize + 'px ' + timing.font;
                this._hologramText(ctx, fragment, x + this._trackedWidth(ctx, fragment, timing.tracking) / 2, y, run.emphasis, timing.tracking);
                x += widths[runIndex] + timing.tracking;
            });
            ctx.font = timing.fontSize + 'px ' + timing.font;
            if (glitch) for (const part of glitch.parts) {
                if (part.rowIndex === index) this._drawWordGlitch(ctx, glitch, part, row, l.sw / 2, y, timing);
            }
            if (state.deleting) {
                const corruption = { seed: index * 79, started: Date.now() - (this.tick % 8) * 65 };
                this._drawWordGlitch(ctx, corruption, { start: 0, text: visible }, row, l.sw / 2, y, timing);
                ctx.fillStyle = '#FF427E';
                ctx.fillRect(l.sw / 2 - width / 2, y + 5, width * (0.2 + state.deletion * 0.8), 1);
            }
            ctx.restore();
        });
        ctx.restore();
    }

    _drawRecovery(ctx, l, timing) {
        const exit = this._exitTick === null ? 1 : 1 - this._smooth(this._exitTick / 42);
        ctx.save(); ctx.globalAlpha *= exit;
        const promptFade = this._warningFade(timing.buttonsStart, 50);
        ctx.save(); ctx.globalAlpha *= promptFade * (0.38 + 0.62 * (0.5 + 0.5 * Math.sin(this.tick * 0.055)));
        ctx.textAlign = 'center'; ctx.font = '12px ' + timing.font; ctx.fillStyle = '#DCA3B9';
        this._fillTrackedText(ctx, 'CHOOSE A RECOVERY PROTOCOL', l.sw / 2, l.buttons[0].y - 24, 1.1); ctx.restore();
        l.buttons.forEach((rect, index) => {
            const alpha = this._warningFade(timing.buttonsStart + index * 24, 60);
            if (alpha <= 0) return;
            ctx.save(); ctx.globalAlpha *= alpha;
            this._drawFadedAction(ctx, { ...rect, y: rect.y + (1 - alpha) * 12 }, this.actions[index].label.toUpperCase(),
                timing.font, this.buttonMix[index] || 0, index === this.selectedIndex);
            ctx.restore();
        });
        ctx.restore();
    }

    _drawApexTransmission(ctx, l, timing, elapsed) {
        const reveal = this._smooth(elapsed / 650);
        const width = Math.min(780, l.sw - 80), x = (l.sw - width) / 2;
        const top = l.sh * 0.30, bottom = l.buttons[0].y - 62;
        const height = bottom - top;
        ctx.save(); ctx.globalAlpha *= reveal;
        ctx.translate(0, (1 - reveal) * 12);
        ctx.fillStyle = this._radial(ctx, l.sw / 2, top + height * 0.6, 1, l.sw / 2, top + height * 0.6, width * 0.55,
            [[0, 'rgba(61,26,67,0.32)'], [0.5, 'rgba(14,22,37,0.24)'], [1, 'rgba(0,0,0,0)']], 'rgba(10,9,20,0.3)');
        ctx.fillRect(x, top, width, height);
        ctx.strokeStyle = 'rgba(255,75,123,0.4)'; ctx.lineWidth = 1;
        for (const side of [-1, 1]) {
            const edge = l.sw / 2 + side * width / 2;
            ctx.beginPath(); ctx.moveTo(edge - side * 26, top); ctx.lineTo(edge, top); ctx.lineTo(edge, top + 28);
            ctx.moveTo(edge, bottom - 28); ctx.lineTo(edge, bottom); ctx.lineTo(edge - side * 26, bottom); ctx.stroke();
        }
        ctx.textAlign = 'center'; ctx.font = 'bold 11px ' + timing.font; ctx.fillStyle = '#FF537F';
        this._fillTrackedText(ctx, 'APEX', l.sw / 2, top + 19, 4);
        const message = 'FOUND YOU, INFILTRATOR!';
        this._fit(ctx, message, width - 50, Math.min(32, l.sw * 0.03), timing.font);
        this._hologramText(ctx, message, l.sw / 2, top + 55, true, 0.9);
        const maskHeight = Math.min(235, height - 76);
        ctx.save(); ctx.globalAlpha *= this._smooth((elapsed - 250) / 1200) * (0.72 + Math.sin(this.tick * 0.02) * 0.08);
        ctx.translate(l.sw / 2, top + 68 + maskHeight / 2 + Math.sin(this.tick * 0.017) * 3);
        ctx.scale(maskHeight / 240, maskHeight / 240);
        this._drawHoodedMask(ctx);
        if (Math.sin(this.tick * 0.063) > 0.89) {
            ctx.save(); ctx.beginPath(); ctx.rect(-145, -36, 290, 14); ctx.clip(); ctx.translate(9, -1);
            ctx.globalAlpha *= 0.55; this._drawHoodedMask(ctx); ctx.restore();
        }
        ctx.restore();
        ctx.fillStyle = 'rgba(117,221,235,0.07)';
        const scan = (elapsed * 0.065) % Math.max(1, height - 62);
        ctx.fillRect(x + 20, top + 62 + scan, width - 40, 2);
        ctx.restore();
    }

    _drawHoodedMask(ctx) {
        ctx.save();
        ctx.fillStyle = this._radial(ctx, 0, -5, 0, 0, 0, 155,
            [[0, 'rgba(101,171,195,0.18)'], [0.5, 'rgba(62,27,73,0.18)'], [1, 'rgba(0,0,0,0)']], 'rgba(80,110,140,0.08)');
        ctx.fillRect(-170, -145, 340, 280);
        ctx.beginPath(); ctx.moveTo(0, -116); ctx.bezierCurveTo(-80, -99, -93, -17, -104, 45);
        ctx.lineTo(-151, 108); ctx.quadraticCurveTo(0, 139, 151, 108); ctx.lineTo(104, 45);
        ctx.bezierCurveTo(93, -17, 80, -99, 0, -116); ctx.closePath();
        ctx.fillStyle = this._linear(ctx, -100, 0, 100, 0,
            [[0, '#11121F'], [0.35, '#29313F'], [0.52, '#080B13'], [1, '#25202F']], '#141923');
        ctx.fill(); ctx.strokeStyle = 'rgba(114,193,210,0.33)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -93); ctx.bezierCurveTo(-62, -70, -80, 14, -58, 63);
        ctx.quadraticCurveTo(0, 112, 58, 63); ctx.bezierCurveTo(80, 14, 62, -70, 0, -93); ctx.closePath();
        ctx.fillStyle = '#020409'; ctx.fill(); ctx.strokeStyle = 'rgba(255,66,126,0.3)'; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-49, -39); ctx.lineTo(0, -57); ctx.lineTo(49, -39);
        ctx.lineTo(43, 29); ctx.lineTo(21, 65); ctx.lineTo(0, 82); ctx.lineTo(-21, 65); ctx.lineTo(-43, 29); ctx.closePath();
        ctx.fillStyle = this._linear(ctx, -50, -30, 50, 55,
            [[0, '#88A6AF'], [0.36, '#485762'], [0.51, '#17232E'], [0.8, '#647681'], [1, '#202631']], '#526773');
        ctx.fill(); ctx.strokeStyle = 'rgba(154,224,235,0.42)'; ctx.stroke();
        for (const side of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(side * 45, -20); ctx.lineTo(side * 8, -9); ctx.lineTo(side * 13, 0); ctx.lineTo(side * 40, -7); ctx.closePath();
            ctx.fillStyle = '#01030A'; ctx.fill();
            ctx.shadowColor = '#FF2D6C'; ctx.shadowBlur = 15;
            ctx.beginPath(); ctx.moveTo(side * 37, -13); ctx.lineTo(side * 14, -7);
            ctx.strokeStyle = '#FF7198'; ctx.lineWidth = 2; ctx.stroke(); ctx.shadowBlur = 0;
            ctx.beginPath(); ctx.moveTo(side * 41, 12); ctx.lineTo(side * 19, 37); ctx.lineTo(side * 27, 52);
            ctx.strokeStyle = 'rgba(8,16,26,0.75)'; ctx.lineWidth = 3; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(side * 60, -48); ctx.lineTo(side * 83, 55); ctx.lineTo(side * 127, 99);
            ctx.strokeStyle = 'rgba(103,151,176,0.2)'; ctx.lineWidth = 1; ctx.stroke();
        }
        ctx.fillStyle = '#09111C';
        for (let slot = -2; slot <= 2; slot++) ctx.fillRect(slot * 7 - 1, 43 + Math.abs(slot) * 2, 2, 17 - Math.abs(slot) * 3);
        ctx.fillStyle = 'rgba(2,5,13,0.3)';
        for (let y = -110 + (this.tick % 4); y < 120; y += 4) ctx.fillRect(-155, y, 310, 1);
        ctx.restore();
    }

    _cleanGameplayUI() {
        if (IP2Live.QuestManager && typeof IP2Live.QuestManager.hideQuest === 'function') IP2Live.QuestManager.hideQuest();
        if (IP2Live.QuestMinimap && typeof IP2Live.QuestMinimap.destroy === 'function') IP2Live.QuestMinimap.destroy();
        if (IP2Live.DialogueManager && typeof IP2Live.DialogueManager.resetTransitionState === 'function') {
            IP2Live.DialogueManager.resetTransitionState({ stopActive: true, discardActive: true });
        }
        if (Manager && Manager.Stack && typeof Manager.Stack.clearHUD === 'function') Manager.Stack.clearHUD();
    }

    _returnToMainMenu() {
        this._cleanGameplayUI();
        if (Manager && Manager.Stack) {
            if (typeof Manager.Stack.popAll === 'function') Manager.Stack.popAll();
            if (typeof Manager.Stack.pushTitleScreen === 'function') Manager.Stack.pushTitleScreen(true);
            Manager.Stack.requestPaintHUD = true;
        }
        const music = IP2Live.MusicManager;
        if (music && music.ZONE && typeof music.play === 'function') music.play(music.ZONE.MAIN_MENU);
    }

    _restartStory() {
        this._cleanGameplayUI();
        const current = typeof Core !== 'undefined' && Core.Game ? Core.Game.current : null;
        const name = current && current.infiltratorName ? current.infiltratorName : 'INFILTRATOR';
        const manager = IP2Live.GameManager;
        if (typeof Core === 'undefined' || !Core.Game || typeof Core.Game !== 'function' || !manager || typeof manager.startNewGameFlow !== 'function') {
            this._returnToMainMenu();
            return;
        }
        if (Manager && Manager.Stack && typeof Manager.Stack.popAll === 'function') Manager.Stack.popAll();
        const game = new Core.Game();
        if (typeof game.initializeDefault === 'function') game.initializeDefault();
        game.infiltratorName = name;
        Core.Game.current = game;
        manager.startNewGameFlow(name);
    }

    _openLoadGame() {
        this._cleanGameplayUI();
        if (!Manager || !Manager.Stack) return;
        if (typeof Manager.Stack.popAll === 'function') Manager.Stack.popAll();
        if (typeof Manager.Stack.pushTitleScreen === 'function') Manager.Stack.pushTitleScreen(true);
        const LoadGame = typeof window !== 'undefined' && window.IP2LiveLoadGameMenu;
        if (LoadGame && typeof Manager.Stack.push === 'function') Manager.Stack.push(new LoadGame());
        Manager.Stack.requestPaintHUD = true;
    }

    static show(options) {
        const screen = new this(options || {});
        screen.parentScene = Manager && Manager.Stack ? Manager.Stack.top : null;
        if (Manager && Manager.Stack && typeof Manager.Stack.push === 'function') {
            Manager.Stack.push(screen);
            Manager.Stack.requestPaintHUD = true;
            return true;
        }
        return false;
    }
}
IP2Live.NeuralLifeForceGameOver = IP2LiveNeuralLifeForceGameOverScreen;
window.IP2LiveNeuralLifeForceGameOver = IP2LiveNeuralLifeForceGameOverScreen;
